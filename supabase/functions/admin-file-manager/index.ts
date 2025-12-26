import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET_NAME = "client-files";

// Hungarian character normalization map
const HUNGARIAN_MAP: Record<string, string> = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o',
  'ú': 'u', 'ü': 'u', 'ű': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ö': 'O', 'Ő': 'O',
  'Ú': 'U', 'Ü': 'U', 'Ű': 'U',
};

// Normalize Hungarian characters to ASCII equivalents
function normalizeHungarian(str: string): string {
  return str.split('').map(char => HUNGARIAN_MAP[char] || char).join('');
}

// Sanitize path - normalize Hungarian characters and keep spaces
function sanitizePath(path: string): string {
  return normalizeHungarian(path)
    .replace(/[\\:*?"<>|]/g, '') // Remove path-unsafe characters (but keep /)
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)
    .join('/');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT and check admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Use service client to verify the token directly
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      console.error("User is not admin:", user.id);
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin user authenticated: ${user.email}`);

    // Parse request body
    const body = await req.json();
    const { operation, path: rawPath, content, newPath: rawNewPath, recursive, forceDelete } = body;
    
    // Sanitize paths to handle Hungarian special characters
    const path = rawPath ? sanitizePath(rawPath) : rawPath;
    const newPath = rawNewPath ? sanitizePath(rawNewPath) : rawNewPath;
    
    // Log path transformation if different
    if (rawPath && rawPath !== path) {
      console.log(`Path sanitized: "${rawPath}" -> "${path}"`);
    }

    if (!operation) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing 'operation' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: any;

    switch (operation) {
      case "list": {
        // List folder contents
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const normalizedPath = path.endsWith("/") ? path : `${path}/`;
        console.log(`Listing path: ${normalizedPath}`);

        const { data: files, error: listError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .list(normalizedPath, {
            limit: 1000,
            sortBy: { column: "name", order: "asc" }
          });

        if (listError) {
          console.error("List error:", listError);
          return new Response(
            JSON.stringify({ success: false, error: listError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Separate folders (prefixes) and files
        const folders = files?.filter(f => f.id === null) || [];
        const actualFiles = files?.filter(f => f.id !== null && f.name !== ".folder_placeholder") || [];

        result = {
          success: true,
          path: normalizedPath,
          originalPath: rawPath,
          folders: folders.map(f => f.name),
          files: actualFiles.map(f => ({
            name: f.name,
            id: f.id,
            created_at: f.created_at,
            updated_at: f.updated_at,
            metadata: f.metadata
          }))
        };
        break;
      }

      case "list-recursive": {
        // Recursively list all files under a path
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const allFiles = await listRecursive(supabaseAdmin, path);
        result = {
          success: true,
          path,
          originalPath: rawPath,
          items: allFiles
        };
        break;
      }

      case "create-folder": {
        // Create a folder using placeholder file, including all parent folders
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Creating folder with parents: ${path}`);

        // Split path into parts and create each folder
        const pathParts = path.split('/').filter((p: string) => p.length > 0);
        const createdFolders: string[] = [];
        
        for (let i = 0; i < pathParts.length; i++) {
          const currentPath = pathParts.slice(0, i + 1).join('/');
          const placeholderPath = `${currentPath}/.folder_placeholder`;
          
          const placeholderContent = new Blob([""], { type: "text/plain" });
          const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(placeholderPath, placeholderContent, {
              upsert: true
            });

          if (uploadError && !uploadError.message.includes('already exists')) {
            console.error(`Error creating folder ${currentPath}:`, uploadError);
          } else {
            createdFolders.push(currentPath);
          }
        }

        console.log(`Created folders: ${createdFolders.join(', ')}`);

        result = {
          success: true,
          message: `Folder created: ${path}`,
          path: path,
          originalPath: rawPath,
          createdFolders
        };
        break;
      }

      case "upload": {
        // Upload a file (content should be base64 encoded)
        if (!path || !content) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' or 'content' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Uploading file: ${path}`);

        // Decode base64 content
        const binaryContent = Uint8Array.from(atob(content), c => c.charCodeAt(0));
        const blob = new Blob([binaryContent]);

        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .upload(path, blob, {
            upsert: body.upsert || false
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          return new Response(
            JSON.stringify({ success: false, error: uploadError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = {
          success: true,
          message: `File uploaded: ${path}`,
          path,
          originalPath: rawPath
        };
        break;
      }

      case "download": {
        // Download a file (returns base64)
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Downloading file: ${path}`);

        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .download(path);

        if (downloadError) {
          console.error("Download error:", downloadError);
          return new Response(
            JSON.stringify({ success: false, error: downloadError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        result = {
          success: true,
          path,
          originalPath: rawPath,
          content: base64,
          size: arrayBuffer.byteLength
        };
        break;
      }

      case "delete": {
        // Delete a file
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Deleting file: ${path}`);

        const { error: deleteError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .remove([path]);

        if (deleteError) {
          console.error("Delete error:", deleteError);
          return new Response(
            JSON.stringify({ success: false, error: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = {
          success: true,
          message: `File deleted: ${path}`,
          path,
          originalPath: rawPath
        };
        break;
      }

      case "delete-folder": {
        // Delete a folder and all its contents
        if (!path) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Deleting folder: ${path}, forceDelete: ${forceDelete}`);

        // First, list all files recursively (including .folder_placeholder files)
        const allFiles: Array<{ path: string; name: string; size?: number }> = [];
        await listRecursiveIncludingPlaceholders(supabaseAdmin, path, allFiles);
        
        if (allFiles.length === 0) {
          if (forceDelete) {
            // Force delete: recursively find and clean up all virtual subfolders
            console.log(`Force delete enabled - cleaning up virtual folders under: ${path}`);
            await forceCleanupVirtualFolders(supabaseAdmin, path);
          } else {
            // Standard behavior: create and delete a placeholder
            const placeholderPath = `${path}/.folder_placeholder`;
            await supabaseAdmin.storage
              .from(BUCKET_NAME)
              .upload(placeholderPath, new Blob(['']), { upsert: true });
            await supabaseAdmin.storage
              .from(BUCKET_NAME)
              .remove([placeholderPath]);
          }
          
          result = {
            success: true,
            message: `Folder cleaned up: ${path}`,
            deleted: 0,
            forceDelete
          };
          break;
        }

        // Delete all files (including placeholders)
        const filePaths = allFiles.map(f => f.path);
        console.log(`Deleting ${filePaths.length} files:`, filePaths);
        
        const { error: deleteError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .remove(filePaths);

        if (deleteError) {
          console.error("Delete folder error:", deleteError);
          return new Response(
            JSON.stringify({ success: false, error: deleteError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = {
          success: true,
          message: `Folder deleted: ${path}`,
          deleted: filePaths.length,
          files: filePaths,
          originalPath: rawPath
        };
        break;
      }

      case "move": {
        // Move/rename a file
        if (!path || !newPath) {
          return new Response(
            JSON.stringify({ success: false, error: "Missing 'path' or 'newPath' parameter" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`Moving file: ${path} -> ${newPath}`);

        const { error: moveError } = await supabaseAdmin.storage
          .from(BUCKET_NAME)
          .move(path, newPath);

        if (moveError) {
          console.error("Move error:", moveError);
          return new Response(
            JSON.stringify({ success: false, error: moveError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = {
          success: true,
          message: `File moved: ${path} -> ${newPath}`,
          from: path,
          to: newPath,
          originalFrom: rawPath,
          originalTo: rawNewPath
        };
        break;
      }

      case "get-tree": {
        // Get folder tree structure - returns array of items at the path
        const basePath = path || "";
        console.log(`Getting tree for: ${basePath || "(root)"}`);

        const tree = await buildTree(supabaseAdmin, basePath);
        result = {
          success: true,
          path: basePath,
          originalPath: rawPath,
          tree
        };
        break;
      }

      case "normalize-companies-tree": {
        // Normalize all folder names under TreatNote/Companies to canonical format
        // Converts underscores to spaces and normalizes Hungarian characters
        const basePath = path || "TreatNote/Companies";
        console.log(`Normalizing folder structure under: ${basePath}`);
        
        const report = await normalizeCompaniesTree(supabaseAdmin, basePath);
        
        result = {
          success: true,
          message: `Normalization complete`,
          ...report
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unknown operation: ${operation}`,
            supported: ["list", "list-recursive", "create-folder", "upload", "download", "delete", "delete-folder", "move", "get-tree", "normalize-companies-tree"]
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Recursively list all files under a path
// NOTE: Do NOT use trailing slash - Supabase list() returns empty with trailing slash
async function listRecursive(
  supabase: any, 
  basePath: string,
  results: Array<{ path: string; name: string; size?: number }> = []
): Promise<Array<{ path: string; name: string; size?: number }>> {
  // Use the path as-is without trailing slash (same as buildTree)
  const listPath = basePath || "";
  
  console.log(`listRecursive: Listing path "${listPath}"`);
  
  const { data: items, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(listPath, { limit: 1000 });

  if (error) {
    console.error(`listRecursive: Error listing "${listPath}":`, error);
    return results;
  }
  
  if (!items || items.length === 0) {
    console.log(`listRecursive: No items found at "${listPath}"`);
    return results;
  }

  console.log(`listRecursive: Found ${items.length} items at "${listPath}"`);

  for (const item of items) {
    if (item.name === ".folder_placeholder") continue;
    
    const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
    
    if (item.id === null) {
      // It's a folder, recurse
      await listRecursive(supabase, itemPath, results);
    } else {
      // It's a file
      results.push({
        path: itemPath,
        name: item.name,
        size: item.metadata?.size
      });
    }
  }

  return results;
}

// Helper: Recursively list all files including .folder_placeholder files (for deletion)
async function listRecursiveIncludingPlaceholders(
  supabase: any, 
  basePath: string,
  results: Array<{ path: string; name: string; size?: number }>
): Promise<void> {
  const listPath = basePath || "";
  
  const { data: items, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(listPath, { limit: 1000 });

  if (error || !items || items.length === 0) {
    return;
  }

  for (const item of items) {
    const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
    
    if (item.id === null) {
      // It's a folder, recurse
      await listRecursiveIncludingPlaceholders(supabase, itemPath, results);
    } else {
      // It's a file (including .folder_placeholder)
      results.push({
        path: itemPath,
        name: item.name,
        size: item.metadata?.size
      });
    }
  }
}

// Helper: Force cleanup virtual folders by creating/removing placeholders recursively
async function forceCleanupVirtualFolders(supabase: any, basePath: string): Promise<void> {
  const { data: items } = await supabase.storage
    .from(BUCKET_NAME)
    .list(basePath, { limit: 1000 });

  if (!items || items.length === 0) {
    // This is an empty virtual folder - create and remove a placeholder
    const placeholderPath = `${basePath}/.folder_placeholder`;
    await supabase.storage
      .from(BUCKET_NAME)
      .upload(placeholderPath, new Blob(['']), { upsert: true });
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([placeholderPath]);
    console.log(`Cleaned up virtual folder: ${basePath}`);
    return;
  }

  // Process subfolders
  for (const item of items) {
    if (item.id === null) {
      // It's a folder, recurse
      const subPath = `${basePath}/${item.name}`;
      await forceCleanupVirtualFolders(supabase, subPath);
    }
  }

  // After cleaning subfolders, create and remove placeholder for this folder too
  const placeholderPath = `${basePath}/.folder_placeholder`;
  await supabase.storage
    .from(BUCKET_NAME)
    .upload(placeholderPath, new Blob(['']), { upsert: true });
  await supabase.storage
    .from(BUCKET_NAME)
    .remove([placeholderPath]);
  console.log(`Cleaned up folder: ${basePath}`);
}

// Helper: Build a tree structure - returns array of children for given path
async function buildTree(supabase: any, basePath: string): Promise<any[]> {
  // For root, use empty string; for paths, don't add trailing slash for list
  const listPath = basePath || "";
  
  console.log(`Listing storage path: "${listPath}"`);
  
  const { data: items, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(listPath, { limit: 1000 });

  if (error) {
    console.error(`Error listing "${listPath}":`, error);
    return [];
  }
  
  if (!items || items.length === 0) {
    console.log(`No items found at "${listPath}"`);
    return [];
  }

  console.log(`Found ${items.length} items at "${listPath}":`, items.map((i: any) => i.name));

  const children: any[] = [];

  for (const item of items) {
    if (item.name === ".folder_placeholder") continue;
    
    const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
    
    if (item.id === null) {
      // Folder - recurse to get its children
      const subChildren = await buildTree(supabase, itemPath);
      children.push({
        name: item.name,
        path: itemPath,
        type: "folder",
        children: subChildren
      });
    } else {
      // File
      children.push({
        name: item.name,
        path: itemPath,
        type: "file",
        size: item.metadata?.size
      });
    }
  }

  return children;
}

// Helper: Normalize path segment - convert underscores to spaces and normalize Hungarian chars
function normalizePathSegment(segment: string): string {
  // First convert underscores to spaces
  let normalized = segment.replace(/_/g, ' ');
  // Then normalize Hungarian characters
  normalized = normalizeHungarian(normalized);
  // Collapse multiple spaces and trim
  return normalized.replace(/\s+/g, ' ').trim();
}

// Helper: Normalize entire path
function normalizeFullPath(filePath: string): string {
  return filePath.split('/').map(normalizePathSegment).join('/');
}

// Helper: Normalize folder structure under TreatNote/Companies
async function normalizeCompaniesTree(
  supabase: any, 
  basePath: string
): Promise<{
  moved: number;
  skipped: number;
  errors: string[];
  conflicts: string[];
  movedFiles: Array<{ from: string; to: string }>;
}> {
  const report = {
    moved: 0,
    skipped: 0,
    errors: [] as string[],
    conflicts: [] as string[],
    movedFiles: [] as Array<{ from: string; to: string }>
  };

  // Get all files recursively
  const allFiles: Array<{ path: string; name: string; size?: number }> = [];
  await listRecursive(supabase, basePath, allFiles);
  
  console.log(`Found ${allFiles.length} files to check for normalization`);
  
  // Also include placeholder files for folder structure
  const allFilesWithPlaceholders: Array<{ path: string; name: string; size?: number }> = [];
  await listRecursiveIncludingPlaceholders(supabase, basePath, allFilesWithPlaceholders);
  
  // Process each file
  for (const file of allFilesWithPlaceholders) {
    const canonicalPath = normalizeFullPath(file.path);
    
    if (file.path === canonicalPath) {
      // Already canonical
      report.skipped++;
      continue;
    }
    
    console.log(`Need to move: "${file.path}" -> "${canonicalPath}"`);
    
    // Check if target already exists
    const { data: existingFile } = await supabase.storage
      .from(BUCKET_NAME)
      .download(canonicalPath);
    
    if (existingFile) {
      // Conflict - target already exists
      report.conflicts.push(`${file.path} -> ${canonicalPath} (target exists)`);
      report.skipped++;
      continue;
    }
    
    // Ensure parent folder exists by creating placeholder
    const parentPath = canonicalPath.substring(0, canonicalPath.lastIndexOf('/'));
    if (parentPath) {
      const placeholderPath = `${parentPath}/.folder_placeholder`;
      await supabase.storage
        .from(BUCKET_NAME)
        .upload(placeholderPath, new Blob(['']), { upsert: true });
    }
    
    // Move the file
    const { error: moveError } = await supabase.storage
      .from(BUCKET_NAME)
      .move(file.path, canonicalPath);
    
    if (moveError) {
      report.errors.push(`Failed to move ${file.path}: ${moveError.message}`);
      continue;
    }
    
    report.moved++;
    report.movedFiles.push({ from: file.path, to: canonicalPath });
    console.log(`Moved: ${file.path} -> ${canonicalPath}`);
  }
  
  // Clean up empty virtual folders from old locations
  console.log(`Cleaning up empty folders...`);
  await forceCleanupVirtualFolders(supabase, basePath);
  
  console.log(`Normalization complete: ${report.moved} moved, ${report.skipped} skipped, ${report.errors.length} errors, ${report.conflicts.length} conflicts`);
  
  return report;
}

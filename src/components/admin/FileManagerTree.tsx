import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Trash2, Download, Building2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Custom tooth icon for top-level folders
function ToothFolderIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M12 2C9.5 2 7 3.5 7 6c0 1.5-.5 3-1 4.5-.5 1.5-1 3-1 4.5 0 2 1 4 3 5 1.5.75 2.5 0 3-1.5.5-1.5 1.5-1.5 2 0 .5 1.5 1.5 2.25 3 1.5 2-1 3-3 3-5 0-1.5-.5-3-1-4.5S17 7.5 17 6c0-2.5-2.5-4-5-4z" />
    </svg>
  );
}

interface FileNode {
  name: string;
  type: 'folder' | 'file';
  size?: number;
  children?: FileNode[];
}

interface FileManagerTreeProps {
  tree: FileNode[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onDelete: (path: string, isFolder: boolean) => void;
  onDownload: (path: string) => void;
}

// Determine which icon to use based on folder depth and name
function getFolderIcon(depth: number, nodeName: string) {
  // Top level (Molaire, TreatNote) - tooth icon
  if (depth === 0) {
    return <ToothFolderIcon className="h-4 w-4 text-primary" />;
  }
  // Level 1 (Companies, etc) - building icon
  if (depth === 1) {
    return <Building2 className="h-4 w-4 text-primary" />;
  }
  // Level 2 and 3 - regular folder
  if (depth === 2 || depth === 3) {
    return <Folder className="h-4 w-4 text-primary" />;
  }
  // Level 4+ (doctor folders) - stethoscope
  return <Stethoscope className="h-4 w-4 text-primary" />;
}

function TreeNode({ 
  node, 
  path, 
  depth,
  index,
  onNavigate,
  onDelete,
  onDownload 
}: { 
  node: FileNode; 
  path: string;
  depth: number;
  index: number;
  onNavigate: (path: string) => void;
  onDelete: (path: string, isFolder: boolean) => void;
  onDownload: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullPath = path ? `${path}/${node.name}` : node.name;
  const isFolder = node.type === 'folder';

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div 
      className="folder-slide-in"
      style={{ animationDelay: `${Math.min(index, 15) * 30}ms` }}
    >
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md group cursor-pointer",
          "transition-all duration-300 sidebar-menu-hover"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isFolder ? (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded transition-transform duration-200"
          >
            <ChevronRight 
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-90"
              )} 
            />
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        {isFolder ? (
          getFolderIcon(depth, node.name)
        ) : (
          <File className="h-4 w-4 text-muted-foreground" />
        )}
        
        <span 
          className="flex-1 text-sm truncate"
          onClick={() => isFolder && onNavigate(fullPath)}
        >
          {node.name}
        </span>
        
        {!isFolder && node.size && (
          <span className="text-xs text-muted-foreground">
            {formatSize(node.size)}
          </span>
        )}
        
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-200">
          {!isFolder && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDownload(fullPath)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(fullPath, isFolder)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      
      {isFolder && expanded && node.children && (
        <div className="overflow-hidden">
          {node.children.map((child, idx) => (
            <TreeNode
              key={`${fullPath}-${child.name}-${idx}`}
              node={child}
              path={fullPath}
              depth={depth + 1}
              index={idx}
              onNavigate={onNavigate}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileManagerTree({ tree, currentPath, onNavigate, onDelete, onDownload }: FileManagerTreeProps) {
  // Ensure tree is always an array
  const treeArray = Array.isArray(tree) ? tree : [];
  
  if (treeArray.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground panel-float-in">
        Nincsenek fájlok ebben a mappában
      </div>
    );
  }

  return (
    <div className="border rounded-md p-2 panel-float-in">
      {treeArray.map((node, idx) => (
        <TreeNode
          key={`${node.name}-${idx}`}
          node={node}
          path={currentPath}
          depth={0}
          index={idx}
          onNavigate={onNavigate}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}

import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

function TreeNode({ 
  node, 
  path, 
  depth,
  onNavigate,
  onDelete,
  onDownload 
}: { 
  node: FileNode; 
  path: string;
  depth: number;
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
    <div>
      <div 
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md group cursor-pointer",
          "transition-colors"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isFolder ? (
          <button 
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        {isFolder ? (
          <Folder className="h-4 w-4 text-primary" />
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
        
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
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
        <div>
          {node.children.map((child, idx) => (
            <TreeNode
              key={`${fullPath}-${child.name}-${idx}`}
              node={child}
              path={fullPath}
              depth={depth + 1}
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
      <div className="text-center py-8 text-muted-foreground">
        Nincsenek fájlok ebben a mappában
      </div>
    );
  }

  return (
    <div className="border rounded-md p-2">
      {treeArray.map((node, idx) => (
        <TreeNode
          key={`${node.name}-${idx}`}
          node={node}
          path={currentPath}
          depth={0}
          onNavigate={onNavigate}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}

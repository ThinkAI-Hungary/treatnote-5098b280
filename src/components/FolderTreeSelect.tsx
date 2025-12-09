import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface FolderStructure {
  id: string;
  folder_path: string;
  parent_path: string | null;
  is_client_folder: boolean;
  created_at: string;
}

interface FolderTreeSelectProps {
  folders: FolderStructure[];
  selectedPath: string;
  onSelect: (path: string) => void;
  placeholder?: string;
}

export const FolderTreeSelect = ({ folders, selectedPath, onSelect, placeholder = "Select folder..." }: FolderTreeSelectProps) => {
  const [open, setOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Molaire', 'Molaire/Voxis']));

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const buildFolderTree = () => {
    const tree: { [key: string]: { folder: FolderStructure | null; children: string[] } } = {};
    
    folders.forEach(folder => {
      const parts = folder.folder_path.split('/');
      
      for (let i = 1; i <= parts.length; i++) {
        const currentPath = parts.slice(0, i).join('/');
        if (!tree[currentPath]) {
          tree[currentPath] = { 
            folder: i === parts.length ? folder : null,
            children: [] 
          };
        }
        
        if (i > 1) {
          const parentPath = parts.slice(0, i - 1).join('/');
          if (!tree[parentPath].children.includes(currentPath)) {
            tree[parentPath].children.push(currentPath);
          }
        }
      }
    });
    
    return tree;
  };

  const renderFolderTree = (path: string, depth: number = 0, tree: ReturnType<typeof buildFolderTree>): React.ReactNode => {
    const node = tree[path];
    if (!node) return null;

    const folderName = path.split('/').pop() || path;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedFolders.has(path);
    const folderData = node.folder;

    return (
      <div key={path}>
        <div
          className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer ${
            selectedPath === path ? 'bg-primary/10 border border-primary' : ''
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
          onClick={() => {
            onSelect(path);
            setOpen(false);
          }}
        >
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(path);
                }}
                className="p-0.5 hover:bg-muted rounded flex-shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-5 flex-shrink-0" />
            )}
            <Folder className="h-4 w-4 text-yellow-600 flex-shrink-0" />
            <span className="text-sm font-medium truncate">{folderName}</span>
            {folderData?.is_client_folder && (
              <Badge variant="secondary" className="text-xs flex-shrink-0 ml-2">
                Clients
              </Badge>
            )}
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children.sort().map(childPath => 
              renderFolderTree(childPath, depth + 1, tree)
            )}
          </div>
        )}
      </div>
    );
  };

  const tree = buildFolderTree();
  const selectedFolderName = selectedPath ? selectedPath.split('/').pop() : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            {selectedPath && <Folder className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
            <span className="truncate">{selectedFolderName}</span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <ScrollArea className="h-[300px]">
          <div className="p-2">
            {Object.keys(tree)
              .filter(path => !path.includes('/'))
              .sort()
              .map(rootPath => renderFolderTree(rootPath, 0, tree))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

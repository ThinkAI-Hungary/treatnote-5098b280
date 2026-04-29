const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (dir.includes('node_modules') || dir.includes('.git')) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('c:/Users/Zombo/Desktop/Antigrav/TreatNote/treatnote/src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let original = content;

    content = content.replace(/import\s+\{\s*toast\s*\}\s+from\s+['"]sonner['"];?/g, "import { toast } from '@/hooks/useToastMessage';");
    content = content.replace(/import\s+\{\s*toast\s*,\s*Toaster\s*\}\s+from\s+['"]sonner['"];?/g, "import { Toaster } from 'sonner';\nimport { toast } from '@/hooks/useToastMessage';");
    content = content.replace(/import\s+\{\s*Toaster\s*,\s*toast\s*\}\s+from\s+['"]sonner['"];?/g, "import { Toaster } from 'sonner';\nimport { toast } from '@/hooks/useToastMessage';");
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('Updated', filePath);
    }
  }
});

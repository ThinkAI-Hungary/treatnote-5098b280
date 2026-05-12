import re

with open('src/components/AuthenticatedLayout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the duplicated controls on the left side
left_controls_pattern = r'      \{\/\* Header controls \*\/.*?<\/div>\n      <\/div>'
content = re.sub(left_controls_pattern, '      </div>', content, flags=re.DOTALL)

# Find the right taskbar actions, extract it, and modify it
right_controls_pattern = r'      \{\/\* Right: taskbar actions \*\/.*?(?=    </header>)'
match = re.search(right_controls_pattern, content, flags=re.DOTALL)
if match:
    right_block = match.group(0)
    # Remove it from the end
    content = content.replace(right_block, '')
    
    # Change Right to Controls
    actions_modified = right_block.replace('{/* Right: taskbar actions */}', '{/* Header controls */}')
    actions_modified = actions_modified.replace('<div className="flex items-center gap-1">', '<div className="header-controls flex items-center gap-1 ml-2">')
    
    # Add EaisyMode toggle back if missing
    if 'EaisyMode toggle' not in actions_modified:
        eaisy_btn = '''
        {/* EaisyMode toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === 'eaisymode' ? 'light' : 'eaisymode')}
          className={elative flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 }
          aria-label="EaisyMode"
          title="EaisyMode"
        >
          <Sparkles className="h-4 w-4" />
        </button>
'''
        actions_modified = actions_modified.replace('{/* Theme toggle */}', eaisy_btn + '\n        {/* Theme toggle */}')
    
    # Inject it right after SidebarTrigger
    target_str = '''      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
      </div>'''
      
    new_str = '''      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
''' + actions_modified.replace('      {/* Header controls */}', '        {/* Header controls */}').replace('      <div className="header-controls', '        <div className="header-controls').replace('      </div>\n', '        </div>\n') + '''      </div>'''
    
    content = content.replace(target_str, new_str)
else:
    print("Could not find right block.")

with open('src/components/AuthenticatedLayout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")

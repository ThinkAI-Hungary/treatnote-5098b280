import re

with open('src/components/AuthenticatedLayout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '<header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">',
    '<header className="layout-header sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm transition-colors">'
)

with open('actions_block.txt', 'r', encoding='utf-8') as f:
    actions_block = f.read()

content = content.replace(actions_block, '')

actions_modified = actions_block.replace('{/* Right: taskbar actions */}', '{/* Header controls */}')
actions_modified = actions_modified.replace('<div className="flex items-center gap-1">', '<div className="header-controls flex items-center gap-1 ml-2">')

target_str = '''      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
      </div>'''

new_str = '''      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
''' + actions_modified + '''
      </div>'''

content = content.replace(target_str, new_str)

with open('src/components/AuthenticatedLayout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

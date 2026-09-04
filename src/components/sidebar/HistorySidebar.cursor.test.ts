import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const historySidebarPath = path.resolve(__dirname, './HistorySidebar.tsx');
const sidebarStylesPath = path.resolve(__dirname, './sidebarStyles.ts');

describe('HistorySidebar cursor affordances', () => {
  it('uses the horizontal resize cursor on blank sidebar toggle areas', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');
    const stylesSource = fs.readFileSync(sidebarStylesPath, 'utf8');

    expect(source).toContain('custom-scrollbar p-2 cursor-ew-resize');
    expect(source).toContain('text-center font-medium text-[var(--theme-text-primary)] cursor-auto');
    expect(source).toContain('transition-colors min-h-[50px] cursor-auto');
    expect(source).toContain('w-full min-w-[52.2px] cursor-ew-resize');
    expect(source).not.toContain('w-full min-w-[52.2px] cursor-pointer');
    expect(stylesSource).toContain('SIDEBAR_CLICKABLE_ICON_BUTTON_CLASS');
    expect(stylesSource).toContain('cursor-pointer');
    expect(stylesSource).toContain('SIDEBAR_ICON_LINK_BUTTON_CLASS');
    expect(stylesSource).toContain('no-underline');
    expect(stylesSource).toContain('focus-visible:ring-[var(--theme-border-focus)]');
  });
});

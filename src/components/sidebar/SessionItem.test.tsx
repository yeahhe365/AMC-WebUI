import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const sessionItemPath = path.resolve(__dirname, './SessionItem.tsx');
const normalizeSource = (source: string) => source.replace(/\s+/g, ' ');

describe('SessionItem spacing', () => {
  it('adds a little more left padding so history titles do not sit against the sidebar edge', () => {
    const source = fs.readFileSync(sessionItemPath, 'utf8');

    expect(source).toContain('text-left pl-2.5 pr-1 py-2');
    expect(source).not.toContain('text-left px-1 py-2');
  });

  it('does not reserve leading space for a drag handle button in history rows', () => {
    const source = fs.readFileSync(sessionItemPath, 'utf8');

    expect(source).not.toContain('GripVertical');
    expect(source).not.toContain('draggable="true"');
    expect(source).not.toContain('historyDragSession');
  });

  it('delegates export session selection to the export opener to avoid opening the dialog before async load completes', () => {
    const source = normalizeSource(fs.readFileSync(sessionItemPath, 'utf8'));

    expect(source).toContain('onExport={() => { onOpenExportModal(session.id); setActiveMenu(null); }}');
    expect(source).not.toContain(
      'onExport={() => { onSelectSession(session.id); onOpenExportModal(); setActiveMenu(null); }}',
    );
  });

  it('writes the session id to dataTransfer on drag start so drop targets can move the session', () => {
    const source = normalizeSource(fs.readFileSync(sessionItemPath, 'utf8'));

    expect(source).toContain('e.dataTransfer.setData(SESSION_DRAG_TYPE, session.id)');
    expect(source).toContain("e.dataTransfer.effectAllowed = 'move'");
    expect(source).toContain('onDragEnd');
    expect(source).not.toContain('draggable={false}');
  });

  it('does not activate the session for the second click of a double-click so renaming can take over', () => {
    const source = normalizeSource(fs.readFileSync(sessionItemPath, 'utf8'));

    expect(source).toContain('if (e.detail > 1)');
    expect(source).toContain('isDoubleClickDrag(e as React.DragEvent<HTMLAnchorElement>)');
  });

  it('skips activating the session when the second press of a double-click is swallowed as a micro-drag', () => {
    const source = normalizeSource(fs.readFileSync(sessionItemPath, 'utf8'));

    expect(source).toContain('if (isDoubleClickDrag(e)) {');
    expect(source).toContain('onSelectSession(session.id);');
    expect(source.indexOf('isDoubleClickDrag')).toBeLessThan(source.indexOf('handleDragEnd'));
  });
});

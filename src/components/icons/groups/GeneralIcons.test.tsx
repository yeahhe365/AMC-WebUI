import { describe, expect, it } from 'vitest';
import { render } from '@/test/render/renderer';
import { IconBranch, IconNewGroup, IconSidebarToggle } from './GeneralIcons';

describe('GeneralIcons', () => {
  it('renders the sidebar toggle as two horizontal lines', () => {
    const { container } = render(<IconSidebarToggle size={20} strokeWidth={2} />);

    const svg = container.querySelector('svg');
    const lines = Array.from(container.querySelectorAll('line'));

    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.getAttribute('y1'))).toEqual(['8', '16']);
    expect(lines.map((line) => line.getAttribute('y2'))).toEqual(['8', '16']);
    expect(lines.map((line) => line.getAttribute('x1'))).toEqual(['4', '4']);
    expect(lines.map((line) => line.getAttribute('x2'))).toEqual(['20', '14']);
  });

  it('renders new group as the stacked folders icon', () => {
    const { container } = render(<IconNewGroup size={18} strokeWidth={2} />);

    const svg = container.querySelector('svg');
    const paths = Array.from(container.querySelectorAll('path'));

    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('d')).toContain('M20 17');
    expect(paths[1]?.getAttribute('d')).toContain('M2 8v11');
  });

  it('renders the DSH branch glyph as a filled 16-grid path', () => {
    const { container } = render(<IconBranch size={14} />);

    const svg = container.querySelector('svg');
    const paths = Array.from(container.querySelectorAll('path'));

    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
    expect(paths[0]?.getAttribute('fill-rule')).toBe('evenodd');
    expect(paths[0]?.getAttribute('d')).toMatch(/^M13\.0762 1\.37207/);
  });
});

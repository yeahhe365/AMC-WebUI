import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { resolveAskPanelDockSide } from '@/utils/text-selection/askPanelDocking';
import { SelectionAskPanel } from './SelectionAskPanel';

const makeRect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
});

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0 });

describe('resolveAskPanelDockSide', () => {
  it('docks right when the panel right edge is within the threshold', () => {
    expect(resolveAskPanelDockSide(740, 1010, 1024)).toBe('right');
  });

  it('docks left when the panel left edge is within the threshold', () => {
    expect(resolveAskPanelDockSide(20, 580, 1024)).toBe('left');
  });

  it('returns null when the panel is away from both edges', () => {
    expect(resolveAskPanelDockSide(200, 760, 1024)).toBeNull();
  });

  it('prefers the right edge when both edges are within the threshold', () => {
    expect(resolveAskPanelDockSide(4, 1020, 1024)).toBe('right');
  });
});

describe('SelectionAskPanel edge docking', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderPanel = async () => {
    const onClose = vi.fn();
    await act(async () => {
      renderer.render(<SelectionAskPanel selectedText="hello world" anchorRect={null} onClose={onClose} />);
    });
    return onClose;
  };

  const dragHeaderBy = async (dx: number, dy: number) => {
    const header = document.querySelector<HTMLElement>('[role="dialog"] > div');
    expect(header).not.toBeNull();
    await act(async () => {
      header?.dispatchEvent(pointer('pointerdown', 400, 200));
    });
    await act(async () => {
      window.dispatchEvent(pointer('pointermove', 400 + dx, 200 + dy));
    });
  };

  it('collapses into an edge handle when dragged near the right edge, expands on hover', async () => {
    await renderPanel();

    await dragHeaderBy(100, 0);

    // 拖拽结束时面板右缘贴近视口右缘 → 吸附为右侧把手
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 900, 200));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const handle = document.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');
    expect(handle).not.toBeNull();
    expect(handle?.style.right).toBe('0px');

    // 悬停把手 → 展开并停靠到右缘内侧
    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const expanded = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(expanded).not.toBeNull();
    expect(document.querySelector('button[aria-label="Ask"]')).toBeNull();
    // 保持展开：鼠标移开不收起
    await act(async () => {
      expanded?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('docks to the left edge when dragged near the left edge', async () => {
    await renderPanel();

    await dragHeaderBy(-100, 0);

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(10, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 50, 200));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const handle = document.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');
    expect(handle).not.toBeNull();
    expect(handle?.style.left).toBe('0px');

    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const expanded = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(expanded).not.toBeNull();
    expect(expanded?.style.left).toBe('12px');
  });

  it('does not dock when the drag ends away from the edges', async () => {
    await renderPanel();

    await dragHeaderBy(-50, 0);

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(300, 150, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 300, 200));
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Ask"]')).toBeNull();
  });

  it('does not dock when the header is clicked without dragging', async () => {
    await renderPanel();

    // 面板贴近视口右缘：无位移的按下-抬起（单击）不应触发贴边吸附
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    const header = document.querySelector<HTMLElement>('[role="dialog"] > div');
    await act(async () => {
      header?.dispatchEvent(pointer('pointerdown', 400, 200));
    });
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 400, 200));
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Ask"]')).toBeNull();
  });

  it('caps the panel height when resizing from the north edge', async () => {
    await renderPanel();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // 默认居中：视口 1024×768，面板 560×420 → top/left = 174/232
    const northZone = document.querySelector<HTMLElement>('.cursor-n-resize');
    expect(northZone).not.toBeNull();
    await act(async () => {
      northZone?.dispatchEvent(pointer('pointerdown', 512, 171));
    });
    // 把上缘向上拖 400px：高度必须被 clamp 到 PANEL_MAX_HEIGHT_CAP(520)，而不是跟着上缘无限拉高
    await act(async () => {
      window.dispatchEvent(pointer('pointermove', 512, -229));
    });
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 512, -229));
    });

    expect(dialog?.style.height).toBe('520px');
    expect(dialog?.style.top).toBe('12px');
  });

  it('expands the docked panel when the handle is clicked (touch fallback)', async () => {
    await renderPanel();

    await dragHeaderBy(100, 0);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 900, 200));
    });
    const handle = document.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');
    expect(handle).not.toBeNull();

    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('closes the panel when the docked handle is right-clicked', async () => {
    const onClose = await renderPanel();

    await dragHeaderBy(100, 0);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 900, 200));
    });
    const handle = document.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');
    expect(handle).not.toBeNull();

    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clamps the panel back into the viewport when the window shrinks', async () => {
    await renderPanel();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    if (dialog) dialog.getBoundingClientRect = () => makeRect(232, 174, 560, 420) as DOMRect;

    // 保存原始描述符再还原：直接 delete 会把 jsdom 的 innerHeight 属性整个删掉，
    // 污染同文件后续测试（innerHeight 变 undefined → 面板定位算出 NaN）
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });
    } finally {
      if (originalInnerHeight) {
        Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      }
    }

    expect(dialog?.style.top).toBe('12px');
  });

  it('resets the conversation when the panel is re-anchored to a new selection', async () => {
    const onClose = vi.fn();
    const view = renderWithProviders(
      <SelectionAskPanel
        selectedText="first selection"
        anchorRect={makeRect(100, 100, 50, 20) as DOMRect}
        onClose={onClose}
      />,
      { language: 'en' },
    );

    const textarea = document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea');
    expect(textarea).not.toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(textarea, 'a typed question');
      textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(textarea?.value).toBe('a typed question');

    // 开着面板再次"询问"：新锚点对象 → 问答与输入清空
    await act(async () => {
      view.rerender(
        <SelectionAskPanel
          selectedText="second selection"
          anchorRect={makeRect(400, 300, 50, 20) as DOMRect}
          onClose={onClose}
        />,
      );
    });

    expect(document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea')?.value).toBe('');
  });

  it('closes the docked panel with Escape when focus is not in an editable element', async () => {
    const onClose = await renderPanel();

    await dragHeaderBy(100, 0);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 900, 200));
    });
    expect(document.querySelector('button[aria-label="Ask"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close the docked panel with Escape while an input has focus', async () => {
    const onClose = await renderPanel();

    await dragHeaderBy(100, 0);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) dialog.getBoundingClientRect = () => makeRect(1024 - 30, 100, 560, 420) as DOMRect;
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 900, 200));
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

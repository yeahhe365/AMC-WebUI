/**
 * React-commit-driven movement and entry/exit fades for the sidebar's keyed rows.
 * Implements FLIP (First, Last, Invert, Play) transition aligned with DeepSeek Harness:
 * - Surviving rows glide smoothly to their new positions (200ms ease-out)
 * - Removed rows fade out inertly in an exit overlay (100ms ease-out)
 * - New rows fade in (100ms ease-out)
 */
import { Component, createRef, type ReactNode } from 'react';

const ROW_FADE_MS = 100;
const ROW_GLIDE_MS = 200;

export interface AnimatedRowsProps {
  children: ReactNode;
  className?: string;
  label?: string;
  /** Unique DOM-order keys matching the rendered data-row-key attributes. */
  rowKeys: readonly string[];
  ready?: boolean;
  /** Changes that replace the view or reveal hidden rows settle immediately. */
  resetKey?: string;
}

interface RowPosition {
  element: HTMLElement;
  rect: DOMRect;
  opacity: number;
}

interface RowSnapshot {
  positions: Map<string, RowPosition>;
  removed: Map<string, RowPosition>;
}

function sameRows(previous: AnimatedRowsProps, next: AnimatedRowsProps): boolean {
  return (
    previous.rowKeys.length === next.rowKeys.length &&
    previous.rowKeys.every((key, index) => key === next.rowKeys[index])
  );
}

function intersects(row: DOMRect, viewport: DOMRect): boolean {
  return (
    row.bottom > viewport.top &&
    row.top < viewport.bottom &&
    row.right > viewport.left &&
    row.left < viewport.right
  );
}

export class AnimatedRows extends Component<AnimatedRowsProps> {
  private armed = false;
  private readonly list = createRef<HTMLUListElement>();
  private readonly overlay = createRef<HTMLDivElement>();
  private readonly movements = new Map<HTMLElement, Animation>();
  private readonly exits = new Map<string, { element: HTMLElement; animation: Animation }>();
  private cleanupArmListeners?: () => void;

  override componentDidMount(): void {
    const armHandler = () => {
      this.armed = true;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', armHandler, { capture: true, once: true });
      window.addEventListener('keydown', armHandler, { capture: true, once: true });
      this.cleanupArmListeners = () => {
        window.removeEventListener('pointerdown', armHandler, { capture: true });
        window.removeEventListener('keydown', armHandler, { capture: true });
      };
    }
  }

  override getSnapshotBeforeUpdate(previous: AnimatedRowsProps): RowSnapshot | null {
    const list = this.list.current;
    if (
      !this.armed ||
      sameRows(previous, this.props) ||
      previous.resetKey !== this.props.resetKey ||
      previous.ready === false ||
      this.props.ready === false ||
      list === null ||
      typeof list.animate !== 'function' ||
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    ) {
      return null;
    }

    const viewport = list.getBoundingClientRect();
    const positions = this.readPositions();
    const nextKeys = new Set(this.props.rowKeys);
    const removed = new Map<string, RowPosition>();
    for (const [key, row] of positions) {
      if (nextKeys.has(key) || !intersects(row.rect, viewport)) continue;
      const clone = row.element.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-row-key');
      clone.setAttribute('inert', '');
      removed.set(key, { ...row, element: clone });
    }
    return { positions, removed };
  }

  override componentDidUpdate(previous: AnimatedRowsProps, _state: unknown, snapshot: RowSnapshot | null): void {
    if (snapshot === null) {
      if (
        !sameRows(previous, this.props) ||
        previous.resetKey !== this.props.resetKey ||
        previous.ready !== this.props.ready
      ) {
        this.clear();
      }
      return;
    }

    this.cancelMovements();
    const list = this.list.current;
    const overlay = this.overlay.current;
    if (!list || !overlay) return;

    const viewport = list.getBoundingClientRect();
    const origin = overlay.getBoundingClientRect();
    const positions = this.readPositions();

    for (const [key, row] of positions) {
      this.removeExit(key);
      const previousRow = snapshot.positions.get(key);
      if (
        !intersects(row.rect, viewport) &&
        (previousRow === undefined || !intersects(previousRow.rect, viewport))
      ) {
        continue;
      }
      if (previousRow === undefined) {
        this.move(row.element, [{ opacity: 0 }, { opacity: 1 }], ROW_FADE_MS);
        continue;
      }
      const dx = previousRow.rect.left - row.rect.left;
      const dy = previousRow.rect.top - row.rect.top;
      if (dx === 0 && dy === 0 && previousRow.opacity === 1) continue;
      this.move(
        row.element,
        [
          { transform: `translate(${String(dx)}px, ${String(dy)}px)`, opacity: previousRow.opacity },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        ROW_GLIDE_MS,
      );
    }

    for (const [key, row] of snapshot.removed) {
      const { element } = row;
      this.removeExit(key);
      Object.assign(element.style, {
        position: 'absolute',
        margin: '0',
        transform: 'none',
        boxSizing: 'border-box',
        left: `${String(row.rect.left - origin.left)}px`,
        top: `${String(row.rect.top - origin.top)}px`,
        width: `${String(row.rect.width)}px`,
        height: `${String(row.rect.height)}px`,
        pointerEvents: 'none',
      });
      overlay.append(element);
      const animation = element.animate([{ opacity: row.opacity }, { opacity: 0 }], {
        duration: ROW_FADE_MS,
        easing: 'ease-out',
        fill: 'forwards',
      });
      this.exits.set(key, { element, animation });
      animation.onfinish = () => {
        this.removeExit(key);
      };
    }
  }

  override componentWillUnmount(): void {
    this.cleanupArmListeners?.();
    this.clear();
  }

  private readPositions(): Map<string, RowPosition> {
    const list = this.list.current;
    if (!list) return new Map();
    const rows = list.querySelectorAll<HTMLElement>('[data-row-key]');
    return new Map(
      Array.from(rows, (element) => [
        element.dataset.rowKey as string,
        {
          element,
          rect: element.getBoundingClientRect(),
          opacity: this.movements.has(element) ? Number(getComputedStyle(element).opacity) : 1,
        },
      ]),
    );
  }

  private move(element: HTMLElement, keyframes: Keyframe[], duration: number): void {
    const animation = element.animate(keyframes, { duration, easing: 'ease-out' });
    this.movements.set(element, animation);
    animation.onfinish = () => {
      this.movements.delete(element);
      animation.cancel();
    };
  }

  private cancelMovements(): void {
    for (const animation of this.movements.values()) {
      animation.onfinish = null;
      animation.cancel();
    }
    this.movements.clear();
  }

  private removeExit(key: string): void {
    const exit = this.exits.get(key);
    if (exit === undefined) return;
    exit.animation.onfinish = null;
    exit.animation.cancel();
    exit.element.remove();
    this.exits.delete(key);
  }

  private clear(): void {
    this.cancelMovements();
    for (const key of this.exits.keys()) this.removeExit(key);
  }

  override render(): ReactNode {
    return (
      <div className="relative">
        <ul
          ref={this.list}
          className={this.props.className}
          role="tree"
          aria-label={this.props.label}
          onPointerDownCapture={() => {
            this.armed = true;
          }}
          onKeyDownCapture={() => {
            this.armed = true;
          }}
        >
          {this.props.children}
        </ul>
        <div
          ref={this.overlay}
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        />
      </div>
    );
  }
}

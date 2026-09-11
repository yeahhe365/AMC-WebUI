import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualSourceViewer } from './VirtualSourceViewer';

describe('VirtualSourceViewer', () => {
  it('renders content with line numbers', () => {
    const content = 'line 1\nline 2\nline 3';
    render(<VirtualSourceViewer content={content} />);

    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('line 2')).toBeInTheDocument();
    expect(screen.getByText('line 3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('consumes highlight line callback when provided', () => {
    const onConsumed = vi.fn();
    render(
      <VirtualSourceViewer content={'first\nsecond\nthird'} highlightLine={1} onHighlightLineConsumed={onConsumed} />,
    );

    expect(onConsumed).toHaveBeenCalledTimes(1);
  });
});

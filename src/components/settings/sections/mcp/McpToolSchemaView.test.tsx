import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { McpToolSchemaView } from './McpToolSchemaView';

describe('McpToolSchemaView', () => {
  it('renders properties with type badges and required marks', () => {
    render(
      <McpToolSchemaView
        inputSchema={{
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File to read' },
            retries: { type: 'number' },
            mode: { type: 'string', enum: ['fast', 'slow'] },
          },
          required: ['path'],
        }}
      />,
    );

    expect(screen.getByText('path')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getAllByText('string').length).toBeGreaterThan(0);
    expect(screen.getByText('enum: fast | slow')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-tool-schema-view')).toBeInTheDocument();
  });

  it('renders nested object properties up to the depth cap', () => {
    const deep = (level: number): Record<string, unknown> =>
      level === 0 ? { type: 'string' } : { type: 'object', properties: { [`l${level}`]: deep(level - 1) } };

    render(<McpToolSchemaView inputSchema={{ type: 'object', properties: { root: deep(7) } }} />);
    // Five named levels render (l7…l3); deeper levels are capped.
    expect(screen.getByText('l3')).toBeInTheDocument();
    expect(screen.queryByText('l2')).not.toBeInTheDocument();
  });
});

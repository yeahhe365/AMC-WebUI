import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders trigger children correctly', () => {
    render(
      <Tooltip text="Sample tooltip info">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
  });

  it('renders children directly when text is empty', () => {
    render(
      <Tooltip text="">
        <span>Direct Child</span>
      </Tooltip>,
    );

    expect(screen.getByText('Direct Child')).toBeInTheDocument();
  });

  it('renders with dark variant without crashing', () => {
    render(
      <Tooltip text="Dark tooltip info" variant="dark">
        <button type="button">Dark hover</button>
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Dark hover' })).toBeInTheDocument();
  });
});

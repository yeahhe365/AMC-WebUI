import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelParameterModal } from './ModelParameterModal';
import type { ModelOption } from '@/types';

describe('ModelParameterModal', () => {
  const sampleModel: ModelOption = {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    parameters: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  it('renders correctly when open', () => {
    render(<ModelParameterModal isOpen={true} model={sampleModel} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('DeepSeek Chat')).toBeDefined();
    expect(screen.getByText('(deepseek-chat)')).toBeDefined();
  });

  it('handles save with modified parameters', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(<ModelParameterModal isOpen={true} model={sampleModel} onClose={onClose} onSave={onSave} />);

    const saveButton = screen.getByRole('button', { name: /save|保存/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith({
      temperature: 0.7,
      maxOutputTokens: 4096,
    });
    expect(onClose).toHaveBeenCalled();
  });
});

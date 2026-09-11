import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionAskModelSection } from './SelectionAskModelSection';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import type { ModelOption } from '@/types';
import { I18nProvider } from '@/contexts/I18nContext';

describe('SelectionAskModelSection', () => {
  const availableModels: ModelOption[] = [
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3' },
    { id: 'gemini-2.5-flash-tts', name: 'Gemini TTS' },
    { id: 'gemini-3.5-transcribe', name: 'Gemini Transcribe' },
  ];

  it('filters out image generation, TTS, and transcribe models from the selection picker', () => {
    const handleUpdate = vi.fn();
    render(
      <I18nProvider>
        <SelectionAskModelSection
          settings={{
            ...DEFAULT_APP_SETTINGS,
            selectionAskModelId: 'gemini-3.1-pro',
          }}
          onUpdate={handleUpdate}
          availableModels={availableModels}
        />
      </I18nProvider>,
    );

    // Open dropdown
    const button = screen.getByRole('button', { name: /划词提问模型|Selection Ask Model/i });
    fireEvent.click(button);

    // Verify valid text models are present
    expect(screen.getAllByText('Gemini 3.1 Pro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Gemini 2.5 Flash')).toBeInTheDocument();

    // Verify non-text models are excluded
    expect(screen.queryByText('Imagen 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Gemini TTS')).not.toBeInTheDocument();
    expect(screen.queryByText('Gemini Transcribe')).not.toBeInTheDocument();
  });
});

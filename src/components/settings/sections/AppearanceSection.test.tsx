import { act } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { fireEvent } from '@testing-library/react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import type { AppSettings } from '@/types';
import { AppearanceSection } from './AppearanceSection';

const settingsFixture: AppSettings = {
  ...useSettingsStore.getState().appSettings,
  themeId: 'system',
  language: 'en',
};

describe('AppearanceSection', () => {
  const renderer = setupTestRenderer();
  setupStoreStateReset();

  const renderAppearanceSection = async ({
    language,
    settings,
    onUpdate = vi.fn(),
  }: {
    language: SupportedLanguage;
    settings?: Partial<AppSettings>;
    onUpdate?: (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => void;
  }) => {
    await act(async () => {
      useSettingsStore.setState({ language });
      renderer.root.render(<AppearanceSection settings={{ ...settingsFixture, ...settings }} onUpdate={onUpdate} />);
    });
  };

  it('updates translated control labels from the global i18n context', async () => {
    await renderAppearanceSection({ language: 'en' });

    expect(renderer.container.textContent).toContain('Theme');
    expect(renderer.container.textContent).toContain('Gray');
    expect(renderer.container.textContent).toContain('Reading Size');
    expect(renderer.container.textContent).toContain('Live Artifacts Base Size');
    expect(renderer.container.textContent).toContain('default font size for inline Live Artifacts in chat');
    expect(renderer.container.textContent).toContain('Input Toolbar');
    expect(renderer.container.textContent).toContain('Chat Behavior');
    expect(renderer.container.textContent).toContain('Clipboard & Paste');
    expect(renderer.container.textContent).toContain('Rendering & Preview');
    expect(renderer.container.textContent).toContain('Notifications & Feedback');
    expect(renderer.container.textContent).toContain('Streaming Responses');
    expect(renderer.container.textContent).toContain('Show Translate Button');
    expect(renderer.container.textContent).toContain('Show Paste Button');
    expect(renderer.container.textContent).toContain('Show Clear Input Button');
    expect(renderer.container.textContent).toContain('Preserve Formatting When Copying Selection');
    expect(renderer.container.textContent).not.toContain('Interaction & Display');
    expect(renderer.container.textContent).not.toContain('File Transfer Method');

    act(() => {
      useSettingsStore.setState({ language: 'zh' });
    });

    expect(renderer.container.textContent).toContain('主题');
    expect(renderer.container.textContent).toContain('灰色');
    expect(renderer.container.textContent).toContain('阅读字号');
    expect(renderer.container.textContent).toContain('Live Artifacts 基础字号');
    expect(renderer.container.textContent).toContain('聊天内嵌 Live Artifacts 的默认字号');
    expect(renderer.container.textContent).toContain('输入框工具栏');
    expect(renderer.container.textContent).toContain('对话行为');
    expect(renderer.container.textContent).toContain('剪贴板与粘贴');
    expect(renderer.container.textContent).toContain('渲染与预览');
    expect(renderer.container.textContent).toContain('通知与反馈');
    expect(renderer.container.textContent).toContain('流式输出');
    expect(renderer.container.textContent).toContain('显示翻译按钮');
    expect(renderer.container.textContent).toContain('显示粘贴按钮');
    expect(renderer.container.textContent).toContain('显示清空输入框按钮');
    expect(renderer.container.textContent).toContain('复制选区时保留格式');
    expect(renderer.container.textContent).not.toContain('交互与显示');
    expect(renderer.container.textContent).not.toContain('文件传输方式');
  });

  it('does not render the legacy tap-to-send reply toggle', async () => {
    await renderAppearanceSection({
      language: 'zh',
      settings: {
        isSuggestionsEnabled: true,
        isAutoSendOnSuggestionClick: true,
      },
    });

    expect(renderer.container.textContent).not.toContain('点按回复即发');
    expect(renderer.container.textContent).not.toContain('Tap to Send Reply');
  });

  it('updates the custom Live Artifacts font size', async () => {
    const onUpdate = vi.fn();

    await renderAppearanceSection({
      language: 'zh',
      settings: {
        liveArtifactsCustomFontSize: 19,
      },
      onUpdate,
    });

    const slider = renderer.container.querySelector<HTMLInputElement>('#live-artifacts-custom-font-size');
    expect(slider).not.toBeNull();
    expect(slider?.value).toBe('19');
    expect(renderer.container.querySelector('#live-artifacts-font-size-mode')).toBeNull();

    act(() => {
      fireEvent.change(slider!, { target: { value: '22' } });
    });

    expect(onUpdate).toHaveBeenCalledWith('liveArtifactsCustomFontSize', 22);
  });

  it('updates the translate button visibility preference from the input toolbar group', async () => {
    const onUpdate = vi.fn();

    await renderAppearanceSection({
      language: 'zh',
      settings: {
        showInputTranslationButton: false,
      },
      onUpdate,
    });

    const toolbarHeading = Array.from(renderer.container.querySelectorAll('label')).find(
      (element) => element.textContent?.trim() === '输入框工具栏',
    );
    const toggleRow = Array.from(renderer.container.querySelectorAll('div')).find((element) =>
      element.textContent?.trim().startsWith('显示翻译按钮'),
    ) as HTMLDivElement | undefined;
    const toggle = toggleRow?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

    expect(toolbarHeading).not.toBeUndefined();
    expect(toggle).not.toBeUndefined();
    expect(toggle?.checked).toBe(false);

    act(() => {
      toggle?.click();
    });

    expect(onUpdate).toHaveBeenCalledWith('showInputTranslationButton', true);
  });

  it('updates the paste button visibility preference', async () => {
    const onUpdate = vi.fn();

    await renderAppearanceSection({
      language: 'zh',
      settings: {
        showInputPasteButton: false,
      },
      onUpdate,
    });

    const toggleRow = Array.from(renderer.container.querySelectorAll('div')).find((element) =>
      element.textContent?.trim().startsWith('显示粘贴按钮'),
    ) as HTMLDivElement | undefined;
    const toggle = toggleRow?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

    expect(toggle).not.toBeUndefined();
    expect(toggle?.checked).toBe(false);

    act(() => {
      toggle?.click();
    });

    expect(onUpdate).toHaveBeenCalledWith('showInputPasteButton', true);
  });

  it('updates the clear input button visibility preference', async () => {
    const onUpdate = vi.fn();

    await renderAppearanceSection({
      language: 'zh',
      settings: {
        showInputClearButton: false,
      },
      onUpdate,
    });

    const toggleRow = Array.from(renderer.container.querySelectorAll('div')).find((element) =>
      element.textContent?.trim().startsWith('显示清空输入框按钮'),
    ) as HTMLDivElement | undefined;
    const toggle = toggleRow?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

    expect(toggle).not.toBeUndefined();
    expect(toggle?.checked).toBe(false);

    act(() => {
      toggle?.click();
    });

    expect(onUpdate).toHaveBeenCalledWith('showInputClearButton', true);
  });

  it('uses input toolbar defaults when visibility preferences are missing', async () => {
    await renderAppearanceSection({
      language: 'zh',
      settings: {
        showInputTranslationButton: undefined,
        showInputPasteButton: undefined,
        showInputClearButton: undefined,
      },
    });

    const findToggle = (label: string) => {
      const toggleRow = Array.from(renderer.container.querySelectorAll('div')).find((element) =>
        element.textContent?.trim().startsWith(label),
      ) as HTMLDivElement | undefined;
      return toggleRow?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;
    };

    expect(findToggle('显示翻译按钮')?.checked).toBe(false);
    expect(findToggle('显示粘贴按钮')?.checked).toBe(true);
    expect(findToggle('显示清空输入框按钮')?.checked).toBe(true);
  });

  it('updates the selected-text formatting copy preference', async () => {
    const onUpdate = vi.fn();

    await renderAppearanceSection({
      language: 'zh',
      settings: {
        isCopySelectionFormattingEnabled: false,
      },
      onUpdate,
    });

    const toggleRow = Array.from(renderer.container.querySelectorAll('div')).find((element) =>
      element.textContent?.trim().startsWith('复制选区时保留格式'),
    ) as HTMLDivElement | undefined;
    const toggle = toggleRow?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

    expect(toggle).not.toBeUndefined();
    expect(toggle?.checked).toBe(false);

    act(() => {
      toggle?.click();
    });

    expect(onUpdate).toHaveBeenCalledWith('isCopySelectionFormattingEnabled', true);
  });
});

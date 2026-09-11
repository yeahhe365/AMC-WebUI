import { act } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { setupStoreStateReset } from '@/test/stores/reset';
import { GroupItemMenu } from './GroupItemMenu';
import { DropdownMenu } from '@/components/shared/DropdownMenu';

describe('GroupItemMenu', () => {
  const renderer = setupTestRenderer();
  setupStoreStateReset();

  const renderMenu = async (language: SupportedLanguage = 'en') => {
    await act(async () => {
      useSettingsStore.setState({ language });
      renderer.root.render(
        <DropdownMenu open>
          <GroupItemMenu menuRef={{ current: null }} onNewChat={vi.fn()} onStartEdit={vi.fn()} onDelete={vi.fn()} />
        </DropdownMenu>,
      );
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a new-chat entry above edit and delete', async () => {
    await renderMenu();

    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((button) =>
      button.textContent?.trim(),
    );
    expect(items).toEqual(['New chat in group', 'Edit', 'Delete']);
  });

  it('renders the translated zh label', async () => {
    await renderMenu('zh');

    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((button) =>
      button.textContent?.trim(),
    );
    expect(items).toEqual(['在此分组新建聊天', '编辑', '删除']);
  });

  it('invokes onNewChat when the new-chat entry is clicked', async () => {
    const onNewChat = vi.fn();
    await act(async () => {
      renderer.root.render(
        <DropdownMenu open>
          <GroupItemMenu menuRef={{ current: null }} onNewChat={onNewChat} onStartEdit={vi.fn()} onDelete={vi.fn()} />
        </DropdownMenu>,
      );
    });

    const buttons = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    act(() => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});

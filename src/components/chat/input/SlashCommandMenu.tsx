import React, { useRef, useEffect, useState } from 'react';
import { Check, CornerDownLeft } from 'lucide-react';
import { CommandIcon } from '@/components/icons/CommandIcon';
import type { SlashCommand as SlashMenuItem } from '@/types/slashCommands';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_KBD_KEY_CLASS, SETTINGS_NAV_ACTIVE_CLASS } from '@/constants/designTokens';
import { isMacPlatform, getModifierKeySymbol } from '@/utils/platform';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashMenuItem[];
  onSelect: (command: SlashMenuItem) => void;
  selectedIndex: number;
  query?: string;
  className?: string;
}

const SESSION_GROUP = new Set(['clear', 'new', 'pin', 'retry', 'model']);
const TOOLS_GROUP = new Set(['deep', 'online', 'maps', 'code', 'url', 'file']);

const getCommandGroup = (name: string): 'session' | 'tools' | 'system' => {
  if (SESSION_GROUP.has(name)) return 'session';
  if (TOOLS_GROUP.has(name)) return 'tools';
  return 'system';
};

const GROUP_LABEL_KEY: Record<'session' | 'tools' | 'system', string> = {
  session: 'slashGroupSession',
  tools: 'slashGroupTools',
  system: 'slashGroupSystem',
};

const QUICK_PANEL_ROW_HEIGHT = 28;

const SlashCommandMenuComponent: React.FC<SlashCommandMenuProps> = ({
  isOpen,
  commands,
  onSelect,
  selectedIndex,
  query,
  className,
}) => {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLLIElement>(null);
  const [isAssistivePressed, setIsAssistivePressed] = useState(false);
  const [isMouseOver, setIsMouseOver] = useState(false);

  const isModelPanel = query === 'model';

  // Cherry-style grouped display: Session / Tools / System, keep original relative order inside each group
  // Model panel is flat (no group headers) to avoid wrong "System" header.
  const groupedCommands = (() => {
    if (isModelPanel) {
      return [{ key: 'model' as const, items: commands }];
    }
    const groups: Record<'session' | 'tools' | 'system', typeof commands> = {
      session: [],
      tools: [],
      system: [],
    };
    for (const cmd of commands) {
      groups[getCommandGroup(cmd.name)].push(cmd);
    }
    return [
      { key: 'session' as const, items: groups.session },
      { key: 'tools' as const, items: groups.tools },
      { key: 'system' as const, items: groups.system },
    ].filter((g) => g.items.length > 0) as Array<{ key: string; items: typeof commands }>;
  })();
  const flatGrouped = groupedCommands.flatMap((g) => g.items);
  const selectedCommand = commands[selectedIndex];
  const displaySelectedIndex = selectedCommand ? flatGrouped.findIndex((c) => c.name === selectedCommand.name) : -1;

  const hasResults = commands.length > 0;
  const collapsed = !hasResults;

  useEffect(() => {
    if (isOpen && selectedItemRef.current && scrollContainerRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'start',
      });
    }
  }, [selectedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsAssistivePressed(false);
      return;
    }
    const isMac = isMacPlatform();
    const check = (e: KeyboardEvent) => setIsAssistivePressed(isMac ? e.metaKey : e.ctrlKey);
    const clear = () => setIsAssistivePressed(false);
    window.addEventListener('keydown', check);
    window.addEventListener('keyup', check);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', check);
      window.removeEventListener('keyup', check);
      window.removeEventListener('blur', clear);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  // Anchored to the composer <form> (relative) — spanning it edge-to-edge keeps
  // the panel visually flush with the input shell instead of inset by padding.
  const defaultClasses = 'absolute bottom-full left-0 right-0 mb-2 z-30';
  const finalClassName = className || defaultClasses;
  const assistiveKey = getModifierKeySymbol();

  return (
    <div className={finalClassName} style={{ animation: 'fadeInUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
      <div
        data-slash-command-frame="true"
        className="flex max-h-80 flex-col overflow-hidden rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] shadow-premium"
      >
        <div
          ref={scrollContainerRef}
          data-slash-command-scroll="true"
          role="listbox"
          aria-label={t('quickPanelTitle' as never)}
          className="custom-scrollbar flex max-h-80 flex-col overflow-y-auto"
          onMouseMove={() => setIsMouseOver(true)}
          onMouseLeave={() => setIsMouseOver(false)}
        >
          {collapsed ? (
            <div className="p-4 text-center text-[13px] text-[var(--theme-text-tertiary)]">
              {t('quickPanelNoResult' as never)}
            </div>
          ) : (
            <ul className="space-y-0.5 p-1.5">
              {groupedCommands.map((group) => (
                <li key={group.key} className="space-y-0.5">
                  {!isModelPanel ? (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-text-secondary)]">
                      {t(GROUP_LABEL_KEY[group.key as 'session' | 'tools' | 'system'] as never)}
                    </div>
                  ) : null}
                  <ul className="space-y-0.5">
                    {group.items.map((command) => {
                      const displayIndex = flatGrouped.findIndex((c) => c.name === command.name);
                      const isSelected = displayIndex === displaySelectedIndex;
                      return (
                        <li key={command.name} ref={isSelected ? selectedItemRef : null}>
                          <button
                            type="button"
                            onClick={() => onSelect(command)}
                            style={{ height: QUICK_PANEL_ROW_HEIGHT }}
                            className={`mx-[5px] flex w-[calc(100%-10px)] items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors duration-100 ${
                              isSelected ? SETTINGS_NAV_ACTIVE_CLASS : ''
                            } ${!isSelected && isMouseOver ? 'hover:bg-[var(--theme-bg-accent)]' : ''} ${isSelected && isMouseOver ? 'hover:bg-[var(--theme-bg-accent)]' : ''}`}
                            aria-selected={isSelected}
                            role="option"
                            data-active={isSelected ? 'true' : undefined}
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="flex items-center justify-center text-[13px] text-[var(--theme-text-tertiary)] [&>svg]:size-[1em]">
                                <CommandIcon icon={command.icon} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] leading-4 text-[var(--theme-text-primary)]">
                                /{command.name}
                              </span>
                            </span>
                            <span className="flex min-w-[20%] items-center justify-end gap-1 text-[12px] leading-4 text-[var(--theme-text-tertiary)]">
                              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {command.description}
                              </span>
                              {command.isSelected ? (
                                <Check size={12} className="shrink-0 text-[var(--theme-text-tertiary)]" />
                              ) : isSelected ? (
                                <CornerDownLeft
                                  size={12}
                                  className="hidden flex-shrink-0 text-[var(--theme-text-tertiary)] sm:block"
                                />
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          data-testid="quick-panel-footer"
          className="flex w-full items-center justify-between gap-4 border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-3 pt-2 pb-[5px]"
        >
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[var(--theme-text-tertiary)]">
            {t('quickPanelTitle' as never)}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-4 text-[12px] text-[var(--theme-text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <kbd className={SETTINGS_KBD_KEY_CLASS}>Esc</kbd>
              <span>{t('quickPanelClose' as never)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={SETTINGS_KBD_KEY_CLASS}>▲▼</kbd>
              <span>{t('quickPanelSelect' as never)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd
                className={`${SETTINGS_KBD_KEY_CLASS} ${isAssistivePressed ? '!text-[var(--theme-text-primary)]' : ''}`}
              >
                {assistiveKey}
              </kbd>
              <span>+</span>
              <kbd className={SETTINGS_KBD_KEY_CLASS}>▲▼</kbd>
              <span>{t('quickPanelPage' as never)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={SETTINGS_KBD_KEY_CLASS}>Tab/↩︎</kbd>
              <span>{t('quickPanelConfirm' as never)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SlashCommandMenu = React.memo(SlashCommandMenuComponent);

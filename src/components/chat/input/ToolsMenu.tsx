import React from 'react';
import { createPortal } from 'react-dom';
import { Globe, Check, Terminal, Link, X, Telescope, Calculator, AlertTriangle, MapPin, Wrench } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { IconPython, IconThinking } from '@/components/icons';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { usePortaledMenu } from '@/hooks/ui/usePortaledMenu';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import {
  getChatToolsForSurface,
  type ChatToolDefinition,
  type ChatToolIconKey,
} from '@/features/chat-tools/toolRegistry';
import type { ChatToolId, ChatToolToggleStates, ChatToolUtilityActions, ToggleableChatToolId } from '@/types';

interface ToolsMenuProps {
  currentModelId: string;
  /** Active session routing — Gemini built-in tools are hidden on third-party routes. */
  providerId?: string;
  toolStates: ChatToolToggleStates;
  toolUtilityActions: ChatToolUtilityActions;
  disabled: boolean;
}

const ActiveToolBadge: React.FC<{
  label: string;
  onRemove: () => void;
  removeAriaLabel: string;
  icon: React.ReactNode;
}> = ({ label, onRemove, removeAriaLabel, icon }) => (
  <>
    <div className="h-4 w-px bg-[var(--theme-border-secondary)] mx-1.5"></div>
    <button
      type="button"
      className="group flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--theme-bg-accent)]/10 px-2.5 py-1 text-sm text-[var(--theme-text-primary)] transition-colors select-none hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
      style={{ animation: `fadeInUp 0.3s ease-out both` }}
      onClick={onRemove}
      aria-label={removeAriaLabel}
    >
      <div className="relative flex h-3.5 w-3.5 items-center justify-center">
        <span className="flex items-center justify-center group-hover:opacity-0">{icon}</span>
        <span className="absolute inset-0 flex items-center justify-center text-[var(--theme-icon-error)] opacity-0 group-hover:opacity-100">
          <X size={14} strokeWidth={2.5} />
        </span>
      </div>
      <span className="font-medium">{label}</span>
    </button>
  </>
);

const BUILT_IN_TOOL_IDS = new Set<ChatToolId>([
  'deepSearch',
  'googleSearch',
  'googleMaps',
  'codeExecution',
  'urlContext',
]);

const isToggleableToolId = (id: ChatToolId): id is ToggleableChatToolId =>
  id === 'deepSearch' ||
  id === 'googleSearch' ||
  id === 'googleMaps' ||
  id === 'codeExecution' ||
  id === 'localPython' ||
  id === 'urlContext' ||
  id === 'alwaysKeepThinking';

const renderToolIcon = (icon: ChatToolIconKey, size: number) => {
  switch (icon) {
    case 'telescope':
      return <Telescope size={size} strokeWidth={2} />;
    case 'globe':
      return <Globe size={size} strokeWidth={2} />;
    case 'map':
      return <MapPin size={size} strokeWidth={2} />;
    case 'terminal':
      return <Terminal size={size} strokeWidth={2} />;
    case 'python':
      return <IconPython size={size} strokeWidth={2} />;
    case 'link':
      return <Link size={size} strokeWidth={2} />;
    case 'calculator':
      return <Calculator size={size} strokeWidth={2} />;
    case 'brain':
      return <IconThinking size={size} />;
  }
};

export const ToolsMenu: React.FC<ToolsMenuProps> = ({
  currentModelId,
  providerId,
  toolStates,
  toolUtilityActions,
  disabled,
}) => {
  const { t } = useI18n();
  const { isOpen, menuPosition, containerRef, buttonRef, menuRef, targetWindow, closeMenu, toggleMenu } =
    usePortaledMenu();
  const capabilities = getCachedModelCapabilities(currentModelId);

  const handleToggle = (toggleFunc?: () => void) => {
    if (toggleFunc) {
      toggleFunc();
      closeMenu();
    }
  };

  // Matched icon size to other toolbar buttons (Attachment, Mic, etc.)
  const menuIconSize = 20;

  const getToolAction = (tool: ChatToolDefinition) => {
    const toolId = tool.id;

    if (isToggleableToolId(toolId)) {
      return () => handleToggle(toolStates[toolId]?.onToggle);
    }

    return () => {
      if (toolId === 'tokenCount') {
        toolUtilityActions.onCountTokens();
      }
      closeMenu();
    };
  };

  const filteredItems = getChatToolsForSurface({
    surface: 'tools-menu',
    capabilities,
    providerId,
    hasLocalPythonHandler: !!toolStates.localPython?.onToggle,
  }).filter((tool) => !isToggleableToolId(tool.id) || !!toolStates[tool.id]?.onToggle);

  const hasBuiltInToolEnabled = filteredItems.some(
    (tool) => BUILT_IN_TOOL_IDS.has(tool.id) && isToggleableToolId(tool.id) && toolStates[tool.id]?.isEnabled,
  );
  const showBuiltInCustomToolNotice =
    !capabilities.supportsBuiltInCustomToolCombination &&
    !capabilities.permissions.canUseLiveControls &&
    !!toolStates.localPython?.isEnabled &&
    hasBuiltInToolEnabled;

  if (filteredItems.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center">
        <div className="relative" ref={containerRef}>
          <button
            ref={buttonRef}
            type="button"
            onClick={toggleMenu}
            disabled={disabled}
            className={`${CHAT_INPUT_BUTTON_CLASS} text-[var(--theme-icon-attach)] ${isOpen ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]' : 'bg-transparent hover:bg-[var(--theme-bg-tertiary)]'}`}
            aria-label={t('toolsButton')}
            title={t('toolsButton')}
            aria-haspopup="true"
            aria-expanded={isOpen}
          >
            <Wrench size={menuIconSize} strokeWidth={2} />
          </button>
          {isOpen &&
            targetWindow &&
            createPortal(
              <div
                ref={menuRef}
                className="fixed w-60 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-xl shadow-premium py-1.5 custom-scrollbar"
                style={menuPosition}
                role="menu"
              >
                {filteredItems.map((item) => {
                  const isEnabled = isToggleableToolId(item.id) ? !!toolStates[item.id]?.isEnabled : false;

                  return (
                    <button
                      key={item.id}
                      onClick={getToolAction(item)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors ${isEnabled ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-primary)]'}`}
                      role="menuitem"
                    >
                      <div className="flex items-center gap-3.5">
                        <span
                          className={isEnabled ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-secondary)]'}
                        >
                          {renderToolIcon(item.icon, 18)}
                        </span>
                        <span className="font-medium">{t(item.labelKey)}</span>
                      </div>
                      {isEnabled && <Check size={16} className="text-[var(--theme-text-link)]" strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>,
              targetWindow.document.body,
            )}
        </div>
        {filteredItems
          .filter(
            (item) =>
              item.shortLabelKey &&
              isToggleableToolId(item.id) &&
              toolStates[item.id]?.isEnabled &&
              toolStates[item.id]?.onToggle,
          )
          .map((item) => (
            <ActiveToolBadge
              key={item.id}
              label={t(item.shortLabelKey!)}
              onRemove={toolStates[item.id as ToggleableChatToolId]!.onToggle!}
              removeAriaLabel={`Disable ${t(item.labelKey)}`}
              icon={renderToolIcon(item.icon, 14)}
            />
          ))}
      </div>
      {showBuiltInCustomToolNotice && (
        <div className="max-w-sm rounded-xl border border-[var(--theme-bg-danger)]/20 bg-[var(--theme-bg-danger)]/8 px-3 py-2 text-xs text-[var(--theme-text-secondary)]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--theme-text-danger)]" strokeWidth={2} />
            <span>{t('toolsLocalPythonCombinationNotice')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

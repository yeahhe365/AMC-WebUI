import React, { useState } from 'react';
import { Globe, Check, Terminal, Link, X, Telescope, Calculator, AlertTriangle, MapPinned, Wrench } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { IconPyodide, IconThinking } from '@/components/icons';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/DropdownMenu';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import {
  getChatToolsForSurface,
  type ChatToolDefinition,
  type ChatToolIconKey,
} from '@/features/chat-tools/toolRegistry';
import type {
  ChatToolId,
  ChatToolToggleStates,
  ChatToolUtilityActions,
  GeoLocationCoordinates,
  ToggleableChatToolId,
} from '@/types';
import { GoogleMapsLocationModal } from './GoogleMapsLocationModal';
import { UrlContextModal } from './UrlContextModal';
import { formatLocationDisplay } from '@/utils/geolocation';
import { useChatStore } from '@/stores/chatStore';

interface ToolsMenuProps {
  currentModelId: string;
  /** Active session routing — Gemini built-in tools are hidden on third-party routes. */
  providerId?: string;
  toolStates: ChatToolToggleStates;
  toolUtilityActions: ChatToolUtilityActions;
  disabled: boolean;
  googleMapsLocation?: GeoLocationCoordinates;
  onUpdateGoogleMapsLocation?: (location: GeoLocationCoordinates | undefined) => void;
  onInsertUrls?: (urls: string[]) => void;
}

const ActiveToolBadge: React.FC<{
  label: string;
  onRemove: () => void;
  removeAriaLabel: string;
  icon: React.ReactNode;
  onConfigure?: () => void;
  configureAriaLabel?: string;
}> = ({ label, onRemove, removeAriaLabel, icon, onConfigure, configureAriaLabel }) => (
  <>
    <div className="h-4 w-px bg-[var(--theme-border-secondary)] mx-1.5"></div>
    {onConfigure ? (
      <div
        className="group inline-flex items-center rounded-full bg-[var(--theme-bg-accent)]/10 text-sm text-[var(--theme-text-primary)] pl-2.5 pr-1 py-0.5 gap-1.5 transition-colors hover:bg-[var(--theme-bg-tertiary)]"
        style={{ animation: `fadeInUp 0.3s ease-out both` }}
      >
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-sm text-[var(--theme-text-primary)] hover:text-[var(--theme-text-link)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] rounded"
          onClick={onConfigure}
          aria-label={configureAriaLabel ?? label}
          title={configureAriaLabel ?? label}
        >
          <span className="flex items-center justify-center text-[var(--theme-text-link)]">{icon}</span>
          <span className="font-medium max-w-[140px] truncate">{label}</span>
        </button>
        <button
          type="button"
          className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[var(--theme-text-secondary)] hover:text-[var(--theme-icon-error)] hover:bg-[var(--theme-bg-secondary)] focus:outline-none"
          onClick={onRemove}
          aria-label={removeAriaLabel}
          title={removeAriaLabel}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    ) : (
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
    )}
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
      return <MapPinned size={size} strokeWidth={2} />;
    case 'terminal':
      return <Terminal size={size} strokeWidth={2} />;
    case 'pyodide':
    case 'python':
      return <IconPyodide size={size} />;
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
  googleMapsLocation: propGoogleMapsLocation,
  onUpdateGoogleMapsLocation: propOnUpdateGoogleMapsLocation,
  onInsertUrls,
}) => {
  const { t } = useI18n();
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const storeGoogleMapsLocation = useChatStore((state) => {
    const session = state.savedSessions.find((s) => s.id === state.activeSessionId);
    return session?.settings?.googleMapsLocation ?? state.pendingChatSettings?.googleMapsLocation;
  });
  const setCurrentChatSettings = useChatStore((state) => state.setCurrentChatSettings);
  const effectiveLocation = propGoogleMapsLocation !== undefined ? propGoogleMapsLocation : storeGoogleMapsLocation;

  const handleUpdateLocation = (location: GeoLocationCoordinates | undefined) => {
    if (propOnUpdateGoogleMapsLocation) {
      propOnUpdateGoogleMapsLocation(location);
    } else {
      setCurrentChatSettings((prev) => ({
        ...prev,
        googleMapsLocation: location,
      }));
    }
  };

  const capabilities = getCachedModelCapabilities(currentModelId);

  const handleToggle = (toggleFunc?: () => void) => {
    if (toggleFunc) {
      toggleFunc();
    }
  };

  // Matched icon size to other toolbar buttons (Attachment, Mic, etc.)
  const menuIconSize = 20;

  const isItemActionTriggeredRef = React.useRef(false);

  const getToolAction = (tool: ChatToolDefinition) => {
    const toolId = tool.id;

    if (isToggleableToolId(toolId)) {
      return () => {
        isItemActionTriggeredRef.current = true;
        handleToggle(toolStates[toolId]?.onToggle);
      };
    }

    return () => {
      if (toolId === 'tokenCount') {
        isItemActionTriggeredRef.current = true;
        toolUtilityActions.onCountTokens();
      }
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
        <div className="relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                className={`${CHAT_INPUT_BUTTON_CLASS} text-[var(--theme-icon-attach)] bg-transparent hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]`}
                aria-label={t('toolsButton')}
                title={t('toolsButton')}
                aria-haspopup="true"
              >
                <Wrench size={menuIconSize} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-60 max-h-[75vh] overflow-y-auto custom-scrollbar py-1.5 shadow-premium"
              onCloseAutoFocus={(e) => {
                if (isItemActionTriggeredRef.current) {
                  e.preventDefault();
                  isItemActionTriggeredRef.current = false;
                }
              }}
            >
              {filteredItems.map((item) => {
                const isEnabled = isToggleableToolId(item.id) ? !!toolStates[item.id]?.isEnabled : false;

                return (
                  <DropdownMenuItem key={item.id} asChild onClick={getToolAction(item)} className="cursor-pointer">
                    <button
                      type="button"
                      role="menuitem"
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors ${isEnabled ? 'text-[var(--theme-text-link)]' : 'text-[var(--theme-text-primary)]'}`}
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
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {filteredItems
          .filter(
            (item) =>
              item.shortLabelKey &&
              isToggleableToolId(item.id) &&
              toolStates[item.id]?.isEnabled &&
              toolStates[item.id]?.onToggle,
          )
          .map((item) => {
            const isMaps = item.id === 'googleMaps';
            const isUrl = item.id === 'urlContext';
            let badgeLabel = t(item.shortLabelKey!);
            if (isMaps && effectiveLocation) {
              const locName = formatLocationDisplay(effectiveLocation);
              if (locName) {
                badgeLabel = `${badgeLabel} · ${locName}`;
              }
            }

            return (
              <ActiveToolBadge
                key={item.id}
                label={badgeLabel}
                onRemove={toolStates[item.id as ToggleableChatToolId]!.onToggle!}
                removeAriaLabel={`Disable ${t(item.labelKey)}`}
                icon={renderToolIcon(item.icon, 14)}
                onConfigure={
                  isMaps ? () => setIsLocationModalOpen(true) : isUrl ? () => setIsUrlModalOpen(true) : undefined
                }
                configureAriaLabel={isMaps ? t('mapsLocationConfigure') : isUrl ? t('urlContextConfigure') : undefined}
              />
            );
          })}
      </div>
      {showBuiltInCustomToolNotice && (
        <div className="max-w-sm rounded-xl border border-[var(--theme-bg-danger)]/20 bg-[var(--theme-bg-danger)]/8 px-3 py-2 text-xs text-[var(--theme-text-secondary)]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--theme-text-danger)]" strokeWidth={2} />
            <span>{t('toolsLocalPythonCombinationNotice')}</span>
          </div>
        </div>
      )}
      {isLocationModalOpen && (
        <GoogleMapsLocationModal
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          location={effectiveLocation}
          onSave={handleUpdateLocation}
        />
      )}
      {isUrlModalOpen && (
        <UrlContextModal
          isOpen={isUrlModalOpen}
          onClose={() => setIsUrlModalOpen(false)}
          onInsertUrls={onInsertUrls}
          onEnableTool={toolStates.urlContext?.onToggle}
          isToolEnabled={!!toolStates.urlContext?.isEnabled}
        />
      )}
    </div>
  );
};

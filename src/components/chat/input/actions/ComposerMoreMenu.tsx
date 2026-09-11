import React from 'react';
import { Ellipsis } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/DropdownMenu';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import type { ComposerAuxiliaryAction } from './useComposerAuxiliaryActions';

export const ComposerMoreMenu: React.FC<{ actions: ComposerAuxiliaryAction[]; disabled?: boolean }> = ({
  actions,
  disabled = false,
}) => {
  const { t } = useI18n();
  const isItemActionTriggeredRef = React.useRef(false);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div data-testid="composer-more-menu" className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`${CHAT_INPUT_BUTTON_CLASS} bg-transparent text-[var(--theme-icon-settings)] hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]`}
            aria-label={t('composerMoreActions')}
            title={t('composerMoreActions')}
          >
            <Ellipsis size={20} strokeWidth={2.2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 py-1.5 shadow-premium"
          side="top"
          align="start"
          sideOffset={8}
          onCloseAutoFocus={(e) => {
            if (isItemActionTriggeredRef.current) {
              e.preventDefault();
              isItemActionTriggeredRef.current = false;
            }
          }}
        >
          {actions.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => {
                isItemActionTriggeredRef.current = true;
                item.action();
              }}
              disabled={item.disabled}
              data-testid={item.testId}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] focus:bg-[var(--theme-bg-tertiary)]"
            >
              <span className="text-[var(--theme-text-secondary)]">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

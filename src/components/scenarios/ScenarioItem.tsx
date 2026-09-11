import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type SavedScenario } from '@/types';
import { Download, Edit3, Trash2, Eye, Copy, MoreHorizontal } from 'lucide-react';
import { SMALL_ICON_BUTTON_CLASS } from '@/constants/buttonClasses';
import { interpolate } from '@/i18n/interpolate';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/DropdownMenu';

interface ScenarioItemProps {
  scenario: SavedScenario;
  isSystem: boolean;
  onLoad: (scenario: SavedScenario) => void;
  onEdit?: (scenario: SavedScenario) => void;
  onDelete?: (id: string) => void;
  onDuplicate: (scenario: SavedScenario) => void;
  onExport: (scenario: SavedScenario) => void;
  onView?: (scenario: SavedScenario) => void;
}

export const ScenarioItem: React.FC<ScenarioItemProps> = ({
  scenario,
  isSystem,
  onLoad,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onView,
}) => {
  const { t } = useI18n();
  const messageCount = scenario.messages.length;
  const hasSystemPrompt = !!scenario.systemInstruction;

  const previewText =
    scenario.description ||
    (scenario.messages.length > 0
      ? scenario.messages[0].content
      : scenario.systemInstruction || t('scenariosPreviewFallback'));

  const secondaryActions: Array<{
    key: string;
    label: string;
    icon: React.ElementType;
    onSelect: () => void;
    danger?: boolean;
  }> = [];

  if (isSystem && onView) {
    secondaryActions.push({
      key: 'view',
      label: t('scenariosViewTitle'),
      icon: Eye,
      onSelect: () => onView(scenario),
    });
  }
  if (!isSystem && onEdit) {
    secondaryActions.push({
      key: 'edit',
      label: t('scenariosEditScenarioTitle'),
      icon: Edit3,
      onSelect: () => onEdit(scenario),
    });
  }
  secondaryActions.push({
    key: 'duplicate',
    label: t('scenariosDuplicateTitle'),
    icon: Copy,
    onSelect: () => onDuplicate(scenario),
  });
  secondaryActions.push({
    key: 'export',
    label: t('scenariosExportSingleTitle'),
    icon: Download,
    onSelect: () => onExport(scenario),
  });
  if (!isSystem && onDelete) {
    secondaryActions.push({
      key: 'delete',
      label: t('scenariosDeleteScenarioTitle'),
      icon: Trash2,
      onSelect: () => onDelete(scenario.id),
      danger: true,
    });
  }

  const editAction = !isSystem && onEdit ? () => onEdit(scenario) : null;

  return (
    <li className="group relative flex items-center gap-1 rounded-lg px-2.5 py-2 hover:bg-[var(--theme-bg-tertiary)]/70">
      <button
        type="button"
        onClick={() => onLoad(scenario)}
        className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)]"
        aria-label={`${scenario.title}. ${t('scenariosUseButtonTitle')}`}
        title={t('scenariosUseButtonTitle')}
      >
        <span className="block truncate text-sm font-medium text-[var(--theme-text-primary)]">{scenario.title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[var(--theme-text-tertiary)]">
          <span className="min-w-0 truncate">{previewText}</span>
          <span className="flex-shrink-0 tabular-nums">
            {interpolate(t('scenariosMessageCount'), { count: String(messageCount) })}
          </span>
          {hasSystemPrompt && <span className="flex-shrink-0">{t('scenariosSystemPromptLabel')}</span>}
        </span>
      </button>

      {editAction && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            editAction();
          }}
          className={`${SMALL_ICON_BUTTON_CLASS} opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto`}
          title={t('scenariosEditScenarioTitle')}
          aria-label={t('scenariosEditScenarioTitle')}
        >
          <Edit3 size={15} />
        </button>
      )}

      <div className="relative shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${SMALL_ICON_BUTTON_CLASS} p-1 text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-secondary)] hover:text-[var(--theme-text-primary)] data-[state=open]:bg-[var(--theme-bg-secondary)] data-[state=open]:text-[var(--theme-text-primary)]`}
              title={t('scenariosMoreActions')}
              aria-label={t('scenariosActionsAria')}
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 py-1" side="bottom" align="end">
            {secondaryActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    action.onSelect();
                  }}
                  variant={action.danger ? 'danger' : 'default'}
                  className="gap-2.5 px-3 py-1.5 cursor-pointer text-xs"
                >
                  <ActionIcon size={14} />
                  <span>{action.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
};

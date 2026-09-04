import React from 'react';
import { Paperclip } from 'lucide-react';
import { useResponsiveValue } from '@/hooks/useDevice';
import { useI18n } from '@/contexts/I18nContext';

interface DragDropOverlayProps {
  isDraggingOver: boolean;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ isDraggingOver }) => {
  const { t } = useI18n();
  const dragIconSize = useResponsiveValue(48, 64);

  if (!isDraggingOver) return null;

  return (
    <div className="fixed inset-0 bg-[var(--theme-bg-accent)] bg-opacity-25 flex flex-col items-center justify-center pointer-events-none z-50 border-4 border-dashed border-[var(--theme-bg-accent)] rounded-lg m-1 sm:m-2 drag-overlay-animate">
      <div className="flex flex-col items-center gap-2">
        <Paperclip size={dragIconSize} className="text-[var(--theme-bg-accent)] opacity-80 mb-2 sm:mb-4" />
        <p className="text-lg sm:text-2xl font-semibold text-[var(--theme-text-link)] text-center px-2">
          {t('appDragDropRelease')}
        </p>
        <p className="text-sm text-[var(--theme-text-primary)] opacity-80 mt-2">{t('appDragDropHelpText')}</p>
      </div>
    </div>
  );
};

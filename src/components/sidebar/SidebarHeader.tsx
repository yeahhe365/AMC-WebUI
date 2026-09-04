import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { IconSidebarToggle } from '@/components/icons';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { isDarkThemeId } from '@/utils/themeMode';

interface SidebarHeaderProps {
  onToggle: () => void;
  isOpen: boolean;
  themeId: string;
  /** 新标签页链接（把来源会话编码进 URL），缺省保持纯 `/`。 */
  brandHref?: string;
  /** logo 点击回调（不 preventDefault，保留新标签页打开）。 */
  onBrandClick?: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  onToggle,
  isOpen,
  themeId,
  brandHref = '/',
  onBrandClick,
}) => {
  const { t } = useI18n();
  const sidebarToggleLabel = isOpen ? t('historySidebarClose') : t('historySidebarOpen');

  return (
    <div className="p-2 sm:p-3 flex items-center justify-between flex-shrink-0 h-[60px]">
      <a
        href={brandHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onBrandClick}
        className={`flex items-center gap-2 pl-2 bg-transparent border-0 cursor-pointer hover:opacity-80 transition-opacity no-underline ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
        aria-label={t('headerNewChatAria')}
        title={t('newChat')}
      >
        <img
          src={isDarkThemeId(themeId) ? '/app-logo-dark.png' : '/app-logo.png'}
          alt="AMC WebUI"
          className="h-8 w-auto object-contain"
        />
      </a>
      <button
        onClick={onToggle}
        className={`p-2 -translate-y-1 text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
        aria-label={sidebarToggleLabel}
      >
        <IconSidebarToggle size={20} strokeWidth={2.2} />
      </button>
    </div>
  );
};

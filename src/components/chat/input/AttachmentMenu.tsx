import React from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, FolderOpen } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AttachmentAction } from '@/types';
import {
  IconUpload,
  IconGallery,
  IconCamera,
  IconScreenshot,
  IconMicrophone,
  IconLink,
  IconFileEdit,
  IconZip,
  IconYoutube,
} from '@/components/icons';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { MENU_ITEM_BUTTON_CLASS, MENU_ITEM_DEFAULT_STATE_CLASS } from '@/constants/menuClasses';
import { usePortaledMenu } from '@/hooks/ui/usePortaledMenu';
import { useChatInputActionsContext } from './ChatInputContext';
import { isGemmaModel } from '@/utils/model/modelCapabilities';

const attachIconSize = 20;
const menuIconSize = 18;

export const AttachmentMenu: React.FC = () => {
  const {
    onAttachmentAction,
    disabled,
    isImageGenerationModel,
    isTranscribeModel,
    canAddYouTubeVideo,
    currentModelId,
  } = useChatInputActionsContext();
  const { t } = useI18n();
  const { isOpen, menuPosition, containerRef, buttonRef, menuRef, targetWindow, closeMenu, toggleMenu } =
    usePortaledMenu({ constrainHeight: true });
  const isAttachmentDisabled = disabled;
  const isGemma = isGemmaModel(currentModelId);

  const handleAction = (action: AttachmentAction) => {
    closeMenu();
    onAttachmentAction(action);
  };

  // The menu opens upward (bottom anchored to the trigger button), so the most
  // frequently used items go at the bottom, closest to the input area.
  const menuItems = [
    { labelKey: 'attachMenuCreateText', icon: <IconFileEdit size={menuIconSize} />, action: 'text' },
    ...(canAddYouTubeVideo
      ? [{ labelKey: 'attachMenuAddByUrl', icon: <IconYoutube size={menuIconSize} />, action: 'url' } as const]
      : []),
    { labelKey: 'attachMenuAddById', icon: <IconLink size={menuIconSize} />, action: 'id' },
    { labelKey: 'attachMenuImportFolder', icon: <FolderOpen size={menuIconSize} />, action: 'folder' },
    { labelKey: 'attachMenuImportZip', icon: <IconZip size={menuIconSize} />, action: 'zip' },
    { labelKey: 'attachMenuRecordAudio', icon: <IconMicrophone size={menuIconSize} />, action: 'recorder' },
    { labelKey: 'attachMenuScreenshot', icon: <IconScreenshot size={menuIconSize} />, action: 'screenshot' },
    { labelKey: 'attachMenuTakePhoto', icon: <IconCamera size={menuIconSize} />, action: 'camera' },
    { labelKey: 'attachMenuGallery', icon: <IconGallery size={menuIconSize} />, action: 'gallery' },
    { labelKey: 'attachMenuUpload', icon: <IconUpload size={menuIconSize} />, action: 'upload' },
  ] as const;

  const filteredMenuItems = isTranscribeModel
    ? menuItems.filter((item) => item.action === 'upload' || item.action === 'recorder' || item.action === 'id')
    : isImageGenerationModel
      ? menuItems.filter(
          (item) =>
            item.action === 'upload' ||
            item.action === 'gallery' ||
            item.action === 'camera' ||
            item.action === 'screenshot' ||
            item.action === 'id',
        )
      : isGemma
        ? menuItems.filter((item) => item.action !== 'recorder')
        : menuItems;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        disabled={isAttachmentDisabled}
        className={`${CHAT_INPUT_BUTTON_CLASS} text-[var(--theme-icon-attach)] bg-transparent hover:bg-[var(--theme-bg-tertiary)]`}
        aria-label={t('attachMenuAria')}
        title={t('attachMenuTitle')}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Paperclip size={attachIconSize} strokeWidth={2} />
      </button>

      {isOpen &&
        targetWindow &&
        createPortal(
          <div
            ref={menuRef}
            className="w-60 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-xl py-1.5 custom-scrollbar"
            style={menuPosition}
            role="menu"
          >
            {filteredMenuItems.map((item) => (
              <button
                key={item.action}
                onClick={() => handleAction(item.action)}
                className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} px-4 py-2.5 gap-3.5`}
                role="menuitem"
              >
                <span className="text-[var(--theme-text-secondary)]">{item.icon}</span>
                <span className="font-medium">{t(item.labelKey)}</span>
              </button>
            ))}
          </div>,
          targetWindow.document.body,
        )}
    </div>
  );
};

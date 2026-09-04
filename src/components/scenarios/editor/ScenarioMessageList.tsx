import React, { useRef, useEffect, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type PreloadedMessage } from '@/types';
import { User, Bot, ArrowUp, ArrowDown, Edit3, Trash2, MessageSquare } from 'lucide-react';
import { SMALL_ICON_BUTTON_CLASS, SMALL_ICON_DANGER_BUTTON_CLASS } from '@/constants/buttonClasses';

interface ScenarioMessageListProps {
  messages: PreloadedMessage[];
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  onUpdateMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  onMoveMessage: (index: number, direction: -1 | 1) => void;
  readOnly: boolean;
}

export const ScenarioMessageList: React.FC<ScenarioMessageListProps> = ({
  messages,
  editingMessageId,
  setEditingMessageId,
  onUpdateMessage,
  onDeleteMessage,
  onMoveMessage,
  readOnly,
}) => {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (listRef.current && !editingMessageId) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, editingMessageId]);

  useEffect(() => {
    if (!editingMessageId) return;
    const target = messages.find((message) => message.id === editingMessageId);

    setDraft(target ? target.content : '');
  }, [editingMessageId, messages]);

  const handleUpdate = (id: string) => {
    onUpdateMessage(id, draft);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setDraft('');
  };

  return (
    <div ref={listRef} className="flex-grow overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-[var(--theme-text-tertiary)] opacity-60">
          <div className="p-4 rounded-full bg-[var(--theme-bg-secondary)] mb-4">
            <MessageSquare size={32} className="opacity-50" />
          </div>
          <p className="text-sm font-medium">{t('scenariosEditorNoMessages')}</p>
          <p className="text-xs mt-1">{t('scenariosEditorNoMessagesHint')}</p>
        </div>
      ) : (
        messages.map((message, index) => {
          const isEditing = editingMessageId === message.id;
          const isUser = message.role === 'user';

          return (
            <div
              key={message.id}
              className={`group flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
            >
              <div
                className={`
                                flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-sm mt-1 border
                                ${
                                  isUser
                                    ? 'bg-[var(--theme-bg-user-message)] text-[var(--theme-bg-user-message-text)] border-transparent'
                                    : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border-[var(--theme-border-secondary)]'
                                }
                            `}
              >
                {isUser ? <User size={14} strokeWidth={2.5} /> : <Bot size={14} strokeWidth={2.5} />}
              </div>

              <div className={`relative max-w-[85%] sm:max-w-[75%]`}>
                <div
                  className={`
                                    rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-sm shadow-sm whitespace-pre-wrap break-words border transition-all
                                    ${
                                      isUser
                                        ? 'bg-[var(--theme-bg-user-message)] text-[var(--theme-bg-user-message-text)] border-[var(--theme-border-secondary)]/40'
                                        : 'bg-[var(--theme-bg-input)] border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] rounded-tl-sm hover:border-[var(--theme-border-focus)]'
                                    }
                                `}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-2 min-w-[240px] sm:min-w-[280px]">
                      <textarea
                        className="w-full bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] border border-[var(--theme-border-focus)] rounded-md p-3 text-inherit outline-none resize-y focus:ring-2 focus:ring-[var(--theme-border-focus)]/20"
                        value={draft}
                        autoFocus
                        rows={4}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleUpdate(message.id);
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelEdit();
                          }
                        }}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-2.5 py-1 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md transition-colors"
                        >
                          {t('scenariosEditorCancelButton')}
                        </button>
                        <button
                          onClick={() => handleUpdate(message.id)}
                          disabled={!draft.trim()}
                          className="px-2.5 py-1 text-xs font-semibold bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] rounded-md transition-colors hover:bg-[var(--theme-bg-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('scenariosEditorUpdateButton')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="leading-relaxed">{message.content}</div>
                  )}
                </div>

                {!isEditing && !readOnly && (
                  <div
                    className={`
                                        absolute -top-3 ${isUser ? 'right-0' : 'left-0'}
                                        flex items-center gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-[opacity,transform] duration-200
                                        bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] shadow-lg rounded-full px-1.5 py-1 z-10 translate-y-1 group-hover:translate-y-0
                                    `}
                  >
                    <button
                      onClick={() => onMoveMessage(index, -1)}
                      disabled={index === 0}
                      className={`${SMALL_ICON_BUTTON_CLASS} rounded-full disabled:opacity-30`}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => onMoveMessage(index, 1)}
                      disabled={index === messages.length - 1}
                      className={`${SMALL_ICON_BUTTON_CLASS} rounded-full disabled:opacity-30`}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <div className="w-px h-3 bg-[var(--theme-border-secondary)] mx-0.5"></div>
                    <button
                      onClick={() => setEditingMessageId(message.id)}
                      className={`${SMALL_ICON_BUTTON_CLASS} rounded-full hover:text-[var(--theme-text-link)]`}
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteMessage(message.id)}
                      className={`${SMALL_ICON_DANGER_BUTTON_CLASS} rounded-full`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

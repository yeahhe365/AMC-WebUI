import React, { useState, useRef } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import { useI18n } from '@/contexts/I18nContext';
import { ScrollText, Sparkles } from 'lucide-react';
import { type SavedScenario } from '@/types';
import { TextEditorModal } from '@/components/modals/TextEditorModal';
import { ScenarioEditorHeader } from './editor/ScenarioEditorHeader';
import { ScenarioSystemPrompt } from './editor/ScenarioSystemPrompt';
import { ScenarioMessageList } from './editor/ScenarioMessageList';
import { ScenarioMessageInput } from './editor/ScenarioMessageInput';
import { DEFAULT_CATEGORY } from '@/features/scenarios/scenarioCategories';

interface ScenarioEditorProps {
  initialScenario: SavedScenario | null;
  onSave: (scenario: SavedScenario) => void;
  readOnly?: boolean;
}

const createEmptyScenario = (): SavedScenario => ({
  id: `scenario-${crypto.randomUUID()}`,
  title: '',
  messages: [],
  systemInstruction: '',
  category: DEFAULT_CATEGORY,
});

export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ initialScenario, onSave, readOnly = false }) => {
  const { t } = useI18n();
  const [scenario, setScenario] = useState<SavedScenario>(() => initialScenario || createEmptyScenario());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [newMessageRole, setNewMessageRole] = useState<'user' | 'model'>('user');
  const [newMessageContent, setNewMessageContent] = useState('');
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleAddMessage = () => {
    if (!newMessageContent.trim() || readOnly) return;
    setScenario((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { id: `scenario-message-${crypto.randomUUID()}`, role: newMessageRole, content: newMessageContent },
      ],
    }));
    setNewMessageContent('');
    setNewMessageRole(newMessageRole === 'user' ? 'model' : 'user');
    deferToNextTick(() => inputRef.current?.focus());
  };

  const handleUpdateMessage = (id: string, content: string) => {
    if (readOnly) return;
    setScenario((prev) => ({
      ...prev,
      messages: prev.messages.map((message) => (message.id === id ? { ...message, content } : message)),
    }));
    setEditingMessageId(null);
  };

  const handleDeleteMessage = (id: string) => {
    if (readOnly) return;
    setScenario((prev) => ({
      ...prev,
      messages: prev.messages.filter((message) => message.id !== id),
    }));
  };

  const handleMoveMessage = (index: number, direction: -1 | 1) => {
    if (readOnly) return;
    if (index + direction < 0 || index + direction >= scenario.messages.length) return;
    const newMessages = [...scenario.messages];
    const movedMessage = newMessages[index];
    newMessages[index] = newMessages[index + direction];
    newMessages[index + direction] = movedMessage;
    setScenario((prev) => ({ ...prev, messages: newMessages }));
  };

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-primary)] rounded-xl overflow-hidden border border-[var(--theme-border-secondary)]">
      <ScenarioEditorHeader
        title={scenario.title}
        setTitle={(title) => setScenario((prev) => ({ ...prev, title }))}
        description={scenario.description}
        setDescription={(description) => setScenario((prev) => ({ ...prev, description }))}
        category={scenario.category}
        setCategory={(category) => setScenario((prev) => ({ ...prev, category }))}
        onSave={() => onSave(scenario)}
        onOpenSystemPrompt={() => setIsSystemPromptExpanded(true)}
        isSaveDisabled={!scenario.title.trim()}
        readOnly={readOnly}
      />

      <div className="flex flex-col md:flex-row flex-grow min-h-0 overflow-hidden">
        <ScenarioSystemPrompt
          value={scenario.systemInstruction || ''}
          onChange={(systemInstruction) => setScenario((prev) => ({ ...prev, systemInstruction }))}
          onExpand={() => setIsSystemPromptExpanded(true)}
          readOnly={readOnly}
        />

        <TextEditorModal
          isOpen={isSystemPromptExpanded}
          onClose={() => setIsSystemPromptExpanded(false)}
          title={t('scenariosSystemPromptLabel')}
          value={scenario.systemInstruction || ''}
          onChange={(systemInstruction) => setScenario((prev) => ({ ...prev, systemInstruction }))}
          placeholder={t('scenariosSystemPromptPlaceholder')}
          readOnly={readOnly}
        />

        <div className="flex-1 flex flex-col min-w-0 bg-[var(--theme-bg-primary)]">
          <button
            type="button"
            onClick={() => setIsSystemPromptExpanded(true)}
            className="md:hidden flex items-center gap-2 mx-4 mt-3 px-3 py-2 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] text-xs font-semibold text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <ScrollText size={14} />
            <span>{t('scenariosSystemPromptLabel')}</span>
            {scenario.systemInstruction?.trim() && (
              <span className="ml-auto flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--theme-text-link)]">
                <Sparkles size={10} /> {t('scenariosEditorSet')}
              </span>
            )}
          </button>

          <ScenarioMessageList
            messages={scenario.messages}
            editingMessageId={editingMessageId}
            setEditingMessageId={setEditingMessageId}
            onUpdateMessage={handleUpdateMessage}
            onDeleteMessage={handleDeleteMessage}
            onMoveMessage={handleMoveMessage}
            readOnly={readOnly}
          />

          <ScenarioMessageInput
            role={newMessageRole}
            setRole={setNewMessageRole}
            content={newMessageContent}
            setContent={setNewMessageContent}
            onAdd={handleAddMessage}
            inputRef={inputRef}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
};

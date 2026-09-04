import { type Dispatch, type RefObject, type SetStateAction, useState, useMemo, useCallback, useEffect } from 'react';
import { type translations } from '@/i18n/translations';
import { type AttachmentAction, type ModelOption, type ThinkingLevel } from '@/types';
import type { SlashCommand as Command } from '@/types/slashCommands';
import type { ChatToolToggleStates, ToggleableChatToolId } from '@/types/chatTools';
import { getChatToolsForSurface } from '@/features/chat-tools/toolRegistry';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { isImageGenerationModel } from '@/utils/model/modelCapabilities';

export type SlashCommandState = {
  isOpen: boolean;
  query: string;
  filteredCommands: Command[];
  selectedIndex: number;
};

interface UseSlashCommandsProps {
  t: (key: keyof typeof translations) => string;
  toolStates: ChatToolToggleStates;
  onClearChat: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onToggleLiveArtifactsPrompt: () => void;
  onTogglePinCurrentSession: () => void;
  onRetryLastTurn: () => void;
  onAttachmentAction: (action: AttachmentAction) => void;
  availableModels: ModelOption[];
  onSelectModel: (modelId: string) => void;
  onMessageSent: () => void;
  setIsHelpModalOpen: (isOpen: boolean) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onEditLastUserMessage: () => void;
  onTogglePip: () => void;
  setInputText: Dispatch<SetStateAction<string>>;
  currentModelId: string;
  /** Active session routing — Gemini built-in tool commands are hidden on third-party routes. */
  providerId?: string;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  thinkingLevel?: ThinkingLevel;
  inputText?: string;
}

const CLOSED_SLASH_COMMAND_STATE: SlashCommandState = {
  isOpen: false,
  query: '',
  filteredCommands: [],
  selectedIndex: 0,
};

const INPUT_POPULATING_COMMANDS = new Set(['model', 'edit']);

const TOOL_COMMAND_ACTIONS: Record<string, ToggleableChatToolId> = {
  deep: 'deepSearch',
  online: 'googleSearch',
  maps: 'googleMaps',
  code: 'codeExecution',
  url: 'urlContext',
};

// Cherry-style grouping priority for Web UI display order
const SLASH_GROUP_PRIORITY: Record<string, number> = {
  model: 0,
  clear: 0,
  new: 0,
  pin: 0,
  retry: 0,
  deep: 1,
  online: 1,
  maps: 1,
  code: 1,
  url: 1,
  file: 1,
};
const getSlashGroupPriority = (name: string): number => SLASH_GROUP_PRIORITY[name] ?? 2;
const sortSlashCommandsByGroup = (list: Command[]): Command[] =>
  [...list].sort((a, b) => getSlashGroupPriority(a.name) - getSlashGroupPriority(b.name));

const getSlashCursor = (textarea: HTMLTextAreaElement | null, text: string): number => {
  if (!textarea || typeof textarea.selectionStart !== 'number') return text.length;
  // In tests the textarea value may not be synced with the new inputText yet (selectionStart stays 0)
  if (textarea.value !== text) return text.length;
  return textarea.selectionStart;
};

const findSlashAnchor = (text: string, cursor: number): number => {
  for (let i = Math.min(cursor - 1, text.length - 1); i >= 0; i--) {
    if (text[i] !== '/') continue;
    const prevChar = i === 0 ? '' : text[i - 1];
    if (i === 0 || /\s/.test(prevChar)) return i;
  }
  return -1;
};

const buildModelCommands = (
  models: ModelOption[],
  onSelectModel: (modelId: string) => void,
  setInputText: Dispatch<SetStateAction<string>>,
  onMessageSent: () => void,
): Command[] =>
  models.map((model) => ({
    name: model.name,
    description: model.isPinned ? `Pinned Model` : `ID: ${model.id}`,
    icon: isImageGenerationModel(model.id) ? 'image' : model.isPinned ? 'pin' : 'bot',
    action: () => {
      onSelectModel(model.id);
      setInputText('');
      onMessageSent();
    },
  }));

export const useSlashCommands = ({
  t,
  toolStates,
  onClearChat,
  onNewChat,
  onOpenSettings,
  onToggleLiveArtifactsPrompt,
  onTogglePinCurrentSession,
  onRetryLastTurn,
  onAttachmentAction,
  availableModels,
  onSelectModel,
  onMessageSent,
  setIsHelpModalOpen,
  textareaRef,
  onEditLastUserMessage,
  onTogglePip,
  setInputText,
  currentModelId,
  providerId,
  onSetThinkingLevel,
  thinkingLevel,
  inputText,
}: UseSlashCommandsProps) => {
  const [slashCommandState, setSlashCommandState] = useState<SlashCommandState>(CLOSED_SLASH_COMMAND_STATE);

  const commandDefinitions = useMemo(() => {
    // Slash tool commands go through the same availability gates as the tools
    // menu (model capabilities + session provider routing), so a dead toggle
    const capabilities = getCachedModelCapabilities(currentModelId);
    const toolCommands = getChatToolsForSurface({
      surface: 'slash-command',
      capabilities,
      providerId,
    })
      .filter((tool) => !!tool.slashCommand)
      .map((tool) => ({
        name: tool.slashCommand!.name,
        description: t(tool.slashCommand!.descriptionKey as keyof typeof translations),
        icon: tool.slashCommand!.icon,
      }));

    const canAcceptAttachments = capabilities.permissions.canAcceptAttachments;
    const canUseThinking =
      capabilities.supportsThinkingLevel && !capabilities.isTtsModel && !capabilities.isImageGenerationModel;

    return [
      { name: 'model', description: t('helpCmdModel'), icon: 'bot' },
      { name: 'help', description: t('helpCmdHelp'), icon: 'help' },
      { name: 'edit', description: t('helpCmdEdit'), icon: 'edit' },
      { name: 'pin', description: t('helpCmdPin'), icon: 'pin' },
      { name: 'retry', description: t('helpCmdRetry'), icon: 'retry' },
      ...toolCommands,
      ...(canAcceptAttachments ? [{ name: 'file', description: t('helpCmdFile'), icon: 'paperclip' }] : []),
      { name: 'clear', description: t('helpCmdClear'), icon: 'clear' },
      { name: 'new', description: t('helpCmdNew'), icon: 'new' },
      { name: 'settings', description: t('helpCmdSettings'), icon: 'settings' },
      ...(capabilities.permissions.canGenerateSuggestions
        ? [{ name: 'artifacts', description: t('helpCmdArtifacts'), icon: 'artifacts' }]
        : []),
      { name: 'pip', description: t('helpCmdPip'), icon: 'pip' },
      ...(canUseThinking ? [{ name: 'fast', description: t('helpCmdFast'), icon: 'fast' }] : []),
    ];
  }, [t, currentModelId, providerId]);

  const commands = useMemo<Command[]>(
    () =>
      commandDefinitions.map(({ name, description, icon }) => {
        switch (name) {
          case 'model':
            return {
              name,
              description,
              icon,
              action: () => {
                setInputText('/model ');
                setTimeout(() => {
                  const textarea = textareaRef.current;
                  if (textarea) {
                    textarea.focus();
                    const textLength = textarea.value.length;
                    textarea.setSelectionRange(textLength, textLength);
                  }
                }, 0);
              },
            };
          case 'help':
            return { name, description, icon, action: () => setIsHelpModalOpen(true) };
          case 'edit':
            return { name, description, icon, action: onEditLastUserMessage };
          case 'pin':
            return { name, description, icon, action: onTogglePinCurrentSession };
          case 'retry':
            return { name, description, icon, action: onRetryLastTurn };
          case 'online':
          case 'maps':
          case 'deep':
          case 'code':
          case 'url':
            return {
              name,
              description,
              icon,
              action: toolStates[TOOL_COMMAND_ACTIONS[name]]?.onToggle ?? (() => undefined),
            };
          case 'file':
            return { name, description, icon, action: () => onAttachmentAction('upload') };
          case 'clear':
            return { name, description, icon, action: onClearChat };
          case 'new':
            return { name, description, icon, action: onNewChat };
          case 'settings':
            return { name, description, icon, action: onOpenSettings };
          case 'artifacts':
            return { name, description, icon, action: onToggleLiveArtifactsPrompt };
          case 'pip':
            return { name, description, icon, action: onTogglePip };
          case 'fast': {
            const capabilities = getCachedModelCapabilities(currentModelId);
            // gemini-3.7-flash / gemini-3.8-flash rejects MINIMAL with an API error — fall back to LOW there.
            const targetLevel =
              (capabilities.isGemini3FlashModel || capabilities.isGeminiRoboticsModel) &&
              capabilities.supportsMinimalThinkingLevel
                ? 'MINIMAL'
                : 'LOW';
            const isActive = thinkingLevel === targetLevel;
            return {
              name,
              description,
              icon,
              isSelected: isActive,
              action: () => {
                onSetThinkingLevel(isActive ? 'HIGH' : targetLevel);
              },
            };
          }
          default:
            return {
              name,
              description,
              icon,
              action: () => undefined,
            };
        }
      }),
    [
      commandDefinitions,
      currentModelId,
      onAttachmentAction,
      onClearChat,
      onEditLastUserMessage,
      onNewChat,
      onOpenSettings,
      onRetryLastTurn,
      onSetThinkingLevel,
      onToggleLiveArtifactsPrompt,
      onTogglePinCurrentSession,
      onTogglePip,
      setInputText,
      setIsHelpModalOpen,
      textareaRef,
      thinkingLevel,
      toolStates,
    ],
  );

  const allCommandsForHelp = useMemo(
    () =>
      commandDefinitions.map(({ name, description, icon }) => ({
        name: `/${name}`,
        description,
        icon,
      })),
    [commandDefinitions],
  );

  const resetSlashCommandState = useCallback(() => {
    setSlashCommandState(CLOSED_SLASH_COMMAND_STATE);
  }, []);

  // Close panel when slash trigger is removed via any setInputText path
  // (e.g. clear button, paste, programmatic resets) — not only onChange.
  useEffect(() => {
    if (inputText === undefined || !slashCommandState.isOpen) return;
    if (!inputText.includes('/')) {
      setSlashCommandState(CLOSED_SLASH_COMMAND_STATE);
      return;
    }
    const cursor = getSlashCursor(textareaRef.current, inputText);
    if (findSlashAnchor(inputText, cursor) === -1) {
      setSlashCommandState(CLOSED_SLASH_COMMAND_STATE);
    }
  }, [inputText, slashCommandState.isOpen, textareaRef]);

  const openModelCommandList = useCallback(() => {
    const modelCommands = buildModelCommands(availableModels, onSelectModel, setInputText, onMessageSent);

    setSlashCommandState({
      isOpen: true,
      query: 'model',
      filteredCommands: modelCommands,
      selectedIndex: 0,
    });
  }, [availableModels, onMessageSent, onSelectModel, setInputText]);

  const handleCommandSelect = useCallback(
    (command: Command) => {
      if (!command) return;

      command.action();

      if (command.name === 'model') {
        openModelCommandList();
        return;
      }

      resetSlashCommandState();

      const isDynamicModelCommand = availableModels.some((model) => model.name === command.name);

      // Template and dynamic model commands manage their own input text.
      if (!INPUT_POPULATING_COMMANDS.has(command.name) && !isDynamicModelCommand) {
        // Clear after the event loop tick so Enter handling cannot race the state update.
        setTimeout(() => {
          setInputText('');
        }, 0);
      }
    },
    [availableModels, openModelCommandList, resetSlashCommandState, setInputText],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);

      // Cherry QuickPanel input-query rules (simplified for single-line textarea)
      const cursor = getSlashCursor(textareaRef.current, value);
      const nextChar = value.slice(cursor, cursor + 1);
      const isCursorAtEnd = nextChar.length === 0 || /\s/.test(nextChar);
      const anchor = findSlashAnchor(value, cursor);

      if (anchor === -1) {
        resetSlashCommandState();
        return;
      }

      const searchText = value.slice(anchor, cursor);
      if (!searchText.startsWith('/')) {
        resetSlashCommandState();
        return;
      }

      // Restarted: second '/' after trigger
      if (searchText.slice(1).includes('/')) {
        resetSlashCommandState();
        return;
      }

      if (!isCursorAtEnd) {
        resetSlashCommandState();
        return;
      }

      const lowerSearch = searchText.toLowerCase();
      const isModelQuery = lowerSearch === '/model' || lowerSearch.startsWith('/model ');

      if (!isModelQuery && /\s/.test(searchText.slice(1))) {
        resetSlashCommandState();
        return;
      }

      if (isModelQuery) {
        const keyword = searchText.slice(6).trim().toLowerCase();
        // Allow keyword with spaces; only filter, never close on no results
        const filteredModels = availableModels.filter((model) => model.name.toLowerCase().includes(keyword));
        const modelCommands = buildModelCommands(filteredModels, onSelectModel, setInputText, onMessageSent);
        setSlashCommandState({
          isOpen: true,
          query: 'model',
          filteredCommands: modelCommands,
          selectedIndex: 0,
        });
        return;
      }

      const query = searchText.slice(1).toLowerCase();
      // Cherry defaultFilterFn: fuzzy + pinyin (pinyin omitted, fuzzy kept)
      const fuzzyPattern = query
        .split('')
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      const fuzzyRegex = query ? new RegExp(fuzzyPattern, 'i') : null;
      const filtered = sortSlashCommandsByGroup(
        commands.filter((cmd) => {
          const name = cmd.name.toLowerCase();
          const desc = cmd.description.toLowerCase();
          if (name.startsWith(query) || name.includes(query) || desc.includes(query)) return true;
          if (fuzzyRegex && (fuzzyRegex.test(cmd.name) || fuzzyRegex.test(cmd.description))) return true;
          return false;
        }),
      );
      // Cherry collapsed: keep panel open with "No results" instead of closing
      setSlashCommandState({
        isOpen: true,
        query,
        filteredCommands: filtered,
        selectedIndex: 0,
      });
    },
    [availableModels, commands, onMessageSent, onSelectModel, resetSlashCommandState, setInputText, textareaRef],
  );

  const handleSlashCommandExecution = useCallback(
    (text: string) => {
      const exactCommandMatch = text.match(/^\/(\S+)$/);
      if (exactCommandMatch) {
        const commandName = exactCommandMatch[1].toLowerCase();
        const command = commands.find((cmd) => cmd.name === commandName);
        if (!command) {
          return false;
        }

        handleCommandSelect(command);
        return true;
      }

      const modelCommandMatch = text.match(/^\/model\s+(.+)$/i);
      if (!modelCommandMatch) {
        return false;
      }

      const keyword = modelCommandMatch[1].trim().toLowerCase();
      if (!keyword) {
        return false;
      }

      const model = availableModels.find((availableModel) => availableModel.name.toLowerCase().includes(keyword));
      if (!model) {
        return false;
      }

      onSelectModel(model.id);
      setInputText('');
      onMessageSent();
      resetSlashCommandState();
      return true;
    },
    [
      availableModels,
      commands,
      handleCommandSelect,
      onMessageSent,
      onSelectModel,
      resetSlashCommandState,
      setInputText,
    ],
  );

  return {
    slashCommandState,
    setSlashCommandState,
    allCommandsForHelp,
    handleCommandSelect,
    handleInputChange,
    handleSlashCommandExecution,
  };
};

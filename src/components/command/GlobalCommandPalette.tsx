import React, { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { toast } from 'sonner';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/shared/Command';
import {
  Plus,
  MessageSquare,
  Download,
  Pin,
  Trash2,
  Cpu,
  Globe,
  Brain,
  Code2,
  MapPinned,
  Link as LinkIcon,
  Settings,
  FolderKanban,
  BarChart2,
  Check,
} from 'lucide-react';
import { isMacPlatform } from '@/utils/platform';

export interface GlobalCommandPaletteProps {
  onNewChat?: () => void;
  onOpenExportModal?: () => void;
  onClearCurrentChat?: () => void;
}

const COMMON_MODELS = [
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', badge: 'Fast & Smart' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', badge: 'Omni' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', badge: 'Next-Gen' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', badge: '2M Context' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'DeepSeek', badge: 'Reasoning' },
];

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  onNewChat,
  onOpenExportModal,
  onClearCurrentChat,
}) => {
  const isMac = isMacPlatform();
  const modKey = isMac ? '⌘' : 'Ctrl';

  const isOpen = useUIStore((state) => state.isCommandPaletteOpen);
  const setIsOpen = useUIStore((state) => state.setIsCommandPaletteOpen);
  const setIsSettingsModalOpen = useUIStore((state) => state.setIsSettingsModalOpen);
  const setIsLogViewerOpen = useUIStore((state) => state.setIsLogViewerOpen);
  const setActiveView = useUIStore((state) => state.setActiveView);
  const toggleHistorySidebar = useUIStore((state) => state.toggleHistorySidebar);

  const savedSessions = useChatStore((state) => state.savedSessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId);
  const setCurrentChatSettings = useChatStore((state) => state.setCurrentChatSettings);

  // Global keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      // ⌘K or ⌘⇧P or Ctrl+K or Ctrl+Shift+P
      if ((isCmdOrCtrl && e.key.toLowerCase() === 'k') || (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'p')) {
        const target = e.target as HTMLElement | null;
        const isContentEditable = target?.isContentEditable || false;
        const isInputOrTextarea = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
        // Allow shortcut if not inside an input, or if explicitly pressing Shift+P
        if (!isInputOrTextarea && !isContentEditable) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMac, setIsOpen]);

  const runCommand = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const handleSelectSession = (sessionId: string) => {
    runCommand(() => {
      setActiveSessionId(sessionId);
      const session = savedSessions.find((s) => s.id === sessionId);
      toast.success(session?.title || '已切换至该会话');
    });
  };

  const handleSelectModel = (modelId: string, modelName: string) => {
    runCommand(() => {
      if (typeof setCurrentChatSettings === 'function') {
        setCurrentChatSettings((prev) => ({ ...prev, modelId }));
      }
      toast.success(`已切换模型: ${modelName}`);
    });
  };

  const recentSessions = savedSessions.slice(0, 8);
  const activeSession = savedSessions.find((s) => s.id === activeSessionId);
  const activeModelId = activeSession?.settings?.modelId || '';

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput placeholder={`搜索会话、切换模型或输入指令 (${modKey}K / ${modKey}⇧P)...`} />
      <CommandList>
        <CommandEmpty>未找到匹配项</CommandEmpty>

        <CommandGroup heading="常用操作">
          <CommandItem
            value="new chat 新建聊天"
            onSelect={() =>
              runCommand(() => {
                if (onNewChat) onNewChat();
                else setActiveSessionId(null);
                toast.success('已新建会话');
              })
            }
          >
            <Plus className="text-[var(--theme-text-link)]" />
            <span>新建聊天</span>
            <CommandShortcut>{modKey}⇧O</CommandShortcut>
          </CommandItem>

          <CommandItem value="toggle sidebar 切换侧边栏" onSelect={() => runCommand(() => toggleHistorySidebar())}>
            <FolderKanban className="text-[var(--theme-text-secondary)]" />
            <span>展开/收起侧边栏</span>
            <CommandShortcut>{modKey}B</CommandShortcut>
          </CommandItem>

          {onOpenExportModal && (
            <CommandItem value="export chat 导出对话 markdown" onSelect={() => runCommand(onOpenExportModal)}>
              <Download className="text-[var(--theme-text-secondary)]" />
              <span>导出当前对话</span>
              <CommandShortcut>{modKey}E</CommandShortcut>
            </CommandItem>
          )}

          {onClearCurrentChat && (
            <CommandItem value="clear current chat 清空上下文" onSelect={() => runCommand(onClearCurrentChat)}>
              <Trash2 className="text-[var(--theme-icon-error)]" />
              <span>清空当前上下文</span>
              <CommandShortcut>/clear</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {recentSessions.length > 0 && (
          <>
            <CommandGroup heading="历史会话快速跳转">
              {recentSessions.map((s) => (
                <CommandItem key={s.id} value={`session ${s.title} ${s.id}`} onSelect={() => handleSelectSession(s.id)}>
                  <MessageSquare className="text-[var(--theme-text-secondary)] shrink-0" />
                  <span className="truncate flex-1">{s.title || '新会话'}</span>
                  {s.id === activeSessionId && (
                    <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)] shrink-0" />
                  )}
                  {s.isPinned && <Pin className="h-3 w-3 text-[var(--theme-text-link)] shrink-0 ml-1.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="切换 AI 模型">
          {COMMON_MODELS.map((model) => {
            const isSelected = activeModelId.includes(model.id) || activeModelId.includes(model.name.toLowerCase());
            return (
              <CommandItem
                key={model.id}
                value={`model ${model.name} ${model.provider} ${model.badge}`}
                onSelect={() => handleSelectModel(model.id, model.name)}
              >
                <Cpu className="text-[var(--theme-text-secondary)] shrink-0" />
                <span className="font-medium text-[var(--theme-text-primary)]">{model.name}</span>
                <span className="text-[11px] text-[var(--theme-text-tertiary)] ml-1.5">({model.provider})</span>
                {isSelected ? (
                  <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)] shrink-0" />
                ) : (
                  <span className="ml-auto text-[10px] text-[var(--theme-text-tertiary)] font-mono">{model.badge}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="工具与增强能力">
          <CommandItem
            value="web search online 实时联网搜索"
            onSelect={() =>
              runCommand(() => {
                toast.info('可通过输入框底栏或 /online 快捷开关联网搜索');
              })
            }
          >
            <Globe className="text-[var(--theme-text-secondary)]" />
            <span>联网搜索增强</span>
            <CommandShortcut>/online</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="deep thinking reasoning 深度思考模式"
            onSelect={() =>
              runCommand(() => {
                toast.info('可通过输入框底栏或 /deep 快捷切换深度思考');
              })
            }
          >
            <Brain className="text-[var(--theme-text-secondary)]" />
            <span>深度思考推理模式</span>
            <CommandShortcut>/deep</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="code execution python 代码执行器"
            onSelect={() =>
              runCommand(() => {
                toast.info('可通过输入框底栏或 /code 开启代码沙箱');
              })
            }
          >
            <Code2 className="text-[var(--theme-text-secondary)]" />
            <span>代码执行器 (Python 沙箱)</span>
            <CommandShortcut>/code</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="google maps location 地图定位"
            onSelect={() =>
              runCommand(() => {
                toast.info('可通过输入框底栏或 /maps 配置地理位置');
              })
            }
          >
            <MapPinned className="text-[var(--theme-text-secondary)]" />
            <span>Google 地图位置检索</span>
            <CommandShortcut>/maps</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="url context web extract 网页抓取提取"
            onSelect={() =>
              runCommand(() => {
                toast.info('可通过输入框底栏或 /url 批量抓取网页内容');
              })
            }
          >
            <LinkIcon className="text-[var(--theme-text-secondary)]" />
            <span>网页 URL 深度提取</span>
            <CommandShortcut>/url</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="系统导航与设置">
          <CommandItem
            value="open settings 打开设置"
            onSelect={() =>
              runCommand(() => {
                setIsSettingsModalOpen(true);
              })
            }
          >
            <Settings className="text-[var(--theme-text-secondary)]" />
            <span>打开设置面板</span>
            <CommandShortcut>{modKey},</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="switch to library 知识库 媒体库"
            onSelect={() =>
              runCommand(() => {
                setActiveView('library');
                toast.success('已切换至媒体库');
              })
            }
          >
            <FolderKanban className="text-[var(--theme-text-secondary)]" />
            <span>打开知识库与媒体库</span>
          </CommandItem>

          <CommandItem
            value="open log viewer 查看日志 token 统计"
            onSelect={() =>
              runCommand(() => {
                setIsLogViewerOpen(true);
              })
            }
          >
            <BarChart2 className="text-[var(--theme-text-secondary)]" />
            <span>查看 API 与 Token 统计日志</span>
            <CommandShortcut>{modKey}⌥L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

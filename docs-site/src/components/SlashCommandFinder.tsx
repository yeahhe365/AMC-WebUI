import React, { useState } from 'react';
import { Search, Command, Copy, Check } from 'lucide-react';

interface SlashItem {
  name: string;
  category: 'session' | 'tools' | 'system';
  descriptionZh: string;
  descriptionEn: string;
  shortcut?: string;
  scope: string;
}

interface SlashCommandFinderProps {
  locale?: string;
}

const COMMAND_LIST: SlashItem[] = [
  {
    name: '/model',
    category: 'session',
    descriptionZh: '快速呼出模型选择浮层，支持实时过滤与切换',
    descriptionEn: 'Open the model picker popover with quick search',
    shortcut: 'Tab',
    scope: '全局',
  },
  {
    name: '/new',
    category: 'session',
    descriptionZh: '新建空白对话会话',
    descriptionEn: 'Start a new conversation',
    shortcut: 'Cmd/Ctrl + Shift + O',
    scope: '全局',
  },
  {
    name: '/clear',
    category: 'session',
    descriptionZh: '清空当前会话全部消息记录',
    descriptionEn: 'Clear all messages in the current chat',
    scope: '当前会话',
  },
  {
    name: '/pin',
    category: 'session',
    descriptionZh: '置顶或取消置顶当前对话',
    descriptionEn: 'Pin or unpin the current conversation',
    scope: '侧边栏',
  },
  {
    name: '/edit',
    category: 'session',
    descriptionZh: '重新编辑上一条已发送的用户消息',
    descriptionEn: 'Edit the last sent user message',
    shortcut: 'Arrow Up',
    scope: '输入框',
  },
  {
    name: '/retry',
    category: 'session',
    descriptionZh: '重新发起上一轮模型生成',
    descriptionEn: 'Retry the last model generation turn',
    scope: '当前会话',
  },
  {
    name: '/deep',
    category: 'tools',
    descriptionZh: '切换 Google Deep Search 深度多步规划检索',
    descriptionEn: 'Toggle Google Deep Search multi-step planning',
    scope: 'Gemini 原生',
  },
  {
    name: '/online',
    category: 'tools',
    descriptionZh: '切换 Google 实时网络搜索 (Grounding)',
    descriptionEn: 'Toggle Google Search grounding tool',
    scope: 'Gemini 原生',
  },
  {
    name: '/maps',
    category: 'tools',
    descriptionZh: '切换 Google Maps 地理空间位置增强与检索',
    descriptionEn: 'Toggle Google Maps Grounding tool',
    scope: 'Gemini 原生',
  },
  {
    name: '/code',
    category: 'tools',
    descriptionZh: '切换云端代码执行能力 (Code Execution)',
    descriptionEn: 'Toggle server-side code execution',
    scope: 'Gemini 原生',
  },
  {
    name: '/url',
    category: 'tools',
    descriptionZh: '提取并抓取网页 URL 内容注入对话上下文',
    descriptionEn: 'Extract and inject web URL content into context',
    scope: '通用',
  },
  {
    name: '/file',
    category: 'tools',
    descriptionZh: '触发文件上传对话框 (支持图片、文档、ZIP代码库)',
    descriptionEn: 'Trigger file attachment picker dialog',
    scope: '多模态',
  },
  {
    name: '/fast',
    category: 'system',
    descriptionZh: '在低推理等级 (Low/Minimal) 与完全思考间快速切换',
    descriptionEn: 'Quickly toggle thinking level between fast and high',
    scope: 'Thinking 模型',
  },
  {
    name: '/artifacts',
    category: 'system',
    descriptionZh: '切换 Live Artifacts 交互沙箱自动生成模式',
    descriptionEn: 'Toggle Live Artifacts sandbox generation prompt',
    scope: '生成模型',
  },
  {
    name: '/pip',
    category: 'system',
    descriptionZh: '切换画中画 (Picture-in-Picture) 浮动窗口模式',
    descriptionEn: 'Toggle Picture-in-Picture floating window mode',
    shortcut: 'Cmd/Ctrl + Alt + P',
    scope: '应用视图',
  },
  {
    name: '/settings',
    category: 'system',
    descriptionZh: '打开系统配置面板',
    descriptionEn: 'Open system settings modal',
    scope: '全局',
  },
  {
    name: '/help',
    category: 'system',
    descriptionZh: '打开快捷键与功能帮助弹窗',
    descriptionEn: 'Open help and keyboard shortcuts dialog',
    scope: '全局',
  },
];

export const SlashCommandFinder: React.FC<SlashCommandFinderProps> = ({ locale = 'zh' }) => {
  const isEn = locale === 'en';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'session' | 'tools' | 'system'>('all');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopyCmd = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedCmd(name);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const filtered = COMMAND_LIST.filter((cmd) => {
    const matchesCategory = category === 'all' || cmd.category === category;
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      cmd.name.toLowerCase().includes(q) ||
      cmd.descriptionZh.toLowerCase().includes(q) ||
      cmd.descriptionEn.toLowerCase().includes(q) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q));
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="interactive-widget-box not-content" style={{ fontFamily: 'sans-serif' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Command size={18} color="#8b5cf6" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--sl-color-white)' }}>
            {isEn ? 'Slash Commands & Interactive Quick Reference' : '斜杠命令与快捷指令交互速查'}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#c4b5fd',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            }}
          >
            {filtered.length} / {COMMAND_LIST.length}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--sl-color-gray-4)' }}>
            {isEn ? 'Type ' : '输入框中输入 '}
            <code style={{ color: '#38bdf8' }}>/</code>
            {isEn ? ' to trigger' : ' 即可快速唤出'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search
            size={16}
            color="var(--sl-color-gray-4)"
            style={{ position: 'absolute', left: '10px', top: '10px' }}
          />
          <input
            type="text"
            placeholder={
              isEn
                ? 'Search commands, shortcuts or descriptions (e.g. /fast, code)...'
                : '搜索命令名称、功能或快捷键 (如 /fast, code, 搜索)...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '6px',
              border: '1px solid var(--sl-color-hairline)',
              background: 'rgba(0,0,0,0.3)',
              color: 'var(--sl-color-white)',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'all', label: isEn ? 'All' : '全部' },
            { id: 'session', label: isEn ? 'Session' : '会话管理' },
            { id: 'tools', label: isEn ? 'Tools' : '工具开关' },
            { id: 'system', label: isEn ? 'System' : '系统与模式' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id as any)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: category === item.id ? '#8b5cf6' : 'var(--sl-color-hairline)',
                background: category === item.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: category === item.id ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '10px',
          maxHeight: '380px',
          overflowY: 'auto',
        }}
      >
        {filtered.map((item) => {
          const isCopied = copiedCmd === item.name;
          return (
            <div
              key={item.name}
              style={{
                background: '#060913',
                border: '1px solid var(--sl-color-hairline)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '6px',
                transition: 'border-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCmd(item.name)}
                    title={isEn ? 'Copy command' : '复制命令'}
                    style={{
                      border: 'none',
                      background: isCopied ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                      color: isCopied ? '#4ade80' : 'var(--sl-color-gray-4)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      padding: '2px 5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '0.7rem',
                    }}
                  >
                    {isCopied ? <Check size={11} /> : <Copy size={11} />}
                    <span>{isCopied ? (isEn ? 'Copied' : '已复制') : isEn ? 'Copy' : '复制'}</span>
                  </button>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(56, 189, 248, 0.1)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  {item.scope}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--sl-color-gray-2)', lineHeight: 1.4 }}>
                {isEn ? item.descriptionEn : item.descriptionZh}
              </p>
              {item.shortcut && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--sl-color-gray-5)' }}>
                    {isEn ? 'Shortcut:' : '快捷键:'}
                  </span>
                  <kbd
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid var(--sl-color-hairline)',
                      color: 'var(--sl-color-gray-3)',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                    }}
                  >
                    {item.shortcut}
                  </kbd>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

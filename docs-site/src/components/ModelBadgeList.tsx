import React, { useState } from 'react';
import { Bot, Search, Copy, Check } from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  category: 'core' | 'live' | 'media' | 'special';
  contextWindow: string;
  features: string[];
  description: string;
  descriptionEn?: string;
  defaultBadge?: boolean;
}

interface ModelBadgeListProps {
  locale?: string;
}

const MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['深度思考 (Low~High)', '搜索与地图增强', '代码执行', 'Live Artifacts'],
    description: '全项目默认主力模型，响应迅捷，兼顾强劲的逻辑推理与日常高并发使用。',
    descriptionEn: 'Default powerhouse model. Fast responses, strong reasoning, and multimodal capabilities.',
    defaultBadge: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['极速思考 (Minimal起)', '思维链实时翻译', '极低延迟'],
    description: '轻量高效模型，作为 AMC-WebUI 内部思维链多语言实时翻译的默认辅助模型。',
    descriptionEn: 'Lightweight efficient model used for real-time thinking process translation and quick tasks.',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['高阶数理', '超大上下文', '32K Token 思考预算'],
    description: '针对深度复杂学术论文分析、大仓代码重构与前沿数理逻辑设计的高阶大模型。',
    descriptionEn: 'High-capability model with 1M context and up to 32K thinking budget for complex math and coding.',
  },
  {
    id: 'gemini-robotics-er-2-preview',
    name: 'Gemini Robotics-ER 2',
    category: 'special',
    contextWindow: '128K Tokens',
    features: ['具身空间推理', '需绑定 API 限制', '建议思考 Medium'],
    description: '具身智能与三维空间几何理解专属模型，API Key 必须在 AI Studio 配置域名/IP 限制。',
    descriptionEn: 'Embodied spatial reasoning model requiring API key domain/IP restrictions in Google AI Studio.',
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live',
    category: 'live',
    contextWindow: '128K Tokens',
    features: ['双向流式语音', '摄像头识别', '屏幕共享理解', 'AudioWorklet'],
    description: '实时音视频交互专属端点，通过 WebSocket 实现端到端极低延迟对话。',
    descriptionEn: 'Dedicated Live API endpoint for bidirectional audio/video chat with sub-second latency.',
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image (Nano Banana)',
    category: 'media',
    contextWindow: '64K Tokens',
    features: ['原生生图', '比例定制 (1:1 / 16:9)', '四图并发'],
    description: 'Gemini 原生高质量绘图模型，支持自然语言指令精准控制构图、材质与光影。',
    descriptionEn:
      'Native high-quality text-to-image model supporting custom aspect ratios and multi-image generation.',
  },
  {
    id: 'gemini-3.1-flash-tts-preview',
    name: 'Gemini 3.1 Flash TTS',
    category: 'media',
    contextWindow: '8K Tokens',
    features: ['30 种拟真音色', '语速动态微调', '多语种自然重音'],
    description: '高表现力语音合成模型，内置 Zephyr、Aoede 等 30 种角色音色。',
    descriptionEn: 'Expressive speech synthesis with 30 lifelike voices and real-time speed adjustment.',
  },
];

export const ModelBadgeList: React.FC<ModelBadgeListProps> = ({ locale = 'zh' }) => {
  const isEn = locale === 'en';
  const [filter, setFilter] = useState<'all' | 'core' | 'live' | 'media' | 'special'>('all');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filtered = MODELS.filter((m) => {
    const matchesCategory = filter === 'all' || m.category === filter;
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.features.some((f) => f.toLowerCase().includes(q));
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
          <Bot size={18} color="#8b5cf6" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--sl-color-white)' }}>
            {isEn ? 'Built-in Native Gemini Model Matrix' : 'AMC-WebUI 原生内置模型能力矩阵'}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'all', label: isEn ? 'All' : '全部' },
            { id: 'core', label: isEn ? 'Chat' : '核心对话' },
            { id: 'live', label: isEn ? 'Live Audio/Video' : '实时音视频' },
            { id: 'media', label: isEn ? 'Image & TTS' : '生图与TTS' },
            { id: 'special', label: isEn ? 'Special' : '专用端点' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id as any)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: filter === item.id ? '#8b5cf6' : 'var(--sl-color-hairline)',
                background: filter === item.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: filter === item.id ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <Search size={16} color="var(--sl-color-gray-4)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        <input
          type="text"
          placeholder={
            isEn
              ? 'Search model name, model ID, or capability tags...'
              : '搜索模型名称、ID 或能力特性 (如 flash, 思考, live)...'
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {filtered.map((model) => (
          <div
            key={model.id}
            style={{
              background: '#060913',
              border: '1px solid var(--sl-color-hairline)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: 'var(--sl-color-white)', fontSize: '0.9rem' }}>{model.name}</span>
              {model.defaultBadge && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(139, 92, 246, 0.2)',
                    color: '#c4b5fd',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    fontWeight: 600,
                  }}
                >
                  {isEn ? 'Recommended' : '默认推荐'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#38bdf8' }}>{model.id}</span>
              <button
                type="button"
                onClick={() => handleCopyId(model.id)}
                title={isEn ? 'Copy Model ID' : '复制模型 ID'}
                style={{
                  border: 'none',
                  background: copiedId === model.id ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: copiedId === model.id ? '#4ade80' : 'var(--sl-color-gray-4)',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '0.68rem',
                }}
              >
                {copiedId === model.id ? <Check size={11} /> : <Copy size={11} />}
                <span>{copiedId === model.id ? (isEn ? 'Copied' : '已复制') : isEn ? 'Copy' : '复制'}</span>
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--sl-color-gray-3)', lineHeight: 1.4 }}>
              {isEn ? model.descriptionEn || model.description : model.description}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: 'auto', paddingTop: '4px' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--sl-color-gray-2)',
                  border: '1px solid var(--sl-color-hairline)',
                }}
              >
                {model.contextWindow}
              </span>
              {model.features.map((feat) => (
                <span
                  key={feat}
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(6, 182, 212, 0.08)',
                    color: '#67e8f9',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                  }}
                >
                  {feat}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

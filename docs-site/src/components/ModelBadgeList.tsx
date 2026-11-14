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
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['默认主力', '深度思考 (LOW~XHIGH)', '65K 输出', '多模态输入'],
    description:
      '当前默认主力模型：Gemini 4 世代的快速旗舰，100 万 Token 上下文、65,536 Token 输出，支持 LOW～XHIGH 深度思考，单 Token 价格低于 Carbon / Argon。',
    descriptionEn:
      'Current default: the fast Gemini 4 flagship with 1M-token context, 65,536-token output, LOW–XHIGH thinking, and lower per-token pricing than Carbon or Argon.',
    defaultBadge: true,
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['最强推理', '最长 1M 输出', '深度思考', 'Agent 长程任务'],
    description:
      'Google 最强推理模型，面向复杂软件工程、数理科学攻坚与自主多步 Agent；100 万 Token 上下文，解码上限同为 100 万 Token。',
    descriptionEn:
      "Google's most capable reasoning model for complex software engineering, math/science, and autonomous agents, with a shared 1M-token context and long decodes up to 1M tokens.",
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['旗舰推理', '最长 1M 输出', '深度思考', 'Live Artifacts'],
    description: '高效旗舰推理模型，响应更快、单轮 Token 消耗更低，100 万 Token 上下文与最长 100 万 Token 解码。',
    descriptionEn:
      'Efficient frontier reasoning model with faster responses and lower token spend per turn, plus 1M-token context and long decodes.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['上一代主力', '深度思考 (LOW~HIGH)', '65K 输出', '需手动添加'],
    description:
      '上一代主力模型：仍可正常调用（连接测试中也能选到），但已不再内置到默认选择框，需要时请在设置 → 模型列表中手动添加。',
    descriptionEn:
      'Previous-generation workhorse. Still callable (and still offered for connection tests), but no longer shipped in the default picker — add it under Settings → model list.',
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
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    category: 'core',
    contextWindow: '1M Tokens',
    features: ['上一代主力', 'Stable 无下线日期', '65K 输出'],
    description: '上一代主力 Flash 模型，官方标注 Stable 且未公布下线日期；适合需要固定模型 ID 的生产负载。',
    descriptionEn:
      'Previous-generation Flash model marked Stable with no shutdown date announced, for workloads that need a fixed model id.',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
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
    id: 'gemini-3.8-live',
    name: 'Gemini 3.8 Live',
    category: 'live',
    contextWindow: '128K Tokens',
    features: ['双向流式语音', '摄像头识别', '屏幕共享理解', 'AudioWorklet'],
    description: '实时音视频交互专属端点，通过 WebSocket 实现端到端极低延迟对话。',
    descriptionEn: 'Dedicated Live API endpoint for bidirectional audio/video chat with sub-second latency.',
  },
  {
    id: 'gemini-3.8-live-extended-thinking',
    name: 'Gemini 3.8 Live Extended Thinking',
    category: 'live',
    contextWindow: '128K Tokens',
    features: ['双向流式语音', '深度推理', '更长思考链'],
    description: '实时音视频交互的深度推理变体，在保持低延迟对话的同时启用更长的思考过程。',
    descriptionEn:
      'Extended-thinking variant of the Live endpoint, enabling longer reasoning chains during real-time conversation.',
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1',
    category: 'media',
    contextWindow: '128K Tokens',
    features: ['原生生图', '1K / 2K / 4K', '14 种画面比例', '搜索增强 (Web + Image)'],
    description: '最新原生图像模型，输入支持文本、图片、视频与 PDF，思考等级 Minimal / Medium / High。',
    descriptionEn:
      'Newest native image model, accepting text, image, video and PDF input with Minimal, Medium or High thinking.',
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Nano Banana Pro',
    category: 'media',
    contextWindow: '64K Tokens',
    features: ['原生生图', '比例定制 (1:1 / 16:9)', '四图并发', '仅图片输入'],
    description: 'Gemini 原生高质量绘图模型，支持自然语言指令精准控制构图、材质与光影。',
    descriptionEn:
      'Native high-quality text-to-image model supporting custom aspect ratios and multi-image generation.',
  },
  {
    id: 'gemini-3.8-flash-tts',
    name: 'Gemini 3.8 Flash TTS',
    category: 'media',
    contextWindow: '8K Tokens',
    features: ['30 种拟真音色', '语速动态微调', '多语种自然重音'],
    description: '高表现力语音合成模型，内置 Zephyr、Aoede 等 30 种角色音色。',
    descriptionEn: 'Expressive speech synthesis with 30 lifelike voices and real-time speed adjustment.',
  },
  {
    id: 'gemini-3.8-flash-lite-tts',
    name: 'Gemini 3.8 Flash-Lite TTS',
    category: 'media',
    contextWindow: '8K Tokens',
    features: ['轻量语音合成', '30 种音色', '更低成本'],
    description: '语音合成的轻量档，音色库与标准档一致，面向高频朗读与批量合成。',
    descriptionEn: 'Lighter speech synthesis tier with the same 30-voice palette, built for high-volume readout.',
  },
  {
    id: 'gemini-3.5-live-translate-preview',
    name: 'Gemini 3.5 Live Translate',
    category: 'live',
    contextWindow: '128K Tokens',
    features: ['实时语音翻译', '双向低延迟', '多语种同传'],
    description: '实时语音翻译预览端点，面向跨语言同声传译场景。',
    descriptionEn: 'Preview live endpoint for real-time bidirectional speech translation.',
  },
  {
    id: 'gemma-4-31b-it',
    name: 'Gemma 4 31B IT',
    category: 'core',
    contextWindow: '256K Tokens',
    features: ['开源权重', '指令微调', '本地化友好'],
    description: 'Gemma 4 系列大参数开源指令模型，适合成本敏感与私有化场景。',
    descriptionEn: 'Large open-weights instruction-tuned Gemma 4 model for cost-sensitive and private use.',
  },
  {
    id: 'gemma-4-26b-a4b-it',
    name: 'Gemma 4 26B A4B IT',
    category: 'core',
    contextWindow: '256K Tokens',
    features: ['MoE 稀疏激活', '高吞吐', '指令微调'],
    description: 'Gemma 4 系列 MoE 稀疏激活指令模型，兼顾吞吐与效果。',
    descriptionEn: 'MoE sparse-activation instruction-tuned Gemma 4 model balancing throughput and quality.',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Nano Banana 2 Lite',
    category: 'media',
    contextWindow: '64K Tokens',
    features: ['轻量生图', '低成本', '快速出图'],
    description: '轻量级原生图像生成模型，面向高性价比批量出图。',
    descriptionEn: 'Lightweight native image generation model for high-volume, cost-efficient output.',
  },
  {
    id: 'gemini-3.5-transcribe',
    name: 'Gemini 3.5 Transcribe',
    category: 'media',
    contextWindow: '32K Tokens',
    features: ['音频转写', '长音频支持', '多语种识别'],
    description: '默认音频转写模型，支持超长音频的高精度多语种转写。',
    descriptionEn: 'Default audio transcription model with long-audio support and multilingual recognition.',
  },
  {
    id: 'gemini-3.5-transcribe-live',
    name: 'Gemini 3.5 Transcribe Live',
    category: 'live',
    contextWindow: '32K Tokens',
    features: ['实时转写', '流式输入', '低延迟'],
    description: '实时音频流式转写模型，适用于会议与直播字幕场景。',
    descriptionEn: 'Real-time streaming audio transcription model for meetings and live captions.',
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

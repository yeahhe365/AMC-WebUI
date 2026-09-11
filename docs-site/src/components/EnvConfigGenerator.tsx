import React, { useState } from 'react';
import { Copy, Check, Terminal, Download } from 'lucide-react';

interface EnvConfigGeneratorProps {
  locale?: string;
}

export const EnvConfigGenerator: React.FC<EnvConfigGeneratorProps> = ({ locale = 'zh' }) => {
  const isEn = locale === 'en';
  const [deployMode, setDeployMode] = useState<'docker' | 'static'>('docker');
  const [keyMode, setKeyMode] = useState<'byok' | 'server'>('byok');
  const [enableLiveProxy, setEnableLiveProxy] = useState(true);
  const [enableMcpStdio, setEnableMcpStdio] = useState(false);
  const [enableThirdParty, setEnableThirdParty] = useState(true);
  const [port, setPort] = useState('8080');
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const generateConfig = () => {
    if (deployMode === 'static') {
      return `# Cloudflare Pages / 静态前端环境配置 (.env.production)
VITE_DEFAULT_LOCALE=zh-CN
# 静态部署下，前端直连 Google 官方 Gemini 与 Live 服务 (纯 BYOK 模式)
# 如需指定自定义代理网关，可解注并填写：
# RUNTIME_API_PROXY_URL=https://your-api.example.com/api/gemini
`;
    }

    const lines: string[] = [
      '# AMC-WebUI Docker 容器环境变量配置 (.env)',
      '# 端口映射设置',
      `WEB_PORT=${port || '8080'}`,
      'PORT=3001',
      '',
      '# 密钥与安全配置',
    ];

    if (keyMode === 'byok') {
      lines.push(
        '# 默认 BYOK 模式：浏览器设置中的 API Key 优先生效，以下服务端 Key 留空作为安全兜底',
        'GEMINI_API_KEY=',
        'SERVER_KEY_PRIORITY=false',
      );
    } else {
      lines.push(
        '# 服务端托管模式：所有未填写 Key 的客户端自动共享此服务端密钥',
        'GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere',
        'SERVER_KEY_PRIORITY=true',
        'RUNTIME_SERVER_MANAGED_API=true',
      );
    }

    lines.push(
      '',
      '# Gemini 上游地址',
      'GEMINI_API_BASE=https://generativelanguage.googleapis.com',
      'RUNTIME_API_PROXY_URL=/api/gemini',
    );

    if (enableLiveProxy) {
      lines.push(
        '',
        '# Live API WebSocket 全代理设置',
        'ENABLE_LIVE_WS_PROXY=true',
        'RUNTIME_LIVE_API_BASE_URL=/api/live',
        'LIVE_WS_IDLE_TIMEOUT_MS=300000',
      );
    } else {
      lines.push(
        '',
        '# Live API 浏览器直连官方端点 (无需代理)',
        'ENABLE_LIVE_WS_PROXY=false',
        'RUNTIME_LIVE_API_BASE_URL=',
      );
    }

    if (enableThirdParty) {
      lines.push('', '# 第三方 OpenAI 兼容端点反代', 'RUNTIME_THIRD_PARTY_PROXY_URL=/api/openai');
    }

    if (enableMcpStdio) {
      lines.push(
        '',
        '# MCP (Model Context Protocol) 高级能力',
        '# 警告：仅在可信私有环境中开启 stdio 本地进程调用',
        'ENABLE_MCP_STDIO=true',
        'ENABLE_MCP_PRIVATE_HTTP=false',
      );
    }

    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateConfig());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = generateConfig();
    const filename = deployMode === 'static' ? '.env.production' : '.env';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  return (
    <div className="interactive-widget-box not-content" style={{ fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Terminal size={20} color="#8b5cf6" />
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--sl-color-white)' }}>
          {isEn ? 'Interactive Environment Config Generator' : '交互式部署环境变量生成器'}
        </h3>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <label
            style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sl-color-gray-3)', marginBottom: '6px' }}
          >
            部署模式
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setDeployMode('docker')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: deployMode === 'docker' ? '#8b5cf6' : 'var(--sl-color-hairline)',
                background: deployMode === 'docker' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: deployMode === 'docker' ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Docker 双容器
            </button>
            <button
              type="button"
              onClick={() => setDeployMode('static')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: deployMode === 'static' ? '#8b5cf6' : 'var(--sl-color-hairline)',
                background: deployMode === 'static' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: deployMode === 'static' ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Cloudflare Pages
            </button>
          </div>
        </div>

        {deployMode === 'docker' && (
          <>
            <div>
              <label
                style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sl-color-gray-3)', marginBottom: '6px' }}
              >
                Key 管理模式
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setKeyMode('byok')}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: keyMode === 'byok' ? '#8b5cf6' : 'var(--sl-color-hairline)',
                    background: keyMode === 'byok' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                    color: keyMode === 'byok' ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  BYOK 自带 Key
                </button>
                <button
                  type="button"
                  onClick={() => setKeyMode('server')}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: keyMode === 'server' ? '#8b5cf6' : 'var(--sl-color-hairline)',
                    background: keyMode === 'server' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                    color: keyMode === 'server' ? '#c4b5fd' : 'var(--sl-color-gray-3)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  服务端托管
                </button>
              </div>
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '0.85rem', color: 'var(--sl-color-gray-3)', marginBottom: '6px' }}
              >
                访问端口 (WEB_PORT)
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--sl-color-hairline)',
                  background: 'rgba(0,0,0,0.3)',
                  color: 'var(--sl-color-white)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </>
        )}
      </div>

      {deployMode === 'docker' && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '16px',
            fontSize: '0.85rem',
            color: 'var(--sl-color-gray-2)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableLiveProxy} onChange={(e) => setEnableLiveProxy(e.target.checked)} />
            开启 Live WS 代理 (/api/live)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableThirdParty} onChange={(e) => setEnableThirdParty(e.target.checked)} />
            开启第三方兼容反代 (/api/openai)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={enableMcpStdio} onChange={(e) => setEnableMcpStdio(e.target.checked)} />
            开启 MCP stdio 进程支持
          </label>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <pre
          style={{
            margin: 0,
            padding: '1rem',
            borderRadius: '8px',
            background: '#040711',
            border: '1px solid var(--sl-color-hairline)',
            fontSize: '0.85rem',
            overflowX: 'auto',
            color: '#e2e8f0',
            lineHeight: 1.5,
          }}
        >
          <code>{generateConfig()}</code>
        </pre>
        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--sl-color-hairline)',
              background: 'rgba(255,255,255,0.08)',
              color: downloaded ? '#4ade80' : 'var(--sl-color-gray-2)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {downloaded ? <Check size={14} /> : <Download size={14} />}
            {downloaded
              ? isEn
                ? 'Downloaded'
                : '已下载'
              : isEn
                ? `Save ${deployMode === 'static' ? '.env.production' : '.env'}`
                : `下载 ${deployMode === 'static' ? '.env.production' : '.env'}`}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--sl-color-hairline)',
              background: 'rgba(255,255,255,0.08)',
              color: copied ? '#4ade80' : 'var(--sl-color-gray-2)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? (isEn ? 'Copied' : '已复制') : isEn ? 'Copy' : '复制配置'}
          </button>
        </div>
      </div>
    </div>
  );
};

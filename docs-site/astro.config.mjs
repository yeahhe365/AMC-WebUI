import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://all-model-chat-docs.pages.dev',
  integrations: [
    starlight({
      title: 'AMC WebUI',
      favicon: '/favicon.png',
      logo: {
        light: './src/assets/app-logo.png',
        dark: './src/assets/app-logo-dark.png',
        replacesTitle: true,
      },
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
        en: {
          label: 'English',
          lang: 'en',
        },
      },
      social: {
        github: 'https://github.com/yeahhe365/AMC-WebUI',
      },
      lastUpdated: true,
      editLink: {
        baseUrl: 'https://github.com/yeahhe365/AMC-WebUI/edit/main/docs-site/',
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'keywords',
            content:
              'AMC WebUI, Google Gemini, Thinking Model, Live API, Local-First, Model Context Protocol, Pyodide, Artifacts',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:site_name',
            content: 'AMC WebUI Documentation',
          },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: '🚀 快速上手',
          translations: { en: '🚀 Getting Started' },
          items: [
            { label: '项目简介', slug: 'getting-started/introduction', translations: { en: 'Introduction' } },
            { label: '快速启动', slug: 'getting-started/quickstart', translations: { en: 'Quickstart' } },
            {
              label: '服务商与 API 配置',
              slug: 'getting-started/api-configuration',
              translations: { en: 'API Configuration' },
            },
            { label: 'PWA 与多端体验', slug: 'getting-started/pwa', translations: { en: 'PWA & Desktop' } },
          ],
        },
        {
          label: '🧠 模型与深度推理',
          translations: { en: '🧠 Models & Reasoning' },
          items: [
            { label: '内置模型矩阵', slug: 'models/model-matrix', translations: { en: 'Model Matrix' } },
            { label: '深度思考 (Thinking)', slug: 'models/thinking', translations: { en: 'Thinking Mode' } },
            { label: '实时音视频 (Live API)', slug: 'models/live-api', translations: { en: 'Live API' } },
            { label: '第三方兼容模型', slug: 'models/openai-compatible', translations: { en: 'OpenAI-Compatible' } },
          ],
        },
        {
          label: '🛠️ 生产力工具箱',
          translations: { en: '🛠️ Productivity Tools' },
          items: [
            {
              label: '联网检索 (Search & Maps)',
              slug: 'tools/web-search-maps',
              translations: { en: 'Search & Maps Grounding' },
            },
            {
              label: '代码执行与本地沙箱',
              slug: 'tools/code-and-sandbox',
              translations: { en: 'Code & Python Sandbox' },
            },
            { label: 'Live Artifacts 构件', slug: 'tools/live-artifacts', translations: { en: 'Live Artifacts' } },
            { label: '高级文件与多模态', slug: 'tools/files-multimodal', translations: { en: 'Files & Multimodal' } },
            { label: 'MCP 协议生态', slug: 'tools/mcp', translations: { en: 'Model Context Protocol' } },
          ],
        },
        {
          label: '⚡ 极客高效操作',
          translations: { en: '⚡ Power User Guide' },
          items: [
            { label: '斜杠命令速查', slug: 'power-user/slash-commands', translations: { en: 'Slash Commands' } },
            { label: '快捷键与快速切换', slug: 'power-user/shortcuts', translations: { en: 'Shortcuts & Gestures' } },
            { label: '语音合成与转写', slug: 'power-user/tts-transcribe', translations: { en: 'TTS & Transcribe' } },
            {
              label: '会话与数据管理',
              slug: 'power-user/data-management',
              translations: { en: 'Data & Session Management' },
            },
          ],
        },
        {
          label: '🚢 架构与私有化部署',
          translations: { en: '🚢 Deployment & Architecture' },
          items: [
            {
              label: '架构原理与 Local-First',
              slug: 'deployment/architecture',
              translations: { en: 'Architecture & Local-First' },
            },
            { label: 'Docker Compose 双容器部署', slug: 'deployment/docker', translations: { en: 'Docker Compose' } },
            {
              label: '静态托管 + 独立 API',
              slug: 'deployment/static-and-api',
              translations: { en: 'Static Hosting + API' },
            },
            {
              label: '环境变量与安全边界',
              slug: 'deployment/environment-variables',
              translations: { en: 'Env & Security' },
            },
            {
              label: '精确计费与开发者日志',
              slug: 'deployment/pricing-and-logs',
              translations: { en: 'Pricing & Logs' },
            },
          ],
        },
        {
          label: '❓ 常见问题与排错',
          translations: { en: '❓ FAQ & Troubleshooting' },
          items: [
            { label: '典型报错排查', slug: 'faq/common-errors', translations: { en: 'Common Errors' } },
            { label: '网络与代理排查', slug: 'faq/network-and-proxy', translations: { en: 'Network & Proxy' } },
            { label: '缓存维护与数据迁移', slug: 'faq/storage-and-reset', translations: { en: 'Storage & Reset' } },
          ],
        },
      ],
    }),
    react(),
  ],
});

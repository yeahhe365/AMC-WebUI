import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelDetailCard } from './ModelDetailCard';
import type { ModelOption } from '@/types';
import { I18nProvider } from '@/contexts/I18nContext';
import { useSettingsStore } from '@/stores/settingsStore';

describe('ModelDetailCard', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'en' });
  });

  it('renders model details, specs, and capabilities for Gemini 3.1 Pro in English', () => {
    const model: ModelOption = {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro Preview',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText('Gemini 3.1 Pro Preview')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.1-pro-preview')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText(/1M/)).toBeInTheDocument();
    expect(screen.getByText('Thinking Level')).toBeInTheDocument();
    expect(screen.getByText('Low ~ High (Default High)')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Google flagship frontier model designed for high-complexity reasoning, advanced code synthesis, and multimodal problem solving.',
      ),
    ).toBeInTheDocument();
  });

  it('renders localized model description and thinking level in Chinese', () => {
    useSettingsStore.setState({ language: 'zh' });

    const model: ModelOption = {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro Preview',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText('思考等级')).toBeInTheDocument();
    expect(screen.getByText('低 ~ 高 (默认 高)')).toBeInTheDocument();
    expect(
      screen.getByText('Google 旗舰前沿模型，专为高复杂度深度推理、复杂代码工程与多模态攻坚任务打造。'),
    ).toBeInTheDocument();
  });

  it('renders Thinking Level for Gemini 3.8 Flash', () => {
    const model: ModelOption = {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText('Gemini 3.8 Flash')).toBeInTheDocument();
    expect(screen.getByText('Thinking Level')).toBeInTheDocument();
    expect(screen.getByText('Low ~ High (Default Medium)')).toBeInTheDocument();
  });

  it('does not render thinking section for Gemini 3.1 Flash TTS', () => {
    const model: ModelOption = {
      id: 'gemini-3.1-flash-tts-preview',
      name: 'Gemini 3.1 Flash TTS',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.queryByText(/思考预算|Thinking Budget/)).not.toBeInTheDocument();
    expect(screen.queryByText(/思考等级|Thinking Level/)).not.toBeInTheDocument();
  });

  it('renders Thinking Budget for Claude 3.7 Sonnet', () => {
    const model: ModelOption = {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      templateId: 'anthropic',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText(/思考预算|Thinking Budget/)).toBeInTheDocument();
    expect(screen.getByText('1,024 ~ 64,000')).toBeInTheDocument();
  });

  it('renders capabilities badges', () => {
    const model: ModelOption = {
      id: 'deepseek-reasoner',
      name: 'DeepSeek R1',
      templateId: 'deepseek',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText('DeepSeek R1')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('renders input modalities and capabilities separately for multimodal models', () => {
    useSettingsStore.setState({ language: 'zh' });

    const model: ModelOption = {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
    };

    render(
      <I18nProvider>
        <ModelDetailCard model={model} />
      </I18nProvider>,
    );

    expect(screen.getByText('输入模态')).toBeInTheDocument();
    expect(screen.getByText('视觉')).toBeInTheDocument();
    expect(screen.getByText('音频')).toBeInTheDocument();
    expect(screen.getByText('视频')).toBeInTheDocument();

    expect(screen.getByText('支持能力')).toBeInTheDocument();
    expect(screen.getByText('深度思考')).toBeInTheDocument();
    expect(screen.getByText('工具调用')).toBeInTheDocument();
    expect(screen.getByText('PDF 解析')).toBeInTheDocument();
  });
});

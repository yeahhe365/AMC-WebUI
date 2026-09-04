import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  createBasicMarkdownRendererElement,
  renderBasicMarkdown,
  type BasicMarkdownRendererTestProps,
} from '@/test/message/basicMarkdownRenderer';

describe('BasicMarkdownRenderer Live Artifacts', () => {
  const renderer = setupTestRenderer();
  const renderMarkdown = (props: BasicMarkdownRendererTestProps) => renderBasicMarkdown(renderer.root, props);

  it('renders standalone multiline raw html fragments without accidental code blocks', () => {
    renderMarkdown({
      content: `<div style="padding:24px;background:#f8f9fa">
  <section style="background:white">
    <p>Transformer summary</p>
  </section>

  <!-- 三大核心特性 -->
  <div style="display:grid">
    <strong>Self-Attention</strong>
  </div>
</div>`,
      allowHtml: true,
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('Self-Attention');
    expect(renderer.container.querySelector('div[style*="display"] strong')).toBeNull();
  });

  it('renders streaming raw html fragments inside stable artifact frames before they close', () => {
    renderMarkdown({
      content: `<div style="padding:24px;background:#f8f9fa">
    <section style="background:white">
        <p>Transformer summary</p>
    </section>

    <!-- 三大核心特性 -->
    <div style="display:grid">
        <strong>Self-Attention</strong>`,
      isLoading: true,
      allowHtml: true,
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('data-amc-stream-preview-root');
    expect(iframe?.getAttribute('srcdoc')).not.toContain('Self-Attention');
    expect(renderer.container.querySelector('div[style*="display"] strong')).toBeNull();
  });

  it('renders streaming full html documents inside artifact frames before they close', () => {
    const partialDocument = '<!DOCTYPE html><html><head><title>Live</title></head><body><main>Loading';

    renderMarkdown({ content: partialDocument, isLoading: true, allowHtml: true });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('data-amc-stream-preview-root');
    expect(iframe?.getAttribute('srcdoc')).not.toContain('<main>Loading');
  });

  it('shows a stable pending frame for streaming interaction JSON before it parses', () => {
    renderMarkdown({
      content: '```amc-live-artifact-interaction\n{"instruction":"Collect","schema":{',
      isLoading: true,
      allowHtml: true,
    });

    expect(renderer.container.querySelector('[data-live-artifact-interaction-pending="true"]')).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
  });

  it('hides markdown preview affordances when interactive mode is disabled', () => {
    renderMarkdown({
      content: '```html\n<html><body>Hello</body></html>\n```',
      interactiveMode: 'disabled',
    });

    expect(renderer.container.querySelector('[title="Open in Side Panel"]')).toBeNull();
    expect(renderer.container.querySelector('[title="codeFullscreenMonitor"]')).toBeNull();
    expect(renderer.container.querySelector('[title="codeFullscreenModal"]')).toBeNull();
  });

  it('keeps explicit html code blocks in code block chrome instead of artifact frames', () => {
    const document =
      '<!DOCTYPE html><html><head><title>Demo Artifact</title></head><body><main>Hello</main></body></html>';

    renderMarkdown({ content: `\`\`\`html\n${document}\n\`\`\`` });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).toBeNull();
    expect(iframe).toBeNull();
    expect(renderer.container.querySelector('pre')).not.toBeNull();
    expect(renderer.container.querySelector('[data-code-header-toolbar]')).not.toBeNull();
    expect(renderer.container.textContent).toContain('Demo Artifact');
  });

  it('renders fenced Live Artifacts that include style tags inside artifact frames', () => {
    const fragment = '<section><style>.card{color:red}</style><div class="card">Styled Live Artifact</div></section>';

    renderMarkdown({
      content: `\`\`\`amc-live-artifact-html\n${fragment}\n\`\`\``,
      allowHtml: true,
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('Styled Live Artifact');
    expect(iframe?.getAttribute('srcdoc')).toContain('.card{color:red}');
  });

  it('skips syntax highlighting while content is still streaming', () => {
    renderMarkdown({ content: '```js\nconst value = 1;\n```', isLoading: true });

    expect(renderer.container.querySelector('.hljs-keyword')).toBeNull();
  });

  it('restores syntax highlighting when streaming is complete', () => {
    renderMarkdown({ content: '```js\nconst value = 1;\n```', isLoading: false });

    expect(renderer.container.querySelector('.hljs-keyword')).not.toBeNull();
  });

  it('renders standalone raw html fragments inside artifact frames instead of the message dom', () => {
    renderMarkdown({
      content: '<section style="display:grid"><strong>Inline Artifact</strong></section>',
      allowHtml: true,
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(renderer.container.querySelector('[data-live-artifact-frame="true"]')).not.toBeNull();
    expect(iframe?.getAttribute('srcdoc')).toContain('Inline Artifact');
    expect(renderer.container.querySelector('section[style*="display"]')).toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();
  });

  it('passes the configured Live Artifacts font size into artifact frames', () => {
    renderMarkdown({
      content: '<section style="display:grid"><strong>Inline Artifact</strong></section>',
      allowHtml: true,
      liveArtifactFontSize: 21,
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');

    expect(iframe?.getAttribute('srcdoc')).toContain('--amc-live-artifact-font-size:21px');
  });

  it('passes the current app theme into artifact frames as transparent theme tokens', () => {
    renderMarkdown({
      content: '<section style="display:grid"><strong>Inline Artifact</strong></section>',
      allowHtml: true,
      themeId: 'onyx',
    });

    const iframe = renderer.container.querySelector('iframe[title="HTML Preview"]');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(srcDoc).toContain('data-amc-live-artifact-theme="true"');
    expect(srcDoc).toContain(
      'html,body{margin:0;padding:0;height:auto!important;min-height:0!important;max-height:none!important;background:transparent',
    );
    expect(srcDoc).toContain('--amc-live-artifact-text:#f5f5f7');
    expect(srcDoc).toContain('--amc-live-artifact-surface:#1c1c20');
  });

  it('does not show code-block chrome over Live Artifact frames', () => {
    renderMarkdown({
      content: '<section style="display:grid"><strong>Inline Artifact</strong></section>',
      allowHtml: true,
    });

    const artifactFrame = renderer.container.querySelector('[data-live-artifact-frame="true"]');

    expect(artifactFrame).not.toBeNull();
    expect(artifactFrame?.querySelector('iframe[title="HTML Preview"]')).not.toBeNull();
    expect(artifactFrame?.querySelector('[title="Open in Side Panel"]')).toBeNull();
    expect(artifactFrame?.querySelector('[title="Copy content"]')).toBeNull();
    expect(artifactFrame?.querySelector('button[title="Open larger preview"]')).not.toBeNull();
  });

  it('forwards valid Live Artifact follow-up payloads from the current iframe only', () => {
    const handleFollowUp = vi.fn();

    renderMarkdown({
      content:
        '<section><button data-amc-followup="{&quot;instruction&quot;:&quot;Continue&quot;}">Continue</button></section>',
      onLiveArtifactFollowUp: handleFollowUp,
      allowHtml: true,
    });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');
    expect(iframe).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: 'amc-webui-html-preview',
            event: 'followup',
            payload: { instruction: 'Continue', state: { selected: 'B' } },
          },
          source: window,
        }),
      );
    });

    expect(handleFollowUp).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: 'amc-webui-html-preview',
            event: 'followup',
            payload: { instruction: 'Continue', state: { selected: 'B' } },
          },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(handleFollowUp).toHaveBeenCalledWith({ instruction: 'Continue', state: { selected: 'B' } });
  });

  it('renders schema-driven Live Artifact interaction forms and sends structured state', () => {
    const handleFollowUp = vi.fn();
    const interaction = {
      version: 1,
      title: '论文写作参数',
      instruction: '根据这些论文参数继续写作。',
      submitLabel: '开始写作',
      schema: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: {
            type: 'string',
            title: '论文主题',
            description: '用一句话说明你想写什么。',
          },
          citationStyle: {
            type: 'string',
            title: '引用格式',
            enum: ['APA', 'MLA', 'GB/T 7714'],
            default: 'APA',
          },
          includeOutline: {
            type: 'boolean',
            title: '先生成大纲',
            default: true,
          },
          wordCount: {
            type: 'number',
            title: '目标字数',
            default: 2000,
          },
          notes: {
            type: 'string',
            title: '补充要求',
            format: 'textarea',
          },
        },
      },
    };

    renderMarkdown({
      content: `\`\`\`amc-live-artifact-interaction\n${JSON.stringify(interaction, null, 2)}\n\`\`\``,
      onLiveArtifactFollowUp: handleFollowUp,
      allowHtml: true,
    });

    const form = renderer.container.querySelector<HTMLFormElement>('[data-live-artifact-interaction="true"]');
    expect(form).not.toBeNull();
    expect(renderer.container.querySelector('pre')).toBeNull();

    const topicInput = renderer.container.querySelector<HTMLInputElement>('input[name="topic"]');
    const citationSelect = renderer.container.querySelector<HTMLSelectElement>('select[name="citationStyle"]');
    const outlineInput = renderer.container.querySelector<HTMLInputElement>('input[name="includeOutline"]');
    const wordCountInput = renderer.container.querySelector<HTMLInputElement>('input[name="wordCount"]');
    const notesInput = renderer.container.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');

    expect(topicInput).not.toBeNull();
    expect(citationSelect?.value).toBe('APA');
    expect(outlineInput?.checked).toBe(true);
    expect(wordCountInput?.value).toBe('2000');

    fireEvent.change(topicInput!, { target: { value: '人工智能辅助学术写作的伦理边界' } });
    fireEvent.change(citationSelect!, { target: { value: 'MLA' } });
    fireEvent.change(wordCountInput!, { target: { value: '2400' } });
    fireEvent.change(notesInput!, { target: { value: '需要包含反方观点和案例分析。' } });
    fireEvent.submit(form!);

    expect(handleFollowUp).toHaveBeenCalledWith({
      instruction: '根据这些论文参数继续写作。',
      title: '论文写作参数',
      source: 'amc-live-artifact-interaction:v1',
      state: {
        topic: '人工智能辅助学术写作的伦理边界',
        citationStyle: 'MLA',
        includeOutline: true,
        wordCount: 2400,
        notes: '需要包含反方观点和案例分析。',
      },
    });
  });

  it('resets schema-driven interaction form state when the artifact spec changes', () => {
    const handleFollowUp = vi.fn();
    const firstInteraction = {
      version: 1,
      title: 'First form',
      instruction: 'Continue from first form.',
      schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', title: 'Topic', default: 'Initial topic' },
        },
      },
    };
    const secondInteraction = {
      version: 1,
      title: 'Second form',
      instruction: 'Continue from second form.',
      schema: {
        type: 'object',
        properties: {
          audience: { type: 'string', title: 'Audience', default: 'Review team' },
        },
      },
    };
    const renderInteraction = (interaction: object) => {
      renderer.root.render(
        createBasicMarkdownRendererElement({
          content: `\`\`\`amc-live-artifact-interaction\n${JSON.stringify(interaction, null, 2)}\n\`\`\``,
          onLiveArtifactFollowUp: handleFollowUp,
          allowHtml: true,
        }),
      );
    };

    act(() => {
      renderInteraction(firstInteraction);
    });

    const topicInput = renderer.container.querySelector<HTMLInputElement>('input[name="topic"]');
    fireEvent.change(topicInput!, { target: { value: 'Changed topic' } });

    act(() => {
      renderInteraction(secondInteraction);
    });

    expect(renderer.container.querySelector('input[name="topic"]')).toBeNull();
    expect(renderer.container.querySelector<HTMLInputElement>('input[name="audience"]')?.value).toBe('Review team');

    fireEvent.submit(renderer.container.querySelector<HTMLFormElement>('[data-live-artifact-interaction="true"]')!);

    expect(handleFollowUp).toHaveBeenCalledWith({
      instruction: 'Continue from second form.',
      title: 'Second form',
      source: 'amc-live-artifact-interaction:v1',
      state: { audience: 'Review team' },
    });
  });

  it('keeps schema-driven interaction artifacts as inert code when interactive mode is disabled', () => {
    const interaction = {
      version: 1,
      instruction: 'Collect choices.',
      schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', title: 'Topic' },
        },
      },
    };

    renderMarkdown({
      content: `\`\`\`amc-live-artifact-interaction\n${JSON.stringify(interaction, null, 2)}\n\`\`\``,
      onLiveArtifactFollowUp: vi.fn(),
      allowHtml: true,
      interactiveMode: 'disabled',
    });

    expect(renderer.container.querySelector('[data-live-artifact-interaction="true"]')).toBeNull();
    expect(renderer.container.querySelector('pre')).not.toBeNull();
  });

  it('localizes schema-driven interaction defaults and validation messages', () => {
    useSettingsStore.setState({ language: 'zh' });
    const interaction = {
      version: 1,
      instruction: '根据填写内容继续。',
      schema: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', title: '主题' },
        },
      },
    };

    try {
      renderMarkdown({
        content: `\`\`\`amc-live-artifact-interaction\n${JSON.stringify(interaction, null, 2)}\n\`\`\``,
        onLiveArtifactFollowUp: vi.fn(),
        allowHtml: true,
      });

      expect(renderer.container.querySelector('button[type="submit"]')?.textContent).toContain('继续');

      fireEvent.submit(renderer.container.querySelector<HTMLFormElement>('[data-live-artifact-interaction="true"]')!);

      expect(renderer.container.textContent).toContain('此字段为必填项。');
      expect(renderer.container.textContent).not.toContain('This field is required.');
    } finally {
      useSettingsStore.setState({ language: 'en' });
    }
  });

  it('resizes artifact frames from the iframe bridge height message without capping into internal scroll', () => {
    const document = '<!DOCTYPE html><html><body><main style="height:512px">Tall</main></body></html>';

    renderMarkdown({ content: document });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');
    const viewport = renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]');

    expect(iframe).not.toBeNull();
    expect(viewport).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'amc-webui-html-preview', event: 'resize', height: 960 },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(viewport?.style.height).toBe('960px');
    expect(iframe?.getAttribute('scrolling')).toBe('no');
  });

  it('preserves measured artifact height when the same message remounts during list scrolling', () => {
    const document = '<!DOCTYPE html><html><body><main style="height:960px">Stable</main></body></html>';
    const renderArtifact = () =>
      createBasicMarkdownRendererElement({
        content: document,
        messageId: 'artifact-message-1',
      });

    act(() => {
      renderer.root.render(renderArtifact());
    });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'amc-webui-html-preview', event: 'resize', height: 960 },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '960px',
    );

    act(() => {
      renderer.root.unmount();
    });

    act(() => {
      renderer.root.render(renderArtifact());
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '960px',
    );
  });

  it('resets artifact frame height when the html content changes in place', () => {
    const firstDocument = '<!DOCTYPE html><html><body><main>First</main></body></html>';
    const secondDocument = '<!DOCTYPE html><html><body><main>Second</main></body></html>';
    const renderArtifact = (document: string) =>
      createBasicMarkdownRendererElement({
        content: document,
      });

    act(() => {
      renderer.root.render(renderArtifact(firstDocument));
    });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'amc-webui-html-preview', event: 'resize', height: 960 },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '960px',
    );

    act(() => {
      renderer.root.render(renderArtifact(secondDocument));
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '320px',
    );
  });

  it('preserves artifact frame height while the same message streams new html content', () => {
    const firstDocument = '<!DOCTYPE html><html><body><main>Streaming first</main></body></html>';
    const secondDocument =
      '<!DOCTYPE html><html><body><main><section>Streaming second</section><section>More content</section></main></body></html>';
    const renderArtifact = (document: string) =>
      createBasicMarkdownRendererElement({
        content: document,
        messageId: 'streaming-artifact-message',
        isLoading: true,
      });

    act(() => {
      renderer.root.render(renderArtifact(firstDocument));
    });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'amc-webui-html-preview', event: 'resize', height: 960 },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    act(() => {
      renderer.root.render(renderArtifact(secondDocument));
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '960px',
    );
  });

  it('keeps the same streaming artifact iframe node while html content changes', () => {
    const firstDocument = '<!DOCTYPE html><html><body><main>Streaming first</main></body></html>';
    const secondDocument =
      '<!DOCTYPE html><html><body><main><section>Streaming second</section><section>More content</section></main></body></html>';
    const renderArtifact = (document: string) =>
      createBasicMarkdownRendererElement({
        content: document,
        messageId: 'streaming-artifact-identity-message',
        isLoading: true,
      });

    act(() => {
      renderer.root.render(renderArtifact(firstDocument));
    });

    const firstIframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');
    const firstSrcDoc = firstIframe?.getAttribute('srcdoc');

    act(() => {
      renderer.root.render(renderArtifact(secondDocument));
    });

    const secondIframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');

    expect(secondIframe).toBe(firstIframe);
    expect(secondIframe?.getAttribute('srcdoc')).toBe(firstSrcDoc);
  });

  it('keeps the measured artifact frame height when streaming completes with the final html content', () => {
    const document = '<!DOCTYPE html><html><body><main>Streaming final</main></body></html>';
    const renderArtifact = (isLoading: boolean) =>
      createBasicMarkdownRendererElement({
        content: document,
        messageId: 'completed-streaming-artifact-message',
        isLoading,
      });

    act(() => {
      renderer.root.render(renderArtifact(true));
    });

    const iframe = renderer.container.querySelector<HTMLIFrameElement>('iframe[title="HTML Preview"]');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: 'amc-webui-html-preview', event: 'resize', height: 960 },
          source: iframe?.contentWindow,
          origin: 'null',
        }),
      );
    });

    act(() => {
      renderer.root.render(renderArtifact(false));
    });

    expect(renderer.container.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]')?.style.height).toBe(
      '960px',
    );
  });
});

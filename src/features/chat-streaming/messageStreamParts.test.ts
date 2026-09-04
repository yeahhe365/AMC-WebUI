import { describe, expect, it } from 'vitest';
import type { Part } from '@google/genai';
import { appendApiPart, getContentDeltaFromPart, isCodeExecutionPendingInContent } from './messageStreamParts';

describe('appendApiPart', () => {
  it('preserves signature-only text parts instead of merging them into the previous text part', () => {
    const parts = appendApiPart([{ text: 'final answer' } as Part], { text: '', thoughtSignature: 'sig-123' } as Part);

    expect(parts).toEqual([{ text: 'final answer' }, { text: '', thoughtSignature: 'sig-123' }]);
  });

  it('still merges plain text chunks without metadata', () => {
    const parts = appendApiPart([{ text: 'hello' } as Part], { text: ' world' } as Part);

    expect(parts).toEqual([{ text: 'hello world' }]);
  });

  it('preserves code execution output inline data exactly for API context replay', () => {
    const parts = appendApiPart([], {
      inlineData: { mimeType: 'image/png', data: 'base64-chart' },
      thoughtSignature: 'sig-image',
    } as Part);

    expect(parts).toEqual([
      {
        inlineData: { mimeType: 'image/png', data: 'base64-chart' },
        thoughtSignature: 'sig-image',
      },
    ]);
  });
});

describe('getContentDeltaFromPart', () => {
  it('passes plain text parts through untouched', () => {
    expect(getContentDeltaFromPart({ text: 'hello world' } as Part)).toBe('hello world');
  });

  it('emits executable code as a single-line raw HTML block marked for the code-execution card', () => {
    const delta = getContentDeltaFromPart({
      executableCode: { language: 'PYTHON', code: 'print("hi")\nprint("bye")' },
    } as Part);

    expect(delta).toContain('<pre class="code-exec-code">');
    expect(delta).toContain('<code class="language-python">');
    // Single line: no raw newline may appear inside the HTML block, or CommonMark
    // would end the block at the first blank line.
    expect(delta.slice(delta.indexOf('<pre'), delta.indexOf('</pre>'))).not.toMatch(/\r?\n/);
    expect(delta).toContain('print(&quot;hi&quot;)&#10;print(&quot;bye&quot;)');
  });

  it('keeps blank code lines inside the HTML block via &#10;-only lines', () => {
    const delta = getContentDeltaFromPart({
      executableCode: { language: 'PYTHON', code: 'a = 1\n\nb = 2' },
    } as Part);

    expect(delta).toContain('a = 1&#10;&#10;&#10;b = 2');
  });

  it('emits code execution results as an outcome-marked tool-result block without the legacy header', () => {
    const delta = getContentDeltaFromPart({
      codeExecutionResult: { outcome: 'OUTCOME_FAILED', output: 'Traceback…\n\nError' },
    } as Part);

    // The proto enum prefix is stripped so the outcome-* CSS classes match.
    expect(delta).toContain('<div class="tool-result outcome-failed">');
    expect(delta).not.toContain('Execution Result');
    expect(delta).toContain('Traceback…&#10;&#10;&#10;Error');
  });

  it('omits the output pre for results without output', () => {
    const delta = getContentDeltaFromPart({ codeExecutionResult: { outcome: 'OUTCOME_OK' } } as Part);

    expect(delta).toContain('<div class="tool-result outcome-ok"></div>');
    expect(delta).not.toContain('<pre>');
  });
});

describe('isCodeExecutionPendingInContent', () => {
  it('is false for content without code execution', () => {
    expect(isCodeExecutionPendingInContent('Just text.')).toBe(false);
    expect(isCodeExecutionPendingInContent('')).toBe(false);
  });

  it('is false when the result block already followed the code block', () => {
    const content =
      '\n\n<pre class="code-exec-code"><code class="language-python">x = 1</code></pre>\n\n' +
      '\n\n<div class="tool-result outcome-ok"><pre><code class="language-text">1</code></pre></div>\n\n';
    expect(isCodeExecutionPendingInContent(content)).toBe(false);
  });

  it('is true when the latest code block has no following result block', () => {
    const content = '\n\n<pre class="code-exec-code"><code class="language-python">x = 1</code></pre>\n\n';
    expect(isCodeExecutionPendingInContent(content)).toBe(true);
  });

  it('is false for legacy content that only carries the old tool-result markup', () => {
    const content =
      '\n\n<div class="tool-result outcome-ok"><strong>Execution Result (OUTCOME_OK):</strong>' +
      '<pre><code>out</code></pre></div>\n\n';
    expect(isCodeExecutionPendingInContent(content)).toBe(false);
  });
});

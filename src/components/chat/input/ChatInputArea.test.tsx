import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const chatInputAreaPath = path.resolve(__dirname, './ChatInputArea.tsx');
const chatInputAreaLayoutPath = path.resolve(__dirname, './chatInputAreaLayout.ts');
const chatInputTextAreaMetricsPath = path.resolve(__dirname, './chatInputTextAreaMetrics.ts');

describe('ChatInputArea default spacing', () => {
  it('uses the reduced default vertical padding for the non-fullscreen input container', () => {
    const source = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');

    expect(source).toContain('px-3 py-1.5 sm:px-4 sm:py-2');
    expect(source).not.toContain('pb-[calc(3.15rem+0.486rem)]');
    expect(source).not.toContain('sm:pb-[calc(3.15rem+0.648rem)]');
    expect(source).not.toContain('bg-[var(--theme-bg-input)] p-3 sm:p-4');
  });

  it('doubles the non-fullscreen bottom safe-area spacing below the input area', () => {
    const source = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');

    expect(source).toContain('pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]');
    expect(source).not.toContain('pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]');
  });

  it('widens the non-fullscreen composer shell by ten percent', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');
    const layoutSource = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');
    const constantsSource = fs.readFileSync(path.resolve(__dirname, '../../../constants/layout.ts'), 'utf8');

    // ponytail: width class extracted to CHAT_INPUT_MAX_WIDTH_CLASS in constants/layout.ts
    expect(constantsSource).toContain("CHAT_INPUT_MAX_WIDTH_CLASS = 'max-w-[44rem]'");
    expect(source).toContain('CHAT_INPUT_MAX_WIDTH_CLASS');
    expect(layoutSource).toContain('CHAT_INPUT_MAX_WIDTH_CLASS');
    expect(source).not.toContain('max-w-[40.32rem]');
    expect(layoutSource).not.toContain('max-w-[40.32rem]');
  });

  it('keeps the action row in normal flow without an internal divider line', () => {
    const source = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');

    expect(source).toContain('const actionsContainerClass =');
    expect(source).toContain('flex items-center justify-between pt-1');
    expect(source).not.toContain('border-t');
    expect(source).not.toContain('border-[var(--theme-border-secondary)]/40');
    expect(source).not.toContain('absolute bottom-');
    expect(source).not.toContain('mt-auto pt-1 relative z-10');
  });

  it('uses one text line as the default textarea height', () => {
    const source = fs.readFileSync(chatInputTextAreaMetricsPath, 'utf8');

    expect(source).toContain('export const INITIAL_TEXTAREA_HEIGHT_PX = 24;');
    expect(source).not.toContain('export const INITIAL_TEXTAREA_HEIGHT_PX = 25.2;');
    expect(source).not.toContain('export const INITIAL_TEXTAREA_HEIGHT_PX = 28;');
  });

  it('focuses the textarea when users tap the non-interactive input shell', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');
    const layoutSource = fs.readFileSync(path.resolve(__dirname, '../../../constants/layout.ts'), 'utf8');

    // ponytail: selector extracted to FOCUS_BLOCKING_SELECTOR in constants/layout.ts
    expect(layoutSource).toContain('export const FOCUS_BLOCKING_SELECTOR =');
    expect(source).toContain('FOCUS_BLOCKING_SELECTOR');
    expect(source).toContain('onClick={handleInputShellClick}');
  });

  it('does not rebuild toolbar and action context data into intermediate prop objects', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');

    expect(source).not.toContain('const toolbarState =');
    expect(source).not.toContain('const actionState =');
    expect(source).toContain('<ChatInputToolbar />');
    expect(source).toContain('<ChatInputActions />');
    expect(source).not.toContain('<ChatInputToolbar {...');
    expect(source).not.toContain('<ChatInputActions {...');
  });

  it('mounts a hidden Live video element so screen and camera streams can be captured', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');

    expect(source).toContain('capabilities.isNativeAudioModel');
    expect(source).toContain('<video');
    expect(source).toContain('ref={liveApi.videoRef}');
    expect(source).toContain('autoPlay');
    expect(source).toContain('playsInline');
    expect(source).toContain('aria-hidden="true"');
  });

  it('keeps action controls independently enabled while textarea-only states are blocked', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');
    const providerSource = fs.readFileSync(path.resolve(__dirname, './ChatInputProvider.tsx'), 'utf8');

    expect(providerSource).toContain('const actionDisabled =');
    expect(providerSource).toContain(
      'inputState.isAddingById || isAnyModalOpen || inputState.isWaitingForUpload || localFileState.isConverting;',
    );
    expect(providerSource).toContain('disabled: actionDisabled,');
    expect(source).not.toContain('const actionDisabled =');
    expect(source).not.toContain(
      'disabled: inputState.isAddingById || inputState.isWaitingForUpload || isConverting || inputDisabled,',
    );
  });

  it('renders the queued submission strip above the input shell instead of inside it', () => {
    const source = fs.readFileSync(chatInputAreaPath, 'utf8');
    const layoutSource = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');

    // ponytail: shell className became a template literal (expanded modifier), onClick on its own line
    const queuedStripIndex = source.indexOf('className={queuedSubmissionContainerClass}');
    const inputShellIndex = source.indexOf('className={`${inputContainerClass}');
    const inputShellEndIndex = source.indexOf('<ChatTextArea', inputShellIndex);

    expect(layoutSource).toContain('const queuedSubmissionContainerClass =');
    expect(queuedStripIndex).toBeGreaterThan(-1);
    expect(inputShellIndex).toBeGreaterThan(-1);
    expect(source.indexOf('onClick={handleInputShellClick}', inputShellIndex)).toBeGreaterThan(inputShellIndex);
    expect(queuedStripIndex).toBeLessThan(inputShellIndex);
    expect(source.slice(inputShellIndex, inputShellEndIndex)).not.toContain('QueuedSubmissionCard');
  });

  it('uses an inset queued strip that visually docks to the wider composer shell', () => {
    const source = fs.readFileSync(chatInputAreaLayoutPath, 'utf8');
    // ponytail: shell radius extracted to COMPOSER_SHELL_RADIUS_CLASS in constants/designTokens.ts
    const designTokensSource = fs.readFileSync(path.resolve(__dirname, '../../../constants/designTokens.ts'), 'utf8');

    expect(source).toContain('relative z-10 mx-5 mb-[-22px] -translate-y-1.5');
    expect(source).toContain('focus-within:border-[var(--theme-border-focus)]');
    expect(source).toContain('relative z-20');
    expect(source).toContain('${COMPOSER_SHELL_RADIUS_CLASS}');
    expect(designTokensSource).toContain("pill: 'rounded-[20px]'");
    expect(designTokensSource).toContain('COMPOSER_SHELL_RADIUS_CLASS = RADIUS_CLASS.pill');
  });
});

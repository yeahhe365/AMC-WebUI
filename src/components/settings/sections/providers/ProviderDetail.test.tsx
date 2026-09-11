import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { createThirdPartyConnection } from '@/test/data/factories';
import * as modelHealthCheck from '@/utils/model/modelHealthCheck';
import { ProviderDetail } from './ProviderDetail';

describe('ProviderDetail', () => {
  const renderer = setupTestRenderer({ providers: { language: 'zh' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseConnection = createThirdPartyConnection({
    id: 'conn-deepseek',
    name: 'DeepSeek Official',
    templateId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-deepseek-test',
    modelId: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', visibleInSelector: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', visibleInSelector: true },
    ],
    enabled: true,
  });

  it('renders provider name, models, and batch health check button', () => {
    act(() => {
      renderer.root.render(
        <ProviderDetail connection={baseConnection} onUpdateConnection={vi.fn()} onDeleteConnection={vi.fn()} />,
      );
    });

    expect(renderer.container.textContent).toContain('DeepSeek Official');
    expect(renderer.container.textContent).toContain('DeepSeek V3');
    expect(renderer.container.textContent).toContain('DeepSeek R1');
    expect(renderer.container.textContent).toContain('测活');
  });

  it('executes batch health check and allows disabling failed models', async () => {
    const onUpdateConnection = vi.fn();

    vi.spyOn(modelHealthCheck, 'runBatchModelHealthCheck').mockImplementation(async (_, _models, opts = {}) => {
      const summary: modelHealthCheck.BatchHealthCheckSummary = {
        total: 2,
        successCount: 1,
        errorCount: 1,
        skippedCount: 0,
        avgLatencyMs: 180,
        results: {
          'deepseek-chat': {
            connectionId: 'conn-deepseek',
            status: 'success',
            latencyMs: 180,
            modelId: 'deepseek-chat',
            timestamp: Date.now(),
            grade: 'fast',
          },
          'deepseek-reasoner': {
            connectionId: 'conn-deepseek',
            status: 'error',
            latencyMs: 0,
            modelId: 'deepseek-reasoner',
            timestamp: Date.now(),
            grade: 'error',
            errorMessage: '404 Model Not Found',
          },
        },
      };
      opts.onProgress?.({
        completed: 1,
        total: 2,
        currentModelId: 'deepseek-chat',
        latestResult: summary.results['deepseek-chat'],
      });
      opts.onProgress?.({
        completed: 2,
        total: 2,
        currentModelId: 'deepseek-reasoner',
        latestResult: summary.results['deepseek-reasoner'],
      });
      return summary;
    });

    act(() => {
      renderer.root.render(
        <ProviderDetail
          connection={baseConnection}
          onUpdateConnection={onUpdateConnection}
          onDeleteConnection={vi.fn()}
        />,
      );
    });

    const batchCheckBtn = Array.from(renderer.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('测活'),
    );
    expect(batchCheckBtn).toBeDefined();

    await act(async () => {
      batchCheckBtn?.click();
    });

    // Should show latency for success and error status for failed model
    expect(renderer.container.textContent).toContain('180ms');
    expect(renderer.container.textContent).toContain('404');
    expect(renderer.container.textContent).toContain('一键停用失效模型');

    // Click "一键停用失效模型"
    const disableFailedBtn = Array.from(renderer.container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('一键停用失效模型'),
    );
    expect(disableFailedBtn).toBeDefined();

    act(() => {
      disableFailedBtn?.click();
    });

    expect(onUpdateConnection).toHaveBeenCalledWith({
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', visibleInSelector: true },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', visibleInSelector: false },
      ],
    });
  });

  it('probes a single model on clicking row probe button', async () => {
    const probeSingleSpy = vi.spyOn(modelHealthCheck, 'probeSingleModel').mockResolvedValue({
      connectionId: 'conn-deepseek',
      status: 'success',
      latencyMs: 95,
      modelId: 'deepseek-chat',
      timestamp: Date.now(),
      grade: 'fast',
    });

    act(() => {
      renderer.root.render(
        <ProviderDetail connection={baseConnection} onUpdateConnection={vi.fn()} onDeleteConnection={vi.fn()} />,
      );
    });

    const probeBtn = renderer.container.querySelector('button[title="单独测活该模型"]') as HTMLButtonElement;
    expect(probeBtn).not.toBeNull();

    await act(async () => {
      probeBtn.click();
    });

    expect(probeSingleSpy).toHaveBeenCalledWith(baseConnection, 'deepseek-chat');
    expect(renderer.container.textContent).toContain('95ms');
  });

  it('toggles batch mode, selects all and inverts selection', async () => {
    act(() => {
      renderer.root.render(
        <ProviderDetail connection={baseConnection} onUpdateConnection={vi.fn()} onDeleteConnection={vi.fn()} />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="batch-action-bar"]')).toBeNull();

    const batchToggleBtn = renderer.container.querySelector('button[title="批量管理模型"]') as HTMLButtonElement;
    expect(batchToggleBtn).not.toBeNull();

    act(() => {
      batchToggleBtn.click();
    });

    const bar = renderer.container.querySelector('[data-testid="batch-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('已选 0 / 2 项');

    // Click "全选"
    const selectAllBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('全选'));
    expect(selectAllBtn).toBeDefined();

    act(() => {
      selectAllBtn?.click();
    });

    expect(bar?.textContent).toContain('已选 2 / 2 项');
    expect(bar?.textContent).toContain('取消全选');

    // Click "反选"
    const invertBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('反选'));
    expect(invertBtn).toBeDefined();

    act(() => {
      invertBtn?.click();
    });

    expect(bar?.textContent).toContain('已选 0 / 2 项');
  });

  it('batch hides and shows selected models', async () => {
    const onUpdateConnection = vi.fn();

    act(() => {
      renderer.root.render(
        <ProviderDetail
          connection={baseConnection}
          onUpdateConnection={onUpdateConnection}
          onDeleteConnection={vi.fn()}
        />,
      );
    });

    // Select the first model via row checkbox
    const rowCheckboxes = renderer.container.querySelectorAll('button[title="选中该模型"]');
    expect(rowCheckboxes.length).toBe(2);

    act(() => {
      (rowCheckboxes[0] as HTMLButtonElement).click();
    });

    const bar = renderer.container.querySelector('[data-testid="batch-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('已选 1 / 2 项');

    // Click "隐藏"
    const hideBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('隐藏'));
    expect(hideBtn).toBeDefined();

    act(() => {
      hideBtn?.click();
    });

    expect(onUpdateConnection).toHaveBeenCalledWith({
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', visibleInSelector: false },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', visibleInSelector: true },
      ],
    });

    // Click "显示"
    const showBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('显示'));
    expect(showBtn).toBeDefined();

    act(() => {
      showBtn?.click();
    });

    expect(onUpdateConnection).toHaveBeenCalledWith({
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', visibleInSelector: true },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', visibleInSelector: true },
      ],
    });
  });

  it('batch deletes selected models', async () => {
    const onUpdateConnection = vi.fn();

    act(() => {
      renderer.root.render(
        <ProviderDetail
          connection={baseConnection}
          onUpdateConnection={onUpdateConnection}
          onDeleteConnection={vi.fn()}
        />,
      );
    });

    // Select the second model (deepseek-reasoner)
    const rowCheckboxes = renderer.container.querySelectorAll('button[title="选中该模型"]');
    act(() => {
      (rowCheckboxes[1] as HTMLButtonElement).click();
    });

    const bar = renderer.container.querySelector('[data-testid="batch-action-bar"]');
    const deleteBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('删除'));
    expect(deleteBtn).toBeDefined();

    act(() => {
      deleteBtn?.click();
    });

    expect(onUpdateConnection).toHaveBeenCalledWith({
      models: [{ id: 'deepseek-chat', name: 'DeepSeek V3', visibleInSelector: true }],
      modelId: 'deepseek-chat',
    });
  });

  it('batch deletes active model and falls back to first remaining model', async () => {
    const onUpdateConnection = vi.fn();

    act(() => {
      renderer.root.render(
        <ProviderDetail
          connection={baseConnection}
          onUpdateConnection={onUpdateConnection}
          onDeleteConnection={vi.fn()}
        />,
      );
    });

    // Select the first model (deepseek-chat, which is active connection.modelId)
    const rowCheckboxes = renderer.container.querySelectorAll('button[title="选中该模型"]');
    act(() => {
      (rowCheckboxes[0] as HTMLButtonElement).click();
    });

    const bar = renderer.container.querySelector('[data-testid="batch-action-bar"]');
    const deleteBtn = Array.from(bar!.querySelectorAll('button')).find((b) => b.textContent?.includes('删除'));

    act(() => {
      deleteBtn?.click();
    });

    expect(onUpdateConnection).toHaveBeenCalledWith({
      models: [{ id: 'deepseek-reasoner', name: 'DeepSeek R1', visibleInSelector: true }],
      modelId: 'deepseek-reasoner',
    });
  });

  it('batch probes only selected models', async () => {
    const runBatchSpy = vi.spyOn(modelHealthCheck, 'runBatchModelHealthCheck').mockResolvedValue({
      total: 1,
      successCount: 1,
      errorCount: 0,
      skippedCount: 0,
      avgLatencyMs: 120,
      results: {},
    });

    act(() => {
      renderer.root.render(
        <ProviderDetail connection={baseConnection} onUpdateConnection={vi.fn()} onDeleteConnection={vi.fn()} />,
      );
    });

    // Select deepseek-chat only
    const rowCheckboxes = renderer.container.querySelectorAll('button[title="选中该模型"]');
    act(() => {
      (rowCheckboxes[0] as HTMLButtonElement).click();
    });

    const bar = renderer.container.querySelector('[data-testid="batch-action-bar"]');
    const probeSelectedBtn = Array.from(bar!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('测活已选'),
    );
    expect(probeSelectedBtn).toBeDefined();

    await act(async () => {
      probeSelectedBtn?.click();
    });

    expect(runBatchSpy).toHaveBeenCalledWith(
      baseConnection,
      [expect.objectContaining({ id: 'deepseek-chat' })],
      expect.anything(),
    );
  });
});

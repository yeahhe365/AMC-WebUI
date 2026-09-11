import { describe, expect, it } from 'vitest';

import { buildVitestNodeArgs, buildVitestNodeOptions } from './run-vitest.mjs';

describe('buildVitestNodeArgs', () => {
  it('includes the webstorage opt-out flag when the current node supports it', () => {
    const args = buildVitestNodeArgs({ has: (value: string) => value === '--no-experimental-webstorage' }, [
      'run',
      'src/example.test.ts',
    ]);

    expect(args).toEqual([
      '--no-experimental-webstorage',
      './node_modules/vitest/vitest.mjs',
      'run',
      'src/example.test.ts',
    ]);
  });

  it('omits the webstorage opt-out flag when the current node does not support it', () => {
    const args = buildVitestNodeArgs({ has: () => false }, ['run', 'src/example.test.ts']);

    expect(args).toEqual(['./node_modules/vitest/vitest.mjs', 'run', 'src/example.test.ts']);
  });

  it('strips bare double-dash separators forwarded by package managers', () => {
    const args = buildVitestNodeArgs({ has: () => false }, ['run', '--', '--shard=1/3']);

    expect(args).toEqual(['./node_modules/vitest/vitest.mjs', 'run', '--shard=1/3']);
  });

  it('adds the webstorage opt-out flag to NODE_OPTIONS so Vitest workers inherit it', () => {
    const nodeOptions = buildVitestNodeOptions(
      { has: (value: string) => value === '--no-experimental-webstorage' },
      '--max-old-space-size=4096',
    );

    expect(nodeOptions).toBe('--max-old-space-size=4096 --no-experimental-webstorage');
  });

  it('does not duplicate the webstorage opt-out flag in NODE_OPTIONS', () => {
    const nodeOptions = buildVitestNodeOptions(
      { has: (value: string) => value === '--no-experimental-webstorage' },
      '--no-experimental-webstorage',
    );

    expect(nodeOptions).toBe('--no-experimental-webstorage');
  });

  it('checks NODE_OPTIONS for an exact opt-out token before skipping insertion', () => {
    const nodeOptions = buildVitestNodeOptions(
      { has: (value: string) => value === '--no-experimental-webstorage' },
      '--no-experimental-webstorage-file=/tmp/storage.json',
    );

    expect(nodeOptions).toBe('--no-experimental-webstorage-file=/tmp/storage.json --no-experimental-webstorage');
  });
});

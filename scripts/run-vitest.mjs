import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const WEBSTORAGE_OPT_OUT_FLAG = '--no-experimental-webstorage';

export const buildVitestNodeOptions = (allowedFlags, existingNodeOptions = '') => {
  const nodeOptionTokens = existingNodeOptions.split(/\s+/).filter(Boolean);
  if (!allowedFlags.has(WEBSTORAGE_OPT_OUT_FLAG) || nodeOptionTokens.includes(WEBSTORAGE_OPT_OUT_FLAG)) {
    return existingNodeOptions;
  }

  return [existingNodeOptions, WEBSTORAGE_OPT_OUT_FLAG].filter(Boolean).join(' ');
};

export const buildVitestNodeArgs = (allowedFlags, vitestArgs) => {
  const args = [];

  if (allowedFlags.has(WEBSTORAGE_OPT_OUT_FLAG)) {
    args.push(WEBSTORAGE_OPT_OUT_FLAG);
  }

  args.push('./node_modules/vitest/vitest.mjs', ...vitestArgs);
  return args;
};

const runVitest = () => {
  const args = buildVitestNodeArgs(process.allowedNodeEnvironmentFlags, process.argv.slice(2));

  const result = spawnSync(process.execPath, args, {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NODE_OPTIONS: buildVitestNodeOptions(process.allowedNodeEnvironmentFlags, process.env.NODE_OPTIONS),
    },
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }

  process.exit(1);
};

const isDirectExecution =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runVitest();
}

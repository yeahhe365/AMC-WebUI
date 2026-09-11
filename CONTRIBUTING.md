# Contributing

Thanks for helping improve AMC WebUI.

## Workflow

1. Search existing issues and pull requests before opening a new one.
2. Create focused issues with reproduction steps, environment details, and screenshots or logs when useful.
3. Keep pull requests small and scoped to one behavior change when possible.
4. Run the relevant checks before opening a pull request.

## Local Development

Node.js 26 is recommended for local development. The repository includes `.nvmrc` and enables `engine-strict`; Node.js 24 is the minimum supported version. Run `nvm use` before installing dependencies if you want the recommended version.

```bash
nvm use
npm ci
pnpm dev
```

Useful verification commands:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

For end-to-end coverage:

```bash
npx playwright install --with-deps chromium
pnpm run test:e2e
```

## Adding a new language

1. Add the language to `src/i18n/languageRegistry.ts`:
   ```ts
   export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja', 'ko'] as const;
   // and LANGUAGE_META.ko, BROWSER_LANG_PREFIX_MAP['ko']
   ```
2. Generate placeholders:
   ```bash
   node scripts/add-language.mjs ko
   ```
3. Fill `ko: ''` in each `src/i18n/translations/**/*.ts` with translations (keep `{placeholders}` intact).
4. Verify:
   ```bash
   pnpm run i18n:check
   pnpm run typecheck && pnpm run lint && pnpm test
   ```

## Pull Requests

Include a short summary, verification notes, and screenshots for UI changes. If a change affects storage, model behavior, deployment, or user data migration, call that out explicitly in the PR body.

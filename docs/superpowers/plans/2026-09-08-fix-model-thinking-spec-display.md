# Fix Model Thinking Specification Display in Model Dropdown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the thinking specification display in the AMC-WebUI model dropdown (`ModelPicker` -> `ModelDetailCard`) according to official Google Gemini API documentation, switching Gemini 3 models from legacy token budget ("思考预算") to thinking level ("思考等级"), eliminating false thinking displays on TTS/Transcribe, fixing image/live model thinking levels, and aligning context window sizes.

**Architecture:**

- Update `header.ts` with `modelCardThinkingLevel` translations.
- Refactor `modelSpecifications.ts` to separate `thinkingLevelRange` (for enum-based reasoning models like Gemini 3, Gemma 4, OpenAI o-series) from `thinkingBudgetRange` (for token-budget models like Claude 3.7 and Gemini 2.5).
- Remove Gemini 3 models from legacy `THINKING_BUDGET_RANGES` in `modelConfiguration.ts`.
- Update `ModelDetailCard.tsx` to dynamically render "思考等级" (Thinking Level) or "思考预算" (Thinking Budget) based on the model's true mechanism.
- Correct context window & max output specifications in `resolveContextWindow` for 3.1 Pro (1M, not 2M), Robotics ER 2 (128K/64K), Live (128K/64K), TTS (8K/16K), Image models (128K/32K, 64K/4K), and Gemma 4 (256K).
- Add comprehensive vitest unit tests in `modelSpecifications.test.ts` and `ModelDetailCard.test.tsx`.

**Tech Stack:** TypeScript, React, Vitest, Tailwind CSS.

---

### Task 1: Add Translations for Thinking Level in `header.ts`

**Files:**

- Modify: `src/i18n/translations/header.ts`
- Test: `src/i18n/translationCoverage.test.ts`

- [ ] **Step 1: Write failing test in `src/i18n/translationCoverage.test.ts` for `modelCardThinkingLevel`**

Add assertion expecting `modelCardThinkingLevel` to exist and translate across all registered languages.

```typescript
it('translates modelCardThinkingLevel across all languages', () => {
  expect(t('modelCardThinkingLevel')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/i18n/translationCoverage.test.ts`
Expected: FAIL (key missing)

- [ ] **Step 3: Add `modelCardThinkingLevel` translation key to `src/i18n/translations/header.ts`**

```typescript
  modelCardThinkingLevel: {
    en: 'Thinking Level',
    zh: '思考等级',
    ja: '思考レベル',
    ko: '생각 수준',
    es: 'Nivel de pensamiento',
    fr: 'Niveau de réflexion',
    de: 'Denk-Stufe',
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/i18n/translationCoverage.test.ts`
Expected: PASS

---

### Task 2: Refactor `modelSpecifications.ts` and `modelConfiguration.ts` for Accurate Thinking & Context Specs

**Files:**

- Modify: `src/constants/modelConfiguration.ts`
- Modify: `src/utils/model/modelSpecifications.ts`
- Test: `src/utils/model/modelSpecifications.test.ts`

**Interfaces:**

- `ModelSpecification`: add `thinkingLevelRange?: string;`, retain `thinkingBudgetRange?: string;` for budget models.
- `resolveThinkingLevelRange(modelId: string): string | undefined`:
  - Returns `undefined` for TTS (`isTtsModel`), Transcribe (`isTranscribeModel`), Live Translate (`isLiveTranslateModel`).
  - `gemini-3.8-flash` / `gemini-3.7-flash`: `'Low ~ High (默认 Medium)'`
  - `gemini-3.5-flash-lite`: `'Minimal ~ High (默认 Minimal)'`
  - `gemini-3.1-pro-preview`: `'Low ~ High (默认 High)'`
  - `gemini-robotics-er-2-preview`: `'Low ~ High (推荐 Medium)'`
  - `gemini-3.1-flash-live-preview`: `'Minimal ~ High (默认 Minimal)'`
  - `gemini-3.1-flash-image-preview`: `'Minimal / High (默认 Minimal)'`
  - `gemini-3.1-flash-lite-image`: `'Minimal / High (默认 Minimal)'`
  - `gemini-3-pro-image-preview`: `'Low / High (默认 High)'`
  - `gemma-4`: `'Minimal ~ High (默认 Minimal)'`
  - `gemini-3.6-flash`: `'Minimal ~ High (默认 Medium)'`
  - `gemini-3-flash-preview`: `'Minimal ~ High (默认 High)'`
  - OpenAI reasoning (`o4`, `o3`, `o1`): `'Low ~ High'`
- `resolveThinkingBudget(modelId: string): string | undefined`:
  - Returns numeric ranges only for models that genuinely use token budgets (e.g. `claude-3-7` -> `'1,024 ~ 64,000'`, Gemini 2.5 if present). Returns `undefined` for Gemini 3 models.
- `resolveContextWindow(modelId: string)`:
  - Fix `gemini-3.1-pro`: `1,000,000 (1M)` / `65,536 (64K)`
  - Fix `gemini-robotics-er-2-preview`: `131,072 (128K)` / `65,536 (64K)`
  - Fix `gemini-3.1-flash-live-preview`: `131,072 (128K)` / `65,536 (64K)`
  - Fix `gemini-3.1-flash-tts-preview`: `8,192 (8K)` / `16,384 (16K)`
  - Fix `gemini-3.1-flash-image-preview`: `131,072 (128K)` / `32,768 (32K)`
  - Fix `gemini-3.1-flash-lite-image`: `65,536 (64K)` / `4,096 (4K)`
  - Fix `gemini-3-pro-image-preview`: `65,536 (64K)` / `32,768 (32K)`
  - Fix `gemma-4`: `256,000 (256K)` / `8,192 (8K)`
- Mark Gemma 4 with reasoning capability in `modelSpecifications.ts`:
  - `const isReasoning = isReasoningModel(modelId) || isGemini3Model(modelId) || isGemmaModel(modelId);`

- [ ] **Step 1: Write failing unit tests in `src/utils/model/modelSpecifications.test.ts`**

Cover Gemini 3.8 Flash, 3.5 Flash-Lite, 3.1 Pro, Robotics ER 2, Live, TTS, Nano Banana 2/Lite/Pro, Gemma 4, and Claude 3.7.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/utils/model/modelSpecifications.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement changes in `modelConfiguration.ts` and `modelSpecifications.ts`**

Update `THINKING_BUDGET_RANGES`, `resolveThinkingLevelRange`, `resolveThinkingBudget`, `resolveContextWindow`, and `isReasoning`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/utils/model/modelSpecifications.test.ts`
Expected: PASS

---

### Task 3: Update `ModelDetailCard.tsx` to Render Thinking Level / Budget

**Files:**

- Modify: `src/components/shared/ModelDetailCard.tsx`
- Modify: `src/components/shared/ModelDetailCard.test.tsx`

- [ ] **Step 1: Write unit tests in `src/components/shared/ModelDetailCard.test.tsx`**

Test that:

1. `gemini-3.8-flash` displays label `思考等级` (or `Thinking Level`) and value `Low ~ High (默认 Medium)`.
2. `gemini-3.1-flash-tts-preview` does NOT display any thinking section.
3. Model with budget (e.g. Claude 3.7 Sonnet) displays `思考预算` (or `Thinking Budget`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/components/shared/ModelDetailCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `ModelDetailCard.tsx`**

Replace the old `spec.thinkingBudgetRange` section with:

```tsx
{
  (spec.thinkingLevelRange || spec.thinkingBudgetRange) && (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs">
      <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
        <Brain size={12} className="flex-shrink-0" />
        <span>
          {spec.thinkingLevelRange ? t('modelCardThinkingLevel') || t('modelCardThinking') : t('modelCardThinking')}
        </span>
      </div>
      <span className="font-mono font-medium text-purple-700 dark:text-purple-300">
        {spec.thinkingLevelRange || spec.thinkingBudgetRange}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/components/shared/ModelDetailCard.test.tsx`
Expected: PASS

---

### Task 4: Full Verification and Regression Test Suite

**Files:**

- Test: all existing model selector and model capabilities tests

- [ ] **Step 1: Run all model-related unit tests**

Run:

```bash
npm test src/utils/model/
npm test src/components/shared/ModelDetailCard.test.tsx
npm test src/components/chat/input/actions/ThinkingSpeedControl.test.tsx
npm test src/services/api/generationConfig.test.ts
npm test src/i18n/
```

- [ ] **Step 2: Verify zero regressions across the codebase**

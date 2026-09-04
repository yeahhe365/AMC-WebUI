# Selection Ask Floating Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 划词工具栏新增“询问”按钮，点击后在划词附近弹出可拖拽悬浮窗，输入问题后流式输出针对选中文本的回答，不污染主对话。

**Architecture:** 复用现有 `useSelectionPosition`/`ToolbarContainer` 定位与 `MessageList` 挂载点，新增 `SelectionAskPanel` (Portal + drag) 与隔离的 SSE 流服务 `selectionAskService`，通过 `onAsk` 回调把选中文本与 rect 透传到全局单例管理器。

**Tech Stack:** React 18, Tailwind, lucide-react, Vite, fetch SSE (复用 `src/features/chat-streaming`), `createPortal`, `useSelectionDrag` 复用

## Global Constraints

- 悬浮窗不写入 `chatStore/activeMessages`，独立 `AbortController` 管理流，关闭不影响主对话 `activeJobs`
- 定位复用 `ToolbarContainer` 的 viewport clamp，初始锚定 `rect.bottom+12` 居中，拖拽后保持
- 主题与现有 selection toolbar 一致，`z-index` 高于 `Z_INDEX_TOPMOST_OVERLAY`
- 包管理器 `pnpm`

---

### Task 1: 划词工具栏新增“询问”按钮

**Files:**

- Modify: `src/components/chat/message-list/text-selection/StandardActionsView.tsx`
- Modify: `src/components/chat/message-list/text-selection/StandardActionsView.test.tsx`
- Modify: `src/i18n/translations/selection.ts` (或现有 `messages.ts`) - 新增 ask 词条
- Modify: `src/components/chat/message-list/TextSelectionToolbar.tsx` - 新增 onAsk prop

**Interfaces:**

- Consumes: 现有 `StandardActionsViewProps`, `useSelectionPosition` 的 `selectedText`
- Produces: `onAsk?: (e: React.MouseEvent) => void` 供 Task 3 消费

- [ ] **Step 1: 新增 i18n 词条**

```ts
// src/i18n/translations/selection.ts 或 messages.ts 追加
ask: { en: 'Ask', zh: '询问' },
askSelection: { en: 'Ask about selection', zh: '询问划中内容' },
```

- [ ] **Step 2: StandardActionsView 增加按钮**

```tsx
import { MessageCircleQuestion } from 'lucide-react';
interface StandardActionsViewProps { onAsk?: (e: React.MouseEvent)=>void; ... }
const askLabel = t('ask');
<button onMouseDown={onAsk} className={actionButtonClass} title={askLabel} aria-label={askLabel}>
  <MessageCircleQuestion size={14} className="text-sky-500" /><span>{askLabel}</span>
</button>
// 放在 Copy 之前或之后，保持分隔线
```

- [ ] **Step 3: TextSelectionToolbar 透出 onAsk**

```tsx
interface TextSelectionToolbarProps { onAsk?: (text:string, rect:DOMRect|null)=>void; ... }
const handleAskClick = (e:React.MouseEvent)=>{ e.preventDefault(); e.stopPropagation(); onAsk?.(selectedText, selectionBoundsRef.current as DOMRect|null); };
<StandardActionsView onAsk={handleAskClick} .../>
```

- [ ] **Step 4: 更新单测并验证**

Run: `pnpm test src/components/chat/message-list/text-selection/StandardActionsView.test.tsx`
Expected: 新增断言 `getByLabelText('询问')` 存在

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/message-list/text-selection/StandardActionsView.tsx src/components/chat/message-list/TextSelectionToolbar.tsx
git commit -m "feat(selection): add Ask button to text selection toolbar"
```

---

### Task 2: 隔离的划词询问 SSE 服务

**Files:**

- Create: `src/services/selectionAskService.ts`
- Test: `src/services/selectionAskService.test.ts`

**Interfaces:**

- Consumes: `resolveChatApiRoute`, `useSettingsStore.getState().appSettings`, `useChatState().currentChatSettings.modelId`
- Produces: `askSelection({ selectedText, question, modelId, signal, onDelta, onDone, onError }): Promise<void>`

- [ ] **Step 1: 写 failing test**

```ts
it('streams deltas via onDelta', async () => {
  global.fetch = vi.fn(() => mockSSE(['hello', ' world']));
  await askSelection({
    selectedText: 'foo',
    question: 'what?',
    modelId: 'gemini-2.5-flash',
    onDelta: fn,
    signal: AbortController.signal,
  });
  expect(fn).toHaveBeenCalledWith('hello');
});
```

- [ ] **Step 2: 实现最小服务**

```ts
export async function askSelection({selectedText, question, modelId, signal, onDelta}: {...}){
  const prompt = `选中文本："""${selectedText}"""\n\n问题：${question}\n\n请基于选中文本回答，若超出则结合常识补充。`;
  const res = await fetch(resolveChatApiRoute(...), { method:'POST', body:JSON.stringify({model:modelId, messages:[{role:'user', content:prompt}], stream:true}), signal });
  // 复用 src/features/chat-streaming/streamParser 解析 SSE
}
```

- [ ] **Step 3: 验证**

Run: `pnpm test src/services/selectionAskService.test.ts`

- [ ] **Step 4: Commit**

---

### Task 3: 悬浮窗口 SelectionAskPanel

**Files:**

- Create: `src/components/chat/message-list/text-selection/SelectionAskPanel.tsx`
- Create: `src/components/chat/message-list/text-selection/useSelectionAsk.ts`
- Modify: `src/components/chat/message-list/MessageList.tsx` - 挂载全局管理器

**Interfaces:**

- Consumes: `askSelection` from Task 2, `useSelectionDrag` 拖拽, `selection rect`
- Produces: `<SelectionAskPanel selectedText rect onClose onInsert onQuote>`

- [ ] **Step 1: hook useSelectionAsk**

```ts
export function useSelectionAsk() {
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ask = (selectedText, question) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    setAnswer('');
    setLoading(true);
    askSelection({
      selectedText,
      question,
      onDelta: (d) => setAnswer((p) => p + d),
      onDone: () => setLoading(false),
      signal: ac.signal,
    });
  };
  return { answer, loading, ask, cancel: () => abortRef.current?.abort() };
}
```

- [ ] **Step 2: Panel 组件**

- Portal 到 body, 初始位置 `rect ?? selectionBoundsRef`, `fixed` + `clamp`, header 可拖拽, body Markdown 流, footer textarea + 发送 + 快捷按钮(解释/翻译/总结)
- 样式: `rounded-2xl border bg-[var(--theme-bg-secondary)] shadow-2xl w-[min(560px,calc(100vw-24px))]`
- 按钮: 复制回答、引用到输入框、插入到输入框、关闭

- [ ] **Step 3: MessageList 集成**

```tsx
const [askState,setAskState]=useState<{text:string, rect:DOMRect|null}|null>(null);
<TextSelectionToolbar onAsk={(text, rect)=> setAskState({text, rect})} .../>
{askState && <SelectionAskPanel selectedText={askState.text} anchorRect={askState.rect} onClose={()=>setAskState(null)} onInsert={handleInsert} onQuote={handleQuote} />}
```

- [ ] **Step 4: 验证**

Run: `pnpm build` + `pnpm test MessageList`

- [ ] **Step 5: Commit**

---

### Task 4: i18n 与快捷提问与移动端适配

**Files:**

- Modify: `src/i18n/translations/chat.ts`
- Modify: `src/components/chat/message-list/text-selection/SelectionAskPanel.tsx` - 响应式

**Interfaces:**

- Consumes: `useI18n`
- Produces: 完整多语言覆盖

- [ ] **Step 1: 补充词条** `askPlaceholder`, `explain`, `translate`, `summarize`, `rewrite`, `askError`, `copyAnswer`
- [ ] **Step 2: 快捷按钮填入问题并自动发送**
- [ ] **Step 3: 移动端 bottom-sheet 样式 `max-h-[60vh] overflow-auto`**
- [ ] **Step 4: Commit**

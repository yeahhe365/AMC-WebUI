# 侧边栏会话手动拖拽排序设计

日期：2026-09-12
范围：`src/types/chat.ts`、`src/stores/`、`src/hooks/chat/history/`、`src/features/message-sender/`、`src/components/sidebar/`、`src/components/command/`、`src/i18n/translations/history.ts`

---

## 1. 背景与目标

侧边栏（`HistorySidebar`）目前**没有**会话级手动排序：

- 拖动会话只有一种语义——「移入分组」：拖到另一个会话上＝并到同一分组（`SessionItem.tsx:162-171`），拖到分组标题＝移入该组，拖到列表空白＝移出分组（`useHistorySidebarLogic.ts:358-366`）。
- 拖动时渲染的 before/after 插入指示线（`SessionItem.tsx:202-211`）**只是装饰**，松手时被完全忽略。
- 置顶只能通过右键菜单（`SessionItemContextMenu.tsx:72-77`）；菜单上标注的 `⌘P` 从未注册（`src/constants/shortcuts.ts` 无对应项）。
- 会话顺序完全由排序键决定：`pinned` 优先，其余按 `timestamp` 倒序（`useHistorySidebarLogic.ts:281-287`、`src/stores/sessionModels.ts:5-12`）；而 `timestamp` 在每次追加消息时都会被刷新（`src/stores/chatStore.ts:463-472`），所以发一条消息就会把会话顶到前面。

目标：在桶内实现**可持久化的手动拖拽排序**，并让「拖到置顶区＝置顶」成立。

### 1.1 已确认的决策

| # | 问题 | 结论 |
| --- | --- | --- |
| Q1 | 顺序由什么决定 | **完全手动**。顺序只由拖动/置顶决定；发消息不再改变位置。新会话与复制会话按 Q5 插入。 |
| Q2 | 置顶与手动顺序的关系 | 置顶仍是独立区块（未分组区/时间视图有「已置顶」标题，组内只是排在前面）。**拖动可跨边界**：拖入置顶区＝自动置顶，拖出＝自动取消置顶。 |
| Q3 | 时间视图（`displayMode === 'time'`） | **不参与手动排序**：仍按日期分类 + 时间倒序，并且拖动整体禁用。 |
| Q4 | 分组模式下未分组区的日期小标题 | **去掉**（今天/昨天/过去 7 天/过去 30 天/更早），未分组区改为平铺手动列表。`categorizeSessionsByDate` 从此只服务时间视图。 |
| Q5 | 新建/复制会话的插入位置 | 新建（含场景/错误/隐式建会话）：所属桶**未置顶区最前**。复制与 fork：**紧跟源会话正后方**。 |
| Q6 | 跨置顶边界的视觉提示 | **做**：落点在置顶区时指示线切换为「将置顶」样式。 |
| Q7 | 存储方案 | **数字间隔键 + 中点插入**（`sortOrder?: number`），任何拖动/新建/复制只改 1~2 条记录。见 §2.2、§5。 |

---

## 2. 关键现状约束

### 2.1 排序语义散落在多处，`chatStore` 是必经收口点

`chatStore.updateAndPersistSessions` 在**每一次**会话变更后都会调用 `sortSessionsInPlace(newFullSessions)`（`src/stores/chatStore.ts:370-378`）。所有写入路径（发消息、改名、置顶、移动分组、新建、删除）都经过这里。如果不同步修改比较器，拖动的结果会在下一次任意更新时被弹回。

其余需要同步的排序点：

| 位置 | 作用 |
| --- | --- |
| `src/stores/sessionModels.ts:5-12` | 权威比较器本体 |
| `src/components/sidebar/useHistorySidebarLogic.ts:281-287` | 桶内（分组/未分组）排序 |
| `src/hooks/chat/history/sessionInitialLoad.ts:131,171` | 加载与合并后的重排 |
| `src/stores/sessionRefresh.ts:15` | 跨标签页刷新后的重排 |
| `src/components/command/GlobalCommandPalette.tsx:114` | `savedSessions.slice(0, 8)` 取「最近 8 条」 |
| `src/components/sidebar/CollapsedRecentChatsButton.tsx` | 折叠态「最近会话」（需审计） |

### 2.2 落盘代价决定了键的设计（本设计的关键约束）

- `getSessionPersistenceChanges` **按对象引用**比较（`src/stores/sessionPersistence.ts:28-31`）：任何被重新创建的对象都会被判定为「已修改」。
- `persistSessionChanges` 对**非活跃**会话（`messages` 被 `stripStoredSessionMessages` 剥成 `[]`，即绝大多数）必须先 `getSession`（读全量并 hydrate 附件记录）再 `saveSession`，约 3 次 IndexedDB 事务／条；且每个 `saveSession` 都经过 `withWriteLock` **串行**（`src/stores/sessionPersistenceEffects.ts:38-94`）。

结论：**任何会导致整桶重编号的写入策略都不可接受**。「新建会话插到最前」如果实现为「整桶 +1」，每次点「新对话」就要写 O(N) 条记录——这正是本设计选择数字间隔键（§5）而非「整数序号 + 整表重编号」（分组当前的做法，`src/hooks/chat/history/useGroupActions.ts:79-100`）的原因。分组可以用整表重编号，因为分组数量是常数级；会话不是。

### 2.3 加字段不需要数据库迁移

sessions store 是 `keyPath: 'id'` 的整对象存储（`src/services/db/dbSchema.ts:53`），新增可选字段无需提升 `DB_VERSION`。回填走加载期逻辑即可——与当年给 groups 补 `orderKey` 的做法一致（`src/hooks/chat/history/sessionInitialLoad.ts:174-188`）。

### 2.4 所有会话创建站点

`createNewSession(` 的调用点（均需分配 `sortOrder`）：

`src/hooks/chat/history/useSessionLoader.ts:246`、`src/hooks/chat/history/useSessionActions.ts:86`（复制）、`src/hooks/chat/actions/useMessageActions.ts:349`（fork）、`src/hooks/chat/actions/useMessageUpdates.ts:174,222`、`src/hooks/chat/actions/useModelSelection.ts:88`、`src/features/message-sender/useModelRequestRunner.ts:67`（错误会话）、`src/hooks/scenarios/usePreloadedScenarios.ts:72`。

它们目前都以 `updateAndPersistSessions((prev) => [newSession, ...prev])` 的形式前插，需改为调用 §5 的插入助手。

---

## 3. 数据模型

```ts
// src/types/chat.ts — SavedChatSession
/**
 * 桶内手动顺序（数字间隔键）。桶 = groupId ?? null。
 * 由排序助手维护，不要在别处手写数值。
 */
sortOrder?: number;
```

- **不复用** `ChatGroup.orderKey` 这个名字：分组的 `orderKey` 是补零索引字符串，类型与语义都不同，同名会造成误读。
- 桶 = `groupId ?? null`：每个分组一条独立序列，未分组一条独立序列。视图本来就是按桶渲染的（`sessionsByGroupId`，`useHistorySidebarLogic.ts:273-289`），桶内编号也让回填与兜底重编号的规模可控。

`SPACING = 2 ** 20`（1048576），`makeInitialOrder(index) = (index + 1) * SPACING`。double 在 2⁵³ 内精确，`桶规模 × SPACING` 远在安全范围内。

---

## 4. 权威比较器

```ts
// src/stores/sessionModels.ts
pinned 降序 → sortOrder 升序（undefined 视为 +∞）→ timestamp 降序
```

- `undefined` 排在有序项之后并用 `timestamp` 兜底：回填前的旧数据保持现有观感。
- 置顶是**第一级**排序键，所以 Q2 的「拖入置顶区＝置顶」必须在 drop 时**显式改写 `isPinned`**，不能指望排序自动达成。
- 比较器只在桶内有语义；全局 `savedSessions` 数组继续跑同一个比较器，以保持数组顺序确定、避免后续代码误用。视图层一律按桶重新排序（现状已经如此）。

---

## 5. 插入与重排算法

新增 `src/stores/sessionOrder.ts`（纯函数，无 React/无 IO，便于测试）：

```ts
export const SESSION_ORDER_SPACING = 2 ** 20;

// 回填：按传入顺序（调用方已按 (pinned, timestamp) 排好）赋间隔键
export function assignBucketOrder(sessions: SavedChatSession[]): SavedChatSession[];

// 插到桶内「与 newSession.isPinned 相同」的区段最前（未置顶会话插到未置顶区最前，置顶会话插到置顶区最前）
export function insertAtBucketTop(sessions, newSession): SavedChatSession[];

// 插到锚点会话正后方（复制/fork）；anchorId 为 null 表示桶内同 isPinned 区段的末尾
export function insertAfterSession(sessions, newSession, anchorId: string | null): SavedChatSession[];

// 拖动重排：把 activeId 插到 overId 的前/后
export function reorderSessionInBucket(
  sessions: SavedChatSession[],
  activeId: string,
  overId: string,
  position: 'before' | 'after',
): SavedChatSession[];
```

`reorderSessionInBucket` 的核心：

1. 在**完整桶序列**（按 §4 排好）里定位 `activeId`、`overId`；任一方缺失或二者相同 → **原样返回原数组引用**（不产生任何写入）。
2. 计算落点邻居 `prev` / `next`（跳过 active 自身），并令 `active.isPinned = over.isPinned`。
   判定置顶区的**唯一依据是目标项自身的 `isPinned`**，与落点的像素位置无关：目标项是置顶项 → 拖过去即置顶；目标是普通项 → 拖过去即取消置顶。注意其副作用是「把置顶项往下拖过最后一个置顶项」会取消置顶——这正是 Q2 的语义，由 §7.3 的视觉提示负责让它可预期。
3. `sortOrder` 取值：两侧都有 → 中点；只有 `prev` → `prev + SPACING`；只有 `next` → `next − SPACING`；都没有 → `SPACING`。
4. **中点空间耗尽**（`next − prev <= 1`，即同一缝隙被连续插入约 20 次）→ 对该桶整体重编号兜底（复用 `assignBucketOrder`）。
5. **只重建真正变化的会话对象**（被移动的那一条，以及 §2 里被改写 `isPinned` 的那一条），其余保持原对象引用 → `getSessionPersistenceChanges` 只会挑出 1~2 条落盘。

插入助手的取值规则：`insertAtBucketTop` 取该桶未置顶区最小 `sortOrder − SPACING`（桶内无会话则取 `SPACING`）；中点耗尽时同样走整桶重编号兜底。

---

## 6. 迁移与回填

在 `sessionInitialLoad.ts` 的加载流程里，紧邻现有分组回填逻辑（`:174-188`）增加：

- 对每个桶：若存在缺少 `sortOrder` 的会话 → 该桶按 `(pinned, 已有 sortOrder ?? timestamp 兜底)` 排序后整桶 `assignBucketOrder` 重编号，并持久化一次。
- 首次升级时全部缺键，结果等于升级前的 `(pinned, timestamp)` 顺序——**视觉零突变**。
- 已经是完整数字键的桶不做任何改动（避免每次启动都重写）。

导入数据（`useDataExport.ts:89-100` 整体序列化 `SavedChatSession`）会自带 `sortOrder`，无需改动；导入后若有缺键，由同一段回填逻辑处理。

---

## 7. 拖拽交互

### 7.1 落点语义

| 落点 | 行为 |
| --- | --- |
| 桶内某会话的上半/下半 | 插到它前/后，并同步 `isPinned = 目标会话.isPinned`（跨置顶边界＝置顶/取消置顶） |
| 另一个分组的会话上 | 移入该分组 **＋** 插到落点（沿用「拖到会话上＝入组」的现有语义，只是补上插入位置） |
| 分组标题（`GroupItem` 的 drop） | 移入该分组，插到该组内与自身 `isPinned` 相同区段的最前（`insertAtBucketTop`） |
| 列表空白 / `all-conversations` 容器 | 移出分组，插到未分组桶同 `isPinned` 区段的末尾（`insertAfterSession(..., null)`） |
| 时间视图 | 拖动整体禁用（`SessionItem.tsx:83` 的 `disableNativeDrag` 目前无任何调用方，正好启用），并给出提示文案 |

跨分组拖动时 `groupId` 与 `sortOrder` 必须在**同一个 updater** 内改完，避免中间态落盘两次。

### 7.2 插入指示线：从装饰变成真实契约

`useHistorySidebarLogic.ts:390-399` 已在计算 before/after 并渲染指示线，但 `SessionItem.tsx:162-171` 的 drop 处理完全忽略位置。改造后 drop 读 `sessionDropIndicator` 得到位置，调用新的 `onReorderSession(activeId, overId, position)`。指示线的 `before`/`after` 语义与 §5 的 `position` 参数一一对应，必须保持一致（同一常量/类型）。

### 7.3 「将置顶」提示（Q6）

落点位于置顶区（含目标项 `isPinned === true`）时，指示线切换为带图钉的样式并显示 `historyDropToPin` 文案；落点在非置顶区则维持现有样式。提示只反映 Q2 的既有行为，不新增确认步骤。

### 7.4 搜索过滤态下的落点映射

过滤后显示的是子集，落点邻居在完整桶序列里可能不相邻。重排必须先把落点映射回**完整桶序列**再计算 `sortOrder`（即：以完整序列中的邻居为基准取中点）。这是本设计最容易出错的一条，单独写测试。

### 7.5 i18n

`src/i18n/translations/history.ts` 新增（覆盖现有 7 种语言 en/zh/ja/ko/es/fr/de）：

- `historyDropToPin`：如 en `Drop to pin` / zh `松手即置顶`
- `historyReorderDisabledInTimeView`：如 en `Manual reordering is available in group view` / zh `手动排序仅在分组视图可用`

---

## 8. 改动文件清单

**核心**

- `src/types/chat.ts` — 新增 `sortOrder?`
- `src/stores/sessionOrder.ts`（新增）— §5 的纯函数
- `src/stores/sessionModels.ts` — 比较器改为 `pinned → sortOrder → timestamp`
- `src/hooks/chat/history/useGroupActions.ts` — 新增 `handleReorderSession`；`handleMoveSessionToGroup` 扩展为可携带插入位置
- `src/hooks/chat/history/sessionInitialLoad.ts` — 回填
- `src/hooks/chat/history/useSessionActions.ts` — 复制插到源会话后方
- 各 `createNewSession` 调用点（§2.4） — 改用插入助手

**UI**

- `src/components/sidebar/useHistorySidebarLogic.ts` — 排序、未分组去日期分类、drop 处理、时间视图禁用、置顶提示状态
- `src/components/sidebar/SessionItem.tsx` — drop 读位置并调用新回调；指示线的置顶样式
- `src/components/sidebar/GroupItem.tsx` — drop 到组标题的插入语义
- `src/components/sidebar/HistorySidebar.tsx` — 未分组区改平铺、传参与禁用态
- `src/components/sidebar/sidebarTypes.ts`、`src/components/layout/useMainContentViewModel.ts`、`src/hooks/chat/useChat.ts`、`src/hooks/chat/useChatHistory.ts` — 接线
- `src/components/command/GlobalCommandPalette.tsx` — `slice(0, 8)` 显式按 `timestamp` 排序，保住「最近」语义
- `src/components/sidebar/CollapsedRecentChatsButton.tsx` — 审计顺序依赖
- `src/i18n/translations/history.ts` — §7.5 文案

**不改**：`useDataExport` / `useDataImport`（整体序列化，自动随行）、`dbSchema.ts`（无需版本升级）。

---

## 9. 边界情况

1. 拖到自己 → 无操作。
2. 拖到相邻项的同侧（位置实际未变）→ **零写入**（返回原数组引用）。
3. 搜索过滤态下的落点映射（§7.4）。
4. 跨分组拖动时 `groupId` + `sortOrder` 单次提交。
5. 会话在拖动途中被删除/改名（含跨标签页）→ 纯函数按 id 找不到即原样返回。
6. 单会话桶、空桶、置顶区首/非置顶区尾等端点。
7. 中点空间耗尽 → 整桶重编号兜底（§5 步骤 4）。
8. 虚拟列表（>50 条走 `Virtuoso`，`LimitedSessionList.tsx:12`）与边缘自动滚动（`EDGE_SCROLL_ZONE_PX`）不受影响。
9. 流式生成中的会话被拖动 → 只改 `sortOrder`，不碰消息。
10. 多标签页并发：两个标签页算出同一个中点只会退化为 `timestamp` 兜底，顺序仍确定；`SESSIONS_UPDATED` 刷新后合并使用同一比较器，不会打乱手动顺序。
11. 「最近」语义的消费者（命令面板、折叠态按钮）不得被手动顺序污染。

---

## 10. 测试策略

- **新增** `src/stores/sessionOrder.test.ts`：中点取值（两侧/仅 prev/仅 next/空桶）、两端插入、拖到原位零改动（引用相等）、跨置顶时 `isPinned` 同步、兜底重编号路径、`insertAtBucketTop` / `insertAfterSession`、**只重建变化对象**（用引用断言）。
- **扩展** `src/hooks/chat/history/sessionInitialLoad.test.ts`：回填顺序等于 `(pinned, timestamp)`；已有完整数字键的桶不被改动。
- **扩展** `src/components/sidebar/useHistorySidebarLogic.test.ts`：新比较器；未分组区不再产生日期分类；过滤态落点映射；时间视图禁用拖动。
- **组件级**：drop 时 `onReorderSession` 收到正确的 `(activeId, overId, position)`；置顶区指示线样式；`draggable=false`（时间视图）。
- **更新**因排序语义变化而失效的既有测试（`sortSessionsInPlace` / 排序断言相关）。
- **E2E**（`e2e/sidebar-interactions.spec.ts`）：尝试一条真实拖拽用例。Playwright 对原生 HTML5 DnD 支持有限，若无法稳定通过则退回单测并在本文件注明，不硬凑。
- **性能不变量**（建议做成 spy 断言）：拖动一次后 `saveSession` 调用次数 ≤ 2，且与桶大小、拖动距离无关。

---

## 11. 验收标准

1. 桶内任意两条会话可互拖排序，**刷新后顺序保持**。
2. 拖到置顶区自动置顶，拖出自动取消置顶；置顶区显示「将置顶」提示。
3. **任何拖动/新建/复制只写 1~2 条记录**，与桶大小和拖动距离无关。
4. 发消息不再改变会话位置（`timestamp` 照常更新，但不再是排序键）。
5. 旧数据首次加载后顺序与升级前一致。
6. 时间视图行为不变且不可拖动；分组模式的未分组区不再有日期小标题。
7. 跨分组拖动＝移入＋插到落点。
8. `npm run verify`（format / typecheck / lint / test / knip / build）全绿。

---

## 12. 明确不做

- 触摸端拖拽（原生 HTML5 DnD 在触摸设备上本就不工作，分组拖拽同理）。
- 字符串分数序（`fractional-indexing`）——数字中点已满足需求。
- 「重置为时间顺序」入口。
- 时间视图的手动排序（Q3 已排除）。
- 折叠态「最近会话」的语义改造（只做审计，保证不被手动序污染）。

---

## 13. 风险与回滚

- **最大风险**是 §2.1 的收口点漏改：漏掉任何一处都会表现为「拖完被弹回」或「刷新后顺序变化」。缓解：比较器只保留一份实现，所有调用点复用；并补一条覆盖 `chatStore.updateAndPersistSessions` 的测试。
- 回滚：`sortOrder` 是新增可选字段，回滚代码后残留字段被忽略，不影响原有 `(pinned, timestamp)` 排序；无需数据清理。

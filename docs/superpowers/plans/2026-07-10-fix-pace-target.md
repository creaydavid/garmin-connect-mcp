---
change: fix-pace-target
design-doc: docs/superpowers/specs/2026-07-10-fix-pace-target-design.md
base-ref: d9dd291f9fef0fe35e48e15b23c8b68acc8940a8
archived-with: 2026-07-10-fix-pace-target
---

# fix-pace-target 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 pace target 的 refine 强制 One<=Two bug，并增强 pace 输入为 mm:ss（min/km）格式，由客户端转换为 Garmin 要求的 m/s 数值。

**Architecture:** DTO 层把 `targetValueOne/Two` 类型从 `number` 扩为 `number | string` + `z.union` 平行 schema，重写单个 `.refine` 内 if/else 按 targetType 分流（pace 校验 string+regex+防除零、不校验顺序；heart_rate 校验 number+One<=Two）。Client 层新增私有纯函数 `parsePaceToMs(value: string): number`（`1000 / (mm*60 + ss)` 不四舍五入），`buildExecutableStep` pace 分支用 typeof 收窄后调用转换。

**Tech Stack:** TypeScript (strict)、zod、tsup、Node.js 20+、MCP SDK。无测试框架。

**Design Doc:** `docs/superpowers/specs/2026-07-10-fix-pace-target-design.md`

## Global Constraints

- 无代码注释（CLAUDE.md 规则）
- 本地 import 不带扩展名（`.js` / `.ts` 均不带）
- 外部库 import 用完整路径（如 `zod`）
- DTO 显式 type + 平行 Zod schema（不用 `z.infer<>` 推导 type）
- `console.error()` 用于日志（stdio server 禁用 `console.log`）
- 不引入测试框架；验证靠 `npm run build` + `npx tsc --noEmit` + 人工核对 refine 逻辑 + 真实 API 冒烟
- 预存在 2 个 `garmin.client.test.ts` TS 错误（`getSteps` / `getLatestWeight`）与本 change 无关，忽略

archived-with: 2026-07-10-fix-pace-target
---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/dtos/workout.dto.ts` | 修改 | `ExecutableStepInput` type 的 targetValueOne/Two 改 `number \| string`；`executableStepSchema` 对应改 `z.union` + `.describe()`；重写 refine 按 targetType 分流 |
| `src/client/garmin.client.ts` | 修改 | 新增模块级私有 `parsePaceToMs(value: string): number`；`buildExecutableStep` pace 分支用 typeof 收窄 + `parsePaceToMs` 转换后赋值 |

不新建文件。两个文件改动相互独立可分别编译验证，但逻辑上 DTO 先行（定义输入契约），client 后行（消费契约）。

archived-with: 2026-07-10-fix-pace-target
---

### Task 1: DTO 层 — 类型与 schema 改为 number|string 联合 + 重写 refine 分流

**Files:**
- Modify: `src/dtos/workout.dto.ts`（第 4-45 行：`ExecutableStepInput` type + `executableStepSchema`）

**Interfaces:**
- Consumes: 无（本 task 是输入契约的源头）
- Produces: `ExecutableStepInput.targetValueOne?: number | string`、`ExecutableStepInput.targetValueTwo?: number | string`；`executableStepSchema` 的 `targetValueOne`/`targetValueTwo` 为 `z.union([z.number(), z.string()]).optional()` 并带 `.describe()`；refine 按 targetType 分流返回 boolean。Task 2 的 `buildExecutableStep` 消费此 type，pace 分支靠 `typeof === 'string'` 收窄后 parse。

- [x] **Step 1: 修改 `ExecutableStepInput` type 的 targetValueOne/Two 类型**

打开 `src/dtos/workout.dto.ts`，把第 9-10 行：

```typescript
  targetValueOne?: number;
  targetValueTwo?: number;
```

改为：

```typescript
  targetValueOne?: number | string;
  targetValueTwo?: number | string;
```

- [x] **Step 2: 修改 `executableStepSchema` 的 targetValueOne/Two 字段定义 + .describe()**

把第 27-28 行：

```typescript
    targetValueOne: z.number().optional(),
    targetValueTwo: z.number().optional(),
```

改为：

```typescript
    targetValueOne: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Target zone lower bound. pace: mm:ss (min/km) string like "5:48"; heart_rate: bpm number like 135'),
    targetValueTwo: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Target zone upper bound. pace: mm:ss (min/km) string like "6:30"; heart_rate: bpm number like 157'),
```

- [x] **Step 3: 重写 refine 校验逻辑按 targetType 分流**

把第 30-45 行的整个 `.refine(...)` 块：

```typescript
  .refine(
    (data) => {
      if (data.targetType === 'pace' || data.targetType === 'heart_rate') {
        return (
          data.targetValueOne !== undefined &&
          data.targetValueTwo !== undefined &&
          data.targetValueOne <= data.targetValueTwo
        );
      }
      return true;
    },
    {
      message:
        'targetType=pace or heart_rate requires targetValueOne and targetValueTwo, with targetValueOne <= targetValueTwo',
    },
  );
```

替换为按 targetType 分流的单个 refine（pace：成对 + string + regex `/^\d+:\d{2}$/` + totalSec!==0 防除零 + 不校验顺序；heart_rate：成对 + number + One<=Two；no.target/absent：不校验）：

```typescript
  .refine(
    (data) => {
      if (data.targetType === 'pace') {
        if (
          data.targetValueOne === undefined ||
          data.targetValueTwo === undefined
        ) {
          return false;
        }
        if (
          typeof data.targetValueOne !== 'string' ||
          typeof data.targetValueTwo !== 'string'
        ) {
          return false;
        }
        const paceRegex = /^\d+:\d{2}$/;
        if (!paceRegex.test(data.targetValueOne) || !paceRegex.test(data.targetValueTwo)) {
          return false;
        }
        const parseTotalSec = (v: string): number => {
          const [mm, ss] = v.split(':');
          return Number(mm) * 60 + Number(ss);
        };
        if (parseTotalSec(data.targetValueOne) === 0 || parseTotalSec(data.targetValueTwo) === 0) {
          return false;
        }
        return true;
      }
      if (data.targetType === 'heart_rate') {
        if (
          data.targetValueOne === undefined ||
          data.targetValueTwo === undefined
        ) {
          return false;
        }
        if (
          typeof data.targetValueOne !== 'number' ||
          typeof data.targetValueTwo !== 'number'
        ) {
          return false;
        }
        return data.targetValueOne <= data.targetValueTwo;
      }
      return true;
    },
    {
      message:
        'pace target requires targetValueOne/Two as mm:ss (min/km) strings, non-zero; heart_rate target requires targetValueOne/Two as numbers (bpm) with One <= Two',
    },
  );
```

- [x] **Step 4: 验证编译**

Run: `npm run build && npx tsc --noEmit`
Expected: 零新增 TS 错误。仅出现 2 个预存在错误可忽略：
- `src/client/garmin.client.test.ts(183,33): error TS2551: Property 'getSteps' does not exist`
- `src/client/garmin.client.test.ts(310,33): error TS2339: Property 'getLatestWeight' does not exist`

`workout.dto.ts` 本身零错误。`build` 成功产出 `build/` 目录。

- [x] **Step 5: 人工核对 refine 逻辑对照 spec scenario**

逐条核对 `openspec/changes/fix-pace-target/specs/workout-management/spec.md` 的 scenario：

| Scenario | 预期 | 核对点 |
|----------|------|--------|
| 配速目标用 mm:ss 输入并转换为 m/s | 通过 | `"5:00"`/`"6:00"` 均 string + 匹配 regex + totalSec=300/360≠0 → refine 返回 true |
| 配速目标缺区间端点时拒绝 | 失败 | 缺 targetValueTwo → undefined 检查返回 false |
| 配速目标 mm:ss 格式非法时拒绝 | 失败 | `"5:0"` 不匹配 `/^\d+:\d{2}$/` → 返回 false |
| 配速目标 0:00 除零拒绝 | 失败 | `"0:00"` totalSec=0 → 返回 false |
| 配速目标两端顺序不固定不拒绝 | 通过 | `"5:00"`/`"6:00"` 不校验顺序 → 返回 true（m/s 下 3.333>2.778 但 refine 不检查） |
| 心率目标保持 number 与 One≤Two 校验 | 通过 | 135/157 均 number + 135<=157 → 返回 true |
| 心率目标 One>Two 时拒绝 | 失败 | 157>135 → 返回 false |
| 无目标步骤 | 通过 | targetType 为 no.target 或 absent → 返回 true |

全部一致后继续。

- [x] **Step 6: Commit**

```bash
git add src/dtos/workout.dto.ts
git commit -m "fix(dto): pace target refine split by targetType, accept mm:ss string

- ExecutableStepInput.targetValueOne/Two: number -> number | string
- executableStepSchema: z.union([z.number(), z.string()]).optional()
- refine: pace validates string + regex + non-zero, no order check;
  heart_rate validates number + One<=Two; no.target skips
- .describe() clarifies pace=mm:ss(min/km), heart_rate=bpm

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-fix-pace-target
---

### Task 2: Client 层 — 新增 parsePaceToMs + buildExecutableStep pace 分支转换

**Files:**
- Modify: `src/client/garmin.client.ts`（第 112-147 行 `buildExecutableStep`；在第 112 行 `buildExecutableStep` 函数定义前新增 `parsePaceToMs`）

**Interfaces:**
- Consumes: Task 1 产出的 `ExecutableStepInput.targetValueOne?: number | string`
- Produces: `parsePaceToMs(value: string): number` 模块级私有纯函数；`buildExecutableStep` 对 pace 分支返回的 `result.targetValueOne`/`result.targetValueTwo` 为 number（m/s）

- [x] **Step 1: 新增模块级私有纯函数 `parsePaceToMs`**

在 `src/client/garmin.client.ts` 的 `buildExecutableStep` 函数定义之前（当前第 112 行 `function buildExecutableStep(...)` 之前），插入：

```typescript
function parsePaceToMs(value: string): number {
  const [mm, ss] = value.split(':');
  const totalSec = Number(mm) * 60 + Number(ss);
  return 1000 / totalSec;
}
```

公式 `1000 / (mm*60 + ss)` 不四舍五入（Garmin 真实数据有 7 位小数）。防除零由 DTO refine 层保证（`"0:00"` 已被拒绝），此处不重复检查。

- [x] **Step 2: 修改 `buildExecutableStep` 的 pace/heart_rate 赋值分支**

把第 141-144 行：

```typescript
  if (step.targetType === 'pace' || step.targetType === 'heart_rate') {
    result.targetValueOne = step.targetValueOne;
    result.targetValueTwo = step.targetValueTwo;
  }
```

替换为按 targetType 分流（pace：typeof 收窄 + parsePaceToMs 转换；heart_rate：透传 number；no.target：不进此分支，不设 targetValue）：

```typescript
  if (step.targetType === 'pace') {
    result.targetValueOne =
      typeof step.targetValueOne === 'string'
        ? parsePaceToMs(step.targetValueOne)
        : step.targetValueOne;
    result.targetValueTwo =
      typeof step.targetValueTwo === 'string'
        ? parsePaceToMs(step.targetValueTwo)
        : step.targetValueTwo;
  } else if (step.targetType === 'heart_rate') {
    result.targetValueOne = step.targetValueOne;
    result.targetValueTwo = step.targetValueTwo;
  }
```

typeof 收窄是防御性的：即使 refine 漏过非 string 的 pace 值，string 才 parse，number 直传不崩。

- [x] **Step 3: 验证编译**

Run: `npm run build && npx tsc --noEmit`
Expected: 零新增 TS 错误。仅 2 个预存在 `garmin.client.test.ts` 错误可忽略。`build` 成功。

确认 `parsePaceToMs` 的类型收窄无误：`step.targetValueOne` 类型为 `number | string | undefined`，`typeof === 'string'` 收窄后 `parsePaceToMs(step.targetValueOne)` 接收 `string`，else 分支为 `number | undefined`（pace 分支 refine 已保证 defined，TS 不感知但运行时安全）。

- [x] **Step 4: 人工核对转换精度**

核对 Design Doc D2 的转换公式与 spec scenario 的期望值：

| 输入 mm:ss | totalSec | m/s = 1000/totalSec | 量级核对 |
|-----------|----------|---------------------|---------|
| `"5:00"` | 300 | 3.333... | 与 spec scenario "3.333 m/s" 一致 |
| `"6:00"` | 360 | 2.777... | 与 spec scenario "2.778 m/s" 一致 |
| `"5:48"` | 348 | 2.8735... | 在真实 workout 数据 2.5-3.3 范围内 |

确认不四舍五入（直接返回浮点除法结果）。

- [x] **Step 5: 人工核对 buildExecutableStep 分支覆盖**

对照 spec scenario 的 no.target 情况：

- `step.targetType === undefined` 或 `'no.target'` → 不进 if/else if 分支 → `result` 不设 `targetValueOne`/`targetValueTwo` → 符合 spec "无目标步骤不设置 targetValue 字段"

对照 heart_rate：

- `step.targetType === 'heart_rate'` → else if 分支 → `result.targetValueOne = step.targetValueOne`（number 透传，不转换）→ 符合 spec "心率目标保持 number"

- [x] **Step 6: Commit**

```bash
git add src/client/garmin.client.ts
git commit -m "fix(client): convert pace mm:ss to m/s in buildExecutableStep

- add parsePaceToMs(value: string): number (1000 / (mm*60+ss), no rounding)
- pace branch: typeof narrow + parsePaceToMs before assigning targetValue
- heart_rate branch: passthrough number unchanged
- no.target: no targetValue set (unchanged)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-fix-pace-target
---

### Task 3: 真实 API 冒烟验证

**Files:**
- 无文件修改（仅运行验证）

**Interfaces:**
- Consumes: Task 1 + Task 2 的完整实现

**前置条件:** 真实 Garmin 账号凭据可用（`GARMIN_EMAIL` / `GARMIN_PASSWORD` 环境变量或已缓存 token `~/.garmin-mcp/`）

- [x] **Step 1: 构建 server**

Run: `npm run build`
Expected: 成功产出 `build/index.js`

- [x] **Step 2: 真实 API 冒烟 — 创建含 pace target 的 workout**

通过 MCP client 调用 `create_workout`，传入：

```json
{
  "workoutName": "pace-smoke-test",
  "estimatedDurationInSecs": 600,
  "steps": [
    {
      "type": "interval",
      "endCondition": "time",
      "endConditionValue": 60,
      "targetType": "pace",
      "targetValueOne": "5:00",
      "targetValueTwo": "6:00"
    }
  ]
}
```

Expected: Garmin 接受 payload（`targetValueOne=3.333...`, `targetValueTwo=2.777...` m/s），返回包含 `workoutId` 的响应。记录返回的 `workoutId`。

- [x] **Step 3: 验证转换精度被 Garmin 接受**

确认 Step 2 返回成功（无 4xx/5xx 错误，有 workoutId）。这证明 `1000/(mm*60+ss)` 产生的 m/s 量级（2.5-3.3）被 Garmin API 接受。

- [x] **Step 4: 冒烟后清理 — 删除测试 workout**

用 Step 2 返回的 `workoutId` 调用 `delete_workout`：

```json
{
  "workoutId": "<Step 2 返回的 workoutId>"
}
```

Expected: 删除成功（Garmin 返回 204 或成功状态）。

- [x] **Step 5: 记录冒烟结果**

在 commit message 或工作记录中记下：pace target `"5:00"`/`"6:00"`（min/km）成功转换为 m/s 被 Garmin 接受，返回 workoutId 后已清理。此步不产生代码 commit（无代码变更）。

archived-with: 2026-07-10-fix-pace-target
---

### Task 4: 文档检查

**Files:**
- 可能修改: `README.md`（仅当 Workouts section 有 target 格式说明时）

**Interfaces:**
- 无

- [x] **Step 1: 检查 README 的 Workouts section 是否有 target 说明**

检查 `README.md` 第 180-185 行的 Workouts section。当前内容仅为工具表格：

```
| `create_workout` | Create a running workout with steps (warmup, interval, recovery, cooldown, repeat groups) |
```

表格描述无 target 格式（pace mm:ss / heart_rate bpm）说明，无需更新 README（target 格式由 Zod schema 的 `.describe()` 在 tool 层暴露给 LLM，已足够）。

- [x] **Step 2: 确认 .describe() 已在 tool inputSchema 暴露**

确认 `src/tools/workout.tools.ts` 的 `create_workout` 用 `createWorkoutSchema.shape` 作为 `inputSchema`（`.describe()` 文本会通过 MCP 协议传给 LLM）。此步为只读核对，无代码变更。

- [x] **Step 3: 无 commit（本 task 无代码/文档变更）**

若 Step 1 发现 README 确有 target 说明需要更新，则补充 pace 用 mm:ss(min/km) 格式后 commit。当前判断无需更新。

archived-with: 2026-07-10-fix-pace-target
---

## Self-Review

**1. Spec coverage:**

| Spec Requirement / Scenario | 对应 Task |
|----------------------------|-----------|
| pace targetValueOne/Two 为 mm:ss string | Task 1 Step 2（z.union）+ Step 3（refine string 校验） |
| 客户端解析 mm:ss 转 m/s（1000/(mm*60+ss)） | Task 2 Step 1（parsePaceToMs）+ Step 2（pace 分支调用） |
| pace 两端成对、不校验顺序 | Task 1 Step 3（refine 不检查 One<=Two） |
| heart_rate 为 number + One<=Two | Task 1 Step 3（refine number + 顺序校验） |
| no.target 省略 targetValue | Task 2 Step 2（no.target 不进分支） |
| Scenario: 配速目标用 mm:ss 输入并转换为 m/s | Task 1 Step 5 + Task 2 Step 4 + Task 3 |
| Scenario: 配速目标缺区间端点时拒绝 | Task 1 Step 3 + Step 5 |
| Scenario: 配速目标 mm:ss 格式非法时拒绝 | Task 1 Step 3 + Step 5 |
| Scenario: 配速目标 0:00 除零拒绝 | Task 1 Step 3 + Step 5 |
| Scenario: 配速目标两端顺序不固定不拒绝 | Task 1 Step 3 + Step 5 |
| Scenario: 心率目标保持 number 与 One≤Two 校验 | Task 1 Step 3 + Step 5 |
| Scenario: 心率目标 One>Two 时拒绝 | Task 1 Step 3 + Step 5 |
| Scenario: 无目标步骤 | Task 2 Step 5 |
| Spec Patch: 0:00 除零 scenario（已在 spec.md） | 无需额外任务（spec 已含） |

无遗漏。

**2. Placeholder scan:**

无 TBD/TODO/"add appropriate"等占位符。每个 step 含完整代码或具体命令。

**3. Type consistency:**

- `parsePaceToMs(value: string): number` — Task 2 Step 1 定义，Step 2 调用，签名一致
- `targetValueOne?: number | string` — Task 1 Step 1 定义 type，Step 2 定义 schema，Task 2 Step 2 消费，类型一致
- `z.union([z.number(), z.string()]).optional()` — Task 1 Step 2 唯一出现处
- `typeof step.targetValueOne === 'string'` — Task 2 Step 2 收窄，与 `number | string` 联合类型一致
- refine 返回 `boolean` — Task 1 Step 3 所有分支均返回 true/false

无类型不一致。


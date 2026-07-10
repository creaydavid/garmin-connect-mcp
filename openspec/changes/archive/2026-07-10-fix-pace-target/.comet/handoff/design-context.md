# Comet Design Handoff

- Change: fix-pace-target
- Phase: design
- Mode: compact
- Context hash: 77919ad45c388eb10133d460f63101765dab0eee801b99f21b4c6b5f5943059b

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/fix-pace-target/proposal.md

- Source: openspec/changes/fix-pace-target/proposal.md
- Lines: 1-28
- SHA256: 3c339bf15db836a488f83be84ef7ad820ee3dcfb3ab5110f7daf65424b190de7

```md
## Why

`add-workout-crud`（已归档）首版未对 pace target 做真实 API 验证，Zod refine 错误地要求所有 target `targetValueOne <= targetValueTwo`。真实 Garmin API 验证（读取 50 个含 pace.zone target 的 workout）证明：pace target 用裸 **m/s** 数值（无 unit），且 `One/Two` 顺序不固定（既有 One<Two 也有 One>Two，因 m/s 越大越快）。当前 refine 会**错误拒绝**合法的 pace 区间（快端 m/s 数值大于慢端时）。同时 LLM 传裸 m/s 数值不直观，应支持人类可读的 mm:ss（min/km）格式输入。

## What Changes

- **BREAKING** pace target 的 `targetValueOne` / `targetValueTwo` 入参类型从 `number`（裸 m/s）改为 `string`（mm:ss 格式，min/km，如 `"5:48"`）。客户端自动解析并转换为 Garmin 要求的 m/s 数值（`m/s = 1000 / (mm*60 + ss)`）。
- 修复 refine 校验 bug：pace target 仅校验 `targetValueOne` 与 `targetValueTwo` 成对存在，**不校验顺序**（m/s 下两端顺序不固定）；heart_rate target 保持 `One <= Two`（bpm 慢端<快端）不变。
- pace targetValue 的 Zod schema 增加 mm:ss 格式校验（`/^\d+:\d{2}$/`）。
- 补充 `.describe()` 说明：pace targetValue 为 mm:ss（min/km）格式，客户端转 m/s。
- `buildExecutableStep` 组装逻辑：pace 分支增加 mm:ss→m/s 解析转换后再透传给 Garmin payload。

## Capabilities

### New Capabilities
<!-- 无新增 capability -->

### Modified Capabilities
- `workout-management`: "Workout targets" requirement 变更 — pace target 的 `targetValueOne`/`targetValueTwo` 语义从裸 m/s 数值改为 mm:ss（min/km）字符串输入（客户端转 m/s）；refine 规则从「所有 target One≤Two」改为「pace 仅校验成对、heart_rate 保持 One≤Two」。属 spec 行为变更，需 delta spec。

## Impact

- **代码**：
  - `src/dtos/workout.dto.ts`：`ExecutableStepInput.targetValueOne/Two` 类型按 targetType 区分（pace 为 string mm:ss，heart_rate 为 number bpm）—— 用 discriminated union 或保留 `number | string` 联合类型 + refine 分流；refine 逻辑改为 pace 仅校验成对、heart_rate 校验 One≤Two；pace schema 加 mm:ss regex。
  - `src/client/garmin.client.ts`：`buildExecutableStep` 的 pace 分支增加 `parsePaceToMs(value)` 解析 mm:ss→m/s 后再赋值 `targetValueOne/Two`。
- **API**：`create_workout` tool 的 pace target 入参类型 breaking 变更（number → string mm:ss）。首版未发布，无外部消费者。
- **依赖**：无新增依赖。
- **验证**：build 阶段需真实 API 冒烟测试含 pace target 的 workout（之前只测了 heart_rate），确认 mm:ss→m/s 转换后的 payload 被 Garmin 接受。

```

## openspec/changes/fix-pace-target/design.md

- Source: openspec/changes/fix-pace-target/design.md
- Lines: 1-63
- SHA256: cd3f89c23d6bd3ff9057b05b9a0ab82b5cb55cfa4e4991e74a4dbaef0e56ac3c

```md
## Context

`workout-management` capability（来自已归档 `add-workout-crud`）的 pace target 实现存在两处问题，经真实 Garmin API 验证暴露：

1. **refine bug**：`src/dtos/workout.dto.ts` 的 `executableStepSchema.refine` 对所有 target 强制 `targetValueOne <= targetValueTwo`。真实 API 验证（50 个含 pace.zone 的 workout）证明 pace 用 m/s，两端顺序不固定（One<Two 与 One>Two 都存在），当前 refine 会错误拒绝合法 pace 区间。
2. **输入不友好**：pace targetValue 当前为裸 m/s number，LLM 需自己换算（如 5:48 min/km → 2.8736 m/s），易出错。应支持 mm:ss（min/km）字符串输入。

真实 Garmin pace_zone 格式（已验证）：`targetValueOne/Two` = 裸 m/s 数值，`targetValueUnit` = null。代码透传裸数值本身正确，问题在入参类型与 refine。

约束（项目规则）：无代码注释、本地 import 无扩展名、DTO 显式 type + 平行 Zod schema、不引入测试框架。

## Goals / Non-Goals

**Goals:**
- 修复 pace refine bug：pace 仅校验成对存在，不校验顺序；heart_rate 保持 One≤Two。
- pace targetValue 改为 mm:ss（min/km）字符串输入，客户端自动转 m/s。
- 补充单位说明，避免 LLM 传错格式。
- 真实 API 冒烟验证 pace target（之前只验证了 heart_rate）。

**Non-Goals:**
- 不改 heart_rate target（保持 number bpm + One≤Two）。
- 不改 no.target / endCondition / stepType / repeat 逻辑。
- 不做 min/mi（英制）支持。
- 不改 create/delete/schedule 端点与签名。
- 不引入测试框架。

## Decisions

### Decision 1: pace targetValue 类型 = string（mm:ss），heart_rate 保持 number

**选择**：`targetValueOne/Two` 用联合类型 `number | string`，refine 按 targetType 分流校验：pace 必须是 mm:ss 字符串（`/^\d+:\d{2}$/`），heart_rate 必须是 number。客户端 `buildExecutableStep` 的 pace 分支把 mm:ss 解析为 m/s 后透传。

**为什么**：纯 mm:ss（方案 B）对 LLM 最友好（配速自然用 mm:ss 表达）；联合类型而非 discriminated union 是因为 `targetValueOne/Two` 字段名固定，只是值类型随 targetType 变化，联合类型 + refine 分流比改 type 结构更小。

**备选**：方案 C（number m/s 与 string mm:ss 皆收）更灵活但 schema 复杂、歧义大（LLM 传 2.88 是 m/s 还是 min/km？）。拒绝——强制 mm:ss 消除歧义。

### Decision 2: m/s 转换公式 = 1000 / (mm*60 + ss)

**选择**：min/km → m/s 用 `m/s = 1000 / (mm*60 + ss)`。例：`"5:48"` → 1000/348 = 2.8736 m/s。不四舍五入（Garmin 真实数据有 7 位小数，接受任意精度）。

**为什么**：min/km 即「每公里 mm 分 ss 秒」，速度 = 距离/时间 = 1000m / (mm*60+ss)秒。

### Decision 3: refine 按 targetType 分流

**选择**：
- `targetType === 'pace'`：targetValueOne/Two 必须成对存在，必须是 mm:ss 格式字符串，**不校验顺序**。
- `targetType === 'heart_rate'`：targetValueOne/Two 必须成对存在，必须是 number，`One <= Two`。
- `no.target`/absent：不校验 targetValue。

**为什么**：pace 的 m/s 两端顺序不固定（验证数据证明），强制顺序是 bug；heart_rate 的 bpm 慢端<快端是自然约定。

### Decision 4: mm:ss 解析函数放在 garmin.client.ts（buildExecutableStep 内）

**选择**：新增私有 `parsePaceToMs(value: string): number` 模块级函数，`buildExecutableStep` 的 pace 分支调用它把 mm:ss 转 m/s 后赋值 `result.targetValueOne/Two`。

**为什么**：与现有 `buildExecutableStep` 内联组装逻辑一致；解析是纯函数，放在 client 模块级（与 4 个 build 函数同级）。DTO 层只做格式校验（regex），不做转换（转换在客户端组装时做，DTO 保持输入原样）。

## Risks / Trade-offs

- **[Risk] mm:ss 转换后 payload 未对真实 API 验证** → build 阶段冒烟测试需测含 pace target 的 workout（之前只测 heart_rate），确认 Garmin 接受转换后的 m/s 数值。
- **[BREAKING] pace targetValue 类型 number→string** → 首版未发布，无外部消费者，可接受。
- **[Trade-off] 联合类型 `number | string`** → TS 类型层面 pace/heart_rate 的 targetValue 类型未严格区分（都是联合），靠 refine 运行时分流。可接受——discriminated union 会改 type 结构，改动过大。
- **[Risk] mm:ss 格式边界** → 只支持 `M:SS`/`MM:SS`（`/^\d+:\d{2}$/`），不支持 `H:MM:SS`。跑步配速通常 < 10 min/km，足够。极端长配速（>59:59 min/km）会被 regex 拒绝（可接受）。

```

## openspec/changes/fix-pace-target/tasks.md

- Source: openspec/changes/fix-pace-target/tasks.md
- Lines: 1-22
- SHA256: dccadc7010bc8b13e985b978da37d0780a6cd6bccb496912069811c944a5bd3d

```md
## 1. DTO 层（workout.dto.ts）

- [ ] 1.1 修改 `ExecutableStepInput` type：`targetValueOne`/`targetValueTwo` 类型从 `number` 改为 `number | string`（pace 用 string mm:ss，heart_rate 用 number）
- [ ] 1.2 修改 `executableStepSchema`：`targetValueOne`/`targetValueTwo` 从 `z.number().optional()` 改为 `z.union([z.number(), z.string()]).optional()`；`.describe()` 补充 pace 用 mm:ss(min/km)、heart_rate 用 bpm 说明
- [ ] 1.3 重写 `refine` 校验逻辑按 targetType 分流：pace — targetValueOne/Two 成对 + 必须是 string 匹配 `/^\d+:\d{2}$/`，不校验顺序；heart_rate — 成对 + 必须是 number + `One <= Two`；no.target/absent — 不校验。refine message 分类型描述
- [ ] 1.4 验证编译：`npm run build` + `npx tsc --noEmit`（新增代码零错误，2 个预存在 garmin.client.test.ts 错误可忽略）

## 2. 客户端组装（garmin.client.ts）

- [ ] 2.1 新增模块级私有纯函数 `parsePaceToMs(value: string): number`：解析 mm:ss（min/km）为 m/s，公式 `1000 / (mm*60 + ss)`，不四舍五入
- [ ] 2.2 修改 `buildExecutableStep` 的 pace 分支：`targetValueOne`/`targetValueTwo` 用 `parsePaceToMs` 转换后再赋值 `result.targetValueOne/Two`；heart_rate 分支保持透传 number；no.target 不设 targetValue
- [ ] 2.3 验证编译：`npm run build` + `npx tsc --noEmit`（零新增错误）

## 3. 真实 API 冒烟验证

- [ ] 3.1 用真实账号冒烟测试含 pace target 的 workout：`create_workout` 传入 `targetType:"pace", targetValueOne:"5:00", targetValueTwo:"6:00"`（min/km），确认 Garmin 接受转换后的 m/s payload 并返回 workoutId
- [ ] 3.2 验证转换精度：`"5:48"` → 2.8736 m/s 量级（对照真实 workout 数据 2.5-3.3 范围），确认 Garmin 不拒绝
- [ ] 3.3 冒烟后 `delete_workout` 清理

## 4. 文档

- [ ] 4.1 若 README 的 Workouts section 有 target 说明，补充 pace 用 mm:ss(min/km) 格式（检查 README 是否需要更新）

```

## openspec/changes/fix-pace-target/specs/workout-management/spec.md

- Source: openspec/changes/fix-pace-target/specs/workout-management/spec.md
- Lines: 1-49
- SHA256: d85d57ba335bdb4ad3d3975016de8b10332c0776996a939fad8ce04b51189ac9

```md
## MODIFIED Requirements

### Requirement: Workout targets

系统 SHALL 支持以下训练目标：`no.target`（workoutTargetTypeId=1）、`pace`（6，对应 pace_zone）、`heart_rate`（4，对应 heart_rate_zone）。`no.target` 时 targetValue 字段省略。

`pace` target 的 `targetValueOne` 与 `targetValueTwo` MUST 为 mm:ss 格式字符串（min/km，如 `"5:48"`），由客户端解析并转换为 Garmin 要求的 m/s 数值（`m/s = 1000 / (mm*60 + ss)`）后透传。pace 的两端 MUST 成对存在，**不校验顺序**（m/s 下两端顺序不固定）。

`heart_rate` target 的 `targetValueOne` 与 `targetValueTwo` MUST 为 number（bpm），成对存在且 `targetValueOne <= targetValueTwo`。

#### Scenario: 无目标步骤

- **WHEN** 传入 step 未提供 `targetType` 或 `targetType="no.target"`
- **THEN** 客户端组装 targetType 为 `{workoutTargetTypeId:1,workoutTargetTypeKey:"no.target"}`，不设置 targetValue 字段

#### Scenario: 配速目标用 mm:ss 输入并转换为 m/s

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:"5:00", targetValueTwo:"6:00"}`（min/km）
- **THEN** 客户端把 `"5:00"` 解析为 1000/300=3.333 m/s、`"6:00"` 解析为 1000/360=2.778 m/s，组装 payload 的 `targetValueOne=3.333, targetValueTwo=2.778`（m/s，顺序不翻转），透传给 Garmin

#### Scenario: 配速目标缺区间端点时拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:"5:00"}`（缺 targetValueTwo）
- **THEN** Zod schema refine 校验失败，tool 返回校验错误

#### Scenario: 配速目标 mm:ss 格式非法时拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:"5:0", targetValueTwo:"6:00"}`（"5:0" 不匹配 `/^\d+:\d{2}$/`）
- **THEN** Zod schema 校验失败，tool 返回校验错误

#### Scenario: 配速目标 0:00 除零拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:"0:00", targetValueTwo:"5:00"}`（"0:00" 转换会除零）
- **THEN** Zod schema refine 校验失败（防除零），tool 返回校验错误

#### Scenario: 配速目标两端顺序不固定不拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:"5:00", targetValueTwo:"6:00"}`（转换后 One=3.333 > Two=2.778）
- **THEN** Zod schema 校验通过（pace 不校验 One≤Two 顺序），客户端正常组装并透传

#### Scenario: 心率目标保持 number 与 One≤Two 校验

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"heart_rate", targetValueOne:135, targetValueTwo:157}`
- **THEN** Zod schema 校验通过（number bpm，One≤Two），客户端透传 targetValueOne=135, targetValueTwo=157

#### Scenario: 心率目标 One>Two 时拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"heart_rate", targetValueOne:157, targetValueTwo:135}`（One>Two）
- **THEN** Zod schema refine 校验失败（heart_rate 保持 One≤Two），tool 返回校验错误

```

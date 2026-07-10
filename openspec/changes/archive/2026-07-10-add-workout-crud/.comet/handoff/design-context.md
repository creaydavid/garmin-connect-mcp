# Comet Design Handoff

- Change: add-workout-crud
- Phase: design
- Mode: compact
- Context hash: 9b42a6932e1b280d60ab3a4907b4b166e774eb42b9a32e57cb882f9a8197190c

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/add-workout-crud/proposal.md

- Source: openspec/changes/add-workout-crud/proposal.md
- Lines: 1-33
- SHA256: d12039e0d2a3d1b811e27cc83a980080aeae1010fb4bc495538f6751231b1317

```md
## Why

当前 Garmin Connect MCP server 只能读取训练课程（`get_workouts` / `get_workout` / `get_scheduled_workout_by_id`），无法通过 MCP 创建、删除或排程训练课程。LLM 无法为用户生成并下发结构化跑步训练课（含热身、间歇、恢复、放松、重复组），限制了"AI 教练"类场景的闭环能力。仓库内已随附 `python-garminconnect` 参考实现（`workout.py` 类型化模型 + `__init__.py` 的 `upload_workout`/`delete_workout`/`schedule_workout` HTTP 契约），移植成本低、可行性高。

## What Changes

- 新增 MCP tool `create_workout`：接收高层语义化跑步训练课定义（名称、描述、预计时长、步骤数组），客户端组装 Garmin workout payload 后 `POST /workout-service/workout`。
- 新增 MCP tool `delete_workout`：按 workoutId 删除已创建的训练课，`DELETE /workout-service/workout/{workoutId}`。
- 新增 MCP tool `schedule_workout`：把训练课安排到指定日期，`POST /workout-service/schedule/{workoutId}`，body `{"date":"YYYY-MM-DD"}`。
- 新增 DTO + Zod schema：`workout.dto.ts`，定义 workout / segment / step（含 ExecutableStep 与 RepeatGroup）/ target / endCondition 的高层入参。
- 新增客户端方法 `createWorkout` / `deleteWorkout` / `scheduleWorkout`，并移植 `python-garminconnect/workout.py` 的 helper 逻辑（`create_warmup_step` / `create_interval_step` / `create_recovery_step` / `create_cooldown_step` / `create_repeat_group`）为 TypeScript payload 组装函数。
- 首版仅支持跑步（`sportTypeId=1, sportTypeKey=running`）；target 仅支持 `no.target` / `pace_zone` / `heart_rate_zone`；endCondition 支持 `time` / `distance`，repeat 组用 `iterations`。
- 在 `src/index.ts` 注册新的 `registerWorkoutTools`（与现有 `registerTrainingTools` 区分：前者为写操作 CRUD，后者为读操作）。

## Capabilities

### New Capabilities
- `workout-management`: 通过 MCP 创建、删除、排程 Garmin Connect 跑步训练课程，包含结构化步骤（热身/间歇/恢复/放松/重复组）与训练目标（无目标/配速区间/心率区间）的定义能力。

### Modified Capabilities
<!-- 无现有 spec 被修改。现有 get_workouts/get_workout/get_scheduled_workout_by_id 为读操作，行为不变。 -->

## Impact

- **代码**：
  - `src/client/garmin.client.ts`：新增 3 个方法（createWorkout / deleteWorkout / scheduleWorkout）+ 内部 payload 组装 helper。
  - `src/constants/garmin-endpoints.ts`：复用已有 `WORKOUT_ENDPOINT`、`SCHEDULED_WORKOUT_ENDPOINT`；可能新增 Garmin 内部 typeId 常量（SportType / StepType / ConditionType / TargetType），倾向放在新文件 `src/constants/workout-types.ts`。
  - `src/dtos/workout.dto.ts`：新增（type + Zod schema）。
  - `src/tools/workout.tools.ts`：新增 `registerWorkoutTools`。
  - `src/dtos/index.ts`、`src/tools/index.ts`、`src/constants/index.ts`、`src/index.ts`：barrel 与注册接入。
- **API**：MCP server 新增 3 个 tool（create_workout / delete_workout / schedule_workout），属 public API 新增，无 breaking change。
- **依赖**：无新增运行时依赖（不引入 pydantic 等价物，用现有 Zod + 客户端组装）。
- **参考来源**：`python-garminconnect/workout.py`（类型化模型与 helper）、`python-garminconnect/garminconnect/__init__.py:2775-2980`（HTTP 契约）。

```

## openspec/changes/add-workout-crud/design.md

- Source: openspec/changes/add-workout-crud/design.md
- Lines: 1-89
- SHA256: 24b2dad87e814f4777b756934d55b0e7b1398eaf222128370489f554d69b3514

[TRUNCATED]

```md
## Context

当前 Garmin Connect MCP server 通过 `registerTrainingTools` 暴露训练相关的**读**操作（`get_workouts` / `get_workout` / `get_training_plans` / `get_scheduled_workout_by_id`），客户端 `GarminClient` 已有对应只读方法。写操作方面，`write.tools.ts` + `write.dto.ts` + `createManualActivity` 等方法确立了"高层参数 + Zod schema 校验 + 客户端组装 payload + POST/PUT/DELETE"的既有模式。

仓库随附 `python-garminconnect` 参考实现，其中：
- `garminconnect/workout.py` 提供类型化模型（`RunningWorkout` / `WorkoutSegment` / `ExecutableStep` / `RepeatGroup`）与 helper 函数（`create_warmup_step` 等），并集中定义 Garmin 内部 typeId 常量（`SportType` / `StepType` / `ConditionType` / `TargetType`）。
- `garminconnect/__init__.py:2775-2980` 提供 HTTP 契约：`upload_workout`（POST `/workout-service/workout`）、`delete_workout`（DELETE `/workout-service/workout/{id}`）、`schedule_workout`（POST `/workout-service/schedule/{id}`，body `{"date":...}`）。

本 change 移植上述能力到 TypeScript，首版限定跑步 + 三类 target。

约束：
- 项目规则禁止代码注释、本地 import 不带扩展名、DTO 采用「显式 type + 平行 Zod schema」、stdio server 只用 `console.error`。
- 不引入新运行时依赖（不引入 pydantic 等价物）。

## Goals / Non-Goals

**Goals:**
- 让 LLM 能通过 3 个 MCP tool 完成跑步训练课的创建 / 删除 / 排程闭环。
- 用高层语义化入参屏蔽 Garmin payload 的 typeId/typeKey 嵌套细节，LLM 只需描述「步骤类型 + 时长/距离 + 目标类型 + 目标值」。
- 复用既有 write 模式（DTO + Zod + 客户端组装），保持代码风格一致。
- 集中维护 Garmin 内部 typeId 常量，避免散落硬编码。

**Non-Goals:**
- 不支持跑步以外运动类型（cycling/swimming/strength 等留待后续，但常量层预留全部枚举）。
- 不实现 workout 更新（PUT）。
- 不实现 FIT 下载、unschedule、训练计划写操作。
- 不做本地 workout 模板库持久化。
- 不引入类 pydantic 的运行时模型校验框架（用 Zod + 客户端组装替代）。

## Decisions

### Decision 1: 抽象层级 = 结构化高层 API（移植 workout.py helper 模式）

**选择**：LLM 传高层 `steps[]`，客户端内部组装 Garmin DTO。

**为什么**：Garmin workout payload 深度嵌套（segment→step，含 RepeatGroup 二级嵌套），且每个枚举值要同时填 `typeId` 和 `typeKey`（如 `{"stepTypeId":3,"stepTypeKey":"interval"}`）。若让 LLM 传 raw JSON，需记住全部 typeId，易错且不可校验。高层 API 让 LLM 只传 `stepType:"interval"`、`endCondition:"time"`、`endConditionValue:60`，客户端查常量表自动填双字段。

**备选**：A 透传 raw JSON（实现最快但 LLM 负担重、校验弱）；C 模板预设（不灵活）。均不采用。

### Decision 2: 不引入运行时模型层，用 DTO + Zod + 客户端组装函数

**选择**：`workout.dto.ts` 定义高层 type + Zod schema；`garmin.client.ts` 内部新增私有组装函数（移植 `create_warmup_step` 等为 TS），把高层入参映射成 Garmin payload。

**为什么**：与 `createManualActivity` 模式一致；不增加依赖；Zod schema 同时承担 MCP 入参校验和文档（`.describe()`）。pydantic 模型层的「extra=allow / model_dump(exclude_none)」等价于 TS 里「组装时按需填字段、undefined 字段不写入」。

**备选**：引入 zod 嵌套对象直接描述完整 Garmin payload（暴露 typeId 给 LLM）——拒绝，违反 Decision 1。

### Decision 3: typeId 常量集中放在 `src/constants/workout-types.ts`

**选择**：新建 `workout-types.ts`，导出 `SPORT_TYPE` / `STEP_TYPE` / `CONDITION_TYPE` / `TARGET_TYPE` 枚举对象（含 `id` 与 `key`），并提供 `runningSportType` 等组合常量。首版跑步相关值必填，其余枚举值预留（为后续运动类型扩展铺路）。

**为什么**：python 参考 `workout.py` 已枚举全部 ID，移植成本低；集中管理避免散落字符串/数字硬编码；`workout-types.ts` 与 `garmin-endpoints.ts` 同级，符合 constants 分层。

### Decision 4: tool 注册放新文件 `workout.tools.ts`，函数名 `registerWorkoutTools`

**选择**：与 `training.tools.ts`（读）分离。`training.tools.ts` 保留读操作不变；新建 `workout.tools.ts` 放 create/delete/schedule 三个写操作。

**为什么**：读写职责分离，避免 `training.tools.ts` 膨胀；命名上 `training`（读训练计划/课程）vs `workout`（写训练课 CRUD）语义清晰；与现有 `write.tools.ts`（通用写操作）相比，workout 有独立 DTO 与复杂 payload 组装，独立文件更内聚。

**备选**：合并进 `write.tools.ts`——拒绝，write.tools 是扁平参数的简单写操作，workout 的嵌套步骤组装与之差异大。

### Decision 5: 入参结构设计

高层入参（Zod schema）：
- `create_workout`：`{ workoutName, description?, estimatedDurationInSecs, steps: StepInput[] }`
- `StepInput`（discriminated union by `type`）：
  - 可执行步：`{ type: 'warmup'|'interval'|'recovery'|'cooldown'|'rest', endCondition: 'time'|'distance', endConditionValue: number, targetType?: 'no.target'|'pace'|'heart_rate', targetValueOne?: number, targetValueTwo?: number }`
  - 重复组：`{ type: 'repeat', numberOfIterations: number, steps: StepInput[] }`（递归，Zod 用 `z.lazy`）
- `delete_workout`：`{ workoutId: string }`
- `schedule_workout`：`{ workoutId: string, date: dateString }`

target 字段：`no.target` 时省略 targetValue；`pace`/`heart_rate` 必须提供 `targetValueOne` + `targetValueTwo`（区间两端），Zod 用 `refine` 校验配对。

### Decision 6: schedule 端点路径确认

python 库 `schedule_workout` 用 `POST /workout-service/schedule/{workout_id}`（body `{"date":...}`）。仓库已有 `SCHEDULED_WORKOUT_ENDPOINT = '/workout-service/schedule'`（被 `getScheduledWorkout` GET `/{id}` 复用）。新方法 `scheduleWorkout(workoutId, date)` 即 `POST ${SCHEDULED_WORKOUT_ENDPOINT}/${workoutId}`，与现有常量一致，无需新增端点常量。

## Risks / Trade-offs

- **[Risk] target 区间值格式未对真实 API 验证** → python 库 helper 默认只填 `no.target`，pace/heart_rate 区间在 Garmin payload 中的精确字段（`targetValueOne`/`targetValueTwo`/`targetValueUnit`）需在 build 阶段对照真实 workout JSON 验证；首版若无法验证，先按 python 模型推断的字段填充并在 tasks 中标注需手动验证。

```

Full source: openspec/changes/add-workout-crud/design.md

## openspec/changes/add-workout-crud/tasks.md

- Source: openspec/changes/add-workout-crud/tasks.md
- Lines: 1-40
- SHA256: b34dd165a4774c4303414cd39cca5da573c619abe8dbb36f5b38f60d3a79357f

```md
## 1. 常量层

- [ ] 1.1 新建 `src/constants/workout-types.ts`，移植 python `workout.py` 的 typeId 枚举：`SPORT_TYPE`（running/cycling/swimming/strength 等全量，含 id+key+displayOrder）、`STEP_TYPE`（warmup/cooldown/interval/recovery/rest/repeat/other/main）、`CONDITION_TYPE`（lap_button/time/distance/calories/power/heart_rate/iterations 等）、`TARGET_TYPE`（no_target/pace_zone/heart_rate_zone/cadence/speed_zone 等），每个枚举项含 id 与 key
- [ ] 1.2 在 `src/constants/workout-types.ts` 导出组合常量 `runningSportType`（`{sportTypeId:1, sportTypeKey:"running", displayOrder:1}`）及各 target/condition/stepType 的 `{id,key}` lookup helper
- [ ] 1.3 在 `src/constants/index.ts` barrel 导出 workout-types

## 2. DTO 层

- [ ] 2.1 新建 `src/dtos/workout.dto.ts`，定义高层入参 type + Zod schema：`CreateWorkoutDto`/`createWorkoutSchema`（workoutName 必填、description 可选、estimatedDurationInSecs 必填正整数、steps 非空数组）
- [ ] 2.2 在 workout.dto.ts 定义 `StepInput` discriminated union（按 `type` 区分可执行步与 repeat 组）：可执行步含 `type`(warmup/interval/recovery/cooldown/rest)、`endCondition`(time/distance)、`endConditionValue`、可选 `targetType`(no.target/pace/heart_rate) 与 `targetValueOne`/`targetValueTwo`；repeat 组含 `type:"repeat"`、`numberOfIterations`≥1、`steps` 递归数组
- [ ] 2.3 用 `z.lazy` 或 `z.union` 实现 StepInput 递归 schema，保证 RepeatGroup 可嵌套子步骤；对 targetType=pace/heart_rate 用 `refine` 校验 targetValueOne 与 targetValueTwo 必须成对出现
- [ ] 2.4 定义 `DeleteWorkoutDto`/`deleteWorkoutSchema`（workoutId 字符串）与 `ScheduleWorkoutDto`/`scheduleWorkoutSchema`（workoutId 字符串 + date dateString）
- [ ] 2.5 在 `src/dtos/index.ts` barrel 导出 workout DTO

## 3. 客户端 payload 组装

- [ ] 3.1 在 `src/client/garmin.client.ts` 新增私有组装函数（移植 python `workout.py` helper）：`buildExecutableStep`（映射 stepType/endCondition/targetType 到 Garmin ExecutableStepDTO 双字段）、`buildRepeatGroup`（映射 RepeatGroupDTO，递归组装子步骤）、`buildWorkoutSegment`、`buildWorkoutPayload`
- [ ] 3.2 组装函数从 `constants/workout-types` 查 typeId/key，按 python 参考填充 displayOrder/displayable/smartRepeat 等元数据字段；undefined 字段不写入 payload

## 4. 客户端方法

- [ ] 4.1 在 `garmin.client.ts` 新增 `createWorkout(input: CreateWorkoutDto): Promise<unknown>`，调用 buildWorkoutPayload 后 `POST /workout-service/workout`（复用 WORKOUT_ENDPOINT 常量）
- [ ] 4.2 新增 `deleteWorkout(workoutId: string): Promise<unknown>`，`DELETE /workout-service/workout/${workoutId}`（复用 WORKOUT_ENDPOINT）
- [ ] 4.3 新增 `scheduleWorkout(workoutId: string, date: string): Promise<unknown>`，`POST /workout-service/schedule/${workoutId}`，body `{date}`（复用 SCHEDULED_WORKOUT_ENDPOINT）

## 5. Tools 注册

- [ ] 5.1 新建 `src/tools/workout.tools.ts`，导出 `registerWorkoutTools(server, client)`，注册 `create_workout` / `delete_workout` / `schedule_workout` 三个 tool，inputSchema 用对应 Zod schema 的 `.shape`，返回 `content:[{type:'text', text:JSON.stringify(data,null,2)}]`
- [ ] 5.2 在 `src/tools/index.ts` barrel 导出 registerWorkoutTools
- [ ] 5.3 在 `src/index.ts` import 并调用 `registerWorkoutTools(server, client)`

## 6. 构建与验证

- [ ] 6.1 运行 `npm run build`（tsup）确认 TypeScript strict 编译通过，无类型错误
- [ ] 6.2 验证 target 区间（pace/heart_rate）payload 字段假设：对照 python `workout.py` 模型与真实 Garmin workout JSON（可通过既有 `get_workout` 读取一个含 target 的真实 workout 比对字段），修正 `buildExecutableStep` 中 targetValueOne/targetValueTwo/targetValueUnit 的填充逻辑
- [ ] 6.3 手动冒烟测试（需 GARMIN_EMAIL/GARMIN_PASSWORD 环境变量）：调用 create_workout 创建一个简单跑步课（warmup→interval→cooldown），确认返回 workoutId；调用 schedule_workout 排程；调用 delete_workout 清理

## 7. 文档

- [ ] 7.1 更新 README（若列有 tool 清单）：补充 create_workout / delete_workout / schedule_workout 三个 tool 及入参说明

```

## openspec/changes/add-workout-crud/specs/workout-management/spec.md

- Source: openspec/changes/add-workout-crud/specs/workout-management/spec.md
- Lines: 1-90
- SHA256: 5cd581b67a8bf4a3f8bf5151f1a4997d43a125e8a1246a3b8bca5b74518a0d93

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: Create running workout

系统 SHALL 提供 MCP tool `create_workout`，接收跑步训练课的高层语义化定义（名称、描述、预计时长、步骤数组），由客户端组装成 Garmin workout payload 并 `POST /workout-service/workout` 创建训练课。tool 入参 MUST 经 Zod schema 校验：`workoutName`（必填字符串）、`description`（可选字符串）、`estimatedDurationInSecs`（必填正整数）、`steps`（必填非空数组）。

#### Scenario: 创建含重复组的间歇跑步课

- **WHEN** LLM 调用 `create_workout`，传入 `workoutName="间歇跑"`、`estimatedDurationInSecs=1800`、steps 为 `[warmup 300s, repeat{6×[interval 60s, recovery 60s]}, cooldown 120s]`
- **THEN** 客户端组装 Garmin payload（sportType=running，单个 segment，含 ExecutableStep 与 RepeatGroupDTO），`POST /workout-service/workout`
- **AND** 返回 Garmin 响应（含分配的 workoutId）的 JSON 文本

#### Scenario: 步骤数组为空时拒绝创建

- **WHEN** LLM 调用 `create_workout`，传入 `steps=[]`
- **THEN** Zod schema 校验失败，tool 返回校验错误，不发起 HTTP 请求

#### Scenario: 重复组迭代次数为 0 时拒绝

- **WHEN** steps 中某 `type="repeat"` 步骤的 `numberOfIterations=0`
- **THEN** Zod schema 校验失败（`numberOfIterations` 必须 ≥1），不发起 HTTP 请求

### Requirement: Workout step types

系统 SHALL 支持以下 step 类型，并通过客户端组装映射到 Garmin 内部 typeId/typeKey 双字段：`warmup`（stepTypeId=1）、`interval`（3）、`recovery`（4）、`cooldown`（2）、`rest`（5）、`repeat`（6，对应 RepeatGroupDTO）。

#### Scenario: 可执行步映射 Garmin ExecutableStepDTO

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"no.target"}`
- **THEN** 客户端组装出 `{type:"ExecutableStepDTO", stepType:{stepTypeId:3,stepTypeKey:"interval"}, endCondition:{conditionTypeId:2,conditionTypeKey:"time"}, endConditionValue:60, targetType:{...no.target}}`

#### Scenario: 重复组映射 Garmin RepeatGroupDTO

- **WHEN** 传入 step `{type:"repeat", numberOfIterations:6, steps:[...]}`
- **THEN** 客户端组装出 `{type:"RepeatGroupDTO", stepType:{stepTypeId:6,stepTypeKey:"repeat"}, numberOfIterations:6, endCondition:{conditionTypeKey:"iterations"}, workoutSteps:[...]}`，其中 `workoutSteps` 为子步骤递归组装结果

### Requirement: Workout end conditions

系统 SHALL 支持以下 step 结束条件：`time`（conditionTypeId=2，值=秒数）、`distance`（conditionTypeId=3，值=米数）。repeat 组的结束条件固定为 `iterations`。

#### Scenario: 距离型结束条件

- **WHEN** 传入 step `{type:"interval", endCondition:"distance", endConditionValue:400}`
- **THEN** 客户端组装 endCondition `{conditionTypeId:3,conditionTypeKey:"distance"}`，endConditionValue=400

### Requirement: Workout targets

系统 SHALL 支持以下训练目标：`no.target`（workoutTargetTypeId=1）、`pace`（6，对应 pace_zone）、`heart_rate`（4，对应 heart_rate_zone）。`no.target` 时 targetValue 字段省略；`pace` 与 `heart_rate` MUST 提供区间两端值 `targetValueOne` 与 `targetValueTwo`。

#### Scenario: 无目标步骤

- **WHEN** 传入 step 未提供 `targetType` 或 `targetType="no.target"`
- **THEN** 客户端组装 targetType 为 `{workoutTargetTypeId:1,workoutTargetTypeKey:"no.target"}`，不设置 targetValue 字段

#### Scenario: 配速目标缺区间端点时拒绝

- **WHEN** 传入 step `{type:"interval", endCondition:"time", endConditionValue:60, targetType:"pace", targetValueOne:300}`（缺 targetValueTwo）
- **THEN** Zod schema refine 校验失败，tool 返回校验错误

### Requirement: Delete workout

系统 SHALL 提供 MCP tool `delete_workout`，接收 `workoutId`（字符串），调用 `DELETE /workout-service/workout/{workoutId}` 删除已创建的训练课。

#### Scenario: 删除已存在的训练课

- **WHEN** LLM 调用 `delete_workout`，传入有效的 `workoutId`
- **THEN** 客户端 `DELETE /workout-service/workout/{workoutId}`，返回 Garmin 响应的 JSON 文本（或删除成功确认）

### Requirement: Schedule workout

系统 SHALL 提供 MCP tool `schedule_workout`，接收 `workoutId`（字符串）与 `date`（YYYY-MM-DD 格式），调用 `POST /workout-service/schedule/{workoutId}`，body 为 `{"date":"<date>"}`，把训练课安排到指定日期。

#### Scenario: 排程训练课到指定日期

- **WHEN** LLM 调用 `schedule_workout`，传入 `workoutId="12345"` 与 `date="2026-07-15"`
- **THEN** 客户端 `POST /workout-service/schedule/12345`，body `{"date":"2026-07-15"}`，返回 Garmin 响应的 JSON 文本

#### Scenario: 日期格式非法时拒绝

- **WHEN** LLM 调用 `schedule_workout`，传入 `date="2026/07/15"`（非 YYYY-MM-DD）

```

Full source: openspec/changes/add-workout-crud/specs/workout-management/spec.md

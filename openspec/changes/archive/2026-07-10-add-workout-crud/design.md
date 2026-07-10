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
- **[Risk] Zod 递归 schema（RepeatGroup 嵌套 steps）** → `z.lazy` 实现递归类型，需注意 TS 类型推导；备选用 `z.array(z.union([...]))` + 手动类型注解。
- **[Trade-off] 高层 API 牺牲部分灵活性** → Garmin payload 的 `displayOrder`、`displayable`、`smartRepeat` 等元数据字段由组装函数按 python 参考硬填，LLM 无法覆盖。可接受：首版聚焦常见跑步课结构。
- **[Risk] createWorkout 返回的 workoutId 类型** → python 库返回 dict（含 Garmin 分配的 workoutId）；TS 方法返回 `Promise<unknown>`（与现有写方法一致），由 tool 层 JSON.stringify 透传。LLM 需从返回 JSON 提取 workoutId 用于后续 delete/schedule。
- **[Trade-off] 不暴露 `get_workout_types` 辅助 tool** → Garmin 有 `/workout-service/workout/types` 端点返回全部 typeId/typeKey。首版硬编码常量不暴露该 tool，常量层预留扩展；后续若 Garmin 改 ID 再加 tool。

## Open Questions

- target 区间（pace/heart_rate）的 `targetValueOne`/`targetValueTwo` 精确语义与单位（pace 是秒/米？heart_rate 是 bpm？）需在 build 阶段对照真实 workout JSON 确认。build 阶段第一个 task 即标注此为「需验证假设」。
- `estimatedDurationInSecs` 是否为必填（python `BaseWorkout` 标为必填 `int`）。首版按必填处理。

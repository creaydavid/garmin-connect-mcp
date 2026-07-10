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

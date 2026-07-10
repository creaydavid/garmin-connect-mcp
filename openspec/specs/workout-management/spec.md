# workout-management Specification

## Purpose
TBD - created by archiving change add-workout-crud. Update Purpose after archive.
## Requirements
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
- **THEN** Zod schema（dateString）校验失败，tool 返回校验错误，不发起 HTTP 请求

### Requirement: Running-only scope

首版系统 SHALL 仅支持跑步运动类型（sportTypeId=1, sportTypeKey=running），所有创建的 workout 的 segment sportType 固定为 running。typeId 常量层 SHALL 预留其他运动类型枚举以备后续扩展，但 tool 入参不暴露运动类型选择。

#### Scenario: 创建的 workout sportType 固定为 running

- **WHEN** LLM 调用 `create_workout` 创建任意训练课
- **THEN** 客户端组装的 payload 中 workout 与所有 segment 的 sportType 固定为 `{sportTypeId:1, sportTypeKey:"running", displayOrder:1}`，不受入参影响


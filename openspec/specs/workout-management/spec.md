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


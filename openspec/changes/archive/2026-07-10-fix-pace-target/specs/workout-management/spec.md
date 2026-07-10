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

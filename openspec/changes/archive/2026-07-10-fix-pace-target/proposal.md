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

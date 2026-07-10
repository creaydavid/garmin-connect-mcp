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

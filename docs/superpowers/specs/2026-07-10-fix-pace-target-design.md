---
comet_change: fix-pace-target
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-10-fix-pace-target
status: final
---

# Design Doc: fix-pace-target

修复 `workout-management` capability 的 pace target refine bug，并增强 pace 输入为 mm:ss（min/km）格式。本文是对 open 阶段 `design.md` 高层框架的深度技术细化，不重写 proposal/spec。

## 上下文

- 上游事实源：`openspec/changes/fix-pace-target/` 下 proposal.md / design.md / tasks.md / specs/workout-management/spec.md（MODIFIED）
- 验证证据：本会话用真实 Garmin 账号读取 50 个含 pace.zone target 的 workout，确认 pace target 用裸 m/s 数值（targetValueUnit=null），One/Two 顺序不固定（既有 One<Two 也有 One>Two）
- 现有代码：`src/dtos/workout.dto.ts` 的 `executableStepSchema.refine` 强制所有 target `One<=Two`（对 pace 是 bug）；`buildExecutableStep` 透传裸 targetValue 数值
- 约束：无代码注释、本地 import 无扩展名、DTO 显式 type + 平行 Zod schema、不引入测试框架

## 已确认的深度设计决策

### D1. TS 类型 = 联合类型 number|string + typeof 收窄（方案 A）

`ExecutableStepInput.targetValueOne/Two` 类型从 `number` 改为 `number | string`（optional）。Zod schema 对应 `z.union([z.number(), z.string()]).optional()`。

- type 层面不强制 pace=string（pace 和 heart_rate 的 targetValue 都是联合类型），靠 refine 运行时分流保证 pace=string、heart_rate=number
- `buildExecutableStep` pace 分支用 `typeof step.targetValueOne === 'string' ? parsePaceToMs(step.targetValueOne) : step.targetValueOne` 收窄——防御性，即使 refine 漏过，string 才 parse，number 直传不崩
- `.describe()`：`targetValueOne`/`targetValueTwo` 描述 pace 用 mm:ss(min/km)、heart_rate 用 bpm number

备选（拒绝）：discriminated union on targetType 严格但改 type 结构过大；全 string 让 heart_rate 不一致。

### D2. mm:ss 解析 + 防除零（仅防除零）

`parsePaceToMs(value: string): number`：
- split `:` → `[mm, ss]`，`totalSec = Number(mm)*60 + Number(ss)`
- `m/s = 1000 / totalSec`（不四舍五入，Garmin 真实数据有 7 位小数）
- 防除零：refine 层拒绝 `totalSec === 0`（即 `"0:00"`），parsePaceToMs 不会收到 0
- 不限制正常配速范围（不误拒越野跑/步行慢配速）

regex `/^\d+:\d{2}$/` 校验格式（DTO refine 已校验，parsePaceToMs 防御性 split）。

### D3. refine = 单个 .refine 内 if/else 分流（方案 A）

单个 `.refine` 内按 targetType 分支，分类型 message：
- `targetType === 'pace'`：targetValueOne/Two 必须 defined + 必须 string + 匹配 `/^\d+:\d{2}$/` + totalSec !== 0（防除零）+ **不校验顺序**。message: "pace target requires targetValueOne/Two as mm:ss (min/km) strings, non-zero"
- `targetType === 'heart_rate'`：targetValueOne/Two 必须 defined + 必须 number + `One <= Two`。message: "heart_rate target requires targetValueOne/Two as numbers (bpm) with One <= Two"
- `no.target`/absent：不校验 targetValue

备选（拒绝）：链式多 refine message 更精确但链长，与现有单个 refine 结构不一致。

### D4. buildExecutableStep 改动

- pace 分支：`result.targetValueOne = parsePaceToMs(step.targetValueOne as string)`；`result.targetValueTwo = parsePaceToMs(step.targetValueTwo as string)`（转 m/s 后赋值）
- heart_rate 分支：`result.targetValueOne = step.targetValueOne`（number 透传，不变）
- no.target：不设 targetValue（不变）
- `parsePaceToMs` 为新增模块级私有纯函数（与 4 个 build 函数同级）

## 模块结构

```
src/
  dtos/
    workout.dto.ts   改：targetValueOne/Two 类型 number|string + z.union + 重写 refine 分流 + .describe()
  client/
    garmin.client.ts 改：新增 parsePaceToMs 私有函数 + buildExecutableStep pace 分支调用转换
```

## 数据流

```
LLM 调 create_workout，step { targetType:"pace", targetValueOne:"5:00", targetValueTwo:"6:00" }
  → createWorkoutSchema (.shape) 校验
  → refine 分流：pace → 校验 string + regex + 防除零 + 成对（不校验顺序）
  → GarminClient.createWorkout → buildWorkoutPayload → buildWorkoutSegment → buildExecutableStep
  → pace 分支：parsePaceToMs("5:00")=3.333, parsePaceToMs("6:00")=2.778
  → result.targetValueOne=3.333, result.targetValueTwo=2.778（m/s，顺序不翻转）
  → this.request POST /workout-service/workout（payload targetValue 为 m/s 数值）
  → Garmin 接受，返回 workoutId
```

## 边界条件

- pace 缺一个端点 → refine 拒绝（成对校验）
- pace targetValue 不是 string（传了 number）→ refine 拒绝
- pace mm:ss 格式非法（"5:0" / "abc" / "5"）→ refine regex 拒绝
- pace "0:00" → refine 拒绝（防除零）
- pace One>Two（m/s，如 "5:00"/"6:00" 转 3.333/2.778）→ 通过（不校验顺序）
- heart_rate 缺端点 → refine 拒绝
- heart_rate targetValue 不是 number → refine 拒绝
- heart_rate One>Two → refine 拒绝
- no.target 传了 targetValue → 不校验（透传时 buildExecutableStep 不设 targetValue）

## 测试策略

不引入测试框架。三层手动验证：
1. `npm run build` + `npx tsc --noEmit`（零新增错误，2 个预存在 garmin.client.test.ts 错误可忽略）
2. 对照 spec scenario 人工核对 refine 逻辑（pace mm:ss 通过/缺端点拒绝/格式非法拒绝/0:00 拒绝/顺序不固定通过；heart_rate 通过/One>Two 拒绝）
3. 真实 API 冒烟：create_workout 含 pace target "5:00"/"6:00"（min/km）→ 转 3.333/2.778 m/s → Garmin 接受返回 workoutId → delete_workout 清理

## Spec Patch

回写 `specs/workout-management/spec.md` 补充 1 个 scenario：配速目标 0:00 除零拒绝（`targetValueOne:"0:00"` → refine 失败）。

## 开放问题

- mm:ss→m/s 转换后的 payload 是否被 Garmin 接受：build 阶段冒烟验证（之前只测了 heart_rate）。转换公式 1000/(mm*60+ss) 产生的 m/s 量级（2.5-3.3）与真实 workout 数据一致，推断可接受。


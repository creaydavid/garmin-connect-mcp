# Brainstorm Summary

- Change: fix-pace-target
- Date: 2026-07-10

## 确认的技术方案

修复 pace target refine bug + pace targetValue 改 mm:ss(min/km) 输入。在 open 4 项决策基础上，深度设计细化 3 项实现决策：

1. **TS 类型（方案 A）**：targetValueOne/Two 用 `number | string` 联合类型，Zod `z.union([z.number(), z.string()]).optional()`。buildExecutableStep pace 分支用 `typeof === 'string' ? parsePaceToMs(...) : value` 收窄。type 层不强制 pace=string（靠 refine 运行时），typeof 收窄是防御性。
2. **mm:ss 防除零（仅防除零）**：regex `/^\d+:\d{2}$/` + refine 拒绝 totalSec===0（即 "0:00"）。不限制正常配速范围。parsePaceToMs: `1000/(mm*60+ss)`，不四舍五入。
3. **refine 实现（方案 A）**：单个 `.refine` 内 if/else 按 targetType 分流，分类型 message。pace 校验成对+string+regex+防除零+不校验顺序；heart_rate 校验成对+number+One≤Two；no.target 不校验。

buildExecutableStep：pace 分支 `parsePaceToMs(step.targetValueOne as string)` 转 m/s 后赋值；heart_rate 透传 number；no.target 不设 targetValue。

## 关键取舍与风险

- **[BREAKING] pace targetValue number→string**：首版未发布，无外部消费者，可接受。
- **[Trade-off] 联合类型 number|string**：type 层不严格区分 pace/heart_rate targetValue 类型，靠 refine 运行时分流 + buildExecutableStep typeof 收窄。可接受——discriminated union 改 type 结构改动过大。
- **[Risk] mm:ss→m/s 转换未对真实 API 验证**：build 阶段冒烟测含 pace target 的 workout（之前只测 heart_rate）。
- **[Risk] 防除零**："0:00" 会导致 1000/0=Infinity，refine 必须拒绝。

## 测试策略

不引入测试框架。三层手动验证：
1. `npm run build` + `npx tsc --noEmit`（零新增错误）
2. 对照 spec scenario 人工核对 refine 逻辑
3. 真实 API 冒烟：create_workout 含 pace target "5:00"/"6:00"（min/km）→ 转 3.333/2.778 m/s → Garmin 接受 → delete_workout 清理

## Spec Patch

回写 specs/workout-management/spec.md 补充 1 个 scenario：
- 配速目标 0:00 除零拒绝：`targetType:"pace", targetValueOne:"0:00", targetValueTwo:"5:00"` → refine 校验失败（防除零）

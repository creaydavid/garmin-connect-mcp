# Brainstorm Summary

- Change: add-workout-crud
- Date: 2026-07-10

## 确认的技术方案

移植 `python-garminconnect/workout.py` 的类型化模型 + helper 模式到 TypeScript，新增 3 个 MCP tool（create_workout / delete_workout / schedule_workout）实现跑步训练课的创建/删除/排程闭环。复用既有 write 模式（DTO 显式 type + 平行 Zod schema + 客户端组装 payload）。

在 open 阶段 6 项决策基础上，深度设计新增 5 项实现层决策：

1. **target 区间值**：pace/heart_rate 用 `targetValueOne`/`targetValueTwo` 裸数值区间两端，不处理 `targetValueUnit`；Zod refine 校验成对且 One≤Two。no.target 不设 targetValue。
2. **递归 schema + 深度限制**：显式定义递归 type（StepInput = ExecutableStepInput | RepeatStepInput），Zod 用 z.lazy。**限制 repeat 嵌套深度 ≤1**——RepeatStepInput.steps 类型为 ExecutableStepInput[]（非 StepInput[]），类型与 schema 一致禁止嵌套 repeat。
3. **payload 字段范围**：createWorkout payload 严格对齐 python BaseWorkout.to_dict(exclude_none=True)，只发 workoutName/sportType/estimatedDurationInSecs/description?/author:{}/workoutSegments。不补 workoutProvider/shared 等元数据，让 Garmin 服务端补默认值。
4. **组装函数**：garmin.client.ts 新增 4 个模块级私有纯函数 buildExecutableStep / buildRepeatGroup / buildWorkoutSegment / buildWorkoutPayload，移植 python helper；stepOrder 由数组索引+1 自动生成。
5. **测试策略**：不引入测试框架。三层手动验证：tsup 编译 + payload 结构比对（对照 python sample_running_workout.py 输出）+ 真实 API 冒烟（create→schedule→delete，含 E 区心率 135-157 target）。

## 关键取舍与风险

- **[Risk] target 区间值未对真实 API 验证** → python 库 helper 默认只填 no.target，pace/heart_rate 的 targetValueOne/Two/unit 精确字段需 build 阶段 task 6.2 用真实 workout JSON 验证；首版不填 unit，若被 Garmin 拒再补。
- **[Risk] payload 最小字段集可能被 Garmin 拒** → 严格对齐 python（已验证可行），但若 Garmin 要求某字段必填返回 400，按错误信息补字段。
- **[Trade-off] repeat 嵌套限深度≤1** → 牺牲深层嵌套能力（6×(5×(...))），可接受——跑步课极少用，Garmin UI 也不支持任意深度。
- **[Trade-off] 不引入测试框架** → 无自动化回归保护；组装是 python 已验证逻辑的直接移植，结构比对+冒烟足够建立信心。
- **[Trade-off] 不暴露 targetValueUnit / sportType 选择** → 首版仅跑步 + no.target/pace/heart_rate，常量层预留全枚举备扩展。

## 测试策略

不引入测试框架（项目现状无 vitest/jest）。三层手动验证：
1. `npm run build`（tsup）TypeScript strict 编译通过
2. payload 结构比对：buildWorkoutPayload(示例) 输出 vs python sample_running_workout.py 的 to_dict() 输出，逐字段比对
3. 真实 API 冒烟（需 GARMIN_EMAIL/GARMIN_PASSWORD）：create_workout（warmup→interval→cooldown，interval 带 heart_rate target 135-157）→ 确认 workoutId → schedule_workout → delete_workout → get_workout 应 404

## Spec Patch

无。open 阶段 specs/workout-management/spec.md 的 7 个 requirement / 11 个 scenario 已覆盖深度设计。repeat 嵌套深度限制属实现约束（非能力需求），放 Design Doc 而非 spec。

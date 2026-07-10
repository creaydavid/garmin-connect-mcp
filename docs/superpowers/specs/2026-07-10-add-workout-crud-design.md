---
comet_change: add-workout-crud
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-10-add-workout-crud
status: final
---

# Design Doc: add-workout-crud

为 Garmin Connect MCP server 新增跑步训练课的创建/删除/排程能力。本文是对 open 阶段 `design.md` 高层框架的深度技术细化，不重写 proposal/spec。

## 上下文

- 上游事实源：`openspec/changes/add-workout-crud/` 下的 proposal.md / design.md / tasks.md / specs/workout-management/spec.md
- 参考实现：仓库随附 `python-garminconnect/`，其中 `garminconnect/workout.py`（类型化模型 + helper + typeId 常量）与 `garminconnect/__init__.py:2775-2980`（HTTP 契约）
- 既有模式：`write.tools.ts` + `write.dto.ts` + `GarminClient.createManualActivity`（高层参数 + Zod + 客户端组装 + POST）
- 请求机制：`GarminAuth.request` 用 axios，`body` 自动 JSON 序列化并设 `Content-Type: application/json`，401 自动 re-auth 重试

## 已确认的深度设计决策

### D1. target 区间值

pace / heart_rate target 用 `targetValueOne` + `targetValueTwo` 两个裸数值表达区间两端，**不处理 `targetValueUnit`**（不填该字段，不暴露给 LLM）。

| targetType | workoutTargetTypeId | key | targetValue |
|---|---|---|---|
| no.target | 1 | no.target | 不设 |
| pace | 6 | pace_zone | targetValueOne + targetValueTwo（必填） |
| heart_rate | 4 | heart_rate_zone | targetValueOne + targetValueTwo（必填） |

Zod `refine`：targetType 为 pace/heart_rate 时，targetValueOne 与 targetValueTwo 必须成对且 `One ≤ Two`。

示例（用户储备心率 E 区）：`{ targetType:"heart_rate", targetValueOne:135, targetValueTwo:157 }`。

风险：Garmin 可能要求 `targetValueUnit`。缓解：build 阶段 task 6.2 用真实 workout JSON 验证，被拒则补 unit。

### D2. 递归 schema + 嵌套深度限制

显式定义递归 type（不从 schema 推导，符合项目 DTO 规则），Zod 用 `z.lazy`。**限制 repeat 嵌套深度 ≤1**。

```typescript
export type ExecutableStepInput = {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'rest';
  endCondition: 'time' | 'distance';
  endConditionValue: number;
  targetType?: 'no.target' | 'pace' | 'heart_rate';
  targetValueOne?: number;
  targetValueTwo?: number;
};

export type RepeatStepInput = {
  type: 'repeat';
  numberOfIterations: number;
  steps: ExecutableStepInput[];
};

export type StepInput = ExecutableStepInput | RepeatStepInput;
```

- `RepeatStepInput.steps` 类型为 `ExecutableStepInput[]`（非 `StepInput[]`），类型层面禁止嵌套 repeat
- Zod：`stepSchema = z.lazy(() => z.union([executableStepSchema, repeatStepSchema]))`；repeat 内部 `steps: z.array(executableStepSchema)`（非递归），与 type 一致限制深度
- `numberOfIterations` ≥ 1

取舍：丧失深层嵌套（6×(5×(...))），可接受——跑步课极少用，Garmin UI 也不支持任意深度。

### D3. payload 字段范围

createWorkout payload **严格对齐 python `BaseWorkout.to_dict(exclude_none=True)`**，只发送 python 模型显式定义的字段：

```json
{
  "workoutName": "...",
  "sportType": { "sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1 },
  "estimatedDurationInSecs": 1800,
  "description": "...",
  "author": {},
  "workoutSegments": [
    { "segmentOrder": 1, "sportType": {...}, "workoutSteps": [...] }
  ]
}
```

- **不补** `workoutProvider`/`workoutSourceId`/`shared`/`consumed`/`estimate`/`sync`/`workoutId`/`ownerId` 等
- 让 Garmin 服务端补默认值（python 库已验证可行）
- `undefined` 字段不写入 payload（等价 `exclude_none`）

风险：若 Garmin 要求某字段必填返回 400。缓解：task 6.2 冒烟验证，按错误信息补字段。

### D4. 组装函数

`garmin.client.ts` 新增 4 个**模块级私有**纯函数（非类方法，不导出），移植 python `workout.py` helper：

| 函数 | 职责 |
|---|---|
| `buildExecutableStep(step, order)` | `ExecutableStepInput` → Garmin ExecutableStepDTO（查常量填 typeId/key 双字段 + displayOrder/displayable） |
| `buildRepeatGroup(step, order)` | `RepeatStepInput` → RepeatGroupDTO（numberOfIterations + iterations endCondition + `workoutSteps: step.steps.map((s,i)=>buildExecutableStep(s,i+1))`） |
| `buildWorkoutSegment(steps)` | `StepInput[]` → `{segmentOrder:1, sportType:running, workoutSteps: steps.map((s,i)=> s.type==='repeat'? buildRepeatGroup(s,i+1): buildExecutableStep(s,i+1))}` |
| `buildWorkoutPayload(input)` | `CreateWorkoutDto` → 完整 payload |

- `stepOrder` / `segmentOrder` 由数组索引 `+1` 自动生成，LLM 不传
- target 组装：no.target 填 `{workoutTargetTypeId:1, workoutTargetTypeKey:"no.target"}` 不设 targetValue；pace/heart_rate 填对应 typeId/key + targetValueOne/Two
- 纯函数，方便结构比对验证

### D5. 测试策略

不引入测试框架（项目现状无 vitest/jest）。三层手动验证：

1. **编译**：`npm run build`（tsup）TypeScript strict 通过
2. **payload 结构比对**：`buildWorkoutPayload(示例)` 输出 vs python `test_data/sample_running_workout.py` 的 `to_dict()` 输出，逐字段比对（python 端可 `python -c "from test_data.sample_running_workout import create_sample_running_workout; print(create_sample_running_workout().to_dict())"` 取参考输出）
3. **真实 API 冒烟**（需 GARMIN_EMAIL/GARMIN_PASSWORD）：
   - create_workout（warmup→interval→cooldown，interval 带 heart_rate target 135–157）→ 确认 workoutId
   - schedule_workout(workoutId, 日期) → 确认排程
   - delete_workout(workoutId) → 确认删除（get_workout 应 404）
   - 若 pace/heart_rate target 被拒，记录错误并回退 task 6.2 补 `targetValueUnit`

## 模块结构

```
src/
  constants/
    workout-types.ts     新增：SPORT_TYPE/STEP_TYPE/CONDITION_TYPE/TARGET_TYPE 枚举 + runningSportType + lookup
    index.ts             改：barrel 导出
  dtos/
    workout.dto.ts       新增：CreateWorkoutDto/schema + StepInput discriminated union + DeleteWorkoutDto/schema + ScheduleWorkoutDto/schema
    index.ts             改：barrel 导出
  client/
    garmin.client.ts     改：新增 buildExecutableStep/buildRepeatGroup/buildWorkoutSegment/buildWorkoutPayload 私有函数 + createWorkout/deleteWorkout/scheduleWorkout 方法
  tools/
    workout.tools.ts     新增：registerWorkoutTools（create_workout/delete_workout/schedule_workout）
    index.ts             改：barrel 导出
  index.ts               改：import + 调用 registerWorkoutTools
```

## 数据流

```
LLM 调用 create_workout({workoutName, estimatedDurationInSecs, steps:[...]})
  → MCP registerTool 入参经 createWorkoutSchema (.shape) 校验
  → GarminClient.createWorkout(input)
  → buildWorkoutPayload(input)
      ├─ buildWorkoutSegment(steps)
      │   ├─ buildExecutableStep(...)  // 查 STEP_TYPE/CONDITION_TYPE/TARGET_TYPE 常量填双字段
      │   └─ buildRepeatGroup(...)     // 递归 buildExecutableStep
      └─ 组装 {workoutName, sportType:running, estimatedDurationInSecs, description?, author:{}, workoutSegments:[...]}
  → this.request(WORKOUT_ENDPOINT, {method:'POST', body: payload})
  → GarminAuth.request → axios POST /workout-service/workout
  → 返回 Garmin 响应（含 workoutId）→ JSON.stringify 透传给 LLM
```

## 边界条件

- steps 空数组 → Zod 拒绝（`z.array(...).min(1)`）
- repeat numberOfIterations=0 → Zod 拒绝（`.int().min(1)`）
- repeat 内嵌 repeat → 类型层面拒绝（RepeatStepInput.steps: ExecutableStepInput[]）
- pace/heart_rate 缺 targetValueTwo → Zod refine 拒绝
- pace/heart_rate targetValueOne > targetValueTwo → Zod refine 拒绝
- schedule date 非 YYYY-MM-DD → dateString schema 拒绝
- createWorkout 返回的 workoutId 由 LLM 从响应 JSON 提取，用于后续 delete/schedule

## Spec Patch

无。open 阶段 `specs/workout-management/spec.md` 的 7 个 requirement / 11 个 scenario 已覆盖本设计。repeat 嵌套深度限制属实现约束（非能力需求），记录于本 Design Doc 而非 spec。

## 开放问题

- pace/heart_rate 的 `targetValueOne`/`targetValueTwo` 精确语义与是否需 `targetValueUnit`：build 阶段 task 6.2 用真实 workout JSON 确认。首版按裸数值 + 不填 unit 实现，被拒则补。


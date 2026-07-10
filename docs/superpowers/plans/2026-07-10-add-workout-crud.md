---
change: add-workout-crud
design-doc: docs/superpowers/specs/2026-07-10-add-workout-crud-design.md
base-ref: 9478e37ff48c8414e77208ad1cb748be481da097
archived-with: 2026-07-10-add-workout-crud
---

# Workout CRUD 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Garmin Connect MCP server 新增 3 个 tool（create_workout / delete_workout / schedule_workout），实现跑步训练课的创建、删除与排程闭环。

**Architecture:** 移植 python `workout.py` 的类型化模型 + helper 模式到 TypeScript。常量层定义 typeId/key 枚举，DTO 层用显式 type + 平行 Zod schema（含递归 StepInput discriminated union），客户端组装函数把高层入参映射为 Garmin payload，tools 层注册 3 个 MCP tool。严格对齐 python `BaseWorkout.to_dict(exclude_none=True)` 的字段范围。

**Tech Stack:** TypeScript (strict), tsup (ESM build), Zod, @modelcontextprotocol/sdk, axios

## Global Constraints

- 无代码注释（项目规则：代码中不写 `//` 或 `/* */` 注释）
- 本地 import 不带扩展名（`import { x } from '../constants'`，不带 `.js`/`.ts`）
- 外部库 import 用完整路径（`import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`）
- DTO 显式 type + 平行 Zod schema，type 不从 schema 推导（不用 `z.infer<>`）
- `console.error()` only（stdio server 禁止 `console.log`）
- 认证 via env vars `GARMIN_EMAIL` / `GARMIN_PASSWORD`
- repeat 嵌套深度限制 ≤1（`RepeatStepInput.steps` 类型为 `ExecutableStepInput[]`，非 `StepInput[]`）
- pace/heart_rate target 用 `targetValueOne` + `targetValueTwo` 裸数值，不处理 `targetValueUnit`
- 首版仅跑步（sportType 固定 running），常量层预留全枚举
- undefined 字段不写入 payload（等价 python `exclude_none`）
- stepOrder / segmentOrder 由数组索引 +1 自动生成，LLM 不传
- 不引入测试框架，验证方式：tsup 编译 + payload 结构比对 + 真实 API 冒烟

archived-with: 2026-07-10-add-workout-crud
---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/constants/workout-types.ts` | 新建 | SPORT_TYPE / STEP_TYPE / CONDITION_TYPE / TARGET_TYPE 枚举 + runningSportType + lookup helper |
| `src/constants/index.ts` | 修改 | barrel 导出 workout-types |
| `src/dtos/workout.dto.ts` | 新建 | CreateWorkoutDto/schema + StepInput discriminated union + DeleteWorkoutDto/schema + ScheduleWorkoutDto/schema |
| `src/dtos/index.ts` | 修改 | barrel 导出 workout DTO |
| `src/client/garmin.client.ts` | 修改 | 新增 buildExecutableStep / buildRepeatGroup / buildWorkoutSegment / buildWorkoutPayload 私有函数 + createWorkout / deleteWorkout / scheduleWorkout 方法 |
| `src/tools/workout.tools.ts` | 新建 | registerWorkoutTools（create_workout / delete_workout / schedule_workout） |
| `src/tools/index.ts` | 修改 | barrel 导出 registerWorkoutTools |
| `src/index.ts` | 修改 | import + 调用 registerWorkoutTools |
| `README.md` | 修改 | 补充 workout tools 说明 |

archived-with: 2026-07-10-add-workout-crud
---

## Task 1: 常量层 — workout-types.ts

**Files:**
- Create: `src/constants/workout-types.ts`
- Modify: `src/constants/index.ts`

**Interfaces:**
- Produces: `SPORT_TYPE`（record）、`STEP_TYPE`（record）、`CONDITION_TYPE`（record）、`TARGET_TYPE`（record）、`runningSportType`（常量对象）、`lookupStepType(key)` / `lookupConditionType(key)` / `lookupTargetType(key)` helper 函数。Task 3 的组装函数依赖这些常量与 helper。

- [x] **Step 1: 创建 `src/constants/workout-types.ts`，定义四个枚举 record + runningSportType + lookup helper**

移植 python `workout.py` 的 `SportType` / `StepType` / `ConditionType` / `TargetType` 类。每个枚举项是一个 `{ id: number; key: string; displayOrder: number }` 对象。lookup helper 接收 key 字符串返回对应枚举项。

```typescript
export const SPORT_TYPE = {
  running: { sportTypeId: 1, sportTypeKey: 'running', displayOrder: 1 },
  cycling: { sportTypeId: 2, sportTypeKey: 'cycling', displayOrder: 2 },
  other: { sportTypeId: 3, sportTypeKey: 'other', displayOrder: 3 },
  swimming: { sportTypeId: 4, sportTypeKey: 'swimming', displayOrder: 4 },
  strength_training: { sportTypeId: 5, sportTypeKey: 'strength_training', displayOrder: 5 },
  cardio_training: { sportTypeId: 6, sportTypeKey: 'cardio_training', displayOrder: 6 },
  yoga: { sportTypeId: 7, sportTypeKey: 'yoga', displayOrder: 7 },
  pilates: { sportTypeId: 8, sportTypeKey: 'pilates', displayOrder: 8 },
  hiit: { sportTypeId: 9, sportTypeKey: 'hiit', displayOrder: 9 },
  multi_sport: { sportTypeId: 10, sportTypeKey: 'multi_sport', displayOrder: 10 },
  mobility: { sportTypeId: 11, sportTypeKey: 'mobility', displayOrder: 11 },
  walking: { sportTypeId: 17, sportTypeKey: 'walking', displayOrder: 17 },
  hiking: { sportTypeId: 18, sportTypeKey: 'hiking', displayOrder: 18 },
} as const;

export const runningSportType = SPORT_TYPE.running;

export const STEP_TYPE = {
  warmup: { stepTypeId: 1, stepTypeKey: 'warmup', displayOrder: 1 },
  cooldown: { stepTypeId: 2, stepTypeKey: 'cooldown', displayOrder: 2 },
  interval: { stepTypeId: 3, stepTypeKey: 'interval', displayOrder: 3 },
  recovery: { stepTypeId: 4, stepTypeKey: 'recovery', displayOrder: 4 },
  rest: { stepTypeId: 5, stepTypeKey: 'rest', displayOrder: 5 },
  repeat: { stepTypeId: 6, stepTypeKey: 'repeat', displayOrder: 6 },
  other: { stepTypeId: 7, stepTypeKey: 'other', displayOrder: 7 },
  main: { stepTypeId: 8, stepTypeKey: 'main', displayOrder: 8 },
} as const;

export const CONDITION_TYPE = {
  lap_button: { conditionTypeId: 1, conditionTypeKey: 'lap_button', displayOrder: 1, displayable: true },
  time: { conditionTypeId: 2, conditionTypeKey: 'time', displayOrder: 2, displayable: true },
  distance: { conditionTypeId: 3, conditionTypeKey: 'distance', displayOrder: 3, displayable: true },
  calories: { conditionTypeId: 4, conditionTypeKey: 'calories', displayOrder: 4, displayable: true },
  power: { conditionTypeId: 5, conditionTypeKey: 'power', displayOrder: 5, displayable: true },
  heart_rate: { conditionTypeId: 6, conditionTypeKey: 'heart_rate', displayOrder: 6, displayable: true },
  iterations: { conditionTypeId: 7, conditionTypeKey: 'iterations', displayOrder: 7, displayable: false },
  fixed_rest: { conditionTypeId: 8, conditionTypeKey: 'fixed_rest', displayOrder: 8, displayable: true },
  fixed_repetition: { conditionTypeId: 9, conditionTypeKey: 'fixed_repetition', displayOrder: 9, displayable: true },
  reps: { conditionTypeId: 10, conditionTypeKey: 'reps', displayOrder: 10, displayable: true },
} as const;

export const TARGET_TYPE = {
  no_target: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target', displayOrder: 1 },
  power_zone: { workoutTargetTypeId: 2, workoutTargetTypeKey: 'power_zone', displayOrder: 2 },
  cadence: { workoutTargetTypeId: 3, workoutTargetTypeKey: 'cadence', displayOrder: 3 },
  heart_rate_zone: { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart_rate', displayOrder: 4 },
  speed_zone: { workoutTargetTypeId: 5, workoutTargetTypeKey: 'speed_zone', displayOrder: 5 },
  pace_zone: { workoutTargetTypeId: 6, workoutTargetTypeKey: 'pace', displayOrder: 6 },
  grade: { workoutTargetTypeId: 7, workoutTargetTypeKey: 'grade', displayOrder: 7 },
  heart_rate_lap: { workoutTargetTypeId: 8, workoutTargetTypeKey: 'heart_rate_lap', displayOrder: 8 },
  power_lap: { workoutTargetTypeId: 9, workoutTargetTypeKey: 'power_lap', displayOrder: 9 },
  resistance: { workoutTargetTypeId: 15, workoutTargetTypeKey: 'resistance', displayOrder: 15 },
} as const;

export function lookupStepType(key: 'warmup' | 'cooldown' | 'interval' | 'recovery' | 'rest') {
  return STEP_TYPE[key];
}

export function lookupConditionType(key: 'time' | 'distance') {
  return CONDITION_TYPE[key];
}

export function lookupTargetType(key: 'no.target' | 'pace' | 'heart_rate') {
  if (key === 'no.target') return TARGET_TYPE.no_target;
  if (key === 'pace') return TARGET_TYPE.pace_zone;
  return TARGET_TYPE.heart_rate_zone;
}
```

注意：`lookupTargetType` 把高层 key（`no.target` / `pace` / `heart_rate`）映射到对应枚举项。`heart_rate` 映射到 `TARGET_TYPE.heart_rate_zone`（key 为 `"heart_rate"`），`pace` 映射到 `TARGET_TYPE.pace_zone`（key 为 `"pace"`）。这与 python workout.py 中 `TargetType.HEART_RATE_ZONE = 4` / `TargetType.PACE_ZONE = 6` 对齐。

- [x] **Step 2: 在 `src/constants/index.ts` 添加 barrel 导出**

在现有内容末尾追加一行：

```typescript
export * from './workout-types';
```

修改后文件完整内容：

```typescript
export * from './garmin-endpoints';
export * from './validations';
export * from './workout-types';
```

- [x] **Step 3: 验证编译**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，无类型错误

- [x] **Step 4: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/constants/workout-types.ts src/constants/index.ts
git commit -m "feat(constants): add workout type enums and lookup helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-add-workout-crud
---

## Task 2: DTO 层 — workout.dto.ts

**Files:**
- Create: `src/dtos/workout.dto.ts`
- Modify: `src/dtos/index.ts`

**Interfaces:**
- Consumes: `dateString` from `../constants`（已有 Zod schema）
- Produces: `ExecutableStepInput` / `RepeatStepInput` / `StepInput` type、`executableStepSchema` / `repeatStepSchema` / `stepSchema`、`CreateWorkoutDto` / `createWorkoutSchema`、`DeleteWorkoutDto` / `deleteWorkoutSchema`、`ScheduleWorkoutDto` / `scheduleWorkoutSchema`。Task 3 的组装函数消费 `CreateWorkoutDto` 与 `StepInput`；Task 5 的 tools 注册消费各 schema 的 `.shape`。

- [x] **Step 1: 创建 `src/dtos/workout.dto.ts`，定义 StepInput type + schema + CreateWorkout/DeleteWorkout/ScheduleWorkout DTO**

```typescript
import { z } from 'zod';
import { dateString } from '../constants';

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

const executableStepSchema = z
  .object({
    type: z.enum(['warmup', 'interval', 'recovery', 'cooldown', 'rest']),
    endCondition: z.enum(['time', 'distance']),
    endConditionValue: z.number().positive(),
    targetType: z.enum(['no.target', 'pace', 'heart_rate']).optional(),
    targetValueOne: z.number().optional(),
    targetValueTwo: z.number().optional(),
  })
  .refine(
    (data) => {
      if (data.targetType === 'pace' || data.targetType === 'heart_rate') {
        return (
          data.targetValueOne !== undefined &&
          data.targetValueTwo !== undefined &&
          data.targetValueOne <= data.targetValueTwo
        );
      }
      return true;
    },
    {
      message:
        'targetType=pace or heart_rate requires targetValueOne and targetValueTwo, with targetValueOne <= targetValueTwo',
    },
  );

const repeatStepSchema = z.object({
  type: z.literal('repeat'),
  numberOfIterations: z.number().int().min(1),
  steps: z.array(executableStepSchema).min(1),
});

export const stepSchema = z.lazy(() => z.union([executableStepSchema, repeatStepSchema]));

export type CreateWorkoutDto = {
  workoutName: string;
  description?: string;
  estimatedDurationInSecs: number;
  steps: StepInput[];
};

export const createWorkoutSchema = z.object({
  workoutName: z.string().min(1).describe('Name of the workout'),
  description: z.string().optional().describe('Optional description of the workout'),
  estimatedDurationInSecs: z
    .number()
    .int()
    .positive()
    .describe('Estimated duration in seconds'),
  steps: z
    .array(stepSchema)
    .min(1)
    .describe('Array of workout steps (executable steps and/or repeat groups)'),
});

export type DeleteWorkoutDto = {
  workoutId: string;
};

export const deleteWorkoutSchema = z.object({
  workoutId: z.string().min(1).describe('The Garmin workout ID to delete'),
});

export type ScheduleWorkoutDto = {
  workoutId: string;
  date: string;
};

export const scheduleWorkoutSchema = z.object({
  workoutId: z.string().min(1).describe('The Garmin workout ID to schedule'),
  date: dateString.describe('Date in YYYY-MM-DD format'),
});
```

关键设计点：
- `RepeatStepInput.steps` 类型为 `ExecutableStepInput[]`（非 `StepInput[]`），类型层面禁止嵌套 repeat
- `repeatStepSchema.steps` 用 `z.array(executableStepSchema)`（非递归），与 type 一致
- `stepSchema` 用 `z.lazy` 包裹 `z.union`，供 `createWorkoutSchema.steps` 使用
- `executableStepSchema.refine` 校验 pace/heart_rate 时 targetValueOne/targetValueTwo 成对且 One ≤ Two
- 所有 type 显式定义，不从 schema 推导

- [x] **Step 2: 在 `src/dtos/index.ts` 添加 barrel 导出**

在现有内容末尾追加：

```typescript
export * from './workout.dto';
```

修改后文件完整内容：

```typescript
export * from './date-params.dto';
export * from './activities.dto';
export * from './devices.dto';
export * from './performance.dto';
export * from './wellness.dto';
export * from './write.dto';
export * from './workout.dto';
```

- [x] **Step 3: 验证编译**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，无类型错误

- [x] **Step 4: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/dtos/workout.dto.ts src/dtos/index.ts
git commit -m "feat(dto): add workout DTOs with recursive StepInput schema

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-add-workout-crud
---

## Task 3: 客户端 payload 组装函数

**Files:**
- Modify: `src/client/garmin.client.ts`（在文件顶部 import 区之后、`todayString` 函数之前插入 4 个私有函数；在 import 区追加常量导入）

**Interfaces:**
- Consumes: `ExecutableStepInput` / `RepeatStepInput` / `StepInput` / `CreateWorkoutDto` from `../dtos`；`STEP_TYPE` / `CONDITION_TYPE` / `TARGET_TYPE` / `runningSportType` / `lookupStepType` / `lookupConditionType` / `lookupTargetType` from `../constants/workout-types`
- Produces: `buildExecutableStep(step: ExecutableStepInput, order: number)` → Garmin ExecutableStepDTO 对象；`buildRepeatGroup(step: RepeatStepInput, order: number)` → RepeatGroupDTO 对象；`buildWorkoutSegment(steps: StepInput[])` → segment 对象；`buildWorkoutPayload(input: CreateWorkoutDto)` → 完整 payload。Task 4 的 `createWorkout` 方法调用 `buildWorkoutPayload`。

- [x] **Step 1: 在 `garmin.client.ts` 追加 import**

在文件顶部已有的 import 块之后（第 96 行 `} from '../constants/garmin-endpoints';` 之后），追加：

```typescript
import {
  STEP_TYPE,
  CONDITION_TYPE,
  TARGET_TYPE,
  runningSportType,
  lookupStepType,
  lookupConditionType,
  lookupTargetType,
} from '../constants/workout-types';
import type {
  CreateWorkoutDto,
  ExecutableStepInput,
  RepeatStepInput,
  StepInput,
} from '../dtos/workout.dto';
```

注意：type import 用 `import type`（tsup/ESM 零运行时开销）。常量 import 从 `../constants/workout-types` 而非 `../constants`（避免 barrel 循环引用风险，且更精确）。实际项目中 `../constants` barrel 也能用，但直接从源文件导入更清晰。

- [x] **Step 2: 在 `todayString` 函数之前插入 4 个私有组装函数**

在 `todayString` 函数定义之前（第 98 行 `function todayString()` 之前）插入：

```typescript
function buildExecutableStep(step: ExecutableStepInput, order: number): Record<string, unknown> {
  const stepType = lookupStepType(step.type);
  const endCondition = lookupConditionType(step.endCondition);
  const result: Record<string, unknown> = {
    type: 'ExecutableStepDTO',
    stepOrder: order,
    stepType: {
      stepTypeId: stepType.stepTypeId,
      stepTypeKey: stepType.stepTypeKey,
      displayOrder: stepType.displayOrder,
    },
    endCondition: {
      conditionTypeId: endCondition.conditionTypeId,
      conditionTypeKey: endCondition.conditionTypeKey,
      displayOrder: endCondition.displayOrder,
      displayable: endCondition.displayable,
    },
    endConditionValue: step.endConditionValue,
  };

  const targetKey = step.targetType ?? 'no.target';
  const targetType = lookupTargetType(targetKey);
  const targetTypeObj: Record<string, unknown> = {
    workoutTargetTypeId: targetType.workoutTargetTypeId,
    workoutTargetTypeKey: targetType.workoutTargetTypeKey,
    displayOrder: targetType.displayOrder,
  };
  result.targetType = targetTypeObj;

  if (step.targetType === 'pace' || step.targetType === 'heart_rate') {
    result.targetValueOne = step.targetValueOne;
    result.targetValueTwo = step.targetValueTwo;
  }

  return result;
}

function buildRepeatGroup(step: RepeatStepInput, order: number): Record<string, unknown> {
  const iterationsCondition = CONDITION_TYPE.iterations;
  return {
    type: 'RepeatGroupDTO',
    stepOrder: order,
    stepType: {
      stepTypeId: STEP_TYPE.repeat.stepTypeId,
      stepTypeKey: STEP_TYPE.repeat.stepTypeKey,
      displayOrder: STEP_TYPE.repeat.displayOrder,
    },
    numberOfIterations: step.numberOfIterations,
    workoutSteps: step.steps.map((s, i) => buildExecutableStep(s, i + 1)),
    endCondition: {
      conditionTypeId: iterationsCondition.conditionTypeId,
      conditionTypeKey: iterationsCondition.conditionTypeKey,
      displayOrder: iterationsCondition.displayOrder,
      displayable: iterationsCondition.displayable,
    },
    endConditionValue: step.numberOfIterations,
    smartRepeat: false,
  };
}

function buildWorkoutSegment(steps: StepInput[]): Record<string, unknown> {
  return {
    segmentOrder: 1,
    sportType: { ...runningSportType },
    workoutSteps: steps.map((s, i) =>
      s.type === 'repeat' ? buildRepeatGroup(s, i + 1) : buildExecutableStep(s, i + 1),
    ),
  };
}

function buildWorkoutPayload(input: CreateWorkoutDto): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    workoutName: input.workoutName,
    sportType: { ...runningSportType },
    estimatedDurationInSecs: input.estimatedDurationInSecs,
    author: {},
    workoutSegments: [buildWorkoutSegment(input.steps)],
  };
  if (input.description !== undefined) {
    payload.description = input.description;
  }
  return payload;
}
```

关键设计点：
- 4 个函数均为模块级私有纯函数（不导出、非类方法），移植 python `workout.py` helper
- `buildExecutableStep`：查 `lookupStepType` / `lookupConditionType` / `lookupTargetType` 填双字段（typeId + key + displayOrder）。no.target 不设 targetValue；pace/heart_rate 设 targetValueOne/Two
- `buildRepeatGroup`：`workoutSteps` 用 `step.steps.map((s, i) => buildExecutableStep(s, i + 1))`（非递归到 RepeatGroup，因为 `RepeatStepInput.steps` 类型为 `ExecutableStepInput[]`）。endCondition 固定 iterations，endConditionValue = numberOfIterations。`smartRepeat: false`
- `buildWorkoutSegment`：`segmentOrder: 1`，sportType 固定 running。遍历 steps 时按 `s.type === 'repeat'` 分流到 `buildRepeatGroup` 或 `buildExecutableStep`，stepOrder = index + 1
- `buildWorkoutPayload`：严格对齐 python `BaseWorkout.to_dict(exclude_none=True)` 字段范围。`description` 仅在 `input.description !== undefined` 时写入（等价 exclude_none）。不补 workoutProvider/shared/workoutId 等字段

- [x] **Step 3: 验证编译**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，无类型错误

- [x] **Step 4: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/client/garmin.client.ts
git commit -m "feat(client): add workout payload assembly functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-add-workout-crud
---

## Task 4: 客户端方法 — createWorkout / deleteWorkout / scheduleWorkout

**Files:**
- Modify: `src/client/garmin.client.ts`（在 `GarminClient` 类中、`removeGearFromActivity` 方法之后追加 3 个方法）

**Interfaces:**
- Consumes: `CreateWorkoutDto` from `../dtos/workout.dto`（已在 Task 3 导入）；`WORKOUT_ENDPOINT` / `SCHEDULED_WORKOUT_ENDPOINT` from `../constants/garmin-endpoints`（已在文件中导入）；`buildWorkoutPayload`（Task 3 定义的同文件私有函数）
- Produces: `GarminClient.createWorkout(input: CreateWorkoutDto): Promise<unknown>`、`GarminClient.deleteWorkout(workoutId: string): Promise<unknown>`、`GarminClient.scheduleWorkout(workoutId: string, date: string): Promise<unknown>`。Task 5 的 tools 注册调用这 3 个方法。

- [x] **Step 1: 在 `removeGearFromActivity` 方法之后追加 3 个方法**

在 `garmin.client.ts` 的 `GarminClient` 类中，`removeGearFromActivity` 方法（约第 747-752 行）之后、类闭合 `}` 之前，插入：

```typescript
  async createWorkout(input: CreateWorkoutDto): Promise<unknown> {
    const payload = buildWorkoutPayload(input);
    return this.request(WORKOUT_ENDPOINT, {
      method: 'POST',
      body: payload,
    });
  }

  async deleteWorkout(workoutId: string): Promise<unknown> {
    return this.request(`${WORKOUT_ENDPOINT}/${workoutId}`, {
      method: 'DELETE',
    });
  }

  async scheduleWorkout(workoutId: string, date: string): Promise<unknown> {
    return this.request(`${SCHEDULED_WORKOUT_ENDPOINT}/${workoutId}`, {
      method: 'POST',
      body: { date },
    });
  }
```

关键设计点：
- `createWorkout`：调用 `buildWorkoutPayload(input)` 组装 payload，`POST /workout-service/workout`（`WORKOUT_ENDPOINT`）。复用 `this.request`（401 自动 re-auth 重试）
- `deleteWorkout`：`DELETE /workout-service/workout/${workoutId}`
- `scheduleWorkout`：`POST /workout-service/schedule/${workoutId}`（`SCHEDULED_WORKOUT_ENDPOINT`），body `{ date }`
- 三个方法返回 `Promise<unknown>`，由 tools 层 `JSON.stringify` 透传给 LLM
- `CreateWorkoutDto` 已在 Task 3 通过 `import type` 导入；`WORKOUT_ENDPOINT` / `SCHEDULED_WORKOUT_ENDPOINT` 已在文件顶部从 `../constants/garmin-endpoints` 导入

- [x] **Step 2: 验证编译**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，无类型错误

- [x] **Step 3: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/client/garmin.client.ts
git commit -m "feat(client): add createWorkout, deleteWorkout, scheduleWorkout methods

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-add-workout-crud
---

## Task 5: Tools 注册 — workout.tools.ts

**Files:**
- Create: `src/tools/workout.tools.ts`
- Modify: `src/tools/index.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createWorkoutSchema` / `deleteWorkoutSchema` / `scheduleWorkoutSchema` from `../dtos`；`GarminClient` from `../client`；`McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Produces: `registerWorkoutTools(server: McpServer, client: GarminClient): void`，注册 3 个 MCP tool

- [x] **Step 1: 创建 `src/tools/workout.tools.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GarminClient } from '../client';
import { createWorkoutSchema, deleteWorkoutSchema, scheduleWorkoutSchema } from '../dtos';
import type { CreateWorkoutDto } from '../dtos/workout.dto';

export function registerWorkoutTools(server: McpServer, client: GarminClient): void {
  server.registerTool(
    'create_workout',
    {
      description:
        'Create a running workout with steps (warmup, interval, recovery, cooldown, rest, repeat groups). Returns the workout including its workoutId.',
      inputSchema: createWorkoutSchema.shape,
    },
    async (input) => {
      const data = await client.createWorkout(input as CreateWorkoutDto);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  server.registerTool(
    'delete_workout',
    {
      description: 'Delete a workout permanently by its workoutId. This action cannot be undone.',
      inputSchema: deleteWorkoutSchema.shape,
    },
    async ({ workoutId }) => {
      const data = await client.deleteWorkout(workoutId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data ?? 'Workout deleted', null, 2) }],
      };
    },
  );

  server.registerTool(
    'schedule_workout',
    {
      description: 'Schedule a workout to a specific date in the Garmin calendar.',
      inputSchema: scheduleWorkoutSchema.shape,
    },
    async ({ workoutId, date }) => {
      const data = await client.scheduleWorkout(workoutId, date);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );
}
```

关键设计点：
- 遵循 `write.tools.ts` 模式：`registerTool` + `inputSchema: xxxSchema.shape` + 返回 `content:[{type:'text' as const, text:JSON.stringify(...)}]`
- `create_workout` 的 handler 接收 `input`（Zod 解析后的对象），用 `as CreateWorkoutDto` 断言后传给 `client.createWorkout`。需要断言是因为 `stepSchema` 用了 `z.lazy` + `z.union`，Zod 推导的 union 类型与显式定义的 `StepInput` discriminated union 在 TypeScript 类型系统层面不完全等价（尽管运行时结构一致）。`CreateWorkoutDto` 通过 `import type` 从 `../dtos/workout.dto` 导入（零运行时开销）
- `delete_workout` 解构 `{ workoutId }`，与 `deleteActivity` 模式一致
- `schedule_workout` 解构 `{ workoutId, date }`

- [x] **Step 2: 在 `src/tools/index.ts` 添加 barrel 导出**

在文件末尾追加：

```typescript
export { registerWorkoutTools } from './workout.tools';
```

修改后文件完整内容（在现有 `registerWriteTools` 行之后）：

```typescript
export { registerActivityTools } from './activities.tools';
export { registerHealthTools } from './health.tools';
export { registerTrendTools } from './trends.tools';
export { registerSleepTools } from './sleep.tools';
export { registerBodyTools } from './body.tools';
export { registerPerformanceTools } from './performance.tools';
export { registerProfileTools } from './profile.tools';
export { registerRangeTools } from './range.tools';
export { registerSnapshotTools } from './snapshot.tools';
export { registerTrainingTools } from './training.tools';
export { registerWellnessTools } from './wellness.tools';
export { registerChallengeTools } from './challenges.tools';
export { registerWriteTools } from './write.tools';
export { registerWorkoutTools } from './workout.tools';
```

- [x] **Step 3: 在 `src/index.ts` import 并调用 registerWorkoutTools**

在 import 块中追加 `registerWorkoutTools`（在 `registerWriteTools` 之后），并在调用区追加 `registerWorkoutTools(server, client)`。

修改 import 块（第 4-18 行），在 `registerWriteTools,` 之后加 `registerWorkoutTools,`：

```typescript
import {
  registerActivityTools,
  registerHealthTools,
  registerTrendTools,
  registerSleepTools,
  registerBodyTools,
  registerPerformanceTools,
  registerProfileTools,
  registerRangeTools,
  registerSnapshotTools,
  registerTrainingTools,
  registerWellnessTools,
  registerChallengeTools,
  registerWriteTools,
  registerWorkoutTools,
} from './tools';
```

在调用区（第 51 行 `registerWriteTools(server, client);` 之后）追加：

```typescript
registerWorkoutTools(server, client);
```

- [x] **Step 4: 验证编译**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，无类型错误

- [x] **Step 5: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/tools/workout.tools.ts src/tools/index.ts src/index.ts
git commit -m "feat(tools): register create_workout, delete_workout, schedule_workout tools

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

archived-with: 2026-07-10-add-workout-crud
---

## Task 6: 构建验证与 payload 结构比对

**Files:**
- 无文件修改（纯验证任务）

**Interfaces:**
- Consumes: Task 1-5 的全部产物

- [x] **Step 1: 运行完整构建**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: tsup 编译成功，输出 `dist/` 目录，无类型错误、无警告

- [x] **Step 2: payload 结构比对 — 编写临时比对脚本**

创建临时文件 `/Users/zhfang/code/garmin-connect-mcp/tmp-payload-check.mjs`，用 Node 直接 import 编译产物中的组装函数进行比对。但组装函数是私有的（不导出），因此改为通过 `createWorkout` 的入参结构手工验证。

更实际的方法：在 Python 端获取参考输出，再手工比对 TypeScript 端的组装逻辑。

先获取 Python 参考输出：

Run: `cd /Users/zhfang/code/garmin-connect-mcp/python-garminconnect && python -c "from test_data.sample_running_workout import create_sample_running_workout; import json; print(json.dumps(create_sample_running_workout().to_dict(), indent=2))"`
Expected: 输出 JSON payload，包含 `workoutName`、`sportType`、`estimatedDurationInSecs`、`description`、`author: {}`、`workoutSegments`（含 warmup step、repeat group with 6 iterations [interval + recovery]、cooldown step）

比对要点（TypeScript `buildWorkoutPayload` 输出应与之逐字段匹配）：
1. 顶层字段：`workoutName` / `sportType` / `estimatedDurationInSecs` / `author` / `workoutSegments`，`description` 仅在传入时存在
2. `sportType` = `{sportTypeId:1, sportTypeKey:"running", displayOrder:1}`
3. `workoutSegments[0].segmentOrder` = 1
4. `workoutSegments[0].workoutSteps[0]`（warmup）：`type:"ExecutableStepDTO"`, `stepType:{stepTypeId:1, stepTypeKey:"warmup", displayOrder:1}`, `endCondition:{conditionTypeId:2, conditionTypeKey:"time", displayOrder:2, displayable:true}`, `endConditionValue:300`, `targetType:{workoutTargetTypeId:1, workoutTargetTypeKey:"no.target", displayOrder:1}`
5. `workoutSteps[1]`（repeat）：`type:"RepeatGroupDTO"`, `stepType:{stepTypeId:6, stepTypeKey:"repeat", displayOrder:6}`, `numberOfIterations:6`, `endCondition:{conditionTypeId:7, conditionTypeKey:"iterations", displayOrder:7, displayable:false}`, `endConditionValue:6`, `smartRepeat:false`, `workoutSteps` 含 2 个子步骤（interval + recovery）
6. `workoutSteps[2]`（cooldown）：`stepType:{stepTypeId:2, stepTypeKey:"cooldown", displayOrder:2}`

注意：Python 的 `to_dict(exclude_none=True)` 会省略 `None` 字段。TypeScript 的 `buildExecutableStep` 对 no.target 不设 targetValue 字段，与 Python 一致。但 TypeScript 的 `buildExecutableStep` 始终设置 `targetType` 字段（即使 no.target 也填 `{workoutTargetTypeId:1, ...}`），这与 Python helper 行为一致（Python `create_warmup_step` 也默认填 no.target targetType 对象）。

如果 Python 输出中某些字段（如 `childStepId`、`strokeType`、`equipmentType`）不存在（因为 `exclude_none` 省略了 None 值），TypeScript 端也不应设置这些字段。确认 TypeScript `buildExecutableStep` 没有设置这些字段。

- [x] **Step 3: 验证 target 区间假设**

设计文档 D1 的风险点：pace/heart_rate 的 `targetValueOne`/`targetValueTwo` 可能需要 `targetValueUnit`。

此步骤在真实 API 冒烟（Task 7）中验证。此处先确认 TypeScript 代码逻辑：当 `targetType === 'pace'` 或 `targetType === 'heart_rate'` 时，`buildExecutableStep` 设置 `targetValueOne` 和 `targetValueTwo`，不设置 `targetValueUnit`。若冒烟测试被 Garmin 拒（400 错误），回到 Task 3 的 `buildExecutableStep` 补 `targetValueUnit` 字段。

- [x] **Step 4: 清理临时文件（如有）**

如果 Step 2 创建了临时比对脚本，删除它：

```bash
rm -f /Users/zhfang/code/garmin-connect-mcp/tmp-payload-check.mjs
```

- [x] **Step 5: Commit（如有变更）**

如果 Task 6 发现 payload 组装有偏差并修正了 `buildExecutableStep` 等，提交修正：

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/client/garmin.client.ts
git commit -m "fix(client): align workout payload fields with python reference

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

如果无变更，跳过此步。

archived-with: 2026-07-10-add-workout-crud
---

## Task 7: 真实 API 冒烟测试

**Files:**
- 无文件修改（纯验证任务，除非冒烟发现需修正代码）

**Interfaces:**
- Consumes: Task 1-6 的全部产物；环境变量 `GARMIN_EMAIL` / `GARMIN_PASSWORD`

**前提条件：** 需要有效的 Garmin Connect 凭据（`GARMIN_EMAIL` / `GARMIN_PASSWORD` 环境变量）。如无法获取凭据，标记此任务为"待用户手动验证"并跳过。

- [x] **Step 1: 构建并启动 MCP server 验证 tool 注册**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && npm run build`
Expected: 编译成功

确认 3 个新 tool 已注册（检查编译产物或运行时日志）：

```bash
cd /Users/zhfang/code/garmin-connect-mcp
GARMIN_EMAIL=test@test.com GARMIN_PASSWORD=test npx dist/index.js 2>&1 | head -5
```
Expected: 日志输出 `Garmin Connect MCP server running on stdio`（然后可 Ctrl+C 终止，凭据无效不影响 server 启动）

- [x] **Step 2: create_workout 冒烟 — 创建含 heart_rate target 的间歇跑**

通过 MCP client（或直接调用编译产物）调用 `create_workout`，传入：

```json
{
  "workoutName": "MCP Smoke Test - Interval Run",
  "description": "Smoke test workout for add-workout-crud feature",
  "estimatedDurationInSecs": 1800,
  "steps": [
    {
      "type": "warmup",
      "endCondition": "time",
      "endConditionValue": 300
    },
    {
      "type": "interval",
      "endCondition": "time",
      "endConditionValue": 60,
      "targetType": "heart_rate",
      "targetValueOne": 135,
      "targetValueTwo": 157
    },
    {
      "type": "cooldown",
      "endCondition": "time",
      "endConditionValue": 120
    }
  ]
}
```

Expected: 返回 JSON 响应，包含 `workoutId` 字段。记录此 workoutId 供后续步骤使用。

如果返回 400 错误且错误信息提及 `targetValueUnit` 或 target 相关字段，说明设计文档 D1 的风险命中。修正 `buildExecutableStep`：在 pace/heart_rate 分支中补 `targetValueUnit` 字段（参考 python workout.py 或真实 Garmin workout JSON 确定值），重新构建后重试。

- [x] **Step 3: schedule_workout 冒烟 — 排程到明天**

使用 Step 2 获得的 workoutId，调用 `schedule_workout`：

```json
{
  "workoutId": "<Step 2 的 workoutId>",
  "date": "<明天的 YYYY-MM-DD 日期>"
}
```

Expected: 返回 Garmin 排程响应 JSON，无错误。

- [x] **Step 4: delete_workout 冒烟 — 清理**

调用 `delete_workout`：

```json
{
  "workoutId": "<Step 2 的 workoutId>"
}
```

Expected: 返回删除成功响应或空响应。

- [x] **Step 5: 验证删除成功（可选）**

如果 MCP server 有 `get_workout` tool，调用它确认 workout 已删除：

```json
{
  "workoutId": "<Step 2 的 workoutId>"
}
```

Expected: 返回 404 错误或 workout 不存在的响应。

- [x] **Step 6: 记录冒烟结果**

在 commit message 或 PR 描述中记录：
- create_workout 是否成功返回 workoutId
- heart_rate target（135-157）是否被 Garmin 接受
- schedule_workout 是否成功
- delete_workout 是否成功
- 如果补了 `targetValueUnit`，记录补的值

- [x] **Step 7: Commit（如冒烟发现需修正代码）**

如果冒烟测试导致代码修正（如补 `targetValueUnit`），提交修正：

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add src/client/garmin.client.ts
git commit -m "fix(client): add targetValueUnit for pace/heart_rate targets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

如果无变更，跳过此步。

archived-with: 2026-07-10-add-workout-crud
---

## Task 8: 文档 — 更新 README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 5 注册的 3 个 tool 名称与入参

- [x] **Step 1: 在 README.md 的 "Profile & Devices" section 之后、"Authentication" section 之前插入 Workout Tools section**

在 `README.md` 第 179 行（`| \`get_workout\` | Specific workout by ID |` 之后、第 180 行 `## Authentication` 之前）插入：

```markdown

### Workouts (3 tools)
| Tool | Description |
|------|-------------|
| `create_workout` | Create a running workout with steps (warmup, interval, recovery, cooldown, repeat groups) |
| `delete_workout` | Delete a workout by its ID |
| `schedule_workout` | Schedule a workout to a specific date |
```

- [x] **Step 2: 验证 README 格式**

Run: `cd /Users/zhfang/code/garmin-connect-mcp && grep -A4 '### Workouts' README.md`
Expected: 输出插入的 4 行 markdown 表格

- [x] **Step 3: Commit**

```bash
cd /Users/zhfang/code/garmin-connect-mcp
git add README.md
git commit -m "docs(readme): add workout tools to available tools list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```


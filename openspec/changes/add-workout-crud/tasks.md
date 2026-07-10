## 1. 常量层

- [x] 1.1 新建 `src/constants/workout-types.ts`，移植 python `workout.py` 的 typeId 枚举：`SPORT_TYPE`（running/cycling/swimming/strength 等全量，含 id+key+displayOrder）、`STEP_TYPE`（warmup/cooldown/interval/recovery/rest/repeat/other/main）、`CONDITION_TYPE`（lap_button/time/distance/calories/power/heart_rate/iterations 等）、`TARGET_TYPE`（no_target/pace_zone/heart_rate_zone/cadence/speed_zone 等），每个枚举项含 id 与 key
- [x] 1.2 在 `src/constants/workout-types.ts` 导出组合常量 `runningSportType`（`{sportTypeId:1, sportTypeKey:"running", displayOrder:1}`）及各 target/condition/stepType 的 `{id,key}` lookup helper
- [x] 1.3 在 `src/constants/index.ts` barrel 导出 workout-types

## 2. DTO 层

- [ ] 2.1 新建 `src/dtos/workout.dto.ts`，定义高层入参 type + Zod schema：`CreateWorkoutDto`/`createWorkoutSchema`（workoutName 必填、description 可选、estimatedDurationInSecs 必填正整数、steps 非空数组）
- [ ] 2.2 在 workout.dto.ts 定义 `StepInput` discriminated union（按 `type` 区分可执行步与 repeat 组）：可执行步含 `type`(warmup/interval/recovery/cooldown/rest)、`endCondition`(time/distance)、`endConditionValue`、可选 `targetType`(no.target/pace/heart_rate) 与 `targetValueOne`/`targetValueTwo`；repeat 组含 `type:"repeat"`、`numberOfIterations`≥1、`steps` 递归数组
- [ ] 2.3 用 `z.lazy` 或 `z.union` 实现 StepInput 递归 schema，保证 RepeatGroup 可嵌套子步骤；对 targetType=pace/heart_rate 用 `refine` 校验 targetValueOne 与 targetValueTwo 必须成对出现
- [ ] 2.4 定义 `DeleteWorkoutDto`/`deleteWorkoutSchema`（workoutId 字符串）与 `ScheduleWorkoutDto`/`scheduleWorkoutSchema`（workoutId 字符串 + date dateString）
- [ ] 2.5 在 `src/dtos/index.ts` barrel 导出 workout DTO

## 3. 客户端 payload 组装

- [ ] 3.1 在 `src/client/garmin.client.ts` 新增私有组装函数（移植 python `workout.py` helper）：`buildExecutableStep`（映射 stepType/endCondition/targetType 到 Garmin ExecutableStepDTO 双字段）、`buildRepeatGroup`（映射 RepeatGroupDTO，递归组装子步骤）、`buildWorkoutSegment`、`buildWorkoutPayload`
- [ ] 3.2 组装函数从 `constants/workout-types` 查 typeId/key，按 python 参考填充 displayOrder/displayable/smartRepeat 等元数据字段；undefined 字段不写入 payload

## 4. 客户端方法

- [ ] 4.1 在 `garmin.client.ts` 新增 `createWorkout(input: CreateWorkoutDto): Promise<unknown>`，调用 buildWorkoutPayload 后 `POST /workout-service/workout`（复用 WORKOUT_ENDPOINT 常量）
- [ ] 4.2 新增 `deleteWorkout(workoutId: string): Promise<unknown>`，`DELETE /workout-service/workout/${workoutId}`（复用 WORKOUT_ENDPOINT）
- [ ] 4.3 新增 `scheduleWorkout(workoutId: string, date: string): Promise<unknown>`，`POST /workout-service/schedule/${workoutId}`，body `{date}`（复用 SCHEDULED_WORKOUT_ENDPOINT）

## 5. Tools 注册

- [ ] 5.1 新建 `src/tools/workout.tools.ts`，导出 `registerWorkoutTools(server, client)`，注册 `create_workout` / `delete_workout` / `schedule_workout` 三个 tool，inputSchema 用对应 Zod schema 的 `.shape`，返回 `content:[{type:'text', text:JSON.stringify(data,null,2)}]`
- [ ] 5.2 在 `src/tools/index.ts` barrel 导出 registerWorkoutTools
- [ ] 5.3 在 `src/index.ts` import 并调用 `registerWorkoutTools(server, client)`

## 6. 构建与验证

- [ ] 6.1 运行 `npm run build`（tsup）确认 TypeScript strict 编译通过，无类型错误
- [ ] 6.2 验证 target 区间（pace/heart_rate）payload 字段假设：对照 python `workout.py` 模型与真实 Garmin workout JSON（可通过既有 `get_workout` 读取一个含 target 的真实 workout 比对字段），修正 `buildExecutableStep` 中 targetValueOne/targetValueTwo/targetValueUnit 的填充逻辑
- [ ] 6.3 手动冒烟测试（需 GARMIN_EMAIL/GARMIN_PASSWORD 环境变量）：调用 create_workout 创建一个简单跑步课（warmup→interval→cooldown），确认返回 workoutId；调用 schedule_workout 排程；调用 delete_workout 清理

## 7. 文档

- [ ] 7.1 更新 README（若列有 tool 清单）：补充 create_workout / delete_workout / schedule_workout 三个 tool 及入参说明

## 1. DTO 层（workout.dto.ts）

- [x] 1.1 修改 `ExecutableStepInput` type：`targetValueOne`/`targetValueTwo` 类型从 `number` 改为 `number | string`（pace 用 string mm:ss，heart_rate 用 number）
- [x] 1.2 修改 `executableStepSchema`：`targetValueOne`/`targetValueTwo` 从 `z.number().optional()` 改为 `z.union([z.number(), z.string()]).optional()`；`.describe()` 补充 pace 用 mm:ss(min/km)、heart_rate 用 bpm 说明
- [x] 1.3 重写 `refine` 校验逻辑按 targetType 分流：pace — targetValueOne/Two 成对 + 必须是 string 匹配 `/^\d+:\d{2}$/`，不校验顺序；heart_rate — 成对 + 必须是 number + `One <= Two`；no.target/absent — 不校验。refine message 分类型描述
- [x] 1.4 验证编译：`npm run build` + `npx tsc --noEmit`（新增代码零错误，2 个预存在 garmin.client.test.ts 错误可忽略）

## 2. 客户端组装（garmin.client.ts）

- [x] 2.1 新增模块级私有纯函数 `parsePaceToMs(value: string): number`：解析 mm:ss（min/km）为 m/s，公式 `1000 / (mm*60 + ss)`，不四舍五入
- [x] 2.2 修改 `buildExecutableStep` 的 pace 分支：`targetValueOne`/`targetValueTwo` 用 `parsePaceToMs` 转换后再赋值 `result.targetValueOne/Two`；heart_rate 分支保持透传 number；no.target 不设 targetValue
- [x] 2.3 验证编译：`npm run build` + `npx tsc --noEmit`（零新增错误）

## 3. 真实 API 冒烟验证

- [x] 3.1 用真实账号冒烟测试含 pace target 的 workout：`create_workout` 传入 `targetType:"pace", targetValueOne:"5:00", targetValueTwo:"6:00"`（min/km），确认 Garmin 接受转换后的 m/s payload 并返回 workoutId
- [x] 3.2 验证转换精度：`"5:48"` → 2.8736 m/s 量级（对照真实 workout 数据 2.5-3.3 范围），确认 Garmin 不拒绝
- [x] 3.3 冒烟后 `delete_workout` 清理

## 4. 文档

- [x] 4.1 若 README 的 Workouts section 有 target 说明，补充 pace 用 mm:ss(min/km) 格式（检查 README 是否需要更新）

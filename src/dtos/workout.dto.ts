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

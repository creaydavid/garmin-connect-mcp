import { z } from 'zod';
import { dateString } from '../constants';

export type ExecutableStepInput = {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'rest';
  endCondition: 'time' | 'distance';
  endConditionValue: number;
  targetType?: 'no.target' | 'pace' | 'heart_rate' | 'cadence';
  targetValueOne?: number | string;
  targetValueTwo?: number | string;
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
    targetType: z.enum(['no.target', 'pace', 'heart_rate', 'cadence']).optional(),
    targetValueOne: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Target zone lower bound. pace: mm:ss (min/km) string like "5:48"; heart_rate: bpm number like 135; cadence: spm number like 180'),
    targetValueTwo: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Target zone upper bound. pace: mm:ss (min/km) string like "6:30"; heart_rate: bpm number like 157; cadence: spm number like 260'),
  })
  .refine(
    (data) => {
      if (data.targetType === 'pace') {
        if (
          data.targetValueOne === undefined ||
          data.targetValueTwo === undefined
        ) {
          return false;
        }
        if (
          typeof data.targetValueOne !== 'string' ||
          typeof data.targetValueTwo !== 'string'
        ) {
          return false;
        }
        const paceRegex = /^\d+:[0-5]\d$/;
        if (!paceRegex.test(data.targetValueOne) || !paceRegex.test(data.targetValueTwo)) {
          return false;
        }
        const parseTotalSec = (v: string): number => {
          const [mm, ss] = v.split(':');
          return Number(mm) * 60 + Number(ss);
        };
        if (parseTotalSec(data.targetValueOne) === 0 || parseTotalSec(data.targetValueTwo) === 0) {
          return false;
        }
        return true;
      }
      if (data.targetType === 'heart_rate') {
        if (
          data.targetValueOne === undefined ||
          data.targetValueTwo === undefined
        ) {
          return false;
        }
        if (
          typeof data.targetValueOne !== 'number' ||
          typeof data.targetValueTwo !== 'number'
        ) {
          return false;
        }
        return data.targetValueOne <= data.targetValueTwo;
      }
      if (data.targetType === 'cadence') {
        if (
          data.targetValueOne === undefined ||
          data.targetValueTwo === undefined
        ) {
          return false;
        }
        if (
          typeof data.targetValueOne !== 'number' ||
          typeof data.targetValueTwo !== 'number'
        ) {
          return false;
        }
        return data.targetValueOne <= data.targetValueTwo;
      }
      return true;
    },
    {
      message:
        'pace target requires targetValueOne/Two as mm:ss (min/km) strings, non-zero; heart_rate target requires targetValueOne/Two as numbers (bpm) with One <= Two; cadence target requires targetValueOne/Two as numbers (spm) with One <= Two',
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

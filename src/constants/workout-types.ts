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

export function lookupTargetType(key: 'no.target' | 'pace' | 'heart_rate' | 'cadence') {
  if (key === 'no.target') return TARGET_TYPE.no_target;
  if (key === 'pace') return TARGET_TYPE.pace_zone;
  if (key === 'cadence') return TARGET_TYPE.cadence;
  return TARGET_TYPE.heart_rate_zone;
}

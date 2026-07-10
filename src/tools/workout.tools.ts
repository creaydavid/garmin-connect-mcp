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

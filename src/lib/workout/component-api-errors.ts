import { Prisma } from "@prisma/client";

const WORKOUT_COMPONENTS_MIGRATION =
  "Workout components are not set up yet. Run prisma/migrations/manual_workout_components.sql on your database, then redeploy.";

export function workoutComponentDbErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2010") {
      return WORKOUT_COMPONENTS_MIGRATION;
    }
  }
  if (error instanceof Error) {
    if (
      /WorkoutComponent|ComponentProgressionStep|ComponentType|does not exist|relation/.test(
        error.message
      )
    ) {
      return WORKOUT_COMPONENTS_MIGRATION;
    }
  }
  return "Could not save component";
}

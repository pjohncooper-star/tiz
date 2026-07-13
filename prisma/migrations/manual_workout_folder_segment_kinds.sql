-- Segment folder kinds for workout pool Build tab columns
ALTER TYPE "WorkoutFolderKind" ADD VALUE IF NOT EXISTS 'WARM_UP';
ALTER TYPE "WorkoutFolderKind" ADD VALUE IF NOT EXISTS 'MAIN_SET';
ALTER TYPE "WorkoutFolderKind" ADD VALUE IF NOT EXISTS 'COOL_DOWN';

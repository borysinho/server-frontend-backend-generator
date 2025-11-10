-- AlterTable
ALTER TABLE "diagram_snapshots" ADD COLUMN     "migrations" TEXT[] DEFAULT ARRAY[]::TEXT[];

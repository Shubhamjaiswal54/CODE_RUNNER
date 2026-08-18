-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('Processing', 'Success', 'Failure');

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL,
    "output" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

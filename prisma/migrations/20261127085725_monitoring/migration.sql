-- CreateEnum
CREATE TYPE "AttemptEventType" AS ENUM ('TAB_HIDDEN', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY', 'PASTE', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'RESUMED');

-- CreateEnum
CREATE TYPE "EventReview" AS ENUM ('UNREVIEWED', 'NOTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "attempt_events" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "type" "AttemptEventType" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "client_time" TIMESTAMPTZ(3),
    "server_time" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_status" "EventReview" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewed_by" UUID,
    "review_note" VARCHAR(500),

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_events_attempt_id_server_time_idx" ON "attempt_events"("attempt_id", "server_time");

-- CreateIndex
CREATE INDEX "announcements_exam_id_created_at_idx" ON "announcements"("exam_id", "created_at");

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

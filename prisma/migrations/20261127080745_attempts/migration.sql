-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_sandbox" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "question_count" INTEGER NOT NULL,
    "total_marks" DECIMAL(7,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "option_order" JSONB NOT NULL DEFAULT '[]',
    "marks" DECIMAL(6,2) NOT NULL,
    "negative_marks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempts_exam_id_status_idx" ON "attempts"("exam_id", "status");

-- CreateIndex
CREATE INDEX "attempts_user_id_idx" ON "attempts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_order_index_key" ON "attempt_questions"("attempt_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_question_id_key" ON "attempt_questions"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ Attempt rules enforced by the database ═══

-- One REAL attempt per candidate per exam (two tabs / double click can't create two).
CREATE UNIQUE INDEX "attempts_one_real_per_candidate" ON "attempts" ("exam_id", "user_id") WHERE NOT "is_sandbox";

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_deadline_after_start" CHECK ("deadline_at" > "started_at"),
  ADD CONSTRAINT "attempts_submitted_consistent" CHECK (("status" = 'IN_PROGRESS') = ("submitted_at" IS NULL)),
  ADD CONSTRAINT "attempts_counts_positive" CHECK ("question_count" > 0 AND "total_marks" > 0);

ALTER TABLE "attempt_questions"
  ADD CONSTRAINT "attempt_questions_marks_valid" CHECK ("marks" > 0 AND "negative_marks" >= 0 AND "negative_marks" <= "marks"),
  ADD CONSTRAINT "attempt_questions_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object'),
  ADD CONSTRAINT "attempt_questions_option_order_array" CHECK (jsonb_typeof("option_order") = 'array');

-- A real attempt can only be created by an actively enrolled, active candidate, for a
-- PUBLISHED exam, inside its window, with a deadline that never passes the closing time
-- nor exceeds the duration. The deadline can only move later, never before what was given.
CREATE FUNCTION trg_attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e exams%ROWTYPE; u users%ROWTYPE;
BEGIN
  SELECT * INTO e FROM exams WHERE id = NEW.exam_id;
  IF TG_OP = 'INSERT' AND NOT NEW.is_sandbox THEN
    SELECT * INTO u FROM users WHERE id = NEW.user_id;
    IF u.role <> 'CANDIDATE' OR NOT u.is_active THEN RAISE EXCEPTION 'NOT_ELIGIBLE: only active candidates can start an exam'; END IF;
    IF e.status <> 'PUBLISHED' THEN RAISE EXCEPTION 'NOT_ELIGIBLE: this exam is not available'; END IF;
    IF NOT EXISTS (SELECT 1 FROM enrollments WHERE exam_id = NEW.exam_id AND candidate_id = NEW.user_id AND status = 'ACTIVE') THEN
      RAISE EXCEPTION 'NOT_ELIGIBLE: you are not enrolled in this exam';
    END IF;
    IF now() < e.start_at THEN RAISE EXCEPTION 'EXAM_NOT_OPEN: this exam has not opened yet'; END IF;
    IF now() >= e.end_at THEN RAISE EXCEPTION 'EXAM_CLOSED: this exam has closed'; END IF;
  END IF;
  IF NOT NEW.is_sandbox THEN
    IF NEW.deadline_at > e.end_at OR NEW.deadline_at > NEW.started_at + make_interval(mins => e.duration_minutes) + interval '1 second' THEN
      RAISE EXCEPTION 'INVALID_DEADLINE: deadline exceeds the duration or the closing time';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.deadline_at < OLD.deadline_at THEN RAISE EXCEPTION 'INVALID_DEADLINE: a deadline can never be shortened'; END IF;
    IF NEW.started_at <> OLD.started_at OR NEW.exam_id <> OLD.exam_id OR NEW.user_id <> OLD.user_id OR NEW.is_sandbox <> OLD.is_sandbox THEN
      RAISE EXCEPTION 'ATTEMPT_LOCKED: attempt identity cannot change';
    END IF;
    IF OLD.status <> 'IN_PROGRESS' AND NEW.status = 'IN_PROGRESS' THEN
      RAISE EXCEPTION 'ATTEMPT_LOCKED: a submitted attempt cannot be reopened';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempts_guard BEFORE INSERT OR UPDATE ON "attempts" FOR EACH ROW EXECUTE FUNCTION trg_attempts_guard();

-- The frozen paper never changes after the attempt is created.
CREATE FUNCTION trg_attempt_questions_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- allowed only as part of deleting the whole attempt (cascade)
    IF EXISTS (SELECT 1 FROM attempts WHERE id = OLD.attempt_id) THEN
      RAISE EXCEPTION 'ATTEMPT_LOCKED: the paper of an attempt cannot change';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ATTEMPT_LOCKED: the paper of an attempt cannot change';
END $$;
CREATE TRIGGER attempt_questions_frozen BEFORE UPDATE OR DELETE ON "attempt_questions" FOR EACH ROW EXECUTE FUNCTION trg_attempt_questions_frozen();

-- Extending an exam's closing time gives back time ONLY to running attempts that were cut
-- short by the old closing time, and never beyond the exam duration.
CREATE FUNCTION trg_exams_extend_attempts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.end_at > OLD.end_at THEN
    UPDATE attempts a
       SET deadline_at = LEAST(a.started_at + make_interval(mins => NEW.duration_minutes), NEW.end_at)
     WHERE a.exam_id = NEW.id AND NOT a.is_sandbox AND a.status = 'IN_PROGRESS'
       AND a.deadline_at > now()
       AND a.deadline_at < LEAST(a.started_at + make_interval(mins => NEW.duration_minutes), NEW.end_at);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER exams_extend_attempts AFTER UPDATE OF end_at ON "exams" FOR EACH ROW EXECUTE FUNCTION trg_exams_extend_attempts();

-- Questions that candidates have already been given can't change type/text etc. (they
-- are frozen in snapshots anyway); and an exam with attempts can't be deleted (FK RESTRICT).

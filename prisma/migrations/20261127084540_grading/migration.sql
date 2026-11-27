-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "ai_at" TIMESTAMPTZ(3),
ADD COLUMN     "ai_marks" DECIMAL(6,2),
ADD COLUMN     "ai_model" VARCHAR(100),
ADD COLUMN     "ai_reason" TEXT,
ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "graded_at" TIMESTAMPTZ(3),
ADD COLUMN     "graded_by" UUID,
ADD COLUMN     "manual_marks" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "pending_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_score" DECIMAL(7,2);
-- ═══ Grading rules ═══
ALTER TABLE "answers"
  ADD CONSTRAINT "answers_manual_non_negative" CHECK ("manual_marks" IS NULL OR "manual_marks" >= 0),
  ADD CONSTRAINT "answers_ai_non_negative" CHECK ("ai_marks" IS NULL OR "ai_marks" >= 0);

-- A manual mark must be within 0..question marks, only on a finished attempt, and never
-- after results are published (changes then go through the dispute process only, which
-- sets app.dispute_resolution for its transaction).
CREATE FUNCTION trg_answers_grading_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qmarks numeric; ast "AttemptStatus"; published boolean;
BEGIN
  IF NEW.manual_marks IS DISTINCT FROM OLD.manual_marks OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
    SELECT aq.marks, a.status, (e.results_status = 'PUBLISHED') INTO qmarks, ast, published
      FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id JOIN exams e ON e.id = a.exam_id
     WHERE aq.id = NEW.attempt_question_id;
    IF ast = 'IN_PROGRESS' THEN RAISE EXCEPTION 'GRADING_LOCKED: the attempt is still in progress'; END IF;
    IF NEW.manual_marks > qmarks THEN RAISE EXCEPTION 'INVALID_MARKS: marks cannot exceed % for this question', qmarks; END IF;
    IF published AND coalesce(current_setting('app.dispute_resolution', true), '') <> 'on' THEN
      RAISE EXCEPTION 'GRADING_LOCKED: results are published; marks change only through a dispute';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answers_grading_guard BEFORE UPDATE ON "answers" FOR EACH ROW EXECUTE FUNCTION trg_answers_grading_guard();

-- Results can only be published when every finished attempt is fully marked and nobody is
-- still writing (deferred so the app can recompute and publish in one transaction).
CREATE OR REPLACE FUNCTION trg_exams_results_ready() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.results_status = 'PUBLISHED' AND OLD.results_status = 'HIDDEN' THEN
    IF EXISTS (SELECT 1 FROM attempts WHERE exam_id = NEW.id AND NOT is_sandbox AND status = 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'RESULTS_BLOCKED: some attempts are still in progress';
    END IF;
    IF EXISTS (SELECT 1 FROM attempts WHERE exam_id = NEW.id AND NOT is_sandbox AND (pending_count > 0 OR total_score IS NULL)) THEN
      RAISE EXCEPTION 'RESULTS_BLOCKED: some answers still need marking';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exams_results_ready AFTER UPDATE ON "exams" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_exams_results_ready();

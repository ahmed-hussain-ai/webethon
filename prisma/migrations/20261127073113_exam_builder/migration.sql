-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "auto_check_written" BOOLEAN NOT NULL DEFAULT true;

-- Lifecycle guards (replaces the init version): adds auto_check_written to the settings
-- frozen once the window opens, and blocks publishing an exam whose window already ended.
CREATE OR REPLACE FUNCTION trg_exams_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'EXAM_LOCKED: only draft exams can be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED' AND NEW.end_at IS NOT NULL AND NEW.end_at <= now() THEN
    RAISE EXCEPTION 'PUBLISH_BLOCKED: the exam window has already ended; move the end time into the future';
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' AND now() >= OLD.start_at THEN
    RAISE EXCEPTION 'EXAM_LOCKED: exam window has opened; it cannot be unpublished';
  END IF;
  IF NEW.results_status = 'PUBLISHED' AND OLD.results_status = 'HIDDEN' AND now() < NEW.end_at THEN
    RAISE EXCEPTION 'RESULTS_TOO_EARLY: results can only be published after the exam ends';
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'PUBLISHED' AND now() >= OLD.start_at THEN
    IF NEW.start_at <> OLD.start_at OR NEW.end_at < OLD.end_at
       OR NEW.duration_minutes <> OLD.duration_minutes OR NEW.total_marks <> OLD.total_marks
       OR NEW.pass_marks <> OLD.pass_marks
       OR NEW.multi_select_rule <> OLD.multi_select_rule OR NEW.auto_check_written <> OLD.auto_check_written
       OR NEW.shuffle_questions <> OLD.shuffle_questions OR NEW.shuffle_options <> OLD.shuffle_options THEN
      RAISE EXCEPTION 'EXAM_LOCKED: exam has started; schedule and marking settings are frozen (end time can only be extended)';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Enrollment guard (replaces the init version): no new/reactivated enrollment after the exam ended.
CREATE OR REPLACE FUNCTION trg_enrollments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Role"; er "Role"; ends timestamptz;
BEGIN
  SELECT role INTO r FROM users WHERE id = NEW.candidate_id;
  IF r <> 'CANDIDATE' THEN RAISE EXCEPTION 'NOT_A_CANDIDATE: only candidates can be enrolled'; END IF;
  SELECT role INTO er FROM users WHERE id = NEW.enrolled_by;
  IF er NOT IN ('EXAMINER','ADMIN') THEN RAISE EXCEPTION 'FORBIDDEN: only examiners/admins can enroll'; END IF;
  IF NEW.status = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.status <> 'ACTIVE') THEN
    SELECT end_at INTO ends FROM exams WHERE id = NEW.exam_id;
    IF ends IS NOT NULL AND ends <= now() THEN
      RAISE EXCEPTION 'EXAM_ENDED: this exam has ended; candidates can no longer be enrolled';
    END IF;
  END IF;
  RETURN NEW;
END $$;

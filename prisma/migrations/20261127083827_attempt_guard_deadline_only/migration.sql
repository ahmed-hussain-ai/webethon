-- Validate the deadline only when it is set or changed, so a status change (submit /
-- auto-submit) can never be blocked by a deadline check.
CREATE OR REPLACE FUNCTION trg_attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NOT NEW.is_sandbox AND (TG_OP = 'INSERT' OR NEW.deadline_at <> OLD.deadline_at) THEN
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

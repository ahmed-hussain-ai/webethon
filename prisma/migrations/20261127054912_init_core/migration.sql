-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EXAMINER', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "FontSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'XLARGE');

-- CreateEnum
CREATE TYPE "WorkspaceLayout" AS ENUM ('SINGLE', 'SPLIT');

-- CreateEnum
CREATE TYPE "NavPosition" AS ENUM ('LEFT', 'RIGHT', 'BOTTOM');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_SELECT', 'WRITTEN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MultiSelectRule" AS ENUM ('ALL_OR_NOTHING', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ResultsStatus" AS ENUM ('HIDDEN', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_preferences" (
    "user_id" UUID NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'LIGHT',
    "font_size" "FontSize" NOT NULL DEFAULT 'MEDIUM',
    "layout" "WorkspaceLayout" NOT NULL DEFAULT 'SINGLE',
    "nav_position" "NavPosition" NOT NULL DEFAULT 'RIGHT',
    "high_contrast" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "default_marks" DECIMAL(6,2) NOT NULL,
    "model_answer" TEXT,
    "explanation" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "start_at" TIMESTAMPTZ(3),
    "end_at" TIMESTAMPTZ(3),
    "duration_minutes" INTEGER NOT NULL,
    "total_marks" DECIMAL(7,2) NOT NULL,
    "pass_marks" DECIMAL(7,2) NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT false,
    "multi_select_rule" "MultiSelectRule" NOT NULL DEFAULT 'ALL_OR_NOTHING',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ(3),
    "results_status" "ResultsStatus" NOT NULL DEFAULT 'HIDDEN',
    "results_published_at" TIMESTAMPTZ(3),
    "dispute_window_hours" INTEGER NOT NULL DEFAULT 72,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL,
    "negative_marks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "enrolled_by" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "questions_category_id_idx" ON "questions"("category_id");

-- CreateIndex
CREATE INDEX "questions_created_by_idx" ON "questions"("created_by");

-- CreateIndex
CREATE INDEX "questions_type_difficulty_idx" ON "questions"("type", "difficulty");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE INDEX "exams_created_by_idx" ON "exams"("created_by");

-- CreateIndex
CREATE INDEX "exams_status_start_at_idx" ON "exams"("status", "start_at");

-- CreateIndex
CREATE INDEX "exam_questions_question_id_idx" ON "exam_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_id_question_id_key" ON "exam_questions"("exam_id", "question_id");

-- CreateIndex
CREATE INDEX "enrollments_candidate_id_idx" ON "enrollments"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_exam_id_candidate_id_key" ON "enrollments"("exam_id", "candidate_id");

-- AddForeignKey
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- Business rules enforced by the DATABASE (not only by the app).
-- Prisma can't model these, so they live here. See docs/DATA_MODEL.md.
-- ═══════════════════════════════════════════════════════════════════════

-- ── users ──
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email") AND "email" LIKE '%_@_%'),
  ADD CONSTRAINT "users_name_not_blank" CHECK (length(btrim("name")) > 0);

-- Role changes / deactivation must not orphan data or lock the platform.
CREATE FUNCTION trg_users_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'ADMIN' AND OLD.is_active
     AND (NEW.role <> 'ADMIN' OR NOT NEW.is_active)
     AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN' AND is_active AND id <> OLD.id) THEN
    RAISE EXCEPTION 'LAST_ADMIN: cannot demote or deactivate the last active administrator';
  END IF;
  IF OLD.role <> NEW.role THEN
    IF OLD.role = 'CANDIDATE' AND EXISTS (SELECT 1 FROM enrollments WHERE candidate_id = OLD.id) THEN
      RAISE EXCEPTION 'ROLE_IN_USE: candidate has enrollments; role cannot change';
    END IF;
    IF NEW.role = 'CANDIDATE' AND EXISTS (SELECT 1 FROM exams WHERE created_by = OLD.id) THEN
      RAISE EXCEPTION 'ROLE_IN_USE: user owns exams; cannot become a candidate';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_guard BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION trg_users_guard();

-- ── categories ──
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("name")) > 0);
CREATE UNIQUE INDEX "categories_name_ci_key" ON "categories" (lower(btrim("name")));

-- ── questions ──
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_text_not_blank" CHECK (length(btrim("text")) > 0),
  ADD CONSTRAINT "questions_default_marks_range" CHECK ("default_marks" > 0 AND "default_marks" <= 1000),
  ADD CONSTRAINT "questions_model_answer_written_only" CHECK ("type" = 'WRITTEN' OR "model_answer" IS NULL);

-- ── question_options ──
ALTER TABLE "question_options"
  ADD CONSTRAINT "question_options_text_not_blank" CHECK (length(btrim("text")) > 0),
  ADD CONSTRAINT "question_options_order_non_negative" CHECK ("order_index" >= 0);

-- Option-set rules per question type. DEFERRED: checked at COMMIT, so the app can
-- replace all options of a question inside one transaction.
--   SINGLE_CHOICE : 2–10 options, EXACTLY 1 correct
--   MULTI_SELECT  : 2–10 options, at least 1 correct AND at least 1 incorrect
--   WRITTEN       : no options
--   any type      : no duplicate option text (case/space-insensitive)
CREATE FUNCTION validate_question_options(qid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  qtype "QuestionType"; n_total int; n_correct int; n_distinct int;
BEGIN
  SELECT type INTO qtype FROM questions WHERE id = qid;
  IF NOT FOUND THEN RETURN; END IF; -- question deleted in same tx
  SELECT count(*), count(*) FILTER (WHERE is_correct), count(DISTINCT lower(btrim(text)))
    INTO n_total, n_correct, n_distinct FROM question_options WHERE question_id = qid;
  IF qtype = 'WRITTEN' THEN
    IF n_total <> 0 THEN RAISE EXCEPTION 'INVALID_OPTIONS: written questions cannot have options'; END IF;
    RETURN;
  END IF;
  IF n_total < 2 OR n_total > 10 THEN
    RAISE EXCEPTION 'INVALID_OPTIONS: % question needs 2-10 options (has %)', qtype, n_total;
  END IF;
  IF n_distinct <> n_total THEN
    RAISE EXCEPTION 'INVALID_OPTIONS: duplicate option text';
  END IF;
  IF qtype = 'SINGLE_CHOICE' AND n_correct <> 1 THEN
    RAISE EXCEPTION 'INVALID_OPTIONS: single-choice question needs exactly 1 correct option (has %)', n_correct;
  END IF;
  IF qtype = 'MULTI_SELECT' AND (n_correct < 1 OR n_correct = n_total) THEN
    RAISE EXCEPTION 'INVALID_OPTIONS: multi-select needs at least 1 correct and 1 incorrect option';
  END IF;
END $$;

CREATE FUNCTION trg_question_options_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    PERFORM validate_question_options(NEW.id);
  ELSE
    IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM validate_question_options(OLD.question_id); END IF;
    IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM validate_question_options(NEW.question_id); END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER questions_options_valid AFTER INSERT OR UPDATE ON "questions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_question_options_check();
CREATE CONSTRAINT TRIGGER question_options_valid AFTER INSERT OR UPDATE OR DELETE ON "question_options"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_question_options_check();

-- A question used in a PUBLISHED exam is frozen (content, type, marks, options).
-- Deactivating it (is_active) is still allowed. To change it: unpublish the exam or duplicate the question.
CREATE FUNCTION question_in_published_exam(qid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM exam_questions eq JOIN exams e ON e.id = eq.exam_id
                 WHERE eq.question_id = qid AND e.status = 'PUBLISHED');
$$;

CREATE FUNCTION trg_questions_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.type, NEW.text, NEW.default_marks, NEW.category_id, NEW.difficulty,
      COALESCE(NEW.model_answer,''), COALESCE(NEW.explanation,''))
     IS DISTINCT FROM
     (OLD.type, OLD.text, OLD.default_marks, OLD.category_id, OLD.difficulty,
      COALESCE(OLD.model_answer,''), COALESCE(OLD.explanation,''))
     AND question_in_published_exam(OLD.id) THEN
    RAISE EXCEPTION 'QUESTION_LOCKED: question is used in a published exam';
  END IF;
  IF NEW.type <> OLD.type AND EXISTS (SELECT 1 FROM exam_questions WHERE question_id = OLD.id) THEN
    RAISE EXCEPTION 'QUESTION_LOCKED: cannot change type of a question assigned to an exam';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER questions_freeze BEFORE UPDATE ON "questions" FOR EACH ROW EXECUTE FUNCTION trg_questions_freeze();

CREATE FUNCTION trg_question_options_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE qid uuid := COALESCE(NEW.question_id, OLD.question_id);
BEGIN
  IF question_in_published_exam(qid) THEN
    RAISE EXCEPTION 'QUESTION_LOCKED: question is used in a published exam';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER question_options_freeze BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
  FOR EACH ROW EXECUTE FUNCTION trg_question_options_freeze();

-- ── exams ──
ALTER TABLE "exams"
  ADD CONSTRAINT "exams_title_not_blank" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "exams_duration_range" CHECK ("duration_minutes" BETWEEN 1 AND 1440),
  ADD CONSTRAINT "exams_total_marks_positive" CHECK ("total_marks" > 0),
  ADD CONSTRAINT "exams_pass_marks_range" CHECK ("pass_marks" >= 0 AND "pass_marks" <= "total_marks"),
  ADD CONSTRAINT "exams_window_order" CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" > "start_at"),
  ADD CONSTRAINT "exams_duration_fits_window" CHECK (
    "start_at" IS NULL OR "end_at" IS NULL
    OR "end_at" - "start_at" >= make_interval(mins => "duration_minutes")),
  ADD CONSTRAINT "exams_published_has_schedule" CHECK (
    "status" = 'DRAFT' OR ("start_at" IS NOT NULL AND "end_at" IS NOT NULL AND "published_at" IS NOT NULL)),
  ADD CONSTRAINT "exams_results_need_published_exam" CHECK (
    "results_status" = 'HIDDEN' OR ("status" = 'PUBLISHED' AND "results_published_at" IS NOT NULL)),
  ADD CONSTRAINT "exams_dispute_window_range" CHECK ("dispute_window_hours" BETWEEN 0 AND 720),
  ADD CONSTRAINT "exams_settings_object" CHECK (jsonb_typeof("settings") = 'object');

-- Lifecycle guards.
CREATE FUNCTION trg_exams_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'EXAM_LOCKED: only draft exams can be deleted'; END IF;
    RETURN OLD;
  END IF;
  -- Unpublish only before the exam window opens.
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' AND now() >= OLD.start_at THEN
    RAISE EXCEPTION 'EXAM_LOCKED: exam window has opened; it cannot be unpublished';
  END IF;
  -- Results cannot be published before the exam window closes.
  IF NEW.results_status = 'PUBLISHED' AND OLD.results_status = 'HIDDEN' AND now() < NEW.end_at THEN
    RAISE EXCEPTION 'RESULTS_TOO_EARLY: results can only be published after the exam ends';
  END IF;
  -- Once the window has opened, schedule/marking settings are frozen
  -- (end_at may still be EXTENDED, never shortened).
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'PUBLISHED' AND now() >= OLD.start_at THEN
    IF NEW.start_at <> OLD.start_at OR NEW.end_at < OLD.end_at
       OR NEW.duration_minutes <> OLD.duration_minutes OR NEW.total_marks <> OLD.total_marks
       OR NEW.multi_select_rule <> OLD.multi_select_rule
       OR NEW.shuffle_questions <> OLD.shuffle_questions OR NEW.shuffle_options <> OLD.shuffle_options THEN
      RAISE EXCEPTION 'EXAM_LOCKED: exam has started; schedule and marking settings are frozen';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exams_lifecycle BEFORE UPDATE OR DELETE ON "exams" FOR EACH ROW EXECUTE FUNCTION trg_exams_lifecycle();

-- Publish readiness, checked at COMMIT (so questions + publish can happen in one tx):
-- at least 1 question, all assigned questions active, sum(marks) = total_marks.
CREATE FUNCTION trg_exams_publish_ready() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n int; total numeric; inactive int;
BEGIN
  IF NEW.status <> 'PUBLISHED' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' AND NEW.total_marks = OLD.total_marks THEN RETURN NULL; END IF;
  SELECT count(*), COALESCE(sum(eq.marks),0), count(*) FILTER (WHERE NOT q.is_active)
    INTO n, total, inactive
    FROM exam_questions eq JOIN questions q ON q.id = eq.question_id WHERE eq.exam_id = NEW.id;
  IF n = 0 THEN RAISE EXCEPTION 'PUBLISH_BLOCKED: exam has no questions'; END IF;
  IF inactive > 0 THEN RAISE EXCEPTION 'PUBLISH_BLOCKED: exam contains % deactivated question(s)', inactive; END IF;
  IF total <> NEW.total_marks THEN
    RAISE EXCEPTION 'PUBLISH_BLOCKED: question marks add up to % but total marks is %', total, NEW.total_marks;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exams_publish_ready AFTER INSERT OR UPDATE ON "exams"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_exams_publish_ready();

-- ── exam_questions ──
ALTER TABLE "exam_questions"
  ADD CONSTRAINT "exam_questions_marks_positive" CHECK ("marks" > 0),
  ADD CONSTRAINT "exam_questions_negative_range" CHECK ("negative_marks" >= 0 AND "negative_marks" <= "marks"),
  ADD CONSTRAINT "exam_questions_order_non_negative" CHECK ("order_index" >= 0);

-- Question list can only change while the exam is a DRAFT; only active questions can be added;
-- written questions carry no negative marking.
CREATE FUNCTION trg_exam_questions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE est "ExamStatus"; qtype "QuestionType"; qactive boolean;
BEGIN
  SELECT status INTO est FROM exams WHERE id = COALESCE(NEW.exam_id, OLD.exam_id);
  IF FOUND AND est = 'PUBLISHED' THEN
    RAISE EXCEPTION 'EXAM_LOCKED: unpublish the exam before changing its questions';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT type, is_active INTO qtype, qactive FROM questions WHERE id = NEW.question_id;
  IF TG_OP = 'INSERT' AND NOT qactive THEN
    RAISE EXCEPTION 'QUESTION_INACTIVE: deactivated questions cannot be added to an exam';
  END IF;
  IF qtype = 'WRITTEN' AND NEW.negative_marks <> 0 THEN
    RAISE EXCEPTION 'INVALID_MARKS: written questions cannot have negative marking';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exam_questions_guard BEFORE INSERT OR UPDATE OR DELETE ON "exam_questions"
  FOR EACH ROW EXECUTE FUNCTION trg_exam_questions_guard();

-- ── enrollments ──
ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_revoked_consistent" CHECK (("status" = 'REVOKED') = ("revoked_at" IS NOT NULL));

CREATE FUNCTION trg_enrollments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Role"; er "Role";
BEGIN
  SELECT role INTO r FROM users WHERE id = NEW.candidate_id;
  IF r <> 'CANDIDATE' THEN RAISE EXCEPTION 'NOT_A_CANDIDATE: only candidates can be enrolled'; END IF;
  SELECT role INTO er FROM users WHERE id = NEW.enrolled_by;
  IF er NOT IN ('EXAMINER','ADMIN') THEN RAISE EXCEPTION 'FORBIDDEN: only examiners/admins can enroll'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enrollments_guard BEFORE INSERT OR UPDATE ON "enrollments"
  FOR EACH ROW EXECUTE FUNCTION trg_enrollments_guard();

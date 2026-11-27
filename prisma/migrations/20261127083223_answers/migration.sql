-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "auto_graded_at" TIMESTAMPTZ(3),
ADD COLUMN     "objective_score" DECIMAL(7,2);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "attempt_question_id" UUID NOT NULL,
    "selected_option_ids" JSONB NOT NULL DEFAULT '[]',
    "text_answer" TEXT,
    "marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "client_seq" INTEGER NOT NULL DEFAULT 0,
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auto_marks" DECIMAL(6,2),

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_question_id_key" ON "answers"("attempt_question_id");

-- CreateIndex
CREATE INDEX "answers_attempt_id_idx" ON "answers"("attempt_id");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_question_id_fkey" FOREIGN KEY ("attempt_question_id") REFERENCES "attempt_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ Answer rules enforced by the database ═══
ALTER TABLE "answers"
  ADD CONSTRAINT "answers_selection_array" CHECK (jsonb_typeof("selected_option_ids") = 'array'),
  ADD CONSTRAINT "answers_text_length" CHECK ("text_answer" IS NULL OR length("text_answer") <= 20000),
  ADD CONSTRAINT "answers_seq_non_negative" CHECK ("client_seq" >= 0);

-- Candidate content (selection, text, review flag) can only change while the attempt is
-- IN_PROGRESS and the server clock is within the deadline (+2 s network allowance).
-- After the attempt finishes only auto_marks may be written (by the grader).
CREATE FUNCTION trg_answers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a attempts%ROWTYPE; aq_attempt uuid;
BEGIN
  SELECT * INTO a FROM attempts WHERE id = NEW.attempt_id;
  SELECT attempt_id INTO aq_attempt FROM attempt_questions WHERE id = NEW.attempt_question_id;
  IF aq_attempt IS DISTINCT FROM NEW.attempt_id THEN
    RAISE EXCEPTION 'INVALID_ANSWER: question does not belong to this attempt';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.attempt_id <> OLD.attempt_id OR NEW.attempt_question_id <> OLD.attempt_question_id) THEN
    RAISE EXCEPTION 'ATTEMPT_LOCKED: answer identity cannot change';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.selected_option_ids IS DISTINCT FROM OLD.selected_option_ids
     OR NEW.text_answer IS DISTINCT FROM OLD.text_answer OR NEW.marked_for_review IS DISTINCT FROM OLD.marked_for_review THEN
    IF a.status <> 'IN_PROGRESS' OR now() > a.deadline_at + interval '2 seconds' THEN
      -- the grader may create empty rows for skipped questions after the attempt ends
      IF NOT (TG_OP = 'INSERT' AND NEW.selected_option_ids = '[]'::jsonb AND NEW.text_answer IS NULL) THEN
        RAISE EXCEPTION 'TIME_UP: this attempt is finished; answers can no longer change';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answers_guard BEFORE INSERT OR UPDATE ON "answers" FOR EACH ROW EXECUTE FUNCTION trg_answers_guard();

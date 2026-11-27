-- Written questions must carry the correct (model) answer: it is the reference used to
-- grade candidates' written responses (manual marking now, AI-assisted marking later).
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_written_has_answer"
  CHECK ("type" <> 'WRITTEN' OR length(btrim(COALESCE("model_answer", ''))) > 0);

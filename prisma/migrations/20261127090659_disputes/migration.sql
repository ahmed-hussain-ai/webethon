-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('GRADING_ERROR', 'AMBIGUOUS_QUESTION', 'TECHNICAL_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "attempt_question_id" UUID,
    "raised_by" UUID NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "marks_before" DECIMAL(6,2),
    "marks_after" DECIMAL(6,2),
    "score_before" DECIMAL(7,2),
    "score_after" DECIMAL(7,2),
    "applied_to_all" INTEGER NOT NULL DEFAULT 0,
    "resolved_by" UUID,
    "resolution_note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disputes_attempt_id_idx" ON "disputes"("attempt_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One open dispute per question (and one about the whole result) per attempt.
CREATE UNIQUE INDEX "disputes_one_open_per_question" ON "disputes" ("attempt_id", COALESCE("attempt_question_id", '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_description_length" CHECK (length(btrim("description")) >= 10),
  ADD CONSTRAINT "disputes_resolution_has_note" CHECK ("status" IN ('OPEN','UNDER_REVIEW') OR (length(btrim(coalesce("resolution_note",''))) > 0 AND "resolved_at" IS NOT NULL));

-- Audit log is append-only.
CREATE FUNCTION trg_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUDIT_LOCKED: audit records cannot be changed or deleted'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION trg_audit_append_only();

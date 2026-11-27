-- CreateTable
CREATE TABLE "result_reports" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "score" DECIMAL(7,2) NOT NULL,
    "total_marks" DECIMAL(7,2) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),

    CONSTRAINT "result_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_reports_code_key" ON "result_reports"("code");

-- CreateIndex
CREATE INDEX "result_reports_attempt_id_idx" ON "result_reports"("attempt_id");

-- AddForeignKey
ALTER TABLE "result_reports" ADD CONSTRAINT "result_reports_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one current (not superseded) report per attempt.
CREATE UNIQUE INDEX "result_reports_one_current" ON "result_reports" ("attempt_id") WHERE "superseded_at" IS NULL;

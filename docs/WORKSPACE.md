# Exam workspace (PDF 3.5 Examination Interface, 3.7 auto-marking, 4.1 Network-aware, 5.3 Failure-resilient)

## Candidate screen (`/attempts/:id`)
- Header: exam title, **save/connection status** (All answers saved · Saving… · Offline: N answers kept on this device · Couldn't save, retrying…), **server-synced timer** (turns red under 5 min; screen-reader announcements at 5 and 1 min), theme switch.
- **Question navigator**: answered (filled), not answered (outlined), **marked for review** (amber dot), current (ring); counts; legend.
- Question: marks and negative marks shown; radio (single), checkboxes (multi), text box with counter (written, ≤ 20,000 chars); Clear answer; Mark for review; Previous/Next.
- **Review & submit** dialog: answered / unanswered / to review counts, jump links to unanswered questions, warning that answers can't change afterwards.
- Read-only summary once submitted.

## Autosave & failure resilience
- Every change gets an increasing **sequence number** and is saved immediately (text: 0.8 s after typing stops).
- Unsynced changes are **kept in the browser (localStorage)**: they survive refresh, a crash or going offline, and are sent automatically when the connection returns (retries with back-off 1 s → 15 s).
- Server applies a save only if its sequence is **newer** than the stored one, so a slow old request can never overwrite a newer answer.
- Warning before leaving the page with unsynced answers.
- **No extra time**: the timer always follows the server deadline. Offline time still counts.

## Deadline & submission
- Saves are accepted only while the attempt is running and up to the deadline + **2 s network allowance** (API **and** DB trigger).
- At 0:00 the browser submits what it has; regardless, the server closes the attempt at the deadline (`AUTO_SUBMITTED`, `submitted_at = deadline`) on the next request. Answers that reached the server in time are what count.
- Submit is **idempotent** (double click / retry returns the same result) and flushes any last unsynced answers first.

## Automatic marking (on submit or time-up)
| Question | Rule |
|---|---|
| Skipped (nothing selected) | 0 (never negative) |
| Single choice | correct → marks, wrong → −negative marks |
| Multi-select, all-or-nothing | exact set → marks, otherwise → −negative |
| Multi-select, partial | marks × (correct picked − wrong picked) ÷ total correct; ≤ 0 → −negative; rounded to 2 dp |
| Written | not auto-marked: left for examiner / AI-suggested review |
- Uses the **frozen snapshot** of the candidate's paper, so later edits to questions can't change a score.
- Skipped questions get an empty answer row (for "frequently skipped" analytics).
- Idempotent and race-safe (only the first grader writes `objective_score`).

## API (candidate only, own attempt)
`GET /api/my/attempts/:id/paper` (no answer keys) · `POST /api/my/attempts/:id/answers` (batch autosave) · `POST /api/my/attempts/:id/submit`

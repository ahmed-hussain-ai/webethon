# Exam Builder (PDF 3.2 Examination Management, 3.4 Candidate Management, 4.4 candidate import)

Flow: **create draft → settings → pick questions → enroll candidates → review → publish**.

## Ownership
An exam belongs to the examiner who created it; admins can manage all exams. Other examiners get **404** (they can't learn it exists). Candidates are blocked (403).

## Lifecycle (status shown is computed from the server clock)
| Phase | Stored | When | What can change |
|---|---|---|---|
| Draft | DRAFT | not published | everything; can be deleted |
| Published · upcoming | PUBLISHED | before `start_at` | settings, schedule, enrollments; **question list locked**; can be unpublished |
| Ongoing | PUBLISHED | `start_at` ≤ now < `end_at` | only title/texts, **extending** the end time, enrollments |
| Completed | PUBLISHED | after `end_at` | nothing (kept for the record) |

All of the above is enforced by the API **and** the database (triggers), so it can't be bypassed.

## Settings
- Title, description, instructions (shown before starting).
- Opens/closes (`datetime-local` in the viewer's timezone, stored as UTC) and **duration per candidate**. A candidate's deadline is `min(start + duration, closing time)`, so late starters get less time.
- Window must be ≥ duration; end after start.
- Total and pass marks (pass ≤ total). "Use N" button copies the current question total.
- Multiple-select rule: **all-or-nothing** or **partial** = `marks × max(0, (correct picked − wrong picked) / total correct)`.
- **MCQs are always auto-marked**; examiner reviews before publishing results.
- **Auto-check written answers with AI** (on/off): on → AI compares the answer with the examiner's correct answer and suggests a mark; off → examiner marks manually. Either way the examiner reviews.
- Shuffle question order / answer options per candidate.

## Questions
- **Browse bank**: search, filter by category/difficulty/type, add (active questions only).
- **Random pick**: rules like "3 × Hard × Databases × any type"; crypto RNG; never picks a question twice or one already in the exam; clear message if the bank has too few.
- **Difficulty mix** bar: Easy/Medium/Hard counts and marks, types, categories (always visible).
- Per-exam marks (default from the bank) and negative marks (≤ marks; never on written questions). Reorder ↑↓, remove.
- Saved as one atomic replacement with a version check (`409 EDIT_CONFLICT` if changed elsewhere). Unsaved-changes warning.

## Publish checklist (blocking)
title · start & end set · end in the future · window ≥ duration · ≥ 1 question · no deactivated questions · **question marks = total marks** · pass ≤ total.
Warnings: no candidates yet; start time already passed (opens immediately).

## Candidates
- **Search** existing candidates, **paste emails**, or **CSV import** (`name,email`; template provided).
- CSV: dry-run report per row → all-or-nothing commit. New emails get an account with a **unique temporary password** (shown once, downloadable) and must change it at first login.
- Clear report: enrolled / re-enrolled / already enrolled / no account / not a candidate / invalid email.
- Remove = revoke (kept for history; can be re-enrolled). No enrollment after the exam ends.

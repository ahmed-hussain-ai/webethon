# Candidate: My Exams & starting an exam (PDF 3.4, 3.2 availability, 3.3 frozen paper, 06 data integrity)

## What candidates see
- **/my-exams** (their home page):
  - **Available now**: open exams and exams in progress (with time left);
  - **Upcoming**: countdown, and the page refreshes itself when the exam opens;
  - **Completed**: submitted (by them or at time-up) or missed.
- **Lobby** (`/my-exams/:id`): details, instructions, rules, "I have read the instructions" checkbox, **Start exam**.
  Warns when the exam closes before the full duration: "you'll only get 9 of 60 minutes".
- All countdowns use the **server's** clock (offset measured once), so a wrong device clock changes nothing.

## Rules
| Rule | Where |
|---|---|
| Only **published** exams the candidate is **actively enrolled** in (or already attempted). Anything else is a 404 (doesn't reveal it exists) | API + DB |
| Start only inside the window (`opens ≤ server time < closes`); refused with < 60 s left | API + DB |
| **One attempt per candidate per exam**. Double click, two tabs, retries: same attempt (20 simultaneous starts → 1 attempt) | partial unique index |
| Deadline fixed by the server at start: **min(start + duration, closing time)** | API + DB check |
| The paper is **frozen** at start: question order, option order (if shuffled), marks, and a snapshot incl. correct answers (server-only) | DB trigger blocks edits |
| Correct answers are never sent to the browser | API |
| A deadline can never be shortened; a submitted attempt can never be reopened | DB trigger |
| **Removed mid-exam**: the running attempt continues; removed before starting: can't start, exam hidden | API + DB |
| **Closing time extended**: running attempts that were cut short by the old closing time get the time back, never beyond the duration | DB trigger |
| Past the deadline, an attempt is **auto-submitted at the deadline** on the next read (no background job needed) | atomic UPDATE |
| An exam with attempts can't be unpublished or deleted | DB |

## API (candidate only)
`GET /api/my/exams` · `GET /api/my/exams/:id` · `POST /api/my/exams/:id/start` (idempotent) · `GET /api/my/attempts/:id` (own only)

## Next
The exam workspace: questions, answers with autosave, marked-for-review, connection status, submit (3.5).

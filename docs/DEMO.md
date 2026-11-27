# 15-minute demo script

Live: **https://webethon.cognifysol.com** · every demo account uses `Password@123`.

**Before you start:**
- open 3 browser windows (or profiles): **Admin**, **Examiner**, **Candidate**;
- log in as `admin@exam.test`, `examiner@exam.test` and `candidate1@exam.test`;
- in the Examiner window, create a short exam in advance that opens now, closes in 10 min, with a 5-min duration and `candidate1` enrolled. You'll use it in steps 3–5.

| Min | Section | Marks it targets |
|---|---|---|
| 0–1 | Pitch | — |
| 1–3 | Examiner builds an exam | Core 3.2–3.4, UI/UX |
| 3–7 | Candidate takes it (+ failure demo) | Core 3.5, 4.1, 4.7, 4.8, **5.3** |
| 7–9 | Live monitoring | Core 3.6, 5.1 |
| 9–11 | Marking, results, reports | Core 3.7–3.8, 4.2, 4.5, 4.6 |
| 11–13 | Disputes (innovation) | **5.4** |
| 13–14 | Admin & security | 3.1, Technical quality |
| 14–15 | Wrap-up | — |

## 0–1 · Pitch
"SecureExam is a full exam platform for admins, examiners and candidates. Three things set it apart:
- the **server** decides time and rules, enforced right in the database;
- candidates **never lose an answer**, even offline;
- results are **transparent**: verifiable reports and a fair dispute process."

## 1–3 · Examiner builds an exam (Examiner window)
1. **Question Bank:**
   - show the filters and the difficulty and type badges;
   - open **New question**, choose Single choice, mark **two** correct options → it's blocked. "The database enforces this too."
2. **Exams** → open the prepared exam:
   - **Settings:** schedule, duration, multi-select rule, "AI-check written answers", "Require fullscreen";
   - **Questions:** difficulty mix bar, then **Random pick** "2 × Hard, any category";
   - **Review:** the publish checklist, then **Preview as candidate** ("never counted").

## 3–7 · Candidate takes it (Candidate window)
1. **My Exams** → Open → the lobby shows the rules, including what is recorded ("no camera") → **Start**.
2. Answer two questions. Point out the "All answers saved" status and the question navigator; tick **Mark for review** (amber dot).
3. **Failure demo (5.3):**
   - turn off Wi-Fi and answer another question → yellow offline banner, "kept on this device";
   - turn Wi-Fi back on → it syncs;
   - **refresh** → everything is still there, and the timer kept running ("no extra time; the server sets the deadline").
4. **Display:** A++ text and the split layout with the **scratchpad**.
5. Switch tabs once (for the monitor in the next step). Then **Review & submit**: it lists unanswered questions → Submit.

## 7–9 · Live monitoring (Examiner window → exam → Live & results)
- Live table: progress, time left, last seen. The **"Left the exam tab"** incident is shown with Note/Dismiss.
- Say: "These are indicators, never proof; we don't use the camera."
- Send an **announcement** → it appears in the candidate window.

## 9–11 · Marking, results, reports
1. **Suggest marks with AI** → open the candidate → the AI mark and reason are shown → **Use this mark** or type your own. Try a mark above the maximum → blocked.
2. Switch to the completed demo exam **Programming Fundamentals Final** → **Results**:
   - statistics, distribution, **question analytics** (skip rate, set vs observed difficulty, most common wrong answer);
   - **Download exam report (PDF)**.
3. Candidate window → that exam → **View result** → **Download PDF report**. Open `/verify` → type the code → "Authentic", with the name masked.

## 11–13 · Disputes (innovation 5.4)
1. Candidate window (log in as `candidate3@exam.test` for the seeded dispute): result → their dispute is **Open**.
2. Examiner → **Disputes** → shows the answer next to the correct answer. Enter a response, a new mark, and optionally **Apply to every candidate** → **Accept**.
3. Back as the candidate: the examiner's response and "Your score changed from 13 to 15". Verify the **old** PDF code → now "**superseded**".
4. Say: "After publishing, marks can only change through this path, enforced by the database, and every change goes in an append-only audit log."

## 13–14 · Admin & security (Admin window)
- **Dashboard** overview → **Users**:
  - **New user** → centered card with a temporary password and Copy;
  - **Reset password** → confirm card → new password.
- Try to demote yourself → blocked. Show the examiner2 login can't open examiner 1's exam ("Not found").

## 14–15 · Wrap-up
"Every core and secondary requirement works on live data, and the key rules are enforced by the database itself. Our innovation focus is fair disputes, backed by failure-resilience and privacy-friendly integrity."

---

## Likely judge questions
| Question | Answer |
|---|---|
| What if the internet drops? | Answers are queued on the device and resent automatically; the timer follows the server's deadline, so nobody gains time. |
| What if they close the laptop? | Saved answers are on the server; reopening resumes. At the deadline the server closes the attempt using only answers received in time. |
| Can a candidate change their clock? | No. The deadline is set by the server at start; the timer shows server time. |
| Double-click submit / two tabs? | Start and submit are idempotent; the database allows exactly one attempt. |
| Can they see answer keys in the network tab? | No. Correct answers never leave staff endpoints; the paper sent to candidates has no correct flags. |
| What if a question is edited mid-exam? | Each candidate's paper is frozen at start (snapshot); edits can't affect it. Questions in published exams are locked anyway. |
| Is the AI mark final? | Never. It's a suggestion with a reason; the examiner accepts or changes it. Without an API key, marking is manual. Answers trying to instruct the AI are flagged. |
| Is AI marking consistent? | Temperature 0, strict JSON, fixed rubric, rounded to ½ mark; identical answers reuse the same result. |
| Fairness of random papers? | Random pick works by difficulty and category rules; the difficulty mix bar shows the balance before publishing. |
| Why trust the results? | Verification codes and QR, content hashes (superseded on change), an audit log, and changes only via disputes. |
| Privacy? | No camera or microphone; public verification shows a masked name only; per-IP rate limits. |
| Why Next.js + Postgres + Prisma? | One TypeScript codebase for UI and API; Postgres for transactions, constraints and triggers that guarantee the rules; Prisma for typed queries and migrations. |

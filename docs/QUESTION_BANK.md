# Question Bank (PDF 3.3 Question Management, 4.4 Bulk Data Import)

One **shared** bank for the whole platform. Examiners build exams by picking questions from it.

## Permissions
| Action | Examiner | Admin | Candidate |
|---|---|---|---|
| View bank (incl. correct answers) | ✅ | ✅ | ❌ 403: answer keys never leave staff routes |
| Create question / category | ✅ (becomes owner) | ✅ | ❌ |
| Edit, deactivate, reactivate a question | own only | any | ❌ |
| Rename / delete a category | own only | any | ❌ |
| Duplicate any question | ✅ (copy is theirs) | ✅ | ❌ |

## Rules (same checks in the browser, the API and the database)
| Type | Options | Correct |
|---|---|---|
| Single choice | 2–10 | exactly 1 |
| Multiple select | 2–10 | ≥ 1 correct **and** ≥ 1 incorrect |
| Written | none | n/a (optional model answer for markers) |

- No duplicate option text (`"Stack"` = `" stack "`). Marks 0.01–1000, max 2 decimals. Question ≤ 5000 chars, option ≤ 1000.
- Text is shown as plain text, never HTML (no script injection).
- **Saving** replaces the question and its options in one transaction; the database re-checks the option rules at commit.
- **Concurrent edits:** each save carries the version it was loaded at; if someone saved in between → `409 EDIT_CONFLICT` "reload", never a silent overwrite.
- **Locked 🔒:** a question used in a **published** exam cannot be edited (every candidate must see the same paper). Use **Duplicate** for an editable copy.
- Type cannot change once the question is assigned to any exam.
- Questions are never deleted, only **deactivated** (hidden from the exam builder; exams already using them keep them).
- Categories: unique ignoring case/spaces; only empty categories can be deleted.

## Bulk import
- CSV or JSON, ≤ 1 MB, ≤ 500 questions. Templates: `/templates/questions-template.csv` and `.json`.
- CSV columns: `type, category, difficulty, marks, text, option_a … option_j, correct, model_answer, explanation`
  - `type`: single / multi / written (also mcq, multiple, essay…). `correct`: `B` or `A;C`.
- **Step 1, check (dry run):** every row is validated with the same rules; errors are listed per row (row numbers match the spreadsheet).
- **Step 2, import:** allowed only with **0 errors**, all-or-nothing in one transaction. The server re-validates; it never trusts the earlier check.
- Unknown categories are created automatically (matched ignoring case: ` programming ` → `Programming`).
- Same question twice in the file → error. Same text already in the bank → warning only.

## API
| Method & path | Notes |
|---|---|
| `GET /api/questions?q&category&type&difficulty&status&mine&page` | 20 per page; bad filter values are ignored |
| `POST /api/questions` | create |
| `GET / PUT /api/questions/:id` | PUT = full replacement + `updatedAt` |
| `POST /api/questions/:id/duplicate · deactivate · reactivate` | |
| `POST /api/questions/import` `{ format, content, dryRun }` | |
| `GET / POST /api/categories`, `PATCH / DELETE /api/categories/:id` | |

## Screens
`/questions` (search + filters), `/questions/new`, `/questions/:id` (edit, or view-only when locked / not owner, with a live candidate preview), `/categories`, `/questions/import`.

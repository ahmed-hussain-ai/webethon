// Demo data: npm run db:seed   (wipes and recreates everything)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, QuestionType, Difficulty } from "../src/generated/prisma/client";
import { markObjective, type Snapshot } from "../src/lib/attempts/marking";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const PASSWORD = "Password@123";
const HOUR = 3600_000;

type Q = {
  cat: string;
  type: QuestionType;
  diff: Difficulty;
  marks: number;
  text: string;
  options?: [string, boolean][];
  modelAnswer?: string;
};

const QUESTIONS: Q[] = [
  // Web Development
  { cat: "Web Development", type: "SINGLE_CHOICE", diff: "EASY", marks: 2, text: "Which HTTP status code means 'Not Found'?",
    options: [["200", false], ["301", false], ["404", true], ["500", false]] },
  { cat: "Web Development", type: "SINGLE_CHOICE", diff: "MEDIUM", marks: 2, text: "Which HTTP method is idempotent and typically used to fully replace a resource?",
    options: [["POST", false], ["PUT", true], ["PATCH", false], ["CONNECT", false]] },
  { cat: "Web Development", type: "MULTI_SELECT", diff: "MEDIUM", marks: 4, text: "Which of the following are valid CSS layout systems?",
    options: [["Flexbox", true], ["Grid", true], ["Stackbox", false], ["Multi-column", true]] },
  { cat: "Web Development", type: "WRITTEN", diff: "HARD", marks: 10, text: "Explain the difference between server-side rendering and client-side rendering. Give one advantage of each.",
    modelAnswer: "SSR renders HTML on the server per request (better first paint/SEO); CSR renders in the browser with JS (richer interactivity, less server load)." },
  // Databases
  { cat: "Databases", type: "SINGLE_CHOICE", diff: "EASY", marks: 2, text: "Which SQL clause filters rows after grouping?",
    options: [["WHERE", false], ["HAVING", true], ["ORDER BY", false], ["LIMIT", false]] },
  { cat: "Databases", type: "MULTI_SELECT", diff: "HARD", marks: 4, text: "Which properties are part of ACID?",
    options: [["Atomicity", true], ["Consistency", true], ["Availability", false], ["Durability", true]] },
  { cat: "Databases", type: "SINGLE_CHOICE", diff: "MEDIUM", marks: 2, text: "A foreign key primarily enforces…",
    options: [["Uniqueness", false], ["Referential integrity", true], ["Indexing", false], ["Encryption", false]] },
  { cat: "Databases", type: "WRITTEN", diff: "MEDIUM", marks: 6, text: "What is database normalization and why is it used?",
    modelAnswer: "Organising tables to reduce redundancy and update anomalies, e.g. moving repeating groups into separate related tables (1NF/2NF/3NF)." },
  // Security
  { cat: "Security", type: "SINGLE_CHOICE", diff: "EASY", marks: 2, text: "Which attack injects malicious scripts into pages viewed by other users?",
    options: [["SQL injection", false], ["Cross-site scripting (XSS)", true], ["Phishing", false], ["DDoS", false]] },
  { cat: "Security", type: "MULTI_SELECT", diff: "MEDIUM", marks: 4, text: "Which practices help protect stored passwords?",
    options: [["Salting", true], ["Slow hashing (bcrypt/argon2)", true], ["Base64 encoding", false], ["Storing in plain text", false]] },
  { cat: "Security", type: "SINGLE_CHOICE", diff: "HARD", marks: 2, text: "Which cookie attribute stops JavaScript from reading the cookie?",
    options: [["Secure", false], ["SameSite", false], ["HttpOnly", true], ["Path", false]] },
  { cat: "Security", type: "WRITTEN", diff: "HARD", marks: 8, text: "Why must authorization be enforced on the server and not only by hiding buttons in the UI?",
    modelAnswer: "Clients can be modified or bypassed (direct API calls), so only server-side checks reliably protect data and actions." },
  // General Programming
  { cat: "Programming", type: "SINGLE_CHOICE", diff: "EASY", marks: 2, text: "What is the time complexity of binary search on a sorted array?",
    options: [["O(n)", false], ["O(log n)", true], ["O(n log n)", false], ["O(1)", false]] },
  { cat: "Programming", type: "MULTI_SELECT", diff: "EASY", marks: 4, text: "Which of these are JavaScript primitive types?",
    options: [["string", true], ["boolean", true], ["array", false], ["undefined", true], ["object", false]] },
  { cat: "Programming", type: "SINGLE_CHOICE", diff: "MEDIUM", marks: 2, text: "Which data structure works on a First-In-First-Out basis?",
    options: [["Stack", false], ["Queue", true], ["Tree", false], ["Graph", false]] },
];

async function main() {
  // Wipe in FK-safe order. Exams can only be deleted as drafts (DB rule), so demote first.
  await db.$executeRawUnsafe(`ALTER TABLE exams DISABLE TRIGGER exams_lifecycle`);
  await db.$executeRawUnsafe(`ALTER TABLE question_options DISABLE TRIGGER question_options_freeze`);
  await db.$executeRawUnsafe(`ALTER TABLE exam_questions DISABLE TRIGGER exam_questions_guard`);
  try {
    await db.$executeRawUnsafe(`TRUNCATE audit_logs`); // append-only: rows can only be removed by TRUNCATE
    await db.attempt.deleteMany(); // cascades the frozen papers
    await db.enrollment.deleteMany();
    await db.examQuestion.deleteMany();
    await db.exam.deleteMany();
    await db.question.deleteMany(); // cascades options
    await db.category.deleteMany();
    await db.workspacePreferences.deleteMany();
    await db.user.deleteMany();
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE exams ENABLE TRIGGER exams_lifecycle`);
    await db.$executeRawUnsafe(`ALTER TABLE question_options ENABLE TRIGGER question_options_freeze`);
    await db.$executeRawUnsafe(`ALTER TABLE exam_questions ENABLE TRIGGER exam_questions_guard`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mk = (name: string, email: string, role: "ADMIN" | "EXAMINER" | "CANDIDATE") =>
    db.user.create({ data: { name, email, role, passwordHash, preferences: { create: {} } } });

  const admin = await mk("Ayesha Admin", "admin@exam.test", "ADMIN");
  const ex1 = await mk("Usman Examiner", "examiner@exam.test", "EXAMINER");
  const ex2 = await mk("Sara Examiner", "examiner2@exam.test", "EXAMINER");
  const candidates = await Promise.all(
    ["Ali Raza", "Fatima Khan", "Hamza Iqbal", "Zainab Ahmed", "Bilal Hussain"].map((n, i) =>
      mk(n, `candidate${i + 1}@exam.test`, "CANDIDATE"),
    ),
  );

  const cats = new Map<string, string>();
  for (const name of ["Web Development", "Databases", "Security", "Programming"]) {
    const c = await db.category.create({ data: { name, description: `${name} questions`, createdById: ex1.id } });
    cats.set(name, c.id);
  }

  const qs: { id: string; defaultMarks: number }[] = [];
  for (const q of QUESTIONS) {
    const created = await db.question.create({
      select: { id: true },
      data: {
        categoryId: cats.get(q.cat)!, createdById: ex1.id, type: q.type, difficulty: q.diff,
        text: q.text, defaultMarks: q.marks, modelAnswer: q.modelAnswer ?? null,
        options: q.options ? { create: q.options.map(([text, isCorrect], orderIndex) => ({ text, isCorrect, orderIndex })) } : undefined,
      },
    });
    qs.push({ id: created.id, defaultMarks: q.marks });
  }

  const now = Date.now();
  // Creates the exam as DRAFT with its questions, then publishes (DB checks marks add up).
  async function makeExam(opts: {
    title: string; owner: string; startOffsetH: number; windowH: number; duration: number;
    qIdx: number[]; publish: boolean; shuffle?: boolean; rule?: "ALL_OR_NOTHING" | "PARTIAL"; enroll: number[];
  }) {
    const picked = opts.qIdx.map((i) => qs[i]);
    const total = picked.reduce((s, q) => s + Number(q.defaultMarks), 0);
    const exam = await db.exam.create({
      data: {
        title: opts.title, createdById: opts.owner,
        description: `Demo exam: ${opts.title}`,
        instructions: "Read each question carefully. Answers save automatically. The timer keeps running if you disconnect.",
        startAt: new Date(now + opts.startOffsetH * HOUR),
        endAt: new Date(now + (opts.startOffsetH + opts.windowH) * HOUR),
        durationMinutes: opts.duration, totalMarks: total, passMarks: Math.round(total * 0.5),
        shuffleQuestions: !!opts.shuffle, shuffleOptions: !!opts.shuffle,
        multiSelectRule: opts.rule ?? "ALL_OR_NOTHING",
        settings: { requireFullscreen: false, maxTabSwitchWarnings: 3 },
        questions: { create: picked.map((q, orderIndex) => ({ questionId: q.id, marks: q.defaultMarks, orderIndex })) },
      },
    });
    if (opts.publish) await db.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    for (const i of opts.enroll) {
      await db.enrollment.create({ data: { examId: exam.id, candidateId: candidates[i].id, enrolledById: opts.owner } });
    }
    return exam;
  }

  await makeExam({ title: "Web Fundamentals Quiz", owner: ex1.id, startOffsetH: -1, windowH: 48, duration: 30,
    qIdx: [0, 1, 2, 3, 8, 10], publish: true, shuffle: true, rule: "PARTIAL", enroll: [0, 1, 2, 3] });
  await makeExam({ title: "Database Systems Midterm", owner: ex1.id, startOffsetH: 24, windowH: 4, duration: 60,
    qIdx: [4, 5, 6, 7], publish: true, enroll: [0, 1, 4] });
  await makeExam({ title: "Security Basics (Draft)", owner: ex2.id, startOffsetH: 72, windowH: 2, duration: 45,
    qIdx: [8, 9, 10, 11], publish: false, enroll: [] });

  await seedCompletedExam(ex1.id, candidates.map((c) => c.id), qs.map((q) => q.id));
  console.log(`Seeded: 1 admin, 2 examiners, ${candidates.length} candidates, ${cats.size} categories, ${qs.length} questions, 4 exams (1 completed with published results).`);
  console.log(`Password for every account: ${PASSWORD}  (admin: ${admin.email})`);
}

/**
 * A COMPLETED exam with real-looking history (attempts two days ago, marked, results
 * published, one open dispute, a few incidents) so results, analytics, reports and
 * disputes can be demonstrated immediately. Written with triggers off (past timestamps).
 */
async function seedCompletedExam(examinerId: string, candidateIds: string[], questionIds: string[]) {
  const pick = [12, 13, 14, 0, 3].map((i) => questionIds[i]);
  const questions = await db.question.findMany({ where: { id: { in: pick } }, include: { options: { orderBy: { orderIndex: "asc" } }, category: true } });
  const ordered = pick.map((id) => questions.find((q) => q.id === id)!);
  const total = ordered.reduce((s, q) => s + Number(q.defaultMarks), 0);
  const DAY = 24 * HOUR, start = new Date(Date.now() - 2 * DAY), end = new Date(start.getTime() + 3 * HOUR);
  // Candidate behaviour: probability of a correct objective answer, written mark ratio (null = skipped)
  const profiles = [{ p: 1, w: 0.8 }, { p: 0.75, w: 0.6 }, { p: 0.5, w: 0.3 }, { p: 0.25, w: null }];
  const WRITTEN = ["SSR renders HTML on the server for each request, which helps SEO and first paint; CSR renders in the browser, which allows rich interactivity and reduces server load.",
    "Server-side rendering builds pages on the server so they load fast; client-side rendering uses JavaScript in the browser so the app feels more interactive.",
    "SSR is on the server and CSR is on the client. SSR is good for SEO."];

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`); // historical data: bypass "now"-based triggers
    const exam = await tx.exam.create({
      data: {
        title: "Programming Fundamentals Final", createdById: examinerId, description: "Completed demo exam with published results",
        instructions: "Answer all questions. Multiple-select questions use partial marking.", startAt: start, endAt: end,
        durationMinutes: 45, totalMarks: total, passMarks: Math.round(total * 0.5), status: "PUBLISHED", publishedAt: new Date(start.getTime() - DAY),
        multiSelectRule: "PARTIAL", resultsStatus: "PUBLISHED", resultsPublishedAt: new Date(end.getTime() + 20 * HOUR),
        questions: { create: ordered.map((q, orderIndex) => ({ questionId: q.id, marks: q.defaultMarks, orderIndex })) },
      },
    });
    for (const cid of candidateIds) await tx.enrollment.create({ data: { examId: exam.id, candidateId: cid, enrolledById: examinerId, enrolledAt: new Date(start.getTime() - DAY) } });

    for (const [ci, prof] of profiles.entries()) {
      const startedAt = new Date(start.getTime() + (10 + ci * 7) * 60_000);
      const deadlineAt = new Date(startedAt.getTime() + 45 * 60_000);
      const submittedAt = new Date(startedAt.getTime() + (30 + ci * 3) * 60_000);
      const attempt = await tx.attempt.create({
        data: { examId: exam.id, userId: candidateIds[ci], status: ci === 3 ? "AUTO_SUBMITTED" : "SUBMITTED", startedAt, deadlineAt,
          submittedAt: ci === 3 ? deadlineAt : submittedAt, lastSeenAt: submittedAt, questionCount: ordered.length, totalMarks: total, autoGradedAt: submittedAt },
      });
      let sum = 0;
      for (const [i, q] of ordered.entries()) {
        const snap: Snapshot = {
          type: q.type, text: q.text, difficulty: q.difficulty, category: q.category.name,
          options: q.options.map((o) => ({ id: o.id, text: o.text })), correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id), modelAnswer: q.modelAnswer,
        };
        const aq = await tx.attemptQuestion.create({ data: { attemptId: attempt.id, questionId: q.id, orderIndex: i, optionOrder: snap.options.map((o) => o.id), marks: q.defaultMarks, snapshot: snap } });
        const marks = Number(q.defaultMarks);
        if (q.type === "WRITTEN") {
          const text = prof.w === null ? null : WRITTEN[ci];
          const manual = prof.w === null ? null : Math.round(marks * prof.w * 2) / 2;
          sum += manual ?? 0;
          await tx.answer.create({ data: { attemptId: attempt.id, attemptQuestionId: aq.id, textAnswer: text, autoMarks: prof.w === null ? 0 : null, manualMarks: manual, gradedById: manual === null ? null : examinerId, gradedAt: manual === null ? null : end, clientSeq: i + 1 } });
        } else {
          const correct = ((ci * 3 + i * 5) % 100) / 100 < prof.p; // deterministic spread
          const wrong = snap.options.filter((o) => !snap.correctOptionIds.includes(o.id)).map((o) => o.id);
          const sel = correct ? snap.correctOptionIds : q.type === "MULTI_SELECT" ? [snap.correctOptionIds[0], wrong[0]] : [wrong[ci % wrong.length]];
          const auto = markObjective(snap, sel, marks, 0, "PARTIAL") ?? 0;
          sum += auto;
          await tx.answer.create({ data: { attemptId: attempt.id, attemptQuestionId: aq.id, selectedOptionIds: sel, autoMarks: auto, clientSeq: i + 1, markedForReview: ci === 2 && i === 1 } });
        }
        if (q.type === "WRITTEN" && ci === 2) {
          await tx.dispute.create({ data: { attemptId: attempt.id, attemptQuestionId: aq.id, raisedById: candidateIds[ci], category: "GRADING_ERROR",
            description: "I explained both SSR and CSR and gave an advantage (SEO). I think this deserves more than 3 marks." } });
        }
      }
      await tx.attempt.update({ where: { id: attempt.id }, data: { objectiveScore: sum, totalScore: Math.max(0, sum), pendingCount: 0 } });
      if (ci === 1) await tx.attemptEvent.createMany({ data: [{ attemptId: attempt.id, type: "TAB_HIDDEN", serverTime: new Date(startedAt.getTime() + 12 * 60_000) }, { attemptId: attempt.id, type: "TAB_HIDDEN", serverTime: new Date(startedAt.getTime() + 19 * 60_000) }] });
      if (ci === 3) await tx.attemptEvent.createMany({ data: [{ attemptId: attempt.id, type: "PASTE", details: { length: 214 }, serverTime: new Date(startedAt.getTime() + 25 * 60_000) }, { attemptId: attempt.id, type: "CONNECTION_LOST", serverTime: new Date(startedAt.getTime() + 30 * 60_000) }, { attemptId: attempt.id, type: "CONNECTION_RESTORED", details: { offlineSeconds: 48 }, serverTime: new Date(startedAt.getTime() + 31 * 60_000) }] });
    }
    await tx.announcement.create({ data: { examId: exam.id, createdById: examinerId, message: "Reminder: multiple-select questions use partial marking.", createdAt: new Date(start.getTime() + 20 * 60_000) } });
    await tx.auditLog.create({ data: { actorId: examinerId, action: "RESULTS_PUBLISHED", entityType: "exam", entityId: exam.id, createdAt: new Date(end.getTime() + 20 * HOUR), details: { demo: true } } });
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

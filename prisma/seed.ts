// Demo data: npm run db:seed   (wipes and recreates everything)
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, QuestionType, Difficulty } from "../src/generated/prisma/client";

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

  console.log(`Seeded: 1 admin, 2 examiners, ${candidates.length} candidates, ${cats.size} categories, ${qs.length} questions, 3 exams.`);
  console.log(`Password for every account: ${PASSWORD}  (admin: ${admin.email})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

import "server-only";
import { createHash, randomInt } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { loadOwnedExam } from "@/lib/exams/service";
import { getResults } from "./service";
import type { Snapshot } from "@/lib/attempts/grading";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const newCode = () => Array.from({ length: 12 }, (_, i) => (i === 4 || i === 8 ? "-" : "") + ALPH[randomInt(ALPH.length)]).join("");
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Data a report certifies; hashing it lets verification detect later changes. */
async function reportData(attemptId: string) {
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, userId: true, isSandbox: true, status: true, submittedAt: true, totalScore: true, totalMarks: true,
      user: { select: { name: true, email: true } },
      exam: { select: { id: true, title: true, passMarks: true, resultsStatus: true, resultsPublishedAt: true, createdById: true } },
      questions: { orderBy: { orderIndex: "asc" }, select: { orderIndex: true, marks: true, snapshot: true, answer: { select: { autoMarks: true, manualMarks: true } } } },
    },
  });
  if (!a || a.isSandbox) return null;
  const score = Number(a.totalScore ?? 0), total = Number(a.totalMarks);
  return {
    a, score, total, percent: total ? r2((score / total) * 100) : 0, passed: score >= Number(a.exam.passMarks),
    rows: a.questions.map((q) => {
      const s = q.snapshot as Snapshot;
      const f = q.answer ? (q.answer.manualMarks ?? q.answer.autoMarks) : null;
      return { n: q.orderIndex + 1, type: s.type, text: s.text, marks: Number(q.marks), awarded: f === null ? 0 : Number(f) };
    }),
  };
}
const hashOf = (d: NonNullable<Awaited<ReturnType<typeof reportData>>>) =>
  createHash("sha256").update(JSON.stringify([d.a.id, d.a.exam.title, d.a.user.name, d.score, d.total, d.rows.map((r) => r.awarded)])).digest("hex");

/** Current report for an attempt; a new code is issued if marks changed since the last one. */
async function issueReport(attemptId: string) {
  const d = await reportData(attemptId);
  if (!d || d.a.exam.resultsStatus !== "PUBLISHED") throw new ApiError(404, "NOT_FOUND", "Report not available until results are published");
  const hash = hashOf(d);
  const current = await db.resultReport.findFirst({ where: { attemptId, supersededAt: null } });
  if (current && current.contentHash === hash) return { d, report: current };
  const report = await db.$transaction(async (tx) => {
    if (current) await tx.resultReport.update({ where: { id: current.id }, data: { supersededAt: new Date() } });
    return tx.resultReport.create({ data: { attemptId, code: newCode(), contentHash: hash, score: d.score, totalMarks: d.total } });
  });
  return { d, report };
}

const TEAL = rgb(0.06, 0.37, 0.35), INK = rgb(0.06, 0.18, 0.17), MUTED = rgb(0.34, 0.43, 0.42), LINE = rgb(0.84, 0.89, 0.88);
// Built-in PDF fonts only cover basic Latin: replace anything else so text never breaks the PDF.
const safe = (t: string) => t.replace(/[^\x20-\x7E]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = safe(text).split(/\s+/), lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function header(pdf: PDFDocument, page: PDFPage, bold: PDFFont, font: PDFFont, title: string, subtitle: string) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: TEAL });
  page.drawText("EXAMORA  ·  FAIR EXAMS. VERIFIED RESULTS.", { x: 40, y: height - 40, size: 9, font, color: rgb(0.78, 0.87, 0.86) });
  page.drawText(safe(title), { x: 40, y: height - 72, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(subtitle), { x: 40, y: height - 94, size: 11, font, color: rgb(0.85, 0.93, 0.92) });
}

/** Candidate result report with verification code + QR (candidate: own; examiner: own exam). */
export async function candidateReportPdf(actor: CurrentUser, attemptId: string, origin: string) {
  const pre = await reportData(attemptId);
  if (!pre) throw new ApiError(404, "NOT_FOUND", "Report not found");
  if (actor.role === "CANDIDATE" ? pre.a.userId !== actor.id : actor.role !== "ADMIN" && pre.a.exam.createdById !== actor.id) {
    throw new ApiError(404, "NOT_FOUND", "Report not found");
  }
  const { d, report } = await issueReport(attemptId);
  const verifyUrl = `${origin}/verify/${report.code}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Result - ${safe(d.a.exam.title)}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  await header(pdf, page, bold, font, "Result Report", d.a.exam.title);
  let y = 842 - 150;
  const kv = (k: string, v: string, x: number) => {
    page.drawText(k.toUpperCase(), { x, y, size: 8, font, color: MUTED });
    page.drawText(safe(v), { x, y: y - 16, size: 12, font: bold, color: INK });
  };
  kv("Candidate", d.a.user.name, 40); kv("Email", d.a.user.email, 300); y -= 44;
  kv("Submitted", d.a.submittedAt ? d.a.submittedAt.toUTCString() : "-", 40);
  kv("Published", d.a.exam.resultsPublishedAt ? d.a.exam.resultsPublishedAt.toUTCString() : "-", 300); y -= 60;

  page.drawRectangle({ x: 40, y: y - 30, width: 515, height: 66, color: rgb(0.94, 0.96, 0.96), borderColor: LINE, borderWidth: 1 });
  page.drawText(`${d.score} / ${d.total}`, { x: 60, y: y - 8, size: 26, font: bold, color: INK });
  page.drawText(`${d.percent}%`, { x: 260, y: y - 8, size: 20, font: bold, color: INK });
  page.drawText(d.passed ? "PASSED" : "NOT PASSED", { x: 400, y: y - 8, size: 16, font: bold, color: d.passed ? rgb(0.12, 0.48, 0.23) : rgb(0.78, 0.12, 0.23) });
  y -= 70;

  page.drawText("QUESTION", { x: 40, y, size: 8, font, color: MUTED });
  page.drawText("MARKS", { x: 500, y, size: 8, font, color: MUTED });
  y -= 8;
  for (const r of d.rows) {
    const lines = wrap(`${r.n}. ${r.text}`, font, 10, 420).slice(0, 2);
    if (y - lines.length * 13 < 140) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, color: LINE, thickness: 0.7 });
    y -= 14;
    lines.forEach((l, i) => page.drawText(l, { x: 40, y: y - i * 13, size: 10, font, color: INK }));
    page.drawText(`${r.awarded} / ${r.marks}`, { x: 500, y, size: 10, font: bold, color: INK });
    y -= lines.length * 13 + 4;
  }

  // Verification block (on the last page)
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220 });
  const img = await pdf.embedPng(qr);
  page.drawRectangle({ x: 40, y: 40, width: 515, height: 90, borderColor: LINE, borderWidth: 1 });
  page.drawImage(img, { x: 52, y: 48, width: 74, height: 74 });
  page.drawText("VERIFY THIS REPORT", { x: 140, y: 108, size: 8, font, color: MUTED });
  page.drawText(report.code, { x: 140, y: 88, size: 16, font: bold, color: TEAL });
  page.drawText(safe(verifyUrl), { x: 140, y: 70, size: 8, font, color: MUTED });
  page.drawText(`Issued ${report.issuedAt.toUTCString()}. Scan the code or enter it at /verify to confirm authenticity.`, { x: 140, y: 56, size: 7.5, font, color: MUTED });
  return { bytes: await pdf.save(), filename: `result-${report.code}.pdf` };
}

/** Exam performance report for the examiner (summary + every candidate's score). */
export async function examReportPdf(actor: CurrentUser, examId: string) {
  await loadOwnedExam(actor, examId);
  const r = await getResults(actor, examId);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  await header(pdf, page, bold, font, "Exam Performance Report", r.exam.title);
  let y = 842 - 150;
  const s = r.summary;
  const stats: [string, string][] = [
    ["Submitted", String(s.submitted)], ["Absent", String(s.absent)], ["Average", s.average === null ? "-" : `${s.average} / ${r.exam.totalMarks}`],
    ["Median", s.median === null ? "-" : String(s.median)], ["Highest", s.highest === null ? "-" : String(s.highest)], ["Lowest", s.lowest === null ? "-" : String(s.lowest)],
    ["Pass rate", s.passRate === null ? "-" : `${s.passRate}%`], ["Pass mark", String(r.exam.passMarks)],
  ];
  stats.forEach(([k, v], i) => {
    const x = 40 + (i % 4) * 130, yy = y - Math.floor(i / 4) * 42;
    page.drawText(k.toUpperCase(), { x, y: yy, size: 8, font, color: MUTED });
    page.drawText(v, { x, y: yy - 16, size: 13, font: bold, color: INK });
  });
  y -= 100;
  page.drawText(`Results: ${r.exam.resultsStatus === "PUBLISHED" ? "published" : "NOT published (draft figures)"}`, { x: 40, y, size: 9, font, color: MUTED });
  y -= 24;
  const cols = [40, 250, 380, 450, 505];
  ["CANDIDATE", "STATUS", "SCORE", "%", "RESULT"].forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 8, font, color: MUTED }));
  y -= 6;
  for (const a of r.attempts) {
    if (y < 60) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, color: LINE, thickness: 0.7 });
    y -= 15;
    page.drawText(safe(a.candidate.name).slice(0, 38), { x: cols[0], y, size: 10, font, color: INK });
    page.drawText(a.status === "IN_PROGRESS" ? "In progress" : a.status === "AUTO_SUBMITTED" ? "Time-up" : "Submitted", { x: cols[1], y, size: 10, font, color: INK });
    page.drawText(a.score === null ? "-" : String(a.score), { x: cols[2], y, size: 10, font: bold, color: INK });
    page.drawText(a.percent === null ? "-" : String(a.percent), { x: cols[3], y, size: 10, font, color: INK });
    page.drawText(a.pending ? "to mark" : a.passed === null ? "-" : a.passed ? "Pass" : "Fail", { x: cols[4], y, size: 10, font: bold, color: a.passed ? rgb(0.12, 0.48, 0.23) : rgb(0.78, 0.12, 0.23) });
    y -= 6;
  }
  page.drawText(`Generated ${new Date().toUTCString()}`, { x: 40, y: 30, size: 8, font, color: MUTED });
  return { bytes: await pdf.save(), filename: `exam-report-${r.exam.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf` };
}

/** Public verification: minimal, masked data only. */
export async function verifyCode(code: string) {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clean)) return null;
  const rep = await db.resultReport.findUnique({
    where: { code: clean },
    select: { code: true, issuedAt: true, supersededAt: true, score: true, totalMarks: true, attemptId: true,
      attempt: { select: { user: { select: { name: true } }, exam: { select: { title: true, passMarks: true, resultsStatus: true } } } } },
  });
  if (!rep || rep.attempt.exam.resultsStatus !== "PUBLISHED") return null;
  const mask = (name: string) => name.split(/\s+/).map((w) => w[0] + "*".repeat(Math.max(1, w.length - 1))).join(" ");
  const score = Number(rep.score), total = Number(rep.totalMarks);
  return {
    code: rep.code, valid: !rep.supersededAt, supersededAt: rep.supersededAt?.toISOString() ?? null,
    candidate: mask(rep.attempt.user.name), exam: rep.attempt.exam.title, score, total,
    percent: total ? r2((score / total) * 100) : 0, passed: score >= Number(rep.attempt.exam.passMarks), issuedAt: rep.issuedAt.toISOString(),
  };
}

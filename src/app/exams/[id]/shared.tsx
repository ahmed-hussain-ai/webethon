import "server-only";
import { pageUuid } from "@/lib/params";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { getExam } from "@/lib/exams/service";

/** Load an exam for a page; other examiners' exams look like they don't exist. */
export async function loadExamPage(user: CurrentUser, id: string) {
  return getExam(user, pageUuid(id)).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
}

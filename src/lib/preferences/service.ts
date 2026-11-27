import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

export const prefsSchema = z.object({
  theme: z.enum(["LIGHT", "DARK"]),
  fontSize: z.enum(["SMALL", "MEDIUM", "LARGE", "XLARGE"]),
  layout: z.enum(["SINGLE", "SPLIT"]),
  navPosition: z.enum(["LEFT", "RIGHT", "BOTTOM"]),
  highContrast: z.boolean(),
});
export type Prefs = z.output<typeof prefsSchema>;
const DEFAULTS: Prefs = { theme: "LIGHT", fontSize: "MEDIUM", layout: "SINGLE", navPosition: "LEFT", highContrast: false };

export async function getPrefs(userId: string): Promise<Prefs> {
  const p = await db.workspacePreferences.findUnique({ where: { userId } });
  return p ? { theme: p.theme, fontSize: p.fontSize, layout: p.layout, navPosition: p.navPosition, highContrast: p.highContrast } : DEFAULTS;
}

export async function savePrefs(userId: string, prefs: Prefs) {
  await db.workspacePreferences.upsert({ where: { userId }, update: prefs, create: { userId, ...prefs } });
  return prefs;
}

import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { getPrefs, prefsSchema, savePrefs } from "@/lib/preferences/service";

// GET/PUT /api/me/preferences → exam workspace preferences of the logged-in user (4.7)
export const GET = handler(async () => {
  const user = await requireUser();
  return ok({ preferences: await getPrefs(user.id) });
});
export const PUT = handler(async (req) => {
  const user = await requireUser();
  return ok({ preferences: await savePrefs(user.id, await parseBody(req, prefsSchema)) });
});

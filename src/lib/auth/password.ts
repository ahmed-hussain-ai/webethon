import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used when the email doesn't exist, so a failed login takes the same time either way
// (prevents discovering which emails are registered by timing).
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-real-password", COST);
export const burnPasswordCheck = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);

// Temporary password: 12 chars from a cryptographically secure RNG, no look-alike characters
// (0/O, 1/l/I). Each account gets its own; 12 chars over ~55 symbols ≈ 69 bits, so two users
// getting the same one is practically impossible. Always contains a letter and a digit
// so it also satisfies the normal password policy.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LOWER + UPPER + DIGITS;

export function generateTempPassword(length = 12): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

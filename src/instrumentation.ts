// Runs once when the server starts: refuse to boot with a missing/placeholder AUTH_SECRET.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const s = process.env.AUTH_SECRET ?? "";
    const weak = ["change-me", "changeme", "example", "secret", "password"].some((h) => s.toLowerCase().includes(h));
    if (s.length < 32 || weak) {
      throw new Error("AUTH_SECRET is missing or insecure. Generate one with: openssl rand -base64 48");
    }
  }
}

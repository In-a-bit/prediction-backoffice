import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const baseUrl = process.env.BACKOFFICE_API_URL ?? "http://localhost:8092";
const COOKIE = "predictionsession";

export async function POST() {
  const store = await cookies();
  const session = store.get(COOKIE)?.value;

  // Best-effort: let Go record the logout in the audit log.
  if (session) {
    try {
      await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        headers: { Cookie: `${COOKIE}=${session}` },
        cache: "no-store",
      });
    } catch {
      // Ignore — clearing the local cookie below is what matters.
    }
  }

  store.delete(COOKIE);
  return NextResponse.json({ status: "logged out" });
}

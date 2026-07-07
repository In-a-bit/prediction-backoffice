import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Login proxy. Validates credentials against the Go backoffice, then re-issues
// the predictionsession cookie as a first-party cookie on the Next origin
// (SameSite=Lax, Secure in prod) carrying the opaque value Go signed. lib/api.ts
// forwards that value back to Go on every subsequent call.

const baseUrl = process.env.BACKOFFICE_API_URL ?? "http://localhost:8092";
const COOKIE = "predictionsession";
const MAX_AGE = 60 * 60 * 24 * 6; // 6 days — matches the Go SessionStore.

export async function POST(request: Request) {
  const body = await request.text();

  const goRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const text = await goRes.text();
  if (!goRes.ok) {
    return new NextResponse(text, {
      status: goRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const value = parseSetCookieValue(goRes.headers.get("set-cookie"), COOKIE);
  if (value) {
    (await cookies()).set(COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
  }

  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// parseSetCookieValue pulls a single cookie's value out of a Set-Cookie header.
function parseSetCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

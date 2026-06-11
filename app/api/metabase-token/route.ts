import "server-only";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

/**
 * GET /api/metabase-token
 *
 * Signs a short-lived (10 min) JWT for the embedded Metabase dashboard.
 * The secret never leaves the server — only the signed token is returned
 * to the client.
 */
export async function GET() {
  const secret = process.env.METABASE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "METABASE_SECRET_KEY is not configured" },
      { status: 500 },
    );
  }

  const payload = {
    resource: { dashboard: 2 },
    params: {},
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10-minute expiry
  };

  const token = jwt.sign(payload, secret);
  return NextResponse.json({ token });
}

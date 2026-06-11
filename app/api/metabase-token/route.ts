import "server-only";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

/**
 * GET /api/metabase-token?dashboard=<id>
 *
 * Signs a short-lived (10 min) JWT for the given Metabase dashboard id.
 * The secret never leaves the server — only the signed token is returned.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.METABASE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "METABASE_SECRET_KEY is not configured" },
      { status: 500 },
    );
  }

  const dashboardParam = req.nextUrl.searchParams.get("dashboard");
  const dashboardId = dashboardParam ? Number(dashboardParam) : 2;
  if (!Number.isFinite(dashboardId) || dashboardId <= 0) {
    return NextResponse.json({ error: "Invalid dashboard id" }, { status: 400 });
  }

  const payload = {
    resource: { dashboard: dashboardId },
    params: {},
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10-minute expiry
  };

  const token = jwt.sign(payload, secret);
  return NextResponse.json({ token });
}

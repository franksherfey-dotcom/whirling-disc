import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache — must reflect the live build

// Vercel injects VERCEL_DEPLOYMENT_ID (and a git SHA) at build/runtime. Locally
// these are undefined, so we fall back to a dev constant.
const VERSION =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "dev";

export async function GET() {
  return NextResponse.json(
    { version: VERSION },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

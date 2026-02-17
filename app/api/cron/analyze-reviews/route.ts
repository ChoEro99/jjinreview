import { NextResponse } from "next/server";
import { runIncrementalAnalysisBatch } from "@/src/lib/store-service";

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const headerToken = req.headers.get("x-cron-secret");
  if (headerToken && headerToken === expected) return true;

  const auth = req.headers.get("authorization");
  if (!auth) return false;

  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  return match[1] === expected;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const queryLimit = Number(url.searchParams.get("limit"));
    const queryForce = url.searchParams.get("force");

    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      force?: boolean;
    };

    const result = await runIncrementalAnalysisBatch({
      limit: Number.isFinite(queryLimit) ? queryLimit : body.limit,
      force:
        typeof body.force === "boolean"
          ? body.force
          : queryForce === "true"
            ? true
            : queryForce === "false"
              ? false
              : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}

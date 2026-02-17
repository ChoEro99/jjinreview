import { NextResponse } from "next/server";
import { importGoogleReviewsForRegisteredStores } from "@/src/lib/store-service";

function isAuthorized(req: Request) {
  if (process.env.NODE_ENV !== "production") return true;

  const expected = process.env.CRON_SECRET;
  if (!expected) return true;

  const header = req.headers.get("x-admin-secret");
  if (header && header === expected) return true;

  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return Boolean(m && m[1] === expected);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      offset?: number;
    };

    const result = await importGoogleReviewsForRegisteredStores({
      limit:
        typeof body.limit === "number" && Number.isFinite(body.limit)
          ? Math.max(1, Math.min(100, Math.round(body.limit)))
          : undefined,
      offset:
        typeof body.offset === "number" && Number.isFinite(body.offset)
          ? Math.max(0, Math.round(body.offset))
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

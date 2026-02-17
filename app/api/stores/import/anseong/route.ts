import { NextResponse } from "next/server";
import { importAnseongRestaurantsFromKakao } from "@/src/lib/store-service";

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
      maxCenters?: number;
    };

    const result = await importAnseongRestaurantsFromKakao({
      maxCenters:
        typeof body.maxCenters === "number" && Number.isFinite(body.maxCenters)
          ? Math.max(1, Math.min(200, Math.round(body.maxCenters)))
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

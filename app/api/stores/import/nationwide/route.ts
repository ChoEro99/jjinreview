import { NextResponse } from "next/server";
import { importNationwideStoresFromKakao } from "@/src/lib/store-service";

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
      startIndex?: number;
      categoryCodes?: Array<"FD6" | "CE7" | "CS2" | "MT1">;
      maxPagePerCenter?: number;
      radius?: number;
    };

    const result = await importNationwideStoresFromKakao({
      maxCenters:
        typeof body.maxCenters === "number" && Number.isFinite(body.maxCenters)
          ? Math.max(1, Math.min(80, Math.round(body.maxCenters)))
          : undefined,
      startIndex:
        typeof body.startIndex === "number" && Number.isFinite(body.startIndex)
          ? Math.max(0, Math.round(body.startIndex))
          : undefined,
      categoryCodes: Array.isArray(body.categoryCodes) ? body.categoryCodes : undefined,
      maxPagePerCenter:
        typeof body.maxPagePerCenter === "number" && Number.isFinite(body.maxPagePerCenter)
          ? Math.max(1, Math.min(45, Math.round(body.maxPagePerCenter)))
          : undefined,
      radius:
        typeof body.radius === "number" && Number.isFinite(body.radius)
          ? Math.max(1000, Math.min(20000, Math.round(body.radius)))
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

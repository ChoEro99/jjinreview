import { NextResponse } from "next/server";
import { backfillStoreGeoFromGoogle } from "@/src/lib/store-service";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      offset?: number;
      onlyMissing?: boolean;
    };

    const result = await backfillStoreGeoFromGoogle({
      limit:
        typeof body.limit === "number" && Number.isFinite(body.limit)
          ? body.limit
          : undefined,
      offset:
        typeof body.offset === "number" && Number.isFinite(body.offset)
          ? body.offset
          : undefined,
      onlyMissing: typeof body.onlyMissing === "boolean" ? body.onlyMissing : true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

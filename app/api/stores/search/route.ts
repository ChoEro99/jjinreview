import { NextResponse } from "next/server";
import { searchAndAutoRegisterStoreByKeyword } from "@/src/lib/store-service";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      limit?: number;
      offset?: number;
      userLatitude?: number;
      userLongitude?: number;
    };

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });
    }

    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(30, Math.floor(body.limit)))
        : 5;
    const offset =
      typeof body.offset === "number" && Number.isFinite(body.offset)
        ? Math.max(0, Math.floor(body.offset))
        : 0;

    const userLocation =
      typeof body.userLatitude === "number" &&
      Number.isFinite(body.userLatitude) &&
      typeof body.userLongitude === "number" &&
      Number.isFinite(body.userLongitude)
        ? { latitude: body.userLatitude, longitude: body.userLongitude }
        : null;

    const result = await searchAndAutoRegisterStoreByKeyword(query, limit, userLocation, offset);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

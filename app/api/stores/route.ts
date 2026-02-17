import { NextResponse } from "next/server";
import { createStore, getStoresWithSummary } from "@/src/lib/store-service";

export async function GET() {
  try {
    const stores = await getStoresWithSummary();
    return NextResponse.json({ ok: true, stores });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      kakaoPlaceId?: string | null;
    };

    const name = typeof body.name === "string" ? body.name : "";
    const address = typeof body.address === "string" ? body.address : null;
    const latitude =
      typeof body.latitude === "number" && Number.isFinite(body.latitude)
        ? body.latitude
        : null;
    const longitude =
      typeof body.longitude === "number" && Number.isFinite(body.longitude)
        ? body.longitude
        : null;
    const kakaoPlaceId =
      typeof body.kakaoPlaceId === "string" ? body.kakaoPlaceId : null;

    if (!name.trim()) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 }
      );
    }

    const result = await createStore({
      name,
      address,
      latitude,
      longitude,
      kakaoPlaceId,
    });

    return NextResponse.json({
      ok: true,
      store: result.store,
      created: result.created,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

const cache = new Map<string, { latitude: number; longitude: number }>();

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const address = (url.searchParams.get("address") || "").trim();

    if (!address) {
      return NextResponse.json(
        { ok: false, error: "address query is required" },
        { status: 400 }
      );
    }

    const cached = cache.get(address);
    if (cached) {
      return NextResponse.json({ ok: true, ...cached, cached: true });
    }

    const target = new URL("https://nominatim.openstreetmap.org/search");
    target.searchParams.set("q", address);
    target.searchParams.set("format", "jsonv2");
    target.searchParams.set("limit", "1");

    const response = await fetch(target, {
      headers: {
        "User-Agent": "jjinreview-local-dev/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "geocoding request failed" },
        { status: 502 }
      );
    }

    const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
    const top = rows?.[0];

    if (!top) {
      return NextResponse.json(
        { ok: false, error: "address not found" },
        { status: 404 }
      );
    }

    const latitude = Number(top.lat);
    const longitude = Number(top.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { ok: false, error: "invalid geocode result" },
        { status: 500 }
      );
    }

    const result = { latitude, longitude };
    cache.set(address, result);

    return NextResponse.json({ ok: true, ...result, cached: false });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

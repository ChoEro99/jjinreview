import { NextResponse } from "next/server";
import { getNearbyRecommendedStoresByLocation } from "@/src/lib/store-service";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      latitude?: number;
      longitude?: number;
      limit?: number;
      keyword?: string;
    };

    const latitude = typeof body.latitude === "number" ? body.latitude : NaN;
    const longitude = typeof body.longitude === "number" ? body.longitude : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { ok: false, error: "latitude/longitude is required" },
        { status: 400 }
      );
    }

    const recommendations = await getNearbyRecommendedStoresByLocation(
      { latitude, longitude },
      {
        limit: typeof body.limit === "number" ? body.limit : 10,
        keyword: typeof body.keyword === "string" ? body.keyword : undefined,
      }
    );

    return NextResponse.json({
      ok: true,
      recommendations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}

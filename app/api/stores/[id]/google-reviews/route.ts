import { NextResponse } from "next/server";
import { getGoogleReviewsWithAiForStore } from "@/src/lib/store-service";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const storeId = Number(params.id);
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const maxReviewsRaw = Number(url.searchParams.get("maxReviews"));
    const maxAgeHoursRaw = Number(url.searchParams.get("maxAgeHours"));
    const forceRaw = url.searchParams.get("force");
    const result = await getGoogleReviewsWithAiForStore(storeId, {
      maxReviews: Number.isFinite(maxReviewsRaw) ? maxReviewsRaw : undefined,
      maxAgeHours: Number.isFinite(maxAgeHoursRaw) ? maxAgeHoursRaw : undefined,
      forceRefresh: forceRaw === "true",
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

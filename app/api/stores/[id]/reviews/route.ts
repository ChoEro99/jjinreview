import { NextResponse } from "next/server";
import { createInappReview } from "@/src/lib/store-service";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const storeId = Number(params.id);

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const rating = Number(body?.rating);
    const content = typeof body?.content === "string" ? body.content : "";
    const authorName =
      typeof body?.authorName === "string" ? body.authorName : null;
    const isDisclosedAd = Boolean(body?.isDisclosedAd);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    if (!content.trim()) {
      return NextResponse.json(
        { ok: false, error: "content is required" },
        { status: 400 }
      );
    }

    const created = await createInappReview({
      storeId,
      rating,
      content,
      authorName,
      isDisclosedAd,
    });

    return NextResponse.json({
      ok: true,
      review: created.savedReview,
      summary: created.summary,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

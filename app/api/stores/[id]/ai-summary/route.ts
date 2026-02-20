import { NextResponse } from "next/server";
import { getStoreAiSummary } from "@/src/lib/store-service";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("force") === "1";
    const params = await context.params;
    const storeId = Number(params.id);
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const summary = await getStoreAiSummary(storeId, { forceRefresh });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

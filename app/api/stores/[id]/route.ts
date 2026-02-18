import { NextResponse } from "next/server";
import { getStoreDetail } from "@/src/lib/store-service";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(req.url);
    const forceGoogle = url.searchParams.get("google") !== "0";
    const params = await context.params;
    const storeId = Number(params.id);
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const detail = await getStoreDetail(storeId, { forceGoogle });

    return NextResponse.json({
      ok: true,
      ...detail,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

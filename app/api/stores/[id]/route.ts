import { NextResponse } from "next/server";
import { getStoreDetail } from "@/src/lib/store-service";
import { normalizeAppLanguage } from "@/src/lib/language";

type StoreDetailResponse = Awaited<ReturnType<typeof getStoreDetail>>;

const DETAIL_CACHE_TTL_MS = 60 * 1000;
const detailCache = new Map<string, { expiresAt: number; payload: StoreDetailResponse }>();

function cleanupDetailCache(now: number) {
  if (detailCache.size < 500) return;
  for (const [key, entry] of detailCache.entries()) {
    if (entry.expiresAt <= now) detailCache.delete(key);
  }
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(req.url);
    const forceGoogle = url.searchParams.get("google") === "1";
    const language = normalizeAppLanguage(url.searchParams.get("lang"));
    const params = await context.params;
    const storeId = Number(params.id);
    if (!storeId) {
      return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
    }

    const cacheKey = `${storeId}:${forceGoogle ? "g1" : "g0"}:${language}`;
    const now = Date.now();
    cleanupDetailCache(now);
    const hit = detailCache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return NextResponse.json({ ok: true, ...hit.payload });
    }

    const detail = await getStoreDetail(storeId, { forceGoogle, language });
    detailCache.set(cacheKey, {
      expiresAt: now + DETAIL_CACHE_TTL_MS,
      payload: detail,
    });

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

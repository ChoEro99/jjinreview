import { NextResponse } from "next/server";
import { dedupeStoresByNormalizedNameAddress } from "@/src/lib/store-service";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      maxGroups?: number;
    };

    const result = await dedupeStoresByNormalizedNameAddress({
      dryRun: Boolean(body.dryRun),
      maxGroups:
        typeof body.maxGroups === "number" && Number.isFinite(body.maxGroups)
          ? body.maxGroups
          : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

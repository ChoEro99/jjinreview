import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { supabaseServer } from "@/src/lib/supabaseServer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? (session.user as { id?: string }).id : null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("user_reviews")
      .select("id, store_id, rating, food, price, service, space, wait_time, comment, created_at, stores(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error in GET /api/user-reviews/my:", error);
      return NextResponse.json({ ok: false, error: "내 리뷰 조회 중 오류가 발생했습니다." }, { status: 500 });
    }

    const reviews = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const stores = row.stores as { name?: unknown } | Array<{ name?: unknown }> | null | undefined;
      const storeName =
        Array.isArray(stores)
          ? (typeof stores[0]?.name === "string" ? stores[0].name : null)
          : (stores && typeof stores.name === "string" ? stores.name : null);

      return {
        id: row.id,
        storeId: row.store_id,
        storeName,
        rating: row.rating,
        food: row.food,
        price: row.price,
        service: row.service,
        space: row.space,
        waitTime: row.wait_time,
        comment: row.comment,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ ok: true, reviews });
  } catch (error) {
    console.error("Error in GET /api/user-reviews/my:", error);
    return NextResponse.json({ ok: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

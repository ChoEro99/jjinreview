import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { authOptions } from "../auth/[...nextauth]/route";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? (session.user as { id?: string }).id : null;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const storeIdRaw = searchParams.get("storeId");
    const storeId = storeIdRaw ? Number(storeIdRaw) : NaN;

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ ok: false, error: "유효한 storeId가 필요합니다." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("user_reviews")
      .select("id, store_id, rating, food, price, service, space, wait_time, comment, created_at")
      .eq("store_id", storeId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error in GET /api/user-reviews:", error);
      return NextResponse.json({ ok: false, error: "리뷰 조회 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      review: data
        ? {
            id: data.id,
            storeId: data.store_id,
            rating: data.rating,
            food: data.food,
            price: data.price,
            service: data.service,
            space: data.space,
            waitTime: data.wait_time,
            comment: data.comment,
            createdAt: data.created_at,
          }
        : null,
    });
  } catch (error) {
    console.error("Error in GET /api/user-reviews:", error);
    return NextResponse.json({ ok: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { id?: string; email?: string | null; name?: string | null; image?: string | null } | undefined;
    const userId = sessionUser?.id ?? null;

    // Require login
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "리뷰를 작성하려면 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { storeId, rating, food, price, service, space, waitTime, comment } = body;

    // Validate required field
    if (!storeId || rating === undefined || rating === null) {
      return NextResponse.json(
        { ok: false, error: "storeId와 rating은 필수입니다." },
        { status: 400 }
      );
    }

    // Validate rating range
    if (rating < 0.5 || rating > 5.0 || (rating * 10) % 5 !== 0) {
      return NextResponse.json(
        { ok: false, error: "rating은 0.5~5.0 사이의 0.5 단위여야 합니다." },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    // Ensure users row exists before inserting into user_reviews(user_id FK -> users.id).
    const { error: upsertUserError } = await supabase.from("users").upsert(
      {
        id: userId,
        email: sessionUser?.email ?? null,
        name: sessionUser?.name ?? null,
        image: sessionUser?.image ?? null,
        provider: "google",
      },
      { onConflict: "id" }
    );

    if (upsertUserError) {
      console.error("User upsert error:", upsertUserError);
      return NextResponse.json(
        { ok: false, error: "사용자 정보 동기화 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    // Check for existing review within 7 days (user_id only)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: existingReview } = await supabase
      .from("user_reviews")
      .select("id")
      .eq("store_id", storeId)
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .maybeSingle();

    if (existingReview) {
      return NextResponse.json(
        { ok: false, error: "7일 이내 이미 리뷰를 작성했습니다." },
        { status: 429 }
      );
    }

    // Insert new review
    const { data: newReview, error: insertError } = await supabase
      .from("user_reviews")
      .insert({
        store_id: storeId,
        user_id: userId,
        ip_hash: null, // No longer using IP hash
        rating,
        food: food || null,
        price: price || null,
        service: service || null,
        space: space || null,
        wait_time: waitTime || null,
        comment: comment || null,
      })
      .select("id, store_id, rating")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        { ok: false, error: "리뷰 저장 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      review: {
        id: newReview.id,
        storeId: newReview.store_id,
        rating: newReview.rating,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/user-reviews:", error);
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

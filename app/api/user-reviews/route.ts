import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { authOptions } from "../auth/[...nextauth]/route";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? (session.user as { id?: string }).id : null;

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

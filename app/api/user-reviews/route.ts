import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { supabaseServer } from "@/src/lib/supabaseServer";

function getIpHash(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0].trim() || realIp || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    const userId = session?.user ? (session.user as { id?: string }).id : null;

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

    const ipHash = getIpHash(req);
    const supabase = supabaseServer();

    // Check for existing review within 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (userId) {
      // If logged in, check by user_id OR ip_hash
      const { data: reviewDetails } = await supabase
        .from("user_reviews")
        .select("user_id, ip_hash")
        .eq("store_id", storeId)
        .gte("created_at", sevenDaysAgo.toISOString());
      
      const hasRecentReview = reviewDetails?.some(
        (r) => r.user_id === userId || r.ip_hash === ipHash
      );

      if (hasRecentReview) {
        return NextResponse.json(
          { ok: false, error: "7일 이내 이미 리뷰를 작성했습니다." },
          { status: 429 }
        );
      }
    } else {
      // If not logged in, check by ip_hash only
      const { data: existingReview } = await supabase
        .from("user_reviews")
        .select("id")
        .eq("store_id", storeId)
        .eq("ip_hash", ipHash)
        .gte("created_at", sevenDaysAgo.toISOString())
        .maybeSingle();

      if (existingReview) {
        return NextResponse.json(
          { ok: false, error: "7일 이내 이미 리뷰를 작성했습니다." },
          { status: 429 }
        );
      }
    }

    // Insert new review
    const { data: newReview, error: insertError } = await supabase
      .from("user_reviews")
      .insert({
        store_id: storeId,
        user_id: userId,
        ip_hash: ipHash,
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

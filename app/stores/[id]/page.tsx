import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getStoresWithSummary } from "@/src/lib/store-service";
import HomeInteractive from "@/app/home-interactive";

const getCachedStoresWithSummary = unstable_cache(
  async () => getStoresWithSummary(),
  ["home-stores-summary-v1"],
  { revalidate: 60 }
);

type RouteProps = {
  params: Promise<{ id: string }>;
};

function toStoreId(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const resolved = await params;
  const storeId = toStoreId(resolved.id);
  if (!storeId) {
    return { robots: { index: false, follow: false } };
  }

  const stores = await getCachedStoresWithSummary();
  const target = stores.find((store) => store.id === storeId);
  if (!target) {
    return { robots: { index: false, follow: false } };
  }

  return {
    title: `${target.name} | 리뷰랩`,
    description: `${target.name} 평점과 리뷰 분석 정보를 확인하세요.`,
    robots: { index: false, follow: false },
  };
}

export default async function StorePage({ params }: RouteProps) {
  const resolved = await params;
  const storeId = toStoreId(resolved.id);
  if (!storeId) notFound();

  const stores = await getCachedStoresWithSummary();
  const initialStores = stores.map((store) => ({
    id: store.id,
    name: store.name,
    address: store.address,
    cuisineType: store.cuisineType ?? null,
    signatureDish: store.signatureDish ?? null,
    latitude: store.latitude,
    longitude: store.longitude,
    externalRating: store.externalRating ?? null,
    externalReviewCount: store.externalReviewCount ?? null,
    summary: {
      weightedRating: store.summary.weightedRating,
      appAverageRating: store.summary.appAverageRating,
      adSuspectRatio: store.summary.adSuspectRatio,
      trustScore: store.summary.trustScore,
      positiveRatio: store.summary.positiveRatio,
      reviewCount: store.summary.reviewCount,
      inappReviewCount: store.summary.inappReviewCount,
      externalReviewCount: store.summary.externalReviewCount,
      lastAnalyzedAt: store.summary.lastAnalyzedAt,
      latestExternalReviewAt: store.summary.latestExternalReviewAt ?? null,
    },
  }));

  return (
    <HomeInteractive
      stores={initialStores}
      initialStoreId={storeId}
      initialForceGoogle
    />
  );
}


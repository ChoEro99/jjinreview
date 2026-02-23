import { getStoresWithSummary } from "@/src/lib/store-service";
import HomeInteractive from "@/app/home-interactive";
import { unstable_cache } from "next/cache";

const getCachedStoresWithSummary = unstable_cache(
  async () => getStoresWithSummary(),
  ["home-stores-summary-v1"],
  { revalidate: 60 }
);

export default async function Home() {
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

  return <HomeInteractive stores={initialStores} />;
}

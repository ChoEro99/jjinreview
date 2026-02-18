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
  return <HomeInteractive stores={stores} />;
}

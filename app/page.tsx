import { getStoresWithSummary } from "@/src/lib/store-service";
import HomeInteractive from "@/app/home-interactive";

export default async function Home() {
  const stores = await getStoresWithSummary();
  return <HomeInteractive stores={stores} />;
}

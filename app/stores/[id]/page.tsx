import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StoreRedirectPage({ params }: Props) {
  const resolved = await params;
  const storeId = Number(resolved.id);
  if (Number.isFinite(storeId) && storeId > 0) {
    redirect(`/?storeId=${storeId}`);
  }
  redirect("/");
}

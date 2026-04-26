import { StorefrontView } from "@/components/storefront-view";

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontView slug={slug} />;
}

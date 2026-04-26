import { ListingDetail } from "@/components/listing-detail";

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ListingDetail slug={slug} />;
}

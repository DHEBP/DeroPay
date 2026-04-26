import { PayPage } from "./pay-page";

type Ctx = { params: Promise<{ link: string }> };

export default async function Page({ params }: Ctx) {
  const { link } = await params;
  return <PayPage linkId={link} />;
}

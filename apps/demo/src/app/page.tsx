import { DemoShowcaseRail } from "@/components/demo-showcase";
import { ProductList } from "@/components/product-list";
import { StoreHero } from "@/components/store-hero";
import { StoreShell } from "@/components/store-shell";
import { TrustBand } from "@/components/trust-band";

export default function Home() {
  return (
    <StoreShell>
      <StoreHero />
      <TrustBand />
      <DemoShowcaseRail />
      <ProductList />
    </StoreShell>
  );
}

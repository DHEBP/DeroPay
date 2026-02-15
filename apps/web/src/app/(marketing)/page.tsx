import { Hero } from "@/components/landing/hero";
import { ProductsGrid } from "@/components/landing/products-grid";
import { CodeShowcase } from "@/components/landing/code-showcase";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { CTASection } from "@/components/landing/cta-section";

export default function Home() {
  return (
    <>
      <Hero />
      <ProductsGrid />
      <CodeShowcase />
      <HowItWorks />
      <FeaturesGrid />
      <CTASection />
    </>
  );
}

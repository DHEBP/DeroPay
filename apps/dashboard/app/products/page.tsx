import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Products | DeroPay Dashboard",
};

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Product catalog and pricing"
      />
      <ExtensibleModule
        name="Products Module"
        description="Manage your product catalog and pricing tiers"
        details="Create products with DERO pricing, manage variants, set up recurring billing, and generate payment links. Integrates with invoice templates for quick checkout."
        extensionPoints={[
          "GET /api/pay/products — list products",
          "POST /api/pay/products — create product",
          "POST /api/pay/payment-links — generate checkout link",
          "Webhook: product.created, subscription.billed",
        ]}
      />
    </>
  );
}

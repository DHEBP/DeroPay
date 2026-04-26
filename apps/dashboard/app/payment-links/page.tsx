import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Payment Links | DeroPay Dashboard",
};

export default function PaymentLinksPage() {
  return (
    <>
      <PageHeader
        title="Payment Links"
        subtitle="Shareable checkout links"
      />
      <ExtensibleModule
        name="Payment Links Module"
        description="Generate shareable links for one-time or recurring payments"
        details="Create payment links with pre-filled amounts, product references, and metadata. Share via URL, QR code, or embed. Tracks conversion and supports expiry dates."
        extensionPoints={[
          "POST /api/pay/payment-links — create link",
          "GET /api/pay/payment-links — list active links",
          "GET /api/pay/payment-links/:id — link details + stats",
          "POST /api/pay/payment-links/:id/checkout — initiate payment",
        ]}
      />
    </>
  );
}

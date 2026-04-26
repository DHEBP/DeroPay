import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Partners | DeroPay Dashboard",
};

export default function PartnersPage() {
  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="Affiliate and referral program management"
      />
      <ExtensibleModule
        name="Partners Module"
        description="Track referrals and manage affiliate commissions"
        details="Build an affiliate program with referral links, commission tracking, and payout management. Supports tiered commissions, payout thresholds, and partner dashboards."
        extensionPoints={[
          "POST /api/pay/partners — register new partner",
          "GET /api/pay/partners/:id/referrals — referral history",
          "POST /api/pay/partners/track — record referral attribution",
          "Webhook: partner.referral, partner.commission",
        ]}
      />
    </>
  );
}

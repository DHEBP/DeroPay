import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Payouts | DeroPay Dashboard",
};

export default function PayoutsPage() {
  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Automated fund distribution"
      />
      <ExtensibleModule
        name="Payouts Module"
        description="Schedule and execute DERO payouts to external wallets"
        details="Configure automatic payouts to vendor wallets, partner commissions, or treasury addresses. Supports thresholds, schedules, and manual triggers. Requires wallet RPC access for sends."
        extensionPoints={[
          "POST /api/pay/payouts — create payout",
          "GET /api/pay/payouts — list pending/completed payouts",
          "POST /api/pay/payouts/:id/execute — trigger send",
          "Webhook: payout.scheduled, payout.completed, payout.failed",
        ]}
      />
    </>
  );
}

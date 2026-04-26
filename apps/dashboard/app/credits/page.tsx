import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Credits | DeroPay Dashboard",
};

export default function CreditsPage() {
  return (
    <>
      <PageHeader
        title="Credits"
        subtitle="Customer credit balances and loyalty rewards"
      />
      <ExtensibleModule
        name="Credits Module"
        description="Issue, track, and redeem customer credits"
        details="Build a credit ledger for loyalty programs, refund alternatives, or promotional balances. The UI scaffolding is ready — wire up your own credit issuance and redemption logic."
        extensionPoints={[
          "POST /api/pay/credits — issue credits to a customer",
          "GET /api/pay/credits/:customerId — fetch balance",
          "POST /api/pay/credits/redeem — apply credits to invoice",
          "Webhook: credits.issued, credits.redeemed",
        ]}
      />
    </>
  );
}

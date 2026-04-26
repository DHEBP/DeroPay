import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Automation | DeroPay Dashboard",
};

export default function AutomationPage() {
  return (
    <>
      <PageHeader
        title="Automation"
        subtitle="Rules and triggers for payment workflows"
      />
      <ExtensibleModule
        name="Automation Module"
        description="Create rules that trigger actions on payment events"
        details="Build if-this-then-that workflows: auto-confirm escrows after X days, notify on large payments, tag invoices by metadata, sweep funds on thresholds, and more."
        extensionPoints={[
          "GET /api/pay/automation-rules — list rules",
          "POST /api/pay/automation-rules — create rule",
          "Conditions: payment.confirmed, escrow.funded, amount > X",
          "Actions: webhook, tag, sweep, notify, update metadata",
        ]}
      />
    </>
  );
}

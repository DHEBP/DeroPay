import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Notifications | DeroPay Dashboard",
};

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Alert preferences and delivery"
      />
      <ExtensibleModule
        name="Notifications Module"
        description="Configure payment alerts and delivery channels"
        details="Set up notifications for payment events — email, webhooks, push, or custom integrations. Configure thresholds, digest schedules, and escalation rules."
        extensionPoints={[
          "GET /api/pay/notifications/preferences — get settings",
          "PUT /api/pay/notifications/preferences — update settings",
          "GET /api/pay/notifications/history — delivery log",
          "POST /api/pay/notifications/test — send test notification",
        ]}
      />
    </>
  );
}

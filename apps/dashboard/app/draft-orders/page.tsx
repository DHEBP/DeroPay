import { DashboardShell } from "@/components/dashboard-shell";
import { DraftOrdersPage } from "./draft-orders-page";

export default function Page() {
  return (
    <DashboardShell>
      <DraftOrdersPage />
    </DashboardShell>
  );
}

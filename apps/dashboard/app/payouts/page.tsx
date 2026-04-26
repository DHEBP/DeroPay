import { DashboardShell } from "@/components/dashboard-shell";
import { PayoutsPage } from "./payouts-page";

export default function Page() {
  return (
    <DashboardShell>
      <PayoutsPage />
    </DashboardShell>
  );
}

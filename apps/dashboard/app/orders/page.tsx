import { DashboardShell } from "@/components/dashboard-shell";
import { OrdersPage } from "./orders-page";

export default function Page() {
  return (
    <DashboardShell>
      <OrdersPage />
    </DashboardShell>
  );
}

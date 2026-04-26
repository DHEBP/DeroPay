import { DashboardShell } from "@/components/dashboard-shell";
import { InventoryPage } from "./inventory-page";

export default function Page() {
  return (
    <DashboardShell>
      <InventoryPage />
    </DashboardShell>
  );
}

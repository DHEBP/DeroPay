import { DashboardShell } from "@/components/dashboard-shell";
import { PriceListsPage } from "./price-lists-page";

export default function Page() {
  return (
    <DashboardShell>
      <PriceListsPage />
    </DashboardShell>
  );
}

import { DashboardShell } from "@/components/dashboard-shell";
import { CustomersPage } from "./customers-page";

export default function Page() {
  return (
    <DashboardShell>
      <CustomersPage />
    </DashboardShell>
  );
}

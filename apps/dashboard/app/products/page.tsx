import { DashboardShell } from "@/components/dashboard-shell";
import { ProductsPage } from "./products-page";

export default function Page() {
  return (
    <DashboardShell>
      <ProductsPage />
    </DashboardShell>
  );
}

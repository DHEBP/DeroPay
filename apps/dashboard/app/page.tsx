import { Suspense } from "react";
import { DashboardHome } from "./dashboard-home";

export default function Page() {
  // Suspense wraps DashboardHome because it reads ?range= via useSearchParams.
  // Next 15 requires a boundary around any client component that does so, or
  // the whole page bails out to client rendering.
  return (
    <Suspense fallback={null}>
      <DashboardHome />
    </Suspense>
  );
}

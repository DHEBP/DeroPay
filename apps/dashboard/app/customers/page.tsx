import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Customers | DeroPay Dashboard",
};

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Customer profiles and payment history"
      />
      <ExtensibleModule
        name="Customers Module"
        description="Track customer identities across payments"
        details="Associate DERO addresses with customer profiles, track lifetime value, segment by behavior, and enable personalized experiences. Privacy-first by default — opt-in identification only."
        extensionPoints={[
          "GET /api/pay/customers — list customers",
          "GET /api/pay/customers/:id — customer detail + history",
          "POST /api/pay/customers — create/link customer",
          "GET /api/pay/customer-groups — segmentation",
        ]}
      />
    </>
  );
}

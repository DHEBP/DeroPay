import { ExtensibleModule } from "@/components/extensible-module";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Gift Cards | DeroPay Dashboard",
};

export default function GiftCardsPage() {
  return (
    <>
      <PageHeader
        title="Gift Cards"
        subtitle="Issue and redeem digital gift cards"
      />
      <ExtensibleModule
        name="Gift Cards Module"
        description="Create, sell, and redeem DERO-denominated gift cards"
        details="Issue gift cards with custom denominations, track redemption status, handle partial redemptions, and integrate with your checkout flow."
        extensionPoints={[
          "POST /api/pay/gift-cards — issue new gift card",
          "GET /api/pay/gift-cards/:code/balance — check balance",
          "POST /api/pay/gift-cards/:code/redeem — redeem against invoice",
          "Webhook: gift_card.issued, gift_card.redeemed",
        ]}
      />
    </>
  );
}

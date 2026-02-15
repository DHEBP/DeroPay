import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: "64px" }}>{children}</main>
      <Footer />
    </>
  );
}

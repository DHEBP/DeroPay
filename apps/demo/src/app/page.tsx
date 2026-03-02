import { Header } from "@/components/header";
import { ProductList } from "@/components/product-list";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-12">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Welcome to the{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-600">
              Future of Commerce
            </span>
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Experience seamless, private, and instant payments powered by DeroPay. 
            Add items to your cart and try the checkout flow.
          </p>
        </div>
        <ProductList />
      </main>
      <footer className="py-8 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500">
        <p>© 2026 DeroPay Demo Store. Built for the DERO ecosystem.</p>
      </footer>
    </div>
  );
}

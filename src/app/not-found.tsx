import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold text-text-primary">404</h1>
      <p className="mt-4 text-lg text-text-secondary">Page not found</p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-accent-teal px-6 py-3 text-sm font-semibold text-background transition-all hover:bg-accent-teal/90"
      >
        Go Home
      </Link>
    </div>
  );
}

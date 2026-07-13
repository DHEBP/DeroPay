import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center text-center"
      style={{ background: "var(--color-background)" }}
    >
      <h1
        className="text-8xl font-bold tracking-tight"
        style={{ color: "var(--color-text-primary)" }}
      >
        404
      </h1>
      <p
        className="mt-4 text-lg"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Page not found
      </p>
      <Link href="/" className="btn btn-accent mt-8">
        Go home
      </Link>
    </div>
  );
}

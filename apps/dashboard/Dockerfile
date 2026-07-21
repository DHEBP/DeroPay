FROM oven/bun:1 AS builder

WORKDIR /app

# better-sqlite3 (the live-mode store driver) has no Bun prebuilt, so it
# compiles a native module via node-gyp, which needs python3 and a C++
# toolchain — not present in the bun image. (Demo mode never loads it, but it
# must resolve for the build to succeed.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
# bun resolves the whole workspace, so every member manifest listed in the
# root package.json must be present before install — even though only the
# dashboard and dero-pay are built below. Keep this in sync when apps change.
COPY apps/checkout/package.json apps/checkout/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/demo/package.json apps/demo/
COPY apps/facilitator/package.json apps/facilitator/
COPY apps/gateway/package.json apps/gateway/
COPY apps/web/package.json apps/web/
COPY apps/x402-example/package.json apps/x402-example/
COPY packages/dero-pay/package.json packages/dero-pay/
COPY packages/deropay-widget/package.json packages/deropay-widget/
COPY plugins/medusa-payment-deropay/package.json plugins/medusa-payment-deropay/

# Retry: better-sqlite3's native postinstall and large tarball fetches (next)
# occasionally fail transiently on CI runners ("Fail extracting tarball"),
# especially on arm64. Retry with a cache clear so a one-off hiccup can't sink
# the image build; fail hard if all three attempts miss.
RUN for i in 1 2 3; do \
      bun install --frozen-lockfile && exit 0; \
      echo "bun install failed (attempt $i), clearing cache and retrying"; \
      bun pm cache rm || true; \
      sleep 10; \
    done; \
    exit 1

COPY packages/dero-pay/ packages/dero-pay/
COPY apps/dashboard/ apps/dashboard/

# dero-pay is a workspace dep of the dashboard; build its dist before the
# dashboard's file trace runs, or the standalone output resolves an empty pkg.
RUN cd packages/dero-pay && bun run build
RUN cd apps/dashboard && NEXT_PUBLIC_DEMO_MODE=true bun run build

# --- Production ---
# Next `output: 'standalone'` traces the minimal server + node_modules closure
# into .next/standalone (mirroring the monorepo layout under
# apps/dashboard/). static/ and public/ are not traced and must be copied in.
FROM oven/bun:1-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_DEMO_MODE=true

COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3100

CMD ["bun", "apps/dashboard/server.js"]

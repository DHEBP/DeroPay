FROM oven/bun:1 AS builder

WORKDIR /app

# better-sqlite3 (the sqlite store driver) has no Bun prebuilt, so it compiles
# a native module via node-gyp, which needs python3 and a C++ toolchain — not
# present in the bun image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
# bun resolves the whole workspace, so every member manifest listed in the
# root package.json must be present before install — even though only the
# gateway and dero-pay are built below. Keep this in sync when apps are added.
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

RUN bun install

COPY packages/dero-pay/ packages/dero-pay/
COPY apps/gateway/ apps/gateway/

RUN cd packages/dero-pay && bun run build
RUN cd apps/gateway && bun run build

# --- Production deps ---
# The gateway's dist externalizes its dependencies, so the runtime needs only
# the gateway's closure: hono + @hono/node-server, dero-pay's runtime deps
# (bech32, zod), and better-sqlite3 (the sqlite store — a dero-pay peer).
# Installing just these — instead of copying the whole hoisted monorepo
# node_modules — is the difference between a ~1.4GB and a ~150MB image.
# Versions are pinned to the workspace lockfile (bun.lock); keep them in sync.
FROM oven/bun:1 AS proddeps

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN printf '%s' '{"name":"deropay-gateway-runtime","private":true,"dependencies":{"hono":"4.12.3","@hono/node-server":"1.19.9","better-sqlite3":"12.6.2","bech32":"2.0.0","zod":"3.25.76"}}' > package.json \
 && bun install --production

# --- Production ---
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/package.json ./
COPY --from=proddeps /app/node_modules ./node_modules
# Local workspace package: place the built dero-pay into node_modules by hand
# (it is not on npm, so the proddeps install above cannot resolve it).
COPY --from=builder /app/packages/dero-pay/dist ./node_modules/dero-pay/dist
COPY --from=builder /app/packages/dero-pay/package.json ./node_modules/dero-pay/

RUN mkdir -p /app/data

EXPOSE 3080

ENV PORT=3080
ENV DEROPAY_STORE=sqlite
ENV DEROPAY_SQLITE_PATH=/app/data/deropay.db

CMD ["bun", "run", "dist/index.js"]

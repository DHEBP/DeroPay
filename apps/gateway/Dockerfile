FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
COPY packages/dero-pay/package.json packages/dero-pay/
COPY apps/gateway/package.json apps/gateway/

RUN bun install --frozen-lockfile

COPY packages/dero-pay/ packages/dero-pay/
COPY apps/gateway/ apps/gateway/

RUN cd packages/dero-pay && bun run build
RUN cd apps/gateway && bun run build

# --- Production ---
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/dero-pay/dist ./node_modules/dero-pay/dist
COPY --from=builder /app/packages/dero-pay/package.json ./node_modules/dero-pay/

RUN mkdir -p /app/data

EXPOSE 3080

ENV PORT=3080
ENV DEROPAY_STORE=sqlite
ENV DEROPAY_SQLITE_PATH=/app/data/deropay.db

CMD ["bun", "run", "dist/index.js"]

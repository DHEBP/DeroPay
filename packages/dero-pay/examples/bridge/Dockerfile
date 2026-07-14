# DeroPay Bridge — outbound-only payment webhook daemon.
#
# Build:  docker build -t deropay-bridge -f examples/bridge/Dockerfile .
# Run:    docker run -d --name deropay-bridge \
#           -v /srv/deropay:/data \
#           -e DEROPAY_BRIDGE_STORE_PATH=/data/bridge.db \
#           -e DEROPAY_BRIDGE_HEARTBEAT_PATH=/data/bridge.heartbeat \
#           -e DEROPAY_BRIDGE_WALLET_RPC_URL=http://host.docker.internal:10103/json_rpc \
#           -e DEROPAY_BRIDGE_DAEMON_RPC_URL=http://host.docker.internal:10102/json_rpc \
#           -e DEROPAY_BRIDGE_WEBHOOK_URL=https://yourstore.example/webhooks/dero \
#           -e DEROPAY_BRIDGE_WEBHOOK_SECRET=your-long-random-secret \
#           deropay-bridge
#
# NOTE: no EXPOSE / -p. The bridge binds no inbound port by design. The
# HEALTHCHECK shells out to the `status` subcommand, which reads the heartbeat
# file off disk and exits 0 (healthy) / 1 (stale or dead-lettered).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev better-sqlite3 dero-pay

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
ENV DEROPAY_BRIDGE_HEARTBEAT_PATH=/data/bridge.heartbeat
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node node_modules/dero-pay/dist/bridge/cli.js status || exit 1

ENTRYPOINT ["node", "node_modules/dero-pay/dist/bridge/cli.js", "run"]

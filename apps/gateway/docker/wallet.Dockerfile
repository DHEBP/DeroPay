# DERO wallet RPC — built from the official DERO release binaries.
# On first run the entrypoint auto-creates a merchant wallet, writes the
# recovery seed to a mounted backup file, then serves the wallet RPC.
# python:*-slim gives us a CA bundle, a stdlib downloader, and the pty
# module the entrypoint uses to drive the interactive wallet CLI.
FROM python:3.12-slim

ARG DERO_RELEASE=Release142
ARG TARGETARCH=amd64

WORKDIR /dero

RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) asset=dero_linux_amd64.tar.gz; bin=dero-wallet-cli-linux-amd64 ;; \
      arm64) asset=dero_linux_arm64.tar.gz; bin=dero-wallet-cli-linux-arm64 ;; \
      *) echo "unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/deroproject/derohe/releases/download/${DERO_RELEASE}/${asset}"; \
    python3 -c "import sys,urllib.request; urllib.request.urlretrieve(sys.argv[1], 'dero.tgz')" "$url"; \
    tar -xzf dero.tgz --strip-components=1; \
    rm dero.tgz; \
    mv "$bin" dero-wallet-cli; \
    chmod +x dero-wallet-cli; \
    find . -maxdepth 1 -name '*-linux-*' -delete; \
    rm -f Start.md

COPY docker/wallet-init.py /dero/wallet-init.py

# 10103 = wallet JSON-RPC. Bound to the internal Docker network only by
# default (see docker-compose.yml) — do NOT expose this to the internet.
EXPOSE 10103

ENTRYPOINT ["python3", "wallet-init.py"]

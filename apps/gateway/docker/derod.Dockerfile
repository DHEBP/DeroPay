# DERO daemon (derod) — built from the official DERO release binaries.
# The upstream project does not publish a Docker image, so we fetch the
# release tarball and run the node ourselves. python:*-slim gives us a
# trusted CA bundle and a stdlib downloader (urllib) with no apt step.
FROM python:3.12-slim

# Pin the release; override with --build-arg DERO_RELEASE=...
ARG DERO_RELEASE=Release142
# TARGETARCH is provided automatically by BuildKit (amd64 / arm64).
ARG TARGETARCH=amd64

WORKDIR /dero

# One tarball ships every DERO binary. Keep derod, rename it to a stable,
# arch-independent path so the entrypoint never has to guess.
RUN set -eux; \
    case "$TARGETARCH" in \
      amd64) asset=dero_linux_amd64.tar.gz; bin=derod-linux-amd64 ;; \
      arm64) asset=dero_linux_arm64.tar.gz; bin=derod-linux-arm64 ;; \
      *) echo "unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/deroproject/derohe/releases/download/${DERO_RELEASE}/${asset}"; \
    python3 -c "import sys,urllib.request; urllib.request.urlretrieve(sys.argv[1], 'dero.tgz')" "$url"; \
    tar -xzf dero.tgz --strip-components=1; \
    rm dero.tgz; \
    mv "$bin" derod; \
    chmod +x derod; \
    find . -maxdepth 1 -name '*-linux-*' -delete; \
    rm -f Start.md

# 10102 = JSON-RPC (internal), 10101 = P2P
EXPOSE 10102 10101

# --fastsync pulls a recent state snapshot instead of replaying all history:
# hours and a few GB, not the multi-week full sync.
ENTRYPOINT ["./derod"]
CMD ["--rpc-bind=0.0.0.0:10102", "--fastsync"]

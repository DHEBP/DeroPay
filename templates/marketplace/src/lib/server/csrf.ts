import { assertProductionRuntime, isProduction } from "./env";

function sameHost(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && left.host === right.host;
}

function localhostCompatible(left: URL, right: URL): boolean {
  const leftLocal = left.hostname === "localhost" || left.hostname === "127.0.0.1";
  const rightLocal = right.hostname === "localhost" || right.hostname === "127.0.0.1";
  return leftLocal && rightLocal && left.port === right.port;
}

export function assertBrowserMutation(request: Request): void {
  assertProductionRuntime();
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    throw new Error("Cross-site mutation is not allowed");
  }
  if (!origin) {
    if (isProduction()) throw new Error("Mutation origin is required");
    return;
  }
  const originUrl = new URL(origin);
  const requestUrl = new URL(request.url);
  if (sameHost(originUrl, requestUrl) || localhostCompatible(originUrl, requestUrl)) {
    return;
  }
  throw new Error("Mutation origin is not allowed");
}

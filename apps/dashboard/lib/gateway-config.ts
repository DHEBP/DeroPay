export function getGatewayUrl(): string {
  return (
    process.env.DEROPAY_GATEWAY_URL?.replace(/\/+$/, "") ??
    "http://127.0.0.1:3080"
  );
}

export function getGatewayApiKey(): string {
  return process.env.DEROPAY_API_KEY ?? "";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isLiveDeroPay(): boolean {
  return process.env.PAYMENT_PROVIDER === "deropay";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function configuredPublicAppUrl(fallback?: string): string | undefined {
  return process.env.PUBLIC_APP_URL || fallback;
}

export function assertLivePaymentEnv(): void {
  if (!isLiveDeroPay()) return;
  requireEnv("DEROPAY_BASE_URL");
  requireEnv("DEROPAY_API_KEY");
  requireEnv("DEROPAY_WEBHOOK_SECRET");
}

export function assertProductionRuntime(): void {
  if (!isProduction()) return;
  if (process.env.ENABLE_DEV_TOOLS === "true") {
    throw new Error("ENABLE_DEV_TOOLS must be disabled in production");
  }
  if (!isLiveDeroPay()) {
    throw new Error("PAYMENT_PROVIDER=deropay is required in production");
  }
  requireEnv("PUBLIC_APP_URL");
  requireEnv("MARKETPLACE_AUTH_SECRET");
  requireEnv("DEROPAY_WEBHOOK_SECRET");
  assertLivePaymentEnv();
}

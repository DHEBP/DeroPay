export type BrandProfileInput = {
  name?: string;
  webhookUrl?: string | null;
  webhookSigningSecretId?: string | null;
  feeSchedule?: Record<string, unknown>;
  priceFeedSource?: "coingecko" | "chainlink" | "custom" | null;
  priceFeedUrl?: string | null;
  defaultExpirySeconds?: number;
  logoUrl?: string | null;
  primaryColor?: string | null;
  metadata?: Record<string, unknown>;
};

export type BrandProfile = {
  id: string;
  name: string;
  isDefault: boolean;
  webhookUrl?: string | null;
  webhookSigningSecretId?: string | null;
  feeSchedule?: Record<string, unknown>;
  priceFeedSource?: "coingecko" | "chainlink" | "custom" | null;
  priceFeedUrl?: string | null;
  defaultExpirySeconds?: number | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
};

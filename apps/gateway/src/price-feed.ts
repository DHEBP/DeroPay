/**
 * DERO price feed — fetches current DERO/fiat exchange rates.
 *
 * Supports CoinGecko (primary) and TradeOgre (fallback).
 * Caches prices for a configurable TTL to avoid rate limits.
 */

export type PriceSource = "coingecko" | "tradeogre";

export type PriceCache = {
  usd: number;
  btc: number;
  fetchedAt: number;
};

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=dero&vs_currencies=usd,btc";
const TRADEOGRE_BTC_URL = "https://tradeogre.com/api/v1/ticker/DERO-BTC";
const TRADEOGRE_USDT_URL = "https://tradeogre.com/api/v1/ticker/DERO-USDT";

const DEFAULT_CACHE_TTL_MS = 60_000; // 1 minute

let cache: PriceCache | null = null;
let cacheTtlMs = DEFAULT_CACHE_TTL_MS;

export function configurePriceFeed(options: { cacheTtlMs?: number }) {
  if (options.cacheTtlMs !== undefined) {
    cacheTtlMs = options.cacheTtlMs;
  }
}

/**
 * Get the current DERO price in USD.
 * Returns cached value if fresh enough, otherwise fetches from APIs.
 */
export async function getDeroPrice(): Promise<PriceCache> {
  if (cache && Date.now() - cache.fetchedAt < cacheTtlMs) {
    return cache;
  }

  // Try CoinGecko first, fall back to TradeOgre
  try {
    cache = await fetchFromCoinGecko();
    return cache;
  } catch {
    // CoinGecko failed, try TradeOgre
  }

  try {
    cache = await fetchFromTradeOgre();
    return cache;
  } catch (err) {
    if (cache) return cache; // Return stale cache if both fail
    throw new Error(
      `Failed to fetch DERO price from all sources: ${err instanceof Error ? err.message : err}`
    );
  }
}

/**
 * Convert a fiat amount to DERO atomic units.
 *
 * @param fiatAmount - Amount in fiat (e.g., 25.99)
 * @param currency - Fiat currency code (currently only "usd" supported)
 * @returns Amount in DERO atomic units as a string
 */
export async function fiatToDeroAtomic(
  fiatAmount: number,
  currency: string = "usd"
): Promise<{ atomicUnits: string; deroAmount: string; rate: number }> {
  if (currency.toLowerCase() !== "usd") {
    throw new Error(`Currency "${currency}" not yet supported. Use "usd".`);
  }

  const price = await getDeroPrice();

  if (price.usd <= 0) {
    throw new Error("DERO price is zero or negative — cannot convert");
  }

  const deroAmount = fiatAmount / price.usd;

  // DERO uses 5 decimal places: 1 DERO = 100,000 atomic units
  const ATOMIC_UNITS_PER_DERO = 100_000;
  const atomicUnits = Math.round(deroAmount * ATOMIC_UNITS_PER_DERO);

  return {
    atomicUnits: atomicUnits.toString(),
    deroAmount: deroAmount.toFixed(5),
    rate: price.usd,
  };
}

async function fetchFromCoinGecko(): Promise<PriceCache> {
  const resp = await fetch(COINGECKO_URL, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`CoinGecko HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as { dero?: { usd?: number; btc?: number } };

  if (!data.dero?.usd) {
    throw new Error("CoinGecko returned no DERO price data");
  }

  return {
    usd: data.dero.usd,
    btc: data.dero.btc ?? 0,
    fetchedAt: Date.now(),
  };
}

async function fetchFromTradeOgre(): Promise<PriceCache> {
  // Try USDT pair first for direct USD price
  let usd = 0;
  let btc = 0;

  try {
    const usdtResp = await fetch(TRADEOGRE_USDT_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (usdtResp.ok) {
      const usdtData = (await usdtResp.json()) as { price?: string };
      if (usdtData.price) {
        usd = parseFloat(usdtData.price);
      }
    }
  } catch {
    // USDT pair may not exist, fall through to BTC
  }

  // Always fetch BTC pair
  const btcResp = await fetch(TRADEOGRE_BTC_URL, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!btcResp.ok) {
    throw new Error(`TradeOgre HTTP ${btcResp.status}`);
  }

  const btcData = (await btcResp.json()) as { price?: string };
  if (btcData.price) {
    btc = parseFloat(btcData.price);
  }

  if (usd === 0 && btc === 0) {
    throw new Error("TradeOgre returned no price data");
  }

  return { usd, btc, fetchedAt: Date.now() };
}

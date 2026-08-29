import type { P2PAd, PlatformHealth, PlatformId, ScanResult } from "../types";
import { PLATFORM_LABELS } from "../types";
import { bitgetProvider } from "./bitget.server";
import { bybitProvider } from "./bybit.server";
import { safeMessage } from "./http.server";
import { localCoinSwapProvider } from "./localcoinswap.server";
import { noonesProvider } from "./noones.server";
import { okxProvider } from "./okx.server";
import type { P2PProvider } from "./provider.server";

export const providers: P2PProvider[] = [
  bybitProvider,
  bitgetProvider,
  okxProvider,
  noonesProvider,
  localCoinSwapProvider,
];

interface CacheEntry {
  ads: P2PAd[];
  lastAttemptAt: number;
  lastSuccessAt: number | null;
  latencyMs: number | null;
  lastError: string | null;
}

/** Per-worker cache used for rate-limit throttling and stale fallbacks. */
const cache = new Map<string, CacheEntry>();

function key(platform: PlatformId, asset: string, fiat: string) {
  return `${platform}:${asset}:${fiat}`;
}

async function runProvider(
  provider: P2PProvider,
  asset: string,
  fiat: string,
): Promise<{ ads: P2PAd[]; health: PlatformHealth }> {
  const cacheKey = key(provider.id, asset, fiat);
  const entry: CacheEntry =
    cache.get(cacheKey) ??
    { ads: [], lastAttemptAt: 0, lastSuccessAt: null, latencyMs: null, lastError: null };

  const baseHealth: PlatformHealth = {
    platform: provider.id,
    label: PLATFORM_LABELS[provider.id],
    status: "connected",
    lastSuccessAt: entry.lastSuccessAt,
    latencyMs: entry.latencyMs,
    adCount: entry.ads.length,
    feeKnown: provider.fees.known,
    buyFeePct: provider.fees.buyPct,
    sellFeePct: provider.fees.sellPct,
  };

  if (!provider.isConfigured()) {
    return {
      ads: [],
      health: {
        ...baseHealth,
        status: "not_configured",
        message: `${PLATFORM_LABELS[provider.id]} needs API credentials to be added as secrets`,
        adCount: 0,
      },
    };
  }

  const now = Date.now();
  // Rate-limit handling: reuse the cached snapshot inside the minimum interval.
  if (now - entry.lastAttemptAt < provider.minIntervalMs && entry.ads.length > 0) {
    return { ads: entry.ads, health: { ...baseHealth, status: "connected" } };
  }

  const startedAt = Date.now();
  try {
    const ads = await provider.fetchAds(asset, fiat);
    const latencyMs = Date.now() - startedAt;
    const next: CacheEntry = {
      ads,
      lastAttemptAt: Date.now(),
      lastSuccessAt: Date.now(),
      latencyMs,
      lastError: null,
    };
    cache.set(cacheKey, next);
    return {
      ads,
      health: {
        ...baseHealth,
        status: ads.length > 0 ? "connected" : "degraded",
        lastSuccessAt: next.lastSuccessAt,
        latencyMs,
        adCount: ads.length,
        message: ads.length === 0 ? "Connected but returned no NGN adverts" : undefined,
      },
    };
  } catch (error) {
    const message = safeMessage(error);
    console.error(`[p2p] ${provider.id} fetch failed: ${message}`);
    cache.set(cacheKey, { ...entry, lastAttemptAt: Date.now(), lastError: message });
    return {
      // Never reuse a stale snapshot as if it were live data.
      ads: [],
      health: {
        ...baseHealth,
        status: "unavailable",
        adCount: 0,
        message: `${PLATFORM_LABELS[provider.id]} temporarily unavailable (${message})`,
      },
    };
  }
}

/** Fans out to every connector independently; one failure never blocks the rest. */
export async function scanMarket(asset: string, fiat: string): Promise<ScanResult> {
  const results = await Promise.all(providers.map((p) => runProvider(p, asset, fiat)));
  return {
    scannedAt: Date.now(),
    asset,
    fiat,
    ads: results.flatMap((r) => r.ads),
    health: results.map((r) => r.health),
  };
}

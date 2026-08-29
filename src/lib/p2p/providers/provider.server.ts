import type { P2PAd, PlatformId } from "../types";

/** Every connector implements this contract and returns normalized ads only. */
export interface P2PProvider {
  id: PlatformId;
  label: string;
  baseUrl: string;
  /** Whether the connector needs credentials from environment secrets. */
  requiresAuth: boolean;
  /** Minimum interval between upstream calls (rate-limit handling). */
  minIntervalMs: number;
  /** Officially documented taker fees; keep unknown rather than inventing one. */
  fees: { known: boolean; buyPct?: number; sellPct?: number };
  /** Reads secrets from process.env inside the call, never at module scope. */
  isConfigured: () => boolean;
  fetchAds: (asset: string, fiat: string) => Promise<P2PAd[]>;
}

export interface RawLevel {
  adId: string;
  price: number;
  availableQuantity: number;
  minOrder: number;
  maxOrder: number;
  paymentMethods: string[];
  merchantName: string;
  completionRate?: number;
  orderCount?: number;
}

export function sanityFilter(ads: P2PAd[]): P2PAd[] {
  return ads.filter(
    (ad) =>
      Number.isFinite(ad.price) &&
      ad.price > 0 &&
      Number.isFinite(ad.availableQuantity) &&
      ad.availableQuantity > 0 &&
      ad.minOrder >= 0 &&
      ad.maxOrder > 0 &&
      ad.maxOrder >= ad.minOrder,
  );
}

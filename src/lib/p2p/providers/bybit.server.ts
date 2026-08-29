import { normalizePaymentMethods } from "../payment-methods";
import type { P2PAd } from "../types";
import { requestJson, toNumber } from "./http.server";
import { sanityFilter, type P2PProvider } from "./provider.server";

const BASE_URL = "https://api2.bybit.com";

// Bybit's public P2P listing uses the ADVERTISER side:
//   side "1" -> advertiser is selling crypto  => USER_BUY
//   side "0" -> advertiser is buying crypto   => USER_SELL
const ADVERTISER_SIDE: Record<"USER_BUY" | "USER_SELL", string> = {
  USER_BUY: "1",
  USER_SELL: "0",
};

interface BybitItem {
  id?: string;
  price?: string;
  lastQuantity?: string;
  quantity?: string;
  minAmount?: string;
  maxAmount?: string;
  payments?: string[];
  nickName?: string;
  recentExecuteRate?: number;
  recentOrderNum?: number;
}

async function fetchSide(
  asset: string,
  fiat: string,
  side: "USER_BUY" | "USER_SELL",
): Promise<P2PAd[]> {
  const payload = await requestJson<{ result?: { items?: BybitItem[] } }>(
    `${BASE_URL}/fiat/otc/item/online`,
    {
      method: "POST",
      body: {
        tokenId: asset,
        currencyId: fiat,
        payment: [],
        side: ADVERTISER_SIDE[side],
        size: "20",
        page: "1",
        amount: "",
        authMaturity: "",
        itemRegion: 1,
      },
    },
  );

  const items = Array.isArray(payload?.result?.items) ? payload.result!.items! : [];
  const now = Date.now();
  return items.map((item, index) => ({
    platform: "bybit" as const,
    asset,
    fiat,
    side,
    price: toNumber(item.price),
    availableQuantity: toNumber(item.lastQuantity ?? item.quantity),
    minOrder: toNumber(item.minAmount),
    maxOrder: toNumber(item.maxAmount),
    paymentMethods: normalizePaymentMethods(item.payments),
    merchantName: String(item.nickName ?? "Bybit merchant"),
    completionRate:
      item.recentExecuteRate === undefined ? undefined : toNumber(item.recentExecuteRate),
    orderCount: item.recentOrderNum === undefined ? undefined : toNumber(item.recentOrderNum),
    timestamp: now,
    adId: String(item.id ?? `bybit-${side}-${index}`),
  }));
}

export const bybitProvider: P2PProvider = {
  id: "bybit",
  label: "Bybit P2P",
  baseUrl: BASE_URL,
  requiresAuth: false,
  minIntervalMs: 4000,
  fees: { known: false },
  isConfigured: () => true,
  fetchAds: async (asset, fiat) => {
    const [buy, sell] = await Promise.all([
      fetchSide(asset, fiat, "USER_BUY"),
      fetchSide(asset, fiat, "USER_SELL"),
    ]);
    return sanityFilter([...buy, ...sell]);
  },
};

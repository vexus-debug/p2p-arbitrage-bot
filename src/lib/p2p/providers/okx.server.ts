import { normalizePaymentMethods } from "../payment-methods";
import type { P2PAd } from "../types";
import { requestJson, toNumber } from "./http.server";
import { sanityFilter, type P2PProvider } from "./provider.server";

const BASE_URL = "https://www.okx.com";

// OKX's C2C order book is keyed by the ADVERTISER side:
//   side=sell -> advertisers selling crypto => USER_BUY
//   side=buy  -> advertisers buying crypto  => USER_SELL
const ADVERTISER_SIDE: Record<"USER_BUY" | "USER_SELL", "sell" | "buy"> = {
  USER_BUY: "sell",
  USER_SELL: "buy",
};

interface OkxAd {
  id?: string;
  price?: string | number;
  availableAmount?: string | number;
  quoteMinAmountPerOrder?: string | number;
  quoteMaxAmountPerOrder?: string | number;
  paymentMethods?: string[];
  nickName?: string;
  completedRate?: string | number;
  completedOrderQuantity?: string | number;
}

async function fetchSide(
  asset: string,
  fiat: string,
  side: "USER_BUY" | "USER_SELL",
): Promise<P2PAd[]> {
  const advertiserSide = ADVERTISER_SIDE[side];
  const query = new URLSearchParams({
    quoteCurrency: fiat.toLowerCase(),
    baseCurrency: asset.toLowerCase(),
    side: advertiserSide,
    paymentMethod: "all",
    userType: "all",
    showTrade: "false",
    showFollow: "false",
    showAlreadyTraded: "false",
    isAbleFilter: "false",
    hideOverseasIndicators: "false",
  });

  const payload = await requestJson<{ data?: { buy?: OkxAd[]; sell?: OkxAd[] } }>(
    `${BASE_URL}/v3/c2c/tradingOrders/books?${query.toString()}`,
  );

  const list = payload?.data?.[advertiserSide] ?? [];
  const now = Date.now();
  return (Array.isArray(list) ? list : []).map((ad, index) => {
    const completion = ad.completedRate === undefined ? undefined : toNumber(ad.completedRate);
    return {
      platform: "okx" as const,
      asset,
      fiat,
      side,
      price: toNumber(ad.price),
      availableQuantity: toNumber(ad.availableAmount),
      minOrder: toNumber(ad.quoteMinAmountPerOrder),
      maxOrder: toNumber(ad.quoteMaxAmountPerOrder),
      paymentMethods: normalizePaymentMethods(ad.paymentMethods),
      merchantName: String(ad.nickName ?? "OKX merchant"),
      completionRate:
        completion === undefined ? undefined : completion <= 1 ? completion * 100 : completion,
      orderCount:
        ad.completedOrderQuantity === undefined ? undefined : toNumber(ad.completedOrderQuantity),
      timestamp: now,
      adId: String(ad.id ?? `okx-${side}-${index}`),
    };
  });
}

export const okxProvider: P2PProvider = {
  id: "okx",
  label: "OKX P2P",
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

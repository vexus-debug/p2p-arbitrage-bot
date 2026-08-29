import { normalizePaymentMethods } from "../payment-methods";
import type { P2PAd } from "../types";
import { requestJson, toNumber } from "./http.server";
import { sanityFilter, type P2PProvider } from "./provider.server";

const BASE_URL = "https://www.bitget.com";

// Bitget's public advert list uses the ADVERTISER side:
//   "sell" -> advertiser sells crypto => USER_BUY
//   "buy"  -> advertiser buys crypto  => USER_SELL
const ADVERTISER_SIDE: Record<"USER_BUY" | "USER_SELL", string> = {
  USER_BUY: "sell",
  USER_SELL: "buy",
};

interface BitgetAdv {
  advNo?: string;
  price?: string | number;
  amount?: string | number;
  surplusAmount?: string | number;
  minAmount?: string | number;
  maxAmount?: string | number;
  paymentMethodList?: Array<{ paymentMethodName?: string; name?: string }>;
  paymentMethods?: string[];
  nickName?: string;
  userName?: string;
  finishRate?: string | number;
  turnoverNumTotal?: string | number;
  orderFinishNumTotal?: string | number;
}

function extractPayments(adv: BitgetAdv): string[] {
  if (Array.isArray(adv.paymentMethods)) return normalizePaymentMethods(adv.paymentMethods);
  const names = (adv.paymentMethodList ?? [])
    .map((p) => p?.paymentMethodName ?? p?.name)
    .filter((n): n is string => typeof n === "string");
  return normalizePaymentMethods(names);
}

async function fetchSide(
  asset: string,
  fiat: string,
  side: "USER_BUY" | "USER_SELL",
): Promise<P2PAd[]> {
  const payload = await requestJson<{ data?: { dataList?: BitgetAdv[] } | BitgetAdv[] }>(
    `${BASE_URL}/v1/p2p/pub/adv/queryAdvList`,
    {
      method: "POST",
      body: {
        side: ADVERTISER_SIDE[side],
        pageNo: 1,
        pageSize: 20,
        coinCode: asset,
        fiatCode: fiat,
        languageType: 0,
      },
    },
  );

  const raw = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray((payload?.data as { dataList?: BitgetAdv[] })?.dataList)
      ? (payload!.data as { dataList: BitgetAdv[] }).dataList
      : [];

  const now = Date.now();
  return raw.map((adv, index) => {
    const completion = adv.finishRate === undefined ? undefined : toNumber(adv.finishRate);
    const orders =
      adv.orderFinishNumTotal ?? adv.turnoverNumTotal ?? undefined;
    return {
      platform: "bitget" as const,
      asset,
      fiat,
      side,
      price: toNumber(adv.price),
      availableQuantity: toNumber(adv.surplusAmount ?? adv.amount),
      minOrder: toNumber(adv.minAmount),
      maxOrder: toNumber(adv.maxAmount),
      paymentMethods: extractPayments(adv),
      merchantName: String(adv.nickName ?? adv.userName ?? "Bitget merchant"),
      // finishRate arrives as a 0..1 ratio on this endpoint.
      completionRate:
        completion === undefined ? undefined : completion <= 1 ? completion * 100 : completion,
      orderCount: orders === undefined ? undefined : toNumber(orders),
      timestamp: now,
      adId: String(adv.advNo ?? `bitget-${side}-${index}`),
    };
  });
}

export const bitgetProvider: P2PProvider = {
  id: "bitget",
  label: "Bitget P2P",
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

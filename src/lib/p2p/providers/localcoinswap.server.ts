import { normalizePaymentMethods } from "../payment-methods";
import type { P2PAd } from "../types";
import { requestJson, toNumber } from "./http.server";
import { sanityFilter, type P2PProvider } from "./provider.server";

const BASE_URL = "https://api.localcoinswap.com";

// LocalCoinSwap public offers API uses the OFFER OWNER's perspective:
//   trading_type "sell" -> owner sells crypto => USER_BUY
//   trading_type "buy"  -> owner buys crypto  => USER_SELL
const OWNER_TYPE: Record<"USER_BUY" | "USER_SELL", "sell" | "buy"> = {
  USER_BUY: "sell",
  USER_SELL: "buy",
};

interface LcsOffer {
  uuid?: string;
  price_formula_value?: number | string;
  pricing?: { price?: number | string };
  min_trade_size?: number | string;
  max_trade_size?: number | string;
  trading_type?: { slug?: string };
  payment_method?: { name?: string };
  payment_method_name?: string;
  created_by?: { username?: string; completed_trades?: number; completion_rate?: number };
  coin_currency?: string;
  fiat_currency?: string;
}

async function fetchSide(
  asset: string,
  fiat: string,
  side: "USER_BUY" | "USER_SELL",
): Promise<P2PAd[]> {
  const apiKey = process.env["LOCALCOINSWAP_API_KEY"];
  const query = new URLSearchParams({
    coin_currency: asset,
    fiat_currency: fiat,
    trading_type: OWNER_TYPE[side],
    page_size: "30",
  });

  const payload = await requestJson<{ results?: LcsOffer[] }>(
    `${BASE_URL}/api/v2/offers/?${query.toString()}`,
    {
      headers: apiKey ? { authorization: `Token ${apiKey}` } : {},
    },
  );

  const offers = Array.isArray(payload?.results) ? payload.results! : [];
  const now = Date.now();
  return offers.map((offer, index) => {
    const price = toNumber(offer.pricing?.price ?? offer.price_formula_value);
    const min = toNumber(offer.min_trade_size);
    const max = toNumber(offer.max_trade_size);
    const methods = [offer.payment_method?.name, offer.payment_method_name].filter(
      (m): m is string => typeof m === "string",
    );
    return {
      platform: "localcoinswap" as const,
      asset,
      fiat,
      side,
      price,
      // LCS does not publish remaining inventory; derive it from the max trade size.
      availableQuantity: price > 0 ? max / price : 0,
      minOrder: min,
      maxOrder: max,
      paymentMethods: normalizePaymentMethods(methods),
      merchantName: String(offer.created_by?.username ?? "LCS trader"),
      completionRate:
        offer.created_by?.completion_rate === undefined
          ? undefined
          : toNumber(offer.created_by.completion_rate),
      orderCount:
        offer.created_by?.completed_trades === undefined
          ? undefined
          : toNumber(offer.created_by.completed_trades),
      timestamp: now,
      adId: String(offer.uuid ?? `lcs-${side}-${index}`),
    };
  });
}

export const localCoinSwapProvider: P2PProvider = {
  id: "localcoinswap",
  label: "LocalCoinSwap",
  baseUrl: BASE_URL,
  requiresAuth: false,
  minIntervalMs: 8000,
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

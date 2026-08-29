import { normalizePaymentMethods } from "../payment-methods";
import type { P2PAd } from "../types";
import { requestJson, toNumber } from "./http.server";
import { sanityFilter, type P2PProvider } from "./provider.server";

const BASE_URL = "https://api.noones.com";
const AUTH_URL = "https://auth.noones.com/oauth2/token";

// NoOnes' official API is OAuth2 client-credentials based. Offer types follow
// the OFFER OWNER's perspective:
//   offer_type "sell" -> owner sells crypto => USER_BUY
//   offer_type "buy"  -> owner buys crypto  => USER_SELL
const OWNER_TYPE: Record<"USER_BUY" | "USER_SELL", "sell" | "buy"> = {
  USER_BUY: "sell",
  USER_SELL: "buy",
};

interface NoOnesOffer {
  offer_hash?: string;
  fiat_price_per_btc?: number | string;
  fiat_price_per_crypto?: number | string;
  offer_type?: string;
  fiat_amount_range_min?: number | string;
  fiat_amount_range_max?: number | string;
  crypto_amount_available?: number | string;
  payment_method_name?: string;
  payment_method_group?: string;
  profile?: { username?: string; feedback_positive?: number; trades_total?: number };
  username?: string;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  const payload = await requestJson<{ access_token?: string }>(AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    retries: 1,
  });
  if (!payload?.access_token) throw new Error("NoOnes auth failed");
  return payload.access_token;
}

async function fetchSide(
  token: string,
  asset: string,
  fiat: string,
  side: "USER_BUY" | "USER_SELL",
): Promise<P2PAd[]> {
  const body = new URLSearchParams({
    offer_type: OWNER_TYPE[side],
    crypto_currency_code: asset,
    currency_code: fiat,
    limit: "30",
  }).toString();

  const payload = await requestJson<{ data?: { offers?: NoOnesOffer[] } }>(
    `${BASE_URL}/noones/v1/offer/list`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const offers = payload?.data?.offers ?? [];
  const now = Date.now();
  return offers.map((offer, index) => {
    const price = toNumber(offer.fiat_price_per_crypto ?? offer.fiat_price_per_btc);
    const min = toNumber(offer.fiat_amount_range_min);
    const max = toNumber(offer.fiat_amount_range_max);
    const available = toNumber(offer.crypto_amount_available, price > 0 ? max / price : 0);
    const methods = [offer.payment_method_name, offer.payment_method_group].filter(
      (m): m is string => typeof m === "string",
    );
    return {
      platform: "noones" as const,
      asset,
      fiat,
      side,
      price,
      availableQuantity: available,
      minOrder: min,
      maxOrder: max,
      paymentMethods: normalizePaymentMethods(methods),
      merchantName: String(offer.profile?.username ?? offer.username ?? "NoOnes trader"),
      completionRate:
        offer.profile?.feedback_positive === undefined
          ? undefined
          : toNumber(offer.profile.feedback_positive),
      orderCount:
        offer.profile?.trades_total === undefined ? undefined : toNumber(offer.profile.trades_total),
      timestamp: now,
      adId: String(offer.offer_hash ?? `noones-${side}-${index}`),
    };
  });
}

export const noonesProvider: P2PProvider = {
  id: "noones",
  label: "NoOnes",
  baseUrl: BASE_URL,
  requiresAuth: true,
  minIntervalMs: 6000,
  fees: { known: false },
  isConfigured: () =>
    Boolean(process.env["NOONES_CLIENT_ID"] && process.env["NOONES_CLIENT_SECRET"]),
  fetchAds: async (asset, fiat) => {
    const clientId = process.env["NOONES_CLIENT_ID"];
    const clientSecret = process.env["NOONES_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      throw new Error("NoOnes API credentials are not configured");
    }
    const token = await getAccessToken(clientId, clientSecret);
    const [buy, sell] = await Promise.all([
      fetchSide(token, asset, fiat, "USER_BUY"),
      fetchSide(token, asset, fiat, "USER_SELL"),
    ]);
    return sanityFilter([...buy, ...sell]);
  },
};

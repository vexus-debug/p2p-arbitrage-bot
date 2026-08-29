import { paymentMethodsCompatible, sharedPaymentMethods } from "./payment-methods";
import type { ScannerSettings } from "./settings";
import type { P2PAd, PlatformId, ScanResult } from "./types";
import { PLATFORM_IDS, PLATFORM_LABELS } from "./types";

export type OpportunityStatus = "ACTIVE" | "STALE" | "EXPIRED";

export interface ExecutionLeg {
  adId: string;
  price: number;
  quantity: number;
  merchantName: string;
  paymentMethods: string[];
  completionRate?: number | undefined;
  orderCount?: number | undefined;
}

export interface Opportunity {
  id: string;
  asset: string;
  fiat: string;
  buyPlatform: PlatformId;
  sellPlatform: PlatformId;
  buyPlatformLabel: string;
  sellPlatformLabel: string;
  /** Volume-weighted prices for the executable size (never top-of-book only). */
  buyPrice: number;
  sellPrice: number;
  bestBuyPrice: number;
  bestSellPrice: number;
  grossSpreadNgn: number;
  grossSpreadPct: number;
  executableQuantity: number;
  capitalRequired: number;
  capitalFullyDeployed: boolean;
  grossProfit: number;
  buyFeeNgn: number | null;
  sellFeeNgn: number | null;
  feesUnknown: boolean;
  transactionCostNgn: number;
  slippageCostNgn: number;
  netProfit: number;
  netRoiPct: number;
  buyPaymentMethods: string[];
  sellPaymentMethods: string[];
  sharedPaymentMethods: string[];
  paymentCompatible: boolean;
  buyLegs: ExecutionLeg[];
  sellLegs: ExecutionLeg[];
  buyMerchant: ExecutionLeg | null;
  sellMerchant: ExecutionLeg | null;
  dataTimestamp: number;
  ageMs: number;
  status: OpportunityStatus;
  warnings: string[];
}

export interface BookLevel extends P2PAd {}

export interface PlatformBook {
  platform: PlatformId;
  buy: BookLevel[]; // ascending price — cheapest place to buy first
  sell: BookLevel[]; // descending price — highest place to sell first
}

function eligible(ad: P2PAd, settings: ScannerSettings): boolean {
  if (ad.fiat.toUpperCase() !== settings.fiat.toUpperCase()) return false;
  if (ad.asset.toUpperCase() !== settings.asset.toUpperCase()) return false;
  if (!ad.paymentMethods.length) return false; // payment method must be visible
  if (ad.completionRate !== undefined && ad.completionRate < settings.minCompletionRate) return false;
  if (ad.orderCount !== undefined && ad.orderCount < settings.minOrderCount) return false;
  if (settings.preferredPaymentMethods.length) {
    const match = ad.paymentMethods.some((m) => settings.preferredPaymentMethods.includes(m));
    if (!match) return false;
  }
  const ageSec = (Date.now() - ad.timestamp) / 1000;
  if (ageSec > settings.maxOpportunityAgeSeconds) return false;
  return true;
}

export function buildBooks(ads: P2PAd[], settings: ScannerSettings): PlatformBook[] {
  return PLATFORM_IDS.map((platform) => {
    const rows = ads.filter((ad) => ad.platform === platform && eligible(ad, settings));
    return {
      platform,
      buy: rows.filter((a) => a.side === "USER_BUY").sort((a, b) => a.price - b.price),
      sell: rows.filter((a) => a.side === "USER_SELL").sort((a, b) => b.price - a.price),
    };
  });
}

interface MatchResult {
  buyLegs: ExecutionLeg[];
  sellLegs: ExecutionLeg[];
  quantity: number;
  capital: number;
  proceeds: number;
}

/**
 * Walks both books together, level by level, so the reported spread is the
 * spread that is actually executable for the user's capital.
 */
function matchBooks(
  buyBook: BookLevel[],
  sellBook: BookLevel[],
  settings: ScannerSettings,
): MatchResult {
  const budget = Math.min(settings.capitalNgn, settings.maxTradeSizeNgn);
  let remaining = budget;
  let quantity = 0;
  let capital = 0;
  let proceeds = 0;
  const buyLegs: ExecutionLeg[] = [];
  const sellLegs: ExecutionLeg[] = [];

  const buyRemaining = buyBook.map((ad) =>
    Math.min(ad.availableQuantity, ad.price > 0 ? ad.maxOrder / ad.price : 0),
  );
  const sellRemaining = sellBook.map((ad) =>
    Math.min(ad.availableQuantity, ad.price > 0 ? ad.maxOrder / ad.price : 0),
  );

  let i = 0;
  let j = 0;
  while (i < buyBook.length && j < sellBook.length && remaining > 0) {
    const buyAd = buyBook[i]!;
    const sellAd = sellBook[j]!;
    if (sellAd.price <= buyAd.price) break; // no profitable overlap left

    if (
      settings.requireCompatiblePaymentMethods &&
      !paymentMethodsCompatible(buyAd.paymentMethods, sellAd.paymentMethods)
    ) {
      // Incompatible rails — try the next sell level, then the next buy level.
      j += 1;
      if (j >= sellBook.length) {
        j = 0;
        i += 1;
      }
      if (i >= buyBook.length) break;
      continue;
    }

    const qtyByCapital = remaining / buyAd.price;
    const qty = Math.min(buyRemaining[i] ?? 0, sellRemaining[j] ?? 0, qtyByCapital);
    if (qty <= 0) {
      if ((buyRemaining[i] ?? 0) <= 0) i += 1;
      else if ((sellRemaining[j] ?? 0) <= 0) j += 1;
      else break;
      continue;
    }

    const cost = qty * buyAd.price;
    const revenue = qty * sellAd.price;
    // Respect both advertisers' minimum order sizes.
    if (cost < buyAd.minOrder || revenue < sellAd.minOrder) break;

    quantity += qty;
    capital += cost;
    proceeds += revenue;
    remaining -= cost;
    buyRemaining[i] = (buyRemaining[i] ?? 0) - qty;
    sellRemaining[j] = (sellRemaining[j] ?? 0) - qty;

    buyLegs.push({
      adId: buyAd.adId,
      price: buyAd.price,
      quantity: qty,
      merchantName: buyAd.merchantName,
      paymentMethods: buyAd.paymentMethods,
      completionRate: buyAd.completionRate,
      orderCount: buyAd.orderCount,
    });
    sellLegs.push({
      adId: sellAd.adId,
      price: sellAd.price,
      quantity: qty,
      merchantName: sellAd.merchantName,
      paymentMethods: sellAd.paymentMethods,
      completionRate: sellAd.completionRate,
      orderCount: sellAd.orderCount,
    });

    if ((buyRemaining[i] ?? 0) <= 1e-8) i += 1;
    if ((sellRemaining[j] ?? 0) <= 1e-8) j += 1;
  }

  return { buyLegs, sellLegs, quantity, capital, proceeds };
}

function statusFor(ageMs: number, settings: ScannerSettings): OpportunityStatus {
  const seconds = ageMs / 1000;
  if (seconds > settings.maxOpportunityAgeSeconds) return "EXPIRED";
  if (seconds > settings.agingSeconds) return "STALE";
  return "ACTIVE";
}

export function detectOpportunities(
  scan: ScanResult,
  settings: ScannerSettings,
): Opportunity[] {
  const books = buildBooks(scan.ads, settings);
  const byPlatform = new Map(books.map((b) => [b.platform, b]));
  const opportunities: Opportunity[] = [];

  // Every ordered pair, generated automatically — adding a platform needs no rewrite.
  for (const buyPlatform of PLATFORM_IDS) {
    for (const sellPlatform of PLATFORM_IDS) {
      if (buyPlatform === sellPlatform) continue;
      const buyBook = byPlatform.get(buyPlatform)?.buy ?? [];
      const sellBook = byPlatform.get(sellPlatform)?.sell ?? [];
      if (!buyBook.length || !sellBook.length) continue;

      const match = matchBooks(buyBook, sellBook, settings);
      if (match.quantity <= 0 || match.capital <= 0) continue;

      const buyPrice = match.capital / match.quantity;
      const sellPrice = match.proceeds / match.quantity;
      const grossSpreadNgn = sellPrice - buyPrice;
      const grossSpreadPct = (grossSpreadNgn / buyPrice) * 100;
      if (grossSpreadPct < settings.minGrossSpreadPct) continue;

      const grossProfit = match.proceeds - match.capital;
      const buyFeePct = settings.feeOverridesPct[buyPlatform];
      const sellFeePct = settings.feeOverridesPct[sellPlatform];
      const buyFeeNgn = buyFeePct === undefined ? null : (match.capital * buyFeePct) / 100;
      const sellFeeNgn = sellFeePct === undefined ? null : (match.proceeds * sellFeePct) / 100;
      const slippageCostNgn = (match.proceeds * settings.estimatedSlippagePct) / 100;
      const netProfit =
        grossProfit -
        (buyFeeNgn ?? 0) -
        (sellFeeNgn ?? 0) -
        settings.transactionCostNgn -
        slippageCostNgn;
      const netRoiPct = (netProfit / match.capital) * 100;

      if (netProfit < settings.minNetProfitNgn) continue;
      if (netRoiPct < settings.minNetRoiPct) continue;

      const dataTimestamp = Math.min(
        ...match.buyLegs.map((l) => l.quantity && 0).concat([0]),
        ...[],
        ...[Date.now()],
      );
      const legTimestamps = [
        ...buyBook.filter((a) => match.buyLegs.some((l) => l.adId === a.adId)).map((a) => a.timestamp),
        ...sellBook
          .filter((a) => match.sellLegs.some((l) => l.adId === a.adId))
          .map((a) => a.timestamp),
      ];
      const oldest = legTimestamps.length ? Math.min(...legTimestamps) : dataTimestamp;
      const ageMs = Date.now() - oldest;
      const status = statusFor(ageMs, settings);
      if (status === "EXPIRED") continue;

      const buyMethods = [...new Set(match.buyLegs.flatMap((l) => l.paymentMethods))];
      const sellMethods = [...new Set(match.sellLegs.flatMap((l) => l.paymentMethods))];
      const shared = sharedPaymentMethods(buyMethods, sellMethods);
      const paymentCompatible = shared.length > 0;

      const warnings: string[] = [];
      if (buyFeeNgn === null || sellFeeNgn === null) warnings.push("Fee unknown");
      if (!paymentCompatible) warnings.push("No shared payment rail");
      const budget = Math.min(settings.capitalNgn, settings.maxTradeSizeNgn);
      const capitalFullyDeployed = match.capital >= budget * 0.999;
      if (!capitalFullyDeployed) warnings.push("Liquidity below your capital");

      opportunities.push({
        id: `${scan.asset}-${buyPlatform}-${sellPlatform}`,
        asset: scan.asset,
        fiat: scan.fiat,
        buyPlatform,
        sellPlatform,
        buyPlatformLabel: PLATFORM_LABELS[buyPlatform],
        sellPlatformLabel: PLATFORM_LABELS[sellPlatform],
        buyPrice,
        sellPrice,
        bestBuyPrice: buyBook[0]?.price ?? buyPrice,
        bestSellPrice: sellBook[0]?.price ?? sellPrice,
        grossSpreadNgn,
        grossSpreadPct,
        executableQuantity: match.quantity,
        capitalRequired: match.capital,
        capitalFullyDeployed,
        grossProfit,
        buyFeeNgn,
        sellFeeNgn,
        feesUnknown: buyFeeNgn === null || sellFeeNgn === null,
        transactionCostNgn: settings.transactionCostNgn,
        slippageCostNgn,
        netProfit,
        netRoiPct,
        buyPaymentMethods: buyMethods,
        sellPaymentMethods: sellMethods,
        sharedPaymentMethods: shared,
        paymentCompatible,
        buyLegs: match.buyLegs,
        sellLegs: match.sellLegs,
        buyMerchant: match.buyLegs[0] ?? null,
        sellMerchant: match.sellLegs[0] ?? null,
        dataTimestamp: oldest,
        ageMs,
        status,
        warnings,
      });
    }
  }

  return opportunities.sort((a, b) => b.netProfit - a.netProfit);
}

export interface MatrixCell {
  buyPlatform: PlatformId;
  sellPlatform: PlatformId;
  spreadPct: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
}

/** Top-of-book directional spread matrix: buy from row -> sell to column. */
export function buildMatrix(scan: ScanResult, settings: ScannerSettings): MatrixCell[][] {
  const books = buildBooks(scan.ads, settings);
  const byPlatform = new Map(books.map((b) => [b.platform, b]));

  return PLATFORM_IDS.map((buyPlatform) =>
    PLATFORM_IDS.map((sellPlatform) => {
      if (buyPlatform === sellPlatform) {
        return { buyPlatform, sellPlatform, spreadPct: null, buyPrice: null, sellPrice: null };
      }
      const buyPrice = byPlatform.get(buyPlatform)?.buy[0]?.price ?? null;
      const sellPrice = byPlatform.get(sellPlatform)?.sell[0]?.price ?? null;
      const spreadPct =
        buyPrice && sellPrice ? ((sellPrice - buyPrice) / buyPrice) * 100 : null;
      return { buyPlatform, sellPlatform, spreadPct, buyPrice, sellPrice };
    }),
  );
}

export function formatNgn(value: number, digits = 0): string {
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatQty(value: number): string {
  return value.toLocaleString("en-NG", { maximumFractionDigits: value < 10 ? 4 : 2 });
}

export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

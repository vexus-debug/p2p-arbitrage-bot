// Shared, platform-agnostic P2P types. Client-safe (no server imports).

export type UserSide = "USER_BUY" | "USER_SELL";

export interface P2PAd {
  /** Platform id, e.g. "bybit" */
  platform: PlatformId;
  asset: string; // USDT, USDC, BTC, ETH...
  fiat: string; // NGN
  /**
   * Always normalized to the USER's perspective:
   * USER_BUY  = the user can BUY crypto from this advertiser (advertiser sells)
   * USER_SELL = the user can SELL crypto to this advertiser (advertiser buys)
   */
  side: UserSide;
  price: number; // fiat per 1 unit of asset
  availableQuantity: number; // in asset units
  minOrder: number; // in fiat
  maxOrder: number; // in fiat
  paymentMethods: string[]; // canonical names
  merchantName: string;
  completionRate?: number; // 0..100
  orderCount?: number;
  timestamp: number; // epoch ms when this ad snapshot was taken
  adId: string;
}

export type PlatformId = "bybit" | "bitget" | "okx" | "noones" | "localcoinswap";

export type ConnectionStatus = "connected" | "degraded" | "unavailable" | "not_configured";

export interface PlatformHealth {
  platform: PlatformId;
  label: string;
  status: ConnectionStatus;
  message?: string;
  lastSuccessAt: number | null;
  latencyMs: number | null;
  adCount: number;
  /** Platform trading fee for the taker side, when officially known. */
  feeKnown: boolean;
  buyFeePct?: number;
  sellFeePct?: number;
}

export interface ScanResult {
  scannedAt: number;
  asset: string;
  fiat: string;
  ads: P2PAd[];
  health: PlatformHealth[];
}

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  bybit: "Bybit P2P",
  bitget: "Bitget P2P",
  okx: "OKX P2P",
  noones: "NoOnes",
  localcoinswap: "LocalCoinSwap",
};

export const PLATFORM_IDS: PlatformId[] = [
  "bybit",
  "bitget",
  "okx",
  "noones",
  "localcoinswap",
];

export const SUPPORTED_ASSETS = ["USDT", "USDC", "BTC", "ETH"] as const;
export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

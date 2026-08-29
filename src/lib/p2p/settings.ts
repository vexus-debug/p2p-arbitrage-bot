import type { PlatformId } from "./types";

export interface ScannerSettings {
  asset: string;
  fiat: string;
  capitalNgn: number;
  maxTradeSizeNgn: number;
  minGrossSpreadPct: number;
  minNetProfitNgn: number;
  minNetRoiPct: number;
  minCompletionRate: number;
  minOrderCount: number;
  /** Freshness windows in seconds. */
  freshSeconds: number;
  agingSeconds: number;
  maxOpportunityAgeSeconds: number;
  requireCompatiblePaymentMethods: boolean;
  preferredPaymentMethods: string[];
  /** Optional, user-supplied fee percentages per platform. Unknown when absent. */
  feeOverridesPct: Partial<Record<PlatformId, number>>;
  transactionCostNgn: number;
  estimatedSlippagePct: number;
  scanIntervalMs: number;
  alerts: AlertSettings;
}

export interface AlertSettings {
  enabled: boolean;
  minSpreadPct: number;
  minNetProfitNgn: number;
  minExecutableQuantity: number;
  platformPair: string; // "any" or "buy>sell"
  asset: string; // "any" or asset code
  channels: { browser: boolean };
}

export const DEFAULT_SETTINGS: ScannerSettings = {
  asset: "USDT",
  fiat: "NGN",
  capitalNgn: 500_000,
  maxTradeSizeNgn: 5_000_000,
  minGrossSpreadPct: 0.5,
  minNetProfitNgn: 0,
  minNetRoiPct: 0,
  minCompletionRate: 90,
  minOrderCount: 0,
  freshSeconds: 5,
  agingSeconds: 15,
  maxOpportunityAgeSeconds: 60,
  requireCompatiblePaymentMethods: true,
  preferredPaymentMethods: [],
  feeOverridesPct: {},
  transactionCostNgn: 0,
  estimatedSlippagePct: 0.1,
  scanIntervalMs: 10_000,
  alerts: {
    enabled: false,
    minSpreadPct: 1,
    minNetProfitNgn: 5000,
    minExecutableQuantity: 0,
    platformPair: "any",
    asset: "any",
    channels: { browser: true },
  },
};

const STORAGE_KEY = "p2p-arb.settings.v1";

export function loadSettings(): ScannerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ScannerSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      alerts: { ...DEFAULT_SETTINGS.alerts, ...(parsed.alerts ?? {}) },
      feeOverridesPct: parsed.feeOverridesPct ?? {},
      preferredPaymentMethods: parsed.preferredPaymentMethods ?? [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ScannerSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked — settings stay in memory */
  }
}

export const CAPITAL_PRESETS = [50_000, 100_000, 500_000, 1_000_000, 5_000_000];
export const SPREAD_PRESETS = [0.1, 0.25, 0.5, 1, 2, 5];

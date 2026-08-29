// Canonical Nigerian P2P payment-method names + fuzzy normalization.

export const CANONICAL_PAYMENT_METHODS = [
  "Bank Transfer",
  "Opay",
  "PalmPay",
  "Moniepoint",
  "Kuda",
  "Paga",
  "Chipper Cash",
  "Cash Deposit",
  "Other",
] as const;

export type CanonicalPaymentMethod = (typeof CANONICAL_PAYMENT_METHODS)[number];

const RULES: Array<[RegExp, CanonicalPaymentMethod]> = [
  [/opay/i, "Opay"],
  [/palm\s*pay/i, "PalmPay"],
  [/monie\s*point|moniepoint/i, "Moniepoint"],
  [/kuda/i, "Kuda"],
  [/paga/i, "Paga"],
  [/chipper/i, "Chipper Cash"],
  [/cash\s*(deposit|in\s*person)/i, "Cash Deposit"],
  [/bank|transfer|domestic|wire|ngn/i, "Bank Transfer"],
];

export function normalizePaymentMethod(raw: string): CanonicalPaymentMethod {
  const value = (raw ?? "").toString().trim();
  if (!value) return "Other";
  for (const [pattern, canonical] of RULES) {
    if (pattern.test(value)) return canonical;
  }
  return "Other";
}

export function normalizePaymentMethods(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string") out.add(normalizePaymentMethod(item));
  }
  return [...out];
}

export function paymentMethodsCompatible(buy: string[], sell: string[]): boolean {
  if (!buy.length || !sell.length) return false;
  return buy.some((m) => sell.includes(m));
}

export function sharedPaymentMethods(buy: string[], sell: string[]): string[] {
  return buy.filter((m) => sell.includes(m));
}

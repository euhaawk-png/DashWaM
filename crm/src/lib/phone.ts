/**
 * Normalizes a phone number to E.164, assuming Brazil (+55) when no country
 * code is given. Returns null for invalid input.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (input.trim().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  // Bare BR number: DDD (2) + 8 or 9 digits.
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 8 && digits.length <= 15 && digits.startsWith("55") === false && digits.length > 11) {
    return `+${digits}`; // already has a foreign country code
  }
  return null;
}

/** Formats +5511999998888 as +55 11 99999-8888 for display. */
export function formatPhone(e164: string | null): string {
  if (!e164) return "";
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (m) return `+55 ${m[1]} ${m[2]}-${m[3]}`;
  return e164;
}

/** Masks a phone for logs: +5511****8888 */
export function maskPhone(e164: string | null): string {
  if (!e164) return "";
  return e164.length > 8 ? e164.slice(0, 5) + "****" + e164.slice(-4) : "****";
}

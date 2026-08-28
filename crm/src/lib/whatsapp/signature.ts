import { hmacSha256Hex, safeEqual } from "@/lib/crypto";

/**
 * Validates Meta's X-Hub-Signature-256 header over the RAW request body.
 * Every webhook POST without a valid signature must be rejected with 401.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = "sha256=" + hmacSha256Hex(secret, rawBody);
  return safeEqual(expected, signatureHeader);
}

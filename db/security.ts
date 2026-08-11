function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function secretDigest(value: string, salt: string, iterations = 210_000) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function randomNumericCode() {
  const range = 1_000_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0] >= limit);
  return String(sample[0] % range).padStart(6, "0");
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const REGISTRATION_EMAIL_DOMAINS = [
  "mails.ucas.ac.cn",
  "gmail.com",
  "outlook.com",
  "qq.com",
  "163.com",
] as const;

export function isAllowedRegistrationEmail(value: string) {
  if (!isEmail(value)) return false;
  const domain = value.trim().toLowerCase().split("@").at(-1);
  return REGISTRATION_EMAIL_DOMAINS.some((allowed) => domain === allowed);
}

export const REGISTRATION_EMAIL_DOMAINS_LABEL = "mails.ucas.ac.cn、Gmail、Outlook、QQ、163";

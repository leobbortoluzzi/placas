/** Alphabet for printed 4-char codes (no 0/O/1/l ambiguity). */
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Alphabet for generated owner passwords. */
const PASSWORD_ALPHABET =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

/** Short code printed under the QR, e.g. 9f3k */
export function generateCode(length = 4): string {
  return randomString(CODE_ALPHABET, length);
}

/** Owner password stored in plaintext per product requirement. */
export function generatePassword(length = 10): string {
  return randomString(PASSWORD_ALPHABET, length);
}

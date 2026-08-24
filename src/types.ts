/** Row shape for public.tag (Supabase project Default). */
export interface TagRow {
  /** NFC chip unique ID — path segment on tag.luzzi.dev/{serial_number} */
  serial_number: string;
  business: string | null;
  /** 4-char human lookup code (printed under QR), not a secret */
  code: string | null;
  write_at: string;
  sale_at: string | null;
  /** Destination URL for the 302 redirect */
  link: string | null;
  platform: string | null;
  /** Owner password (plaintext). Used with code for activation and management. */
  password: string | null;
}

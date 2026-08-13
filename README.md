# tag-redirect

Cloudflare Worker for NFC/QR plates:

```text
https://tag.luzzi.dev/{serial_number}  →  302 → tag.link
```

`serial_number` is the **unique NFC chip ID** written into the QR/NFC URL.

On **first** hit for an unknown serial, the Worker inserts a row (never overwrites later):

| Field | Value |
|-------|--------|
| `business` | `Luzzi.Dev` |
| `link` | `https://luzzi.dev` |
| `code` | 4-char random (e.g. `9f3k`) — printed under QR for lookup |
| `password` | 10-char random — owner secret (plaintext in DB) |

Later scans only redirect. `code` / `password` are **not** regenerated.

## Table `public.tag`

| Column | Role |
|--------|------|
| `serial_number` (PK) | NFC UID = path on `tag.luzzi.dev/{serial}` |
| `code` (unique) | 4-char human lookup (not a secret alone) |
| `password` | Owner password (plaintext). Future: code + password to edit `link` |
| `link` | 302 destination |
| `business` | Client name |
| `platform` | google / whatsapp / … |
| `write_at` | First provision time |
| `sale_at` | When sold / activated |

Project: **Default** (`mipnlysqagmcgkiraxjv`).  
URL: `https://mipnlysqagmcgkiraxjv.supabase.co`  

RLS on, **no policies** → only `service_role` (this Worker) via API.

## Flow

1. Customer taps/scans `https://tag.luzzi.dev/{nfc_uid}`
2. Worker validates serial pattern
3. `SELECT` by `serial_number`
4. **Miss** → `INSERT` with defaults + new `code` + `password`
5. **302** to `link` (`Cache-Control: no-store`)
6. You look up by `code` in Supabase and set the client URL:

```sql
update public.tag
set
  business = 'Padaria Central',
  link = 'https://g.page/r/..../review',
  platform = 'google',
  sale_at = now()
where code = '9f3k';
```

### Future self-service

User proves ownership with **`code` + `password`**, then may change `link`.  
`code` alone is not enough (and is printed on the plate).

## Production note on `password`

Stored in **plaintext** as requested (easy Table Editor / ops).  
Anyone with Supabase dashboard or a leaked service key sees all passwords.  
Keep RLS strict and never expose `password` on a public API/select for anon.

## Setup

```bash
cd /Users/leo/Projects/placas
npm install
cp .dev.vars.example .dev.vars
# SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

npm run dev
# http://127.0.0.1:8787/04A1B2C3D4E5F6

npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
# attach custom domain tag.luzzi.dev
```

## Config vars

| Var | Default | Meaning |
|-----|---------|---------|
| `FALLBACK_URL` | `https://luzzi.dev` | Default redirect + default `link` |
| `DEFAULT_BUSINESS` | `Luzzi.Dev` | Default `business` |
| `TAG_ID_PATTERN` | `^[A-Za-z0-9:_-]{4,64}$` | Allowed NFC serials in path |

## Checklist

- [ ] Secrets on Worker
- [ ] Domain `tag.luzzi.dev`
- [ ] First hit on new UID creates row with `code` + `password`
- [ ] Second hit does not change `code`/`password`
- [ ] Update `link` by `code` works
- [ ] Anon cannot read `tag` (RLS)

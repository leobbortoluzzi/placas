# tag-redirect

Cloudflare Worker for NFC/QR plates:

```text
https://tag.luzzi.dev/t/{serial_number}  →  activation page (pending) or 302 → tag.link
```

`serial_number` is the **NFC chip UID** (hex). The `/t/` prefix + hex-only check
stop bots (`/wp-json`, `/wp-admin`, random words) from creating rows.

On **first** hit for an unknown serial, the Worker inserts a pending row (never overwrites later):

| Field | Value |
|-------|--------|
| `business` | `Luzzi.Dev` |
| `link` | `NULL` until activation |
| `code` | 4-char random (e.g. `9f3k`) — printed under QR for lookup |
| `password` | 10-char random — owner secret (plaintext in DB) |

Later scans redirect once `link` is configured. `code` / `password` are **not** regenerated.

## Table `public.tag`

| Column | Role |
|--------|------|
| `serial_number` (PK) | NFC UID = path on `tag.luzzi.dev/t/{serial}` |
| `code` (unique) | 4-char human lookup (not a secret alone) |
| `password` | Owner password (plaintext). Used with `code` for activation and management |
| `link` | 302 destination; `NULL`/blank means pending activation |
| `business` | Client name |
| `platform` | google / whatsapp / … |
| `write_at` | First provision time |
| `sale_at` | When sold / activated |

Project: **Default** (`mipnlysqagmcgkiraxjv`).  
URL: `https://mipnlysqagmcgkiraxjv.supabase.co`  

RLS on, **no policies** → only `service_role` (this Worker) via API.

## Flow

1. Customer taps/scans `https://tag.luzzi.dev/t/{nfc_uid}`
2. Worker requires `/t/` + hex UID (8–20 chars). Anything else → 302 fallback, **no insert**
3. `SELECT` by `serial_number`
4. **Miss** → `INSERT` with defaults, new `code` + `password`, and `link = NULL`
5. **Pending tag** → no-store activation page showing `code` + `password`
6. **Configured tag** → `302` to `link` (`Cache-Control: no-store`)
7. Submit the activation form with `code` + `password` to save the client URL.
   Operations can still update the row manually when needed:

```sql
update public.tag
set
  business = 'Padaria Central',
  link = 'https://g.page/r/..../review',
  platform = 'google',
  sale_at = now()
where code = '9f3k';
```

### Activation and management

The pending page accepts `code` + `password`, a required HTTP(S) `link`, and optional
`business` / `platform`. It sets `sale_at` automatically and then confirms the save
before redirecting to the new destination.

For later changes, use `https://tag.luzzi.dev/manage` with **`code` + `password`**.
The management form updates `link`, `business`, and `platform` without changing the
tag credentials or `sale_at`.

## Production note on `password`

Stored in **plaintext** as requested (easy Table Editor / ops). The pending activation
page also displays it, so anyone with physical access to an unactivated tag can claim
it. Once a link is saved, normal scans no longer display the credentials. Anyone with
Supabase dashboard or a leaked service key sees all passwords. Keep RLS strict and
never expose `password` on a public API/select for anon.

## Setup

```bash
cd /Users/leo/Projects/placas
npm install
cp .dev.vars.example .dev.vars
# SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

# `public.tag.link` must allow NULL. Run once in Supabase SQL Editor if needed:
# alter table public.tag alter column link drop not null;

npm run dev
# http://127.0.0.1:8787/t/FF0F16FD7E0100

npx wrangler login
# service_role only (URL already ships from wrangler.jsonc):
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
# attach custom domain tag.luzzi.dev
```

Existing rows whose `link` is still `FALLBACK_URL` are intentionally left unchanged.
To place one into the activation flow, clear its link manually, for example:

```sql
update public.tag set link = null where code = '9f3k';
```

`wrangler.jsonc` has `keep_vars: true`. A new deploy **does not delete** vars you added only in the dashboard.  
Still: do **not** put `SUPABASE_SERVICE_ROLE_KEY` in `vars` in git — every deploy would reset it to the placeholder. Add it in the UI as **Secret**, once.

## Config vars

| Var | Where | Meaning |
|-----|--------|---------|
| `FALLBACK_URL` | `wrangler.jsonc` | Fallback for invalid paths and service/database failures |
| `DEFAULT_BUSINESS` | `wrangler.jsonc` | Default `business` |
| `TAG_ID_PATTERN` | `wrangler.jsonc` | NFC UID only (hex) |
| `SUPABASE_URL` | `wrangler.jsonc` | Project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard **Secret** | Service role (never commit) |

## Checklist

- [ ] Secrets on Worker
- [ ] Domain `tag.luzzi.dev`
- [ ] First hit on new UID creates pending row with `code` + `password`
- [ ] Pending page displays credentials and activation form
- [ ] Activation stores `link`, optional metadata, and `sale_at`
- [ ] Second hit does not change `code`/`password`
- [ ] `/manage` updates `link` by `code` + `password`
- [ ] Anon cannot read `tag` (RLS)

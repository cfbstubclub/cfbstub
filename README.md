# Stub Club — cfbstub.club

Collect every college football team you've seen play, every FBS stadium you've visited and every bowl you've attended: pennants, ticket stubs and bowl pins.

A static site (no build step) backed by Supabase for sign-in and storage, hosted on Netlify.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `css/style.css` | All styles (light and dark) |
| `js/data.js` | 138 FBS teams (2026 lineup), stadiums, neutral venues, bowls |
| `js/wall.js` | The wall: pennants, stubs, pins, tapping, matchups, export/restore |
| `js/app.js` | Sign-in, profiles, public pages, routing, saving |
| `js/config.js` | Supabase URL and publishable key (safe to be public) |
| `js/vendor/supabase.js` | supabase-js 2.117.2, vendored |
| `_redirects` | Lets Netlify serve `/u/name` and `/settings` from `index.html` |
| `supabase/schema.sql` | Tables and row-level security |

## One-time setup

### 1. Database (Supabase)
SQL Editor → New query → paste `supabase/schema.sql` → **Run**.

### 2. Sign-in settings (Supabase)
Authentication → URL Configuration:
- **Site URL:** `https://cfbstub.club`
- **Redirect URLs:** add `https://cfbstub.club/**` and your Netlify address, e.g. `https://cfbstub.netlify.app/**`

Email sign-in works out of the box. Supabase's built-in email sender is rate-limited and meant for testing; before launch, add your own SMTP (Authentication → Emails → SMTP settings).

### 3. Hosting (Netlify)
Add new site → Import from GitHub → `cfbstubclub/cfbstub`. Leave the build command empty and the publish directory as `/`. Deploy.

### 4. Domain
Netlify → Domain management → add `cfbstub.club`, then add the DNS records Netlify shows you in Porkbun.

## Data model

- `profiles`: username, display name, `is_public`
- `collections`: one JSON document per user, same format as the tracker's export file

Anyone can read a profile and collection marked public. Only the owner can change theirs.

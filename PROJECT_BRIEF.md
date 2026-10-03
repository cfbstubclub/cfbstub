# Stub Club (cfbstub.club) — project brief

## What it is
A college football collection site. Users mark:
- **Teams seen** in person (138 FBS teams, 2026 conference lineup), shown as felt pennants
- **Stadiums visited**, shown as "Admit One" ticket stubs on a corkboard, numbered in the order added
- **Bowls attended**, shown as enamel pins; each bowl also gets its own stub with the bowl name on the band

No dates or game log by design. Optional matchup per stub (e.g. ASU vs ARIZ), with type-to-search team pickers. Campus stadiums that host bowls can have two stubs (regular season + bowl). The CFP National Championship lets you pick its venue. Team logos are not used: team colors + abbreviations only.

## Live setup
| Piece | Detail |
|---|---|
| Domain | cfbstub.club (primary), cfbstubclub.com forwards to it. Registrar: Porkbun, WHOIS privacy on |
| Email | hello@cfbstub.club forwards to personal inbox (Porkbun) |
| Code | GitHub `cfbstubclub/cfbstub`, branch `main`. Static site, no build step |
| Hosting | Netlify project `cfbstubclub` (cfbstubclub.netlify.app), public, HTTPS via Let's Encrypt |
| DNS (Porkbun) | ALIAS @ → apex-loadbalancer.netlify.com; CNAME www → cfbstubclub.netlify.app; MX/TXT for email forwarding |
| Database + sign-in | Supabase project `rrcngzlecsyxbjdvrcvq`. Tables `profiles` and `collections` with row-level security (`supabase/schema.sql`) |
| Auth | Email magic link working. Site URL https://cfbstub.club; redirect URLs for cfbstub.club and the netlify.app address |
| Anonymity | All accounts use hello@cfbstub.club / GitHub `cfbstubclub`; commits signed as cfbstubclub |

## Code map
- `index.html`: page shell
- `css/style.css`: all styles, light and dark
- `js/data.js`: teams, stadiums, neutral venues, bowls
- `js/wall.js`: pennants, stubs, pins, tapping, matchups, export/restore
- `js/app.js`: sign-in, profiles, public pages (`/u/username`), settings, saving
- `_redirects`: Netlify serves all paths from index.html

## Status (Oct 2, 2026)
Done: domain, hosting, HTTPS, database, email sign-in tested end to end on cfbstub.club, own wall saving.

In progress: **Google sign-in**. Part 1: create a Google account using hello@cfbstub.club (not personal Gmail), then a Google Cloud project named `cfbstub`. Remaining parts: OAuth consent screen (app name, logo), OAuth client ID with Supabase callback URL, paste client ID/secret into Supabase → Authentication → Providers → Google, then add the "Continue with Google" button to the code.

## Next up
1. Finish Google sign-in
2. Own email sender (SMTP) in Supabase so sign-in emails aren't rate-limited
3. Bowl photos (Supabase storage)
4. v2 social: follow + activity feed + reactions; v3 stadium guide (tips/ratings, stub holders only). No open message board; link a Discord instead
5. Apple sign-in later if users ask (needs paid Apple developer account, secret renews every 6 months)

## Decisions log
- Name: Stub Club. Domain cfbstub.club over cfbstubs.club
- Memorabilia design (pennants, stubs, pins) chosen over passport stamps, scoreboard, bleachers
- FBS only. Tap-to-mark, no dates
- Walls private by default; public toggle in Settings

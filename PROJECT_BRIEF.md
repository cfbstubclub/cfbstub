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
| Auth | Email magic link + Google sign-in working. Google Cloud project `cfbstub` (owner hello@cfbstub.club), OAuth app in production; domain verified in Search Console (TXT record at Porkbun). Site URL https://cfbstub.club; redirect URLs for cfbstub.club and the netlify.app address |
| Anonymity | All accounts use hello@cfbstub.club / GitHub `cfbstubclub`; commits signed as cfbstubclub |

## Code map
- `index.html`: page shell
- `css/style.css`: all styles, light and dark
- `js/data.js`: teams, stadiums, neutral venues, bowls
- `js/wall.js`: pennants, stubs, pins, tapping, matchups, export/restore
- `js/app.js`: sign-in, profiles, public pages (`/u/username`), settings, saving
- `_redirects`: Netlify serves all paths from index.html (real files like /privacy/ are served first)
- `privacy/`, `terms/`: static policy pages, linked from the footer

## Status (Oct 2, 2026)
Done: domain, hosting, HTTPS, database, email sign-in, Google sign-in (tested end to end), own wall saving, privacy + terms pages, logo (cream "Admit One" stub on field green).

Pending: **Google branding verification**. Domain verified Oct 2 evening; on/after Oct 3 ~9:30pm, Google Auth Platform → Branding → "I have fixed the issues" → Proceed. Until approved, the Google screen says "continue to rrcngzlecsyxbjdvrcvq.supabase.co" with no logo (permanent fix: Supabase custom domain, paid).

## Next up
1. Own email sender (SMTP) in Supabase so sign-in emails aren't rate-limited
2. Bowl photos (Supabase storage)
3. v2 social: follow + activity feed + reactions; v3 stadium guide (tips/ratings, stub holders only). No open message board; link a Discord instead
4. Apple sign-in later if users ask (needs paid Apple developer account, secret renews every 6 months)

## Decisions log
- Name: Stub Club. Domain cfbstub.club over cfbstubs.club
- Memorabilia design (pennants, stubs, pins) chosen over passport stamps, scoreboard, bleachers
- FBS only. Tap-to-mark, no dates
- Walls private by default; public toggle in Settings

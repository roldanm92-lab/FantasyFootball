# MVP Trade Lab

A fantasy football toolkit for the **MVP FOOTBALL** Sleeper league (12-team dynasty, superflex, full PPR, 6-pt passing TDs, TE +0.5, yardage bonuses).

Open `index.html` in a browser. Everything runs in the page; there is no server.

## Tabs

| Tab | What it does |
|---|---|
| League Hub | Live scoreboard for the week in progress (score, projected final, win chance, who's still playing), record, lineup strength, dynasty value rank, A–F position grades, biggest need and surplus, standings for all 12 teams |
| Sit / Start | Best Week lineup by slot, compared with your current Sleeper lineup; two-player comparison |
| Season | Playoff odds for every team, your win chance each remaining week, and a projected playoff bracket with title odds |
| Rankings | Value over replacement, with replacement levels set by how many players the league actually starts at each position |
| Waivers & Injuries | Free agents who would start for you (with a suggested drop), dynasty stashes, and injury reports for your roster and the league |
| Trade Finder | Improve a position, trade for a player or pick, shop one or more of your players and picks, or best overall; FAAB can balance close deals; every suggestion explains why it works |
| Trade Analyzer | Grades any trade, including FAAB on either side: market values, 30% penalty for players who would not start, value and win-now edge, position ranks before/after, bye conflicts |

## How the numbers work

- **Projections:** Sleeper weekly projections, re-scored with the league's scoring settings, including expected yardage bonuses and expected 40+ yard TD bonuses. Questionable players are cut 25% for the current week, Doubtful 75%.
- **Trade values:** FantasyCalc dynasty values (12-team, superflex, PPR), pulled on every refresh for every player and pick in the feed. Tight ends are raised for the league's TE premium. Players missing from the feed are estimated.
- **FAAB:** remaining budgets come from Sleeper; $1 is valued from the league's own winning bids (adjustable on the page).
- **2027 picks:** valued by the original team's projected finish in the season simulation (reverse-standings draft order assumed).
- **Trade edge:** value edge (value received / total value) blended with a win-now edge (lineup points gained) for teams whose lineup ranks in the top 8. 55%+ Strong Accept, 52-55% Lean Accept, 48-52% Fair, 45-48% Lean Pass, under 45% Strong Pass.
- **Accuracy log:** each player's projection is frozen when his game starts (`data/projlog/`), then graded against actual scoring once the week is over. The table is under "How the numbers work" on the page.

## Refreshing the data

The site refreshes itself with GitHub Actions (`.github/workflows/refresh.yml`): every morning, Thursday evening and Sunday before kickoff, during the regular season. To run it by hand, use "Run workflow" on the Actions tab, or locally:

```bash
./scripts/fetch_data.sh          # pulls Sleeper data and FantasyCalc values into raw/ (not committed)
python3 scripts/build_data.py    # writes data/data.json, data/values.json, data/projlog/
python3 scripts/build.py         # writes index.html
node scripts/smoke.js            # sanity check
```

If FantasyCalc cannot be reached, the build keeps the last saved values in `data/values.json`.

# MVP Trade Lab

A fantasy football toolkit for the **MVP FOOTBALL** Sleeper league (12-team dynasty, superflex, full PPR, 6-pt passing TDs, TE +0.5, yardage bonuses).

Open `index.html` in a browser. Everything runs in the page; there is no server.

## Tabs

| Tab | What it does |
|---|---|
| League Hub | Record, lineup strength, dynasty value rank, A–F position grades, biggest need and surplus, standings for all 12 teams |
| Sit / Start | Best Week lineup by slot, compared with your current Sleeper lineup; two-player comparison |
| Season | Playoff odds for every team, your win chance each remaining week, and a projected playoff bracket with title odds |
| Matchups | Fantasy points each defense allows per position (league scoring), and your starters' matchup scores |
| Rankings | Value over replacement, with replacement levels set by how many players the league actually starts at each position |
| Waivers & Injuries | Free agents who would start for you (with a suggested drop), dynasty stashes, and injury reports for your roster and the league |
| Trade Finder | Improve a position, trade for a player or pick, shop one or more of your players and picks, or best overall; FAAB can balance close deals; every suggestion explains why it works |
| Trade Analyzer | Grades any trade, including FAAB on either side: market values, 30% penalty for players who would not start, trade edge %, position ranks before/after, bye conflicts |

## How the numbers work

- **Projections:** Sleeper weekly projections, re-scored with the league's scoring settings, including expected yardage bonuses.
- **Trade values:** FantasyCalc dynasty values (12-team, superflex, PPR). Players outside its top 100 are estimated from league-wide player scores fit to market values, otherwise from DynastyProcess values.
- **FAAB:** remaining budgets come from Sleeper; $1 is valued from the league's own winning bids (adjustable on the page).
- **2027 picks:** valued by the original team's projected finish in the season simulation (reverse-standings draft order assumed).
- **Trade edge:** value received ÷ total value. 55%+ Strong Accept, 52–55% Lean Accept, 48–52% Fair, 45–48% Lean Pass, under 45% Strong Pass.

## Refreshing the data

```bash
./scripts/fetch_data.sh          # pulls Sleeper data into raw/ (not committed)
python3 scripts/build_data.py    # writes data/data.json
python3 scripts/build.py         # writes index.html
```

`data/fc.txt` holds the FantasyCalc snapshot (top 100); update it when values move.

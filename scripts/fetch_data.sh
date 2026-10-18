#!/usr/bin/env bash
# Downloads league, roster, projection and stats data from Sleeper's public API into raw/.
set -euo pipefail
cd "$(dirname "$0")/.."
LEAGUE=1363627098706550784
SEASON=2026
WEEK=${WEEK:-$(curl -sS https://api.sleeper.app/v1/state/nfl | python3 -c 'import json,sys;print(json.load(sys.stdin)["week"])')}
mkdir -p raw
curl -sS -o raw/state.json https://api.sleeper.app/v1/state/nfl
curl -sS -o raw/players.json https://api.sleeper.app/v1/players/nfl
for f in rosters users traded_picks; do curl -sS -o raw/$f.json https://api.sleeper.app/v1/league/$LEAGUE/$f; done
mv raw/traded_picks.json raw/picks.json
curl -sS -o raw/league.json https://api.sleeper.app/v1/league/$LEAGUE
POS='position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=DEF'
for w in $(seq "$WEEK" 18); do curl -sS -o raw/proj$w.json "https://api.sleeper.app/projections/nfl/$SEASON/$w?season_type=regular&$POS"; done
for w in $(seq 1 $((WEEK-1))); do curl -sS -o raw/stats$w.json "https://api.sleeper.app/stats/nfl/$SEASON/$w?season_type=regular&$POS"; done
for w in $(seq 1 18); do curl -sS -o raw/m$w.json https://api.sleeper.app/v1/league/$LEAGUE/matchups/$w; done
for w in $(seq 1 "$WEEK"); do curl -sS -o raw/tx$w.json https://api.sleeper.app/v1/league/$LEAGUE/transactions/$w; done
curl -sS -o raw/schedule.json https://api.sleeper.app/schedule/nfl/regular/$SEASON
curl -sS -o raw/scores.json https://api.sleeper.app/scores/nfl/regular/$SEASON/$WEEK
echo "Fetched data through week $WEEK. Next: python3 scripts/build_data.py && python3 scripts/build.py"

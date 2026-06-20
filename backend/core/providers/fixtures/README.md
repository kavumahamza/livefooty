# Fixture Corpus — API-Football v3 Sample Payloads

Hand-derived from the API-Football v3 documented response shapes. All data is synthetic
(clearly-fake but realistic). No live API dependency — this corpus is the test substrate
for normalization (Task 1.1) and the momentum fallback (Task 2.3).

Every file captures the full API envelope:
`{"get":..., "parameters":{...}, "errors":[], "results":N, "paging":{...}, "response":[...]}`

---

## File Index

| File | Endpoint | Fixture ID(s) | Scenario |
|------|----------|---------------|----------|
| `fixtures_today.json` | `/fixtures?date=2026-06-20` | 1035037, 1035038, 1035039, 2045101, 2045102 | 5 fixtures across 2 leagues; mixed statuses: 1H, HT, FT, NS, 2H |
| `live_scores.json` | `/fixtures?live=all` | 1035037, 1035038, 2045102 | 3 live-only fixtures (1H, HT, 2H); non-null elapsed + goals |
| `events_1035037.json` | `/fixtures/events?fixture=1035037` | 1035037 | Rich: 3 goals, 2 yellow cards, 1 red card, 1 substitution |
| `stats_1035037.json` | `/fixtures/statistics?fixture=1035037` | 1035037 | **RICH / "stats" mode** — both teams; includes Shots on Goal, Total Shots, Ball Possession, Attacks, Dangerous Attacks (all non-null) |
| `stats_sparse_2045102.json` | `/fixtures/statistics?fixture=2045102` | 2045102 | **SPARSE / forces "events" fallback** — Attacks and Dangerous Attacks types absent entirely; several other values are null |
| `lineups_1035037.json` | `/fixtures/lineups?fixture=1035037` | 1035037 | Both teams; full 11-man startXI with grid positions; 3-4 subs each; formation 4-3-3 |
| `match_abandoned.json` | `/fixtures?id=1035099` | 1035099 | Single-result envelope; status short="ABD"; goals present but fulltime null — verifies graceful handling |

---

## Rich vs Sparse: momentum mode selection

- **`stats_1035037.json`** — drives the **"stats" mode** for momentum calculation. Both
  `Attacks` and `Dangerous Attacks` types are present with non-null integer values for
  both teams, enabling direct stat-based momentum scoring.

- **`stats_sparse_2045102.json`** — forces the **"events" fallback** for momentum. The
  `Attacks` and `Dangerous Attacks` stat types are entirely absent from the response
  array (not just null). Several other values (Goalkeeper Saves, Passes) are also null,
  reflecting real-world low-coverage leagues.

---

## Reuse: consistent fixture IDs

- **Rich fixture (events + stats + lineups):** `1035037` — Man Utd vs Newcastle, 1H, 34'
- **Sparse fixture (stats only):** `2045102` — Atletico Madrid vs Valencia, 2H, 67'
- **Abandoned fixture:** `1035099` — Aston Villa vs Tottenham, stopped at 58'

# Task 1.1 Report — MockProvider + normalize.py

## Status
COMPLETE. All 18 tests pass.

## Files Created / Modified
- `backend/core/normalize.py` — NEW: normalizes raw API-Football v3 JSON → DTOs
- `backend/core/providers/mock.py` — REPLACED stub with real corpus-loading provider
- `backend/tests/test_mock_provider.py` — NEW: 18 TDD tests

## Exact pytest output
```
..................                                                       [100%]
18 passed in 0.05s
```

## How each quirk is handled

### `subst` casing
Raw API sends `"Goal"`, `"Card"` (Title Case) and `"subst"` (all lowercase). The normalizer lowercases the raw type before lookup in `_TYPE_MAP = {"goal": "goal", "card": "card", "subst": "subst"}`. This means any casing variant maps correctly. `"Var"` / `"var"` has no entry in the map → `None` is returned and the event is skipped from the result list.

### Possession string `"55%"`
`_parse_possession()` accepts the raw value, converts to `str`, strips `"%"` with `.rstrip("%")`, then casts to `int`. Guards `None` and malformed values by catching `ValueError/TypeError`. Result: `"55%"` → `55`, `None` → `None`.

### Sparse absent keys
Stats are built into a `{type: value}` dict via dict comprehension. All lookups use `.get(key)` which returns `None` for absent keys. In the sparse corpus, `"Attacks"` and `"Dangerous Attacks"` are simply not present in the statistics array, so `home_map.get("Attacks")` → `None` and `home_map.get("Dangerous Attacks")` → `None`. No `KeyError` possible.

### `Var` event exclusion
Any raw type not in `_TYPE_MAP` (including `"var"` / `"Var"`) causes `normalize_event` to return `None`. The caller (`normalize_events`) skips `None` results.

### Lineup normalization
`normalize_lineups` extracts `startXI[*].player.name` for each team. Returns `{"home": [...], "away": [...]}`. Returns `None` for unknown fixture IDs (file not found).

## Self-review

**Strengths:**
- Sparse-safe: all stat lookups via `.get()`, no index assumptions
- Event type handling is case-insensitive and forward-safe (unknown types silently dropped)
- MockProvider file resolution is deterministic: rich stats file takes priority over sparse by naming convention
- Tests written first (TDD), all assert specific values from known corpus data

**Potential concerns:**
- `normalize_fixture` uses `raw["fixture"]["date"]` as `kickoff_utc`; this works for the corpus but assumes the API always provides a date string (not a timestamp-only response)
- Lineups only extract `startXI` player names; if callers need formation or position data, the DTO would need extension
- `normalize_stats` assumes `response[0]` is always the home team — this matches the API contract but is not validated
- `get_fixtures(date)` ignores the `date` parameter (always loads `fixtures_today.json`) — acceptable for a mock but noted for future live provider

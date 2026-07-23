# Paging + Default-Show-All — Design

> Status: RED design (no code yet). Tests at `extensions/paging.test.ts`.
> Branch: `feat/paging-fuzzy-telemetry-showall`.

## Problem

`formatList(items, maxItems=200)` caps hard at 200. Whole-machine cmd+skill
registry easily 10k+ entries (hindsight memory, 2026-07-21). Current output
just truncates with `... (X more, refine query)` — no way to advance.

User asks:
1. Page at 50 items, `x more` footer.
2. Default show ALL when `/cmd list` (no query).

## API surface

### `formatList` signature (backward-compat)

```ts
export interface FormatListOptions {
  /** Page number, 1-indexed. Default 1. Ignored if showAll=true. */
  page?: number;
  /** Items per page. Default 50. Ignored if showAll=true. */
  pageSize?: number;
  /** Show all items (no paging). Default false. */
  showAll?: boolean;
  /** Footer appears when total > this even in showAll mode. Default 200. */
  footerThreshold?: number;
}

// Union keeps `formatList(items, 3)` (legacy maxItems) working.
export function formatList(
  items: PaletteItem[],
  opts?: FormatListOptions | number,
): string;
```

Why union not break: existing `format.test.ts` calls `formatList(items, 3)`.
If `typeof opts === "number"` → legacy path (maxItems cap, old footer text).

### Pagination syntax: `page N` token

Choice: `/cmd list page 2` (space-separated, natural language).

Rejected alternatives:
- `--page=2` — flag syntax alien to pi prompt cmds (cmds are prose).
- `/cmd list 2` — ambiguous with single-token fuzzy query.
- `?page=2` — query-string taste, wrong fit.

Parse rule in `dispatch()`:
- Tokenize, find `page` keyword, grab next token as integer.
- Strip both tokens from query string fed to fuzzy.
- Default page=1.

### Default-show-all rule

| Invocation | Behavior |
|---|---|
| `/cmd list` (no query) | `showAll=true`. pageSize ignored. Footer if total > footerThreshold (200). |
| `/cmd list <query>` | fuzzy filter, then pageSize=50 paging. |
| `/cmd list page N` | pageSize=50, page=N (no query → no fuzzy). |
| `/cmd list <query> page N` | fuzzy + pageSize=50 + page=N. |
| `/cmd <query>` (no subaction) | fuzzy + pageSize=50 + page=1. |
| `/cmd` (interactive) | unchanged (picker). |

Rationale: bare `list` = "show me everything available". Filtered list =
refined, smaller result set, page at 50.

## Footer text

Paged (more items exist beyond current page):
```
Showing 1-50 of 194 (144 more — page 2 or refine)
```

Paged last page (no more):
```
Showing 151-194 of 194
```

showAll + total > footerThreshold:
```
Showing all 194
```
(no "x more" since we DID show all — just a count reminder)

Wait — contradiction with task: "footer only if registry > threshold like 200".
showAll means literally all shown. So footer = just informational count line,
shown when total > footerThreshold. Below threshold, no footer line at all.

Decision: `footerThreshold=200`. Below it + showAll = no footer. Above =
single count line `Showing all N`.

## Output examples

### 30 items, `/cmd list` (showAll)
```
  1. [cmd] /a — alpha
  2. [cmd] /b — beta
...
 30. [cmd] /z — zeta
```
No footer (30 < 200).

### 75 items, `/cmd list` (showAll)
```
  1. [cmd] /a ...
 75. [cmd] /zz ...
```
No footer (75 < 200).

### 75 items, `/cmd list foo` (pageSize=50, page=1)
```
  1. [cmd] /foo1 ...
 50. [cmd] /foo50 ...
Showing 1-50 of 75 (25 more — page 2 or refine)
```

### 75 items, `/cmd list foo page 2` (pageSize=50, page=2)
```
  1. [cmd] /foo51 ...
 25. [cmd] /foo75 ...
Showing 51-75 of 75
```
Note: page-local numbering restarts at 1. Range footer shows global span.

### 194 items, `/cmd list` (showAll)
```
  1. [cmd] /a ...
...
194. [cmd] /zzz ...
Showing all 194
```
(194 < 200 → actually no footer per threshold rule. Bump test to 250 for footer case.)

### 194 items, `/cmd list` no wait — paged default page 1
Not default. Default = showAll. Paged only when query present or `page N` explicit.

### 194 items, `/cmd list deploy page 1` (pageSize=50)
```
  1. [cmd] /deploy-a ...
 50. [cmd] /deploy-z50 ...
Showing 1-50 of 194 (144 more — page 2 or refine)
```

## Test matrix (`extensions/paging.test.ts`)

| # | Input | Expected |
|---|---|---|
| 1 | formatList(194 items, {page:1, pageSize:50}) | "Showing 1-50 of 194", "144 more" |
| 2 | formatList(194 items, {page:2, pageSize:50}) | "Showing 51-100 of 194", items 51-100 present |
| 3 | formatList(194 items, {page:4, pageSize:50}) | last page "Showing 151-194 of 194", no "more" |
| 4 | formatList(194 items, {page:5, pageSize:50}) | out-of-range → empty or clamped, "Showing 0 of 194"? Decision: clamp to last non-empty page. |
| 5 | formatList(30 items, {page:1, pageSize:50}) | all 30, no footer |
| 6 | formatList(250 items, {showAll:true}) | all 250 lines, "Showing all 250" |
| 7 | formatList(194 items, {showAll:true}) | all 194, NO footer (194 < 200) |
| 8 | formatList(items, 3) legacy | backward-compat: caps at 3, old "refine query" text |
| 9 | dispatch("list page 2", deps) with 120 items | notify message contains "Showing 51-100" |
| 10 | dispatch("list", deps) with 250 items | showAll, all 250 present, "Showing all 250" |
| 11 | dispatch("list deploy", deps) with 75 deploy-matches | pageSize=50, "Showing 1-50 of 75", "25 more" |
| 12 | dispatch("list deploy page 2", deps) | "page" stripped from query, page=2 applied |

## RED status

All tests fail right now because:
- formatList takes `(items, maxItems:number)` not options object.
- dispatch doesn't parse `page N`.
- dispatch list-default uses pageSize=200 cap, not showAll.

/**
 * fuzzy.ts — Pure fuzzy-search helpers (no pi imports, fully testable).
 *
 * Strategy: subsequence matching with bonuses for:
 *   - consecutive matches (word integrity)
 *   - leading character matches (prefix bonus)
 *   - boundary matches (start of word, after separator, after camelCase)
 *
 * Returns a score where higher = better. A score of 0 means no match.
 * The function is case-insensitive. Diacritics are NOT normalized —
 * callers should pre-normalize if they want that (keeps the function pure
 * and avoids locale surprises).
 */

/** Options controlling subsequence scoring. */
export interface FuzzyOptions {
  /**
   * Bonus added when a match character is at the boundary of a word.
   * Boundaries: start of string, after `/`, `_`, `-`, `.`, ` `, or after
   * a lowercase→uppercase transition (camelCase).
   */
  boundaryBonus?: number;
  /** Bonus for each consecutive matched character (compounding). */
  consecutiveBonus?: number;
  /** Bonus when the first matched char is at index 0 (strong prefix). */
  leadingBonus?: number;
}

const DEFAULTS: Required<FuzzyOptions> = {
  boundaryBonus: 4,
  consecutiveBonus: 12,
  leadingBonus: 8,
};

/** Character classes considered "separators" for boundary detection. */
const SEPARATORS = new Set(["/", "_", "-", ".", " ", ":", "@"]);

/**
 * Detect a boundary at position `ci` in the ORIGINAL (pre-lowercase) string.
 * Boundaries: start of string, after a separator, or after a
 * lowercase→uppercase transition (camelCase).
 *
 * We pass the original candidate so camelCase boundaries survive
 * case-insensitive matching.
 */
function isBoundaryAt(original: string, ci: number): boolean {
  if (ci === 0) return true;
  const prev = original[ci - 1];
  const curr = original[ci];
  if (SEPARATORS.has(prev)) return true;
  // camelCase: prev lowercase letter, curr uppercase letter.
  const prevIsLower = prev >= "a" && prev <= "z";
  const currIsUpper = curr >= "A" && curr <= "Z";
  return prevIsLower && currIsUpper;
}

/**
 * Score a candidate string against a query using subsequence matching.
 *
 * @returns a non-negative score; 0 means the query is not a subsequence
 *          (i.e. no match). Higher is better.
 */
export function fuzzyScore(
  query: string,
  candidate: string,
  opts: FuzzyOptions = {},
): number {
  const o = { ...DEFAULTS, ...opts };
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (!q) return 1; // empty query: every candidate is equally good
  if (q.length > c.length) return 0;

  let score = 0;
  let qi = 0;
  let lastMatchIdx = -2; // so consecutive check fails on first match
  let matchedAny = false;

  for (let ci = 0; ci < c.length && qi < q.length; ci++) {
    if (c[ci] !== q[qi]) continue;
    matchedAny = true;

    // boundary (use the ORIGINAL candidate so camelCase survives lowercasing)
    if (isBoundaryAt(candidate, ci)) score += o.boundaryBonus;
    // leading
    if (ci === 0) score += o.leadingBonus;
    // consecutive
    if (ci === lastMatchIdx + 1) score += o.consecutiveBonus;

    lastMatchIdx = ci;
    qi++;
  }

  if (!matchedAny || qi < q.length) return 0;
  return score;
}

/** A scored item carrying arbitrary metadata about the candidate. */
export interface ScoredItem<T> {
  item: T;
  score: number;
}

/**
 * Rank a list of candidates by fuzzy score against `query`.
 * Items scoring 0 (no match) are dropped unless `keepAll` is true
 * (in which case they're appended with score 0, after all real matches).
 *
 * @param getText returns the searchable text for each item.
 *               Multiple fields can be joined; the function doesn't care
 *               which field matched — call {@link fuzzyScoreMulti} if you
 *               need per-field weighting.
 */
export function fuzzyRank<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  opts: FuzzyOptions = {},
  keepAll = false,
): ScoredItem<T>[] {
  const scored = items.map((item) => ({
    item,
    score: fuzzyScore(query, getText(item), opts),
  }));
  const matching = scored.filter((s) => s.score > 0);
  const nonMatching = scored.filter((s) => s.score === 0);

  matching.sort((a, b) => b.score - a.score);
  if (keepAll) return [...matching, ...nonMatching];
  return matching;
}

/**
 * Multi-field fuzzy ranking with per-field weights.
 *
 * Example: weight the title 3x, the description 2x, the body 1x.
 * The BEST field score wins per item (max, not sum) so a great title
 * match isn't drowned out by a mediocre body match.
 */
export interface MultiField<T> {
  text: (item: T) => string;
  weight: number;
}

export function fuzzyRankMulti<T>(
  query: string,
  items: T[],
  fields: MultiField<T>[],
  opts: FuzzyOptions = {},
  keepAll = false,
): ScoredItem<T>[] {
  const scored = items.map((item) => {
    let best = 0;
    for (const f of fields) {
      const raw = fuzzyScore(query, f.text(item), opts);
      const weighted = raw * f.weight;
      if (weighted > best) best = weighted;
    }
    return { item, score: best };
  });

  const matching = scored.filter((s) => s.score > 0);
  const nonMatching = scored.filter((s) => s.score === 0);

  matching.sort((a, b) => b.score - a.score);
  if (keepAll) return [...matching, ...nonMatching];
  return matching;
}

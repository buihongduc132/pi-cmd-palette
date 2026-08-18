/**
 * cache.ts — Cached discovery for pi-cmd-palette headless CLI.
 *
 * Caches the result of scanning prompts/skills directories (disk I/O +
 * frontmatter parsing) keyed by (agentDir + cwd + directory mtimes).
 *
 * Cache invalidation: TTL (default 300s, configurable via env) OR
 * fingerprint mismatch (directory mtimes changed).
 *
 * Stored in ~/.cache/pi-cmd-palette/index-<hash>.json so both pi's /cmd
 * extension and Hermes's thin client subprocess share the same cache.
 *
 * Design:
 *   - Fingerprint = JSON.stringify({ agentDir, cwd, mtimes: { path: mtime } })
 *     where mtimes are collected for every directory read during discovery.
 *   - TTL default 300s (5 min), 0 = disabled (always rescan).
 *   - Sync rescan on invalidation — async refresh complexity buys nothing
 *     when rescan is ~50-150ms (node boot + imports + disk scan).
 *
 * Open threads deferred:
 *   - OT2: symlink-target mtime in fingerprint (stale cache after atomic
 *     symlink mirror swap on mtime-coarse FS). Fix is one readlink+stat
 *     addition per symlink; deferring with naive fingerprint first.
 */

import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { PaletteItem } from "../extensions/discovery.ts";

/** Cache entry shape written to disk. */
interface CacheEntry {
  /** Fingerprint that produced this cache — recompute if mismatch. */
  fingerprint: string;
  /** Unix timestamp (ms) when this entry was written. */
  cachedAt: number;
  /** The cached items. */
  items: PaletteItem[];
}

/** Fingerprint shape — hash input for cache key. */
interface Fingerprint {
  agentDir: string;
  cwd: string;
  /** Map of directory path → mtime (Unix timestamp ms). */
  mtimes: Record<string, number>;
}

/** Get cache TTL from env (seconds). Default 300s (5 min), 0 = disabled. */
function getCacheTTL(): number {
  const env = process.env.CMD_PALETTE_CACHE_TTL;
  if (!env) return 300;
  const parsed = parseInt(env, 10);
  return isNaN(parsed) ? 300 : Math.max(0, parsed);
}

/** Compute fingerprint from agentDir + cwd + directory mtimes. */
export function computeFingerprint(
  agentDir: string,
  cwd: string,
  dirs: string[],
): string {
  const mtimes: Record<string, number> = {};
  for (const dir of dirs) {
    try {
      const stat = statSync(dir);
      mtimes[dir] = stat.mtimeMs;
    } catch {
      // Directory doesn't exist or unreadable — record as 0.
      mtimes[dir] = 0;
    }
  }
  const fp: Fingerprint = { agentDir, cwd, mtimes };
  return JSON.stringify(fp);
}

/**
 * Compute the cache IDENTITY key — what makes two lookups "the same query".
 *
 * Deliberately excludes mtimes: the filename must be stable across content
 * changes, otherwise every edit mints a brand-new cache file and the old ones
 * are never reclaimed (unbounded ~/.cache growth).
 *
 * `variant` separates consumers that produce DIFFERENT item sets from the same
 * directories — the pi extension merges `pi.getCommands()` runtime commands in,
 * the headless CLI does not. Without this, whichever ran last would overwrite
 * the other's entry and pi `/cmd` could silently serve a payload missing every
 * extension-registered command.
 */
function cacheKey(agentDir: string, cwd: string, variant: string): string {
  return JSON.stringify({ agentDir, cwd, variant });
}

/** Hash a string into a short cache filename component. */
function hashFingerprint(fp: string): string {
  return createHash("sha256").update(fp).digest("hex").slice(0, 16);
}

/** Resolve cache directory (creates if missing). */
function cacheDir(): string {
  const dir = join(homedir(), ".cache", "pi-cmd-palette");
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Swallow — if we can't create the cache dir, we'll just skip caching.
  }
  return dir;
}

/** Resolve cache file path for a given identity key. */
function cacheFilePath(key: string): string {
  const hash = hashFingerprint(key);
  return join(cacheDir(), `index-${hash}.json`);
}

/** Read cache entry from disk (returns null on miss or parse error). */
function readCacheEntry(filePath: string): CacheEntry | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

/** Write cache entry to disk (best-effort, never throws). */
function writeCacheEntry(filePath: string, entry: CacheEntry): void {
  try {
    writeFileSync(filePath, JSON.stringify(entry), "utf-8");
  } catch {
    // Swallow — caching is best-effort.
  }
}

/**
 * Get cached items or rescan if invalid.
 *
 * @param agentDir — PI_CODING_AGENT_DIR or ~/.pi/agent
 * @param cwd — current working directory (project root)
 * @param dirs — directories to fingerprint (prompts/skills paths)
 * @param rescanFn — callback to rescan items (gatherItems)
 * @param variant — consumer identity; separates item-set shapes that come from
 *   the same dirs (e.g. "pi" merges runtime commands, "cli" does not). Two
 *   consumers with different variants never share a cache file.
 * @returns cached or fresh items
 */
export function getCachedOrRescan(
  agentDir: string,
  cwd: string,
  dirs: string[],
  rescanFn: () => PaletteItem[],
  variant: string = "cli",
): PaletteItem[] {
  const ttl = getCacheTTL();
  const fingerprint = computeFingerprint(agentDir, cwd, dirs);
  // Filename is keyed on IDENTITY (stable), freshness lives in the entry body.
  const filePath = cacheFilePath(cacheKey(agentDir, cwd, variant));

  // Cache disabled (TTL=0) — always rescan.
  if (ttl === 0) {
    return rescanFn();
  }

  // Try to read cache.
  const cached = readCacheEntry(filePath);
  if (!cached) {
    // Cache miss — rescan and write.
    const items = rescanFn();
    writeCacheEntry(filePath, { fingerprint, cachedAt: Date.now(), items });
    return items;
  }

  // Check fingerprint mismatch.
  if (cached.fingerprint !== fingerprint) {
    // Directory mtimes changed — rescan and overwrite.
    const items = rescanFn();
    writeCacheEntry(filePath, { fingerprint, cachedAt: Date.now(), items });
    return items;
  }

  // Check TTL expiry.
  const age = Date.now() - cached.cachedAt;
  if (age > ttl * 1000) {
    // TTL expired — rescan and overwrite.
    const items = rescanFn();
    writeCacheEntry(filePath, { fingerprint, cachedAt: Date.now(), items });
    return items;
  }

  // Cache hit — return cached items.
  return cached.items;
}

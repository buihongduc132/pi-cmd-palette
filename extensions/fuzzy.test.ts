import { describe, it, expect } from "vitest";
import {
  fuzzyScore,
  fuzzyRank,
  fuzzyRankMulti,
  type MultiField,
} from "./fuzzy.ts";

describe("fuzzyScore", () => {
  it("returns 0 when query is not a subsequence", () => {
    expect(fuzzyScore("xyz", "abc")).toBe(0);
    expect(fuzzyScore("abc", "ab")).toBe(0);
  });

  it("returns a positive score on exact match", () => {
    expect(fuzzyScore("abc", "abc")).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("ABC", "abc")).toBeGreaterThan(0);
    expect(fuzzyScore("abc", "ABC")).toBeGreaterThan(0);
  });

  it("returns 1 for empty query (every candidate matches equally)", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
  });

  it("scores prefix matches higher than scattered matches", () => {
    const prefix = fuzzyScore("cmd", "cmd-palette");
    const scattered = fuzzyScore("cmd", "c___m___d");
    expect(prefix).toBeGreaterThan(scattered);
  });

  it("scores boundary matches (after separator) higher than mid-word", () => {
    const boundary = fuzzyScore("pa", "cmd-palette"); // p after `-`
    const midWord = fuzzyScore("al", "cmd-palette"); // a,l inside word
    expect(boundary).toBeGreaterThan(midWord);
  });

  it("scores camelCase boundaries", () => {
    const camel = fuzzyScore("p", "cmdPalette"); // P after lowercase d
    const lower = fuzzyScore("m", "cmdpalette"); // m inside word
    expect(camel).toBeGreaterThan(lower);
  });

  it("rewards consecutive matches", () => {
    const consecutive = fuzzyScore("abc", "xabcx");
    const split = fuzzyScore("abc", "a_b_c");
    expect(consecutive).toBeGreaterThan(split);
  });
});

describe("fuzzyRank", () => {
  it("drops non-matching items by default", () => {
    const items = ["apple", "banana", "cherry"];
    const ranked = fuzzyRank("app", items, (s) => s);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].item).toBe("apple");
  });

  it("keeps non-matching items with score 0 when keepAll=true", () => {
    const items = ["apple", "banana", "cherry"];
    const ranked = fuzzyRank("app", items, (s) => s, {}, true);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].item).toBe("apple");
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[1].score).toBe(0);
    expect(ranked[2].score).toBe(0);
  });

  it("sorts best matches first", () => {
    const items = ["xaxbx", "ab", "a-b", "aab"];
    const ranked = fuzzyRank("ab", items, (s) => s);
    expect(ranked.length).toBeGreaterThan(0);
    // The shortest / most-boundaried match should rank highest.
    expect(ranked[0].item).toBe("ab");
  });

  it("handles empty query (returns all, stable order)", () => {
    const items = ["a", "b", "c"];
    const ranked = fuzzyRank("", items, (s) => s);
    expect(ranked).toHaveLength(3);
  });
});

describe("fuzzyRankMulti", () => {
  interface Item {
    title: string;
    body: string;
  }
  const fields: MultiField<Item>[] = [
    { text: (i) => i.title, weight: 3 },
    { text: (i) => i.body, weight: 1 },
  ];

  it("uses the best weighted field score per item", () => {
    const items: Item[] = [
      { title: "alpha", body: "zzz" }, // title match ×3
      { title: "zzz", body: "alpha" }, // body match ×1
    ];
    const ranked = fuzzyRankMulti("alpha", items, fields);
    expect(ranked[0].item.title).toBe("alpha");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("drops items with no match in any field", () => {
    const items: Item[] = [
      { title: "alpha", body: "x" },
      { title: "y", body: "z" },
    ];
    const ranked = fuzzyRankMulti("alpha", items, fields);
    expect(ranked).toHaveLength(1);
  });
});

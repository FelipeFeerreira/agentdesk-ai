import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits long text into multiple chunks", () => {
    const paragraph = "word ".repeat(2000);
    const chunks = chunkText(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1600);
    }
  });

  it("keeps short documents as a single chunk", () => {
    const chunks = chunkText("This is a short refund policy.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("refund policy");
  });

  it("normalizes newlines and trims whitespace", () => {
    const chunks = chunkText("Line one\nLine two\n\nParagraph two");
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(c).toBe(c.trim());
  });
});

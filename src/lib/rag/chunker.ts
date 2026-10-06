/**
 * Simple, deterministic text chunker for the knowledge base.
 * Splits on paragraphs/sentences and packs into fixed-size chunks with overlap,
 * so retrieved chunks read coherently.
 */

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 200;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  if (!normalized) return [];

  // Split into paragraph-level segments.
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > TARGET_CHARS) {
      flush();
      // Split a very long paragraph into sentence-ish pieces.
      const pieces = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
      for (const piece of pieces) {
        for (const part of splitHard(piece.trim())) {
          if (buffer.length + part.length > TARGET_CHARS && buffer.length > 0) {
            flush();
          }
          buffer += (buffer ? " " : "") + part;
        }
      }
    } else {
      if (buffer.length + paragraph.length > TARGET_CHARS && buffer.length > 0) {
        flush();
        // Carry overlap of the previous chunk tail into the new chunk.
        const tail = buffer.slice(-OVERLAP_CHARS);
        buffer = tail ? tail + " " : "";
      }
      buffer += (buffer ? " " : "") + paragraph;
    }
  }
  flush();

  return chunks.filter((c) => c.trim().length > 0);
}

/** Split a piece that has no sentence boundaries into word-aligned chunks. */
function splitHard(text: string): string[] {
  if (text.length <= TARGET_CHARS) return text ? [text] : [];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf.length + w.length + 1 > TARGET_CHARS && buf.length > 0) {
      out.push(buf);
      buf = w;
    } else {
      buf += (buf ? " " : "") + w;
    }
  }
  if (buf) out.push(buf);
  return out;
}

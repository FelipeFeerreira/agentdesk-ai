/**
 * Embedding abstraction.
 *
 * `demo` provider: deterministic local embedding (hash-based bag-of-words in a
 * fixed dimension) that requires no network or API key. It produces meaningful
 * cosine similarity for overlapping vocabulary — sufficient to demonstrate the
 * full RAG pipeline offline.
 *
 * `openai` provider: text-embedding-3-small via the OpenAI API.
 */

const DIM = 384;

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "what", "which", "who", "whom", "whose", "your", "yours", "my", "mine",
  "our", "ours", "their", "theirs", "how", "does", "do", "did", "can",
  "could", "should", "would", "will", "shall", "may", "might", "must",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
  "them", "to", "of", "for", "in", "on", "at", "by", "with", "from",
  "and", "or", "but", "if", "then", "than", "so", "as", "about", "into",
  "up", "out", "over", "under", "again", "have", "has", "had", "having",
  "this", "that", "these", "those", "there", "here", "when", "where",
  "why", "not", "no", "yes", "please", "am", "also", "get", "got", "very",
  "offer", "offers", "offered", "offering", "tell", "show", "give", "like",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem)
    .map(normalize);
}

/** Very light stemming so "refunds"/"refund" and "shipping"/"shipped" match. */
function stem(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Common-sense synonyms so "return policy" matches "refund policy", etc. */
const SYNONYMS: Record<string, string> = {
  return: "refund",
  returns: "refund",
  returning: "refund",
  cost: "price",
  costs: "price",
  pric: "price",
  pricing: "price",
  priced: "price",
};

function normalize(token: string): string {
  return SYNONYMS[token] ?? token;
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

export function demoEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const h = fnv1a(token);
    for (let i = 0; i < 3; i++) {
      const slot = (h + i * 0x9e3779b9) % DIM;
      const sign = (h >>> (i * 5)) & 1 ? 1 : -1;
      vec[slot] += sign;
    }
  }
  return unit(vec);
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  dimension(): number;
}

export class DemoEmbedder implements Embedder {
  async embed(text: string): Promise<number[]> {
    return demoEmbed(text);
  }
  dimension() {
    return DIM;
  }
}

export class OpenAIEmbedder implements Embedder {
  private model = "text-embedding-3-small";

  async embed(text: string): Promise<number[]> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.embeddings.create({ model: this.model, input: text });
    return res.data[0].embedding;
  }

  dimension() {
    return 1536;
  }
}

export function getEmbedder(): Embedder {
  const demoMode = (process.env.DEMO_MODE ?? "true") !== "false";
  const provider = process.env.EMBEDDING_PROVIDER ?? "demo";
  if (!demoMode && provider === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIEmbedder();
  }
  return new DemoEmbedder();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    // Fall back to a best-effort comparison on mismatched dimensions.
    const min = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < min; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

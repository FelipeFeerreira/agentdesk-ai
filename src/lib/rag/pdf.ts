import { PDFParse } from "pdf-parse";

/**
 * Extract text from a PDF buffer using pdf-parse v2.
 * Throws on invalid/empty PDFs so callers can surface a clear ingestion error.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const text = result.text?.trim();
  if (!text) {
    throw new Error("PDF contained no extractable text.");
  }
  return text;
}

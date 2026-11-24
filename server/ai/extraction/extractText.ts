import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

/**
 * Server-side text extraction for group-file analysis.
 *
 * Contract references: `docs/stage6/KAYK_AI_FILE_TECHNICAL_CONTRACT_PROPOSAL.md`
 * sections 6 (size and format), 9 (AI data flow) and 12 (test matrix), and the
 * delta in `docs/stage6/KAYK_AI_PLANS_JOBS_CONTRACT_DELTA.md`.
 *
 * Two rules drive the shape of this module:
 *
 * 1. Extraction never fails the file. A file that cannot be parsed is marked
 *    `unsupported_format` and stays downloadable; the upload is not undone and
 *    the row is not deleted. "We accept every file" and "we can analyse every
 *    file" are separate states, per the contract.
 * 2. Nothing here decides who may read a file. Authorisation is the database's
 *    job (`private.can_access_group_files`); this module is only ever handed
 *    bytes that a caller has already been allowed to read.
 */

/** Formats the analysis pipeline can read today. */
export const EXTRACTABLE_FORMATS = ["pdf", "docx"] as const;
export type ExtractableFormat = (typeof EXTRACTABLE_FORMATS)[number];

/**
 * Files above this size are not extracted.
 *
 * Both parsers need the whole file in memory. A byte ceiling is necessary but
 * not sufficient: PDF content streams are compressed, so memory follows the
 * decompressed page content, not the file size. Measured here, a 97 KB
 * 120-page PDF grew RSS by 52 MB - roughly 0.43 MB per page, 560x its own file
 * size. `EXTRACTION_MAX_PAGES` therefore bounds the same risk from the other
 * side. 20 MiB is a policy choice, not a parser limit, and it is enforced here
 * so the caller sees a predictable state instead of an out-of-memory kill.
 */
export const EXTRACTION_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Page ceiling for PDFs.
 *
 * 300 pages at the measured ~0.43 MB per page is about 130 MB of growth, which
 * fits an Edge Function's memory with headroom. A longer document is refused
 * rather than truncated: half a report analysed silently is worse than a clear
 * "this file is too long to analyse", and the file stays downloadable either
 * way. Overridable per call so the guard itself can be tested on a small file.
 */
export const EXTRACTION_MAX_PAGES = 300;

/**
 * Cap on extracted characters, applied after parsing.
 *
 * 200,000 characters is roughly 50,000 tokens of English prose, which leaves
 * room inside a 128k-token context for the plan, the instructions and the
 * answer. Truncation is reported rather than silent.
 */
export const EXTRACTION_MAX_CHARS = 200_000;

export type ExtractionStatus = "ready" | "unsupported_format" | "failed";

export type UnsupportedReason =
  | "unsupported_mime"
  | "too_large_for_extraction"
  | "pdf_too_many_pages"
  | "pdf_encrypted"
  | "pdf_no_text_layer"
  | "docx_no_text";

export interface ExtractionResult {
  status: ExtractionStatus;
  /** Detected from the bytes, never from the client's declared type. */
  format: ExtractableFormat | null;
  /** Present only when status is "ready". */
  text: string | null;
  charCount: number;
  /** True when the text was cut at EXTRACTION_MAX_CHARS. */
  truncated: boolean;
  /** Machine-readable cause; safe to store in `group_files.analysis_status` notes. */
  reason: UnsupportedReason | "extraction_error" | null;
  /** Milliseconds spent parsing, for the job record. */
  durationMs: number;
}

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Detect the format from the bytes.
 *
 * A DOCX is a ZIP whose archive contains `word/`. ZIP local file headers store
 * names uncompressed, so a byte search is enough to tell it from any other ZIP
 * (an XLSX or PPTX will not match). Anything else is unsupported - including a
 * `.doc` file renamed to `.docx`, which is the case that would otherwise reach
 * the parser and throw.
 */
export function detectFormat(buffer: Buffer): ExtractableFormat | null {
  if (buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC) {
    return "pdf";
  }
  if (startsWithBytes(buffer, ZIP_MAGIC) && buffer.includes("word/")) {
    return "docx";
  }
  return null;
}

/**
 * Light, lossless normalisation: unify line endings, strip trailing spaces, and
 * collapse runs of blank lines. Character offsets are not preserved, so nothing
 * downstream may quote an offset into the original file.
 */
function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finish(
  result: Omit<ExtractionResult, "truncated" | "charCount"> & {
    text: string | null;
  },
  startedAt: number
): ExtractionResult {
  const { text, truncated } = applyCharCap(result.text);
  return {
    ...result,
    text,
    truncated,
    charCount: text === null ? 0 : text.length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Applies EXTRACTION_MAX_CHARS and reports whether anything was cut. Exported
 * so the cap can be tested without building a 200,000-character fixture.
 */
export function applyCharCap(text: string | null): {
  text: string | null;
  truncated: boolean;
} {
  if (text === null || text.length <= EXTRACTION_MAX_CHARS) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, EXTRACTION_MAX_CHARS), truncated: true };
}

/**
 * Extract plain text from a PDF or DOCX buffer.
 *
 * Never throws: every failure becomes a typed result so the caller can record
 * `analysis_status` without a try/catch around a library-specific error shape.
 */
export async function extractText(
  input: Buffer | Uint8Array,
  options: { declaredMime?: string | null; maxPages?: number } = {}
): Promise<ExtractionResult> {
  const startedAt = performance.now();
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const format = detectFormat(buffer);

  if (format === null) {
    return finish(
      {
        status: "unsupported_format",
        format: null,
        text: null,
        reason: "unsupported_mime",
        durationMs: 0,
      },
      startedAt
    );
  }

  if (buffer.byteLength > EXTRACTION_MAX_BYTES) {
    return finish(
      {
        status: "unsupported_format",
        format,
        text: null,
        reason: "too_large_for_extraction",
        durationMs: 0,
      },
      startedAt
    );
  }

  try {
    if (format === "pdf") {
      const document = await getDocumentProxy(new Uint8Array(buffer));
      const maxPages = options.maxPages ?? EXTRACTION_MAX_PAGES;
      if (document.numPages > maxPages) {
        return finish(
          {
            status: "unsupported_format",
            format,
            text: null,
            reason: "pdf_too_many_pages",
            durationMs: 0,
          },
          startedAt
        );
      }
      const { text } = await extractPdfText(document, { mergePages: true });
      const normalised = normalise(
        Array.isArray(text) ? text.join("\n\n") : text
      );
      if (normalised.length === 0) {
        return finish(
          {
            status: "unsupported_format",
            format,
            text: null,
            reason: "pdf_no_text_layer",
            durationMs: 0,
          },
          startedAt
        );
      }
      return finish(
        {
          status: "ready",
          format,
          text: normalised,
          reason: null,
          durationMs: 0,
        },
        startedAt
      );
    }

    const { value } = await mammoth.extractRawText({ buffer });
    const normalised = normalise(value);
    if (normalised.length === 0) {
      return finish(
        {
          status: "unsupported_format",
          format,
          text: null,
          reason: "docx_no_text",
          durationMs: 0,
        },
        startedAt
      );
    }
    return finish(
      {
        status: "ready",
        format,
        text: normalised,
        reason: null,
        durationMs: 0,
      },
      startedAt
    );
  } catch (error) {
    // A password-protected PDF is not a corrupt file; it is a file whose text we
    // are not allowed to read. Both end up unsupported, but the reason differs
    // because the user-facing message differs.
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    const encrypted = /password/i.test(message);
    return finish(
      {
        status: "unsupported_format",
        format,
        text: null,
        reason:
          format === "pdf" && encrypted ? "pdf_encrypted" : "extraction_error",
        durationMs: 0,
      },
      startedAt
    );
  }
}

/**
 * Maps an extraction result onto the `group_files.analysis_status` values the
 * P1 migration already defines. Kept next to the extractor so the two cannot
 * drift: `ready` stays `ready`, everything else is `unsupported_format` rather
 * than `failed`, because the file itself is fine.
 */
export function toAnalysisStatus(
  result: ExtractionResult
): "ready" | "unsupported_format" | "failed" {
  if (result.status === "ready") return "ready";
  if (result.reason === "extraction_error") return "failed";
  return "unsupported_format";
}

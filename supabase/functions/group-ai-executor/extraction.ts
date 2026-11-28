/**
 * Reading a group file's text, for the AI chat executor.
 *
 * Split out of `index.ts` for the same reason the file signer is split: the logic
 * is runtime-neutral (Web Crypto, `fetch`, `TextEncoder` — all present in Deno and
 * in Node 20+), so it can be imported and executed by the repository's vitest
 * suite instead of only being read as text by a static contract test. `index.ts`
 * stays the Deno-only entry point.
 *
 * Two mirrors are deliberate and pinned by
 * `server/stage6AiChatExecutorFileExtraction.test.ts`:
 *
 * 1. `server/ai/extraction/extractText.ts` — the upload pipeline's rules. Same
 *    ceilings, same reasons, so the two readers never disagree about whether a
 *    document is readable.
 * 2. `shared/aiChatContext.ts` — Adam's chat budget of 2026-11-25: at most two
 *    files, and their text together at most 10,000 characters.
 *
 * Nothing here decides who may read a file. Authorisation is the database's job
 * (`private.can_access_group_files`); this module is only ever handed bytes that a
 * caller has already been allowed to read, plus the key it needs to fetch them.
 */

import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

/**
 * Ceiling on how much file text one prompt may carry, in characters.
 * Mirrors `AI_CHAT_LIMITS.fileChars`.
 */
export const FILE_CHAR_BUDGET = 10000;

/**
 * Byte and page ceilings, mirrored from `server/ai/extraction/extractText.ts`.
 *
 * Both parsers need the whole file in memory, and file size alone does not predict
 * memory: a 97 KB 120-page PDF grew Node's RSS by about 52 MB there, roughly 0.43 MB
 * per page. So the risk is bounded from two sides, and a document past either
 * ceiling is refused rather than half-read — half a report analysed silently is
 * worse than a clear refusal, and the file stays downloadable either way.
 */
export const EXTRACTION_MAX_BYTES = 20 * 1024 * 1024;
export const EXTRACTION_MAX_PAGES = 300;

/** Lifetime of a presigned storage URL. It is used immediately, once. */
export const SIGNED_URL_TTL_SECONDS = 60;

/** One selected file, as the queue describes it. */
export type ClaimedFile = {
  id: string;
  name: string;
  /**
   * Storage key, when the queue carries one. Rows queued before the deploy-5
   * proposal (`docs/stage6/KAYK_AI_CHAT_MIGRATION_PROPOSAL_DEPLOY5.sql`) hold
   * `{id, name}` only and are resolved through the signer instead.
   */
  objectKey?: string | null;
};

/**
 * Object-storage credentials, read from the function's environment.
 *
 * Two ways to name the host, and only one of them is required:
 *
 * - `endpoint` — `R2_ENDPOINT`, the variable the already-deployed
 *   `group-file-signer` uses on Launch (`https://<account>.r2.cloudflarestorage.com`).
 *   Reusing that name means the executor needs **no new secret**: Supabase Edge
 *   Function secrets are shared by the project's functions, so the credentials
 *   created for uploads and downloads are the same ones a worker presigning a
 *   GET needs.
 * - `accountId` — `R2_ACCOUNT_ID`, from which the same host is derived. Kept
 *   because it is the shorter description of the same fact.
 *
 * The host is what SigV4 signs, so both routes must agree exactly. Taking the
 * host from the endpoint rather than re-typing it is what keeps them agreeing.
 */
export type StorageConfig = {
  endpoint?: string | null;
  accountId?: string | null;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Cloudflare R2 accepts "auto" for every account. */
  region: string;
};

/** The part of the executor environment that file reading needs. */
export type FileSourceEnv = {
  serviceKey: string;
  fileSignerUrl: string | null;
  storage: StorageConfig | null;
};

/* ------------------------------------------------------------ byte sources */

/**
 * The bytes of one file, from whichever source is configured.
 *
 * `public.group_files` is revoked from `service_role` (P1, deliberately), so the
 * worker cannot look a storage key up by itself. Two ways out, tried in order, and
 * both optional:
 *
 * 1. `FILE_SIGNER_URL` — the signing endpoint: POST `/download-url` with a file
 *    id, then fetch the returned URL. Read from the deployed source rather than
 *    assumed: `group-file-signer` is live on Launch (version 7, ACTIVE) and its
 *    `index.ts` states "No service-role key is used anywhere. Every database
 *    call carries the caller's own JWT", while its two routes call
 *    `group_file_upload_target` and `request_group_file_download`, both of which
 *    need `auth.uid()`. So this route answers 401 to a worker holding only the
 *    service-role key; the attempt costs one request and stays ready for the
 *    branch that adds a service-role route.
 * 2. `R2_*` credentials — presign a short-lived GET here. Needs the object key,
 *    which the claim payload does not carry until the deploy-5 proposal is
 *    applied. The host comes from `R2_ENDPOINT` when it is set (it is, on
 *    Launch, for the signer) and from `R2_ACCOUNT_ID` otherwise.
 *
 * What is deliberately absent: deriving `groups/<group>/<file>` from the ids. The
 * key is a fact about a stored object; the server already puts
 * `can_access_group_files` in front of every path that hands one out, and
 * re-deriving it here would step around that audit trail and break the day the
 * naming changes.
 *
 * Returns null rather than throwing: an unreachable file is a missing attachment,
 * not a failed answer.
 */
export async function fileBytes(
  file: ClaimedFile,
  env: FileSourceEnv
): Promise<ArrayBuffer | null> {
  if (env.fileSignerUrl) {
    const signed = await bytesFromSigner(file.id, env);
    if (signed !== null) return signed;
  }
  if (env.storage && file.objectKey) {
    try {
      const url = await presignedGetUrl(file.objectKey, env.storage);
      const object = await fetch(url);
      if (object.ok) return await object.arrayBuffer();
      // Status only. The signed URL is a temporary credential, so it never goes
      // into a log line.
      console.warn(`storage_fetch_failed: ${object.status}`);
    } catch (error) {
      console.warn(`storage_fetch_error: ${(error as Error).name}`);
    }
  }
  return null;
}

async function bytesFromSigner(
  fileId: string,
  env: FileSourceEnv
): Promise<ArrayBuffer | null> {
  try {
    const signer = await fetch(`${env.fileSignerUrl}/download-url`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!signer.ok) {
      console.warn(`signer_failed: ${signer.status}`);
      return null;
    }
    const { url } = (await signer.json()) as { url?: string };
    if (!url) return null;
    const object = await fetch(url);
    if (!object.ok) return null;
    return await object.arrayBuffer();
  } catch (error) {
    console.warn(`signer_error: ${(error as Error).name}`);
    return null;
  }
}

/* ---------------------------------------------------------------- presigning */

/** Percent-encode the way SigV4 requires: unreserved is `A-Za-z0-9-._~` only. */
export function uriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else if (ch === "/" && !encodeSlash) out += ch;
    else {
      for (const byte of new TextEncoder().encode(ch)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return toHex(new Uint8Array(digest));
}

async function hmacSha256(
  key: Uint8Array | string,
  message: string
): Promise<Uint8Array> {
  const source = typeof key === "string" ? new TextEncoder().encode(key) : key;
  // Copied into a fresh, non-shared buffer: WebCrypto wants an ArrayBuffer-backed
  // view, and an arbitrary Uint8Array may not be one.
  const raw = new Uint8Array(source.byteLength);
  raw.set(source);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message)
  );
  return new Uint8Array(signature);
}

/**
 * Presigned GET for one object, AWS Signature Version 4 with the credentials in
 * the query string — the same scheme `@aws-sdk/s3-request-presigner` produces,
 * written out by hand because this function's whole dependency list is two
 * parsers and a Supabase client, and a presign is four HMAC calls.
 *
 * `server/stage6AiChatExecutorFileExtraction.test.ts` compares its output against
 * the official SDK for the same inputs, which is the only way a hand-rolled
 * signature earns trust without a live bucket.
 *
 * `now` is injectable so that comparison is deterministic; production callers
 * leave it out. The secret never appears in the result and nothing here logs.
 */
/**
 * The host SigV4 signs, from whichever of the two settings is present.
 *
 * `R2_ENDPOINT` wins because it is the literal value the deployed signer uses,
 * and a trailing newline in a pasted secret is a real, measured failure mode
 * there — so the value is trimmed, then parsed rather than string-matched. A
 * port is kept if someone points at a proxy. Null means "no usable host", which
 * the caller turns into a refusal rather than a bad signature.
 */
export function storageHost(storage: StorageConfig): string | null {
  const endpoint = (storage.endpoint ?? "").trim();
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      // Lowercased on purpose. `host` is the one header SigV4 signs here, and an
      // HTTP client sends it in lower case whatever the URL said, so signing a
      // mixed-case host would describe a request nobody will make.
      return url.hostname ? url.host.toLowerCase() : null;
    } catch {
      return null;
    }
  }
  const account = (storage.accountId ?? "").trim();
  return account ? `${account}.r2.cloudflarestorage.com`.toLowerCase() : null;
}

export async function presignedGetUrl(
  objectKey: string,
  storage: StorageConfig,
  now: Date = new Date()
): Promise<string> {
  const host = storageHost(storage);
  if (!host) {
    // Not a guess and not a silent fallback: an unusable host would produce a
    // signature over the wrong `host` header and a confusing 403 from R2.
    throw new Error("storage_unconfigured");
  }
  const canonicalUri =
    "/" +
    uriEncode(storage.bucket, true) +
    "/" +
    objectKey
      .split("/")
      .map(segment => uriEncode(segment, true))
      .join("/");
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = stamp.slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${storage.region}/s3/aws4_request`;
  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${storage.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(SIGNED_URL_TTL_SECONDS)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  query.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = query
    .map(
      ([name, value]) => `${uriEncode(name, true)}=${uriEncode(value, true)}`
    )
    .join("&");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const secret = new TextEncoder().encode("AWS4" + storage.secretAccessKey);
  const kDate = await hmacSha256(secret, dateStamp);
  const kRegion = await hmacSha256(kDate, storage.region);
  const kService = await hmacSha256(kRegion, "s3");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/* --------------------------------------------------------------- extraction */

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** A DOCX's ZIP local headers name `word/`; an XLSX or PPTX does not. */
const DOCX_MARKER = "word/";
const DOCX_MARKER_WINDOW = 65536;

export type FileFormat = "pdf" | "docx" | "text";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT = 65535;

/**
 * One entry from a ZIP archive, as UTF-8 text, or null when the archive does not
 * contain it.
 *
 * A DOCX is a ZIP, and the only part the chat needs is `word/document.xml`.
 * Reading it here instead of taking a ZIP or Word dependency is the same trade the
 * presigner makes — the format is fixed and small — except that here the
 * dependency has no choice in the matter: `mammoth` 1.13, which the Node-side
 * upload pipeline uses, cannot run in this runtime at all. Its `lib/promises.js`
 * decides whether it is in Node with `{}.toString.call(process)`, which Deno's
 * compatibility layer answers as `[object process]`, so it loads the Node-only
 * path and dies on "ExternalPromise.resolve is not a function". Measured on Deno
 * 2.9.8 against `server/fixtures/ai/notes.docx` on 2026-11-25. The browser build
 * dodges that branch but is not the file the `npm:` specifier serves.
 *
 * Only what is needed is parsed: the central directory for sizes (a local header
 * can legitimately report zero when a data descriptor is used), then the one entry.
 */
async function readZipEntry(
  bytes: Uint8Array,
  name: string
): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const earliest = Math.max(0, bytes.byteLength - MAX_ZIP_COMMENT - 22);
  for (let index = bytes.byteLength - 22; index >= earliest; index -= 1) {
    if (index >= 0 && view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  for (let entry = 0; entry < entries; entry += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) return null;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const entryName = latin1(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    );
    if (entryName === name) {
      if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) return null;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      const raw =
        method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
      return raw === null ? null : new TextDecoder("utf-8").decode(raw);
    }
    cursor +=
      46 + nameLength + view.getUint16(cursor + 30, true) + commentLength;
  }
  return null;
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/** Raw DEFLATE, the method a DOCX stores its parts with. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new DecompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    void writer.write(copy).catch(() => undefined);
    void writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Text nodes of a WordprocessingML document, one line per paragraph.
 *
 * Not a Word renderer: no styles, no numbering, no tables laid out. The AI is
 * being handed prose to read, and `server/ai/extraction/extractText.ts` via
 * mammoth produces the same sequence of characters for the fixtures — the Node
 * test compares the two, so this cannot quietly start dropping text.
 * Field codes and tracked-change deletions are dropped, because neither is
 * something the student wrote as content.
 */
export function ooxmlText(xml: string): string {
  return (
    xml
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "")
      .replace(/<w:del\b[\s\S]*?<\/w:del>/g, "")
      .replace(/<w:tab(?:\s[^>]*)?\/>/g, "\t")
      .replace(/<w:br(?:\s[^>]*)?\/>/g, "\n")
      // A blank line between paragraphs, which is what mammoth's raw-text writer
      // produces; matching it keeps the two readers' output character-for-character
      // equal, so a document does not read differently depending on which path ran.
      .replace(/<\/w:p\s*>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, digits: string) =>
        String.fromCodePoint(Number.parseInt(digits, 16))
      )
      .replace(/&#(\d+);/g, (_, digits: string) =>
        String.fromCodePoint(Number.parseInt(digits, 10))
      )
      .replace(/&amp;/g, "&")
  );
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const xml = await readZipEntry(bytes, "word/document.xml");
  return xml === null ? "" : ooxmlText(xml);
}

/**
 * Format from the bytes, never from a declared MIME type.
 *
 * This is the check that was missing when Adam's PDF came back as
 * 「部分選取檔案沒有可讀文字」: the previous version asked storage what the file
 * *was called* (`application/pdf`) and dropped anything that was not `text/*`,
 * which rejects the two formats the upload pipeline was built to read.
 */
export function detectFormat(bytes: Uint8Array): FileFormat | null {
  if (bytes.length >= PDF_MAGIC.length) {
    const head = String.fromCharCode(...bytes.subarray(0, PDF_MAGIC.length));
    if (head === PDF_MAGIC) return "pdf";
  }
  if (ZIP_MAGIC.every((byte, index) => bytes[index] === byte)) {
    // ZIP local file headers store entry names uncompressed, so a byte search
    // tells a DOCX from every other ZIP.
    return containsAscii(bytes, DOCX_MARKER, DOCX_MARKER_WINDOW)
      ? "docx"
      : null;
  }
  return decodeStrictUtf8(bytes) !== null ? "text" : null;
}

function containsAscii(
  bytes: Uint8Array,
  needle: string,
  window: number
): boolean {
  const target = new TextEncoder().encode(needle);
  const limit = Math.min(bytes.length - target.length, window);
  for (let start = 0; start <= limit; start += 1) {
    let matched = true;
    for (let offset = 0; offset < target.length; offset += 1) {
      if (bytes[start + offset] !== target[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** UTF-8 text, or null for bytes that are not text at all. */
export function decodeStrictUtf8(bytes: Uint8Array): string | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    for (const ch of decoded.slice(0, 4096)) {
      const code = ch.codePointAt(0) ?? 0;
      // Tab, newline and carriage return are the only control characters prose
      // uses. Anything else means a binary file that fooled the magic checks.
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/** Same lossless normalisation as `server/ai/extraction/extractText.ts`. */
export function normalise(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cut text down to the characters still available in the budget.
 *
 * Counts code points, matching `char_length()` in the database rather than
 * JavaScript's UTF-16 length, so the worker's arithmetic cannot quietly exceed the
 * budget the RPC enforces on text the students actually write.
 */
export function clipToBudget(
  text: string,
  budget: number
): { text: string; chars: number } {
  const chars = Array.from(text);
  if (budget <= 0) return { text: "", chars: 0 };
  if (chars.length <= budget) return { text, chars: chars.length };
  return { text: chars.slice(0, budget).join(""), chars: budget };
}

/**
 * Read a file's text, or null with a logged reason.
 *
 * Never throws: one broken, encrypted, scanned or oversized attachment must not
 * cost the group its answer. Only a short reason token and the file name are
 * logged — never the file's contents, which belong to the students.
 *
 * `limits` exists so the ceilings can be proven on small fixtures, the same way
 * `extractText.ts` exposes `maxPages`.
 */
export async function extractFileText(
  buffer: ArrayBuffer,
  name: string,
  limits: { maxBytes?: number; maxPages?: number } = {}
): Promise<string | null> {
  // Copied, not viewed. pdf.js takes ownership of the buffer it is handed and
  // detaches it, and a caller that logs or re-checks its own bytes afterwards
  // would then see a zero-length buffer. Observed in Deno 2.9 on 2026-11-25:
  // `new Uint8Array(buffer)` after `extractFileText` throws
  // "Cannot perform Construct on a detached ArrayBuffer".
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(new Uint8Array(buffer));
  const format = detectFormat(bytes);
  if (format === null) {
    console.warn(`extract_unsupported: ${name}`);
    return null;
  }
  if (bytes.byteLength > (limits.maxBytes ?? EXTRACTION_MAX_BYTES)) {
    console.warn(`extract_too_large: ${name}`);
    return null;
  }
  try {
    if (format === "text") {
      const decoded = decodeStrictUtf8(bytes);
      return decoded === null ? null : normalise(decoded) || null;
    }
    if (format === "pdf") {
      const document = await getDocumentProxy(bytes);
      if (document.numPages > (limits.maxPages ?? EXTRACTION_MAX_PAGES)) {
        console.warn(`extract_too_many_pages: ${name}`);
        return null;
      }
      const { text } = await extractPdfText(document, { mergePages: true });
      const body = normalise(Array.isArray(text) ? text.join("\n\n") : text);
      if (body.length === 0) {
        // A scan has no text layer. Without OCR that is genuinely unreadable, and
        // saying so is the whole point of the notice.
        console.warn(`extract_pdf_no_text_layer: ${name}`);
        return null;
      }
      return body;
    }
    const body = normalise(await docxText(bytes));
    if (body.length === 0) {
      console.warn(`extract_docx_no_text: ${name}`);
      return null;
    }
    return body;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A password-protected PDF is not a corrupt file; it is one we are not allowed
    // to read. Separate reason, because the advice that follows it is separate.
    console.warn(
      /password/i.test(message)
        ? `extract_pdf_encrypted: ${name}`
        : `extract_error: ${name}`
    );
    return null;
  }
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CHAT_LIMITS } from "../shared/aiChatContext";
import {
  EXTRACTION_MAX_BYTES as NODE_MAX_BYTES,
  EXTRACTION_MAX_CHARS as NODE_MAX_CHARS,
  EXTRACTION_MAX_PAGES as NODE_MAX_PAGES,
  extractText as nodeExtractText,
} from "./ai/extraction/extractText";
import {
  EXTRACTION_MAX_BYTES,
  EXTRACTION_MAX_PAGES,
  FILE_CHAR_BUDGET,
  type StorageConfig,
  clipToBudget,
  decodeStrictUtf8,
  detectFormat,
  extractFileText,
  fileBytes,
  ooxmlText,
  presignedGetUrl,
  uriEncode,
} from "../supabase/functions/group-ai-executor/extraction.ts";

/**
 * The executor reads files. This suite runs that code, not a copy of it.
 *
 * `extraction.ts` lives under `supabase/functions/` and runs in Deno, but it only
 * uses Web APIs, so vitest executes the same module Node does not have to imitate.
 * Adam's ruling of 2026-11-25 (option 「a」: parse PDF and DOCX inside the Edge
 * Function, and deliver the byte source too) is what this pins down, because the
 * version that shipped before it asked storage what a file was *called* and threw
 * away anything that was not `text/*` — which is why a real, perfectly readable
 * assignment PDF came back as 「部分選取檔案沒有可讀文字」.
 *
 * `server/stage6AiChatExecutorContract.test.ts` keeps the static guard over
 * `index.ts`; this file is the behaviour.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): ArrayBuffer => {
  const buffer = readFileSync(path.resolve(here, "fixtures/ai", name));
  const out = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(out).set(buffer);
  return out;
};
const bytesOf = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer);

const STORAGE: StorageConfig = {
  accountId: "ACCOUNTID",
  bucket: "citylink-group-files",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret-value-must-never-appear",
  region: "auto",
};
const OBJECT_KEY =
  "groups/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("executor file formats, from the bytes", () => {
  it("recognises the two document formats and plain text", () => {
    expect(detectFormat(bytesOf(fixture("notes.pdf")))).toBe("pdf");
    expect(detectFormat(bytesOf(fixture("notes.docx")))).toBe("docx");
    expect(detectFormat(new TextEncoder().encode("Deadline is Friday."))).toBe(
      "text"
    );
  });

  it("refuses a ZIP that is not a DOCX, and bytes that are not text", () => {
    // An XLSX or PPTX is a ZIP without `word/`, and a PNG is neither. Both used to
    // be rejected by a MIME regex; now the bytes decide, and they still say no.
    const xlsxShaped = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectFormat(xlsxShaped)).toBeNull();
    const pngShaped = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectFormat(pngShaped)).toBeNull();
    expect(decodeStrictUtf8(pngShaped)).toBeNull();
  });
});

describe("executor extraction", () => {
  it("reads the PDF fixture and agrees with the upload pipeline's reader", async () => {
    const buffer = fixture("notes.pdf");
    const text = await extractFileText(buffer, "notes.pdf");
    expect(text).not.toBeNull();
    expect(text).toContain("CS2103 Group Project Brief");
    // Two readers on the same file must not disagree about how much is in it.
    const node = await nodeExtractText(Buffer.from(buffer));
    expect(node.status).toBe("ready");
    expect(Array.from(text ?? "").length).toBe(node.charCount);
  });

  it("reads the DOCX fixture without mammoth, and gets the same text", async () => {
    // mammoth 1.13 cannot run under Deno at all (its Node detection matches Deno's
    // `process`), so the executor unpacks the ZIP and reads WordprocessingML
    // itself. Same bytes, same characters is the claim being tested.
    const buffer = fixture("notes.docx");
    expect(detectFormat(bytesOf(buffer))).toBe("docx");
    const text = await extractFileText(buffer, "notes.docx");
    const node = await nodeExtractText(Buffer.from(buffer));
    expect(node.status).toBe("ready");
    expect(text).toBe(node.text);
    expect(text).toContain("Attendees");
  });

  it("does not care what the storage layer called the file", async () => {
    // The bug, isolated: a PDF served with a non-text content-type. The old gate
    // returned null here; format now comes from the bytes.
    const pdf = bytesOf(fixture("notes.pdf")).buffer as ArrayBuffer;
    const signed = `https://bucket.example.test/${OBJECT_KEY}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/download-url")) {
          return Response.json({ url: signed });
        }
        return new Response(pdf, {
          headers: { "content-type": "application/octet-stream" },
        });
      }) as unknown as typeof fetch
    );
    const buffer = await fileBytes(
      { id: "22222222-2222-4222-8222-222222222222", name: "Assignment 2.pdf" },
      {
        serviceKey: "service-role-key",
        fileSignerUrl: "https://signer.example.test",
        storage: null,
      }
    );
    expect(buffer).not.toBeNull();
    const text = await extractFileText(buffer!, "Assignment 2.pdf");
    expect(text).toContain("CS2103 Group Project Brief");
  });

  it("keeps a readable text file readable", async () => {
    const text = await extractFileText(
      new TextEncoder().encode("Deadline is Friday.\r\nEach member writes.\r\n")
        .buffer as ArrayBuffer,
      "plan.md"
    );
    expect(text).toBe("Deadline is Friday.\nEach member writes.");
  });

  it("refuses an oversized or over-long document instead of half reading it", async () => {
    expect(EXTRACTION_MAX_BYTES).toBe(NODE_MAX_BYTES);
    expect(EXTRACTION_MAX_PAGES).toBe(NODE_MAX_PAGES);
    const buffer = fixture("notes.pdf");
    expect(
      await extractFileText(buffer, "notes.pdf", { maxBytes: 100 })
    ).toBeNull();
    expect(
      await extractFileText(buffer, "notes.pdf", { maxPages: 0 })
    ).toBeNull();
    expect(
      await extractFileText(buffer, "notes.pdf", {
        maxBytes: EXTRACTION_MAX_BYTES,
        maxPages: EXTRACTION_MAX_PAGES,
      })
    ).not.toBeNull();
  });

  it("never loses the caller's bytes to a detached buffer", async () => {
    // pdf.js takes ownership of what it is handed; extraction copies first, so the
    // caller can still look at its own file afterwards.
    const buffer = fixture("notes.pdf");
    await extractFileText(buffer, "notes.pdf");
    expect(() => new Uint8Array(buffer)).not.toThrow();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it("turns an unreadable document into null rather than an exception", async () => {
    const notAFile = new TextEncoder().encode("%PDF-1.7\nnot a pdf at all");
    const buffer = notAFile.buffer.slice(0, notAFile.byteLength) as ArrayBuffer;
    expect(detectFormat(bytesOf(buffer))).toBe("pdf");
    expect(await extractFileText(buffer, "broken.pdf")).toBeNull();
  });
});

describe("executor file budget", () => {
  it("matches the chat contract and the upload pipeline", () => {
    expect(FILE_CHAR_BUDGET).toBe(AI_CHAT_LIMITS.fileChars);
    expect(FILE_CHAR_BUDGET).toBe(10_000);
    // The executor trims to the chat budget, which is far tighter than the
    // extraction ceiling the upload pipeline uses for analysis documents.
    expect(FILE_CHAR_BUDGET).toBeLessThan(NODE_MAX_CHARS);
  });

  it("counts characters, not UTF-16 units", () => {
    const cjk = "字".repeat(FILE_CHAR_BUDGET + 500);
    const clipped = clipToBudget(cjk, FILE_CHAR_BUDGET);
    expect(clipped.chars).toBe(FILE_CHAR_BUDGET);
    expect(Array.from(clipped.text).length).toBe(FILE_CHAR_BUDGET);
    const emoji = "😀".repeat(4);
    expect(clipToBudget(emoji, 2).chars).toBe(2);
    expect(clipToBudget(emoji, 0)).toEqual({ text: "", chars: 0 });
    expect(clipToBudget(emoji, -5).chars).toBe(0);
  });
});

describe("executor byte sources", () => {
  it("gives up quietly when neither source is configured", async () => {
    // The behaviour that keeps a misconfigured deployment answering questions
    // without attachments instead of failing them.
    const buffer = await fileBytes(
      { id: "f1", name: "notes.pdf" },
      {
        serviceKey: "service-role-key",
        fileSignerUrl: null,
        storage: null,
      }
    );
    expect(buffer).toBeNull();
  });

  it("treats a signer failure as no text, not as an error", async () => {
    // Today PR #66's endpoint has no service-role route, so this is the live path:
    // 401 from the signer, and with no R2 credentials the file yields nothing.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("{}", { status: 401 })
      ) as unknown as typeof fetch
    );
    const buffer = await fileBytes(
      { id: "f1", name: "notes.pdf" },
      {
        serviceKey: "service-role-key",
        fileSignerUrl: "https://signer.example.test",
        storage: null,
      }
    );
    expect(buffer).toBeNull();
  });

  it("fetches through a presigned R2 URL when the claim carries the key", async () => {
    const pdf = bytesOf(fixture("notes.pdf")).buffer as ArrayBuffer;
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requested.push(url);
        return new Response(pdf, {
          headers: { "content-type": "application/pdf" },
        });
      }) as unknown as typeof fetch
    );
    const buffer = await fileBytes(
      { id: "f1", name: "notes.pdf", objectKey: OBJECT_KEY },
      {
        serviceKey: "service-role-key",
        fileSignerUrl: null,
        storage: STORAGE,
      }
    );
    expect(buffer).not.toBeNull();
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(
      "ACCOUNTID.r2.cloudflarestorage.com/citylink-group-files/"
    );
    // The secret is an HMAC key, never a query parameter.
    expect(requested[0]).not.toContain(STORAGE.secretAccessKey);
  });
});

describe("executor presigning", () => {
  it("agrees with the AWS SDK about what is being signed", async () => {
    // Cross-checked against `@aws-sdk/s3-request-presigner` for the same object,
    // credentials and signing date. The SDK cannot be compared signature-for-
    // signature: it puts three extra parameters into its canonical request
    // (`X-Amz-Content-Sha256`, `x-amz-checksum-mode`, `x-id=GetObject`), so its
    // signature is legitimately different while covering a different URL. What
    // must agree is everything the signature is *about* — endpoint, path,
    // scope, timestamp, expiry — and it does, byte for byte.
    //
    // Which also means the honest limit of this test: the hand-rolled signature
    // has not been accepted by a live bucket. The signer route is therefore the
    // primary source and this one the fallback, and one read against R2 is owed
    // before anyone relies on it.
    const now = new Date("2026-11-25T14:00:00.000Z");
    const ours = new URL(await presignedGetUrl(OBJECT_KEY, STORAGE, now));
    const client = new S3Client({
      region: STORAGE.region,
      credentials: {
        accessKeyId: STORAGE.accessKeyId,
        secretAccessKey: STORAGE.secretAccessKey,
      },
      // The same shape the file signer builds for R2: an account endpoint and
      // path-style addressing, so the bucket is part of the path, not the host.
      endpoint: `https://${STORAGE.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
    });
    const theirs = new URL(
      await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: STORAGE.bucket, Key: OBJECT_KEY }),
        { expiresIn: 60, signingDate: now }
      )
    );
    expect(ours.host.toLowerCase()).toBe(theirs.host.toLowerCase());
    expect(ours.pathname).toBe(theirs.pathname);
    for (const name of [
      "X-Amz-Algorithm",
      "X-Amz-Credential",
      "X-Amz-Date",
      "X-Amz-Expires",
      "X-Amz-SignedHeaders",
    ]) {
      expect(ours.searchParams.get(name), name).toBe(
        theirs.searchParams.get(name)
      );
    }
    expect(ours.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs with node:crypto too, so the WebCrypto chain is not one-sided", async () => {
    // A second implementation of the same algorithm, written straight from the
    // specification with Node's crypto instead of SubtleCrypto. If the async
    // WebCrypto key-derivation chain had an ordering or encoding slip, the two
    // signatures would part ways.
    const { createHmac, createHash } = await import("node:crypto");
    const now = new Date("2026-11-25T14:00:00.000Z");
    const amzDate = "20261125T140000Z";
    const dateStamp = "20261125";
    const scope = `${dateStamp}/${STORAGE.region}/s3/aws4_request`;
    const canonicalUri =
      "/citylink-group-files/" +
      OBJECT_KEY.split("/")
        .map(s => uriEncode(s, true))
        .join("/");
    const query = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", `${STORAGE.accessKeyId}/${scope}`],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", "60"],
      ["X-Amz-SignedHeaders", "host"],
    ]
      .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
      .sort()
      .join("&");
    const canonical = [
      "GET",
      canonicalUri,
      query,
      `host:${STORAGE.accountId}.r2.cloudflarestorage.com\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonical).digest("hex"),
    ].join("\n");
    const hmac = (key: Buffer | string, data: string): Buffer =>
      createHmac("sha256", key).update(data).digest();
    const signing = hmac(
      hmac(
        hmac(hmac(`AWS4${STORAGE.secretAccessKey}`, dateStamp), STORAGE.region),
        "s3"
      ),
      "aws4_request"
    );
    const expected = hmac(signing, stringToSign).toString("hex");
    const ours = await presignedGetUrl(OBJECT_KEY, STORAGE, now);
    expect(new URL(ours).searchParams.get("X-Amz-Signature")).toBe(expected);
  });

  it("changes the signature when the object or the expiry changes", async () => {
    const now = new Date("2026-11-25T14:00:00.000Z");
    const base = await presignedGetUrl(OBJECT_KEY, STORAGE, now);
    const other = await presignedGetUrl(
      "groups/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333",
      STORAGE,
      now
    );
    const signature = (url: string): string =>
      new URL(url).searchParams.get("X-Amz-Signature") ?? "";
    expect(signature(base)).not.toBe(signature(other));
    expect(base).not.toContain(STORAGE.secretAccessKey);
    expect(signature(base)).toHaveLength(64);
  });

  it("keeps the parameters R2 needs to authorise a read", async () => {
    const url = new URL(
      await presignedGetUrl(
        OBJECT_KEY,
        STORAGE,
        new Date("2026-11-25T14:00:00.000Z")
      )
    );
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIDEXAMPLE/20261125/auto/s3/aws4_request"
    );
    expect(url.pathname).toBe(
      `/citylink-group-files/groups/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222`
    );
  });

  it("percent-encodes the way SigV4 requires", () => {
    expect(uriEncode("a b~c_d-e.f", true)).toBe("a%20b~c_d-e.f");
    expect(uriEncode("groups/x/y", false)).toBe("groups/x/y");
    expect(uriEncode("groups/x/y", true)).toBe("groups%2Fx%2Fy");
    expect(uriEncode("文件 v1", true)).toBe("%E6%96%87%E4%BB%B6%20v1");
  });
});

describe("executor WordprocessingML reader", () => {
  it("keeps paragraphs apart and drops markup, entities and field codes", () => {
    const xml =
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Ada &amp; Bo</w:t></w:r>' +
      "<w:r><w:tab/><w:t>3 &#x4E2D; files &lt;ready&gt;</w:t></w:r></w:p>" +
      '<w:p><w:r><w:instrText>HYPERLINK "x"</w:instrText><w:t>kept</w:t></w:r></w:p>' +
      "</w:body></w:document>";
    expect(ooxmlText(xml)).toBe("Ada & Bo\t3 中 files <ready>\n\nkept\n\n");
  });
});

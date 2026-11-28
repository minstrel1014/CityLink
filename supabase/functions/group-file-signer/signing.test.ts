import { describe, expect, it } from "vitest";
import {
  GROUP_FILE_CONTENT_TYPE,
  contentDispositionFor,
  createR2Client,
  presignDownload,
  presignUpload,
  type R2Config,
} from "./signing";

// Fixed, fake credentials: these tests assert the shape of a signed URL, not
// that the signature is accepted. Acceptance is proven separately by the
// round-trip against the real bucket.
const config: R2Config = {
  endpoint: "https://accountid.r2.cloudflarestorage.com",
  bucket: "citylink-group-files",
  accessKeyId: "AKIAEXAMPLEEXAMPLE",
  secretAccessKey: "secret-example-value",
};
const client = createR2Client(config);
const objectKey =
  "groups/31e77eb7-fdd5-46b4-8593-98ce4c180305/0e968640-1a4f-473f-9056-ba7617f400c4";

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("presignUpload", () => {
  it("puts the content type inside the signature", async () => {
    const url = await presignUpload({
      client,
      bucket: config.bucket,
      objectKey,
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn: 900,
    });
    const params = query(url);
    expect(params.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(params.get("X-Amz-Expires")).toBe("900");
  });

  it("produces a different signature for a different content type", async () => {
    const asText = await presignUpload({
      client,
      bucket: config.bucket,
      objectKey,
      contentType: "text/plain",
      expiresIn: 900,
    });
    const asBinary = await presignUpload({
      client,
      bucket: config.bucket,
      objectKey,
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn: 900,
    });
    expect(query(asText).get("X-Amz-Signature")).not.toBe(
      query(asBinary).get("X-Amz-Signature")
    );
  });
});

describe("presignDownload", () => {
  it("forces attachment and the inert content type into the signature", async () => {
    const url = await presignDownload({
      client,
      bucket: config.bucket,
      objectKey,
      fileName: "qa-p1-small.txt",
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn: 300,
    });
    const params = query(url);
    expect(params.get("response-content-type")).toBe("application/octet-stream");
    expect(params.get("response-content-disposition")).toBe(
      'attachment; filename="qa-p1-small.txt"; filename*=UTF-8\'\'qa-p1-small.txt'
    );
  });
});

describe("contentDispositionFor", () => {
  it("cannot be broken out of with quotes, newlines or backslashes", () => {
    const header = contentDispositionFor('a"b\nc\\d.txt');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/"/g)).toHaveLength(2);
    expect(header).toContain('attachment; filename="a_bc_d.txt"');
  });

  it("keeps a non-ASCII name readable via RFC 5987", () => {
    expect(contentDispositionFor("報告.pdf")).toContain(
      "filename*=UTF-8''%E5%A0%B1%E5%91%8A.pdf"
    );
  });

  it("falls back to a name when the client sends only whitespace", () => {
    expect(contentDispositionFor("   ")).toContain('filename="file"');
  });
});

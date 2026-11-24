import { describe, expect, it } from "vitest";
import { createR2Client, contentDispositionFor, presignDownload, presignUpload } from "./signing";
import type { GroupFileSignerConfig } from "./env";

const config: GroupFileSignerConfig = {
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "publishable",
  r2Endpoint: "https://accountid.r2.cloudflarestorage.com",
  r2Bucket: "citylink-group-files",
  r2AccessKeyId: "AKIAEXAMPLEEXAMPLE",
  r2SecretAccessKey: "secret-example-value",
  uploadTtlSeconds: 900,
  downloadTtlSeconds: 300,
};

const client = createR2Client(config);
const objectKey = "groups/31e77eb7-fdd5-46b4-8593-98ce4c180305/69035965-e145-4310-b7dd-224cfdadbbda";

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("presignUpload", () => {
  it("signs a PUT with the content type inside the signature", async () => {
    const url = await presignUpload({
      client,
      bucket: config.r2Bucket,
      objectKey,
      contentType: "text/plain",
      expiresIn: config.uploadTtlSeconds,
    });
    const params = query(url);

    expect(new URL(url).pathname).toContain(objectKey);
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Expires")).toBe("900");
    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    // The header must be covered by the signature, not merely suggested.
    expect(params.get("X-Amz-SignedHeaders") ?? "").toContain("content-type");
  });

  it("produces a different signature when the content type changes", async () => {
    const base = {
      client,
      bucket: config.r2Bucket,
      objectKey,
      expiresIn: 900,
    };
    const text = await presignUpload({ ...base, contentType: "text/plain" });
    const html = await presignUpload({ ...base, contentType: "text/html" });

    expect(query(text).get("X-Amz-Signature")).not.toBe(
      query(html).get("X-Amz-Signature")
    );
  });
});

describe("presignDownload", () => {
  it("forces attachment disposition and a fixed content type", async () => {
    const url = await presignDownload({
      client,
      bucket: config.r2Bucket,
      objectKey,
      fileName: "qa-p1-small.txt",
      contentType: "text/plain",
      expiresIn: config.downloadTtlSeconds,
    });
    const params = query(url);

    expect(params.get("X-Amz-Expires")).toBe("300");
    expect(params.get("response-content-disposition")).toBe(
      'attachment; filename="qa-p1-small.txt"'
    );
    expect(params.get("response-content-type")).toBe("text/plain");
  });
});

describe("contentDispositionFor", () => {
  it("cannot be broken out of with quotes, newlines or backslashes", () => {
    expect(contentDispositionFor('a"b\nc\\d.txt')).toBe(
      'attachment; filename="a_b_c_d.txt"'
    );
  });
});

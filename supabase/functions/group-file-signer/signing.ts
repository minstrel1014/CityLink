/**
 * R2 presigning for the Edge Function.
 *
 * Bare imports on purpose: `deno.json` maps them to `npm:` specifiers for the
 * Deno runtime, and Node resolves the same names from `node_modules`. That is
 * what lets this file be tested and round-tripped against the real bucket
 * before it is ever deployed — the alternative (npm: specifiers inline) would
 * make it importable only inside Deno, where nothing can be verified.
 *
 * The two shapes differ deliberately:
 *   upload   — a PUT with `Content-Type` inside the signature, so the stored
 *              object cannot be given a type the signer did not approve.
 *   download — a GET with `response-content-type` and a disposition forced into
 *              the signature, because a presigned URL cannot carry arbitrary
 *              response headers and an uploaded file must never render inline.
 */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** The only content type this module will sign. */
export const GROUP_FILE_CONTENT_TYPE = "application/octet-stream";

export type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * A `Content-Disposition` that cannot be broken out of and keeps a non-ASCII
 * name readable. `original_name` is client-supplied: the database only trims it
 * and caps the length, so a quote or CR/LF in it would otherwise be header
 * injection.
 */
export function contentDispositionFor(fileName: string): string {
  const cleaned = fileName.replace(/[\r\n]+/g, "").trim() || "file";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function presignUpload(args: {
  client: S3Client;
  bucket: string;
  objectKey: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  return await getSignedUrl(
    args.client,
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.objectKey,
      ContentType: args.contentType,
    }),
    {
      expiresIn: args.expiresIn,
      // Without `signableHeaders` the presigner signs only `host` and the type
      // above becomes advisory. This exact omission was a real bug once.
      signableHeaders: new Set(["content-type"]),
    }
  );
}

export async function presignDownload(args: {
  client: S3Client;
  bucket: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  return await getSignedUrl(
    args.client,
    new GetObjectCommand({
      Bucket: args.bucket,
      Key: args.objectKey,
      ResponseContentDisposition: contentDispositionFor(args.fileName),
      ResponseContentType: args.contentType,
    }),
    { expiresIn: args.expiresIn }
  );
}

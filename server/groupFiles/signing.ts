/**
 * R2 presigning. Two shapes only, and the differences between them are the point.
 *
 * Upload signs a `PUT` with `Content-Type` inside the signature. Without that,
 * a caller could declare `text/plain`, get a URL, and upload an executable; with
 * it, R2 rejects any PUT whose header differs from what was signed.
 *
 * Download signs a `GET` with `response-content-disposition: attachment` and a
 * fixed content type. A presigned URL cannot carry arbitrary response headers,
 * so those must ride in the signature instead — otherwise a browser could be
 * persuaded to render an uploaded file inline.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { GroupFileSignerConfig } from "./env";

export function createR2Client(config: GroupFileSignerConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.r2Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

/** Escapes a filename for use inside a quoted `filename=` parameter. */
export function contentDispositionFor(fileName: string): string {
  const safe = fileName.replace(/[\r\n"\\]/g, "_");
  return `attachment; filename="${safe}"`;
}

export async function presignUpload(args: {
  client: S3Client;
  bucket: string;
  objectKey: string;
  contentType: string;
  expiresIn: number;
}): Promise<string> {
  return getSignedUrl(
    args.client,
    new PutObjectCommand({
      Bucket: args.bucket,
      Key: args.objectKey,
      ContentType: args.contentType,
    }),
    // Without `signableHeaders`, the presigner signs only `host` and the
    // Content-Type above becomes a suggestion: the URL would accept any type.
    // Verified by test — the first version of this module had exactly that bug.
    {
      expiresIn: args.expiresIn,
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
  return getSignedUrl(
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

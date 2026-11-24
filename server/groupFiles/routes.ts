/**
 * Two endpoints, both POST, both taking only a `file_id`.
 *
 * Nothing here logs a URL, a token, or an object key. A presigned URL is a
 * bearer credential with a lifetime; putting one in an access log is the same
 * mistake as putting a session cookie there.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  GroupFileSignerConfigError,
  readGroupFileSignerConfig,
} from "./env";
import { createR2Client, presignDownload, presignUpload } from "./signing";
import {
  GroupFileRequestError,
  createUserClient,
  requireUserId,
  resolveDownloadTarget,
  resolveUploadTarget,
} from "./service";

const Body = z.object({ file_id: z.string().uuid() });

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function fail(res: Response, error: unknown) {
  if (error instanceof GroupFileSignerConfigError) {
    // Misconfiguration is ours, not the caller's. Say what is missing, never what it holds.
    res.status(503).json({ error: "group_files_unavailable" });
    return;
  }
  if (error instanceof GroupFileRequestError) {
    res.status(error.status).json({ error: error.token });
    return;
  }
  res.status(500).json({ error: "group_files_unavailable" });
}

export function registerGroupFileRoutes(app: Express): void {
  app.post("/api/group-files/upload-url", async (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "group_files_invalid_request" });
      return;
    }
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: "group_files_unauthenticated" });
      return;
    }

    try {
      const config = readGroupFileSignerConfig();
      await requireUserId(config, token);
      const client = createUserClient(config, token);
      const target = await resolveUploadTarget(client, parsed.data.file_id);
      const contentType = target.detectedMime ?? "application/octet-stream";

      const url = await presignUpload({
        client: createR2Client(config),
        bucket: config.r2Bucket,
        objectKey: target.objectKey,
        contentType,
        expiresIn: config.uploadTtlSeconds,
      });

      res.set("Cache-Control", "no-store").json({
        url,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expires_in: config.uploadTtlSeconds,
        object_key: target.objectKey,
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/group-files/download-url", async (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "group_files_invalid_request" });
      return;
    }
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: "group_files_unauthenticated" });
      return;
    }

    try {
      const config = readGroupFileSignerConfig();
      await requireUserId(config, token);
      const client = createUserClient(config, token);
      const target = await resolveDownloadTarget(client, parsed.data.file_id);

      const url = await presignDownload({
        client: createR2Client(config),
        bucket: config.r2Bucket,
        objectKey: target.objectKey,
        fileName: target.originalName,
        contentType: target.detectedMime ?? "application/octet-stream",
        expiresIn: config.downloadTtlSeconds,
      });

      res.set("Cache-Control", "no-store").json({
        url,
        expires_in: config.downloadTtlSeconds,
      });
    } catch (error) {
      fail(res, error);
    }
  });
}

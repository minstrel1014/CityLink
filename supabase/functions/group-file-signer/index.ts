/**
 * Supabase Edge Function: signs R2 URLs for group files.
 *
 * Deno runtime. Request logic is in `handler.ts`, presigning in `signing.ts`;
 * this file supplies only what needs a runtime: environment variables, a
 * PostgREST client that speaks as the calling user, and the R2 client.
 *
 * `deno.json` maps the bare package names to `npm:` specifiers. That keeps
 * `signing.ts` importable from the Node test suite, which is why the presigning
 * could be round-tripped against the real bucket before any deploy.
 *
 * No service-role key is used anywhere. Every database call carries the
 * caller's own JWT, so `auth.uid()` is the real user and P1's predicates decide.
 */
import { createClient } from "@supabase/supabase-js";
import type { S3Client } from "@aws-sdk/client-s3";
import { handleRequest, type SignerDeps } from "./handler.ts";
import {
  GROUP_FILE_CONTENT_TYPE,
  createR2Client,
  presignDownload,
  presignUpload,
} from "./signing.ts";

/**
 * Configuration is read lazily, on first use, not at module load.
 *
 * A missing secret must not take down the whole function: the CORS preflight
 * has to keep working so the browser gets a real error instead of a network
 * failure, and an operator needs a readable signal. So a missing variable
 * raises `GroupFileConfigError`, which the handler reports as
 * `group_files_misconfigured` — the variable name never leaves the server.
 */
class GroupFileConfigError extends Error {
  override name = "GroupFileConfigError";
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new GroupFileConfigError(`missing configuration: ${name}`);
  }
  return value;
}

type Resources = { r2: S3Client; bucket: string; url: string; anonKey: string };
let cached: Resources | null = null;

function resources(): Resources {
  if (cached) return cached;
  const bucket = env("R2_BUCKET");
  cached = {
    r2: createR2Client({
      endpoint: env("R2_ENDPOINT"),
      bucket,
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    }),
    bucket,
    // Injected into every Edge Function by the platform, not secrets to set.
    url: env("SUPABASE_URL"),
    anonKey: env("SUPABASE_ANON_KEY"),
  };
  return cached;
}

const deps: SignerDeps = {
  config: () => ({
    siteOrigin: Deno.env.get("SITE_ORIGIN") ?? "*",
    uploadTtlSeconds: Number(Deno.env.get("UPLOAD_TTL_SECONDS") ?? 900),
    downloadTtlSeconds: Number(Deno.env.get("DOWNLOAD_TTL_SECONDS") ?? 300),
  }),
  async callRpc(token, fn, args) {
    // A client per call, scoped to the caller's token: no session is persisted
    // and no shared identity can leak between requests.
    const { url, anonKey } = resources();
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc(fn, args);
    return { data, error };
  },
  async presignUpload({ objectKey, expiresIn }) {
    const { r2, bucket } = resources();
    return await presignUpload({
      client: r2,
      bucket,
      objectKey,
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn,
    });
  },
  async presignDownload({ objectKey, fileName, expiresIn }) {
    const { r2, bucket } = resources();
    return await presignDownload({
      client: r2,
      bucket,
      objectKey,
      fileName,
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn,
    });
  },
};

Deno.serve((req) => handleRequest(req, deps));

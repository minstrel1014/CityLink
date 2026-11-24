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
import { handleRequest, type SignerDeps } from "./handler.ts";
import {
  GROUP_FILE_CONTENT_TYPE,
  createR2Client,
  presignDownload,
  presignUpload,
} from "./signing.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    // Name only — never the value, never a guess at one.
    throw new Error(`missing configuration: ${name}`);
  }
  return value;
}

const r2 = createR2Client({
  endpoint: env("R2_ENDPOINT"),
  bucket: env("R2_BUCKET"),
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
});

// SUPABASE_URL and SUPABASE_ANON_KEY are injected into every Edge Function by
// the platform, so they are not secrets Adam has to set.
const supabaseUrl = env("SUPABASE_URL");
const supabaseAnonKey = env("SUPABASE_ANON_KEY");
const bucket = env("R2_BUCKET");

const deps: SignerDeps = {
  config: () => ({
    siteOrigin: Deno.env.get("SITE_ORIGIN") ?? "*",
    uploadTtlSeconds: Number(Deno.env.get("UPLOAD_TTL_SECONDS") ?? 900),
    downloadTtlSeconds: Number(Deno.env.get("DOWNLOAD_TTL_SECONDS") ?? 300),
  }),
  async callRpc(token, fn, args) {
    // A client per call, scoped to the caller's token: no session is persisted
    // and no shared identity can leak between requests.
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc(fn, args);
    return { data, error };
  },
  async presignUpload({ objectKey, expiresIn }) {
    return await presignUpload({
      client: r2,
      bucket,
      objectKey,
      contentType: GROUP_FILE_CONTENT_TYPE,
      expiresIn,
    });
  },
  async presignDownload({ objectKey, fileName, expiresIn }) {
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

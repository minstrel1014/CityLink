/**
 * Configuration for the group-file signing endpoints.
 *
 * Read at use time, like the rest of `server/_core`, so a value can change
 * without a module reload. Values are never logged, never echoed into an error
 * message, and never returned to a caller — only the *names* of missing
 * variables are reported, because a message that lists names is diagnosable
 * while a message that lists values is a leak.
 */

export type GroupFileSignerConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  r2Endpoint: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
};

export class GroupFileSignerConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Group-file signing is not configured. Missing: ${missing.join(", ")}.`
    );
    this.name = "GroupFileSignerConfigError";
  }
}

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/** 900 s is the adapter design's figure: enough for 100 MB on a slow link. */
const DEFAULT_UPLOAD_TTL = 900;
/** 300 s is Adam's decided download TTL. Do not raise it here. */
const DEFAULT_DOWNLOAD_TTL = 300;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readGroupFileSignerConfig(): GroupFileSignerConfig {
  const missing = REQUIRED.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) throw new GroupFileSignerConfigError([...missing]);

  return {
    supabaseUrl: process.env.SUPABASE_URL!.trim(),
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY!.trim(),
    r2Endpoint: process.env.R2_ENDPOINT!.trim(),
    r2Bucket: process.env.R2_BUCKET!.trim(),
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    uploadTtlSeconds: positiveInt(
      process.env.R2_UPLOAD_TTL_SECONDS,
      DEFAULT_UPLOAD_TTL
    ),
    downloadTtlSeconds: positiveInt(
      process.env.R2_DOWNLOAD_TTL_SECONDS,
      DEFAULT_DOWNLOAD_TTL
    ),
  };
}

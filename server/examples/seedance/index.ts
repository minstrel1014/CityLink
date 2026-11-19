import { config, higgsfield } from "@higgsfield/client/v2";
import { config as loadEnvironment } from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODEL = "bytedance/seedance-2.5/text-to-video";
const INPUT = {
  prompt: "A cinematic scene at sunset",
  duration: 5,
  resolution: "720p",
  aspect_ratio: "16:9",
} as const;

type RequestResult = {
  status: string;
  request_id?: string;
  status_url?: string;
  video?: { url?: string };
};

type PollOptions = {
  fetchStatus?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maximumWaitMs?: number;
};

export class ExampleError extends Error {}

// Never display API response bodies or SDK errors: they could contain sensitive data.
export function completedVideoUrl(result: RequestResult): string | undefined {
  switch (result.status) {
    case "queued":
    case "in_progress":
      return undefined;
    case "failed":
      throw new ExampleError("Higgsfield reported that the request failed.");
    case "canceled":
      throw new ExampleError(
        "Higgsfield reported that the request was canceled."
      );
    case "nsfw":
    case "moderated":
      throw new ExampleError(
        "Higgsfield blocked the request during moderation."
      );
    case "completed": {
      try {
        const url = new URL(result.video?.url ?? "");
        if (url.protocol === "https:" && !url.username && !url.password) {
          return url.href;
        }
      } catch {
        // A completed response without a valid URL is not a successful example.
      }
      throw new ExampleError(
        "The completed request did not contain a valid HTTPS video URL."
      );
    }
    default:
      throw new ExampleError(
        "Higgsfield returned an unrecognized request status."
      );
  }
}

function checkedStatusUrl(value: string | undefined): string {
  try {
    const url = new URL(value ?? "");
    if (
      url.protocol === "https:" &&
      url.hostname === "api.higgsfield.ai" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/requests\/[A-Za-z0-9-]+\/status$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    ) {
      return url.href;
    }
  } catch {
    // The generic message below deliberately excludes the supplied URL.
  }
  throw new ExampleError("Higgsfield did not return a trusted status URL.");
}

export async function waitForVideo(
  initial: RequestResult,
  credentials: string,
  options: PollOptions = {}
): Promise<string> {
  const ready = completedVideoUrl(initial);
  if (ready) return ready;

  const statusUrl = checkedStatusUrl(initial.status_url);
  const fetchStatus = options.fetchStatus ?? fetch;
  const sleep =
    options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + (options.maximumWaitMs ?? 15 * 60 * 1000);
  let delay = 2000;

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetchStatus(statusUrl, {
        headers: { Authorization: `Key ${credentials}` },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      // A status read can be retried; it does not submit another generation.
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
      delay = Math.min(delay * 1.5, 10000);
      continue;
    }

    if (response.status >= 500) {
      await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
      delay = Math.min(delay * 1.5, 10000);
      continue;
    }
    if (!response.ok) {
      throw new ExampleError(
        `Status check failed with HTTP ${response.status}.`
      );
    }

    let result: RequestResult;
    try {
      result = (await response.json()) as RequestResult;
      if (!result || typeof result.status !== "string") throw new Error();
    } catch {
      throw new ExampleError("Higgsfield returned an invalid status response.");
    }
    const videoUrl = completedVideoUrl(result);
    if (videoUrl) return videoUrl;
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    delay = Math.min(delay * 1.5, 10000);
  }
  throw new ExampleError(
    "Timed out waiting for a terminal status; do not assume the request failed or start another generation without checking it."
  );
}

export async function generateVideo(
  credentials: string,
  idempotencyKey: string,
  pollOptions: PollOptions = {}
): Promise<string> {
  if (!/^[^\s:]+:[^\s:]+$/.test(credentials)) {
    throw new ExampleError(
      "Set HF_CREDENTIALS in .env.local to your key ID and secret in key-id:key-secret format."
    );
  }
  if (!/^[\x21-\x7e]{1,255}$/.test(idempotencyKey)) {
    throw new ExampleError(
      "SEEDANCE_IDEMPOTENCY_KEY must contain 1–255 visible ASCII characters without spaces."
    );
  }

  // Reusing this non-secret key for the same request prevents duplicate charges
  // if an ambiguous network error requires a deliberate retry.
  config({
    credentials,
    maxRetries: 0,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  console.error(`Generation idempotency key: ${idempotencyKey}`);
  const receipt = await higgsfield.subscribe(MODEL, {
    input: INPUT,
    // SDK 0.2.6's poller does not stop for the documented canceled status.
    withPolling: false,
  });
  if (
    typeof receipt.request_id === "string" &&
    /^[A-Za-z0-9-]{1,128}$/.test(receipt.request_id)
  ) {
    console.error(`Higgsfield request ID: ${receipt.request_id}`);
  }
  return waitForVideo(receipt, credentials, pollOptions);
}

async function main(): Promise<void> {
  loadEnvironment({ path: ".env.local", quiet: true });
  try {
    const videoUrl = await generateVideo(
      process.env.HF_CREDENTIALS ?? "",
      process.env.SEEDANCE_IDEMPOTENCY_KEY ?? randomUUID()
    );
    console.log(videoUrl);
  } catch (error) {
    console.error(
      error instanceof ExampleError
        ? error.message
        : "Higgsfield request could not be completed. Check credentials, account access, network, and the saved idempotency key before retrying."
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main();
}

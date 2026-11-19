import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  config: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@higgsfield/client/v2", () => ({
  config: sdk.config,
  higgsfield: { subscribe: sdk.subscribe },
}));

import { completedVideoUrl, generateVideo, waitForVideo } from "./index";

const statusUrl = "https://api.higgsfield.ai/requests/abc-123/status";
const credentials = "test-id:test-secret";
const sleep = async () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Seedance server example", () => {
  it("submits the requested model and waits for a completed video", async () => {
    sdk.subscribe.mockResolvedValue({
      status: "queued",
      request_id: "abc-123",
      status_url: statusUrl,
    });
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "in_progress" }))
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            video: { url: "https://cdn.example/video.mp4" },
          })
        )
      );

    await expect(
      generateVideo(credentials, "unique-test", { fetchStatus, sleep })
    ).resolves.toBe("https://cdn.example/video.mp4");
    expect(sdk.config).toHaveBeenCalledWith({
      credentials,
      maxRetries: 0,
      headers: { "Idempotency-Key": "unique-test" },
    });
    expect(sdk.subscribe).toHaveBeenCalledWith(
      "bytedance/seedance-2.5/text-to-video",
      {
        input: {
          prompt: "A cinematic scene at sunset",
          duration: 5,
          resolution: "720p",
          aspect_ratio: "16:9",
        },
        withPolling: false,
      }
    );
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(fetchStatus.mock.calls[0][0]).toBe(statusUrl);
    expect(fetchStatus.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { Authorization: `Key ${credentials}` },
    });
  });

  it.each([
    ["failed", "failed"],
    ["canceled", "canceled"],
    ["nsfw", "moderation"],
    ["moderated", "moderation"],
  ])(
    "rejects the terminal status %s without reporting success",
    async (status, message) => {
      const fetchStatus = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ status })));
      await expect(
        waitForVideo({ status: "queued", status_url: statusUrl }, credentials, {
          fetchStatus,
          sleep,
        })
      ).rejects.toThrow(message);
    }
  );

  it("rejects completed responses without a safe video URL", () => {
    expect(() => completedVideoUrl({ status: "completed" })).toThrow(
      "valid HTTPS video URL"
    );
    expect(() =>
      completedVideoUrl({
        status: "completed",
        video: { url: "http://cdn.example/video.mp4" },
      })
    ).toThrow("valid HTTPS video URL");
  });

  it("does not send credentials to an untrusted status URL", async () => {
    const fetchStatus = vi.fn();
    await expect(
      waitForVideo(
        {
          status: "queued",
          status_url: "https://attacker.example/requests/abc/status",
        },
        credentials,
        { fetchStatus, sleep }
      )
    ).rejects.toThrow("trusted status URL");
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing credential before submitting a billable request", async () => {
    await expect(generateVideo("", "unique-test")).rejects.toThrow(
      "Set HF_CREDENTIALS"
    );
    expect(sdk.subscribe).not.toHaveBeenCalled();
  });

  it("reports a timeout instead of claiming success", async () => {
    await expect(
      waitForVideo({ status: "queued", status_url: statusUrl }, credentials, {
        maximumWaitMs: 0,
      })
    ).rejects.toThrow("Timed out");
  });
});

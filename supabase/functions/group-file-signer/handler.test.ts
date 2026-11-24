import { describe, expect, it, vi } from "vitest";
import {
  GROUP_FILE_CONTENT_TYPE,
  handleRequest,
  statusForToken,
  type SignerDeps,
} from "./handler";

const config = {
  siteOrigin: "https://citylink-vm2mka3y.manus.space",
  uploadTtlSeconds: 900,
  downloadTtlSeconds: 300,
};

const fileId = "0e968640-1a4f-473f-9056-ba7617f400c4";
const objectKey = `groups/31e77eb7-fdd5-46b4-8593-98ce4c180305/${fileId}`;

function deps(overrides: Partial<SignerDeps> = {}): SignerDeps {
  return {
    config: () => config,
    callRpc: async () => ({
      data: [{ object_key: objectKey, original_name: "報告.pdf" }],
    }),
    presignUpload: async () => "https://r2.example/upload",
    presignDownload: async () => "https://r2.example/download",
    ...overrides,
  };
}

function post(path: string, body: unknown, token: string | null = "jwt") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(
    `https://fn.example/functions/v1/group-file-signer/${path}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );
}

describe("handleRequest — routing and CORS", () => {
  it("answers the preflight with the exact site origin", async () => {
    const res = await handleRequest(
      new Request(
        "https://fn.example/functions/v1/group-file-signer/upload-url",
        {
          method: "OPTIONS",
        }
      ),
      deps()
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      config.siteOrigin
    );
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("refuses anything that is not a POST", async () => {
    const res = await handleRequest(
      new Request(
        "https://fn.example/functions/v1/group-file-signer/upload-url"
      ),
      deps()
    );
    expect(res.status).toBe(405);
  });

  it("does not treat an unknown route as either endpoint", async () => {
    const res = await handleRequest(
      post("delete-url", { file_id: fileId }),
      deps()
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("handleRequest — input", () => {
  it("refuses a call with no bearer token", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }, null),
      deps()
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "group_files_unauthenticated" });
  });

  it("refuses a body that is not JSON", async () => {
    const req = new Request(
      "https://fn.example/functions/v1/group-file-signer/upload-url",
      {
        method: "POST",
        headers: {
          authorization: "Bearer jwt",
          "content-type": "application/json",
        },
        body: "not json",
      }
    );
    const res = await handleRequest(req, deps());
    expect(res.status).toBe(400);
  });

  it("refuses a file_id that is not a uuid", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: "../../etc" }),
      deps()
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "group_files_invalid_request" });
  });
});

describe("handleRequest — upload", () => {
  it("returns a PUT against the inert content type", async () => {
    const presignUpload = vi.fn(async () => "https://r2.example/upload");
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({ presignUpload })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://r2.example/upload",
      method: "PUT",
      headers: { "Content-Type": GROUP_FILE_CONTENT_TYPE },
      expires_in: 900,
    });
    // The signed type is never taken from the request body.
    expect(presignUpload).toHaveBeenCalledWith({
      objectKey,
      contentType: "application/octet-stream",
      expiresIn: 900,
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("maps a deliberate token to its status", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({
        callRpc: async () => ({
          error: { message: "group_files_no_permission" },
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "group_files_no_permission" });
  });

  it("never echoes an unrecognised database message", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({
        callRpc: async () => ({
          error: {
            message: 'relation "group_files" does not exist near "select"',
          },
        }),
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "group_files_unavailable" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });

  it("treats an empty RPC result as not found", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({ callRpc: async () => ({ data: [] }) })
    );
    expect(res.status).toBe(404);
  });

  it("says nothing specific when presigning itself fails", async () => {
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({
        presignUpload: async () => {
          throw new Error("SignatureDoesNotMatch: credential scope");
        },
      })
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "group_files_unavailable" });
  });
});

describe("handleRequest — misconfiguration", () => {
  it("names a missing secret as misconfigured, not as a generic failure", async () => {
    const error = new Error("missing configuration: R2_BUCKET");
    error.name = "GroupFileConfigError";
    const res = await handleRequest(
      post("upload-url", { file_id: fileId }),
      deps({
        callRpc: async () => {
          throw error;
        },
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "group_files_misconfigured" });
    // The variable name must not reach the caller.
    expect(JSON.stringify(body)).not.toContain("R2_BUCKET");
  });
});

describe("handleRequest — download", () => {
  it("returns a GET carrying the original filename", async () => {
    const presignDownload = vi.fn(async () => "https://r2.example/download");
    const res = await handleRequest(
      post("download-url", { file_id: fileId }),
      deps({ presignDownload })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://r2.example/download",
      method: "GET",
      expires_in: 300,
    });
    expect(presignDownload).toHaveBeenCalledWith({
      objectKey,
      fileName: "報告.pdf",
      contentType: "application/octet-stream",
      expiresIn: 300,
    });
  });

  it("maps an expired row to 410, not to a generic error", async () => {
    const res = await handleRequest(
      post("download-url", { file_id: fileId }),
      deps({
        callRpc: async () => ({ error: { message: "group_files_expired" } }),
      })
    );
    expect(res.status).toBe(410);
  });
});

describe("statusForToken", () => {
  it("maps every token the SQL raises on purpose", () => {
    const expected: Record<string, number> = {
      group_files_unauthenticated: 401,
      group_files_no_permission: 403,
      group_files_not_uploader: 403,
      group_files_not_found: 404,
      group_files_not_pending: 404,
      group_files_not_current: 404,
      group_files_expired: 410,
      group_files_retention_window_closed: 410,
      group_files_name_required: 400,
      group_files_upload_too_large: 413,
      group_files_size_mismatch: 409,
      group_files_storage_limit_reached: 409,
      group_files_group_limit_reached: 409,
      group_files_too_many_pending: 429,
      group_files_term_missing: 409,
      group_files_term_code_unrecognised: 409,
    };
    for (const [token, status] of Object.entries(expected)) {
      expect([token, statusForToken(token)]).toEqual([token, status]);
    }
  });
  it("treats an unmapped group_files_ token as the caller's problem, not a 500", () => {
    // The regression that shipped in v1: a deleted file answered 500.
    expect(statusForToken("group_files_some_future_reason")).toBe(400);
  });
  it("hides anything that is not one of our tokens", () => {
    expect(statusForToken("some internal error")).toBe(500);
    expect(statusForToken("permission denied for table group_files")).toBe(500);
    expect(statusForToken(undefined)).toBe(500);
  });
});

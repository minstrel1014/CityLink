import { describe, expect, it } from "vitest";
import { mapGroupFiles } from "@/lib/supabaseStage6";

const row = {
  id: "file-1",
  original_name: "notes.pdf",
  declared_mime: "application/pdf",
  detected_mime: "application/pdf",
  byte_size: 97_000,
  uploaded_by: "user-1",
  analysis_status: "current",
  retention_expires_at: "2027-04-30T00:00:00.000Z",
  created_at: "2026-11-24T10:00:00.000Z",
};

describe("list_group_files mapping (isolated; no database connection)", () => {
  it("maps the live RPC's nine columns and prefers the detected MIME type", () => {
    expect(mapGroupFiles([row])).toEqual([
      {
        id: "file-1",
        name: "notes.pdf",
        mimeType: "application/pdf",
        byteSize: 97_000,
        createdAt: "2026-11-24T10:00:00.000Z",
        retentionExpiresAt: "2027-04-30T00:00:00.000Z",
      },
    ]);
  });

  it("falls back to the declared MIME type when detection found nothing", () => {
    const [file] = mapGroupFiles([
      { ...row, detected_mime: null, declared_mime: "application/msword" },
    ]);
    expect(file.mimeType).toBe("application/msword");
  });

  it("reports a null MIME type rather than an empty string", () => {
    const [file] = mapGroupFiles([
      { ...row, detected_mime: "", declared_mime: "  " },
    ]);
    expect(file.mimeType).toBeNull();
  });

  it("refuses an unknown column instead of quietly accepting it", () => {
    // The read contract is an allowlist: a column the client has not been taught
    // about is a contract change, not a harmless extra field.
    expect(() => mapGroupFiles([{ ...row, object_key: "secret/key" }])).toThrow(
      /unexpected fields/i
    );
  });

  it("refuses a negative or non-numeric byte size", () => {
    expect(() => mapGroupFiles([{ ...row, byte_size: -1 }])).toThrow(
      /invalid byte size/i
    );
    expect(() => mapGroupFiles([{ ...row, byte_size: "97000" }])).toThrow(
      /invalid byte size/i
    );
  });

  it("refuses an unreadable retention date, because an unknown expiry is not permission", () => {
    expect(() =>
      mapGroupFiles([{ ...row, retention_expires_at: "not-a-date" }])
    ).toThrow(/invalid retention date/i);
  });

  it("returns an empty list for an empty response", () => {
    expect(mapGroupFiles([])).toEqual([]);
  });
});

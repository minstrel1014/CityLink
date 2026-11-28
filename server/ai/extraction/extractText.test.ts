import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTRACTION_MAX_BYTES,
  EXTRACTION_MAX_CHARS,
  EXTRACTION_MAX_PAGES,
  applyCharCap,
  detectFormat,
  extractText,
  toAnalysisStatus,
} from "./extractText";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures/ai");
const pdf = () => readFileSync(path.join(FIXTURES, "notes.pdf"));
const docx = () => readFileSync(path.join(FIXTURES, "notes.docx"));

describe("format detection reads the bytes, not the declared type", () => {
  it("recognises the PDF fixture by its magic number", () => {
    expect(detectFormat(pdf())).toBe("pdf");
  });

  it("recognises the DOCX fixture as a zip containing word/", () => {
    expect(detectFormat(docx())).toBe("docx");
  });

  it("refuses a text file even when the caller claims it is a PDF", () => {
    const result = detectFormat(Buffer.from("plain text, not a document"));
    expect(result).toBeNull();
  });

  it("refuses a zip that is not a DOCX", () => {
    const notDocx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("xl/workbook.xml"),
    ]);
    expect(detectFormat(notDocx)).toBeNull();
  });
});

describe("PDF extraction", () => {
  it("recovers text from both pages", async () => {
    const result = await extractText(pdf(), {
      declaredMime: "application/pdf",
    });

    expect(result.status).toBe("ready");
    expect(result.format).toBe("pdf");
    expect(result.reason).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.charCount).toBeGreaterThan(200);
    expect(result.text).toContain("CS2103 Group Project Brief");
    expect(result.text).toContain("Deliverables");
    expect(result.text).toContain("Page two - marking scheme");
    expect(result.text).toContain("Late submission loses ten percent");
  });

  it("normalises line endings and collapses blank-line runs", async () => {
    const result = await extractText(pdf());
    expect(result.text).not.toMatch(/\r/);
    expect(result.text).not.toMatch(/\n{3,}/);
  });

  it("refuses a document longer than the page ceiling instead of truncating it", async () => {
    // The fixture has two pages; a ceiling of one proves the guard without
    // committing a 300-page file. The production ceiling is asserted below.
    const result = await extractText(pdf(), { maxPages: 1 });

    expect(result.status).toBe("unsupported_format");
    expect(result.reason).toBe("pdf_too_many_pages");
    expect(result.text).toBeNull();
    expect(EXTRACTION_MAX_PAGES).toBe(300);
  });
});

describe("DOCX extraction", () => {
  it("recovers headings, paragraphs and table cells", async () => {
    const result = await extractText(docx());

    expect(result.status).toBe("ready");
    expect(result.format).toBe("docx");
    expect(result.text).toContain("CS2103 Meeting Notes");
    expect(result.text).toContain("Ada to draft the consent screen.");
    expect(result.text).toContain("Retention wording");
    expect(result.text).toContain("Chen");
  });
});

describe("files that cannot be analysed stay files", () => {
  it("marks an unsupported type without throwing", async () => {
    const result = await extractText(Buffer.from("hello"), {
      declaredMime: "application/pdf",
    });

    expect(result.status).toBe("unsupported_format");
    expect(result.reason).toBe("unsupported_mime");
    expect(result.text).toBeNull();
    expect(result.charCount).toBe(0);
  });

  it("refuses an oversized file before parsing, and says why", async () => {
    const oversized = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.alloc(EXTRACTION_MAX_BYTES),
    ]);

    const result = await extractText(oversized);

    expect(result.status).toBe("unsupported_format");
    expect(result.reason).toBe("too_large_for_extraction");
    expect(result.format).toBe("pdf");
    expect(result.text).toBeNull();
  });

  it("reports a corrupt PDF as a failure of extraction, not of the file", async () => {
    const corrupt = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.from("this is not a pdf body"),
    ]);

    const result = await extractText(corrupt);

    expect(result.status).toBe("unsupported_format");
    expect(result.reason).toBe("extraction_error");
  });

  it("maps results onto the analysis_status values P1 already defines", async () => {
    const ready = await extractText(pdf());
    expect(toAnalysisStatus(ready)).toBe("ready");

    const unsupported = await extractText(Buffer.from("hello"));
    expect(toAnalysisStatus(unsupported)).toBe("unsupported_format");

    expect(
      toAnalysisStatus({
        status: "unsupported_format",
        format: "pdf",
        text: null,
        charCount: 0,
        truncated: false,
        reason: "extraction_error",
        durationMs: 1,
      })
    ).toBe("failed");
  });
});

describe("character cap", () => {
  it("leaves text at or below the cap untouched", () => {
    const exact = "a".repeat(EXTRACTION_MAX_CHARS);
    expect(applyCharCap(exact)).toEqual({ text: exact, truncated: false });
    expect(applyCharCap(null)).toEqual({ text: null, truncated: false });
  });

  it("cuts one character over the cap and says so", () => {
    const over = "a".repeat(EXTRACTION_MAX_CHARS + 1);
    const capped = applyCharCap(over);
    expect(capped.truncated).toBe(true);
    expect(capped.text).toHaveLength(EXTRACTION_MAX_CHARS);
  });
});

/**
 * Local prototype for the extraction module.
 *
 *   corepack pnpm exec tsx server/ai/extraction/prototype.ts
 *
 * Reads the two committed fixtures, extracts text, and prints what came back. It
 * is deliberately a script rather than a test: the point is to see the text, not
 * to assert on it. No network, no database, no key.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  EXTRACTION_MAX_BYTES,
  EXTRACTION_MAX_CHARS,
  extractText,
} from "./extractText";

const FIXTURES = path.resolve(import.meta.dirname, "../../fixtures/ai");
const FILES = ["notes.pdf", "notes.docx"];

function preview(text: string, limit = 700): string {
  const body = text.length > limit ? `${text.slice(0, limit)}\n[...]` : text;
  return body
    .split("\n")
    .map(line => `    ${line}`)
    .join("\n");
}

async function main() {
  console.log(
    `ceiling: ${EXTRACTION_MAX_BYTES} bytes, ${EXTRACTION_MAX_CHARS} characters\n`
  );

  for (const name of FILES) {
    const filePath = path.join(FIXTURES, name);
    const bytes = readFileSync(filePath);
    const result = await extractText(bytes);

    console.log(`== ${name}`);
    console.log(`   bytes on disk: ${statSync(filePath).size}`);
    console.log(`   detected:      ${result.format ?? "unknown"}`);
    console.log(
      `   status:        ${result.status}${result.reason ? ` (${result.reason})` : ""}`
    );
    console.log(
      `   characters:    ${result.charCount} (truncated: ${result.truncated})`
    );
    console.log(`   parse time:    ${result.durationMs} ms`);
    if (result.text) {
      console.log("   text:");
      console.log(preview(result.text));
    }
    console.log();
  }

  const refused = await extractText(Buffer.from("not a document"));
  console.log("== not-a-document.txt");
  console.log(`   status: ${refused.status} (${refused.reason})`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

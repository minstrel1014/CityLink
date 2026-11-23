import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { publicPlatformScript } from "./server/_core/publicConfig";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map(entry => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Static development and static publishing use the same public-value whitelist
// as Express. Runtime-only secrets never enter the browser bundle. Express keeps
// serving this path dynamically when the application server is selected.
function vitePluginPublicPlatformConfig(): Plugin {
  return {
    name: "manus-public-platform-config",
    configureServer(server) {
      server.middlewares.use("/api/platform/config.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(publicPlatformScript());
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "api/platform/config.js",
        source: publicPlatformScript(),
      });
    },
  };
}

const plugins = [
  vitePluginPublicPlatformConfig(),
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusDebugCollector(),
];

// =============================================================================
// F2 cached-client rollout: verifiable build/version marker
//
// The bundle that is running in a browser carries an immutable identifier that
// is baked in at build time, and the same identifier is published next to the
// deployment as /version.json. Group creation compares those two identifiers;
// it never infers freshness from browser cache time, Date.now(), tab age or
// header dates. Nothing in this layer reloads the page, retries a request or
// stores a group-creation draft.
//
// Evidence class: repository-controllable only. A hosting layer in front of
// the built output may still override response headers, so no deployment-level
// cache behaviour is claimed from this file.
// =============================================================================

function resolveAppBuildId(): string {
  const explicit = process.env.CITYLINK_BUILD_ID?.trim();
  if (explicit) return explicit;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    }).trim();
    if (!head) return "";
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      }).trim().length > 0;
    // A dirty worktree is marked as such so a locally built marker can never
    // be mistaken for the identifier of an accepted commit.
    return dirty ? `${head}-dirty` : head;
  } catch {
    // No git metadata and no explicit id: the marker stays empty and the
    // client reports freshness as unverifiable instead of guessing.
    return "";
  }
}

const APP_BUILD_ID =
  process.env.VITE_APP_BUILD_ID?.trim() || resolveAppBuildId();
const APP_VERSION = process.env.VITE_APP_VERSION?.trim() || "";

// Vite only forwards VITE_-prefixed values that exist while this config module
// is evaluated, so the resolved identifiers are published here rather than
// relying on a caller's shell environment.
process.env.VITE_APP_BUILD_ID = APP_BUILD_ID;
process.env.VITE_APP_VERSION = APP_VERSION;

function appBuildMarkerDocument(): string {
  // null, not a placeholder: an unknown identifier must read as unknown.
  return `${JSON.stringify({
    buildId: APP_BUILD_ID || null,
    version: APP_VERSION || null,
  })}\n`;
}

/**
 * Vite's own HTML middleware assigns `Cache-Control: no-cache` after plugin
 * middlewares have run, which silently replaces a header set here. For the SPA
 * document this pins the value to `no-store` so the preview matches the
 * production policy: the document must never be reused from cache, because the
 * version marker beside it is what exposes an older cached bundle. Hashed
 * assets are unaffected. This is a development-server measure only.
 */
function forceNoStoreHeader(res: ServerResponse): void {
  type AnyFn = (...args: unknown[]) => unknown;
  const originalSetHeader = res.setHeader as unknown as AnyFn;
  res.setHeader = ((name: unknown, value: unknown) =>
    String(name).toLowerCase() === "cache-control"
      ? originalSetHeader.call(res, "Cache-Control", "no-store")
      : originalSetHeader.call(
          res,
          name,
          value
        )) as unknown as typeof res.setHeader;

  const originalWriteHead = res.writeHead as unknown as AnyFn;
  res.writeHead = ((...args: unknown[]) => {
    const headers = args.find(
      arg => arg !== null && typeof arg === "object" && !Array.isArray(arg)
    ) as Record<string, unknown> | undefined;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "cache-control") delete headers[key];
      }
      headers["Cache-Control"] = "no-store";
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    return originalWriteHead.apply(res, args);
  }) as unknown as typeof res.writeHead;
}

function vitePluginAppBuildMarker(): Plugin {
  return {
    name: "citylink-app-build-marker",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/version.json") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(appBuildMarkerDocument());
          return;
        }
        if (
          url === "/" ||
          url === "/index.html" ||
          url.endsWith(".html") ||
          // Wouter serves the same SPA document for client-side routes.
          !url.includes(".")
        ) {
          forceNoStoreHeader(res);
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: appBuildMarkerDocument(),
      });
    },
  };
}

export default defineConfig({
  plugins: [...plugins, vitePluginAppBuildMarker()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

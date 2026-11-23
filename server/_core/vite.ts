import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

// =============================================================================
// F2 cached-client rollout: repository-controllable cache policy.
//
// The SPA document and /version.json must not be cached, because the version
// marker is what lets a later bundle tell an older cached bundle apart. Hashed
// build assets may keep a versioned cache: their names change with content, so
// a stale file can never be served in place of a new one.
//
// Evidence class: this only proves the headers this repository asks the
// Node/Express server to emit. Any hosting layer in front of it may add,
// rewrite or drop response headers, and that behaviour is NOT claimed here.
// =============================================================================

const NO_STORE = "no-store";
const HASHED_ASSET_CACHE = "public, max-age=31536000, immutable";

function applyBuiltAssetCacheHeaders(
  res: { setHeader(name: string, value: string): unknown },
  filePath: string,
  distPath: string
): void {
  const relative = path.relative(distPath, filePath).split(path.sep).join("/");
  if (relative === "index.html" || relative === "version.json") {
    res.setHeader("Cache-Control", NO_STORE);
    return;
  }
  // Vite emits /assets/<name>-<content hash>.<ext>; only those are immutable.
  if (
    relative.startsWith("assets/") &&
    /-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(relative)
  ) {
    res.setHeader("Cache-Control", HASHED_ASSET_CACHE);
  }
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res
        .status(200)
        .set({ "Content-Type": "text/html", "Cache-Control": NO_STORE })
        .end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        applyBuiltAssetCacheHeaders(res, filePath, distPath);
      },
    })
  );

  // the app's not-found page keeps a real 404 status for crawlers
  app.get("/404", (_req, res) => {
    res.status(404).sendFile(path.resolve(distPath, "index.html"), {
      headers: { "Cache-Control": NO_STORE },
    });
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"), {
      headers: { "Cache-Control": NO_STORE },
    });
  });
}

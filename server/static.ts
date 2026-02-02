import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  let distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    const candidates = [
      path.resolve(process.cwd(), "dist/public"),
      path.resolve(process.cwd(), "client/dist"),
      path.resolve(__dirname, "../client/dist"),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      distPath = found;
    } else {
      throw new Error(
        `Could not find built client directory. Checked: ${[distPath, ...candidates].join(
          ", "
        )}. Ensure client is built and copied.`
      );
    }
  }

  const assetsPath = path.join(distPath, "assets");
  if (fs.existsSync(assetsPath)) {
    app.use(
      "/assets",
      express.static(assetsPath, {
        maxAge: 31536000000,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

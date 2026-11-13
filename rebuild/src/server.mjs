import { createServer } from "node:http";
import { publicConsultationCatalog } from "./domain/public-catalog.mjs";

/**
 * Safe preview server. No Stripe, Calendly, database, or network provider calls.
 * Fail closed: all booking, checkout and account operations are unavailable.
 */
export function createPreviewServer({ catalog = [] } = {}) {
  return createServer((req, res) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true, mode: "engineering-preview", release: "blocked" }));
    }
    if (req.method === "GET" && path === "/api/consultations") {
      try {
        const publicCatalog = publicConsultationCatalog(catalog);
        res.writeHead(200);
        return res.end(JSON.stringify({ release: "blocked", consultations: publicCatalog }));
      } catch {
        res.writeHead(503);
        return res.end(JSON.stringify({ error: "catalog_not_configured", release: "blocked" }));
      }
    }
    if (path.startsWith("/api/") || path.startsWith("/checkout") || path.startsWith("/book")) {
      res.setHeader("Allow", "GET");
      res.writeHead(503);
      return res.end(JSON.stringify({ error: "feature_not_released" }));
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
  });
}

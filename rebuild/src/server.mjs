import { createServer } from "node:http";
import { publicConsultationCatalog } from "./domain/public-catalog.mjs";
import {renderEngineeringPreview,renderConsultationDetail,engineeringPreviewCss} from "./preview-page.mjs";

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
    // Static, read-only engineering UI. No forms, external assets or scripts.
    // Public release stays blocked by the launcher and deployment policy.
    if(req.method==="GET" && path==="/"){
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");
      res.setHeader("Content-Security-Policy","default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      res.writeHead(200);
      return res.end(renderEngineeringPreview(catalog));
    }
    if(req.method==="GET" && path.startsWith("/consultations/")){
      const key=path.slice("/consultations/".length);
      const html=renderConsultationDetail(catalog,key);
      if(!html){
        res.writeHead(404);
        return res.end(JSON.stringify({error:"not_found"}));
      }
      res.setHeader("Content-Type","text/html; charset=utf-8");
      res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");
      res.setHeader("Content-Security-Policy","default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      res.writeHead(200);
      return res.end(html);
    }
    if(req.method==="GET" && path==="/preview.css"){
      res.setHeader("Content-Type","text/css; charset=utf-8");
      res.writeHead(200);
      return res.end(engineeringPreviewCss);
    }
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

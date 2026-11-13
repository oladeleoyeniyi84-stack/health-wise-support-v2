import { validateConsultationCatalog } from "./domain/consultations.mjs";

/**
 * Fail-closed server-only configuration. Never load provider credentials
 * into public HTML or the public catalog projection.
 */
export function loadConsultationConfig(env = process.env) {
  if (env.HEALTHWISE_RELEASE_MODE !== "engineering-preview") {
    throw new Error("release_mode_not_allowed");
  }
  const raw = env.HEALTHWISE_CONSULTATIONS_JSON;
  if (typeof raw !== "string" || raw.length > 12000) throw new Error("catalog_missing_or_too_large");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("catalog_invalid_json"); }
  return Object.freeze(validateConsultationCatalog(parsed));
}

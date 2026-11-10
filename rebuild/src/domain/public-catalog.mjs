import { validateConsultationCatalog } from "./consultations.mjs";

/** Public projection: payment identifiers never leave the server. */
export function publicConsultationCatalog(configured) {
  return validateConsultationCatalog(configured).map(({ key, title, durationMinutes }) =>
    Object.freeze({ key, title, durationMinutes, status: "unavailable" })
  );
}

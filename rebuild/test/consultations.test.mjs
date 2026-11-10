import test from "node:test";
import assert from "node:assert/strict";
import { validateConsultationCatalog } from "../src/domain/consultations.mjs";
const valid = { key: "quick", title: "Quick consultation", durationMinutes: 15, stripePriceId: "price_Abc123", calendlyEventUrl: "https://calendly.com/weareelevate360/healthwise-support-quick-consultation" };
test("accepts a provider-configured consultation", () => {
  assert.equal(validateConsultationCatalog([valid])[0].key, "quick");
});
test("rejects empty catalog", () => assert.throws(() => validateConsultationCatalog([]), /catalog_required/));
test("rejects duplicate consultation", () => assert.throws(() => validateConsultationCatalog([valid, valid]), /invalid_or_duplicate_key/));
test("rejects unverified Stripe price", () => assert.throws(() => validateConsultationCatalog([{...valid, stripePriceId: ""}]), /invalid_stripe_price/));
test("rejects non-Calendly redirect", () => assert.throws(() => validateConsultationCatalog([{...valid, calendlyEventUrl: "https://evil.example/book"}]), /invalid_calendly_url/));
test("rejects URL query and fragment", () => assert.throws(() => validateConsultationCatalog([{...valid, calendlyEventUrl: valid.calendlyEventUrl + "?token=x"}]), /invalid_calendly_url/));
test("rejects unknown tier", () => assert.throws(() => validateConsultationCatalog([{...valid, key: "unlimited"}]), /invalid_or_duplicate_key/));

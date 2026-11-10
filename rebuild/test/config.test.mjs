import test from "node:test";
import assert from "node:assert/strict";
import { loadConsultationConfig } from "../src/config.mjs";
const catalog = [{ key: "quick", title: "Quick", durationMinutes: 15, stripePriceId: "price_Abc123", calendlyEventUrl: "https://calendly.com/weareelevate360/healthwise-support-quick-consultation" }];
test("rejects absent release mode", () => assert.throws(() => loadConsultationConfig({}), /release_mode_not_allowed/));
test("rejects production release mode", () => assert.throws(() => loadConsultationConfig({ HEALTHWISE_RELEASE_MODE: "production" }), /release_mode_not_allowed/));
test("rejects absent catalog", () => assert.throws(() => loadConsultationConfig({ HEALTHWISE_RELEASE_MODE: "engineering-preview" }), /catalog_missing_or_too_large/));
test("rejects invalid JSON", () => assert.throws(() => loadConsultationConfig({ HEALTHWISE_RELEASE_MODE: "engineering-preview", HEALTHWISE_CONSULTATIONS_JSON: "{" }), /catalog_invalid_json/));
test("accepts validated preview catalog", () => assert.equal(loadConsultationConfig({ HEALTHWISE_RELEASE_MODE: "engineering-preview", HEALTHWISE_CONSULTATIONS_JSON: JSON.stringify(catalog) })[0].key, "quick"));

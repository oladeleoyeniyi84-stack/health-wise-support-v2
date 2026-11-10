import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewServer } from "../src/server.mjs";

const valid = [{ key: "quick", title: "Quick consultation", durationMinutes: 15, stripePriceId: "price_Abc123", calendlyEventUrl: "https://calendly.com/weareelevate360/healthwise-support-quick-consultation" }];
async function request(server, path, method = "GET") {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
test("health advertises blocked release", async () => {
  const r = await request(createPreviewServer(), "/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.release, "blocked");
});
test("unconfigured catalog fails closed", async () => {
  const r = await request(createPreviewServer(), "/api/consultations");
  assert.equal(r.status, 503);
});
test("public catalog omits payment and booking identifiers", async () => {
  const r = await request(createPreviewServer({ catalog: valid }), "/api/consultations");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.consultations[0], { key: "quick", title: "Quick consultation", durationMinutes: 15, status: "unavailable" });
  assert.equal(JSON.stringify(r.body).includes("price_"), false);
  assert.equal(JSON.stringify(r.body).includes("calendly"), false);
});
test("checkout disabled even with catalog configured", async () => {
  const r = await request(createPreviewServer({ catalog: valid }), "/api/checkout", "POST");
  assert.equal(r.status, 503);
});
test("booking disabled", async () => {
  const r = await request(createPreviewServer({ catalog: valid }), "/book/quick");
  assert.equal(r.status, 503);
});
test("unrecognized routes are not exposed", async () => {
  const r = await request(createPreviewServer(), "/admin");
  assert.equal(r.status, 404);
});

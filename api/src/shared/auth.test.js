const test = require("node:test");
const assert = require("node:assert/strict");

const { jsonResponse } = require("./auth");

test("jsonResponse disables caching for API state payloads", () => {
  const response = jsonResponse(200, { ok: true });

  assert.equal(response.headers["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(response.headers.Pragma, "no-cache");
  assert.equal(response.headers.Expires, "0");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("renderer service source defines budget and safety limits", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
  assert.match(source, /RENDERER_MAX_FILE_BYTES/);
  assert.match(source, /50 \* 1024 \* 1024/);
  assert.match(source, /RENDERER_MAX_PAGES/);
  assert.match(source, /120000/);
  assert.match(source, /x-cari-renderer-token/);
  assert.match(source, /\.pdf/);
  assert.match(source, /pdftoppm/);
  assert.match(source, /startPage/);
  assert.match(source, /endPage/);
});

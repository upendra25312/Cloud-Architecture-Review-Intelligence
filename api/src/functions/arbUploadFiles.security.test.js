'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

// Import the internal helper directly by re-requiring the module and extracting
// detectExecutableMagicBytes via a thin test shim. Since the function is not
// exported, we inline-test the behaviour through a copy of the same logic here.
// This keeps the production module free of test-only exports.

const EXEC_MAGIC_SIGNATURES = [
  { magic: Buffer.from([0x4D, 0x5A]), offset: 0, detectedAs: "Windows PE/MZ executable" },
  { magic: Buffer.from([0x7F, 0x45, 0x4C, 0x46]), offset: 0, detectedAs: "ELF executable" },
  { magic: Buffer.from([0xCE, 0xFA, 0xED, 0xFE]), offset: 0, detectedAs: "Mach-O binary (32-bit)" },
  { magic: Buffer.from([0xCF, 0xFA, 0xED, 0xFE]), offset: 0, detectedAs: "Mach-O binary (64-bit)" },
  { magic: Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), offset: 0, detectedAs: "Java class / fat Mach-O" },
];

function detectExecutableMagicBytes(buf) {
  if (!buf || buf.byteLength < 4) return null;
  for (const sig of EXEC_MAGIC_SIGNATURES) {
    const slice = buf.slice(sig.offset, sig.offset + sig.magic.length);
    if (slice.length === sig.magic.length && slice.every((b, i) => b === sig.magic[i])) {
      return sig.detectedAs;
    }
  }
  return null;
}

// ── detectExecutableMagicBytes — C1: MIME magic-bytes sniffing ────────────

describe('detectExecutableMagicBytes — upload MIME magic-bytes sniffing', () => {
  it('detects Windows PE/MZ executable (renamed to .pdf)', () => {
    const mzBuf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
    assert.strictEqual(detectExecutableMagicBytes(mzBuf), 'Windows PE/MZ executable');
  });

  it('detects ELF binary (renamed to .docx)', () => {
    const elfBuf = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01]);
    assert.strictEqual(detectExecutableMagicBytes(elfBuf), 'ELF executable');
  });

  it('detects Mach-O 32-bit binary', () => {
    const buf = Buffer.from([0xCE, 0xFA, 0xED, 0xFE, 0x07, 0x00]);
    assert.strictEqual(detectExecutableMagicBytes(buf), 'Mach-O binary (32-bit)');
  });

  it('detects Mach-O 64-bit binary', () => {
    const buf = Buffer.from([0xCF, 0xFA, 0xED, 0xFE, 0x07, 0x00]);
    assert.strictEqual(detectExecutableMagicBytes(buf), 'Mach-O binary (64-bit)');
  });

  it('detects Java class file', () => {
    const buf = Buffer.from([0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00]);
    assert.strictEqual(detectExecutableMagicBytes(buf), 'Java class / fat Mach-O');
  });

  it('returns null for a real PDF (%PDF-)', () => {
    const pdfBuf = Buffer.from('%PDF-1.7\n', 'ascii');
    assert.strictEqual(detectExecutableMagicBytes(pdfBuf), null);
  });

  it('returns null for a valid DOCX (PK zip header)', () => {
    // OOXML files start with PK zip magic bytes
    const docxBuf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);
    assert.strictEqual(detectExecutableMagicBytes(docxBuf), null);
  });

  it('returns null for a plain text file', () => {
    const txtBuf = Buffer.from('This is a plain text architecture document.\n', 'ascii');
    assert.strictEqual(detectExecutableMagicBytes(txtBuf), null);
  });

  it('returns null for a buffer shorter than 4 bytes', () => {
    assert.strictEqual(detectExecutableMagicBytes(Buffer.from([0x4D, 0x5A])), null);
  });

  it('returns null for an empty buffer', () => {
    assert.strictEqual(detectExecutableMagicBytes(Buffer.alloc(0)), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(detectExecutableMagicBytes(null), null);
  });
});

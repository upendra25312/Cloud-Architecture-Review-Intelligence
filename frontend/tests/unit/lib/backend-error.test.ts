import { describe, it, expect } from "vitest";
import { normalizeBackendThrownMessage } from "@/lib/backend-error";

const LOCAL_HINT = "The backend route did not return a usable response.";

describe("normalizeBackendThrownMessage", () => {
  it("returns fallback hint when message is empty", () => {
    const result = normalizeBackendThrownMessage("", "Something went wrong.");
    expect(result).toContain("Something went wrong.");
    expect(result).toContain(LOCAL_HINT);
  });

  it("returns fallback hint when message is only whitespace", () => {
    const result = normalizeBackendThrownMessage("   ", "Default error.");
    expect(result).toContain("Default error.");
  });

  it("returns fallback hint for 'Internal Server Error' (generic)", () => {
    const result = normalizeBackendThrownMessage("Internal Server Error", "Failed.");
    expect(result).toContain("Failed.");
    expect(result).toContain(LOCAL_HINT);
  });

  it("returns fallback hint for generic messages case-insensitively", () => {
    expect(normalizeBackendThrownMessage("not found", "Fallback.")).toContain(LOCAL_HINT);
    expect(normalizeBackendThrownMessage("Failed to fetch", "Fallback.")).toContain(LOCAL_HINT);
  });

  it("returns the real message when it is specific and useful", () => {
    const specificError = "Review ID 'abc-123' not found in storage.";
    const result = normalizeBackendThrownMessage(specificError, "Default.");
    expect(result).toBe(specificError);
  });

  it("collapses internal whitespace in real messages", () => {
    const result = normalizeBackendThrownMessage("Something   went   wrong here", "Default.");
    expect(result).toBe("Something went wrong here");
  });

  it("returns fallback hint when message looks like an HTML error page", () => {
    const htmlBody = "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>";
    const result = normalizeBackendThrownMessage(htmlBody, "Backend unreachable.");
    expect(result).toContain("Backend unreachable.");
    expect(result).toContain(LOCAL_HINT);
  });

  it("returns fallback hint for <html> fragment without doctype", () => {
    const result = normalizeBackendThrownMessage("<html><body>Error</body></html>", "Fallback.");
    expect(result).toContain(LOCAL_HINT);
  });

  it("returns real message that happens to contain the word 'html' but is not an html doc", () => {
    const msg = "Cannot render HTML content: invalid template";
    const result = normalizeBackendThrownMessage(msg, "Fallback.");
    expect(result).toBe(msg);
  });
});

function looksLikeHtmlDocument(value: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]/i.test(value);
}

function isGenericServerMessage(value: string) {
  return /^(internal server error|not found|failed to fetch)$/i.test(value.trim());
}

function buildLocalBackendHint(fallback: string) {
  return `${fallback} The backend route did not return a usable response. If you are running only the Next.js app locally, start the Functions host or use the deployed environment.`;
}

export async function readBackendErrorMessage(response: Response, fallback: string) {
  const rawMessage = (await response.text()).trim();

  if (!rawMessage || looksLikeHtmlDocument(rawMessage) || isGenericServerMessage(rawMessage)) {
    return buildLocalBackendHint(fallback);
  }

  return rawMessage.replace(/\s+/g, " ").trim();
}

export function normalizeBackendThrownMessage(message: string, fallback: string) {
  const trimmedMessage = message.trim();

  if (
    !trimmedMessage ||
    looksLikeHtmlDocument(trimmedMessage) ||
    isGenericServerMessage(trimmedMessage)
  ) {
    return buildLocalBackendHint(fallback);
  }

  return trimmedMessage.replace(/\s+/g, " ").trim();
}
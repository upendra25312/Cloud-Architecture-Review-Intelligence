function decodeClientPrincipal(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getClientPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal");
  return decodeClientPrincipal(header);
}

function jsonResponse(status, payload, headers = {}) {
  return {
    status,
    jsonBody: payload,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  };
}

function requireAuthenticated(request) {
  const principal = getClientPrincipal(request);

  if (!principal?.userId) {
    return {
      principal: null,
      response: jsonResponse(401, {
        error: "Sign in is required before saving or exporting Azure-backed review records."
      })
    };
  }

  return {
    principal,
    response: null
  };
}

/**
 * Returns a safe HTTP error response.
 * - 400/404 errors are our own domain errors (createHttpError) — pass message through.
 * - All other errors become 500 with a generic message so internal details never reach the client.
 * - The raw message is always logged so it is observable in App Insights / Functions logs.
 */
function safeErrorResponse(error, fallbackMessage, context = null) {
  const knownStatus = [400, 404, 409].includes(error?.statusCode) ? error.statusCode : null;
  const status = knownStatus ?? 500;
  const clientMessage = knownStatus
    ? (error instanceof Error ? error.message : fallbackMessage)
    : fallbackMessage;

  if (context && typeof context.log === "function") {
    context.log(JSON.stringify({
      msg: "ARB function error",
      status,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join(" | ") : undefined
    }));
  }

  return jsonResponse(status, { error: clientMessage });
}

module.exports = {
  getClientPrincipal,
  jsonResponse,
  requireAuthenticated,
  safeErrorResponse
};

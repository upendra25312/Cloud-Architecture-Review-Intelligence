'use strict';

const { app } = require('@azure/functions');
const { jsonResponse, requireAuthenticated } = require('../shared/auth');
const { checkFoundryAgentHealth } = require('../shared/arb-foundry-agent');

// In-memory cache so repeated polling from many concurrent UI sessions
// does not hammer the Azure AI endpoint. TTL: 60 seconds.
let _cache = null;
const CACHE_TTL_MS = 60 * 1000;

/**
 * GET /api/arb/agent/health
 *
 * Returns the health status of the AI agent (Foundry / Azure OpenAI).
 * Authenticated but not admin-protected — the frontend polls this on
 * the upload page before and during analysis to gate the "Start analysis"
 * button and surface meaningful error messages.
 *
 * Response shape:
 *   { status, message, checkedAt, latencyMs, cached }
 *
 * Status values: "healthy" | "degraded" | "unavailable" | "unconfigured"
 */
app.http('arbAgentHealth', {
  route: 'arb/agent/health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    const { response } = requireAuthenticated(request);
    if (response) return response;

    if (_cache && Date.now() < _cache.expiresAt) {
      return jsonResponse(200, { ..._cache.result, cached: true });
    }

    const result = await checkFoundryAgentHealth();
    _cache = { result, expiresAt: Date.now() + CACHE_TTL_MS };

    return jsonResponse(200, { ...result, cached: false });
  }
});

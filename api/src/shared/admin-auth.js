const { getClientPrincipal, jsonResponse } = require("./auth");

function hasRole(principal, roleName) {
  if (!principal || !Array.isArray(principal.userRoles)) {
    return false;
  }

  return principal.userRoles.some(
    (role) => role.trim().toLowerCase() === String(roleName).trim().toLowerCase()
  );
}

function requireAdmin(request) {
  const principal = getClientPrincipal(request);

  if (!principal?.userId) {
    return {
      principal: null,
      response: jsonResponse(401, {
        error: "Admin sign-in is required before using this internal route."
      })
    };
  }

  if (!hasRole(principal, "admin")) {
    return {
      principal,
      response: jsonResponse(403, {
        error: "You are signed in, but you do not have the admin role for this route."
      })
    };
  }

  return {
    principal,
    response: null
  };
}

module.exports = {
  hasRole,
  requireAdmin
};

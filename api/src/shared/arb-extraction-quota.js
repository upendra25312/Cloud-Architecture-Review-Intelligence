// arb-extraction-quota.js
//
// STRIDE REC-07: Per-user Document Intelligence hourly usage quota.
//
// Tracks DI extraction file counts per user OID in Table Storage so the limit
// survives function restarts and scales across multiple instances.
//
// Table : arbdiusage
// PK    : base64url(oid)
// RK    : "YYYY-MM-DDTHH"  (current UTC hour — old rows are naturally ignored)
// Field : count             (DI-eligible files processed this hour)
//
// Quota : HOURLY_LIMIT files per user per UTC hour.
// On conflict: one optimistic-concurrency retry (ETag / 412) before giving up.

const { getTableClient, encodeTableKey } = require("./table-storage");

const QUOTA_TABLE_NAME = "arbdiusage";
const HOURLY_LIMIT = 50;

function makeQuotaError(used, limit) {
  const err = new Error(
    `Document Intelligence quota exceeded: ${used}/${limit} files analysed this hour. ` +
    `Quota resets at the start of the next UTC hour.`
  );
  err.statusCode = 429;
  return err;
}

function currentHourKey() {
  return new Date().toISOString().slice(0, 13); // "2026-05-05T14"
}

/**
 * Atomically checks and reserves `count` DI extraction slots for this user's
 * current-hour quota window. Throws a 429 error when the reservation would
 * push the user over HOURLY_LIMIT.
 *
 * No-ops when principal.userId is absent (unauthenticated paths are already
 * blocked by auth.js) or when count is 0 (no DI-eligible files in the batch).
 *
 * @param {{ userId?: string }} principal  Authenticated caller
 * @param {number}              count      DI-eligible files to reserve
 */
async function checkAndReserveQuota(principal, count) {
  const oid = principal?.userId;
  if (!oid || count <= 0) return;

  const client = await getTableClient(QUOTA_TABLE_NAME);
  const pk = encodeTableKey(oid);
  const rk = currentHourKey();

  for (let attempt = 0; attempt < 2; attempt++) {
    let existing = null;
    try {
      existing = await client.getEntity(pk, rk);
    } catch (err) {
      if (err?.statusCode !== 404) throw err;
      // 404 = no usage recorded yet this hour — treat as 0
    }

    const currentCount = existing ? (Number(existing.count) || 0) : 0;

    if (currentCount + count > HOURLY_LIMIT) {
      throw makeQuotaError(currentCount, HOURLY_LIMIT);
    }

    const newEntity = {
      partitionKey: pk,
      rowKey: rk,
      count: currentCount + count
    };

    try {
      if (existing) {
        // Conditional update: fails with 412 if another request already changed
        // the row between our getEntity and updateEntity calls.
        await client.updateEntity(newEntity, "Replace", { ifMatch: existing.etag });
      } else {
        // createEntity fails with 409 if a concurrent request created the row first.
        await client.createEntity(newEntity);
      }
      return;
    } catch (conflictErr) {
      if (
        (conflictErr?.statusCode === 412 || conflictErr?.statusCode === 409) &&
        attempt === 0
      ) {
        continue; // retry with a fresh read
      }
      throw conflictErr;
    }
  }
}

/**
 * Returns the caller's current-hour DI quota status. Used for diagnostics or
 * future exposure via a /quota endpoint.
 *
 * @param {{ userId?: string }} principal
 * @returns {Promise<{ used: number, limit: number, resetKey: string }>}
 */
async function getQuotaStatus(principal) {
  const oid = principal?.userId;
  const rk = currentHourKey();

  if (!oid) return { used: 0, limit: HOURLY_LIMIT, resetKey: rk };

  const client = await getTableClient(QUOTA_TABLE_NAME);
  const pk = encodeTableKey(oid);

  try {
    const entity = await client.getEntity(pk, rk);
    return { used: Number(entity.count) || 0, limit: HOURLY_LIMIT, resetKey: rk };
  } catch (err) {
    if (err?.statusCode === 404) return { used: 0, limit: HOURLY_LIMIT, resetKey: rk };
    throw err;
  }
}

module.exports = { checkAndReserveQuota, getQuotaStatus, HOURLY_LIMIT, QUOTA_TABLE_NAME };

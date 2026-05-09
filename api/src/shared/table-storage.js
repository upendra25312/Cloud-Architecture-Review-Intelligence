const { TableClient } = require("@azure/data-tables");
const { DefaultAzureCredential } = require("@azure/identity");

const USER_PROFILE_TABLE_NAME =
  process.env.AZURE_STORAGE_REVIEW_USER_TABLE_NAME || "reviewusers";
const PROJECT_REVIEW_TABLE_NAME =
  process.env.AZURE_STORAGE_PROJECT_REVIEW_TABLE_NAME || "projectreviews";
const ARB_REVIEW_TABLE_NAME =
  process.env.AZURE_STORAGE_ARB_REVIEW_TABLE_NAME || "arbreviews";

function encodeTableKey(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64url");
}

async function getTableClient(name) {
  let client;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (accountName) {
    client = new TableClient(
      `https://${accountName}.table.core.windows.net`,
      name,
      new DefaultAzureCredential()
    );
  } else {
    // Local development fallback: Azurite or explicit conn string env var
    const connStr =
      process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    if (!connStr) {
      throw new Error(
        "AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_CONNECTION_STRING is required for table storage."
      );
    }
    client = TableClient.fromConnectionString(connStr, name);
  }

  try {
    await client.createTable();
  } catch (error) {
    if (error?.statusCode !== 409) {
      throw error;
    }
  }

  return client;
}

module.exports = {
  ARB_REVIEW_TABLE_NAME,
  PROJECT_REVIEW_TABLE_NAME,
  USER_PROFILE_TABLE_NAME,
  encodeTableKey,
  getTableClient
};

const { DefaultAzureCredential } = require("@azure/identity");

const SEARCH_ENDPOINT = (process.env.AZURE_SEARCH_ENDPOINT || "").replace(/\/+$/, "");
const INDEX_NAME = process.env.AZURE_SEARCH_INDEX_NAME || "arb-documents";
const SEARCH_API_VERSION = "2024-07-01"; // supports semantic ranking

let _searchCredential = null;
function getSearchCredential() {
  if (!_searchCredential) _searchCredential = new DefaultAzureCredential();
  return _searchCredential;
}
async function getSearchToken() {
  const token = await getSearchCredential().getToken("https://search.azure.com/.default");
  return token.token;
}

const SEMANTIC_CONFIG_NAME = "arb-semantic";
const SEARCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Azure AI Search request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const INDEX_SCHEMA = {
  name: INDEX_NAME,
  fields: [
    { name: "id", type: "Edm.String", key: true, filterable: true, sortable: true },
    { name: "reviewId", type: "Edm.String", filterable: true, sortable: true },
    { name: "fileId", type: "Edm.String", filterable: true, retrievable: true },
    { name: "fileName", type: "Edm.String", filterable: false, retrievable: true, searchable: false },
    { name: "logicalCategory", type: "Edm.String", filterable: true, retrievable: true, searchable: false },
    { name: "chunkIndex", type: "Edm.Int32", filterable: true, sortable: true },
    { name: "content", type: "Edm.String", searchable: true, retrievable: true, analyzer: "en.microsoft" }
  ],
  semantic: {
    defaultConfiguration: SEMANTIC_CONFIG_NAME,
    configurations: [
      {
        name: SEMANTIC_CONFIG_NAME,
        prioritizedFields: {
          prioritizedContentFields: [{ fieldName: "content" }],
          prioritizedKeywordsFields: [{ fieldName: "fileName" }, { fieldName: "logicalCategory" }]
        }
      }
    ]
  }
};

function getSearchConfiguration() {
  return {
    configured: Boolean(SEARCH_ENDPOINT),
    endpoint: SEARCH_ENDPOINT,
    indexName: INDEX_NAME
  };
}

async function searchRequest(path, method, body) {
  const url = `${SEARCH_ENDPOINT}/${path}?api-version=${SEARCH_API_VERSION}`;
  const token = await getSearchToken();
  const res = await fetchWithTimeout(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Azure AI Search ${method} ${path} failed ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureArbSearchIndex() {
  const config = getSearchConfiguration();
  if (!config.configured) return;

  try {
    await searchRequest(`indexes/${INDEX_NAME}`, "GET");
    return; // already exists
  } catch (err) {
    if (!String(err.message).includes("404")) throw err;
  }

  await searchRequest("indexes", "POST", INDEX_SCHEMA);
}

function chunkText(text, maxChunkSize = 1200) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 8);

  const chunks = [];
  let current = [];
  let size = 0;

  for (const line of lines) {
    if (size + line.length > maxChunkSize && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }

  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks.filter((c) => c.trim().length > 0);
}

function buildDocId(reviewId, fileId, chunkIndex) {
  return `${reviewId}-${fileId}-${chunkIndex}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 1024);
}

async function indexArbDocumentChunks(reviewId, fileId, fileName, logicalCategory, text) {
  const config = getSearchConfiguration();
  if (!config.configured) return 0;

  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const documents = chunks.map((content, i) => ({
    "@search.action": "mergeOrUpload",
    id: buildDocId(reviewId, fileId, i),
    reviewId,
    fileId,
    fileName: String(fileName ?? ""),
    logicalCategory: String(logicalCategory ?? "supporting_artifact"),
    chunkIndex: i,
    content
  }));

  const BATCH = 100;
  for (let i = 0; i < documents.length; i += BATCH) {
    await searchRequest(`indexes/${INDEX_NAME}/docs/index`, "POST", {
      value: documents.slice(i, i + BATCH)
    });
  }

  return documents.length;
}

async function searchArbDocuments(reviewId, queryText, topK = 10) {
  const config = getSearchConfiguration();
  if (!config.configured) return [];

  const safeQuery = queryText && queryText.trim() ? queryText.trim() : "*";
  const filter = `reviewId eq '${reviewId.replace(/'/g, "''")}'`;

  // Attempt semantic ranking first (requires S1+ tier); fall back to simple
  try {
    const result = await searchRequest(`indexes/${INDEX_NAME}/docs/search`, "POST", {
      search: safeQuery,
      filter,
      top: topK,
      select: "content,fileName,logicalCategory,chunkIndex",
      queryType: "semantic",
      semanticConfiguration: SEMANTIC_CONFIG_NAME,
      captions: "extractive|highlight-false",
      answers: "none"
    });

    return (result?.value ?? []).map((d) => ({
      content: String(d["@search.captions"]?.[0]?.text ?? d.content ?? ""),
      fileName: String(d.fileName ?? ""),
      logicalCategory: String(d.logicalCategory ?? ""),
      chunkIndex: Number(d.chunkIndex ?? 0)
    }));
  } catch (semanticErr) {
    // Semantic ranking not available (free/basic tier) — fall back silently
    try {
      const result = await searchRequest(`indexes/${INDEX_NAME}/docs/search`, "POST", {
        search: safeQuery,
        filter,
        top: topK,
        select: "content,fileName,logicalCategory,chunkIndex",
        queryType: "simple"
      });

      return (result?.value ?? []).map((d) => ({
        content: String(d.content ?? ""),
        fileName: String(d.fileName ?? ""),
        logicalCategory: String(d.logicalCategory ?? ""),
        chunkIndex: Number(d.chunkIndex ?? 0)
      }));
    } catch {
      return [];
    }
  }
}

module.exports = {
  getSearchConfiguration,
  ensureArbSearchIndex,
  indexArbDocumentChunks,
  searchArbDocuments
};

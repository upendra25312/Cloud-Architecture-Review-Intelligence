import type { ServiceSummary } from "@/types";

const RETAIL_PRICES_API_URL = "https://prices.azure.com/api/retail/prices";
const PRICING_CALCULATOR_URL = "https://azure.microsoft.com/en-us/pricing/calculator/";
const HOURS_PER_MONTH = 730;
const MAX_PAGES_PER_QUERY = 6;
const MAX_ITEMS_PER_QUERY = 4000;

type HomepagePricingQuery = {
  field: "serviceName" | "productName";
  operator: "eq" | "contains";
  value: string;
};

type RetailPriceApiRow = {
  serviceName?: string;
  productName?: string;
  skuName?: string;
  armRegionName?: string;
  location?: string;
  retailPrice?: number;
  currencyCode?: string;
  unitOfMeasure?: string;
  type?: string;
  isPrimaryMeterRegion?: boolean;
};

type RetailPriceApiResponse = {
  Items?: RetailPriceApiRow[];
  NextPageLink?: string | null;
};

type HomepagePricingCandidate = {
  serviceSlug: string;
  serviceName: string;
  productName: string;
  skuName: string;
  location: string;
  unitOfMeasure: string;
  retailPrice: number;
  currencyCode: string;
  approximateMonthlyPrice?: number;
};

export type HomepagePricingRow = HomepagePricingCandidate;

export type HomepagePricingSnapshot = {
  generatedAt: string;
  sourceUrl: string;
  calculatorUrl: string;
  priceDisclaimer: string;
  rows: HomepagePricingRow[];
  notes: string[];
};

const HOMEPAGE_PRICING_QUERY_MAP: Record<string, HomepagePricingQuery[]> = {
  "azure-kubernetes-service-aks": [
    {
      field: "serviceName",
      operator: "eq",
      value: "Azure Kubernetes Service"
    }
  ],
  "api-management": [
    {
      field: "serviceName",
      operator: "eq",
      value: "API Management"
    }
  ],
  "azure-app-service": [
    {
      field: "serviceName",
      operator: "eq",
      value: "Azure App Service"
    }
  ]
};

function buildODataFilter(query: HomepagePricingQuery) {
  const escapedValue = query.value.replace(/'/g, "''");

  if (query.operator === "contains") {
    return `contains(${query.field}, '${escapedValue}')`;
  }

  return `${query.field} eq '${escapedValue}'`;
}

function sanitizeServiceName(value: string) {
  return value
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueryCandidates(service: Pick<ServiceSummary, "slug" | "service" | "aliases" | "regionalFitSummary">) {
  const manualQueries = HOMEPAGE_PRICING_QUERY_MAP[service.slug];

  if (manualQueries) {
    return manualQueries;
  }

  const seen = new Set<string>();
  const candidateValues = [
    service.service,
    sanitizeServiceName(service.service),
    service.regionalFitSummary?.matchedServiceLabel,
    service.regionalFitSummary?.matchedOfferingName,
    ...service.aliases
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => sanitizeServiceName(value))
    .filter(Boolean);

  const queries: HomepagePricingQuery[] = [];

  for (const value of candidateValues) {
    for (const field of ["serviceName", "productName"] as const) {
      const key = `${field}:${value}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      queries.push({
        field,
        operator: "eq",
        value
      });
    }
  }

  return queries;
}

async function fetchRetailPricingRows(query: HomepagePricingQuery) {
  const rows: RetailPriceApiRow[] = [];
  let nextPageUrl = `${RETAIL_PRICES_API_URL}?$filter=${encodeURIComponent(buildODataFilter(query))}`;
  let pageCount = 0;

  while (nextPageUrl && pageCount < MAX_PAGES_PER_QUERY && rows.length < MAX_ITEMS_PER_QUERY) {
    const response = await fetch(nextPageUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Retail pricing query failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as RetailPriceApiResponse;

    rows.push(...(payload.Items ?? []));
    nextPageUrl = payload.NextPageLink ?? "";
    pageCount += 1;
  }

  return rows;
}

function normalizePricingCandidates(items: RetailPriceApiRow[], service: ServiceSummary) {
  return items
    .filter((item) => item.type === "Consumption")
    .filter((item) => item.isPrimaryMeterRegion !== false)
    .map((item) => {
      const retailPrice = Number(item.retailPrice ?? 0);

      if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
        return null;
      }

      const unitOfMeasure = item.unitOfMeasure?.trim() || "";
      const approximateMonthlyPrice = /hour/i.test(unitOfMeasure)
        ? retailPrice * HOURS_PER_MONTH
        : undefined;
      const candidate: HomepagePricingCandidate = {
        serviceSlug: service.slug,
        serviceName: service.service,
        productName: item.productName?.trim() || item.serviceName?.trim() || service.service,
        skuName: item.skuName?.trim() || "Published SKU",
        location: item.location?.trim() || item.armRegionName?.trim() || "Published location",
        unitOfMeasure,
        retailPrice,
        currencyCode: item.currencyCode?.trim() || "USD",
        approximateMonthlyPrice
      };

      return candidate;
    })
    .filter((item): item is HomepagePricingCandidate => item !== null);
}

function selectRepresentativePricingRow(candidates: HomepagePricingCandidate[]) {
  if (candidates.length === 0) {
    return null;
  }

  const hourlyCandidates = candidates.filter((candidate) => /hour/i.test(candidate.unitOfMeasure));
  const scopedCandidates = hourlyCandidates.length > 0 ? hourlyCandidates : candidates;

  return [...scopedCandidates].sort((left, right) => {
    if (left.retailPrice !== right.retailPrice) {
      return left.retailPrice - right.retailPrice;
    }

    const skuCompare = left.skuName.localeCompare(right.skuName);

    if (skuCompare !== 0) {
      return skuCompare;
    }

    return left.location.localeCompare(right.location);
  })[0];
}

async function readServiceHomepagePricing(service: ServiceSummary) {
  const queries = buildQueryCandidates(service);

  for (const query of queries) {
    const items = await fetchRetailPricingRows(query);
    const candidates = normalizePricingCandidates(items, service);
    const representativeRow = selectRepresentativePricingRow(candidates);

    if (representativeRow) {
      return representativeRow;
    }
  }

  return null;
}

export async function readHomepagePricingSnapshot(services: ServiceSummary[]): Promise<HomepagePricingSnapshot> {
  const settled = await Promise.allSettled(
    services.map(async (service) => readServiceHomepagePricing(service))
  );
  const rows = settled.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value) {
      return [];
    }

    return [result.value];
  });
  const failedServices = settled.reduce<number>(
    (count, result) => count + (result.status === "rejected" ? 1 : 0),
    0
  );
  const notes = [
    "Approximate monthly values are derived from current hourly Microsoft retail rows multiplied by 730 hours.",
    ...(failedServices > 0
      ? [`${failedServices.toLocaleString()} featured service pricing snapshots could not be refreshed during this build.`]
      : [])
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: RETAIL_PRICES_API_URL,
    calculatorUrl: PRICING_CALCULATOR_URL,
    priceDisclaimer:
      "Published Microsoft retail list pricing. Use the review workspace or Azure Pricing Calculator to refine quantity, reservation, and agreement assumptions.",
    rows,
    notes
  };
}

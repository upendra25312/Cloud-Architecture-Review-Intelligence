import { matchesPricingTargetRegion } from "@/lib/service-pricing";
import type {
  ChecklistItem,
  ReviewDraft,
  ReviewPackage,
  ReviewServiceAssumption,
  ServiceMonthlyEstimate,
  ServicePricing
} from "@/types";

type PackageExportOptions = {
  includeNotApplicable: boolean;
  includeNeedsReview: boolean;
};

function visibleSourceUrl(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized.includes("github.com/azure/review-checklists")) {
    return "";
  }

  return value ?? "";
}

function sanitizeCsv(value: string | undefined) {
  const normalized = value ?? "";
  const escaped = normalized.replaceAll('"', '""');

  return `"${escaped}"`;
}

function formatReview(item: ChecklistItem, reviews: Record<string, ReviewDraft>) {
  const review = reviews[item.guid] ?? undefined;

  return {
    projectAction: review?.packageDecision ?? "Needs Review",
    comments: review?.comments ?? "",
    owner: review?.owner ?? "",
    dueDate: review?.dueDate ?? "",
    evidenceLinks: review?.evidenceLinks.join(" | ") ?? ""
  };
}

function emptyServiceAssumption(): ReviewServiceAssumption {
  return {
    plannedRegion: "",
    preferredSku: "",
    sizingNote: ""
  };
}

function getServiceAssumption(reviewPackage: ReviewPackage, serviceSlug: string | undefined) {
  if (!serviceSlug) {
    return emptyServiceAssumption();
  }

  return reviewPackage.serviceAssumptions[serviceSlug] ?? emptyServiceAssumption();
}

function hasServiceAssumption(assumption: ReviewServiceAssumption) {
  return Boolean(
    assumption.plannedRegion.trim() || assumption.preferredSku.trim() || assumption.sizingNote.trim()
  );
}

function pushServiceAssumptionLines(lines: string[], assumption: ReviewServiceAssumption) {
  if (!hasServiceAssumption(assumption)) {
    return;
  }

  if (assumption.plannedRegion.trim()) {
    lines.push(`- Planned region: ${assumption.plannedRegion.trim()}`);
  }

  if (assumption.preferredSku.trim()) {
    lines.push(`- Preferred SKU: ${assumption.preferredSku.trim()}`);
  }

  if (assumption.sizingNote.trim()) {
    lines.push(`- Sizing note: ${assumption.sizingNote.trim()}`);
  }
}

function shouldIncludeItem(
  item: ChecklistItem,
  reviews: Record<string, ReviewDraft>,
  options: PackageExportOptions
) {
  const review = reviews[item.guid];
  const decision = review?.packageDecision ?? "Needs Review";

  if (decision === "Exclude") {
    return false;
  }

  if (decision === "Not Applicable") {
    return options.includeNotApplicable;
  }

  if (decision === "Needs Review") {
    return options.includeNeedsReview;
  }

  return true;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function formatPricingLine(price: number | undefined, currencyCode: string) {
  if (price === undefined || Number.isNaN(price)) {
    return "Not published";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 6
  }).format(price);
}

function formatEstimateLine(price: number | undefined, currencyCode: string) {
  if (price === undefined || Number.isNaN(price)) {
    return "Not modeled";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(price);
}

function serializeEstimateInputs(estimate: ServiceMonthlyEstimate) {
  return Object.entries(estimate.selectedInputs)
    .map(([key, value]) => `${key}=${value}`)
    .join(" | ");
}

function buildComponentBreakdown(estimate: ServiceMonthlyEstimate, skuName: string) {
  const skuEstimate = estimate.skuEstimates.find((entry) => entry.skuName === skuName);

  if (!skuEstimate) {
    return "";
  }

  return skuEstimate.components
    .map(
      (component) =>
        `${component.label}: ${formatEstimateLine(component.hourlyCost, estimate.currencyCode)}/hour and ${formatEstimateLine(component.monthlyCost, estimate.currencyCode)}/month (${component.quantity} x ${component.meterName})`
    )
    .join(" | ");
}

export function buildExportRows(items: ChecklistItem[], reviews: Record<string, ReviewDraft>) {
  return items.map((item) => {
    const review = formatReview(item, reviews);

    return {
      guid: item.guid,
      technology: item.technology,
      technologyStatus: item.technologyStatus,
      severity: item.severity ?? "",
      waf: item.waf ?? "",
      category: item.category ?? "",
      subcategory: item.subcategory ?? "",
      service: item.service ?? "",
      serviceCanonical: item.serviceCanonical ?? "",
      serviceSlug: item.serviceSlug ?? "",
      text: item.text,
      description: item.description ?? "",
      sourcePath: item.sourcePath ?? "",
      sourceUrl: visibleSourceUrl(item.sourceUrl),
      projectAction: review.projectAction,
      comments: review.comments,
      owner: review.owner,
      dueDate: review.dueDate,
      evidenceLinks: review.evidenceLinks
    };
  });
}

export function buildPackageExportRows(
  reviewPackage: ReviewPackage,
  items: ChecklistItem[],
  reviews: Record<string, ReviewDraft>,
  options: PackageExportOptions
) {
  return items
    .filter((item) => shouldIncludeItem(item, reviews, options))
    .map((item) => {
    const review = formatReview(item, reviews);
    const assumption = getServiceAssumption(reviewPackage, item.serviceSlug);

    return {
      projectReviewName: reviewPackage.name,
        audience: reviewPackage.audience,
        businessScope: reviewPackage.businessScope,
        targetRegions: reviewPackage.targetRegions.join(" | "),
        service: item.serviceCanonical ?? item.service ?? "",
        serviceSlug: item.serviceSlug ?? "",
        family: item.technology,
        familySlug: item.technologySlug,
        findingId: item.id ?? item.guid,
        finding: item.text,
        recommendation: item.description ?? "",
        severity: item.severity ?? "",
        waf: item.waf ?? "",
        category: item.category ?? "",
      subcategory: item.subcategory ?? "",
      plannedRegion: assumption.plannedRegion,
      preferredSku: assumption.preferredSku,
      sizingNote: assumption.sizingNote,
      projectAction: review.projectAction,
      comments: review.comments,
        owner: review.owner,
        dueDate: review.dueDate,
        evidenceLinks: review.evidenceLinks,
        sourcePath: item.sourcePath ?? "",
        sourceUrl: visibleSourceUrl(item.sourceUrl)
      };
    });
}

function collectPackageMetadata(reviewPackage: ReviewPackage, items: ChecklistItem[]) {
  const serviceNames = [...new Set(items.map((item) => item.serviceCanonical ?? item.service).filter(Boolean))];
  const familyNames = [...new Set(items.map((item) => item.technology).filter(Boolean))];

  return {
    serviceNames,
    familyNames
  };
}

export function buildPackageMarkdown(
  reviewPackage: ReviewPackage,
  items: ChecklistItem[],
  reviews: Record<string, ReviewDraft>,
  options: PackageExportOptions
) {
  const includedItems = items.filter((item) => shouldIncludeItem(item, reviews, options));
  const metadata = collectPackageMetadata(reviewPackage, includedItems);
  const grouped = new Map<string, ChecklistItem[]>();

  includedItems.forEach((item) => {
    const serviceName = item.serviceCanonical ?? item.service ?? "Unmapped service";
    const current = grouped.get(serviceName) ?? [];

    current.push(item);
    grouped.set(serviceName, current);
  });

  const sections = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([serviceName, serviceItems]) => {
      const lines = [`## ${serviceName}`, ""];
      const assumption = getServiceAssumption(reviewPackage, serviceItems[0]?.serviceSlug);

      pushServiceAssumptionLines(lines, assumption);
      if (hasServiceAssumption(assumption)) {
        lines.push("");
      }

      serviceItems.forEach((item) => {
        const review = formatReview(item, reviews);

        lines.push(`### ${item.text}`);
        lines.push(`- Project action: ${review.projectAction}`);
        lines.push(`- Checklist family: ${item.technology}`);
        lines.push(`- Severity: ${item.severity ?? "Unspecified"}`);
        if (review.owner) lines.push(`- Owner: ${review.owner}`);
        if (review.dueDate) lines.push(`- Due date: ${review.dueDate}`);
        if (review.comments) lines.push(`- Notes: ${review.comments}`);
        if (review.evidenceLinks) lines.push(`- Evidence: ${review.evidenceLinks}`);
        if (item.sourceUrl) lines.push(`- Source: ${visibleSourceUrl(item.sourceUrl) || item.sourceUrl}`);
        lines.push("");
      });

      return lines.join("\n");
    });

  return [
    `# ${reviewPackage.name}`,
    "",
    `- Audience: ${reviewPackage.audience}`,
    `- Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `- Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `- Services in scope: ${metadata.serviceNames.join(", ") || "None selected"}`,
    `- Checklist families referenced: ${metadata.familyNames.join(", ") || "None selected"}`,
    `- Exported at: ${new Date().toISOString()}`,
    "",
    ...sections
  ].join("\n");
}

export function buildPackageText(
  reviewPackage: ReviewPackage,
  items: ChecklistItem[],
  reviews: Record<string, ReviewDraft>,
  options: PackageExportOptions
) {
  const includedItems = items.filter((item) => shouldIncludeItem(item, reviews, options));
  const metadata = collectPackageMetadata(reviewPackage, includedItems);

  const lines = [
    reviewPackage.name,
    `Audience: ${reviewPackage.audience}`,
    `Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `Services in scope: ${metadata.serviceNames.join(", ") || "None selected"}`,
    `Exported at: ${new Date().toISOString()}`,
    ""
  ];

  includedItems.forEach((item) => {
    const review = formatReview(item, reviews);
    const assumption = getServiceAssumption(reviewPackage, item.serviceSlug);

    lines.push(`Service: ${item.serviceCanonical ?? item.service ?? "Unmapped service"}`);
    if (assumption.plannedRegion.trim()) lines.push(`Planned region: ${assumption.plannedRegion.trim()}`);
    if (assumption.preferredSku.trim()) lines.push(`Preferred SKU: ${assumption.preferredSku.trim()}`);
    if (assumption.sizingNote.trim()) lines.push(`Sizing note: ${assumption.sizingNote.trim()}`);
    lines.push(`Family: ${item.technology}`);
    lines.push(`Finding: ${item.text}`);
    lines.push(`Project action: ${review.projectAction}`);
    if (review.comments) lines.push(`Notes: ${review.comments}`);
    if (review.evidenceLinks) lines.push(`Evidence: ${review.evidenceLinks}`);
    if (review.owner) lines.push(`Owner: ${review.owner}`);
    if (review.dueDate) lines.push(`Due date: ${review.dueDate}`);
    lines.push("");
  });

  return lines.join("\n");
}

export function buildPackagePricingRows(
  reviewPackage: ReviewPackage,
  servicePricing: ServicePricing[]
): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);

  servicePricing
    .filter((pricing) => scopedServiceSlugs.has(pricing.serviceSlug))
    .forEach((pricing) => {
    const assumption = getServiceAssumption(reviewPackage, pricing.serviceSlug);

    if (!pricing.mapped || pricing.rows.length === 0) {
      rows.push({
        projectReviewName: reviewPackage.name,
        audience: reviewPackage.audience,
        businessScope: reviewPackage.businessScope,
        targetRegions: reviewPackage.targetRegions.join(" | "),
        service: pricing.serviceName,
        serviceSlug: pricing.serviceSlug,
        plannedRegion: assumption.plannedRegion,
        preferredSku: assumption.preferredSku,
        sizingNote: assumption.sizingNote,
        pricingMapped: "No",
        query: pricing.query
          ? `${pricing.query.field} ${pricing.query.operator} ${pricing.query.value}`
          : "",
        notes: pricing.notes.join(" | "),
        billingLocation: "",
        armRegionName: "",
        locationKind: "",
        productName: "",
        skuName: "",
        armSkuName: "",
        meterName: "",
        tierMinimumUnits: "",
        retailPrice: "",
        unitPrice: "",
        currencyCode: pricing.currencyCode,
        unitOfMeasure: "",
        priceType: "",
        effectiveStartDate: "",
        effectiveEndDate: "",
        targetRegionMatch: ""
      });

      return;
    }

    pricing.rows.forEach((row) => {
      rows.push({
        projectReviewName: reviewPackage.name,
        audience: reviewPackage.audience,
        businessScope: reviewPackage.businessScope,
        targetRegions: reviewPackage.targetRegions.join(" | "),
        service: pricing.serviceName,
        serviceSlug: pricing.serviceSlug,
        plannedRegion: assumption.plannedRegion,
        preferredSku: assumption.preferredSku,
        sizingNote: assumption.sizingNote,
        pricingMapped: "Yes",
        query: pricing.query
          ? `${pricing.query.field} ${pricing.query.operator} ${pricing.query.value}`
          : "",
        notes: pricing.notes.join(" | "),
        billingLocation: row.location,
        armRegionName: row.armRegionName,
        locationKind: row.locationKind,
        productName: row.productName,
        skuName: row.skuName,
        armSkuName: row.armSkuName,
        meterName: row.meterName,
        tierMinimumUnits: row.tierMinimumUnits,
        retailPrice: row.retailPrice,
        unitPrice: row.unitPrice,
        currencyCode: row.currencyCode,
        unitOfMeasure: row.unitOfMeasure,
        priceType: row.type,
        effectiveStartDate: row.effectiveStartDate,
        effectiveEndDate: row.effectiveEndDate ?? "",
        targetRegionMatch: matchesPricingTargetRegion(
          row.armRegionName,
          row.location,
          reviewPackage.targetRegions,
          pricing.targetPricingLocations,
          row.locationKind
        )
          ? "Yes"
          : "No"
      });
    });
  });

  return rows;
}

export function buildPackagePricingMarkdown(
  reviewPackage: ReviewPackage,
  servicePricing: ServicePricing[]
) {
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);
  const sections = servicePricing
    .slice()
    .filter((pricing) => scopedServiceSlugs.has(pricing.serviceSlug))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName))
    .map((pricing) => {
      const lines = [`## ${pricing.serviceName}`, ""];
      const assumption = getServiceAssumption(reviewPackage, pricing.serviceSlug);

      pushServiceAssumptionLines(lines, assumption);
      if (hasServiceAssumption(assumption)) {
        lines.push("");
      }
      lines.push(`- Pricing mapped: ${pricing.mapped ? "Yes" : "No"}`);
      lines.push(`- Query used: ${pricing.query ? `${pricing.query.field} ${pricing.query.operator} ${pricing.query.value}` : "No query matched"}`);
      lines.push(`- Billing locations published: ${pricing.billingLocationCount.toLocaleString()}`);
      lines.push(`- Deployment regions with prices: ${pricing.regionCount.toLocaleString()}`);
      lines.push(`- SKUs published: ${pricing.skuCount.toLocaleString()}`);
      lines.push(`- Meters published: ${pricing.meterCount.toLocaleString()}`);
      lines.push(
        `- Lowest scoped meter: ${formatPricingLine(
          pricing.startsAtTargetRetailPrice ?? pricing.startsAtRetailPrice,
          pricing.currencyCode
        )}`
      );
      lines.push(
        `- Target-region matches: ${pricing.targetRegionMatchCount.toLocaleString()}`
      );
      lines.push(`- Pricing source: ${pricing.sourceUrl}`);
      lines.push(`- Calculator: ${pricing.calculatorUrl}`);
      if (pricing.notes.length > 0) {
        lines.push(`- Notes: ${pricing.notes.join(" | ")}`);
      }
      lines.push("");

      if (!pricing.mapped || pricing.rows.length === 0) {
        lines.push("No retail pricing rows were returned for this service.");
        lines.push("");
        return lines.join("\n");
      }

      lines.push("| Location | ARM region | SKU | Meter | Retail price | Unit | Tier minimum |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- |");

      pricing.rows.forEach((row) => {
        lines.push(
          `| ${row.location} | ${row.armRegionName || "-"} | ${row.skuName || "-"} | ${row.meterName} | ${formatPricingLine(row.retailPrice, row.currencyCode)} | ${row.unitOfMeasure} | ${row.tierMinimumUnits.toLocaleString()} |`
        );
      });

      lines.push("");

      return lines.join("\n");
    });

  return [
    `# ${reviewPackage.name} commercial snapshot`,
    "",
    `- Audience: ${reviewPackage.audience}`,
    `- Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `- Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `- Services in scope: ${servicePricing.filter((pricing) => scopedServiceSlugs.has(pricing.serviceSlug)).map((pricing) => pricing.serviceName).join(", ") || "None selected"}`,
    `- Exported at: ${new Date().toISOString()}`,
    "",
    ...sections
  ].join("\n");
}

export function buildPackagePricingText(reviewPackage: ReviewPackage, servicePricing: ServicePricing[]) {
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);
  const lines = [
    `${reviewPackage.name} commercial snapshot`,
    `Audience: ${reviewPackage.audience}`,
    `Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `Exported at: ${new Date().toISOString()}`,
    ""
  ];

  servicePricing
    .slice()
    .filter((pricing) => scopedServiceSlugs.has(pricing.serviceSlug))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName))
    .forEach((pricing) => {
      const assumption = getServiceAssumption(reviewPackage, pricing.serviceSlug);

      lines.push(`Service: ${pricing.serviceName}`);
      if (assumption.plannedRegion.trim()) lines.push(`Planned region: ${assumption.plannedRegion.trim()}`);
      if (assumption.preferredSku.trim()) lines.push(`Preferred SKU: ${assumption.preferredSku.trim()}`);
      if (assumption.sizingNote.trim()) lines.push(`Sizing note: ${assumption.sizingNote.trim()}`);
      lines.push(`Pricing mapped: ${pricing.mapped ? "Yes" : "No"}`);
      lines.push(
        `Query used: ${pricing.query ? `${pricing.query.field} ${pricing.query.operator} ${pricing.query.value}` : "No query matched"}`
      );
      lines.push(
        `Lowest scoped meter: ${formatPricingLine(
          pricing.startsAtTargetRetailPrice ?? pricing.startsAtRetailPrice,
          pricing.currencyCode
        )}`
      );
      lines.push(`Billing locations published: ${pricing.billingLocationCount.toLocaleString()}`);
      lines.push(`Deployment regions with prices: ${pricing.regionCount.toLocaleString()}`);
      lines.push(`SKUs published: ${pricing.skuCount.toLocaleString()}`);
      lines.push(`Meters published: ${pricing.meterCount.toLocaleString()}`);
      lines.push(`Target-region matches: ${pricing.targetRegionMatchCount.toLocaleString()}`);
      lines.push(`Pricing source: ${pricing.sourceUrl}`);
      if (pricing.notes.length > 0) {
        lines.push(`Notes: ${pricing.notes.join(" | ")}`);
      }

      if (pricing.rows.length === 0) {
        lines.push("No retail pricing rows were returned for this service.");
        lines.push("");
        return;
      }

      pricing.rows.forEach((row) => {
        lines.push(
          `${row.location} | ${row.armRegionName || "No ARM region"} | ${row.skuName || "No SKU"} | ${row.meterName} | ${formatPricingLine(row.retailPrice, row.currencyCode)} per ${row.unitOfMeasure} | tier ${row.tierMinimumUnits.toLocaleString()}`
        );
      });

      lines.push("");
    });

  return lines.join("\n");
}

export function buildPackageMonthlyEstimateRows(
  reviewPackage: ReviewPackage,
  monthlyEstimates: ServiceMonthlyEstimate[]
): Array<Record<string, string | number>> {
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);
  const rows: Array<Record<string, string | number>> = [];

  monthlyEstimates
    .filter((estimate) => scopedServiceSlugs.has(estimate.serviceSlug))
    .forEach((estimate) => {
      const assumption = getServiceAssumption(reviewPackage, estimate.serviceSlug);

      if (!estimate.supported || estimate.skuEstimates.length === 0) {
        rows.push({
          projectReviewName: reviewPackage.name,
          audience: reviewPackage.audience,
          businessScope: reviewPackage.businessScope,
          targetRegions: reviewPackage.targetRegions.join(" | "),
          service: estimate.serviceName,
          serviceSlug: estimate.serviceSlug,
          plannedRegion: assumption.plannedRegion,
          preferredSku: assumption.preferredSku,
          sizingNote: assumption.sizingNote,
          estimateMode: estimate.mode,
          estimateProfileVersion: estimate.profileVersion ?? "",
          estimateCoverage: estimate.coverage,
          estimateInputMode: estimate.selectedInputMode,
          selectedInputs: serializeEstimateInputs(estimate),
          supported: "No",
          selectedSku: "",
          selectedHourlyEstimate: "",
          monthlyEstimate: "",
          skuName: "",
          skuHourlyEstimate: "",
          skuMonthlyEstimate: "",
          assumptions: estimate.assumptions.join(" | "),
          notes: estimate.notes.join(" | "),
          componentCount: 0,
          componentBreakdown: ""
        });

        return;
      }

      estimate.skuEstimates.forEach((skuEstimate) => {
        rows.push({
          projectReviewName: reviewPackage.name,
          audience: reviewPackage.audience,
          businessScope: reviewPackage.businessScope,
          targetRegions: reviewPackage.targetRegions.join(" | "),
          service: estimate.serviceName,
          serviceSlug: estimate.serviceSlug,
          plannedRegion: assumption.plannedRegion,
          preferredSku: assumption.preferredSku,
          sizingNote: assumption.sizingNote,
          estimateMode: estimate.mode,
          estimateProfileVersion: estimate.profileVersion ?? "",
          estimateCoverage: estimate.coverage,
          estimateInputMode: estimate.selectedInputMode,
          selectedInputs: serializeEstimateInputs(estimate),
          supported: "Yes",
          selectedSku: estimate.selectedSkuName === skuEstimate.skuName ? "Yes" : "No",
          selectedHourlyEstimate: estimate.selectedHourlyCost ?? "",
          monthlyEstimate: estimate.selectedMonthlyCost ?? "",
          skuName: skuEstimate.skuName,
          skuHourlyEstimate: skuEstimate.hourlyCost,
          skuMonthlyEstimate: skuEstimate.monthlyCost,
          assumptions: skuEstimate.assumptions.join(" | "),
          notes: [...estimate.notes, ...skuEstimate.notes].join(" | "),
          componentCount: skuEstimate.components.length,
          componentBreakdown: buildComponentBreakdown(estimate, skuEstimate.skuName)
        });
      });
    });

  return rows;
}

export function buildPackageMonthlyEstimateMarkdown(
  reviewPackage: ReviewPackage,
  monthlyEstimates: ServiceMonthlyEstimate[]
) {
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);
  const scopedEstimates = monthlyEstimates
    .slice()
    .filter((estimate) => scopedServiceSlugs.has(estimate.serviceSlug))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName));
  const totalMonthlyEstimate = scopedEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedMonthlyCost ?? 0),
    0
  );
  const totalHourlyEstimate = scopedEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedHourlyCost ?? 0),
    0
  );
  const supportedCount = scopedEstimates.filter((estimate) => estimate.supported).length;

  const sections = scopedEstimates.map((estimate) => {
    const assumption = getServiceAssumption(reviewPackage, estimate.serviceSlug);
    const lines = [`## ${estimate.serviceName}`, ""];

    pushServiceAssumptionLines(lines, assumption);
    if (hasServiceAssumption(assumption)) {
      lines.push("");
    }

    lines.push(`- Monthly estimate mode: ${estimate.mode}`);
    lines.push(`- Estimate coverage: ${estimate.coverage}`);
    lines.push(`- Estimate profile version: ${estimate.profileVersion ?? "Not set"}`);
    lines.push(`- Input mode: ${estimate.selectedInputMode}`);
    lines.push(`- Estimate supported: ${estimate.supported ? "Yes" : "No"}`);
    lines.push(
      `- Selected hourly estimate: ${formatEstimateLine(estimate.selectedHourlyCost, estimate.currencyCode)}`
    );
    lines.push(
      `- Selected estimate: ${formatEstimateLine(estimate.selectedMonthlyCost, estimate.currencyCode)}`
    );
    if (estimate.selectedSkuName) {
      lines.push(`- Selected SKU: ${estimate.selectedSkuName}`);
    }
    if (estimate.assumptions.length > 0) {
      lines.push(`- Assumptions: ${estimate.assumptions.join(" | ")}`);
    }
    if (serializeEstimateInputs(estimate)) {
      lines.push(`- Selected inputs: ${serializeEstimateInputs(estimate)}`);
    }
    if (estimate.notes.length > 0) {
      lines.push(`- Notes: ${estimate.notes.join(" | ")}`);
    }
    lines.push("");

    if (estimate.skuEstimates.length === 0) {
      lines.push("No monthly estimate could be modeled yet for this service.");
      lines.push("");
      return lines.join("\n");
    }

    lines.push("| SKU | Selected | Hourly estimate | Monthly estimate | Assumptions |");
    lines.push("| --- | --- | --- | --- | --- |");
    estimate.skuEstimates.forEach((skuEstimate) => {
      lines.push(
        `| ${skuEstimate.skuName} | ${estimate.selectedSkuName === skuEstimate.skuName ? "Yes" : "No"} | ${formatEstimateLine(skuEstimate.hourlyCost, estimate.currencyCode)} | ${formatEstimateLine(skuEstimate.monthlyCost, estimate.currencyCode)} | ${skuEstimate.assumptions.join(" / ")} |`
      );
    });
    lines.push("");

    const selectedBreakdown = buildComponentBreakdown(estimate, estimate.selectedSkuName ?? "");

    if (selectedBreakdown) {
      lines.push(`Selected SKU component breakdown: ${selectedBreakdown}`);
      lines.push("");
    }

    return lines.join("\n");
  });

  return [
    `# ${reviewPackage.name} monthly estimate`,
    "",
    `- Audience: ${reviewPackage.audience}`,
    `- Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `- Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `- Services in scope: ${scopedEstimates.map((estimate) => estimate.serviceName).join(", ") || "None selected"}`,
    `- Estimate supported: ${supportedCount.toLocaleString()} of ${scopedEstimates.length.toLocaleString()} selected services`,
    `- Estimated hourly total: ${formatEstimateLine(totalHourlyEstimate, scopedEstimates[0]?.currencyCode ?? "USD")}`,
    `- Estimated monthly total: ${formatEstimateLine(totalMonthlyEstimate, scopedEstimates[0]?.currencyCode ?? "USD")}`,
    `- Exported at: ${new Date().toISOString()}`,
    "",
    ...sections
  ].join("\n");
}

export function buildPackageMonthlyEstimateText(
  reviewPackage: ReviewPackage,
  monthlyEstimates: ServiceMonthlyEstimate[]
) {
  const scopedServiceSlugs = new Set(reviewPackage.selectedServiceSlugs);
  const scopedEstimates = monthlyEstimates
    .slice()
    .filter((estimate) => scopedServiceSlugs.has(estimate.serviceSlug))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName));
  const totalMonthlyEstimate = scopedEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedMonthlyCost ?? 0),
    0
  );
  const totalHourlyEstimate = scopedEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedHourlyCost ?? 0),
    0
  );

  const lines = [
    `${reviewPackage.name} monthly estimate`,
    `Audience: ${reviewPackage.audience}`,
    `Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `Estimated hourly total: ${formatEstimateLine(totalHourlyEstimate, scopedEstimates[0]?.currencyCode ?? "USD")}`,
    `Estimated monthly total: ${formatEstimateLine(totalMonthlyEstimate, scopedEstimates[0]?.currencyCode ?? "USD")}`,
    `Exported at: ${new Date().toISOString()}`,
    ""
  ];

  scopedEstimates.forEach((estimate) => {
    const assumption = getServiceAssumption(reviewPackage, estimate.serviceSlug);
    lines.push(`Service: ${estimate.serviceName}`);
    if (assumption.plannedRegion.trim()) lines.push(`Planned region: ${assumption.plannedRegion.trim()}`);
    if (assumption.preferredSku.trim()) lines.push(`Preferred SKU: ${assumption.preferredSku.trim()}`);
    if (assumption.sizingNote.trim()) lines.push(`Sizing note: ${assumption.sizingNote.trim()}`);
    lines.push(`Estimate mode: ${estimate.mode}`);
    lines.push(`Estimate coverage: ${estimate.coverage}`);
    lines.push(`Estimate profile version: ${estimate.profileVersion ?? "Not set"}`);
    lines.push(`Input mode: ${estimate.selectedInputMode}`);
    lines.push(`Estimate supported: ${estimate.supported ? "Yes" : "No"}`);
    lines.push(`Selected hourly estimate: ${formatEstimateLine(estimate.selectedHourlyCost, estimate.currencyCode)}`);
    lines.push(`Selected estimate: ${formatEstimateLine(estimate.selectedMonthlyCost, estimate.currencyCode)}`);
    if (estimate.selectedSkuName) {
      lines.push(`Selected SKU: ${estimate.selectedSkuName}`);
    }
    if (serializeEstimateInputs(estimate)) {
      lines.push(`Selected inputs: ${serializeEstimateInputs(estimate)}`);
    }
    if (estimate.assumptions.length > 0) {
      lines.push(`Assumptions: ${estimate.assumptions.join(" | ")}`);
    }
    if (estimate.notes.length > 0) {
      lines.push(`Notes: ${estimate.notes.join(" | ")}`);
    }
    estimate.skuEstimates.forEach((skuEstimate) => {
      lines.push(
        `SKU estimate: ${skuEstimate.skuName} = ${formatEstimateLine(skuEstimate.hourlyCost, estimate.currencyCode)}/hour and ${formatEstimateLine(skuEstimate.monthlyCost, estimate.currencyCode)}/month`
      );
    });
    const selectedBreakdown = buildComponentBreakdown(estimate, estimate.selectedSkuName ?? "");
    if (selectedBreakdown) {
      lines.push(`Component breakdown: ${selectedBreakdown}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export function buildRegionalRiskRows(
  reviewPackage: ReviewPackage,
  entries: Array<{
    serviceSlug: string;
    serviceName: string;
    classification: "Blocked" | "Caveat" | "Global" | "Available";
    signals: string[];
  }>
) {
  return entries.map((entry) => ({
    projectReviewName: reviewPackage.name,
    audience: reviewPackage.audience,
    businessScope: reviewPackage.businessScope,
    targetRegions: reviewPackage.targetRegions.join(" | "),
    service: entry.serviceName,
    serviceSlug: entry.serviceSlug,
    classification: entry.classification,
    signals: entry.signals.join(" | ")
  }));
}

export function buildLeadershipSummaryMarkdown(
  reviewPackage: ReviewPackage,
  summary: {
    selectedServiceCount: number;
    blockedServices: Array<{ serviceName: string; signals: string[] }>;
    caveatServices: Array<{ serviceName: string; signals: string[] }>;
    globalServices: string[];
    availableServices: string[];
    pricingMappedCount: number;
    selectedPricingCount: number;
    startingRetailPrice?: number;
    pricingCurrencyCode?: string;
    includedCount: number;
    notApplicableCount: number;
    excludedCount: number;
    pendingCount: number;
  }
) {
  const lines = [
    `# ${reviewPackage.name} leadership summary`,
    "",
    `- Audience: ${reviewPackage.audience}`,
    `- Business scope: ${reviewPackage.businessScope || "Not captured"}`,
    `- Target regions: ${reviewPackage.targetRegions.join(", ") || "Not captured"}`,
    `- Services in scope: ${summary.selectedServiceCount.toLocaleString()}`,
    `- Pricing mapped: ${summary.pricingMappedCount.toLocaleString()} of ${summary.selectedPricingCount.toLocaleString()} selected services`,
    `- Starting published retail row: ${formatPricingLine(summary.startingRetailPrice, summary.pricingCurrencyCode ?? "USD")}`,
    `- Included findings: ${summary.includedCount.toLocaleString()}`,
    `- Not applicable findings: ${summary.notApplicableCount.toLocaleString()}`,
    `- Excluded findings: ${summary.excludedCount.toLocaleString()}`,
    `- Pending findings: ${summary.pendingCount.toLocaleString()}`,
    `- Exported at: ${new Date().toISOString()}`,
    "",
    "## Regional blockers",
    ""
  ];

  if (summary.blockedServices.length > 0) {
    summary.blockedServices.forEach((entry) => {
      lines.push(`- ${entry.serviceName}: ${entry.signals.join(", ")}`);
    });
  } else {
    lines.push("- No selected services currently show restricted, unavailable, or not-in-feed target-region signals.");
  }

  lines.push("", "## Regional caveats", "");

  if (summary.caveatServices.length > 0) {
    summary.caveatServices.forEach((entry) => {
      lines.push(`- ${entry.serviceName}: ${entry.signals.join(", ")}`);
    });
  } else {
    lines.push("- No selected services are currently flagged only with preview, retiring, or early-access caveats.");
  }

  lines.push("", "## Global and fully available services", "");
  lines.push(
    `- Global services: ${summary.globalServices.join(", ") || "None"}`,
    `- Available without caveat: ${summary.availableServices.join(", ") || "None"}`
  );

  lines.push("", "## Recommended next actions", "");

  if (summary.blockedServices.length > 0) {
    lines.push("- Review the blocked or restricted services first and confirm whether the target-region design should change.");
  }

  if (summary.caveatServices.length > 0) {
    lines.push("- Review preview, retiring, or early-access services and decide whether they remain acceptable for the current project.");
  }

  if (summary.pendingCount > 0) {
    lines.push("- Close the remaining pending checklist decisions before final export or leadership sign-off.");
  }

  if (summary.pricingMappedCount < summary.selectedPricingCount) {
    lines.push("- Review the pricing exports for services that still lack a clean published retail mapping.");
  }

  if (
    summary.blockedServices.length === 0 &&
    summary.caveatServices.length === 0 &&
    summary.pendingCount === 0 &&
    summary.pricingMappedCount === summary.selectedPricingCount
  ) {
    lines.push("- The scoped review is ready for final design-note and pricing export.");
  }

  return lines.join("\n");
}

export function downloadJson(filename: string, rows: unknown) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  downloadBlob(filename, blob);
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => sanitizeCsv(String(row[header] ?? ""))).join(","))
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8"
  });

  downloadBlob(filename, blob);
}

export function downloadText(filename: string, contents: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([contents], {
    type: mimeType
  });

  downloadBlob(filename, blob);
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildPackageExportRows,
  buildLeadershipSummaryMarkdown,
  buildPackageMonthlyEstimateMarkdown,
  buildPackageMonthlyEstimateRows,
  buildPackageMarkdown,
  buildPackagePricingMarkdown,
  buildPackagePricingRows,
  buildPackagePricingText,
  buildPackageMonthlyEstimateText,
  buildRegionalRiskRows,
  buildPackageText,
  downloadCsv,
  downloadText
} from "@/lib/export";
import {
  getServiceEstimateProfile,
  resolveEstimateInputs
} from "@/lib/monthly-estimate-profiles";
import { buildServiceMonthlyEstimate } from "@/lib/monthly-estimate";
import {
  buildServiceRegionalFitRequest,
  loadServiceRegionalFitBatch
} from "@/lib/service-regional-fit";
import {
  buildServicePricingRequest,
  loadServicePricingBatch,
  matchesPricingTargetRegion
} from "@/lib/service-pricing";
import {
  activateCloudProjectReview,
  fetchClientPrincipal,
  loadCloudProjectReviewState,
  loadCloudReviewRecords,
  saveCloudProjectReviewState,
  structuredRecordsToReviewMap
} from "@/lib/review-cloud";
import { trackReviewTelemetry } from "@/lib/review-telemetry";
import {
  createEmptyServiceAssumption,
  createEmptyReview,
  createReviewPackage,
  deletePackage,
  loadActivePackageId,
  loadPackages,
  loadScopedReviews,
  saveActivePackageId,
  savePackageReviews,
  savePackages,
  saveReviews,
  upsertPackage
} from "@/lib/review-storage";
import { ItemDrawer } from "@/components/item-drawer";
import { ProjectReviewCopilot } from "@/components/project-review-copilot";
import { ProjectReviewServiceDrawer } from "@/components/project-review-service-drawer";
import { ReviewCloudControls } from "@/components/review-cloud-controls";
import type {
  ChecklistItem,
  ProjectReviewCopilotContext,
  ReviewDraft,
  ReviewMode,
  ReviewPackage,
  ReviewPackageAudience,
  ReviewServiceEstimateInputValue,
  ServiceRegionalFit,
  ServiceRegionalFitSummary,
  ServiceIndex,
  ReviewServiceAssumption,
  ServiceMonthlyEstimate,
  ServicePricing,
  ServicePricingRow
} from "@/types";

const AUDIENCES: ReviewPackageAudience[] = [
  "Cloud Architect",
  "Pre-sales Architect",
  "Sales Architect",
  "Senior Director",
  "Cloud Engineer"
];

const REVIEW_MODES: ReviewMode[] = ["Standard review", "ARB-grade review"];

function normalizeList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatRetailPrice(price: number | undefined, currencyCode = "USD") {
  if (price === undefined || Number.isNaN(price)) {
    return "Not published";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 6
  }).format(price);
}

function formatEstimatePrice(price: number | undefined, currencyCode = "USD") {
  if (price === undefined || Number.isNaN(price)) {
    return "Not modeled";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(price);
}

function normalizeRegionName(value: string) {
  return value.trim().toLowerCase();
}

type MatrixChipTone = "good" | "warning" | "danger" | "neutral";

type MatrixChip = {
  label: string;
  tone: MatrixChipTone;
};

function createMatrixChip(label: string, tone: MatrixChipTone): MatrixChip {
  return {
    label,
    tone
  };
}

function buildRegionFitMatrix(
  regionalFit: ServiceRegionalFit | undefined,
  fallbackSummary: ServiceRegionalFitSummary | undefined,
  targetRegions: string[]
) {
  const effectiveGlobalService = regionalFit?.isGlobalService || fallbackSummary?.isGlobalService || false;
  const effectiveMapped = regionalFit?.mapped ?? fallbackSummary?.mapped ?? false;
  const fallbackNote = fallbackSummary?.notes[0];

  if (!regionalFit && !effectiveMapped) {
    return {
      chips: [createMatrixChip("Mapping pending", "neutral")],
      summary: "Official regional availability is not mapped for this service yet."
    };
  }

  if (!regionalFit) {
    if (effectiveGlobalService) {
      return {
        chips:
          targetRegions.length > 0
            ? targetRegions.map((targetRegion) =>
                createMatrixChip(`${targetRegion} · Global service`, "neutral")
              )
            : [createMatrixChip("Global service", "neutral")],
        summary:
          fallbackNote ??
          "This service is treated as global or non-regional in the Microsoft availability feed, so target deployment regions do not directly constrain this matrix view."
      };
    }

    return {
      chips: [createMatrixChip("Loading live availability", "neutral")],
      summary: "The project review is asking the dedicated backend for current regional availability."
    };
  }

  if (!regionalFit.mapped) {
    return {
      chips: [createMatrixChip("Mapping pending", "neutral")],
      summary:
        regionalFit.notes[0] ??
        fallbackNote ??
        "Official regional availability could not be mapped cleanly for this service."
    };
  }

  if (targetRegions.length > 0) {
    if (effectiveGlobalService) {
      return {
        chips: targetRegions.map((targetRegion) =>
          createMatrixChip(`${targetRegion} · Global service`, "neutral")
        ),
        summary:
          fallbackNote ??
          "This service is treated as global or non-regional in the Microsoft availability feed, so target deployment regions do not directly constrain this matrix view."
      };
    }

    const chips = targetRegions.map((targetRegion) => {
      const normalizedTarget = normalizeRegionName(targetRegion);
      const availableRegion = regionalFit.regions.find(
        (region) => normalizeRegionName(region.regionName) === normalizedTarget
      );

      if (availableRegion) {
        if (availableRegion.accessState === "ReservedAccess") {
          return createMatrixChip(`${targetRegion} · Restricted`, "warning");
        }

        if (availableRegion.accessState === "EarlyAccess") {
          return createMatrixChip(`${targetRegion} · Early access`, "warning");
        }

        if (
          availableRegion.availabilityState === "Preview" ||
          availableRegion.skuStates.some((entry) => entry.state === "Preview")
        ) {
          return createMatrixChip(`${targetRegion} · Preview`, "warning");
        }

        if (
          availableRegion.availabilityState === "Retiring" ||
          availableRegion.skuStates.some((entry) => entry.state === "Retiring")
        ) {
          return createMatrixChip(`${targetRegion} · Retiring`, "warning");
        }

        return createMatrixChip(`${targetRegion} · Available`, "good");
      }

      const unavailableRegion = regionalFit.unavailableRegions.find(
        (region) => normalizeRegionName(region.regionName) === normalizedTarget
      );

      if (unavailableRegion) {
        if (unavailableRegion.accessState === "ReservedAccess") {
          return createMatrixChip(`${targetRegion} · Restricted region`, "warning");
        }

        if (unavailableRegion.accessState === "EarlyAccess") {
          return createMatrixChip(`${targetRegion} · Early access`, "warning");
        }

        return createMatrixChip(`${targetRegion} · Unavailable`, "danger");
      }
      return createMatrixChip(`${targetRegion} · Not in feed`, "danger");
    });

    const accountedForCount = chips.filter((chip) => !chip.label.endsWith("Not in feed")).length;

    return {
      chips,
      summary: effectiveGlobalService
        ? fallbackNote ??
          "This service is treated as global or non-regional for at least part of its Microsoft offering."
        : `${accountedForCount.toLocaleString()} of ${targetRegions.length.toLocaleString()} target regions are accounted for in the current availability data.`
    };
  }

  const chips: MatrixChip[] = [];

  if (effectiveGlobalService) {
    chips.push(createMatrixChip("Global service", "neutral"));
  }

  if (regionalFit.availableRegionCount > 0) {
    chips.push(createMatrixChip(`${regionalFit.availableRegionCount.toLocaleString()} available`, "good"));
  }

  if (regionalFit.restrictedRegionCount > 0) {
    chips.push(
      createMatrixChip(`${regionalFit.restrictedRegionCount.toLocaleString()} restricted`, "warning")
    );
  }

  if (regionalFit.previewRegionCount > 0) {
    chips.push(createMatrixChip(`${regionalFit.previewRegionCount.toLocaleString()} preview`, "warning"));
  }

  if (regionalFit.unavailableRegionCount > 0) {
    chips.push(
      createMatrixChip(`${regionalFit.unavailableRegionCount.toLocaleString()} unavailable`, "danger")
    );
  }

  return {
    chips: chips.length > 0 ? chips : [createMatrixChip("Availability ready", "good")],
    summary: "Open the service view when you need the full per-region detail."
  };
}

function buildCostFitMatrix(
  pricing: ServicePricing | undefined,
  loading: boolean,
  error: string | null,
  assumption: ReviewServiceAssumption,
  targetRegions: string[]
) {
  if (!pricing) {
    return {
      chips: [createMatrixChip(loading ? "Loading pricing" : "Pricing pending", "neutral")],
      summary: error
        ? error
        : "The project review is loading current retail pricing for this service."
    };
  }

  if (!pricing.mapped) {
    return {
      chips: [createMatrixChip("Pricing pending", "neutral")],
      summary:
        pricing.notes[0] ?? "Microsoft does not currently publish a clean standalone pricing mapping for this service."
    };
  }

  const preferredSku = assumption.preferredSku.trim();
  const sizingNote = assumption.sizingNote.trim();
  const chips = [
      createMatrixChip(
        `Lowest meter ${formatRetailPrice(
          pricing.startsAtTargetRetailPrice ?? pricing.startsAtRetailPrice,
          pricing.currencyCode
        )}`,
        "good"
      ),
    createMatrixChip(
      preferredSku || `${pricing.skuCount.toLocaleString()} published SKUs`,
      preferredSku ? "good" : "neutral"
    )
  ];

  if (pricing.targetRegionMatchCount > 0) {
    chips.push(
      createMatrixChip(`${pricing.targetRegionMatchCount.toLocaleString()} target matches`, "good")
    );
  } else {
    chips.push(createMatrixChip("No target-region match yet", "warning"));
  }

  return {
    chips,
    summary: [
      preferredSku
        ? `Preferred SKU "${preferredSku}" is captured as the design assumption, while the pricing snapshot still keeps all published SKU rows available for comparison.`
        : "No preferred SKU is set yet, so the pricing snapshot uses all published SKU rows for this service.",
      pricing.startsAtTargetRetailPrice !== undefined
        ? "The highlighted value is the lowest target-scope retail meter row, not a monthly calculator estimate."
        : "The highlighted value is the lowest published retail meter row, not a monthly calculator estimate.",
      targetRegions.length > 0
        ? pricing.targetRegionMatchCount > 0
          ? `Published retail rows currently line up with ${pricing.targetRegionMatchCount.toLocaleString()} selected target scope location${pricing.targetRegionMatchCount === 1 ? "" : "s"}, including billing zones when Microsoft prices a service that way.`
          : "No direct selected-region retail row is published yet, so this remains the broader Microsoft retail snapshot."
        : "No target region is captured yet, so the pricing snapshot is not region-filtered.",
      sizingNote
        ? "Sizing notes are saved for later estimate refinement."
        : "A sizing note is not required to fetch list pricing; add one later when you want to turn retail pricing into a usage-based estimate."
    ].join(" ")
  };
}

function classifyRegionalChip(chip: MatrixChip) {
  const normalized = chip.label.toLowerCase();

  if (
    normalized.includes("restricted") ||
    normalized.includes("unavailable") ||
    normalized.includes("not in feed")
  ) {
    return "blocker" as const;
  }

  if (
    normalized.includes("retiring") ||
    normalized.includes("preview") ||
    normalized.includes("early access")
  ) {
    return "caveat" as const;
  }

  if (normalized.includes("global service")) {
    return "global" as const;
  }

  if (normalized.includes("available")) {
    return "available" as const;
  }

  return "neutral" as const;
}

function formatPricingDrilldownRows(
  pricing: ServicePricing | undefined,
  assumption: ReviewServiceAssumption,
  targetRegions: string[]
) {
  if (!pricing) {
    return {
      ready: false,
      title: "Pricing not loaded yet",
      summary: "The pricing drilldown appears after the current retail pricing snapshot finishes loading.",
      rows: [] as ServicePricingRow[],
      skuLabels: [] as string[],
      hasHiddenRows: false
    };
  }

  if (!pricing.mapped || pricing.rows.length === 0) {
    return {
      ready: false,
      title: "No published retail rows",
      summary:
        pricing.notes[0] ??
        "Microsoft does not currently publish a clean standalone retail pricing mapping for this service.",
      rows: [] as ServicePricingRow[],
      skuLabels: [] as string[],
      hasHiddenRows: false
    };
  }

  const targetMatchedRows =
    targetRegions.length > 0
      ? pricing.rows.filter((row) =>
          matchesPricingTargetRegion(
            row.armRegionName,
            row.location,
            targetRegions,
            pricing.targetPricingLocations,
            row.locationKind
          )
        )
      : [];
  const scopedRows = targetMatchedRows.length > 0 ? targetMatchedRows : pricing.rows;
  const sortedRows = [...scopedRows].sort((left, right) => {
    if (left.retailPrice !== right.retailPrice) {
      return left.retailPrice - right.retailPrice;
    }

    return `${left.location}-${left.skuName}-${left.meterName}`.localeCompare(
      `${right.location}-${right.skuName}-${right.meterName}`
    );
  });
  const rows = sortedRows.slice(0, 12);
  const skuLabels = [...new Set(scopedRows.map((row) => row.skuName || row.armSkuName).filter(Boolean))];
  const preferredSku = assumption.preferredSku.trim();
  const title =
    targetMatchedRows.length > 0
      ? `Published retail rows in ${targetRegions.join(", ")}`
      : targetRegions.length > 0
        ? "No direct target-region retail rows"
        : "Published retail rows";
  const summaryParts = [
    preferredSku
      ? `Preferred SKU "${preferredSku}" is saved as a design assumption, but the drilldown still shows all published SKU rows for comparison.`
      : "No preferred SKU is set, so the drilldown includes all published SKU rows.",
    targetMatchedRows.length > 0
      ? `${targetMatchedRows.length.toLocaleString()} retail row${targetMatchedRows.length === 1 ? "" : "s"} currently match the selected target scope, including billing zones when Microsoft prices a service that way.`
      : targetRegions.length > 0
        ? "No direct selected-region retail rows are published yet, so this drilldown falls back to the broader Microsoft retail snapshot."
        : "No target region is captured yet, so this drilldown shows the broader Microsoft retail snapshot.",
    assumption.sizingNote.trim()
      ? "Sizing notes help turn list pricing into an estimate later."
      : "Sizing notes are optional; list pricing can still be reviewed without them."
  ];

  return {
    ready: true,
    title,
    summary: summaryParts.join(" "),
    rows,
    skuLabels,
    hasHiddenRows: sortedRows.length > rows.length
  };
}

function matchesPackageService(
  item: ChecklistItem,
  selectedServiceSlugs: Set<string>,
  selectedServiceNames: Set<string>
) {
  if (item.serviceSlug && selectedServiceSlugs.has(item.serviceSlug)) {
    return true;
  }

  const serviceName = (item.serviceCanonical ?? item.service ?? "").trim().toLowerCase();

  if (!serviceName) {
    return false;
  }

  return selectedServiceNames.has(serviceName);
}

type PackageFormState = {
  name: string;
  reviewMode: ReviewMode;
  audience: ReviewPackageAudience;
  businessScope: string;
  targetRegions: string;
};

type PackageActionTone = "neutral" | "success";

function createFormState(reviewPackage?: ReviewPackage): PackageFormState {
  return {
    name: reviewPackage?.name ?? "",
    reviewMode: reviewPackage?.reviewMode ?? "Standard review",
    audience: reviewPackage?.audience ?? "Cloud Architect",
    businessScope: reviewPackage?.businessScope ?? "",
    targetRegions: reviewPackage?.targetRegions.join(", ") ?? ""
  };
}

function resolveRequestedAudience(value: string | null): ReviewPackageAudience | null {
  if (!value) {
    return null;
  }

  return AUDIENCES.includes(value as ReviewPackageAudience)
    ? (value as ReviewPackageAudience)
    : null;
}

function parseHomepagePackagePreset(search: URLSearchParams): PackageFormState | null {
  const name = search.get("name")?.trim() ?? "";
  const businessScope = search.get("businessScope")?.trim() ?? "";
  const targetRegions = search.get("targetRegions")?.trim() ?? "";
  const audience = resolveRequestedAudience(search.get("audience")) ?? "Cloud Architect";

  if (!name && !businessScope && !targetRegions && !search.get("audience")) {
    return null;
  }

  return {
    name,
    reviewMode: "Standard review",
    audience,
    businessScope,
    targetRegions
  };
}

function clearHomepagePackagePresetSearch() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  ["intent", "name", "businessScope", "targetRegions", "audience"].forEach((key) => {
    url.searchParams.delete(key);
  });

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function getServiceAssumption(
  reviewPackage: ReviewPackage | null,
  serviceSlug: string
): ReviewServiceAssumption {
  return reviewPackage?.serviceAssumptions[serviceSlug] ?? createEmptyServiceAssumption();
}

function resolvePackageName(name: string) {
  return name.trim() || "Untitled project review";
}

function shouldShowSetupDetails(reviewPackage: ReviewPackage | null | undefined) {
  if (!reviewPackage) {
    return false;
  }

  return (
    reviewPackage.reviewMode !== "Standard review" ||
    reviewPackage.audience !== "Cloud Architect" ||
    reviewPackage.targetRegions.length > 0 ||
    reviewPackage.businessScope.trim().length > 0
  );
}

function resolveStageExpanded(
  expansion: Record<string, boolean>,
  stageId: string,
  complete: boolean
) {
  return expansion[stageId] ?? !complete;
}

function buildPreviewExcerpt(text: string, maxLines = 8, maxCharacters = 560) {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);

  if (lines.length === 0) {
    return "No preview is available yet.";
  }

  const joined = lines.join("\n");

  if (joined.length <= maxCharacters) {
    return joined;
  }

  return `${joined.slice(0, maxCharacters).trimEnd()}...`;
}

function buildCsvPreview(
  rows: Array<Record<string, string | number>>,
  maxRows = 2,
  maxColumns = 6
) {
  if (rows.length === 0) {
    return "No rows are available yet.";
  }

  const headers = Object.keys(rows[0]).slice(0, maxColumns);
  const previewRows = rows.slice(0, maxRows).map((row) =>
    headers.map((header) => String(row[header] ?? "")).join(" | ")
  );

  return [headers.join(" | "), ...previewRows].join("\n");
}

export function ReviewPackageWorkbench({
  index
}: {
  index: ServiceIndex;
}) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const [selectedServiceDrawerSlug, setSelectedServiceDrawerSlug] = useState<string | null>(null);
  const [requestedCloudReviewId, setRequestedCloudReviewId] = useState<string | null>(null);
  const [packages, setPackages] = useState<ReviewPackage[]>([]);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [form, setForm] = useState<PackageFormState>(createFormState());
  const [includeNotApplicable, setIncludeNotApplicable] = useState(true);
  const [includeNeedsReview, setIncludeNeedsReview] = useState(false);
  const [serviceRegionalFits, setServiceRegionalFits] = useState<Record<string, ServiceRegionalFit>>({});
  const [regionalFitLoading, setRegionalFitLoading] = useState(false);
  const [regionalFitError, setRegionalFitError] = useState<string | null>(null);
  const [servicePricing, setServicePricing] = useState<Record<string, ServicePricing>>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [showOnlyScopedServices, setShowOnlyScopedServices] = useState(true);
  const [showSetupDetails, setShowSetupDetails] = useState(false);
  const [stageExpansion, setStageExpansion] = useState<Record<string, boolean>>({});
  const [highlightedStageId, setHighlightedStageId] = useState<string | null>(null);
  const [packageActionMessage, setPackageActionMessage] = useState<string | null>(null);
  const [packageActionTone, setPackageActionTone] = useState<PackageActionTone>("neutral");
  const [cloudRestoreAttempted, setCloudRestoreAttempted] = useState(false);
  const [packagesHydrated, setPackagesHydrated] = useState(false);
  const [requestedHomepagePackagePreset, setRequestedHomepagePackagePreset] =
    useState<PackageFormState | null>(null);
  const [requestedHomepageCreate, setRequestedHomepageCreate] = useState(false);
  const [homepageCreateApplied, setHomepageCreateApplied] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/data/catalog.json")
      .then((response) => response.json())
      .then((payload: { items: ChecklistItem[] }) => {
        if (active) {
          setItems(payload.items);
        }
      });

    const storedPackages = loadPackages();
    const storedActivePackageId = loadActivePackageId();
    const fallbackPackageId = storedPackages[0]?.id ?? null;
    const nextActivePackageId = storedActivePackageId ?? fallbackPackageId;

    setPackages(storedPackages);
    setActivePackageId(nextActivePackageId);
    setReviews(loadScopedReviews(nextActivePackageId));

    const nextActivePackage = storedPackages.find((entry) => entry.id === nextActivePackageId);

    setForm(createFormState(nextActivePackage));
    setShowSetupDetails(shouldShowSetupDetails(nextActivePackage));
    setPackagesHydrated(true);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const search = new URLSearchParams(window.location.search);
    setRequestedCloudReviewId(search.get("cloudReviewId"));
    setRequestedHomepagePackagePreset(parseHomepagePackagePreset(search));
    setRequestedHomepageCreate(search.get("intent") === "create");
  }, []);

  useEffect(() => {
    if (!requestedHomepagePackagePreset) {
      return;
    }

    setForm((current) => ({
      name: requestedHomepagePackagePreset.name || current.name,
      reviewMode: requestedHomepagePackagePreset.reviewMode ?? current.reviewMode,
      audience: requestedHomepagePackagePreset.audience ?? current.audience,
      businessScope: requestedHomepagePackagePreset.businessScope || current.businessScope,
      targetRegions: requestedHomepagePackagePreset.targetRegions || current.targetRegions
    }));
    setShowSetupDetails(
      (current) =>
        current ||
        requestedHomepagePackagePreset.audience !== "Cloud Architect" ||
        requestedHomepagePackagePreset.businessScope.trim().length > 0 ||
        requestedHomepagePackagePreset.targetRegions.trim().length > 0
    );
  }, [requestedHomepagePackagePreset]);

  useEffect(() => {
    let active = true;

    if (cloudRestoreAttempted) {
      return () => {
        active = false;
      };
    }

    if (!requestedCloudReviewId && packages.length > 0) {
      setCloudRestoreAttempted(true);
      return () => {
        active = false;
      };
    }

    async function restoreFromCloud() {
      try {
        const principal = await fetchClientPrincipal();

        if (!active || !principal) {
          if (active) {
            setCloudRestoreAttempted(true);
          }
          return;
        }

        if (requestedCloudReviewId) {
          await activateCloudProjectReview(requestedCloudReviewId);
        }

        const [recordsDocument, stateDocument] = await Promise.all([
          loadCloudReviewRecords(),
          loadCloudProjectReviewState()
        ]);

        if (!active) {
          return;
        }

        handleRestoreCloudState({
          activePackage: stateDocument.activePackage,
          reviews: structuredRecordsToReviewMap(recordsDocument.records)
        });

        if (stateDocument.activePackage) {
          trackWorkspaceEvent({
            name: "review_cloud_action",
            category: "continuity",
            reviewId: stateDocument.activePackage.id,
            properties: {
              action: requestedCloudReviewId ? "restore-link" : "restore-session",
              recordCount: recordsDocument.recordCount,
              serviceCount: stateDocument.activePackage.selectedServiceSlugs.length
            }
          });
          setPackageActionTone("success");
          setPackageActionMessage(
            requestedCloudReviewId
              ? `Loaded "${stateDocument.activePackage.name}" from Azure and made it the active project review.`
              : `Restored "${stateDocument.activePackage.name}" from Azure for this signed-in user.`
          );
        }
      } catch (error) {
        if (!active) {
          return;
        }

        if (requestedCloudReviewId) {
          setPackageActionTone("neutral");
          setPackageActionMessage(
            error instanceof Error
              ? error.message
              : "Unable to restore the selected cloud-backed project review."
          );
        }
      } finally {
        if (active) {
          setCloudRestoreAttempted(true);
        }
      }
    }

    void restoreFromCloud();

    return () => {
      active = false;
    };
  }, [cloudRestoreAttempted, packages.length, requestedCloudReviewId]);

  const activePackage = useMemo(
    () => packages.find((entry) => entry.id === activePackageId) ?? null,
    [activePackageId, packages]
  );
  const normalizedServiceSearch = serviceSearch.trim().toLowerCase();
  const selectedServiceSlugSet = useMemo(
    () => new Set(activePackage?.selectedServiceSlugs ?? []),
    [activePackage]
  );
  const selectedServiceNameSet = useMemo(() => {
    const names = new Set<string>();

    index.services.forEach((service) => {
      if (!selectedServiceSlugSet.has(service.slug)) {
        return;
      }

      names.add(service.service.toLowerCase());
      service.aliases.forEach((alias) => names.add(alias.toLowerCase()));
    });

    return names;
  }, [index.services, selectedServiceSlugSet]);
  const visibleServices = useMemo(
    () =>
      index.services.filter((service) => {
        if (!normalizedServiceSearch) {
          return true;
        }

        const searchable = [service.service, ...service.aliases, ...service.categories]
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedServiceSearch);
      }),
    [index.services, normalizedServiceSearch]
  );
  const visibleReviewServices = useMemo(() => {
    if (!activePackage || !showOnlyScopedServices) {
      return visibleServices;
    }

    return visibleServices.filter((service) => selectedServiceSlugSet.has(service.slug));
  }, [activePackage, selectedServiceSlugSet, showOnlyScopedServices, visibleServices]);
  const selectedServices = useMemo(
    () =>
      index.services.filter((service) => activePackage?.selectedServiceSlugs.includes(service.slug) ?? false),
    [activePackage?.selectedServiceSlugs, index.services]
  );
  const starterServices = useMemo(
    () =>
      index.services
        .filter((service) => !(activePackage?.selectedServiceSlugs.includes(service.slug) ?? false))
        .sort(
          (left, right) =>
            right.familyCount - left.familyCount ||
            right.itemCount - left.itemCount ||
            left.service.localeCompare(right.service)
        )
        .slice(0, 6),
    [activePackage?.selectedServiceSlugs, index.services]
  );
  const starterBundles = useMemo(() => {
    const serviceByName = new Map(index.services.map((service) => [service.service, service]));

    return [
      {
        title: "Edge web baseline",
        description:
          "Front Door, App Service, Storage, and Key Vault for an internet-facing app review.",
        bestFor: "Public web apps and pre-sales web landing zones",
        watchFor: "Add network controls later if the workload cannot stay internet-facing.",
        nextMoves: ["Add monitoring and diagnostics", "Add identity and access boundaries", "Decide whether WAF or private ingress is required"],
        services: [
          serviceByName.get("Azure Front Door"),
          serviceByName.get("Azure App Service"),
          serviceByName.get("Azure Storage Account"),
          serviceByName.get("Azure Key Vault")
        ].filter(Boolean),
        followUpServices: [
          serviceByName.get("Azure Monitor"),
          serviceByName.get("Microsoft Entra ID"),
          serviceByName.get("Azure Web Application Firewall")
        ].filter(Boolean)
      },
      {
        title: "Private ingress baseline",
        description:
          "Application Gateway, Virtual Network, Key Vault, and Storage for a controlled ingress pattern.",
        bestFor: "Private entry points and network-controlled application tiers",
        watchFor: "Usually expands with identity, monitoring, and outbound controls.",
        nextMoves: ["Add outbound connectivity controls", "Add monitoring and diagnostics", "Decide where identity and secrets terminate"],
        services: [
          serviceByName.get("Azure Application Gateway"),
          serviceByName.get("Azure Virtual Network"),
          serviceByName.get("Azure Key Vault"),
          serviceByName.get("Azure Storage Account")
        ].filter(Boolean),
        followUpServices: [
          serviceByName.get("Azure Monitor"),
          serviceByName.get("Microsoft Entra ID"),
          serviceByName.get("Azure Firewall")
        ].filter(Boolean)
      },
      {
        title: "AKS delivery baseline",
        description:
          "AKS, Container Registry, Key Vault, and Virtual Network for a container platform review.",
        bestFor: "Container platform reviews and platform engineering conversations",
        watchFor: "Expect follow-up scope around ingress, observability, and policy controls.",
        nextMoves: ["Add ingress and traffic management", "Add observability and logging", "Add policy, registry, and secret rotation controls"],
        services: [
          serviceByName.get("Azure Kubernetes Service (AKS)"),
          serviceByName.get("Azure Container Registry"),
          serviceByName.get("Azure Key Vault"),
          serviceByName.get("Azure Virtual Network")
        ].filter(Boolean),
        followUpServices: [
          serviceByName.get("Azure Monitor"),
          serviceByName.get("Azure Application Gateway"),
          serviceByName.get("Azure Policy")
        ].filter(Boolean)
      }
    ]
      .map((bundle) => ({
        ...bundle,
        services: bundle.services.filter(
          (service): service is (typeof index.services)[number] => Boolean(service)
        ),
        followUpServices: bundle.followUpServices.filter(
          (service): service is (typeof index.services)[number] => Boolean(service)
        )
      }))
      .filter((bundle) => bundle.services.length >= 2);
  }, [index.services]);
  const packageItems = useMemo(() => {
    if (!items || !activePackage) {
      return [];
    }

    return items.filter((item) =>
      matchesPackageService(item, selectedServiceSlugSet, selectedServiceNameSet)
    );
  }, [activePackage, items, selectedServiceNameSet, selectedServiceSlugSet]);

  const includedCount = packageItems.filter(
    (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Include"
  ).length;
  const notApplicableCount = packageItems.filter(
    (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Not Applicable"
  ).length;
  const excludedCount = packageItems.filter(
    (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Exclude"
  ).length;
  const pendingCount = packageItems.filter(
    (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Needs Review"
  ).length;
  const pricingSnapshots = useMemo(
    () =>
      selectedServices
        .map((service) => servicePricing[service.slug])
        .filter(Boolean) as ServicePricing[],
    [selectedServices, servicePricing]
  );
  const monthlyEstimates = useMemo(
    () =>
      selectedServices
        .map((service) =>
          buildServiceMonthlyEstimate(
            servicePricing[service.slug],
            getServiceAssumption(activePackage, service.slug),
            activePackage?.targetRegions ?? []
          )
        )
        .filter(Boolean) as ServiceMonthlyEstimate[],
    [activePackage, selectedServices, servicePricing]
  );
  const mappedPricingCount = pricingSnapshots.filter((pricing) => pricing.mapped).length;
  const pricingReady = selectedServices.length > 0 && pricingSnapshots.length === selectedServices.length;
  const monthlyEstimateReady =
    selectedServices.length > 0 && monthlyEstimates.length === selectedServices.length;
  const startingRetailPrice = pricingSnapshots
    .map((pricing) => pricing.startsAtTargetRetailPrice ?? pricing.startsAtRetailPrice)
    .filter((price) => price !== undefined) as number[];
  const supportedMonthlyEstimates = monthlyEstimates.filter((estimate) => estimate.supported);
  const totalMonthlyEstimate = supportedMonthlyEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedMonthlyCost ?? 0),
    0
  );
  const totalHourlyEstimate = supportedMonthlyEstimates.reduce(
    (accumulator, estimate) => accumulator + (estimate.selectedHourlyCost ?? 0),
    0
  );
  const reviewedDecisionCount = includedCount + notApplicableCount + excludedCount;
  const allScopedFindingsResolved = packageItems.length > 0 && pendingCount === 0;
  const reviewWorkspaceMetrics = [
    {
      label: "Active review",
      value: activePackage?.name ?? "No active review",
      detail: activePackage
        ? `${activePackage.targetRegions.length.toLocaleString()} target region${activePackage.targetRegions.length === 1 ? "" : "s"} captured.`
        : "Only the project review name is required to start."
    },
    {
      label: "Services in scope",
      value: selectedServices.length.toLocaleString(),
      detail:
        selectedServices.length > 0
          ? "Pricing, matrix, and exports stay aligned to this exact service boundary."
          : "Add only the Azure services that truly belong to this architecture."
    },
    {
      label: "Decisions captured",
      value: reviewedDecisionCount.toLocaleString(),
      detail:
        reviewedDecisionCount > 0
          ? `${pendingCount.toLocaleString()} scoped finding${pendingCount === 1 ? "" : "s"} still waiting for a decision.`
          : "The matrix and service notes become useful once services are in scope."
    },
    {
      label: "Outputs posture",
      value: allScopedFindingsResolved ? "Ready" : packageItems.length > 0 ? "Draft" : "Waiting",
      detail:
        allScopedFindingsResolved
          ? "Scoped exports, pricing, and leadership output are ready to hand off."
          : packageItems.length > 0
            ? "Exports are available, but pending decisions still keep them in draft posture."
            : "Exports unlock after the review contains real scoped services and findings."
    }
  ];
  const selectedServiceProgress = useMemo(
    () =>
      selectedServices.map((service) => {
        const serviceNameSet = new Set(
          [service.service, ...service.aliases].map((value) => value.trim().toLowerCase())
        );
        const serviceItems = packageItems.filter((item) => {
          if (item.serviceSlug && item.serviceSlug === service.slug) {
            return true;
          }

          const serviceName = (item.serviceCanonical ?? item.service ?? "").trim().toLowerCase();
          return serviceName ? serviceNameSet.has(serviceName) : false;
        });

        return {
          service,
          serviceItems,
          itemCount: serviceItems.length,
          includedCount: serviceItems.filter(
            (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Include"
          ).length,
          notApplicableCount: serviceItems.filter(
            (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Not Applicable"
          ).length,
          excludedCount: serviceItems.filter(
            (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Exclude"
          ).length,
          pendingCount: serviceItems.filter(
            (item) => (reviews[item.guid]?.packageDecision ?? "Needs Review") === "Needs Review"
          ).length
        };
      }),
    [packageItems, reviews, selectedServices]
  );
  const signalFollowUp = useMemo(() => {
    const servicesNeedingDecisions = [...selectedServiceProgress]
      .filter((entry) => entry.pendingCount > 0)
      .sort(
        (left, right) =>
          right.pendingCount - left.pendingCount ||
          right.itemCount - left.itemCount ||
          left.service.service.localeCompare(right.service.service)
      );

    return {
      servicesNeedingDecisions,
      servicesReadyForExportCount: selectedServiceProgress.filter(
        (entry) => entry.itemCount > 0 && entry.pendingCount === 0
      ).length,
      nextServiceNames: servicesNeedingDecisions.slice(0, 3).map((entry) => entry.service.service)
    };
  }, [selectedServiceProgress]);
  const activeStarterBundle = useMemo(() => {
    if (selectedServiceSlugSet.size === 0) {
      return null;
    }

    const rankedBundles = starterBundles
      .map((bundle) => {
        const overlapCount = bundle.services.filter((service) => selectedServiceSlugSet.has(service.slug)).length;

        return {
          ...bundle,
          overlapCount
        };
      })
      .filter((bundle) => bundle.overlapCount >= Math.min(2, bundle.services.length))
      .sort(
        (left, right) =>
          right.overlapCount - left.overlapCount ||
          right.services.length - left.services.length ||
          left.title.localeCompare(right.title)
      );

    return rankedBundles[0] ?? null;
  }, [selectedServiceSlugSet, starterBundles]);
  const nextScopeServiceSuggestions = useMemo(() => {
    if (!activeStarterBundle) {
      return [];
    }

    return activeStarterBundle.followUpServices.filter(
      (service) => !selectedServiceSlugSet.has(service.slug)
    );
  }, [activeStarterBundle, selectedServiceSlugSet]);
  const workspaceStages = useMemo(() => {
    const stages = [
      {
        id: "project-review-setup",
        label: "Setup",
        title: "Review setup",
        detail: activePackage
          ? `${activePackage.name} is active.`
          : "Create the active review before the guided workflow opens up.",
        complete: Boolean(activePackage),
        available: true,
        optional: false
      },
      {
        id: "project-review-scope",
        label: "Scope",
        title: "Choose in-scope services",
        detail:
          selectedServices.length > 0
            ? `${selectedServices.length.toLocaleString()} services are currently in scope.`
            : "Keep the service boundary honest before reviewing deeper signals.",
        complete: selectedServices.length > 0,
        available: Boolean(activePackage),
        optional: false
      },
      {
        id: "project-review-signals",
        label: "Signals",
        title: "Review readiness, region fit, and notes",
        detail:
          allScopedFindingsResolved
            ? `${packageItems.length.toLocaleString()} scoped findings now have explicit review decisions.`
            : reviewedDecisionCount > 0
            ? `${reviewedDecisionCount.toLocaleString()} findings already have a project decision, but ${pendingCount.toLocaleString()} are still pending.`
            : "Use the matrix and service notes to turn scope into an actual review posture.",
        complete: allScopedFindingsResolved,
        available: selectedServices.length > 0,
        optional: false
      },
      {
        id: "project-review-local-exports",
        label: "Outputs",
        title: "Generate scoped exports",
        detail:
          packageItems.length > 0
            ? allScopedFindingsResolved
              ? `${packageItems.length.toLocaleString()} scoped findings are fully ready for export.`
              : reviewedDecisionCount > 0
              ? `${reviewedDecisionCount.toLocaleString()} findings are decided for export, but ${pendingCount.toLocaleString()} are still pending.`
              : `${packageItems.length.toLocaleString()} scoped findings are available, but the review still needs explicit decisions.`
            : "Exports unlock after services enter scope.",
        complete: allScopedFindingsResolved,
        available: selectedServices.length > 0,
        optional: false
      },
      {
        id: "project-review-cloud-continuity",
        label: "Continuity",
        title: "Save or resume later",
        detail: activePackage
          ? "Azure-backed continuity is available, but still optional."
          : "Create a review first if you want to save it to Azure later.",
        complete: false,
        available: Boolean(activePackage),
        optional: true
      }
    ];

    let assignedCurrent = false;

    return stages.map((stage) => {
      if (stage.complete) {
        return {
          ...stage,
          status: "completed" as const
        };
      }

      if (stage.optional && stage.available) {
        return {
          ...stage,
          status: "optional" as const
        };
      }

      if (!assignedCurrent && stage.available) {
        assignedCurrent = true;
        return {
          ...stage,
          status: "current" as const
        };
      }

      return {
        ...stage,
        status: "upcoming" as const
      };
    });
  }, [activePackage, allScopedFindingsResolved, packageItems.length, pendingCount, reviewedDecisionCount, selectedServices.length]);
  const setupStageExpanded = resolveStageExpanded(
    stageExpansion,
    "project-review-setup",
    Boolean(activePackage)
  );
  const scopeStageExpanded = resolveStageExpanded(
    stageExpansion,
    "project-review-scope",
    selectedServices.length > 0
  );
  const signalsStageExpanded = resolveStageExpanded(
    stageExpansion,
    "project-review-signals",
    allScopedFindingsResolved
  );
  const outputsStageExpanded = resolveStageExpanded(
    stageExpansion,
    "project-review-local-exports",
    allScopedFindingsResolved
  );
  const continuityStageExpanded = resolveStageExpanded(
    stageExpansion,
    "project-review-cloud-continuity",
    false
  );
  const currentWorkspaceStage =
    workspaceStages.find((stage) => stage.status === "current") ?? workspaceStages[0];
  const reviewStatusLabel = !activePackage
    ? "Not started"
    : allScopedFindingsResolved
      ? "Ready to export"
      : selectedServices.length === 0
        ? "Setup in progress"
        : pendingCount > 0
          ? "In review"
          : "Draft";
  const evidenceLevelLabel =
    packageItems.length === 0
      ? "No findings in scope yet"
      : pendingCount === 0
        ? "All scoped findings reviewed"
        : `${reviewedDecisionCount.toLocaleString()} of ${packageItems.length.toLocaleString()} findings reviewed`;
  const nextActionLabel = !activePackage
    ? "Create the review basics"
    : selectedServices.length === 0
      ? "Add services to scope"
      : pendingCount > 0
        ? "Review findings and rationale"
        : "Export the review pack";

  function toggleStageExpansion(stageId: string, complete: boolean) {
    setStageExpansion((current) => ({
      ...current,
      [stageId]: !(current[stageId] ?? !complete)
    }));
  }

  function openStage(stageId: string) {
    setStageExpansion((current) => ({
      ...current,
      [stageId]: true
    }));
    setHighlightedStageId(stageId);

    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = new URL(window.location.href);

    nextUrl.hash = stageId;
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    document.getElementById(stageId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stageIds = new Set([
      "project-review-setup",
      "project-review-scope",
      "project-review-signals",
      "project-review-local-exports",
      "project-review-cloud-continuity"
    ]);

    const syncHashStage = () => {
      const nextHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));

      if (!nextHash || !stageIds.has(nextHash)) {
        return;
      }

      setStageExpansion((current) => ({
        ...current,
        [nextHash]: true
      }));
      setHighlightedStageId(nextHash);
    };

    syncHashStage();
    window.addEventListener("hashchange", syncHashStage);

    return () => {
      window.removeEventListener("hashchange", syncHashStage);
    };
  }, []);

  useEffect(() => {
    if (!highlightedStageId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHighlightedStageId((current) => (current === highlightedStageId ? null : current));
    }, 1800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [highlightedStageId]);

  useEffect(() => {
    let active = true;

    if (!activePackage || selectedServices.length === 0) {
      setServiceRegionalFits({});
      setRegionalFitLoading(false);
      setRegionalFitError(null);
      return;
    }

    setRegionalFitLoading(true);
    setRegionalFitError(null);

    loadServiceRegionalFitBatch(
      selectedServices.map((service) => buildServiceRegionalFitRequest(service))
    )
      .then((regionalFits) => {
        if (!active) {
          return;
        }

        setServiceRegionalFits(
          regionalFits.reduce<Record<string, ServiceRegionalFit>>((accumulator, entry) => {
            if (entry.serviceSlug) {
              accumulator[entry.serviceSlug] = entry;
            }
            return accumulator;
          }, {})
        );
        setRegionalFitLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setRegionalFitLoading(false);
        setRegionalFitError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load live regional availability."
        );
      });

    return () => {
      active = false;
    };
  }, [activePackage, selectedServices]);

  useEffect(() => {
    let active = true;

    if (!activePackage || selectedServices.length === 0) {
      setServicePricing({});
      setPricingLoading(false);
      setPricingError(null);
      return;
    }

    setPricingLoading(true);
    setPricingError(null);

    loadServicePricingBatch(
      selectedServices.map((service) =>
        buildServicePricingRequest(service, service.regionalFitSummary, activePackage.targetRegions)
      )
    )
      .then((pricing) => {
        if (!active) {
          return;
        }

        setServicePricing(
          pricing.reduce<Record<string, ServicePricing>>((accumulator, entry) => {
            accumulator[entry.serviceSlug] = entry;
            return accumulator;
          }, {})
        );
        setPricingLoading(false);
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }

        setPricingLoading(false);
        setPricingError(nextError instanceof Error ? nextError.message : "Unable to load pricing.");
      });

    return () => {
      active = false;
    };
  }, [activePackage, selectedServices]);

  const matrixRows = useMemo(
    () =>
      selectedServiceProgress.map((entry) => {
        const liveRegionalFit = serviceRegionalFits[entry.service.slug];
        const regionFit = buildRegionFitMatrix(
          liveRegionalFit,
          entry.service.regionalFitSummary,
          activePackage?.targetRegions ?? []
        );
        const serviceAssumption = getServiceAssumption(activePackage, entry.service.slug);
        const costFit = buildCostFitMatrix(
          servicePricing[entry.service.slug],
          pricingLoading,
          pricingError,
          serviceAssumption,
          activePackage?.targetRegions ?? []
        );
        const pricingDrilldown = formatPricingDrilldownRows(
          servicePricing[entry.service.slug],
          serviceAssumption,
          activePackage?.targetRegions ?? []
        );
        const checklistChips: MatrixChip[] = [
          createMatrixChip(`${entry.includedCount.toLocaleString()} included`, "good"),
          createMatrixChip(`${entry.notApplicableCount.toLocaleString()} not applicable`, "warning"),
          createMatrixChip(`${entry.pendingCount.toLocaleString()} pending`, "neutral")
        ];

        if (entry.excludedCount > 0) {
          checklistChips.push(
            createMatrixChip(`${entry.excludedCount.toLocaleString()} excluded`, "danger")
          );
        }

        return {
          ...entry,
          regionFit,
          costFit,
          pricingDrilldown,
          checklistChips,
          regionalFit: liveRegionalFit,
          pricing: servicePricing[entry.service.slug],
          serviceAssumption,
          checklistSummary:
            `${entry.itemCount.toLocaleString()} findings across ${entry.service.familyCount.toLocaleString()} families are currently tied to this service in the active project review.`
        };
      }),
    [
      activePackage?.targetRegions,
      pricingError,
      pricingLoading,
      selectedServiceProgress,
      servicePricing,
      serviceRegionalFits
    ]
  );
  const regionalRiskSummary = useMemo(() => {
    const blockedServices: Array<{ serviceName: string; signals: string[] }> = [];
    const caveatServices: Array<{ serviceName: string; signals: string[] }> = [];
    const globalServices: string[] = [];
    const availableServices: string[] = [];

    matrixRows.forEach((row) => {
      const blockerSignals = row.regionFit.chips
        .filter((chip) => classifyRegionalChip(chip) === "blocker")
        .map((chip) => chip.label);
      const caveatSignals = row.regionFit.chips
        .filter((chip) => classifyRegionalChip(chip) === "caveat")
        .map((chip) => chip.label);
      const hasGlobalSignal = row.regionFit.chips.some(
        (chip) => classifyRegionalChip(chip) === "global"
      );
      const hasAvailableSignal = row.regionFit.chips.some(
        (chip) => classifyRegionalChip(chip) === "available"
      );

      if (blockerSignals.length > 0) {
        blockedServices.push({
          serviceName: row.service.service,
          signals: blockerSignals
        });
        return;
      }

      if (caveatSignals.length > 0) {
        caveatServices.push({
          serviceName: row.service.service,
          signals: caveatSignals
        });
        return;
      }

      if (hasGlobalSignal) {
        globalServices.push(row.service.service);
        return;
      }

      if (hasAvailableSignal) {
        availableServices.push(row.service.service);
      }
    });

    return {
      blockedServices,
      caveatServices,
      globalServices,
      availableServices
    };
  }, [matrixRows]);
  const serviceComparisonRows = useMemo(
    () =>
      matrixRows
        .map((row) => {
          const blockerCount = row.regionFit.chips.filter(
            (chip) => classifyRegionalChip(chip) === "blocker"
          ).length;
          const caveatCount = row.regionFit.chips.filter(
            (chip) => classifyRegionalChip(chip) === "caveat"
          ).length;
          const estimate = monthlyEstimates.find(
            (entry) => entry.serviceSlug === row.service.slug
          );
          const pricingMapped = row.pricing?.mapped ?? false;
          const readiness =
            blockerCount > 0
              ? "Blocked"
              : caveatCount > 0
                ? "Caveat"
                : row.pendingCount > 0
                  ? "Needs decisions"
                  : "Ready";

          return {
            serviceSlug: row.service.slug,
            serviceName: row.service.service,
            pendingCount: row.pendingCount,
            blockerCount,
            caveatCount,
            pricingMapped,
            monthlyEstimateSupported: estimate?.supported ?? false,
            monthlyEstimate: estimate?.selectedMonthlyCost,
            estimateCurrencyCode: estimate?.currencyCode ?? row.pricing?.currencyCode ?? "USD",
            readiness,
            riskScore:
              blockerCount * 100 +
              caveatCount * 25 +
              Math.min(row.pendingCount, 40) +
              (pricingMapped ? 0 : 15) +
              (estimate?.supported ? 0 : 8)
          };
        })
        .sort(
          (left, right) =>
            right.riskScore - left.riskScore ||
            right.pendingCount - left.pendingCount ||
            left.serviceName.localeCompare(right.serviceName)
        ),
    [matrixRows, monthlyEstimates]
  );
  const regionalRiskExportRows = useMemo(() => {
    if (!activePackage) {
      return [];
    }

    return [
      ...regionalRiskSummary.blockedServices.map((entry) => ({
        serviceSlug:
          selectedServices.find((service) => service.service === entry.serviceName)?.slug ?? "",
        serviceName: entry.serviceName,
        classification: "Blocked" as const,
        signals: entry.signals
      })),
      ...regionalRiskSummary.caveatServices.map((entry) => ({
        serviceSlug:
          selectedServices.find((service) => service.service === entry.serviceName)?.slug ?? "",
        serviceName: entry.serviceName,
        classification: "Caveat" as const,
        signals: entry.signals
      })),
      ...regionalRiskSummary.globalServices.map((serviceName) => ({
        serviceSlug: selectedServices.find((service) => service.service === serviceName)?.slug ?? "",
        serviceName,
        classification: "Global" as const,
        signals: ["Global service"]
      })),
      ...regionalRiskSummary.availableServices.map((serviceName) => ({
        serviceSlug: selectedServices.find((service) => service.service === serviceName)?.slug ?? "",
        serviceName,
        classification: "Available" as const,
        signals: ["Available without caveat"]
      }))
    ];
  }, [activePackage, regionalRiskSummary, selectedServices]);
  const outputFocusCards = useMemo(() => {
    const highestPressureServices = serviceComparisonRows
      .filter((entry) => entry.riskScore > 0)
      .slice(0, 3);
    const mostReadyServices = serviceComparisonRows
      .filter((entry) => entry.readiness === "Ready")
      .slice(0, 3);
    const commercialWatchlist = serviceComparisonRows
      .filter((entry) => !entry.pricingMapped || !entry.monthlyEstimateSupported)
      .slice(0, 3);

    return [
      {
        title: "Top risk summary",
        eyebrow: "Before export",
        summary:
          highestPressureServices.length > 0
            ? "Start the handoff with the services carrying blockers, unresolved findings, or commercial gaps."
            : "No high-pressure services are currently standing out ahead of export.",
        bullets:
          highestPressureServices.length > 0
            ? highestPressureServices.map((entry) => {
                const riskParts = [
                  entry.blockerCount > 0
                    ? `${entry.blockerCount.toLocaleString()} blockers`
                    : null,
                  entry.caveatCount > 0
                    ? `${entry.caveatCount.toLocaleString()} caveats`
                    : null,
                  entry.pendingCount > 0
                    ? `${entry.pendingCount.toLocaleString()} pending findings`
                    : null
                ].filter(Boolean);

                return `${entry.serviceName}: ${riskParts.join(", ") || entry.readiness}`;
              })
            : ["No service is currently flagged as blocked, caveated, or overloaded with unresolved findings."]
      },
      {
        title: "Service comparison",
        eyebrow: "Readiness snapshot",
        summary:
          serviceComparisonRows.length > 0
            ? "Compare the scoped services before choosing which artifact should carry the next conversation."
            : "Service comparison appears after the review has scoped services.",
        bullets:
          serviceComparisonRows.length > 0
            ? serviceComparisonRows.slice(0, 4).map((entry) => {
                const estimateLabel = entry.monthlyEstimateSupported
                  ? formatEstimatePrice(entry.monthlyEstimate, entry.estimateCurrencyCode)
                  : "Estimate pending";

                return `${entry.serviceName}: ${entry.readiness} · ${entry.pendingCount.toLocaleString()} pending · ${estimateLabel}/month`;
              })
            : ["Add services to scope before comparing readiness, pricing, and pending decisions."]
      },
      {
        title: "Commercial watchlist",
        eyebrow: "Pricing and estimate gaps",
        summary:
          commercialWatchlist.length > 0
            ? "These services still need extra commercial attention before the export can stand on its own."
            : "Every scoped service currently has a pricing mapping and at least a first-pass monthly estimate."
            ,
        bullets:
          commercialWatchlist.length > 0
            ? commercialWatchlist.map((entry) => {
                const gaps = [
                  !entry.pricingMapped ? "pricing mapping pending" : null,
                  !entry.monthlyEstimateSupported ? "estimate model pending" : null
                ].filter(Boolean);

                return `${entry.serviceName}: ${gaps.join(", ")}`;
              })
            : ["No scoped services are currently missing pricing coverage or estimate support."]
      },
      {
        title: "Most review-ready",
        eyebrow: "Fastest to hand off",
        summary:
          mostReadyServices.length > 0
            ? "These services already look clean enough to anchor the architecture and leadership artifacts."
            : "No service is fully review-ready yet. Close pending findings or blockers before using that tone in the handoff.",
        bullets:
          mostReadyServices.length > 0
            ? mostReadyServices.map((entry) => `${entry.serviceName}: ready with scoped pricing and no pending findings`)
            : ["The fastest win is to clear the remaining pending findings on the least risky services first."]
      }
    ];
  }, [serviceComparisonRows]);
  const outputArtifactCards = useMemo(() => {
    if (!activePackage) {
      return [];
    }

    const checklistRows = buildPackageExportRows(activePackage, packageItems, reviews, {
      includeNotApplicable,
      includeNeedsReview
    });
    const designMarkdown = buildPackageMarkdown(activePackage, packageItems, reviews, {
      includeNotApplicable,
      includeNeedsReview
    });
    const pricingRows = buildPackagePricingRows(activePackage, pricingSnapshots);
    const pricingMarkdown = buildPackagePricingMarkdown(activePackage, pricingSnapshots);
    const estimateRows = buildPackageMonthlyEstimateRows(activePackage, monthlyEstimates);
    const estimateMarkdown = buildPackageMonthlyEstimateMarkdown(activePackage, monthlyEstimates);
    const leadershipMarkdown = buildLeadershipSummaryMarkdown(activePackage, {
      selectedServiceCount: selectedServices.length,
      blockedServices: regionalRiskSummary.blockedServices,
      caveatServices: regionalRiskSummary.caveatServices,
      globalServices: regionalRiskSummary.globalServices,
      availableServices: regionalRiskSummary.availableServices,
      pricingMappedCount: mappedPricingCount,
      selectedPricingCount: pricingSnapshots.length,
      startingRetailPrice:
        startingRetailPrice.length > 0 ? Math.min(...startingRetailPrice) : undefined,
      pricingCurrencyCode: pricingSnapshots[0]?.currencyCode,
      includedCount,
      notApplicableCount,
      excludedCount,
      pendingCount
    });

    return [
      {
        id: "checklist",
        eyebrow: "Implementation tracker",
        title: "Checklist CSV",
        summary:
          checklistRows.length > 0
            ? `${checklistRows.length.toLocaleString()} scoped finding rows are ready for spreadsheet tracking and action assignment.`
            : "This preview appears once the review has scoped findings to export.",
        readiness: checklistRows.length > 0 ? "Ready" : "Waiting on scoped findings",
        previewLabel: "CSV preview",
        preview: buildCsvPreview(checklistRows),
        bullets: [
          `${includedCount.toLocaleString()} included items`,
          `${notApplicableCount.toLocaleString()} not applicable items`,
          includeNeedsReview ? "Needs-review rows included" : "Needs-review rows hidden"
        ]
      },
      {
        id: "design",
        eyebrow: "Architecture handoff",
        title: "Design Markdown",
        summary:
          packageItems.length > 0
            ? "Reusable design notes with service assumptions, checklist decisions, and scoped context."
            : "This preview appears after the review has real scope and notes.",
        readiness: packageItems.length > 0 ? "Ready" : "Waiting on scoped findings",
        previewLabel: "Markdown preview",
        preview: buildPreviewExcerpt(designMarkdown),
        bullets: [
          selectedServices.length > 0
            ? `${selectedServices.length.toLocaleString()} services in scope`
            : "No services selected yet",
          activePackage.targetRegions.length > 0
            ? `${activePackage.targetRegions.length.toLocaleString()} target regions captured`
            : "Target regions still optional",
          activePackage.businessScope.trim() ? "Business scope captured" : "Business scope still optional"
        ]
      },
      {
        id: "pricing",
        eyebrow: "Commercial snapshot",
        title: "Pricing export",
        summary:
          pricingRows.length > 0
            ? "Public retail pricing rows for only the services in this review, ready for pre-sales and architecture conversations."
            : "Pricing preview appears after the scoped retail snapshot finishes loading.",
        readiness:
          pricingRows.length > 0
            ? `${mappedPricingCount.toLocaleString()} services mapped`
            : pricingLoading
              ? "Waiting on pricing load"
              : "Waiting on pricing scope",
        previewLabel: "Pricing preview",
        preview: buildPreviewExcerpt(pricingMarkdown),
        bullets: [
          `${pricingSnapshots.length.toLocaleString()} scoped pricing snapshots`,
          `${mappedPricingCount.toLocaleString()} pricing mappings`,
          startingRetailPrice.length > 0
            ? `Lowest meter ${formatRetailPrice(Math.min(...startingRetailPrice), pricingSnapshots[0]?.currencyCode ?? "USD")}`
            : "Lowest meter not published"
        ]
      },
      {
        id: "estimate",
        eyebrow: "Monthly baseline",
        title: "Estimate export",
        summary:
          estimateRows.length > 0
            ? "First-pass monthly estimates based on Microsoft retail rows and scoped service assumptions."
            : "Estimate preview appears after pricing loads and at least one scoped service has an estimate model.",
        readiness:
          estimateRows.length > 0
            ? `${supportedMonthlyEstimates.length.toLocaleString()} services modeled`
            : pricingLoading
              ? "Waiting on pricing load"
              : "Waiting on estimate model",
        previewLabel: "Estimate preview",
        preview: buildPreviewExcerpt(estimateMarkdown),
        bullets: [
          supportedMonthlyEstimates.length > 0
            ? `Estimated monthly total ${formatEstimatePrice(totalMonthlyEstimate, supportedMonthlyEstimates[0]?.currencyCode ?? "USD")}`
            : "Monthly total not modeled yet",
          supportedMonthlyEstimates.length > 0
            ? `Estimated hourly total ${formatEstimatePrice(totalHourlyEstimate, supportedMonthlyEstimates[0]?.currencyCode ?? "USD")}`
            : "Hourly total not modeled yet",
          `${(monthlyEstimates.length - supportedMonthlyEstimates.length).toLocaleString()} services still need richer assumptions`
        ]
      },
      {
        id: "leadership",
        eyebrow: "Leadership brief",
        title: "Leadership summary",
        summary:
          matrixRows.length > 0
            ? "Executive-ready blockers, caveats, pricing posture, and recommended next actions."
            : "Leadership preview appears after the review has enough service scope to summarize real risk.",
        readiness:
          matrixRows.length > 0
            ? `${regionalRiskSummary.blockedServices.length.toLocaleString()} blocked and ${regionalRiskSummary.caveatServices.length.toLocaleString()} caveated services`
            : "Waiting on scoped services",
        previewLabel: "Leadership preview",
        preview: buildPreviewExcerpt(leadershipMarkdown),
        bullets: [
          `${regionalRiskExportRows.length.toLocaleString()} regional risk rows ready`,
          `${pendingCount.toLocaleString()} pending findings still affect sign-off`,
          `${mappedPricingCount.toLocaleString()} services with pricing mapped`
        ]
      }
    ];
  }, [
    activePackage,
    excludedCount,
    includeNeedsReview,
    includeNotApplicable,
    includedCount,
    mappedPricingCount,
    matrixRows.length,
    monthlyEstimates,
    notApplicableCount,
    packageItems,
    pendingCount,
    pricingLoading,
    pricingSnapshots,
    regionalRiskExportRows.length,
    regionalRiskSummary.availableServices,
    regionalRiskSummary.blockedServices,
    regionalRiskSummary.caveatServices,
    regionalRiskSummary.globalServices,
    reviews,
    selectedServices.length,
    startingRetailPrice,
    supportedMonthlyEstimates.length,
    totalHourlyEstimate,
    totalMonthlyEstimate
  ]);
  const pricingStageStatus = useMemo(() => {
    if (selectedServices.length === 0) {
      return {
        title: "Pricing is still locked by service scope.",
        summary:
          "Select the services that actually belong to this design first. Then the workspace can ask the retail prices feed only for that scoped list.",
        chips: ["Step 2 scope required", "No pricing rows queried yet"]
      };
    }

    if (pricingLoading) {
      return {
        title: "Pricing is loading for the scoped services.",
        summary:
          "The workspace is querying Microsoft retail pricing now. Stay here if you want the detailed commercial surface, or use the output previews above once the rows arrive.",
        chips: [
          `${selectedServices.length.toLocaleString()} services in scope`,
          "Retail pricing refresh in progress"
        ]
      };
    }

    if (pricingError) {
      return {
        title: "Pricing is scoped, but the latest retail refresh did not finish.",
        summary:
          "The detailed pricing stage keeps the review boundary, but the dedicated backend needs to return the retail rows before this section becomes a dependable handoff surface.",
        chips: [
          `${selectedServices.length.toLocaleString()} services in scope`,
          "Retail pricing refresh failed"
        ]
      };
    }

    return {
      title:
        mappedPricingCount > 0
          ? "Pricing is ready for commercial review."
          : "Pricing is in scope, but no clean service mapping is published yet.",
      summary:
        mappedPricingCount > 0
          ? "Use this section when you want the detailed commercial drilldown behind the audience-first pricing preview in the output stage."
          : "The project review boundary is already correct. The remaining work is a pricing-data mapping gap, not a scoping problem.",
      chips: [
        `${pricingSnapshots.length.toLocaleString()} pricing snapshots`,
        `${mappedPricingCount.toLocaleString()} pricing mappings`,
        activePackage?.targetRegions.length
          ? `${activePackage.targetRegions.length.toLocaleString()} target regions`
          : "Target regions still optional"
      ]
    };
  }, [
    activePackage?.targetRegions.length,
    mappedPricingCount,
    pricingError,
    pricingLoading,
    pricingSnapshots.length,
    selectedServices.length
  ]);
  const estimateStageStatus = useMemo(() => {
    if (selectedServices.length === 0) {
      return {
        title: "The estimate stage is still locked by service scope.",
        summary:
          "Monthly estimates are intentionally quiet until the review has a real service boundary. That keeps early architecture work from turning into a pricing portal too soon.",
        chips: ["Step 2 scope required", "No estimate model yet"]
      };
    }

    if (pricingLoading) {
      return {
        title: "The estimate stage is waiting on scoped pricing rows.",
        summary:
          "The monthly estimate uses Microsoft retail rows as the cost basis, so it cannot finish until the pricing refresh is ready.",
        chips: ["Retail pricing load in progress", `${selectedServices.length.toLocaleString()} services in scope`]
      };
    }

    if (supportedMonthlyEstimates.length === 0) {
      return {
        title: "The estimate stage still needs richer commercial coverage.",
        summary:
          "At least one service needs either pricing coverage or a product-owned estimate model before this stage becomes useful for first-pass monthly direction.",
        chips: [
          `${monthlyEstimates.length.toLocaleString()} estimate records loaded`,
          "No supported monthly estimates yet"
        ]
      };
    }

    return {
      title: "The estimate stage is ready for first-pass cost direction.",
      summary:
        "Use this deeper section when you want to inspect the assumptions and SKU breakdown behind the audience-first estimate preview in the output stage.",
      chips: [
        `${supportedMonthlyEstimates.length.toLocaleString()} services modeled`,
        `Monthly total ${formatEstimatePrice(totalMonthlyEstimate, supportedMonthlyEstimates[0]?.currencyCode ?? "USD")}`
      ]
    };
  }, [
    monthlyEstimates.length,
    pricingLoading,
    selectedServices.length,
    supportedMonthlyEstimates,
    totalMonthlyEstimate
  ]);
  const copilotContext = useMemo<ProjectReviewCopilotContext | null>(() => {
    if (!activePackage || matrixRows.length === 0) {
      return null;
    }

    const firstRegionalFit = Object.values(serviceRegionalFits).find(Boolean);
    const firstPricingSnapshot = pricingSnapshots.find(Boolean);
    const findings = packageItems
      .filter((item) => {
        const review = reviews[item.guid];

        if (!review) {
          return false;
        }

        return Boolean(
          review.packageDecision !== "Needs Review" ||
            review.comments.trim() ||
            review.evidenceLinks.length > 0 ||
            review.owner.trim() ||
            review.dueDate.trim()
        );
      })
      .slice(0, 40)
      .map((item) => {
        const review = reviews[item.guid]!;

        return {
          guid: item.guid,
          serviceName: item.serviceCanonical ?? item.service ?? "Unmapped service",
          finding: item.text,
          severity: item.severity,
          decision: review.packageDecision,
          comments: review.comments || undefined,
          owner: review.owner || undefined,
          dueDate: review.dueDate || undefined
        };
      });

    return {
      review: {
        id: activePackage.id,
        name: activePackage.name,
        audience: activePackage.audience,
        businessScope: activePackage.businessScope,
        targetRegions: activePackage.targetRegions
      },
      services: matrixRows.map((row) => {
        const assumption = getServiceAssumption(activePackage, row.service.slug);

        return {
          serviceSlug: row.service.slug,
          serviceName: row.service.service,
          description: row.service.description,
          plannedRegion: assumption.plannedRegion || undefined,
          preferredSku: assumption.preferredSku || undefined,
          sizingNote: assumption.sizingNote || undefined,
          itemCount: row.itemCount,
          includedCount: row.includedCount,
          notApplicableCount: row.notApplicableCount,
          excludedCount: row.excludedCount,
          pendingCount: row.pendingCount,
          regionFitSummary: row.regionFit.summary,
          regionFitSignals: row.regionFit.chips.map((chip) => chip.label),
          costFitSummary: row.costFit.summary,
          costFitSignals: row.costFit.chips.map((chip) => chip.label)
        };
      }),
      findings,
      sources: [
        {
          label: "Project review context",
          note: "Selected services, target regions, service assumptions, checklist decisions, and recorded notes from the active browser session."
        },
        firstRegionalFit?.availabilitySourceUrl
          ? {
              label: "Azure Product Availability by Region",
              url: firstRegionalFit.availabilitySourceUrl
            }
          : null,
        firstRegionalFit?.regionsSourceUrl
          ? {
              label: "Azure regions list",
              url: firstRegionalFit.regionsSourceUrl
            }
          : null,
        firstPricingSnapshot?.sourceUrl
          ? {
              label: "Azure Retail Prices API",
              url: firstPricingSnapshot.sourceUrl
            }
          : null,
        firstPricingSnapshot?.calculatorUrl
          ? {
              label: "Azure Pricing Calculator",
              url: firstPricingSnapshot.calculatorUrl
            }
          : null
      ].filter(Boolean) as ProjectReviewCopilotContext["sources"]
    };
  }, [activePackage, matrixRows, packageItems, pricingSnapshots, reviews, serviceRegionalFits]);
  const selectedServiceDrawerRow = useMemo(
    () =>
      selectedServiceDrawerSlug
        ? matrixRows.find((row) => row.service.slug === selectedServiceDrawerSlug) ?? null
        : null,
    [matrixRows, selectedServiceDrawerSlug]
  );
  const selectedItem = useMemo(
    () =>
      selectedGuid !== null
        ? packageItems.find((item) => item.guid === selectedGuid) ?? null
        : null,
    [packageItems, selectedGuid]
  );

  useEffect(() => {
    if (
      selectedServiceDrawerSlug &&
      !matrixRows.some((row) => row.service.slug === selectedServiceDrawerSlug)
    ) {
      setSelectedServiceDrawerSlug(null);
    }
  }, [matrixRows, selectedServiceDrawerSlug]);

  function trackWorkspaceEvent(input: {
    name:
      | "review_create"
      | "review_save_details"
      | "review_scope_change"
      | "review_export_download"
      | "review_cloud_action";
    category?: "review-workspace" | "continuity";
    route?: string;
    reviewId?: string | null;
    properties?: Record<string, string | number | boolean | null | undefined>;
  }) {
    void trackReviewTelemetry({
      name: input.name,
      category: input.category ?? "review-workspace",
      route: input.route ?? "/review-package",
      reviewId: input.reviewId ?? activePackage?.id ?? null,
      properties: input.properties
    });
  }

  function trackExportDownload(
    artifactType: string,
    extraProperties?: Record<string, string | number | boolean | null | undefined>
  ) {
    if (!activePackage) {
      return;
    }

    trackWorkspaceEvent({
      name: "review_export_download",
      reviewId: activePackage.id,
      properties: {
        artifactType,
        audience: activePackage.audience,
        findingCount: packageItems.length,
        pendingCount,
        serviceCount: selectedServices.length,
        ...extraProperties
      }
    });
  }

  function refreshPackages(nextPackages: ReviewPackage[], nextActiveId: string | null) {
    setPackages(nextPackages);
    setActivePackageId(nextActiveId);
    saveActivePackageId(nextActiveId);
    setReviews(loadScopedReviews(nextActiveId));
    const nextActivePackage = nextPackages.find((entry) => entry.id === nextActiveId);

    setForm(createFormState(nextActivePackage));
    setShowSetupDetails(shouldShowSetupDetails(nextActivePackage));
  }

  useEffect(() => {
    if (
      !packagesHydrated ||
      homepageCreateApplied ||
      !requestedHomepageCreate ||
      !requestedHomepagePackagePreset?.name.trim()
    ) {
      return;
    }

    const nextPackage = upsertPackage(
      createReviewPackage({
        name: resolvePackageName(requestedHomepagePackagePreset.name),
        reviewMode: requestedHomepagePackagePreset.reviewMode ?? "Standard review",
        audience: requestedHomepagePackagePreset.audience,
        businessScope: requestedHomepagePackagePreset.businessScope,
        targetRegions: normalizeList(requestedHomepagePackagePreset.targetRegions)
      })
    );
    const nextPackages = loadPackages();

    refreshPackages(nextPackages, nextPackage.id);
    setShowSetupDetails(true);
    setPackageActionTone("success");
    setPackageActionMessage(
      `Created "${nextPackage.name}" from the homepage initializer and made it the active project review.`
    );
    trackWorkspaceEvent({
      name: "review_create",
      reviewId: nextPackage.id,
      properties: {
        audience: nextPackage.audience,
        hasBusinessScope: nextPackage.businessScope.trim().length > 0,
        source: "homepage-initializer",
        targetRegionCount: nextPackage.targetRegions.length
      }
    });
    setHomepageCreateApplied(true);
    clearHomepagePackagePresetSearch();
  }, [
    homepageCreateApplied,
    packagesHydrated,
    requestedHomepageCreate,
    requestedHomepagePackagePreset
  ]);

  function handleRestoreCloudState(input: {
    activePackage: ReviewPackage | null;
    reviews: Record<string, ReviewDraft>;
  }) {
    const { activePackage: restoredPackage, reviews: restoredReviews } = input;

    if (!restoredPackage) {
      saveReviews(restoredReviews);
      setReviews(restoredReviews);
      setPackageActionTone("success");
      setPackageActionMessage(
        "Loaded saved review records from Azure, but no active project review package was stored there."
      );
      return;
    }

    const currentPackages = loadPackages();
    const existingIndex = currentPackages.findIndex((entry) => entry.id === restoredPackage.id);
    const nextPackages = [...currentPackages];

    if (existingIndex === -1) {
      nextPackages.unshift(restoredPackage);
    } else {
      nextPackages.splice(existingIndex, 1, restoredPackage);
    }

    savePackages(nextPackages);
    savePackageReviews(restoredPackage.id, restoredReviews);
    setReviews(restoredReviews);
    refreshPackages(nextPackages, restoredPackage.id);
    setPackageActionTone("success");
    setPackageActionMessage(
      `Loaded "${restoredPackage.name}" from Azure and made it the active project review.`
    );
  }

  function handleCreatePackage() {
    const nextName = resolvePackageName(form.name);
    const nextPackage = upsertPackage(
      createReviewPackage({
        name: nextName,
        reviewMode: form.reviewMode,
        audience: form.audience,
        businessScope: form.businessScope,
        targetRegions: normalizeList(form.targetRegions)
      })
    );
    const nextPackages = loadPackages();

    refreshPackages(nextPackages, nextPackage.id);
    setPackageActionTone("success");
    setPackageActionMessage(`Created "${nextPackage.name}" and made it the active project review.`);
    trackWorkspaceEvent({
      name: "review_create",
      reviewId: nextPackage.id,
      properties: {
        audience: nextPackage.audience,
        hasBusinessScope: nextPackage.businessScope.trim().length > 0,
        source: "workspace-create",
        targetRegionCount: nextPackage.targetRegions.length
      }
    });
  }

  function handleSelectPackage(nextPackageId: string) {
    refreshPackages(loadPackages(), nextPackageId || null);
    setPackageActionTone("neutral");
    setPackageActionMessage(
      nextPackageId
        ? `Switched the active project review.`
        : "Cleared the active project review. Notes will stay local until you activate another review."
    );
  }

  function persistActivePackageFormState() {
    if (!activePackage) {
      return null;
    }

    const savedPackage = upsertPackage({
      ...activePackage,
      name: resolvePackageName(form.name),
      reviewMode: form.reviewMode,
      audience: form.audience,
      businessScope: form.businessScope.trim(),
      targetRegions: normalizeList(form.targetRegions)
    });

    refreshPackages(loadPackages(), activePackage.id);

    return savedPackage;
  }

  async function handleSavePackageDetails() {
    const savedPackage = persistActivePackageFormState();

    if (!savedPackage) {
      return;
    }

    try {
      const principal = await fetchClientPrincipal();

      if (principal) {
        await saveCloudProjectReviewState(savedPackage, copilotContext);
        trackWorkspaceEvent({
          name: "review_save_details",
          reviewId: savedPackage.id,
          properties: {
            savedToCloud: true,
            serviceCount: savedPackage.selectedServiceSlugs.length,
            targetRegionCount: savedPackage.targetRegions.length
          }
        });
        setPackageActionTone("success");
        setPackageActionMessage(
          `Saved the project review details for "${savedPackage.name}" locally and updated the Azure-backed review summary.`
        );
        return;
      }
    } catch (error) {
      trackWorkspaceEvent({
        name: "review_save_details",
        reviewId: savedPackage.id,
        properties: {
          cloudAttempted: true,
          savedToCloud: false,
          serviceCount: savedPackage.selectedServiceSlugs.length,
          targetRegionCount: savedPackage.targetRegions.length
        }
      });
      setPackageActionTone("neutral");
      setPackageActionMessage(
        error instanceof Error
          ? `${error.message} The project review details were still saved locally for "${savedPackage.name}".`
          : `Saved the project review details for "${savedPackage.name}" locally, but the Azure-backed review summary could not be updated.`
      );
      return;
    }

    trackWorkspaceEvent({
      name: "review_save_details",
      reviewId: savedPackage.id,
      properties: {
        savedToCloud: false,
        serviceCount: savedPackage.selectedServiceSlugs.length,
        targetRegionCount: savedPackage.targetRegions.length
      }
    });
    setPackageActionTone("success");
    setPackageActionMessage(`Saved the project review details for "${savedPackage.name}".`);
  }

  function handleDeletePackage() {
    if (!activePackage) {
      return;
    }

    const deletedPackageName = activePackage.name;
    deletePackage(activePackage.id);
    const nextPackages = loadPackages();

    refreshPackages(nextPackages, nextPackages[0]?.id ?? null);
    setPackageActionTone("success");
    setPackageActionMessage(
      nextPackages[0]
        ? `Deleted "${deletedPackageName}". "${nextPackages[0].name}" is now the active project review.`
        : `Deleted "${deletedPackageName}". No project review is active right now.`
    );
  }

  function toggleServiceSelection(serviceSlug: string) {
    if (!activePackage) {
      return;
    }

    const wasSelected = activePackage.selectedServiceSlugs.includes(serviceSlug);
    const selectedServiceSlugs = activePackage.selectedServiceSlugs.includes(serviceSlug)
      ? activePackage.selectedServiceSlugs.filter((entry) => entry !== serviceSlug)
      : [...activePackage.selectedServiceSlugs, serviceSlug];

    upsertPackage({
      ...activePackage,
      selectedServiceSlugs
    });

    refreshPackages(loadPackages(), activePackage.id);
    trackWorkspaceEvent({
      name: "review_scope_change",
      reviewId: activePackage.id,
      properties: {
        action: wasSelected ? "toggle-remove" : "toggle-add",
        addedCount: wasSelected ? 0 : 1,
        removedCount: wasSelected ? 1 : 0,
        selectedCount: selectedServiceSlugs.length,
        serviceSlug
      }
    });
  }

  function addServicesToReview(
    serviceSlugs: string[],
    sourceLabel: string,
    successMessage: string,
    telemetryAction = "bulk-add"
  ) {
    if (!activePackage || serviceSlugs.length === 0) {
      return;
    }

    const nextSelectedServiceSlugs = Array.from(
      new Set([...activePackage.selectedServiceSlugs, ...serviceSlugs])
    );
    const addedCount = nextSelectedServiceSlugs.length - activePackage.selectedServiceSlugs.length;

    if (addedCount === 0) {
      setPackageActionTone("neutral");
      setPackageActionMessage(`Everything from ${sourceLabel} is already in the current review scope.`);
      return;
    }

    upsertPackage({
      ...activePackage,
      selectedServiceSlugs: nextSelectedServiceSlugs
    });

    refreshPackages(loadPackages(), activePackage.id);
    trackWorkspaceEvent({
      name: "review_scope_change",
      reviewId: activePackage.id,
      properties: {
        action: telemetryAction,
        addedCount,
        selectedCount: nextSelectedServiceSlugs.length,
        sourceLabel
      }
    });
    setPackageActionTone("success");
    setPackageActionMessage(successMessage.replace("{count}", addedCount.toLocaleString()));
  }

  function addStarterBundle(serviceSlugs: string[], bundleTitle: string) {
    addServicesToReview(
      serviceSlugs,
      bundleTitle,
      `Added {count} starter services from ${bundleTitle}.`,
      "starter-bundle"
    );
  }

  function clearReviewScope() {
    if (!activePackage || activePackage.selectedServiceSlugs.length === 0) {
      return;
    }

    upsertPackage({
      ...activePackage,
      selectedServiceSlugs: []
    });

    refreshPackages(loadPackages(), activePackage.id);
    trackWorkspaceEvent({
      name: "review_scope_change",
      reviewId: activePackage.id,
      properties: {
        action: "clear-scope",
        removedCount: activePackage.selectedServiceSlugs.length,
        selectedCount: 0
      }
    });
    setPackageActionTone("neutral");
    setPackageActionMessage("Cleared the current review scope so you can reseed it with a different baseline.");
  }

  function updateServiceAssumption(
    serviceSlug: string,
    patch: Partial<ReviewServiceAssumption>
  ) {
    if (!activePackage) {
      return;
    }

    const current = getServiceAssumption(activePackage, serviceSlug);
    const nextAssumption = {
      ...current,
      ...patch
    };
    const nextEstimateInputMode = nextAssumption.estimateInputMode ?? "defaults";
    const nextEstimateInputs = nextAssumption.estimateInputs ?? {};
    const shouldRemove =
      !nextAssumption.plannedRegion.trim() &&
      !nextAssumption.preferredSku.trim() &&
      !nextAssumption.sizingNote.trim() &&
      nextEstimateInputMode === "defaults" &&
      Object.keys(nextEstimateInputs).length === 0;
    const nextServiceAssumptions = {
      ...activePackage.serviceAssumptions
    };

    if (shouldRemove) {
      delete nextServiceAssumptions[serviceSlug];
    } else {
      nextServiceAssumptions[serviceSlug] = nextAssumption;
    }

    const saved = upsertPackage({
      ...activePackage,
      serviceAssumptions: nextServiceAssumptions
    });

    setPackages((currentPackages) => {
      const existingIndex = currentPackages.findIndex((entry) => entry.id === saved.id);

      if (existingIndex === -1) {
        return [saved, ...currentPackages];
      }

      const nextPackages = [...currentPackages];

      nextPackages.splice(existingIndex, 1, saved);
      return nextPackages;
    });
  }

  function updateServiceEstimateInput(
    serviceSlug: string,
    key: string,
    value: ReviewServiceEstimateInputValue
  ) {
    const profile = getServiceEstimateProfile(serviceSlug);
    const assumption = getServiceAssumption(activePackage, serviceSlug);
    const defaultInputs = resolveEstimateInputs(profile, undefined);
    const nextEstimateInputs = {
      ...(assumption.estimateInputs ?? {}),
      [key]: value
    };

    if (defaultInputs[key] === value) {
      delete nextEstimateInputs[key];
    }

    updateServiceAssumption(serviceSlug, {
      estimateProfileVersion: profile?.version,
      estimateInputMode: "custom",
      estimateInputs: nextEstimateInputs
    });
  }

  function updateServiceEstimateInputMode(serviceSlug: string, mode: "defaults" | "custom") {
    const profile = getServiceEstimateProfile(serviceSlug);

    updateServiceAssumption(serviceSlug, {
      estimateProfileVersion: profile?.version,
      estimateInputMode: mode,
      estimateInputs: mode === "defaults" ? {} : getServiceAssumption(activePackage, serviceSlug).estimateInputs ?? {}
    });
  }

  function handleOpenServiceDrawer(serviceSlug: string) {
    setSelectedServiceDrawerSlug(serviceSlug);
  }

  function handleOpenMatrixFinding(guid: string) {
    setSelectedServiceDrawerSlug(null);
    setSelectedGuid(guid);
  }

  function updateReview(guid: string, next: Partial<ReviewDraft>) {
    setReviews((current) => {
      const nextReviews = {
        ...current,
        [guid]: {
          ...(current[guid] ?? createEmptyReview()),
          ...next
        }
      };

      if (activePackage?.id) {
        savePackageReviews(activePackage.id, nextReviews);
      } else {
        saveReviews(nextReviews);
      }

      return nextReviews;
    });
  }

  function exportPackageCsv() {
    if (!activePackage) {
      return;
    }

    downloadCsv(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}.csv`,
      buildPackageExportRows(activePackage, packageItems, reviews, {
        includeNotApplicable,
        includeNeedsReview
      })
    );
    trackExportDownload("checklist-csv");
  }

  function exportPackageMarkdown() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}.md`,
      buildPackageMarkdown(activePackage, packageItems, reviews, {
        includeNotApplicable,
        includeNeedsReview
      }),
      "text/markdown;charset=utf-8"
    );
    trackExportDownload("design-markdown");
  }

  function exportPackageText() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}.txt`,
      buildPackageText(activePackage, packageItems, reviews, {
        includeNotApplicable,
        includeNeedsReview
      })
    );
    trackExportDownload("design-text");
  }

  function exportPackagePricingCsv() {
    if (!activePackage) {
      return;
    }

    downloadCsv(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-pricing.csv`,
      buildPackagePricingRows(activePackage, pricingSnapshots)
    );
    trackExportDownload("pricing-csv");
  }

  function exportPackagePricingMarkdown() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-pricing.md`,
      buildPackagePricingMarkdown(activePackage, pricingSnapshots),
      "text/markdown;charset=utf-8"
    );
    trackExportDownload("pricing-markdown");
  }

  function exportPackagePricingText() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-pricing.txt`,
      buildPackagePricingText(activePackage, pricingSnapshots)
    );
    trackExportDownload("pricing-text");
  }

  function exportPackageMonthlyEstimateCsv() {
    if (!activePackage) {
      return;
    }

    downloadCsv(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-monthly-estimate.csv`,
      buildPackageMonthlyEstimateRows(activePackage, monthlyEstimates)
    );
    trackExportDownload("estimate-csv");
  }

  function exportPackageMonthlyEstimateMarkdown() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-monthly-estimate.md`,
      buildPackageMonthlyEstimateMarkdown(activePackage, monthlyEstimates),
      "text/markdown;charset=utf-8"
    );
    trackExportDownload("estimate-markdown");
  }

  function exportPackageMonthlyEstimateText() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-monthly-estimate.txt`,
      buildPackageMonthlyEstimateText(activePackage, monthlyEstimates)
    );
    trackExportDownload("estimate-text");
  }

  function exportRegionalRiskCsv() {
    if (!activePackage) {
      return;
    }

    downloadCsv(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-regional-risk.csv`,
      buildRegionalRiskRows(activePackage, regionalRiskExportRows)
    );
    trackExportDownload("regional-risk-csv", {
      blockedServiceCount: regionalRiskSummary.blockedServices.length,
      caveatServiceCount: regionalRiskSummary.caveatServices.length
    });
  }

  function exportLeadershipSummaryMarkdown() {
    if (!activePackage) {
      return;
    }

    downloadText(
      `${activePackage.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") || "project-review"}-leadership-summary.md`,
      buildLeadershipSummaryMarkdown(activePackage, {
        selectedServiceCount: selectedServices.length,
        blockedServices: regionalRiskSummary.blockedServices,
        caveatServices: regionalRiskSummary.caveatServices,
        globalServices: regionalRiskSummary.globalServices,
        availableServices: regionalRiskSummary.availableServices,
        pricingMappedCount: mappedPricingCount,
        selectedPricingCount: pricingSnapshots.length,
        startingRetailPrice: startingRetailPrice.length > 0 ? Math.min(...startingRetailPrice) : undefined,
        pricingCurrencyCode: pricingSnapshots[0]?.currencyCode,
        includedCount,
        notApplicableCount,
        excludedCount,
        pendingCount
      }),
      "text/markdown;charset=utf-8"
    );
    trackExportDownload("leadership-markdown", {
      artifactAudience: "Senior Director"
    });
  }

  return (
    <main className="section-stack">
      <section className="review-command-panel">
        <div className="review-workspace-header-row">
          <div className="review-command-copy">
            <p className="eyebrow">Review workspace</p>
            <h1 className="review-command-title">Run a guided Azure review with scope, pricing, findings, evidence, and export in one place.</h1>
            <p className="review-command-summary">
              Start with review basics, scope only the services that belong to the design, then move
              through regions, pricing, findings, evidence, and exports with a clear next action.
            </p>
          </div>

          <div className="button-row review-workspace-header-actions">
            <a href="#project-review-local-exports" className="secondary-button">
              Export review pack
            </a>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSavePackageDetails()}
              disabled={!activePackage}
            >
              Save review
            </button>
          </div>
        </div>

        <div className="review-command-metrics review-workspace-summary-strip">
          {[
            {
              label: "Services in scope",
              value: selectedServices.length.toLocaleString(),
              detail: "Only the services that belong to this architecture."
            },
            {
              label: "Regions selected",
              value: activePackage?.targetRegions.length.toLocaleString() ?? "0",
              detail: "Used to focus region fit and pricing comparisons."
            },
            {
              label: "Findings in scope",
              value: packageItems.length.toLocaleString(),
              detail: "Scoped findings currently available in the review."
            },
            {
              label: "Evidence level",
              value: evidenceLevelLabel,
              detail: "Shows how much of the scoped review has been explicitly worked."
            },
            {
              label: "Review status",
              value: reviewStatusLabel,
              detail: currentWorkspaceStage?.detail ?? "Follow the guided workflow to complete the review."
            }
          ].map((metric) => (
            <article className="review-command-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="review-workspace-shell">
        <aside className="review-progress-rail">
          <section className="surface-panel review-progress-card board-toolbar-card">
            <p className="eyebrow">Workflow steps</p>
            <h2 className="review-progress-title">Follow the review from setup to export.</h2>
            <p className="microcopy">
              Each step keeps the next best action visible so the review never feels like a blank workspace.
            </p>
            <div className="review-progress-list">
              {workspaceStages.map((stage, index) => (
                <a
                  className="review-progress-item"
                  href={`#${stage.id}`}
                  key={stage.id}
                  onClick={(event) => {
                    event.preventDefault();
                    openStage(stage.id);
                  }}
                >
                  <div className="review-progress-item-head">
                    <span className="review-progress-step">0{index + 1}</span>
                    <span className={`review-progress-pill review-progress-pill-${stage.status}`}>
                      {stage.status}
                    </span>
                  </div>
                  <strong>{stage.title}</strong>
                  <p>{stage.detail}</p>
                </a>
              ))}
            </div>
          </section>
        </aside>

        <div className="review-workspace-flow">
      <section
        className={`surface-panel board-stage-panel${
          highlightedStageId === "project-review-setup" ? " board-stage-panel-highlighted" : ""
        }`}
        id="project-review-setup"
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2 className="section-title">Set up the review basics before you scope services.</h2>
            <p className="section-copy">
              Start with a review name, choose the review mode, and capture the region or architecture
              notes that matter to the first pass.
            </p>
          </div>
          <div className="chip-row">
            <span className="chip">Only the name is required to start</span>
            <span className="chip">ARB-grade review stays available inside the same flow</span>
          </div>
          <div className="button-row review-stage-head-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => toggleStageExpansion("project-review-setup", Boolean(activePackage))}
            >
              {setupStageExpanded ? "Collapse stage" : "Expand stage"}
            </button>
          </div>
        </div>

        {setupStageExpanded ? (
        <div className="package-header-grid">
          <article className="filter-card package-card">
            <div className="filter-grid">
              <label>
                <span className="microcopy">Active project review</span>
                <select
                  className="field-select"
                  value={activePackageId ?? ""}
                  onChange={(event) => handleSelectPackage(event.target.value)}
                >
                  <option value="">No active project review</option>
                  {packages.map((reviewPackage) => (
                    <option key={reviewPackage.id} value={reviewPackage.id}>
                      {reviewPackage.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="microcopy">Project review name</span>
                <input
                  className="field-input"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Contoso edge review"
                />
              </label>
              <label>
                <span className="microcopy">Review mode</span>
                <select
                  className="field-select"
                  value={form.reviewMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reviewMode: event.target.value as ReviewMode
                    }))
                  }
                >
                  {REVIEW_MODES.map((reviewMode) => (
                    <option key={reviewMode} value={reviewMode}>
                      {reviewMode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="microcopy">Target regions</span>
                <input
                  className="field-input"
                  value={form.targetRegions}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetRegions: event.target.value }))
                  }
                  placeholder="East US, West Europe, UAE Central"
                />
              </label>
              {showSetupDetails ? (
                <>
                  <p className="microcopy" style={{ gridColumn: "1 / -1" }}>
                    Update the review basics above, then click <strong>Save review details</strong>.
                  </p>

                  <label>
                    <span className="microcopy">Audience</span>
                    <select
                      className="field-select"
                      value={form.audience}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          audience: event.target.value as ReviewPackageAudience
                        }))
                      }
                    >
                      {AUDIENCES.map((audience) => (
                        <option key={audience} value={audience}>
                          {audience}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="microcopy">Architecture notes</span>
                    <textarea
                      className="field-textarea"
                      value={form.businessScope}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, businessScope: event.target.value }))
                      }
                      placeholder="Capture the project scope, constraints, and customer assumptions."
                    />
                  </label>
                </>
              ) : (
                <p className="microcopy" style={{ gridColumn: "1 / -1" }}>
                  Audience and architecture notes can stay lightweight on the first pass. Open ARB-grade review later when you need document upload and stricter evidence handling.
                </p>
              )}
            </div>

            <div className="button-row">
              <button type="button" className="primary-button" onClick={handleCreatePackage}>
                Create project review
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleSavePackageDetails}
                disabled={!activePackage}
              >
                Save review details
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleDeletePackage}
                disabled={!activePackage}
              >
                Delete review
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowSetupDetails((current) => !current)}
              >
                {showSetupDetails ? "Hide extra setup fields" : "Show extra setup fields"}
              </button>
            </div>

            {form.reviewMode === "ARB-grade review" ? (
              <p className="microcopy">
                ARB-grade reviews use the same saved review foundation, then move into document-backed evidence steps in the advanced workflow.
                <Link href="/arb" className="muted-link"> Open ARB-grade review mode.</Link>
              </p>
            ) : null}

            {packageActionMessage ? (
              <p
                className={`microcopy ${
                  packageActionTone === "success" ? "status-copy status-copy-success" : "status-copy"
                }`}
              >
                {packageActionMessage}
              </p>
            ) : null}
          </article>

          <article className="filter-card package-card">
            <p className="eyebrow">Project summary</p>
            <div className="package-stats-grid">
              <article className="hero-metric-card">
                <span>Services in scope</span>
                <strong>{activePackage?.selectedServiceSlugs.length.toLocaleString() ?? "0"}</strong>
                <p>Only these services are exported as part of the project handoff.</p>
              </article>
              <article className="hero-metric-card">
                <span>Review mode</span>
                <strong>{activePackage?.reviewMode ?? form.reviewMode}</strong>
                <p>Use standard mode for speed or ARB-grade mode for stronger evidence discipline.</p>
              </article>
              <article className="hero-metric-card">
                <span>Included findings</span>
                <strong>{includedCount.toLocaleString()}</strong>
                <p>Findings explicitly marked for the active project review.</p>
              </article>
              <article className="hero-metric-card">
                <span>Not applicable</span>
                <strong>{notApplicableCount.toLocaleString()}</strong>
                <p>Findings retained with rationale when they do not apply to the current scope.</p>
              </article>
              <article className="hero-metric-card">
                <span>Pending review</span>
                <strong>{pendingCount.toLocaleString()}</strong>
                <p>Items still waiting for a project-specific decision or final note.</p>
              </article>
            </div>
          </article>
        </div>
        ) : (
          <section className="filter-card review-stage-summary">
            <p className="eyebrow">Stage summary</p>
            <h3>
              {activePackage
                ? `${activePackage.name} is active and ready for service scoping.`
                : "Create a project review to unlock the rest of the workspace."}
            </h3>
            <p className="microcopy">
              {activePackage
                ? `${selectedServices.length.toLocaleString()} services are currently in scope, and ${pendingCount.toLocaleString()} findings still need review decisions.`
                : "Only the review name is required to start. Audience, regions, and scope can stay optional until later."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStage("project-review-setup")}
              >
                Reopen stage
              </button>
            </div>
          </section>
        )}
      </section>

      <section
        className={`surface-panel board-stage-panel${
          highlightedStageId === "project-review-scope" ? " board-stage-panel-highlighted" : ""
        }`}
        id="project-review-scope"
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 className="section-title">Choose only the Azure services that belong to this solution.</h2>
            <p className="section-copy">
              Once a review exists, add only the Azure services that truly belong to this design.
              Until then, keep this step locked so the scope does not sprawl too early.
            </p>
          </div>
          <div className="chip-row">
            <span className="chip">{activePackage ? visibleReviewServices.length.toLocaleString() : 0} visible services</span>
            {activePackage ? (
              <span className="chip">{selectedServices.length.toLocaleString()} services in this review</span>
            ) : null}
          </div>
          <div className="button-row review-stage-head-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => toggleStageExpansion("project-review-scope", selectedServices.length > 0)}
            >
              {scopeStageExpanded ? "Collapse stage" : "Expand stage"}
            </button>
          </div>
        </div>

        {!scopeStageExpanded ? (
          <section className="filter-card review-stage-summary">
            <p className="eyebrow">Stage summary</p>
            <h3>
              {selectedServices.length > 0
                ? `${selectedServices.length.toLocaleString()} services are in scope for this review.`
                : activePackage
                  ? "No services are in scope yet."
                  : "The service picker is still locked."}
            </h3>
            <p className="microcopy">
              {selectedServices.length > 0
                ? "Keep the list tight so pricing, copilot answers, and exports stay aligned to the actual architecture."
                : activePackage
                  ? "Open the stage again when you are ready to add the Azure services that truly belong to the design."
                  : "Create the review basics first, then this step unlocks automatically."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStage("project-review-scope")}
              >
                {selectedServices.length > 0 ? "Reopen stage" : "Open stage"}
              </button>
            </div>
          </section>
        ) : !activePackage ? (
          <section className="filter-card">
            <p className="eyebrow">Create the review first</p>
            <h3>The service picker unlocks after Step 1 creates the review.</h3>
            <p className="microcopy">
              This keeps the first pass focused on one solution. If you want to browse broadly before
              scoping the review, use the services directory instead of selecting services here yet.
            </p>
            <div className="button-row">
              <a href="#project-review-setup" className="primary-button">
                Go back to Step 1
              </a>
              <Link href="/services" className="ghost-button">
                Browse services
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="filter-card workspace-toolbar board-toolbar-card">
              <div className="workspace-toolbar-main">
                <input
                  className="search-input"
                  type="search"
                  value={serviceSearch}
                  placeholder="Search services to add into the project review"
                  onChange={(event) => setServiceSearch(event.target.value)}
                />
                <p className="microcopy">
                  Service selection should reflect the actual solution scope, not every adjacent service
                  that appears in the source repository.
                </p>
              </div>
              <div className="workspace-toolbar-side">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowOnlyScopedServices((current) => !current)}
                >
                  {showOnlyScopedServices
                    ? "Browse full catalog"
                    : "Show only services in this review"}
                </button>
                <p className="microcopy">
                  {showOnlyScopedServices
                    ? "Only the services already selected for this project review are shown below."
                    : "The full service catalog is visible. Services outside this review stay clearly marked."}
                </p>
                {activePackage.selectedServiceSlugs.length > 0 ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={clearReviewScope}
                  >
                    Clear current scope
                  </button>
                ) : null}
              </div>
            </div>

        {visibleReviewServices.length > 0 ? (
          <div className="service-selection-grid">
            {visibleReviewServices.map((service) => {
              const selected = activePackage?.selectedServiceSlugs.includes(service.slug) ?? false;

              return (
                <article className="future-card service-selection-card" key={service.slug}>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Azure service</p>
                      <h3>{service.service}</h3>
                    </div>
                    <span className="chip">
                      {selected ? "In project review" : "Not in project review"}
                    </span>
                  </div>
                  <p className="microcopy">{service.description}</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className={selected ? "secondary-button" : "ghost-button"}
                      disabled={!activePackage}
                      onClick={() => toggleServiceSelection(service.slug)}
                    >
                      {selected ? "Remove from review" : "Add to review"}
                    </button>
                    <Link href={`/services/${service.slug}`} className="muted-link">
                      Open service review
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">No visible services</p>
            <h3>
              {showOnlyScopedServices
                ? activePackage?.selectedServiceSlugs.length
                  ? "No selected services match the current search."
                  : "No services are in this project review yet."
                : "No services match the current search."}
            </h3>
            <p className="microcopy">
              {showOnlyScopedServices
                ? activePackage?.selectedServiceSlugs.length
                  ? "Clear the search or switch to the full catalog when you want to add more services."
                  : "Switch to the full catalog to add services, then this view will stay scoped to what is actually in the review."
                : "Try a different search term to find the service you want to add."}
            </p>
            {activePackage && showOnlyScopedServices && !activePackage.selectedServiceSlugs.length ? (
              <>
                <section className="filter-card review-stage-handoff-card">
                  <p className="eyebrow">Fast start</p>
                  <h3>Add one likely foundation service first, then keep the review scoped from there.</h3>
                  <p className="microcopy">
                    These are high-coverage services from the current catalog. Pick one to get the
                    review moving, or switch to the full catalog if your architecture starts elsewhere.
                  </p>
                </section>
                {starterBundles.length > 0 ? (
                  <div className="starter-bundle-grid">
                    {starterBundles.map((bundle) => (
                      <article className="future-card starter-bundle-card" key={bundle.title}>
                        <p className="eyebrow">Starter bundle</p>
                        <h3>{bundle.title}</h3>
                        <p>{bundle.description}</p>
                        <div className="starter-bundle-copy-block">
                          <strong>Best for</strong>
                          <p>{bundle.bestFor}</p>
                        </div>
                        <div className="starter-bundle-copy-block">
                          <strong>Watch for</strong>
                          <p>{bundle.watchFor}</p>
                        </div>
                        <div className="chip-row compact-chip-row">
                          <span className="chip">
                            {bundle.services.length.toLocaleString()} services
                          </span>
                          <span className="chip">One-click starting point</span>
                        </div>
                        <div className="starter-bundle-list">
                          {bundle.services.map((service) => (
                            <span className="chip" key={`${bundle.title}-${service.slug}`}>
                              {service.service}
                            </span>
                          ))}
                        </div>
                        <div className="button-row">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              addStarterBundle(
                                bundle.services.map((service) => service.slug),
                                bundle.title
                              )
                            }
                          >
                            Add bundle to review
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
                <div className="service-selection-grid">
                  {starterServices.map((service) => (
                    <article className="future-card service-selection-card" key={service.slug}>
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Starter service</p>
                          <h3>{service.service}</h3>
                        </div>
                        <span className="chip">{service.familyCount.toLocaleString()} families</span>
                      </div>
                      <p className="microcopy">{service.description}</p>
                      <div className="chip-row compact-chip-row">
                        <span className="chip">{service.itemCount.toLocaleString()} findings</span>
                        <span className="chip">High-coverage starting point</span>
                      </div>
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => toggleServiceSelection(service.slug)}
                        >
                          Add to review
                        </button>
                        <Link href={`/services/${service.slug}`} className="muted-link">
                          Open service review
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            {activePackage && showOnlyScopedServices ? (
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowOnlyScopedServices(false)}
                >
                  Browse full catalog
                </button>
              </div>
            ) : null}
          </section>
        )}
          </>
        )}
      </section>

      {copilotContext ? <ProjectReviewCopilot context={copilotContext} /> : null}

      <section
        className={`surface-panel board-stage-panel${
          highlightedStageId === "project-review-signals" ? " board-stage-panel-highlighted" : ""
        }`}
        id="project-review-signals"
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2 className="section-title">See region fit, cost fit, and checklist progress in one matrix.</h2>
            <p className="section-copy">
              This is the quickest place to confirm whether each selected service is region-ready,
              commercially understood, and review-ready before you open the detailed service page.
            </p>
          </div>
          <div className="button-row review-stage-head-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => toggleStageExpansion("project-review-signals", reviewedDecisionCount > 0)}
            >
              {signalsStageExpanded ? "Collapse stage" : "Expand stage"}
            </button>
          </div>
        </div>

        {signalsStageExpanded ? (
          <>
        <div className="traceability-grid">
          <article className="trace-card">
            <strong>Selected services</strong>
            <p>{selectedServices.length.toLocaleString()}</p>
          </article>
          <article className="trace-card">
            <strong>Availability ready</strong>
            <p>
              {Object.keys(serviceRegionalFits).length.toLocaleString()}
              {regionalFitLoading ? " · refreshing" : ""}
            </p>
          </article>
          <article className="trace-card">
            <strong>Pricing ready</strong>
            <p>
              {pricingSnapshots.length.toLocaleString()}
              {pricingLoading ? " · refreshing" : ""}
            </p>
          </article>
          <article className="trace-card">
            <strong>Target regions</strong>
            <p>{activePackage?.targetRegions.join(", ") || "Not captured yet"}</p>
          </article>
        </div>

        {regionalFitError ? (
          <section className="filter-card">
            <p className="eyebrow">Availability source</p>
            <h3>The live availability refresh did not complete for the matrix.</h3>
            <p className="microcopy">
              {regionalFitError} The matrix will keep using the service-level mapping summary until
              the dedicated backend responds again.
            </p>
          </section>
        ) : null}

        {matrixRows.length > 0 ? (
          <div className="regional-risk-grid">
            <article className="trace-card regional-risk-card regional-risk-card-blocker">
              <p className="eyebrow">Blocked or restricted</p>
              <h3>{regionalRiskSummary.blockedServices.length.toLocaleString()}</h3>
              <p className="microcopy">
                {regionalRiskSummary.blockedServices.length > 0
                  ? regionalRiskSummary.blockedServices
                      .map((entry) => `${entry.serviceName}: ${entry.signals.join(", ")}`)
                      .join(" | ")
                  : "No selected services currently show restricted, unavailable, or not-in-feed target-region signals."}
              </p>
            </article>
            <article className="trace-card regional-risk-card regional-risk-card-caveat">
              <p className="eyebrow">Preview, retiring, or early access</p>
              <h3>{regionalRiskSummary.caveatServices.length.toLocaleString()}</h3>
              <p className="microcopy">
                {regionalRiskSummary.caveatServices.length > 0
                  ? regionalRiskSummary.caveatServices
                      .map((entry) => `${entry.serviceName}: ${entry.signals.join(", ")}`)
                      .join(" | ")
                  : "No selected services are currently flagged only with preview, retiring, or early-access caveats."}
              </p>
            </article>
            <article className="trace-card regional-risk-card">
              <p className="eyebrow">Global services</p>
              <h3>{regionalRiskSummary.globalServices.length.toLocaleString()}</h3>
              <p className="microcopy">
                {regionalRiskSummary.globalServices.length > 0
                  ? regionalRiskSummary.globalServices.join(", ")
                  : "No selected services are currently treated as global or non-regional in the matrix."}
              </p>
            </article>
            <article className="trace-card regional-risk-card">
              <p className="eyebrow">Available without caveat</p>
              <h3>{regionalRiskSummary.availableServices.length.toLocaleString()}</h3>
              <p className="microcopy">
                {regionalRiskSummary.availableServices.length > 0
                  ? regionalRiskSummary.availableServices.join(", ")
                  : "No selected services are currently classified as fully available across the chosen target regions."}
              </p>
            </article>
          </div>
        ) : null}

        {matrixRows.length > 0 ? (
          <div className="project-review-matrix">
            <div className="project-review-matrix-head">
              <span>Service</span>
              <span>Region fit</span>
              <span>Cost fit</span>
              <span>Checklist progress</span>
              <span>Design assumptions</span>
            </div>
            {matrixRows.map((row) => (
              <article className="project-review-matrix-row" key={row.service.slug}>
                <div className="project-review-matrix-cell project-review-matrix-service">
                  <p className="eyebrow">Service</p>
                  <h3>{row.service.service}</h3>
                  <p className="microcopy">{row.service.description}</p>
                  <div className="chip-row">
                    <span className="chip">{row.service.familyCount.toLocaleString()} families</span>
                    <span className="chip">{row.itemCount.toLocaleString()} findings</span>
                  </div>
                </div>

                <div className="project-review-matrix-cell">
                  <p className="eyebrow">Region fit</p>
                  <div className="chip-row">
                    {row.regionFit.chips.map((chip) => (
                      <span
                        className={`matrix-chip matrix-chip-${chip.tone}`}
                        key={`${row.service.slug}-${chip.label}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  <p className="microcopy">{row.regionFit.summary}</p>
                </div>

                <div className="project-review-matrix-cell">
                  <p className="eyebrow">Cost fit</p>
                  <div className="chip-row">
                    {row.costFit.chips.map((chip) => (
                      <span
                        className={`matrix-chip matrix-chip-${chip.tone}`}
                        key={`${row.service.slug}-${chip.label}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  <p className="microcopy">{row.costFit.summary}</p>
                  <p className="microcopy">
                    Open the detail drawer when you want the full pricing drilldown, target-region
                    rows, and estimate input controls.
                  </p>
                </div>

                <div className="project-review-matrix-cell">
                  <p className="eyebrow">Checklist progress</p>
                  <div className="chip-row">
                    {row.checklistChips.map((chip) => (
                      <span
                        className={`matrix-chip matrix-chip-${chip.tone}`}
                        key={`${row.service.slug}-${chip.label}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  <p className="microcopy">{row.checklistSummary}</p>
                </div>

                <div className="project-review-matrix-cell project-review-matrix-actions">
                  <p className="eyebrow">Design assumptions</p>
                  {(() => {
                    const assumption = getServiceAssumption(activePackage, row.service.slug);
                    const assumptionChips = [
                      assumption.plannedRegion ? `Region: ${assumption.plannedRegion}` : null,
                      assumption.preferredSku ? `SKU: ${assumption.preferredSku}` : null,
                      assumption.sizingNote ? "Sizing note captured" : null,
                      assumption.estimateInputMode === "custom" ? "Custom estimate inputs" : null
                    ].filter((value): value is string => Boolean(value));

                    return assumptionChips.length > 0 ? (
                      <div className="chip-row compact-chip-row">
                        {assumptionChips.map((chip) => (
                          <span className="chip" key={`${row.service.slug}-${chip}`}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="microcopy">
                        No service-specific assumptions captured yet. Open details when you want to record region, SKU, sizing, or estimate inputs.
                      </p>
                    );
                  })()}
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleOpenServiceDrawer(row.service.slug)}
                  >
                    Open detail workspace
                  </button>
                  <Link href={`/services/${row.service.slug}`} className="secondary-button">
                    Open service review
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">No services selected yet</p>
            <h3>Add services first so the matrix can show region fit, cost fit, and checklist progress.</h3>
            <p className="microcopy">
              Once a service is added, this section becomes the fastest way to see whether the
              current project is ready for deeper review and export.
            </p>
          </section>
        )}
          </>
        ) : (
          <section className="filter-card review-stage-summary">
            <p className="eyebrow">Stage summary</p>
            <h3>
              {reviewedDecisionCount > 0
                ? `${reviewedDecisionCount.toLocaleString()} findings already have explicit project decisions.`
                : "Signals are waiting for service scope and review decisions."}
            </h3>
            <p className="microcopy">
              {reviewedDecisionCount > 0
                ? `${selectedServices.length.toLocaleString()} selected services are contributing to the current review posture.`
                : "Expand this stage when you want to inspect region fit, pricing posture, and checklist readiness together."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStage("project-review-signals")}
              >
                {reviewedDecisionCount > 0 ? "Reopen stage" : "Open stage"}
              </button>
            </div>
          </section>
        )}
      </section>

      <section className="surface-panel board-stage-panel" id="project-review-service-notes">
        <div className="section-head">
          <div>
            <p className="eyebrow">Continue Step 3</p>
            <h2 className="section-title">Open the selected service pages and write project-specific notes.</h2>
            <p className="section-copy">
              This is where the real review happens. Open a selected service, review findings, and
              record why each relevant item is included, not applicable, excluded, or still pending.
            </p>
          </div>
        </div>

        {selectedServiceProgress.length > 0 ? (
          <>
            <section className="filter-card review-stage-handoff-card">
              <p className="eyebrow">Stage 3 handoff</p>
              <h3>Use the matrix to spot pressure points, then clear the services still carrying pending findings.</h3>
              <p className="microcopy">
                {signalFollowUp.servicesNeedingDecisions.length > 0
                  ? `Start with ${signalFollowUp.nextServiceNames.join(", ")}. These services still have unresolved findings or notes that need an explicit project decision.`
                  : "Every selected service already has an explicit decision state. Reopen a service only if the design assumptions, regions, or exclusions changed."}
              </p>
              <div className="chip-row compact-chip-row">
                <span className="chip">
                  {selectedServiceProgress.length.toLocaleString()} services selected
                </span>
                <span className="chip">
                  {signalFollowUp.servicesNeedingDecisions.length.toLocaleString()} services still need decisions
                </span>
                <span className="chip">
                  {signalFollowUp.servicesReadyForExportCount.toLocaleString()} services ready for export
                </span>
              </div>
              {activeStarterBundle ? (
                <div className="review-next-scope-block">
                  <p className="eyebrow">Likely next scope after {activeStarterBundle.title}</p>
                  <p className="microcopy">
                    {activeStarterBundle.bestFor}. {activeStarterBundle.watchFor}
                  </p>
                  <div className="chip-row compact-chip-row">
                    {activeStarterBundle.nextMoves.map((entry) => (
                      <span className="chip" key={`${activeStarterBundle.title}-${entry}`}>
                        {entry}
                      </span>
                    ))}
                  </div>
                  {nextScopeServiceSuggestions.length > 0 ? (
                    <>
                      <p className="microcopy">
                        Add the most likely follow-up services now if this baseline is turning into a fuller review.
                      </p>
                      <div className="review-next-scope-actions">
                        {nextScopeServiceSuggestions.map((service) => (
                          <button
                            type="button"
                            className="secondary-button review-next-scope-action"
                            key={`${activeStarterBundle.title}-${service.slug}`}
                            onClick={() =>
                              addServicesToReview(
                                [service.slug],
                                `${activeStarterBundle.title} follow-up suggestions`,
                                `Added {count} suggested follow-up service from ${activeStarterBundle.title}.`
                              )
                            }
                          >
                            Add {service.service}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="microcopy">
                      The likely follow-up services for this starter bundle are already in scope.
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            <div className="service-selection-grid">
              {selectedServiceProgress.map((entry) => (
                <article className="future-card service-selection-card" key={entry.service.slug}>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">
                        {entry.pendingCount > 0 ? "Needs review attention" : "Decisions captured"}
                      </p>
                      <h3>{entry.service.service}</h3>
                    </div>
                    <span className="chip">{entry.itemCount.toLocaleString()} findings</span>
                  </div>
                  <p className="microcopy">
                    {entry.includedCount.toLocaleString()} included, {entry.notApplicableCount.toLocaleString()} not applicable,
                    {entry.excludedCount > 0
                      ? ` ${entry.excludedCount.toLocaleString()} excluded,`
                      : ""} and {entry.pendingCount.toLocaleString()} still waiting for a project decision.
                  </p>
                  <div className="chip-row">
                    <span
                      className={`matrix-chip ${
                        entry.pendingCount > 0 ? "matrix-chip-warning" : "matrix-chip-good"
                      }`}
                    >
                      {entry.pendingCount > 0
                        ? `${entry.pendingCount.toLocaleString()} pending`
                        : "Ready for export"}
                    </span>
                    <span className="chip">{entry.service.familyCount.toLocaleString()} families</span>
                    <span className="chip">{entry.service.itemCount.toLocaleString()} total service findings</span>
                  </div>
                  <div className="button-row">
                    <Link href={`/services/${entry.service.slug}`} className="secondary-button">
                      Open service review
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">No services selected yet</p>
            <h3>Add services first, then come back here to continue the review.</h3>
            <p className="microcopy">
              Once services are in scope, this section becomes the quickest way to jump back into the
              exact service pages where you should record project notes.
            </p>
          </section>
        )}
      </section>

      <section
        id="project-review-local-exports"
        className={`surface-panel board-stage-panel${
          highlightedStageId === "project-review-local-exports" ? " board-stage-panel-highlighted" : ""
        }`}
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 4</p>
            <h2 className="section-title">Download only the scoped services and their project notes.</h2>
            <p className="section-copy">
              CSV works well for spreadsheets and action tracking. Markdown and text are better for
              architecture notes, pre-sales handoff, and leadership summaries. These downloads work
              without sign-in because they are generated directly in your browser.
            </p>
          </div>
          <div className="button-row review-stage-head-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                toggleStageExpansion(
                  "project-review-local-exports",
                  packageItems.length > 0 && reviewedDecisionCount > 0
                )
              }
            >
              {outputsStageExpanded ? "Collapse stage" : "Expand stage"}
            </button>
          </div>
        </div>

        {!outputsStageExpanded ? (
          <section className="filter-card review-stage-summary">
            <p className="eyebrow">Stage summary</p>
            <h3>
              {packageItems.length > 0
                ? reviewedDecisionCount > 0
                  ? `${reviewedDecisionCount.toLocaleString()} reviewed findings are ready for export.`
                  : `${packageItems.length.toLocaleString()} scoped findings can be exported, but they still need review decisions.`
                : "Exports will appear after services enter scope."}
            </h3>
            <p className="microcopy">
              {packageItems.length > 0
                ? reviewedDecisionCount > 0
                  ? "Open this stage again when you need checklist CSV, design notes, leadership summary, or regional risk output."
                  : `${pendingCount.toLocaleString()} scoped findings are still pending, so treat the exports as a draft until the review posture is more explicit.`
                : "This stage stays quiet until the review contains real service scope and findings."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStage("project-review-local-exports")}
              >
                {packageItems.length > 0 ? "Reopen stage" : "Open stage"}
              </button>
            </div>
          </section>
        ) : selectedServices.length > 0 ? (
          <>
          <section className="filter-card review-stage-handoff-card">
            <p className="eyebrow">Export posture</p>
            <h3>Choose the handoff artifact by audience first, then pick the file format.</h3>
            <p className="microcopy">
              {allScopedFindingsResolved
                ? "The scoped review is ready for cleaner handoff language. Use the previews below to choose the artifact that best matches the next conversation."
                : `${pendingCount.toLocaleString()} scoped findings are still pending, so every export below should be treated as a draft until the review posture is explicit.`}
            </p>
            <div className="chip-row compact-chip-row">
              <span className="chip">
                {packageItems.length.toLocaleString()} scoped findings
              </span>
              <span className="chip">
                {selectedServices.length.toLocaleString()} selected services
              </span>
              <span className="chip">
                {allScopedFindingsResolved ? "Ready for cleaner handoff" : "Draft posture"}
              </span>
            </div>
          </section>

          <div className="package-context-grid export-preview-grid">
            {outputFocusCards.map((card) => (
              <article className="future-card export-preview-card" key={card.title}>
                <p className="eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
                <div className="export-preview-bullet-list">
                  {card.bullets.map((bullet) => (
                    <p className="microcopy" key={`${card.title}-${bullet}`}>
                      {bullet}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <article className="filter-card package-card export-preview-controls">
            <div className="filter-grid">
              <label className="package-option">
                <input
                  type="checkbox"
                  checked={includeNotApplicable}
                  onChange={(event) => setIncludeNotApplicable(event.target.checked)}
                />
                <span className="microcopy">Include `Not Applicable` findings with rationale</span>
              </label>
              <label className="package-option">
                <input
                  type="checkbox"
                  checked={includeNeedsReview}
                  onChange={(event) => setIncludeNeedsReview(event.target.checked)}
                />
                <span className="microcopy">Include `Needs Review` items in the handoff</span>
              </label>
            </div>
            <p className="microcopy">
              These toggles update the previews below before you download anything, so the artifact
              choice stays tied to the exact draft posture of the current review.
            </p>
          </article>

          <div className="package-context-grid export-preview-grid">
            {outputArtifactCards.map((card) => (
              <article className="future-card export-preview-card export-preview-card-detailed" key={card.id}>
                <div className="export-preview-card-head">
                  <div>
                    <p className="eyebrow">{card.eyebrow}</p>
                    <h3>{card.title}</h3>
                  </div>
                  <span className="chip">{card.readiness}</span>
                </div>
                <p>{card.summary}</p>
                <div className="chip-row compact-chip-row">
                  {card.bullets.map((bullet) => (
                    <span className="chip" key={`${card.id}-${bullet}`}>
                      {bullet}
                    </span>
                  ))}
                </div>
                <div className="export-preview-surface">
                  <strong>{card.previewLabel}</strong>
                  <pre className="export-preview-code">{card.preview}</pre>
                </div>
                <div className="button-row">
                  {card.id === "checklist" ? (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!activePackage || packageItems.length === 0}
                      onClick={exportPackageCsv}
                    >
                      Download tracker CSV
                    </button>
                  ) : null}
                  {card.id === "design" ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!activePackage || packageItems.length === 0}
                        onClick={exportPackageMarkdown}
                      >
                        Download handoff Markdown
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || packageItems.length === 0}
                        onClick={exportPackageText}
                      >
                        Download plain text notes
                      </button>
                    </>
                  ) : null}
                  {card.id === "pricing" ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!activePackage || !pricingReady || pricingLoading}
                        onClick={exportPackagePricingCsv}
                      >
                        Download commercial CSV
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || !pricingReady || pricingLoading}
                        onClick={exportPackagePricingMarkdown}
                      >
                        Download commercial Markdown
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || !pricingReady || pricingLoading}
                        onClick={exportPackagePricingText}
                      >
                        Download pricing text
                      </button>
                    </>
                  ) : null}
                  {card.id === "estimate" ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                        onClick={exportPackageMonthlyEstimateCsv}
                      >
                        Download estimate CSV
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                        onClick={exportPackageMonthlyEstimateMarkdown}
                      >
                        Download estimate Markdown
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                        onClick={exportPackageMonthlyEstimateText}
                      >
                        Download estimate text
                      </button>
                    </>
                  ) : null}
                  {card.id === "leadership" ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!activePackage || matrixRows.length === 0}
                        onClick={exportLeadershipSummaryMarkdown}
                      >
                        Download leadership brief
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activePackage || regionalRiskExportRows.length === 0}
                        onClick={exportRegionalRiskCsv}
                      >
                        Download regional risk CSV
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <article className="leadership-brief package-card">
            <p className="eyebrow">Project review guidance</p>
            <h2 className="leadership-title">Notes, regional fit, and pricing now share the same project scope.</h2>
            <div className="leadership-list">
              <article>
                <strong>Target regions</strong>
                <p>Project review target regions now drive the default filter for service availability, restrictions, and pricing emphasis.</p>
              </article>
              <article>
                <strong>Pricing baseline</strong>
                <p>Use the commercial snapshot as the list-price baseline before moving into customer-specific usage and discount assumptions. Preferred SKU and sizing notes refine the estimate later, but they are not required to fetch the first-pass retail snapshot.</p>
              </article>
              <article>
                <strong>Commercial handoff</strong>
                <p>Export review notes separately from the pricing and estimate artifacts so each audience gets the level of detail they need.</p>
              </article>
            </div>
          </article>
          </>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">Exports unlock later</p>
            <h3>Add services to the review before generating scoped exports.</h3>
            <p className="microcopy">
              Once services are in scope, this section unlocks checklist exports, leadership summaries,
              and regional risk handoff artifacts for that exact design.
            </p>
          </section>
        )}
      </section>

      <section
        className={`surface-panel board-stage-panel${
          highlightedStageId === "project-review-cloud-continuity" ? " board-stage-panel-highlighted" : ""
        }`}
        id="project-review-cloud-continuity"
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">Optional cloud continuity</p>
            <h2 className="section-title">Sign in only when you want to keep this review beyond the current browser.</h2>
            <p className="section-copy">
              This is a normal project-review feature, not an admin boundary. Use it when you want
              Azure-backed save, reload, or a cloud-generated CSV. If not, the local-first workflow
              still works without sign-in.
            </p>
          </div>
          <div className="chip-row">
            <span className="chip">Local-first by default</span>
            <span className="chip">Admin login stays separate</span>
          </div>
          <div className="button-row review-stage-head-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => toggleStageExpansion("project-review-cloud-continuity", false)}
            >
              {continuityStageExpanded ? "Collapse stage" : "Expand stage"}
            </button>
          </div>
        </div>

        {!continuityStageExpanded ? (
          <section className="filter-card review-stage-summary">
            <p className="eyebrow">Stage summary</p>
            <h3>
              {activePackage
                ? "Azure-backed continuity is available whenever you want it."
                : "Cloud continuity stays locked until a review exists."}
            </h3>
            <p className="microcopy">
              {activePackage
                ? "This stage is intentionally optional. Keep the workflow local-first until you actually need save, restore, or a cloud-generated CSV."
                : "Create the review basics first, then sign in later only if you need continuity across sessions."}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStage("project-review-cloud-continuity")}
              >
                {activePackage ? "Reopen stage" : "Open stage"}
              </button>
            </div>
          </section>
        ) : activePackage ? (
          <ReviewCloudControls
            items={packageItems}
            reviews={reviews}
            activePackage={activePackage}
            copilotContext={copilotContext}
            onBeforeCloudSave={persistActivePackageFormState}
            onRestoreCloudState={handleRestoreCloudState}
            continueHref="#project-review-local-exports"
          />
        ) : (
          <section className="filter-card cloud-sync-card">
            <p className="eyebrow">Optional next step</p>
            <h3>Create a project review first, then sign in when you want to save it to Azure.</h3>
            <p className="microcopy">
              The Azure-backed save flow only applies after a project review exists. You can keep
              exploring the catalog and local exports before that point.
            </p>
          </section>
        )}
      </section>

      <section className="surface-panel board-stage-panel" id="project-review-pricing">
        <div className="section-head">
          <div>
            <p className="eyebrow">Retail meter snapshot</p>
            <h2 className="section-title">Export retail-meter pricing only for the services included in this project review.</h2>
            <p className="section-copy">
              This commercial view follows the selected services and target regions from the active
              project review, so pre-sales and solution teams can carry a focused retail pricing snapshot
              instead of the full Azure catalog.
            </p>
          </div>
        </div>

        {selectedServices.length > 0 ? (
          <>
            <section className="filter-card review-stage-handoff-card">
              <p className="eyebrow">Detailed commercial stage</p>
              <h3>{pricingStageStatus.title}</h3>
              <p className="microcopy">{pricingStageStatus.summary}</p>
              <div className="chip-row compact-chip-row">
                {pricingStageStatus.chips.map((chip) => (
                  <span className="chip" key={`pricing-stage-${chip}`}>
                    {chip}
                  </span>
                ))}
              </div>
            </section>

            <div className="package-header-grid">
              <article className="filter-card package-card">
                <div className="package-stats-grid">
                  <article className="hero-metric-card">
                    <span>Selected services</span>
                    <strong>{selectedServices.length.toLocaleString()}</strong>
                    <p>Only these services are queried for pricing.</p>
                  </article>
                  <article className="hero-metric-card">
                    <span>Pricing mapped</span>
                    <strong>{mappedPricingCount.toLocaleString()}</strong>
                    <p>Selected services with a current retail pricing query match.</p>
                  </article>
                  <article className="hero-metric-card">
                      <span>Lowest scoped meter</span>
                      <strong>
                        {startingRetailPrice.length > 0
                          ? formatRetailPrice(Math.min(...startingRetailPrice), pricingSnapshots[0]?.currencyCode ?? "USD")
                          : "Not published"}
                      </strong>
                      <p>Lowest target-scope retail meter across the selected services. This is not a monthly calculator estimate.</p>
                    </article>
                  <article className="hero-metric-card">
                    <span>Target regions</span>
                    <strong>{activePackage?.targetRegions.length.toLocaleString() ?? "0"}</strong>
                    <p>These regions are used to highlight region-matched pricing rows.</p>
                  </article>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!activePackage || !pricingReady || pricingLoading}
                    onClick={exportPackagePricingCsv}
                  >
                    Download pricing CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!activePackage || !pricingReady || pricingLoading}
                    onClick={exportPackagePricingMarkdown}
                  >
                    Download pricing Markdown
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!activePackage || !pricingReady || pricingLoading}
                    onClick={exportPackagePricingText}
                  >
                    Download pricing text
                  </button>
                </div>
              </article>

              <article className="leadership-brief package-card">
                <p className="eyebrow">Commercial guidance</p>
                <h2 className="leadership-title">Use list pricing for the first draft, then model quantity and agreement changes.</h2>
                <div className="leadership-list">
                  <article>
                    <strong>Retail baseline</strong>
                    <p>The project review snapshot uses Microsoft public retail pricing so the numbers are sourced and repeatable.</p>
                  </article>
                  <article>
                    <strong>Target-region bias</strong>
                    <p>Pricing queries stay global, but the project review highlights rows that line up with the target deployment regions.</p>
                  </article>
                  <article>
                    <strong>Refine later</strong>
                    <p>Use the Azure Pricing Calculator after sign-in to layer usage assumptions, discounts, and negotiated terms.</p>
                  </article>
                </div>
              </article>
            </div>

            {pricingLoading ? (
              <section className="filter-card">
                <p className="eyebrow">Pricing load</p>
                <h3>Loading retail pricing for the selected services.</h3>
                <p className="microcopy">
                  The project review is querying Microsoft’s Azure Retail Prices API for every service in scope.
                </p>
              </section>
            ) : null}

            {pricingError ? (
              <section className="filter-card">
                <p className="eyebrow">Pricing load</p>
                <h3>Pricing could not be loaded right now.</h3>
                <p className="microcopy">{pricingError}</p>
              </section>
            ) : null}

            {!pricingLoading && !pricingError && pricingSnapshots.length > 0 ? (
              <div className="service-selection-grid">
                {pricingSnapshots.map((pricing) => (
                  <article className="future-card service-selection-card" key={pricing.serviceSlug}>
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Commercial fit</p>
                        <h3>{pricing.serviceName}</h3>
                      </div>
                      <span className="chip">{pricing.mapped ? "Pricing mapped" : "Pricing pending"}</span>
                    </div>
                    <p className="microcopy">
                      {pricing.mapped
                        ? `${pricing.skuCount.toLocaleString()} SKUs, ${pricing.billingLocationCount.toLocaleString()} billing locations, and ${pricing.targetRegionMatchCount.toLocaleString()} target-region matches are currently published.`
                        : "No retail pricing mapping is published for this service yet in the current project review workflow."}
                    </p>
                    <div className="chip-row">
                        <span className="chip">
                          Lowest meter{" "}
                          {formatRetailPrice(
                            pricing.startsAtTargetRetailPrice ?? pricing.startsAtRetailPrice,
                            pricing.currencyCode
                          )}
                        </span>
                      {pricing.query ? (
                        <span className="chip">
                          {pricing.query.field} {pricing.query.operator} {pricing.query.value}
                        </span>
                      ) : null}
                    </div>
                    {pricing.notes.length > 0 ? (
                      <p className="microcopy">{pricing.notes.join(" ")}</p>
                    ) : null}
                    <div className="button-row">
                      <Link href={`/services/${pricing.serviceSlug}`} className="muted-link">
                        Open service view
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">Pricing appears after scoping</p>
            <h3>Select services first to load a focused retail snapshot.</h3>
            <p className="microcopy">
              This section stays quiet until the review has services in scope. After that, it loads only
              the matching retail rows and export options for the current design.
            </p>
          </section>
        )}
      </section>

      <section className="surface-panel board-stage-panel" id="project-review-estimates">
        <div className="section-head">
          <div>
            <p className="eyebrow">Monthly estimate</p>
            <h2 className="section-title">Estimate the project’s monthly cost with calculator-style defaults.</h2>
            <p className="section-copy">
              This view stays scoped to the selected services in the active project review. It keeps
              the retail feed as the source of unit prices, then layers default monthly assumptions on
              top so you can compare likely first-pass monthly totals without leaving the review.
            </p>
          </div>
        </div>

        {selectedServices.length > 0 ? (
          <>
            <section className="filter-card review-stage-handoff-card">
              <p className="eyebrow">Detailed estimate stage</p>
              <h3>{estimateStageStatus.title}</h3>
              <p className="microcopy">{estimateStageStatus.summary}</p>
              <div className="chip-row compact-chip-row">
                {estimateStageStatus.chips.map((chip) => (
                  <span className="chip" key={`estimate-stage-${chip}`}>
                    {chip}
                  </span>
                ))}
              </div>
            </section>

            <div className="package-header-grid">
              <article className="filter-card package-card">
                <div className="package-stats-grid">
                  <article className="hero-metric-card">
                    <span>Selected services</span>
                    <strong>{selectedServices.length.toLocaleString()}</strong>
                    <p>Only services in this project review are included in the monthly estimate.</p>
                  </article>
                  <article className="hero-metric-card">
                    <span>Estimate supported</span>
                    <strong>{supportedMonthlyEstimates.length.toLocaleString()}</strong>
                    <p>Selected services with a modeled monthly estimate from the current retail rows.</p>
                  </article>
                  <article className="hero-metric-card">
                    <span>Estimated hourly total</span>
                    <strong>
                      {supportedMonthlyEstimates.length > 0
                        ? formatEstimatePrice(totalHourlyEstimate, supportedMonthlyEstimates[0]?.currencyCode ?? "USD")
                        : "Not modeled"}
                    </strong>
                    <p>Average hourly view derived from the selected service estimates in this review.</p>
                  </article>
                  <article className="hero-metric-card">
                    <span>Estimated monthly total</span>
                    <strong>
                      {supportedMonthlyEstimates.length > 0
                        ? formatEstimatePrice(totalMonthlyEstimate, supportedMonthlyEstimates[0]?.currencyCode ?? "USD")
                        : "Not modeled"}
                    </strong>
                    <p>Sum of the selected per-service estimates currently chosen for this review.</p>
                  </article>
                  <article className="hero-metric-card">
                    <span>Need richer assumptions</span>
                    <strong>{(monthlyEstimates.length - supportedMonthlyEstimates.length).toLocaleString()}</strong>
                    <p>Services that still need deeper service-specific estimate modeling.</p>
                  </article>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                    onClick={exportPackageMonthlyEstimateCsv}
                  >
                    Download estimate CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                    onClick={exportPackageMonthlyEstimateMarkdown}
                  >
                    Download estimate Markdown
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!activePackage || !monthlyEstimateReady || pricingLoading}
                    onClick={exportPackageMonthlyEstimateText}
                  >
                    Download estimate text
                  </button>
                </div>
              </article>

              <article className="leadership-brief package-card">
                <p className="eyebrow">Estimate guidance</p>
                <h2 className="leadership-title">Use this as a Microsoft retail baseline, not as an official Azure Pricing Calculator result.</h2>
                <div className="leadership-list">
                  <article>
                    <strong>Still Microsoft-sourced</strong>
                    <p>The prices shown here come from the Microsoft Azure Retail Prices API. The site adds product-owned hourly and monthly estimate assumptions on top of those retail meters.</p>
                  </article>
                  <article>
                    <strong>Calculator parity is not implied</strong>
                    <p>This is not fetched from an Azure Pricing Calculator API. If someone needs a Microsoft calculator worksheet, they still need to open the Azure Pricing Calculator separately and configure it manually.</p>
                  </article>
                  <article>
                    <strong>Refine with structured inputs</strong>
                    <p>Preferred SKU, region, and estimate inputs let you tighten the estimate without turning this review experience into a full pricing portal.</p>
                  </article>
                </div>
              </article>
            </div>

            {pricingLoading ? (
              <section className="filter-card">
                <p className="eyebrow">Monthly estimate</p>
                <h3>Loading the retail rows needed for the monthly estimate.</h3>
                <p className="microcopy">
                  The estimate view appears after the scoped retail pricing snapshot finishes loading.
                </p>
              </section>
            ) : null}

            {!pricingLoading && monthlyEstimates.length > 0 ? (
              <div className="service-selection-grid">
                {monthlyEstimates.map((estimate) => (
                  <article className="future-card service-selection-card" key={`estimate-${estimate.serviceSlug}`}>
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Monthly estimate</p>
                        <h3>{estimate.serviceName}</h3>
                      </div>
                      <span className="chip">
                        {estimate.supported
                          ? `${estimate.coverage.replaceAll("-", " ")} · ${estimate.mode.replaceAll("-", " ")}`
                          : "Not modeled"}
                      </span>
                    </div>
                    <p className="microcopy">
                      {estimate.supported
                        ? `${estimate.selectedSkuName ?? "Selected SKU"} is currently contributing ${formatEstimatePrice(
                            estimate.selectedHourlyCost,
                            estimate.currencyCode
                          )} per hour and ${formatEstimatePrice(estimate.selectedMonthlyCost, estimate.currencyCode)} per month.`
                        : estimate.notes[0] ?? "A monthly estimate is not modeled for this service yet."}
                    </p>
                    {estimate.assumptions.length > 0 ? (
                      <div className="chip-row">
                        {estimate.assumptions.slice(0, 3).map((assumption) => (
                          <span className="chip" key={`${estimate.serviceSlug}-${assumption}`}>
                            {assumption}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {estimate.skuEstimates.length > 0 ? (
                      <div className="chip-row">
                        {estimate.skuEstimates.slice(0, 4).map((skuEstimate) => (
                          <span className="chip" key={`${estimate.serviceSlug}-${skuEstimate.skuName}`}>
                            {skuEstimate.skuName}: {formatEstimatePrice(skuEstimate.hourlyCost, estimate.currencyCode)}/hour · {formatEstimatePrice(skuEstimate.monthlyCost, estimate.currencyCode)}/month
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {estimate.supported ? (
                      <div className="chip-row">
                        <span className="chip">Profile {estimate.profileVersion ?? "n/a"}</span>
                        <span className="chip">Input mode {estimate.selectedInputMode}</span>
                        <span className="chip">Retail API source</span>
                      </div>
                    ) : null}
                    {estimate.supported && estimate.selectedInputs ? (
                      <div className="chip-row">
                        {Object.entries(estimate.selectedInputs)
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <span className="chip" key={`${estimate.serviceSlug}-${key}`}>
                              {key}: {String(value)}
                            </span>
                          ))}
                      </div>
                    ) : null}
                    {estimate.supported && estimate.selectedSkuName ? (
                      <div className="traceability-grid">
                        {(estimate.skuEstimates.find((entry) => entry.skuName === estimate.selectedSkuName)?.components ?? [])
                          .slice(0, 4)
                          .map((component) => (
                            <article className="trace-card" key={`${estimate.serviceSlug}-${component.label}-${component.meterId ?? component.meterName}`}>
                              <strong>{component.label}</strong>
                              <p>{formatEstimatePrice(component.hourlyCost, estimate.currencyCode)}/hour</p>
                              <p>{formatEstimatePrice(component.monthlyCost, estimate.currencyCode)}/month</p>
                              <p className="microcopy">{component.location} · {component.meterName}</p>
                            </article>
                          ))}
                      </div>
                    ) : null}
                    {estimate.notes.length > 0 ? (
                      <p className="microcopy">{estimate.notes.join(" ")}</p>
                    ) : null}
                    <div className="button-row">
                      <Link href={`/services/${estimate.serviceSlug}`} className="muted-link">
                        Open service view
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <section className="filter-card">
            <p className="eyebrow">Estimate appears after pricing scope exists</p>
            <h3>Build the service list first, then use monthly estimates for first-pass cost direction.</h3>
            <p className="microcopy">
              Monthly estimates stay hidden until the review has scoped services. That keeps early work
              focused on architecture and fit before cost modeling details appear.
            </p>
          </section>
        )}
      </section>

      {selectedServiceDrawerRow ? (
        <ProjectReviewServiceDrawer
          row={selectedServiceDrawerRow}
          targetRegions={activePackage?.targetRegions ?? []}
          reviews={reviews}
          activePackageName={activePackage?.name ?? null}
          pricingLoading={pricingLoading}
          pricingError={pricingError}
          regionalFitLoading={regionalFitLoading}
          regionalFitError={regionalFitError}
          onClose={() => setSelectedServiceDrawerSlug(null)}
          onOpenItem={handleOpenMatrixFinding}
          onUpdateServiceAssumption={updateServiceAssumption}
          onUpdateServiceEstimateInput={updateServiceEstimateInput}
          onUpdateServiceEstimateInputMode={updateServiceEstimateInputMode}
        />
      ) : null}

      {selectedItem ? (
        <ItemDrawer
          item={selectedItem}
          review={reviews[selectedItem.guid] ?? createEmptyReview()}
          onClose={() => setSelectedGuid(null)}
          onUpdate={(next) => updateReview(selectedItem.guid, next)}
          activePackageName={activePackage?.name ?? null}
        />
      ) : null}
        <aside className="review-summary-rail">
          <section className="surface-panel review-summary-card board-toolbar-card">
            <p className="eyebrow">Review summary</p>
            <h2 className="review-progress-title">Keep context visible while you work.</h2>
            <div className="review-summary-list">
              <div>
                <span>Review name</span>
                <strong>{activePackage?.name ?? "No active review"}</strong>
              </div>
              <div>
                <span>Review mode</span>
                <strong>{activePackage?.reviewMode ?? form.reviewMode}</strong>
              </div>
              <div>
                <span>Services in scope</span>
                <strong>{selectedServices.length.toLocaleString()}</strong>
              </div>
              <div>
                <span>Findings in scope</span>
                <strong>{packageItems.length.toLocaleString()}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{reviewStatusLabel}</strong>
              </div>
              <div>
                <span>Next action</span>
                <strong>{nextActionLabel}</strong>
              </div>
            </div>
            <div className="chip-row compact-chip-row">
              <span className="chip">{activePackage?.targetRegions.length.toLocaleString() ?? "0"} regions</span>
              <span className="chip">{reviewedDecisionCount.toLocaleString()} reviewed</span>
              <span className="chip">{pendingCount.toLocaleString()} pending</span>
            </div>
            <p className="microcopy">
              {currentWorkspaceStage?.detail ?? "Move through the steps in order to keep the review pack coherent."}
            </p>
          </section>
        </aside>
        </div>
      </div>
    </main>
  );
}

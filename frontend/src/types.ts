export type ChecklistTechnologyStatus = "GA" | "Preview" | "Deprecated" | "Unknown";
export type MaturityBucket = "GA" | "Preview" | "Deprecated" | "Mixed";
export type RecommendedUsageConfidence = "High" | "Medium" | "Limited" | "Retire";

export type ReviewState =
  | "Not Reviewed"
  | "Compliant"
  | "Non-Compliant"
  | "Partially Compliant"
  | "Not Applicable"
  | "Exception Accepted";

export type PackageDecision = "Needs Review" | "Include" | "Not Applicable" | "Exclude";

export type ReviewPackageAudience =
  | "Cloud Architect"
  | "Pre-sales Architect"
  | "Sales Architect"
  | "Senior Director"
  | "Cloud Engineer";

export type ReviewMode = "Standard review" | "ARB-grade review";

export type RegionalAccessState = "Open" | "ReservedAccess" | "EarlyAccess";
export type RegionalAvailabilityState = "GA" | "Preview" | "Retiring";
export type ServiceRegionalMatchType = "exact" | "alias" | "manual";
export type PricingQueryField = "serviceName" | "productName";
export type PricingQueryOperator = "eq" | "contains";
export type PricingLocationKind = "Region" | "BillingZone" | "Global" | "Unknown";
export type ServicePricingQuerySource =
  | "manual"
  | "matchedOffering"
  | "matchedLabel"
  | "serviceName"
  | "alias";
export type CommercialDataSourceMode = "live" | "cache" | "stale-cache";

export type FieldProvenance = "source" | "normalized" | "inferred" | "unavailable";

export type ChecklistItem = {
  guid: string;
  technology: string;
  technologySlug: string;
  technologyStatus: ChecklistTechnologyStatus;
  technologyMaturityBucket: MaturityBucket;
  usageConfidence: RecommendedUsageConfidence;
  technologyQualityScore: number;
  family: string;
  sourceKind: "checklists" | "checklists-ext";
  checklist?: string;
  category?: string;
  subcategory?: string;
  id?: string;
  text: string;
  description?: string;
  severity?: "High" | "Medium" | "Low";
  waf?: string;
  service?: string;
  serviceCanonical?: string;
  serviceSlug?: string;
  armService?: string;
  link?: string;
  training?: string;
  query?: string;
  graph?: string;
  sourcePath?: string;
  sourceUrl?: string;
  normalizedAt?: string;
  provenance?: Partial<
    Record<
      | "technology"
      | "technologyStatus"
      | "category"
      | "subcategory"
      | "severity"
      | "waf"
      | "service"
      | "description",
      FieldProvenance
    >
  >;
};

export type TechnologySummary = {
  slug: string;
  technology: string;
  status: ChecklistTechnologyStatus;
  maturityBucket: MaturityBucket;
  itemCount: number;
  highSeverityCount: number;
  categories: string[];
  services: string[];
  wafPillars: string[];
  sourcePath: string;
  sourceUrl: string;
  timestamp?: string;
  sourceKind: "checklists" | "checklists-ext";
  description: string;
  whatThisMeans: string;
  quality: {
    label: string;
    qualityScore: number;
    metadataCompleteness: number;
    severityConfidence: number;
    sourceCoverageQuality: number;
    recommendedUsageConfidence: RecommendedUsageConfidence;
    generatedDate: string;
    summary: string;
  };
};

export type OverviewMetric = {
  label: string;
  value: number;
  detail: string;
};

export type DistributionRow = {
  label: string;
  count: number;
};

export type CatalogSummary = {
  generatedAt: string;
  itemCount: number;
  technologyCount: number;
  gaDefaultTechnologyCount: number;
  gaReadyItemCount: number;
  previewTechnologyCount: number;
  mixedTechnologyCount: number;
  deprecatedTechnologyCount: number;
  metrics: OverviewMetric[];
  severityDistribution: DistributionRow[];
  statusDistribution: DistributionRow[];
  maturityDistribution: DistributionRow[];
  sourceDistribution: DistributionRow[];
  wafDistribution: DistributionRow[];
  topTechnologies: DistributionRow[];
  technologies: TechnologySummary[];
};

export type TechnologyPayload = {
  generatedAt: string;
  technology: TechnologySummary;
  items: ChecklistItem[];
};

export type TechnologyIndex = {
  generatedAt: string;
  technologies: TechnologySummary[];
};

export type ServiceSummary = {
  slug: string;
  service: string;
  aliases: string[];
  itemCount: number;
  highSeverityCount: number;
  familyCount: number;
  gaFamilyCount: number;
  previewFamilyCount: number;
  mixedFamilyCount: number;
  deprecatedFamilyCount: number;
  categories: string[];
  wafPillars: string[];
  description: string;
  whatThisMeans: string;
  regionalFitSummary?: ServiceRegionalFitSummary;
  families: Array<
    Pick<
      TechnologySummary,
      "slug" | "technology" | "status" | "maturityBucket" | "itemCount" | "highSeverityCount" | "quality"
    >
  >;
};

export type ServiceRegionalFitSku = {
  skuName: string;
  state: RegionalAvailabilityState;
};

export type ServiceRegionalFitRegion = {
  regionName: string;
  geographyName: string;
  accessState: RegionalAccessState;
  availabilityState: RegionalAvailabilityState;
  skuStates: ServiceRegionalFitSku[];
};

export type ServiceRegionalFitUnavailableRegion = {
  regionName: string;
  geographyName: string;
  accessState: RegionalAccessState;
};

export type ServiceRegionalFitSummary = {
  mapped: boolean;
  matchType?: ServiceRegionalMatchType;
  matchedOfferingName?: string;
  matchedServiceLabel?: string;
  matchedSkuHints?: string[];
  notes: string[];
  publicRegionCount: number;
  availableRegionCount: number;
  unavailableRegionCount: number;
  restrictedRegionCount: number;
  earlyAccessRegionCount: number;
  previewRegionCount: number;
  retiringRegionCount: number;
  isGlobalService: boolean;
  generatedAt: string;
  availabilitySourceUrl: string;
  regionsSourceUrl: string;
};

export type CommercialDataSourceInfo = {
  mode: CommercialDataSourceMode;
  refreshedAt?: string;
  expiresAt?: string;
  cacheTtlHours: number;
  lastError?: string;
};

export type ServiceIndex = {
  generatedAt: string;
  services: ServiceSummary[];
};

export type ServicePayload = {
  generatedAt: string;
  service: ServiceSummary;
  items: ChecklistItem[];
  regionalFit?: ServiceRegionalFit;
};

export type ServiceRegionalFit = ServiceRegionalFitSummary & {
  serviceSlug?: string;
  serviceName?: string;
  regions: ServiceRegionalFitRegion[];
  unavailableRegions: ServiceRegionalFitUnavailableRegion[];
  globalSkuStates: ServiceRegionalFitSku[];
  dataSource?: CommercialDataSourceInfo;
};

export type ServiceRegionalFitRequest = {
  slug: string;
  service: string;
  aliases: string[];
  matchedOfferingName?: string;
  matchedServiceLabel?: string;
  matchedSkuHints?: string[];
};

export type ServiceRegionalFitResponse = {
  generatedAt: string;
  sourceUrl: string;
  services: ServiceRegionalFit[];
};

export type ServicePricingQuery = {
  field: PricingQueryField;
  operator: PricingQueryOperator;
  value: string;
  source: ServicePricingQuerySource;
};

export type ServicePricingRequest = {
  slug: string;
  service: string;
  aliases: string[];
  matchedOfferingName?: string;
  matchedServiceLabel?: string;
  targetRegions?: string[];
};

export type ServicePricingRow = {
  meterId: string;
  meterName: string;
  productName: string;
  skuName: string;
  armSkuName: string;
  armRegionName: string;
  location: string;
  locationKind: PricingLocationKind;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  unitOfMeasure: string;
  retailPrice: number;
  unitPrice: number;
  tierMinimumUnits: number;
  currencyCode: string;
  type: string;
  isPrimaryMeterRegion: boolean;
};

export type ServicePricingSummary = {
  serviceSlug: string;
  serviceName: string;
  mapped: boolean;
  notes: string[];
  generatedAt: string;
  sourceUrl: string;
  calculatorUrl: string;
  priceDisclaimer: string;
  currencyCode: string;
  rowCount: number;
  meterCount: number;
  skuCount: number;
  regionCount: number;
  billingLocationCount: number;
  targetRegionMatchCount: number;
  targetPricingLocations: string[];
  startsAtRetailPrice?: number;
  startsAtTargetRetailPrice?: number;
  query?: ServicePricingQuery;
  dataSource?: CommercialDataSourceInfo;
};

export type ServicePricing = ServicePricingSummary & {
  rows: ServicePricingRow[];
};

export type ServicePricingResponse = {
  generatedAt: string;
  sourceUrl: string;
  services: ServicePricing[];
};

export type MonthlyEstimateMode =
  | "calculator-defaults"
  | "recurring-base-only"
  | "not-modeled";

export type EstimateInputMode = "defaults" | "custom";
export type MonthlyEstimateCoverage = "profiled" | "base-only" | "not-modeled";
export type ReviewServiceEstimateInputValue = string | number | boolean;
export type ReviewServiceEstimateInputs = Record<string, ReviewServiceEstimateInputValue>;
export type ServiceEstimateInputKind = "number" | "select" | "boolean";

export type ServiceEstimateInputOption = {
  label: string;
  value: string;
};

export type ServiceEstimateInputDefinition = {
  key: string;
  label: string;
  description: string;
  kind: ServiceEstimateInputKind;
  unit?: string;
  min?: number;
  step?: number;
  defaultValue: ReviewServiceEstimateInputValue;
  options?: ServiceEstimateInputOption[];
};

export type ServiceEstimateProfile = {
  serviceSlug: string;
  label: string;
  description: string;
  version: string;
  coverage: MonthlyEstimateCoverage;
  mode: MonthlyEstimateMode;
  inputDefinitions: ServiceEstimateInputDefinition[];
};

export type ServiceMonthlyEstimateComponent = {
  label: string;
  meterName: string;
  meterId?: string;
  skuName: string;
  location: string;
  unitOfMeasure: string;
  quantity: number;
  hourlyCost: number;
  monthlyCost: number;
  formulaKey?: string;
};

export type ServiceMonthlySkuEstimate = {
  skuName: string;
  hourlyCost: number;
  monthlyCost: number;
  assumptions: string[];
  notes: string[];
  components: ServiceMonthlyEstimateComponent[];
  isPreferred: boolean;
};

export type ServiceMonthlyEstimate = {
  serviceSlug: string;
  serviceName: string;
  supported: boolean;
  mode: MonthlyEstimateMode;
  currencyCode: string;
  profileVersion?: string;
  coverage: MonthlyEstimateCoverage;
  notes: string[];
  assumptions: string[];
  targetScopeApplied: boolean;
  selectedInputMode: EstimateInputMode;
  selectedInputs: ReviewServiceEstimateInputs;
  skuEstimates: ServiceMonthlySkuEstimate[];
  selectedSkuName?: string;
  selectedHourlyCost?: number;
  selectedMonthlyCost?: number;
};

export type ReviewDraft = {
  reviewState: ReviewState;
  packageDecision: PackageDecision;
  comments: string;
  owner: string;
  dueDate: string;
  evidenceLinks: string[];
  exceptionReason: string;
};

export type ReviewServiceAssumption = {
  plannedRegion: string;
  preferredSku: string;
  sizingNote: string;
  estimateProfileVersion?: string;
  estimateInputMode?: EstimateInputMode;
  estimateInputs?: ReviewServiceEstimateInputs;
};

export type ReviewPackage = {
  id: string;
  name: string;
  reviewMode: ReviewMode;
  audience: ReviewPackageAudience;
  businessScope: string;
  targetRegions: string[];
  selectedServiceSlugs: string[];
  serviceAssumptions: Record<string, ReviewServiceAssumption>;
  createdAt: string;
  updatedAt: string;
};

export type CopilotSource = {
  label: string;
  url?: string;
  note?: string;
};

export type ProjectReviewCopilotServiceContext = {
  serviceSlug: string;
  serviceName: string;
  description: string;
  plannedRegion?: string;
  preferredSku?: string;
  sizingNote?: string;
  itemCount: number;
  includedCount: number;
  notApplicableCount: number;
  excludedCount: number;
  pendingCount: number;
  regionFitSummary: string;
  regionFitSignals: string[];
  costFitSummary: string;
  costFitSignals: string[];
};

export type ProjectReviewCopilotFindingContext = {
  guid: string;
  serviceName: string;
  finding: string;
  severity?: "High" | "Medium" | "Low";
  decision: PackageDecision;
  comments?: string;
  owner?: string;
  dueDate?: string;
};

export type ProjectReviewCopilotContext = {
  review: {
    id: string;
    name: string;
    audience: ReviewPackageAudience;
    businessScope: string;
    targetRegions: string[];
  };
  services: ProjectReviewCopilotServiceContext[];
  findings: ProjectReviewCopilotFindingContext[];
  sources: CopilotSource[];
};

export type CopilotMode = "project-review" | "service-review" | "leadership-summary";

export type CopilotRequest = {
  question: string;
  mode?: CopilotMode;
  context?: ProjectReviewCopilotContext;
  useSavedContext?: boolean;
};

export type CopilotResponse = {
  answer: string;
  generatedAt: string;
  modelName: string;
  modelDeployment: string;
  mode: CopilotMode;
  groundingMode: "project-review-context" | "saved-project-review-context";
  sources: CopilotSource[];
};

export type ProjectReviewStateDocument = {
  schemaVersion: 1;
  updatedAt: string;
  activePackage: ReviewPackage | null;
  copilotContext: ProjectReviewCopilotContext | null;
};

export type SavedProjectReviewSummary = {
  id: string;
  name: string;
  audience: ReviewPackageAudience;
  businessScope: string;
  targetRegions: string[];
  selectedServiceSlugs: string[];
  serviceCount: number;
  recordCount: number;
  includedCount: number;
  notApplicableCount: number;
  excludedCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
};

export type CloudProjectReviewUser = {
  userId: string;
  email: string;
  displayName: string;
  provider: string;
  activeReviewId: string | null;
};

export type ProjectReviewLibraryResponse = {
  user: CloudProjectReviewUser;
  reviews: SavedProjectReviewSummary[];
};

export type ReviewTelemetryEventName =
  | "homepage_initialize_review"
  | "review_create"
  | "review_save_details"
  | "review_scope_change"
  | "review_export_download"
  | "review_cloud_action"
  | "admin_prompt_submit";

export type ReviewTelemetryEventCategory =
  | "homepage"
  | "review-workspace"
  | "continuity"
  | "admin";

export type ReviewTelemetryActor = "anonymous" | "authenticated" | "admin";

export type ReviewTelemetryEventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ReviewTelemetryEventRequest = {
  name: ReviewTelemetryEventName;
  category: ReviewTelemetryEventCategory;
  route: string;
  sessionId?: string;
  reviewId?: string | null;
  properties?: ReviewTelemetryEventProperties;
};

export type ReviewTelemetrySummaryMetric = {
  key:
    | "reviewStarts"
    | "reviewCreates"
    | "servicesAdded"
    | "exports"
    | "cloudLoads"
    | "cloudSaves"
    | "adminPrompts";
  label: string;
  count: number;
};

export type ReviewTelemetryBreakdownEntry = {
  key: string;
  label: string;
  count: number;
};

export type ReviewTelemetryDailyRollup = {
  date: string;
  totalEvents: number;
  reviewStarts: number;
  reviewCreates: number;
  servicesAdded: number;
  exports: number;
  cloudLoads: number;
  cloudSaves: number;
  adminPrompts: number;
};

export type ReviewTelemetryRecentEvent = {
  occurredAt: string;
  name: ReviewTelemetryEventName;
  category: ReviewTelemetryEventCategory;
  actor: ReviewTelemetryActor;
  route: string;
  reviewId?: string | null;
  properties: Record<string, string>;
};

export type ReviewTelemetrySummaryResponse = {
  checkedAt: string;
  storageConfigured: boolean;
  windowDays: number;
  totalEvents: number;
  metrics: ReviewTelemetrySummaryMetric[];
  exportBreakdown: ReviewTelemetryBreakdownEntry[];
  cloudActionBreakdown: ReviewTelemetryBreakdownEntry[];
  recentEvents: ReviewTelemetryRecentEvent[];
  dailyRollup: ReviewTelemetryDailyRollup[];
};

export type AdminCopilotScope = {
  resourceGroup: string;
  staticWebAppName?: string;
  functionAppName?: string;
  openAiResourceName?: string;
  openAiDeployment?: string | null;
  region?: string;
};

export type AdminCopilotDiagnosticFinding = {
  id: string;
  severity: "info" | "warning" | "error";
  label: string;
  detail: string;
};

export type AdminCopilotRefreshChannel = {
  ok: boolean;
  ttlHours: number;
  lastSuccessfulRefreshAt?: string | null;
  lastRefreshMode?: string | null;
  sourceUrl?: string | null;
  expiresAt?: string | null;
  lastError?: string | null;
  publicRegionCount?: number;
  lastServiceSlug?: string | null;
  lastWarmCount?: number;
};

export type AdminCopilotConfigEntry = {
  label: string;
  value: string;
  status: "configured" | "defaulted" | "missing";
  detail?: string;
};

export type AdminCopilotEvidenceEntry = {
  label: string;
  status: "healthy" | "warning" | "error" | "info";
  summary: string;
  detail?: string;
};

export type AdminCopilotHealthResponse = {
  status: string;
  checkedAt: string;
  scope: AdminCopilotScope;
  capabilities: {
    adminRouteProtected: boolean;
    adminApiReady: boolean;
    promptExecutionEnabled: boolean;
    mcpServerConfigured: boolean;
    copilotConfigured: boolean;
    applicationInsightsConfigured: boolean;
    storageConfigured: boolean;
  };
  backend: {
    functionAppName?: string | null;
    refreshSchedule?: string | null;
    manualRefreshEnabled?: boolean;
    warmServiceIndexUrl?: string | null;
    warmServiceLimit?: number;
    copilotEndpoint?: string | null;
    availability?: AdminCopilotRefreshChannel;
    pricing?: AdminCopilotRefreshChannel;
    runtime?: AdminCopilotConfigEntry[];
    storage?: AdminCopilotConfigEntry[];
    refresh?: AdminCopilotConfigEntry[];
    copilot?: AdminCopilotConfigEntry[];
    evidence?: AdminCopilotEvidenceEntry[];
  };
  notes: string[];
  findings: AdminCopilotDiagnosticFinding[];
};

export type AdminCopilotToolCall = {
  tool: string;
  status: "success" | "failed" | "skipped";
  detail?: string;
};

export type AdminCopilotRequest = {
  question: string;
  scope?: Partial<AdminCopilotScope>;
};

export type AdminCopilotResponse = {
  answer: string;
  generatedAt: string;
  modelName?: string | null;
  modelDeployment?: string | null;
  sources: CopilotSource[];
  toolCalls: AdminCopilotToolCall[];
  promptExecutionEnabled: boolean;
};

export type StructuredReviewRecord = {
  guid: string;
  technology: string;
  technologySlug: string;
  technologyStatus: ChecklistTechnologyStatus;
  technologyMaturityBucket: MaturityBucket;
  severity?: "High" | "Medium" | "Low";
  waf?: string;
  category?: string;
  subcategory?: string;
  service?: string;
  serviceCanonical?: string;
  sourcePath?: string;
  sourceUrl?: string;
  text: string;
  review: ReviewDraft;
  updatedAt: string;
};

export type ReviewRecordDocument = {
  schemaVersion: 1;
  updatedAt: string;
  recordCount: number;
  records: StructuredReviewRecord[];
};

export type StaticWebAppClientPrincipal = {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
};

export type ExplorerFilters = {
  search: string;
  statuses: ChecklistTechnologyStatus[];
  maturityBuckets: MaturityBucket[];
  severities: string[];
  waf: string[];
  services: string[];
  sourceKinds: string[];
  technologies: string[];
};

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ServiceSummary } from "@/types";

type HomeCardTone = "available" | "restricted" | "preview";

function HomeSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16.2 16.2 21 21"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getServiceState(service: ServiceSummary): {
  label: string;
  detail: string;
  tone: HomeCardTone;
} {
  if (service.slug === "azure-app-service" && service.previewFamilyCount > 0) {
    return {
      label: "Preview",
      detail: `${service.previewFamilyCount.toLocaleString()} preview checklist families`,
      tone: "preview"
    };
  }

  if ((service.regionalFitSummary?.restrictedRegionCount ?? 0) > 0 && service.slug === "api-management") {
    return {
      label: "Restricted",
      detail: `${service.regionalFitSummary?.restrictedRegionCount.toLocaleString()} restricted regions`,
      tone: "restricted"
    };
  }

  return {
    label: "Available",
    detail: `${service.regionalFitSummary?.availableRegionCount.toLocaleString() ?? "0"} mapped regions`,
    tone: "available"
  };
}

function buildSearchableText(service: ServiceSummary) {
  return [
    service.service,
    ...service.aliases,
    ...service.categories,
    ...service.families.map((family) => family.technology)
  ]
    .join(" ")
    .toLowerCase();
}

function rankServiceMatch(service: ServiceSummary, normalizedQuery: string) {
  const serviceName = service.service.toLowerCase();
  const aliases = service.aliases.map((alias) => alias.toLowerCase());

  if (serviceName === normalizedQuery || aliases.includes(normalizedQuery)) {
    return 0;
  }

  if (serviceName.startsWith(normalizedQuery) || aliases.some((alias) => alias.startsWith(normalizedQuery))) {
    return 1;
  }

  if (serviceName.includes(normalizedQuery) || aliases.some((alias) => alias.includes(normalizedQuery))) {
    return 2;
  }

  return 3;
}

export function HomepageServiceBrowser({
  services,
  featuredServices
}: {
  services: ServiceSummary[];
  featuredServices: ServiceSummary[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  const visibleServices = useMemo(() => {
    if (!normalizedSearch) {
      return featuredServices;
    }

    return [...services]
      .filter((service) => buildSearchableText(service).includes(normalizedSearch))
      .sort((left, right) => {
        const rankDelta = rankServiceMatch(left, normalizedSearch) - rankServiceMatch(right, normalizedSearch);

        if (rankDelta !== 0) {
          return rankDelta;
        }

        return right.itemCount - left.itemCount;
      })
      .slice(0, 3);
  }, [featuredServices, normalizedSearch, services]);

  const topMatch = visibleServices[0];
  const helperCopy = normalizedSearch
    ? topMatch
      ? `Press Enter to open ${topMatch.service}.`
      : "No match yet. Open the full catalog."
    : "Find the Azure service you want to review.";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedSearch && topMatch) {
      router.push(`/services/${topMatch.slug}`);
      return;
    }

    router.push("/services");
  }

  return (
    <>
      <form className="home-search-form" onSubmit={handleSubmit}>
        <label className="home-search-field">
          <HomeSearchIcon />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a service (e.g., Cosmos DB)"
            aria-label="Search Azure services"
          />
        </label>
      </form>

      <p className="home-search-helper">{helperCopy}</p>

      {visibleServices.length > 0 ? (
        <div className="home-status-grid">
          {visibleServices.map((service) => {
            const state = getServiceState(service);

            return (
              <Link
                href={`/services/${service.slug}`}
                className={`home-status-tile home-status-tile-${state.tone} home-status-tile-link`}
                key={service.slug}
              >
                <strong>{service.service}</strong>
                <span>{state.detail}</span>
                <em>{state.label}</em>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="home-card-empty">
          <p>No matching services found.</p>
          <Link href="/services" className="home-inline-link">
            Browse Services
          </Link>
        </div>
      )}
    </>
  );
}

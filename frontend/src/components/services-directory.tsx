"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ServiceIndex } from "@/types";

// Normalize a category string for deduplication and matching.
// Trim whitespace, collapse internal runs, then lowercase for the key.
function normalizeCategory(cat: string): string {
  return cat.trim().replace(/\s+/g, " ").toLowerCase();
}

export function ServicesDirectory({ index }: { index: ServiceIndex }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const normalizedSearch = search.trim().toLowerCase();

  // Build a deduplicated list of categories using case-insensitive keys.
  // The first occurrence wins for the display label so casing stays natural.
  const availableCategories = useMemo(() => {
    const seen = new Map<string, string>(); // normalized key → display label
    for (const cat of index.services.flatMap((s) => s.categories)) {
      if (!cat?.trim()) continue;
      const key = normalizeCategory(cat);
      if (!seen.has(key)) {
        seen.set(key, cat.trim());
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, label]) => ({ key, label }));
  }, [index.services]);

  const filteredServices = useMemo(
    () =>
      index.services.filter((service) => {
        if (category === "ga-baseline") {
          if (service.gaFamilyCount <= 0) return false;
        } else if (category !== "all") {
          if (!service.categories.some((c) => normalizeCategory(c) === category)) return false;
        }
        if (!normalizedSearch) return true;
        const searchable = [
          service.service,
          ...service.aliases,
          ...service.categories,
          ...service.families.map((f) => f.technology)
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedSearch);
      }),
    [category, index.services, normalizedSearch]
  );

  return (
    <main className="svc-page">

      {/* Page header */}
      <section className="svc-page-header">
        <h1 className="svc-page-title">Start with the Azure service, not the checklist filename.</h1>
        <p className="svc-page-sub">
          Browse {index.services.length}+ Azure services, WAF findings, regional fit, and pricing
          — no sign-in required.
        </p>
      </section>

      {/* Search */}
      <section className="svc-search-bar-wrap">
        <input
          className="svc-search-bar"
          type="search"
          value={search}
          placeholder={`Search ${index.services.length}+ Azure services…`}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search Azure services"
        />
      </section>

      {/* Category filter pills */}
      <div className="svc-filter-row" role="group" aria-label="Filter by category">
        <button
          type="button"
          className={`svc-filter-pill${category === "all" ? " svc-filter-pill--active" : ""}`}
          onClick={() => setCategory("all")}
        >
          All services
        </button>
        <button
          type="button"
          className={`svc-filter-pill${category === "ga-baseline" ? " svc-filter-pill--active" : ""}`}
          onClick={() => setCategory("ga-baseline")}
        >
          GA baseline available
        </button>
        {availableCategories.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`svc-filter-pill${category === key ? " svc-filter-pill--active" : ""}`}
            onClick={() => setCategory(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="svc-results-count">
        {filteredServices.length.toLocaleString()} service{filteredServices.length !== 1 ? "s" : ""}
        {normalizedSearch || category !== "all" ? " matching" : ""}
      </p>

      {/* Service grid */}
      {filteredServices.length > 0 ? (
        <div className="svc-grid">
          {filteredServices.map((service) => (
            <article key={service.slug} className="svc-card">
              <div className="svc-card-head">
                <h2 className="svc-card-name">{service.service}</h2>
                {service.categories[0] ? (
                  <span className="svc-card-cat">{service.categories[0]}</span>
                ) : null}
              </div>
              {service.description ? (
                <p className="svc-card-desc">{service.description}</p>
              ) : null}
              <div className="svc-card-meta">
                <span>{service.itemCount.toLocaleString()} findings</span>
                <span>
                  {service.gaFamilyCount > 0
                    ? `${service.gaFamilyCount} GA families`
                    : "Preview guidance"}
                </span>
              </div>
              <Link href={`/services/${service.slug}`} className="svc-card-link">
                Open service view
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="svc-empty">
          <p>No services match your search.</p>
          <button
            type="button"
            className="svc-reset-btn"
            onClick={() => { setSearch(""); setCategory("all"); }}
          >
            Clear filters
          </button>
        </div>
      )}
    </main>
  );
}

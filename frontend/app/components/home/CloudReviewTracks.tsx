/**
 * CloudReviewTracks — Azure live, AWS + Google Cloud planned (Req 7).
 *
 * Renders exactly three Provider_Track cards in the order Azure, AWS,
 * Google Cloud.  The Azure card is a clickable `<a href="/arb">`; the
 * AWS and Google Cloud cards are non-interactive `<article
 * aria-disabled="true">` with a visible "Planned" badge (Req 7.7).
 *
 * Logos use the first-party assets that already ship in `public/`
 * (Req 15.3).  No emoji anywhere in this section (Req 7.6, Property P4).
 *
 * Pure presentational component.
 */

import type { ReactNode } from "react";
import { HOME_COPY, TRACKS, type CloudTrack } from "./home-copy";

interface TrackCardContentsProps {
  track: CloudTrack;
}

function TrackCardContents({ track }: TrackCardContentsProps) {
  return (
    <>
      <div className="review-track-head">
        <img
          src={track.logo}
          alt={track.logoAlt}
          className="review-track-logo"
          width={100}
          height={28}
          loading="lazy"
        />
        <span className="review-track-planned-badge">
          {track.status === "Available Today"
            ? HOME_COPY.tracks.availableBadge
            : HOME_COPY.tracks.plannedBadge}
        </span>
      </div>
      <h3>{track.name}</h3>
      <ul
        className="review-track-frameworks"
        aria-label={`${track.name} framework alignment`}
      >
        {track.frameworkTags.map((tag) => (
          <li key={tag} className="review-track-framework-chip">
            {tag}
          </li>
        ))}
      </ul>
    </>
  );
}

function TrackCard({ track }: { track: CloudTrack }): ReactNode {
  if (track.href && track.status === "Available Today") {
    return (
      <a
        key={track.name}
        href={track.href}
        className="review-card review-track-card review-track-card-live"
        data-track-name={track.name}
      >
        <TrackCardContents track={track} />
      </a>
    );
  }
  return (
    <article
      key={track.name}
      className="review-card review-track-card review-track-card-planned"
      aria-disabled="true"
      data-track-name={track.name}
    >
      <TrackCardContents track={track} />
    </article>
  );
}

export default function CloudReviewTracks() {
  return (
    <section
      className="review-section"
      aria-labelledby="tracks-title"
      data-home-section="tracks"
    >
      <div className="review-section-head">
        <p className="review-eyebrow">Current and future tracks</p>
        <h2 id="tracks-title">{HOME_COPY.tracks.sectionTitle}</h2>
      </div>
      <div className="review-card-grid review-card-grid-3">
        {TRACKS.map((track) => (
          <TrackCard key={track.name} track={track} />
        ))}
      </div>
    </section>
  );
}

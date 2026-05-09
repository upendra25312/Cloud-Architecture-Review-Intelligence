"use client";

import { useEffect, useRef, useState } from "react";

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="cmd-overlay"
      role="dialog"
      aria-label="Command bar"
      aria-modal="true"
      onClick={() => setOpen(false)}
    >
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-row">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 12l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search services, findings, reviews…"
            aria-label="Search"
          />
          <kbd className="cmd-kbd">Esc</kbd>
        </div>
        <p className="cmd-hint">Full search coming soon — press Esc to close.</p>
      </div>
    </div>
  );
}

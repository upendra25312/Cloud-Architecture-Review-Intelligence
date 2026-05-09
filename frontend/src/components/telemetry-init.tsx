"use client";

import { useEffect } from "react";
import { initTelemetry } from "@/lib/telemetry";

export function TelemetryInit() {
  useEffect(() => {
    initTelemetry();
  }, []);

  return null;
}

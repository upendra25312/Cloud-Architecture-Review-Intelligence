import { Suspense } from "react";
import { ArbLandingRouter } from "@/components/arb/arb-landing-router";

export default function ArbLandingPage() {
  return (
    <main className="arb-page">
      <Suspense fallback={<div className="arb-library-loading"><p>Loading review workspace…</p></div>}>
        <ArbLandingRouter />
      </Suspense>
    </main>
  );
}

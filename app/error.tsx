"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="bvErrorPage">
      <div className="bvErrorContent">
        <div className="bvErrorCode">Error</div>
        <h1 className="bvErrorTitle">Something went wrong</h1>
        <p className="bvErrorMessage">
          We encountered an unexpected error. Please try again.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <button className="btn btnPrimary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/app" className="btn">
            Go to app
          </Link>
        </div>
      </div>
    </div>
  );
}


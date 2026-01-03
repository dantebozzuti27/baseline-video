import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bvErrorPage">
      <div className="bvErrorContent">
        <div className="bvErrorCode">404</div>
        <h1 className="bvErrorTitle">Page not found</h1>
        <p className="bvErrorMessage">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <Link href="/app" className="btn btnPrimary">
            Go to app
          </Link>
          <Link href="/" className="btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}


export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>Baseline Video</h1>
      <p style={{ marginTop: 12 }}>
        Fresh start. If you can see this page, the deployment is working.
      </p>
      <p style={{ marginTop: 12 }}>
        API health check: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}

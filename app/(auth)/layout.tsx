export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 56 }}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="brand" style={{ justifyContent: "center" }}>
          <img className="brandLogo" src="/brand-Photoroom.png" alt="Baseline Video" />
        </div>
        {children}
      </div>
    </div>
  );
}



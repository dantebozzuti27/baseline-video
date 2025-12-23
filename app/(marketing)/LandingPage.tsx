import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="container bvLanding" style={{ maxWidth: 1100, paddingTop: 44, paddingBottom: 64 }}>
      <div className="stack" style={{ gap: 28 }}>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div />
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <Link className="btn" href="/sign-in">
              Sign in
            </Link>
            <Link className="btn btnPrimary" href="/sign-up/coach">
              Create coach team
            </Link>
          </div>
        </div>

        <div className="row" style={{ alignItems: "stretch", gap: 16 }}>
          <div style={{ flex: "1 1 420px", minWidth: 280 }}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="bvLandingHeroLogoWrap">
                <img className="bvLandingHeroLogo" src="/brand-Photoroom.png" alt="Baseline Video" />
              </div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
                The calm, simple video hub for baseball teams.
              </h1>
              <div className="muted" style={{ fontSize: 16, lineHeight: 1.5 }}>
                Upload game + training clips, keep them organized by player, and leave fast timestamped feedback.
                Built for coaches who don’t want to learn software.
              </div>

              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <Link className="btn btnPrimary" href="/sign-up/coach">
                  Create your team
                </Link>
                <Link className="btn" href="/sign-up/player">
                  Join as a player
                </Link>
              </div>

              <div className="muted" style={{ fontSize: 13 }}>
                Private by default: players see only their own videos. Coaches see the whole team.
              </div>
            </div>
          </div>

          <div style={{ flex: "1 1 420px", minWidth: 280 }}>
            <div className="card">
              <div className="stack" style={{ gap: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>Product preview</div>
                <div className="row" style={{ gap: 10 }}>
                  <div className="card" style={{ flex: 1, padding: 12 }}>
                    <div className="label">Coach dashboard</div>
                    <div style={{ marginTop: 8, fontWeight: 900 }}>Triage newest uploads</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                      See what needs review, jump into player pages, and stay on top of the week.
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1, padding: 12 }}>
                    <div className="label">Video comments</div>
                    <div style={{ marginTop: 8, fontWeight: 900 }}>Timestamped notes</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                      Click a moment, write a note, move on. Fast feedback without clutter.
                    </div>
                  </div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div className="label">Upload flow</div>
                  <div style={{ marginTop: 8, fontWeight: 900 }}>File or link</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                    Upload from your phone, or paste a YouTube/Drive link — categorized as Game or Training.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="card" style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 900 }}>Clean team library</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
              Keep a shared library for drills, reference swings, and clips you want everyone to see.
            </div>
          </div>
          <div className="card" style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 900 }}>Permission-first</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
              Coaches and players only see what they should. No “social feed” distractions.
            </div>
          </div>
          <div className="card" style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 900 }}>Mobile-first</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
              Built for the dugout and the cage — fast uploads, clear layout, touch-friendly controls.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stack" style={{ gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>How it works</div>
            <div className="row" style={{ gap: 10 }}>
              <div className="card" style={{ flex: "1 1 240px", padding: 12 }}>
                <div className="label">1</div>
                <div style={{ fontWeight: 900, marginTop: 6 }}>Create a team</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                  Coaches create a team, then share a simple invite link to players.
                </div>
              </div>
              <div className="card" style={{ flex: "1 1 240px", padding: 12 }}>
                <div className="label">2</div>
                <div style={{ fontWeight: 900, marginTop: 6 }}>Upload game + training</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                  Upload files or links. Everything is categorized and timestamped automatically.
                </div>
              </div>
              <div className="card" style={{ flex: "1 1 240px", padding: 12 }}>
                <div className="label">3</div>
                <div style={{ fontWeight: 900, marginTop: 6 }}>Review + comment</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                  Coaches review team uploads. Players track progress on their own feed.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stack" style={{ gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>FAQ</div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontWeight: 800 }}>Can players see other players’ videos?</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                  No. Players can only see their own videos. Coaches can see all videos on their team.
                </div>
              </div>
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontWeight: 800 }}>Can we upload YouTube/Drive links?</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                  Yes — upload a file or paste a link.
                </div>
              </div>
            </div>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Ready to set up your team?
              </div>
              <div className="row" style={{ gap: 10 }}>
                <Link className="btn" href="/sign-up/player">
                  Join as player
                </Link>
                <Link className="btn btnPrimary" href="/sign-up/coach">
                  Create coach team
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 12, textAlign: "center", paddingTop: 10 }}>
          © {new Date().getFullYear()} Baseline Video
        </div>
      </div>
    </div>
  );
}



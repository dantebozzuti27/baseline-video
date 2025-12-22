"use client";

import * as React from "react";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

type Props = {
  role: "coach" | "player";
  displayName: string;
  email: string;
};

export default function HeaderMenu({ role, displayName, email }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="bvMobileHeaderActions">
        <Link className="btn btnPrimary" href="/app/upload">
          Upload
        </Link>
        <button className="btn" onClick={() => setOpen(true)}>
          Menu
        </button>
      </div>

      {open ? (
        <div className="bvMobileSheetBackdrop" onClick={() => setOpen(false)} role="presentation">
          <div className="bvMobileSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="stack" style={{ gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900 }}>{displayName}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {role === "coach" ? "Coach" : "Player"} • {email}
                </div>
              </div>

              <div className="row">
                <Link
                  className="pill"
                  href={role === "coach" ? "/app/dashboard" : "/app"}
                  onClick={() => setOpen(false)}
                >
                  {role === "coach" ? "Dashboard" : "Videos"}
                </Link>
                {role === "coach" ? (
                  <>
                    <Link className="pill" href="/app/library" onClick={() => setOpen(false)}>
                      Library
                    </Link>
                    <Link className="pill" href="/app/compare" onClick={() => setOpen(false)}>
                      Compare
                    </Link>
                    <Link className="pill" href="/app/audit" onClick={() => setOpen(false)}>
                      Audit
                    </Link>
                  </>
                ) : null}
                <Link className="pill" href="/app/trash" onClick={() => setOpen(false)}>
                  Trash
                </Link>
                <Link className="pill" href="/app/settings" onClick={() => setOpen(false)}>
                  Account & team
                </Link>
              </div>

              <div className="row" style={{ alignItems: "center" }}>
                <SignOutButton />
                <button className="btn" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}



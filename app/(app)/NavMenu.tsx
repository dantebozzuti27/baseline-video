"use client";

import * as React from "react";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

type Props = {
  role: "coach" | "player";
};

export default function NavMenu({ role }: Props) {
  const [open, setOpen] = React.useState(false);
  const isCoach = role === "coach";

  return (
    <>
      <button className="pill" onClick={() => setOpen(true)}>
        Menu
      </button>

      {open ? (
        <div className="bvMobileSheetBackdrop" onClick={() => setOpen(false)} role="presentation">
          <div className="bvMobileSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <Link className="pill" href="/app/settings" onClick={() => setOpen(false)}>
                  Account & team
                </Link>
                <Link className="pill" href="/app/trash" onClick={() => setOpen(false)}>
                  Trash
                </Link>
                {isCoach ? (
                  <Link className="pill" href="/app/compare" onClick={() => setOpen(false)}>
                    Compare
                  </Link>
                ) : null}
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



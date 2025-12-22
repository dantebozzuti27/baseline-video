"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";

type Props = {
  role: "coach" | "player";
  displayName: string;
  email: string;
};

function Tab({
  href,
  label,
  active
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link className={active ? "bvMobileTab bvMobileTabActive" : "bvMobileTab"} href={href}>
      {label}
    </Link>
  );
}

export default function MobileNav({ role, displayName, email }: Props) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = React.useState(false);

  const homeHref = role === "coach" ? "/app/dashboard" : "/app";

  return (
    <>
      <div className="bvMobileNav">
        <div className="bvMobileNavInner">
          <Tab href={homeHref} label={role === "coach" ? "Dashboard" : "Videos"} active={pathname === homeHref} />
          <Tab href="/app/upload" label="Upload" active={pathname.startsWith("/app/upload")} />
          {role === "coach" ? <Tab href="/app/library" label="Library" active={pathname.startsWith("/app/library")} /> : null}
          <button className={open ? "bvMobileTab bvMobileTabActive" : "bvMobileTab"} onClick={() => setOpen(true)}>
            More
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="bvMobileSheetBackdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div className="bvMobileSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="stack" style={{ gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900 }}>{displayName}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {role === "coach" ? "Coach" : "Player"} • {email}
                </div>
              </div>

              <div className="row">
                <Link className="pill" href="/app/profile" onClick={() => setOpen(false)}>
                  Profile
                </Link>
                {role === "coach" ? (
                  <Link className="pill" href="/app/settings" onClick={() => setOpen(false)}>
                    Settings
                  </Link>
                ) : null}
                <Link className="pill" href="/app/trash" onClick={() => setOpen(false)}>
                  Trash
                </Link>
                {role === "coach" ? (
                  <>
                    <Link className="pill" href="/app/compare" onClick={() => setOpen(false)}>
                      Compare
                    </Link>
                    <Link className="pill" href="/app/audit" onClick={() => setOpen(false)}>
                      Audit
                    </Link>
                  </>
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



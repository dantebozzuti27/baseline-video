"use client";

import * as React from "react";
import Link from "next/link";
import DrawerNav from "./DrawerNav";
import BottomNav from "./BottomNav";
import UploadFAB from "./UploadFAB";
import SearchCommand from "./SearchCommand";
import KeyboardHelp from "./KeyboardHelp";
import GlobalKeyboard from "./GlobalKeyboard";
import ToastClient from "./ToastClient";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";

type Props = {
  role: "coach" | "player";
  displayName: string;
  children: React.ReactNode;
};

export default function AppShell({ role, displayName, children }: Props) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div>
      <a href="#main-content" className="bvSkipLink">Skip to content</a>
      
      <div className="nav">
        <div className="navInner">
          <div className="bvTopBarLeft">
            <DrawerNav role={role} displayName={displayName} />
            <Link className="brand" href="/app" aria-label="Baseline Video home">
              <img className="bvAppLogo" src="/brand copy-Photoroom.png" alt="Baseline Video" />
            </Link>
          </div>
          <div className="bvTopBarRight">
            <button className="bvSearchTrigger" onClick={() => setSearchOpen(true)} aria-label="Search">
              <span className="bvSearchPlaceholder">Search…</span>
              <kbd className="bvSearchKbd">⌘K</kbd>
            </button>
            <Link className="btn btnPrimary bvDesktopOnly" href="/app/upload">
              Upload
            </Link>
          </div>
        </div>
      </div>
      
      <main id="main-content" className="container">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      
      <UploadFAB />
      <BottomNav role={role} />
      <ToastClient />
      
      <GlobalKeyboard 
        onHelp={() => setHelpOpen(true)} 
        onSearch={() => setSearchOpen(true)} 
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SearchCommand isCoach={role === "coach"} open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AnalyticsTracker />
    </div>
  );
}

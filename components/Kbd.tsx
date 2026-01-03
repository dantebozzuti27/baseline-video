"use client";

import * as React from "react";

type Props = {
  children: React.ReactNode;
};

export function Kbd({ children }: Props) {
  return <kbd className="bvKbd">{children}</kbd>;
}

export function KbdGroup({ children }: Props) {
  return <span className="bvKbdGroup">{children}</span>;
}


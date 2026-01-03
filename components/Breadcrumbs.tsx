"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  items: Crumb[];
  showHome?: boolean;
};

export function Breadcrumbs({ items, showHome = true }: Props) {
  const allItems: Crumb[] = showHome
    ? [{ label: "Home", href: "/app" }, ...items]
    : items;

  return (
    <nav className="bvBreadcrumbs" aria-label="Breadcrumb">
      <ol>
        {allItems.map((item, i) => {
          const isLast = i === allItems.length - 1;
          const isHome = i === 0 && showHome;

          return (
            <li key={i}>
              {item.href && !isLast ? (
                <Link href={item.href} className="bvBreadcrumbLink">
                  {isHome ? <Home size={14} /> : item.label}
                </Link>
              ) : (
                <span className={isLast ? "bvBreadcrumbCurrent" : "bvBreadcrumbLink"}>
                  {isHome ? <Home size={14} /> : item.label}
                </span>
              )}
              {!isLast && <ChevronRight size={14} className="bvBreadcrumbSep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}


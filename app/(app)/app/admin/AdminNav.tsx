"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  AlertCircle, 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Users, 
  RefreshCw,
  Filter,
  Video,
  Heart,
  Trophy
} from "lucide-react";

const navItems = [
  { href: "/app/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/app/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/app/admin/retention", label: "Retention", icon: RefreshCw },
  { href: "/app/admin/funnels", label: "Funnels", icon: Filter },
  { href: "/app/admin/content", label: "Content", icon: Video },
  { href: "/app/admin/teams", label: "Teams", icon: Trophy },
  { href: "/app/admin/users", label: "Users", icon: Users },
  { href: "/app/admin/events", label: "Events", icon: Activity },
  { href: "/app/admin/errors", label: "Errors", icon: AlertCircle },
  { href: "/app/admin/health", label: "Health", icon: Heart },
  { href: "/app/admin/business", label: "Business", icon: TrendingUp }
];

export default function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="row" style={{ gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "pill pillPrimary" : "pill"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none"
            }}
          >
            <Icon size={14} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}


import type { Profile } from "@/lib/db/types";

export function displayNameFromProfile(p: Pick<Profile, "first_name" | "last_name" | "display_name">) {
  const first = (p.first_name ?? "").trim();
  const last = (p.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || (p.display_name ?? "").trim() || "User";
}

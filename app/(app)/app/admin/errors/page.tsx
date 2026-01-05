import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, Pill } from "@/components/ui";
import AdminNav from "../AdminNav";
import ErrorsClient from "./ErrorsClient";

export const dynamic = "force-dynamic";

async function getErrors() {
  const admin = createSupabaseAdminClient();

  const { data: errors } = await admin
    .from("error_logs")
    .select("id, error_type, message, stack, user_id, endpoint, metadata, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return errors || [];
}

export default async function AdminErrorsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const errors = await getErrors();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Errors" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Error Monitor</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Track and resolve application errors.
        </div>
      </div>

      <AdminNav />

      <ErrorsClient errors={errors} />
    </div>
  );
}


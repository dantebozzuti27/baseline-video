import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logEvent(action: string, entityType: string, entityId?: string | null, metadata?: Record<string, any>) {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.rpc("log_event", {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId ?? null,
      p_metadata: metadata ?? {}
    });
  } catch {
    // ignore
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET: Get report details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: report, error } = await supabase
      .from("scouting_reports")
      .select(
        `
        *,
        player:profiles!scouting_reports_player_user_id_fkey(
          user_id,
          display_name,
          first_name,
          last_name
        ),
        creator:profiles!scouting_reports_creator_user_id_fkey(
          user_id,
          display_name
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Get report error:", error);
    return NextResponse.json(
      { error: "Failed to get report" },
      { status: 500 }
    );
  }
}

// PATCH: Update report
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if coach
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get existing report
    const { data: existingReport } = await supabase
      .from("scouting_reports")
      .select("id, team_id")
      .eq("id", id)
      .single();

    if (!existingReport || existingReport.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields = [
      "title",
      "summary",
      "content_sections",
      "key_metrics",
      "status",
      "shared_with_player",
      "game_date",
    ];

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { data: report, error } = await adminSupabase
      .from("scouting_reports")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Update report error:", error);
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 500 }
    );
  }
}

// DELETE: Delete report
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if coach
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get existing report
    const { data: existingReport } = await supabase
      .from("scouting_reports")
      .select("id, team_id")
      .eq("id", id)
      .single();

    if (!existingReport || existingReport.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Delete data sources first
    await adminSupabase
      .from("scouting_report_data_sources")
      .delete()
      .eq("report_id", id);

    // Delete report
    const { error } = await adminSupabase
      .from("scouting_reports")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to delete: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete report error:", error);
    return NextResponse.json(
      { error: "Failed to delete report" },
      { status: 500 }
    );
  }
}

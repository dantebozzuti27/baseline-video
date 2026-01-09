import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// DELETE: Delete a file and all associated data
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

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get file record
    const { data: file, error: fileError } = await supabase
      .from("performance_data_files")
      .select("id, team_id, storage_path")
      .eq("id", id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from storage
    await adminSupabase.storage
      .from("performance-data")
      .remove([file.storage_path]);

    // Delete metrics (cascade should handle this, but be explicit)
    await adminSupabase
      .from("performance_metrics")
      .delete()
      .eq("data_file_id", id);

    // Delete insights
    await adminSupabase
      .from("data_insights")
      .delete()
      .eq("data_file_id", id);

    // Delete report sources
    await adminSupabase
      .from("scouting_report_data_sources")
      .delete()
      .eq("data_file_id", id);

    // Delete file record
    const { error: deleteError } = await adminSupabase
      .from("performance_data_files")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}

// GET: Get file details
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

    const { data: file, error: fileError } = await supabase
      .from("performance_data_files")
      .select(
        `
        *,
        player:profiles!performance_data_files_player_user_id_fkey(
          user_id,
          display_name,
          first_name,
          last_name
        )
      `
      )
      .eq("id", id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return NextResponse.json(file);
  } catch (error) {
    console.error("Get file error:", error);
    return NextResponse.json(
      { error: "Failed to get file" },
      { status: 500 }
    );
  }
}

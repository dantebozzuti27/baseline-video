import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { detectFileType } from "@/lib/team-mode/parse";
import { processPerformanceFile } from "@/lib/team-mode/process";

export const maxDuration = 300; // 5 minute timeout for processing

export async function POST(request: NextRequest) {
  try {
    console.log("[team-mode/upload] Starting upload...");
    
    const supabase = await createSupabaseServerClient();
    console.log("[team-mode/upload] Supabase client created");
    
    let adminSupabase;
    try {
      adminSupabase = createSupabaseAdminClient();
      console.log("[team-mode/upload] Admin client created");
    } catch (adminError) {
      console.error("[team-mode/upload] Admin client error:", adminError);
      return NextResponse.json(
        { error: "Server configuration error - missing admin credentials" },
        { status: 500 }
      );
    }

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[team-mode/upload] Auth check:", { userId: user?.id, authError: authError?.message });

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("user_id", user.id)
      .single();

    console.log("[team-mode/upload] Profile check:", { profile, profileError: profileError?.message });

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Only coaches can upload
    if (profile.role !== "coach") {
      return NextResponse.json(
        { error: "Only coaches can upload performance data" },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dataCategory = formData.get("dataCategory") as string;
    const playerUserId = formData.get("playerUserId") as string | null;
    const opponentName = formData.get("opponentName") as string | null;
    const opponentContext = formData.get("opponentContext") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!dataCategory || !["own_team", "opponent"].includes(dataCategory)) {
      return NextResponse.json(
        { error: "Invalid data category" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = detectFileType(file.type, file.name);
    if (!fileType) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a CSV or Excel file." },
        { status: 400 }
      );
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    // Player selection is optional for own_team data (supports team-wide uploads)

    // Generate storage path
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const category = dataCategory === "opponent" ? "opponent" : "player";
    const storagePath = `${profile.team_id}/${category}/${timestamp}_${sanitizedFileName}`;
    
    console.log("[team-mode/upload] Storage path:", storagePath);

    // Upload file to storage
    const arrayBuffer = await file.arrayBuffer();
    console.log("[team-mode/upload] File size:", arrayBuffer.byteLength);
    
    const { error: uploadError } = await adminSupabase.storage
      .from("performance-data")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[team-mode/upload] Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }
    
    console.log("[team-mode/upload] File uploaded to storage successfully");

    // Create file record
    console.log("[team-mode/upload] Creating file record...");
    const { data: fileRecord, error: insertError } = await adminSupabase
      .from("performance_data_files")
      .insert({
        team_id: profile.team_id,
        uploader_user_id: user.id,
        player_user_id: dataCategory === "own_team" ? playerUserId || null : null,
        is_opponent_data: dataCategory === "opponent",
        opponent_name: dataCategory === "opponent" ? opponentName : null,
        file_name: file.name,
        storage_path: storagePath,
        file_type: fileType,
        processing_status: "pending",
        metadata: {
          original_size: file.size,
          original_type: file.type,
          opponent_context: opponentContext,
          uploaded_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (insertError || !fileRecord) {
      console.error("[team-mode/upload] Insert error:", insertError);
      // Clean up uploaded file
      await adminSupabase.storage
        .from("performance-data")
        .remove([storagePath]);
      return NextResponse.json(
        { error: `Failed to create file record: ${insertError?.message}` },
        { status: 500 }
      );
    }
    
    console.log("[team-mode/upload] File record created:", fileRecord.id);

    // If opponent data and opponent doesn't exist, create it
    if (dataCategory === "opponent" && opponentName) {
      const { error: opponentError } = await adminSupabase
        .from("opponents")
        .upsert(
          {
            team_id: profile.team_id,
            name: opponentName,
            opponent_type: "player", // Default, can be updated later
            sport_context: opponentContext,
          },
          {
            onConflict: "team_id,name",
          }
        );

      if (opponentError) {
        console.error("Opponent upsert error:", opponentError);
        // Non-fatal, continue processing
      }
    }

    // Start processing in background (fire and forget for initial response)
    // In production, you might use a queue like Inngest or Trigger.dev
    processPerformanceFile(fileRecord.id).catch((err) => {
      console.error("Background processing error:", err);
    });

    return NextResponse.json({
      success: true,
      fileId: fileRecord.id,
      fileName: file.name,
      status: "pending",
      message: "File uploaded successfully. Processing started.",
    });
  } catch (error) {
    console.error("Upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Full error details:", { message: errorMessage, stack: errorStack });
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET: Check processing status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID required" },
        { status: 400 }
      );
    }

    const { data: fileRecord, error } = await supabase
      .from("performance_data_files")
      .select(
        `
        id,
        file_name,
        processing_status,
        row_count,
        detected_columns,
        metadata,
        processed_at,
        created_at
      `
      )
      .eq("id", fileId)
      .single();

    if (error || !fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Get insight count if processed
    let insightCount = 0;
    if (fileRecord.processing_status === "completed") {
      const { count } = await supabase
        .from("data_insights")
        .select("*", { count: "exact", head: true })
        .eq("data_file_id", fileId);
      insightCount = count || 0;
    }

    return NextResponse.json({
      ...fileRecord,
      insight_count: insightCount,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}

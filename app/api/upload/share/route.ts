import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload/share
 * 
 * This route receives shared content from the PWA share_target.
 * It extracts any shared files/URLs and redirects to the share upload page.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Check for shared URL (from text/url shares)
    const url = formData.get("url") as string | null;
    const text = formData.get("text") as string | null;
    
    // Check for shared files
    const videoFiles = formData.getAll("video");
    
    // If there's a video file, redirect to normal upload page
    // (handling file shares in PWA requires more complex setup with cache/service worker)
    if (videoFiles.length > 0) {
      return NextResponse.redirect(new URL("/app/upload", req.url));
    }
    
    // For URL shares, redirect to the share page with the URL as a query param
    if (url || text) {
      const sharedUrl = url || text;
      if (sharedUrl && /^https?:\/\//i.test(sharedUrl)) {
        return NextResponse.redirect(
          new URL(`/app/upload/share?url=${encodeURIComponent(sharedUrl)}`, req.url)
        );
      }
    }
    
    // Default: redirect to upload page
    return NextResponse.redirect(new URL("/app/upload", req.url));
  } catch (error) {
    console.error("Share target error:", error);
    return NextResponse.redirect(new URL("/app/upload", req.url));
  }
}


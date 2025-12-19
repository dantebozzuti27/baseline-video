import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // IMPORTANT: In Next.js, NEXT_PUBLIC_* values are inlined at build time.
  // If these are missing on Vercel, redeploy after setting env vars.
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in Vercel (all environments) and redeploy.",
    );
  }

  // Reuse a single client in the browser to avoid multiple GoTrueClient warnings.
  // IMPORTANT: createBrowserClient uses cookie-based storage by default in the browser, which
  // keeps SSR (server) auth in sync and prevents "sign in loop" redirects.
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}



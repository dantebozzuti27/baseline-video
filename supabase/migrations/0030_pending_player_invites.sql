-- Pending player invites - separate from profiles to avoid PK issues
-- These get converted to real profiles when claimed

CREATE TABLE IF NOT EXISTS public.pending_player_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  player_mode public.player_mode DEFAULT 'in_person',
  claim_token TEXT UNIQUE NOT NULL,
  claim_token_expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast claim token lookup
CREATE INDEX IF NOT EXISTS idx_pending_invites_claim_token 
  ON public.pending_player_invites(claim_token) 
  WHERE claimed_at IS NULL;

-- Index for team lookup
CREATE INDEX IF NOT EXISTS idx_pending_invites_team 
  ON public.pending_player_invites(team_id);

-- RLS
ALTER TABLE public.pending_player_invites ENABLE ROW LEVEL SECURITY;

-- Coaches can read their team's pending invites
CREATE POLICY pending_invites_select_coach ON public.pending_player_invites
  FOR SELECT TO authenticated
  USING (
    team_id = public.current_team_id() AND public.is_coach()
  );

-- Coaches can insert pending invites
CREATE POLICY pending_invites_insert_coach ON public.pending_player_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id = public.current_team_id() AND public.is_coach()
  );

-- Coaches can delete unclaimed invites
CREATE POLICY pending_invites_delete_coach ON public.pending_player_invites
  FOR DELETE TO authenticated
  USING (
    team_id = public.current_team_id() AND public.is_coach() AND claimed_at IS NULL
  );

-- Anyone can read by claim token (for claim page)
CREATE POLICY pending_invites_select_by_token ON public.pending_player_invites
  FOR SELECT TO anon, authenticated
  USING (claim_token IS NOT NULL);


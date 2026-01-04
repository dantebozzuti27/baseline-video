-- Player claim tokens: allows coaches to create player accounts that players can claim
-- ===================================================================================

-- Add claim columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS claim_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for fast claim token lookup
CREATE INDEX IF NOT EXISTS idx_profiles_claim_token ON public.profiles(claim_token) WHERE claim_token IS NOT NULL;

-- Function to generate a secure random token
CREATE OR REPLACE FUNCTION public.generate_claim_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(24), 'base64url');
END;
$$;

-- RPC: Coach creates an unclaimed player profile
-- Returns the claim token for sharing
CREATE OR REPLACE FUNCTION public.create_unclaimed_player(
  p_first_name TEXT,
  p_last_name TEXT,
  p_player_mode public.player_mode DEFAULT 'in_person'
)
RETURNS TABLE(player_id UUID, claim_token TEXT, claim_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_id UUID;
  v_claim_token TEXT;
BEGIN
  -- Get coach profile
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can create unclaimed players';
  END IF;

  -- Generate unique claim token
  v_claim_token := public.generate_claim_token();
  
  -- Ensure uniqueness (regenerate if collision)
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE profiles.claim_token = v_claim_token) LOOP
    v_claim_token := public.generate_claim_token();
  END LOOP;

  -- Generate a placeholder user_id (will be replaced when claimed)
  v_player_id := gen_random_uuid();

  -- Insert the unclaimed profile
  INSERT INTO public.profiles (
    user_id,
    team_id,
    role,
    first_name,
    last_name,
    display_name,
    player_mode,
    is_active,
    claim_token,
    claim_token_expires_at,
    created_by_user_id
  ) VALUES (
    v_player_id,
    v_coach_profile.team_id,
    'player',
    p_first_name,
    p_last_name,
    CONCAT(p_first_name, ' ', p_last_name),
    p_player_mode,
    true,
    v_claim_token,
    NOW() + INTERVAL '30 days',
    auth.uid()
  );

  RETURN QUERY SELECT v_player_id, v_claim_token, CONCAT('/claim/', v_claim_token);
END;
$$;

REVOKE ALL ON FUNCTION public.create_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_unclaimed_player TO authenticated;

-- RPC: Get claim info (public, no auth required)
CREATE OR REPLACE FUNCTION public.get_claim_info(p_claim_token TEXT)
RETURNS TABLE(
  player_id UUID,
  first_name TEXT,
  last_name TEXT,
  team_name TEXT,
  coach_name TEXT,
  is_valid BOOLEAN,
  is_expired BOOLEAN,
  is_claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles;
  v_team public.teams;
  v_coach public.profiles;
BEGIN
  -- Find the profile with this claim token
  SELECT * INTO v_profile FROM public.profiles WHERE profiles.claim_token = p_claim_token;
  
  IF v_profile IS NULL THEN
    RETURN QUERY SELECT 
      NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      false, false, false;
    RETURN;
  END IF;

  -- Get team and coach info
  SELECT * INTO v_team FROM public.teams WHERE id = v_profile.team_id;
  SELECT * INTO v_coach FROM public.profiles WHERE team_id = v_profile.team_id AND role = 'coach' LIMIT 1;

  RETURN QUERY SELECT
    v_profile.user_id,
    v_profile.first_name,
    v_profile.last_name,
    v_team.name,
    v_coach.display_name,
    true,
    v_profile.claim_token_expires_at < NOW(),
    v_profile.claimed_at IS NOT NULL;
END;
$$;

-- Allow anonymous access for claim preview
REVOKE ALL ON FUNCTION public.get_claim_info FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_claim_info TO anon, authenticated;

-- RPC: Claim the account (called after auth.signUp)
-- Links the new auth user to the existing profile
CREATE OR REPLACE FUNCTION public.claim_player_account(
  p_claim_token TEXT,
  p_new_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles;
  v_old_user_id UUID;
BEGIN
  -- Find the profile
  SELECT * INTO v_profile FROM public.profiles WHERE claim_token = p_claim_token;
  
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Invalid claim token';
  END IF;
  
  IF v_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account already claimed';
  END IF;
  
  IF v_profile.claim_token_expires_at < NOW() THEN
    RAISE EXCEPTION 'Claim token expired';
  END IF;

  -- Store old placeholder ID
  v_old_user_id := v_profile.user_id;

  -- Update the profile to use the new auth user
  UPDATE public.profiles SET
    user_id = p_new_user_id,
    claimed_at = NOW(),
    claim_token = NULL,
    claim_token_expires_at = NULL
  WHERE claim_token = p_claim_token;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_player_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_player_account TO authenticated;

-- RPC: Coach regenerates claim token for unclaimed player
CREATE OR REPLACE FUNCTION public.regenerate_claim_token(p_player_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_profile public.profiles;
  v_new_token TEXT;
BEGIN
  -- Verify coach
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can regenerate claim tokens';
  END IF;

  -- Get player profile
  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot regenerate token for claimed account';
  END IF;

  -- Generate new token
  v_new_token := public.generate_claim_token();
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE claim_token = v_new_token) LOOP
    v_new_token := public.generate_claim_token();
  END LOOP;

  -- Update profile
  UPDATE public.profiles SET
    claim_token = v_new_token,
    claim_token_expires_at = NOW() + INTERVAL '30 days'
  WHERE user_id = p_player_id;

  RETURN v_new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_claim_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_claim_token TO authenticated;

-- RPC: Coach deletes unclaimed player
CREATE OR REPLACE FUNCTION public.delete_unclaimed_player(p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coach_profile public.profiles;
  v_player_profile public.profiles;
BEGIN
  -- Verify coach
  SELECT * INTO v_coach_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_coach_profile IS NULL OR v_coach_profile.role != 'coach' THEN
    RAISE EXCEPTION 'Only coaches can delete unclaimed players';
  END IF;

  -- Get player profile
  SELECT * INTO v_player_profile FROM public.profiles WHERE user_id = p_player_id;
  IF v_player_profile IS NULL OR v_player_profile.team_id != v_coach_profile.team_id THEN
    RAISE EXCEPTION 'Player not found on your team';
  END IF;
  
  IF v_player_profile.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete claimed account - deactivate instead';
  END IF;

  -- Delete the unclaimed profile
  DELETE FROM public.profiles WHERE user_id = p_player_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unclaimed_player FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_unclaimed_player TO authenticated;


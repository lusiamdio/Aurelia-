-- ============================================================================
-- AURELIA WEDDING PLATFORM — SUPABASE POSTGRESQL & AUTH SCHEMA
-- Target Project: fndxapesputwjptqemuc
-- Run this script once in Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

BEGIN;

-- 1. CORE WEDDING MICROSITE & STATIONERY CONFIGURATION
CREATE TABLE IF NOT EXISTS public.weddings (
  id                    TEXT PRIMARY KEY,
  owner_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  slug                  TEXT NOT NULL UNIQUE,
  custom_domain         TEXT,
  partner1              TEXT NOT NULL,
  partner2              TEXT NOT NULL,
  display_date          TEXT NOT NULL,
  raw_date              DATE NOT NULL,
  city                  TEXT NOT NULL,
  venue                 TEXT NOT NULL,
  headline              TEXT NOT NULL DEFAULT 'Celebration of Love',
  story_title           TEXT NOT NULL DEFAULT 'BEAUTIFUL LOVE STORY',
  story_message         TEXT NOT NULL,
  story_paragraphs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  story_timeline        JSONB NOT NULL DEFAULT '[]'::jsonb,
  dress_code_summary    TEXT NOT NULL,
  dress_code_church     TEXT NOT NULL DEFAULT 'Vintage Wear',
  dress_code_dining     TEXT NOT NULL DEFAULT 'Gala Wear',
  scripture1            TEXT,
  scripture2            TEXT,
  hero_image            TEXT NOT NULL,
  rsvp_deadline         TEXT NOT NULL,
  gift_registry_url     TEXT,

  invitation_style      TEXT NOT NULL DEFAULT 'classic',
  foil_accent           TEXT NOT NULL DEFAULT 'gold',
  paper_tone            TEXT NOT NULL DEFAULT 'ivory',
  monogram              TEXT NOT NULL DEFAULT 'S & K',
  card_orientation      TEXT NOT NULL DEFAULT 'portrait',
  selected_font_family  TEXT NOT NULL DEFAULT 'cormorant',
  couple_photo_url      TEXT,
  show_photo_on_card    BOOLEAN NOT NULL DEFAULT true,
  photo_frame_style     TEXT NOT NULL DEFAULT 'arch',
  decorative_graphic    TEXT NOT NULL DEFAULT 'botanical',
  wax_seal_style        TEXT NOT NULL DEFAULT 'monogram',
  custom_colors         JSONB NOT NULL DEFAULT '{"background":"#FAF7F0","foil":"#D4AF37","text":"#292722","border":"#B59A72","isCustom":false}'::jsonb,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CEREMONY & RECEPTION AGENDA EVENTS
CREATE TABLE IF NOT EXISTS public.wedding_events (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  event_date  TEXT NOT NULL,
  event_time  TEXT NOT NULL,
  venue       TEXT NOT NULL,
  address     TEXT NOT NULL,
  dress_code  TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_events_wedding
  ON public.wedding_events (wedding_id, sort_order);

-- 3. GUEST BOOKING LIST & QR GATE ADMISSIONS
CREATE TABLE IF NOT EXISTS public.guest_invitations (
  id                       TEXT PRIMARY KEY,
  wedding_id               TEXT NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  full_name                TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  email                    TEXT,
  phone                    TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('attending', 'declined', 'pending')),
  events_attending         TEXT[] NOT NULL DEFAULT '{}',
  attendance_type          TEXT NOT NULL DEFAULT 'single' CHECK (attendance_type IN ('single', 'couple')),
  has_plus_one             BOOLEAN NOT NULL DEFAULT false,
  plus_one_name            TEXT,
  plus_one_dietary         TEXT,
  plus_one_status          TEXT DEFAULT 'pending' CHECK (plus_one_status IN ('confirmed', 'rejected', 'pending')),
  plus_one_allowed         BOOLEAN NOT NULL DEFAULT false,
  dietary_requirements     TEXT,
  invitation_sent_via      TEXT DEFAULT 'download' CHECK (invitation_sent_via IN ('whatsapp', 'email', 'download')),
  invitation_generated_at  TEXT NOT NULL,
  checked_in               BOOLEAN NOT NULL DEFAULT false,
  checked_in_at            TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_invitations_wedding
  ON public.guest_invitations (wedding_id, created_at DESC);

-- 4. DJ CELEBRATION PLAYLIST & SONG REQUESTS
CREATE TABLE IF NOT EXISTS public.song_requests (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  guest_name    TEXT NOT NULL,
  song_title    TEXT NOT NULL,
  artist        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'must-play', 'declined', 'pending')),
  notes         TEXT,
  dj_notes      TEXT,
  dance_energy  TEXT DEFAULT 'high-energy' CHECK (dance_energy IN ('chill', 'mid-tempo', 'high-energy', 'party-anthem')),
  requested_at  TEXT,
  votes         INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_song_requests_wedding
  ON public.song_requests (wedding_id, created_at DESC);

-- 5. COUPLE ADMIN OWNERSHIP REGISTRY (SUPABASE AUTH LINKED)
CREATE TABLE IF NOT EXISTS public.wedding_admins (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wedding_id  TEXT NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'couple_admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wedding_id)
);

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weddings_updated_at ON public.weddings;
CREATE TRIGGER trg_weddings_updated_at
  BEFORE UPDATE ON public.weddings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_wedding_events_updated_at ON public.wedding_events;
CREATE TRIGGER trg_wedding_events_updated_at
  BEFORE UPDATE ON public.wedding_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_guest_invitations_updated_at ON public.guest_invitations;
CREATE TRIGGER trg_guest_invitations_updated_at
  BEFORE UPDATE ON public.guest_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: verify whether current authenticated Supabase user owns the wedding
CREATE OR REPLACE FUNCTION public.is_wedding_admin(target_wedding_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wedding_admins wa
    WHERE wa.wedding_id = target_wedding_id
      AND wa.user_id = auth.uid()
  );
$$;

-- Atomic first-run Couple Admin claim RPC (locks once an admin is claimed)
CREATE OR REPLACE FUNCTION public.claim_couple_admin_access(target_wedding_id TEXT DEFAULT 'wed-aur-001')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_existing_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wedding_admins
    WHERE wedding_id = target_wedding_id AND user_id = v_uid
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.wedding_admins
  WHERE wedding_id = target_wedding_id;

  IF v_existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.wedding_admins (user_id, wedding_id, email, role)
  VALUES (v_uid, target_wedding_id, v_email, 'couple_admin')
  ON CONFLICT DO NOTHING;

  UPDATE public.weddings
  SET owner_user_id = v_uid
  WHERE id = target_wedding_id AND owner_user_id IS NULL;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_couple_admin_access(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_couple_admin_access(TEXT) TO authenticated;

-- 5B. COUPLE ADMIN CREDENTIAL VERIFICATION (EMAIL + PGCRYPTO HASHED, RLS-LOCKED)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.couple_admin_credentials (
  wedding_id    TEXT PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  admin_email   TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.couple_admin_credentials
  ADD COLUMN IF NOT EXISTS admin_email TEXT;

ALTER TABLE public.couple_admin_credentials ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.verify_couple_admin_login(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.claim_couple_admin_password(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.has_couple_admin_credentials(p_wedding_id TEXT DEFAULT 'wed-aur-001')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.couple_admin_credentials
    WHERE wedding_id = p_wedding_id
      AND admin_email IS NOT NULL
      AND passcode_hash IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_couple_admin_login(
  p_wedding_id TEXT DEFAULT 'wed-aur-001',
  p_email TEXT DEFAULT '',
  p_password TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email TEXT;
  v_hash TEXT;
BEGIN
  SELECT admin_email, passcode_hash INTO v_email, v_hash
  FROM public.couple_admin_credentials
  WHERE wedding_id = p_wedding_id;

  IF v_email IS NULL OR v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  IF lower(trim(v_email)) <> lower(trim(coalesce(p_email, ''))) THEN
    RETURN FALSE;
  END IF;

  RETURN crypt(trim(coalesce(p_password, '')), v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_couple_admin_password(
  p_wedding_id TEXT DEFAULT 'wed-aur-001',
  p_email TEXT DEFAULT '',
  p_password TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(coalesce(p_email, '')));
  v_clean_pass TEXT := trim(coalesce(p_password, ''));
BEGIN
  IF v_clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_clean_pass) < 4 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.couple_admin_credentials
    WHERE wedding_id = p_wedding_id AND admin_email IS NOT NULL
  ) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.couple_admin_credentials (wedding_id, admin_email, passcode_hash)
  VALUES (p_wedding_id, v_clean_email, crypt(v_clean_pass, gen_salt('bf')))
  ON CONFLICT (wedding_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.has_couple_admin_credentials(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_couple_admin_credentials(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.verify_couple_admin_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_couple_admin_login(TEXT, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_couple_admin_password(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_couple_admin_password(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5C. COUPLE ADMIN SESSION TOKENS & PROTECTED RPCs (ENABLES FULL STATIC/SERVERLESS DEPLOYMENT)
CREATE TABLE IF NOT EXISTS public.couple_admin_sessions (
  token       TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.couple_admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.require_couple_admin_session(
  p_token TEXT,
  p_wedding_id TEXT DEFAULT 'wed-aur-001'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.couple_admin_sessions WHERE expires_at <= now();

  RETURN EXISTS (
    SELECT 1
    FROM public.couple_admin_sessions
    WHERE token = trim(p_token)
      AND wedding_id = p_wedding_id
      AND expires_at > now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sign_in(
  p_wedding_id TEXT DEFAULT 'wed-aur-001',
  p_email TEXT DEFAULT '',
  p_password TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
  v_clean_email TEXT := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.has_couple_admin_credentials(p_wedding_id) THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'requiresSetup', true,
      'error', 'Admin credentials have not been configured yet.'
    );
  END IF;

  IF NOT public.verify_couple_admin_login(p_wedding_id, v_clean_email, p_password) THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'error', 'Invalid email or password.'
    );
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.couple_admin_sessions (token, wedding_id, admin_email, expires_at)
  VALUES (v_token, p_wedding_id, v_clean_email, now() + interval '12 hours');

  RETURN jsonb_build_object(
    'authenticated', true,
    'role', 'couple_admin',
    'accessToken', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_session(
  p_token TEXT,
  p_wedding_id TEXT DEFAULT 'wed-aur-001'
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.require_couple_admin_session(p_token, p_wedding_id);
$$;

CREATE OR REPLACE FUNCTION public.admin_sign_out(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.couple_admin_sessions WHERE token = trim(coalesce(p_token, ''));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_guest_rsvp(p_guest JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id TEXT := coalesce(nullif(trim(p_guest->>'id'), ''), 'AUR-' || floor(1000 + random() * 9000)::text);
  v_wedding_id TEXT := coalesce(nullif(trim(p_guest->>'wedding_id'), ''), 'wed-aur-001');
  v_name TEXT := left(trim(coalesce(p_guest->>'full_name', '')), 160);
  v_status TEXT := CASE WHEN (p_guest->>'status') IN ('attending', 'declined', 'pending') THEN (p_guest->>'status') ELSE 'pending' END;
  v_att_type TEXT := CASE WHEN (p_guest->>'attendance_type') = 'couple' THEN 'couple' ELSE 'single' END;
  v_has_plus BOOLEAN := coalesce((p_guest->>'has_plus_one')::boolean, v_att_type = 'couple');
  v_plus_status TEXT := CASE WHEN (p_guest->>'plus_one_status') IN ('confirmed', 'rejected', 'pending') THEN (p_guest->>'plus_one_status') WHEN v_has_plus THEN 'confirmed' ELSE 'pending' END;
  v_sent_via TEXT := CASE WHEN (p_guest->>'invitation_sent_via') IN ('whatsapp', 'email', 'download') THEN (p_guest->>'invitation_sent_via') ELSE 'download' END;
  v_events TEXT[];
BEGIN
  IF v_wedding_id <> 'wed-aur-001' OR length(v_name) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Full name is required.');
  END IF;

  SELECT coalesce(array_agg(elem), '{}')
  INTO v_events
  FROM jsonb_array_elements_text(coalesce(p_guest->'events_attending', '[]'::jsonb)) AS elem;

  INSERT INTO public.guest_invitations (
    id, wedding_id, full_name, email, phone, status, events_attending,
    attendance_type, has_plus_one, plus_one_name, plus_one_dietary,
    plus_one_status, plus_one_allowed, dietary_requirements,
    invitation_sent_via, invitation_generated_at, checked_in, checked_in_at, notes
  )
  VALUES (
    v_id,
    v_wedding_id,
    v_name,
    nullif(trim(coalesce(p_guest->>'email', '')), ''),
    nullif(trim(coalesce(p_guest->>'phone', '')), ''),
    v_status,
    v_events,
    v_att_type,
    v_has_plus,
    nullif(trim(coalesce(p_guest->>'plus_one_name', '')), ''),
    nullif(trim(coalesce(p_guest->>'plus_one_dietary', '')), ''),
    v_plus_status,
    coalesce((p_guest->>'plus_one_allowed')::boolean, v_has_plus),
    nullif(trim(coalesce(p_guest->>'dietary_requirements', '')), ''),
    v_sent_via,
    coalesce(nullif(trim(p_guest->>'invitation_generated_at'), ''), to_char(now(), 'YYYY-MM-DD HH24:MI')),
    coalesce((p_guest->>'checked_in')::boolean, false),
    nullif(trim(coalesce(p_guest->>'checked_in_at', '')), ''),
    nullif(trim(coalesce(p_guest->>'notes', '')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    status = EXCLUDED.status,
    events_attending = EXCLUDED.events_attending,
    attendance_type = EXCLUDED.attendance_type,
    has_plus_one = EXCLUDED.has_plus_one,
    plus_one_name = EXCLUDED.plus_one_name,
    plus_one_dietary = EXCLUDED.plus_one_dietary,
    plus_one_status = EXCLUDED.plus_one_status,
    plus_one_allowed = EXCLUDED.plus_one_allowed,
    dietary_requirements = EXCLUDED.dietary_requirements,
    invitation_sent_via = EXCLUDED.invitation_sent_via,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_guests(
  p_token TEXT,
  p_wedding_id TEXT DEFAULT 'wed-aur-001'
)
RETURNS SETOF public.guest_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.require_couple_admin_session(p_token, p_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.guest_invitations
  WHERE wedding_id = p_wedding_id
  ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_guest(
  p_token TEXT,
  p_guest JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id TEXT := coalesce(nullif(trim(p_guest->>'id'), ''), 'AUR-' || floor(1000 + random() * 9000)::text);
  v_wedding_id TEXT := coalesce(nullif(trim(p_guest->>'wedding_id'), ''), 'wed-aur-001');
  v_name TEXT := left(trim(coalesce(p_guest->>'full_name', '')), 160);
  v_status TEXT := CASE WHEN (p_guest->>'status') IN ('attending', 'declined', 'pending') THEN (p_guest->>'status') ELSE 'pending' END;
  v_att_type TEXT := CASE WHEN (p_guest->>'attendance_type') = 'couple' THEN 'couple' ELSE 'single' END;
  v_has_plus BOOLEAN := coalesce((p_guest->>'has_plus_one')::boolean, v_att_type = 'couple');
  v_plus_status TEXT := CASE WHEN (p_guest->>'plus_one_status') IN ('confirmed', 'rejected', 'pending') THEN (p_guest->>'plus_one_status') WHEN v_has_plus THEN 'confirmed' ELSE 'pending' END;
  v_sent_via TEXT := CASE WHEN (p_guest->>'invitation_sent_via') IN ('whatsapp', 'email', 'download') THEN (p_guest->>'invitation_sent_via') ELSE 'download' END;
  v_events TEXT[];
BEGIN
  IF NOT public.require_couple_admin_session(p_token, v_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF length(v_name) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT coalesce(array_agg(elem), '{}')
  INTO v_events
  FROM jsonb_array_elements_text(coalesce(p_guest->'events_attending', '[]'::jsonb)) AS elem;

  INSERT INTO public.guest_invitations (
    id, wedding_id, full_name, email, phone, status, events_attending,
    attendance_type, has_plus_one, plus_one_name, plus_one_dietary,
    plus_one_status, plus_one_allowed, dietary_requirements,
    invitation_sent_via, invitation_generated_at, checked_in, checked_in_at, notes
  )
  VALUES (
    v_id,
    v_wedding_id,
    v_name,
    nullif(trim(coalesce(p_guest->>'email', '')), ''),
    nullif(trim(coalesce(p_guest->>'phone', '')), ''),
    v_status,
    v_events,
    v_att_type,
    v_has_plus,
    nullif(trim(coalesce(p_guest->>'plus_one_name', '')), ''),
    nullif(trim(coalesce(p_guest->>'plus_one_dietary', '')), ''),
    v_plus_status,
    coalesce((p_guest->>'plus_one_allowed')::boolean, v_has_plus),
    nullif(trim(coalesce(p_guest->>'dietary_requirements', '')), ''),
    v_sent_via,
    coalesce(nullif(trim(p_guest->>'invitation_generated_at'), ''), to_char(now(), 'YYYY-MM-DD HH24:MI')),
    coalesce((p_guest->>'checked_in')::boolean, false),
    nullif(trim(coalesce(p_guest->>'checked_in_at', '')), ''),
    nullif(trim(coalesce(p_guest->>'notes', '')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    status = EXCLUDED.status,
    events_attending = EXCLUDED.events_attending,
    attendance_type = EXCLUDED.attendance_type,
    has_plus_one = EXCLUDED.has_plus_one,
    plus_one_name = EXCLUDED.plus_one_name,
    plus_one_dietary = EXCLUDED.plus_one_dietary,
    plus_one_status = EXCLUDED.plus_one_status,
    plus_one_allowed = EXCLUDED.plus_one_allowed,
    dietary_requirements = EXCLUDED.dietary_requirements,
    invitation_sent_via = EXCLUDED.invitation_sent_via,
    checked_in = EXCLUDED.checked_in,
    checked_in_at = EXCLUDED.checked_in_at,
    notes = EXCLUDED.notes,
    updated_at = now();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_guest(
  p_token TEXT,
  p_wedding_id TEXT,
  p_guest_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.require_couple_admin_session(p_token, p_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.guest_invitations
  WHERE id = p_guest_id AND wedding_id = p_wedding_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_wedding(
  p_token TEXT,
  p_wedding JSONB,
  p_events JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_wedding_id TEXT := coalesce(nullif(trim(p_wedding->>'id'), ''), 'wed-aur-001');
  v_evt JSONB;
BEGIN
  IF NOT public.require_couple_admin_session(p_token, v_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.weddings SET
    custom_domain = p_wedding->>'custom_domain',
    partner1 = coalesce(nullif(p_wedding->>'partner1', ''), partner1),
    partner2 = coalesce(nullif(p_wedding->>'partner2', ''), partner2),
    display_date = coalesce(nullif(p_wedding->>'display_date', ''), display_date),
    raw_date = coalesce(nullif(p_wedding->>'raw_date', '')::date, raw_date),
    city = coalesce(nullif(p_wedding->>'city', ''), city),
    venue = coalesce(nullif(p_wedding->>'venue', ''), venue),
    headline = coalesce(nullif(p_wedding->>'headline', ''), headline),
    story_title = coalesce(nullif(p_wedding->>'story_title', ''), story_title),
    story_message = coalesce(nullif(p_wedding->>'story_message', ''), story_message),
    story_paragraphs = coalesce(p_wedding->'story_paragraphs', story_paragraphs),
    story_timeline = coalesce(p_wedding->'story_timeline', story_timeline),
    dress_code_summary = coalesce(nullif(p_wedding->>'dress_code_summary', ''), dress_code_summary),
    dress_code_church = coalesce(nullif(p_wedding->>'dress_code_church', ''), dress_code_church),
    dress_code_dining = coalesce(nullif(p_wedding->>'dress_code_dining', ''), dress_code_dining),
    scripture1 = p_wedding->>'scripture1',
    scripture2 = p_wedding->>'scripture2',
    hero_image = coalesce(nullif(p_wedding->>'hero_image', ''), hero_image),
    rsvp_deadline = coalesce(nullif(p_wedding->>'rsvp_deadline', ''), rsvp_deadline),
    gift_registry_url = p_wedding->>'gift_registry_url',
    invitation_style = coalesce(nullif(p_wedding->>'invitation_style', ''), invitation_style),
    foil_accent = coalesce(nullif(p_wedding->>'foil_accent', ''), foil_accent),
    paper_tone = coalesce(nullif(p_wedding->>'paper_tone', ''), paper_tone),
    monogram = coalesce(nullif(p_wedding->>'monogram', ''), monogram),
    card_orientation = coalesce(nullif(p_wedding->>'card_orientation', ''), card_orientation),
    selected_font_family = coalesce(nullif(p_wedding->>'selected_font_family', ''), selected_font_family),
    couple_photo_url = p_wedding->>'couple_photo_url',
    show_photo_on_card = coalesce((p_wedding->>'show_photo_on_card')::boolean, show_photo_on_card),
    photo_frame_style = coalesce(nullif(p_wedding->>'photo_frame_style', ''), photo_frame_style),
    decorative_graphic = coalesce(nullif(p_wedding->>'decorative_graphic', ''), decorative_graphic),
    wax_seal_style = coalesce(nullif(p_wedding->>'wax_seal_style', ''), wax_seal_style),
    custom_colors = coalesce(p_wedding->'custom_colors', custom_colors),
    updated_at = now()
  WHERE id = v_wedding_id;

  IF jsonb_typeof(p_events) = 'array' THEN
    FOR v_evt IN SELECT * FROM jsonb_array_elements(p_events)
    LOOP
      INSERT INTO public.wedding_events (
        id, wedding_id, title, event_date, event_time, venue, address, dress_code, description, sort_order
      )
      VALUES (
        v_evt->>'id',
        v_wedding_id,
        v_evt->>'title',
        v_evt->>'event_date',
        v_evt->>'event_time',
        v_evt->>'venue',
        v_evt->>'address',
        v_evt->>'dress_code',
        coalesce(v_evt->>'description', ''),
        coalesce((v_evt->>'sort_order')::smallint, 0)
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        event_date = EXCLUDED.event_date,
        event_time = EXCLUDED.event_time,
        venue = EXCLUDED.venue,
        address = EXCLUDED.address,
        dress_code = EXCLUDED.dress_code,
        description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_song(
  p_token TEXT,
  p_wedding_id TEXT,
  p_song_id TEXT,
  p_patch JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.require_couple_admin_session(p_token, p_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.song_requests SET
    status = coalesce(nullif(p_patch->>'status', ''), status),
    dj_notes = p_patch->>'dj_notes',
    notes = p_patch->>'notes',
    dance_energy = coalesce(nullif(p_patch->>'dance_energy', ''), dance_energy)
  WHERE id = p_song_id AND wedding_id = p_wedding_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_song(
  p_token TEXT,
  p_wedding_id TEXT,
  p_song_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.require_couple_admin_session(p_token, p_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.song_requests
  WHERE id = p_song_id AND wedding_id = p_wedding_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_erase_wedding(
  p_token TEXT,
  p_wedding_id TEXT DEFAULT 'wed-aur-001'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.require_couple_admin_session(p_token, p_wedding_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.guest_invitations WHERE wedding_id = p_wedding_id;
  DELETE FROM public.song_requests WHERE wedding_id = p_wedding_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.require_couple_admin_session(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sign_in(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_verify_session(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sign_out(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_guest_rsvp(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_guests(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_guest(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_guest(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_wedding(TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_song(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_song(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_erase_wedding(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_sign_in(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_session(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sign_out(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_rsvp(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_guests(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_guest(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_guest(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_wedding(TEXT, JSONB, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_song(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_song(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_erase_wedding(TEXT, TEXT) TO anon, authenticated;

-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_admins ENABLE ROW LEVEL SECURITY;

-- Weddings: public read for microsite; Couple Admin full write
DROP POLICY IF EXISTS "weddings_public_select" ON public.weddings;
CREATE POLICY "weddings_public_select" ON public.weddings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "weddings_admin_modify" ON public.weddings;
CREATE POLICY "weddings_admin_modify" ON public.weddings
  FOR ALL TO authenticated
  USING (public.is_wedding_admin(id))
  WITH CHECK (public.is_wedding_admin(id));

-- Wedding Events: public read; Couple Admin full write
DROP POLICY IF EXISTS "events_public_select" ON public.wedding_events;
CREATE POLICY "events_public_select" ON public.wedding_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "events_admin_modify" ON public.wedding_events;
CREATE POLICY "events_admin_modify" ON public.wedding_events
  FOR ALL TO authenticated
  USING (public.is_wedding_admin(wedding_id))
  WITH CHECK (public.is_wedding_admin(wedding_id));

-- Guest Invitations: guests can INSERT RSVP only (no public PII SELECT); Couple Admin full management (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "guests_public_insert" ON public.guest_invitations;
CREATE POLICY "guests_public_insert" ON public.guest_invitations
  FOR INSERT TO anon, authenticated
  WITH CHECK (wedding_id = 'wed-aur-001');

DROP POLICY IF EXISTS "guests_admin_manage" ON public.guest_invitations;
CREATE POLICY "guests_admin_manage" ON public.guest_invitations
  FOR ALL TO authenticated
  USING (public.is_wedding_admin(wedding_id))
  WITH CHECK (public.is_wedding_admin(wedding_id));

-- Song Requests: public read & insert; Couple Admin full curate & delete
DROP POLICY IF EXISTS "songs_public_select" ON public.song_requests;
CREATE POLICY "songs_public_select" ON public.song_requests
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "songs_public_insert" ON public.song_requests;
CREATE POLICY "songs_public_insert" ON public.song_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (wedding_id = 'wed-aur-001');

DROP POLICY IF EXISTS "songs_admin_modify" ON public.song_requests;
CREATE POLICY "songs_admin_modify" ON public.song_requests
  FOR UPDATE TO authenticated
  USING (public.is_wedding_admin(wedding_id))
  WITH CHECK (public.is_wedding_admin(wedding_id));

DROP POLICY IF EXISTS "songs_admin_delete" ON public.song_requests;
CREATE POLICY "songs_admin_delete" ON public.song_requests
  FOR DELETE TO authenticated
  USING (public.is_wedding_admin(wedding_id));

-- Wedding Admins: users can read their own membership only
DROP POLICY IF EXISTS "admins_self_select" ON public.wedding_admins;
CREATE POLICY "admins_self_select" ON public.wedding_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 6B. REAL-TIME REPLICATION FOR INSTANT ADMIN SYNC
ALTER TABLE public.guest_invitations REPLICA IDENTITY FULL;
ALTER TABLE public.song_requests REPLICA IDENTITY FULL;
ALTER TABLE public.weddings REPLICA IDENTITY FULL;
ALTER TABLE public.wedding_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'guest_invitations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_invitations;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'song_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.song_requests;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'weddings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.weddings;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wedding_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.wedding_events;
    END IF;
  END IF;
END
$$;

-- 7. SEED SAMSON & KEVINE WEDDING RECORD (IDEMPOTENT)
INSERT INTO public.weddings (
  id, slug, custom_domain, partner1, partner2, display_date, raw_date, city, venue,
  headline, story_title, story_message, story_paragraphs, dress_code_summary,
  dress_code_church, dress_code_dining, scripture1, scripture2, hero_image,
  couple_photo_url, rsvp_deadline, gift_registry_url
)
VALUES (
  'wed-aur-001',
  'samson-kevine',
  'samsonandkevine.wedding',
  'Samson Ilunga',
  'Kevine Bonganga',
  'Sunday, 20th December 2026',
  '2026-12-20',
  'Cape Town, Western Cape',
  'Lion Voice Tabernacle & Rooftop 39 Salt River Road',
  'Celebration of Love',
  'BEAUTIFUL LOVE STORY',
  'Everything began unexpectedly… A meeting, a glance, a simple exchange, and since then, everything has changed. Today, we are writing the most beautiful chapter of our lives.',
  '["Everything began unexpectedly…","A meeting, a glance, a simple exchange, and since then, everything has changed.","We have shared laughter, dreams, challenges, and so many other precious moments.","Today, we are writing the most beautiful chapter of our lives, and we would love to share it with you.","Your presence means so much to us on this very special day!","With all our love and our most sincere gratitude."]'::jsonb,
  'Palette: Olive Green, Peach, Black, Beige · Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear',
  'Vintage Wear',
  'Gala Wear',
  'Therefore what God has joined together, let no one separate.',
  'I will restore to you the years that the swarming locust has eaten.',
  '/src/assets/images/IMG-20261107-WA0121.jpg',
  '/src/assets/images/IMG-20261107-WA0166.jpg',
  '1st December 2026',
  'https://registry.aurelia.invites/samson-kevine'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wedding_events (id, wedding_id, title, event_date, event_time, venue, address, dress_code, description, sort_order)
VALUES
  (
    'evt-benediction',
    'wed-aur-001',
    'Wedding Benediction',
    'Sunday, 20th December 2026',
    '13:00',
    'Lion Voice Tabernacle',
    '11 Lower Maynard Rd Wynberg Station, Tailan Building Basement Hall.',
    'Vintage Wear',
    'Therefore what God has joined together, let no one separate.',
    1
  ),
  (
    'evt-reception',
    'wed-aur-001',
    'Evening Reception',
    'Sunday, 20th December 2026',
    '18:00 to 21:00',
    'Rooftop',
    '39 Salt River Road, Salt River, Cape Town, Western Cape, 7405',
    'Gala Wear',
    'I will restore to you the years that the swarming locust has eaten.',
    2
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

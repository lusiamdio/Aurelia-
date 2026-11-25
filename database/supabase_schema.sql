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

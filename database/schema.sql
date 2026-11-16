-- ============================================================================
-- AURELIA WEDDING PLATFORM — PRODUCTION POSTGRESQL DATABASE & AUTH SCHEMA
-- Dialect: PostgreSQL 16+
-- Extensions: pgcrypto, citext, uuid-ossp
-- Covers:
--   1. Authentication, Credential Hashing (Argon2/Bcrypt via pgcrypto), RBAC,
--      Session Management, Login Lockout & Security Audit Logging
--   2. Wedding Core Configuration & Custom Visual Stationery Studio Settings
--   3. Ceremonial Agenda Events & Love Story Timeline
--   4. Guest Registry, Single/Couple Party Tracking, QR Gate Pass Verification,
--      Door Check-In & Real-Time CSV Export Views
--   5. Celebration Playlist & DJ Song Request Curation
--   6. Row-Level Security (RLS) Policies, Triggers, and GDPR/POPIA Erasure
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUMERATED DOMAIN TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('couple_admin', 'coordinator', 'door_scanner', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invitation_style_enum AS ENUM ('classic', 'minimalist', 'royal', 'botanical', 'contemporary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE foil_accent_enum AS ENUM ('gold', 'rose', 'silver', 'blind', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE paper_tone_enum AS ENUM ('ivory', 'white', 'midnight', 'blush', 'stone', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_orientation_enum AS ENUM ('portrait', 'landscape');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_frame_enum AS ENUM ('arch', 'cameo', 'inset', 'editorial-split');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE decorative_graphic_enum AS ENUM ('none', 'botanical', 'crest', 'artdeco', 'arch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wax_seal_enum AS ENUM ('monogram', 'botanical', 'crest', 'heart');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rsvp_status_enum AS ENUM ('attending', 'declined', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_type_enum AS ENUM ('single', 'couple');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plus_one_status_enum AS ENUM ('confirmed', 'rejected', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_channel_enum AS ENUM ('whatsapp', 'email', 'download');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE song_status_enum AS ENUM ('approved', 'must-play', 'declined', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE song_energy_enum AS ENUM ('chill', 'mid-tempo', 'high-energy', 'party-anthem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. AUTHENTICATION & ACCESS CONTROL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT UNIQUE,
  couple_credential   TEXT NOT NULL,                -- e.g. 'Samson & Kevine'
  credential_norm     TEXT GENERATED ALWAYS AS (LOWER(TRIM(couple_credential))) STORED,
  pin_hash            TEXT NOT NULL,                -- crypt('2026', gen_salt('bf', 12))
  role                user_role NOT NULL DEFAULT 'couple_admin',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts     SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_credential_norm
  ON auth_accounts (credential_norm)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  token_hash          TEXT NOT NULL UNIQUE,         -- SHA-256 hex digest of bearer/cookie token
  ip_address          INET,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_account_active
  ON auth_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_audit_logs (
  id                  BIGSERIAL PRIMARY KEY,
  account_id          UUID REFERENCES auth_accounts(id) ON DELETE SET NULL,
  action              TEXT NOT NULL,                -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'DATA_ERASURE', etc.
  ip_address          INET,
  user_agent          TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_account_time
  ON auth_audit_logs (account_id, created_at DESC);

-- ============================================================================
-- 3. CORE WEDDING & STATIONERY STUDIO TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS weddings (
  id                  TEXT PRIMARY KEY,             -- e.g. 'wed-aur-001'
  owner_account_id    UUID NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  slug                CITEXT NOT NULL UNIQUE,       -- e.g. 'samson-kevine'
  custom_domain       TEXT,                         -- e.g. 'samsonandkevine.wedding'
  partner1            TEXT NOT NULL CHECK (LENGTH(TRIM(partner1)) BETWEEN 1 AND 120),
  partner2            TEXT NOT NULL CHECK (LENGTH(TRIM(partner2)) BETWEEN 1 AND 120),
  display_date        TEXT NOT NULL,                -- e.g. 'Sunday, 20th December 2026'
  raw_date            DATE NOT NULL,                -- e.g. '2026-12-20'
  city                TEXT NOT NULL,
  venue               TEXT NOT NULL,
  headline            TEXT NOT NULL DEFAULT 'Celebration of Love',
  story_title         TEXT NOT NULL DEFAULT 'BEAUTIFUL LOVE STORY',
  story_message       TEXT NOT NULL,
  story_paragraphs    JSONB NOT NULL DEFAULT '[]'::JSONB,
  dress_code_summary  TEXT NOT NULL,
  dress_code_church   TEXT NOT NULL DEFAULT 'Vintage Wear',
  dress_code_dining   TEXT NOT NULL DEFAULT 'Gala Wear',
  scripture1          TEXT,
  scripture2          TEXT,
  hero_image_url      TEXT NOT NULL,
  rsvp_deadline       TEXT NOT NULL,
  gift_registry_url   TEXT,

  -- Visual Stationery Customization & Branding
  invitation_style    invitation_style_enum NOT NULL DEFAULT 'classic',
  foil_accent         foil_accent_enum NOT NULL DEFAULT 'gold',
  paper_tone          paper_tone_enum NOT NULL DEFAULT 'ivory',
  monogram            TEXT NOT NULL DEFAULT 'S & K',
  card_orientation    card_orientation_enum NOT NULL DEFAULT 'portrait',
  selected_font       TEXT NOT NULL DEFAULT 'cormorant',
  couple_photo_url    TEXT,
  show_photo_on_card  BOOLEAN NOT NULL DEFAULT TRUE,
  photo_frame_style   photo_frame_enum NOT NULL DEFAULT 'arch',
  decorative_graphic  decorative_graphic_enum NOT NULL DEFAULT 'botanical',
  wax_seal_style      wax_seal_enum NOT NULL DEFAULT 'monogram',
  custom_colors       JSONB NOT NULL DEFAULT '{"background":"#FAF7F0","foil":"#D4AF37","text":"#292722","border":"#B59A72","isCustom":false}'::JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wedding_events (
  id                  TEXT PRIMARY KEY,             -- e.g. 'evt-benediction', 'evt-reception'
  wedding_id          TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  event_date          TEXT NOT NULL,
  event_time          TEXT NOT NULL,
  venue               TEXT NOT NULL,
  address             TEXT NOT NULL,
  dress_code          TEXT NOT NULL,
  description         TEXT,
  sort_order          SMALLINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_events_wedding
  ON wedding_events (wedding_id, sort_order);

CREATE TABLE IF NOT EXISTS love_story_moments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id          TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  chapter_label       TEXT NOT NULL,                -- e.g. 'Chapter 01'
  title               TEXT NOT NULL,
  location            TEXT NOT NULL,
  description         TEXT NOT NULL,
  image_url           TEXT,
  sort_order          SMALLINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_moments_wedding
  ON love_story_moments (wedding_id, sort_order);

-- ============================================================================
-- 4. GUEST REGISTRY, PASS VERIFICATION & DOOR ADMISSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS guest_invitations (
  id                      TEXT PRIMARY KEY,         -- Pass ID e.g. 'AUR-8012'
  wedding_id              TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  full_name               TEXT NOT NULL CHECK (LENGTH(TRIM(full_name)) BETWEEN 1 AND 160),
  email                   CITEXT,
  phone                   TEXT,
  status                  rsvp_status_enum NOT NULL DEFAULT 'pending',
  attendance_type         attendance_type_enum NOT NULL DEFAULT 'single',
  has_plus_one            BOOLEAN NOT NULL DEFAULT FALSE,
  seats_reserved          SMALLINT GENERATED ALWAYS AS (
                            CASE
                              WHEN status = 'declined' THEN 0
                              WHEN attendance_type = 'couple' OR has_plus_one THEN 2
                              ELSE 1
                            END
                          ) STORED,
  plus_one_name           TEXT,
  plus_one_dietary        TEXT,
  plus_one_status         plus_one_status_enum DEFAULT 'pending',
  plus_one_allowed        BOOLEAN NOT NULL DEFAULT FALSE,
  dietary_requirements    TEXT,
  invitation_sent_via     delivery_channel_enum DEFAULT 'download',
  qr_payload              TEXT GENERATED ALWAYS AS (
                            'AURELIA-WEDDING:' || wedding_id || ':GUEST:' || id || ':' || full_name
                          ) STORED,
  checked_in              BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at           TIMESTAMPTZ,
  checked_in_by           UUID REFERENCES auth_accounts(id) ON DELETE SET NULL,
  notes                   TEXT,
  invitation_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guests_wedding_status
  ON guest_invitations (wedding_id, status);

CREATE INDEX IF NOT EXISTS idx_guests_wedding_party_type
  ON guest_invitations (wedding_id, attendance_type, checked_in);

CREATE TABLE IF NOT EXISTS guest_event_admissions (
  guest_id            TEXT NOT NULL REFERENCES guest_invitations(id) ON DELETE CASCADE,
  event_id            TEXT NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
  admitted_at         TIMESTAMPTZ,
  PRIMARY KEY (guest_id, event_id)
);

-- ============================================================================
-- 5. DJ CELEBRATION PLAYLIST & GUEST SONG REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS song_requests (
  id                  TEXT PRIMARY KEY,
  wedding_id          TEXT NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id            TEXT REFERENCES guest_invitations(id) ON DELETE SET NULL,
  guest_name          TEXT NOT NULL DEFAULT 'Guest',
  song_title          TEXT NOT NULL CHECK (LENGTH(TRIM(song_title)) BETWEEN 1 AND 200),
  artist              TEXT NOT NULL CHECK (LENGTH(TRIM(artist)) BETWEEN 1 AND 200),
  status              song_status_enum NOT NULL DEFAULT 'pending',
  dance_energy        song_energy_enum NOT NULL DEFAULT 'mid-tempo',
  notes               TEXT,
  dj_notes            TEXT,
  votes               INTEGER NOT NULL DEFAULT 1 CHECK (votes >= 0),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_songs_wedding_status
  ON song_requests (wedding_id, status);

-- ============================================================================
-- 6. AUTOMATIC TIMESTAMP TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'auth_accounts',
      'weddings',
      'wedding_events',
      'guest_invitations',
      'song_requests'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 7. PRODUCTION AUTHENTICATION & DATABASE STORED FUNCTIONS
-- ============================================================================

-- Authenticate Couple Admin with partner credential + PIN ('2026'),
-- enforces brute-force lockout (5 attempts -> 15 min lock) and issues a 24h session.
CREATE OR REPLACE FUNCTION authenticate_couple_admin(
  p_credential  TEXT,
  p_pin         TEXT,
  p_ip          INET DEFAULT NULL,
  p_user_agent  TEXT DEFAULT NULL
)
RETURNS TABLE (
  authenticated BOOLEAN,
  session_token TEXT,
  account_id    UUID,
  role          user_role,
  expires_at    TIMESTAMPTZ,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account     auth_accounts%ROWTYPE;
  v_raw_token   TEXT;
  v_token_hash  TEXT;
  v_expires     TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_account
  FROM auth_accounts
  WHERE credential_norm = LOWER(TRIM(p_credential))
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO auth_audit_logs (action, ip_address, user_agent, metadata)
    VALUES ('LOGIN_FAILED', p_ip, p_user_agent, jsonb_build_object('reason', 'unknown_credential'));

    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::user_role, NULL::TIMESTAMPTZ,
      'Invalid couple credential.';
    RETURN;
  END IF;

  IF v_account.locked_until IS NOT NULL AND v_account.locked_until > NOW() THEN
    INSERT INTO auth_audit_logs (account_id, action, ip_address, user_agent, metadata)
    VALUES (v_account.id, 'LOGIN_LOCKED', p_ip, p_user_agent,
            jsonb_build_object('locked_until', v_account.locked_until));

    RETURN QUERY SELECT FALSE, NULL::TEXT, v_account.id, v_account.role, NULL::TIMESTAMPTZ,
      'Account temporarily locked due to repeated failed attempts.';
    RETURN;
  END IF;

  IF v_account.pin_hash = crypt(TRIM(p_pin), v_account.pin_hash) THEN
    v_raw_token  := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');
    v_expires    := NOW() + INTERVAL '24 hours';

    UPDATE auth_accounts
    SET failed_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW()
    WHERE id = v_account.id;

    INSERT INTO auth_sessions (account_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (v_account.id, v_token_hash, p_ip, p_user_agent, v_expires);

    INSERT INTO auth_audit_logs (account_id, action, ip_address, user_agent, metadata)
    VALUES (v_account.id, 'LOGIN_SUCCESS', p_ip, p_user_agent, '{}'::JSONB);

    RETURN QUERY SELECT TRUE, v_raw_token, v_account.id, v_account.role, v_expires, NULL::TEXT;
  ELSE
    UPDATE auth_accounts
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
          ELSE NULL
        END
    WHERE id = v_account.id;

    INSERT INTO auth_audit_logs (account_id, action, ip_address, user_agent, metadata)
    VALUES (v_account.id, 'LOGIN_FAILED', p_ip, p_user_agent,
            jsonb_build_object('reason', 'invalid_pin'));

    RETURN QUERY SELECT FALSE, NULL::TEXT, v_account.id, v_account.role, NULL::TIMESTAMPTZ,
      'Invalid PIN passcode.';
  END IF;
END;
$$;

-- Verify active bearer session token
CREATE OR REPLACE FUNCTION verify_session_token(p_raw_token TEXT)
RETURNS TABLE (
  valid       BOOLEAN,
  account_id  UUID,
  role        user_role,
  expires_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
BEGIN
  IF p_raw_token IS NULL OR LENGTH(TRIM(p_raw_token)) < 32 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::user_role, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  v_token_hash := encode(digest(TRIM(p_raw_token), 'sha256'), 'hex');

  RETURN QUERY
  SELECT TRUE, a.id, a.role, s.expires_at
  FROM auth_sessions s
  JOIN auth_accounts a ON a.id = s.account_id
  WHERE s.token_hash = v_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > NOW()
    AND a.is_active = TRUE
  LIMIT 1;
END;
$$;

-- Transactional Door Pass Check-In
CREATE OR REPLACE FUNCTION verify_and_checkin_guest(
  p_wedding_id  TEXT,
  p_pass_id     TEXT,
  p_scanner_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  verified      BOOLEAN,
  guest_id      TEXT,
  full_name     TEXT,
  party_type    attendance_type_enum,
  seats         SMALLINT,
  checked_in_at TIMESTAMPTZ,
  message       TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_guest guest_invitations%ROWTYPE;
BEGIN
  UPDATE guest_invitations
  SET checked_in = TRUE,
      checked_in_at = COALESCE(checked_in_at, NOW()),
      checked_in_by = COALESCE(p_scanner_id, checked_in_by)
  WHERE wedding_id = p_wedding_id
    AND UPPER(id) = UPPER(TRIM(p_pass_id))
  RETURNING * INTO v_guest;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::attendance_type_enum,
      0::SMALLINT, NULL::TIMESTAMPTZ, 'Invalid Pass ID. No matching invitation found.';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_guest.id,
    v_guest.full_name,
    v_guest.attendance_type,
    v_guest.seats_reserved,
    v_guest.checked_in_at,
    format('Verified: %s (%s · %s seats) admitted.', v_guest.full_name, INITCAP(v_guest.attendance_type::TEXT), v_guest.seats_reserved);
END;
$$;

-- GDPR / POPIA Complete Wedding & Guest Data Erasure
CREATE OR REPLACE FUNCTION erase_wedding_data(
  p_wedding_id  TEXT,
  p_account_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM weddings
  WHERE id = p_wedding_id
    AND owner_account_id = p_account_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO auth_audit_logs (account_id, action, metadata)
    VALUES (p_account_id, 'GDPR_POPIA_ERASURE', jsonb_build_object('wedding_id', p_wedding_id));
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ============================================================================
-- 8. REAL-TIME ANALYTICS & CSV EXPORT VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW v_realtime_guest_csv_export AS
SELECT
  g.wedding_id,
  g.id                                                    AS pass_id,
  g.full_name                                             AS guest_full_name,
  CASE
    WHEN g.attendance_type = 'couple' OR g.has_plus_one THEN 'Couple'
    ELSE 'Single'
  END                                                     AS party_type,
  g.seats_reserved,
  g.status                                                AS rsvp_status,
  COALESCE(g.dietary_requirements, '')                    AS dietary_requirements,
  CASE WHEN g.checked_in THEN 'Yes' ELSE 'No' END         AS checked_in,
  COALESCE(TO_CHAR(g.checked_in_at, 'YYYY-MM-DD HH24:MI'), '') AS admission_timestamp,
  TO_CHAR(g.invitation_generated_at, 'YYYY-MM-DD HH24:MI')     AS registration_date
FROM guest_invitations g;

CREATE OR REPLACE VIEW v_wedding_headcount_summary AS
SELECT
  w.id AS wedding_id,
  w.slug,
  COUNT(g.id)                                                           AS total_invitations,
  COUNT(g.id) FILTER (WHERE g.status = 'attending')                     AS attending_parties,
  COUNT(g.id) FILTER (WHERE g.status = 'pending')                       AS pending_parties,
  COUNT(g.id) FILTER (WHERE g.status = 'declined')                      AS declined_parties,
  COUNT(g.id) FILTER (WHERE g.attendance_type = 'couple' OR g.has_plus_one) AS couple_parties,
  COUNT(g.id) FILTER (WHERE g.attendance_type = 'single' AND NOT g.has_plus_one) AS single_parties,
  COALESCE(SUM(g.seats_reserved) FILTER (WHERE g.status = 'attending'), 0)  AS confirmed_seats,
  COUNT(g.id) FILTER (WHERE g.checked_in = TRUE)                        AS checked_in_parties
FROM weddings w
LEFT JOIN guest_invitations g ON g.wedding_id = w.id
GROUP BY w.id, w.slug;

-- ============================================================================
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE weddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_requests ENABLE ROW LEVEL SECURITY;

-- Public read access to wedding microsite & agenda events
DROP POLICY IF EXISTS weddings_public_read ON weddings;
CREATE POLICY weddings_public_read ON weddings
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS weddings_owner_write ON weddings;
CREATE POLICY weddings_owner_write ON weddings
  FOR ALL USING (owner_account_id = NULLIF(current_setting('app.current_account_id', TRUE), '')::UUID);

DROP POLICY IF EXISTS events_public_read ON wedding_events;
CREATE POLICY events_public_read ON wedding_events
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS events_owner_write ON wedding_events;
CREATE POLICY events_owner_write ON wedding_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM weddings w
      WHERE w.id = wedding_events.wedding_id
        AND w.owner_account_id = NULLIF(current_setting('app.current_account_id', TRUE), '')::UUID
    )
  );

-- Guests can register (INSERT) publicly; only Couple Admin can list/update/delete all guest PII
DROP POLICY IF EXISTS guests_public_register ON guest_invitations;
CREATE POLICY guests_public_register ON guest_invitations
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS guests_owner_manage ON guest_invitations;
CREATE POLICY guests_owner_manage ON guest_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM weddings w
      WHERE w.id = guest_invitations.wedding_id
        AND w.owner_account_id = NULLIF(current_setting('app.current_account_id', TRUE), '')::UUID
    )
  );

-- Song requests: public submission & read; Couple Admin curates status/DJ notes
DROP POLICY IF EXISTS songs_public_read ON song_requests;
CREATE POLICY songs_public_read ON song_requests
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS songs_public_insert ON song_requests;
CREATE POLICY songs_public_insert ON song_requests
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS songs_owner_manage ON song_requests;
CREATE POLICY songs_owner_manage ON song_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM weddings w
      WHERE w.id = song_requests.wedding_id
        AND w.owner_account_id = NULLIF(current_setting('app.current_account_id', TRUE), '')::UUID
    )
  );

-- ============================================================================
-- 10. SEED INITIAL COUPLE ACCOUNT & WEDDING RECORD (IDEMPOTENT)
-- ============================================================================

INSERT INTO auth_accounts (id, email, couple_credential, pin_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000002026'::UUID,
  'admin@samsonandkevine.wedding',
  'Samson & Kevine',
  crypt('2026', gen_salt('bf', 12)),
  'couple_admin'
)
ON CONFLICT (id) DO UPDATE
SET pin_hash = EXCLUDED.pin_hash,
    couple_credential = EXCLUDED.couple_credential;

INSERT INTO weddings (
  id, owner_account_id, slug, custom_domain, partner1, partner2,
  display_date, raw_date, city, venue, headline, story_title, story_message,
  dress_code_summary, dress_code_church, dress_code_dining,
  scripture1, scripture2, hero_image_url, couple_photo_url, rsvp_deadline
)
VALUES (
  'wed-aur-001',
  '00000000-0000-0000-0000-000000002026'::UUID,
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
  'Everything began unexpectedly… A meeting, a glance, a simple exchange, and since then, everything has changed.',
  'Palette: Olive Green, Peach, Black, Beige · Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear',
  'Vintage Wear',
  'Gala Wear',
  'Therefore what God has joined together, let no one separate.',
  'I will restore to you the years that the swarming locust has eaten.',
  '/src/assets/images/IMG-20261107-WA0121.jpg',
  '/src/assets/images/IMG-20261107-WA0166.jpg',
  '1st December 2026'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO wedding_events (id, wedding_id, title, event_date, event_time, venue, address, dress_code, description, sort_order)
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

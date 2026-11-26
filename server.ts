import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

process.on('uncaughtException', (err) => {
  console.error('Server uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Server unhandledRejection:', reason);
});

app.use(express.json());

function cleanEnvSecret(value?: string): string {
  return (value || '').trim().replace(/^["']|["']$/g, '').trim();
}

// Supabase Configuration (from environment variables — never hardcoded)
const supabaseUrl = cleanEnvSecret(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const supabasePublishableKey = cleanEnvSecret(
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
const supabaseServiceRoleKey = cleanEnvSecret(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

const supabasePublic =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

let hasSupabaseAdminPrivilege = Boolean(supabaseAdmin);

if (supabaseAdmin) {
  void supabaseAdmin
    .from('weddings')
    .select('id')
    .limit(1)
    .then(({ error }) => {
      if (error && /invalid api key|jwt/i.test(error.message)) {
        hasSupabaseAdminPrivilege = false;
        console.warn('Supabase service key rejected; running admin persistence with server store fallback.');
      }
    });
}

const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_FILE = path.resolve(DATA_DIR, 'wedding_store.json');

interface ServerStore {
  weddings: Record<string, { weddingPayload: any; eventRows: any[] }>;
  guests: any[];
  songs: any[];
  deletedSongIds: string[];
  adminAuth?: {
    claimedEmail?: string | null;
    claimedPasscodeHash?: string | null;
    sessionSigningKey?: string | null;
  };
}

function readServerStore(): ServerStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      return {
        weddings: parsed.weddings && typeof parsed.weddings === 'object' ? parsed.weddings : {},
        guests: Array.isArray(parsed.guests) ? parsed.guests : [],
        songs: Array.isArray(parsed.songs) ? parsed.songs : [],
        deletedSongIds: Array.isArray(parsed.deletedSongIds) ? parsed.deletedSongIds : [],
        adminAuth:
          parsed.adminAuth && typeof parsed.adminAuth === 'object' ? parsed.adminAuth : undefined
      };
    }
  } catch {
    // fallback to empty store
  }
  return { weddings: {}, guests: [], songs: [], deletedSongIds: [] };
}

function writeServerStore(store: ServerStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed writing server store:', err);
  }
}

// Persistent session signing key (reads SESSION_SECRET if configured, otherwise generated once and stored)
const SESSION_SIGNING_KEY: string = (() => {
  const fromEnv = cleanEnvSecret(process.env.SESSION_SECRET);
  if (fromEnv) return fromEnv;
  const store = readServerStore();
  if (store.adminAuth?.sessionSigningKey) {
    return store.adminAuth.sessionSigningKey;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  store.adminAuth = {
    ...(store.adminAuth || {}),
    sessionSigningKey: generated
  };
  writeServerStore(store);
  return generated;
})();

// Optional first-run fallback credentials (persisted in .data/wedding_store.json when env vars are unset)
let claimedAdminEmail: string | null = readServerStore().adminAuth?.claimedEmail || null;
let claimedAdminPasscodeHash: string | null =
  readServerStore().adminAuth?.claimedPasscodeHash || null;

function setClaimedAdminCredentials(email: string, hash: string): void {
  claimedAdminEmail = email.trim().toLowerCase();
  claimedAdminPasscodeHash = hash;
  const store = readServerStore();
  store.adminAuth = {
    ...(store.adminAuth || {}),
    claimedEmail: claimedAdminEmail,
    claimedPasscodeHash: hash
  };
  writeServerStore(store);
}

function getConfiguredAdminEmail(): string {
  return cleanEnvSecret(process.env.COUPLE_ADMIN_EMAIL).toLowerCase();
}

function getConfiguredAdminPasscode(): string {
  return cleanEnvSecret(process.env.COUPLE_ADMIN_PASSCODE);
}

function constantTimeMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashPasscodeScrypt(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasscodeScrypt(passcode: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(passcode, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function verifySubmittedEmail(submittedEmail: string): boolean {
  const normalized = submittedEmail.trim().toLowerCase();
  if (!normalized) return false;
  const configured = getConfiguredAdminEmail();
  if (configured) {
    return constantTimeMatch(normalized, configured);
  }
  if (claimedAdminEmail) {
    return constantTimeMatch(normalized, claimedAdminEmail.trim().toLowerCase());
  }
  return false;
}

function verifySubmittedPasscode(submittedPassword: string): boolean {
  const configured = getConfiguredAdminPasscode();
  if (configured) {
    return constantTimeMatch(submittedPassword.trim(), configured);
  }
  if (claimedAdminPasscodeHash) {
    return verifyPasscodeScrypt(submittedPassword.trim(), claimedAdminPasscodeHash);
  }
  return false;
}

function issueAdminBearerToken(coupleLabel: string): { token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(
    JSON.stringify({ role: 'couple_admin', couple: coupleLabel, iat: now, exp: expiresAt })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payload)
    .digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

function verifyAdminBearerToken(token: string): { role: string; couple: string; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || parsed.role !== 'couple_admin' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requireCoupleAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in as Couple Admin.' });
  }

  const session = verifyAdminBearerToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired admin session.' });
  }

  (req as any).adminSession = session;
  return next();
}

function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '').replace(/"/g, '""');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe}"`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function checkSupabaseAdminCredentialExists(): Promise<boolean> {
  const dbClient = (hasSupabaseAdminPrivilege ? supabaseAdmin : null) || supabasePublic;
  if (!dbClient) return false;
  try {
    const rpcCall = dbClient.rpc('has_couple_admin_credentials', { p_wedding_id: 'wed-aur-001' });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
    const result: any = await Promise.race([rpcCall, timeout]);
    return Boolean(result && !result.error && result.data === true);
  } catch {
    return false;
  }
}

async function verifyViaSupabaseAdminRpc(
  email: string,
  password: string
): Promise<'valid' | 'invalid' | 'unavailable'> {
  const dbClient = (hasSupabaseAdminPrivilege ? supabaseAdmin : null) || supabasePublic;
  if (!dbClient) return 'unavailable';
  try {
    const { data, error } = await dbClient.rpc('verify_couple_admin_login', {
      p_wedding_id: 'wed-aur-001',
      p_email: email.trim().toLowerCase(),
      p_password: password.trim()
    });
    if (error) return 'unavailable';
    return data === true ? 'valid' : 'invalid';
  } catch {
    return 'unavailable';
  }
}

// Check whether server admin credentials are configured or claimed
app.get('/api/auth/status', async (_req, res) => {
  const configured = Boolean(getConfiguredAdminEmail() && getConfiguredAdminPasscode());
  const locallyClaimed = Boolean(claimedAdminEmail && claimedAdminPasscodeHash);
  const dbConfigured = configured || locallyClaimed ? false : await checkSupabaseAdminCredentialExists();
  res.json({
    passcodeConfigured: configured || dbConfigured,
    claimed: locallyClaimed,
    requiresSetup: !configured && !locallyClaimed && !dbConfigured
  });
});

// Verify active Bearer session token
app.get('/api/auth/session', requireCoupleAdmin, (req, res) => {
  const session = (req as any).adminSession;
  res.json({
    authenticated: true,
    role: 'couple_admin',
    couple: session?.couple
  });
});

// One-time bootstrap claim (only active when env vars and DB credentials are unset)
app.post('/api/auth/claim', async (req, res) => {
  const dbConfigured = await checkSupabaseAdminCredentialExists();
  const envConfigured = Boolean(getConfiguredAdminEmail() && getConfiguredAdminPasscode());
  const localClaimed = Boolean(claimedAdminEmail && claimedAdminPasscodeHash);
  if (envConfigured || localClaimed || dbConfigured) {
    return res.status(403).json({
      authenticated: false,
      error: 'Admin access is already configured.'
    });
  }

  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || trimmedPassword.length < 4) {
    return res.status(400).json({
      authenticated: false,
      error: 'Valid admin email and password are required.'
    });
  }

  setClaimedAdminCredentials(normalizedEmail, hashPasscodeScrypt(trimmedPassword));

  const dbClient = (hasSupabaseAdminPrivilege ? supabaseAdmin : null) || supabasePublic;
  if (dbClient) {
    try {
      await dbClient.rpc('claim_couple_admin_password', {
        p_wedding_id: 'wed-aur-001',
        p_email: normalizedEmail,
        p_password: trimmedPassword
      });
    } catch {
      // optional SQL RPC
    }
  }

  const { token, expiresAt } = issueAdminBearerToken(normalizedEmail);
  return res.status(200).json({
    authenticated: true,
    role: 'couple_admin',
    accessToken: token,
    expiresAt
  });
});

// Couple Admin Sign In (Email + Password verified server-side)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '').trim();
  if (!normalizedEmail || !trimmedPassword) {
    return res.status(400).json({
      authenticated: false,
      error: 'Email and password are required.'
    });
  }

  const envConfigured = Boolean(getConfiguredAdminEmail() && getConfiguredAdminPasscode());
  const localClaimed = Boolean(claimedAdminEmail && claimedAdminPasscodeHash);

  if (envConfigured || localClaimed) {
    const emailMatch = verifySubmittedEmail(normalizedEmail);
    const passwordMatch = verifySubmittedPasscode(trimmedPassword);
    if (!emailMatch || !passwordMatch) {
      return res.status(401).json({
        authenticated: false,
        error: 'Invalid email or password.'
      });
    }
  } else {
    const rpcStatus = await verifyViaSupabaseAdminRpc(normalizedEmail, trimmedPassword);
    if (rpcStatus === 'unavailable') {
      return res.status(409).json({
        authenticated: false,
        requiresSetup: true,
        error: 'Admin credentials have not been configured yet.'
      });
    }
    if (rpcStatus === 'invalid') {
      return res.status(401).json({
        authenticated: false,
        error: 'Invalid email or password.'
      });
    }
  }

  const { token, expiresAt } = issueAdminBearerToken(normalizedEmail);
  return res.status(200).json({
    authenticated: true,
    role: 'couple_admin',
    accessToken: token,
    expiresAt
  });
});

// ============================================================================
// SERVER-SIDE REAL-TIME HUB (SSE BROADCASTS)
// ============================================================================

type AdminSyncTopic = 'guests' | 'songs' | 'wedding';
interface AdminStreamClient {
  res: express.Response;
  weddingId: string;
}

const adminStreamClients = new Set<AdminStreamClient>();

function broadcastAdminSync(weddingId: string, topic: AdminSyncTopic): void {
  const payload = JSON.stringify({ topic, weddingId, timestamp: Date.now() });
  const frame = `event: rsvp_sync\ndata: ${payload}\n\n`;
  for (const client of adminStreamClients) {
    if (client.weddingId === weddingId) {
      try {
        client.res.write(frame);
      } catch {
        adminStreamClients.delete(client);
      }
    }
  }
}

function sanitizeGuestRowInput(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const fullName = String(raw.full_name || '').trim().slice(0, 160);
  if (!fullName) return null;

  const status = ['attending', 'declined', 'pending'].includes(raw.status)
    ? raw.status
    : 'pending';
  const attendanceType = raw.attendance_type === 'couple' ? 'couple' : 'single';
  const hasPlusOne = Boolean(raw.has_plus_one || attendanceType === 'couple');
  const plusOneStatus = ['confirmed', 'rejected', 'pending'].includes(raw.plus_one_status)
    ? raw.plus_one_status
    : hasPlusOne
    ? 'confirmed'
    : 'pending';

  return {
    id: String(raw.id || `AUR-${Math.floor(1000 + Math.random() * 9000)}`).slice(0, 64),
    wedding_id: String(raw.wedding_id || 'wed-aur-001').slice(0, 64),
    full_name: fullName,
    email: raw.email ? String(raw.email).trim().slice(0, 200) : null,
    phone: raw.phone ? String(raw.phone).trim().slice(0, 64) : null,
    status,
    events_attending: Array.isArray(raw.events_attending)
      ? raw.events_attending.map((x: unknown) => String(x)).slice(0, 20)
      : [],
    attendance_type: attendanceType,
    has_plus_one: hasPlusOne,
    plus_one_name: raw.plus_one_name ? String(raw.plus_one_name).trim().slice(0, 160) : null,
    plus_one_dietary: raw.plus_one_dietary ? String(raw.plus_one_dietary).trim().slice(0, 250) : null,
    plus_one_status: plusOneStatus,
    plus_one_allowed: Boolean(raw.plus_one_allowed ?? hasPlusOne),
    dietary_requirements: raw.dietary_requirements
      ? String(raw.dietary_requirements).trim().slice(0, 300)
      : null,
    invitation_sent_via: ['whatsapp', 'email', 'download'].includes(raw.invitation_sent_via)
      ? raw.invitation_sent_via
      : 'download',
    invitation_generated_at: String(
      raw.invitation_generated_at || new Date().toISOString().replace('T', ' ').slice(0, 16)
    ).slice(0, 64),
    checked_in: Boolean(raw.checked_in),
    checked_in_at: raw.checked_in_at ? String(raw.checked_in_at).slice(0, 32) : null,
    notes: raw.notes ? String(raw.notes).trim().slice(0, 500) : null,
    created_at: raw.created_at || new Date().toISOString()
  };
}

// Public RSVP submission endpoint (never returns guest PII list)
app.post('/api/public/rsvp', async (req, res) => {
  const guestRow = sanitizeGuestRowInput(req.body);
  if (!guestRow) {
    return res.status(400).json({ ok: false, error: 'Full name is required to register an RSVP.' });
  }

  const store = readServerStore();
  const idx = store.guests.findIndex((g) => g.id === guestRow.id);
  if (idx >= 0) {
    store.guests[idx] = { ...store.guests[idx], ...guestRow };
  } else {
    store.guests.unshift(guestRow);
  }
  writeServerStore(store);

  if (hasSupabaseAdminPrivilege && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin
        .from('guest_invitations')
        .upsert(guestRow, { onConflict: 'id' });
      if (error && /invalid api key|jwt/i.test(error.message)) {
        hasSupabaseAdminPrivilege = false;
        if (supabasePublic) await supabasePublic.from('guest_invitations').insert(guestRow);
      }
    } catch {
      // ignore if schema not initialized yet
    }
  } else if (supabasePublic) {
    try {
      await supabasePublic.from('guest_invitations').insert(guestRow);
    } catch {
      // ignore if schema not initialized yet or duplicate
    }
  }

  broadcastAdminSync(guestRow.wedding_id, 'guests');
  return res.status(200).json({ ok: true, id: guestRow.id });
});

// Public Song request submission endpoint
app.post('/api/public/songs', async (req, res) => {
  const raw = req.body || {};
  const songTitle = String(raw.song_title || '').trim().slice(0, 200);
  const artist = String(raw.artist || '').trim().slice(0, 200);
  const guestName = String(raw.guest_name || '').trim().slice(0, 160);
  if (!songTitle || !artist || !guestName) {
    return res.status(400).json({ ok: false, error: 'Song title, artist, and guest name are required.' });
  }

  const songRow = {
    id: String(raw.id || `song-${Date.now()}`).slice(0, 64),
    wedding_id: String(raw.wedding_id || 'wed-aur-001').slice(0, 64),
    guest_name: guestName,
    song_title: songTitle,
    artist,
    status: ['approved', 'must-play', 'declined', 'pending'].includes(raw.status)
      ? raw.status
      : 'pending',
    notes: raw.notes ? String(raw.notes).trim().slice(0, 300) : null,
    dj_notes: raw.dj_notes ? String(raw.dj_notes).trim().slice(0, 300) : null,
    dance_energy: ['chill', 'mid-tempo', 'high-energy', 'party-anthem'].includes(raw.dance_energy)
      ? raw.dance_energy
      : 'high-energy',
    requested_at: String(raw.requested_at || new Date().toISOString().slice(0, 10)).slice(0, 32),
    votes: typeof raw.votes === 'number' ? raw.votes : 1
  };

  const store = readServerStore();
  const idx = store.songs.findIndex((s) => s.id === songRow.id);
  if (idx >= 0) {
    store.songs[idx] = songRow;
  } else {
    store.songs.unshift(songRow);
  }
  writeServerStore(store);

  const songWriter = (hasSupabaseAdminPrivilege ? supabaseAdmin : null) || supabasePublic;
  if (songWriter) {
    try {
      const { error } = await songWriter.from('song_requests').insert(songRow);
      if (error && /invalid api key|jwt/i.test(error.message) && supabasePublic) {
        hasSupabaseAdminPrivilege = false;
        await supabasePublic.from('song_requests').insert(songRow);
      }
    } catch {
      // ignore if schema not initialized yet
    }
  }

  broadcastAdminSync(songRow.wedding_id, 'songs');
  return res.status(200).json({ ok: true, id: songRow.id });
});

// Public wedding config & playlist fallback read
app.get('/api/public/wedding', (req, res) => {
  const weddingId = String(req.query.weddingId || 'wed-aur-001');
  const store = readServerStore();
  const savedWedding = store.weddings[weddingId] || null;
  const songs = store.songs.filter((s) => (s.wedding_id || 'wed-aur-001') === weddingId);
  res.json({
    weddingPayload: savedWedding?.weddingPayload || null,
    eventRows: savedWedding?.eventRows || null,
    songs,
    deletedSongIds: store.deletedSongIds || [],
    hasSupabaseAdminPrivilege
  });
});

// ============================================================================
// PROTECTED SUPABASE ADMIN CRUD ROUTES (COUPLE ADMIN ONLY)
// ============================================================================

app.get('/api/admin/guests/stream', requireCoupleAdmin, (req, res) => {
  const weddingId = String(req.query.weddingId || 'wed-aur-001');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const client: AdminStreamClient = { res, weddingId };
  adminStreamClients.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ weddingId, timestamp: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      adminStreamClients.delete(client);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    adminStreamClients.delete(client);
  });
});

app.get('/api/admin/guests', requireCoupleAdmin, async (req, res) => {
  const weddingId = String(req.query.weddingId || 'wed-aur-001');
  const store = readServerStore();
  const localGuests = store.guests.filter((g) => (g.wedding_id || 'wed-aur-001') === weddingId);

  if (!supabaseAdmin || !hasSupabaseAdminPrivilege) {
    return res.json({ guests: localGuests });
  }

  const { data, error } = await supabaseAdmin
    .from('guest_invitations')
    .select('*')
    .eq('wedding_id', weddingId)
    .order('created_at', { ascending: false });

  if (error) {
    if (/invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
      return res.json({ guests: localGuests });
    }
    return res.json({ guests: localGuests, error: error.message });
  }

  const dbGuests = data || [];
  const dbMap = new Map(dbGuests.map((g: any) => [g.id, g]));

  // Sync any local-only RSVPs up to Supabase cleanly
  for (const lg of localGuests) {
    if (!dbMap.has(lg.id)) {
      dbMap.set(lg.id, lg);
      try {
        await supabaseAdmin.from('guest_invitations').insert(lg);
      } catch {
        // ignore
      }
    }
  }

  const merged = Array.from(dbMap.values());
  store.guests = [
    ...merged,
    ...store.guests.filter((g) => (g.wedding_id || 'wed-aur-001') !== weddingId)
  ];
  writeServerStore(store);

  return res.json({ guests: merged });
});

app.post('/api/admin/guests', requireCoupleAdmin, async (req, res) => {
  const guestRow = sanitizeGuestRowInput(req.body);
  if (!guestRow) {
    return res.status(400).json({ synced: false, error: 'Invalid guest details.' });
  }

  const store = readServerStore();
  const idx = store.guests.findIndex((g) => g.id === guestRow.id);
  if (idx >= 0) {
    store.guests[idx] = { ...store.guests[idx], ...guestRow };
  } else {
    store.guests.unshift(guestRow);
  }
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin
      .from('guest_invitations')
      .upsert(guestRow, { onConflict: 'id' });
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
      if (supabasePublic) {
        await supabasePublic.from('guest_invitations').insert(guestRow);
      }
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  } else if (supabasePublic) {
    try {
      await supabasePublic.from('guest_invitations').insert(guestRow);
    } catch {
      // ignore
    }
  }
  broadcastAdminSync(guestRow.wedding_id, 'guests');
  return res.json({ synced: true });
});

app.patch('/api/admin/guests/:id', requireCoupleAdmin, async (req, res) => {
  const guestId = String(req.params.id || '');
  const guestRow = sanitizeGuestRowInput({ ...req.body, id: guestId });
  if (!guestRow) {
    return res.status(400).json({ synced: false, error: 'Invalid guest details.' });
  }

  const store = readServerStore();
  const idx = store.guests.findIndex((g) => g.id === guestId);
  if (idx >= 0) {
    store.guests[idx] = { ...store.guests[idx], ...guestRow };
  } else {
    store.guests.unshift(guestRow);
  }
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin
      .from('guest_invitations')
      .update(guestRow)
      .eq('id', guestId);
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  }
  broadcastAdminSync(guestRow.wedding_id, 'guests');
  return res.json({ synced: true });
});

app.delete('/api/admin/guests/:id', requireCoupleAdmin, async (req, res) => {
  const guestId = String(req.params.id || '');
  const store = readServerStore();
  const deletedGuest = store.guests.find((g) => g.id === guestId);
  const deletedWeddingId = String(deletedGuest?.wedding_id || 'wed-aur-001');
  store.guests = store.guests.filter((g) => g.id !== guestId);
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin
      .from('guest_invitations')
      .delete()
      .eq('id', guestId);
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  }
  broadcastAdminSync(deletedWeddingId, 'guests');
  return res.json({ synced: true });
});

app.put('/api/admin/wedding', requireCoupleAdmin, async (req, res) => {
  const { weddingPayload, eventRows } = req.body || {};
  if (!weddingPayload?.id) {
    return res.status(400).json({ synced: false, error: 'Invalid wedding payload.' });
  }

  const safeWeddingPayload = {
    ...weddingPayload,
    raw_date: /^\d{4}-\d{2}-\d{2}$/.test(String(weddingPayload.raw_date || ''))
      ? String(weddingPayload.raw_date)
      : '2026-12-20'
  };

  const store = readServerStore();
  store.weddings[safeWeddingPayload.id] = {
    weddingPayload: safeWeddingPayload,
    eventRows: Array.isArray(eventRows) ? eventRows : []
  };
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error: wErr } = await supabaseAdmin
      .from('weddings')
      .upsert(safeWeddingPayload, { onConflict: 'id' });
    if (wErr && /invalid api key|jwt/i.test(wErr.message)) {
      hasSupabaseAdminPrivilege = false;
      broadcastAdminSync(safeWeddingPayload.id, 'wedding');
      return res.json({ synced: true });
    }
    if (wErr) return res.status(400).json({ synced: false, error: wErr.message });

    if (Array.isArray(eventRows) && eventRows.length > 0) {
      const { error: eErr } = await supabaseAdmin
        .from('wedding_events')
        .upsert(eventRows, { onConflict: 'id' });
      if (eErr) return res.status(400).json({ synced: false, error: eErr.message });
    }
  }

  broadcastAdminSync(safeWeddingPayload.id, 'wedding');
  return res.json({ synced: true });
});

app.post('/api/admin/songs', requireCoupleAdmin, async (req, res) => {
  const songRow = req.body;
  if (!songRow?.id || !songRow?.song_title) {
    return res.status(400).json({ synced: false, error: 'Invalid song payload.' });
  }

  const store = readServerStore();
  const idx = store.songs.findIndex((s) => s.id === songRow.id);
  if (idx >= 0) {
    store.songs[idx] = songRow;
  } else {
    store.songs.unshift(songRow);
  }
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin.from('song_requests').insert(songRow);
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  } else if (supabasePublic) {
    try {
      await supabasePublic.from('song_requests').insert(songRow);
    } catch {
      // ignore
    }
  }
  broadcastAdminSync(String(songRow.wedding_id || 'wed-aur-001'), 'songs');
  return res.json({ synced: true });
});

app.patch('/api/admin/songs/:id', requireCoupleAdmin, async (req, res) => {
  const songId = String(req.params.id || '');
  const store = readServerStore();
  const idx = store.songs.findIndex((s) => s.id === songId);
  let targetWeddingId = 'wed-aur-001';
  if (idx >= 0) {
    store.songs[idx] = { ...store.songs[idx], ...req.body };
    targetWeddingId = String(store.songs[idx].wedding_id || 'wed-aur-001');
  } else {
    store.songs.unshift({ id: songId, wedding_id: 'wed-aur-001', ...req.body });
  }
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin
      .from('song_requests')
      .update(req.body)
      .eq('id', songId);
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  }
  broadcastAdminSync(targetWeddingId, 'songs');
  return res.json({ synced: true });
});

app.delete('/api/admin/songs/:id', requireCoupleAdmin, async (req, res) => {
  const songId = String(req.params.id || '');
  const store = readServerStore();
  const existingSong = store.songs.find((s) => s.id === songId);
  const targetWeddingId = String(existingSong?.wedding_id || 'wed-aur-001');
  store.songs = store.songs.filter((s) => s.id !== songId);
  if (!store.deletedSongIds.includes(songId)) {
    store.deletedSongIds.push(songId);
  }
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error } = await supabaseAdmin.from('song_requests').delete().eq('id', songId);
    if (error && /invalid api key|jwt/i.test(error.message)) {
      hasSupabaseAdminPrivilege = false;
    } else if (error) {
      return res.status(400).json({ synced: false, error: error.message });
    }
  }
  broadcastAdminSync(targetWeddingId, 'songs');
  return res.json({ synced: true });
});

app.delete('/api/admin/erase/:weddingId', requireCoupleAdmin, async (req, res) => {
  const weddingId = String(req.params.weddingId || 'wed-aur-001');
  const store = readServerStore();
  store.guests = store.guests.filter((g) => (g.wedding_id || 'wed-aur-001') !== weddingId);
  store.songs = store.songs.filter((s) => (s.wedding_id || 'wed-aur-001') !== weddingId);
  store.deletedSongIds = [];
  delete store.weddings[weddingId];
  writeServerStore(store);

  if (supabaseAdmin && hasSupabaseAdminPrivilege) {
    const { error: gErr } = await supabaseAdmin
      .from('guest_invitations')
      .delete()
      .eq('wedding_id', weddingId);
    if (gErr && /invalid api key|jwt/i.test(gErr.message)) {
      hasSupabaseAdminPrivilege = false;
      broadcastAdminSync(weddingId, 'guests');
      broadcastAdminSync(weddingId, 'wedding');
      return res.json({ synced: true });
    }
    if (gErr) return res.status(400).json({ synced: false, error: gErr.message });

    const { error: sErr } = await supabaseAdmin
      .from('song_requests')
      .delete()
      .eq('wedding_id', weddingId);
    if (sErr) return res.status(400).json({ synced: false, error: sErr.message });
  }

  broadcastAdminSync(weddingId, 'guests');
  broadcastAdminSync(weddingId, 'wedding');
  return res.json({ synced: true });
});

// Initialize GoogleGenAI server-side with User-Agent header
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    })
  : null;

// 1. AI Concierge & Wedding Stylist Chat
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, coupleNames, venue, date } = req.body;
    if (!ai) {
      return res.status(200).json({
        reply: `Welcome to the Wedding Concierge! How can I assist you with ${coupleNames || 'Samson & Kevine'}'s wedding celebration in Cape Town? You can ask me about guest dress codes (Vintage Wear & Gala Wear), schedule timings, transport, or children policies!`
      });
    }

    const systemInstruction = `You are the bespoke luxury wedding concierge representing ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding celebration in Cape Town, South Africa on ${date || 'Sunday, 20th December 2026'}.
Venues & Schedule:
- Wedding Benediction: Lion Voice Tabernacle (11 Lower Maynard Rd Wynberg Station, Tailan Building Basement Hall) at 13:00. Dress code: Vintage Wear. Scripture: "Therefore what God has joined together, let no one separate.".
- Evening Reception: Rooftop, 39 Salt River Road, Salt River, Cape Town from 18:00 to 21:00. Dress code: Gala Wear. Scripture: "I will restore to you the years that the swarming locust has eaten.".
Essential Policies:
- Transport Provision: There will be NO transport provision provided. Guests must arrange their own private vehicles, carpooling, or Uber between Wynberg and Salt River.
- Children Policy: Only young children aged 0 to 5 years can attend the evening event. Outside arrangements are requested for older children.
- RSVP Deadline: 1st December 2026.
Tone: Gracious, refined, welcoming, and concise (under 100 words).`;

    // Format chat history
    const history = (messages || []).slice(0, -1).map((m: any) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const lastMessage = messages?.[messages.length - 1]?.text || 'Hello';

    const chat = ai.chats.create({
      model: 'gemini-3.8-flash',
      history,
      config: {
        systemInstruction
      }
    });

    const response = await chat.sendMessage({
      message: lastMessage
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(200).json({
      reply: 'I would be delighted to assist you with any questions regarding the celebration schedule (Wedding Benediction at 13:00 & Evening Reception at 18:00), attire (Vintage Wear & Gala Wear), or venue directions in Cape Town.'
    });
  }
});

// 2. AI Wording & Vow Stylist
app.post('/api/ai/wording', async (req, res) => {
  try {
    const { type, partner1, partner2, venue, mood } = req.body;
    if (!ai) {
      return res.json({
        wording: `Together with their families, ${partner1 || 'Samson'} and ${partner2 || 'Kevine'} request the pleasure of your company to celebrate their sacred union at ${venue || 'Lion Voice Tabernacle & Rooftop Salt River'}. "Therefore what God has joined together, let no one separate."`
      });
    }

    const prompt = `Write a luxury, evocative wedding ${type || 'invitation wording'} for ${partner1 || 'Samson Ilunga'} & ${partner2 || 'Kevine Bonganga'} getting married in Cape Town.
Scriptures: "Therefore what God has joined together, let no one separate." and "I will restore to you the years that the swarming locust has eaten."
Tone: ${mood || 'European regal elegance with warm biblical grace and poetic romance'}.
Provide 2 short options: Option 1 (Classic Formal) and Option 2 (Poetic Romantic). Plain text only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt
    });

    res.json({ wording: response.text });
  } catch (err: any) {
    console.error('Wording error:', err);
    res.json({
      wording: `Together with their families, ${req.body.partner1 || 'Sarah'} & ${req.body.partner2 || 'James'} request the honour of your presence at their marriage celebration.`
    });
  }
});

// 3. AI DJ Playlist & Transitions Curator (Couple Admin Only)
app.post('/api/ai/dj-playlist', requireCoupleAdmin, async (req, res) => {
  try {
    const { songRequests, coupleNames } = req.body;
    if (!ai) {
      return res.json({
        plan: '1. Welcome & Cocktails: Sunset acoustic strings and jazz standards.\n2. Dinner: Sophisticated bossa nova and vintage soul.\n3. First Dance: Timeless romantic ballad.\n4. Peak Dance Floor: Motown, 80s classics, and modern euphoric pop.\n5. Midnight Encore: High-energy singalongs.'
      });
    }

    const songsStr = (songRequests || []).map((s: any) => `"${s.songTitle}" by ${s.artist} (requested by ${s.guestName})`).join(', ');

    const prompt = `Act as an elite luxury wedding DJ curator for ${coupleNames || 'Sarah & James'}'s wedding.
The guests have submitted these song requests: ${songsStr || 'Etta James, Frankie Valli, Earth Wind & Fire, Stevie Wonder'}.
Organize these into a cohesive 4-part reception setflow (Cocktails, Dinner, First Dance & Golden Hour, Peak Dancing) with seamless transitions and 3 recommended transition tracks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt
    });

    res.json({ plan: response.text });
  } catch (err: any) {
    console.error('DJ playlist error:', err);
    res.json({
      plan: '1. Cocktails: Acoustic strings\n2. Dinner: Soul & Jazz\n3. Dance: High-energy classics'
    });
  }
});

// 4. AI Google Search Grounding for Venue & Cape Town Travel Guide
app.post('/api/ai/search-grounding', async (req, res) => {
  try {
    const { query } = req.body;
    if (!ai) {
      return res.json({
        answer: 'Molenvliet Estate is located on the Helshoogte Pass between Stellenbosch and Franschhoek, approximately 45 minutes from Cape Town International Airport. March offers warm, sunny autumn temperatures averaging 26°C (78°F).'
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Answer the following guest inquiry regarding travel, weather, or venue for a Stellenbosch/Cape Town wedding: ${query}`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    res.json({ answer: response.text });
  } catch (err: any) {
    console.error('Search grounding error:', err);
    res.json({
      answer: 'Stellenbosch and the Cape Winelands are accessible via Cape Town International Airport (CPT). Uber, private shuttles, and luxury rental cars are readily available.'
    });
  }
});

// 5. Real-Time Gemini AI Bespoke Content for PDF Generation & Download
app.post('/api/pdf/gemini-content', async (req, res) => {
  try {
    const { type, guestName, guestId, hasPlusOne, plusOneName, coupleNames, venue, date, dressCode } = req.body;
    
    if (!ai) {
      if (type === 'card') {
        return res.json({
          blessing: `May your gracious presence elevate this sacred union as Samson and Kevine unite their hearts before God and family. We hold your cherished presence in deepest honour.`,
          proclamation: `Therefore what God has joined together, let no one separate.`
        });
      } else {
        return res.json({
          protocolNote: `Kindly present this verified gate pass upon arrival. Lion Voice Tabernacle Benediction commences at 13:00, followed by Evening Reception at Rooftop Salt River at 18:00.`,
          dressCodeRemark: `Attire Etiquette: Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear.`
        });
      }
    }

    if (type === 'card') {
      const prompt = `You are a royal wedding calligrapher and poet crafting a personalized ceremonial dedication on an official luxury landscape wedding invitation card for ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding celebration in Cape Town, Western Cape.
Venues: Lion Voice Tabernacle (13:00) & Rooftop 39 Salt River Road (18:00-21:00).
Scripture: "Therefore what God has joined together, let no one separate."
Honoured Guest: ${guestName || 'Honoured Guest'}
${hasPlusOne ? `Accompanying Guest: ${plusOneName || 'Guest'}` : 'Individual Attendee'}

Provide:
1. "blessing": A bespoke, poetic, and heartwarming ceremonial dedication honoring this guest's presence and God's blessings over the union (2 sentences, 25-35 words, dignified, eloquent, and deeply touching).
2. "proclamation": "Therefore what God has joined together, let no one separate.".

Respond in valid JSON format only:
{
  "blessing": "...",
  "proclamation": "..."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        blessing: parsed.blessing || `May your gracious presence elevate this sacred union as Samson and Kevine unite their hearts before God and family.`,
        proclamation: parsed.proclamation || `Therefore what God has joined together, let no one separate.`
      });
    } else {
      // type === 'pass'
      const prompt = `You are the lead protocol director for ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding.
Venues: Lion Voice Tabernacle (13:00) and Rooftop, 39 Salt River Road (18:00 to 21:00).
Dress code: ${dressCode || 'Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear'}
Primary Guest: ${guestName || 'Honoured Guest'}
Pass ID: ${guestId || 'AUR-8012'}
${hasPlusOne ? `Accompanying Plus-One: ${plusOneName || 'Guest'}` : 'Single Attendee'}

Provide:
1. "protocolNote": A welcoming arrival protocol note for this guest detailing entrance to Lion Voice Tabernacle and Rooftop Salt River (25-30 words).
2. "dressCodeRemark": "Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear".

Respond in valid JSON format only:
{
  "protocolNote": "...",
  "dressCodeRemark": "..."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        protocolNote: parsed.protocolNote || `Kindly present this verified gate pass upon arrival at Lion Voice Tabernacle (13:00) and Rooftop Salt River (18:00).`,
        dressCodeRemark: parsed.dressCodeRemark || `Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear`
      });
    }
  } catch (err: any) {
    console.error('Gemini PDF generation error:', err);
    res.json({
      blessing: `May your presence grace this union as two souls entwine their destinies in Cape Town. We hold your companionship in profound reverence.`,
      proclamation: `Therefore what God has joined together, let no one separate.`,
      protocolNote: `Kindly present this verified gate pass upon arrival at Lion Voice Tabernacle (13:00) and Rooftop Salt River (18:00).`,
      dressCodeRemark: `Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear`
    });
  }
});

// Helper for default acoustic classical wedding song score
function getDefaultWeddingSongScore(coupleNames?: string) {
  return {
    type: 'web_audio_score',
    title: `Cape Town Eternal Serenade — ${coupleNames || 'Samson & Kevine'}`,
    composer: 'Gemini Wedding Harmonizer',
    tempo: 74,
    key: 'D Major',
    vibeDescription: 'An evocative acoustic grand piano overture with ascending harp arpeggios and warm string ensemble.',
    poeticVerse: '“Therefore what God has joined together, let no one separate.”',
    melodyNotes: [
      { note: 'D4', freq: 293.66, duration: 0.8, delay: 0.0 },
      { note: 'F#4', freq: 369.99, duration: 0.8, delay: 0.8 },
      { note: 'A4', freq: 440.00, duration: 1.2, delay: 1.6 },
      { note: 'B4', freq: 493.88, duration: 0.8, delay: 2.8 },
      { note: 'A4', freq: 440.00, duration: 1.2, delay: 3.6 },
      { note: 'F#4', freq: 369.99, duration: 0.8, delay: 4.8 },
      { note: 'E4', freq: 329.63, duration: 0.8, delay: 5.6 },
      { note: 'D4', freq: 293.66, duration: 1.6, delay: 6.4 },
      { note: 'G4', freq: 392.00, duration: 0.8, delay: 8.0 },
      { note: 'F#4', freq: 369.99, duration: 0.8, delay: 8.8 },
      { note: 'E4', freq: 329.63, duration: 0.8, delay: 9.6 },
      { note: 'A4', freq: 440.00, duration: 1.6, delay: 10.4 },
      { note: 'D5', freq: 587.33, duration: 1.2, delay: 12.0 },
      { note: 'C#5', freq: 554.37, duration: 0.8, delay: 13.2 },
      { note: 'B4', freq: 493.88, duration: 0.8, delay: 14.0 },
      { note: 'A4', freq: 440.00, duration: 1.2, delay: 14.8 },
      { note: 'F#4', freq: 369.99, duration: 0.8, delay: 16.0 },
      { note: 'G4', freq: 392.00, duration: 0.8, delay: 16.8 },
      { note: 'A4', freq: 440.00, duration: 1.2, delay: 17.6 },
      { note: 'D4', freq: 293.66, duration: 2.4, delay: 18.8 }
    ],
    harmonyChords: [
      { name: 'D Major', time: 0.0, duration: 3.2, freqs: [146.83, 220.00, 293.66, 369.99] },
      { name: 'G Major', time: 3.2, duration: 3.2, freqs: [196.00, 246.94, 293.66, 392.00] },
      { name: 'B Minor', time: 6.4, duration: 3.2, freqs: [123.47, 185.00, 220.00, 293.66] },
      { name: 'A Major', time: 9.6, duration: 2.4, freqs: [110.00, 164.81, 220.00, 277.18] },
      { name: 'D Major', time: 12.0, duration: 4.0, freqs: [146.83, 220.00, 293.66, 369.99] },
      { name: 'G Major', time: 16.0, duration: 2.8, freqs: [196.00, 246.94, 293.66, 392.00] },
      { name: 'D Major', time: 18.8, duration: 4.2, freqs: [146.83, 220.00, 293.66, 369.99, 440.00] }
    ]
  };
}

// 5. AI Wedding Song Generator (Gemini Lyria & Multi-track Composition)
app.post('/api/ai/wedding-song', async (req, res) => {
  try {
    const { coupleNames, weddingDate, venue } = req.body;

    if (!ai) {
      return res.json(getDefaultWeddingSongScore(coupleNames));
    }

    // Compose a bespoke multi-track musical score using Gemini 3.8 Flash
    const compositionPrompt = `You are an elite royal wedding overture composer. Compose a romantic wedding overture song for Samson Ilunga & Kevine Bonganga's wedding in Cape Town ("Celebration of Love", Sunday, 20th December 2026).
Theme: "Therefore what God has joined together, let no one separate.".
Respond with a JSON object strictly following this structure:
{
  "title": "A romantic title e.g. 'Overture to Eternal Love (Samson & Kevine)'",
  "tempo": 74,
  "key": "D Major",
  "vibeDescription": "A tender, radiant acoustic piano serenade with soft orchestral string harmonics.",
  "poeticVerse": "Hand in hand beneath the Cape Town sky, a sacred covenant that will never die.",
  "melodyNotes": [
    {"note": "D4", "freq": 293.66, "duration": 0.8, "delay": 0.0},
    {"note": "F#4", "freq": 369.99, "duration": 0.8, "delay": 0.8},
    {"note": "A4", "freq": 440.00, "duration": 1.2, "delay": 1.6},
    {"note": "B4", "freq": 493.88, "duration": 0.8, "delay": 2.8},
    {"note": "A4", "freq": 440.00, "duration": 1.2, "delay": 3.6},
    {"note": "F#4", "freq": 369.99, "duration": 0.8, "delay": 4.8},
    {"note": "E4", "freq": 329.63, "duration": 0.8, "delay": 5.6},
    {"note": "D4", "freq": 293.66, "duration": 1.6, "delay": 6.4},
    {"note": "G4", "freq": 392.00, "duration": 0.8, "delay": 8.0},
    {"note": "F#4", "freq": 369.99, "duration": 0.8, "delay": 8.8},
    {"note": "E4", "freq": 329.63, "duration": 0.8, "delay": 9.6},
    {"note": "A4", "freq": 440.00, "duration": 1.6, "delay": 10.4},
    {"note": "D5", "freq": 587.33, "duration": 1.2, "delay": 12.0},
    {"note": "C#5", "freq": 554.37, "duration": 0.8, "delay": 13.2},
    {"note": "B4", "freq": 493.88, "duration": 0.8, "delay": 14.0},
    {"note": "A4", "freq": 440.00, "duration": 1.2, "delay": 14.8},
    {"note": "F#4", "freq": 369.99, "duration": 0.8, "delay": 16.0},
    {"note": "G4", "freq": 392.00, "duration": 0.8, "delay": 16.8},
    {"note": "A4", "freq": 440.00, "duration": 1.2, "delay": 17.6},
    {"note": "D4", "freq": 293.66, "duration": 2.4, "delay": 18.8}
  ],
  "harmonyChords": [
    {"name": "D Major", "time": 0.0, "duration": 3.2, "freqs": [146.83, 220.00, 293.66, 369.99]},
    {"name": "G Major", "time": 3.2, "duration": 3.2, "freqs": [196.00, 246.94, 293.66, 392.00]},
    {"name": "B Minor", "time": 6.4, "duration": 3.2, "freqs": [123.47, 185.00, 220.00, 293.66]},
    {"name": "A Major", "time": 9.6, "duration": 2.4, "freqs": [110.00, 164.81, 220.00, 277.18]},
    {"name": "D Major", "time": 12.0, "duration": 4.0, "freqs": [146.83, 220.00, 293.66, 369.99]},
    {"name": "G Major", "time": 16.0, "duration": 2.8, "freqs": [196.00, 246.94, 293.66, 392.00]}
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: compositionPrompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      type: 'web_audio_score',
      title: parsed.title || `Overture to Eternal Love — ${coupleNames || 'Samson & Kevine'}`,
      composer: 'Google Gemini 3.8 Flash AI',
      tempo: parsed.tempo || 74,
      key: parsed.key || 'D Major',
      vibeDescription: parsed.vibeDescription || 'A tender, radiant acoustic piano serenade with soft orchestral string harmonics.',
      poeticVerse: parsed.poeticVerse || 'Therefore what God has joined together, let no one separate.',
      melodyNotes: parsed.melodyNotes || getDefaultWeddingSongScore(coupleNames).melodyNotes,
      harmonyChords: parsed.harmonyChords || getDefaultWeddingSongScore(coupleNames).harmonyChords
    });
  } catch (err: any) {
    console.error('Wedding song generator error:', err);
    return res.json(getDefaultWeddingSongScore(req.body.coupleNames));
  }
});

// Real-Time CSV Export & Gemini AI Roster Processing (Couple Admin Only)
app.post('/api/export/csv', requireCoupleAdmin, (req, res) => {
  try {
    const { guests, weddingTitle } = req.body;
    const guestList = Array.isArray(guests) ? guests : [];
    const headers = [
      'Pass ID',
      'Guest Full Name',
      'Party Type (Single / Couple)',
      'Seats Reserved',
      'RSVP Status',
      'Dietary Requirements',
      'Checked In',
      'Admission Timestamp',
      'Registration Date'
    ];

    const rows = guestList.map((g: any) => {
      const isCouple = g.attendanceType === 'couple' || g.hasPlusOne;
      const partyLabel = isCouple ? 'Couple' : 'Single';
      const seats = isCouple ? '2' : '1';
      return [
        sanitizeCsvCell(g.id || ''),
        sanitizeCsvCell(g.fullName || ''),
        sanitizeCsvCell(partyLabel),
        seats,
        sanitizeCsvCell(g.status || 'pending'),
        sanitizeCsvCell(g.dietaryRequirements || ''),
        g.checkedIn ? 'Yes' : 'No',
        sanitizeCsvCell(g.checkedInAt || ''),
        sanitizeCsvCell(g.invitationGeneratedAt || '')
      ].join(',');
    });

    const csvData = [headers.join(','), ...rows].join('\r\n');
    const filename = `${(weddingTitle || 'wedding').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_guests_realtime.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (err: any) {
    console.error('CSV real-time export error:', err);
    return res.status(500).json({ error: 'Failed to generate real-time CSV export' });
  }
});

// Gemini AI Real-Time CSV Roster Analysis & Export (Couple Admin Only)
app.post('/api/ai/export-csv', requireCoupleAdmin, async (req, res) => {
  try {
    const { guests, weddingTitle } = req.body;
    const guestList = Array.isArray(guests) ? guests : [];

    // Calculate real-time numbers
    const totalSingle = guestList.filter((g: any) => g.attendanceType !== 'couple' && !g.hasPlusOne).length;
    const totalCouples = guestList.filter((g: any) => g.attendanceType === 'couple' || g.hasPlusOne).length;
    const attendingCount = guestList.filter((g: any) => g.status === 'attending').length;
    const totalSeats = guestList.filter((g: any) => g.status === 'attending')
      .reduce((acc: number, g: any) => acc + (g.attendanceType === 'couple' || g.hasPlusOne ? 2 : 1), 0);

    let aiInsight = `Real-time summary: ${guestList.length} total invitations (${totalCouples} couples, ${totalSingle} singles). Total confirmed seats: ${totalSeats}.`;

    if (ai) {
      try {
        const prompt = `Analyze this real-time wedding guest roster for ${weddingTitle || 'Samson & Kevine'}:
Guests count: ${guestList.length}
Couples: ${totalCouples} (2 seats each)
Singles: ${totalSingle} (1 seat each)
Confirmed attending guests: ${attendingCount}
Total venue seats required: ${totalSeats}
Sample dietary requirements: ${guestList.map((g: any) => g.dietaryRequirements).filter(Boolean).slice(0, 10).join(', ') || 'None specified'}

Provide a 2-sentence executive seating and catering summary for the couple's banquet team. Keep it under 50 words.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt
        });
        if (response.text) {
          aiInsight = response.text.trim();
        }
      } catch (e) {
        console.warn('Gemini AI summary fallback:', e);
      }
    }

    const headers = [
      'Pass ID',
      'Guest Full Name',
      'Party Type',
      'Seats Reserved',
      'RSVP Status',
      'Dietary Requirements',
      'Checked In',
      'Admission Timestamp'
    ];

    const rows = guestList.map((g: any) => {
      const isCouple = g.attendanceType === 'couple' || g.hasPlusOne;
      return [
        sanitizeCsvCell(g.id || ''),
        sanitizeCsvCell(g.fullName || ''),
        sanitizeCsvCell(isCouple ? 'Couple' : 'Single'),
        isCouple ? '2' : '1',
        sanitizeCsvCell(g.status || 'pending'),
        sanitizeCsvCell(g.dietaryRequirements || ''),
        g.checkedIn ? 'Yes' : 'No',
        sanitizeCsvCell(g.checkedInAt || '')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    return res.json({
      success: true,
      csvContent,
      aiInsight,
      totalCouples,
      totalSingle,
      totalSeats,
      totalGuests: guestList.length
    });
  } catch (err: any) {
    console.error('Gemini AI export error:', err);
    return res.status(500).json({ error: 'Failed to process AI CSV export' });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Aurelia Wedding Server running on port ${port} (http://0.0.0.0:${port})`);
  });

  server.on('error', (err: any) => {
    console.error('Server listen error:', err);
  });
}

startServer();

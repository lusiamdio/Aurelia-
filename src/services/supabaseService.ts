import { supabase } from '../lib/supabase';
import { EventDetail, GuestInvitation, SongRequest, WeddingData } from '../types/wedding';
import { INITIAL_WEDDING } from '../data/mockWedding';

const DEFAULT_WEDDING_ID = 'wed-aur-001';

// Held strictly in JS/React memory (never written to localStorage or sessionStorage)
let inMemoryAdminToken: string | null = null;

function isMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01' || msg.includes('could not find the table');
}

function mapEventFromRow(row: any): EventDetail {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    time: row.event_time,
    venue: row.venue,
    address: row.address,
    dressCode: row.dress_code,
    description: row.description || ''
  };
}

function mapSongFromRow(row: any): SongRequest {
  return {
    id: row.id,
    guestName: row.guest_name,
    songTitle: row.song_title,
    artist: row.artist,
    status: row.status || 'pending',
    notes: row.notes || undefined,
    djNotes: row.dj_notes || undefined,
    danceEnergy: row.dance_energy || 'high-energy',
    requestedAt: row.requested_at || undefined,
    votes: typeof row.votes === 'number' ? row.votes : 1
  };
}

function mapGuestFromRow(row: any): GuestInvitation {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    status: row.status || 'pending',
    eventsAttending: Array.isArray(row.events_attending) ? row.events_attending : [],
    attendanceType: row.attendance_type || (row.has_plus_one ? 'couple' : 'single'),
    hasPlusOne: Boolean(row.has_plus_one),
    plusOneName: row.plus_one_name || undefined,
    plusOneDietary: row.plus_one_dietary || undefined,
    plusOneStatus: row.plus_one_status || undefined,
    plusOneAllowed: Boolean(row.plus_one_allowed),
    dietaryRequirements: row.dietary_requirements || undefined,
    invitationSentVia: row.invitation_sent_via || 'download',
    invitationGeneratedAt: row.invitation_generated_at || '',
    checkedIn: Boolean(row.checked_in),
    checkedInAt: row.checked_in_at || undefined,
    notes: row.notes || undefined
  };
}

function mapGuestToRow(guest: GuestInvitation, weddingId = DEFAULT_WEDDING_ID) {
  return {
    id: guest.id,
    wedding_id: weddingId,
    full_name: guest.fullName,
    email: guest.email || null,
    phone: guest.phone || null,
    status: guest.status,
    events_attending: guest.eventsAttending || [],
    attendance_type: guest.attendanceType || (guest.hasPlusOne ? 'couple' : 'single'),
    has_plus_one: Boolean(guest.hasPlusOne),
    plus_one_name: guest.plusOneName || null,
    plus_one_dietary: guest.plusOneDietary || null,
    plus_one_status: guest.plusOneStatus || 'pending',
    plus_one_allowed: Boolean(guest.plusOneAllowed),
    dietary_requirements: guest.dietaryRequirements || null,
    invitation_sent_via: guest.invitationSentVia || 'download',
    invitation_generated_at:
      guest.invitationGeneratedAt || new Date().toISOString().replace('T', ' ').slice(0, 16),
    checked_in: Boolean(guest.checkedIn),
    checked_in_at: guest.checkedInAt || null,
    notes: guest.notes || null
  };
}

function mapWeddingFromRow(row: any, events: EventDetail[], songs: SongRequest[]): WeddingData {
  return {
    ...INITIAL_WEDDING,
    id: row.id || INITIAL_WEDDING.id,
    slug: row.slug || INITIAL_WEDDING.slug,
    customDomain: row.custom_domain || INITIAL_WEDDING.customDomain,
    partner1: row.partner1 || INITIAL_WEDDING.partner1,
    partner2: row.partner2 || INITIAL_WEDDING.partner2,
    date: row.display_date || INITIAL_WEDDING.date,
    rawDate: row.raw_date || INITIAL_WEDDING.rawDate,
    city: row.city || INITIAL_WEDDING.city,
    venue: row.venue || INITIAL_WEDDING.venue,
    headline: row.headline || INITIAL_WEDDING.headline,
    storyTitle: row.story_title || INITIAL_WEDDING.storyTitle,
    storyMessage: row.story_message || INITIAL_WEDDING.storyMessage,
    storyParagraphs:
      Array.isArray(row.story_paragraphs) && row.story_paragraphs.length > 0
        ? row.story_paragraphs
        : INITIAL_WEDDING.storyParagraphs,
    storyTimeline:
      Array.isArray(row.story_timeline) && row.story_timeline.length > 0
        ? row.story_timeline
        : INITIAL_WEDDING.storyTimeline,
    dressCodeSummary: row.dress_code_summary || INITIAL_WEDDING.dressCodeSummary,
    dressCodeChurch: row.dress_code_church || INITIAL_WEDDING.dressCodeChurch,
    dressCodeDining: row.dress_code_dining || INITIAL_WEDDING.dressCodeDining,
    scripture1: row.scripture1 ?? INITIAL_WEDDING.scripture1,
    scripture2: row.scripture2 ?? INITIAL_WEDDING.scripture2,
    heroImage: row.hero_image || INITIAL_WEDDING.heroImage,
    rsvpDeadline: row.rsvp_deadline || INITIAL_WEDDING.rsvpDeadline,
    giftRegistryUrl: row.gift_registry_url ?? INITIAL_WEDDING.giftRegistryUrl,
    invitationStyle: row.invitation_style || INITIAL_WEDDING.invitationStyle,
    foilAccent: row.foil_accent || INITIAL_WEDDING.foilAccent,
    paperTone: row.paper_tone || INITIAL_WEDDING.paperTone,
    monogram: row.monogram || INITIAL_WEDDING.monogram,
    cardOrientation: row.card_orientation || INITIAL_WEDDING.cardOrientation,
    selectedFontFamily: row.selected_font_family || INITIAL_WEDDING.selectedFontFamily,
    couplePhotoUrl: row.couple_photo_url || INITIAL_WEDDING.couplePhotoUrl,
    showPhotoOnCard: row.show_photo_on_card ?? INITIAL_WEDDING.showPhotoOnCard,
    photoFrameStyle: row.photo_frame_style || INITIAL_WEDDING.photoFrameStyle,
    decorativeGraphic: row.decorative_graphic || INITIAL_WEDDING.decorativeGraphic,
    waxSealStyle: row.wax_seal_style || INITIAL_WEDDING.waxSealStyle,
    customColors: row.custom_colors || INITIAL_WEDDING.customColors,
    events: events.length > 0 ? events : INITIAL_WEDDING.events,
    songRequests: songs
  };
}

// ============================================================================
// COUPLE ADMIN AUTHENTICATION (SERVER-VERIFIED BEARER SESSION)
// ============================================================================

export interface AuthResult {
  authenticated: boolean;
  requiresSetup?: boolean;
  error?: string;
}

export async function getCoupleAuthStatus(): Promise<{
  passcodeConfigured: boolean;
  requiresSetup: boolean;
}> {
  try {
    const res = await fetch('/api/auth/status');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return { passcodeConfigured: true, requiresSetup: false };
    }
    const data = await res.json();
    return {
      passcodeConfigured: Boolean(data.passcodeConfigured),
      requiresSetup: Boolean(data.requiresSetup)
    };
  } catch {
    return { passcodeConfigured: true, requiresSetup: false };
  }
}

export async function signInCoupleAdmin(
  coupleNames: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coupleNames: coupleNames.trim(),
        password
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') || res.status === 404 || res.status === 405 || res.status >= 500) {
      return {
        authenticated: false,
        error:
          'Authentication backend is not reachable on this deployment. Start the server with npm start and verify environment settings.'
      };
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.authenticated && data.accessToken) {
      inMemoryAdminToken = String(data.accessToken);
      return { authenticated: true };
    }

    return {
      authenticated: false,
      requiresSetup: Boolean(data.requiresSetup),
      error: data.error || 'Invalid couple credentials or password.'
    };
  } catch {
    return {
      authenticated: false,
      error: 'Unable to connect to authentication backend. Please try again.'
    };
  }
}

export async function claimCoupleAdminPasscode(
  coupleNames: string,
  password: string
): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coupleNames: coupleNames.trim(),
        password
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json') || res.status === 404 || res.status === 405 || res.status >= 500) {
      return {
        authenticated: false,
        error:
          'Authentication backend is not reachable on this deployment. Start the server with npm start.'
      };
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.authenticated && data.accessToken) {
      inMemoryAdminToken = String(data.accessToken);
      return { authenticated: true };
    }

    return {
      authenticated: false,
      error: data.error || 'Unable to complete initial setup.'
    };
  } catch {
    return {
      authenticated: false,
      error: 'Unable to connect to authentication backend. Please try again.'
    };
  }
}

export async function signOutAdminFromSupabase(): Promise<void> {
  inMemoryAdminToken = null;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  return inMemoryAdminToken;
}

export async function getCurrentAdminSession(): Promise<{
  isAdmin: boolean;
}> {
  if (!inMemoryAdminToken) return { isAdmin: false };
  try {
    const res = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${inMemoryAdminToken}` }
    });
    if (!res.ok) {
      inMemoryAdminToken = null;
      return { isAdmin: false };
    }
    return { isAdmin: true };
  } catch {
    return { isAdmin: false };
  }
}

// ============================================================================
// DATABASE CRUD OPERATIONS (SUPABASE PUBLIC + SERVER-GUARDED ADMIN API)
// ============================================================================

function adminAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(inMemoryAdminToken ? { Authorization: `Bearer ${inMemoryAdminToken}` } : {})
  };
}

export async function fetchWeddingFromSupabase(slug = 'samson-kevine'): Promise<{
  wedding: WeddingData | null;
  schemaMissing: boolean;
}> {
  const localPromise = fetch(
    `/api/public/wedding?weddingId=${encodeURIComponent(DEFAULT_WEDDING_ID)}`
  )
    .then(async (res) => (res.ok ? res.json() : null))
    .catch(() => null);

  let dbWeddingRow: any = null;
  let dbEventRows: any[] = [];
  let dbSongRows: any[] = [];
  let schemaMissing = false;

  if (supabase) {
    const { data: weddingRow, error: wErr } = await supabase
      .from('weddings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (wErr && isMissingTableError(wErr)) {
      schemaMissing = true;
    } else if (!wErr && weddingRow) {
      dbWeddingRow = weddingRow;
      const [{ data: eventRows }, { data: songRows }] = await Promise.all([
        supabase
          .from('wedding_events')
          .select('*')
          .eq('wedding_id', weddingRow.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('song_requests')
          .select('*')
          .eq('wedding_id', weddingRow.id)
          .order('created_at', { ascending: false })
      ]);
      dbEventRows = eventRows || [];
      dbSongRows = songRows || [];
    } else if (wErr) {
      console.warn('Error loading wedding from Supabase:', wErr.message);
    }
  } else {
    schemaMissing = true;
  }

  const localData = await localPromise;
  const deletedSongSet = new Set<string>(
    Array.isArray(localData?.deletedSongIds) ? localData.deletedSongIds : []
  );

  // Merge songs cleanly across Supabase + server store overrides
  const songMap = new Map<string, SongRequest>();
  for (const row of dbSongRows) {
    if (!deletedSongSet.has(row.id)) {
      songMap.set(row.id, mapSongFromRow(row));
    }
  }
  if (Array.isArray(localData?.songs)) {
    for (const row of localData.songs) {
      if (deletedSongSet.has(row.id)) continue;
      const existing = songMap.get(row.id);
      if (existing) {
        songMap.set(row.id, {
          ...existing,
          status: row.status ?? existing.status,
          djNotes: row.dj_notes ?? existing.djNotes,
          notes: row.notes ?? existing.notes,
          danceEnergy: row.dance_energy ?? existing.danceEnergy
        });
      } else if (row.song_title && row.artist) {
        songMap.set(row.id, mapSongFromRow(row));
      }
    }
  }
  const mergedSongs = Array.from(songMap.values());

  // If Supabase Admin privilege is active, Supabase row is authoritative;
  // otherwise prefer server-saved studio edits when present.
  const useLocalWeddingOverride =
    !localData?.hasSupabaseAdminPrivilege && Boolean(localData?.weddingPayload);

  const effectiveWeddingRow = useLocalWeddingOverride
    ? localData.weddingPayload
    : dbWeddingRow || localData?.weddingPayload || null;

  const effectiveEventRows =
    useLocalWeddingOverride && Array.isArray(localData?.eventRows) && localData.eventRows.length > 0
      ? localData.eventRows
      : dbEventRows.length > 0
      ? dbEventRows
      : Array.isArray(localData?.eventRows)
      ? localData.eventRows
      : [];

  if (effectiveWeddingRow) {
    return {
      wedding: mapWeddingFromRow(
        effectiveWeddingRow,
        effectiveEventRows.map(mapEventFromRow),
        mergedSongs
      ),
      schemaMissing
    };
  }

  if (mergedSongs.length > 0) {
    return {
      wedding: { ...INITIAL_WEDDING, songRequests: mergedSongs },
      schemaMissing
    };
  }

  return { wedding: null, schemaMissing };
}

export async function saveWeddingToSupabase(wedding: WeddingData): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  const weddingId = wedding.id || DEFAULT_WEDDING_ID;
  const weddingPayload = {
    id: weddingId,
    slug: wedding.slug,
    custom_domain: wedding.customDomain,
    partner1: wedding.partner1,
    partner2: wedding.partner2,
    display_date: wedding.date,
    raw_date: wedding.rawDate,
    city: wedding.city,
    venue: wedding.venue,
    headline: wedding.headline,
    story_title: wedding.storyTitle || 'BEAUTIFUL LOVE STORY',
    story_message: wedding.storyMessage,
    story_paragraphs: wedding.storyParagraphs || [],
    story_timeline: wedding.storyTimeline || [],
    dress_code_summary: wedding.dressCodeSummary,
    dress_code_church: wedding.dressCodeChurch || 'Vintage Wear',
    dress_code_dining: wedding.dressCodeDining || 'Gala Wear',
    scripture1: wedding.scripture1 || null,
    scripture2: wedding.scripture2 || null,
    hero_image: wedding.heroImage,
    rsvp_deadline: wedding.rsvpDeadline,
    gift_registry_url: wedding.giftRegistryUrl || null,
    invitation_style: wedding.invitationStyle,
    foil_accent: wedding.foilAccent,
    paper_tone: wedding.paperTone,
    monogram: wedding.monogram,
    card_orientation: wedding.cardOrientation,
    selected_font_family: wedding.selectedFontFamily,
    couple_photo_url: wedding.couplePhotoUrl || null,
    show_photo_on_card: wedding.showPhotoOnCard,
    photo_frame_style: wedding.photoFrameStyle,
    decorative_graphic: wedding.decorativeGraphic,
    wax_seal_style: wedding.waxSealStyle,
    custom_colors: wedding.customColors
  };

  const eventRows = (wedding.events || []).map((evt, idx) => ({
    id: evt.id,
    wedding_id: weddingId,
    title: evt.title,
    event_date: evt.date,
    event_time: evt.time,
    venue: evt.venue,
    address: evt.address,
    dress_code: evt.dressCode,
    description: evt.description || '',
    sort_order: idx + 1
  }));

  try {
    const res = await fetch('/api/admin/wedding', {
      method: 'PUT',
      headers: adminAuthHeaders(),
      body: JSON.stringify({ weddingPayload, eventRows })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'Failed to save wedding settings.' };
    return {};
  } catch (err: any) {
    return { error: err?.message || 'Network error saving wedding.' };
  }
}

export async function fetchGuestsFromSupabase(weddingId = DEFAULT_WEDDING_ID): Promise<{
  guests: GuestInvitation[] | null;
  error?: string;
}> {
  if (!inMemoryAdminToken) return { guests: null, error: 'Admin authentication required' };

  try {
    const res = await fetch(`/api/admin/guests?weddingId=${encodeURIComponent(weddingId)}`, {
      headers: adminAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.guests)) {
      return { guests: null, error: data.error };
    }
    return { guests: data.guests.map(mapGuestFromRow) };
  } catch (err: any) {
    return { guests: null, error: err?.message || 'Failed to load guests.' };
  }
}

export async function insertGuestToSupabase(
  guest: GuestInvitation,
  weddingId = DEFAULT_WEDDING_ID
): Promise<{ error?: string }> {
  const row = mapGuestToRow(guest, weddingId);

  if (inMemoryAdminToken) {
    try {
      const res = await fetch('/api/admin/guests', {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify(row)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error };
      return {};
    } catch (err: any) {
      return { error: err?.message };
    }
  }

  try {
    const res = await fetch('/api/public/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || 'Failed to register RSVP.' };
    return {};
  } catch (err: any) {
    if (supabase) {
      const { error } = await supabase.from('guest_invitations').insert(row);
      if (error) return { error: error.message };
      return {};
    }
    return { error: err?.message || 'Failed to register RSVP.' };
  }
}

export async function updateGuestInSupabase(
  guest: GuestInvitation,
  weddingId = DEFAULT_WEDDING_ID
): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  const row = mapGuestToRow(guest, weddingId);
  try {
    const res = await fetch(`/api/admin/guests/${encodeURIComponent(guest.id)}`, {
      method: 'PATCH',
      headers: adminAuthHeaders(),
      body: JSON.stringify(row)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    return { error: err?.message };
  }
}

export async function deleteGuestFromSupabase(guestId: string): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  try {
    const res = await fetch(`/api/admin/guests/${encodeURIComponent(guestId)}`, {
      method: 'DELETE',
      headers: adminAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    return { error: err?.message };
  }
}

export async function insertSongRequestToSupabase(
  song: SongRequest,
  weddingId = DEFAULT_WEDDING_ID
): Promise<{ error?: string }> {
  const row = {
    id: song.id,
    wedding_id: weddingId,
    guest_name: song.guestName,
    song_title: song.songTitle,
    artist: song.artist,
    status: song.status || 'pending',
    notes: song.notes || null,
    dj_notes: song.djNotes || null,
    dance_energy: song.danceEnergy || 'high-energy',
    requested_at: song.requestedAt || new Date().toISOString().slice(0, 10),
    votes: song.votes ?? 1
  };

  if (inMemoryAdminToken) {
    try {
      const res = await fetch('/api/admin/songs', {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify(row)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { error: data.error };
      return {};
    } catch (err: any) {
      return { error: err?.message };
    }
  }

  try {
    const res = await fetch('/api/public/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    if (supabase) {
      const { error } = await supabase.from('song_requests').insert(row);
      if (error) return { error: error.message };
      return {};
    }
    return { error: err?.message };
  }
}

export async function updateSongRequestInSupabase(song: SongRequest): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  try {
    const res = await fetch(`/api/admin/songs/${encodeURIComponent(song.id)}`, {
      method: 'PATCH',
      headers: adminAuthHeaders(),
      body: JSON.stringify({
        status: song.status || 'pending',
        dj_notes: song.djNotes || null,
        notes: song.notes || null,
        dance_energy: song.danceEnergy || 'high-energy'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    return { error: err?.message };
  }
}

export async function deleteSongRequestFromSupabase(songId: string): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  try {
    const res = await fetch(`/api/admin/songs/${encodeURIComponent(songId)}`, {
      method: 'DELETE',
      headers: adminAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    return { error: err?.message };
  }
}

export async function eraseWeddingDataFromSupabase(
  weddingId = DEFAULT_WEDDING_ID
): Promise<{ error?: string }> {
  if (!inMemoryAdminToken) return { error: 'Admin authentication required' };

  try {
    const res = await fetch(`/api/admin/erase/${encodeURIComponent(weddingId)}`, {
      method: 'DELETE',
      headers: adminAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error };
    return {};
  } catch (err: any) {
    return { error: err?.message };
  }
}

export type AdminSyncTopic = 'guests' | 'songs' | 'wedding';

export function subscribeToAdminRealTimeSync(
  weddingId: string,
  onSync: (topic: AdminSyncTopic) => void
): () => void {
  let isDisposed = false;
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connectStream = async () => {
    if (isDisposed || !inMemoryAdminToken) return;

    controller = new AbortController();
    try {
      const res = await fetch(
        `/api/admin/guests/stream?weddingId=${encodeURIComponent(weddingId)}`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${inMemoryAdminToken}`
          },
          cache: 'no-store',
          signal: controller.signal
        }
      );

      if (res.status === 401 || res.status === 403) {
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Stream status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!isDisposed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of frame.split(/\r?\n/)) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (eventName === 'rsvp_sync' && dataLines.length > 0) {
            try {
              const parsed = JSON.parse(dataLines.join('\n'));
              const topic: AdminSyncTopic =
                parsed?.topic === 'songs' || parsed?.topic === 'wedding'
                  ? parsed.topic
                  : 'guests';
              onSync(topic);
            } catch {
              onSync('guests');
            }
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Reconnect below unless aborted/disposed
    }

    if (!isDisposed && inMemoryAdminToken) {
      reconnectTimer = setTimeout(() => {
        void connectStream();
      }, 2500);
    }
  };

  void connectStream();

  // Attach Supabase Realtime postgres_changes listener if active
  const rtChannel = supabase
    ? supabase
        .channel(`admin-rsvp-sync-${weddingId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'guest_invitations',
            filter: `wedding_id=eq.${weddingId}`
          },
          () => onSync('guests')
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'song_requests',
            filter: `wedding_id=eq.${weddingId}`
          },
          () => onSync('songs')
        )
        .subscribe()
    : null;

  // Lightweight visibility-aware fallback consistency check
  const fallbackTimer = setInterval(() => {
    if (!isDisposed && document.visibilityState === 'visible') {
      onSync('guests');
    }
  }, 5000);

  return () => {
    isDisposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    clearInterval(fallbackTimer);
    if (controller) controller.abort();
    if (rtChannel && supabase) {
      void supabase.removeChannel(rtChannel);
    }
  };
}


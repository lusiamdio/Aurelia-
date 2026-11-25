import React, { useState, useEffect, useCallback } from 'react';
import { WeddingData, GuestInvitation, InvitationStyle, SongRequest } from './types/wedding';
import { INITIAL_WEDDING, INITIAL_GUESTS } from './data/mockWedding';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { InvitationCollections } from './components/InvitationCollections';
import { HowItWorks } from './components/HowItWorks';
import { LiveGenerator } from './components/LiveGenerator';
import { CoupleStudio } from './components/CoupleStudio';
import { CoupleDashboard } from './components/CoupleDashboard';
import { WeddingMicrosite } from './components/WeddingMicrosite';
import { EmailPreviewModal } from './components/EmailPreviewModal';
import { CoupleAuthModal } from './components/CoupleAuthModal';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';
import { Check } from 'lucide-react';
import {
  getCurrentAdminSession,
  signOutAdminFromSupabase,
  fetchWeddingFromSupabase,
  saveWeddingToSupabase,
  fetchGuestsFromSupabase,
  insertGuestToSupabase,
  updateGuestInSupabase,
  deleteGuestFromSupabase,
  insertSongRequestToSupabase,
  eraseWeddingDataFromSupabase
} from './services/supabaseService';

export default function App() {
  // Persistent Wedding Data (synced with Supabase & cached locally)
  const [wedding, setWedding] = useState<WeddingData>(() => {
    try {
      const saved = localStorage.getItem('aurelia_wedding_data_v4');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.partner1 === 'Samson Ilunga' && parsed.rawDate === '2026-12-20') {
          return parsed;
        }
      }
      localStorage.removeItem('aurelia_wedding_data');
      localStorage.removeItem('aurelia_wedding_data_v2');
      localStorage.removeItem('aurelia_wedding_data_v3');
    } catch {
      // fallback
    }
    return INITIAL_WEDDING;
  });

  // Guest Roster (fetched from Supabase when authenticated as Couple Admin)
  const [guests, setGuests] = useState<GuestInvitation[]>(INITIAL_GUESTS);

  // Role Gate verified via server Bearer session held in memory
  const [isCoupleAdmin, setIsCoupleAdmin] = useState<boolean>(false);

  // Active view: 'microsite' (default for guests) | 'landing' (Brand editorial) | 'studio' (Couple only) | 'dashboard' (Couple only)
  const [currentView, setCurrentView] = useState<'landing' | 'studio' | 'dashboard' | 'microsite'>('microsite');

  // Modal states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingTargetView, setPendingTargetView] = useState<'studio' | 'dashboard' | null>(null);
  const [emailPreviewGuest, setEmailPreviewGuest] = useState<GuestInvitation | null>(null);
  const [globalNotification, setGlobalNotification] = useState<string | null>(null);

  const showToast = useCallback((msg: string, duration = 3500) => {
    setGlobalNotification(msg);
    setTimeout(() => setGlobalNotification(null), duration);
  }, []);

  // Clean up any legacy client-side auth flags on startup & hydrate public wedding from Supabase
  useEffect(() => {
    try {
      sessionStorage.removeItem('aurelia_couple_admin');
      sessionStorage.removeItem('aurelia_couple_token');
      localStorage.removeItem('aurelia_guests_data');
      localStorage.removeItem('aurelia_guests_data_v2');
      localStorage.removeItem('aurelia_guests_data_v3');
      localStorage.removeItem('aurelia_guests_data_v4');
    } catch {
      // ignore
    }

    let isMounted = true;

    const initSupabaseData = async () => {
      const [{ wedding: dbWedding }, adminState] = await Promise.all([
        fetchWeddingFromSupabase('samson-kevine'),
        getCurrentAdminSession()
      ]);

      if (!isMounted) return;

      if (dbWedding) {
        setWedding(dbWedding);
      }

      if (adminState.isAdmin) {
        setIsCoupleAdmin(true);
        const weddingId = dbWedding?.id || wedding.id;
        const { guests: dbGuests } = await fetchGuestsFromSupabase(weddingId);
        if (isMounted && dbGuests) {
          setGuests(dbGuests);
        }
      }
    };

    void initSupabaseData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load latest guest roster whenever Couple Admin is unlocked or switching to Dashboard
  useEffect(() => {
    if (!isCoupleAdmin) return;
    let isMounted = true;
    const loadRoster = async () => {
      const { guests: dbGuests } = await fetchGuestsFromSupabase(wedding.id);
      if (isMounted && dbGuests) {
        setGuests(dbGuests);
      }
    };
    void loadRoster();
    return () => {
      isMounted = false;
    };
  }, [isCoupleAdmin, currentView, wedding.id]);

  // Cache wedding config locally for instant initial render
  useEffect(() => {
    try {
      localStorage.setItem('aurelia_wedding_data_v4', JSON.stringify(wedding));
    } catch {
      // ignore
    }
  }, [wedding]);

  // Role Protected Navigation Guard
  const handleNavigate = useCallback(
    (view: 'landing' | 'studio' | 'dashboard' | 'microsite') => {
      if ((view === 'studio' || view === 'dashboard') && !isCoupleAdmin) {
        setPendingTargetView(view);
        setShowAuthModal(true);
        return;
      }
      setCurrentView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [isCoupleAdmin]
  );

  // Handle URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('studio')) {
        handleNavigate('studio');
      } else if (hash.includes('dashboard') || hash.includes('rsvp')) {
        handleNavigate('dashboard');
      } else if (hash.includes('microsite') || hash.includes('portal') || hash.includes('wedding')) {
        setCurrentView('microsite');
      } else if (hash.includes('landing') || hash.includes('home')) {
        setCurrentView('landing');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [handleNavigate]);

  const handleAuthenticated = async () => {
    setIsCoupleAdmin(true);
    const { guests: dbGuests } = await fetchGuestsFromSupabase(wedding.id);
    if (dbGuests) {
      setGuests(dbGuests);
    }
    const dest = pendingTargetView || 'dashboard';
    setCurrentView(dest);
    setPendingTargetView(null);
    showToast(`Welcome, ${wedding.partner1} & ${wedding.partner2}! Couple Admin access unlocked.`, 4000);
  };

  const handleLogoutAdmin = async () => {
    await signOutAdminFromSupabase();
    setIsCoupleAdmin(false);
    setGuests([]);
    setCurrentView('microsite');
    showToast('Signed out of Couple Admin. Showing guest view.', 3000);
  };

  // Complete Microsite & Data Erasure Right (GDPR / POPIA compliant)
  const handleDeleteMicrositeAndData = async () => {
    if (isCoupleAdmin) {
      await eraseWeddingDataFromSupabase(wedding.id);
      await saveWeddingToSupabase(INITIAL_WEDDING);
      await signOutAdminFromSupabase();
    }
    try {
      localStorage.removeItem('aurelia_wedding_data');
      localStorage.removeItem('aurelia_wedding_data_v4');
      localStorage.removeItem('aurelia_guests_data');
      localStorage.removeItem('aurelia_guests_data_v4');
    } catch {
      // ignore
    }
    setIsCoupleAdmin(false);
    setWedding(INITIAL_WEDDING);
    setGuests(INITIAL_GUESTS);
    setCurrentView('microsite');
    showToast(
      'Your wedding microsite, stationery designs, guest registry, and DJ song requests have been permanently erased.',
      6000
    );
  };

  const handleUpdateWedding = async (updated: WeddingData) => {
    setWedding(updated);
    if (isCoupleAdmin) {
      const res = await saveWeddingToSupabase(updated);
      if (res.error) {
        showToast(`Saved locally. Sync note: ${res.error}`, 4500);
      }
    }
  };

  const handleGuestRegistered = async (newGuest: GuestInvitation) => {
    setGuests((prev) => {
      const existingIdx = prev.findIndex((g) => g.id === newGuest.id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = newGuest;
        return copy;
      }
      return [newGuest, ...prev];
    });

    const res = await insertGuestToSupabase(newGuest, wedding.id);
    if (res.error) {
      console.warn('RSVP sync note:', res.error);
      showToast(`RSVP saved in session (${newGuest.fullName}).`, 3500);
    } else {
      showToast(`RSVP registered for ${newGuest.fullName} (Pass ID: ${newGuest.id}).`, 4000);
    }
  };

  const handleUpdateGuestsFromDashboard = async (updatedGuests: GuestInvitation[]) => {
    const prevMap = new Map(guests.map((g) => [g.id, g]));
    const nextMap = new Map(updatedGuests.map((g) => [g.id, g]));
    setGuests(updatedGuests);

    if (!isCoupleAdmin) return;

    for (const prevGuest of guests) {
      if (!nextMap.has(prevGuest.id)) {
        const res = await deleteGuestFromSupabase(prevGuest.id);
        if (res.error) console.warn('Supabase guest delete error:', res.error);
      }
    }

    for (const nextGuest of updatedGuests) {
      const prevGuest = prevMap.get(nextGuest.id);
      if (!prevGuest) {
        const res = await insertGuestToSupabase(nextGuest, wedding.id);
        if (res.error) console.warn('Supabase guest insert error:', res.error);
      } else if (JSON.stringify(prevGuest) !== JSON.stringify(nextGuest)) {
        const res = await updateGuestInSupabase(nextGuest, wedding.id);
        if (res.error) console.warn('Supabase guest update error:', res.error);
      }
    }
  };

  const handleSongRequested = async (song: SongRequest) => {
    setWedding((prev) => ({
      ...prev,
      songRequests: [song, ...(prev.songRequests || [])]
    }));
    const res = await insertSongRequestToSupabase(song, wedding.id);
    if (res.error) {
      console.warn('Supabase song insert note:', res.error);
    }
    showToast(`Song request "${song.songTitle}" sent to couple's DJ registry!`);
  };

  const handleSelectStyle = (styleId: InvitationStyle) => {
    const nextWedding = { ...wedding, invitationStyle: styleId };
    setWedding(nextWedding);
    if (isCoupleAdmin) {
      void saveWeddingToSupabase(nextWedding);
    }
  };

  const handleJumpToGenerator = (styleId: InvitationStyle) => {
    handleSelectStyle(styleId);
    if (currentView !== 'landing') setCurrentView('landing');
    setTimeout(() => {
      document.getElementById('generate-invitation')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const handleExploreClick = () => {
    if (currentView !== 'landing') setCurrentView('landing');
    setTimeout(() => {
      document.getElementById('invitation-designs')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  const partnerFirstNames = `${wedding.partner1.split(' ')[0]} & ${wedding.partner2.split(' ')[0]}`;

  return (
    <div className="min-h-screen bg-[#F3EDE2] text-[#292722] flex flex-col font-sans-ui selection:bg-[#B59A72]/20">
      {/* Top Navbar — Hidden on Wedding Microsite */}
      {currentView !== 'microsite' && (
        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenCreate={() => handleNavigate('studio')}
          isCoupleAdmin={isCoupleAdmin}
          onOpenCoupleLogin={() => {
            setPendingTargetView('studio');
            setShowAuthModal(true);
          }}
          onLogoutAdmin={handleLogoutAdmin}
          partnerNames={partnerFirstNames}
        />
      )}

      {/* Global Status Banner / Notification */}
      {globalNotification && (
        <div className="bg-[#1C1B18] text-[#FAF7F0] px-4 py-2 text-xs flex items-center justify-center gap-2 shadow-md">
          <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{globalNotification}</span>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {/* VIEW 1: DEDICATED COUPLE MICROSITE (Default for guests) */}
        {currentView === 'microsite' && (
          <WeddingMicrosite
            wedding={wedding}
            onBackToApp={() => setCurrentView('landing')}
            onGuestRegistered={handleGuestRegistered}
            isCoupleAdmin={isCoupleAdmin}
            onOpenCoupleLogin={() => {
              setPendingTargetView('dashboard');
              setShowAuthModal(true);
            }}
            onOpenDashboard={() => handleNavigate('dashboard')}
            onLogoutAdmin={handleLogoutAdmin}
            onSongRequested={handleSongRequested}
          />
        )}

        {/* VIEW 2: EDITORIAL BRAND LANDING PAGE */}
        {currentView === 'landing' && (
          <>
            <HeroSection
              onCreateClick={() => handleNavigate('studio')}
              onExploreClick={handleExploreClick}
            />

            <InvitationCollections
              currentStyle={wedding.invitationStyle}
              onSelectStyle={handleSelectStyle}
              onOpenStudio={() => handleNavigate('studio')}
              onJumpToGenerator={handleJumpToGenerator}
            />

            <HowItWorks onCreateClick={() => handleNavigate('studio')} />

            <LiveGenerator
              wedding={wedding}
              onGuestRegistered={handleGuestRegistered}
              onOpenEmailPreview={(guest) => setEmailPreviewGuest(guest)}
            />

            <FinalCTA
              onCreateClick={() => handleNavigate('studio')}
              onExploreClick={handleExploreClick}
            />
          </>
        )}

        {/* VIEW 3: COUPLE STUDIO & ATELIER (Couple Admin Only) */}
        {currentView === 'studio' && isCoupleAdmin && (
          <CoupleStudio
            wedding={wedding}
            onUpdateWedding={handleUpdateWedding}
            onClose={() => setCurrentView('microsite')}
            onOpenMicrosite={() => setCurrentView('microsite')}
            onOpenDashboard={() => handleNavigate('dashboard')}
            onDeleteMicrosite={handleDeleteMicrositeAndData}
          />
        )}

        {/* VIEW 4: COUPLE DASHBOARD, RSVPs & DJ PLAYLIST (Couple Admin Only) */}
        {currentView === 'dashboard' && isCoupleAdmin && (
          <CoupleDashboard
            wedding={wedding}
            guests={guests}
            onUpdateGuests={handleUpdateGuestsFromDashboard}
            onUpdateWedding={handleUpdateWedding}
            onClose={() => setCurrentView('microsite')}
            onOpenStudio={() => handleNavigate('studio')}
            onDeleteMicrosite={handleDeleteMicrositeAndData}
          />
        )}
      </main>

      {/* Global Footer (shown on landing and studio/dashboard) */}
      {currentView !== 'microsite' && (
        <Footer
          onNavigate={handleNavigate}
        />
      )}

      {/* Couple Authentication Gate Modal */}
      <CoupleAuthModal
        wedding={wedding}
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={handleAuthenticated}
      />

      {/* Email Delivery Preview Modal */}
      {emailPreviewGuest && (
        <EmailPreviewModal
          wedding={wedding}
          guest={emailPreviewGuest}
          onClose={() => setEmailPreviewGuest(null)}
        />
      )}
    </div>
  );
}

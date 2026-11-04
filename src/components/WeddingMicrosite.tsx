import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WeddingData, GuestInvitation, LoveStoryMoment, SongRequest } from '../types/wedding';
import { InvitationCardPreview } from './InvitationCardPreview';
import {
  Calendar,
  MapPin,
  Clock,
  Heart,
  Sparkles,
  ArrowLeft,
  Download,
  MessageSquare,
  Check,
  ChevronLeft,
  ChevronRight,
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ExternalLink,
  Gift,
  HelpCircle,
  Crown
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface WeddingMicrositeProps {
  wedding: WeddingData;
  onBackToApp: () => void;
  onGuestRegistered: (guest: GuestInvitation) => void;
  onSongRequested?: (song: SongRequest) => void;
}

const MICROSITE_SLIDES = [
  {
    id: 'slide-garden',
    title: 'Garden Romance',
    quote: 'Every love story deserves a beautiful beginning.',
    image: '/src/assets/images/hero_garden_romance_1793530329497.jpg'
  },
  {
    id: 'slide-golden',
    title: 'Golden Hour Vows',
    quote: 'A moment worth celebrating forever.',
    image: '/src/assets/images/hero_golden_hour_1793530329379.jpg'
  },
  {
    id: 'slide-grand',
    title: 'Timeless Elegance',
    quote: 'Make your special day unforgettable.',
    image: '/src/assets/images/hero_timeless_elegance_1793530427405.jpg'
  }
];

export const WeddingMicrosite: React.FC<WeddingMicrositeProps> = ({
  wedding,
  onBackToApp,
  onGuestRegistered,
  onSongRequested
}) => {
  // Carousel State
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [carouselProgress, setCarouselProgress] = useState(0);

  // Audio Atmosphere State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Countdown timer to wedding date
  const [timeLeft, setTimeLeft] = useState({ days: 138, hours: 14, minutes: 22, seconds: 40 });

  // Guest invitation modal / inline generator state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [hasPlusOne, setHasPlusOne] = useState(false);
  const [plusOneName, setPlusOneName] = useState('');
  const [plusOneDietary, setPlusOneDietary] = useState('');
  const [dietary, setDietary] = useState('');
  const [attendance, setAttendance] = useState<'attending' | 'declined'>('attending');
  const [generatedPass, setGeneratedPass] = useState<GuestInvitation | null>(null);
  const [showRsvpModal, setShowRsvpModal] = useState(false);

  // Song Requests state (starts empty)
  const [songList, setSongList] = useState<SongRequest[]>(
    wedding.songRequests || []
  );
  const [newSongTitle, setNewSongTitle] = useState('');
  const [newSongArtist, setNewSongArtist] = useState('');
  const [newSongGuest, setNewSongGuest] = useState('');
  const [songToast, setSongToast] = useState(false);

  // Active FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Touch handling for mobile swipe
  const touchStartX = useRef<number | null>(null);

  const nextSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev + 1) % MICROSITE_SLIDES.length);
    setCarouselProgress(0);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev - 1 + MICROSITE_SLIDES.length) % MICROSITE_SLIDES.length);
    setCarouselProgress(0);
  }, []);

  // 7-second auto-transition
  useEffect(() => {
    if (isCarouselPaused) return;
    const intervalTime = 100;
    const step = (intervalTime / 7000) * 100;

    const timer = setInterval(() => {
      setCarouselProgress((prev) => {
        if (prev >= 100) {
          nextSlide();
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isCarouselPaused, nextSlide]);

  // Dynamic live countdown timer to wedding date
  useEffect(() => {
    const calculateTime = () => {
      const targetStr = `${wedding.rawDate || '2026-12-20'}T13:00:00`;
      const targetDate = new Date(targetStr).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, targetDate - now);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      return { days, hours, minutes, seconds };
    };

    setTimeLeft(calculateTime());
    const timer = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);
    return () => clearInterval(timer);
  }, [wedding.rawDate]);

  const handleGenerateOnMicrosite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    const guestId = `AUR-${Math.floor(1000 + Math.random() * 9000)}`;
    const guest: GuestInvitation = {
      id: guestId,
      fullName: guestName.trim(),
      email: guestEmail.trim(),
      status: attendance,
      eventsAttending: wedding.events.map((e) => e.id),
      hasPlusOne,
      plusOneName: hasPlusOne ? plusOneName.trim() : undefined,
      plusOneDietary: hasPlusOne ? plusOneDietary.trim() : undefined,
      plusOneStatus: hasPlusOne ? 'pending' : undefined,
      plusOneAllowed: true,
      dietaryRequirements: dietary.trim(),
      invitationGeneratedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      checkedIn: false
    };

    setGeneratedPass(guest);
    onGuestRegistered(guest);

    try {
      confetti({
        particleCount: 65,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#B59A72', '#D4AF37', '#FAF7F0', '#292722']
      });
    } catch {
      // ignore
    }
  };

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSongTitle.trim() || !newSongArtist.trim()) return;

    const newSong: SongRequest = {
      id: `song-${Date.now()}`,
      songTitle: newSongTitle.trim(),
      artist: newSongArtist.trim(),
      guestName: newSongGuest.trim() || 'A Wedding Guest',
      status: 'pending',
      danceEnergy: 'high-energy'
    };

    setSongList([newSong, ...songList]);
    if (onSongRequested) {
      onSongRequested(newSong);
    }
    setNewSongTitle('');
    setNewSongArtist('');
    setNewSongGuest('');
    setSongToast(true);
    setTimeout(() => setSongToast(false), 3000);
  };

  const currentSlide = MICROSITE_SLIDES[currentSlideIndex];

  return (
    <div className="min-h-screen bg-[#F3EDE2] text-[#292722] selection:bg-[#B59A72]/20">
      {/* Top Floating Microsite Administrative Bar */}
      <div className="sticky top-0 z-50 bg-[#1C1B18]/90 text-[#FAF7F0] backdrop-blur-md text-xs py-2.5 px-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToApp}
            className="flex items-center gap-1.5 text-[#D4AF37] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[11px]">Back to Aurelia Studio</span>
          </button>
          <span className="opacity-30">|</span>
          <span className="font-mono text-[11px] text-[#D4AF37] hidden sm:inline">
            https://{wedding.customDomain || 'sarahandjames.wedding'}
          </span>
        </div>

        {/* Floating Celebration Atmosphere Music Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
            className={`px-3 py-1 rounded-xs border text-[11px] transition-all flex items-center gap-1.5 ${
              isPlayingAudio
                ? 'bg-[#D4AF37] text-[#1C1B18] border-[#D4AF37] font-semibold'
                : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
            }`}
          >
            {isPlayingAudio ? (
              <>
                <Volume2 className="w-3 h-3 animate-pulse text-[#1C1B18]" />
                <span className="hidden sm:inline">Vivaldi Spring: Playing</span>
                <span className="sm:hidden">Playing</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3 h-3 text-white/60" />
                <span className="hidden sm:inline">Celebration Music</span>
                <span className="sm:hidden">Music</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 1. CINEMATIC FULL-SCREEN HERO CAROUSEL */}
      <section
        className="relative w-full min-h-[92vh] flex items-center justify-center overflow-hidden bg-[#1C1B18] text-white"
        onMouseEnter={() => setIsCarouselPaused(true)}
        onMouseLeave={() => setIsCarouselPaused(false)}
        onTouchStart={(e) => {
          touchStartX.current = e.targetTouches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const endX = e.changedTouches[0].clientX;
          if (touchStartX.current - endX > 50) nextSlide();
          else if (endX - touchStartX.current > 50) prevSlide();
          touchStartX.current = null;
        }}
      >
        {/* Background Slides */}
        <div className="absolute inset-0 z-0">
          {MICROSITE_SLIDES.map((slide, idx) => {
            const isActive = idx === currentSlideIndex;
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1500 ease-in-out ${
                  isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <img
                  src={slide.image}
                  alt={slide.title}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover object-center transition-transform duration-10000 ease-out ${
                    isActive ? 'scale-105' : 'scale-100'
                  }`}
                />
              </div>
            );
          })}

          {/* Measured Contrast Scrims */}
          <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#1C1B18]/90 via-[#1C1B18]/50 to-[#1C1B18]/40 pointer-events-none" />
          <div className="absolute inset-0 z-20 bg-radial from-transparent via-[#1C1B18]/30 to-[#1C1B18]/70 pointer-events-none" />
        </div>

        {/* Hero Content Overlay (No Boxed Cards) */}
        <div className="relative z-30 max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center flex flex-col items-center">
          {/* Couple Monogram Crest */}
          <div className="w-12 h-12 rounded-full border border-[#D4AF37]/60 flex items-center justify-center mb-4 text-[#D4AF37] backdrop-blur-xs">
            <span className="font-editorial text-lg italic">{wedding.monogram}</span>
          </div>

          <p className="text-xs sm:text-sm font-editorial tracking-[0.35em] uppercase text-[#D4AF37] font-semibold mb-3">
            Celebration of Love
          </p>

          <h1 className="font-editorial text-5xl sm:text-6xl lg:text-7xl font-normal leading-tight tracking-tight text-[#FAF7F0] drop-shadow-md">
            Samson Ilunga
            <span className="block italic text-3xl sm:text-4xl my-2 text-[#D4AF37] font-light">
              &amp;
            </span>
            Kevine Bonganga
          </h1>

          <p className="font-editorial italic text-sm sm:text-base text-[#D4AF37] mt-3 tracking-wide max-w-xl mx-auto drop-shadow-xs">
            &ldquo;Therefore what God has joined together, let no one separate.&rdquo; — Mark 10:9
          </p>

          <p className="font-editorial text-base sm:text-lg text-[#F3EDE2]/90 mt-1 tracking-wide">
            Saturday, 20 March 2027 · Cape Town, Western Cape
          </p>

          {/* Live Countdown Timer */}
          <div className="mt-8 flex items-center justify-center gap-3 sm:gap-6 text-center">
            {[
              { val: timeLeft.days, label: 'Days' },
              { val: timeLeft.hours, label: 'Hours' },
              { val: timeLeft.minutes, label: 'Mins' },
              { val: timeLeft.seconds, label: 'Secs' }
            ].map((unit) => (
              <div
                key={unit.label}
                className="bg-[#1C1B18]/70 backdrop-blur-md px-3 sm:px-4 py-2.5 rounded-xs border border-white/20 min-w-[62px] sm:min-w-[72px]"
              >
                <div className="font-editorial text-2xl sm:text-3xl font-normal tabular-nums text-[#FAF7F0]">
                  {unit.val}
                </div>
                <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-[#D4AF37]">
                  {unit.label}
                </div>
              </div>
            ))}
          </div>

          {/* Call to Actions */}
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => {
                document.getElementById('microsite-rsvp-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-3.5 bg-[#D4AF37] hover:bg-[#8C6D45] text-[#1C1B18] hover:text-white text-xs font-semibold tracking-[0.18em] uppercase rounded-xs transition-colors shadow-xl"
            >
              Generate Your Guest Pass &amp; RSVP
            </button>
            <button
              onClick={() => {
                document.getElementById('microsite-itinerary')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-[#FAF7F0] backdrop-blur-md border border-white/30 text-xs font-semibold tracking-[0.16em] uppercase rounded-xs transition-colors"
            >
              Celebration Itinerary ↓
            </button>
          </div>
        </div>

        {/* Carousel Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-xs border border-white/20 flex items-center justify-center transition-transform hover:scale-105"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-xs border border-white/20 flex items-center justify-center transition-transform hover:scale-105"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Carousel Progress Line */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex items-center justify-center gap-3">
          {MICROSITE_SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => {
                setCurrentSlideIndex(idx);
                setCarouselProgress(0);
              }}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: idx === currentSlideIndex ? '48px' : '16px',
                backgroundColor: idx === currentSlideIndex ? '#D4AF37' : 'rgba(255,255,255,0.3)'
              }}
            />
          ))}
        </div>
      </section>

      {/* 2. LOVE STORY CHAPTERS & INTERACTIVE TIMELINE */}
      <section className="py-20 lg:py-28 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Heart className="w-5 h-5 text-[#8C6D45] mx-auto mb-2" />
          <p className="text-xs font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold mb-2">
            The Journey to Forever
          </p>
          <h2 className="font-editorial text-3xl sm:text-4xl lg:text-5xl text-[#292722] font-normal tracking-wide">
            BEAUTIFUL LOVE STORY
          </h2>
        </div>

        {/* Editorial Love Letter Presentation */}
        <div className="bg-[#FAF7F0] rounded-sm border-2 border-[#B59A72]/40 p-8 sm:p-12 mb-12 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-radial from-[#D4AF37]/15 to-transparent pointer-events-none" />
          <div className="max-w-2xl mx-auto text-center space-y-4 font-editorial text-base sm:text-lg text-[#292722] leading-relaxed">
            <p className="text-xl sm:text-2xl text-[#8C6D45] italic font-normal">
              Everything began unexpectedly…
            </p>
            <p className="text-[#3E3A33]">
              A meeting, a glance, a simple exchange, and since then, everything has changed.
            </p>
            <p className="text-[#3E3A33]">
              We have shared laughter, dreams, challenges, and so many other precious moments.
            </p>
            <p className="text-[#292722] font-medium pt-2">
              Today, we are writing the most beautiful chapter of our lives, and we would love to share it with you.
            </p>
            <p className="text-[#8C6D45] font-semibold pt-1">
              Your presence means so much to us on this very special day!
            </p>
            <p className="pt-3 text-[#292722] font-editorial italic text-lg sm:text-xl border-t border-[#B59A72]/30 inline-block">
              With all our love and our most sincere gratitude.
            </p>
            <div className="pt-2">
              <span className="text-xs font-mono uppercase tracking-[0.25em] text-[#8C6D45] font-bold block">
                Samson &amp; Kevine
              </span>
            </div>
          </div>
        </div>

        {/* Chapter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {(wedding.storyTimeline || []).map((moment, idx) => (
            <div
              key={moment.year}
              className="bg-[#FAF7F0] rounded-sm border border-[#B59A72]/30 overflow-hidden shadow-xs hover:border-[#8C6D45] transition-colors flex flex-col justify-between"
            >
              {moment.image && (
                <div className="aspect-16/9 overflow-hidden bg-neutral-200">
                  <img
                    src={moment.image}
                    alt={moment.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                </div>
              )}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#8C6D45] font-mono mb-1">
                    <span>MOMENT 0{idx + 1}</span>
                    <span className="font-semibold text-sm">{moment.year}</span>
                  </div>
                  <h3 className="font-editorial text-2xl text-[#292722] mb-1">
                    {moment.title}
                  </h3>
                  <span className="text-[11px] text-[#8C6D45] block mb-3 font-medium">
                    {moment.location}
                  </span>
                  <p className="text-xs text-[#5A554E] leading-relaxed">
                    {moment.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. DRESS CODE & PALETTE GUIDE */}
      <section className="py-16 bg-[#EFEAE2]/60 border-y border-[#B59A72]/20 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <span className="text-xs uppercase tracking-[0.25em] text-[#8C6D45] font-semibold block mb-2">
            Wedding Attire &amp; Mood
          </span>
          <h3 className="font-editorial text-3xl sm:text-4xl text-[#292722] mb-3">
            Dress Code
          </h3>
          <p className="text-sm text-[#5A554E] max-w-xl mx-auto leading-relaxed mb-8">
            We kindly invite our esteemed guests to celebrate in attire tailored for each memorable moment.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-8">
            {/* Church Ceremony */}
            <div className="bg-[#FAF7F0] p-6 rounded-sm border border-[#B59A72]/40 shadow-xs text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-[#8C6D45]/15 text-[#8C6D45] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8C6D45] font-mono block">
                    Benediction · 13:00
                  </span>
                  <h4 className="font-editorial text-xl text-[#292722]">Church Ceremony</h4>
                </div>
              </div>
              <div className="pt-3 border-t border-[#B59A72]/20">
                <p className="text-xs font-editorial uppercase tracking-wider text-[#8C6D45] font-bold">
                  Attire: Vintage Wear
                </p>
                <p className="text-xs text-[#5A554E] mt-1.5 leading-relaxed">
                  Tailored retro suits, classic modest silhouettes, heritage accessories, vintage hats, and timeless mid-century elegance.
                </p>
              </div>
            </div>

            {/* Dinning Ceremony */}
            <div className="bg-[#FAF7F0] p-6 rounded-sm border border-[#B59A72]/40 shadow-xs text-left">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-[#292722] text-[#D4AF37] flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#8C6D45] font-mono block">
                    Reception · 18:00 to 21:00
                  </span>
                  <h4 className="font-editorial text-xl text-[#292722]">Dinning Ceremony</h4>
                </div>
              </div>
              <div className="pt-3 border-t border-[#B59A72]/20">
                <p className="text-xs font-editorial uppercase tracking-wider text-[#292722] font-bold">
                  Attire: Gala Wear
                </p>
                <p className="text-xs text-[#5A554E] mt-1.5 leading-relaxed">
                  Glamorous floor-length evening gowns, bespoke tuxedos, dinner suits, sparkling couture, and high-fashion celebration wear.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
            {[
              { name: 'Vintage Cream', color: '#F3EDE2' },
              { name: 'Warm Gold', color: '#B59A72' },
              { name: 'Gala Midnight', color: '#1C1B18' },
              { name: 'Champagne Ochre', color: '#D4AF37' },
              { name: 'Heritage Charcoal', color: '#292722' }
            ].map((swatch) => (
              <div key={swatch.name} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-8 h-8 rounded-full border border-black/10 shadow-xs"
                  style={{ backgroundColor: swatch.color }}
                />
                <span className="text-[10px] text-neutral-600 uppercase tracking-wider">
                  {swatch.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. MULTI-EVENT SCHEDULE & ITINERARY */}
      <section id="microsite-itinerary" className="py-20 lg:py-28 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          {/* Top Scripture */}
          <div className="inline-block px-5 py-2 rounded-full bg-[#8C6D45]/10 border border-[#8C6D45]/30 mb-3 shadow-xs">
            <span className="font-editorial italic text-xs sm:text-sm text-[#8C6D45] font-semibold">
              &ldquo;Therefore what God has joined together, let no one separate.&rdquo; — Mark 10:9
            </span>
          </div>

          <h2 className="font-editorial text-3xl sm:text-4xl lg:text-5xl text-[#292722] font-normal tracking-wide">
            Wedding Agenda
          </h2>
          <p className="text-xs text-neutral-600 mt-2 font-mono uppercase tracking-widest">
            {wedding.city} · {wedding.date}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {wedding.events.map((evt, idx) => (
            <div
              key={evt.id}
              className="bg-[#FAF7F0] p-6 sm:p-8 rounded-sm border-2 border-[#B59A72]/40 shadow-xs flex flex-col justify-between relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono text-[#8C6D45] uppercase tracking-wider">
                    {idx === 0 ? 'Ceremony 01' : 'Reception 02'}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#8C6D45]/15 text-[#8C6D45] font-semibold">
                    {evt.dressCode}
                  </span>
                </div>
                <h3 className="font-editorial text-2xl sm:text-3xl text-[#292722] mb-3">
                  {evt.title}
                </h3>
                <div className="space-y-2 text-xs text-neutral-700 mb-4 bg-white/60 p-3.5 rounded-xs border border-[#B59A72]/20">
                  <div className="flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#8C6D45] mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-[#292722] block">Time: {evt.time}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#8C6D45] mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-[#292722] block">{evt.venue}</span>
                      <span className="text-neutral-600 block mt-0.5 text-[11px]">Address: {evt.address}</span>
                    </div>
                  </div>
                </div>
                <p className="font-editorial italic text-xs text-[#8C6D45] border-t border-[#B59A72]/20 pt-3">
                  &ldquo;{evt.description}&rdquo;
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#B59A72]/15 flex items-center justify-between text-[11px]">
                <span className="text-neutral-500 font-medium">Attire: <strong className="text-[#292722]">{evt.dressCode}</strong></span>
                <a
                  href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                    `Samson & Kevine Wedding: ${evt.title}`
                  )}&details=${encodeURIComponent(evt.description)}&location=${encodeURIComponent(`${evt.venue}, ${evt.address}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#8C6D45] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Add to Google Cal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Scripture Quote Banner */}
        <div className="text-center max-w-2xl mx-auto p-5 sm:p-6 rounded-xs bg-[#FAF7F0] border border-[#B59A72]/40 shadow-xs">
          <p className="font-editorial italic text-base sm:text-lg text-[#292722]">
            &ldquo;I will restore to you the years that the swarming locust has eaten.&rdquo;
          </p>
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#8C6D45] font-semibold block mt-1.5">
            — Joel 2:25
          </span>
        </div>
      </section>

      {/* 5. GUEST INVITATION PASS & RSVP SECTION (WITH PLUS-ONE MANAGEMENT) */}
      <section id="microsite-rsvp-section" className="py-20 bg-[#FAF7F0] border-y border-[#B59A72]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold mb-2">
              Personalized Guest Concierge
            </p>
            <h2 className="font-editorial text-3xl sm:text-4xl lg:text-5xl text-[#292722]">
              Generate Your Guest Pass &amp; RSVP
            </h2>
            <p className="text-xs text-neutral-600 mt-2">
              Kindly confirm your attendance before {wedding.rsvpDeadline}
            </p>
          </div>

          {/* 3-Column Flanked Layout: Woman on Left | Form in Center | Man on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Woman / Bride Portrait */}
            <div className="hidden lg:flex lg:col-span-3 flex-col items-center text-center">
              <div className="w-full max-w-[220px] aspect-3/4 rounded-t-full overflow-hidden border-2 border-[#B59A72]/40 shadow-xl bg-neutral-100 group relative">
                <img
                  src="/src/assets/images/concierge_bride_portrait_1793535647180.jpg"
                  alt={`The Bride - ${wedding.partner2}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 border border-white/20 pointer-events-none rounded-t-full" />
              </div>
              <div className="mt-3">
                <span className="text-[10px] font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold block">
                  The Bride
                </span>
                <h3 className="font-editorial text-xl text-[#292722] mt-0.5">
                  {wedding.partner2}
                </h3>
                <span className="text-[10px] font-editorial italic text-neutral-500">
                  &ldquo;We cannot wait to celebrate together!&rdquo;
                </span>
              </div>
            </div>

            {/* Center Column: Form & Live Pass Generator */}
            <div className="lg:col-span-6 w-full">
              {/* Mobile Pair Avatars (visible on small screens) */}
              <div className="flex lg:hidden items-center justify-center gap-4 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#B59A72]/40 shadow-xs">
                    <img
                      src="/src/assets/images/concierge_bride_portrait_1793535647180.jpg"
                      alt="Bride"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs font-editorial font-medium">{wedding.partner2}</span>
                </div>
                <span className="font-editorial italic text-[#8C6D45]">&amp;</span>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#B59A72]/40 shadow-xs">
                    <img
                      src="/src/assets/images/concierge_groom_portrait_1793535647794.jpg"
                      alt="Groom"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs font-editorial font-medium">{wedding.partner1}</span>
                </div>
              </div>

              <div className="bg-white p-6 sm:p-10 rounded-sm border border-[#B59A72]/40 shadow-lg">
            {generatedPass ? (
              <div className="text-center space-y-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-editorial text-3xl text-[#292722]">
                    Welcome, {generatedPass.fullName}!
                  </h3>
                  <p className="text-xs text-neutral-600 mt-1">
                    Your personalized invitation pass (ID: {generatedPass.id}) has been created with venue admission QR code.
                  </p>
                </div>

                <div className="max-w-md mx-auto">
                  <InvitationCardPreview
                    wedding={wedding}
                    guestName={generatedPass.fullName}
                    guestId={generatedPass.id}
                    hasPlusOne={generatedPass.hasPlusOne}
                    plusOneName={generatedPass.plusOneName}
                    plusOneStatus={generatedPass.plusOneStatus || 'pending'}
                    plusOneDietary={generatedPass.plusOneDietary}
                    showPassSide={true}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-[#B59A72]/20">
                  <button
                    onClick={() => window.print()}
                    className="px-5 py-2.5 bg-[#292722] text-white text-xs font-semibold uppercase tracking-wider rounded-xs flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-[#B59A72]" />
                    Download Printable 5x7 Pass
                  </button>
                  <button
                    onClick={() => {
                      const text = encodeURIComponent(
                        `Here is my wedding invitation pass for ${wedding.partner1} & ${wedding.partner2}: https://${wedding.customDomain}/pass/${generatedPass.id}`
                      );
                      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                    }}
                    className="px-5 py-2.5 bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider rounded-xs flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Save to WhatsApp
                  </button>
                  <button
                    onClick={() => setGeneratedPass(null)}
                    className="px-4 py-2.5 border border-[#B59A72]/40 text-xs uppercase tracking-wider rounded-xs hover:bg-neutral-100"
                  >
                    Edit Details
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateOnMicrosite} className="space-y-5 max-w-xl mx-auto text-xs">
                <div>
                  <label className="block font-semibold uppercase tracking-wider text-[#292722] mb-1.5">
                    Your Full Name <span className="text-[#8C6D45]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#B59A72]/40 rounded-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase tracking-wider text-[#292722] mb-1.5">
                    Email Address (For pass confirmation)
                  </label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="alex@prestige.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#B59A72]/40 rounded-xs"
                  />
                </div>

                {/* RSVP Attendance Toggle */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setAttendance('attending')}
                    className={`py-2.5 px-3 rounded-xs border text-xs font-medium transition-all ${
                      attendance === 'attending'
                        ? 'bg-[#292722] text-white border-[#292722]'
                        : 'bg-white text-[#292722] border-[#B59A72]/30'
                    }`}
                  >
                    Joyfully Attending
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendance('declined')}
                    className={`py-2.5 px-3 rounded-xs border text-xs font-medium transition-all ${
                      attendance === 'declined'
                        ? 'bg-[#292722] text-white border-[#292722]'
                        : 'bg-white text-[#292722] border-[#B59A72]/30'
                    }`}
                  >
                    Regretfully Declining
                  </button>
                </div>

                {/* Plus-One Management Selection */}
                <div className="p-3.5 bg-[#FAF7F0] rounded-xs border border-[#B59A72]/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-[#292722] block">
                        Confirm Accompanying Plus-One (+1)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Reserve an additional seat for a spouse or partner
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHasPlusOne(!hasPlusOne)}
                      className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${
                        hasPlusOne ? 'bg-[#8C6D45]' : 'bg-neutral-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          hasPlusOne ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {hasPlusOne && (
                    <div className="mt-3 pt-3 border-t border-[#B59A72]/20 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-neutral-700 mb-1">
                          Plus-One Full Name <span className="text-[#8C6D45]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={plusOneName}
                          onChange={(e) => setPlusOneName(e.target.value)}
                          placeholder="e.g. Clara Vance"
                          className="w-full px-3 py-2 text-xs bg-white border border-[#B59A72]/30 rounded-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-neutral-700 mb-1">
                          Plus-One Dietary Restrictions
                        </label>
                        <input
                          type="text"
                          value={plusOneDietary}
                          onChange={(e) => setPlusOneDietary(e.target.value)}
                          placeholder="e.g. Pescatarian, strictly vegan, nut allergy"
                          className="w-full px-3 py-2 text-xs bg-white border border-[#B59A72]/30 rounded-xs"
                        />
                      </div>
                      <p className="text-[10px] text-[#8C6D45] italic">
                        * Accompanying seats are reviewed and confirmed by the couple in the dashboard.
                      </p>
                    </div>
                  )}
                </div>

                {/* Primary Guest Dietary Requirements */}
                <div>
                  <label className="block font-semibold uppercase tracking-wider text-[#292722] mb-1.5">
                    Your Dietary / Meal Restrictions
                  </label>
                  <input
                    type="text"
                    value={dietary}
                    onChange={(e) => setDietary(e.target.value)}
                    placeholder="e.g. Gluten-free, vegetarian, seafood allergy"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#B59A72]/40 rounded-xs"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 bg-[#292722] hover:bg-[#8C6D45] text-white text-xs font-semibold tracking-[0.16em] uppercase rounded-xs transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-[#B59A72]" />
                    <span>Generate Personalized Pass &amp; Confirm RSVP</span>
                  </button>
                </div>
              </form>
            )}
              </div>
            </div>

            {/* Right Column: Man / Groom Portrait */}
            <div className="hidden lg:flex lg:col-span-3 flex-col items-center text-center">
              <div className="w-full max-w-[220px] aspect-3/4 rounded-t-full overflow-hidden border-2 border-[#B59A72]/40 shadow-xl bg-neutral-100 group relative">
                <img
                  src="/src/assets/images/concierge_groom_portrait_1793535647794.jpg"
                  alt={`The Groom - ${wedding.partner1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 border border-white/20 pointer-events-none rounded-t-full" />
              </div>
              <div className="mt-3">
                <span className="text-[10px] font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold block">
                  The Groom
                </span>
                <h3 className="font-editorial text-xl text-[#292722] mt-0.5">
                  {wedding.partner1}
                </h3>
                <span className="text-[10px] font-editorial italic text-neutral-500">
                  &ldquo;A pleasure to welcome you to our day.&rdquo;
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. DANCE FLOOR SONG REQUEST BOX WITH CINEMATIC CELEBRATION BACKGROUND */}
      <section
        className="relative py-24 bg-cover bg-center overflow-hidden border-y border-[#B59A72]/20"
        style={{
          backgroundImage: 'url(/src/assets/images/playlist_celebration_bg_1793535646470.jpg)'
        }}
      >
        {/* Dark Luxury Vignette Scrim */}
        <div className="absolute inset-0 bg-[#1C1B18]/80 backdrop-blur-xs" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <div className="w-11 h-11 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center mx-auto mb-2.5 border border-[#D4AF37]/40 shadow-md">
              <Music className="w-5 h-5" />
            </div>
            <p className="text-xs font-editorial uppercase tracking-[0.25em] text-[#D4AF37] font-semibold mb-1">
              The Celebration Playlist
            </p>
            <h2 className="font-editorial text-3xl sm:text-4xl text-[#FAF7F0] font-normal">
              Request a Song for the Dance Floor
            </h2>
            <p className="text-xs text-neutral-300 max-w-md mx-auto mt-2 leading-relaxed">
              What track will guarantee to get you dancing with {wedding.partner1} &amp; {wedding.partner2}? Send your favorite song directly to our wedding DJ!
            </p>
          </div>

          <div className="bg-[#FAF7F0]/95 backdrop-blur-md p-6 sm:p-8 rounded-sm border border-[#B59A72]/40 shadow-2xl mb-8">
            <form onSubmit={handleAddSong} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <input
                type="text"
                required
                value={newSongTitle}
                onChange={(e) => setNewSongTitle(e.target.value)}
                placeholder="Song Title (e.g. September)"
                className="px-3.5 py-2.5 bg-white border border-[#B59A72]/40 rounded-xs text-[#292722] focus:outline-hidden focus:border-[#8C6D45]"
              />
              <input
                type="text"
                required
                value={newSongArtist}
                onChange={(e) => setNewSongArtist(e.target.value)}
                placeholder="Artist / Band (e.g. Earth Wind & Fire)"
                className="px-3.5 py-2.5 bg-white border border-[#B59A72]/40 rounded-xs text-[#292722] focus:outline-hidden focus:border-[#8C6D45]"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSongGuest}
                  onChange={(e) => setNewSongGuest(e.target.value)}
                  placeholder="Your Name (Optional)"
                  className="flex-1 px-3.5 py-2.5 bg-white border border-[#B59A72]/40 rounded-xs text-[#292722] focus:outline-hidden focus:border-[#8C6D45]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#292722] hover:bg-[#8C6D45] text-white text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors shrink-0 shadow-xs"
                >
                  Send Request
                </button>
              </div>
            </form>

            {songToast && (
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Song added to {wedding.partner1} &amp; {wedding.partner2}&apos;s reception request list!</span>
              </div>
            )}

            {/* Current Request List */}
            <div className="mt-6 pt-5 border-t border-[#B59A72]/20">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-3">
                Requested Tracks ({songList.length}):
              </span>
              {songList.length === 0 ? (
                <p className="text-xs text-neutral-500 italic py-2 text-center">
                  No song requests submitted yet. Be the first to suggest a track for the celebration!
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {songList.map((song) => (
                    <div
                      key={song.id}
                      className="p-3 bg-white rounded-xs border border-[#B59A72]/25 text-xs flex flex-col justify-between shadow-2xs hover:border-[#8C6D45] transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-[#292722] block truncate">
                          {song.songTitle}
                        </span>
                        <span className="text-neutral-500 text-[11px] block truncate">
                          {song.artist}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#8C6D45] mt-1.5 italic font-medium">
                        Requested by {song.guestName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 7. HONEYMOON FUND & GIFT REGISTRY */}
      <section className="py-16 bg-[#EFEAE2]/60 border-t border-[#B59A72]/20 text-center">
        <div className="max-w-2xl mx-auto px-4">
          <Gift className="w-6 h-6 text-[#8C6D45] mx-auto mb-2" />
          <h3 className="font-editorial text-3xl text-[#292722] mb-2">
            Gift Registry &amp; Honeymoon Fund
          </h3>
          <p className="text-xs text-[#5A554E] leading-relaxed mb-6">
            Your presence at our celebration is the greatest gift of all. For those who have asked, we have created a registry and honeymoon fund to help us build our home and explore the Amalfi Coast.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href={wedding.giftRegistryUrl}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-2.5 bg-[#292722] hover:bg-[#8C6D45] text-white text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors shadow-xs flex items-center gap-1.5"
            >
              <span>View Curated Registry</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* 8. WEDDING FAQS ACCORDION */}
      <section className="py-20 max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <p className="text-xs font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold mb-1">
            Questions &amp; Details
          </p>
          <h3 className="font-editorial text-3xl text-[#292722]">
            Guest Frequently Asked Questions
          </h3>
        </div>

        <div className="space-y-3">
          {[
            {
              q: 'Can I bring a plus-one or children?',
              a: 'Our invitations accommodate named guests and confirmed plus-ones submitted via our RSVP system. While we love your little ones, our evening banquet is an adult-only occasion with professional on-site childcare available upon request.'
            },
            {
              q: 'What transportation is provided to Molenvliet Estate?',
              a: 'Complimentary luxury shuttles will depart from Cape Town Waterfront hotels at 13:00 on Saturday and return following the midnight reception. Valet parking is also available on-site.'
            },
            {
              q: 'Are dietary requirements catered for?',
              a: 'Yes, absolutely. Our estate culinary chefs prepare bespoke menus for vegan, gluten-free, halal, and allergen-sensitive guests as noted during your pass generation.'
            },
            {
              q: 'What is the photo policy during the ceremony?',
              a: 'We are having an unplugged ceremony so everyone can be fully present with us. Our professional editorial photographers will capture every moment, and digital galleries will be shared with all guests!'
            }
          ].map((item, idx) => (
            <div
              key={item.q}
              className="bg-[#FAF7F0] border border-[#B59A72]/30 rounded-xs overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 text-left font-editorial text-lg text-[#292722] flex items-center justify-between hover:text-[#8C6D45] transition-colors"
              >
                <span>{item.q}</span>
                <span className="text-sm font-mono">{openFaq === idx ? '−' : '+'}</span>
              </button>
              {openFaq === idx && (
                <div className="px-4 pb-4 text-xs text-[#5A554E] leading-relaxed border-t border-[#B59A72]/15 pt-2">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-[#1C1B18] text-[#FAF7F0] border-t border-[#B59A72]/20 text-center text-xs">
        <p className="font-editorial text-2xl text-[#FAF7F0] mb-1">
          {wedding.partner1} &amp; {wedding.partner2}
        </p>
        <p className="text-neutral-400">{wedding.date} · {wedding.city}</p>
        <p className="text-[11px] text-[#B59A72] mt-4 uppercase tracking-widest">
          Aurelia Certified Wedding Microsite · Cape Town 2027
        </p>
      </footer>
    </div>
  );
};

import React, { useState } from 'react';
import {
  WeddingData,
  InvitationStyle,
  FoilAccent,
  PaperTone,
  CardOrientation
} from '../types/wedding';
import { QRCodeSVG } from '../utils/qrCode';
import { Calendar, MapPin, CheckCircle, ShieldCheck, Download, Loader2, Layers } from 'lucide-react';
import { downloadCeremonyCardPDF, downloadDigitalVenuePassPDF, downloadUnifiedInvitationPDF } from '../utils/pdfGenerator';
import { BlackGoldEInviteCard } from './BlackGoldEInviteCard';

interface InvitationCardPreviewProps {
  wedding: WeddingData;
  guestName: string;
  guestId?: string;
  guestStatus?: 'attending' | 'declined' | 'pending';
  selectedEventIds?: string[];
  plusOneName?: string;
  hasPlusOne?: boolean;
  plusOneStatus?: 'confirmed' | 'rejected' | 'pending';
  plusOneDietary?: string;
  overrideStyle?: InvitationStyle;
  overrideFoil?: FoilAccent;
  overridePaper?: PaperTone;
  overrideOrientation?: CardOrientation;
  compact?: boolean;
  showPassSide?: boolean;
}

export const InvitationCardPreview: React.FC<InvitationCardPreviewProps> = ({
  wedding,
  guestName,
  guestId = 'AUR-8012',
  guestStatus = 'attending',
  selectedEventIds = ['evt-2', 'evt-3'],
  plusOneName,
  hasPlusOne = false,
  plusOneStatus = 'confirmed',
  plusOneDietary,
  overrideStyle,
  overrideFoil,
  overridePaper,
  overrideOrientation,
  compact = false,
  showPassSide: initialShowPassSide = false
}) => {
  const [activeTab, setActiveTab] = useState<'card' | 'access'>(initialShowPassSide ? 'access' : 'card');
  const [downloadingType, setDownloadingType] = useState<'card' | 'pass' | 'unified' | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');

  const PDF_STEPS = [
    'Initializing vector canvas',
    'Rendering bespoke calligraphy & photo',
    'Generating high-density QR gate pass',
    'Packaging print-ready typography and finishing touches'
  ];

  const currentStepIndex = Math.max(
    0,
    PDF_STEPS.findIndex((s) => s.toLowerCase() === (downloadStatus || '').toLowerCase())
  );
  const progressPercent = Math.min(100, Math.round(((currentStepIndex + 1) / PDF_STEPS.length) * 100));

  const handleDownloadUnified = async () => {
    try {
      setDownloadingType('unified');
      setDownloadStatus('Initializing vector canvas');
      await downloadUnifiedInvitationPDF({
        wedding,
        guestName,
        guestId,
        hasPlusOne,
        plusOneName,
        plusOneStatus,
        plusOneDietary,
        selectedEventIds,
        onStatusUpdate: (msg) => setDownloadStatus(msg)
      });
    } catch (err) {
      console.error('Failed to download Unified Invitation:', err);
    } finally {
      setDownloadingType(null);
      setDownloadStatus('');
    }
  };

  const handleDownloadCard = async () => {
    try {
      setDownloadingType('card');
      setDownloadStatus('Initializing vector canvas');
      await downloadCeremonyCardPDF({
        wedding,
        guestName,
        guestId,
        hasPlusOne,
        plusOneName,
        onStatusUpdate: (msg) => setDownloadStatus(msg)
      });
    } catch (err) {
      console.error('Failed to download Ceremony Card:', err);
    } finally {
      setDownloadingType(null);
      setDownloadStatus('');
    }
  };

  const handleDownloadPass = async () => {
    try {
      setDownloadingType('pass');
      setDownloadStatus('Initializing vector canvas');
      await downloadDigitalVenuePassPDF({
        wedding,
        guestName,
        guestId,
        hasPlusOne,
        plusOneName,
        plusOneStatus,
        plusOneDietary,
        selectedEventIds,
        onStatusUpdate: (msg) => setDownloadStatus(msg)
      });
    } catch (err) {
      console.error('Failed to download Digital Pass:', err);
    } finally {
      setDownloadingType(null);
      setDownloadStatus('');
    }
  };

  const paper = overridePaper || wedding.paperTone;

  // Check custom branding colors
  const isCustomPalette = wedding.customColors?.isCustom;
  const customBg = wedding.customColors?.background;
  const customFoil = wedding.customColors?.foil;
  const customText = wedding.customColors?.text;
  const customBorder = wedding.customColors?.border;

  // Selected events
  const admittedEvents = wedding.events.filter((e) => selectedEventIds.includes(e.id));
  const displayName = guestName.trim() || 'Alex Morgan';

  // Paper Background Classes if not custom
  const getPaperClasses = () => {
    if (isCustomPalette) return 'shadow-2xl';
    switch (paper) {
      case 'midnight':
        return 'bg-[#1C1B18] text-[#F3EDE2] border-[#D4AF37]/40 shadow-2xl';
      case 'white':
        return 'bg-[#FFFFFF] text-[#292722] border-neutral-300 shadow-xl';
      case 'blush':
        return 'bg-[#FAF4EE] text-[#332E2A] border-[#C98B82]/30 shadow-xl';
      case 'stone':
        return 'bg-[#EFEAE2] text-[#292722] border-[#B59A72]/40 shadow-xl';
      case 'ivory':
      default:
        return 'bg-[#FAF7F0] text-[#292722] border-[#B59A72]/40 shadow-2xl';
    }
  };

  const isDark = isCustomPalette ? false : paper === 'midnight';


  return (
    <div className="w-full flex flex-col items-center">
      {/* View Switcher Tabs (Card vs Venue Access Pass) */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full max-w-[620px] mb-3">
        <div className="flex items-center gap-1 p-1 bg-[#292722]/5 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('card')}
            className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
              activeTab === 'card'
                ? 'bg-white text-[#292722] shadow-xs font-semibold'
                : 'text-[#292722]/70 hover:text-[#292722]'
            }`}
          >
            Wedding E-Invite (1:1)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('access')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'access'
                ? 'bg-white text-[#292722] shadow-xs font-semibold'
                : 'text-[#292722]/70 hover:text-[#292722]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#B59A72]" />
            QR Digital Venue Pass
          </button>
        </div>

        {/* Unified Front & Back Download Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadUnified}
            disabled={Boolean(downloadingType)}
            className="px-3.5 py-1.5 rounded-lg bg-[#292722] hover:bg-[#8C6D45] text-white text-[11px] font-semibold tracking-wider uppercase transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            title="Download Unified Invitation: Front Ceremony Card & Back QR Gate Pass together in one PDF document"
          >
            {downloadingType === 'unified' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B59A72]" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[#B59A72]" />
            )}
            <span>{downloadingType === 'unified' ? 'Generating Unified PDF...' : 'Download Invitation (Front & Back)'}</span>
          </button>
        </div>
      </div>

      {/* Real-time PDF Generation Status Indicator */}
      {downloadingType && (
        <div className="w-full max-w-[620px] mb-3 px-3.5 py-1.5 bg-[#FAF7F0] border border-[#B59A72]/40 rounded-xs text-xs text-[#292722] flex items-center gap-2.5 animate-pulse shadow-xs">
          <Loader2 className="w-3.5 h-3.5 text-[#8C6D45] animate-spin shrink-0" />
          <span className="font-editorial text-xs text-[#8C6D45] font-semibold">
            Archival PDF Generation:
          </span>
          <span className="text-neutral-700 text-xs font-medium truncate">{downloadStatus}</span>
        </div>
      )}

      {/* Main Printable / Display Card Container */}
      <div
        id="printable-invitation-pass"
        className={`relative transition-all duration-300 ${
          compact ? 'scale-95' : ''
        } ${
          activeTab === 'card'
            ? 'w-full max-w-[546px]'
            : `rounded-sm paper-deckle ${getPaperClasses()} w-full max-w-[460px] p-6 sm:p-8 min-h-[600px]`
        }`}
        style={
          activeTab === 'card'
            ? undefined
            : {
                ['--card-bg' as string]: customBg || '#FAF7F0',
                ['--card-foil' as string]: customFoil || '#D4AF37',
                ['--card-text' as string]: customText || '#292722',
                ['--card-border' as string]: customBorder || '#B59A72',
                ...(isCustomPalette
                  ? {
                      backgroundColor: 'var(--card-bg)',
                      color: 'var(--card-text)'
                    }
                  : {}),
                boxShadow: isDark
                  ? '0 20px 40px -10px rgba(0,0,0,0.6), inset 0 0 40px rgba(212,175,55,0.05)'
                  : '0 20px 40px -15px rgba(41,39,34,0.12), inset 0 0 50px rgba(181,154,114,0.08)'
              }
        }
      >
        {activeTab === 'card' ? (
          /* FRONT INVITATION VIEW: BLACK & GOLD 1:1 WEDDING E-INVITE */
          <BlackGoldEInviteCard
            wedding={wedding}
            guestName={displayName}
            hasPlusOne={hasPlusOne}
          />
        ) : (
          /* DIGITAL VENUE PASS & QR CODE VIEW */
          <div className="relative z-10 flex flex-col items-center justify-between h-full min-h-[560px]">
            <div className="w-full text-center pt-2">
              <div className="flex items-center justify-center gap-1.5 text-[#B59A72] text-[11px] uppercase tracking-[0.2em] font-medium mb-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Verified Guest Pass
              </div>
              <h2 className="font-editorial text-2xl font-normal tracking-wide">
                Entrance Pass &amp; Itinerary
              </h2>
              <div className="text-[11px] font-mono tracking-widest text-[#8C6D45] uppercase mt-0.5">
                Pass ID: {guestId}
              </div>
            </div>

            {/* Couple Photo Badge on Back / Pass */}
            <div className="flex flex-col items-center my-2">
              <div className="w-16 h-16 rounded-full border-2 border-[#B59A72] shadow-sm overflow-hidden">
                <img
                  src={wedding.couplePhotoUrl || '/src/assets/images/IMG-20261107-WA0166.jpg'}
                  alt={`${wedding.partner1} & ${wedding.partner2}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <span className="font-editorial text-xs font-medium text-[#8C6D45] mt-1 tracking-wider uppercase">
                {wedding.partner1} &amp; {wedding.partner2}
              </span>
            </div>

            {/* QR Code Container */}
            <div className="my-auto flex flex-col items-center p-4 bg-white rounded-sm border border-[#B59A72]/30 shadow-xs">
              <QRCodeSVG
                value={`AURELIA-WEDDING:${wedding.slug}:GUEST:${guestId}:${displayName}`}
                size={140}
                fgColor="#292722"
              />
              <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-500 mt-2">
                Scan for venue admission
              </span>
            </div>

            {/* Guest Details & Plus-One Status */}
            <div className="w-full bg-white/40 backdrop-blur-xs p-3 rounded-xs border border-[#B59A72]/20 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#B59A72]/15">
                <span className="text-neutral-500 font-sans-ui text-[11px]">Primary Guest</span>
                <span className="font-semibold text-right">{displayName}</span>
              </div>
              {hasPlusOne && (
                <div className="flex justify-between items-center py-1 border-b border-[#B59A72]/15">
                  <span className="text-neutral-500 font-sans-ui text-[11px]">Accompanying (+1)</span>
                  <div className="text-right">
                    <span className="font-semibold block">
                      {plusOneName || 'Guest Requested'}
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-wider font-semibold ${
                        plusOneStatus === 'confirmed'
                          ? 'text-emerald-700'
                          : plusOneStatus === 'rejected'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {plusOneStatus === 'confirmed'
                        ? '• Confirmed Seat'
                        : plusOneStatus === 'rejected'
                        ? '• Single Only (Declined)'
                        : '• Pending Review'}
                    </span>
                  </div>
                </div>
              )}
              {hasPlusOne && plusOneDietary && (
                <div className="flex justify-between items-center py-1 border-b border-[#B59A72]/15">
                  <span className="text-neutral-500 font-sans-ui text-[11px]">+1 Dietary</span>
                  <span className="font-medium text-right text-[11px] text-neutral-700">
                    {plusOneDietary}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center py-1 border-b border-[#B59A72]/15">
                <span className="text-neutral-500 font-sans-ui text-[11px]">RSVP Status</span>
                <span className="font-semibold text-emerald-700 capitalize">
                  {guestStatus}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-neutral-500 font-sans-ui text-[11px]">Dress Code</span>
                <span className="font-medium text-right text-[11px] truncate max-w-[180px]">
                  {wedding.dressCodeSummary}
                </span>
              </div>
            </div>

            {/* Admitted Sessions */}
            <div className="w-full text-left mt-3">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
                Admitted Events ({admittedEvents.length}):
              </span>
              <div className="space-y-1">
                {admittedEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between text-[11px] py-1 px-2 rounded-xs bg-white/30 border border-[#B59A72]/15"
                  >
                    <span className="font-medium truncate max-w-[200px]">{evt.title}</span>
                    <span className="text-neutral-500 text-[10px] font-mono">{evt.time}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-center text-neutral-400 mt-3">
              Please present this verified entrance pass upon arrival at Lion Voice Tabernacle &amp; Rooftop 39 Salt River Road.
            </div>
          </div>
        )}
      </div>

      {/* Quick Indicator Below Card */}
      <div className="mt-3 flex items-center justify-between w-full max-w-xl px-1 text-xs text-neutral-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#B59A72]" />
            {wedding.rawDate}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-[#B59A72]" />
            {wedding.city}
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C6D45] hidden sm:inline">
          {activeTab === 'card' ? 'Black & Gold E-Invite (1:1)' : 'QR Venue Gate Pass'}
        </span>
      </div>

      {/* High-Resolution PDF Generation Stepper (Active during download) */}
      {downloadingType && (
        <div className="mt-4 w-full max-w-xl bg-[#1C1B18] text-[#FAF7F0] p-4 rounded-xs shadow-xl transition-all">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="font-editorial text-xs tracking-wider text-white font-medium uppercase">
                Archival Print Rendering Engine
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#D4AF37] px-2 py-0.5 rounded-full bg-white/10 shadow-xs">
              {downloadingType === 'unified'
                ? 'Unified Front & Back Invitation (2 Pages)'
                : downloadingType === 'card'
                ? 'Black & Gold E-Invite (Front)'
                : 'QR Venue Gate Pass (Back)'}
            </span>
          </div>

          {/* Progress Bar & Status Text */}
          <div className="mt-3.5">
            <div className="flex justify-between items-center text-[11px] mb-1.5 text-neutral-300">
              <span className="font-medium text-[#FAF7F0] flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-[#D4AF37] animate-spin" />
                {downloadStatus || 'Initializing generation...'}
              </span>
              <span className="font-mono text-[#D4AF37] font-semibold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#B59A72] via-[#D4AF37] to-[#FAF7F0] transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 4-Step Live Stepper Indicator */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {PDF_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={step}
                  className={`flex items-center gap-2.5 p-2 rounded-xs transition-colors ${
                    isCurrent
                      ? 'bg-[#D4AF37]/25 text-white font-medium shadow-xs'
                      : isCompleted
                      ? 'bg-emerald-950/40 text-emerald-300'
                      : 'bg-white/5 text-neutral-400'
                  }`}
                >
                  <div className="shrink-0">
                    {isCompleted ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#D4AF37] animate-spin" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-neutral-700 flex items-center justify-center text-[9px] font-mono text-neutral-300">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <span className="truncate">{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unified Invitation Download (Front & Back Simultaneously) */}
      <div className="mt-4 w-full max-w-xl">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8C6D45]">
            Unified Invitation Download
          </span>
          <span className="text-[9px] text-neutral-500 font-sans uppercase tracking-wider">
            Front &amp; Back Included · 300 DPI Archival Resolution
          </span>
        </div>

        {/* Master Unified Download Button */}
        <button
          type="button"
          onClick={handleDownloadUnified}
          disabled={downloadingType !== null}
          className="w-full group relative flex flex-col items-start p-5 text-left bg-gradient-to-br from-[#292722] via-[#24211D] to-[#1C1B18] text-white rounded-2xl shadow-md hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-3"
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#D4AF37]" />
              <span className="font-editorial text-base sm:text-lg font-medium text-white group-hover:text-[#D4AF37] transition-colors">
                Download Complete Invitation &amp; Gate Pass (Front &amp; Back)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#B59A72] text-[#1C1B18] group-hover:scale-105 transition-transform shadow-xs shrink-0">
              {downloadingType === 'unified' ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#1C1B18]" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </div>
          </div>
          <p className="text-xs text-neutral-300 font-sans leading-relaxed">
            Downloads both sides unified into one document at the same time: Page 1 (Front: Black &amp; Gold 1:1 Wedding E-Invite) &amp; Page 2 (Back: Digital Venue Gate Pass with couple portrait, high-density QR code &amp; gate protocol).
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]">
            <span className="font-semibold">Complete 2-Page Document</span>
            <span>·</span>
            <span>Front &amp; Back Unified</span>
            <span>·</span>
            <span>1:1 E-Invite + A5 Pass</span>
          </div>
        </button>

        {/* Secondary individual options */}
        <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-neutral-500">
          <span>Individual sides:</span>
          <button
            type="button"
            onClick={handleDownloadCard}
            disabled={downloadingType !== null}
            className="text-[#8C6D45] hover:underline transition-colors font-medium cursor-pointer disabled:opacity-50"
          >
            Front Only (Black &amp; Gold E-Invite)
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={handleDownloadPass}
            disabled={downloadingType !== null}
            className="text-[#8C6D45] hover:underline transition-colors font-medium cursor-pointer disabled:opacity-50"
          >
            Back Only (QR Gate Pass)
          </button>
        </div>
      </div>
    </div>
  );
};

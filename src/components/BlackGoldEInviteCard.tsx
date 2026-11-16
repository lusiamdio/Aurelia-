import React from 'react';
import { WeddingData } from '../types/wedding';

interface BlackGoldEInviteCardProps {
  wedding: WeddingData;
  guestName: string;
  hasPlusOne?: boolean;
}

/**
 * Deterministic gold dust particle coordinates inside the 1092×1092 canvas:
 * - Top-Right cluster (~320×330)
 * - Bottom-Left cluster (~280×350)
 */
const GOLD_DUST_TR = [
  { cx: 810, cy: 52, r: 2.2, o: 0.85 },
  { cx: 845, cy: 38, r: 1.4, o: 0.7 },
  { cx: 882, cy: 76, r: 3.1, o: 0.9 },
  { cx: 915, cy: 48, r: 1.8, o: 0.65 },
  { cx: 952, cy: 92, r: 2.6, o: 0.8 },
  { cx: 988, cy: 62, r: 3.4, o: 0.9 },
  { cx: 1022, cy: 44, r: 2.0, o: 0.75 },
  { cx: 1054, cy: 84, r: 2.8, o: 0.85 },
  { cx: 834, cy: 112, r: 1.6, o: 0.6 },
  { cx: 874, cy: 136, r: 2.5, o: 0.8 },
  { cx: 912, cy: 120, r: 1.2, o: 0.7 },
  { cx: 944, cy: 156, r: 3.0, o: 0.88 },
  { cx: 982, cy: 132, r: 1.9, o: 0.68 },
  { cx: 1018, cy: 118, r: 2.7, o: 0.82 },
  { cx: 1048, cy: 162, r: 1.5, o: 0.7 },
  { cx: 896, cy: 184, r: 2.0, o: 0.72 },
  { cx: 938, cy: 204, r: 1.5, o: 0.62 },
  { cx: 974, cy: 188, r: 2.9, o: 0.85 },
  { cx: 1012, cy: 214, r: 2.2, o: 0.76 },
  { cx: 1062, cy: 206, r: 3.2, o: 0.9 },
  { cx: 960, cy: 248, r: 1.8, o: 0.65 },
  { cx: 1002, cy: 266, r: 2.4, o: 0.78 },
  { cx: 1038, cy: 288, r: 1.6, o: 0.68 },
  { cx: 1070, cy: 256, r: 2.1, o: 0.74 },
  { cx: 1016, cy: 320, r: 1.4, o: 0.6 }
];

const GOLD_DUST_BL = [
  { cx: 42, cy: 768, r: 2.0, o: 0.7 },
  { cx: 78, cy: 794, r: 2.8, o: 0.82 },
  { cx: 118, cy: 822, r: 1.6, o: 0.64 },
  { cx: 34, cy: 836, r: 2.5, o: 0.85 },
  { cx: 68, cy: 868, r: 1.4, o: 0.65 },
  { cx: 104, cy: 882, r: 3.1, o: 0.88 },
  { cx: 146, cy: 860, r: 1.9, o: 0.7 },
  { cx: 188, cy: 898, r: 2.3, o: 0.76 },
  { cx: 52, cy: 918, r: 3.2, o: 0.9 },
  { cx: 88, cy: 946, r: 1.8, o: 0.68 },
  { cx: 128, cy: 932, r: 2.6, o: 0.84 },
  { cx: 168, cy: 958, r: 1.5, o: 0.62 },
  { cx: 214, cy: 942, r: 2.4, o: 0.74 },
  { cx: 36, cy: 986, r: 2.7, o: 0.86 },
  { cx: 74, cy: 1012, r: 2.1, o: 0.78 },
  { cx: 114, cy: 996, r: 3.4, o: 0.9 },
  { cx: 158, cy: 1024, r: 1.8, o: 0.72 },
  { cx: 198, cy: 1004, r: 2.9, o: 0.85 },
  { cx: 242, cy: 1036, r: 1.7, o: 0.66 },
  { cx: 48, cy: 1054, r: 2.5, o: 0.82 },
  { cx: 92, cy: 1064, r: 1.4, o: 0.68 },
  { cx: 138, cy: 1060, r: 2.8, o: 0.86 },
  { cx: 224, cy: 1068, r: 2.0, o: 0.72 },
  { cx: 268, cy: 1052, r: 1.3, o: 0.6 }
];

function parseWeddingDateParts(rawDate?: string) {
  const fallback = { weekday: 'SUNDAY', day: '20', month: 'DECEMBER', year: '2026' };
  if (!rawDate) return fallback;
  const parts = rawDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  return {
    weekday: weekdays[dt.getUTCDay()] || fallback.weekday,
    day: String(d),
    month: months[dt.getUTCMonth()] || fallback.month,
    year: String(y)
  };
}

export const BlackGoldEInviteCard: React.FC<BlackGoldEInviteCardProps> = ({
  wedding,
  guestName,
  hasPlusOne = false
}) => {
  const p1First = (wedding.partner1 || 'Samson').trim().split(' ')[0];
  const p2First = (wedding.partner2 || 'Kevine').trim().split(' ')[0];
  const displayGuest = guestName.trim() || 'Honoured Guest';
  const partyVariant = hasPlusOne ? '(Couple)' : '(Single)';
  const { weekday, day, month, year } = parseWeddingDateParts(wedding.rawDate);

  const primaryEvents =
    wedding.events && wedding.events.length > 0
      ? wedding.events.slice(0, 2)
      : [
          { id: 'evt-benediction', title: 'Wedding Benediction', time: '13:00' },
          { id: 'evt-reception', title: 'Evening Reception', time: '18:00 - 21:00' }
        ];

  return (
    <div
      className="relative w-full max-w-[546px] aspect-square mx-auto overflow-hidden select-none shadow-2xl rounded-xs"
      style={{
        backgroundColor: '#050505',
        containerType: 'inline-size'
      }}
    >
      {/* LAYER 1 & 2: BACKGROUND (Bokeh, Gold Dust Clusters) & LINE-ART FLORALS + CIRCLE */}
      <svg
        viewBox="0 0 1092 1092"
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Gold Foil Gradient for Line-Art Florals and Dust Only (Section 7) */}
          <linearGradient id="goldLineArtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F5DC8E" />
            <stop offset="45%" stopColor="#E6B94A" />
            <stop offset="100%" stopColor="#B8872B" />
          </linearGradient>

          <radialGradient id="goldDustGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F8E4A0" stopOpacity="1" />
            <stop offset="60%" stopColor="#C9983A" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#C9983A" stopOpacity="0" />
          </radialGradient>

          <filter id="bokehBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
        </defs>

        {/* Base Fill */}
        <rect width="1092" height="1092" fill="#050505" />

        {/* Background Bokeh Dots (4 subtle ellipses, 20-30% opacity, slate/blue-grey) */}
        <g filter="url(#bokehBlur)">
          <ellipse cx="240" cy="220" rx="85" ry="80" fill="#6F839A" fillOpacity="0.22" />
          <ellipse cx="860" cy="410" rx="95" ry="90" fill="#7C8D9E" fillOpacity="0.20" />
          <ellipse cx="290" cy="790" rx="75" ry="70" fill="#687B91" fillOpacity="0.24" />
          <ellipse cx="770" cy="870" rx="68" ry="68" fill="#8895A5" fillOpacity="0.20" />
        </g>

        {/* Gold Dust Cluster: Top-Right (~320x330) */}
        <g>
          {GOLD_DUST_TR.map((pt, i) => (
            <circle
              key={`tr-${i}`}
              cx={pt.cx}
              cy={pt.cy}
              r={pt.r * 1.45}
              fill="url(#goldDustGrad)"
              opacity={pt.o}
            />
          ))}
        </g>

        {/* Gold Dust Cluster: Bottom-Left (~280x350) */}
        <g>
          {GOLD_DUST_BL.map((pt, i) => (
            <circle
              key={`bl-${i}`}
              cx={pt.cx}
              cy={pt.cy}
              r={pt.r * 1.45}
              fill="url(#goldDustGrad)"
              opacity={pt.o}
            />
          ))}
        </g>

        {/* Floral TL (Line art, ~280x520, bleeds off top-left edge) */}
        <g
          fill="none"
          stroke="url(#goldLineArtGrad)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
        >
          {/* Primary curved stems */}
          <path d="M-20,30 C45,90 85,180 78,295 C72,380 42,455 12,515" />
          <path d="M24,-15 C85,52 136,124 162,215" />
          <path d="M78,240 C138,225 198,255 235,310" />
          {/* Blossom petals TL */}
          <path d="M110,92 C142,58 192,72 195,112 C198,148 158,176 116,162 C92,152 88,116 110,92 Z" />
          <path d="M126,108 C146,88 176,98 176,120 C176,142 146,154 126,140" />
          <path d="M150,74 C166,34 218,32 232,68 C244,100 218,136 184,130" />
          {/* Secondary rosebud */}
          <path d="M44,185 C82,165 122,192 114,234 C106,274 56,284 26,256" />
          <path d="M56,204 C78,192 98,208 94,230 C90,250 64,256 48,242" />
          {/* Delicate botanical leaves */}
          <path d="M162,215 C208,195 256,216 266,246 C228,258 186,245 162,215 Z" />
          <path d="M72,302 C120,295 158,324 164,362 C122,366 84,342 72,302 Z" />
          <path d="M58,364 C104,376 132,418 124,458 C88,444 62,408 58,364 Z" />
          <path d="M22,130 C-18,150 -24,205 12,226" />
          {/* Fine leaf veins */}
          <path d="M164,216 L242,238" strokeWidth="1" opacity="0.65" />
          <path d="M75,305 L142,346" strokeWidth="1" opacity="0.65" />
          <path d="M60,368 L110,432" strokeWidth="1" opacity="0.65" />
        </g>

        {/* Floral BR (Scaled down slightly per Section 7 so it leaves breathing room for Open Gifts Registry) */}
        <g
          transform="translate(888, 690) scale(0.84)"
          fill="none"
          stroke="url(#goldLineArtGrad)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.86"
        >
          <path d="M235,445 C180,382 142,300 144,195 C146,115 178,48 214,-10" />
          <path d="M150,248 C96,258 46,232 14,182" />
          <path d="M162,148 C108,132 76,84 82,36" />
          {/* Blossom petals BR */}
          <path d="M118,312 C80,334 38,310 40,268 C42,230 86,208 124,228 C148,242 146,294 118,312 Z" />
          <path d="M104,292 C82,306 58,292 60,268 C62,246 88,236 108,248" />
          {/* Leaves */}
          <path d="M144,195 C96,206 54,182 44,150 C82,140 124,162 144,195 Z" />
          <path d="M164,116 C120,104 94,64 102,28 C136,40 162,76 164,116 Z" />
          <path d="M188,368 C144,392 98,386 74,356 C108,334 156,342 188,368 Z" />
          <path d="M140,194 L68,162" strokeWidth="1" opacity="0.65" />
          <path d="M162,114 L115,52" strokeWidth="1" opacity="0.65" />
        </g>

        {/* Header Circle Outline (330x330 -> r=162 centered at (546, 174), 1.5px stroke gold-line-art) */}
        <circle
          cx="546"
          cy="174"
          r="162"
          fill="none"
          stroke="#E6B94A"
          strokeWidth="1.5"
          opacity="0.95"
        />

        {/* Gold Sprig (~45x150, sits gracefully on circle's upper-left edge) */}
        <g
          fill="none"
          stroke="#E6B94A"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M430,52 C398,86 382,135 388,186" />
          <path d="M412,72 C392,66 376,76 372,94 C390,98 406,90 412,72 Z" fill="#E6B94A" fillOpacity="0.16" />
          <path d="M396,108 C374,104 358,116 356,136 C376,138 392,126 396,108 Z" fill="#E6B94A" fillOpacity="0.16" />
          <path d="M388,144 C366,144 354,160 356,178 C374,176 386,162 388,144 Z" fill="#E6B94A" fillOpacity="0.16" />
          <path d="M402,94 C418,86 430,96 428,112 C414,114 404,106 402,94 Z" />
          <path d="M390,130 C406,124 418,134 414,148 C400,150 392,140 390,130 Z" />
          <circle cx="433" cy="49" r="2.5" fill="#E6B94A" />
        </g>
      </svg>

      {/* LAYER 3: AUTO-LAYOUT CONTENT ON SINGLE CENTRAL AXIS (x = 546) */}
      <div className="relative z-10 w-full h-full flex flex-col items-center text-center text-white px-[14%]">
        {/* HEADER INSIDE CIRCLE (y: 8..330 — Groom and Bride names only) */}
        <div
          className="flex flex-col items-center justify-center w-full"
          style={{
            height: '31.5cqw'
          }}
        >
          <h2
            className="font-editorial italic font-normal"
            style={{
              color: '#D8AE4E',
              lineHeight: 0.98
            }}
          >
            <span className="block" style={{ fontSize: 'clamp(24px, 6.4cqw, 36px)' }}>
              {p1First}
            </span>
            <span className="block" style={{ fontSize: 'clamp(26px, 6.8cqw, 40px)', margin: '0.25cqw 0' }}>
              &amp;
            </span>
            <span className="block" style={{ fontSize: 'clamp(24px, 6.4cqw, 36px)' }}>
              {p2First}
            </span>
          </h2>
        </div>

        {/* GUEST BLOCK (Personalization Variant: Single vs Couple) */}
        <div className="flex flex-col items-center w-full" style={{ marginTop: '3.2cqw', gap: '0.9cqw' }}>
          <div className="flex items-baseline justify-center flex-wrap" style={{ gap: '1.1cqw' }}>
            <span
              className="font-marcellus tracking-[0.08em]"
              style={{
                color: '#D8AE4E',
                fontSize: 'clamp(13px, 3.2cqw, 19px)'
              }}
            >
              {displayGuest}
            </span>
            <span
              className="font-sans-ui font-normal text-white"
              style={{ fontSize: 'clamp(10px, 2.35cqw, 14px)' }}
            >
              {partyVariant}
            </span>
          </div>

          {/* Centered White Divider (490/1092 ≈ 45% canvas width => ~62% of padded inner container) */}
          <div className="bg-white/95" style={{ width: '63%', height: '1.5px', marginTop: '0.6cqw' }} />
        </div>

        {/* INVITATION MESSAGE (3 balanced lines, Marcellus ~27px, line-height 1.4, +5% tracking) */}
        <p
          className="font-marcellus text-white tracking-[0.05em] mx-auto"
          style={{
            marginTop: '3.2cqw',
            maxWidth: '92%',
            fontSize: 'clamp(10px, 2.35cqw, 14px)',
            lineHeight: 1.4
          }}
        >
          Together with our families, we joyfully invite you to celebrate our sacred union in love,
          grace, and eternal fellowship in Cape Town.
        </p>

        {/* DATE BLOCK (3 Horizontal Columns: Rule/WEEKDAY/Rule | DAY/YEAR | Rule/MONTH/Rule) */}
        <div
          className="flex items-center justify-center w-full"
          style={{ marginTop: '3.4cqw', gap: '3.4cqw' }}
        >
          {/* Column Left: Weekday */}
          <div className="flex flex-col items-center" style={{ width: '21%' }}>
            <div className="w-full bg-white" style={{ height: '1px' }} />
            <span
              className="font-marcellus uppercase text-white tracking-[0.06em]"
              style={{
                fontSize: 'clamp(9px, 2.55cqw, 15px)',
                padding: '1.15cqw 0'
              }}
            >
              {weekday}
            </span>
            <div className="w-full bg-white" style={{ height: '1px' }} />
          </div>

          {/* Column Center: Big Day Number + Year */}
          <div className="flex flex-col items-center justify-center">
            <span
              className="font-editorial font-light tabular-nums"
              style={{
                color: '#D8AE4E',
                fontSize: 'clamp(34px, 9.6cqw, 56px)',
                lineHeight: 0.85
              }}
            >
              {day}
            </span>
            <span
              className="font-marcellus text-white tracking-[0.08em]"
              style={{
                fontSize: 'clamp(10px, 2.5cqw, 15px)',
                marginTop: '0.7cqw'
              }}
            >
              {year}
            </span>
          </div>

          {/* Column Right: Month */}
          <div className="flex flex-col items-center" style={{ width: '21%' }}>
            <div className="w-full bg-white" style={{ height: '1px' }} />
            <span
              className="font-marcellus uppercase text-white tracking-[0.06em]"
              style={{
                fontSize: 'clamp(9px, 2.55cqw, 15px)',
                padding: '1.15cqw 0'
              }}
            >
              {month}
            </span>
            <div className="w-full bg-white" style={{ height: '1px' }} />
          </div>
        </div>

        {/* SCHEDULE ROW (Horizontal, Ceremony + Reception) */}
        <div
          className="flex items-center justify-center flex-wrap w-full"
          style={{ marginTop: '3.0cqw', gap: '4.2cqw' }}
        >
          {primaryEvents.map((evt) => (
            <div
              key={evt.id}
              className="flex items-baseline font-marcellus tracking-[0.03em]"
              style={{ gap: '0.9cqw', fontSize: 'clamp(9.5px, 2.4cqw, 14px)' }}
            >
              <span style={{ color: '#D8AE4E' }}>{evt.title}:</span>
              <span className="text-white">{evt.time}</span>
            </div>
          ))}
        </div>

        {/* ADULTS-ONLY & CHILDREN NOTICE (Shifted up cleanly per Section 7 bottom breathing room) */}
        <div
          className="flex flex-col items-center"
          style={{ marginTop: '2.5cqw', gap: '0.5cqw' }}
        >
          <span
            className="font-marcellus uppercase tracking-[0.05em]"
            style={{
              color: '#FF4D55',
              fontSize: 'clamp(10px, 2.7cqw, 15.5px)'
            }}
          >
            Adults Only
          </span>
          <p
            className="font-marcellus text-white/95 tracking-[0.03em]"
            style={{ fontSize: 'clamp(8.5px, 1.85cqw, 11.5px)' }}
          >
            Kindly note: young children aged 0 to 5 years only for evening event.
          </p>
        </div>

        {/* VENUE TEXT */}
        <p
          className="font-marcellus text-white tracking-[0.05em] truncate max-w-full"
          style={{
            marginTop: '3.0cqw',
            marginBottom: '2.4cqw',
            fontSize: 'clamp(11px, 3.1cqw, 18px)'
          }}
        >
          {wedding.venue || 'Lion Voice Tabernacle & Rooftop, 39 Salt River Rd'}
        </p>
      </div>
    </div>
  );
};

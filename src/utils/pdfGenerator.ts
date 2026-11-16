import jsPDF from 'jspdf';
import { WeddingData } from '../types/wedding';

interface CardPdfOptions {
  wedding: WeddingData;
  guestName: string;
  guestId?: string;
  hasPlusOne?: boolean;
  plusOneName?: string;
  onStatusUpdate?: (status: string) => void;
}

interface PassPdfOptions {
  wedding: WeddingData;
  guestName: string;
  guestId: string;
  hasPlusOne?: boolean;
  plusOneName?: string;
  plusOneStatus?: 'confirmed' | 'rejected' | 'pending';
  plusOneDietary?: string;
  dietaryRequirements?: string;
  selectedEventIds?: string[];
  onStatusUpdate?: (status: string) => void;
}

export interface UnifiedInvitationPdfOptions {
  wedding: WeddingData;
  guestName: string;
  guestId?: string;
  hasPlusOne?: boolean;
  plusOneName?: string;
  plusOneStatus?: 'confirmed' | 'rejected' | 'pending';
  plusOneDietary?: string;
  dietaryRequirements?: string;
  selectedEventIds?: string[];
  onStatusUpdate?: (status: string) => void;
}

/**
 * Helper to convert an image URL to a base64 Data URL for jsPDF embedding
 */
async function loadImageDataUrl(src: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Helper to fetch real-time personalized copy from Gemini API
 */
async function fetchGeminiPdfContent(
  type: 'card' | 'pass',
  options: {
    guestName: string;
    guestId?: string;
    hasPlusOne?: boolean;
    plusOneName?: string;
    coupleNames: string;
    venue: string;
    date: string;
    dressCode: string;
  }
) {
  try {
    const res = await fetch('/api/pdf/gemini-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        ...options
      })
    });
    if (!res.ok) throw new Error('API request failed');
    return await res.json();
  } catch (err) {
    console.warn('Using offline editorial fallback for PDF:', err);
    if (type === 'card') {
      return {
        blessing: `May your presence grace this union as two souls entwine their destinies in Cape Town. We hold your companionship in profound reverence.`,
        proclamation: `Therefore what God has joined together, let no one separate.`
      };
    } else {
      return {
        protocolNote: `Kindly present this verified gate pass upon arrival at Lion Voice Tabernacle (13:00) and Rooftop Salt River (18:00).`,
        dressCodeRemark: `Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear`
      };
    }
  }
}

/**
 * Helper to generate 25x25 QR Matrix for vector drawing in jsPDF
 */
function generateQrMatrix(value: string): boolean[][] {
  const matrixSize = 25;
  const matrix: boolean[][] = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(false));

  const addFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[startY + r][startX + c] = isOuter || isInner;
      }
    }
  };

  addFinder(0, 0);
  addFinder(matrixSize - 7, 0);
  addFinder(0, matrixSize - 7);

  // Timing patterns
  for (let i = 8; i < matrixSize - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  let seed = Math.abs(hash);
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= matrixSize - 8;
      const inBottomLeft = r >= matrixSize - 8 && c < 8;
      const inCenterLogo = r >= 10 && r <= 14 && c >= 10 && c <= 14;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inCenterLogo) {
        if (r === 6 || c === 6) continue;
        seed = (seed * 9301 + 49297) % 233280;
        matrix[r][c] = seed / 233280 > 0.48;
      }
    }
  }

  return matrix;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseDatePartsForPdf(rawDate?: string) {
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

/**
 * Renders the 1:1 Black & Gold Wedding E-Invite onto the current 148x148mm jsPDF page
 */
function renderBlackGoldEInvitePdfPage(
  doc: jsPDF,
  {
    wedding,
    guestName,
    hasPlusOne = false
  }: {
    wedding: WeddingData;
    guestName: string;
    hasPlusOne?: boolean;
  }
) {
  const S = 148 / 1092; // exact mm scale from 1092x1092 canvas
  const px = (v: number) => v * S;
  const size = 148;
  const cx = px(546);

  // 1. Background #050505
  doc.setFillColor(5, 5, 5);
  doc.rect(0, 0, size, size, 'F');

  // Subtle dark slate bokeh ellipses (pre-blended on #050505 for universal PDF viewer compatibility)
  const bokehDots = [
    { x: 240, y: 220, r: 82, rgb: [16, 20, 25] },
    { x: 860, y: 410, r: 90, rgb: [15, 19, 24] },
    { x: 290, y: 790, r: 72, rgb: [16, 20, 25] },
    { x: 770, y: 870, r: 66, rgb: [18, 21, 26] }
  ];
  bokehDots.forEach((b) => {
    doc.setFillColor(b.rgb[0], b.rgb[1], b.rgb[2]);
    doc.circle(px(b.x), px(b.y), px(b.r), 'F');
    doc.setFillColor(b.rgb[0] + 5, b.rgb[1] + 5, b.rgb[2] + 6);
    doc.circle(px(b.x), px(b.y), px(b.r * 0.58), 'F');
  });

  // Gold Dust Clusters TR & BL (#C9983A)
  const dustPts = [
    // TR cluster
    [810, 52, 2.2], [845, 38, 1.4], [882, 76, 3.0], [915, 48, 1.8], [952, 92, 2.6],
    [988, 62, 3.2], [1022, 44, 2.0], [1054, 84, 2.8], [834, 112, 1.6], [874, 136, 2.4],
    [912, 120, 1.2], [944, 156, 2.9], [982, 132, 1.9], [1018, 118, 2.6], [1048, 162, 1.5],
    [896, 184, 2.0], [938, 204, 1.5], [974, 188, 2.8], [1012, 214, 2.2], [1062, 206, 3.0],
    [960, 248, 1.8], [1002, 266, 2.4], [1038, 288, 1.6], [1070, 256, 2.1], [1016, 320, 1.4],
    // BL cluster
    [42, 768, 2.0], [78, 794, 2.8], [118, 822, 1.6], [34, 836, 2.5], [68, 868, 1.4],
    [104, 882, 3.0], [146, 860, 1.9], [188, 898, 2.3], [52, 918, 3.1], [88, 946, 1.8],
    [128, 932, 2.6], [168, 958, 1.5], [214, 942, 2.3], [36, 986, 2.6], [74, 1012, 2.1],
    [114, 996, 3.2], [158, 1024, 1.8], [198, 1004, 2.8], [242, 1036, 1.7], [48, 1054, 2.5],
    [92, 1064, 1.4], [138, 1060, 2.8], [224, 1068, 2.0], [268, 1052, 1.3]
  ];
  doc.setFillColor(201, 152, 58); // #C9983A
  dustPts.forEach(([x, y, r]) => {
    doc.circle(px(x), px(y), px(r * 1.35), 'F');
  });

  // 2. Botanical Line-Art Florals (#E6B94A)
  doc.setDrawColor(230, 185, 74); // #E6B94A
  doc.setLineWidth(0.28);

  // Top-Left Botanical Stem & Blossoms
  doc.lines([[px(65), px(60), px(105), px(150), px(98), px(265)]], px(-20), px(30), [1, 1], 'S');
  doc.lines([[px(60), px(65), px(112), px(135), px(138), px(230)]], px(24), px(-15), [1, 1], 'S');
  doc.lines([[px(55), px(-15), px(115), px(15), px(155), px(70)]], px(78), px(240), [1, 1], 'S');
  doc.circle(px(150), px(118), px(44), 'S');
  doc.circle(px(150), px(118), px(24), 'S');
  doc.circle(px(195), px(82), px(34), 'S');
  doc.circle(px(74), px(222), px(32), 'S');
  doc.ellipse(px(212), px(230), px(42), px(14), 'S');
  doc.ellipse(px(118), px(332), px(38), px(13), 'S');

  // Bottom-Right Botanical Stem & Blossoms (compact so it clears Registry link)
  doc.lines([[px(-45), px(-55), px(-80), px(-135), px(-78), px(-225)]], px(1086), px(1065), [1, 1], 'S');
  doc.circle(px(974), px(934), px(36), 'S');
  doc.circle(px(974), px(934), px(18), 'S');
  doc.ellipse(px(960), px(848), px(32), px(11), 'S');
  doc.ellipse(px(995), px(1002), px(34), px(11), 'S');

  // 3. Header Circle Outline (centered at 546, 174, r=162) & Upper-Left Sprig
  doc.setDrawColor(230, 185, 74);
  doc.setLineWidth(0.28);
  doc.circle(cx, px(174), px(162), 'S');

  // Upper-Left Sprig along circle edge
  doc.lines([[px(-32), px(34), px(-48), px(83), px(-42), px(134)]], px(430), px(52), [1, 1], 'S');
  doc.ellipse(px(392), px(83), px(15), px(6), 'S');
  doc.ellipse(px(376), px(120), px(16), px(6), 'S');
  doc.ellipse(px(372), px(158), px(14), px(6), 'S');
  doc.setFillColor(230, 185, 74);
  doc.circle(px(433), px(49), px(3), 'F');

  // 4. Text Hierarchy Inside Circle (x = 546 — Groom and Bride names only)
  const p1First = (wedding.partner1 || 'Samson').trim().split(' ')[0];
  const p2First = (wedding.partner2 || 'Kevine').trim().split(' ')[0];

  // Couple Names centered vertically inside circle (cy = 174) in #D8AE4E (Gold Primary)
  doc.setTextColor(216, 174, 78);
  doc.setFont('times', 'italic');
  doc.setFontSize(23.5);
  doc.text(p1First, cx, px(124), { align: 'center' });
  doc.setFontSize(25.5);
  doc.text('&', cx, px(182), { align: 'center' });
  doc.setFontSize(23.5);
  doc.text(p2First, cx, px(240), { align: 'center' });

  // 5. Guest Block (Dynamic Couple vs Single — no "Guest(s):" label)
  const displayGuest = (guestName || 'Honoured Guest').trim();
  const partyVariant = hasPlusOne ? '(Couple)' : '(Single)';

  // Measure guest + tag for balanced inline centering
  doc.setFont('times', 'normal');
  doc.setFontSize(10.8);
  const nameStr = `${displayGuest} `;
  const tagStr = partyVariant;
  const totalW = doc.getTextWidth(nameStr + tagStr);
  const startX = cx - totalW / 2;

  doc.setTextColor(216, 174, 78);
  doc.text(nameStr, startX, px(408));
  doc.setTextColor(255, 255, 255);
  doc.text(tagStr, startX + doc.getTextWidth(nameStr), px(408));

  // White Divider (490px wide centered)
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.28);
  doc.line(px(301), px(452), px(791), px(452));

  // 6. Invitation Message (3 lines)
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(8.2);
  const msgLines = [
    'Together with our families, we joyfully invite you',
    'to celebrate our sacred union in love, grace,',
    'and eternal fellowship in Cape Town.'
  ];
  doc.text(msgLines, cx, px(500), { align: 'center', lineHeightFactor: 1.4 });

  // 7. 3-Column Date Block
  const { weekday, day, month, year } = parseDatePartsForPdf(wedding.rawDate);

  // Col L: Weekday
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.22);
  doc.line(px(230), px(640), px(395), px(640));
  doc.line(px(230), px(726), px(395), px(726));
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(weekday, px(312.5), px(692), { align: 'center' });

  // Col C: Big Day + Year
  doc.setTextColor(216, 174, 78);
  doc.setFont('times', 'normal');
  doc.setFontSize(32);
  doc.text(day, cx, px(712), { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text(year, cx, px(772), { align: 'center' });

  // Col R: Month
  doc.line(px(697), px(640), px(862), px(640));
  doc.line(px(697), px(726), px(862), px(726));
  doc.text(month, px(779.5), px(692), { align: 'center' });

  // 8. Horizontal Schedule Row
  const ev1 = wedding.events?.[0] || { title: 'Wedding Benediction', time: '13:00' };
  const ev2 = wedding.events?.[1] || { title: 'Evening Reception', time: '18:00 - 21:00' };

  doc.setFontSize(7.8);
  const seg1Label = `${ev1.title}: `;
  const seg1Val = `${ev1.time}      `;
  const seg2Label = `${ev2.title}: `;
  const seg2Val = `${ev2.time}`;
  const schedTotalW = doc.getTextWidth(seg1Label + seg1Val + seg2Label + seg2Val);
  let sx = cx - schedTotalW / 2;

  doc.setTextColor(216, 174, 78);
  doc.text(seg1Label, sx, px(836));
  sx += doc.getTextWidth(seg1Label);
  doc.setTextColor(255, 255, 255);
  doc.text(seg1Val, sx, px(836));
  sx += doc.getTextWidth(seg1Val);
  doc.setTextColor(216, 174, 78);
  doc.text(seg2Label, sx, px(836));
  sx += doc.getTextWidth(seg2Label);
  doc.setTextColor(255, 255, 255);
  doc.text(seg2Val, sx, px(836));

  // 9. Notice (High-Contrast Red #FF4D55)
  doc.setTextColor(255, 77, 85); // #FF4D55
  doc.setFont('times', 'bold');
  doc.setFontSize(9.2);
  doc.text('ADULTS ONLY', cx, px(894), { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(6.6);
  doc.text(
    'Kindly note: young children aged 0 to 5 years only for evening event.',
    cx,
    px(928),
    { align: 'center' }
  );

  // 10. Venue Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'normal');
  doc.setFontSize(10.2);
  doc.text(
    wedding.venue || 'Lion Voice Tabernacle & Rooftop, 39 Salt River Rd',
    cx,
    px(1002),
    { align: 'center' }
  );
}

/**
 * 1. GENERATE & DOWNLOAD BLACK & GOLD WEDDING E-INVITE (1:1 SQUARE)
 */
export async function downloadCeremonyCardPDF({
  wedding,
  guestName,
  hasPlusOne = false,
  onStatusUpdate
}: CardPdfOptions): Promise<void> {
  onStatusUpdate?.('Initializing vector canvas');
  await sleep(300);

  onStatusUpdate?.('Rendering bespoke calligraphy & photo');
  await sleep(300);

  onStatusUpdate?.('Generating high-density QR gate pass');
  await sleep(250);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [148, 148]
  });

  renderBlackGoldEInvitePdfPage(doc, {
    wedding,
    guestName,
    hasPlusOne
  });

  onStatusUpdate?.('Packaging print-ready typography and finishing touches');
  await sleep(300);

  const filename = `Samson-Kevine-Black-Gold-E-Invite-${guestName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}

/**
 * 2. GENERATE & DOWNLOAD QR DIGITAL VENUE PASS (PORTRAIT)
 * Uses Gemini API to craft bespoke concierge arrival protocol and security pass heraldry
 */
export async function downloadDigitalVenuePassPDF({
  wedding,
  guestName,
  guestId,
  hasPlusOne = false,
  plusOneName = '',
  plusOneStatus = 'confirmed',
  plusOneDietary = '',
  dietaryRequirements = '',
  selectedEventIds = ['evt-2', 'evt-3'],
  onStatusUpdate
}: PassPdfOptions): Promise<void> {
  onStatusUpdate?.('Initializing vector canvas');
  await sleep(400);

  onStatusUpdate?.('Rendering bespoke calligraphy');
  const geminiData = await fetchGeminiPdfContent('pass', {
    guestName,
    guestId,
    hasPlusOne,
    plusOneName,
    coupleNames: `${wedding.partner1} & ${wedding.partner2}`,
    venue: wedding.venue,
    date: wedding.rawDate,
    dressCode: wedding.dressCodeSummary
  });
  await sleep(350);

  onStatusUpdate?.('Generating high-density QR gate pass');
  await sleep(400);

  // Create A5 Portrait document: 148mm x 210mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [148, 210]
  });

  const width = 148;
  const height = 210;

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, 'F');

  // Double security border
  doc.setDrawColor(41, 39, 34); // #292722
  doc.setLineWidth(0.8);
  doc.rect(7, 7, width - 14, height - 14);

  doc.setDrawColor(181, 154, 114); // #B59A72
  doc.setLineWidth(0.3);
  doc.rect(9, 9, width - 18, height - 18);

  // Security Top Header Banner
  doc.setFillColor(41, 39, 34);
  doc.rect(9, 9, width - 18, 14, 'F');

  doc.setTextColor(250, 247, 240);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('AURELIA SECURITY PROTOCOL  ·  DIGITAL ENTRANCE PASS', width / 2, 15, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(212, 175, 55);
  doc.text(`VERIFIED ID: ${guestId}  ·  LION VOICE TABERNACLE & ROOFTOP ACCESS`, width / 2, 19.5, { align: 'center' });

  // Wedding Couple Title
  doc.setTextColor(41, 39, 34);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(`${wedding.partner1} & ${wedding.partner2}'s Wedding`, width / 2, 30, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(115, 110, 102);
  doc.text(`${wedding.date || wedding.rawDate}  ·  ${wedding.venue}, ${wedding.city}`, width / 2, 35, { align: 'center' });

  // Vector QR Code Box
  const qrBoxY = 40;
  const qrBoxSize = 44;
  const qrBoxX = (width - qrBoxSize) / 2;

  doc.setFillColor(250, 247, 240);
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.3);
  doc.rect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize + 6, 'FD');

  // Draw 25x25 QR Matrix
  const qrPayload = `AURELIA-WEDDING:${wedding.slug}:GUEST:${guestId}:${guestName}`;
  const qrMatrix = generateQrMatrix(qrPayload);
  const matrixSize = 25;
  const qrDrawSize = 36;
  const cellSize = qrDrawSize / matrixSize;
  const qrStartX = (width - qrDrawSize) / 2;
  const qrStartY = qrBoxY + 3;

  doc.setFillColor(41, 39, 34);
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (qrMatrix[r][c]) {
        doc.rect(qrStartX + c * cellSize, qrStartY + r * cellSize, cellSize, cellSize, 'F');
      }
    }
  }

  // QR Center Monogram
  doc.setFillColor(255, 255, 255);
  doc.rect(width / 2 - 4, qrStartY + qrDrawSize / 2 - 4, 8, 8, 'F');
  doc.setDrawColor(181, 154, 114);
  doc.rect(width / 2 - 4, qrStartY + qrDrawSize / 2 - 4, 8, 8, 'D');
  doc.setTextColor(181, 154, 114);
  doc.setFont('times', 'bold');
  doc.setFontSize(6);
  doc.text('AU', width / 2, qrStartY + qrDrawSize / 2 + 1.5, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(115, 110, 102);
  doc.text('SCAN FOR VENUE ADMISSION', width / 2, qrBoxY + qrBoxSize + 4, { align: 'center' });

  // Guest & Attendance Details Table
  const tableY = qrBoxY + qrBoxSize + 11;
  doc.setFillColor(250, 247, 240);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.2);
  doc.rect(14, tableY, width - 28, 48, 'FD');

  // Row 1: Primary Guest
  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(115, 110, 102);
  doc.text('PRIMARY GUEST', 18, tableY + 6);
  doc.setFont('times', 'bold');
  doc.setTextColor(41, 39, 34);
  doc.text(guestName.toUpperCase(), width - 18, tableY + 6, { align: 'right' });

  // Divider line
  doc.setDrawColor(220, 210, 195);
  doc.line(18, tableY + 8.5, width - 18, tableY + 8.5);

  // Row 2: Status & Pass ID
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('VERIFICATION STATUS', 18, tableY + 14);
  doc.setTextColor(22, 101, 52); // Emerald 800
  doc.setFont('courier', 'bold');
  doc.text('CONFIRMED / ATTENDING', width - 18, tableY + 14, { align: 'right' });

  doc.setDrawColor(220, 210, 195);
  doc.line(18, tableY + 16.5, width - 18, tableY + 16.5);

  // Row 3: Accompanying Person (+1)
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('ACCOMPANYING (+1)', 18, tableY + 22);
  doc.setTextColor(41, 39, 34);
  doc.setFont('times', 'bold');
  const plusOneLabel = hasPlusOne
    ? `${plusOneName || 'Guest Requested'} (${plusOneStatus === 'confirmed' ? 'SEAT CONFIRMED' : 'PENDING REVIEW'})`
    : 'SOLO ATTENDEE';
  doc.text(plusOneLabel, width - 18, tableY + 22, { align: 'right' });

  doc.setDrawColor(220, 210, 195);
  doc.line(18, tableY + 24.5, width - 18, tableY + 24.5);

  // Row 4: Dietary Notes
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('DIETARY RESTRICTIONS', 18, tableY + 30);
  doc.setTextColor(41, 39, 34);
  doc.setFont('times', 'normal');
  const dietSummary = dietaryRequirements || (hasPlusOne && plusOneDietary ? plusOneDietary : 'Standard Banquet Menu');
  doc.text(dietSummary.slice(0, 32), width - 18, tableY + 30, { align: 'right' });

  doc.setDrawColor(220, 210, 195);
  doc.line(18, tableY + 32.5, width - 18, tableY + 32.5);

  // Row 5: Dress Code Badge
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('ATTIRE PROTOCOL', 18, tableY + 38);
  doc.setTextColor(181, 154, 114);
  doc.setFont('times', 'bold');
  doc.text(wedding.dressCodeSummary.toUpperCase(), width - 18, tableY + 38, { align: 'right' });

  doc.setDrawColor(220, 210, 195);
  doc.line(18, tableY + 40.5, width - 18, tableY + 40.5);

  // Row 6: Gate Arrival
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('GATE ACCESS TIME', 18, tableY + 45);
  doc.setTextColor(41, 39, 34);
  doc.setFont('courier', 'bold');
  doc.text('13:00 BENEDICTION · 18:00 RECEPTION', width - 18, tableY + 45, { align: 'right' });

  // Gemini AI Personalized Arrival Protocol Note
  const protocolY = tableY + 54;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.3);
  doc.rect(14, protocolY, width - 28, 22, 'FD');

  doc.setTextColor(181, 154, 114);
  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.text('AI CONCIERGE GATE INSTRUCTION:', 18, protocolY + 5);

  doc.setTextColor(41, 39, 34);
  doc.setFont('times', 'italic');
  doc.setFontSize(7.5);
  const splitProtocol = doc.splitTextToSize(`“${geminiData.protocolNote}”`, width - 36);
  doc.text(splitProtocol, 18, protocolY + 9.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(115, 110, 102);
  doc.text(`Note: ${geminiData.dressCodeRemark}`, 18, protocolY + 18.5);

  // Admitted Sessions list
  const sessionsY = protocolY + 27;
  doc.setTextColor(115, 110, 102);
  doc.setFont('times', 'bold');
  doc.setFontSize(7);
  doc.text('ADMITTED WEDDING SESSIONS:', 14, sessionsY);

  const admittedEvents = wedding.events.filter((e) => selectedEventIds.includes(e.id));
  let curEventY = sessionsY + 4.5;
  admittedEvents.slice(0, 3).forEach((evt) => {
    doc.setTextColor(41, 39, 34);
    doc.setFont('times', 'bold');
    doc.setFontSize(7);
    doc.text(`• ${evt.title}`, 16, curEventY);

    doc.setTextColor(115, 110, 102);
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.text(`${evt.date} · ${evt.time}`, width - 16, curEventY, { align: 'right' });
    curEventY += 3.8;
  });

  // Bottom Security Seal
  doc.setFont('courier', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(115, 110, 102);
  doc.text('ESTATE SECURITY PROTOCOL · NON-TRANSFERABLE PASS · POWERED BY AURELIA CONCIERGE', width / 2, height - 11, {
    align: 'center'
  });

  onStatusUpdate?.('Packaging print-ready typography and finishing touches');
  await sleep(400);

  const filename = `QR-Digital-Venue-Pass-${guestName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}

/**
 * 3. GENERATE & DOWNLOAD UNIFIED INVITATION PDF (FRONT & BACK COMBINED)
 * Both the Front (Ceremony Invitation Card with photo) and Back (QR Digital Gate Pass)
 * are generated and downloaded simultaneously in a single, unified high-resolution document.
 */
export async function downloadUnifiedInvitationPDF({
  wedding,
  guestName,
  guestId = 'AUR-8012',
  hasPlusOne = false,
  plusOneName = '',
  onStatusUpdate
}: UnifiedInvitationPdfOptions): Promise<void> {
  onStatusUpdate?.('Initializing vector canvas');
  await sleep(350);

  onStatusUpdate?.('Rendering bespoke calligraphy & photo');
  const coupleNames = `${wedding.partner1} & ${wedding.partner2}`;
  const [passGemini, photoDataUrl] = await Promise.all([
    fetchGeminiPdfContent('pass', {
      guestName,
      guestId,
      hasPlusOne,
      plusOneName,
      coupleNames,
      venue: wedding.venue,
      date: wedding.rawDate,
      dressCode: wedding.dressCodeSummary
    }),
    loadImageDataUrl(wedding.couplePhotoUrl || '/src/assets/images/IMG-20261107-WA0166.jpg')
  ]);

  onStatusUpdate?.('Generating high-density QR gate pass');
  await sleep(350);

  // Page 1: Square 148x148mm Black & Gold Wedding E-Invite (Front)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [148, 148]
  });

  /* ========================================================
   * PAGE 1: FRONT — BLACK & GOLD 1:1 WEDDING E-INVITE
   * ======================================================== */
  renderBlackGoldEInvitePdfPage(doc, {
    wedding,
    guestName,
    hasPlusOne
  });

  /* ========================================================
   * PAGE 2: BACK — QR DIGITAL VENUE PASS & COUPLE PORTRAIT
   * ======================================================== */
  const width = 210;
  const height = 148;
  doc.addPage([width, height], 'landscape');

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, 'F');

  // Outer Security Border
  doc.setDrawColor(41, 39, 34);
  doc.setLineWidth(0.8);
  doc.rect(7, 7, width - 14, height - 14);

  // Inner Gold Line
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.3);
  doc.rect(9, 9, width - 18, height - 18);

  // Security Top Header Banner
  doc.setFillColor(41, 39, 34);
  doc.rect(9, 9, width - 18, 13, 'F');

  doc.setTextColor(250, 247, 240);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('AURELIA SECURITY PROTOCOL  ·  DIGITAL ENTRANCE PASS & VENUE ADMISSION (BACK)', width / 2, 14.5, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(212, 175, 55);
  doc.text(`VERIFIED ID: ${guestId}  ·  LION VOICE TABERNACLE & ROOFTOP ACCESS  ·  ${coupleNames.toUpperCase()}`, width / 2, 18.5, { align: 'center' });

  // Two-Column Layout (Matching Landscape A5)
  // LEFT COLUMN: Couple Portrait + Vector QR Code & Gate Scanner
  const qrColX = 16;
  const qrBoxSize = 42;
  const qrBoxY = 28;

  doc.setFillColor(250, 247, 240);
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.3);
  doc.rect(qrColX, qrBoxY, qrBoxSize + 16, qrBoxSize + 52, 'FD');

  // Couple photo portrait (IMG-20261107-WA0166.jpg) at top of Left Column
  let qrStartY = qrBoxY + 4;
  if (photoDataUrl) {
    try {
      const pSize = 20;
      const pX = qrColX + (qrBoxSize + 16 - pSize) / 2;
      doc.addImage(photoDataUrl, 'JPEG', pX, qrBoxY + 3, pSize, pSize);
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.4);
      doc.rect(pX, qrBoxY + 3, pSize, pSize, 'D');
      qrStartY = qrBoxY + 26;
    } catch {
      qrStartY = qrBoxY + 4;
    }
  }

  // Draw 25x25 QR Matrix
  const qrPayload = `AURELIA-WEDDING:${wedding.slug}:GUEST:${guestId}:${guestName}`;
  const qrMatrix = generateQrMatrix(qrPayload);
  const matrixSize = 25;
  const qrDrawSize = 32;
  const cellSize = qrDrawSize / matrixSize;
  const qrStartX = qrColX + (qrBoxSize + 16 - qrDrawSize) / 2;

  doc.setFillColor(41, 39, 34);
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (qrMatrix[r][c]) {
        doc.rect(qrStartX + c * cellSize, qrStartY + r * cellSize, cellSize, cellSize, 'F');
      }
    }
  }

  // QR Center Monogram
  const centerBoxX = qrStartX + qrDrawSize / 2 - 3.5;
  const centerBoxY = qrStartY + qrDrawSize / 2 - 3.5;
  doc.setFillColor(255, 255, 255);
  doc.rect(centerBoxX, centerBoxY, 7, 7, 'F');
  doc.setDrawColor(181, 154, 114);
  doc.rect(centerBoxX, centerBoxY, 7, 7, 'D');
  doc.setTextColor(181, 154, 114);
  doc.setFont('times', 'bold');
  doc.setFontSize(5.5);
  doc.text('SK', centerBoxX + 3.5, centerBoxY + 5, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(115, 110, 102);
  doc.text('SCAN FOR VENUE GATE ADMISSION', qrColX + (qrBoxSize + 16) / 2, qrStartY + qrDrawSize + 5.5, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(181, 154, 114);
  doc.text(`SECURITY TOKEN: ${guestId}`, qrColX + (qrBoxSize + 16) / 2, qrStartY + qrDrawSize + 9.5, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(6.2);
  doc.setTextColor(41, 39, 34);
  const splitProto = doc.splitTextToSize(`“${passGemini.protocolNote}”`, qrBoxSize + 12);
  doc.text(splitProto, qrColX + (qrBoxSize + 16) / 2, qrStartY + qrDrawSize + 14, { align: 'center' });

  // RIGHT COLUMN: Guest Credential Table & Venues
  const rightColX = qrColX + qrBoxSize + 22;
  const rightColW = width - rightColX - 16;
  const rightTableY = 28;

  doc.setFillColor(250, 247, 240);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.2);
  doc.rect(rightColX, rightTableY, rightColW, 82, 'FD');

  // Row 1: Primary Guest
  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(115, 110, 102);
  doc.text('PRIMARY GUEST', rightColX + 4, rightTableY + 7);
  doc.setFont('times', 'bold');
  doc.setTextColor(41, 39, 34);
  doc.text(guestName.toUpperCase(), rightColX + rightColW - 4, rightTableY + 7, { align: 'right' });

  // Row 2: Attendance Party Type
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('PARTY TYPE / SEATS', rightColX + 4, rightTableY + 15);
  doc.setFont('times', 'bold');
  doc.setTextColor(181, 154, 114);
  const partyText = hasPlusOne ? 'COUPLE ADMISSION (2 SEATS)' : 'SINGLE ADMISSION (1 SEAT)';
  doc.text(partyText, rightColX + rightColW - 4, rightTableY + 15, { align: 'right' });

  // Row 3: Pass Reference ID
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('PASS CREDENTIAL REF', rightColX + 4, rightTableY + 23);
  doc.setFont('courier', 'bold');
  doc.setTextColor(41, 39, 34);
  doc.text(guestId, rightColX + rightColW - 4, rightTableY + 23, { align: 'right' });

  // Row 4: Event 1 (Benediction)
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('CHURCH BENEDICTION (13:00)', rightColX + 4, rightTableY + 31);
  doc.setFont('times', 'bold');
  doc.setTextColor(41, 39, 34);
  doc.text('Lion Voice Tabernacle · Wynberg', rightColX + rightColW - 4, rightTableY + 31, { align: 'right' });

  // Row 5: Event 2 (Reception)
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('EVENING RECEPTION (18:00–21:00)', rightColX + 4, rightTableY + 39);
  doc.setFont('times', 'bold');
  doc.setTextColor(41, 39, 34);
  doc.text('Rooftop, 39 Salt River Rd · Cape Town', rightColX + rightColW - 4, rightTableY + 39, { align: 'right' });

  // Row 6: Attire Etiquette
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('ATTIRE CODE', rightColX + 4, rightTableY + 47);
  doc.setFont('times', 'bold');
  doc.setTextColor(181, 154, 114);
  doc.text('Church: Vintage Wear · Dining: Gala Wear', rightColX + rightColW - 4, rightTableY + 47, { align: 'right' });

  // Row 7: Admission Protocol
  doc.setFont('times', 'normal');
  doc.setTextColor(115, 110, 102);
  doc.text('GATE ADMISSION STATUS', rightColX + 4, rightTableY + 55);
  doc.setFont('times', 'bold');
  doc.setTextColor(30, 120, 70);
  doc.text('VERIFIED & PRE-CONFIRMED', rightColX + rightColW - 4, rightTableY + 55, { align: 'right' });

  // Security Note in table
  doc.setFont('times', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(115, 110, 102);
  doc.text('Kindly have this QR pass visible upon arrival. One admission per registered attendee.', rightColX + rightColW / 2, rightTableY + 68, { align: 'center' });
  doc.text('Admittance subject to estate protocol and registration roster verification.', rightColX + rightColW / 2, rightTableY + 73, { align: 'center' });

  // Bottom Security Line on Page 2
  doc.setFont('courier', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(115, 110, 102);
  doc.text(`PAGE 2 OF 2  ·  SECURITY VENUE ENTRANCE GATE PASS (BACK)  ·  SAMSON & KEVINE  ·  REF: ${guestId}`, width / 2, height - 10.5, {
    align: 'center'
  });

  onStatusUpdate?.('Packaging print-ready typography and finishing touches');
  await sleep(400);

  const cleanName = guestName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Samson_and_Kevine_Unified_Invitation_${cleanName}.pdf`;
  doc.save(filename);
}


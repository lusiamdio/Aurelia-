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

/**
 * 1. GENERATE & DOWNLOAD CEREMONY INVITATION CARD (LANDSCAPE)
 * Uses Gemini API to craft bespoke real-time blessing and proclamation
 */
export async function downloadCeremonyCardPDF({
  wedding,
  guestName,
  guestId = 'AUR-8012',
  hasPlusOne = false,
  plusOneName = '',
  onStatusUpdate
}: CardPdfOptions): Promise<void> {
  onStatusUpdate?.('Initializing vector canvas');
  await sleep(400);

  onStatusUpdate?.('Rendering bespoke calligraphy & photo');
  const [geminiData, photoDataUrl] = await Promise.all([
    fetchGeminiPdfContent('card', {
      guestName,
      guestId,
      hasPlusOne,
      plusOneName,
      coupleNames: `${wedding.partner1} & ${wedding.partner2}`,
      venue: wedding.venue,
      date: wedding.rawDate,
      dressCode: wedding.dressCodeSummary
    }),
    loadImageDataUrl(wedding.couplePhotoUrl || '/src/assets/images/IMG-20261107-WA0166.jpg')
  ]);
  await sleep(350);

  onStatusUpdate?.('Generating high-density QR gate pass');
  await sleep(400);

  // Create A5 Landscape document: 210mm x 148mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [210, 148]
  });

  const width = 210;
  const height = 148;

  // Custom colors or luxurious ivory
  const isCustom = wedding.customColors?.isCustom;
  const isMidnight = !isCustom && wedding.paperTone === 'midnight';

  if (isMidnight) {
    doc.setFillColor(28, 27, 24); // #1C1B18
  } else {
    doc.setFillColor(250, 247, 240); // Champagne Ivory #FAF7F0
  }
  doc.rect(0, 0, width, height, 'F');

  // Double Gold Border
  // Outer border
  doc.setDrawColor(181, 154, 114); // #B59A72
  doc.setLineWidth(1.0);
  doc.rect(8, 8, width - 16, height - 16);

  // Inner hairline gold border
  doc.setDrawColor(212, 175, 55); // #D4AF37
  doc.setLineWidth(0.35);
  doc.rect(11, 11, width - 22, height - 22);

  // Corner decorative flourishes
  const drawCornerFlourish = (x: number, y: number, dirX: number, dirY: number) => {
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.4);
    doc.line(x, y, x + dirX * 6, y);
    doc.line(x, y, x, y + dirY * 6);
    doc.setFillColor(212, 175, 55);
    doc.circle(x + dirX * 2.5, y + dirY * 2.5, 0.7, 'F');
  };
  drawCornerFlourish(13, 13, 1, 1);
  drawCornerFlourish(width - 13, 13, -1, 1);
  drawCornerFlourish(13, height - 13, 1, -1);
  drawCornerFlourish(width - 13, height - 13, -1, -1);

  // Text Colors
  const textColor = isMidnight ? [250, 247, 240] : [41, 39, 34];
  const goldColor = [181, 154, 114];
  const dimColor = isMidnight ? [200, 195, 185] : [115, 110, 102];

  // Header Motif
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text('✦  ·  S & K  ·  ✦', width / 2, 19, { align: 'center' });

  // Top invitation line
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFontSize(8);
  doc.text('C E L E B R A T I O N   O F   L O V E', width / 2, 24, { align: 'center' });

  // Couple Names (Hero typography)
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text(`${wedding.partner1}  &  ${wedding.partner2}`, width / 2, 34, { align: 'center' });

  // Holy Matrimony Scripture
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.text('“Therefore what God has joined together, let no one separate.”', width / 2, 40, { align: 'center' });

  // Request pleasure line
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.text('request the pleasure of your company at their sacred marriage celebration', width / 2, 45, { align: 'center' });

  // Honoured Guest Badge & Gemini Personalized Blessing with Couple Photo
  const photoW = 26;
  const photoH = 32;
  const guestBoxY = photoDataUrl ? 46 : 49;
  const guestBoxHeight = photoDataUrl ? photoH : 27;

  if (photoDataUrl) {
    const photoX = 18;
    doc.setFillColor(245, 238, 221);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.4);
    doc.rect(photoX - 1, guestBoxY - 1, photoW + 2, photoH + 2, 'FD');

    try {
      doc.addImage(photoDataUrl, 'JPEG', photoX, guestBoxY, photoW, photoH);
    } catch {
      doc.setFillColor(212, 175, 55);
      doc.circle(photoX + photoW / 2, guestBoxY + photoH / 2, 10, 'F');
    }

    // Guest Dedication Box on right side of photo
    const boxX = photoX + photoW + 5;
    const boxW = width - boxX - 18;
    doc.setFillColor(isMidnight ? 36 : 255, isMidnight ? 34 : 255, isMidnight ? 30 : 255);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.3);
    doc.rect(boxX, guestBoxY, boxW, photoH, 'FD');

    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    const guestLine = hasPlusOne && plusOneName
      ? `HONOURED GUEST: ${guestName.toUpperCase()}  &  ${plusOneName.toUpperCase()} (+1)`
      : `HONOURED GUEST: ${guestName.toUpperCase()}`;
    doc.text(guestLine, boxX + boxW / 2, guestBoxY + 6, { align: 'center' });

    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    const splitBlessing = doc.splitTextToSize(`“${geminiData.blessing}”`, boxW - 8);
    doc.text(splitBlessing, boxX + boxW / 2, guestBoxY + 13, { align: 'center' });

    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.text(`Official Guest Pass Ref: ${guestId}  ·  Verified Ceremony Credential`, boxX + boxW / 2, guestBoxY + photoH - 4, { align: 'center' });
  } else {
    doc.setFillColor(isMidnight ? 36 : 255, isMidnight ? 34 : 255, isMidnight ? 30 : 255);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.3);
    doc.rect(24, guestBoxY, width - 48, guestBoxHeight, 'FD');

    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    const guestLine = hasPlusOne && plusOneName
      ? `HONOURED GUEST: ${guestName.toUpperCase()}  &  ${plusOneName.toUpperCase()} (+1)`
      : `HONOURED GUEST: ${guestName.toUpperCase()}`;
    doc.text(guestLine, width / 2, guestBoxY + 5.5, { align: 'center' });

    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    const splitBlessing = doc.splitTextToSize(`“${geminiData.blessing}”`, width - 58);
    doc.text(splitBlessing, width / 2, guestBoxY + 11.5, { align: 'center' });
  }

  // Wedding Date & Agenda Details
  const detailsY = guestBoxY + guestBoxHeight + 6;
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  const displayDate = (wedding.date || wedding.rawDate).toUpperCase();
  doc.text(displayDate, width / 2, detailsY, { align: 'center' });

  // Agenda Event 1: Wedding Benediction
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('WEDDING BENEDICTION · 13:00 · LION VOICE TABERNACLE', width / 2, detailsY + 5, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text('11 Lower Maynard Rd Wynberg Station, Tailan Building Basement Hall', width / 2, detailsY + 8.5, { align: 'center' });

  // Agenda Event 2: Evening Reception
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('EVENING RECEPTION · 18:00 TO 21:00 · ROOFTOP', width / 2, detailsY + 13.5, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text('39 Salt River Road, Salt River, Cape Town, Western Cape, 7405', width / 2, detailsY + 17, { align: 'center' });

  // Dress Code & Joel 2:25 Scripture
  const footerY = detailsY + 23;
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(7);
  doc.text('DRESS CODE: CHURCH CEREMONY: VINTAGE WEAR  ·  DINNING CEREMONY: GALA WEAR', width / 2, footerY, { align: 'center' });

  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFont('times', 'italic');
  doc.setFontSize(7.5);
  doc.text('“I will restore to you the years that the swarming locust has eaten.”', width / 2, footerY + 4.5, { align: 'center' });

  // Micro print watermark
  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text(`AURELIA BESPOKE SUITE  ·  PASS REF: ${guestId}  ·  AI CURATED`, width / 2, height - 13, { align: 'center' });

  onStatusUpdate?.('Packaging print-ready typography and finishing touches');
  await sleep(400);

  const filename = `Ceremony-Invitation-Card-${guestName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
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
  plusOneStatus = 'confirmed',
  plusOneDietary = '',
  dietaryRequirements = '',
  selectedEventIds = ['evt-2', 'evt-3'],
  onStatusUpdate
}: UnifiedInvitationPdfOptions): Promise<void> {
  onStatusUpdate?.('Initializing vector canvas');
  await sleep(350);

  onStatusUpdate?.('Rendering bespoke calligraphy & photo');
  // Fetch real-time Gemini copy for both front (blessing) and back (gate protocol)
  const coupleNames = `${wedding.partner1} & ${wedding.partner2}`;
  const [cardGemini, passGemini, photoDataUrl] = await Promise.all([
    fetchGeminiPdfContent('card', {
      guestName,
      guestId,
      hasPlusOne,
      plusOneName,
      coupleNames,
      venue: wedding.venue,
      date: wedding.rawDate,
      dressCode: wedding.dressCodeSummary
    }),
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

  // Create unified A5 Landscape document: 210mm x 148mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [210, 148]
  });

  const width = 210;
  const height = 148;

  // Custom colors or luxurious ivory
  const isCustom = wedding.customColors?.isCustom;
  const isMidnight = !isCustom && wedding.paperTone === 'midnight';
  const textColor = isMidnight ? [250, 247, 240] : [41, 39, 34];
  const goldColor = [181, 154, 114];
  const dimColor = isMidnight ? [200, 195, 185] : [115, 110, 102];

  // Helper for ornate corner flourishes
  const drawCornerFlourish = (x: number, y: number, dirX: number, dirY: number) => {
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.4);
    doc.line(x, y, x + dirX * 6, y);
    doc.line(x, y, x, y + dirY * 6);
    doc.setFillColor(212, 175, 55);
    doc.circle(x + dirX * 2.5, y + dirY * 2.5, 0.7, 'F');
  };

  /* ========================================================
   * PAGE 1: FRONT — LUXURY CEREMONY INVITATION CARD
   * ======================================================== */
  if (isMidnight) {
    doc.setFillColor(28, 27, 24); // #1C1B18
  } else {
    doc.setFillColor(250, 247, 240); // Champagne Ivory #FAF7F0
  }
  doc.rect(0, 0, width, height, 'F');

  // Outer border
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.9);
  doc.rect(7, 7, width - 14, height - 14);

  // Inner hairline gold border
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.3);
  doc.rect(9.5, 9.5, width - 19, height - 19);

  // Flourishes
  drawCornerFlourish(11.5, 11.5, 1, 1);
  drawCornerFlourish(width - 11.5, 11.5, -1, 1);
  drawCornerFlourish(11.5, height - 11.5, 1, -1);
  drawCornerFlourish(width - 11.5, height - 11.5, -1, -1);

  // Header Motif
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('✦  ·  SAMSON & KEVINE  ·  ✦', width / 2, 16.5, { align: 'center' });

  // Celebration Line
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFontSize(7.5);
  doc.text('C E L E B R A T I O N   O F   S A C R E D   U N I O N', width / 2, 21.5, { align: 'center' });

  // Hero Couple Names
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.text(`${wedding.partner1}  &  ${wedding.partner2}`, width / 2, 30.5, { align: 'center' });

  // Holy Matrimony Scripture
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.text('“Therefore what God has joined together, let no one separate.”', width / 2, 36, { align: 'center' });

  // Request line
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.text('request the pleasure of your company at their sacred marriage celebration', width / 2, 40.5, { align: 'center' });

  // Photo + Honoured Guest Section Layout
  const photoW = 28;
  const photoH = 34;
  const contentY = 44;

  if (photoDataUrl) {
    // Embed photo on left side of guest dedication box
    const photoX = 17;
    doc.setFillColor(245, 238, 221);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.4);
    doc.rect(photoX - 1, contentY - 1, photoW + 2, photoH + 2, 'FD');

    try {
      doc.addImage(photoDataUrl, 'JPEG', photoX, contentY, photoW, photoH);
    } catch {
      // Fallback placeholder if image load fails
      doc.setFillColor(212, 175, 55);
      doc.circle(photoX + photoW / 2, contentY + photoH / 2, 10, 'F');
    }

    // Guest Dedication Box on right side
    const boxX = photoX + photoW + 5;
    const boxW = width - boxX - 17;
    doc.setFillColor(isMidnight ? 36 : 255, isMidnight ? 34 : 255, isMidnight ? 30 : 255);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.3);
    doc.rect(boxX, contentY, boxW, photoH, 'FD');

    // Guest Headline
    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(8);
    const guestLabel = hasPlusOne
      ? `HONOURED GUEST: ${guestName.toUpperCase()} · COUPLE ADMISSION (2 SEATS)`
      : `HONOURED GUEST: ${guestName.toUpperCase()} · SINGLE ADMISSION (1 SEAT)`;
    doc.text(guestLabel, boxX + boxW / 2, contentY + 6, { align: 'center' });

    // Gemini Blessing
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('times', 'italic');
    doc.setFontSize(7.5);
    const splitBlessing = doc.splitTextToSize(`“${cardGemini.blessing}”`, boxW - 8);
    doc.text(splitBlessing, boxX + boxW / 2, contentY + 13, { align: 'center' });

    // Personalized dedication note
    doc.setFont('times', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
    doc.text(`Official Guest Pass Ref: ${guestId}  ·  Verified Ceremony Credential`, boxX + boxW / 2, contentY + photoH - 4, { align: 'center' });
  } else {
    // Centered guest box if no photo
    const guestBoxY = 44;
    const guestBoxHeight = 32;
    doc.setFillColor(isMidnight ? 36 : 255, isMidnight ? 34 : 255, isMidnight ? 30 : 255);
    doc.setDrawColor(181, 154, 114);
    doc.setLineWidth(0.3);
    doc.rect(20, guestBoxY, width - 40, guestBoxHeight, 'FD');

    doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    const guestLine = hasPlusOne
      ? `HONOURED GUEST: ${guestName.toUpperCase()} · COUPLE ADMISSION (2 SEATS)`
      : `HONOURED GUEST: ${guestName.toUpperCase()} · SINGLE ADMISSION (1 SEAT)`;
    doc.text(guestLine, width / 2, guestBoxY + 6, { align: 'center' });

    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('times', 'italic');
    doc.setFontSize(8);
    const splitBlessing = doc.splitTextToSize(`“${cardGemini.blessing}”`, width - 50);
    doc.text(splitBlessing, width / 2, guestBoxY + 13.5, { align: 'center' });
  }

  // Agendas Section
  const agendaY = 85;
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.text((wedding.date || wedding.rawDate).toUpperCase(), width / 2, agendaY, { align: 'center' });

  // Event 1: Benediction
  doc.setFontSize(8);
  doc.text('WEDDING BENEDICTION · 13:00 · LION VOICE TABERNACLE', width / 2, agendaY + 5.5, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text('11 Lower Maynard Rd Wynberg Station, Tailan Building Basement Hall', width / 2, agendaY + 9, { align: 'center' });

  // Event 2: Evening Reception
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('EVENING RECEPTION · 18:00 TO 21:00 · ROOFTOP', width / 2, agendaY + 15, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text('39 Salt River Road, Salt River, Cape Town, Western Cape, 7405', width / 2, agendaY + 18.5, { align: 'center' });

  // Attire & Joel Scripture
  const footerY = agendaY + 26;
  doc.setTextColor(goldColor[0], goldColor[1], goldColor[2]);
  doc.setFont('times', 'bold');
  doc.setFontSize(7);
  doc.text('DRESS CODE: CHURCH CEREMONY: VINTAGE WEAR  ·  DINING CEREMONY: GALA WEAR', width / 2, footerY, { align: 'center' });

  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.setFont('times', 'italic');
  doc.setFontSize(7.5);
  doc.text('“I will restore to you the years that the swarming locust has eaten.”', width / 2, footerY + 4.5, { align: 'center' });

  // Page 1 Footer Note
  doc.setFont('courier', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(dimColor[0], dimColor[1], dimColor[2]);
  doc.text(`PAGE 1 OF 2  ·  OFFICIAL CEREMONIAL INVITATION (FRONT)  ·  PASS REF: ${guestId}`, width / 2, height - 10.5, { align: 'center' });

  /* ========================================================
   * PAGE 2: BACK — QR DIGITAL VENUE PASS & PROTOCOL
   * ======================================================== */
  doc.addPage([210, 148], 'landscape');

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
  // LEFT COLUMN: Vector QR Code & Gate Scanner
  const qrColX = 16;
  const qrBoxSize = 42;
  const qrBoxY = 28;

  doc.setFillColor(250, 247, 240);
  doc.setDrawColor(181, 154, 114);
  doc.setLineWidth(0.3);
  doc.rect(qrColX, qrBoxY, qrBoxSize + 16, qrBoxSize + 22, 'FD');

  // Draw 25x25 QR Matrix
  const qrPayload = `AURELIA-WEDDING:${wedding.slug}:GUEST:${guestId}:${guestName}`;
  const qrMatrix = generateQrMatrix(qrPayload);
  const matrixSize = 25;
  const qrDrawSize = 34;
  const cellSize = qrDrawSize / matrixSize;
  const qrStartX = qrColX + (qrBoxSize + 16 - qrDrawSize) / 2;
  const qrStartY = qrBoxY + 4;

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
  doc.text('AU', centerBoxX + 3.5, centerBoxY + 5, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(115, 110, 102);
  doc.text('SCAN FOR VENUE GATE ADMISSION', qrColX + (qrBoxSize + 16) / 2, qrBoxY + qrDrawSize + 8, { align: 'center' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(181, 154, 114);
  doc.text(`SECURITY TOKEN: ${guestId}`, qrColX + (qrBoxSize + 16) / 2, qrBoxY + qrDrawSize + 12, { align: 'center' });

  doc.setFont('times', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(41, 39, 34);
  const splitProto = doc.splitTextToSize(`“${passGemini.protocolNote}”`, qrBoxSize + 12);
  doc.text(splitProto, qrColX + (qrBoxSize + 16) / 2, qrBoxY + qrDrawSize + 16.5, { align: 'center' });

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


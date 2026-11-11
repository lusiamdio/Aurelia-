import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

export interface GalleryPhoto {
  id: string;
  src: string;
  aspect?: string;
}

interface ScrollSpreadCardGalleryProps {
  photos: GalleryPhoto[];
  onPhotoClick?: (src: string) => void;
}

export const ScrollSpreadCardGallery: React.FC<ScrollSpreadCardGalleryProps> = ({
  photos,
  onPhotoClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(Math.floor(photos.length / 2));
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [scrollProgressVal, setScrollProgressVal] = useState<number>(0);

  // Responsive window resize listener
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Motion useScroll attached to this gallery section
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.95', 'center 0.50']
  });

  // Fast, responsive spring with low mass and high stiffness so cards react instantaneously
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 380,
    damping: 30,
    mass: 0.15,
    restDelta: 0.001
  });

  useEffect(() => {
    const unsubscribe = smoothProgress.on('change', (v) => {
      setScrollProgressVal(v);
    });
    return () => unsubscribe();
  }, [smoothProgress]);

  // High-frequency scroll listener ensuring instant, continuous, uninterrupted spreading
  useEffect(() => {
    let rafId: number;

    const updateScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowH = window.innerHeight;

      // Fast activation range: starts spreading immediately upon entering (0.95)
      // and completes a full wide fan spread quickly (0.50) without stalling
      const startTrigger = windowH * 0.95;
      const fullSpreadTrigger = windowH * 0.50;
      const currentPos = rect.top;

      let ratio = (startTrigger - currentPos) / (startTrigger - fullSpreadTrigger);
      ratio = Math.max(0, Math.min(1, ratio));

      setScrollProgressVal(ratio);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const total = photos.length;
  const midIndex = (total - 1) / 2;

  // Responsive spread geometry based on viewport width
  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;

  const maxSpreadX = useMemo(() => {
    if (isMobile) return Math.min(windowWidth * 0.42, 175);
    if (isTablet) return Math.min(windowWidth * 0.44, 350);
    return Math.min(windowWidth * 0.46, 530);
  }, [windowWidth, isMobile, isTablet]);

  const maxRotateDeg = useMemo(() => {
    if (isMobile) return 18;
    if (isTablet) return 22;
    return 26;
  }, [isMobile, isTablet]);

  const maxArcY = useMemo(() => {
    if (isMobile) return 26;
    if (isTablet) return 38;
    return 50;
  }, [isMobile, isTablet]);

  const effectiveSpread = scrollProgressVal;

  return (
    <div
      ref={containerRef}
      className="relative w-full py-4 select-none"
    >
      {/* STAGE: Fast, Continuous Card Spread Arena */}
      <div className="relative w-full h-[460px] sm:h-[540px] md:h-[600px] lg:h-[660px] flex items-center justify-center overflow-visible">
        {/* Ambient Warm Golden Floor Glow */}
        <div
          className="absolute inset-0 max-w-4xl mx-auto rounded-full bg-radial from-[#D4AF37]/12 via-[#8C6D45]/5 to-transparent pointer-events-none transition-opacity duration-300"
          style={{ opacity: 0.35 + effectiveSpread * 0.45 }}
        />

        {/* Central Cards Spread Layout */}
        <div className="relative w-full h-full flex items-center justify-center">
          {photos.map((photo, i) => {
            const norm = (i - midIndex) / (midIndex || 1); // -1.0 to +1.0
            const isHovered = hoveredIndex === i;
            const isActive = activeCardIndex === i;

            // Target positions when SPREAD
            const targetX = norm * maxSpreadX;
            // Arc curve: cards curve slightly downwards towards edges like a natural fan
            const targetY = Math.pow(norm, 2) * maxArcY;
            const targetRotate = norm * maxRotateDeg;

            // Target positions when STACKED
            const stackedX = (i - midIndex) * (isMobile ? 1.5 : 2.5);
            const stackedY = i * (isMobile ? 1.2 : 1.8);
            const stackedRotate = (i % 2 === 0 ? 1 : -1) * (i * 0.8 - 2.5);
            const stackedScale = 1 - (total - 1 - i) * 0.007;

            // Fast, continuous interpolation
            const currentX = stackedX + (targetX - stackedX) * effectiveSpread;
            const currentY = stackedY + (targetY - stackedY) * effectiveSpread;
            const currentRotate = stackedRotate + (targetRotate - stackedRotate) * effectiveSpread;
            const baseScale = stackedScale + (1.0 - stackedScale) * effectiveSpread;

            // Hover elevation
            const finalScale = isHovered ? baseScale * 1.08 : baseScale;
            const finalY = isHovered ? currentY - 24 : currentY;
            const finalRotate = isHovered ? 0 : currentRotate;

            // Layering
            const baseZ = i <= midIndex ? i + 1 : total - i;
            const zIndex = isHovered ? 100 : isActive ? 50 : baseZ + 10;

            return (
              <motion.div
                key={photo.id}
                onMouseEnter={() => {
                  setHoveredIndex(i);
                  setActiveCardIndex(i);
                }}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  setActiveCardIndex(i);
                  onPhotoClick?.(photo.src);
                }}
                style={{
                  zIndex,
                  transformOrigin: 'bottom center'
                }}
                animate={{
                  x: currentX,
                  y: finalY,
                  rotate: finalRotate,
                  scale: finalScale
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 30,
                  mass: 0.15
                }}
                className="absolute cursor-pointer select-none touch-manipulation group"
              >
                {/* Physical Photo Card - Completely Pristine, Borderless, No Labels */}
                <div
                  className={`relative rounded-2xl overflow-hidden bg-[#1C1B18] transition-shadow duration-300 ${
                    isHovered
                      ? 'shadow-[0_32px_75px_-15px_rgba(0,0,0,0.55)]'
                      : 'shadow-[0_16px_38px_-10px_rgba(0,0,0,0.32)]'
                  } w-[150px] h-[210px] sm:w-[190px] sm:h-[265px] md:w-[220px] md:h-[305px] lg:w-[240px] lg:h-[335px]`}
                >
                  <img
                    src={photo.src}
                    alt={`Samson & Kevine — Gallery Portrait ${i + 1}`}
                    className="w-full h-full object-cover object-center pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Soft Vignette Depth (strictly no text, no icons, no borders) */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10 pointer-events-none" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Clean, Minimal Thumbnails Strip for Quick Direct Selection (No labels) */}
      <div className="mt-6 flex flex-col items-center">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full px-4 py-2 no-scrollbar">
          {photos.map((p, idx) => {
            const isCurrent = activeCardIndex === idx;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setActiveCardIndex(idx);
                  setHoveredIndex(idx);
                }}
                className={`relative shrink-0 rounded-lg overflow-hidden transition-all duration-200 shadow-sm ${
                  isCurrent
                    ? 'w-10 h-14 scale-110 shadow-lg brightness-105 opacity-100'
                    : 'w-7 h-10 opacity-50 hover:opacity-90'
                }`}
                aria-label={`Select photo ${idx + 1}`}
              >
                <img
                  src={p.src}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

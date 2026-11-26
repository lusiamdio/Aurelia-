import React, { useState, useEffect } from 'react';
import { WeddingData } from '../types/wedding';
import {
  Lock,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  X,
  Check,
  Users,
  Loader2
} from 'lucide-react';
import {
  getCoupleAuthStatus,
  signInCoupleAdmin,
  claimCoupleAdminPasscode
} from '../services/supabaseService';

interface CoupleAuthModalProps {
  wedding: WeddingData;
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export const CoupleAuthModal: React.FC<CoupleAuthModalProps> = ({
  wedding,
  isOpen,
  onClose,
  onAuthenticated
}) => {
  const [coupleNames, setCoupleNames] = useState('');
  const [password, setPassword] = useState('');
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setIsCheckingStatus(true);
    void getCoupleAuthStatus()
      .then((status) => {
        if (active) {
          setRequiresSetup(status.requiresSetup);
        }
      })
      .finally(() => {
        if (active) {
          setIsCheckingStatus(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const p1First = wedding.partner1.split(' ')[0] || wedding.partner1;
  const p2First = wedding.partner2.split(' ')[0] || wedding.partner2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!coupleNames.trim() || !password) {
      setError('Please enter both fields to continue.');
      return;
    }

    setIsSubmitting(true);
    try {
      let useSetupMode = requiresSetup;
      if (isCheckingStatus) {
        const status = await getCoupleAuthStatus();
        useSetupMode = status.requiresSetup;
        setRequiresSetup(status.requiresSetup);
      }

      const result = useSetupMode
        ? await claimCoupleAdminPasscode(coupleNames, password)
        : await signInCoupleAdmin(coupleNames, password);

      if (result.requiresSetup) {
        setRequiresSetup(true);
        setError('Initial admin setup is required on this deployment. Click "Set Password & Unlock" to save your password.');
        return;
      }

      if (result.authenticated) {
        setIsSuccess(true);
        setTimeout(() => {
          onAuthenticated();
          onClose();
          setIsSuccess(false);
          setCoupleNames('');
          setPassword('');
        }, 450);
        return;
      }

      setError(result.error || 'Invalid couple credentials or password.');
    } catch {
      setError('Unable to reach authentication service. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1B18]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#FAF7F0] rounded-sm max-w-md w-full shadow-2xl p-6 sm:p-8 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          title="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[#B59A72]/15 text-[#8C6D45] flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-editorial uppercase tracking-[0.25em] text-[#8C6D45] font-semibold block mb-1">
            Couple Restricted Area
          </span>
          <h2 className="font-editorial text-2xl sm:text-3xl font-normal text-[#292722]">
            {requiresSetup ? 'Initial Admin Setup' : 'Couple Admin Sign In'}
          </h2>
          <p className="text-xs text-[#5A554E] mt-1.5 leading-relaxed">
            {requiresSetup
              ? 'Claim administrative control by verifying the couple names and setting your admin password.'
              : 'Restricted to the couple. Enter your authorized couple credentials and password to unlock management access.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-800 text-xs rounded-xs flex items-start gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xs flex items-center gap-2 shadow-xs">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Identity confirmed! Welcome back, {p1First} &amp; {p2First}.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label
              htmlFor="couple-admin-names"
              className="block font-semibold uppercase tracking-wider text-[#292722] mb-1.5"
            >
              Couple Names <span className="text-[#8C6D45]">*</span>
            </label>
            <div className="relative">
              <input
                id="couple-admin-names"
                type="text"
                required
                autoComplete="off"
                value={coupleNames}
                onChange={(e) => setCoupleNames(e.target.value)}
                className="w-full px-3.5 py-3 pr-10 text-sm bg-white rounded-xs text-[#292722] shadow-xs focus:outline-hidden focus:ring-1 focus:ring-[#8C6D45]"
              />
              <Users className="w-4 h-4 text-[#8C6D45] absolute right-3 top-3.5 opacity-60" />
            </div>
          </div>

          <div>
            <label
              htmlFor="couple-admin-password"
              className="block font-semibold uppercase tracking-wider text-[#292722] mb-1.5"
            >
              Password <span className="text-[#8C6D45]">*</span>
            </label>
            <div className="relative">
              <input
                id="couple-admin-password"
                type="password"
                required
                autoComplete={requiresSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-3 pr-10 text-sm bg-white rounded-xs text-[#292722] shadow-xs focus:outline-hidden focus:ring-1 focus:ring-[#8C6D45]"
              />
              <KeyRound className="w-4 h-4 text-[#8C6D45] absolute right-3 top-3.5 opacity-60" />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#292722] hover:bg-[#8C6D45] disabled:opacity-60 text-white text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 text-[#B59A72] animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#B59A72]" />
              )}
              <span>
                {isSubmitting
                  ? 'Verifying...'
                  : requiresSetup
                  ? 'Set Password & Unlock'
                  : 'Sign In as Couple Admin'}
              </span>
            </button>
          </div>
        </form>

        <div className="mt-5 pt-4 text-center text-[11px] text-neutral-500">
          Guests do not require credentials — guests can access the wedding microsite and RSVP freely.
        </div>
      </div>
    </div>
  );
};

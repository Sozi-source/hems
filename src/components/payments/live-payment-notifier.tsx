'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBusiness } from '@/context/business-context';
import { fmt_kes } from '@/lib/format';
import { BellRing, ArrowUpRight, X, CheckCircle2 } from 'lucide-react';

interface IncomingPaymentToast {
  id: string;
  transaction_ref: string;
  amount_minor: number;
  payer_name: string | null;
  payer_msisdn: string | null;
  provider: string;
  occurred_at: string;
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.11); // A5

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // Audio playback blocked by browser autoplay policy until user interacts
  }
}

export function LivePaymentNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeBusinessId, isMasterView } = useBusiness();

  const [toasts, setToasts] = useState<IncomingPaymentToast[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef<boolean>(false);
  const popoverContainerRef = useRef<HTMLDivElement | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (payment: IncomingPaymentToast) => {
      setToasts((prev) => {
        if (prev.some((t) => t.id === payment.id)) return prev;
        return [payment, ...prev].slice(0, 4);
      });
      playNotificationChime();
      window.dispatchEvent(new CustomEvent('hems:payment-received', { detail: payment }));

      setTimeout(() => {
        dismissToast(payment.id);
      }, 12000);
    },
    [dismissToast]
  );

  // Sync Top Layer manual popover state when toasts exist
  useEffect(() => {
    const el = popoverContainerRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (!el || typeof el.showPopover !== 'function') return;

    try {
      if (toasts.length > 0) {
        if (!el.matches(':popover-open')) {
          el.showPopover();
        }
      } else if (el.matches(':popover-open')) {
        el.hidePopover();
      }
    } catch {
      // Fallback to fixed positioning if showPopover throws
    }
  }, [toasts.length]);

  useEffect(() => {
    seenIdsRef.current.clear();
    initializedRef.current = false;

    const supabase = createClient();

    async function checkLatestPayments() {
      try {
        let countQuery = supabase
          .from('payment_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        let recentQuery = supabase
          .from('payment_transactions')
          .select('id, transaction_ref, amount_minor, payer_name, payer_msisdn, provider, occurred_at, business_id')
          .order('created_at', { ascending: false })
          .limit(5);

        if (!isMasterView && activeBusinessId) {
          countQuery = countQuery.eq('business_id', activeBusinessId);
          recentQuery = recentQuery.eq('business_id', activeBusinessId);
        }

        const [{ count }, { data: recent }] = await Promise.all([countQuery, recentQuery]);

        if (typeof count === 'number') {
          setPendingCount(count);
          window.dispatchEvent(new CustomEvent('hems:pending-payments-count', { detail: count }));
        }

        if (!recent) return;

        if (!initializedRef.current) {
          recent.forEach((row) => seenIdsRef.current.add(row.id));
          initializedRef.current = true;
          return;
        }

        for (const row of [...recent].reverse()) {
          if (!seenIdsRef.current.has(row.id)) {
            seenIdsRef.current.add(row.id);
            pushToast({
              id: row.id,
              transaction_ref: row.transaction_ref,
              amount_minor: row.amount_minor,
              payer_name: row.payer_name,
              payer_msisdn: row.payer_msisdn,
              provider: row.provider,
              occurred_at: row.occurred_at,
            });
          }
        }
      } catch {
        // Ignore transient network errors during background poll
      }
    }

    checkLatestPayments();

    const intervalId = setInterval(checkLatestPayments, 8000);

    // Also subscribe to Supabase Realtime if enabled on payment_transactions
    const channel = supabase
      .channel('hems-live-payments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_transactions' },
        (payload) => {
          const row = payload.new as Record<string, any>;
          if (!row?.id) return;
          if (!isMasterView && activeBusinessId && row.business_id && row.business_id !== activeBusinessId) {
            return;
          }
          if (!seenIdsRef.current.has(row.id)) {
            seenIdsRef.current.add(row.id);
            setPendingCount((c) => {
              const next = c + 1;
              window.dispatchEvent(new CustomEvent('hems:pending-payments-count', { detail: next }));
              return next;
            });
            pushToast({
              id: row.id,
              transaction_ref: String(row.transaction_ref || ''),
              amount_minor: Number(row.amount_minor || 0),
              payer_name: row.payer_name || null,
              payer_msisdn: row.payer_msisdn || null,
              provider: String(row.provider || 'mpesa'),
              occurred_at: String(row.occurred_at || new Date().toISOString()),
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [activeBusinessId, isMasterView, pushToast]);

  return (
    <>
      {/* Header Pending Payments Quick Pill */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={() => router.push('/payments')}
          title={`${pendingCount} payment(s) waiting for review`}
          className={`inline-flex h-9 items-center gap-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors border shrink-0 ${
            pathname === '/payments'
              ? 'bg-[#E8F5EB] text-[#144827] border-[#BBDCC4]'
              : 'bg-[#FDF2D0] text-[#5C3B00] border-[#E6C775] hover:bg-[#F9E8B2]'
          }`}
        >
          <BellRing className="w-3.5 h-3.5 text-[#B45309] animate-pulse shrink-0" />
          <span className="tabular-nums">{pendingCount}</span>
          <span className="hidden md:inline">Pending SMS</span>
        </button>
      )}

      {/* Persistent Manual Popover Toast Stack (Top-Right) */}
      <div
        ref={popoverContainerRef}
        popover="manual"
        role="region"
        aria-live="polite"
        aria-label="Incoming payment notifications"
        className="fixed top-4 right-4 left-auto bottom-auto z-50 m-0 p-0 bg-transparent border-0 outline-none w-[min(92vw,360px)] space-y-2.5 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl bg-[#102719] text-white border border-[#2C5B3C] shadow-xl p-3.5 transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#1F7A3D] flex items-center justify-center shrink-0 mt-0.5 border border-[#73C88A]/40">
                  <CheckCircle2 className="w-4 h-4 text-[#8DDBA0]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8DDBA0]">
                      New SMS Payment
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-200">
                      {toast.transaction_ref}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5 tabular-nums">
                    {fmt_kes(toast.amount_minor)}
                  </div>
                  <div className="text-xs text-[#D2E1D6] truncate mt-0.5">
                    From: <strong className="text-white">{toast.payer_name || toast.payer_msisdn || 'Customer'}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Close notification"
                className="p-1 rounded-md text-[#A7BEAE] hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id);
                  if (pathname !== '/payments') {
                    router.push('/payments');
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#1F7A3D] hover:bg-[#258F48] text-white transition-colors"
              >
                <span>Review & Approve</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

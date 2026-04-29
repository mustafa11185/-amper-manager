'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const PLAN_NAMES_AR: Record<string, string> = {
  starter: 'Starter ⚡',
  pro: 'Pro 🚀',
  business: 'Business 👑',
  corporate: 'Corporate 🏢',
  fleet: 'Fleet 🏭',
};

const GATEWAYS = [
  { id: 'zaincash', label: 'ZainCash', emoji: '🟣' },
  { id: 'qi', label: 'Qi Card', emoji: '💳' },
  { id: 'asiapay', label: 'AsiaPay', emoji: '🏦' },
];

function PayInner() {
  const params = useSearchParams();
  const router = useRouter();

  const planId = params?.get('plan') || 'business';
  const periodMonths = Number(params?.get('period') || '1');
  const couponCode = params?.get('coupon') || '';
  const gatewayParam = params?.get('gateway') || 'zaincash';

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gateway, setGateway] = useState(gatewayParam);
  const [planInfo, setPlanInfo] = useState<{ name_ar: string; pricing: { monthly: number; '3m': number; '6m': number; '12m': number } } | null>(null);

  // Check session on mount; redirect to login if not authed.
  useEffect(() => {
    fetch('/api/auth/session').then((r) => r.json()).then((s) => {
      if (s?.user) {
        setAuthed(true);
      } else {
        setAuthed(false);
        // Save current URL so login can return here
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        router.push(`/staff/login?return=${returnUrl}`);
      }
    });
  }, [router]);

  // Load plan info for display
  useEffect(() => {
    fetch('/api/billing/plans').then((r) => r.json()).then((d) => {
      const p = d.plans.find((x: { id: string }) => x.id === planId);
      if (p) setPlanInfo({ name_ar: p.name_ar, pricing: p.pricing });
    });
  }, [planId]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, periodMonths, gateway, couponCode: couponCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || data.error || 'فشل الدفع');
        setSubmitting(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      toast.error('فشل الاتصال');
      setSubmitting(false);
    }
  };

  if (authed === null) {
    return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }
  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 text-center">
        <p style={{ color: 'var(--text-muted)' }}>جاري تحويلك لتسجيل الدخول...</p>
      </div>
    );
  }

  const periodKey = (periodMonths === 1 ? 'monthly' : `${periodMonths}m`) as 'monthly' | '3m' | '6m' | '12m';
  const amount = planInfo?.pricing?.[periodKey] || 0;
  const periodLabel = periodMonths === 1 ? 'شهر' : periodMonths === 12 ? 'سنة' : `${periodMonths} أشهر`;

  return (
    <main className="min-h-dvh grid-bg pt-12 pb-16 px-6">
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: 'Tajawal', direction: 'rtl', background: '#1E293B', color: '#E2E8F0' } }} />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-3"
               style={{ background: 'rgba(45,140,255,0.12)', border: '1px solid rgba(45,140,255,0.4)', color: '#2D8CFF' }}>
            <Sparkles className="w-3.5 h-3.5" />
            رابط دفع من فريق Amper
          </div>
          <h1 className="text-2xl font-black">إكمال الدفع</h1>
        </div>

        <div className="rounded-2xl p-5 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-baseline justify-between mb-2">
            <span style={{ color: 'var(--text-muted)' }} className="text-sm">الباقة</span>
            <span className="font-bold text-lg">{planInfo?.name_ar || PLAN_NAMES_AR[planId]}</span>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span style={{ color: 'var(--text-muted)' }} className="text-sm">المدة</span>
            <span className="font-semibold">{periodLabel}</span>
          </div>
          {couponCode && (
            <div className="flex items-baseline justify-between mb-2">
              <span style={{ color: 'var(--text-muted)' }} className="text-sm">كوبون</span>
              <span className="font-mono text-amber-500">🎟️ {couponCode}</span>
            </div>
          )}
          <div className="border-t pt-3 mt-3 flex items-baseline justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold">المبلغ</span>
            <span className="text-3xl font-black gradient-text">{amount.toLocaleString('en-US')} <span className="text-sm" style={{ color: 'var(--text-muted)' }}>د.ع</span></span>
          </div>
        </div>

        <div className="rounded-2xl p-5 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-bold mb-3">طريقة الدفع</h3>
          <div className="grid grid-cols-3 gap-2">
            {GATEWAYS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGateway(g.id)}
                className="rounded-xl p-3 text-center transition-all"
                style={{
                  background: gateway === g.id ? 'rgba(45,140,255,0.15)' : 'var(--bg-elevated)',
                  border: gateway === g.id ? '2px solid #2D8CFF' : '2px solid transparent',
                }}
              >
                <div className="text-2xl mb-1">{g.emoji}</div>
                <div className="text-xs font-bold">{g.label}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={submitting || !planInfo}
          className="w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          style={{ background: 'var(--gradient-hero)', color: 'white', opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CreditCard className="w-5 h-5" />ادفع الآن ←</>}
        </button>

        <p className="text-xs text-center mt-4 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <AlertCircle className="w-3 h-3" />
          ستتحول لبوابة الدفع لإكمال المعاملة
        </p>
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <PayInner />
    </Suspense>
  );
}

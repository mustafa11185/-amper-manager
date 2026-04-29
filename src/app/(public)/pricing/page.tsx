'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check, X, Sparkles, ArrowLeft, Loader2, Zap, Wifi, BarChart3,
  Users, Wrench, MessageCircle,
} from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';

type Period = 1 | 3 | 6 | 12;
type Plan = {
  id: string;
  name_ar: string;
  name_en: string;
  tagline_ar: string | null;
  tagline_en: string | null;
  pricing: { monthly: number; '3m': number; '6m': number; '12m': number };
  limits: { generators: number; subscribers: number; staff: number };
  features: {
    iot: boolean; ai: boolean; subscriber_app: boolean;
    api: boolean; multi_branch: boolean; priority_support: boolean;
  };
  is_popular: boolean;
};

const PERIODS: { key: Period; label: string; short: string }[] = [
  { key: 1, label: 'شهر واحد', short: 'شهر' },
  { key: 3, label: '3 أشهر', short: '3 شهور' },
  { key: 6, label: '6 أشهر', short: '6 شهور' },
  { key: 12, label: '12 شهر', short: 'سنة' },
];

const FEATURE_LABELS: Record<keyof Plan['features'], string> = {
  iot: 'مراقبة IoT (DSE 5110)',
  ai: 'مساعد AI + تقارير ذكية',
  subscriber_app: 'تطبيق المشترك',
  api: 'API + تكاملات خارجية',
  multi_branch: 'فروع متعددة',
  priority_support: 'دعم فني أولوية',
};

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState<Period>(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/billing/plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('en-US');

  const priceFor = (plan: Plan, p: Period) =>
    p === 1 ? plan.pricing.monthly : plan.pricing[`${p}m` as '3m' | '6m' | '12m'];

  const savingsPct = (plan: Plan, p: Period) => {
    if (p === 1) return 0;
    const raw = plan.pricing.monthly * p;
    const actual = priceFor(plan, p);
    return Math.round(((raw - actual) / raw) * 100);
  };

  return (
    <>
      <LandingNavbar />

      {/* Hero */}
      <section className="grid-bg pt-28 pb-12 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
               style={{ background: 'rgba(45,140,255,0.12)', border: '1px solid rgba(45,140,255,0.4)', color: '#2D8CFF' }}>
            <Sparkles className="w-3.5 h-3.5" />
            7 أيام مجاناً · ابدأ بدون مخاطرة
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-4">
            باقات <span className="gradient-text">مرنة وعادلة</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            كل الباقات تتضمن: تحصيل ذكي، تقارير آنية، إيصالات WhatsApp، وأمان بمستوى البنوك.
          </p>
        </div>
      </section>

      {/* Period selector */}
      <section className="px-6 pb-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex p-1 rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className="px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold transition-all"
                style={{
                  background: period === p.key ? 'var(--gradient-hero)' : 'transparent',
                  color: period === p.key ? 'white' : 'var(--text-muted)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 12 && (
            <p className="text-xs mt-3" style={{ color: '#F59E0B' }}>
              ⭐ شهرين مجاناً مع الاشتراك السنوي
            </p>
          )}
        </div>
      </section>

      {/* Plan cards */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const total = priceFor(plan, period);
                const monthlyEffective = Math.round(total / period);
                const savings = savingsPct(plan, period);
                const enabledFeatures = Object.entries(plan.features).filter(([, v]) => v) as [keyof Plan['features'], boolean][];
                const disabledFeatures = Object.entries(plan.features).filter(([, v]) => !v) as [keyof Plan['features'], boolean][];

                return (
                  <div
                    key={plan.id}
                    className="relative rounded-2xl p-6 transition-all"
                    style={{
                      background: plan.is_popular ? 'var(--bg-card-elevated, #1E293B)' : 'var(--bg-card, #0F172A)',
                      border: plan.is_popular ? '2px solid var(--blue, #2D8CFF)' : '1px solid var(--border)',
                      boxShadow: plan.is_popular ? '0 0 40px rgba(45,140,255,0.2)' : 'none',
                    }}
                  >
                    {plan.is_popular && (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                        style={{ background: 'linear-gradient(90deg,#F59E0B,#EF4444)', color: 'white' }}
                      >
                        <Sparkles className="w-3 h-3" />
                        الأكثر اختياراً
                      </div>
                    )}

                    <h3 className="text-2xl font-black mb-1">{plan.name_ar}</h3>
                    <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                      {plan.tagline_ar || plan.name_en}
                    </p>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-4xl font-black gradient-text">{fmt(total)}</span>
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>د.ع</span>
                        {savings > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
                            وفّر {savings}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {period === 1 ? 'شهرياً' : `لـ ${PERIODS.find(p => p.key === period)?.short} (≈ ${fmt(monthlyEffective)} د.ع/شهر)`}
                      </p>
                    </div>

                    {/* Limits */}
                    <div className="space-y-2 mb-5 text-sm">
                      <Limit icon={Zap} label="مولدات" value={plan.limits.generators} />
                      <Limit icon={Users} label="مشتركين" value={plan.limits.subscribers} />
                      <Limit icon={Wrench} label="موظفين/جباة" value={plan.limits.staff} />
                    </div>

                    {/* Features */}
                    <div className="space-y-2 mb-6 text-sm border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                      {enabledFeatures.map(([k]) => (
                        <FeatureRow key={k} label={FEATURE_LABELS[k]} included />
                      ))}
                      {disabledFeatures.map(([k]) => (
                        <FeatureRow key={k} label={FEATURE_LABELS[k]} included={false} />
                      ))}
                    </div>

                    {/* CTA */}
                    <Link
                      href={`/signup?plan=${plan.id}&period=${period}`}
                      className="block w-full text-center py-3 rounded-xl font-bold transition-all"
                      style={{
                        background: plan.is_popular ? 'var(--gradient-hero)' : 'var(--bg-elevated)',
                        color: plan.is_popular ? 'white' : 'var(--text)',
                        border: plan.is_popular ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      ابدأ الآن ←
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto rounded-2xl p-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5" style={{ color: 'var(--blue)' }} />
            أسئلة شائعة
          </h3>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <FAQ q="هل في تجربة مجانية؟" a="نعم — 7 أيام مجاناً بدون أي رسوم. تحدّد طريقة الدفع مقدماً وتُخصم بعد انتهاء التجربة فقط." />
            <FAQ q="إذا اشترت شهر واحد، أقدر أرتقي بعدها؟" a="نعم. أول اشتراك = شهري فقط. بعدها تقدر تختار 3/6/12 شهر بخصم." />
            <FAQ q="كيف أدفع؟" a="ZainCash · Qi Card · AsiaPay — كلهم مدعومين. الإيصالات بالواتساب تلقائياً." />
            <FAQ q="هل أقدر أوقف الاشتراك؟" a="بأي وقت من حسابك. الخدمة تستمر لنهاية الفترة المدفوعة." />
          </div>
          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
            <Link href="/" className="text-sm flex items-center gap-1" style={{ color: 'var(--blue)' }}>
              <ArrowLeft className="w-4 h-4" />
              عودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Limit({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span className="font-bold" style={{ color: 'var(--text)' }}>
        {value === -1 ? 'غير محدود' : value}
      </span>
    </div>
  );
}

function FeatureRow({ label, included }: { label: string; included: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {included ? (
        <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#22C55E' }} />
      ) : (
        <X className="w-4 h-4 flex-shrink-0" style={{ color: '#475569' }} />
      )}
      <span style={{ color: included ? 'var(--text)' : 'var(--text-dim, #475569)', textDecoration: included ? 'none' : 'line-through' }}>
        {label}
      </span>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>· {q}</p>
      <p className="pr-4">{a}</p>
    </div>
  );
}

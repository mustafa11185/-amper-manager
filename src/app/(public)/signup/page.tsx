'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import LandingNavbar from '@/components/LandingNavbar';

const GOVS = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'ذي قار', 'بابل',
  'ديالى', 'الأنبار', 'كركوك', 'صلاح الدين', 'واسط', 'المثنى', 'ميسان',
  'القادسية', 'دهوك', 'السليمانية',
];

const GATEWAYS = [
  { id: 'zaincash', label: 'ZainCash', emoji: '🟣' },
  { id: 'qi', label: 'Qi Card', emoji: '💳' },
  { id: 'asiapay', label: 'AsiaPay', emoji: '🏦' },
];

const PLAN_NAMES_AR: Record<string, string> = {
  starter: 'Starter ⚡',
  pro: 'Pro 🚀',
  business: 'Business 👑',
  corporate: 'Corporate 🏢',
  fleet: 'Fleet 🏭',
};

const PLAN_PRICES: Record<string, Record<number, number>> = {
  starter:   { 1: 0,      3: 0,      6: 0,      12: 0 },
  pro:       { 1: 22_000, 3: 66_000, 6: 125_400, 12: 224_400 },
  business:  { 1: 35_000, 3: 105_000, 6: 199_500, 12: 357_000 },
  corporate: { 1: 55_000, 3: 165_000, 6: 313_500, 12: 561_000 },
  fleet:     { 1: 0,      3: 0,      6: 0,      12: 0 },
};

function SignupForm() {
  const params = useSearchParams();
  const router = useRouter();

  const planId = params?.get('plan') || 'gold';
  const periodMonths = Number(params?.get('period') || '1');
  const errorParam = params?.get('error');

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [gateway, setGateway] = useState('zaincash');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (errorParam === 'payment_failed') {
      toast.error('فشل الدفع — حاول مرة ثانية');
    }
  }, [errorParam]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/billing/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          owner_name: ownerName,
          phone,
          password,
          governorate: governorate || undefined,
          plan_id: planId,
          period_months: periodMonths,
          gateway,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMap: Record<string, string> = {
          INVALID_BUSINESS_NAME: 'اسم النشاط مطلوب',
          INVALID_OWNER_NAME: 'اسم المالك مطلوب',
          INVALID_PHONE: 'رقم الهاتف غير صحيح — لازم يبدأ بـ 07',
          PASSWORD_TOO_SHORT: 'كلمة المرور أقل من 6 أحرف',
          PHONE_ALREADY_REGISTERED: 'رقم الهاتف مسجّل سابقاً — تقدر تسجل دخول',
          PLAN_NOT_FOUND: 'الباقة المختارة غير موجودة',
          INVALID_GATEWAY: 'بوابة الدفع غير مدعومة',
        };
        toast.error(errMap[data.error] || data.message || 'حدث خطأ');
        setSubmitting(false);
        return;
      }

      // Success — either redirect to gateway, or to login if checkout init failed
      if (data.redirectUrl) {
        toast.success('جاري تحويلك لإكمال الدفع...');
        setTimeout(() => { window.location.href = data.redirectUrl; }, 800);
      } else if (data.loginRedirect) {
        toast.success('تم إنشاء حسابك — سجّل دخول لإكمال الدفع');
        setTimeout(() => router.push(data.loginRedirect), 1200);
      }
    } catch (err) {
      toast.error('فشل الاتصال — حاول مرة ثانية');
      console.error(err);
      setSubmitting(false);
    }
  };

  const planName = PLAN_NAMES_AR[planId] || planId;
  const price = PLAN_PRICES[planId]?.[periodMonths] ?? 0;
  const periodLabel = periodMonths === 1 ? 'شهر' : `${periodMonths} شهور`;

  return (
    <>
      <LandingNavbar />
      <Toaster
        position="top-center"
        toastOptions={{ style: { fontFamily: 'Tajawal', direction: 'rtl', background: '#1E293B', color: '#E2E8F0' } }}
      />
      <main className="grid-bg pt-28 pb-16 px-6 min-h-dvh">
        <div className="max-w-xl mx-auto">

          <Link href="/pricing" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft className="w-4 h-4" />
            رجوع للباقات
          </Link>

          <div className="rounded-2xl p-6 md:p-8 mb-6"
               style={{ background: 'linear-gradient(135deg,rgba(45,140,255,0.1),rgba(124,58,237,0.1))', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold" style={{ color: '#2D8CFF' }}>
              <Sparkles className="w-4 h-4" />
              الباقة المختارة
            </div>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <h2 className="text-2xl font-black">{planName}</h2>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>· {periodLabel}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black gradient-text">{price.toLocaleString('en-US')}</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>د.ع</span>
            </div>
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              <CheckCircle2 className="w-3.5 h-3.5 inline ml-1" style={{ color: '#22C55E' }} />
              7 أيام تجربة — تُخصم بعد التجربة فقط
            </p>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl p-6 md:p-8 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <h1 className="text-xl font-black mb-4">أنشئ حسابك في 30 ثانية</h1>

            <Input
              label="اسم النشاط (ظاهر للمشتركين)"
              value={businessName}
              onChange={setBusinessName}
              placeholder="مولدات الياسمين"
              required
            />

            <Input
              label="اسم المالك"
              value={ownerName}
              onChange={setOwnerName}
              placeholder="أحمد محمد"
              required
            />

            <Input
              label="رقم الهاتف (يُستخدم لتسجيل الدخول)"
              value={phone}
              onChange={setPhone}
              placeholder="07701234567"
              required
              inputMode="tel"
              dir="ltr"
            />

            <Input
              label="كلمة المرور (6 أحرف على الأقل)"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••"
              required
            />

            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                المحافظة (اختياري)
              </label>
              <select
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="">— اختر —</option>
                {GOVS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                طريقة الدفع
              </label>
              <div className="grid grid-cols-3 gap-2">
                {GATEWAYS.map((g) => (
                  <button
                    type="button"
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
              <p className="text-[11px] mt-2 flex items-start gap-1" style={{ color: 'var(--text-muted)' }}>
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>راح تتحول لبوابة الدفع لتأكيد طريقة الدفع. لا خصم خلال 7 أيام التجربة.</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              style={{ background: 'var(--gradient-hero)', color: 'white', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                'إكمال للدفع ←'
              )}
            </button>

            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              عندك حساب؟{' '}
              <Link href="/staff/login" style={{ color: 'var(--blue)' }}>
                سجّل دخول
              </Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <SignupForm />
    </Suspense>
  );
}

function Input({
  label, value, onChange, placeholder, required, type = 'text', inputMode, dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: 'tel' | 'text' | 'email';
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        dir={dir}
        className="w-full px-3 py-2.5 rounded-lg text-sm"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
    </div>
  );
}

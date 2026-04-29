'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard, Sparkles, Calendar, FileText, Check, AlertTriangle,
  ArrowUp, ArrowDown, Wallet, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Plan = {
  id: string;
  name_ar: string;
  name_en: string;
  tagline_ar: string | null;
  pricing: { monthly: number; '3m': number; '6m': number; '12m': number };
  limits: { generators: number; subscribers: number; staff: number };
  features: { iot: boolean; ai: boolean; subscriber_app: boolean; api: boolean; multi_branch: boolean; priority_support: boolean };
  is_popular: boolean;
};

type SubscriptionStatus = {
  plan: string;
  is_trial: boolean;
  is_active: boolean;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  grace_period_ends_at: string | null;
  is_in_grace_period: boolean;
  days_remaining: number | null;
  can_renew_long_term: boolean;
  outstanding_invoices: Array<{
    id: string;
    invoice_number: string | null;
    amount: number;
    plan: string;
    period_months: number;
    period_start: string;
    period_end: string;
    created_at: string;
  }>;
  paid_invoices: Array<{
    id: string;
    invoice_number: string | null;
    amount: number;
    plan: string;
    period_months: number;
    paid_at: string;
  }>;
};

type Period = 1 | 3 | 6 | 12;
type Gateway = 'zaincash' | 'qi' | 'asiapay';

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(1);
  const [selectedGateway, setSelectedGateway] = useState<Gateway>('zaincash');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, statusRes] = await Promise.all([
        fetch('/api/billing/plans').then((r) => r.json()),
        fetch('/api/billing/status').then((r) => r.json()),
      ]);
      setPlans(plansRes.plans || []);
      setStatus(statusRes);
    } catch (err) {
      toast.error('فشل تحميل بيانات الاشتراك');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckout = async (planId: string, period: Period, gateway: Gateway) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, periodMonths: period, gateway }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CHECKOUT_FAILED');
      window.location.href = data.redirectUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ';
      toast.error(`فشل الدفع: ${msg}`);
      console.error(err);
      setCheckoutLoading(false);
    }
  };

  const payInvoice = async (invoiceId: string) => {
    if (!status) return;
    // For outstanding invoices, use the existing plan with whatever period was set.
    const inv = status.outstanding_invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    handleCheckout(inv.plan, inv.period_months as Period, selectedGateway);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
        تعذّر تحميل بيانات الاشتراك
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === status.plan);
  const isFirstSubscription = status.paid_invoices.length === 0;
  const allowedPeriods: Period[] = isFirstSubscription ? [1] : [1, 3, 6, 12];
  const PERIOD_LABELS: Record<Period, string> = {
    1: 'شهر',
    3: '3 أشهر',
    6: '6 أشهر',
    12: 'سنة',
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-violet-600 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <Wallet className="w-6 h-6" />
          <h1 className="text-xl font-bold">باقتي</h1>
        </div>
        <p className="text-blue-100 text-sm">إدارة اشتراكك في أمبير</p>
      </div>

      {/* Current Plan Card */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">الباقة الحالية</div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {currentPlan?.name_ar || status.plan}
              </h2>
              {currentPlan?.is_popular && <Sparkles className="w-5 h-5 text-amber-500" />}
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        {status.subscription_ends_at && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                ينتهي في
              </div>
              <div className="font-semibold text-sm">
                {new Date(status.subscription_ends_at).toLocaleDateString('ar-IQ')}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">الأيام المتبقية</div>
              <div className={`font-semibold text-sm ${
                (status.days_remaining ?? 0) < 7 ? 'text-amber-600' : 'text-gray-900'
              }`}>
                {status.days_remaining ?? '—'} يوم
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowUpgrade(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {isFirstSubscription ? '💳 إكمال الاشتراك' : '⚡ تجديد أو ترقية'}
        </button>
      </div>

      {/* Outstanding Invoices */}
      {status.outstanding_invoices.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-amber-900">فواتير معلّقة</h3>
          </div>
          <div className="space-y-2">
            {status.outstanding_invoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-white rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {inv.invoice_number || inv.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {inv.period_months} شهر · {plans.find((p) => p.id === inv.plan)?.name_ar}
                  </div>
                </div>
                <div className="text-left">
                  <div className="font-bold text-amber-900">
                    {Number(inv.amount).toLocaleString()} د.ع
                  </div>
                  <button
                    onClick={() => payInvoice(inv.id)}
                    disabled={checkoutLoading}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg mt-1 disabled:opacity-50"
                  >
                    {checkoutLoading ? '...' : 'ادفع الآن'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice History */}
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="font-bold">سجل الفواتير المدفوعة</h3>
          <span className="text-xs text-gray-400 mr-auto">{status.paid_invoices.length}</span>
        </div>
        {status.paid_invoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">لا توجد فواتير مدفوعة بعد</p>
        ) : (
          <div className="space-y-2">
            {status.paid_invoices.slice(0, 12).map((inv) => (
              <div
                key={inv.id}
                className="border-b border-gray-100 last:border-0 py-2 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium">
                    {inv.invoice_number || inv.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(inv.paid_at).toLocaleDateString('ar-IQ')} · {inv.period_months} شهر
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-sm">
                    {Number(inv.amount).toLocaleString()} د.ع
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {showUpgrade && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowUpgrade(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b p-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">اختر باقتك</h2>
              <button
                onClick={() => setShowUpgrade(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Period selector */}
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">المدة</div>
                <div className="grid grid-cols-4 gap-2">
                  {([1, 3, 6, 12] as Period[]).map((p) => {
                    const enabled = allowedPeriods.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => enabled && setSelectedPeriod(p)}
                        disabled={!enabled}
                        className={`py-2 px-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                          selectedPeriod === p
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : enabled
                            ? 'border-gray-200 hover:border-gray-300'
                            : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {PERIOD_LABELS[p]}
                      </button>
                    );
                  })}
                </div>
                {isFirstSubscription && (
                  <p className="text-xs text-amber-600 mt-2">
                    🛈 المرة الأولى = اشتراك شهري فقط. بعد أول دفعة تقدر تختار مدد أطول بخصم.
                  </p>
                )}
              </div>

              {/* Plans */}
              <div className="space-y-3">
                {plans.map((p) => {
                  const price = p.pricing[selectedPeriod === 1 ? 'monthly' : (`${selectedPeriod}m` as '3m' | '6m' | '12m')];
                  const isCurrent = p.id === status.plan;
                  const isSelected = p.id === selectedPlan;
                  const savings = selectedPeriod > 1
                    ? Math.round(((p.pricing.monthly * selectedPeriod - price) / (p.pricing.monthly * selectedPeriod)) * 100)
                    : 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlan(p.id)}
                      className={`w-full text-right border-2 rounded-2xl p-4 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${p.is_popular ? 'relative' : ''}`}
                    >
                      {p.is_popular && (
                        <span className="absolute -top-3 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                          ⭐ الأكثر شيوعاً
                        </span>
                      )}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-bold text-lg">{p.name_ar}</div>
                          <div className="text-xs text-gray-500">{p.tagline_ar}</div>
                        </div>
                        {isCurrent && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            باقتك الحالية
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-2xl font-bold">{price.toLocaleString()}</span>
                        <span className="text-sm text-gray-500">د.ع / {PERIOD_LABELS[selectedPeriod]}</span>
                        {savings > 0 && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded mr-auto">
                            وفّر {savings}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 space-x-2 space-x-reverse">
                        <span>{p.limits.generators === -1 ? 'مولدات غير محدودة' : `${p.limits.generators} مولدة`}</span>
                        <span>·</span>
                        <span>{p.limits.subscribers === -1 ? 'مشتركين غير محدود' : `${p.limits.subscribers} مشترك`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Gateway selector */}
              {selectedPlan && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">طريقة الدفع</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'zaincash' as Gateway, label: 'ZainCash', emoji: '🟣' },
                      { id: 'qi' as Gateway, label: 'Qi Card', emoji: '💳' },
                      { id: 'asiapay' as Gateway, label: 'AsiaPay', emoji: '🏦' },
                    ]).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGateway(g.id)}
                        className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                          selectedGateway === g.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-xl mb-1">{g.emoji}</div>
                        <div className="text-xs">{g.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              {selectedPlan && (
                <button
                  onClick={() => handleCheckout(selectedPlan, selectedPeriod, selectedGateway)}
                  disabled={checkoutLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      إكمال الدفع
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  if (status.is_in_grace_period) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> فترة سماح
      </span>
    );
  }
  if (status.is_trial) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> تجريبي
      </span>
    );
  }
  if (status.is_active) {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1">
        <Check className="w-3 h-3" /> فعّال
      </span>
    );
  }
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      موقوف
    </span>
  );
}

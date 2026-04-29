'use client'

import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Building2, RefreshCcw, MessageCircleQuestion, Lock } from 'lucide-react'

export default function AboutPaymentsPage() {
  return (
    <div className="px-4 py-6 space-y-5" style={{ color: 'var(--text-primary)' }}>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">حول الدفع الإلكتروني</h1>
        <Link href="/portal/home?tab=pay" className="rounded-full p-2" style={{ background: '#F1F5F9' }}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </div>

      <Section icon={<Building2 className="w-5 h-5" />} title="من الذي تدفع له؟">
        تدفع مباشرةً لصاحب المولدة (التاجر المسجّل في أمبير). أمبير منصة تشغيلية فقط ولا تتسلّم
        أموالك ولا تحتفظ بها — البوابة (Qi / ZainCash / AsiaPay) تحوّل المبلغ لحساب التاجر مباشرة.
      </Section>

      <Section icon={<Lock className="w-5 h-5" />} title="هل بياناتي آمنة؟">
        نعم. أمبير لا يُخزّن رقم بطاقتك ولا الـ CVV ولا أي بيانات مصرفية. صفحة إدخال البطاقة
        تظهر داخل موقع البوابة المعتمدة (PCI-DSS) ونحن نستلم فقط نتيجة العملية (نجاح / فشل).
      </Section>

      <Section icon={<ShieldCheck className="w-5 h-5" />} title="إيصال الدفع">
        بعد كل عملية ناجحة:
        <ul className="list-disc pr-5 space-y-1 mt-2">
          <li>تصلك رسالة واتساب من التاجر بالتأكيد.</li>
          <li>تظهر العملية فوراً في «سجل الفواتير» مع وسم «إلكتروني».</li>
          <li>يمكنك تحميل إيصال PDF لكل دفعة من السجل.</li>
        </ul>
      </Section>

      <Section icon={<RefreshCcw className="w-5 h-5" />} title="استرجاع المبلغ">
        إذا حصل خطأ (دفع مزدوج، مبلغ خاطئ، فاتورة خاطئة)، تواصل مع التاجر مباشرة عبر زر «اتصل
        بالجابي» أو واتساب. الاسترجاع يتم عبر التاجر (هو الذي استلم المبلغ) وليس عبر أمبير.
        مهلة الاسترجاع المعتادة: 3 إلى 7 أيام عمل بحسب البوابة والبنك.
      </Section>

      <Section icon={<MessageCircleQuestion className="w-5 h-5" />} title="عندي مشكلة في الدفع">
        <Link href="/portal/report-problem" className="inline-block mt-2 rounded-xl px-4 py-2 text-sm font-bold" style={{ background: '#1A56A0', color: '#FFFFFF' }}>
          الإبلاغ عن مشكلة
        </Link>
      </Section>

      <p className="text-center text-[10px] pt-2" style={{ color: '#94A3B8' }}>
        🔒 جميع المدفوعات تمر عبر بوابات معتمدة من البنك المركزي العراقي
      </p>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="rounded-lg p-2" style={{ background: '#F1F5F9', color: '#1A56A0' }}>{icon}</div>
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      <div className="text-[12px] leading-7" style={{ color: '#475569' }}>{children}</div>
    </div>
  )
}

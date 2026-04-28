"use client";

import { useState, useEffect } from "react";
import {
  Hexagon, Zap, Wifi, CreditCard, BarChart3, Bell, Users,
  Rocket, ArrowLeft, Star, ChevronDown, Check, Phone,
  ShoppingCart, Loader2, MapPin, Shield, Wrench, AlertTriangle,
  Eye, Handshake, FileText, Brain, MessageCircle, Sparkles,
  TrendingUp, Lock, Activity, Database, Award, ChevronUp,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import LandingNavbar from "@/components/LandingNavbar";

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP || "9647801234567";
const WA_LINK = (msg: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

const GOVS = [
  "بغداد","البصرة","نينوى","أربيل","النجف","كربلاء","ذي قار","بابل",
  "ديالى","الأنبار","كركوك","صلاح الدين","واسط","المثنى","ميسان","القادسية","دهوك","السليمانية",
];

export default function LandingPage() {
  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: "Tajawal", direction: "rtl", background: "#1E293B", color: "#E2E8F0" } }} />
      <LandingNavbar />
      <main className="grid-bg">
        <HeroSection />
        <TrustBadges />
        <KillerFeaturesSection />
        <DetailedFeaturesSection />
        <WhyAmperSection />
        <HowItWorksSection />
        <PricingSection />
        <ComparisonSection />
        <TestimonialsSection />
        <ContactSection />
        <FAQSection />
        <Footer />
        <WhatsAppFloat />
      </main>
    </>
  );
}

// ━━━━━━━━━━ HERO ━━━━━━━━━━
function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-16 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-30" style={{ background: "radial-gradient(ellipse, rgba(27,79,216,0.3) 0%, transparent 70%)" }} />

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8" style={{ background: "var(--blue-soft)", border: "1px solid var(--border)" }}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--blue-bright)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--blue-bright)" }}>جديد — IoT + كاشف سرقة الوقود + نظام الشركاء</span>
          <ArrowLeft className="w-3 h-3" style={{ color: "var(--blue-bright)" }} />
        </div>

        <h1 className="animate-fade-up delay-1 text-4xl md:text-6xl lg:text-7xl font-black leading-tight mb-6">
          النظام الأكثر <span className="gradient-text">ذكاءً</span>
          <br />
          لإدارة مولدات العراق
        </h1>

        <p className="animate-fade-up delay-2 text-base md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          من التحصيل الذكي إلى مراقبة IoT، من حاسبة الربحية إلى توزيع أرباح الشركاء —
          كل ما تحتاجه لإدارة مولدتك باحتراف في مكان واحد.
        </p>

        <div className="animate-fade-up delay-3 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="#trial" className="h-14 px-8 rounded-2xl text-white font-bold text-base flex items-center gap-2"
            style={{ background: "var(--gradient-hero)", boxShadow: "0 4px 30px rgba(27,79,216,0.4)" }}>
            <Rocket className="w-5 h-5" />
            ابدأ تجربتك المجانية 7 أيام
          </a>
          <a href={WA_LINK("مرحباً، أريد معرفة المزيد عن نظام أمبير")}
            target="_blank" rel="noopener noreferrer"
            className="h-14 px-8 rounded-2xl font-bold text-base flex items-center gap-2"
            style={{ color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.05)" }}>
            <MessageCircle className="w-5 h-5" />
            تواصل عبر واتساب
          </a>
        </div>

        <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
          ✓ بدون بطاقة ائتمانية &nbsp; ✓ إعداد خلال 3 دقائق &nbsp; ✓ إلغاء في أي وقت
        </p>

        <div className="animate-fade-up delay-4 grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 max-w-3xl mx-auto">
          {[
            { value: "+500", label: "مولدة نشطة" },
            { value: "18", label: "محافظة" },
            { value: "99.9%", label: "وقت التشغيل" },
            { value: "24/7", label: "مراقبة IoT" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <p className="font-num text-3xl md:text-4xl font-bold gradient-text">{s.value}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ TRUST BADGES ━━━━━━━━━━
function TrustBadges() {
  const badges = [
    { icon: Shield, text: "بيانات معزولة لكل عميل" },
    { icon: Database, text: "نسخ احتياطي يومي" },
    { icon: Lock, text: "تشفير TLS 256-bit" },
    { icon: Award, text: "متوافق مع البنك المركزي" },
  ];
  return (
    <section className="px-6 py-12 border-y" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
        {badges.map((b, i) => (
          <div key={i} className="flex items-center gap-3 justify-center">
            <b.icon className="w-5 h-5" style={{ color: "var(--blue-bright)" }} />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>{b.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ━━━━━━━━━━ KILLER FEATURES (the new powers) ━━━━━━━━━━
function KillerFeaturesSection() {
  const killers = [
    {
      icon: AlertTriangle, emoji: "🛢️",
      title: "كاشف سرقة الوقود",
      tag: "الميزة القاتلة",
      gradient: "from-red-900 to-red-700",
      desc: "كل ليلة يسرق الموظفون لتراً بعد لتر. النظام يكتشفهم تلقائياً قبل أن تخسر.",
      stats: "متوسط التوفير: 250,000 د.ع شهرياً",
      bullets: [
        "كشف فوري لأي نقص غير طبيعي",
        "تنبيه WhatsApp لحظي",
        "تقدير الخسارة بالدينار العراقي",
        "كشف خاص للسرقة الليلية",
      ],
    },
    {
      icon: Wrench, emoji: "🔧",
      title: "الصيانة الذكية",
      tag: "أطل عمر مولداتك",
      gradient: "from-blue-900 to-blue-700",
      desc: "عداد ساعات تلقائي + تنبيهات الزيت والفلاتر — لا تنسَ صيانة أبداً.",
      stats: "تقليل الأعطال 70%",
      bullets: [
        "عداد ساعات تشغيل تلقائي",
        "تنبيه عند موعد تغيير الزيت (250س)",
        "تنبيه فلتر الهواء (500س)",
        "سجل صيانة كامل بالتكاليف",
      ],
    },
    {
      icon: Zap, emoji: "⚡",
      title: "كشف الاستهلاك المخالف",
      tag: "اكتشف الوصلات غير الشرعية",
      gradient: "from-orange-900 to-orange-700",
      desc: "كل مشترك يسحب أكثر مما دفع = أموال ضائعة. النظام يكتشف الفرق تلقائياً.",
      stats: "زيد إيراداتك 15-30%",
      bullets: [
        "مقارنة لحظية بين السحب والمسجَّل",
        "تنبيه عند زيادة 5%+",
        "تحديد المولدات المتأثرة",
        "دليل لمحاسبة الموظفين",
      ],
    },
    {
      icon: Activity, emoji: "⚡",
      title: "مراقبة الفولتية",
      tag: "احمي أجهزة مشتركيك",
      gradient: "from-purple-900 to-purple-700",
      desc: "تذبذب الفولتية يحرق الأجهزة الكهربائية. اكتشفه قبل أن يحدث الضرر.",
      stats: "خدمة فاخرة = مشتركون أوفياء",
      bullets: [
        "مراقبة لحظية للفولتية الخارجة",
        "4 مستويات تنبيه (190/200/240/250)",
        "تنبيهات WhatsApp للحالات الحرجة",
        "سجل كامل لـ30 يوم",
      ],
    },
    {
      icon: TrendingUp, emoji: "💰",
      title: "حاسبة الربحية",
      tag: "اعرف ربحك الحقيقي",
      gradient: "from-green-900 to-teal-700",
      desc: "إيرادات − وقود − مصاريف = ربحك الفعلي لكل مولدة، بدون تخمين.",
      stats: "قرارات أذكى = ربح أكبر",
      bullets: [
        "حساب تلقائي لكلفة الوقود الفعلية",
        "L/hour لكل مولدة",
        "تقدير كلفة الكيلوواط",
        "هامش الربح بالنسبة المئوية",
      ],
    },
    {
      icon: Handshake, emoji: "👥",
      title: "نظام الشركاء",
      tag: "أنهِ خلافات الشركاء للأبد",
      gradient: "from-indigo-900 to-blue-700",
      desc: "في العراق، الخلافات بين الشركاء أكبر سبب لانهيار المولدات. شفافية محاسبية كاملة.",
      stats: "سلام بين الشركاء = استمرار المشروع",
      bullets: [
        "توزيع أرباح بضغطة زر",
        "كشف حساب لحظي لكل شريك",
        "تقارير PDF موقّعة",
        "تنبيهات WhatsApp تلقائية للشركاء",
      ],
    },
  ];

  return (
    <section id="killer-features" className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <Star className="w-3 h-3" style={{ color: "#F59E0B" }} />
            <span className="text-xs font-bold" style={{ color: "#F59E0B" }}>المميزات التي لا توجد في أي نظام عراقي آخر</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black mb-3">المميزات <span className="gradient-text">القاتلة</span></h2>
          <p className="text-sm md:text-base max-w-2xl mx-auto" style={{ color: "var(--text-muted)" }}>
            6 ميزات تجعل أمبير الخيار الوحيد الجدّي لأصحاب المولدات في العراق
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {killers.map((k, i) => (
            <div key={i} className={`rounded-3xl p-6 animate-fade-up delay-${(i % 6) + 1} bg-gradient-to-br ${k.gradient} relative overflow-hidden`}
              style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.3)" }}>
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10" style={{ background: "radial-gradient(circle, white, transparent 70%)" }} />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-4xl">{k.emoji}</div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>{k.tag}</span>
                </div>
                <h3 className="text-xl font-black text-white mb-2">{k.title}</h3>
                <p className="text-sm text-white/80 mb-4 leading-relaxed">{k.desc}</p>
                <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <p className="text-xs font-bold text-white">{k.stats}</p>
                </div>
                <ul className="space-y-1.5">
                  {k.bullets.map((b, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-white/90">
                      <Check className="w-3 h-3 shrink-0 mt-0.5" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ DETAILED FEATURES (the rest) ━━━━━━━━━━
function DetailedFeaturesSection() {
  const groups = [
    {
      title: "الإدارة الأساسية", icon: Users,
      items: [
        { icon: "👥", title: "إدارة المشتركين", desc: "تسجيل، فوترة، ديون، خصومات" },
        { icon: "🚚", title: "إدارة الجباية", desc: "تطبيق جوّال + GPS + POS محمول" },
        { icon: "💸", title: "إصدار فواتير ذكي", desc: "شهري تلقائي + ترحيل ديون + إشعارات" },
        { icon: "👷", title: "إدارة الموظفين", desc: "جباة + مشغلين + محاسبين + صلاحيات" },
      ],
    },
    {
      title: "IoT والاستشعار", icon: Wifi,
      items: [
        { icon: "📡", title: "أجهزة IoT جاهزة", desc: "ESP32 + حساسات حرارة/وقود/تيار/فولتية" },
        { icon: "🌡️", title: "مراقبة الحرارة", desc: "تنبيه فوري عند 85°+ و 95°+" },
        { icon: "⛽", title: "مراقبة الوقود", desc: "نسبة + لتر + تنبيه نقص" },
        { icon: "📺", title: "شاشة Kiosk", desc: "عرض حي على شاشة في مكتبك" },
      ],
    },
    {
      title: "التقارير والذكاء", icon: Brain,
      items: [
        { icon: "📊", title: "22 تقرير ذكي", desc: "ربحية + مخالفات + سرقة + صيانة + ..." },
        { icon: "🤖", title: "تقرير AI شهري", desc: "ملخص تنفيذي تلقائي يوم 25 على واتساب" },
        { icon: "🌍", title: "البصمة الكربونية", desc: "CO₂ + توصيات بيئية" },
        { icon: "📈", title: "حاسبة الربحية", desc: "L/h + cost/kWh + هامش ربح" },
      ],
    },
    {
      title: "المالية والدفع", icon: CreditCard,
      items: [
        { icon: "🏦", title: "APS Fawateer-E (CBI)", desc: "دفع من أي ATM في العراق", badge: "قريباً" },
        { icon: "💳", title: "بوابات دفع متعددة", desc: "FuratPay + APS + زين كاش" },
        { icon: "🤝", title: "نظام الشركاء", desc: "توزيع أرباح + كشوف حساب" },
        { icon: "📲", title: "تنبيهات WhatsApp", desc: "كل حدث حرج على موبايلك" },
      ],
    },
  ];

  return (
    <section id="features" className="px-6 py-24" style={{ background: "rgba(13,27,42,0.4)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black mb-3">كل ما تحتاجه في <span className="gradient-text">مكان واحد</span></h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>16+ ميزة إضافية لإدارة احترافية كاملة</p>
        </div>

        <div className="space-y-12">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
                  <g.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold">{g.title}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {g.items.map((item, i) => (
                  <div key={i} className="glass-card p-5 relative">
                    {(item as any).badge && (
                      <span className="absolute top-3 left-3 text-[9px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(245,158,11,0.2)", color: "#F59E0B" }}>{(item as any).badge}</span>
                    )}
                    <div className="text-3xl mb-2">{item.icon}</div>
                    <h4 className="text-sm font-bold mb-1">{item.title}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ WHY AMPER (strengths) ━━━━━━━━━━
function WhyAmperSection() {
  const reasons = [
    { icon: "🇮🇶", title: "صُنع للعراق", desc: "مصمم خصيصاً للسوق العراقي بكل تفاصيله — العملة، اللغة، الوقت، ثقافة الدفع" },
    { icon: "📡", title: "أوف لاين كامل", desc: "تطبيق الجابي يعمل بدون انترنت ويزامن لما يرجع — لا تخسر دفعة" },
    { icon: "⚡", title: "إعداد بدقائق", desc: "3 دقائق فقط من التسجيل لأول مشترك — بدون تدريب معقد" },
    { icon: "🛡️", title: "بياناتك آمنة", desc: "تشفير TLS + عزل كل عميل في DB منفصل + نسخ احتياطي يومي" },
    { icon: "🚀", title: "تحديثات مستمرة", desc: "ميزة جديدة كل أسبوعين — نستمع لعملائنا ونبني ما يحتاجونه" },
    { icon: "💬", title: "دعم بالعربي", desc: "فريق دعم عراقي على واتساب — رد خلال ساعة في ساعات العمل" },
  ];

  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black mb-3">لماذا <span className="gradient-text">أمبير</span>؟</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>6 أسباب تجعلنا الخيار الأذكى لأصحاب المولدات</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((r, i) => (
            <div key={i} className="glass-card p-6 text-center">
              <div className="text-5xl mb-4">{r.icon}</div>
              <h3 className="text-lg font-bold mb-2">{r.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ HOW IT WORKS ━━━━━━━━━━
function HowItWorksSection() {
  const steps = [
    { num: "1", title: "سجّل مولدتك", desc: "3 دقائق إعداد — أدخل بيانات المولدة والأسعار", icon: "🚀" },
    { num: "2", title: "أضف مشتركيك", desc: "استورد من ملف Excel أو أضفهم يدوياً", icon: "📋" },
    { num: "3", title: "ابدأ التحصيل", desc: "جابيك يعمل من اليوم الأول — أوف لاين وأون لاين", icon: "💵" },
  ];

  return (
    <section className="px-6 py-24" style={{ background: "rgba(13,27,42,0.4)" }}>
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-black mb-3">كيف يعمل <span className="gradient-text">أمبير؟</span></h2>
        <p className="text-sm mb-16" style={{ color: "var(--text-muted)" }}>3 خطوات بسيطة، اليوم نفسه</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px" style={{ background: "var(--border)" }} />
          {steps.map((s, i) => (
            <div key={i} className={`relative animate-fade-up delay-${i + 1}`}>
              <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center font-num text-2xl font-bold text-white relative z-10"
                style={{ background: "var(--gradient-hero)", boxShadow: "var(--glow-blue)" }}>
                {s.num}
              </div>
              <div className="text-3xl mb-2">{s.icon}</div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ PRICING ━━━━━━━━━━
// Minimum subscription is 3 months. NO monthly billing.
// Discounts: 3mo = 0%, 6mo = 5%, 12mo = 15%.
type Period = "quarterly" | "biannual" | "annual";

const PERIODS: { key: Period; label: string; months: number; discount: number; badge?: string }[] = [
  { key: "quarterly", label: "3 شهور", months: 3,  discount: 0 },
  { key: "biannual",  label: "6 شهور", months: 6,  discount: 5 },
  { key: "annual",    label: "سنوي",   months: 12, discount: 15, badge: "الأكثر توفيراً" },
];

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    nameAr: "المبتدئة",
    desc: "للتجربة والمولدات الصغيرة جداً",
    price: 0,
    color: "#64748B",
    features: [
      "30 مشترك كحد أقصى",
      "1 جابي + 1 مولدة",
      "تطبيق الجابي الأساسي",
      "تقارير أساسية",
    ],
    notIncluded: ["IoT", "كاشف السرقة", "نظام الشركاء", "WhatsApp"],
    cta: "ابدأ مجاناً",
    popular: false,
  },
  {
    key: "pro",
    name: "Pro",
    nameAr: "الاحترافية",
    desc: "للمولدات المتوسطة",
    price: 22000,
    color: "#1B4FD8",
    features: [
      "150 مشترك",
      "5 موظفين + مولد رئيسي واحد",
      "1 جهاز IoT",
      "عداد ساعات + جدولة صيانة",
      "تقارير متقدمة (8 تقارير)",
      "تنبيهات Push",
      "خرائط GPS",
      "الكيوسك (1 شاشة)",
    ],
    cta: "ابدأ التجربة المجانية",
    popular: false,
  },
  {
    key: "business",
    name: "Business",
    nameAr: "الأعمال",
    desc: "الخيار الأكثر شيوعاً",
    price: 35000,
    color: "#F59E0B",
    features: [
      "500 مشترك",
      "15 موظف + مولدان (رئيسي + فرع)",
      "5 أجهزة IoT",
      "🛢️ كاشف سرقة الوقود",
      "⚡ كشف الاستهلاك المخالف",
      "⚡ مراقبة الفولتية",
      "💰 حاسبة الربحية الكاملة",
      "👥 نظام الشركاء + توزيع تلقائي",
      "📲 تنبيهات WhatsApp فورية",
      "📊 22 تقرير شامل + AI شهري",
      "🤖 الصيانة الذكية المتقدمة",
      "كل ميزات Pro +",
    ],
    cta: "ابدأ التجربة المجانية",
    popular: true,
    save: "ROI: استثمار 35K يوفّر 250K+ من السرقة وحدها",
  },
  {
    key: "corporate",
    name: "Corporate",
    nameAr: "المؤسسات",
    desc: "للشبكات الكبيرة",
    price: 55000,
    color: "#0F766E",
    features: [
      "2000 مشترك",
      "50 موظف + 3 مولدات (رئيسي + فرعان)",
      "أجهزة IoT غير محدودة",
      "🔐 حساب دخول للشركاء (read-only)",
      "🎯 API access",
      "🗺️ Multi-branch dashboard",
      "كل ميزات Business +",
    ],
    cta: "ابدأ التجربة المجانية",
    popular: false,
  },
  {
    key: "fleet",
    name: "Fleet",
    nameAr: "الأسطول",
    desc: "لمشغّلي الشبكات الضخمة",
    price: 0,
    color: "#7C3AED",
    customPrice: true,
    features: [
      "كل شيء غير محدود",
      "White-label optional",
      "Dedicated support",
      "SLA مخصص",
      "تكاملات مخصصة",
      "تدريب فريقك",
    ],
    cta: "تواصل معنا",
    popular: false,
  },
];

function PricingSection() {
  // Default to 3-month billing — there is no monthly option.
  const [period, setPeriod] = useState<Period>("quarterly");

  const calcPrice = (base: number) => {
    const p = PERIODS.find(x => x.key === period)!;
    const monthlyAfterDiscount = base * (1 - p.discount / 100);
    const total = monthlyAfterDiscount * p.months;
    return { monthly: Math.round(monthlyAfterDiscount), total: Math.round(total) };
  };

  return (
    <section id="pricing" className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-black mb-3">باقات <span className="gradient-text">شفافة وعادلة</span></h2>
          <p className="text-sm md:text-base mb-8" style={{ color: "var(--text-muted)" }}>
            الاشتراك يبدأ من 3 أشهر. وفّر حتى 15% بالاشتراك السنوي. لا رسوم خفية.
          </p>

          {/* Period selector */}
          <div className="inline-flex p-1 rounded-2xl mb-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className="relative px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all"
                style={{
                  background: period === p.key ? "var(--gradient-hero)" : "transparent",
                  color: period === p.key ? "white" : "var(--text-muted)",
                }}>
                {p.label}
                {p.discount > 0 && (
                  <span className="hidden md:inline text-[9px] mr-1 font-bold" style={{ color: period === p.key ? "#FCD34D" : "#F59E0B" }}>
                    -{p.discount}%
                  </span>
                )}
              </button>
            ))}
          </div>
          {period === "annual" && (
            <p className="text-xs" style={{ color: "#F59E0B" }}>
              ⭐ {PERIODS[2].badge}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {PLANS.map((plan) => {
            const { monthly, total } = calcPrice(plan.price);
            const periodObj = PERIODS.find(x => x.key === period)!;
            return (
              <div key={plan.key}
                className="rounded-3xl p-5 relative animate-fade-up flex flex-col"
                style={{
                  background: "var(--bg-card)",
                  border: plan.popular ? `2px solid ${plan.color}` : "1px solid var(--border)",
                  boxShadow: plan.popular ? `0 0 30px ${plan.color}40` : "none",
                }}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold text-white whitespace-nowrap"
                    style={{ background: plan.color }}>
                    ⭐ الأكثر شيوعاً
                  </div>
                )}
                <div className="text-center mb-4 pt-2">
                  <h3 className="text-base font-bold mb-1" style={{ color: plan.color }}>{plan.nameAr}</h3>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{plan.desc}</p>
                </div>

                <div className="text-center mb-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                  {plan.customPrice ? (
                    <div className="font-num text-2xl font-bold gradient-text">حسب الطلب</div>
                  ) : plan.price === 0 ? (
                    <div className="font-num text-3xl font-bold gradient-text">مجاناً</div>
                  ) : (
                    <>
                      <div className="font-num text-3xl font-bold">{monthly.toLocaleString("en")}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>د.ع/شهر</div>
                      <div className="text-[10px] mt-2 px-2 py-1 rounded" style={{ background: "var(--blue-soft)", color: "var(--blue-bright)" }}>
                        إجمالي {periodObj.months}ش: {total.toLocaleString("en")}
                      </div>
                    </>
                  )}
                </div>

                <ul className="space-y-2 mb-4 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-[11px] leading-relaxed">
                      <Check className="w-3 h-3 shrink-0 mt-0.5" style={{ color: plan.color }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {(plan as any).save && (
                  <div className="rounded-xl p-2 mb-3" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <p className="text-[9px] font-bold" style={{ color: "#F59E0B" }}>💡 {(plan as any).save}</p>
                  </div>
                )}

                <a href={plan.key === "fleet"
                    ? WA_LINK("مرحباً، أريد معرفة المزيد عن باقة Fleet المخصصة")
                    : "#trial"}
                  target={plan.key === "fleet" ? "_blank" : undefined}
                  rel={plan.key === "fleet" ? "noopener noreferrer" : undefined}
                  className="block text-center h-11 leading-[44px] rounded-xl font-bold text-xs"
                  style={{
                    background: plan.popular ? plan.color : "transparent",
                    color: plan.popular ? "white" : plan.color,
                    border: plan.popular ? "none" : `1px solid ${plan.color}`,
                  }}>
                  {plan.cta}
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>تحتاج مساعدة في اختيار الباقة المناسبة؟</p>
          <a href={WA_LINK("مرحباً، أحتاج مساعدة في اختيار الباقة المناسبة لمولدتي")}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl"
            style={{ color: "#22C55E", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.05)" }}>
            <MessageCircle className="w-4 h-4" />
            تواصل عبر واتساب لاستشارة مجانية
          </a>
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ COMPARISON ━━━━━━━━━━
function ComparisonSection() {
  const rows = [
    { feature: "إدارة المشتركين", us: true, others: true },
    { feature: "تطبيق جابي أوف لاين", us: true, others: false },
    { feature: "تتبع GPS للجباة", us: true, others: false },
    { feature: "أجهزة IoT متكاملة", us: true, others: false },
    { feature: "كاشف سرقة الوقود", us: true, others: false },
    { feature: "نظام الشركاء + التوزيع", us: true, others: false },
    { feature: "حاسبة الربحية", us: true, others: false },
    { feature: "تنبيهات WhatsApp تلقائية", us: true, others: false },
    { feature: "تقرير AI شهري", us: true, others: false },
    { feature: "22 تقرير ذكي", us: true, others: "محدود" },
    { feature: "دعم عربي محلي", us: true, others: "محدود" },
    { feature: "تحديثات مستمرة", us: true, others: false },
  ];
  return (
    <section className="px-6 py-24" style={{ background: "rgba(13,27,42,0.4)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black mb-3"><span className="gradient-text">أمبير</span> ضد الأنظمة الأخرى</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>قارن بنفسك</p>
        </div>
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th className="text-right text-xs md:text-sm font-bold p-3 md:p-4">الميزة</th>
                <th className="text-center text-xs md:text-sm font-bold p-3 md:p-4">
                  <span className="gradient-text">أمبير</span>
                </th>
                <th className="text-center text-xs md:text-sm font-bold p-3 md:p-4" style={{ color: "var(--text-muted)" }}>
                  أنظمة أخرى
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="text-xs md:text-sm p-3 md:p-4">{r.feature}</td>
                  <td className="text-center p-3 md:p-4">
                    {r.us === true ? (
                      <Check className="w-5 h-5 mx-auto" style={{ color: "#22C55E" }} />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.us}</span>
                    )}
                  </td>
                  <td className="text-center p-3 md:p-4">
                    {r.others === true ? (
                      <Check className="w-5 h-5 mx-auto" style={{ color: "#22C55E" }} />
                    ) : r.others === false ? (
                      <span className="text-xl" style={{ color: "#DC2626" }}>✕</span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.others}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ TESTIMONIALS ━━━━━━━━━━
function TestimonialsSection() {
  const testimonials = [
    { quote: "كاشف سرقة الوقود وحده وفّر علي 300 ألف دينار في أول شهر. كنت أشك بالمشغّل وطلعت ا��سرقة من خط التعبئة.", name: "أبو حسن", loc: "بغداد / الكرادة — 3 مولدات", tag: "وقود", plan: "Business" },
    { quote: "نظام الشركاء أنهى الخلافات. كل شريك يشوف حصته وأرباحه لحظياً، ما عاد نحتاج نكعد نحس�� آخر الشهر.", name: "علي حسين", loc: "البصرة — مولدتان", tag: "شركاء", plan: "Business" },
    { quote: "الجابي يشتغل أوف لاين بالكامل. حتى لو انقطع النت بالحي، ا��دفعات تنحفظ وتتزامن بعدين. ما ضاعت ولا دفعة.", name: "أحمد جاسم", loc: "النجف — مولدة واحدة", tag: "أوف لاين", plan: "Pro" },
    { quote: "التقرير الشهري يجيني على الواتساب تلقائي — إيرادات، ديون، مصاريف، كلشي. ما عاد أحتاج أفتح اللابتوب.", name: "سارة خالد", loc: "نينوى — شبكة 5 مولدات", tag: "تقارير", plan: "Corporate" },
    { quote: "قبل أمبير كان عندي 4 دفاتر ورقية. الآن كل شيء بالتطبيق — حتى المصروفات وديون الموردين. وفّ��ت ساعتين يومياً.", name: "محمد عبد ��لله", loc: "كربلاء — مولدتان", tag: "إدارة", plan: "Business" },
    { quote: "شاشة الكيوسك عند المولدة خلّت المشتركين يشوف��ن حالة الم��لدة بأنفسهم. قلّت الاتصالات بنسبة 70%.", name: "أبو ��يد", loc: "ذي قار — 3 مولدات", tag: "IoT", plan: "Corporate" },
  ];

  return (
    <section className="px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-black text-center mb-3">ماذا يقول <span className="gradient-text">عملاؤنا</span></h2>
        <p className="text-center text-sm mb-4" style={{ color: "var(--text-muted)" }}>+500 صاحب مولدة يثقون بـ أمبير في 18 محافظة</p>

        {/* Stats strip */}
        <div className="flex items-center justify-center gap-8 mb-12">
          {[
            { n: "+500", l: "مولدة" },
            { n: "18", l: "محافظة" },
            { n: "99%", l: "رضا العملاء" },
            { n: "4.9", l: "تقييم" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-lg font-black font-num" style={{ color: "var(--blue-bright)" }}>{s.n}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div key={i} className={`glass-card p-6 animate-fade-up delay-${(i % 3) + 1}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-3.5 h-3.5" fill="#F59E0B" stroke="#F59E0B" />)}
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--blue-soft)", color: "var(--blue-bright)" }}>{t.tag}</span>
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text)" }}>"{t.quote}"</p>
              <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.loc}</p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: t.plan === "Corporate" ? "rgba(15,118,110,0.15)" : t.plan === "Business" ? "rgba(217,119,6,0.15)" : "var(--blue-soft)", color: t.plan === "Corporate" ? "#0F766E" : t.plan === "Business" ? "#D97706" : "var(--blue-primary)" }}>{t.plan}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ CONTACT (trial + general inquiry) ━━━━━━━━━━
function ContactSection() {
  const [tab, setTab] = useState<"trial" | "contact">("trial");
  return (
    <section id="trial" className="px-6 py-24" style={{ background: "rgba(13,27,42,0.4)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black mb-3">جاهز <span className="gradient-text">للبداية؟</span></h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>اطلب تجربتك المجانية أو تواصل معنا للاستفسار</p>
        </div>
        <div className="inline-flex p-1 rounded-2xl mb-6 w-full max-w-sm mx-auto" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <button onClick={() => setTab("trial")}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === "trial" ? "var(--gradient-hero)" : "transparent",
              color: tab === "trial" ? "white" : "var(--text-muted)",
            }}>
            🚀 تجربة مجانية
          </button>
          <button onClick={() => setTab("contact")}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === "contact" ? "var(--gradient-hero)" : "transparent",
              color: tab === "contact" ? "white" : "var(--text-muted)",
            }}>
            💬 استفسار
          </button>
        </div>

        {tab === "trial" ? <TrialForm /> : <ContactForm />}
      </div>
    </section>
  );
}

function TrialForm() {
  // Default to 3-month billing — there is no monthly option anywhere in the system.
  const [form, setForm] = useState({ name: "", phone: "", governorate: "", generator_count: "1", subscriber_count: "", plan_interest: "business", billing_period: "quarterly", notes: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.governorate) { toast.error("يرجى تعبئة الحقول المطلوبة"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/landing/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          generator_count: Number(form.generator_count),
          subscriber_count: Number(form.subscriber_count) || 0,
        }),
      });
      if (res.ok) {
        setDone(true);
        toast.success("شكراً! سيتواصل معك فريقنا قريباً");
      } else {
        toast.error("حدث خطأ — حاول مرة أخرى");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="glass-card p-8 text-center animate-fade-up">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(5,150,105,0.2)" }}>
          <Check className="w-8 h-8" style={{ color: "#059669" }} />
        </div>
        <h3 className="text-xl font-bold mb-2">شكراً!</h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>سيتواصل معك فريقنا خلال ساعة</p>
        <a href={WA_LINK("مرحباً، قمت بالتسجيل لتجربة أمبير المجانية")} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white"
          style={{ background: "#22C55E" }}>
          <MessageCircle className="w-4 h-4" /> أو راسلنا الآن على واتساب
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-3 animate-fade-up">
      <input type="text" placeholder="الاسم الكامل *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <input type="tel" placeholder="رقم الهاتف *" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm font-num outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "right" }} />
      <select value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: form.governorate ? "var(--text)" : "var(--text-muted)" }}>
        <option value="">المحافظة *</option>
        {GOVS.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <select value={form.generator_count} onChange={(e) => setForm({ ...form, generator_count: e.target.value })}
          className="h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="1">1 مولدة</option>
          <option value="2">2 مولدة</option>
          <option value="3">3 مولدات</option>
          <option value="5">5+ مولدات</option>
          <option value="10">10+ مولدات</option>
        </select>
        <input type="number" placeholder="عدد المشتركين" value={form.subscriber_count} onChange={(e) => setForm({ ...form, subscriber_count: e.target.value })}
          className="h-12 px-4 rounded-xl text-sm font-num outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "right" }} />
      </div>
      <select value={form.plan_interest} onChange={(e) => setForm({ ...form, plan_interest: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <option value="starter">Starter — مجاني</option>
        <option value="pro">Pro — 22K/شهر</option>
        <option value="business">Business — 35K/شهر ⭐</option>
        <option value="corporate">Corporate — 55K/شهر</option>
        <option value="fleet">Fleet — حسب الطلب</option>
      </select>
      <select value={form.billing_period} onChange={(e) => setForm({ ...form, billing_period: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <option value="quarterly">3 شهور (الحد الأدنى)</option>
        <option value="biannual">6 شهور (وفّر 5%)</option>
        <option value="annual">سنوي (وفّر 15%)</option>
      </select>
      <textarea placeholder="ملاحظات (اختياري)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <button type="submit" disabled={loading}
        className="w-full h-14 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: "var(--gradient-hero)", boxShadow: "0 4px 30px rgba(27,79,216,0.4)" }}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Rocket className="w-5 h-5" /> ابدأ التجربة المجانية</>}
      </button>
      <p className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
        ✓ بدون بطاقة ائتمانية &nbsp; ✓ 7 أيام مجانية &nbsp; ✓ إلغاء بأي وقت
      </p>
    </form>
  );
}

function ContactForm() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", governorate: "", inquiry_type: "general", message: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.message) { toast.error("الاسم والهاتف والرسالة مطلوبة"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/landing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setDone(true);
        toast.success("شكراً! استلمنا طلبك");
      } else {
        toast.error("حدث خطأ");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="glass-card p-8 text-center animate-fade-up">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(5,150,105,0.2)" }}>
          <Check className="w-8 h-8" style={{ color: "#059669" }} />
        </div>
        <h3 className="text-xl font-bold mb-2">تم الإرسال!</h3>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>سنتواصل معك خلال ساعات قليلة</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-3 animate-fade-up">
      <input type="text" placeholder="الاسم *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <div className="grid grid-cols-2 gap-3">
        <input type="tel" placeholder="رقم الهاتف *" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="h-12 px-4 rounded-xl text-sm font-num outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "right" }} />
        <input type="email" placeholder="البريد (اختياري)" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "right" }} />
      </div>
      <select value={form.inquiry_type} onChange={(e) => setForm({ ...form, inquiry_type: e.target.value })}
        className="w-full h-12 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <option value="general">استفسار عام</option>
        <option value="sales">مبيعات وأسعار</option>
        <option value="demo">طلب عرض توضيحي</option>
        <option value="support">دعم فني</option>
        <option value="partnership">شراكة</option>
      </select>
      <textarea placeholder="رسالتك *" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
      <button type="submit" disabled={loading}
        className="w-full h-14 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: "var(--gradient-hero)", boxShadow: "0 4px 30px rgba(27,79,216,0.4)" }}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><MessageCircle className="w-5 h-5" /> أرسل الرسالة</>}
      </button>
    </form>
  );
}

// ━━━━━━━━━━ FAQ ━━━━━━━━━━
function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    { q: "هل يعمل التطبيق بدون انترنت؟", a: "نعم، تطبيق الجابي يعمل بالكامل أوف لاين ويزامن البيانات تلقائياً عند عودة الاتصال. لن تخسر أي دفعة." },
    { q: "ما الفرق بين الباقات؟ أي واحدة تناسبني؟", a: "Pro (20K) للمولدات الصغيرة (≤150 مشترك). Business (35K) هو الأكثر شيوعاً ويفتح كل القاتلات (سرقة الوقود، الشركاء، التقارير الذكية). Corporate (50K) للشبكات الكبيرة. تواصل معنا للاستشارة المجانية." },
    { q: "كم يوفر لي كاشف سرقة الوقود حقاً؟", a: "متوسط عملائنا يوفر 200-400 ألف دينار شهرياً. هذا وحده يبرر اشتراك Business بـ 35K + هامش ضخم." },
    { q: "ما ميزة الاشتراك السنوي؟", a: "وفّر 20% (شهران مجاناً). مثلاً Business السنوي = 336K بدلاً من 420K. كما يمنحك الأولوية في الدعم وميزات تجريبية مبكرة." },
    { q: "هل يمكن إلغاء الاشتراك؟", a: "نعم في أي وقت بدون أسئلة. لا عقود طويلة الأمد. بياناتك تبقى متاحة لـ 30 يوم بعد الإلغاء." },
    { q: "كيف يعمل نظام الشركاء؟", a: "تُضيف شركاءك بنسبهم، النظام يحسب أرباح الشهر تلقائياً (إيرادات − وقود − مصاريف)، يقسّمها على الشركاء، ويرسل لكل شريك حصته على واتساب." },
    { q: "ما هي أجهزة IoT المطلوبة؟", a: "ESP32 + حساسات حرارة (DS18B20) + وقود (HC-SR04) + تيار (SCT-013) + فولتية (ZMPT101B). كلفة ~33 دولار. أو يمكنك شراء Amper IoT Kit جاهز من متجرنا." },
    { q: "هل توجد رسوم خفية؟", a: "أبداً. السعر المُعلن هو السعر النهائي. لا رسوم إعداد، لا رسوم إلغاء، لا رسوم على المعاملات." },
    { q: "ماذا عن الدعم الفني؟", a: "فريق دعم عراقي على واتساب يومياً. رد خلال ساعة في ساعات العمل، 4 ساعات كحد أقصى. للباقات Business+ تحصل على دعم أولوية." },
    { q: "هل يمكنني تجربة قبل الدفع؟", a: "نعم! 7 أيام تجربة مجانية كاملة على Business بدون بطاقة ائتمانية. تجربة كل شيء قبل الالتزام." },
  ];

  return (
    <section id="faq" className="px-6 py-24">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-black text-center mb-12">الأسئلة <span className="gradient-text">الشائعة</span></h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-right">
                <span className="text-sm font-bold flex-1">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} style={{ color: "var(--text-muted)" }} />
              </button>
              {open === i && (
                <div className="px-5 pb-5">
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>سؤالك ليس هنا؟</p>
          <a href={WA_LINK("مرحباً، عندي سؤال عن نظام أمبير")} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white"
            style={{ background: "#22C55E" }}>
            <MessageCircle className="w-4 h-4" /> راسلنا على واتساب
          </a>
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━ FOOTER ━━━━━━━━━━
function Footer() {
  const columns = [
    { title: "المنتج", links: [{ label: "الميزات", href: "#features" }, { label: "الباقات", href: "#pricing" }, { label: "المتجر", href: "/store" }, { label: "الأسئلة", href: "#faq" }] },
    { title: "الشركة", links: [{ label: "من نحن", href: "#" }, { label: "تواصل معنا", href: "#trial" }, { label: "المدونة", href: "/blog" }, { label: "الوظائف", href: "#" }] },
    { title: "الدعم", links: [{ label: "مركز المساعدة", href: "#" }, { label: "واتساب", href: WA_LINK("مرحباً") }, { label: "سياسة الخصوصية", href: "#" }, { label: "الشروط", href: "#" }] },
  ];

  return (
    <footer className="px-6 py-16" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Hexagon className="w-6 h-6" style={{ color: "var(--blue-bright)" }} strokeWidth={1.5} />
              <span className="text-lg font-black">أمبير</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              نظام إدارة المولدات الذكي في العراق
            </p>
          </div>
          {columns.map((col, i) => (
            <div key={i}>
              <h4 className="text-sm font-bold mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-xs transition-colors hover:text-white" style={{ color: "var(--text-muted)" }}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between pt-8" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>&copy; 2026 أمبير. جميع الحقوق محفوظة.</p>
          <p className="text-xs mt-2 md:mt-0" style={{ color: "var(--text-muted)" }}>صُنع بـ ❤️ في العراق 🇮🇶</p>
        </div>
      </div>
    </footer>
  );
}

// ━━━━━━━━━━ FLOATING WHATSAPP ━━━━━━━━━━
function WhatsAppFloat() {
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <a href={WA_LINK("مرحباً، أريد معرفة المزيد عن نظام أمبير")}
        target="_blank" rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        style={{ background: "#22C55E", boxShadow: "0 4px 20px rgba(34,197,94,0.5)" }}
        aria-label="WhatsApp">
        <MessageCircle className="w-6 h-6 text-white" fill="white" />
      </a>
      {showTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          aria-label="إلى الأعلى">
          <ChevronUp className="w-5 h-5" style={{ color: "var(--text)" }} />
        </button>
      )}
    </>
  );
}

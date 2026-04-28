"use client";

import { useState } from "react";
import {
  ArrowRight, Newspaper, Zap, Shield, Cpu, Fuel, Users, Sparkles,
  Calendar, Tag, ChevronLeft, Rocket, Wrench, Radio,
} from "lucide-react";
import LandingNavbar from "@/components/LandingNavbar";

// ─── Blog posts (hardcoded — move to DB/CMS later) ─────────

interface BlogPost {
  id: string;
  title: string;
  summary: string;
  body: string[];
  date: string;
  tag: string;
  tagColor: string;
  icon: any;
}

const POSTS: BlogPost[] = [
  {
    id: "v2-6-0",
    title: "إصدار 2.6.0 — نظام الموردين + الكيوسك + الوقود والدهن",
    summary: "أكبر تحديث لأمبير حتى الآن: نظام إدارة الموردين والديون، وضع الكيوسك للمولدات، ونظام متكامل لتتبع الوقود وتغيير الدهن.",
    body: [
      "نظام الموردين والديون: أضف مورديك (وقود، دهن، قطع غيار) وتتبع الديون والمدفوعات. كل مصروف يُربط بمورد تلقائياً عند الشراء بالآجل.",
      "وضع الكيوسك: شاشة صناعية داكنة تعرض حالة المولدة لحظياً — حرارة المحركات، مستوى الوقود، التيار والفولتية. مصممة للتركيب بجانب المولدة.",
      "تتبع الوقود: تعبئة وصرف مع تاريخ كامل وتنبيهات المستوى المنخفض. يربط تلقائياً بنظام الموردين عند الشراء بالآجل.",
      "نظام تغيير الدهن: جدولة ذكية حسب الموسم (صيف 15 يوم، عادي 20، شتاء 25). تنبيهات قبل الموعد وعند التأخر.",
      "تقارير شاملة: تقرير استهلاك الوقود، تقرير صيانة الدهن، تقرير ديون الموردين — كلها متاحة بنقرة واحدة.",
    ],
    date: "2026-04-12",
    tag: "إصدار رئيسي",
    tagColor: "#7C3AED",
    icon: Rocket,
  },
  {
    id: "iot-system",
    title: "نظام IoT أمبير — مراقبة المولدة عن بعد",
    summary: "راقب مولدتك من أي مكان: حرارة المحركات، مستوى الوقود، التيار والفولتية — كلها في لوحة تحكم واحدة مع تنبيهات فورية.",
    body: [
      "أمبير IoT يعتمد على لوحة ESP32 مع 4 حساسات: حرارة DS18B20، وقود HC-SR04، تيار SCT-013، وفولتية ZMPT101B. الكلفة الإجمالية ~33 دولار فقط.",
      "البيانات ترسل كل 30 ثانية إلى سيرفر أمبير. في حالة انقطاع الإنترنت، تخزن محلياً وترسل عند العودة.",
      "تنبيهات ذكية: حرارة مرتفعة، وقود منخفض، فولتية غير طبيعية، انقطاع التيار — كلها تصلك إشعار فوري على الهاتف.",
      "وضع الكيوسك: شاشة Raspberry Pi بجانب المولدة تعرض البيانات المباشرة. في حالة انقطاع الإنترنت تتحول تلقائياً لقراءة البيانات محلياً من ESP32.",
      "التفعيل سهل: امسح QR من التطبيق، الجهاز يتصل تلقائياً ويبدأ بإرسال البيانات خلال دقيقة.",
    ],
    date: "2026-04-10",
    tag: "IoT",
    tagColor: "#0891B2",
    icon: Cpu,
  },
  {
    id: "fuel-theft",
    title: "كاشف سرقة الوقود — كيف يعمل؟",
    summary: "النظام يقارن استهلاك الوقود الفعلي مع المتوقع بناءً على ساعات التشغيل. أي انخفاض مفاجئ = تنبيه فوري.",
    body: [
      "حساس الوقود HC-SR04 يقيس مستوى الخزان كل 30 ثانية. النظام يحسب معدل الاستهلاك الطبيعي (لتر/ساعة) بناءً على بيانات أسبوع كامل.",
      "إذا انخفض المستوى بأكثر من 5% خلال فترة لا يعمل فيها المحرك — يصدر تنبيه 'احتمال سرقة وقود' مع الوقت والكمية المفقودة.",
      "التقرير الشهري يظهر: إجمالي الاستهلاك، الاستهلاك المتوقع، الفرق (الهدر أو السرقة)، والتكلفة المالية بالدينار العراقي.",
      "عملاؤنا يوفرون بالمتوسط 200-400 ألف دينار شهرياً من كشف السرقات والهدر. هذا وحده يغطي اشتراك Business بـ 35 ألف.",
    ],
    date: "2026-04-08",
    tag: "ميزة",
    tagColor: "#DC2626",
    icon: Fuel,
  },
  {
    id: "partner-system",
    title: "نظام الشركاء — شفافية كاملة في توزيع الأرباح",
    summary: "كل شريك يرى حصته لحظياً. النظام يحسب الأرباح تلقائياً ويرسل التقرير الشهري لكل شريك على واتساب.",
    body: [
      "أضف شركاءك مع نسبة كل واحد. النظام يحسب تلقائياً: (إيرادات الشهر − الوقود − المصاريف − الرواتب) ÷ عدد الشركاء حسب النسب.",
      "كل شريك يحصل على كود PIN خاص — يدخل التطبيق ويرى لوحة تحكم مبسطة فيها فقط: حصته، الإيرادات، المصاريف.",
      "التقرير الشهري التفصيلي يرسل تلقائياً عبر واتساب — بتنسيق واضح يشمل كل البنود.",
      "عند فتح التطبيق يدخل الشريك مباشرة لبوابته بدون مرور بالشاشة الرئيسية — تجربة مخصصة.",
    ],
    date: "2026-04-05",
    tag: "ميزة",
    tagColor: "#059669",
    icon: Users,
  },
  {
    id: "offline-mode",
    title: "العمل أوف لاين — لماذا هو أهم ميزة في أمبير؟",
    summary: "في العراق، الإنترنت غير مستقر. لذلك صممنا تطبيق الجابي ليعمل بالكامل بدون إنترنت — ولا دفعة تضيع.",
    body: [
      "كل بيانات المشتركين تنزّل محلياً على هاتف الجابي. القائمة كاملة — الأسماء، الديون، الأمبيرات، عنوان الزقاق.",
      "عند جمع دفعة أوف لاين: تحفظ محلياً بتاريخ ووقت دقيق. تتزامن تلقائياً عند عودة الاتصال — بدون أي تدخل.",
      "كل حساب معزول: بيانات المالك أ لا تظهر في هاتف جابي المالك ب. حتى لو تسجل نفس الهاتف بحسابين مختلفين.",
      "الباركود وتقنية مسح QR تعمل أوف لاين أيضاً. الجابي يمسح كود المشترك ويسجل الدفعة بدون أي اتصال.",
    ],
    date: "2026-04-01",
    tag: "تقنية",
    tagColor: "#1B4FD8",
    icon: Shield,
  },
  {
    id: "smart-alerts",
    title: "التنبيهات الذكية — مدير مولدتك الشخصي",
    summary: "مشتركين لم يدفعوا، نسبة تحصيل منخفضة، وقود ينفد، دهن متأخر — أمبير ينبهك قبل ما تصير مشكلة.",
    body: [
      "تنبيه المشتركين الغير دافعين: كل صباح يظهر لك عدد المشتركين اللي عليهم ديون مع قائمتهم — ترسلهم رسالة واتساب بنقرة.",
      "تنبيه نسبة التحصيل: إذا نسبة التحصيل أقل من 70% بنص الشهر — ينبهك 'النسبة منخفضة' مع اقتراحات.",
      "تنبيهات IoT: حرارة مرتفعة > 90°C، وقود < 20%، فولتية > 250V أو < 200V — كلها تصلك فوراً.",
      "تنبيه تغيير الدهن: قبل 3 أيام من الموعد، يوم الموعد، وبعد التأخر — مع اسم المحرك والأيام المتبقية.",
    ],
    date: "2026-03-28",
    tag: "ميزة",
    tagColor: "#D97706",
    icon: Sparkles,
  },
];

// ─── Component ──────────────────────────────────────────────

export default function BlogPage() {
  const [selected, setSelected] = useState<BlogPost | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const tags = [...new Set(POSTS.map(p => p.tag))];
  const filtered = tagFilter ? POSTS.filter(p => p.tag === tagFilter) : POSTS;

  if (selected) {
    return (
      <>
        <LandingNavbar />
        <main className="grid-bg min-h-screen pt-24 px-6 pb-16">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-xs mb-6" style={{ color: "var(--text-muted)" }}>
              <ArrowRight className="w-3 h-3" /> العودة للمدونة
            </button>

            <article>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: selected.tagColor }}>
                  {selected.tag}
                </span>
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Calendar className="w-3 h-3" />
                  {new Date(selected.date).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              </div>

              <h1 className="text-2xl md:text-3xl font-black mb-4 leading-tight">{selected.title}</h1>
              <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--text-muted)" }}>{selected.summary}</p>

              <div className="space-y-6">
                {selected.body.map((para, i) => (
                  <div key={i} className="glass-card p-5">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5" style={{ background: selected.tagColor + "20" }}>
                        <span className="text-xs font-bold" style={{ color: selected.tagColor }}>{i + 1}</span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{para}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-12 glass-card p-8 text-center">
                <h3 className="text-lg font-bold mb-2">جاهز للتجربة؟</h3>
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>جرّب أمبير مجاناً لـ 7 أيام — بدون بطاقة ائتمانية</p>
                <a href="/#trial"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: "var(--gradient-hero)", boxShadow: "0 4px 20px rgba(27,79,216,0.3)" }}>
                  <Rocket className="w-4 h-4" /> ابدأ التجربة المجانية
                </a>
              </div>
            </article>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <LandingNavbar />
      <main className="grid-bg min-h-screen pt-24 px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <a href="/" className="inline-flex items-center gap-1 text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              <ArrowRight className="w-3 h-3" /> الرئيسية
            </a>
            <h1 className="text-3xl md:text-4xl font-black mb-3">
              <Newspaper className="w-8 h-8 inline ml-2" style={{ color: "var(--blue-bright)" }} />
              مدونة <span className="gradient-text">أمبير</span>
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>آخر التحديثات والميزات والأخبار</p>
          </div>

          {/* Tag filter */}
          <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
            <button onClick={() => setTagFilter(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: !tagFilter ? "var(--gradient-hero)" : "var(--bg-card)", color: !tagFilter ? "white" : "var(--text-muted)", border: `1px solid ${!tagFilter ? "transparent" : "var(--border)"}` }}>
              الكل
            </button>
            {tags.map(t => {
              const post = POSTS.find(p => p.tag === t);
              return (
                <button key={t} onClick={() => setTagFilter(t)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{ background: tagFilter === t ? post?.tagColor ?? "var(--blue)" : "var(--bg-card)", color: tagFilter === t ? "white" : "var(--text-muted)", border: `1px solid ${tagFilter === t ? "transparent" : "var(--border)"}` }}>
                  {t}
                </button>
              );
            })}
          </div>

          {/* Featured post */}
          {!tagFilter && (
            <div className="glass-card p-8 mb-8 cursor-pointer glow-border" onClick={() => setSelected(POSTS[0])}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: POSTS[0].tagColor }}>
                  {POSTS[0].tag}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--gold-soft, rgba(217,119,6,0.15))", color: "var(--gold)" }}>
                  أحدث
                </span>
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Calendar className="w-3 h-3" />
                  {new Date(POSTS[0].date).toLocaleDateString("ar-IQ", { month: "long", day: "numeric" })}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black mb-2">{POSTS[0].title}</h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>{POSTS[0].summary}</p>
              <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--blue-bright)" }}>
                اقرأ المزيد <ChevronLeft className="w-3 h-3" />
              </span>
            </div>
          )}

          {/* Posts grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(tagFilter ? filtered : filtered.slice(1)).map((post, i) => {
              const Icon = post.icon;
              return (
                <div
                  key={post.id}
                  className={`glass-card p-6 cursor-pointer glow-border animate-fade-up delay-${(i % 3) + 1}`}
                  onClick={() => setSelected(post)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: post.tagColor + "20" }}>
                      <Icon className="w-4 h-4" style={{ color: post.tagColor }} />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: post.tagColor }}>
                      {post.tag}
                    </span>
                    <span className="text-[10px] mr-auto" style={{ color: "var(--text-muted)" }}>
                      {new Date(post.date).toLocaleDateString("ar-IQ", { month: "long", day: "numeric" })}
                    </span>
                  </div>
                  <h3 className="text-base font-bold mb-2 leading-snug">{post.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{post.summary}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold mt-3" style={{ color: "var(--blue-bright)" }}>
                    اقرأ المزيد <ChevronLeft className="w-3 h-3" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

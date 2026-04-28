"use client";

import { useEffect, useState } from "react";
import { Hexagon, ShoppingCart, Check, Loader2, ArrowRight, Cpu, Monitor, Radio, Thermometer, Fuel, Zap, Box, Star } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import LandingNavbar from "@/components/LandingNavbar";

const GOVS = [
  "بغداد","البصرة","نينوى","أربيل","النجف","كربلاء","ذي قار","بابل",
  "ديالى","الأنبار","كركوك","صلاح الدين","واسط","المثنى","ميسان","القادسية","دهوك","السليمانية",
];

const CATEGORIES = [
  { key: "all", label: "الكل" },
  { key: "pos", label: "أجهزة POS" },
  { key: "iot", label: "أجهزة IoT" },
  { key: "kiosk", label: "شاشات الكيوسك" },
  { key: "sensor", label: "حساسات" },
];

const FALLBACK_PRODUCTS = [
  {
    id: "sunmi", name_ar: "Sunmi V2 Pro", name_en: "Mobile POS Terminal",
    description_ar: "جهاز POS محمول مع طابعة إيصالات حرارية مدمجة — يعمل مع تطبيق الجابي مباشرة",
    price_usd: 85, price_iqd: 110000, category: "pos", badge: "الأكثر مبيعاً",
    features: ["متوافق مع تطبيق أمبير", "طابعة إيصالات 58mm", "شاشة لمس 6 بوصة", "بطارية 7.6V — يوم كامل", "ضمان سنة كاملة"],
    specs: { screen: "6 بوصة", battery: "5900mAh", printer: "58mm حراري", os: "Android 11" },
  },
  {
    id: "rasp", name_ar: "Raspberry Pi 4B — كيوسك أمبير", name_en: "Kiosk Display Unit",
    description_ar: "شاشة الكيوسك تعرض حالة المولدة للمشتركين — حرارة، وقود، تيار، حالة التشغيل",
    price_usd: 120, price_iqd: 155000, category: "kiosk", badge: "جديد",
    features: ["إعداد تلقائي — وصّل وشغّل", "شاشة 4 بوصة IPS", "واجهة عربية كاملة", "تحديث تلقائي OTA", "وضع ليلي تلقائي"],
    specs: { screen: "4 بوصة IPS", ram: "4GB", storage: "32GB", connectivity: "WiFi + Ethernet" },
  },
  {
    id: "iot-kit", name_ar: "Amper IoT Kit", name_en: "Complete IoT Monitoring Kit",
    description_ar: "طقم مراقبة المولدة الكامل — حساس حرارة + وقود + تيار + فولتية + لوحة ESP32",
    price_usd: 33, price_iqd: 43000, category: "iot", badge: "أفضل قيمة",
    features: ["ESP32 مبرمج مسبقاً", "4 حساسات متضمنة", "كيبل وتوصيلات", "دليل تركيب عربي", "تفعيل بمسح QR"],
    specs: { board: "ESP32-WROOM", sensors: "4 حساسات", power: "5V USB", wireless: "WiFi 2.4GHz" },
  },
  {
    id: "ct-sensor", name_ar: "حساس التيار SCT-013", name_en: "CT Current Sensor",
    description_ar: "حساس تيار غير تلامسي — يقيس استهلاك الأمبير لكل محرك بدقة عالية",
    price_usd: 8, price_iqd: 10000, category: "sensor",
    features: ["قياس حتى 100A", "غير تلامسي — بدون قطع أسلاك", "دقة ±1%", "مقاوم للحرارة"],
    specs: { range: "0-100A", accuracy: "±1%", type: "Split-core" },
  },
  {
    id: "ds18b20", name_ar: "حساس الحرارة DS18B20", name_en: "Temperature Sensor",
    description_ar: "حساس حرارة رقمي مقاوم للماء — يقيس حرارة المحرك والرادياتور",
    price_usd: 5, price_iqd: 6500, category: "sensor",
    features: ["مقاوم للماء والحرارة", "كيبل 1 متر", "دقة ±0.5°C", "نطاق -55 إلى 125°C"],
    specs: { range: "-55°C → 125°C", accuracy: "±0.5°C", cable: "1m مقاوم للماء" },
  },
  {
    id: "fuel-sensor", name_ar: "حساس الوقود HC-SR04", name_en: "Ultrasonic Fuel Level Sensor",
    description_ar: "حساس مستوى الوقود بالموجات فوق الصوتية — يركّب أعلى الخزان",
    price_usd: 6, price_iqd: 8000, category: "sensor",
    features: ["قياس المسافة 2-400cm", "دقة ±3mm", "تركيب بسيط أعلى الخزان", "يعمل مع جميع أشكال الخزانات"],
    specs: { range: "2-400cm", accuracy: "±3mm", voltage: "5V", angle: "15°" },
  },
  {
    id: "voltage-sensor", name_ar: "حساس الفولتية ZMPT101B", name_en: "AC Voltage Sensor Module",
    description_ar: "قياس فولتية المولدة — كشف الارتفاع والانخفاض تلقائياً",
    price_usd: 4, price_iqd: 5000, category: "sensor",
    features: ["قياس 0-250V AC", "عزل كهربائي كامل", "تنبيه فولتية عالية/منخفضة", "حجم صغير"],
    specs: { range: "0-250V AC", isolation: "كهربائي كامل", output: "Analog" },
  },
];

const CATEGORY_ICONS: Record<string, any> = {
  pos: ShoppingCart, iot: Cpu, kiosk: Monitor, sensor: Radio, default: Box,
};

export default function StorePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [orderProduct, setOrderProduct] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", governorate: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/landing/store/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.products?.length > 0 ? d.products : FALLBACK_PRODUCTS))
      .catch(() => setProducts(FALLBACK_PRODUCTS));
  }, []);

  const filtered = filter === "all" ? products : products.filter(p => p.category === filter);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.governorate) { toast.error("يرجى تعبئة جميع الحقول"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/landing/store/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: orderProduct.id, ...form }),
      });
      if (res.ok) {
        toast.success("تم إرسال طلبك — سنتواصل معك قريباً");
        setOrderProduct(null);
        setForm({ name: "", phone: "", governorate: "", notes: "" });
      }
    } catch {
      toast.error("خطأ في الإرسال");
    }
    setSubmitting(false);
  };

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: "Tajawal", direction: "rtl", background: "#1E293B", color: "#E2E8F0" } }} />
      <LandingNavbar />
      <main className="grid-bg min-h-screen pt-24 px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <a href="/" className="inline-flex items-center gap-1 text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              <ArrowRight className="w-3 h-3" /> الرئيسية
            </a>
            <h1 className="text-3xl md:text-4xl font-black mb-3">
              <ShoppingCart className="w-8 h-8 inline ml-2" style={{ color: "var(--blue-bright)" }} />
              متجر <span className="gradient-text">أمبير</span>
            </h1>
            <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
              أجهزة معتمدة ومتوافقة مع نظام أمبير — مبرمجة مسبقاً وجاهزة للتشغيل
            </p>
          </div>

          {/* Category filter */}
          <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setFilter(cat.key)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: filter === cat.key ? "var(--gradient-hero)" : "var(--bg-card)",
                  color: filter === cat.key ? "white" : "var(--text-muted)",
                  border: `1px solid ${filter === cat.key ? "transparent" : "var(--border)"}`,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Products grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((p, i) => {
              const Icon = CATEGORY_ICONS[p.category] ?? CATEGORY_ICONS.default;
              return (
                <div key={p.id} className={`glass-card p-5 flex flex-col animate-fade-up delay-${(i % 3) + 1}`}>
                  {/* Badge */}
                  {p.badge && (
                    <div className="mb-3">
                      <span className="text-[9px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: p.badge === "الأكثر مبيعاً" ? "var(--gold)" : p.badge === "أفضل قيمة" ? "#059669" : "var(--blue)" }}>
                        {p.badge}
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className="w-full h-32 rounded-2xl mb-4 flex items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
                    <Icon className="w-12 h-12" style={{ color: "var(--blue-bright)", opacity: 0.35 }} />
                  </div>

                  <h3 className="text-base font-bold mb-0.5">{p.name_ar}</h3>
                  <p className="text-[10px] font-mono mb-2" style={{ color: "var(--blue-bright)" }}>{p.name_en}</p>
                  <p className="text-xs mb-3 flex-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{p.description_ar}</p>

                  {/* Price */}
                  <div className="mb-3">
                    <span className="font-num text-xl font-bold">${p.price_usd}</span>
                    <span className="text-[10px] mr-1" style={{ color: "var(--text-muted)" }}>USD</span>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      ≈ {Number(p.price_iqd).toLocaleString("en")} د.ع
                    </p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-1 mb-4">
                    {(p.features ?? []).slice(0, 4).map((f: string, j: number) => (
                      <li key={j} className="flex items-center gap-1.5 text-[11px]">
                        <Check className="w-3 h-3 shrink-0" style={{ color: "var(--blue-bright)" }} />
                        <span style={{ color: "var(--text)" }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Specs (if present) */}
                  {p.specs && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {Object.entries(p.specs).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: "var(--blue-soft)", color: "var(--blue-bright)" }}>
                          {v as string}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setOrderProduct(p)}
                    className="w-full h-11 rounded-xl font-bold text-sm text-white mt-auto"
                    style={{ background: "var(--gradient-hero)", boxShadow: "0 4px 20px rgba(27,79,216,0.3)" }}
                  >
                    اطلب الآن
                  </button>
                </div>
              );
            })}
          </div>

          {/* IoT setup info */}
          <div className="mt-16 glass-card p-8">
            <h2 className="text-xl font-black mb-4 text-center">
              <Cpu className="w-5 h-5 inline ml-2" style={{ color: "var(--blue-bright)" }} />
              كيف يعمل نظام <span className="gradient-text">IoT أمبير</span>؟
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
              {[
                { icon: Box, title: "1. اشترِ الطقم", desc: "اطلب Amper IoT Kit أو اشترِ القطع منفصلة" },
                { icon: Zap, title: "2. ركّب الحساسات", desc: "التيار على السلك، الحرارة على المحرك، الوقود أعلى الخزان" },
                { icon: Cpu, title: "3. فعّل بـ QR", desc: "امسح كود التفعيل من التطبيق — يتصل تلقائياً" },
                { icon: Monitor, title: "4. راقب لحظياً", desc: "بيانات المحرك تظهر في لوحة التحكم + تنبيهات فورية" },
              ].map((step, i) => (
                <div key={i} className="text-center">
                  <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "var(--blue-soft)" }}>
                    <step.icon className="w-5 h-5" style={{ color: "var(--blue-bright)" }} />
                  </div>
                  <h4 className="text-sm font-bold mb-1">{step.title}</h4>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order modal */}
        {orderProduct && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center px-4">
            <div className="w-full max-w-md rounded-t-[24px] md:rounded-[24px] p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h3 className="text-lg font-bold mb-1">طلب {orderProduct.name_ar}</h3>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                ${orderProduct.price_usd} USD — ≈ {Number(orderProduct.price_iqd).toLocaleString("en")} د.ع
              </p>

              <form onSubmit={handleOrder} className="space-y-3">
                <input type="text" placeholder="الاسم الكامل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <input type="tel" placeholder="رقم الهاتف" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl text-sm font-num outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)", textAlign: "right" }} />
                <select value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl text-sm outline-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: form.governorate ? "var(--text)" : "var(--text-muted)" }}>
                  <option value="">المحافظة</option>
                  {GOVS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <textarea placeholder="ملاحظات (اختياري) — مثلاً: الكمية، عنوان التوصيل" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setOrderProduct(null)}
                    className="flex-1 h-12 rounded-xl font-bold text-sm" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: "var(--gradient-hero)" }}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "إرسال الطلب"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

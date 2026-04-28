"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Hexagon, Menu, X } from "lucide-react";

const links = [
  { href: "#features", label: "الميزات" },
  { href: "#pricing", label: "الباقات" },
  { href: "/store", label: "المتجر" },
  { href: "/blog", label: "المدونة" },
  { href: "#faq", label: "الأسئلة" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(6,13,26,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border)" : "none",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Hexagon className="w-7 h-7" style={{ color: "var(--blue-bright)" }} strokeWidth={1.5} />
          <span className="text-lg font-black" style={{ color: "var(--text)" }}>أمبير</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium transition-colors hover:text-white"
              style={{ color: "var(--text-muted)" }}
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="/staff/login"
            className="text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            تسجيل الدخول
          </a>
          <a
            href="#trial"
            className="text-sm font-bold px-5 py-2.5 rounded-xl text-white"
            style={{
              background: "var(--gradient-hero)",
              boxShadow: "0 4px 20px rgba(27,79,216,0.35)",
            }}
          >
            ابدأ تجربتك
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ color: "var(--text)" }}
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden px-6 pb-6 space-y-3"
          style={{ background: "rgba(6,13,26,0.95)", backdropFilter: "blur(20px)" }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block py-2 text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#trial"
            onClick={() => setMenuOpen(false)}
            className="block text-center text-sm font-bold px-5 py-3 rounded-xl text-white"
            style={{ background: "var(--gradient-hero)" }}
          >
            ابدأ تجربتك المجانية
          </a>
        </div>
      )}
    </nav>
  );
}

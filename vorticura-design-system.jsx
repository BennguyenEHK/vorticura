import { useState } from "react";

const themes = {
  dark: {
    name: "Void Mode",
    bg: "#07080E",
    bgSecondary: "#0D1017",
    bgTertiary: "#131722",
    bgCard: "rgba(16, 20, 32, 0.85)",
    bgCardHover: "rgba(22, 28, 48, 0.95)",
    bgGlass: "rgba(12, 16, 28, 0.6)",
    surface: "#181D2E",
    surfaceLight: "#1E2438",
    border: "rgba(99, 140, 255, 0.12)",
    borderHover: "rgba(99, 140, 255, 0.3)",
    text: "#E8ECF4",
    textSecondary: "#8B93A8",
    textMuted: "#505872",
    accent: "#638CFF",
    accentLight: "#8AADFF",
    accentSoft: "rgba(99, 140, 255, 0.12)",
    accentGlow: "rgba(99, 140, 255, 0.25)",
    success: "#34D399",
    successSoft: "rgba(52, 211, 153, 0.12)",
    warning: "#FBBF24",
    warningSoft: "rgba(251, 191, 36, 0.12)",
    danger: "#F87171",
    dangerSoft: "rgba(248, 113, 113, 0.12)",
    purple: "#A78BFA",
    purpleSoft: "rgba(167, 139, 250, 0.12)",
    cyan: "#22D3EE",
    cyanSoft: "rgba(34, 211, 238, 0.12)",
    gradient1: "linear-gradient(135deg, #638CFF 0%, #A78BFA 50%, #22D3EE 100%)",
    gradient2: "linear-gradient(135deg, #07080E 0%, #131732 50%, #0D1017 100%)",
    gradientCard: "linear-gradient(145deg, rgba(99,140,255,0.06) 0%, rgba(167,139,250,0.03) 100%)",
    shadow: "0 8px 32px rgba(0,0,0,0.4)",
    shadowGlow: "0 0 40px rgba(99, 140, 255, 0.08)",
    navBg: "rgba(7, 8, 14, 0.85)",
  },
  light: {
    name: "Stellar Mode",
    bg: "#F4F5FA",
    bgSecondary: "#ECEEF5",
    bgTertiary: "#E4E7F0",
    bgCard: "rgba(255, 255, 255, 0.9)",
    bgCardHover: "rgba(255, 255, 255, 1)",
    bgGlass: "rgba(255, 255, 255, 0.7)",
    surface: "#FFFFFF",
    surfaceLight: "#F8F9FC",
    border: "rgba(45, 60, 120, 0.1)",
    borderHover: "rgba(45, 60, 120, 0.22)",
    text: "#1A1F36",
    textSecondary: "#5A6178",
    textMuted: "#9198AD",
    accent: "#4A6CF7",
    accentLight: "#6B87F9",
    accentSoft: "rgba(74, 108, 247, 0.08)",
    accentGlow: "rgba(74, 108, 247, 0.15)",
    success: "#10B981",
    successSoft: "rgba(16, 185, 129, 0.08)",
    warning: "#F59E0B",
    warningSoft: "rgba(245, 158, 11, 0.08)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.08)",
    purple: "#8B5CF6",
    purpleSoft: "rgba(139, 92, 246, 0.08)",
    cyan: "#06B6D4",
    cyanSoft: "rgba(6, 182, 212, 0.08)",
    gradient1: "linear-gradient(135deg, #4A6CF7 0%, #8B5CF6 50%, #06B6D4 100%)",
    gradient2: "linear-gradient(135deg, #F4F5FA 0%, #E8EAFB 50%, #F0F1F8 100%)",
    gradientCard: "linear-gradient(145deg, rgba(74,108,247,0.04) 0%, rgba(139,92,246,0.02) 100%)",
    shadow: "0 8px 32px rgba(45, 60, 120, 0.08)",
    shadowGlow: "0 0 40px rgba(74, 108, 247, 0.06)",
    navBg: "rgba(244, 245, 250, 0.88)",
  },
};

const VorticuraLogo = ({ t, size = 28 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke={t.accent} strokeWidth="1.5" opacity="0.3" />
      <circle cx="20" cy="20" r="12" stroke={t.accent} strokeWidth="1.5" opacity="0.5" />
      <circle cx="20" cy="20" r="6" fill={t.accent} opacity="0.8" />
      <path d="M20 2 C28 8, 32 14, 20 20 C8 14, 12 8, 20 2Z" fill={t.accent} opacity="0.2" />
      <path d="M20 38 C12 32, 8 26, 20 20 C32 26, 28 32, 20 38Z" fill={t.purple} opacity="0.2" />
      <path d="M2 20 C8 12, 14 8, 20 20 C14 32, 8 28, 2 20Z" fill={t.cyan} opacity="0.15" />
      <path d="M38 20 C32 28, 26 32, 20 20 C26 8, 32 12, 38 20Z" fill={t.accent} opacity="0.15" />
    </svg>
    <span style={{ fontSize: size * 0.64, fontFamily: "'Outfit', sans-serif", fontWeight: 700, letterSpacing: "-0.02em", color: t.text }}>
      Vorti<span style={{ color: t.accent }}>cura</span>
    </span>
  </div>
);

const Section = ({ title, children, t }) => (
  <div style={{ marginBottom: 48 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
      <div style={{ width: 3, height: 20, borderRadius: 2, background: t.gradient1 }} />
      <h2 style={{ fontSize: 18, fontWeight: 600, color: t.text, fontFamily: "'Outfit', sans-serif", margin: 0 }}>{title}</h2>
    </div>
    {children}
  </div>
);

const ColorSwatch = ({ color, name, hex, t }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
    <div style={{ width: 56, height: 56, borderRadius: 14, background: color, border: `1px solid ${t.border}`, boxShadow: t.shadow }} />
    <span style={{ fontSize: 11, fontWeight: 600, color: t.text, fontFamily: "'JetBrains Mono', monospace" }}>{name}</span>
    <span style={{ fontSize: 10, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{hex}</span>
  </div>
);

export default function VorticuraDesignSystem() {
  const [mode, setMode] = useState("dark");
  const [activeTab, setActiveTab] = useState("overview");
  const t = themes[mode];

  const tabs = ["overview", "colors", "typography", "components", "dashboard"];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif", transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: t.navBg, borderBottom: `1px solid ${t.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <VorticuraLogo t={t} size={26} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", background: activeTab === tab ? t.accentSoft : "transparent", color: activeTab === tab ? t.accent : t.textSecondary, border: activeTab === tab ? `1px solid ${t.borderHover}` : "1px solid transparent", borderRadius: 8, cursor: "pointer", textTransform: "capitalize", transition: "all 0.2s" }}>
              {tab}
            </button>
          ))}
        </div>
        {/* Theme Toggle */}
        <button onClick={() => setMode(m => m === "dark" ? "light" : "dark")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>
          {mode === "dark" ? "☀️" : "🌙"} {t.name}
        </button>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            {/* Hero */}
            <div style={{ textAlign: "center", padding: "56px 0 48px", position: "relative" }}>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${t.accentGlow} 0%, transparent 70%)`, pointerEvents: "none" }} />
              <VorticuraLogo t={t} size={40} />
              <div style={{ marginTop: 24 }}>
                <h1 style={{ fontSize: 44, fontWeight: 800, fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.03em", margin: "0 0 12px", lineHeight: 1.1 }}>
                  Design System <span style={{ background: t.gradient1, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>& Brand Guide</span>
                </h1>
                <p style={{ fontSize: 16, color: t.textSecondary, maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
                  AI-powered procurement automation. Warp-speed results. Zero setup friction. Built for the future of enterprise buying.
                </p>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 28 }}>
                <div style={{ padding: "10px 24px", borderRadius: 10, background: t.gradient1, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Get Started Free</div>
                <div style={{ padding: "10px 24px", borderRadius: 10, border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 600, background: t.bgCard, cursor: "pointer" }}>Watch Demo</div>
              </div>
            </div>

            {/* Brand Pillars */}
            <Section title="Brand Pillars" t={t}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {[
                  { icon: "◎", title: "Warp Speed", desc: "Instant results with zero configuration. Your procurement warps to completion." },
                  { icon: "⬡", title: "Stellar Intelligence", desc: "AI that learns your patterns and navigates the procurement cosmos autonomously." },
                  { icon: "◈", title: "Gravitational Pull", desc: "Unified platform that draws every procurement need into one orbital system." },
                ].map((p, i) => (
                  <div key={i} style={{ padding: 24, borderRadius: 16, background: t.gradientCard, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }}>
                    <div style={{ fontSize: 28, marginBottom: 14, background: t.gradient1, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{p.icon}</div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, fontFamily: "'Outfit', sans-serif", color: t.text }}>{p.title}</h3>
                    <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Voice & Tone */}
            <Section title="Voice & Tone" t={t}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ padding: 20, borderRadius: 14, background: t.successSoft, border: `1px solid ${t.success}22` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.success, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>✓ DO</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: t.textSecondary, lineHeight: 2 }}>
                    <li>Confident & futuristic</li>
                    <li>Action-oriented ("Warp it", "Launch")</li>
                    <li>Space metaphors for complex ideas</li>
                    <li>Clean, concise microcopy</li>
                  </ul>
                </div>
                <div style={{ padding: 20, borderRadius: 14, background: t.dangerSoft, border: `1px solid ${t.danger}22` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.danger, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>✗ DON'T</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: t.textSecondary, lineHeight: 2 }}>
                    <li>Corporate jargon or buzzwords</li>
                    <li>Overly casual or playful</li>
                    <li>Vague language ("synergy")</li>
                    <li>Long, dense paragraphs</li>
                  </ul>
                </div>
              </div>
            </Section>
          </>
        )}

        {/* COLORS */}
        {activeTab === "colors" && (
          <>
            <Section title="Primary Palette" t={t}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 32 }}>
                <ColorSwatch color={t.accent} name="Nebula Blue" hex={t.accent} t={t} />
                <ColorSwatch color={t.purple} name="Void Purple" hex={t.purple} t={t} />
                <ColorSwatch color={t.cyan} name="Stellar Cyan" hex={t.cyan} t={t} />
                <ColorSwatch color={t.success} name="Orbit Green" hex={t.success} t={t} />
                <ColorSwatch color={t.warning} name="Solar Gold" hex={t.warning} t={t} />
                <ColorSwatch color={t.danger} name="Alert Red" hex={t.danger} t={t} />
              </div>
            </Section>

            <Section title="Background & Surface" t={t}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 32 }}>
                <ColorSwatch color={t.bg} name="Base" hex={t.bg} t={t} />
                <ColorSwatch color={t.bgSecondary} name="Secondary" hex={t.bgSecondary} t={t} />
                <ColorSwatch color={t.bgTertiary} name="Tertiary" hex={t.bgTertiary} t={t} />
                <ColorSwatch color={t.surface} name="Surface" hex={t.surface} t={t} />
                <ColorSwatch color={t.bgCard} name="Card" hex="glass" t={t} />
              </div>
            </Section>

            <Section title="Text Hierarchy" t={t}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { label: "Primary", color: t.text, sample: "Main headings and body text" },
                  { label: "Secondary", color: t.textSecondary, sample: "Descriptions and supplementary info" },
                  { label: "Muted", color: t.textMuted, sample: "Placeholders, disabled states, hints" },
                  { label: "Accent", color: t.accent, sample: "Links, interactive elements, highlights" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: t.bgCard, border: `1px solid ${t.border}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: item.color }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: item.color, fontFamily: "'JetBrains Mono', monospace" }}>{item.label}</div>
                      <div style={{ fontSize: 13, color: item.color }}>{item.sample}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Gradient Spectrum" t={t}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ height: 64, borderRadius: 14, background: t.gradient1, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>Primary Gradient — CTAs, headers, highlights</div>
                <div style={{ height: 48, borderRadius: 12, background: `linear-gradient(90deg, ${t.accent}, ${t.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>Data Gradient — charts, progress, metrics</div>
                <div style={{ height: 48, borderRadius: 12, background: `linear-gradient(90deg, ${t.purple}, ${t.accent})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>AI Gradient — AI features, automation badges</div>
              </div>
            </Section>
          </>
        )}

        {/* TYPOGRAPHY */}
        {activeTab === "typography" && (
          <>
            <Section title="Type Scale" t={t}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24, borderRadius: 16, background: t.bgCard, border: `1px solid ${t.border}` }}>
                {[
                  { tag: "Display", size: 48, weight: 800, font: "Outfit", tracking: "-0.04em" },
                  { tag: "H1", size: 36, weight: 700, font: "Outfit", tracking: "-0.03em" },
                  { tag: "H2", size: 28, weight: 700, font: "Outfit", tracking: "-0.02em" },
                  { tag: "H3", size: 22, weight: 600, font: "Outfit", tracking: "-0.01em" },
                  { tag: "H4", size: 18, weight: 600, font: "Outfit", tracking: "0" },
                  { tag: "Body", size: 15, weight: 400, font: "DM Sans", tracking: "0" },
                  { tag: "Small", size: 13, weight: 500, font: "DM Sans", tracking: "0.01em" },
                  { tag: "Code", size: 13, weight: 500, font: "JetBrains Mono", tracking: "0.02em" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 16 }}>
                    <div style={{ minWidth: 70 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{item.tag}</span>
                    </div>
                    <span style={{ fontSize: item.size, fontWeight: item.weight, fontFamily: `'${item.font}', sans-serif`, letterSpacing: item.tracking, color: t.text, lineHeight: 1.2 }}>Vorticura</span>
                    <span style={{ fontSize: 10, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto", whiteSpace: "nowrap" }}>{item.size}px / {item.weight} / {item.font}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Font Stack" t={t}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {[
                  { name: "Outfit", role: "Display & Headings", desc: "Geometric, modern, with personality. Tight tracking for impact." },
                  { name: "DM Sans", role: "Body & UI", desc: "Clean, humanist sans-serif. Excellent readability at small sizes." },
                  { name: "JetBrains Mono", role: "Code & Data", desc: "Monospace for metrics, code snippets, and data labels." },
                ].map((f, i) => (
                  <div key={i} style={{ padding: 20, borderRadius: 14, background: t.gradientCard, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: `'${f.name}', sans-serif`, marginBottom: 8, color: t.text }}>{f.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.accent, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{f.role}</div>
                    <p style={{ fontSize: 12, color: t.textSecondary, margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* COMPONENTS */}
        {activeTab === "components" && (
          <>
            <Section title="Buttons" t={t}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button style={{ padding: "10px 22px", borderRadius: 10, background: t.gradient1, color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Primary Action</button>
                <button style={{ padding: "10px 22px", borderRadius: 10, background: t.accentSoft, color: t.accent, fontSize: 13, fontWeight: 600, border: `1px solid ${t.borderHover}`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Secondary</button>
                <button style={{ padding: "10px 22px", borderRadius: 10, background: "transparent", color: t.textSecondary, fontSize: 13, fontWeight: 600, border: `1px solid ${t.border}`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Outline</button>
                <button style={{ padding: "10px 22px", borderRadius: 10, background: t.dangerSoft, color: t.danger, fontSize: 13, fontWeight: 600, border: `1px solid ${t.danger}22`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Destructive</button>
                <button style={{ padding: "8px 18px", borderRadius: 8, background: t.successSoft, color: t.success, fontSize: 12, fontWeight: 600, border: `1px solid ${t.success}22`, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Small</button>
              </div>
            </Section>

            <Section title="Status Badges" t={t}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "● Approved", bg: t.successSoft, color: t.success, border: `${t.success}22` },
                  { label: "● Pending", bg: t.warningSoft, color: t.warning, border: `${t.warning}22` },
                  { label: "● Rejected", bg: t.dangerSoft, color: t.danger, border: `${t.danger}22` },
                  { label: "◎ AI Processing", bg: t.purpleSoft, color: t.purple, border: `${t.purple}22` },
                  { label: "◉ In Transit", bg: t.cyanSoft, color: t.cyan, border: `${t.cyan}22` },
                ].map((b, i) => (
                  <span key={i} style={{ padding: "5px 14px", borderRadius: 20, background: b.bg, color: b.color, fontSize: 12, fontWeight: 600, border: `1px solid ${b.border}`, fontFamily: "'DM Sans', sans-serif" }}>{b.label}</span>
                ))}
              </div>
            </Section>

            <Section title="Cards & Inputs" t={t}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Card */}
                <div style={{ padding: 24, borderRadius: 16, background: t.bgCard, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: t.accent, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>PO-2847</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>Server Equipment</div>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 16, background: t.successSoft, color: t.success, fontSize: 11, fontWeight: 600 }}>Approved</span>
                  </div>
                  <div style={{ display: "flex", gap: 24, fontSize: 12, color: t.textSecondary }}>
                    <span>Vendor: <strong style={{ color: t.text }}>Nebula Corp</strong></span>
                    <span>$<strong style={{ color: t.text }}>24,500</strong></span>
                  </div>
                  <div style={{ marginTop: 16, height: 4, borderRadius: 2, background: t.bgTertiary }}>
                    <div style={{ width: "75%", height: "100%", borderRadius: 2, background: t.gradient1 }} />
                  </div>
                </div>

                {/* Input group */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary, display: "block", marginBottom: 6 }}>Vendor Name</label>
                    <input placeholder="Search vendors..." style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary, display: "block", marginBottom: 6 }}>Category</label>
                    <div style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgCard, color: t.textMuted, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                      <span>Select category...</span>
                      <span>▾</span>
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: t.purpleSoft, border: `1px solid ${t.purple}18`, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>✦</span>
                    <span style={{ fontSize: 12, color: t.purple, fontWeight: 500 }}>AI auto-fill available for this field</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Spacing & Radius" t={t}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                {[
                  { r: 6, label: "sm / 6px" },
                  { r: 10, label: "md / 10px" },
                  { r: 14, label: "lg / 14px" },
                  { r: 20, label: "xl / 20px" },
                  { r: 9999, label: "pill" },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: item.r, border: `2px solid ${t.accent}`, background: t.accentSoft }} />
                    <div style={{ marginTop: 8, fontSize: 10, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* DASHBOARD PREVIEW */}
        {activeTab === "dashboard" && (
          <>
            <Section title="Dashboard Preview" t={t}>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Active POs", value: "247", change: "+12%", color: t.success, icon: "📦" },
                  { label: "AI Processed", value: "1,842", change: "+34%", color: t.accent, icon: "✦" },
                  { label: "Cost Saved", value: "$482K", change: "+18%", color: t.purple, icon: "💎" },
                  { label: "Avg. Time", value: "2.4h", change: "-47%", color: t.cyan, icon: "⚡" },
                ].map((s, i) => (
                  <div key={i} style={{ padding: 18, borderRadius: 14, background: t.bgCard, border: `1px solid ${t.border}`, backdropFilter: "blur(10px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: t.textSecondary, fontWeight: 500 }}>{s.label}</span>
                      <span style={{ fontSize: 16 }}>{s.icon}</span>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: t.text, letterSpacing: "-0.02em" }}>{s.value}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.change} this month</span>
                  </div>
                ))}
              </div>

              {/* Chart area + sidebar */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                {/* Chart placeholder */}
                <div style={{ padding: 20, borderRadius: 14, background: t.bgCard, border: `1px solid ${t.border}`, minHeight: 220 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Procurement Flow</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["7D", "30D", "90D"].map(p => (
                        <span key={p} style={{ padding: "3px 10px", borderRadius: 6, background: p === "30D" ? t.accentSoft : "transparent", color: p === "30D" ? t.accent : t.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{p}</span>
                      ))}
                    </div>
                  </div>
                  {/* Bars */}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 8px" }}>
                    {[45, 62, 38, 78, 55, 92, 67, 84, 50, 71, 88, 60].map((h, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", height: h * 1.4, borderRadius: 4, background: i === 5 ? t.gradient1 : t.accentSoft, transition: "height 0.3s" }} />
                        <span style={{ fontSize: 9, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{["J","F","M","A","M","J","J","A","S","O","N","D"][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity Feed */}
                <div style={{ padding: 18, borderRadius: 14, background: t.bgCard, border: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: t.text, display: "block", marginBottom: 14 }}>Live Activity</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { text: "PO-2847 auto-approved", time: "2m", dot: t.success },
                      { text: "AI matched 3 vendors", time: "8m", dot: t.purple },
                      { text: "Invoice #1092 flagged", time: "14m", dot: t.warning },
                      { text: "Contract renewed", time: "1h", dot: t.cyan },
                      { text: "Budget alert: IT dept", time: "2h", dot: t.danger },
                    ].map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: t.bgSecondary }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: t.textSecondary, flex: 1 }}>{a.text}</span>
                        <span style={{ fontSize: 10, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{a.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Command Bar */}
              <div style={{ marginTop: 14, padding: "14px 20px", borderRadius: 14, background: t.gradientCard, border: `1px solid ${t.borderHover}`, display: "flex", alignItems: "center", gap: 12, backdropFilter: "blur(10px)" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: t.gradient1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", flexShrink: 0 }}>✦</div>
                <span style={{ fontSize: 13, color: t.textMuted, flex: 1 }}>Ask Vorticura AI... "Find cheapest vendor for 500 laptops" or "Summarize Q3 spend"</span>
                <div style={{ padding: "5px 14px", borderRadius: 8, background: t.accentSoft, color: t.accent, fontSize: 11, fontWeight: 600, border: `1px solid ${t.borderHover}` }}>⌘K</div>
              </div>
            </Section>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: t.textMuted }}>Vorticura Design System v1.0</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["dark", "light"].map(m => (
              <div key={m} onClick={() => setMode(m)} style={{ width: 18, height: 18, borderRadius: 6, background: m === "dark" ? "#07080E" : "#F4F5FA", border: `2px solid ${mode === m ? t.accent : t.border}`, cursor: "pointer" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

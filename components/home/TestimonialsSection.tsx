// =============================================
// Vorticura Editorial Quote Section
// =============================================
// Single large serif italic blockquote + three customer wordmarks on vellum band
// + mono certifications strip. "Mission Control for Procurement" aesthetic.

export default function TestimonialsSection() {
  return (
    <section id="customers" className="bg-paper py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        {/* Section header: overline + serif H2 */}
        <div className="max-w-3xl mb-16 lg:mb-20">
          <p className="micro-label text-graphite mb-4">CUSTOMERS</p>
          <h2 className="font-display text-[28px] lg:text-[36px] leading-[1.3] text-ink">
            Quoted by people who quote for a living.
          </h2>
        </div>

        {/* Large editorial blockquote with left-positioned opening quote mark */}
        <div className="max-w-3xl relative mb-20 lg:mb-24">
          {/* Opening quote mark — oversized serif glyph, absolutely positioned */}
          <span
            className="absolute -left-12 lg:-left-20 top-0 font-display text-rule-strong leading-none"
            style={{ fontSize: "80px", lineHeight: 1 }}
            aria-hidden="true"
          >
            "
          </span>

          <blockquote className="font-display italic text-[28px] lg:text-[36px] leading-[1.3] text-ink">
            We were quoting in days. Now we quote before lunch. Vorticura did not
            change our suppliers — it changed our tempo, and that's what we got paid
            for.
          </blockquote>

          {/* Attribution: mono micro-label */}
          <p className="micro-label text-graphite mt-12">
            MELISSA OKONKWO · HEAD OF STRATEGIC SOURCING · LATTICE METALWORKS
          </p>
        </div>

        {/* Customer wordmark band — vellum surface with ledger rule */}
        <div className="bg-vellum border-y border-rule px-8 py-10">
          <div className="flex flex-wrap justify-between gap-y-6 lg:flex-nowrap lg:gap-0">
            <span className="font-display text-[22px] text-ink tracking-tight">
              LATTICE METALWORKS
            </span>
            <span className="font-display text-[22px] text-ink tracking-tight">
              KORDA SYSTEMS
            </span>
            <span className="font-display text-[22px] text-ink tracking-tight">
              HALO PROCUREMENT GROUP
            </span>
          </div>
        </div>

        {/* Certifications strip */}
        <div className="mt-20 lg:mt-24">
          <p className="micro-label text-graphite">
            SOC 2 TYPE II · ISO 27001 · GDPR · CCPA · DPA AVAILABLE
          </p>
        </div>
      </div>
    </section>
  )
}

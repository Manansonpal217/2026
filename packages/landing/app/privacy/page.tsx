export const metadata = {
  title: 'Privacy Policy — TrackSync',
  description: 'TrackSync privacy policy. How we collect, use, and protect your data.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <article className="mx-auto max-w-3xl px-6 pt-32 pb-28">
        <h1 className="font-display text-4xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-4 text-muted">Last updated: March 2025</p>

        <div className="mt-12 space-y-8 text-muted">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
            <p className="mt-2">
              We collect information you provide directly (name, email, company) when you sign up,
              request a demo, or contact us. When you use TrackSync, we collect usage data including
              time tracking data, application usage, and screenshots (when enabled) to provide our
              services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
            <p className="mt-2">
              We use your information to provide, maintain, and improve our services; to communicate
              with you; to process transactions; and to comply with legal obligations. We do not
              sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Data Retention</h2>
            <p className="mt-2">
              We retain your data for as long as your account is active or as needed to provide
              services. You may request deletion of your data at any time. Upon account termination,
              we will delete or anonymize your data within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Security</h2>
            <p className="mt-2">
              We use industry-standard encryption (TLS in transit, AES at rest) to protect your
              data. Access to personal data is restricted to authorized personnel and is logged for
              audit purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Your Rights</h2>
            <p className="mt-2">
              Depending on your location, you may have the right to access, correct, delete, or
              export your personal data. You may also have the right to object to or restrict
              certain processing. Contact us at support@tracksync.dev to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Cookies</h2>
            <p className="mt-2">
              We use essential cookies to operate our services and analytics cookies to understand
              how our website is used. You can control cookie preferences through your browser
              settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Contact</h2>
            <p className="mt-2">
              For questions about this privacy policy, contact us at support@tracksync.dev.
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}

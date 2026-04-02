export const metadata = {
  title: 'Terms of Service — TrackSync',
  description: 'TrackSync terms of service. Usage terms and conditions.',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <article className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-28">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: March 2025</p>

        <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              1. Acceptance of Terms
            </h2>
            <p className="mt-2">
              By accessing or using TrackSync, you agree to be bound by these Terms of Service. If
              you do not agree, do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              2. Description of Service
            </h2>
            <p className="mt-2">
              TrackSync provides time tracking, activity monitoring, and team analytics software. We
              reserve the right to modify, suspend, or discontinue any part of the service at any
              time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              3. Acceptable Use
            </h2>
            <p className="mt-2">
              You agree to use TrackSync only for lawful purposes and in compliance with applicable
              laws. You may not use the service to harass, surveil without consent, or violate the
              privacy of others. You are responsible for ensuring your use complies with employment
              and privacy laws in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              4. Account and Payment
            </h2>
            <p className="mt-2">
              You must provide accurate account information. Subscription fees are billed in advance
              (monthly or annually). Refunds are handled according to our refund policy. We may
              change pricing with 30 days notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              5. Intellectual Property
            </h2>
            <p className="mt-2">
              TrackSync and its content, features, and functionality are owned by us and are
              protected by copyright, trademark, and other intellectual property laws. You may not
              copy, modify, or create derivative works without our permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              6. Limitation of Liability
            </h2>
            <p className="mt-2">
              To the maximum extent permitted by law, TrackSync shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages. Our total liability
              shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">7. Termination</h2>
            <p className="mt-2">
              Either party may terminate the agreement at any time. Upon termination, your access
              will cease and we will delete your data according to our data retention policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">8. Contact</h2>
            <p className="mt-2">
              For questions about these terms, contact us at support@tracksync.dev.
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}

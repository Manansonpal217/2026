export const metadata = {
  title: 'Privacy Policy — TrackSync',
  description: 'TrackSync privacy policy. How we collect, use, and protect your data.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <article className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-28">
        <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          TrackSync Privacy Policy
        </h1>
        <p className="mt-4 text-muted-foreground">
          Effective Date: March 18, 2026 | Last Updated: March 18, 2026
        </p>
        <p className="mt-2 text-muted-foreground">
          <a href="https://tracksync.dev/privacy" className="text-primary hover:underline">
            https://tracksync.dev/privacy
          </a>
        </p>

        <div className="mt-12 space-y-8 text-muted-foreground">
          <p>
            Welcome to TrackSync. We are committed to protecting your personal information and being
            transparent about how we collect, use, and share data. This Privacy Policy applies to
            all users of the TrackSync desktop application and related services.
          </p>

          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Who We Are</h2>
            <p className="mt-2">
              TrackSync is a desktop-based automatic time tracking and productivity tool developed
              by Track Sync (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). Our product helps
              teams seamlessly track work time, sync with project management platforms, and automate
              daily standups.
            </p>
            <p className="mt-2">Contact: support@tracksync.dev</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
            <h3 className="mt-4 text-lg font-medium text-foreground">
              2.1 Account & Identity Information
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Name and email address (from your Atlassian/Asana/Slack account via OAuth)</li>
              <li>Atlassian Account ID and workspace identifiers</li>
              <li>Profile information provided during onboarding</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">2.2 Work Activity Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Mouse and keyboard activity signals (active/inactive — not keystrokes or content)
              </li>
              <li>Task and issue data fetched from connected tools (Jira, Asana, etc.)</li>
              <li>Time logs, session durations, and work intervals</li>
              <li>Optional descriptions you enter when logging time</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">2.3 Screenshots</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Periodic screenshots captured every 5 minutes while active tracking is enabled
              </li>
              <li>
                Screenshots are stored securely and accessible only to authorized team members and
                the user
              </li>
              <li>Users and administrators can configure or disable screenshot capture</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">2.4 Integration Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                OAuth access tokens for connected platforms (Jira, Asana, Slack, Microsoft Teams)
              </li>
              <li>Worklog entries and standup messages posted on your behalf</li>
              <li>Project and task metadata from your connected project management tools</li>
            </ul>

            <h3 className="mt-4 text-lg font-medium text-foreground">2.5 Technical & Usage Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>App version, operating system, and device type</li>
              <li>Error logs and crash reports (no personal content included)</li>
              <li>Feature usage analytics to improve the product</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. How We Use Your Information
            </h2>
            <p className="mt-2">We use the data we collect to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Provide core time tracking functionality (activity monitoring, timer management)
              </li>
              <li>Fetch and display your assigned tasks from connected tools</li>
              <li>Log tracked time back to Jira/Asana/Tempo on your behalf</li>
              <li>Generate and post automated daily standup updates to Slack or Microsoft Teams</li>
              <li>Maintain session history and productivity reports for you and your team</li>
              <li>Improve product performance, fix bugs, and develop new features</li>
              <li>Respond to support requests and communicate service updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Data Sharing & Disclosure</h2>
            <p className="mt-2">
              We do not sell your personal data. We may share data only in the following limited
              circumstances:
            </p>
            <h3 className="mt-4 text-lg font-medium text-foreground">4.1 With Your Organization</h3>
            <p className="mt-2">
              Time logs, activity summaries, and standup updates are shared with your team/manager
              as part of the product&apos;s core functionality. Administrators can access team-level
              reports.
            </p>
            <h3 className="mt-4 text-lg font-medium text-foreground">
              4.2 With Third-Party Integrations
            </h3>
            <p className="mt-2">
              Data is sent to third-party platforms (Jira, Asana, Slack, etc.) only as directed by
              you (e.g., posting a worklog or standup). We access these platforms using OAuth tokens
              with the minimum required permissions.
            </p>
            <h3 className="mt-4 text-lg font-medium text-foreground">4.3 With Service Providers</h3>
            <p className="mt-2">
              We use trusted sub-processors (e.g., cloud hosting, analytics) who are contractually
              bound to protect your data and use it only to provide services to us.
            </p>
            <h3 className="mt-4 text-lg font-medium text-foreground">4.4 Legal Requirements</h3>
            <p className="mt-2">
              We may disclose information if required by law, regulation, or valid legal process.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Screenshots & Sensitive Data
            </h2>
            <p className="mt-2">
              Screenshots are a sensitive feature. We are committed to the following protections:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Screenshots are encrypted in transit and at rest</li>
              <li>Access is restricted to the tracked user and designated administrators</li>
              <li>Users are always notified when screenshot capture is active</li>
              <li>Administrators can enable or disable this feature organization-wide</li>
              <li>
                Screenshots are retained for a maximum of 90 days unless your organization
                configures a different retention policy
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Data Retention</h2>
            <p className="mt-2">
              We retain your data for as long as your account is active or as needed to provide
              services. Specifically:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Time logs and session data: retained for the duration of your subscription + 30 days
                after cancellation
              </li>
              <li>Screenshots: retained for up to 90 days by default</li>
              <li>OAuth tokens: stored until revoked by you or upon account deletion</li>
              <li>Account data: deleted within 30 days of account closure upon request</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Your Rights & Controls</h2>
            <p className="mt-2">Depending on your location, you may have the following rights:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Access: Request a copy of your personal data</li>
              <li>Correction: Update inaccurate or incomplete information</li>
              <li>Deletion: Request deletion of your account and associated data</li>
              <li>Portability: Export your time logs and session history</li>
              <li>Objection: Object to certain types of processing</li>
              <li>Restriction: Request that we limit how we use your data</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, contact us at: support@tracksync.dev
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Security</h2>
            <p className="mt-2">
              We take the security of your data seriously. Our measures include:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>All data transmitted using TLS 1.2+ encryption</li>
              <li>OAuth tokens stored in encrypted local keystores on your device</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>
                Access controls limiting internal access to personal data on a need-to-know basis
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Third-Party Integrations</h2>
            <p className="mt-2">
              TrackSync connects to third-party platforms via their official APIs. When you connect
              an integration, you are also subject to that platform&apos;s privacy policy:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                Atlassian / Jira:{' '}
                <a
                  href="https://www.atlassian.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://www.atlassian.com/legal/privacy-policy
                </a>
              </li>
              <li>
                Asana:{' '}
                <a
                  href="https://asana.com/terms#privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://asana.com/terms#privacy-policy
                </a>
              </li>
              <li>
                Slack:{' '}
                <a
                  href="https://slack.com/trust/privacy/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://slack.com/trust/privacy/privacy-policy
                </a>
              </li>
              <li>
                Microsoft Teams:{' '}
                <a
                  href="https://privacy.microsoft.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://privacy.microsoft.com
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Children&apos;s Privacy</h2>
            <p className="mt-2">
              TrackSync is intended for professional use by individuals aged 18 and older. We do not
              knowingly collect data from children under 13. If you believe we have inadvertently
              collected such data, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. We will notify you of material
              changes via email or an in-app notification at least 14 days before the change takes
              effect. Continued use of TrackSync after the effective date constitutes acceptance of
              the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">12. Contact Us</h2>
            <p className="mt-2">
              If you have questions, concerns, or requests regarding this Privacy Policy, please
              reach out:
            </p>
            <p className="mt-4">
              <strong className="text-foreground">Track Sync</strong>
              <br />
              Email:{' '}
              <a href="mailto:support@tracksync.dev" className="text-primary hover:underline">
                support@tracksync.dev
              </a>
              <br />
              Website:{' '}
              <a href="https://tracksync.dev" className="text-primary hover:underline">
                https://tracksync.dev
              </a>
              <br />
              Support:{' '}
              <a href="https://tracksync.dev/contact" className="text-primary hover:underline">
                https://tracksync.dev/contact
              </a>
            </p>
          </section>

          <p className="mt-12 text-sm">© 2026 Track Sync. All rights reserved.</p>
        </div>
      </article>
    </main>
  )
}

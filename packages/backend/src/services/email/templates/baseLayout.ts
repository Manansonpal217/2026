/** Escape text inserted into HTML email bodies. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FOOTER = '© 2025 TrackSync · support@tracksync.dev · Unsubscribe'

export type EmailLayoutOptions = {
  /** Small uppercase label above the title (e.g. "You're invited"). */
  eyebrow?: string
  /** Main headline in the content area. */
  title?: string
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function layoutHeader(opts?: EmailLayoutOptions): string {
  if (!opts?.eyebrow && !opts?.title) return ''
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6366f1;">${escapeHtml(opts.eyebrow)}</p>`
    : ''
  const title = opts.title
    ? `<h1 style="margin:0 0 4px 0;font-size:28px;font-weight:800;line-height:1.2;color:#0f172a;letter-spacing:-0.035em;">${escapeHtml(opts.title)}</h1>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;"><tr><td style="height:4px;width:48px;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
    : ''
  return `${eyebrow}${title}`
}

/**
 * Wraps inner email body in a table-based layout for Gmail/Outlook compatibility.
 */
export function emailBaseLayout(innerHtml: string, opts?: EmailLayoutOptions): string {
  const headBlock = layoutHeader(opts)
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>TrackSync</title>
</head>
<body style="margin:0;padding:0;background-color:#e8e6ff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8e6ff;background-image:linear-gradient(180deg,#e0e7ff 0%,#eef2ff 35%,#f8fafc 100%);">
    <tr>
      <td align="center" style="padding:32px 16px 40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border-collapse:separate;">
          <tr>
            <td style="background-color:#6366f1;background-image:linear-gradient(135deg,#6366f1 0%,#4f46e5 42%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:32px 36px 28px 36px;border:1px solid rgba(255,255,255,0.12);border-bottom:none;">
              <p style="margin:0 0 6px 0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;text-shadow:0 1px 2px rgba(0,0,0,0.15);">TrackSync</p>
              <p style="margin:0;font-size:14px;line-height:1.45;color:rgba(255,255,255,0.88);font-weight:500;">Time tracking &amp; team insights—clear, calm, in one place.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:36px 36px 8px 36px;color:#334155;font-size:16px;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
                    ${headBlock}
                    ${innerHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 36px 32px 36px;background-color:#f8fafc;border-top:1px solid #f1f5f9;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">${FOOTER}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 8px 0 8px;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">Sent by TrackSync · <a href="mailto:support@tracksync.dev" style="color:#6366f1;text-decoration:none;font-weight:600;">support@tracksync.dev</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Opening line / body text. */
export function bodyParagraph(html: string): string {
  return `<p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#475569;">${html}</p>`
}

/** Soft info panel (indigo tint). */
export function infoPanel(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
  <tr>
    <td style="background-color:#eef2ff;border-radius:12px;border:1px solid #c7d2fe;padding:18px 20px;font-size:14px;line-height:1.6;color:#3730a3;">
      ${html}
    </td>
  </tr>
</table>`
}

/** Warning panel for security messages. */
export function warningPanel(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
  <tr>
    <td style="background-color:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:18px 20px;font-size:14px;line-height:1.6;color:#991b1b;font-weight:600;">
      ${html}
    </td>
  </tr>
</table>`
}

/** Numbered steps as a visual list (rows). */
export function numberedSteps(items: string[]): string {
  const rows = items
    .map((item, i) => {
      const n = String(i + 1)
      return `<tr>
    <td style="width:40px;vertical-align:top;padding:0 12px 16px 0;">
      <div style="width:30px;height:30px;line-height:30px;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;border-radius:999px;font-size:13px;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${n}</div>
    </td>
    <td style="vertical-align:top;padding:0 0 16px 0;font-size:15px;line-height:1.55;color:#334155;">${escapeHtml(item)}</td>
  </tr>`
    })
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px 0;">${rows}</table>`
}

/** Feature list with check glyphs. */
export function featureCheckList(items: string[]): string {
  const rows = items
    .map(
      (item) => `<tr>
    <td style="width:28px;vertical-align:top;padding:0 10px 12px 0;font-size:16px;color:#6366f1;font-weight:bold;">&#10003;</td>
    <td style="vertical-align:top;padding:0 0 12px 0;font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(item)}</td>
  </tr>`
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 8px 0;">${rows}</table>`
}

/** Muted fine print under CTA. */
export function finePrint(html: string): string {
  return `<p style="margin:20px 0 0 0;font-size:13px;line-height:1.55;color:#94a3b8;">${html}</p>`
}

/** Primary CTA button with gradient and shadow. */
export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px 0;">
  <tr>
    <td align="left">
      <a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 32px;background-color:#6366f1;background-image:linear-gradient(135deg,#6366f1 0%,#4f46e5 55%,#7c3aed 100%);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow:0 6px 20px rgba(99,102,241,0.42),0 2px 6px rgba(79,70,229,0.25);letter-spacing:-0.01em;">${escapeHtml(label)} &rarr;</a>
    </td>
  </tr>
</table>`
}

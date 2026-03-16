export class ForbiddenHostError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenHostError'
  }
}

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // AWS metadata endpoint
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT
  /^fc00:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 link-local
]

export function validateOutboundUrl(urlStr: string, allowedHosts?: string): void {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new ForbiddenHostError(`Invalid URL: ${urlStr}`)
  }

  const { hostname, protocol } = parsed

  if (!['https:', 'http:'].includes(protocol)) {
    throw new ForbiddenHostError(`Forbidden protocol: ${protocol}`)
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new ForbiddenHostError(
        `SSRF protection: Forbidden host "${hostname}" matches blocked pattern`,
      )
    }
  }

  if (allowedHosts) {
    const hosts = allowedHosts.split(',').map((h) => h.trim().toLowerCase())
    if (!hosts.some((h) => hostname.toLowerCase() === h || hostname.toLowerCase().endsWith(`.${h}`))) {
      throw new ForbiddenHostError(
        `SSRF protection: Host "${hostname}" is not in the allowed hosts list`,
      )
    }
  }
}

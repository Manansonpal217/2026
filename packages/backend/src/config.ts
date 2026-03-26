import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6380'),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  APP_VERSION: z.string().default('0.1.0'),
  APP_URL: z.string().default('http://localhost:3002'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@tracksync.io'),
  SES_REGION: z.string().default('us-east-1'),
  // AWS general
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  // S3 / Screenshots (S3_ENDPOINT + AWS_REGION=auto for Cloudflare R2)
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
  S3_SCREENSHOT_BUCKET: z.string().default('tracksync-screenshots'),
  KMS_SCREENSHOT_KEY_ID: z.string().optional(),
  // Read replica
  DATABASE_READ_URL: z.string().optional(),
  // Integrations
  KMS_INTEGRATIONS_KEY_ID: z.string().optional(),
  SSRF_ALLOWED_HOSTS: z
    .string()
    .default('auth.atlassian.com,api.atlassian.com,app.asana.com,api.asana.com'),
  JIRA_CLIENT_ID: z.string().optional(),
  JIRA_CLIENT_SECRET: z.string().optional(),
  ASANA_CLIENT_ID: z.string().optional(),
  ASANA_CLIENT_SECRET: z.string().optional(),
  /** Optional error tracking (https://sentry.io) */
  SENTRY_DSN: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().url().optional()
  ),
})

export type Config = z.infer<typeof envSchema>

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }
  return result.data
}

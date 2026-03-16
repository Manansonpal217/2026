# Backend Module 17 — Secrets Management (AWS Secrets Manager)

**Stack:** AWS Secrets Manager + AWS IAM + Node.js  
**Replaces:** Plain environment variables for sensitive secrets

---

## Overview

Storing secrets (DB passwords, Stripe keys, KMS keys, JWT private keys) in environment variables is a security risk:
- Env vars are logged in some CI systems
- Accessible to any process running as the same user
- No audit trail of who accessed what
- No automatic rotation support

AWS Secrets Manager solves all of these. ECS tasks use IAM roles to access secrets — no passwords in config files.

---

## Secrets Inventory

| Secret Name | Type | Rotation |
|-------------|------|----------|
| `tracksync/prod/database-url` | DB connection string (with password) | Every 30 days (RDS auto-rotation) |
| `tracksync/prod/stripe-secret-key` | Stripe API key | Manual (Stripe portal) |
| `tracksync/prod/stripe-webhook-secret` | Stripe webhook signing secret | Manual |
| `tracksync/prod/jwt-private-key` | RS256 private key (PEM) | Every 90 days |
| `tracksync/prod/kms-master-key-arn` | ARN of KMS master key | N/A (ARN, not secret — kept here for config consistency) |
| `tracksync/prod/redis-url` | ElastiCache Redis URL + auth token | Manual |
| `tracksync/prod/sendgrid-api-key` | Email API key | Manual |
| `tracksync/prod/apple-push-cert` | APNs certificate | Manual |

---

## IAM Policy (ECS Task Role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:tracksync/prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KMS_KEY_ID"
    }
  ]
}
```

No database password is ever in the ECS task definition or environment variables.

---

## Loading Secrets in Application

```typescript
// src/config/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

// Cache secrets in memory (avoid calling Secrets Manager on every request)
const cache = new Map<string, { value: string; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

async function getSecret(secretName: string): Promise<string> {
  const cached = cache.get(secretName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const command = new GetSecretValueCommand({ SecretId: secretName })
  const response = await client.send(command)
  const value = response.SecretString!

  cache.set(secretName, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

// Typed secrets loader — call once at startup
export async function loadSecrets(): Promise<AppSecrets> {
  const [databaseUrl, stripeKey, jwtPrivateKey, redisUrl] = await Promise.all([
    getSecret('tracksync/prod/database-url'),
    getSecret('tracksync/prod/stripe-secret-key'),
    getSecret('tracksync/prod/jwt-private-key'),
    getSecret('tracksync/prod/redis-url'),
  ])

  return { databaseUrl, stripeKey, jwtPrivateKey, redisUrl }
}
```

```typescript
// server.ts — load secrets before starting server
async function bootstrap() {
  const secrets = await loadSecrets()

  // Initialize DB with secret
  const prisma = new PrismaClient({
    datasources: { db: { url: secrets.databaseUrl } }
  })

  // Initialize Stripe
  const stripe = new Stripe(secrets.stripeKey, { apiVersion: '2024-06-20' })

  // Start Fastify
  const app = Fastify({ ... })
  app.decorate('prisma', prisma)
  app.decorate('stripe', stripe)

  await app.listen({ port: 3000 })
}
```

---

## Secret Rotation

### Automatic RDS Password Rotation

AWS Secrets Manager can rotate the RDS database password automatically:

1. Secrets Manager generates a new random password
2. Updates the RDS user password via RDS API
3. Updates the secret value in Secrets Manager
4. Applications pick up the new password within 5 minutes (cache TTL)

Configure via:
```bash
aws secretsmanager rotate-secret \
  --secret-id tracksync/prod/database-url \
  --rotation-rules AutomaticallyAfterDays=30
```

### JWT Private Key Rotation

1. Generate new RS256 key pair
2. Upload new private key to Secrets Manager
3. Add new public key to JWKS endpoint (serve both old + new public key for 1 hour)
4. After 1 hour: all existing JWTs (15min TTL) using old key have expired
5. Remove old public key from JWKS endpoint
6. Delete old private key from Secrets Manager

---

## Local Development

For local development, secrets are loaded from a `.env.local` file (not committed to git).  
CI/CD environments use GitHub Actions secrets, which are injected as environment variables into the build.

```bash
# .env.local (gitignored)
DATABASE_URL=postgresql://user:password@localhost:5433/tracksync_dev
STRIPE_SECRET_KEY=sk_test_xxx
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
REDIS_URL=redis://localhost:6380
```

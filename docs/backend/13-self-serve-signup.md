# Backend Module 13 — Self-Serve Org Signup & Onboarding Wizard

**Stack:** Node.js + Fastify + Prisma + Stripe + BullMQ + SendGrid  
**Used by:** New organizations signing up without contacting sales

---

## Overview

Without self-serve signup, every new customer requires a sales touchpoint. This module enables organizations to sign up, start a trial, and complete onboarding entirely without human involvement. The onboarding wizard guides org admins through the essential configuration steps.

---

## Signup Flow

```
1. Visitor lands on tracksync.io/signup

2. Form:
   - Work email (must be company email — block gmail/yahoo/hotmail etc.)
   - Full name
   - Company name
   - Team size (1-10 / 11-50 / 51-200 / 201-500 / 500+)
   - Country (for data region selection)
   - Password

3. POST /v1/public/auth/signup
   → Validate: no disposable email, domain not already registered
   → Create organization (status: 'trial', trial_ends_at: NOW() + 14 days)
   → Create user (role: org_admin)
   → Create org_settings (defaults)
   → Assign data_region based on country:
       EU countries → 'eu-west-1'
       APAC → 'ap-southeast-1'
       Default → 'us-east-1'
   → Send verification email (must verify email before full access)
   → Return: { needs_email_verification: true }

4. User clicks email verification link
   → POST /v1/public/auth/verify-email?token=<token>
   → org.status unchanged (still trial — email verified but setup incomplete)
   → Redirect to onboarding wizard: /admin/onboarding

5. Onboarding wizard (web panel — see Onboarding Wizard section)

6. Wizard complete → org fully active, team can be invited
```

---

## Validation: Block Disposable/Personal Emails

```typescript
// List from: disposable-email-blocklist npm package + manual additions
import disposableDomains from 'disposable-email-domains'

const PERSONAL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'protonmail.com',
  'zoho.com',
  'aol.com',
]

async function validateWorkEmail(email: string): Promise<void> {
  const domain = email.split('@')[1].toLowerCase()

  if (PERSONAL_DOMAINS.includes(domain)) {
    throw new Error('Please use your work email address')
  }

  if (disposableDomains.includes(domain)) {
    throw new Error('Disposable email addresses are not allowed')
  }

  // Check if domain is already registered (prevent duplicate org signups)
  const existing = await prisma.organization.findFirst({
    where: { slug: { contains: domain.replace('.', '-') } },
  })
  // Note: domain uniqueness is a soft check — consultancies may share domain
}
```

---

## Onboarding Wizard (Web Admin Panel)

The wizard is a multi-step flow shown to org_admin immediately after email verification. Completion is tracked via `org_settings.onboarding_step` (0–5, 5 = complete).

### Step 1: Invite Your Team

```
┌──────────────────────────────────────────────────────────┐
│  Welcome to TrackSync! Let's set up your workspace.     │
│  Step 1 of 5 — Invite Your Team                         │
│                                                          │
│  Add team members by email:                              │
│  ┌────────────────────────────────┐                     │
│  │ john@acme.com                  │ [Employee ▼] [✕]   │
│  └────────────────────────────────┘                     │
│  [+ Add another]                                         │
│                                                          │
│  Or [Upload CSV]  or  [Skip for now]                    │
│                                                          │
│  [Send Invites & Continue →]                            │
└──────────────────────────────────────────────────────────┘
```

### Step 2: Connect Your Project Tool

```
┌──────────────────────────────────────────────────────────┐
│  Step 2 of 5 — Connect Your Project Management Tool     │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │  🔷 Jira   │ │  📐 Asana  │ │  📋 Linear │          │
│  │ [Connect]  │ │ [Connect]  │ │ [Connect]  │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│                                                          │
│  ┌────────────┐ ┌────────────┐                          │
│  │ 🟣 ClickUp │ │  📊 Sheets │                          │
│  │ [Connect]  │ │ [Connect]  │                          │
│  └────────────┘ └────────────┘                          │
│                                                          │
│  [Skip for now — I'll add this later]                   │
└──────────────────────────────────────────────────────────┘
```

### Step 3: Configure Tracking Settings

```
Step 3 of 5 — Configure What Gets Tracked

  Screenshots:          ○ Disabled   ● Every 10 min   ○ Every 5 min   ○ Every 30 min
  Employee delete window: [60 seconds ▼]
  Track app usage:      ● Yes   ○ No
  Track URLs:           ○ Yes   ● No  (Privacy-sensitive — disabled by default)
  Idle timeout:         [5 minutes ▼]

  Preview: Employees will see this consent screen before tracking begins:
  [Preview consent screen →]

  [← Back]  [Save & Continue →]
```

### Step 4: Download the Desktop App

```
Step 4 of 5 — Download TrackSync Desktop

  Share this download link with your team:
  https://download.tracksync.io/acme-corp  ← org-specific link pre-fills server URL

  Or download directly:
  [🍎 Download for Mac]  [🪟 Download for Windows]  [🐧 Download for Linux]

  Your org code: ACME-CORP-2026  (required during desktop app setup)

  [← Back]  [Continue →]
```

### Step 5: Add Payment (Optional — after trial)

```
Step 5 of 5 — You're All Set! 🎉

  Your 14-day trial starts now.
  Explore all features with no limits.

  Estimated cost:
  Team size: 8 members × $10/month = $80/month
  (Billed monthly — cancel anytime)

  [Add Payment Method]  ← redirects to Stripe checkout
  [Skip — I'll add this after my trial]

  [Go to Dashboard →]
```

---

## API Endpoints

| Method | Endpoint                                   | Description                       |
| ------ | ------------------------------------------ | --------------------------------- |
| POST   | `/v1/public/auth/signup`                   | Create new org + admin account    |
| POST   | `/v1/public/auth/verify-email`             | Verify email token                |
| POST   | `/v1/public/auth/resend-verification`      | Resend verification email         |
| GET    | `/v1/admin/onboarding/status`              | Get current onboarding step       |
| POST   | `/v1/admin/onboarding/step/:step/complete` | Mark step as complete             |
| POST   | `/v1/admin/team/invite-bulk`               | Bulk invite team members from CSV |

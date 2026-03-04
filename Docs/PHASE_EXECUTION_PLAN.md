# TrackSync Phase-Wise Execution Plan

Source documents analyzed:
- `Docs/main.md`
- `Docs/DEVELOPMENT_PLAN.md`
- `Docs/phases/phase-00-setup.md`

## Phase Summary

| Phase | Objective | Primary Deliverable |
|---|---|---|
| 00 | Setup and DevOps baseline | Monorepo, local infra, CI/release skeleton |
| 01 | Auth and org foundation | End-to-end login/invite across backend, desktop, web |
| 02 | Time tracking core | Start/pause/resume/stop tracking + sync |
| 03 | Screenshots and activity | Capture/encrypt/upload screenshots + activity logs |
| 04 | Integrations | Jira/Asana sync and work-log push |
| 05 | Admin panels v1 | Super admin/org admin/manager views |
| 06 | Billing and feature flags | Stripe + org cutoff + settings push |
| 07 | GDPR and security hardening | Consent/export/MFA/rate limits/CSP |
| 08 | Beta polish | UX polish, employee portal, manual entries |
| 09 | Scale and launch | Self-serve, DR, observability, scale readiness |

## Recommended Development Sequence

1. Complete Phase 00 foundation and verify local boot + CI.
2. Build Phase 01 auth flows with strict tests first (JWT, refresh, blacklist, invite).
3. Build Phase 02 time tracking with local-first SQLite and resilient sync.
4. Add Phase 03 privacy-sensitive monitoring with clear consent controls.
5. Implement Phase 04 integration engine with robust retry/circuit-breakers.
6. Ship Phase 05 admin visibility and reporting on top of stable data contracts.
7. Enable monetization/control in Phase 06.
8. Lock compliance and hardening in Phase 07.
9. Improve UX and beta readiness in Phase 08.
10. Complete launch-scale concerns in Phase 09.

## Phase 00 Build Status (Implemented Here)

Completed in repository:
- Monorepo baseline (`packages/backend`, `packages/desktop`, `packages/web`)
- Root workspace setup (`package.json`, `pnpm-workspace.yaml`)
- Local infra (`docker-compose.yml` with PostgreSQL + Redis)
- Backend scaffold (Fastify entry, config validation, Prisma datasource, Redis ping, BullMQ queue stubs)
- Desktop scaffold (Electron main/preload baseline, SQLite and keytar stubs)
- Web scaffold (Next.js app shell, security headers, initial auth page placeholder)
- CI and release workflows (`.github/workflows/ci.yml`, `.github/workflows/release.yml`)
- Env templates for root/backend/desktop/web

Pending from Phase 00 docs (next step before Phase 01):
- Install dependencies and generate lockfile
- Validate `pnpm dev` for all packages
- Integrate real electron-vite and Next.js build pipelines
- Add Husky + lint-staged hooks
- Add shadcn/Tailwind setup for web package

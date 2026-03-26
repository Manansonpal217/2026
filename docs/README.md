# TrackSync Documentation

> Complete module-wise breakdown of the TrackSync SaaS platform.

## Quick Links

| Document                                             | Description                             |
| ---------------------------------------------------- | --------------------------------------- |
| [INDEX.md](./INDEX.md)                               | Documentation index and module overview |
| [main.md](./main.md)                                 | Full product plan and architecture      |
| [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)         | Phase-wise build plan (Phase 0–9)       |
| [PHASE_EXECUTION_PLAN.md](./PHASE_EXECUTION_PLAN.md) | Execution order and build status        |

## Structure

```
docs/
├── main.md              # Product plan (source of truth)
├── INDEX.md             # Module index
├── DEVELOPMENT_PLAN.md  # Phase-wise development
├── app/                 # Desktop App modules (Electron + React)
├── backend/             # Backend API modules (Fastify)
├── admin-panel/         # Web Admin Panel modules (Next.js)
└── phases/              # Phase implementation guides
    ├── phase-00-setup.md
    ├── phase-01-auth.md
    └── ...
```

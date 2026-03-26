# Scaling reference (future phases)

This complements [RUNBOOK.md](../RUNBOOK.md). The application is designed so most growth is **horizontal** (more API replicas, read replica URL, bigger Redis/Postgres plans) without code forks.

## When to add what

| Signal                         | Action                                                           |
| ------------------------------ | ---------------------------------------------------------------- |
| API CPU/memory sustained high  | Larger droplet / more replicas behind LB                         |
| Postgres connection errors     | PgBouncer or provider pool; lower per-process `connection_limit` |
| Read-heavy dashboards slow     | `DATABASE_READ_URL` → read replica                               |
| BullMQ lag, screenshot backlog | Dedicated worker fleet; scale worker containers                  |
| Redis downtime breaks auth     | Redis HA / managed failover                                      |
| Global screenshot latency      | R2 (or S3) + CDN/WAF on custom domain                            |

## Kubernetes (optional)

- One Deployment per **API** and per **worker** type (or one worker Deployment with `QUEUE_CONCURRENCY` env patterns).
- ConfigMap for non-secret env; ExternalSecrets or cloud-specific secret operator for keys.
- Ingress with TLS; probes on `/health/ready` and `/health/live`.
- Job/CronJob for `prisma migrate deploy` on release.

## Redis Sentinel / cluster

When a single Redis node is a SPOF for sessions blacklist, rate limits, and BullMQ, move to a managed HA offering (e.g. ElastiCache with failover, Upstash, or DigitalOcean Managed Redis with replica promotion).

# Backend Module 16 — Disaster Recovery Plan

**Owner:** Infrastructure Team  
**Review cadence:** Quarterly + after any major incident

---

## Recovery Objectives

| Metric                             | Target      | Meaning                                     |
| ---------------------------------- | ----------- | ------------------------------------------- |
| **RTO** (Recovery Time Objective)  | < 1 hour    | Maximum downtime before service is restored |
| **RPO** (Recovery Point Objective) | < 5 minutes | Maximum data loss if primary DB fails       |

---

## Infrastructure Redundancy

### RDS PostgreSQL — Multi-AZ

```
Primary RDS: us-east-1a
    ↓ (synchronous replication)
Standby RDS: us-east-1b  ← automatic failover in ~60 seconds
    ↓ (asynchronous replication, ~1s lag)
Read Replica: us-east-1c  ← reporting only
```

Multi-AZ configuration:

- Automatic failover: AWS promotes standby to primary if primary instance fails
- Failover DNS endpoint changes automatically — no app code changes needed
- Typical failover time: 30–120 seconds
- Backup retention: 7 days (point-in-time recovery to any 5-minute window)

### ElastiCache Redis — Cluster Mode + Replicas

```
Redis Primary: 3 shards
    ↓ (async replication per shard)
Redis Replicas: 1 replica per shard (3 replicas total)
```

- Automatic failover: ElastiCache promotes replica if primary shard fails
- AOF persistence: enabled (Append Only File) — RPO ~1 second

### S3 — Cross-Region Replication

```
Primary Bucket: us-east-1    (tracksync-screenshots-prod)
    ↓ (asynchronous, ~15 min lag)
Replica Bucket: us-west-2    (tracksync-screenshots-dr)
```

S3 replication configuration:

- Replication Rule: ALL objects (screenshots, exports)
- Storage class: S3-IA (Infrequent Access) in DR bucket
- Versioning: enabled on both buckets
- Deletion sync: replicate deletes enabled

### ECS Fargate — Multi-AZ + Auto-Scaling

```
API containers: 2 minimum tasks
    Task 1: us-east-1a
    Task 2: us-east-1b
    (Auto-scale to 10+ tasks during peak)

Load Balancer: Application Load Balancer (health check: /health)
    → Removes unhealthy tasks automatically
```

---

## Backup Strategy

### Database Backups

| Backup Type                              | Frequency                      | Retention | Location                        |
| ---------------------------------------- | ------------------------------ | --------- | ------------------------------- |
| Automated RDS snapshots                  | Daily (2 AM UTC)               | 7 days    | Same region                     |
| Manual snapshot (before major migration) | Before each release            | 30 days   | Same region + cross-region copy |
| Export to S3 (full pg_dump)              | Weekly                         | 90 days   | S3 (encrypted with KMS)         |
| Point-in-time recovery                   | Continuous (5 min granularity) | 7 days    | RDS automated                   |

### S3 Screenshot Data

- Versioning enabled: deleted screenshots recoverable for 30 days
- Cross-region replication: asynchronous copy to DR bucket
- S3 Glacier transition: objects older than `screenshot_retention_days` (org setting, default 365 days)

---

## Failure Scenarios & Response

### Scenario 1: Single ECS Task Failure

```
Detection: ALB health check fails → task marked unhealthy
Response:  ECS replaces task automatically (< 2 minutes)
Impact:    None — other tasks continue serving traffic
RTO:       ~2 minutes (automatic)
```

### Scenario 2: RDS Primary Failure

```
Detection: RDS Multi-AZ automatic health check
Response:  AWS promotes Multi-AZ standby to primary (30–120 seconds)
           DNS endpoint updated automatically
Impact:    DB writes fail during failover window (~90s)
           In-flight sessions buffered in desktop app SQLite
RTO:       < 2 minutes (automatic)
RPO:       ~0 (synchronous Multi-AZ replication)
```

### Scenario 3: Full AZ Outage (us-east-1a down)

```
Detection: ALB detects target group healthy counts drop
Response:  ECS tasks in us-east-1a fail; ECS launches new tasks in us-east-1b/c
           RDS fails over to standby in us-east-1b
Impact:    Brief degradation (~5 minutes)
RTO:       < 10 minutes (semi-automatic)
RPO:       < 5 minutes
```

### Scenario 4: Full Region Failure (us-east-1 unavailable)

```
Pre-requisite: DR setup must be done before this is possible

Manual steps (runbook):
  1. Promote us-west-2 RDS Read Replica to standalone primary
  2. Update Route53 records:
      api.tracksync.io → DR ALB in us-west-2
      app.tracksync.io → DR CloudFront in us-west-2
  3. Point ECS DR cluster to new DB endpoint
  4. Verify S3 DR bucket is accessible
  5. Update app config / redeploy

RTO:  < 4 hours (manual, requires on-call engineer)
RPO:  < 15 minutes (S3 cross-region lag, Redis no cross-region)
```

---

## Runbooks

All runbooks stored in: `docs/runbooks/` (internal ops documentation)

| Runbook             | Trigger                         |
| ------------------- | ------------------------------- |
| `rds-failover.md`   | Manual RDS failover             |
| `ecs-scaling.md`    | Traffic spike, scale up ECS     |
| `redis-recovery.md` | Redis cluster failure           |
| `region-dr.md`      | Full region failover            |
| `data-restore.md`   | Accidental bulk delete recovery |

---

## DR Testing Schedule

| Test                   | Frequency | Method                                      |
| ---------------------- | --------- | ------------------------------------------- |
| RDS failover           | Quarterly | Reboot with failover in staging             |
| S3 restore from backup | Quarterly | Restore random sample of files              |
| Full region DR         | Annually  | Spin up DR region, run smoke tests          |
| Backup restore         | Monthly   | Restore DB snapshot to isolated environment |

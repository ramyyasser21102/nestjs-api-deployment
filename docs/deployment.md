# AWS Deployment

This document covers deploying this NestJS API to AWS. It explains how the app connects to PostgreSQL, then walks through two approaches: Naive deployment and Best Practices deployment.

---

## Database

PostgreSQL runs in every environment — local development, CI, and production (see [ADR 0001](adr/0001-postgres-everywhere.md)). TypeORM stays as the ORM (see [ADR 0002](adr/0002-keep-typeorm-for-now.md)).

A single `DATABASE_URL` Postgres connection string configures both the running app and the CLI migration tooling — there are no discrete host/port/user/password/database variables to keep in sync.

SSL is enforced automatically whenever `NODE_ENV=production`, and skipped otherwise (`src/db/db.config.ts`, `getDatabaseSsl`). This applies identically to both approaches below, but what it takes to actually satisfy it is very different between them:

- **Naive deployment**: the self-hosted Postgres container has no TLS configured out of the box, so it needs an explicit self-signed certificate before the app can connect in production. Covered in that section.
- **Best Practices deployment**: RDS terminates TLS with an AWS-managed certificate automatically — no extra setup required.

`synchronize` stays disabled in production in both approaches; real TypeORM migrations manage schema changes instead. See [TypeORM `synchronize` in Production](#typeorm-synchronize-in-production) below.

---

## Environment Variables

| Variable       | Required      | Description                                                                                                                                                                                                                                       |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | In production | Postgres connection string, e.g. `postgresql://user:password@host:5432/dbname`. Falls back to a local dev Postgres instance if unset — that fallback exists for local development only; always set this explicitly in every deployed environment. |
| `NODE_ENV`     | Yes           | Set to `production`. Controls TypeORM's `synchronize` flag (off in production), whether the Postgres connection requires SSL (on in production), and Pino's log format (JSON in production, pretty in dev).                                       |
| `PORT`         | No            | HTTP listen port. Default: `3000`.                                                                                                                                                                                                                |
| `JWT_SECRET`   | Planned       | Required when RBAC is added.                                                                                                                                                                                                                      |

---

## Approach 1: Naive (EC2 + PM2 + self-hosted Postgres)

This is the fastest path to a running API. It is suitable for personal projects, demos, and early-stage validation. It has real problems that will hurt at scale, listed after the setup.

### Architecture

```
Internet → EC2 Public IP : 3000 → Node.js (PM2)
                                         │
                                         ▼
                              Postgres (Docker container,
                                same EC2 instance)
```

The app runs directly on the EC2 instance, PM2 keeps it running and restarts it on crashes. Postgres runs alongside it in a single Docker container on the same instance. No load balancer, no HTTPS on the app itself, no orchestration.

### Setup Steps

**1. Launch an EC2 instance**

- AMI: Amazon Linux 2023 or Ubuntu 22.04
- Instance type: `t3.micro` or `t3.small`
- Security group: allow inbound TCP port 22 (SSH) and port 3000 (or 80 if you use Nginx in front)
- Create a key pair for SSH access

**2. Install Node.js, PM2, and Docker**

```bash
# On Amazon Linux 2023
sudo dnf install -y nodejs npm git docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user   # log out/in for this to take effect

# Install pnpm
npm install -g pnpm

# Install PM2 (process manager)
npm install -g pm2
```

**3. Run Postgres in a Docker container**

```bash
docker volume create postgres-data

docker run -d \
  --name postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=<a-real-password> \
  -e POSTGRES_DB=app_prod \
  -v postgres-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine
```

**4. Enable SSL on the Postgres container**

The app requires SSL on its database connection whenever `NODE_ENV=production` (see [Database](#database) above), but `postgres:16-alpine` ships with SSL off by default. Without this step, the app fails to connect at all — `The server does not support SSL connections`. A self-signed certificate is enough, since the app connects with `rejectUnauthorized: false`:

```bash
docker exec postgres sh -c "
  apk add --no-cache openssl
  cd /var/lib/postgresql/data
  openssl req -new -x509 -days 365 -nodes -subj '/CN=localhost' \
    -out server.crt -keyout server.key
  chown postgres:postgres server.crt server.key
  chmod 600 server.key
  psql -U postgres -c \"ALTER SYSTEM SET ssl = on;\"
  psql -U postgres -c \"ALTER SYSTEM SET ssl_cert_file = 'server.crt';\"
  psql -U postgres -c \"ALTER SYSTEM SET ssl_key_file = 'server.key';\"
"
docker restart postgres
```

**5. Clone and build the app**

```bash
git clone <your-repo-url> /home/ec2-user/app
cd /home/ec2-user/app
pnpm install
pnpm run build
```

**6. Set environment variables**

Create `/home/ec2-user/app/.env`:

```env
NODE_ENV=production
DATABASE_URL=postgresql://postgres:<a-real-password>@localhost:5432/app_prod
PORT=3000
```

**7. Run migrations**

`synchronize` is off in production (see [TypeORM `synchronize` in Production](#typeorm-synchronize-in-production)), so the schema has to be created explicitly before the app can serve traffic:

```bash
cd /home/ec2-user/app
pnpm run migration:run
```

**8. Start with PM2**

```bash
cd /home/ec2-user/app
pm2 start dist/main.js --name nestjs-api
pm2 save           # persist the process list across reboots
pm2 startup        # generate and run the systemd startup command PM2 prints
```

**9. Access the API**

```
http://<ec2-public-ip>:3000/health
http://<ec2-public-ip>:3000/api/docs  (Swagger UI)
```

### Problems with the Naive Approach

**No HTTPS on the app itself.** All app traffic is plain HTTP. Passwords and request/response data are transmitted unencrypted between the client and the app. Browsers warn users about insecure connections. This alone disqualifies the naive approach for any real user-facing product. (The Postgres connection _between the app and its own database_ is separately encrypted per the SSL setup above — that's unrelated to whether client traffic is HTTPS.)

**Port 3000 is exposed directly.** The Node.js process is the first thing the internet talks to. A crash or a memory exhaustion takes down the API with no buffer. There is no request buffering, no static file serving acceleration, no rate limiting at the network layer.

**No TLS termination point.** Adding HTTPS later means either modifying the app to load a certificate (complex, leaks into application code) or inserting a reverse proxy anyway (in which case you should have done the best-practices approach from the start).

**Postgres data lives on the instance disk.** The named Docker volume persists across container restarts, but if the EC2 instance is stopped and the root volume is not preserved, the database is lost. No automated backups, no read replicas, no failover — everything RDS provides in the Best Practices approach is either manual or entirely absent here.

**Self-signed certificate.** The SSL setup above encrypts the app-to-database connection but doesn't authenticate the server (`rejectUnauthorized: false`), so it doesn't protect against a machine-in-the-middle _within_ the EC2 instance itself. Acceptable for a single-instance personal project; not a substitute for RDS's AWS-managed certificate.

**No deployment automation.** Updating the app requires SSHing in, pulling the repo, rebuilding, running any new migrations, and restarting PM2. Every deploy is manual and carries the risk of downtime.

---

## Approach 2: Best Practices (EC2 + Docker + Nginx + ALB + ACM + RDS)

This is Best Practices deployment: it addresses every problem in the Naive approach, including replacing the self-hosted database with a managed one.

### Architecture

```
Internet
    │
    ▼
Application Load Balancer (ALB)
    │   ACM certificate (HTTPS/TLS termination)
    │   Listener: 443 → forward to target group
    │   Listener: 80  → redirect to 443
    ▼
EC2 Instance (single)
    │
    ├── Nginx (reverse proxy, port 80 on the instance)
    │       ↓
    └── Docker container (NestJS app, port 3000 internal)
            │
            ▼
    AWS RDS (PostgreSQL, single-AZ)
```

Moving the database to RDS removes the old single-instance constraint — the app itself can now run on multiple EC2 instances behind the ALB, since they'd all reach the same database. This doc still deploys a single instance because adding an autoscaling group is a separate, later effort, not because anything here still forces it.

### Component Explanations

#### ACM (AWS Certificate Manager)

ACM provisions free TLS certificates for your domain. It handles certificate renewal automatically — you never touch a certificate file. The certificate lives on the ALB, not on the EC2 instance. The app itself only handles HTTP internally (between the ALB and the instance).

To get a certificate:

1. Go to ACM in the AWS console → Request a certificate
2. Enter your domain name (e.g., `api.yourdomain.com`)
3. Choose DNS validation
4. Add the CNAME records ACM gives you to your DNS provider (Route 53, Cloudflare, etc.)
5. Wait for validation (usually under 5 minutes)

#### ALB (Application Load Balancer)

The ALB sits in front of the EC2 instance. It terminates TLS (handles HTTPS), decrypts the request, and forwards plain HTTP to the instance. It also:

- Redirects all HTTP (port 80) traffic to HTTPS (port 443) automatically via a listener rule.
- Does health checks against `/health` on the target instance — which now actually pings the database, so a broken RDS connection gets caught automatically and the ALB stops routing traffic to that instance.
- Provides a single DNS name (`your-alb.us-east-1.elb.amazonaws.com`) that you point your domain at via a CNAME or Route 53 alias record.

ALB setup:

1. EC2 → Load Balancers → Create → Application Load Balancer
2. Select your VPC and at least two subnets (ALBs require two AZs even with one target)
3. Security group: allow inbound 80 and 443
4. Listeners: 80 → redirect to 443, 443 → forward to target group
5. Target group: HTTP, port 80, health check path `/health`
6. Register your EC2 instance in the target group

#### RDS (Relational Database Service)

RDS is a managed PostgreSQL instance — AWS handles patching, backups, and TLS certificate provisioning. This replaces the self-hosted Postgres container from the Naive approach.

Setup:

1. RDS → Create database → Standard create → Engine: PostgreSQL (match the version used locally, e.g. 16.x)
2. Templates: Dev/Test (or Production with Multi-AZ manually disabled — see step 6)
3. Instance class: `db.t3.micro` or `db.t4g.micro` (free-tier eligible)
4. Storage: 20 GB gp3 (default is fine to start)
5. Credentials: set a master username/password, or let RDS auto-generate one. Either way, store it somewhere retrievable — **AWS Secrets Manager is the natural next step here but is intentionally out of scope for this effort**; for now the password goes directly into the EC2 instance's environment (see below).
6. **Multi-AZ deployment: No.** This is a deliberate choice, not an oversight — Multi-AZ adds automatic failover but roughly doubles the cost, and this project doesn't need that availability yet. A subnet group spanning at least two AZs is still required by RDS even for a single-AZ instance; that's a provisioning requirement, not a Multi-AZ deployment.
7. Connectivity → Public access: **No**. RDS should only be reachable from inside the VPC, never from the internet directly.
8. VPC security group: create a dedicated one for RDS (see [Security Group Configuration](#security-group-configuration) below) — do not reuse the ALB or EC2 security groups.
9. Additional configuration → Initial database name: `app_prod`
10. Create the database and wait for it to become available (several minutes)
11. Connectivity & security tab → copy the endpoint hostname once available; this is the `host` in `DATABASE_URL`

RDS Postgres has SSL enabled by default with an AWS-managed certificate — nothing extra to configure here, unlike the Naive approach's self-hosted container.

Because RDS has no public access, run migrations (see [TypeORM `synchronize` in Production](#typeorm-synchronize-in-production)) from something that lives inside the VPC — the EC2 instance itself, or a bastion host, not your local machine.

#### ECR (Elastic Container Registry)

ECR is AWS's private Docker image registry. You build the image locally (or in CI), push it to ECR, and the EC2 instance pulls from there.

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t nestjs-api .
docker tag nestjs-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
```

On the EC2 instance, the instance needs an IAM role with `AmazonEC2ContainerRegistryReadOnly` attached so it can pull the image.

#### Nginx (Reverse Proxy)

Nginx runs on the EC2 instance and forwards incoming traffic on port 80 to the Docker container on port 3000. This decouples the port the instance exposes from the port the app listens on, and allows you to add request buffering, timeouts, and serving configuration without touching application code.

Install Nginx:

```bash
sudo dnf install -y nginx   # Amazon Linux 2023
sudo systemctl enable nginx
sudo systemctl start nginx
```

`/etc/nginx/conf.d/api.conf`:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}
```

`proxy_set_header X-Forwarded-For` passes the real client IP through so Pino's request logs show the actual requester, not the internal ALB IP.

#### Docker

The multi-stage `Dockerfile` in the repo builds a minimal production image:

- `base` stage: Node.js Alpine with pnpm
- `dev` stage: installs devDependencies for local development
- `build` stage: builds the TypeScript output with SWC
- `prod` stage: copies only `dist/` and `node_modules` (production dependencies only) — the final image has no TypeScript compiler, no test runner, no devDependencies

Run the production container on the EC2 instance. Unlike the Naive approach, there's no local volume to mount — the database lives in RDS, not on this instance's disk:

```bash
docker run -d \
  --name nestjs-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://<master-username>:<master-password>@<rds-endpoint>:5432/app_prod \
  -e PORT=3000 \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
```

In CI/CD, `DATABASE_URL` and the RDS credentials it embeds come from GitHub Actions repository secrets, never hardcoded into the image or committed to source control.

`--restart unless-stopped` makes Docker restart the container automatically after a crash or an EC2 reboot.

### Security Group Configuration

| Resource           | Inbound rules                                                      |
| ------------------ | ------------------------------------------------------------------ |
| ALB security group | 80 (HTTP) from 0.0.0.0/0, 443 (HTTPS) from 0.0.0.0/0               |
| EC2 security group | 22 (SSH) from your IP only, 80 (HTTP) from ALB security group only |
| RDS security group | 5432 (Postgres) from EC2 security group only                       |

The EC2 instance must NOT have port 80 or 443 open to the internet directly — only to the ALB. RDS must NOT be reachable from the internet, or even from the ALB — only from the EC2 instance's own security group. This forces all app traffic through the ALB and all database traffic through the EC2 instance.

### Deployment Update Flow

When you push a new version of the app:

```bash
# 1. Build the new image
docker build -t nestjs-api .

# 2. Push to ECR
docker tag nestjs-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest

# 3. On the EC2 instance: run any new migrations, then pull and restart
pnpm run migration:run   # against DATABASE_URL pointed at RDS
docker pull <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
docker stop nestjs-api
docker rm nestjs-api
docker run -d \
  --name nestjs-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://<master-username>:<master-password>@<rds-endpoint>:5432/app_prod \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
```

Step 3 can be scripted as a deploy script or triggered by a CI/CD pipeline (GitHub Actions → SSH to EC2 → run the pull-and-restart commands). Note that this repo's GitHub Actions workflow (`.github/workflows/ci.yml`) runs verification only (lint, typecheck, tests, build) — it does not deploy; the steps above remain a manual or separately-scripted process.

During the `docker stop` + `docker run` window (a few seconds), the ALB health check will fail and the ALB will briefly show the target as unhealthy. For zero-downtime deploys, this requires running two containers on the same instance on different ports and switching the Nginx upstream — but that is beyond the scope of the current architecture.

---

## Comparison

|                           | Naive (PM2 + self-hosted Postgres)                            | Best Practices (Docker + ALB + ACM + RDS)                                |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| HTTPS (client traffic)    | No                                                            | Yes (ACM + ALB)                                                          |
| Database                  | Self-hosted Postgres (Docker, same EC2 instance)              | AWS RDS (PostgreSQL, single-AZ, managed)                                 |
| Database data persistence | Risk (instance disk; lost if the root volume isn't preserved) | Yes (RDS, managed backups)                                               |
| Process restart on crash  | Yes (PM2)                                                     | Yes (Docker `--restart`)                                                 |
| Health checks             | No                                                            | Yes (ALB → `/health`, which pings the database)                          |
| Deployment method         | SSH + manual rebuild                                          | Docker image push + restart                                              |
| Time to set up            | ~45 minutes                                                   | ~3-4 hours                                                               |
| Cost                      | EC2 only                                                      | EC2 + ALB (~$20/month) + RDS (~$15-30/month depending on instance class) |
| Suitable for production   | No                                                            | Yes                                                                      |

---

## TypeORM `synchronize` in Production

The `app.module.ts` TypeORM configuration uses:

```typescript
synchronize: shouldSynchronize(configService.get('NODE_ENV')),
```

`shouldSynchronize` (in `src/db/db.config.ts`) only returns `true` for local, unconfigured development. Both the CI e2e suite and every deployed environment rely on real migrations instead, so the same schema-management path is exercised everywhere. This means TypeORM does NOT auto-create or modify the database schema at startup outside local dev. Schema changes must be applied via migrations:

```bash
# Generate a migration from entity changes
pnpm run migration:generate -- src/db/migrations/AddUserRole

# Run pending migrations
pnpm run migration:run
```

Running migrations in production: SSH to the EC2 instance (or a bastion, for the RDS case — see [RDS](#rds-relational-database-service) above) and run the migration command there, pointed at the deployed `DATABASE_URL`, before starting the new app version. Or run migrations as a pre-start step in the container's entrypoint script.

Never set `synchronize: true` in production. TypeORM's synchronize compares entity definitions to the live schema and runs ALTER TABLE statements automatically — including dropping columns it no longer sees in the entity. A typo in an entity field name could drop a production column.

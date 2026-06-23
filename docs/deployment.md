# AWS Deployment

This document covers deploying this NestJS API to AWS. It explains the SQLite constraint that shapes all deployment decisions, then walks through two approaches: a fast naive deployment and a production-grade architecture.

---

## The SQLite Constraint

SQLite is a file-based database. The database is a single file on the local filesystem — it is not a server you connect to over a network. This has one hard architectural consequence:

**All instances of the app must run on the same machine.**

With a network database like PostgreSQL or MySQL, you can spin up 5 app servers and all 5 connect to the same database. With SQLite, you cannot. If you deployed this app to two EC2 instances, each would have its own `app.db` file. A user created on instance A would not exist on instance B. Writes would conflict. Reads would return inconsistent data.

### What this means for deployment

- You must deploy to a **single EC2 instance**.
- You cannot use autoscaling groups (more than one instance at a time).
- The SQLite file must persist across container restarts and EC2 reboots.

### Migration path to scale

When you are ready to scale (multiple instances, autoscaling, RDS), the change is confined to two places:

1. `app.module.ts` — change `TypeOrmModule.forRootAsync` to use `postgres` as the `type`, change the `host`, `port`, `username`, `password`, and `database` config values.
2. `src/db/data-source.ts` — same change for the CLI datasource.

TypeORM's abstraction means the entity definitions and all service/repository code stay exactly the same.

---

## Environment Variables

| Variable       | Required | Description                                                                                                                               |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | No       | Path to SQLite file. Default: `./db.sqlite`. In Docker, should be `/data/app.db` (on a mounted volume).                                   |
| `NODE_ENV`     | Yes      | Set to `production`. Controls TypeORM's `synchronize` flag (off in production) and Pino's log format (JSON in production, pretty in dev). |
| `PORT`         | No       | HTTP listen port. Default: `3000`.                                                                                                        |
| `JWT_SECRET`   | Planned  | Required when RBAC is added.                                                                                                              |

---

## Approach 1: Naive (EC2 + PM2)

This is the fastest path to a running API. It is suitable for personal projects, demos, and early-stage validation. It has real problems that will hurt at scale, listed after the setup.

### Architecture

```
Internet → EC2 Public IP : 3000 → Node.js (PM2)
```

The app runs directly on the EC2 instance, PM2 keeps it running and restarts it on crashes. No load balancer, no HTTPS, no container.

### Setup Steps

**1. Launch an EC2 instance**

- AMI: Amazon Linux 2023 or Ubuntu 22.04
- Instance type: `t3.micro` or `t3.small`
- Security group: allow inbound TCP port 22 (SSH) and port 3000 (or 80 if you use Nginx in front)
- Create a key pair for SSH access

**2. Install Node.js and PM2**

```bash
# On Amazon Linux 2023
sudo dnf install -y nodejs npm git

# Install pnpm
npm install -g pnpm

# Install PM2 (process manager)
npm install -g pm2
```

**3. Clone and build the app**

```bash
git clone <your-repo-url> /home/ec2-user/app
cd /home/ec2-user/app
pnpm install
pnpm run build
```

**4. Set environment variables**

Create `/home/ec2-user/app/.env`:

```env
NODE_ENV=production
DATABASE_URL=/home/ec2-user/data/app.db
PORT=3000
```

Create the data directory so SQLite has somewhere to write:

```bash
mkdir -p /home/ec2-user/data
```

**5. Start with PM2**

```bash
cd /home/ec2-user/app
pm2 start dist/main.js --name nestjs-api
pm2 save           # persist the process list across reboots
pm2 startup        # generate and run the systemd startup command PM2 prints
```

**6. Access the API**

```
http://<ec2-public-ip>:3000/health
http://<ec2-public-ip>:3000/api/docs  (Swagger UI)
```

### Problems with the Naive Approach

**No HTTPS.** All traffic is plain HTTP. Passwords and request/response data are transmitted unencrypted. Browsers warn users about insecure connections. This alone disqualifies the naive approach for any real user-facing product.

**Port 3000 is exposed directly.** The Node.js process is the first thing the internet talks to. A crash or a memory exhaustion takes down the API with no buffer. There is no request buffering, no static file serving acceleration, no rate limiting at the network layer.

**No TLS termination point.** Adding HTTPS later means either modifying the app to load a certificate (complex, leaks into application code) or inserting a reverse proxy anyway (in which case you should have done the best-practices approach from the start).

**SQLite file on the instance disk.** If the EC2 instance is stopped and the root volume is not preserved, the data is lost. EBS volumes can be attached, but the naive approach typically skips this step.

**No deployment automation.** Updating the app requires SSHing in, pulling the repo, rebuilding, and restarting PM2. Every deploy is manual and carries the risk of downtime.

---

## Approach 2: Best Practices (EC2 + Docker + Nginx + ALB + ACM + EBS)

This is the production-ready architecture. It addresses every problem in the naive approach while staying within the single-EC2 SQLite constraint.

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
EC2 Instance (single, due to SQLite)
    │
    ├── Nginx (reverse proxy, port 80 on the instance)
    │       ↓
    └── Docker container (NestJS app, port 3000 internal)
            │
            └── EBS Volume (/data/app.db → SQLite file)
```

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
- Does health checks against `/health` on the target instance. If the health check fails, the ALB stops sending traffic (protection against a crashed app).
- Provides a single DNS name (`your-alb.us-east-1.elb.amazonaws.com`) that you point your domain at via a CNAME or Route 53 alias record.

ALB setup:

1. EC2 → Load Balancers → Create → Application Load Balancer
2. Select your VPC and at least two subnets (ALBs require two AZs even with one target)
3. Security group: allow inbound 80 and 443
4. Listeners: 80 → redirect to 443, 443 → forward to target group
5. Target group: HTTP, port 80, health check path `/health`
6. Register your EC2 instance in the target group

#### EBS Volume (Elastic Block Store)

An EBS volume is a network-attached disk that persists independently of the EC2 instance lifecycle. Even if the instance is stopped, terminated, or replaced, the EBS volume and its data survive.

Setup:

1. EC2 → Volumes → Create Volume (e.g., 8 GB, same AZ as the instance)
2. Attach the volume to the EC2 instance
3. Format and mount it:

```bash
# On the EC2 instance (first time only)
sudo mkfs -t ext4 /dev/xvdf
sudo mkdir -p /data
sudo mount /dev/xvdf /data
sudo chown ec2-user:ec2-user /data

# Make mount persistent across reboots
echo '/dev/xvdf /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

The Docker container mounts `/data` as a volume:

```bash
docker run -v /data:/data nestjs-api
```

The `DATABASE_URL` is set to `/data/app.db` — the file lives on the EBS volume, not inside the container. Container restarts, image updates, and replacements do not affect the data.

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

Run the production container on the EC2 instance:

```bash
docker run -d \
  --name nestjs-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /data:/data \
  -e NODE_ENV=production \
  -e DATABASE_URL=/data/app.db \
  -e PORT=3000 \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
```

`--restart unless-stopped` makes Docker restart the container automatically after a crash or an EC2 reboot.

### Security Group Configuration

| Resource           | Inbound rules                                                      |
| ------------------ | ------------------------------------------------------------------ |
| ALB security group | 80 (HTTP) from 0.0.0.0/0, 443 (HTTPS) from 0.0.0.0/0               |
| EC2 security group | 22 (SSH) from your IP only, 80 (HTTP) from ALB security group only |

The EC2 instance must NOT have port 80 or 443 open to the internet directly — only to the ALB. This forces all traffic through the ALB (which enforces HTTPS and performs health checks).

### Deployment Update Flow

When you push a new version of the app:

```bash
# 1. Build the new image
docker build -t nestjs-api .

# 2. Push to ECR
docker tag nestjs-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest

# 3. On the EC2 instance: pull and restart
docker pull <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
docker stop nestjs-api
docker rm nestjs-api
docker run -d \
  --name nestjs-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /data:/data \
  -e NODE_ENV=production \
  -e DATABASE_URL=/data/app.db \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/nestjs-api:latest
```

Step 3 can be scripted as a deploy script or triggered by a CI/CD pipeline (GitHub Actions → SSH to EC2 → run the pull-and-restart commands).

During the `docker stop` + `docker run` window (a few seconds), the ALB health check will fail and the ALB will briefly show the target as unhealthy. For zero-downtime deploys, this requires running two containers on the same instance on different ports and switching the Nginx upstream — but that is beyond the scope of the current architecture.

---

## Comparison

|                                 | Naive (PM2)          | Best Practices (Docker + ALB + ACM) |
| ------------------------------- | -------------------- | ----------------------------------- |
| HTTPS                           | No                   | Yes (ACM + ALB)                     |
| Data persistence across reboots | Risk (root disk)     | Yes (EBS volume)                    |
| Process restart on crash        | Yes (PM2)            | Yes (Docker `--restart`)            |
| Health checks                   | No                   | Yes (ALB → `/health`)               |
| Deployment method               | SSH + manual rebuild | Docker image push + restart         |
| Time to set up                  | ~30 minutes          | ~2-3 hours                          |
| Cost                            | EC2 only             | EC2 + ALB (~$20/month) + EBS        |
| Suitable for production         | No                   | Yes                                 |

---

## TypeORM `synchronize` in Production

The `app.module.ts` TypeORM configuration uses:

```typescript
synchronize: configService.get('NODE_ENV') !== 'production',
```

When `NODE_ENV=production`, `synchronize` is `false`. This means TypeORM does NOT auto-create or modify the database schema at startup. Schema changes in production must be applied via migrations:

```bash
# Generate a migration from entity changes
pnpm run migration:generate -- src/db/migrations/AddUserRole

# Run pending migrations
pnpm run migration:run
```

Running migrations in production: SSH to the EC2 instance, run the migration command inside the container, then start the new app version. Or run migrations as a pre-start step in the container's entrypoint script.

Never set `synchronize: true` in production. TypeORM's synchronize compares entity definitions to the live schema and runs ALTER TABLE statements automatically — including dropping columns it no longer sees in the entity. A typo in an entity field name could drop a production column.

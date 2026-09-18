# nestjs-api-deployment

A NestJS API built explicitly as a hands-on learning project for AWS deployment and PostgreSQL, alongside its own product surface (users, health).

## Language

**Naive deployment**:
The fast, minimal-setup way to run this API on AWS for personal projects, demos, and early validation — a single EC2 instance, no load balancer, no HTTPS. Documented in `docs/deployment.md` as "Approach 1."
_Avoid_: basic deployment, quick deployment

**Best Practices deployment**:
The production-grade AWS deployment architecture for this API — adds HTTPS termination, load balancing, and automated health checks on top of the Naive approach. Documented in `docs/deployment.md` as "Approach 2."
_Avoid_: production deployment, advanced deployment

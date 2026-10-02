#!/usr/bin/env bash
# Run this FROM YOUR MACHINE (or CI) to trigger a deploy. It looks up the
# instance's current public IP/DNS from AWS (so it keeps working whether
# or not an Elastic IP is attached yet), then SSHes in and runs
# check-deps.sh + deploy.sh on the box itself.
#
# Requires: AWS CLI configured locally (uses $AWS_PROFILE), and the SSH
# private key for the ubuntu-aws-ssh-access key pair.
#
# Usage:
#   SSH_KEY=~/.ssh/ubuntu-aws-ssh-access.pem ./scripts/deploy-remote.sh
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-admin}"
AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_ID="${INSTANCE_ID:-i-0413235997c7e7e32}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY to the path of your ubuntu-aws-ssh-access .pem file}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/ubuntu/app}"
REPO_URL="${REPO_URL:-git@github.com:ramyyasser21102/nestjs-api-deployment.git}"

echo "==> Looking up current public IP/DNS for $INSTANCE_ID"
read -r PUBLIC_IP PUBLIC_DNS STATE <<<"$(
  aws ec2 describe-instances \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].[PublicIpAddress,PublicDnsName,State.Name]" \
    --output text
)"

if [ "$STATE" != "running" ]; then
  echo "ERROR: instance $INSTANCE_ID is '$STATE', not 'running'." >&2
  exit 1
fi

if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" = "None" ]; then
  echo "ERROR: instance $INSTANCE_ID has no public IP." >&2
  exit 1
fi

echo "==> Target: $PUBLIC_IP ($PUBLIC_DNS)"

# shellcheck disable=SC2087
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$PUBLIC_IP" bash -s <<EOF
set -euo pipefail
REMOTE_APP_DIR="$REMOTE_APP_DIR"
REPO_URL="$REPO_URL"

if [ ! -d "\$REMOTE_APP_DIR/.git" ]; then
  echo "==> \$REMOTE_APP_DIR not found — cloning fresh checkout"
  echo "    (requires this instance's own SSH key to be registered as a GitHub deploy key)"
  git clone "\$REPO_URL" "\$REMOTE_APP_DIR"
fi

cd "\$REMOTE_APP_DIR"
git fetch origin
git reset --hard origin/main

./scripts/check-deps.sh
./scripts/deploy.sh
EOF

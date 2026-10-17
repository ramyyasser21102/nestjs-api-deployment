#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env.deploy}"
if [ -f "$ENV_FILE" ]; then
  set -a 
  source "$ENV_FILE"
  set +a
fi

AWS_PROFILE="${AWS_PROFILE:?Set AWS_PROFILE in $ENV_FILE}"
AWS_REGION="${AWS_REGION:?Set AWS_REGION in $ENV_FILE}"
INSTANCE_ID="${INSTANCE_ID:?Set INSTANCE_ID in $ENV_FILE}"
SSH_USER="${SSH_USER:?Set SSH_USER in $ENV_FILE}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY in $ENV_FILE}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:?Set REMOTE_APP_DIR in $ENV_FILE}"
REPO_URL="${REPO_URL:?Set REPO_URL in $ENV_FILE}"

echo "==> Looking up current public IP/DNS for $INSTANCE_ID"
read -r STATE PUBLIC_IP PUBLIC_DNS <<<"$(
  aws ec2 describe-instances \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].[State.Name,PublicIpAddress,PublicDnsName]" \
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

./scripts/deploy.sh
EOF

#!/usr/bin/env bash
#
# ensure-alb-alarms.sh — idempotently create the three CloudWatch
# alarms our compliance posture requires on the public ALB:
#
#   1. Target response latency
#   2. UnHealthy host count
#   3. Server 5xx error rate
#
# The script is safe to re-run; each `aws cloudwatch put-metric-alarm`
# is an upsert. Threshold defaults are tuned for a low-traffic
# onboarding surface; override via env vars (see USAGE below).
#
# Usage
# -----
#   # By ALB ARN (most direct):
#   AWS_REGION=us-west-2 \
#   ALB_ARN="arn:aws:elasticloadbalancing:us-west-2:1234:loadbalancer/app/foo/abc" \
#   ./scripts/aws/ensure-alb-alarms.sh
#
#   # By ALB DNS name (more typical — the Ingress controller exposes it):
#   AWS_REGION=us-west-2 \
#   ALB_DNS="k8s-groundxstudio-ca70a60b9c-1234567890.us-west-2.elb.amazonaws.com" \
#   ./scripts/aws/ensure-alb-alarms.sh
#
#   # By LoadBalancer name:
#   AWS_REGION=us-west-2 \
#   ALB_NAME="k8s-groundxstudio-ca70a60b9c" \
#   ./scripts/aws/ensure-alb-alarms.sh
#
# Optional env vars
# -----------------
#   SNS_TOPIC_ARN          # If set, alarms publish to this topic on state change.
#                            If unset, alarms exist but take no actions (the
#                            compliance control is satisfied by alarm presence).
#   ALARM_NAME_PREFIX      # Defaults to "groundx-onboarding". Lets you scope.
#   LATENCY_THRESHOLD_S    # TargetResponseTime Average threshold in seconds. Default 1.0
#   UNHEALTHY_HOST_THRESHOLD  # UnHealthyHostCount Maximum threshold. Default 1
#   FIVEXX_THRESHOLD       # HTTPCode_Target_5XX_Count Sum threshold over 5 min. Default 5
#   DRY_RUN                # If "true", prints the put-metric-alarm calls without executing them.
#
# Exit codes
# ----------
#   0 = success (3 alarms upserted)
#   2 = bad usage / missing env
#   3 = could not resolve ALB
#   4 = aws CLI missing

set -euo pipefail

err() { printf 'ensure-alb-alarms: %s\n' "$*" >&2; }
info() { printf 'ensure-alb-alarms: %s\n' "$*"; }

if ! command -v aws >/dev/null 2>&1; then
  err "aws CLI is required but not found in PATH"
  exit 4
fi

: "${AWS_REGION:?AWS_REGION is required}"

ALARM_NAME_PREFIX="${ALARM_NAME_PREFIX:-groundx-onboarding}"
LATENCY_THRESHOLD_S="${LATENCY_THRESHOLD_S:-1.0}"
UNHEALTHY_HOST_THRESHOLD="${UNHEALTHY_HOST_THRESHOLD:-1}"
FIVEXX_THRESHOLD="${FIVEXX_THRESHOLD:-5}"
SNS_TOPIC_ARN="${SNS_TOPIC_ARN:-}"
DRY_RUN="${DRY_RUN:-false}"

# ---------------------------------------------------------------------------
# Resolve the ALB to its CloudWatch dimension form
# (CloudWatch wants the LB's resource ID, e.g. "app/<name>/<id>", NOT the ARN).
# ---------------------------------------------------------------------------

resolve_lb_arn() {
  if [ -n "${ALB_ARN:-}" ]; then
    printf '%s' "$ALB_ARN"
    return 0
  fi
  if [ -n "${ALB_NAME:-}" ]; then
    aws elbv2 describe-load-balancers \
      --region "$AWS_REGION" \
      --names "$ALB_NAME" \
      --query 'LoadBalancers[0].LoadBalancerArn' \
      --output text 2>/dev/null
    return 0
  fi
  if [ -n "${ALB_DNS:-}" ]; then
    aws elbv2 describe-load-balancers \
      --region "$AWS_REGION" \
      --query "LoadBalancers[?DNSName=='${ALB_DNS}'].LoadBalancerArn | [0]" \
      --output text 2>/dev/null
    return 0
  fi
  return 1
}

LB_ARN="$(resolve_lb_arn || true)"
if [ -z "$LB_ARN" ] || [ "$LB_ARN" = "None" ]; then
  err "Could not resolve ALB. Set ALB_ARN, ALB_NAME, or ALB_DNS."
  exit 3
fi

# CloudWatch dimension is the suffix after `loadbalancer/` in the ARN
# i.e. `app/<name>/<id>`. The pattern is fixed for ALBs and NLBs.
LB_DIMENSION="${LB_ARN#*loadbalancer/}"
if [ "$LB_DIMENSION" = "$LB_ARN" ]; then
  err "Unexpected ALB ARN shape: $LB_ARN"
  exit 3
fi

info "Region:    $AWS_REGION"
info "LB ARN:    $LB_ARN"
info "LB dim:    $LB_DIMENSION"
info "SNS topic: ${SNS_TOPIC_ARN:-<none — alarms will have no actions>}"
info "Dry run:   $DRY_RUN"

# ---------------------------------------------------------------------------
# Helper: put a single alarm
# ---------------------------------------------------------------------------

put_alarm() {
  local name="$1"
  local metric="$2"
  local stat="$3"
  local comparison="$4"
  local threshold="$5"
  local period="$6"
  local eval_periods="$7"
  local description="$8"

  local -a args=(
    cloudwatch put-metric-alarm
    --region "$AWS_REGION"
    --alarm-name "$name"
    --alarm-description "$description"
    --namespace AWS/ApplicationELB
    --metric-name "$metric"
    --statistic "$stat"
    --period "$period"
    --evaluation-periods "$eval_periods"
    --threshold "$threshold"
    --comparison-operator "$comparison"
    --dimensions "Name=LoadBalancer,Value=$LB_DIMENSION"
    --treat-missing-data notBreaching
    --tags "Key=managed-by,Value=ensure-alb-alarms" "Key=app,Value=groundx-onboarding"
  )
  if [ -n "$SNS_TOPIC_ARN" ]; then
    args+=(--alarm-actions "$SNS_TOPIC_ARN" --ok-actions "$SNS_TOPIC_ARN")
  fi

  if [ "$DRY_RUN" = "true" ]; then
    printf 'DRY: aws'
    printf ' %q' "${args[@]}"
    printf '\n'
    return 0
  fi

  aws "${args[@]}" >/dev/null
  info "Upserted alarm: $name"
}

# ---------------------------------------------------------------------------
# 1. Latency
# ---------------------------------------------------------------------------
put_alarm \
  "${ALARM_NAME_PREFIX}-alb-latency" \
  "TargetResponseTime" \
  "Average" \
  "GreaterThanThreshold" \
  "$LATENCY_THRESHOLD_S" \
  "300" \
  "2" \
  "Average target response time over 5 min exceeds ${LATENCY_THRESHOLD_S}s for 2 consecutive periods."

# ---------------------------------------------------------------------------
# 2. Unhealthy host count
# ---------------------------------------------------------------------------
put_alarm \
  "${ALARM_NAME_PREFIX}-alb-unhealthy-hosts" \
  "UnHealthyHostCount" \
  "Maximum" \
  "GreaterThanOrEqualToThreshold" \
  "$UNHEALTHY_HOST_THRESHOLD" \
  "60" \
  "2" \
  "At least ${UNHEALTHY_HOST_THRESHOLD} target(s) reported unhealthy for 2 consecutive minutes."

# ---------------------------------------------------------------------------
# 3. Server 5xx
# ---------------------------------------------------------------------------
put_alarm \
  "${ALARM_NAME_PREFIX}-alb-5xx" \
  "HTTPCode_Target_5XX_Count" \
  "Sum" \
  "GreaterThanThreshold" \
  "$FIVEXX_THRESHOLD" \
  "300" \
  "1" \
  "More than ${FIVEXX_THRESHOLD} target 5xx responses in a 5 min window."

info "Done. 3 alarms ensured."

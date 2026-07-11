#!/usr/bin/env bash
# Set up the GCS bucket used by the Vertex Files adapter (Stage 2).
#
# Idempotent: safe to re-run. Creates the bucket if missing, grants the SA
# storage.objectUser on it, and applies a lifecycle rule that auto-deletes
# objects after GCS_LIFECYCLE_DAYS days.
#
# Required env:
#   GCP_PROJECT_ID      e.g. my-project-123
#   GCS_BUCKET          must be globally unique, e.g. amc-webui-files-<rand>
#   VERTEX_SA_EMAIL     the SA used by the api server, e.g.
#                       amc-vertex@my-project-123.iam.gserviceaccount.com
#
# Optional env:
#   GCS_LOCATION        default us-central1 (choose a valid GCS bucket location)
#   GCS_LIFECYCLE_DAYS  default 30 (set to 0 to skip the lifecycle rule)
#
# Usage:
#   GCP_PROJECT_ID=...  GCS_BUCKET=...  VERTEX_SA_EMAIL=...  \
#     bash scripts/setup-gcs-bucket.sh

set -euo pipefail

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCS_BUCKET:?GCS_BUCKET is required}"
: "${VERTEX_SA_EMAIL:?VERTEX_SA_EMAIL is required}"
GCS_LOCATION="${GCS_LOCATION:-us-central1}"
GCS_LIFECYCLE_DAYS="${GCS_LIFECYCLE_DAYS:-30}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is not installed or not on PATH." >&2
  exit 2
fi

echo "Project:     ${GCP_PROJECT_ID}"
echo "Bucket:      gs://${GCS_BUCKET}"
echo "Location:    ${GCS_LOCATION}"
echo "SA:          ${VERTEX_SA_EMAIL}"
echo "Lifecycle:   ${GCS_LIFECYCLE_DAYS} days (0=skip)"
echo

# Step 1 — create bucket (idempotent)
if gcloud storage buckets describe "gs://${GCS_BUCKET}" --project="${GCP_PROJECT_ID}" >/dev/null 2>&1; then
  echo "[1/3] bucket already exists, skipping create"
else
  echo "[1/3] creating bucket gs://${GCS_BUCKET} in ${GCS_LOCATION}"
  gcloud storage buckets create "gs://${GCS_BUCKET}" \
    --project="${GCP_PROJECT_ID}" \
    --location="${GCS_LOCATION}" \
    --uniform-bucket-level-access
fi

# Step 2 — grant SA objectUser (idempotent; gcloud is a no-op if already bound)
echo "[2/3] granting roles/storage.objectUser to ${VERTEX_SA_EMAIL}"
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --project="${GCP_PROJECT_ID}" \
  --member="serviceAccount:${VERTEX_SA_EMAIL}" \
  --role="roles/storage.objectUser" \
  --condition=None \
  >/dev/null

# Step 3 — lifecycle (optional)
if [ "${GCS_LIFECYCLE_DAYS}" -gt 0 ]; then
  echo "[3/3] applying ${GCS_LIFECYCLE_DAYS}-day delete lifecycle"
  lifecycle_file="$(mktemp -t gcs-lifecycle.XXXXXX.json)"
  trap 'rm -f "${lifecycle_file}"' EXIT
  cat >"${lifecycle_file}" <<EOF
{
  "lifecycle": {
    "rule": [
      { "action": { "type": "Delete" }, "condition": { "age": ${GCS_LIFECYCLE_DAYS} } }
    ]
  }
}
EOF
  gcloud storage buckets update "gs://${GCS_BUCKET}" \
    --project="${GCP_PROJECT_ID}" \
    --lifecycle-file="${lifecycle_file}" \
    >/dev/null
else
  echo "[3/3] lifecycle rule skipped (GCS_LIFECYCLE_DAYS=0)"
fi

echo
echo "Done. Set GCS_BUCKET=${GCS_BUCKET} in .env and restart the api container."

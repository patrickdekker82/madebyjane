#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker ontbreekt.' >&2; exit 1; }
docker info >/dev/null
printf 'Proef: lokaal Linux-container, 1 CPU / 1 GiB, geen netwerk of GPU; outputs en work/linux-probe worden beschreven.\n'
mkdir -p outputs work/linux-probe
docker build -f infra/docker/Dockerfile.probe -t interieurstudio-probe:0.0.1 .
docker run --rm --init --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --security-opt "seccomp=$PWD/infra/docker/chromium-seccomp.json" \
  --memory 1g --cpus 1 --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --user "$(id -u):$(id -g)" --env HOME=/tmp \
  --mount "type=bind,source=$PWD/outputs,target=/app/outputs" \
  --mount "type=bind,source=$PWD/work/linux-probe,target=/app/work" \
  interieurstudio-probe:0.0.1 node node_modules/tsx/dist/cli.mjs scripts/pdf-probe.ts

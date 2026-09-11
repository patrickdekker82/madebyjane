#!/bin/sh
set -eu

# Bind mounts are created by Docker as root on a new host. Only the API gets
# this narrowly scoped hand-off; the migrator has no writable application data.
if [ "${PREPARE_STORAGE:-0}" = 1 ]; then
  chown -R node:node /app/work/assets
fi
exec gosu node "$@"

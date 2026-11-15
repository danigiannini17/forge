#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/forge-web"

if [[ ! -f "$BACKEND_DIR/target/classpath.txt" ]]; then
  echo "[start-webapp] Building forge-web classpath..."
  (cd "$BACKEND_DIR" && mvn -s /home/antigravity/.m2/settings.xml compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt -Dcheckstyle.skip=true)
fi

CP="$BACKEND_DIR/target/classes:$(cat "$BACKEND_DIR/target/classpath.txt")"
exec java -Xmx2G -cp "$CP" forge.web.ForgeWebServer

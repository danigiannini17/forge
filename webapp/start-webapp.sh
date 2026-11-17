#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR/forge-web"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

MVN_ARGS=(-Dcheckstyle.skip=true -DskipTests)
if [[ -f "/home/antigravity/.m2/settings.xml" ]]; then
  MVN_ARGS=(-s "/home/antigravity/.m2/settings.xml" "${MVN_ARGS[@]}")
elif [[ -f "$REPO_ROOT/.mvn/local-settings.xml" ]]; then
  MVN_ARGS=(-s "$REPO_ROOT/.mvn/local-settings.xml" "${MVN_ARGS[@]}")
fi

if [[ ! -d "$FRONTEND_DIR/dist" ]] && command -v npm >/dev/null 2>&1; then
  echo "[start-webapp] Building frontend production bundle..."
  (cd "$FRONTEND_DIR" && npm install && npm run build)
fi

if [[ ! -f "$BACKEND_DIR/target/classpath.txt" ]] || [[ "$BACKEND_DIR/pom.xml" -nt "$BACKEND_DIR/target/classpath.txt" ]]; then
  echo "[start-webapp] Building forge-web classpath..."
  if ! (cd "$BACKEND_DIR" && mvn "${MVN_ARGS[@]}" compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt); then
    echo "[start-webapp] Installing parent & core modules into local Maven repository..."
    (cd "$REPO_ROOT" && mvn "${MVN_ARGS[@]}" -pl .,forge-core,forge-game,forge-ai,forge-gui flatten:flatten install)
    (cd "$BACKEND_DIR" && mvn "${MVN_ARGS[@]}" compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt)
  fi
fi

CP="$BACKEND_DIR/target/classes:$(cat "$BACKEND_DIR/target/classpath.txt")"
exec java -Xmx2G -cp "$CP" forge.web.ForgeWebServer "$@"

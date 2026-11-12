#!/bin/sh
set -eu
cd "$APP_DIR"
node .testprism/suite/test.mjs

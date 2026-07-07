#!/bin/sh
set -e

echo "Subindo stack e aguardando healthchecks..."
docker compose up -d --wait

echo ""
echo "Executando verificação automática (unitários + fluxo webhook)..."
docker compose --profile verify run --rm verify

echo ""
echo "Stack pronta e verificada."

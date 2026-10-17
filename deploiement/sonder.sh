#!/usr/bin/env bash
# Sondage des sources de données depuis GitHub Actions (le conteneur de travail n'atteint ni insee.fr ni
# data.gouv.fr). 1-2 (16/10) : Filosofi 2021, BPE25 ; 3 (17/10) : Filosofi 2019 des DROM (mart, reun).
# 4 (17/10) : diagnostics par EPCI : appartenance commune → EPCI et noms des EPCI (geo.api.gouv.fr, COG Insee).
set -uo pipefail
api=https://geo.api.gouv.fr
echo "=== /epcis"
curl -sS --max-time 120 "$api/epcis?fields=code,nom" | jq -c 'length, .[0:3]'
echo "=== /communes (code, nom, codeEpci, codeDepartement, population)"
curl -sS --max-time 300 "$api/communes?fields=code,nom,codeEpci,codeDepartement,population" -o /tmp/c.json
ls -l /tmp/c.json; jq -c 'length, .[0:2], ([.[] | select(.codeEpci == null)] | length), ([.[] | .codeDepartement] | unique | length)' /tmp/c.json
jq -c '[.[] | select(.codeDepartement | startswith("97"))] | group_by(.codeDepartement) | map({d: .[0].codeDepartement, n: length, sans_epci: ([.[] | select(.codeEpci == null)] | length)})' /tmp/c.json
echo "=== /communes?type=arrondissement-municipal"
curl -sS --max-time 120 "$api/communes?type=arrondissement-municipal&fields=code,nom,codeEpci" | jq -c 'length, .[0:2]'

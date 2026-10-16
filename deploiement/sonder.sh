#!/usr/bin/env bash
# Sondage des sources de la phase 6 depuis GitHub Actions (le conteneur de travail n'atteint ni insee.fr ni
# data.gouv.fr) : jeux de données BPE et Filosofi carroyé sur data.gouv.fr, avec les adresses de leurs fichiers.
set -uo pipefail
for q in "base permanente des equipements 2024" "base permanente des equipements" "filosofi carroyees 200m 2021" "donnees carroyees filosofi"; do
  echo "=== recherche : $q"
  curl -sS --max-time 60 -G "https://www.data.gouv.fr/api/1/datasets/" --data-urlencode "q=$q" --data-urlencode "page_size=8" \
    | jq -r '.data[] | "\(.title) | \(.organization.name // "-") | \(.page)\n" + ([.resources[] | "    - \(.title) [\(.format)] \(.filesize // 0) o \(.last_modified[0:10]) \(.url)"] | join("\n"))' | head -120
done
echo "=== insee.fr (accès direct)"
for u in https://www.insee.fr/fr/statistiques/8217525 https://www.insee.fr/fr/statistiques/7655475; do
  echo "$u → $(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$u")"
done

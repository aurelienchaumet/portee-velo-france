#!/usr/bin/env bash
# Sondage des sources de la phase 6 depuis GitHub Actions (le conteneur de travail n'atteint ni insee.fr ni
# data.gouv.fr). 1er sondage (16/10) : Filosofi 2021 200 m métropole en parquet sur data.gouv.fr ; BPE 2024 en
# parquet seulement par un tiers. 2e : fichiers de la page BPE de l'Insee, et Filosofi des DROM.
set -uo pipefail
for p in 8217525 8217527 7655475 7655503; do
  echo "=== insee.fr/fr/statistiques/$p : liens vers des fichiers"
  curl -sS --max-time 60 "https://www.insee.fr/fr/statistiques/$p" | grep -oE 'href="[^"]*(fichier|\.zip|\.parquet|\.csv)[^"]*"' | sort -u | head -40
done
for u in https://www.insee.fr/fr/statistiques/fichier/8217525/BPE24.zip https://www.insee.fr/fr/statistiques/fichier/8217525/BPE24_geoloc.zip; do
  echo "$u → $(curl -sSIL -o /dev/null -w '%{http_code} %{size_download} %{content_type}' --max-time 60 "$u")"
done
echo "=== data.gouv.fr : jeu Filosofi carroyé (toutes ressources)"
curl -sS --max-time 60 "https://www.data.gouv.fr/api/1/datasets/revenus-pauvrete-et-niveau-de-vie-donnees-carroyees-2019-et-2021-dispositif-fichier-localise-social-et-fiscal-filosofi/" \
  | jq -r '"\(.title) | \(.organization.name // "-")", (.resources[] | "    - \(.title) [\(.format)] \(.filesize // 0) o \(.url)")'

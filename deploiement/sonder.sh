#!/usr/bin/env bash
# Sondage des sources de données depuis GitHub Actions (le conteneur de travail n'atteint ni insee.fr ni
# data.gouv.fr). 1er sondage (16/10) : Filosofi 2021 200 m métropole en parquet sur data.gouv.fr ; 2e : BPE25.parquet
# sur insee.fr, Filosofi 2019 (page 7655475) en csv/gpkg/shp. 3e (17/10) : contenu du zip Filosofi 2019 csv
# (fichiers des DROM ?) et forme des identifiants de carreau (CRS des DROM).
set -uo pipefail
d=$(mktemp -d)
curl -sSfL --retry 3 --max-time 600 -o "$d/f.zip" https://www.insee.fr/fr/statistiques/fichier/7655475/Filosofi2019_carreaux_200m_csv.zip
ls -l "$d/f.zip"
echo "=== contenu"
unzip -l "$d/f.zip"
cd "$d" && unzip -q f.zip
for a in $(find . -name '*.7z' -o -name '*.zip' ! -name f.zip); do echo "=== archive interne $a"; 7z l "$a" | tail -15; 7z x -y "$a" >/dev/null; done
for c in $(find . -iname '*.csv'); do
  echo "=== $c : $(wc -l < "$c") lignes"; head -3 "$c" | cut -c1-300
done

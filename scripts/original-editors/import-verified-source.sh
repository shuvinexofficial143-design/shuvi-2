#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

import_original() {
  local name="$1" tag="$2" sha="$3" dest="$4" label="$5" app="$6"
  echo "::group::Import original $name at $tag"
  git clone --quiet --depth 1 --branch "$tag" --single-branch "https://github.com/storytold/$name.git" "$temp/$name"
  local actual
  actual="$(git -C "$temp/$name" rev-parse HEAD)"
  test "$actual" = "$sha" || { echo "::error::Upstream commit mismatch for $name"; exit 1; }
  # Reject incomplete imports involving nested Git submodules.
  if git -C "$temp/$name" ls-files --stage | grep -q '^160000 '; then
    echo "::error::Nested git submodules in upstream; full recursive vendoring needed"; exit 1
  fi
  mkdir -p "$dest"
  cp -a "$temp/$name/." "$dest/"
  rm -rf "$dest/.git"
  for n in LICENSE-APACHE LICENSE-MIT NOTICE ATTRIBUTION.md; do
    test -f "$dest/$n" || { echo "::error::Missing original $n"; exit 1; }
  done
  DEST="$dest" APP="$app" LABEL="$label" NAME="$name" python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ["DEST"])/"apps"/os.environ["NAME"]/"src"/"main.rs"
s=p.read_text(encoding="utf-8")
old=os.environ["NAME"].replace("filmcraft","FilmCraft").replace("effectcraft","EffectCraft")
new="Shuvi 2 "+os.environ["LABEL"]
needle='.with_title("'+old+'")'
if needle not in s: raise SystemExit("Original native title not found: "+needle)
s=s.replace(needle,'.with_title("'+new+'")')
s=s.replace('eframe::run_native("'+old+'"','eframe::run_native("'+new+'"')
p.write_text(s,encoding="utf-8")
print("Only original desktop-window title modified:",p)
PY
  cat > "$dest/SHUVI_SOURCE_ORIGIN.txt" <<EOF
Shuvi 2 $label — full original source, not a replacement UI.
Original: https://github.com/storytold/$name
Release: $tag
Exact source SHA: $actual
Copied as regular tracked Git files into YOUR Shuvi 2 repo.
Only native window title was changed; Rust crate/package names remain original.
Original licenses, NOTICE and ATTRIBUTION are preserved.
No Shuvi AI integration in this standalone source verification checkpoint.
EOF
  echo "Upstream tracked files: $(git -C "$temp/$name" ls-files | wc -l)"
  echo "::endgroup::"
}

import_original filmcraft v0.14.0 a2d8e9ce269aba9c399e36262522e11456df6fbf original-editors/Shuvi2-Video Video filmcraft
import_original effectcraft v0.18.0 c3600f9b59b109da97871a43a6898683a0163cb1 original-editors/Shuvi2-Motion Motion effectcraft

git config user.name "Shuvi 2 source importer"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -f -A -- original-editors
if ! git diff --cached --quiet; then
  git commit -m "vendor: commit complete FilmCraft and EffectCraft original UI source as Shuvi 2 editors"
  git push origin HEAD:refs/heads/feature/shuvi2-original-sources
fi
echo "source_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

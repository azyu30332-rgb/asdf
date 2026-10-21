#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
import json,os,re
meta=json.loads(Path('dist/android/release-metadata.json').read_text())
pkg=json.loads(Path('package.json').read_text())
assert meta['version']==pkg['version'] and re.fullmatch(r'\d+\.\d+\.\d+',meta['version'])
assert meta['commit']==os.environ['GITHUB_SHA'],'Release artifact commit differs from this workflow'
assert meta['apk']==f"chaekjang-{meta['version']}.apk"
PY
(cd dist/android && sha256sum --check SHA256SUMS)
release_version="$(node -p 'require("./package.json").version')"
release_tag="v${release_version}"
release_apk="dist/android/chaekjang-${release_version}.apk"
if gh release view "$release_tag" --repo "$GITHUB_REPOSITORY" --json targetCommitish > /tmp/chaekjang-existing-release.json 2>/dev/null; then
  python3 - <<'PY'
import json,os
existing=json.load(open('/tmp/chaekjang-existing-release.json'))
assert existing['targetCommitish']==os.environ['GITHUB_SHA'],'This version is already published for another commit; increment the version before publishing'
PY
  gh release view "$release_tag" --repo "$GITHUB_REPOSITORY" --json url --jq .url
else
  gh release create "$release_tag" "$release_apk" dist/android/SHA256SUMS dist/android/release-metadata.json \
    --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --title "책장 ${release_tag} · Android" --notes-file android/RELEASE_NOTES.md
fi

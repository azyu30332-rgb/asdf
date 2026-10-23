"""Verify the version and bundled UI of the APK being distributed, then name it uniquely."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1]
apk=Path(sys.argv[1]) if len(sys.argv)>1 else root/'android/app/build/outputs/apk/debug/app-debug.apk'
version=json.loads((root/'package.json').read_text())['version']
assert re.fullmatch(r'\d+\.\d+\.\d+',version),'Invalid release version'
config=(root/'android/app/build.gradle').read_text()
code=int(re.search(r'versionCode\s+(\d+)',config).group(1))
assert re.search(r"versionName\s+'([^']+)'",config).group(1)==version
sdk=Path(os.environ.get('ANDROID_HOME','/workspace/.tools/android-sdk'))
build_tools=sdk/'build-tools/35.0.0'
badging=subprocess.check_output([str(build_tools/'aapt'),'dump','badging',str(apk)],text=True)
assert f"versionCode='{code}'" in badging and f"versionName='{version}'" in badging,'APK version mismatch'
assert "name='kr.chaekjang.app'" in badging,'Unexpected application ID'
certificates=subprocess.check_output([str(build_tools/'apksigner'),'verify','--print-certs',str(apk)],text=True)
signing_sha256=re.search(r'Signer #1 certificate SHA-256 digest: (\w+)',certificates).group(1)
if os.environ.get('CHAEKJANG_KEYSTORE'):
    store_cert=subprocess.check_output(['keytool','-exportcert','-keystore',os.environ['CHAEKJANG_KEYSTORE'],'-storepass','android','-alias','androiddebugkey'])
    assert hashlib.sha256(store_cert).hexdigest()==signing_sha256,'APK did not use the persistent signing key'
with zipfile.ZipFile(apk) as archive:
    embedded=archive.read('assets/index.html')
assert embedded==(root/'chaekjang.html').read_bytes(),'APK contains stale web assets'
text=embedded.decode('utf-8')
for marker in [f'설치 버전">v{version}</span>','themes-dialog','사진 찍기','거래완료일','share-backup','restore','export-documents','document-format','시리즈 요약','권별 상세','photo-album','photo-viewer','선택 사진 저장','선택 사진 공유','photo-editor','folders-dialog','folder-tiles','favorite-options','favorite-filters','floating-add','edit-editor-cover','햇살 노랑','벚꽃 핑크','편집본 추가 저장']:
    assert marker in text,f'APK UI is missing {marker}'
output=root/'dist/android';output.mkdir(parents=True,exist_ok=True)
name=f'chaekjang-{version}.apk';shutil.copyfile(apk,output/name)
digest=hashlib.sha256(apk.read_bytes()).hexdigest()
(output/'SHA256SUMS').write_text(f'{digest}  {name}\n')
commit=os.environ.get('GITHUB_SHA') or subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
(output/'release-metadata.json').write_text(json.dumps({'version':version,'versionCode':code,'signingSha256':signing_sha256,'commit':commit,'sha256':digest,'apk':name},indent=2)+'\n')
print(f'Verified Android package {version} (code {code}), matching bundled UI and signature: {name}')

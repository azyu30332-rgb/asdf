"""Use a cached private key; fail rather than silently replace a published signing identity."""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile
store=Path.home()/'.android/debug.keystore'
store.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as directory:
    result=subprocess.run(['gh','release','download','--repo',os.environ['GITHUB_REPOSITORY'],'--pattern','release-metadata.json','--dir',directory],capture_output=True,text=True)
    if result.returncode:
        raise SystemExit('Could not check the previous release signing identity; refusing to generate a replacement key.')
    previous=json.loads((Path(directory)/'release-metadata.json').read_text()).get('signingSha256')
if not store.exists():
    if previous:raise SystemExit('Published signing key is missing from the cache. Restore the original key before releasing an update.')
    subprocess.run(['keytool','-genkeypair','-keystore',str(store),'-storepass','android','-keypass','android','-alias','androiddebugkey','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Android Debug,O=Android,C=US'],check=True)
certificate=subprocess.check_output(['keytool','-exportcert','-keystore',str(store),'-storepass','android','-alias','androiddebugkey'])
fingerprint=hashlib.sha256(certificate).hexdigest()
if previous and previous!=fingerprint:raise SystemExit('Cached key differs from the published identity. Restore the original key before releasing an update.')
with open(os.environ['GITHUB_ENV'],'a') as output:output.write(f'CHAEKJANG_KEYSTORE={store}\n')
print('Persistent signing certificate SHA-256:',fingerprint)

"""Actually replace the installed previous-release APK and require the original photo/data to survive."""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile,sys,re
root=Path(__file__).resolve().parents[1]
def failure(title,detail):
    message=detail[-4000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print(f'::error title={title}::{message}',flush=True)
    raise SystemExit(1)
def run(command):
    result=subprocess.run(command,cwd=root/'android',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=300)
    print(result.stdout,flush=True)
    if result.returncode:failure('Upgrade test command failed',result.stdout)
    return result.stdout
with tempfile.TemporaryDirectory() as directory:
    old=Path(directory)/'previous.apk'
    metadata=Path(directory)/'previous-metadata.json'
    run(['curl','--fail','--location','--retry','3','https://github.com/azyu30332-rgb/asdf/releases/latest/download/release-metadata.json','-o',str(metadata)])
    previous=json.loads(metadata.read_text());previous_version=previous['version']
    assert re.fullmatch(r'\d+\.\d+\.\d+',previous_version)
    assert previous['apk']==f'chaekjang-{previous_version}.apk'
    run(['curl','--fail','--location','--retry','3',f'https://github.com/azyu30332-rgb/asdf/releases/download/v{previous_version}/{previous["apk"]}','-o',str(old)])
    assert hashlib.sha256(old.read_bytes()).hexdigest()==previous['sha256'],'Previous APK checksum differs'
    run(['bash','./gradlew','--no-daemon','assembleDebugAndroidTest'])
    run(['adb','install','-r',str(old)])
    run(['adb','install','-r',str(root/'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')])
    version=json.loads((root/'package.json').read_text())['version']
    def instrument(method):
        text=run(['adb','shell','am','instrument','-w','-r','-e','class','kr.chaekjang.app.UpgradeStateTest#'+method,'-e','expectedVersion',version,'-e','previousVersion',previous_version,'kr.chaekjang.app.test/androidx.test.runner.AndroidJUnitRunner'])
        if 'OK (1 test)' not in text or 'FAILURES!!!' in text:failure('Previous-version photo/data preservation failed',text)
    instrument('seedPreviousVersion')
    run(['adb','shell','am','force-stop','kr.chaekjang.app'])
    run(['adb','install','-r',str(root/'android/app/build/outputs/apk/debug/app-debug.apk')])
    instrument('verifyAfterReplaceInstall')
message='PASS: '+previous_version+' → '+version+' APK replace-install preserved the exact photo bytes, book data, note, registration date, missing volumes and sale date; photo still decodes after restart.'
print(message,flush=True)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write(message+'\n')

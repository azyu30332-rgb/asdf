"""Wait for the emulator, configure wakefulness, and preserve the actual test exit status."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[1]
def annotation(kind,title,text):
    text=text.replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print(f'::{kind} title={title}::{text}',flush=True)
def adb(*args,required=False):
    try:
        result=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=60)
        if result.returncode:
            annotation('error' if required else 'notice','Android setup command',' '.join(args)+': '+(result.stderr+result.stdout)[-2000:])
            if required:raise SystemExit(result.returncode)
        return result
    except subprocess.TimeoutExpired:
        annotation('error' if required else 'notice','Android setup timeout',' '.join(args))
        if required:raise SystemExit(1)
        return None
adb('wait-for-device',required=True)
# Android versions differ in supported power commands. The UI test separately requires
# an awake, unlocked, focused app window, so optional setup commands do not replace it.
for command in ['settings put system screen_off_timeout 1800000','svc power stayon true','input keyevent KEYCODE_WAKEUP','wm dismiss-keyguard']:
    adb('shell',command)
print('Starting actual connectedDebugAndroidTest',flush=True)
result=subprocess.run(['bash','./gradlew','--no-daemon','connectedDebugAndroidTest'],cwd=root/'android',stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
print(result.stdout,flush=True)
if result.returncode:
    marker=result.stdout.find('* What went wrong:')
    detail=result.stdout[marker:marker+3500] if marker>=0 else result.stdout[-3500:]
    annotation('error','Android device test command failed',detail)
    focus=adb('shell','dumpsys window')
    if focus:
        lines=[line.strip() for line in focus.stdout.splitlines() if any(x in line.lower() for x in ['mcurrentfocus','mfocusedapp','keyguardshowing','isstatusbarkeyguard'])]
        annotation('notice','Emulator focus','\n'.join(lines[:12]))
sys.exit(result.returncode)

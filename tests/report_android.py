"""Surface device-test outcomes in Actions annotations and the run summary."""
from pathlib import Path
import os
import xml.etree.ElementTree as ET
files=list(Path('android/app/build/outputs/androidTest-results/connected').rglob('TEST-*.xml'))
summary=[]
if not files:
    summary.append('Android device tests: no result files were produced; execution is unverified.')
for file in files:
    root=ET.parse(file).getroot()
    summary.append(f"{root.get('name')}: {root.get('tests')} tests, {root.get('failures','0')} failures, {root.get('errors','0')} errors, {root.get('skipped','0')} skipped")
    for case in root.findall('testcase'):
        for fail in list(case.findall('failure'))+list(case.findall('error')):
            message=((fail.text or fail.get('message') or '')[:1800]).replace('%','%25').replace('\r','%0D').replace('\n','%0A')
            print(f"::error title={case.get('name','Android test')}::{message}")
print('\n'.join(summary))
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:out.write('\n'.join(summary)+'\n')

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="/workspace/.tools/android-sdk"
export ANDROID_USER_HOME="/workspace/.tools/android-user"
export GRADLE_USER_HOME="/workspace/.tools/gradle-home"
export JAVA_HOME="/workspace/.tools/jdk-21.0.12.1+1"
export PATH="$JAVA_HOME/bin:$PATH"
npm test
./android/gradlew --no-daemon -p android assembleDebug lintDebug '-Dorg.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8 -Duser.home=/workspace/.tools/java-home'

#!/bin/zsh
# يبني Sanad.wgt لشاشة سامسونج: الغلاف + نسخة من الصفحة (احتياط لو الصفحة ما فتحت من الإنترنت)
#   ./build.sh [اسم ملف التوقيع، الافتراضي homeclock]
set -e
cd ${0:A:h}
PROFILE=${1:-homeclock}
T=~/tizen-studio/tools/ide/bin/tizen
rm -rf build && mkdir build
cp config.xml index.html icon.png build/
mkdir -p build/web && cp -R ../web/{tv.html,tv.css,tv.js,fonts,vendor} build/web/
$T package -t wgt -s $PROFILE -- build >/dev/null
mv build/*.wgt ./Sanad.wgt
echo "• Sanad.wgt ($(du -h Sanad.wgt | cut -f1))"

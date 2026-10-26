# تثبيت «مكتب الخدمات الصحية المساندة» على أندرويد TV (شاومي وغيره) عبر adb

التطبيق جاهز ومبني تلقائيًا من هذا المستودع، ورابطه الثابت (آخر نسخة دائمًا):

https://github.com/nadir-coderlab/sanad/releases/download/android-app/Sanad.apk

رقم التطبيق: `com.nadircoderlab.sanad`

## الخطوات
1. تأكد أن الجهاز متصل: `adb devices`
2. نزّل الملف:
   `curl -L -o Sanad.apk https://github.com/nadir-coderlab/sanad/releases/download/android-app/Sanad.apk`
3. ثبّته (يحلّ محل أي نسخة سابقة):
   `adb install -r Sanad.apk`
4. شغّله:
   `adb shell monkey -p com.nadircoderlab.sanad -c android.intent.category.LEANBACK_LAUNCHER 1`
5. يجب أن يظهر على الشاشة باركود وعنوان «مكتب الخدمات الصحية المساندة».

## ملاحظات
- التطبيق يفتح صفحته من الإنترنت (GitHub Pages)، فأي تحديث للصفحة يصل دون إعادة تثبيت. وإن انقطع الإنترنت يفتح النسخة المضمّنة فيه.
- الرقم السري الافتراضي 1234، وهو خاص بكل شاشة.
- زر الرجوع في الريموت لا يغلق التطبيق مباشرة؛ الاستمرار بالضغط عليه ثانية واحدة يغلقه.
- لتشخيص الصفحة: التطبيق يسمح بأدوات المطوّر عبر `chrome://inspect` بعد `adb forward`.
- لا تلمس أي جهاز غير الجهاز المقصود.

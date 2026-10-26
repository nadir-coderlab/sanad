# «مكتب الخدمات الصحية المساندة» لشاشات إل جي (webOS)

**المعرّف:** `com.nadircoderlab.sanad` (الإصدار 1.0.0؛ الغلاف نادر التغيّر).

## كيف يعمل
- `index.html` يتحقق من `manifest.json` على الموقع، ثم يفتح الصفحة الحية `https://nadir-coderlab.github.io/sanad/tv.html` داخل إطار.
  وإن لم يصل الموقع، يفتح النسخة الاحتياطية `web/tv.html` المضمّنة.
- **الأزرار:** الغلاف يمسك التركيز، ويرسل كل زر للصفحة بـ `postMessage({sanadKey: keyCode})`.
  وزرّ الرجوع في إل جي (٤٦١) يُحوَّل إلى ١٠٠٠٩، وهو الرقم الذي تعرفه `tv.js`.
- **الخروج:** الصفحة ترسل `{sanad: 'exit'}` إلى الغلاف، فيستدعي `window.close()`.
- **منع شاشة التوقف:** فيديو أسود صغير (`keepawake.mp4`) يعمل دائمًا.

## البناء والتثبيت (ويندوز)
```powershell
powershell -File webos\build.ps1 -Install [-Device lgtv]
```
- يحتاج أدوات إل جي `@webos-tools/cli`. إن لم تكن في PATH، مرّر مجلدها بـ `-AresBin`.
- الشاشة معرّفة فيها بـ `ares-setup-device` و`ares-novacom --getkey` (مع تفعيل Key Server في تطبيق Developer Mode على الشاشة).
- الناتج في `webos/out/`، ومجلد `webos/build/` مؤقت. كلاهما خارج المستودع.

## تنبيه
**جلسة وضع المطوّر في إل جي محدودة المدة.** إذا انتهت حُذف التطبيق.
مدّدها من تطبيق Developer Mode بزر «Extend Session Time» قبل انتهائها.

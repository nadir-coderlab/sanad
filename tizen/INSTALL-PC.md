# تثبيت «ساعة البيت» و«الخدمات المساندة» على شاشة سامسونج من جهاز ويندوز

رد على المستخدم بالعربي، وبلهجة بسيطة. وأعطه خطوة وحدة كل مرة.

المستخدم واقف عند شاشة سامسونج «شاشة المكتب» (UA65U8000F، موديل ٢٠٢٥، Tizen). الشاشة على نفس شبكة هذا الجهاز.
التطبيقين مبنيين وموقّعين، وما يحتاجون إعادة توقيع:
- ساعة البيت: https://github.com/nadir-coderlab/home-clock/releases/download/tv-app/HomeClock.wgt (رقم التطبيق HmClock001.HomeClock)
- الخدمات المساندة: https://github.com/nadir-coderlab/sanad/releases/download/tv-app/Sanad.wgt (رقم التطبيق SndSrv0001.Sanad)

## الخطوات
1. اعرف عنوان هذا الجهاز على الشبكة (ipconfig)، وأعطه للمستخدم.
2. قل للمستخدم يفعّل وضع المطوّر في الشاشة:
   - يفتح التطبيقات Apps.
   - يكتب 12345 بالريموت.
   - يشغّل Developer mode، ويكتب في Host PC IP عنوان هذا الجهاز.
   - يطفي الشاشة ويشغّلها.
3. وأنت تنتظره، ثبّت Tizen Studio CLI لويندوز من https://developer.tizen.org/development/tizen-studio/download بدون واجهة. تحتاج منه `tools\sdb.exe` و `tools\ide\bin\tizen.bat`.
4. لقِ الشاشة في الشبكة (المنفذ 26101 مفتوح فيها)، بعدها `sdb connect <ip>:26101` و `sdb devices`.
5. نزّل الملفين وثبّتهم:
   - `tizen install -n HomeClock.wgt -t <اسم الجهاز>`
   - `tizen install -n Sanad.wgt -t <اسم الجهاز>`
   - لو ما نفع، جرّب `sdb install <الملف>`.
6. شغّل الخدمات المساندة: `tizen run -p SndSrv0001.Sanad -t <الجهاز>`.
   - لازم يطلع على الشاشة باركود وعنوان «الخدمات المساندة».
   - خلّ المستخدم يصوّر الباركود بجواله ويرسل ملف PDF، وتأكد معه إن الملف طلع على الشاشة.
7. جرّب ساعة البيت: `tizen run -p HmClock001.HomeClock -t <الجهاز>`.

## لو انرفض التثبيت بسبب التوقيع
موديلات ٢٠٢٤ وفوق ممكن تطلب «شهادة سامسونج».
- يسويها المستخدم مرة وحدة: من Certificate Manager، أو `tizen certificate` مع cert-add-on، ويسجّل دخول بحساب سامسونج.
- بعدها أعد البناء من المصدر بنفس الشهادة وبنفس رقم التطبيق:
  - المستودع github.com/nadir-coderlab/home-clock (مجلدين tizen وweb).
  - والمستودع github.com/nadir-coderlab/sanad (مجلدين tizen وweb).
  - طريقة البناء في tizen/build.sh: تنسخ الغلاف ونسخة web إلى build، وبعدها `tizen package -t wgt -s <الشهادة>`.

## ملاحظات
- التطبيقين يفتحون صفحاتهم من الإنترنت، فالشاشة لازم يكون فيها نت.
- لا تلمس أي شاشة أو جهاز غير شاشة المكتب.

// «الخدمات المساندة» — صفحة الجوال: ترسل الملفات للشاشة وتتحكم فيها.
'use strict';

function $(id) { return document.getElementById(id); }
function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var KINDS = { pdf: 'PDF', image: 'صورة', video: 'فيديو', sheet: 'Excel' };

// رقم الشاشة يجي من الباركود، ونحفظه عشان المرة الجاية تفتح على طول
var sid = location.hash.slice(1);
if (sid) localStorage.setItem('sanad-id', sid);
else sid = localStorage.getItem('sanad-id');
if (!sid) { $('nolink').hidden = false; pill('bad', 'ما فيه شاشة'); }
// الصفحة الرئيسية ما تطلع إلا بعد ما الشاشة تقبل الرقم السري
addEventListener('hashchange', function () { location.reload(); });

function pill(cls, text) { var p = $('pill'); p.className = cls; p.lastChild.textContent = text; }

var dev = /iPhone/.test(navigator.userAgent) ? 'آيفون' : /iPad/.test(navigator.userAgent) ? 'آيباد' :
  /Android/.test(navigator.userAgent) ? 'جوال أندرويد' : /Mac/.test(navigator.userAgent) ? 'ماك' : 'جهاز';

// ── الاتصال بالشاشة ──
var peer = null, conn = null, retryTimer = null, openTimer = null;

function start() {
  if (!sid) return;
  pill('', 'يتصل…');
  peer = new Peer({ debug: 1 });
  peer.on('open', connect);
  peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { if (peer.disconnected) peer.reconnect(); }, 1500); });
  peer.on('error', function (e) {
    if (e.type === 'peer-unavailable') { pill('bad', 'الشاشة مو شغّالة'); retry(3000); return; }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) {
      pill('bad', 'ما فيه إنترنت');
      try { peer.destroy(); } catch (x) {}
      setTimeout(start, 3000);
    }
  });
}

function connect() {
  clearTimeout(retryTimer);
  if (conn && conn.open) return;
  if (peer.disconnected) { peer.reconnect(); return; }
  pill('', 'يتصل بالشاشة…');
  var c = peer.connect('sanad-' + sid, { serialization: 'raw', reliable: true, metadata: { dev: dev } });
  conn = c;
  clearTimeout(openTimer);
  openTimer = setTimeout(function () { if (!c.open) { c.close(); retry(500); } }, 15000);
  c.on('open', function () {
    clearTimeout(openTimer);
    pill('', 'يتحقق…');
  });
  c.on('data', function (d) {
    if (typeof d === 'string') { try { onMsg(JSON.parse(d)); } catch (e) {} }
    else if (d instanceof ArrayBuffer) onChunk(d);
  });
  c.on('close', function () { if (conn === c) { pill('bad', 'انقطع، يعيد الاتصال…'); failActive(); failDl(); retry(1500); } });
  c.on('error', function () {});
}

function retry(ms) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(function () { if (peer && !peer.destroyed) connect(); }, ms);
}

// يبيّن هل الاتصال مباشر داخل الشبكة أو عبر وسيط (مشفّر في الحالتين)
function linkType(c) {
  setTimeout(function () {
    var pc = c.peerConnection;
    if (!pc || !c.open) return;
    pc.getStats().then(function (st) {
      var pair = null, relay = false;
      st.forEach(function (r) {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId);
      });
      if (!pair) st.forEach(function (r) { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = pair || r; });
      if (pair) {
        var l = st.get(pair.localCandidateId), rm = st.get(pair.remoteCandidateId);
        relay = (l && l.candidateType === 'relay') || (rm && rm.candidateType === 'relay');
      }
      if (c.open) pill('ok', relay ? 'متصل عبر وسيط مشفّر' : 'متصل مباشر');
    }).catch(function () {});
  }, 1500);
}

function send(m) { if (conn && conn.open) conn.send(JSON.stringify(m)); }
function cmd(c, extra) { var m = { t: 'cmd', c: c }; for (var k in extra) m[k] = extra[k]; send(m); }

document.addEventListener('visibilitychange', function () {
  if (document.hidden || !peer) return;
  if (peer.destroyed) start();
  else if (!conn || !conn.open) connect();
  wake();
});

// يخلي شاشة الجوال صاحية وقت الاجتماع
var lock = null;
function wake() { try { if (!lock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { lock = l; l.onrelease = function () { lock = null; }; }, function () {}); } catch (e) {} }
document.addEventListener('click', wake);

// ── اللي يجي من الشاشة ──
var files = [], cur = null;

// ── الرقم السري: نحفظه بعد أول دخول صحيح عشان ما ينسأل كل مرة ──
var pinKey = 'sanad-pin-' + sid, pinSent = '';

function askPin(err) {
  $('main').hidden = true;
  $('pinbox').hidden = false;
  $('pinerr').hidden = !err;
  $('pinerr').textContent = err || '';
  $('pin').value = '';
  pill('', 'بانتظار الرقم السري');
  setTimeout(function () { $('pin').focus(); }, 50);
}

function sendPin(p) {
  pinSent = p;
  send({ t: 'pin', pin: p });
}

$('pinform').addEventListener('submit', function (e) {
  e.preventDefault();
  var p = toLatin($('pin').value).replace(/\D/g, '');
  if (p.length < 4) { $('pinerr').hidden = false; $('pinerr').textContent = 'الرقم ٤ أرقام أو أكثر'; return; }
  sendPin(p);
});

function toLatin(s) { return String(s).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); }

// الشاشة تقول إذا الدخول مفتوح (بدون رقم سري) أو لا، والأزرار تتغيّر على حسبه
var pinOpen = false;
function renderPinUi() {
  $('chpin').textContent = pinOpen ? 'تفعيل رقم سري' : 'تغيير الرقم السري';
  $('nopin').hidden = pinOpen;
  $('openhint').hidden = !pinOpen;
}

$('nopin').onclick = function () {
  if (!confirm('تلغي الرقم السري؟ أي أحد يصوّر الباركود بيقدر يدخل ويرسل ويشوف الملفات.')) return;
  send({ t: 'setpin', off: true });
};

$('chpin').onclick = function () {
  var a = toLatin(prompt('الرقم السري الجديد (من ٤ إلى ٨ أرقام)') || '').trim();
  if (!a) return;
  if (!/^\d{4,8}$/.test(a)) { say('الرقم لازم يكون من ٤ إلى ٨ أرقام.'); return; }
  var b = toLatin(prompt('اكتب الرقم الجديد مرة ثانية للتأكيد') || '').trim();
  if (a !== b) { say('الرقمين مو متطابقين، ما تغيّر شي.'); return; }
  pinSent = a;
  send({ t: 'setpin', pin: a });
};

function onMsg(m) {
  if (m.t === 'auth') {
    var saved = localStorage.getItem(pinKey);
    if (saved) sendPin(saved); else askPin();
    return;
  }
  if (m.t === 'pinok') {
    pinOpen = !!m.open;
    if (pinOpen) localStorage.removeItem(pinKey); else if (pinSent) localStorage.setItem(pinKey, pinSent);
    renderPinUi();
    $('pinbox').hidden = true;
    $('main').hidden = false;
    pill('ok', 'متصل');
    if (conn) linkType(conn);
    pumpQueue();
    return;
  }
  if (m.t === 'pinbad') {
    localStorage.removeItem(pinKey);
    askPin(m.wait ? 'محاولات كثيرة غلط. انتظر ' + ar(m.wait) + ' ثانية وجرّب.' : 'الرقم السري غلط.');
    return;
  }
  if (m.t === 'pinset') {
    if (m.ok && m.open) { localStorage.removeItem(pinKey); say('انلغى الرقم السري. أي أحد يصوّر الباركود يقدر يدخل الحين.', 5000); }
    else if (m.ok) { localStorage.setItem(pinKey, pinSent); say('تغيّر الرقم السري ✓ بلّغ فريقك بالرقم الجديد.', 5000); }
    else say('ما تغيّر الرقم. لازم يكون من ٤ إلى ٨ أرقام.');
    return;
  }
  if (m.t === 'pinmode') { pinOpen = !!m.open; if (pinOpen) localStorage.removeItem(pinKey); renderPinUi(); return; }
  if (m.t === 'say') { say(m.text, 6000); return; }
  if (m.t === 'files') {
    var now = Date.now();
    files = m.files.map(function (f) { f.expAt = now + (f.left || 0); return f; });
    renderList();
  }
  else if (m.t === 'state') { cur = m.cur; renderCtl(); renderList(); }
  else if (m.t === 'thumb') {
    if (m.data) $('thumb').src = m.data;
    $('idle').hidden = !!m.data;
    // الصورة الجاية من الشاشة صار فيها الرسم، فنمسح المسودة
    if (!stroke) dg.clearRect(0, 0, draft.width, draft.height);
  }
  else if (m.t === 'ack') { var u = upById(m.id); if (u) { u.acked = m.got; drawUp(u); } }
  else if (m.t === 'done') {
    var d = upById(m.id);
    if (d) {
      d.state = 'done'; d.acked = d.size; drawUp(d); setTimeout(function () { removeUp(d); }, 2500);
      say('وصل «' + d.name + '». اضغط عليه تحت عشان يطلع على الشاشة.', 5000);
    }
    if (waitDone) { waitDone(); waitDone = null; }
  }
  else if (m.t === 'fileout') {
    dl = { id: m.id, name: m.name, type: m.type || '', size: m.size, parts: [], got: 0 };
    if (!m.size) finishDl();
    else drawDl(m.id);
  }
  else if (m.t === 'nofile') { dl = null; say('الملف انمسح من الشاشة.'); renderList(); }
}

// ── تنزيل ملف من الشاشة للجوال ──
var dl = null, saved = {};

function onChunk(buf) {
  if (!dl) return;
  dl.parts.push(buf);
  dl.got += buf.byteLength;
  drawDl(dl.id);
  if (dl.got >= dl.size) finishDl();
}

function finishDl() {
  var d = dl;
  dl = null;
  saved[d.id] = new File(d.parts, d.name, { type: d.type });
  renderList();
  say('نزل «' + d.name + '». اضغط «حفظ» عشان تحفظه في جوالك.', 5000);
}

function failDl() {
  if (!dl) return;
  dl = null;
  say('انقطع التنزيل، جرّب مرة ثانية.');
  renderList();
}

function dlLabel(id) {
  if (saved[id]) return 'حفظ';
  if (dl && dl.id === id) return dl.size ? ar(Math.floor(dl.got / dl.size * 100)) + '٪' : '…';
  return 'تنزيل';
}

function drawDl(id) {
  var b = document.querySelector('.dl[data-id="' + id + '"]');
  if (b) b.textContent = dlLabel(id);
}

function download(f) {
  if (saved[f.id]) { saveFile(saved[f.id]); return; }
  if (dl) { say('فيه ملف ينزل الحين، انتظره يخلص.'); return; }
  dl = { id: f.id, name: f.name, size: f.size, parts: [], got: 0 };
  send({ t: 'get', id: f.id });
  drawDl(f.id);
}

// في الآيفون والأندرويد نفتح قائمة المشاركة (حفظ في الملفات أو الصور)، وإذا ما تنفع نحمّله عادي
function saveFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch(function (e) { if (e && e.name !== 'AbortError') plainSave(file); });
  } else plainSave(file);
}
function plainSave(file) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}

function renderList() {
  var box = $('list');
  $('clear').hidden = !files.length;
  if (!files.length) { box.innerHTML = '<div class="empty">ما فيه ملفات على الشاشة.</div>'; return; }
  box.innerHTML = '';
  files.slice().reverse().forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'it' + (cur && cur.id === f.id ? ' on' : '');
    d.innerHTML = (f.thumb ? '<img src="' + f.thumb + '">' : '<div class="ph"></div>') +
      '<div class="x"><b>' + esc(f.name) + '</b><span>' + KINDS[f.kind] +
      (f.kind === 'pdf' ? ' · ' + ar(f.pages) + ' صفحة' : f.kind === 'sheet' && f.pages > 1 ? ' · ' + ar(f.pages) + ' أوراق' : '') +
      ' · ' + leftText(f) + '</span></div>' +
      '<button class="dl" data-id="' + esc(f.id) + '">' + dlLabel(f.id) + '</button><button class="del">حذف</button>';
    d.onclick = function (e) {
      if (e.target.classList.contains('del')) cmd('delete', { id: f.id });
      else if (e.target.classList.contains('dl')) download(f);
      else cmd('open', { id: f.id });
    };
    box.appendChild(d);
  });
}

// كل ملف ينحذف من الشاشة لحاله بعد ٢٤ ساعة من وصوله
function leftText(f) {
  var m = Math.max(0, Math.round((f.expAt - Date.now()) / 60000));
  if (m >= 60) return 'ينحذف بعد ' + ar(Math.ceil(m / 60)) + ' س';
  return m ? 'ينحذف بعد ' + ar(m) + ' د' : 'ينحذف الحين';
}
setInterval(function () { if (files.length && !$('main').hidden) renderList(); }, 60000);

function renderCtl() {
  $('ctl').hidden = !cur;
  $('gest').style.opacity = cur ? 1 : 0;
  if (!cur) { $('idle').hidden = false; if (pen) setPen(false); return; }
  var pdf = cur.kind === 'pdf', vid = cur.kind === 'video', sheet = cur.kind === 'sheet';
  $('r-ink').hidden = vid;
  if (vid && pen) setPen(false);
  $('pg').textContent = pdf ? ar(cur.page) + ' / ' + ar(cur.pages) :
    sheet && cur.pages > 1 ? 'ورقة ' + ar(cur.page) + ' / ' + ar(cur.pages) : KINDS[cur.kind];
  if (!pen) $('gest').textContent = gestHint();
  $('r-doc').hidden = vid;
  $('r-vid').hidden = !vid;
  $('mode').hidden = !pdf;
  $('mode').textContent = cur.mode === 'doc' ? 'وضع السلايدات' : 'وضع التقرير';
  $('play').textContent = cur.playing ? 'إيقاف' : 'تشغيل';
  $('mute').textContent = cur.muted ? 'صوت' : 'كتم';
}

// ── الأزرار ──
Array.prototype.forEach.call(document.querySelectorAll('#ctl button[data-c]'), function (b) {
  b.addEventListener('click', function () {
    var x = {};
    if (b.dataset.v) x.v = +b.dataset.v;
    if (b.dataset.d) x.d = +b.dataset.d;
    cmd(b.dataset.c, x);
  });
});
$('pg').onclick = function () {
  if (!cur || (cur.kind !== 'pdf' && !(cur.kind === 'sheet' && cur.pages > 1))) return;
  var n = parseInt(String(prompt((cur.kind === 'sheet' ? 'رقم الورقة' : 'رقم الصفحة') + ' (من ١ إلى ' + ar(cur.pages) + ')') || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }), 10);
  if (n) cmd('goto', { page: n });
};
$('clear').onclick = function () { if (confirm('تمسح كل الملفات من الشاشة؟')) cmd('clear'); };

// ── القلم: الرسم على الصورة المصغّرة يطلع على الشاشة ──
var pen = false, penCol = 'red', stroke = null, inkSeq = 0;
var INK = { red: '#e53935', blue: '#1e88e5', yellow: '#ffd400' };
var draft = $('draft'), dg = draft.getContext('2d');

function setPen(on) {
  pen = on;
  $('pen').classList.toggle('on', on);
  $('mirror').classList.toggle('pen', on);
  $('gest').textContent = on ? 'ارسم بإصبعك على الصورة · «تراجع» يمسح آخر خط' : gestHint();
}
function gestHint() {
  return cur && cur.kind === 'sheet' ? 'اضغط على صف عشان يتلوّن على الشاشة · اسحب للتمرير · يمين ويسار للأوراق' :
    'اسحب يمين ويسار للتقليب · فوق وتحت للتمرير · اضغط مطوّل للمؤشر';
}
$('pen').onclick = function () { setPen(!pen); };
Array.prototype.forEach.call(document.querySelectorAll('#r-ink .col'), function (b) {
  b.onclick = function () {
    penCol = b.dataset.col;
    Array.prototype.forEach.call(document.querySelectorAll('#r-ink .col'), function (x) { x.classList.toggle('on', x === b); });
    setPen(true);
  };
});

function inkStart(p) {
  var r = $('mirror').getBoundingClientRect(), k = devicePixelRatio || 1;
  draft.width = Math.round(r.width * k); draft.height = Math.round(r.height * k);
  dg.setTransform(k, 0, 0, k, 0, 0);
  dg.lineCap = dg.lineJoin = 'round';
  dg.lineWidth = 3;
  dg.strokeStyle = INK[penCol];
  stroke = { id: Date.now().toString(36) + (inkSeq++), w: r.width, h: r.height, last: p, buf: [], timer: null };
  inkPush(p);
}

function inkMove(p) {
  var s = stroke;
  dg.beginPath();
  dg.moveTo(s.last.x * s.w, s.last.y * s.h);
  dg.lineTo(p.x * s.w, p.y * s.h);
  dg.stroke();
  s.last = p;
  inkPush(p);
}

function inkPush(p) {
  var s = stroke;
  s.buf.push(Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4);
  if (!s.timer) s.timer = setTimeout(function () { inkFlush(s); }, 40);
}

function inkFlush(s) {
  clearTimeout(s.timer);
  s.timer = null;
  if (s.buf.length) cmd('ink', { s: s.id, col: penCol, p: s.buf });
  s.buf = [];
}

function inkEnd() {
  inkFlush(stroke);
  stroke = null;
}

// ── اللمس على الصورة المصغّرة: سحب = تقليب/تمرير، ضغط مطوّل = مؤشر، نقرة = نقطة ──
(function () {
  var m = $('mirror'), s = null, acc = { x: 0, y: 0 }, flush = null;
  function rel(e) { var r = m.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, k: 1920 / r.width }; }
  m.addEventListener('pointerdown', function (e) {
    if (!cur) return;
    m.setPointerCapture(e.pointerId);
    if (pen) { inkStart(rel(e)); return; }
    var p = rel(e);
    s = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: Date.now(), moved: false, laser: false, k: p.k };
    s.timer = setTimeout(function () {
      if (s && !s.moved) { s.laser = true; if (navigator.vibrate) navigator.vibrate(15); cmd('point', { x: p.x, y: p.y }); }
    }, 350);
  });
  m.addEventListener('pointermove', function (e) {
    if (stroke) { inkMove(rel(e)); return; }
    if (!s) return;
    var dx = e.clientX - s.x, dy = e.clientY - s.y;
    s.x = e.clientX; s.y = e.clientY;
    if (s.laser) { var p = rel(e); throttlePoint(p.x, p.y); return; }
    if (Math.abs(e.clientX - s.x0) + Math.abs(e.clientY - s.y0) > 10) { s.moved = true; clearTimeout(s.timer); }
    if (s.moved && cur && cur.scroll) {
      // المحتوى يمشي مع الإصبع
      acc.x -= dx * s.k; acc.y -= dy * s.k;
      if (!flush) flush = setTimeout(function () {
        cmd('scroll', { dx: Math.round(acc.x), dy: Math.round(acc.y) });
        acc.x = acc.y = 0; flush = null;
      }, 33);
    }
  });
  function end(e) {
    if (stroke) { inkMove(rel(e)); inkEnd(); return; }
    if (!s) return;
    clearTimeout(s.timer);
    var dx = e.clientX - s.x0, dy = e.clientY - s.y0, dt = Date.now() - s.t;
    if (!s.laser && !s.moved && dt < 350) { var p = rel(e); cmd('point', { x: p.x, y: p.y }); }
    else if (!s.laser && dt < 700 && cur && cur.zoom <= 1) {
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) cmd(dx < 0 ? 'next' : 'prev');
      else if (!cur.scroll && Math.abs(dy) > 40) cmd(dy < 0 ? 'next' : 'prev');
    }
    s = null;
  }
  m.addEventListener('pointerup', end);
  m.addEventListener('pointercancel', function () { if (stroke) inkEnd(); if (s) clearTimeout(s.timer); s = null; });
  var lastPt = 0;
  function throttlePoint(x, y) { var n = Date.now(); if (n - lastPt > 40) { lastPt = n; cmd('point', { x: x, y: y }); } }
})();

// ── الإرسال ──
var queue = [], active = null, waitDone = null, seq = 0;
var CHUNK = 64 * 1024;

$('file').addEventListener('change', function (e) {
  var list = Array.prototype.slice.call(e.target.files);
  e.target.value = '';
  list.forEach(function (f) {
    if (/\.(docx?|pptx?|key|pages|numbers)$/i.test(f.name)) {
      say('«' + f.name + '» ما ينعرض كذا. افتحه في تطبيقه وصدّره PDF (مشاركة ← تصدير أو طباعة ← PDF) وأرسله.', 7000);
      return;
    }
    var u = { id: Date.now().toString(36) + (seq++), file: f, name: f.name, size: f.size, type: f.type, sent: 0, acked: 0, state: 'wait' };
    queue.push(u);
    drawUp(u);
  });
  pumpQueue();
});

function upById(id) { return queue.concat(active ? [active] : []).filter(function (u) { return u.id === id; })[0] || findDom(id); }
function findDom(id) { return doneUps[id] || null; }
var doneUps = {};

function drawUp(u) {
  var el = $('up-' + u.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'up';
    el.id = 'up-' + u.id;
    el.innerHTML = '<div class="t"><span></span><span></span></div><div class="bar"><i></i></div>';
    el.onclick = function () { if (u.state === 'err') { u.state = 'wait'; u.sent = u.acked = 0; queue.push(u); drawUp(u); pumpQueue(); } };
    $('uploads').appendChild(el);
  }
  el.className = 'up' + (u.state === 'err' ? ' err' : '');
  el.querySelector('.t span').textContent = u.name;
  var pct = u.size ? Math.floor(u.acked / u.size * 100) : 100;
  el.querySelector('.t span:last-child').textContent =
    u.state === 'wait' ? 'بالانتظار' : u.state === 'prep' ? 'يجهّز…' : u.state === 'done' ? 'وصل ✓' :
    u.state === 'err' ? 'ما وصل · اضغط لإعادة الإرسال' : ar(pct) + '٪';
  el.querySelector('.bar i').style.width = (u.state === 'done' ? 100 : pct) + '%';
}
function removeUp(u) { var el = $('up-' + u.id); if (el) el.remove(); delete doneUps[u.id]; }

function failActive() {
  if (!active) return;
  active.state = 'err';
  drawUp(active);
  active = null;
  if (waitDone) { waitDone(); waitDone = null; }
}

function pumpQueue() {
  if (active || !queue.length || !conn || !conn.open) return;
  active = queue.shift();
  var u = active;
  u.state = 'prep';
  drawUp(u);
  prepare(u).then(function () { return sendFile(u); }).then(function () {
    doneUps[u.id] = u;
    if (active === u) active = null;
    pumpQueue();
  }).catch(function () {
    if (active === u) { u.state = 'err'; drawUp(u); active = null; }
    pumpQueue();
  });
}

// صور الآيفون (HEIC) والصور الضخمة نحوّلها JPEG بحجم يناسب الشاشة
function prepare(u) {
  var heic = /hei[cf]/i.test(u.type) || /\.hei[cf]$/i.test(u.name);
  if (!/^image\//.test(u.type) && !heic) return Promise.resolve();
  if (!heic && u.size < 6e6) return Promise.resolve();
  return new Promise(function (ok) {
    var img = new Image(), url = URL.createObjectURL(u.file);
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 3840 / Math.max(w, h));
      if (!heic && k === 1) { URL.revokeObjectURL(url); ok(); return; }
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function (b) {
        if (b) { u.file = b; u.size = b.size; u.type = 'image/jpeg'; u.name = u.name.replace(/\.[^.]+$/, '') + '.jpg'; }
        ok();
      }, 'image/jpeg', .9);
    };
    img.onerror = function () { URL.revokeObjectURL(url); ok(); };
    img.src = url;
  });
}

async function sendFile(u) {
  var c = conn;
  u.state = 'send';
  drawUp(u);
  var done = new Promise(function (ok) { waitDone = ok; });
  send({ t: 'file', id: u.id, name: u.name, type: u.type || '', size: u.size });
  for (var off = 0; off < u.size;) {
    if (active !== u || !c.open) throw new Error('closed');
    // ما نعبّي الطابور أكثر من ٢ ميقا عشان الذاكرة والتقدّم يكون صادق
    if (c.dataChannel && c.dataChannel.bufferedAmount > 2 * 1024 * 1024) { await sleep(20); continue; }
    var buf = await u.file.slice(off, off + CHUNK).arrayBuffer();
    if (active !== u || !c.open) throw new Error('closed');
    c.send(buf);
    off += buf.byteLength;
    u.sent = off;
  }
  await done;
  if (u.state !== 'done') throw new Error('lost');
}

var msgTimer;
function say(t, ms) {
  var m = $('msg');
  m.textContent = t;
  m.hidden = false;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(function () { m.hidden = true; }, ms || 4000);
}

renderList();
start();

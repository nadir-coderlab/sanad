// «مكتب الخدمات الصحية المساندة» — صفحة الشاشة.
// تعرض باركود، والجوال يتصل فيها مباشرة عبر WebRTC (PeerJS) ويرسل الملفات والأوامر.
// الملفات تنحفظ في ذاكرة الشاشة بس، وتنمسح لما يتقفل التطبيق.
'use strict';

var BASE = 'https://nadir-coderlab.github.io/sanad/';
var W = 1920, H = 1080;
var KINDS = { pdf: 'PDF', image: 'صورة', video: 'فيديو', sheet: 'Excel' };
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

function $(id) { return document.getElementById(id); }
function ar(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
var root = $('root'), stage = $('stage'), pagesEl = $('pages'), scale = 1;

function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  root.style.transform = 'scale(' + scale + ')';
}
fit();
addEventListener('resize', function () { fit(); if (cur) layout(true); });

// ── رقم الشاشة والباركود ──
var params = new URLSearchParams(location.search);
var sid = params.get('id') || localStorage.getItem('sanad-id');
if (!sid) {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)];
  sid = s;
}
localStorage.setItem('sanad-id', sid);
var phoneBase = /^https?:$/.test(location.protocol) ? location.href.replace(/tv\.html.*$/, '') : BASE;
var phoneUrl = phoneBase + '#' + sid;
(function () {
  var q = qrcode(0, 'M');
  q.addData(phoneUrl);
  q.make();
  $('qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  $('url').textContent = phoneUrl.replace(/^https?:\/\//, '');
})();

function clock() {
  var d = new Date();
  $('clock').textContent = d.toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long' }) + '  ·  ' +
    d.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
}
clock(); setInterval(clock, 20000);

// ── الاتصال ──
var peer = null, conns = [], online = false, restarting = false;

function setStatus(cls, text) {
  var el = $('status');
  el.className = cls;
  el.lastChild.textContent = text;
}
function updateStatus() {
  if (!online) return;
  setStatus('ok', conns.length ? 'متصل: ' + ar(conns.length) + (conns.length === 1 ? ' جهاز' : ' أجهزة') : 'جاهزة · بانتظار هاتفك');
}

function startPeer() {
  restarting = false;
  online = false;
  setStatus('', 'جارٍ الاتصال…');
  peer = new Peer('sanad-' + sid, { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
  peer.on('open', function () { online = true; updateStatus(); });
  peer.on('connection', onConn);
  peer.on('disconnected', function () {
    online = false;
    setStatus('bad', 'انقطع الاتصال، جارٍ إعادة المحاولة…');
    setTimeout(function () { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000);
  });
  peer.on('error', function (e) {
    if (e.type === 'peer-unavailable') return;
    online = false;
    setStatus('bad', e.type === 'unavailable-id' ? 'جارٍ تجهيز الاتصال…' : 'لا يوجد اتصال بالإنترنت، جارٍ إعادة المحاولة…');
    restart(e.type === 'unavailable-id' ? 6000 : 4000);
  });
}
function restart(ms) {
  if (restarting) return;
  restarting = true;
  try { peer.destroy(); } catch (e) {}
  setTimeout(startPeer, ms);
}
// احتياط: لو علق الاتصال لأي سبب
setInterval(function () {
  if (!peer || restarting) return;
  if (peer.destroyed) startPeer();
  else if (peer.disconnected) peer.reconnect();
}, 30000);

// ── الرقم السري ──
// أي جوال يتصل لازم يرسل الرقم الصحيح قبل ما يشوف أي ملف أو يتحكم بشي.
// الرقم محفوظ في الشاشة (الافتراضي 1234)، ويتغيّر من جوال داخل بالرقم الحالي.
// وصاحبها يقدر يلغيه من الجوال: الرقم الفاضي = الدخول مفتوح لأي أحد يصوّر الباركود.
var savedPin = localStorage.getItem('sanad-pin');
var pin = savedPin === null ? '1234' : savedPin;
// رمز الإدارة: هو آخر رقم سري حطّه صاحب الشاشة، ويبقى حتى لو انلغى الرقم السري.
// تغيير الرقم أو إلغاؤه ما يصير إلا به، فاللي داخل بدون رقم ما يقدر يقفلها على صاحبها.
var admin = localStorage.getItem('sanad-admin') || pin || '1234';
var pinFails = 0, pinLockUntil = 0;

function admit(conn) {
  conn.ok = true;
  conns.push(conn);
  updateStatus();
  toast('اتصل ' + (conn.metadata && conn.metadata.dev || 'جهاز'), 2500);
  send(conn, { t: 'pinok', open: !pin });
  send(conn, filesMsg());
  send(conn, stateMsg());
  send(conn, { t: 'thumb', data: lastThumb });
}

function checkPin(conn, m) {
  var now = Date.now();
  if (!pin) { admit(conn); return; }
  if (now < pinLockUntil) { send(conn, { t: 'pinbad', wait: Math.ceil((pinLockUntil - now) / 1000) }); return; }
  if (String(m.pin) === pin) { pinFails = 0; admit(conn); return; }
  // بعد ٥ محاولات غلط يقفل دقيقة
  if (++pinFails >= 5) { pinFails = 0; pinLockUntil = now + 60000; }
  send(conn, { t: 'pinbad', wait: pinLockUntil > now ? 60 : 0 });
}

function setPin(conn, m) {
  var now = Date.now();
  if (now < pinLockUntil) { send(conn, { t: 'pinset', ok: false, wait: Math.ceil((pinLockUntil - now) / 1000) }); return; }
  if (String(m.admin) !== admin) {
    if (++pinFails >= 5) { pinFails = 0; pinLockUntil = now + 60000; }
    send(conn, { t: 'pinset', ok: false, bad: true });
    return;
  }
  pinFails = 0;
  var p = m.off ? '' : String(m.pin || '');
  if (p && !/^\d{4,8}$/.test(p)) { send(conn, { t: 'pinset', ok: false }); return; }
  pin = p;
  if (p) admin = p;
  localStorage.setItem('sanad-pin', pin);
  localStorage.setItem('sanad-admin', admin);
  send(conn, { t: 'pinset', ok: true, open: !pin });
  broadcast({ t: 'pinmode', open: !pin });
  showSteps();
}

// خطوة «اكتب الرقم السري» تختفي من شاشة البداية إذا الدخول مفتوح
function showSteps() {
  var li = document.querySelectorAll('#steps li');
  if (li.length < 3) return;
  li[1].hidden = !pin;
  li[2].querySelector('b').textContent = pin ? '٣' : '٢';
}
showSteps();

function onConn(conn) {
  conn.rx = null;
  conn.ok = false;
  conn.on('open', function () { if (pin) send(conn, { t: 'auth' }); else admit(conn); });
  conn.on('data', function (d) {
    if (typeof d === 'string') {
      var m;
      try { m = JSON.parse(d); } catch (e) { return; }
      if (!conn.ok) { if (m.t === 'pin') checkPin(conn, m); return; }
      onMsg(conn, m);
    } else if (d instanceof ArrayBuffer && conn.ok) onChunk(conn, d);
  });
  function drop() {
    var i = conns.indexOf(conn);
    if (i >= 0) conns.splice(i, 1);
    conn.rx = null;
    conn.tx = null;
    updateStatus();
  }
  conn.on('close', drop);
  conn.on('error', drop);
}

function send(conn, m) { try { if (conn.open) conn.send(JSON.stringify(m)); } catch (e) {} }
function broadcast(m) { var s = JSON.stringify(m); conns.forEach(function (c) { try { if (c.open) c.send(s); } catch (e) {} }); }

function onMsg(conn, m) {
  if (m.t === 'file') {
    conn.rx = { id: m.id, name: m.name, type: m.type, size: m.size, parts: [], got: 0, acked: 0 };
    if (!cur) toast('جارٍ استقبال ملف…');
    if (!m.size) finishRx(conn);
  } else if (m.t === 'cancel') {
    if (conn.rx && conn.rx.id === m.id) { conn.rx = null; if (!cur) toast('أُلغي الإرسال', 2000); }
  } else if (m.t === 'cmd') {
    cmd(m.c, m);
  } else if (m.t === 'get') {
    sendOut(conn, m.id);
  } else if (m.t === 'setpin') {
    setPin(conn, m);
  } else if (m.t === 'admin') {
    // الجوال يتأكد من رمز الإدارة قبل ما يبيّن أزرار الرقم السري
    var now = Date.now();
    if (now < pinLockUntil) { send(conn, { t: 'adminres', ok: false, wait: Math.ceil((pinLockUntil - now) / 1000) }); return; }
    var good = String(m.admin) === admin;
    if (good) pinFails = 0; else if (++pinFails >= 5) { pinFails = 0; pinLockUntil = now + 60000; }
    send(conn, { t: 'adminres', ok: good, open: !pin });
  }
}

// ── تنزيل ملف من الشاشة للجوال ──
var OUT_CHUNK = 64 * 1024;
function sendOut(conn, id) {
  var f = byId(id);
  if (!f) { send(conn, { t: 'nofile', id: id }); return; }
  var tx = conn.tx = { id: id, off: 0 };
  send(conn, { t: 'fileout', id: id, name: f.file, type: f.type, size: f.size });
  function next() {
    if (conn.tx !== tx || !conn.open) return;
    if (tx.off >= f.size) { conn.tx = null; return; }
    // ما نعبّي الطابور أكثر من ٢ ميقا
    var dc = conn.dataChannel;
    if (dc && dc.bufferedAmount > 2 * 1024 * 1024) { setTimeout(next, 20); return; }
    f.blob.slice(tx.off, tx.off + OUT_CHUNK).arrayBuffer().then(function (buf) {
      if (conn.tx !== tx || !conn.open) return;
      try { conn.send(buf); } catch (e) { conn.tx = null; return; }
      tx.off += buf.byteLength;
      next();
    }, function () { conn.tx = null; });
  }
  next();
}

function onChunk(conn, buf) {
  var rx = conn.rx;
  if (!rx) return;
  rx.parts.push(buf);
  rx.got += buf.byteLength;
  if (rx.got - rx.acked >= 262144 || rx.got >= rx.size) {
    rx.acked = rx.got;
    send(conn, { t: 'ack', id: rx.id, got: rx.got });
    if (!cur) toast('جارٍ استقبال ملف…  ' + ar(Math.floor(rx.got / rx.size * 100)) + '٪');
  }
  if (rx.got >= rx.size) finishRx(conn);
}

function finishRx(conn) {
  var rx = conn.rx;
  conn.rx = null;
  var blob = new Blob(rx.parts, { type: rx.type });
  send(conn, { t: 'done', id: rx.id });
  addFile(rx.id, rx.name, rx.type, blob);
}

// ── الملفات ──
var files = [], focusIdx = 0;
var MAX_BYTES = 450 * 1024 * 1024;

function kindOf(name, type) {
  if (/pdf/.test(type) || /\.pdf$/i.test(name)) return 'pdf';
  if (/^image\//.test(type) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) return 'image';
  if (/^video\//.test(type) || /\.(mp4|mov|m4v|webm)$/i.test(name)) return 'video';
  if (/spreadsheet|ms-excel|text\/csv/.test(type) || /\.(xlsx|xlsm|xls|xlsb|csv|ods)$/i.test(name)) return 'sheet';
  return null;
}
function byId(id) { for (var i = 0; i < files.length; i++) if (files[i].id === id) return files[i]; return null; }

function addFile(id, name, type, blob) {
  var kind = kindOf(name, type);
  if (!kind) { hideToast(); broadcast({ t: 'say', text: 'هذا النوع لا يمكن عرضه: ' + name }); return; }
  if (byId(id)) removeFile(id);
  var f = { id: id, name: name.replace(/\.[^.]+$/, ''), file: name, type: type || blob.type, kind: kind, size: blob.size, blob: blob, added: Date.now(),
            url: URL.createObjectURL(blob), pages: 1, thumb: '', last: 1 };
  var ready;
  if (kind === 'pdf') ready = loadPdf(f);
  else if (kind === 'sheet') ready = loadSheet(f);
  else if (kind === 'image') ready = loadImage(f);
  else ready = loadVideo(f);
  ready.then(function () {
    files.push(f);
    trim();
    hideToast();
    renderShelf();
    broadcast(filesMsg());
    // ما يفتح لحاله: صاحب الجوال يختار وش يطلع على الشاشة
  }).catch(function (e) {
    URL.revokeObjectURL(f.url);
    hideToast();
    broadcast({ t: 'say', text: e && e.name === 'PasswordException' ? 'الملف محمي بكلمة مرور: ' + f.name : 'تعذّر فتح الملف: ' + f.name });
  });
}

// كل ملف ينحذف لحاله بعد ٢٤ ساعة من وصوله، حتى لو الشاشة ما انطفت
var FILE_TTL = 24 * 3600 * 1000;
function fileLeft(f) { return Math.max(0, f.added + FILE_TTL - Date.now()); }
function expireFiles() {
  var old = files.filter(function (f) { return !fileLeft(f); });
  if (!old.length) return;
  old.forEach(function (f) { removeFile(f.id, true); });
  renderShelf();
  broadcast(filesMsg());
}
setInterval(expireFiles, 60000);

// لو امتلت الذاكرة نمسح الأقدم
function trim() {
  var total = files.reduce(function (a, f) { return a + f.size; }, 0);
  while (total > MAX_BYTES && files.length > 1) {
    var old = files[0];
    if (cur && cur.f === old) break;
    total -= old.size;
    removeFile(old.id, true);
  }
}

function removeFile(id, quiet) {
  var f = byId(id);
  if (!f) return;
  if (cur && cur.f === f) goHome();
  files.splice(files.indexOf(f), 1);
  URL.revokeObjectURL(f.url);
  if (f.doc) f.doc.destroy();
  focusIdx = Math.min(focusIdx, Math.max(0, files.length - 1));
  if (!quiet) { renderShelf(); broadcast(filesMsg()); }
}

function loadPdf(f) {
  return f.blob.arrayBuffer().then(function (buf) {
    return pdfjsLib.getDocument({ data: new Uint8Array(buf), cMapUrl: 'vendor/pdfjs/cmaps/', cMapPacked: true,
      standardFontDataUrl: 'vendor/pdfjs/standard_fonts/' }).promise;
  }).then(function (doc) {
    f.doc = doc;
    f.pages = doc.numPages;
    f.sizes = [];
    var n = Math.min(doc.numPages, 400), jobs = [];
    for (var i = 1; i <= n; i++) jobs.push(doc.getPage(i).then(function (p) {
      var v = p.getViewport({ scale: 1 });
      f.sizes[p.pageNumber - 1] = v.width / v.height;
    }));
    return Promise.all(jobs);
  }).then(function () {
    f.ratio = f.sizes[0] || 0.707;
    for (var i = 0; i < f.pages; i++) if (!f.sizes[i]) f.sizes[i] = f.ratio;
    // الصفحات العرضية = سلايدات (يمين ويسار)، والطولية = تقرير (فوق وتحت)
    f.mode = f.ratio > 1.05 ? 'slides' : 'doc';
    return renderPage(f, 1, 320).then(function (cv) { f.thumb = cv.toDataURL('image/jpeg', .7); });
  });
}

// ── ملفات Excel و CSV: تنعرض مثل ما تنفتح على كمبيوتر ──
// حروف الأعمدة وأرقام الصفوف، والخلايا المدموجة، وعرض الأعمدة وألوان الخلايا من الملف،
// وتبويبات الأوراق تحت، وشريط فوق يبيّن الخلية المختارة. والماوس من الجوال يختار ويتنقّل.
var SHEET_MAX_ROWS = 3000, SHEET_MAX_COLS = 150, XL_K = 1.6;   // XL_K: تكبير الإكسل على التلفزيون (١٦٠٪)

function loadSheet(f) {
  return f.blob.arrayBuffer().then(function (buf) {
    f.book = XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
    f.grids = [];
    f.pages = f.book.SheetNames.length || 1;
    f.ratio = 16 / 9;
    var g = sheetGrid(f, 0);
    if (!g.nr && f.pages === 1) throw new Error('empty');
    f.thumb = sheetThumb(g);
  });
}

function colName(c) { var s = ''; c++; while (c) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }

function sheetGrid(f, i) {
  if (f.grids[i]) return f.grids[i];
  var name = f.book.SheetNames[i], ws = f.book.Sheets[name] || {};
  var keys = Object.keys(ws).filter(function (k) { return k[0] !== '!'; });
  // آخر صف وعمود فيهم شي (بعض الملفات تعلن نطاق غلط)
  var lr = -1, lc = -1;
  keys.forEach(function (k) {
    var cell = ws[k]; if (cell == null || (cell.v == null && cell.w == null) || String(cell.w != null ? cell.w : cell.v).trim() === '') return;
    var p = XLSX.utils.decode_cell(k); if (p.r > lr) lr = p.r; if (p.c > lc) lc = p.c;
  });
  (ws['!merges'] || []).forEach(function (m) { if (m.e.r > lr && m.s.r <= lr) lr = m.e.r; if (m.e.c > lc && m.s.c <= lc) lc = m.e.c; });
  var nr = Math.min(lr + 1, SHEET_MAX_ROWS), nc = Math.min(lc + 1, SHEET_MAX_COLS);
  var cells = [], sample = '';
  for (var r = 0; r < nr; r++) {
    var row = [];
    for (var c = 0; c < nc; c++) {
      var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })], o = { v: '' };
      if (cell) {
        o.v = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : '';
        o.num = cell.t === 'n';
        var st = cell.s;
        if (st && st.fgColor && st.fgColor.rgb && st.patternType && st.patternType !== 'none') {
          var rgb = String(st.fgColor.rgb); if (rgb.length === 8) rgb = rgb.slice(2);
          if (/^[0-9a-f]{6}$/i.test(rgb) && rgb.toUpperCase() !== 'FFFFFF') {
            o.bg = '#' + rgb;
            // لون الخط ما يوصلنا من الملف، فعلى الخلفيات الغامقة نخليه أبيض (مثل اللي غالبًا في الإكسل)
            var n = parseInt(rgb, 16), lum = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
            if (lum < 0.5) o.fg = '#fff';
          }
        }
      }
      if (r < 80 && o.v) sample += o.v + ' ';
      row.push(o);
    }
    cells.push(row);
  }
  (ws['!merges'] || []).forEach(function (m) {
    if (m.s.r >= nr || m.s.c >= nc) return;
    var top = cells[m.s.r][m.s.c];
    top.rs = Math.min(m.e.r, nr - 1) - m.s.r + 1;
    top.cs = Math.min(m.e.c, nc - 1) - m.s.c + 1;
    for (var r = m.s.r; r <= Math.min(m.e.r, nr - 1); r++)
      for (var c = m.s.c; c <= Math.min(m.e.c, nc - 1); c++) if (r !== m.s.r || c !== m.s.c) cells[r][c].hide = true;
  });
  // عرض الأعمدة وارتفاع الصفوف بالبكسل (مثل الإكسل على ١٠٠٪)
  var cols = ws['!cols'] || [], rowsI = ws['!rows'] || [], widths = [], heights = [];
  for (var c = 0; c < nc; c++) {
    var ci = cols[c] || {};
    // بمعادلة الإكسل (عرض الحرف ٧ بكسل لخط Calibri 11)؛ wpx من المكتبة يتغيّر من ملف لملف فما نعتمد عليه
    widths.push(ci.hidden ? 0 : Math.round(ci.width ? ci.width * 7 : ci.wch ? ci.wch * 7 + 5 : ci.wpx || 64));
  }
  for (var r = 0; r < nr; r++) { var ri = rowsI[r] || {}; heights.push(ri.hidden ? 0 : Math.round(ri.hpt ? ri.hpt * 4 / 3 : ri.hpx || 20)); }
  // الاتجاه: من إعداد الملف لو موجود، وإلا من اللغة الغالبة
  var views = (f.book.Workbook && f.book.Workbook.Views) || [], rtl;
  if (ws['!views'] && ws['!views'][0] && ws['!views'][0].RTL != null) rtl = !!ws['!views'][0].RTL;
  else if (views[0] && views[0].RTL != null) rtl = !!views[0].RTL;
  else rtl = (sample.match(/[؀-ۿ]/g) || []).length >= (sample.match(/[A-Za-z]/g) || []).length;
  return (f.grids[i] = { name: name, cells: cells, nr: nr, nc: nc, widths: widths, heights: heights, rtl: rtl,
    more: Math.max(0, lr + 1 - nr), sel: { r: 0, c: 0 } });
}

function sheetThumb(g) {
  var c = document.createElement('canvas'), cw = 320, ch = 180;
  c.width = cw; c.height = ch;
  var x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
  var rh = 18, hw = 22, nc = Math.max(1, Math.min(g.nc, 5)), colW = (cw - hw) / nc;
  x.font = '10px sans-serif'; x.textBaseline = 'middle'; x.direction = g.rtl ? 'rtl' : 'ltr';
  for (var r = -1; r < Math.min(g.nr, 9); r++) {
    for (var ci = -1; ci < nc; ci++) {
      var w = ci < 0 ? hw : colW, px = ci < 0 ? (g.rtl ? cw - hw : 0) : g.rtl ? cw - hw - (ci + 1) * colW : hw + ci * colW, py = (r + 1) * rh;
      var head = r < 0 || ci < 0, cell = head ? null : g.cells[r][ci];
      x.fillStyle = head ? '#f3f3f3' : cell.bg || '#fff'; x.fillRect(px, py, w, rh);
      x.strokeStyle = '#d4d4d4'; x.strokeRect(px, py, w, rh);
      var t = r < 0 ? (ci < 0 ? '' : colName(ci)) : ci < 0 ? String(r + 1) : cell.hide ? '' : cell.v;
      if (!t) continue;
      x.fillStyle = head ? '#666' : '#222';
      x.save(); x.beginPath(); x.rect(px + 2, py, w - 4, rh); x.clip();
      x.textAlign = head ? 'center' : g.rtl ? 'right' : 'left';
      x.fillText(t, head ? px + w / 2 : g.rtl ? px + w - 3 : px + 3, py + rh / 2);
      x.restore();
    }
  }
  return c.toDataURL('image/jpeg', .8);
}

// يبني الورقة: جدول بحروف الأعمدة وأرقام الصفوف، ومقاسات الملف مضروبة في التكبير
function buildSheet(g, k) {
  var wrap = document.createElement('div');
  wrap.className = 'xl';
  if (!g.nr) { wrap.innerHTML = '<div class="sheet-empty"></div>'; wrap.firstChild.textContent = 'الورقة «' + g.name + '» فارغة'; return wrap; }
  var t = document.createElement('table');
  t.dir = g.rtl ? 'rtl' : 'ltr';
  var cg = document.createElement('colgroup'), total = Math.round(46 * k);
  cg.innerHTML = '<col style="width:' + Math.round(46 * k) + 'px">';
  g.widths.forEach(function (w) { var px = Math.round(w * k); total += px; cg.insertAdjacentHTML('beforeend', '<col style="width:' + px + 'px">'); });
  t.appendChild(cg);
  t.style.width = total + 'px';
  var head = '<thead><tr><th class="corner"></th>';
  for (var c = 0; c < g.nc; c++) head += '<th class="ch" data-c="' + c + '">' + colName(c) + '</th>';
  t.insertAdjacentHTML('beforeend', head + '</tr></thead>');
  var tb = document.createElement('tbody'), html = '';
  for (var r = 0; r < g.nr; r++) {
    var h = g.heights[r];
    html += '<tr' + (h === 0 ? ' class="hid"' : '') + ' style="height:' + Math.round((h || 20) * k) + 'px"><th class="rh" data-r="' + r + '">' + (r + 1) + '</th>';
    for (var c = 0; c < g.nc; c++) {
      var o = g.cells[r][c];
      if (o.hide) continue;
      html += '<td data-r="' + r + '" data-c="' + c + '"' + (o.rs > 1 ? ' rowspan="' + o.rs + '"' : '') + (o.cs > 1 ? ' colspan="' + o.cs + '"' : '') +
        (o.num ? ' class="n"' : '') + (o.bg ? ' style="background:' + o.bg + (o.fg ? ';color:' + o.fg + ';font-weight:700' : '') + '"' : '') + '>' + escHtml(o.v) + '</td>';
    }
    html += '</tr>';
  }
  tb.innerHTML = html;
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// تبويبات الأوراق تحت، وشريط الخلية المختارة فوق
function drawXlBars(f, g) {
  $('xltabs').innerHTML = '';
  $('xltabs').dir = g.rtl ? 'rtl' : 'ltr';
  f.book.SheetNames.forEach(function (n, i) {
    var b = document.createElement('div');
    b.className = 'tab' + (i === cur.page - 1 ? ' on' : '');
    b.dataset.sheet = i + 1;
    b.textContent = n;
    $('xltabs').appendChild(b);
  });
  showSel(g, false);
}

function selCell(g) { return pagesEl.querySelector('td[data-r="' + g.sel.r + '"][data-c="' + g.sel.c + '"]'); }

function showSel(g, scrollTo) {
  Array.prototype.forEach.call(pagesEl.querySelectorAll('.sel, .on'), function (e) { e.classList.remove('sel', 'on'); });
  var td = selCell(g);
  if (!td) return;
  td.classList.add('sel');
  var cs = +td.colSpan || 1, rs = +td.rowSpan || 1, r = g.sel.r, c = g.sel.c;
  for (var i = 0; i < cs; i++) { var ch = pagesEl.querySelector('th.ch[data-c="' + (c + i) + '"]'); if (ch) ch.classList.add('on'); }
  for (var j = 0; j < rs; j++) { var rh = pagesEl.querySelector('th.rh[data-r="' + (r + j) + '"]'); if (rh) rh.classList.add('on'); }
  $('xladdr').textContent = colName(c) + (r + 1) + (cs > 1 || rs > 1 ? ':' + colName(c + cs - 1) + (r + rs) : '');
  $('xlval').textContent = g.cells[r][c].v;
  $('xlval').dir = 'auto';
  if (scrollTo) {
    // نخلي الخلية ظاهرة (تحت الشريط وفوق التبويبات وبعد عمود الأرقام)
    var sr = stage.getBoundingClientRect(), tr = td.getBoundingClientRect();
    var x = (tr.left - sr.left) / scale, y = (tr.top - sr.top) / scale, w = tr.width / scale, h = tr.height / scale;
    var hw = 46 * XL_K * cur.zoom + 10, top = 70 + 40 * cur.zoom, bottom = H - 70;
    var dx = 0, dy = 0;
    if (y < top) dy = y - top; else if (y + h > bottom) dy = Math.min(y - top, y + h - bottom);
    var left = g.rtl ? 20 : hw, right = g.rtl ? W - hw : W - 20;
    if (x < left) dx = x - left; else if (x + w > right) dx = Math.min(x - left, x + w - right);
    stage.scrollLeft += dx; stage.scrollTop += dy;
  }
  scheduleThumb();
}

// الأسهم في الريموت: تتنقّل بين الخلايا (تتخطّى الخلايا المدموجة)
function moveSel(dr, dc) {
  var g = sheetGrid(cur.f, cur.page - 1), r = g.sel.r, c = g.sel.c, top = g.cells[r][c];
  if (dc && g.rtl) dc = -dc;
  if (dr > 0) r += top.rs || 1; else if (dr < 0) r -= 1;
  if (dc > 0) c += top.cs || 1; else if (dc < 0) c -= 1;
  r = Math.max(0, Math.min(g.nr - 1, r)); c = Math.max(0, Math.min(g.nc - 1, c));
  // لو وقعنا داخل خلية مدموجة نروح لأولها
  for (var rr = r; rr >= 0; rr--) for (var cc = c; cc >= 0; cc--) {
    var o = g.cells[rr][cc];
    if (!o.hide && rr + (o.rs || 1) > r && cc + (o.cs || 1) > c) { r = rr; c = cc; rr = -1; break; }
  }
  g.sel = { r: r, c: c };
  showSel(g, true);
}

function loadImage(f) {
  return new Promise(function (ok, bad) {
    var img = new Image();
    img.onload = function () {
      f.ratio = img.naturalWidth / img.naturalHeight;
      f.thumb = smallThumb(img, f.ratio);
      ok();
    };
    img.onerror = bad;
    img.src = f.url;
  });
}

function loadVideo(f) {
  return new Promise(function (ok) {
    var v = document.createElement('video');
    v.muted = true; v.preload = 'auto';
    var done = false;
    function fin() { if (done) return; done = true; try { f.thumb = smallThumb(v, f.ratio); } catch (e) {} ok(); }
    v.onloadedmetadata = function () { f.ratio = (v.videoWidth / v.videoHeight) || 16 / 9; v.currentTime = Math.min(1, v.duration / 3 || 0); };
    v.onseeked = fin;
    v.onerror = function () { f.ratio = 16 / 9; fin(); };
    setTimeout(function () { f.ratio = f.ratio || 16 / 9; fin(); }, 6000);
    v.src = f.url;
  });
}

function smallThumb(el, ratio) {
  var c = document.createElement('canvas');
  c.width = 320; c.height = Math.round(320 / (ratio || 1.6));
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .7);
}

// يرسم صفحة PDF بعرض معيّن (بكسل حقيقي) ويرجع canvas
function renderPage(f, n, px) {
  return f.doc.getPage(n).then(function (p) {
    var v0 = p.getViewport({ scale: 1 });
    var s = px / v0.width;
    if (v0.width * s * v0.height * s > 16e6) s = Math.sqrt(16e6 / (v0.width * v0.height));
    var v = p.getViewport({ scale: s });
    var cv = document.createElement('canvas');
    cv.width = Math.round(v.width); cv.height = Math.round(v.height);
    var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    return p.render({ canvasContext: g, viewport: v }).promise.then(function () { return cv; });
  });
}

function renderShelf() {
  var box = $('files');
  box.innerHTML = '';
  if (!files.length) { box.innerHTML = '<div class="empty">لا توجد ملفات بعد. أرسل أول ملف من هاتفك.</div>'; $('hint').hidden = true; return; }
  $('hint').hidden = false;
  var list = files.slice().reverse();     // الأحدث أول
  focusIdx = Math.max(0, Math.min(focusIdx, list.length - 1));
  var start = Math.max(0, Math.min(focusIdx - 2, list.length - 5));
  list.slice(start, start + 5).forEach(function (f, i) {
    var d = document.createElement('div');
    d.className = 'file' + (start + i === focusIdx ? ' focus' : '');
    d.innerHTML = (f.thumb ? '<img src="' + f.thumb + '">' : '') +
      '<div class="meta"><div class="n"></div><div class="k">' + KINDS[f.kind] +
      (f.kind === 'pdf' ? ' · ' + ar(f.pages) + ' صفحة' : '') + '</div></div>';
    d.querySelector('.n').textContent = f.name;
    box.appendChild(d);
  });
}
renderShelf();

// ── العرض ──
var cur = null;          // { f, page, zoom, mode }
var paintJob = 0;

function showView(on) { $('home').hidden = on; $('view').hidden = !on; }

function openFile(id, page) {
  var f = byId(id);
  if (!f) return;
  stopVideo();
  cur = { f: f, page: Math.min(page || f.last || 1, f.pages), zoom: 1, mode: f.mode || 'slides' };
  showView(true);
  layout(false);
  changed(true);
}

function goHome() {
  if (cur) cur.f.last = cur.page;
  stopVideo();
  cur = null;
  clearInk();
  pagesEl.innerHTML = '';
  showView(false);
  renderShelf();
  changed(true);
}

function stopVideo() {
  var v = pagesEl.querySelector('video');
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
}

// يبني الصفحة حسب النوع والوضع والتكبير. keep = يحافظ على مكان العرض
function layout(keep) {
  var f = cur.f, z = cur.zoom;
  var fx = 0.5, fy = 0;
  if (keep && stage.scrollWidth) {
    fx = (stage.scrollLeft + W / 2) / stage.scrollWidth;
    fy = (stage.scrollTop + H / 2) / stage.scrollHeight;
  }
  paintJob++;
  clearInk();
  pagesEl.innerHTML = '';
  pagesEl.className = '';
  pagesEl.style.cssText = '';

  $('view').classList.toggle('xlmode', f.kind === 'sheet');
  if (f.kind === 'sheet') {
    var g = sheetGrid(f, cur.page - 1), k = XL_K * z;
    pagesEl.className = 'sheet';
    pagesEl.style.fontSize = Math.round(15 * k) + 'px';
    pagesEl.appendChild(buildSheet(g, k));
    if (g.more > 0) {
      var more = document.createElement('div');
      more.className = 'sheet-more';
      more.textContent = 'وتبقّى ' + ar(g.more) + ' صفًّا لم تُعرض (الحد الأقصى ' + ar(SHEET_MAX_ROWS) + ')';
      pagesEl.appendChild(more);
    }
    pagesEl.style.width = Math.max(W, pagesEl.firstChild.offsetWidth) + 'px';
    drawXlBars(f, g);
    if (keep) center(fx, fy);
    else { stage.scrollTop = 0; stage.scrollLeft = g.rtl ? stage.scrollWidth - W : 0; }
    return;
  }

  if (f.kind === 'pdf' && cur.mode === 'doc') {
    var pw = Math.round((W - 200) * z);
    pagesEl.style.width = Math.max(W, pw + 80) + 'px';
    pagesEl.style.padding = '40px 0';
    for (var i = 0; i < f.pages; i++) {
      var pg = document.createElement('div');
      pg.className = 'pg';
      pg.dataset.n = i + 1;
      pg.style.width = pw + 'px';
      pg.style.height = Math.round(pw / f.sizes[i]) + 'px';
      pagesEl.appendChild(pg);
    }
    if (keep) center(fx, fy);
    else { stage.scrollLeft = (stage.scrollWidth - W) / 2; stage.scrollTop = pageTop(cur.page); }
    paintVisible();
    return;
  }

  // سلايد واحد / صورة / فيديو: يملأ الشاشة بدون قص، والتكبير يخليه أكبر
  var ratio = f.kind === 'pdf' ? f.sizes[cur.page - 1] : (f.ratio || 16 / 9);
  var w = Math.min(W, H * ratio) * z, h = w / ratio;
  pagesEl.className = 'slides';
  pagesEl.style.width = Math.max(W, w) + 'px';
  pagesEl.style.height = Math.max(H, h) + 'px';
  var el;
  if (f.kind === 'pdf') {
    el = document.createElement('div');
    el.className = 'pg';
    el.dataset.n = cur.page;
  } else if (f.kind === 'image') {
    el = document.createElement('img');
    el.className = 'media';
    el.src = f.url;
  } else {
    el = document.createElement('video');
    el.className = 'media';
    el.src = f.url;
    el.playsInline = true;
    el.autoplay = true;
    el.onplay = el.onpause = el.onended = function () { changed(); };
    el.ontimeupdate = throttle(function () { changed(); }, 1000);
  }
  el.style.width = Math.round(w) + 'px';
  el.style.height = Math.round(h) + 'px';
  el.style.position = 'absolute';
  el.style.left = Math.round((Math.max(W, w) - w) / 2) + 'px';
  el.style.top = Math.round((Math.max(H, h) - h) / 2) + 'px';
  pagesEl.appendChild(el);
  center(keep ? fx : 0.5, keep ? fy : 0.5);
  if (f.kind === 'pdf') { paintVisible(); prefetch(); }
}

function center(fx, fy) {
  stage.scrollLeft = fx * stage.scrollWidth - W / 2;
  stage.scrollTop = fy * stage.scrollHeight - H / 2;
}

function pageTop(n) {
  var pg = pagesEl.children[n - 1];
  return pg ? Math.max(0, pg.offsetTop - 40) : 0;
}

// يرسم الصفحات اللي قدام العين أول، ويفضّي البعيدة من الذاكرة
var painting = false;
function paintVisible() {
  if (!cur || cur.f.kind !== 'pdf') return;
  var job = paintJob, f = cur.f;
  var top = stage.scrollTop, mid = top + H / 2;
  var want = [];
  Array.prototype.forEach.call(pagesEl.children, function (pg) {
    var a = pg.offsetTop, b = a + pg.offsetHeight;
    var dist = b < mid ? mid - b : a > mid ? a - mid : 0;
    if (dist < H * 1.5) want.push({ pg: pg, d: dist });
    else if (dist > H * 4 && pg.firstChild) { pg.innerHTML = ''; delete pg.dataset.r; }
  });
  want.sort(function (x, y) { return x.d - y.d; });
  var todo = want.filter(function (w) { return w.pg.dataset.r !== String(w.pg.offsetWidth); });
  if (!todo.length || painting) return;
  painting = true;
  var pg = todo[0].pg, n = +pg.dataset.n, px = pg.offsetWidth;
  var cached = cache.get(f.id + ':' + n + ':' + px);
  (cached ? Promise.resolve(cached) : renderPage(f, n, px * scale * (devicePixelRatio || 1))).then(function (cv) {
    painting = false;
    if (job !== paintJob) { paintVisible(); return; }
    pg.innerHTML = '';
    pg.appendChild(cv);
    pg.dataset.r = String(px);
    scheduleThumb();
    paintVisible();
  }, function () { painting = false; });
}

// في السلايدات: يجهّز التالي والسابق عشان التقليب يكون فوري
var cache = new Map();
function prefetch() {
  if (!cur || cur.f.kind !== 'pdf' || cur.mode !== 'slides' || cur.zoom !== 1) return;
  var f = cur.f, job = paintJob;
  [cur.page + 1, cur.page - 1].forEach(function (n) {
    if (n < 1 || n > f.pages) return;
    var r = f.sizes[n - 1], w = Math.round(Math.min(W, H * r));
    var key = f.id + ':' + n + ':' + w;
    if (cache.has(key)) return;
    setTimeout(function () {
      if (job !== paintJob || painting) return;
      renderPage(f, n, w * scale * (devicePixelRatio || 1)).then(function (cv) {
        cache.set(key, cv);
        if (cache.size > 6) cache.delete(cache.keys().next().value);
      });
    }, 400);
  });
}

stage.addEventListener('scroll', function () { if (strokes.length) drawInk(); });
stage.addEventListener('scroll', throttle(function () {
  if (!cur) return;
  if (cur.f.kind === 'pdf' && cur.mode === 'doc') {
    var probe = stage.scrollTop + H * 0.35, n = 1;
    for (var i = 0; i < pagesEl.children.length; i++) {
      if (pagesEl.children[i].offsetTop <= probe) n = i + 1; else break;
    }
    if (n !== cur.page) { cur.page = n; showHud(); }
    paintVisible();
  }
  changed();
}, 120));

function gotoPage(n) {
  var f = cur.f;
  n = Math.max(1, Math.min(f.pages, n));
  if (cur.mode === 'doc') { cur.page = n; smoothTo(stage.scrollLeft, pageTop(n)); }
  else if (n !== cur.page) { cur.page = n; layout(false); }
  changed(true);
}

function step(d) {
  if (!cur) return;
  var f = cur.f;
  if (f.kind === 'pdf' || f.kind === 'sheet') {
    // في الإكسل: التالي والسابق = الورقة اللي بعدها وقبلها
    var n = cur.page + d;
    if (n < 1 || n > f.pages) { showHud(); return; }
    gotoPage(n);
  } else {
    // الصور والفيديو: ما ننتقل لملف ثاني من هنا، عشان ما يطلع شي ما اختاره صاحبه من الجوال
    showHud();
  }
}

function canScroll() { return stage.scrollHeight > H + 2 || stage.scrollWidth > W + 2; }

function nudge(d) {
  if (!cur) return;
  if (canScroll()) smoothTo(stage.scrollLeft, stage.scrollTop + d * H * 0.6);
  else step(d);
}

function setZoom(v) {
  if (!cur || cur.f.kind === 'video') return;
  var z = v ? cur.zoom * v : 1;
  z = Math.max(0.5, Math.min(4, z));
  if (Math.abs(z - 1) < 0.06) z = 1;
  if (z === cur.zoom) { showHud(); return; }
  cur.zoom = z;
  layout(true);
  changed(true);
}

var anim = 0;
function smoothTo(x, y) {
  var x0 = stage.scrollLeft, y0 = stage.scrollTop, t0 = performance.now(), id = ++anim;
  function f(t) {
    if (id !== anim) return;
    var k = Math.min(1, (t - t0) / 260), e = 1 - Math.pow(1 - k, 3);
    stage.scrollLeft = x0 + (x - x0) * e;
    stage.scrollTop = y0 + (y - y0) * e;
    if (k < 1) requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}

// ── الأوامر (من الجوال أو الريموت) ──
function cmd(c, a) {
  a = a || {};
  var v = pagesEl.querySelector('video');
  switch (c) {
    case 'open': openFile(a.id, a.page); break;
    case 'home': if (cur) goHome(); break;
    case 'next': step(1); break;
    case 'prev': step(-1); break;
    case 'up': nudge(-1); break;
    case 'down': nudge(1); break;
    case 'scroll':
      if (cur) { anim++; stage.scrollLeft += a.dx || 0; stage.scrollTop += a.dy || 0; }
      break;
    case 'zoom': setZoom(a.v); break;
    case 'goto': if (cur && (cur.f.kind === 'pdf' || cur.f.kind === 'sheet')) gotoPage(a.page); break;
    case 'mode':
      if (cur && cur.f.kind === 'pdf') {
        cur.mode = cur.f.mode = cur.mode === 'doc' ? 'slides' : 'doc';
        cur.zoom = 1;
        layout(false);
        changed(true);
      }
      break;
    case 'point': point(a.x, a.y); break;
    case 'mouse': mouseMove(a.dx || 0, a.dy || 0); break;
    case 'click': mouseClick(); break;
    case 'ink': ink(a); break;
    case 'undo': if (strokes.length) { strokes.pop(); drawInk(); scheduleThumb(); } break;
    case 'inkclear': clearInk(); scheduleThumb(); break;
    case 'play': if (v) { if (v.paused) v.play(); else v.pause(); } break;
    case 'seek': if (v) v.currentTime = Math.max(0, v.currentTime + (a.d || 0)); break;
    case 'mute': if (v) { v.muted = !v.muted; changed(); } break;
    case 'delete': removeFile(a.id); break;
    case 'clear': files.slice().forEach(function (f) { removeFile(f.id, true); }); renderShelf(); broadcast(filesMsg()); break;
  }
}

// في الإكسل: الضغط على صف من الجوال يلوّنه على الشاشة، والضغط عليه مرة ثانية يشيل اللون
// يختار الخلية (أو التبويب) اللي تحت نقطة على الشاشة
function clickAt(x, y) {
  var el = document.elementFromPoint(x * scale, y * scale);
  if (!el || !cur) return false;
  var tab = el.closest && el.closest('#xltabs .tab');
  if (tab) { gotoPage(+tab.dataset.sheet); return true; }
  var td = el.closest && el.closest('#pages.sheet td');
  if (td) { var g = sheetGrid(cur.f, cur.page - 1); g.sel = { r: +td.dataset.r, c: +td.dataset.c }; showSel(g, false); return true; }
  return false;
}

// ── الرسم على الملف ──
// الخطوط تنحفظ بإحداثيات المحتوى (مو الشاشة)، عشان تمشي مع الصفحة وقت التمرير.
// وتنمسح لما تتغيّر الصفحة أو التكبير أو الوضع.
var inkEl = $('ink'), inkG = inkEl.getContext('2d'), strokes = [];
var INK = { red: '#e53935', blue: '#1e88e5', yellow: '#ffd400' };

function ink(a) {
  if (!cur || !a.p || !a.p.length) return;
  var s = null;
  for (var i = strokes.length - 1; i >= 0; i--) if (strokes[i].id === a.s) { s = strokes[i]; break; }
  if (!s) { s = { id: a.s, c: INK[a.col] || INK.red, pts: [] }; strokes.push(s); }
  for (var j = 0; j + 1 < a.p.length; j += 2) {
    s.pts.push(stage.scrollLeft + a.p[j] * W, stage.scrollTop + a.p[j + 1] * H);
  }
  drawInk();
  scheduleThumb();
}

function drawInk() {
  inkG.clearRect(0, 0, W, H);
  var ox = stage.scrollLeft, oy = stage.scrollTop;
  inkG.lineCap = inkG.lineJoin = 'round';
  inkG.lineWidth = 7;
  strokes.forEach(function (s) {
    var p = s.pts;
    if (!p.length) return;
    inkG.strokeStyle = s.c;
    inkG.beginPath();
    inkG.moveTo(p[0] - ox, p[1] - oy);
    if (p.length === 2) inkG.lineTo(p[0] - ox + .1, p[1] - oy);
    for (var i = 2; i < p.length; i += 2) inkG.lineTo(p[i] - ox, p[i + 1] - oy);
    inkG.stroke();
  });
}

function clearInk() {
  if (!strokes.length) return;
  strokes = [];
  drawInk();
}

// ── الماوس: الجوال يحرّك مؤشر على الشاشة، والنقرة تختار ──
var mouse = { x: W / 2, y: H / 2 }, mouseTimer;
function mouseMove(dx, dy) {
  if (!cur) return;
  var m = $('cursor');
  mouse.x += dx; mouse.y += dy;
  // لو وصل الطرف، المحتوى يمشي مع المؤشر
  var ox = 0, oy = 0;
  if (mouse.x < 0) { ox = mouse.x; mouse.x = 0; } else if (mouse.x > W - 4) { ox = mouse.x - (W - 4); mouse.x = W - 4; }
  if (mouse.y < 0) { oy = mouse.y; mouse.y = 0; } else if (mouse.y > H - 4) { oy = mouse.y - (H - 4); mouse.y = H - 4; }
  if (ox || oy) { anim++; stage.scrollLeft += ox * 2; stage.scrollTop += oy * 2; }
  m.style.transform = 'translate(' + mouse.x + 'px,' + mouse.y + 'px)';
  m.classList.add('on');
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(function () { m.classList.remove('on'); }, 6000);
  // تمييز اللي تحت المؤشر
  var el = document.elementFromPoint(mouse.x * scale, mouse.y * scale), hv = pagesEl.querySelector('.hv');
  if (hv) hv.classList.remove('hv');
  var t = el && el.closest && el.closest('#pages.sheet td, #xltabs .tab');
  if (t) t.classList.add('hv');
  scheduleThumb();
}
function mouseClick() {
  if (!cur) return;
  var m = $('cursor');
  m.classList.add('on', 'click');
  setTimeout(function () { m.classList.remove('click'); }, 200);
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(function () { m.classList.remove('on'); }, 6000);
  if (!clickAt(mouse.x, mouse.y)) point(mouse.x / W, mouse.y / H);
}

var dotTimer;
function point(x, y) {
  if (cur && cur.f.kind === 'sheet' && clickAt(x * W, y * H)) return;
  var d = $('dot');
  d.style.left = (x * W) + 'px';
  d.style.top = (y * H) + 'px';
  d.classList.add('on');
  clearTimeout(dotTimer);
  dotTimer = setTimeout(function () { d.classList.remove('on'); }, 2500);
}

var hudTimer;
function showHud() {
  if (!cur) return;
  var f = cur.f;
  $('hud-name').textContent = f.name;
  $('hud-page').textContent = f.kind === 'pdf' ? ar(cur.page) + ' / ' + ar(f.pages) :
    f.kind === 'sheet' ? sheetGrid(f, cur.page - 1).name + (f.pages > 1 ? '  ' + ar(cur.page) + ' / ' + ar(f.pages) : '') : '';
  $('hud-zoom').textContent = cur.zoom !== 1 ? ar(Math.round(cur.zoom * 100)) + '٪' : '';
  $('hud').classList.add('on');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(function () { $('hud').classList.remove('on'); }, 3000);
}

// ── اللي يوصل للجوالات: قائمة الملفات، والحالة، وصورة مصغّرة من الشاشة ──
function filesMsg() {
  return { t: 'files', files: files.map(function (f) {
    return { id: f.id, name: f.name, kind: f.kind, pages: f.pages, size: f.size, thumb: f.thumb, left: fileLeft(f) };
  }) };
}
function stateMsg() {
  if (!cur) return { t: 'state', cur: null };
  var v = pagesEl.querySelector('video'), f = cur.f;
  return { t: 'state', cur: { id: f.id, name: f.name, kind: f.kind, page: cur.page, pages: f.pages, mode: cur.mode,
    zoom: cur.zoom, scroll: canScroll(),
    playing: v ? !v.paused : false, muted: v ? v.muted : false,
    time: v ? v.currentTime : 0, duration: v ? v.duration || 0 : 0 } };
}

var stateTimer;
function changed(hud) {
  if (hud) showHud();
  clearTimeout(stateTimer);
  stateTimer = setTimeout(function () { broadcast(stateMsg()); }, 60);
  scheduleThumb();
}

var lastThumb = null, thumbTimer;
function scheduleThumb() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(function () {
    lastThumb = snapshot();
    broadcast({ t: 'thumb', data: lastThumb });
  }, 220);
}

function snapshot() {
  if (!cur) return null;
  var c = document.createElement('canvas'), k = 480 / W;
  c.width = 480; c.height = 270;
  var g = c.getContext('2d');
  g.fillStyle = '#111214'; g.fillRect(0, 0, 480, 270);
  var sr = stage.getBoundingClientRect();
  if (cur.f.kind === 'sheet') { snapSheet(g, k, sr); if (strokes.length) g.drawImage(inkEl, 0, 0, 480, 270); return c.toDataURL('image/jpeg', .72); }
  Array.prototype.forEach.call(pagesEl.children, function (el) {
    var r = el.getBoundingClientRect();
    var x = (r.left - sr.left) / scale * k, y = (r.top - sr.top) / scale * k;
    var w = r.width / scale * k, h = r.height / scale * k;
    if (x > 480 || y > 270 || x + w < 0 || y + h < 0) return;
    var src = el.tagName === 'DIV' ? el.firstChild : el;
    try {
      if (src) g.drawImage(src, x, y, w, h);
      else { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); }
    } catch (e) {}
  });
  if (strokes.length) g.drawImage(inkEl, 0, 0, 480, 270);
  return c.toDataURL('image/jpeg', .72);
}

// صورة الجوال المصغّرة للإكسل: نرسم الخلايا الظاهرة على الشاشة (الجدول ما ينرسم بـ drawImage)
function snapSheet(g, k, sr) {
  g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, 480, 270);
  var cells = pagesEl.querySelectorAll('th, td');
  var fs = parseFloat(pagesEl.style.fontSize) || 24;
  g.textBaseline = 'middle';
  g.font = Math.max(5, fs * k * .9) + 'px sans-serif';
  var rtl = !!pagesEl.querySelector('table[dir="rtl"]');
  for (var i = 0; i < cells.length; i++) {
    var el = cells[i], r = el.getBoundingClientRect();
    var x = (r.left - sr.left) / scale * k, y = (r.top - sr.top) / scale * k;
    var w = r.width / scale * k, h = r.height / scale * k;
    if (x > 480 || y > 270 || x + w < 0 || y + h < 0 || !w || !h) continue;
    var head = el.tagName === 'TH';
    g.fillStyle = head ? (el.classList.contains('on') ? '#d3e7da' : '#f3f3f3') : el.style.background || '#fff';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#d4d4d4'; g.lineWidth = .5; g.strokeRect(x, y, w, h);
    if (el.classList.contains('sel')) { g.strokeStyle = '#107c41'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
    var t = el.textContent;
    if (!t) continue;
    g.save(); g.beginPath(); g.rect(x + 1, y, w - 2, h); g.clip();
    g.fillStyle = head ? '#666' : '#1b2430';
    g.direction = rtl ? 'rtl' : 'ltr';
    g.textAlign = head ? 'center' : rtl ? 'right' : 'left';
    g.fillText(t, head ? x + w / 2 : rtl ? x + w - 3 : x + 3, y + h / 2);
    g.restore();
  }
  // الشريط والتبويبات
  var bars = ['xlbar', 'xltabs'];
  bars.forEach(function (id) {
    var b = $(id).getBoundingClientRect();
    var y = (b.top - sr.top) / scale * k, h = b.height / scale * k;
    g.fillStyle = id === 'xlbar' ? '#ffffff' : '#f3f3f3'; g.fillRect(0, y, 480, h);
    g.fillStyle = '#107c41'; g.font = Math.max(6, h * .5) + 'px sans-serif'; g.textAlign = 'center';
    g.fillText(id === 'xlbar' ? $('xladdr').textContent + '   ' + $('xlval').textContent.slice(0, 50) : (cur.f.book.SheetNames[cur.page - 1] || ''), 240, y + h / 2);
  });
  // المؤشر
  if ($('cursor').classList.contains('on')) {
    g.fillStyle = '#000'; g.beginPath(); var mx = mouse.x * k, my = mouse.y * k;
    g.moveTo(mx, my); g.lineTo(mx, my + 12); g.lineTo(mx + 4, my + 9); g.lineTo(mx + 8, my + 11); g.closePath(); g.fill();
  }
}

// ── ريموت الشاشة ──
var KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 10009: 'back', 8: 'back', 27: 'back',
  415: 'play', 19: 'play', 10252: 'play', 412: 'rew', 417: 'ff', 427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 187: 'green', 189: 'red', 48: 'yellow' };

function onKey(code) {
  var k = KEYS[code];
  if (!k) return false;
  // قائمة الملفات ما تنعرض على الشاشة، فالاختيار من الجوال بس
  if (!cur) { if (k === 'back') exitApp(); return true; }
  if (cur.f.kind === 'sheet' && /^(left|right|up|down)$/.test(k)) {
    moveSel(k === 'up' ? -1 : k === 'down' ? 1 : 0, k === 'right' ? 1 : k === 'left' ? -1 : 0);
    return true;
  }
  switch (k) {
    case 'right': case 'chdown': step(1); break;
    case 'left': case 'chup': step(-1); break;
    case 'up': nudge(-1); break;
    case 'down': nudge(1); break;
    case 'enter': if (cur.f.kind === 'video') cmd('play'); else showHud(); break;
    case 'play': cmd('play'); break;
    case 'rew': cmd('seek', { d: -10 }); break;
    case 'ff': cmd('seek', { d: 10 }); break;
    case 'green': setZoom(1.25); break;
    case 'red': setZoom(0.8); break;
    case 'yellow': setZoom(0); break;
    case 'blue': cmd('mode'); break;
    case 'back': goHome(); break;
  }
  return true;
}
addEventListener('keydown', function (e) { if (onKey(e.keyCode)) e.preventDefault(); });
// غلاف التطبيق على سامسونج يرسل لنا أزرار الريموت
addEventListener('message', function (e) { if (e.data && e.data.sanadKey) onKey(e.data.sanadKey); });

function exitApp() {
  if (parent !== window) parent.postMessage({ sanad: 'exit' }, '*');   // غلاف سامسونج وإل جي
  else if (window.SanadAndroid) window.SanadAndroid.exit();            // تطبيق أندرويد
}

// ── رسالة عابرة أعلى الشاشة ──
var toastTimer;
function toast(text, ms) {
  var t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || 15000);
}
function hideToast() { $('toast').hidden = true; }

function throttle(fn, ms) {
  var last = 0, timer;
  return function () {
    var now = Date.now(), wait = ms - (now - last);
    clearTimeout(timer);
    if (wait <= 0) { last = now; fn(); }
    else timer = setTimeout(function () { last = Date.now(); fn(); }, wait);
  };
}

startPeer();

(function () {
  // Edit these to change hours everywhere on the page. days: 0 = Sunday ... 6 = Saturday.
  var SHOP = { tz: 'America/New_York', open: 9, close: 17, days: [1, 2, 3, 4, 5] };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmt(h) { return (((h + 11) % 12) + 1) + ':00 ' + (h < 12 ? 'AM' : 'PM'); }

  function shopNow() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SHOP.tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }).formatToParts(new Date());
    var out = {};
    parts.forEach(function (p) { out[p.type] = p.value; });
    return { day: SHORT.indexOf(out.weekday), minutes: (+out.hour) * 60 + (+out.minute) };
  }

  function statusFor(now) {
    var isDay = SHOP.days.indexOf(now.day) !== -1;
    if (isDay && now.minutes >= SHOP.open * 60 && now.minutes < SHOP.close * 60) {
      return { state: 'open', text: 'Open now · closes ' + fmt(SHOP.close) };
    }
    for (var i = 0; i < 8; i++) {
      var d = (now.day + i) % 7;
      if (SHOP.days.indexOf(d) !== -1 && (i > 0 || now.minutes < SHOP.open * 60)) {
        var when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : DAYS[d];
        return { state: 'closed', text: 'Closed now · opens ' + when + ' at ' + fmt(SHOP.open) };
      }
    }
    return { state: 'unknown', text: 'Hours: ' + fmt(SHOP.open) + ' to ' + fmt(SHOP.close) };
  }

  function renderHours(now) {
    var body = document.querySelector('#hoursTable tbody');
    if (!body) return;
    var html = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (d) {
      var isOpen = SHOP.days.indexOf(d) !== -1;
      var today = d === now.day;
      html += '<tr class="' + (isOpen ? '' : 'closed') + (today ? ' today' : '') + '"><td>' + DAYS[d] +
        (today ? '<span class="pill">Today</span>' : '') + '</td><td>' +
        (isOpen ? fmt(SHOP.open) + ' to ' + fmt(SHOP.close) : 'Closed') + '</td></tr>';
    });
    body.innerHTML = html;
  }

  function refresh() {
    var now = shopNow();
    var s = statusFor(now);
    document.querySelectorAll('[data-status]').forEach(function (el) {
      el.setAttribute('data-state', s.state);
      el.querySelector('[data-status-text]').textContent = s.text;
    });
    renderHours(now);
  }
  try { refresh(); setInterval(refresh, 60000); } catch (e) { /* keep the static hours text */ }

  // Mobile menu
  var menuBtn = document.getElementById('menuBtn');
  var nav = document.getElementById('nav');
  var mq = window.matchMedia('(max-width: 820px)');
  function syncNav() { nav.hidden = mq.matches ? menuBtn.getAttribute('aria-expanded') !== 'true' : false; }
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    syncNav();
  }
  menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  (mq.addEventListener ? mq.addEventListener('change', function () { setMenu(false); }) : mq.addListener(function () { setMenu(false); }));
  setMenu(false);

  // Theme toggle
  var root = document.documentElement;
  var themeBtn = document.getElementById('themeBtn');
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  function effective() { return root.getAttribute('data-theme') || (dark.matches ? 'dark' : 'light'); }
  function paintBtn() { themeBtn.setAttribute('data-mode', effective()); }
  try { var saved = localStorage.getItem('yash-theme'); if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved); } catch (e) {}
  paintBtn();
  themeBtn.addEventListener('click', function () {
    var next = effective() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('yash-theme', next); } catch (e) {}
    paintBtn();
  });
  (dark.addEventListener ? dark.addEventListener('change', paintBtn) : dark.addListener(paintBtn));

  // Copy buttons
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      function done(ok) {
        btn.textContent = ok ? 'Copied' : 'Select the text above';
        setTimeout(function () { btn.textContent = label; }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else { done(fallbackCopy(text)); }
    });
  });

  // Appointment form. Requests are emailed to MAIL_TO through the FormSubmit service.
  // To send to another inbox later, change MAIL_TO. The first request after launch triggers a
  // one-time activation email from FormSubmit to this address; click its link once.
  var MAIL_TO = 'yashsmechanicshop@gmail.com';
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/' + MAIL_TO;
  var form = document.getElementById('apptForm');
  var msg = document.getElementById('apptMsg');
  var submitBtn = document.getElementById('apptSubmit');
  try { document.getElementById('f-date').min = new Date().toLocaleDateString('en-CA', { timeZone: SHOP.tz }); } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function showMsg(kind, html) { msg.className = 'form-msg ' + kind; msg.innerHTML = html; msg.hidden = false; }
  function summary(d) {
    return ['Name: ' + d.name, 'Phone: ' + d.phone, 'Email: ' + d.email, 'Vehicle: ' + d.vehicle,
      'Service: ' + d.service, 'Preferred date: ' + (d.date || 'No preference'), 'Preferred time: ' + d.time,
      '', 'Details:', d.details || '(none)'].join('\n');
  }
  function showFallback(d) {
    var subject = 'Appointment request: ' + d.service + ' (' + d.name + ')';
    var href = 'mailto:' + MAIL_TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(summary(d));
    showMsg('err',
      '<strong>We could not send that automatically.</strong>' +
      '<span>Send it from your email app instead, or call +1 (267) 767-0976. Nothing has been sent yet.</span>' +
      '<span class="actions"><a class="btn btn-primary btn-sm" href="' + href + '">Open email app</a>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="copyReq">Copy request</button></span>');
    var c = document.getElementById('copyReq');
    c.addEventListener('click', function () {
      function done(ok) { c.textContent = ok ? 'Copied' : 'Select and copy manually'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(summary(d)).then(function () { done(true); }, function () { done(fallbackCopy(summary(d))); });
      } else { done(fallbackCopy(summary(d))); }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var d = {};
    new FormData(form).forEach(function (v, k) { d[k] = String(v).trim(); });
    if (d.website) { showMsg('ok', '<strong>Thanks.</strong>'); return; } // spam trap field was filled
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    msg.hidden = true;
    var payload = {
      name: d.name, phone: d.phone, email: d.email, vehicle: d.vehicle, service: d.service,
      preferred_date: d.date || 'No preference', preferred_time: d.time, details: d.details || '(none)',
      _subject: 'Appointment request: ' + d.service + ' (' + d.name + ')', _template: 'table', _captcha: 'false'
    };
    fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!(res.ok && String(res.j.success) === 'true')) throw new Error('send failed');
      showMsg('ok', '<strong>Request sent.</strong><span>Thanks, ' + esc(d.name) +
        '. We will call or email you to confirm a time. For anything urgent, call +1 (267) 767-0976.</span>');
      form.reset();
    }).catch(function () {
      showFallback(d);
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
    });
  });
})();

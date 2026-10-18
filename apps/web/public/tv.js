/* ES5 on purpose. No React, modules, optional chaining, or third-party UI. */
(function () {
  'use strict';
  var video = document.getElementById('video');
  var player = document.getElementById('player');
  var status = document.getElementById('status');
  var source = document.getElementById('source');
  var episode = document.getElementById('episode');
  var load = document.getElementById('load');
  var sources = [], engine = null, loading = false, requestId = 0, retry = 0, resume = 0, watchdog = null;
  function message(text) { if (status) status.textContent = text; }
  function selected() { return sources[Number(source.value)] || null; }
  function episodes(item) { return item ? (item.hlsEpisodes || item.mediaEpisodes || {}) : {}; }
  function safeUrl(url) { return typeof url === 'string' && (/^https:\/\//i.test(url) || /^\/api\//.test(url)); }
  function option(parent, value, label) { var el = document.createElement('option'); el.value = value; el.textContent = label; parent.appendChild(el); }
  function storageKey() { var item = selected(); return 'as:tv:' + player.getAttribute('data-anime') + ':' + (item ? item.id : '') + ':' + episode.value; }
  function populateEpisodes() {
    var previous = episode.value, keys = Object.keys(episodes(selected())).filter(function (key) { return /^\d+$/.test(key); }).sort(function (a, b) { return Number(a) - Number(b); });
    episode.textContent = '';
    keys.forEach(function (key) { option(episode, key, 'Серия ' + key); });
    if (keys.indexOf(previous) >= 0) episode.value = previous;
  }
  function stop() { requestId++; window.clearTimeout(watchdog); if (engine) { engine.destroy(); engine = null; } video.pause(); video.removeAttribute('src'); video.load(); }
  function play() {
    var token = requestId, result = video.play();
    if (result && result.catch) result.catch(function (error) {
      if (token !== requestId || error.name === 'AbortError') return;
      message(error.name === 'NotAllowedError' ? 'Нажмите «Пауза / пуск» или OK на видео для запуска.' : 'Не удалось запустить видео. Попробуйте другую озвучку.');
    });
  }
  function attach(url, format, token) {
    if (token !== requestId) return;
    if (format !== 'hls' || (!window.MediaSource && video.canPlayType('application/vnd.apple.mpegurl'))) { video.src = url; video.load(); play(); return; }
    if (!window.Hls || !window.Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; video.load(); play(); }
      else message('Этот браузер не поддерживает данный поток. Попробуйте другую озвучку.');
      return;
    }
    engine = new window.Hls({ enableWorker: true, maxBufferLength: 20, maxMaxBufferLength: 40, capLevelToPlayerSize: true });
    engine.on(window.Hls.Events.ERROR, function (_, data) { if (token === requestId && data.fatal) { message('Не удалось открыть поток. Выберите другую озвучку или повторите запуск.'); if (engine) { engine.destroy(); engine = null; } } });
    engine.on(window.Hls.Events.MANIFEST_PARSED, function () { if (token === requestId) play(); });
    engine.loadSource(url); engine.attachMedia(video);
  }
  function start() {
    var item = selected(), url = episodes(item)[episode.value];
    if (!safeUrl(url)) { message('Выберите доступную серию и озвучку.'); return; }
    stop(); var token = requestId;
    resume = 0; try { resume = Number(localStorage.getItem(storageKey())) || 0; } catch (_) { /* Storage is optional. */ }
    message('Загружаем серию ' + episode.value + '…');
    watchdog = window.setTimeout(function () { if (token === requestId && video.readyState < 3) { stop(); message('Поток не отвечает. Выберите другую озвучку или повторите запуск.'); } }, 30000);
    if (item.format !== 'hls' || (!window.MediaSource && video.canPlayType('application/vnd.apple.mpegurl')) || window.Hls) { attach(url, item.format, token); return; }
    message('Подключаем плеер…');
    var script = document.createElement('script'); script.src = '/tv-hls.js';
    script.onload = function () { attach(url, item.format, token); };
    script.onerror = function () { if (token === requestId) message('Плеер не загрузился. Повторите запуск.'); };
    document.head.appendChild(script);
  }
  function fetchSources() {
    if (loading) return;
    loading = true; load.disabled = true; message('Ищем доступные озвучки…');
    var xhr = new XMLHttpRequest(); xhr.open('GET', '/api/tv/sources/' + player.getAttribute('data-anime')); xhr.timeout = 35000;
    xhr.onload = function () {
      loading = false; load.disabled = false;
      if (xhr.status !== 200) { message('Не удалось загрузить озвучки. Нажмите «Загрузить озвучки» ещё раз.'); return; }
      try {
        var data = JSON.parse(xhr.responseText);
        sources = (data.sources || []).filter(function (item) { return Object.keys(episodes(item)).length > 0; });
        source.textContent = '';
        sources.forEach(function (item, i) { option(source, String(i), item.title.replace(/\s*[·|—-]?\s*\[?(?:2160|1440|1080|720|480|360)p?\]?\s*/gi, ' ').trim()); });
        if (!sources.length && data.sourcesPending && retry++ < 3) { message('Источники ещё загружаются…'); window.setTimeout(fetchSources, 2500); return; }
        if (!sources.length) { message('Сейчас нет доступного прямого потока. Попробуйте другое аниме или повторите позже.'); return; }
        populateEpisodes(); document.getElementById('choices').hidden = false; message('Выберите озвучку и серию, затем нажмите «Смотреть».');
      } catch (_) { message('Не удалось прочитать ответ сервера. Повторите загрузку.'); }
    };
    xhr.onerror = xhr.ontimeout = function () { loading = false; load.disabled = false; message('Нет ответа сервера. Проверьте соединение и повторите.'); };
    xhr.send();
  }
  function seek(delta) { if (isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta)); }
  function toggle() { if (!video.currentSrc && !engine) { start(); return; } if (video.paused) play(); else video.pause(); }
  function next() { if (episode.selectedIndex < episode.options.length - 1) { episode.selectedIndex++; start(); } else message('Это последняя доступная серия в этой озвучке.'); }
  function fullscreen() { var fn = video.requestFullscreen || video.webkitRequestFullscreen; if (fn) { var p = fn.call(video); if (p && p.catch) p.catch(function () { message('Используйте кнопку полного экрана на видео.'); }); } }
  if (video) {
    load.addEventListener('click', function () { retry = 0; fetchSources(); });
    source.addEventListener('change', function () { stop(); populateEpisodes(); message('Озвучка выбрана. Нажмите «Смотреть».'); });
    episode.addEventListener('change', function () { stop(); message('Серия выбрана. Нажмите «Смотреть».'); });
    document.getElementById('start').addEventListener('click', start);
    document.getElementById('toggle').addEventListener('click', toggle);
    document.getElementById('backward').addEventListener('click', function () { seek(-10); });
    document.getElementById('forward').addEventListener('click', function () { seek(10); });
    document.getElementById('next').addEventListener('click', next);
    document.getElementById('fullscreen').addEventListener('click', fullscreen);
    video.addEventListener('loadedmetadata', function () { if (resume > 0 && resume < video.duration - 15) video.currentTime = resume; resume = 0; });
    video.addEventListener('playing', function () { window.clearTimeout(watchdog); message('Серия ' + episode.value + ' · ' + selected().title); });
    video.addEventListener('error', function () { if (video.getAttribute('src')) message('Поток недоступен или кодек не поддерживается. Попробуйте другую озвучку.'); });
    var savedAt = 0;
    video.addEventListener('timeupdate', function () { if (Date.now() - savedAt < 5000) return; savedAt = Date.now(); try { localStorage.setItem(storageKey(), String(Math.floor(video.currentTime))); } catch (_) { /* Storage is optional. */ } });
    window.addEventListener('pagehide', function () { stop(); });
    fetchSources();
  }
  // Spatial navigation follows actual positions; it also works on the search form and player controls.
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode, active = document.activeElement;
    if (active && active.tagName === 'INPUT' && key !== 10009 && key !== 27) return;
    if (active && active.tagName === 'SELECT') {
      if (key === 38 || key === 40) return;
      if (key === 13) { event.preventDefault(); document.getElementById('start').focus(); return; }
    }
    if (video && (key === 415 || key === 19 || key === 10252 || key === 179)) { event.preventDefault(); if (key === 19) video.pause(); else if (key === 415 && video.currentSrc) play(); else toggle(); return; }
    if (video && (key === 412 || key === 417)) { event.preventDefault(); seek(key === 412 ? -30 : 30); return; }
    if (key === 10009 || key === 27) { event.preventDefault(); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); else if (player) location.href = '/tv'; else history.back(); return; }
    if (video && active === video && (key === 13 || key === 37 || key === 39)) { event.preventDefault(); if (key === 13) toggle(); else seek(key === 37 ? -10 : 10); return; }
    if (key < 37 || key > 40) return;
    var nodes = Array.prototype.slice.call(document.querySelectorAll('a[href],button:not([disabled]),input,select,video'));
    nodes = nodes.filter(function (el) { return el.getBoundingClientRect().width > 0 && !el.closest('[hidden]'); });
    if (!active || nodes.indexOf(active) < 0) { if (nodes[0]) nodes[0].focus(); event.preventDefault(); return; }
    var from = active.getBoundingClientRect(), x = from.left + from.width / 2, y = from.top + from.height / 2, best = null, score = Infinity;
    nodes.forEach(function (el) {
      if (el === active) return;
      var box = el.getBoundingClientRect(), dx = box.left + box.width / 2 - x, dy = box.top + box.height / 2 - y;
      var forward = key === 37 ? -dx : key === 39 ? dx : key === 38 ? -dy : dy;
      var cross = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
      if (forward <= 8) return;
      var value = forward + cross * 3;
      if (value < score) { best = el; score = value; }
    });
    if (best) { event.preventDefault(); best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  });
}());

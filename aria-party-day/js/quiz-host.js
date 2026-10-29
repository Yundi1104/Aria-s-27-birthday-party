/**
 * 問答遊戲（迷因海公牛）— 中控台（投影用）：分組、分類封面、出題（秒數由主持人決定）、圖片/影片、搶答判定、揭曉、組別排名
 * QuizGame.mountHost(容器, store, 選項)
 * 畫面固定 1280×720，再自動縮放到符合螢幕大小。
 */
(function (root) {
  "use strict";
  var B = root.BINGO_DATA, C = root.BingoCore, Q = root.QUIZ_DATA, K = root.QuizCore, el = C.el;
  var LETTERS = ["A", "B", "C", "D"], CLS = ["a", "b", "c", "d"];
  var PIN_KEY = "ariaQuiz.hostok";

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  function clockText(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad(Math.floor(d.getMilliseconds() / 10)); }
  function secLabel(s) { return Number(s) ? s + " 秒" : "不倒數"; }

  // 題目的圖片 / 影片（揭曉時有答案圖就換成答案圖）
  function mediaFor(q, reveal) {
    if (reveal && q.answerImg) return el("div", { "class": "qh-media" }, [el("img", { src: q.answerImg, alt: "答案" })]);
    if (q.video) {
      var v = K.videoEmbed(q.video), kids = [];
      if (v.kind === "video") kids.push(el("video", { src: v.src, controls: "controls", playsinline: "playsinline", preload: "auto" }));
      else if (root.QUIZ_EMBED !== false) {
        var f = el("iframe", { src: v.src, title: "影片", allow: "autoplay; encrypted-media; fullscreen; picture-in-picture", allowfullscreen: "allowfullscreen", frameborder: "0" });
        kids.push(f);
      } else kids.push(el("div", { "class": "qh-vph", text: "🎬 影片" }));
      kids.push(el("a", { "class": "qh-vlink", href: v.open, target: "_blank", rel: "noopener", text: "影片沒出現？開新分頁播放 ↗" }));
      return el("div", { "class": "qh-media video" }, kids);
    }
    if (q.img) return el("div", { "class": "qh-media" }, [el("img", { src: q.img, alt: "" })]);
    return null;
  }

  function mountHost(host, store, opts) {
    opts = opts || {};
    var BC = B.CONFIG, QC = Q.CONFIG;
    var state = { status: "lobby", index: -1, revealed: -1, starts: {}, durs: {}, revealAt: {}, players: {}, answers: {}, buzz: {}, judge: {}, extra: {}, teams: { count: 0, assign: {} } };
    var connected = true, armed = false, armTimer = null, autoFor = -1, leftKey = null, refs = {}, showSetup = false, showExtra = false, showRef = false;
    var secTarget = null, secValue = null;          // 下一題要用的秒數（出題前主持人選；沒選 = 那題的預設秒數）

    host.innerHTML = "";
    var viewport = el("div", { "class": "bh-viewport" });
    var stage = el("div", { "class": "bh-stage" });
    viewport.appendChild(stage); host.appendChild(viewport);
    function fit() {
      var w = viewport.clientWidth || 1280, h = viewport.clientHeight || 720, s = Math.min(w / 1280, h / 720);
      stage.style.transform = "translate(" + ((w - 1280 * s) / 2) + "px," + ((h - 720 * s) / 2) + "px) scale(" + s + ")";
    }
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(viewport);
    window.addEventListener("resize", fit); fit();

    // ---------- 上方列 ----------
    var chip = el("span", { "class": "bh-chip" });
    var clock = el("span", { "class": "bh-clock" });
    var stat = el("span", { "class": "bh-stat" });
    var conn = el("span", { "class": "bh-conn" });
    var secSel = el("select", { "class": "qh-secsel", title: "下一題的作答秒數" });
    (QC.SECONDS_CHOICES || [10, 20, 30, 45, 60, 0]).forEach(function (s) { secSel.appendChild(el("option", { value: String(s), text: "⏱ " + secLabel(s) })); });
    secSel.addEventListener("change", function () { secValue = Number(secSel.value); });
    var btnMain = el("button", { "class": "bh-btn primary", type: "button", onclick: onMain });
    var btnAdd = el("button", { "class": "bh-btn", type: "button", onclick: onAddTime });
    var btnReveal = el("button", { "class": "bh-btn", type: "button", text: "提前揭曉", onclick: function () { store.reveal(state.index); } });
    var btnExtra = el("button", { "class": "bh-btn", type: "button", onclick: function () { showExtra = !showExtra; update(); } });
    var btnEnd = el("button", { "class": "bh-btn", type: "button", text: "結束", onclick: function () { store.end(); } });
    var btnReset = el("button", { "class": "bh-btn danger", type: "button", text: "重置", onclick: onReset });
    var btnTeams = el("button", { "class": "bh-btn", type: "button", text: "調整分組", onclick: function () { showSetup = !showSetup; update(); } });
    var controls = el("div", { "class": "bh-controls" }, [secSel, btnMain, btnAdd, btnReveal, btnExtra, btnTeams, btnEnd, btnReset]);
    // 「‹ 中控台」：回到主持人入口（host-index.html）。由頁面傳 backHref 進來；按 H 把按鈕藏起來時它也會藏起來
    if (opts && opts.backHref) controls.insertBefore(el("a", { "class": "bh-btn bh-back", href: opts.backHref, text: "‹ 中控台" }), controls.firstChild);
    stage.appendChild(el("div", { "class": "bh-header" }, [
      el("div", { "class": "bh-titlebox" }, [
        el("div", { "class": "bh-title", text: BC.HOST_TITLE || "派對" }),
        BC.HOST_SUBTITLE ? el("div", { "class": "bh-sub", text: BC.HOST_SUBTITLE }) : null
      ]),
      chip, clock, stat, el("span", { "class": "bh-spacer" }), controls
    ]));

    // 下一個要出的題目（分組中 = 第一題；封面 = 這一題；揭曉後 = 下一題）
    function upcoming() {
      if (state.status === "lobby") return K.firstIndex();
      if (state.status === "intro") return state.index;
      if (state.status === "reveal") return K.nextIndex(state.index);
      return -1;
    }
    function pickSeconds(i) { return i === secTarget && secValue != null ? secValue : K.defaultSeconds(i); }
    function go(i) {
      if (i < 0) { store.end(); return; }
      if (QC.CATEGORY_INTRO !== false && K.isCatStart(i) && state.status !== "intro") store.showIntro(i);
      else store.startQuestion(i, pickSeconds(i));
    }
    function onMain() {
      showExtra = false; showRef = false;
      if (state.status === "lobby") { if (K.assignedPids(state).length && K.firstIndex() >= 0) { showSetup = false; go(K.firstIndex()); } }
      else if (state.status === "intro") store.startQuestion(state.index, pickSeconds(state.index));
      else if (state.status === "reveal") go(K.nextIndex(state.index));
    }
    function onAddTime() {
      if (state.status !== "question") return;
      var i = state.index, dur = K.secondsFor(i, state), st = K.startOf(state, i);
      if (dur) store.setDuration(i, dur + 10);
      else if (st) store.setDuration(i, (store.now() - st) / 1000 + 10);   // 不倒數的題目：從現在開始倒數 10 秒
    }
    function onReset() {
      if (!armed) { armed = true; btnReset.textContent = "再按一次確定"; btnReset.classList.add("armed"); armTimer = setTimeout(disarm, 3500); }
      else { disarm(); leftKey = null; showExtra = false; store.reset(); }
    }
    function disarm() { armed = false; clearTimeout(armTimer); btnReset.textContent = "重置"; btnReset.classList.remove("armed"); }
    document.addEventListener("keydown", function (e) {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.key === "h" || e.key === "H") controls.classList.toggle("hidden");
    });

    // ---------- 主畫面 ----------
    var left = el("div", { "class": "qh-left" });
    var right = el("div", { "class": "bh-panel qh-right" });
    stage.appendChild(el("div", { "class": "qh-main" }, [left, right]));
    var overlay = el("div", { "class": "qh-overlay" });
    stage.appendChild(overlay);

    function buildIntro() {
      left.innerHTML = ""; refs = {};
      var cat = K.category(state.index), info = K.catInfo(cat), n = K.order().filter(function (i) { return K.category(i) === cat; }).length;
      left.appendChild(el("div", { "class": "qh-intro" + (info.img ? " has-img" : "") }, [
        info.img ? el("img", { "class": "qh-intro-img", src: info.img, alt: "" }) : null,
        el("div", { "class": "qh-intro-box" }, [
          el("div", { "class": "qh-intro-kicker", text: "下一個主題" }),
          el("div", { "class": "qh-intro-title", text: cat }),
          info.sub ? el("div", { "class": "qh-intro-sub", text: info.sub }) : null,
          el("div", { "class": "qh-intro-n", text: "共 " + n + " 題　從第 " + K.displayNo(state.index) + " 題開始" })
        ])
      ]));
    }

    function buildQuestion() {
      left.innerHTML = ""; refs = { opts: [] };
      var q = K.question(state.index), reveal = state.status === "reveal", buzz = q.type === "buzz";
      refs.note = el("div", { "class": "qh-note" });
      var meta = "第 " + K.displayNo(state.index) + " / " + K.total() + " 題" + (q.cat ? "・" + q.cat : "") + (q.level ? "・" + q.level : "");
      var hint = buzz ? "🔔 搶答題：題目出現 " + K.buzzDelay() + " 秒後才能按" : "⏱ 時間到之前可以改答案，跟組員討論一下！";
      var media = mediaFor(q, reveal);
      left.appendChild(el("div", { "class": "qh-qbox" }, [
        el("div", { "class": "qh-qno" }, [el("b", { text: meta }), "　" + hint]),
        el("div", { "class": "qh-qtext" + (media ? "" : " big"), text: q.q }),
        q.bonus ? el("div", { "class": "qh-bonus", text: "🎁 " + q.bonus.label + " 額外 +" + q.bonus.points + " 分！" }) : null,
        refs.note
      ]));
      if (media) left.appendChild(media);
      if (buzz) {
        refs.buzzStatus = el("div", { "class": "qh-buzz-st" });
        refs.buzzList = el("div", { "class": "qh-buzz-list" });
        left.appendChild(el("div", { "class": "qh-buzz" + (media ? "" : " tall") }, [
          el("div", { "class": "qh-buzz-h" }, [el("b", { text: "🔔 搶答順序" }), refs.buzzStatus]), refs.buzzList
        ]));
      } else {
        var n = q.options.length, grid = el("div", { "class": "qh-opts n" + n + (media ? "" : " tall") });
        q.options.forEach(function (text, i) {
          var fill = el("div", { "class": "qh-fill" }), count = el("span", { "class": "qh-count", text: "" });
          var box = el("div", { "class": "qh-opt " + CLS[i] }, [
            fill, el("span", { "class": "qh-letter", text: LETTERS[i] }), el("span", { "class": "qh-otext", text: text }), count
          ]);
          refs.opts.push({ box: box, fill: fill, count: count });
          grid.appendChild(box);
        });
        left.appendChild(grid);
      }
    }

    function paintQuestion() {
      var q = K.question(state.index), reveal = state.status === "reveal";
      if (q.type === "buzz") { paintBuzz(q, reveal); return; }
      var counts = K.optionCounts(state, state.index);
      var playing = K.assignedPids(state).length, denom = Math.max(1, playing);
      var showCounts = reveal || QC.SHOW_LIVE_COUNTS === true;               // 作答中不顯示各選項人數，大家就不能直接看多數決
      refs.opts.forEach(function (o, i) {
        o.count.textContent = showCounts ? String(counts[i]) : "";
        o.fill.style.width = showCounts ? (counts[i] / denom * 100) + "%" : "0";
        o.box.className = "qh-opt " + CLS[i] + (reveal ? (i === q.answer ? " right" : " dim") : "");
      });
      refs.note.textContent = reveal && q.note ? "💡 " + q.note : "";
    }

    function paintBuzz(q, reveal) {
      var i = state.index, rows = K.buzzList(state, i);
      refs.note.textContent = reveal ? "✅ 答案：" + (q.answerText || "（待補）") + (q.note ? "　💡 " + q.note : "") : "";
      refs.buzzList.innerHTML = "";
      if (!rows.length) refs.buzzList.appendChild(el("div", { "class": "qh-buzz-empty", text: "還沒有人按搶答" }));
      rows.forEach(function (r) {
        var tag = el("span", { "class": "qh-buzz-team", text: K.teamIcon(r.team) + (r.team + 1) });
        tag.style.background = K.teamColor(r.team);
        var ok = el("button", { "class": "qh-judge ok" + (r.judge === true ? " on" : ""), type: "button", text: "✅ 答對", title: "再按一次取消",
          onclick: function () { store.judge(i, r.pid, r.judge === true ? null : true); } });
        var ng = el("button", { "class": "qh-judge ng" + (r.judge === false ? " on" : ""), type: "button", text: "❌ 答錯", title: "再按一次取消",
          onclick: function () { store.judge(i, r.pid, r.judge === false ? null : false); } });
        refs.buzzList.appendChild(el("div", { "class": "qh-buzz-row" + (r.rank === 1 ? " first" : "") + (r.judge === true ? " right" : r.judge === false ? " wrong" : "") }, [
          el("span", { "class": "qh-buzz-rk", text: String(r.rank) }),
          el("span", { "class": "qh-buzz-nm", text: r.name }), tag,
          el("span", { "class": "qh-buzz-ms", text: "+" + (r.ms / 1000).toFixed(2) + " 秒" }),
          el("span", { "class": "qh-buzz-at", text: clockText(r.at) }),
          ok, ng
        ]));
      });
      tickBuzz();
    }
    function tickBuzz() {
      if (!refs.buzzStatus) return;
      var un = K.unlockAt(state, state.index), now = store.now();
      if (state.status === "reveal") refs.buzzStatus.textContent = "已揭曉";
      else if (!un) refs.buzzStatus.textContent = "";
      else if (now < un) refs.buzzStatus.textContent = "⏳ " + Math.ceil((un - now) / 1000) + " 秒後開放搶答";
      else refs.buzzStatus.textContent = "🟢 開放搶答中！點 ✅ / ❌ 判定";
      refs.buzzStatus.className = "qh-buzz-st" + (un && now >= un && state.status === "question" ? " open" : "");
    }

    // ---------- 額外加分（例如全文背誦 +20）----------
    function renderExtra() {
      overlay.innerHTML = "";
      var q = K.question(state.index);
      var on = showExtra && q && q.bonus && (state.status === "question" || state.status === "reveal");
      overlay.className = "qh-overlay" + (on ? " show" : "");
      if (!on) return;
      var i = state.index, grid = el("div", { "class": "qh-roster" });
      K.assignedPids(state).sort(function (a, b) { return K.teamOf(state, a) - K.teamOf(state, b); }).forEach(function (pid) {
        var got = K.extraOf(state, i, pid) > 0, tm = K.teamOf(state, pid);
        var c = el("button", { "class": "qh-pchip" + (got ? " in" : ""), type: "button", onclick: function () { store.giveExtra(i, pid, got ? null : q.bonus.points); } }, [
          el("span", { "class": "nm", text: K.nameOf(state, pid) }), el("span", { "class": "tg", text: got ? "+" + q.bonus.points : K.teamIcon(tm) + (tm + 1) })
        ]);
        if (got) c.style.background = "var(--ok)";
        grid.appendChild(c);
      });
      // 給主持人對照的標準答案（例如背誦的台詞）：平常藏起來，按「看加分答案」才顯示
      var refBox = q.bonus.ref ? el("div", { "class": "qh-ref", text: q.bonus.ref }) : null;
      var refBtn = q.bonus.ref ? el("button", { "class": "bh-btn", type: "button", text: showRef ? "🙈 藏起加分答案" : "👀 看加分答案", onclick: function () { showRef = !showRef; renderExtra(); } }) : null;
      if (refBox && !showRef) refBox.style.display = "none";
      overlay.appendChild(el("div", { "class": "qh-extra" }, [
        el("h2", { text: "🎁 " + q.bonus.label + "　+" + q.bonus.points + " 分" }),
        el("div", { "class": "qh-hint", text: "點名字加分 / 取消（加在個人分數，不算進組別分數）" }), refBtn, refBox, grid,
        el("button", { "class": "bh-btn primary", type: "button", text: "完成", onclick: function () { showExtra = false; showRef = false; update(); } })
      ]));
    }

    // ---------- 分組 ----------
    function guestPids() { return B.GUESTS.map(function (g, i) { return C.guestId(i); }); }
    function effCount() { return K.teamsOf(state).count || 4; }
    function scoreMode() { return K.teamsOf(state).mode || QC.TEAM_SCORE; }
    function commitTeams(count, assign, mode) {
      var clean = {}; Object.keys(assign).forEach(function (pid) { var v = assign[pid]; if (v >= 0 && v < count) clean[pid] = v; });
      store.setTeams(count, clean, mode || K.teamsOf(state).mode || undefined);
    }
    function currentAssign() { var out = {}, T = K.teamsOf(state); Object.keys(T.assign).forEach(function (pid) { if (K.teamOf(state, pid) >= 0) out[pid] = K.teamOf(state, pid); }); return out; }
    function setCount(n) { n = Math.max(1, Math.min(QC.MAX_TEAMS || 8, n)); commitTeams(n, currentAssign()); }
    function cycle(pid) {
      var cnt = effCount(), a = currentAssign(), cur = a[pid] == null ? -1 : a[pid];
      if (cur < 0) a[pid] = 0; else if (cur + 1 >= cnt) delete a[pid]; else a[pid] = cur + 1;
      commitTeams(cnt, a);
    }
    function randomize(onlyJoined) {
      var cnt = effCount(), pool = onlyJoined ? guestPids().filter(function (pid) { return state.players[pid]; }) : guestPids(), a = {};
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      pool.forEach(function (pid, i) { a[pid] = i % cnt; });
      commitTeams(cnt, a);
    }

    // 拖移分組（只在分組畫面有 .qh-pchip 可以拖）
    function dropTeam(pid, zoneId) {
      var cnt = effCount(), a = currentAssign();
      if (zoneId === "pool") delete a[pid]; else { var k = parseInt(String(zoneId).slice(1), 10); if (k >= 0 && k < cnt) a[pid] = k; }
      commitTeams(cnt, a);
    }
    PartyDnd.enable(left, { itemSel: ".qh-pchip", zoneSel: "[data-zone]", keyOf: function (e) { return e.getAttribute("data-pid"); }, onDrop: dropTeam });

    function buildSetup() {
      left.innerHTML = ""; refs = {};
      var cnt = effCount(), a = currentAssign(), joined = state.players, MAX = QC.MAX_TEAMS || 8, t;
      var stepper = el("div", { "class": "qh-stepper" }, [
        el("span", { text: "組數" }),
        el("button", { "class": "qh-step", type: "button", text: "−", onclick: function () { setCount(cnt - 1); } }),
        el("b", { text: String(cnt) }),
        el("button", { "class": "qh-step", type: "button", text: "＋", onclick: function () { setCount(cnt + 1); } })
      ]);
      var top = el("div", { "class": "qh-setup-top" }, [
        el("div", { "class": "qh-setup-title", text: "👥 分組" }), stepper,
        el("button", { "class": "bh-btn", type: "button", text: "🔀 隨機分組（已進場的人）", onclick: function () { randomize(true); } }),
        el("button", { "class": "bh-btn", type: "button", text: "🔀 隨機（全部）", onclick: function () { randomize(false); } }),
        el("button", { "class": "bh-btn", type: "button", text: "清除分組", onclick: function () { commitTeams(cnt, {}); } }),
        el("button", { "class": "bh-btn", type: "button", text: scoreMode() === "average" ? "計分：平均每人 ⇄" : "計分：全組加總 ⇄",
          title: "各組人數不一樣、或有人不玩時，用「平均每人」比較公平", onclick: function () { commitTeams(cnt, currentAssign(), scoreMode() === "average" ? "sum" : "average"); } })
      ]);
      // 拖移版面：上面是「還沒分組（不玩）」的名字，下面每一組一個框；把名字拖進框裡就分好組，拖回上面 = 這局不玩。點名字也可以換組。
      var zones = el("div", { "class": "qh-zones" }), bodies = {}, tag;
      function zone(key, label, bg, out) {
        var n = key === "pool" ? B.GUESTS.length - Object.keys(a).length : Object.keys(a).filter(function (pid) { return a[pid] === parseInt(key.slice(1), 10); }).length;
        tag = el("span", { "class": "qh-sumtag" + (out ? " out" : ""), text: label + "　" + n + " 人" }); if (bg) tag.style.background = bg;
        var body = el("div", { "class": "qh-roster zone" }); bodies[key] = body;
        var box = el("div", { "class": "qh-zone" + (out ? " qh-pool" : ""), "data-zone": key }, [tag, body]);
        zones.appendChild(box);
      }
      zone("pool", "不玩", null, true);
      for (t = 0; t < cnt; t++) zone("t" + t, K.teamLabel(t), K.teamColor(t), false);
      zones.style.gridTemplateColumns = "repeat(" + Math.max(1, Math.min(cnt, 4)) + ",minmax(0,1fr))";
      B.GUESTS.map(function (g, i) { return { g: g, pid: C.guestId(i) }; }).forEach(function (x) {
        var tm = a[x.pid] == null ? -1 : a[x.pid];
        var chip = el("button", { "class": "qh-pchip" + (tm >= 0 ? " in" : ""), type: "button", "data-pid": x.pid, onclick: function () { cycle(x.pid); } }, [
          el("span", { "class": "dot" + (joined[x.pid] ? " on" : ""), title: joined[x.pid] ? "已進場" : "還沒進場" }),
          el("span", { "class": "nm", text: x.g }),
          el("span", { "class": "tg", text: tm >= 0 ? K.teamIcon(tm) + (tm + 1) : "不玩" })
        ]);
        if (tm >= 0) chip.style.background = K.teamColor(tm);
        bodies[tm >= 0 ? "t" + tm : "pool"].appendChild(chip);
      });
      left.appendChild(el("div", { "class": "qh-setup" }, [
        top, el("div", { "class": "qh-hint", text: "把名字拖進組別的框框（拖回最上面 = 這局不玩），或點名字換組別。綠點 = 已進場。沒被分組的人這局用看的，也不會算分。" }), zones
      ]));
    }

    function buildPodium(board) {
      left.innerHTML = ""; refs = {};
      var top3 = board.ranked.slice(0, 3), order = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0], medals = ["🥇", "🥈", "🥉"], pod = el("div", { "class": "qh-podium" });
      order.forEach(function (idx) {
        var tm = top3[idx]; if (!tm) return;
        pod.appendChild(el("div", { "class": "qh-pod p" + (idx + 1) }, [
          el("div", { "class": "qh-pod-medal", text: medals[Math.min(2, tm.rank - 1)] }),
          el("div", { "class": "qh-pod-name", text: tm.icon + " " + tm.name }),
          el("div", { "class": "qh-pod-members", text: tm.members.map(function (pid) { return K.nameOf(state, pid); }).join("、") }),
          el("div", { "class": "qh-pod-pt", text: "答對 " + tm.correct + " 題" }),
          el("div", { "class": "qh-pod-bonus", text: "每人 +" + tm.bonus + " 分" })
        ]));
      });
      left.appendChild(el("div", { "class": "qh-final" }, [
        el("div", { "class": "qh-final-title", text: "🎉 迷因海公牛結束，組別排名揭曉！" }), pod,
        el("div", { "class": "qh-final-sub", text: BC.HOST_SUBTITLE || "" })
      ]));
    }

    function renderRight(board) {
      right.innerHTML = "";
      var st = state.status, T = K.teamsOf(state), t;
      if (st === "lobby" || showSetup) {
        var a = currentAssign(), un = B.GUESTS.length - Object.keys(a).length;
        right.appendChild(el("h2", { text: "👥 各組名單" }));
        for (t = 0; t < (T.count || effCount()); t++) {
          var mem = K.playersOfTeam(state, t);
          var rowT = el("div", { "class": "qh-team" }, [
            el("div", { "class": "qh-team-h", text: K.teamLabel(t) + "　" + mem.length + " 人" }),
            el("div", { "class": "qh-team-m", text: mem.length ? mem.map(function (pid) { return K.nameOf(state, pid); }).join("、") : "（還沒有人）" })
          ]);
          rowT.firstChild.style.background = K.teamColor(t); right.appendChild(rowT);
        }
        right.appendChild(el("div", { "class": "qh-team-out", text: "不玩 " + un + " 人" }));
        return;
      }
      right.appendChild(el("h2", { text: st === "ended" ? "🏆 組別排名" : "🏆 各組" }));
      var started = state.revealed >= 0, prog = st === "question" ? K.teamProgress(state, state.index) : null, buzz = K.isBuzz(state.index);
      var list = started || st === "ended" ? board.ranked.concat(board.teams.filter(function (x) { return x.size === 0; })) : board.teams;
      list.forEach(function (tm) {
        if (tm.size === 0) return;
        var sub = prog ? (buzz ? "已搶答 " : "已答 ") + prog[tm.team].answered + "/" + tm.size : (st === "ended" ? "每人 +" + tm.bonus + " 分" : tm.size + " 人");
        var row = el("div", { "class": "qh-trow" + (started && tm.rank <= 3 ? " top" : "") }, [
          el("span", { "class": "qh-rk r" + (started ? Math.min(tm.rank, 4) : 0), text: started ? String(tm.rank) : tm.icon }),
          el("div", { "class": "mid" }, [el("div", { "class": "nm", text: tm.icon + " " + tm.name }), el("div", { "class": "sub", text: sub })]),
          st === "reveal" && tm.gain > 0 ? el("span", { "class": "gain", text: "+" + tm.gain }) : null,
          el("span", { "class": "pt", text: started ? String(tm.score) : "" })
        ]);
        right.appendChild(row);
      });
      if (board.mode === "average") right.appendChild(el("div", { "class": "qh-hint", text: "（組別分數 = 平均每人答對題數）" }));
    }

    function update() {
      var board = K.scoreboard(state), st = state.status, joined = Object.keys(state.players).length, playing = K.assignedPids(state).length;
      var q = K.question(state.index), buzz = K.isBuzz(state.index), nextQ = upcoming();

      chip.className = "bh-chip" + (st === "question" ? " playing" : st === "ended" ? " ended" : "");
      chip.textContent = st === "lobby" ? "分組中" : st === "ended" ? "已結束" : st === "intro" ? "主題：" + K.category(state.index)
        : "第 " + K.displayNo(state.index) + "/" + K.total() + " 題" + (buzz ? " · 搶答" : "") + (st === "reveal" ? " · 揭曉" : "");
      if (st === "question") stat.textContent = (buzz ? "已搶答 " : "已作答 ") + K.answeredCount(state, state.index) + "/" + playing;
      else if (st === "reveal") {
        var ok = K.assignedPids(state).filter(function (pid) { return K.isCorrect(state, state.index, pid); }).length;
        stat.textContent = buzz ? "判定答對 " + ok + " 人" : "答對 " + ok + " / " + playing + " 人";
      } else if (st === "intro") stat.textContent = "";
      else stat.textContent = "已分組 " + playing + " 人 · " + (K.teamsOf(state).count || 0) + " 組 · 已進場 " + joined + "/" + B.GUESTS.length;

      // 秒數：出題前選（每換一題就回到那題的預設值）
      var willStart = nextQ >= 0 && (st === "intro" || ((st === "lobby" || st === "reveal") && !(QC.CATEGORY_INTRO !== false && K.isCatStart(nextQ))));
      if (nextQ !== secTarget) { secTarget = nextQ; secValue = null; }
      secSel.style.display = willStart ? "" : "none";
      if (nextQ >= 0) {
        var shown = String(pickSeconds(nextQ));
        if (![].some.call(secSel.options, function (o) { return o.value === shown; })) secSel.appendChild(el("option", { value: shown, text: "⏱ " + secLabel(shown) }));
        secSel.value = shown;
      }

      var nextIsIntro = nextQ >= 0 && QC.CATEGORY_INTRO !== false && K.isCatStart(nextQ) && st !== "intro";
      btnMain.textContent = st === "lobby" ? "開始測驗" : st === "intro" ? "開始作答 ›" : st === "reveal" ? (nextQ < 0 ? "公布最終排名" : nextIsIntro ? "下一個主題 ›" : "下一題 ›") : st === "question" ? "作答中…" : "已結束";
      btnMain.disabled = st === "question" || st === "ended" || (st === "lobby" && playing === 0);
      btnMain.title = st === "lobby" && playing === 0 ? "先分組（至少要有 1 個人）" : "";
      var dur = st === "question" ? K.secondsFor(state.index, state) : 0;
      btnAdd.style.display = st === "question" ? "" : "none";
      btnAdd.textContent = dur ? "+10 秒" : "倒數 10 秒";
      btnReveal.style.display = st === "question" ? "" : "none";
      btnReveal.textContent = dur ? "提前揭曉" : "揭曉答案";
      btnExtra.style.display = q && q.bonus && (st === "question" || st === "reveal") ? "" : "none";
      btnExtra.textContent = "🎁 加分 +" + (q && q.bonus ? q.bonus.points : "");
      btnEnd.disabled = st === "lobby" || st === "ended";
      btnTeams.style.display = st === "lobby" ? "none" : "";
      btnTeams.textContent = showSetup ? "回到題目" : "調整分組";
      var base = "按 H 可隱藏按鈕";
      conn.textContent = store.mode === "local" ? "🟡 本機測試模式　" + base : store.mode === "firebase" ? (connected ? "🟢 已連線　" : "🔴 連線中斷　") + base : base;

      // 左邊主畫面：分組畫面 / 分類封面 / 題目（同一題的「作答中 → 揭曉」沿用同一個畫面）/ 頒獎
      if (st === "lobby" || showSetup) {
        var sk = "setup:" + JSON.stringify(state.teams) + "|" + Object.keys(state.players).sort().join(",");
        if (leftKey !== sk) { buildSetup(); leftKey = sk; }
      }
      else if (st === "ended") { var k = "ended:" + board.ranked.slice(0, 3).map(function (r) { return r.team + ":" + r.correct; }).join(","); if (leftKey !== k) { buildPodium(board); leftKey = k; } }
      else if (st === "intro") { var ik = "intro" + state.index; if (leftKey !== ik) { buildIntro(); leftKey = ik; } }
      else if (q) {
        var qk = "q" + state.index + (st === "reveal" && q.answerImg ? ":ans" : "");      // 有答案圖時，揭曉才換畫面（影片不會被重開）
        if (leftKey !== qk) { buildQuestion(); leftKey = qk; }
        paintQuestion();
      }

      renderRight(board);
      renderExtra();
      tickClock();
    }

    // ---------- 倒數與自動揭曉 ----------
    function tickClock() {
      var rem = K.remaining(state, store.now());
      if (state.status === "question") {
        clock.textContent = rem == null ? "⏱ …" : rem === Infinity ? "⏱ 不倒數" : "⏱ " + Math.max(0, Math.ceil(rem));
        clock.className = "bh-clock run" + (rem != null && rem !== Infinity && rem <= 3 ? " low" : "");
        if (rem != null && rem !== Infinity && rem <= 0 && QC.AUTO_REVEAL !== false && autoFor !== state.index) { autoFor = state.index; store.reveal(state.index); }
      } else { clock.textContent = ""; clock.className = "bh-clock"; }
      if (state.status === "lobby") autoFor = -1;
      if (state.status === "question") tickBuzz();
    }
    setInterval(tickClock, 250);

    // ---------- 密碼 ----------
    function startListening() {
      store.subscribe(function (s) { state = s; update(); });
      if (store.onConnection) store.onConnection(function (ok) { connected = ok; update(); });
    }
    var needPin = opts.pin && !(function () { try { return (root.HostAuth && root.HostAuth.ok()) || sessionStorage.getItem(PIN_KEY) === "1"; } catch (e) { return false; } })();
    if (needPin) {
      var input = el("input", { type: "password", placeholder: "中控台密碼", autocomplete: "off" });
      var err = el("div", { "class": "err" });
      var gate = el("div", { "class": "bh-pin" });
      if (opts && opts.backHref) gate.appendChild(el("a", { "class": "bh-btn bh-back", href: opts.backHref, text: "‹ 回主持人入口" }));
      var form = el("form", {}, [el("h2", { text: "🔒 問答中控台" }), input, err, el("button", { "class": "bh-btn primary", type: "submit", text: "進入" })]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (input.value === opts.pin) { if (root.HostAuth) root.HostAuth.set(); try { sessionStorage.setItem(PIN_KEY, "1"); } catch (x) {} gate.remove(); startListening(); }
        else { err.textContent = "密碼不對"; input.value = ""; }
      });
      gate.appendChild(form); stage.appendChild(gate);
    } else startListening();
  }

  root.QuizGame = root.QuizGame || {};
  root.QuizGame.mountHost = mountHost;
})(typeof globalThis !== "undefined" ? globalThis : this);

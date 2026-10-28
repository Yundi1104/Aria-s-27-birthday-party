/**
 * 總排名／頒獎 — 中控台（投影用）
 * AwardGame.mountHost(容器, { bingo: 好友冰狗的 store, quiz: 迷因海公牛的 store, card: 陪酒小姐的 store }, 選項)
 *
 * 一進來就是「頒獎畫面」（不顯示任何分數，避免破梗）：三個禮物盒等著被打開。
 * 按「開始頒獎」（或空白鍵）一個一個揭曉：第 3 名 → 第 2 名 → 第 1 名，每一個都有不同等級的動畫。
 * 並列同名次的人會一起揭曉（例如並列第 2 名的兩個人同時上台）。
 * 主持人要先看總排名可以按「👀 偷看排名」（會劇透，投影時別開）。
 * 畫面固定 1280×720，再自動縮放到符合螢幕大小。
 */
(function (root) {
  "use strict";
  var B = root.BINGO_DATA, BC = B.CONFIG, QD = root.QUIZ_DATA, AC = root.AWARD_DATA.CONFIG, AW = root.AwardCore, C = root.BingoCore, CC_ = root.CardCore, el = C.el;
  var PIN_KEY = "ariaAward.hostok";
  var MEDALS = ["🥇", "🥈", "🥉"];

  function mountHost(host, stores, opts) {
    opts = opts || {};
    var bState = null, qState = null, cState = null, rows = [], frozen = null, mode = "stage", step = 0, busy = false, timers = [], muted = false, quakeTimer = null;
    var N = AC.PRIZE_COUNT || 3;

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
    var chip = el("span", { "class": "bh-chip", text: "頒獎" });
    var src = el("span", { "class": "bh-stat" });
    var btnMain = el("button", { "class": "bh-btn primary", type: "button", onclick: onMain });
    var btnPeek = el("button", { "class": "bh-btn", type: "button", text: "👀 偷看排名（會劇透）", onclick: function () { goPeek(true); } });
    var btnSound = el("button", { "class": "bh-btn", type: "button", text: "🔊 音效", onclick: function () { muted = !muted; btnSound.textContent = muted ? "🔇 靜音" : "🔊 音效"; } });
    var controls = el("div", { "class": "bh-controls" }, [btnMain, btnPeek, btnSound]);
    stage.appendChild(el("div", { "class": "bh-header" }, [
      el("div", { "class": "bh-titlebox" }, [
        el("div", { "class": "bh-title", text: BC.HOST_TITLE || "派對" }),
        BC.HOST_SUBTITLE ? el("div", { "class": "bh-sub", text: BC.HOST_SUBTITLE }) : null
      ]),
      chip, el("span", { "class": "bh-spacer" }), controls
    ]));
    var main = el("div", { "class": "aw-main" });
    var fx = el("div", { "class": "aw-fx" });
    stage.appendChild(main); stage.appendChild(fx);

    // ---------- 時間（測試時可以加速：window.AWARD_SPEED）----------
    function speed() { return root.AWARD_SPEED || 1; }
    function T(ms, fn) { timers.push(setTimeout(fn, ms / speed())); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ---------- 音效（Web Audio 合成，沒有檔案；瀏覽器不支援就靜音）----------
    var actx = null;
    function audio() {
      if (muted) return null;
      if (!actx) { try { var AC_ = root.AudioContext || root.webkitAudioContext; if (AC_) actx = new AC_(); } catch (e) { actx = null; } }
      if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
      return actx;
    }
    function tone(freq, at, dur, type, vol) {
      var a = audio(); if (!a) return;
      try {
        var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + at;
        o.type = type || "triangle"; o.frequency.value = freq; o.connect(g); g.connect(a.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.start(t0); o.stop(t0 + dur + 0.05);
      } catch (e) {}
    }
    function drumroll(sec) {                                     // 越敲越快的鼓聲
      var t = 0, gap = 0.16;
      while (t < sec) { tone(110 + Math.random() * 30, t, 0.08, "square", 0.05 + 0.12 * (t / sec)); t += gap; gap = Math.max(0.05, gap * 0.93); }
    }
    function fanfare(lv) {
      var seq = lv === 3 ? [523, 659, 784, 1047, 784, 1047, 1319] : lv === 2 ? [523, 659, 784, 1047] : [523, 784, 1047];
      seq.forEach(function (f, i) { tone(f, i * 0.13, i === seq.length - 1 ? 0.9 : 0.22, "triangle", 0.2); tone(f / 2, i * 0.13, 0.3, "sine", 0.1); });
    }

    // ---------- 特效零件 ----------
    function fxAdd(node, lifeMs) { fx.appendChild(node); if (lifeMs) T(lifeMs * speed(), function () { if (node.parentNode) node.parentNode.removeChild(node); }); return node; }
    function confetti(n, life) {
      var layer = el("div", { "class": "aw-confetti" }), bits = ["🎉", "✨", "🎊", "⭐", "💛", "💙", "🎈"];
      for (var i = 0; i < n; i++) {
        var b = el("span", { text: bits[i % bits.length] });
        b.style.left = (Math.random() * 100) + "%"; b.style.animationDelay = (Math.random() * 1.2) + "s"; b.style.fontSize = (22 + Math.random() * 26) + "px";
        layer.appendChild(b);
      }
      fxAdd(layer, life || 4600);
    }
    function cannons(n) {                                          // 左右兩邊斜向噴出
      var layer = el("div", { "class": "aw-cannon" });
      for (var i = 0; i < n; i++) {
        var left = i % 2 === 0, b = el("span", { text: ["🎉", "🎊", "✨", "⭐"][i % 4] });
        b.style.left = left ? "2%" : "96%"; b.style.setProperty("--dx", (left ? 1 : -1) * rand(220, 760) + "px"); b.style.setProperty("--dy", -rand(380, 640) + "px");
        b.style.animationDelay = (Math.random() * 0.5) + "s"; b.style.fontSize = (24 + Math.random() * 22) + "px";
        layer.appendChild(b);
      }
      fxAdd(layer, 3600);
    }
    function firework(x, y, hue) {
      var layer = el("div", { "class": "aw-firework" });
      layer.style.left = x + "px"; layer.style.top = y + "px";
      for (var i = 0; i < 22; i++) {
        var a = (i / 22) * Math.PI * 2, d = rand(90, 190), s = el("span", { "class": "aw-spark" });
        s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d + "px"); s.style.background = "hsl(" + (hue + rand(-20, 30)) + " 100% 62%)";
        layer.appendChild(s);
      }
      fxAdd(layer, 1300);
    }
    function fireworksBarrage(n, spanMs) {
      for (var i = 0; i < n; i++) T(i * (spanMs / n) * speed(), function () { firework(rand(140, 1140), rand(120, 420), Math.floor(rand(0, 360))); });
    }
    function rings(n, cls) {
      for (var i = 0; i < n; i++) T(i * 260 * speed(), function () { fxAdd(el("div", { "class": "aw-ring " + (cls || "") }), 1300); });
    }
    function flash(strong) { fxAdd(el("div", { "class": "aw-flash" + (strong ? " strong" : "") }), 800); }
    function quake() {
      stage.classList.add("aw-quake"); clearTimeout(quakeTimer);
      quakeTimer = setTimeout(function () { stage.classList.remove("aw-quake"); }, 650 / speed());
    }

    // ---------- 鍵盤 ----------
    document.addEventListener("keydown", function (e) {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "h" || e.key === "H") stage.classList.toggle("hide-ctl");
      if (e.key === "m" || e.key === "M") btnSound.click();
      if ((e.key === "p" || e.key === "P") && !busy) goPeek(mode !== "peek");
      if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); if (!btnMain.disabled) onMain(); }
    });

    function statusText(st) { return st === "playing" || st === "question" || st === "reveal" ? "進行中" : st === "ended" ? "已結束" : "尚未開始"; }
    function liveRows() { return opts.rowsProvider ? opts.rowsProvider(bState, qState, cState) : AW.combine(bState, qState, cState); }   // rowsProvider：預覽用，可以丟假的名單來看並列的效果
    function shown() { return frozen || rows; }
    function sequence() { return AW.prizeGroups(shown(), N).groups.slice().sort(function (a, b) { return b.rank - a.rank; }); }   // 揭曉順序：名次大的先（第 3 名 → 第 1 名）

    function goPeek(on) {
      if (busy) return;
      mode = on ? "peek" : "stage"; update();
    }
    function onMain() {
      if (busy) return;
      if (mode === "peek") { goPeek(false); return; }
      var seq = sequence();
      if (!seq.length) return;
      if (step === 0 && !frozen) frozen = rows.slice();            // 頒獎開始後分數就固定，中途不會再變
      if (step < seq.length) playReveal(seq[step], step === seq.length - 1);
      else { clearTimers(); step = 0; frozen = null; update(); }   // 揭曉完再按一次 = 從頭再來一次
    }

    // ---------- 頒獎畫面 ----------
    function arrange(w) {                                          // 領獎台排列：中間第 1 名、左邊第 2、右邊第 3
      if (w.length <= 1) return w.slice();
      if (w.length === 2) return [w[1], w[0]];
      var out = [w[1], w[0], w[2]]; for (var i = 3; i < w.length; i++) out.push(w[i]);
      return out;
    }
    function breakdown(r) { return "冰狗 " + r.bingo + " ＋ 海公牛 " + r.quiz + " ＋ 小姐 " + (r.card || 0); }
    function renderStage() {
      main.innerHTML = ""; main.className = "aw-main award";
      var R = shown(), pg = AW.prizeGroups(R, N), seq = sequence(), done = seq.length > 0 && step >= seq.length;
      var revealed = {}; seq.slice(0, step).forEach(function (g) { revealed[g.rank] = true; });
      var pod = el("div", { "class": "aw-podium" });
      arrange(pg.winners).forEach(function (r) {
        var on = !!revealed[r.rank], hcls = "h" + Math.min(r.rank, 4);
        var slot = el("div", { "class": "aw-slot " + hcls + (on ? " shown r" + Math.min(r.rank, 3) : ""), "data-rank": String(r.rank), "data-name": on ? r.name : "" });
        var card = el("div", { "class": "aw-card" });
        if (on) {
          card.appendChild(el("div", { "class": "medal", text: r.rank <= 3 ? MEDALS[r.rank - 1] : "🎖️" }));
          card.appendChild(el("div", { "class": "name", text: r.name }));
          card.appendChild(el("div", { "class": "total", text: r.total + " 分" }));
          card.appendChild(el("div", { "class": "brk", text: breakdown(r) }));
          if (r.tied) card.appendChild(el("div", { "class": "tag", text: "並列第 " + r.rank + " 名" }));
          else if (r.tieBroken) card.appendChild(el("div", { "class": "tag", text: r.tieNote }));
        } else card.appendChild(el("div", { "class": "gift", text: "🎁" }));
        slot.appendChild(card);
        slot.appendChild(el("div", { "class": "aw-step" }, [el("span", { text: on ? "第 " + r.rank + " 名" : "？" })]));
        pod.appendChild(slot);
      });
      if (!pg.winners.length) pod.appendChild(el("div", { "class": "bh-empty big", text: "還沒有分數：好友冰狗有人連成 3 條、迷因海公牛有題目揭曉後才能頒獎" }));
      main.appendChild(el("div", { "class": "aw-stagebox" }, [
        el("div", { "class": "aw-title" + (done ? " done" : ""), text: done ? "🎉 恭喜得獎的朋友！" : "🎁 頒獎時間" }),
        done && BC.HOST_SUBTITLE ? el("div", { "class": "aw-sub", text: BC.HOST_SUBTITLE }) : null,
        pod
      ]));
    }

    // ---------- 揭曉動畫（第 3 名 → 第 2 名 → 第 1 名，一個比一個盛大）----------
    function playReveal(group, last) {
      busy = true; update();
      var lv = group.rank <= 1 ? 3 : group.rank === 2 ? 2 : 1;
      var multi = group.members.length > 1, names = group.members.map(function (m) { return m.name; }).join(" ＆ ");
      var rankText = (multi ? "並列第 " : "第 ") + group.rank + " 名";
      var suspense = [0, 1800, 2800, 4600][lv], hold = [0, 2400, 3000, 4800][lv];

      // 要被打開的禮物盒開始抖
      [].slice.call(main.querySelectorAll(".aw-slot")).forEach(function (s) { if (Number(s.getAttribute("data-rank")) === group.rank) s.classList.add("shaking"); });

      // 懸疑：畫面變暗、聚光燈、大禮物盒抖動、倒數、（第 2、1 名）名字輪盤
      var ov = fxAdd(el("div", { "class": "aw-ov lv" + lv }));
      ov.appendChild(el("div", { "class": "aw-dim" })); ov.appendChild(el("div", { "class": "aw-beam b1" })); ov.appendChild(el("div", { "class": "aw-beam b2" }));
      var big = el("div", { "class": "aw-bigbox", text: "🎁" }), say = el("div", { "class": "aw-say", text: rankText + "是…" });
      var count = el("div", { "class": "aw-count" }), roul = lv >= 2 ? el("div", { "class": "aw-roulette" }) : null;
      ov.appendChild(say); ov.appendChild(big); if (roul) ov.appendChild(roul); ov.appendChild(count);
      drumroll(suspense / 1000);
      if (roul) {
        var pool = shown().map(function (r) { return r.name; }).sort(function () { return Math.random() - 0.5; });
        if (pool.length < 4) pool = pool.concat(["？？？", "…", "!!"]);
        var t0 = Date.now(), delay = 55, i = 0, total = (suspense - 500) / speed();
        (function tick() {
          if (!ov.parentNode) return;
          if (Date.now() - t0 >= total) { roul.textContent = names; roul.className = "aw-roulette locked"; return; }
          roul.textContent = pool[(i++) % pool.length]; delay = Math.min(360, delay * 1.085);
          timers.push(setTimeout(tick, delay / speed()));
        })();
      }
      if (lv >= 2) [3, 2, 1].forEach(function (n, k) { T(suspense - 1500 + k * 450 - (lv === 3 ? 0 : 0), function () { count.textContent = String(n); count.classList.remove("pop"); void count.offsetWidth; count.classList.add("pop"); }); });
      T(suspense - 120, function () { count.textContent = ""; });

      // 爆開！
      T(suspense, function () {
        big.classList.add("burst"); say.textContent = ""; say.style.display = "none"; if (roul && roul.parentNode) roul.parentNode.removeChild(roul);
        flash(lv === 3); quake(); fanfare(lv);
        rings(lv === 3 ? 3 : lv === 2 ? 2 : 1, lv === 3 ? "gold" : "");
        confetti(lv === 3 ? 130 : lv === 2 ? 70 : 40);
        if (lv >= 2) cannons(lv === 3 ? 36 : 18);
        if (lv === 3) fireworksBarrage(10, 3600); else fireworks_(lv === 2 ? 4 : 2);
        // 宣布卡
        var ann = el("div", { "class": "aw-ann lv" + lv });
        if (lv === 3) { ann.appendChild(el("div", { "class": "aw-rays" })); ann.appendChild(el("div", { "class": "aw-crown", text: "👑" })); }
        ann.appendChild(el("div", { "class": "aw-medal", text: group.rank <= 3 ? MEDALS[group.rank - 1] : "🎖️" }));
        ann.appendChild(el("div", { "class": "aw-ann-rank", text: rankText }));
        var wrap = el("div", { "class": "aw-ann-names" + (multi ? " multi" : "") });
        group.members.forEach(function (m) {
          wrap.appendChild(el("div", { "class": "aw-ann-one" }, [
            el("div", { "class": "aw-ann-name", text: m.name }), el("div", { "class": "aw-ann-score", text: m.total + " 分" }), el("div", { "class": "aw-ann-brk", text: breakdown(m) })
          ]));
        });
        ann.appendChild(wrap);
        var note = group.members[0].tied ? "同分 " + group.members[0].total + "，並列第 " + group.rank + " 名" : group.members[0].tieBroken ? group.members[0].tieNote : "";
        if (note) ann.appendChild(el("div", { "class": "aw-ann-note", text: note }));
        if (lv === 3) ann.appendChild(el("div", { "class": "aw-trophy", text: "🏆" }));
        ov.appendChild(ann);
      });
      function fireworks_(n) { for (var k = 0; k < n; k++) T(k * 300, function () { firework(rand(200, 1080), rand(140, 400), Math.floor(rand(0, 360))); }); }

      // 收尾：宣布卡淡出，領獎台上的那一格打開
      T(suspense + hold, function () { ov.classList.add("out"); });
      T(suspense + hold + 450, function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        step++; busy = false; update();
        if (last) { confetti(60, 5200); cannons(14); }
      });
    }

    // ---------- 偷看總排名（主持人用，會劇透）----------
    function renderPeek() {
      main.innerHTML = ""; main.className = "aw-main rank";
      var list = el("div", { "class": "aw-list" });
      list.appendChild(el("div", { "class": "aw-warn", text: "⚠️ 這是主持人用的畫面，會劇透。投影時請先回到頒獎畫面（按 P）" }));
      list.appendChild(el("div", { "class": "aw-row head" }, [
        el("span", { "class": "rk", text: "名次" }), el("span", { "class": "nm", text: "名字" }),
        el("span", { "class": "n", text: "冰狗" }), el("span", { "class": "n", text: "海公牛" }), el("span", { "class": "n", text: "小姐" }), el("span", { "class": "t", text: "總分" })
      ]));
      rows.slice(0, 10).forEach(function (r) {
        list.appendChild(el("div", { "class": "aw-row" + (r.rank <= N ? " prize" : "") }, [
          el("span", { "class": "rk r" + Math.min(r.rank, 4), text: String(r.rank) }),
          el("span", { "class": "nm" }, [r.name, r.tieNote ? el("small", { text: r.tieNote }) : null]),
          el("span", { "class": "n", text: String(r.bingo) }), el("span", { "class": "n", text: String(r.quiz) }), el("span", { "class": "n", text: String(r.card || 0) }),
          el("span", { "class": "t", text: String(r.total) })
        ]));
      });
      if (!rows.length) list.appendChild(el("div", { "class": "bh-empty", text: "還沒有分數：好友冰狗有人連成 3 條、迷因海公牛有題目揭曉後就會出現" }));
      main.appendChild(list);

      var pg = AW.prizeGroups(rows, N);
      var P = BC.POINTS || [], pts = P.slice(0, 3).join("、") + (P.length > 3 ? "…" : "") + "、之後 " + BC.POINTS_AFTER, QCF = QD.CONFIG, tb = (QCF.TEAM_BONUS || []).join(" / ");
      main.appendChild(el("div", { "class": "bh-panel aw-side" }, [
        el("h2", { text: "怎麼算" }),
        el("p", { text: "總分 = 好友冰狗 + 迷因海公牛 + 陪酒小姐" + (AC.WEIGHT_BINGO !== 1 || AC.WEIGHT_QUIZ !== 1 || AC.WEIGHT_CARD !== 1 ? "（倍率 " + AC.WEIGHT_BINGO + " / " + AC.WEIGHT_QUIZ + " / " + AC.WEIGHT_CARD + "）" : "") }),
        el("p", { text: "好友冰狗：先連成 " + BC.LINES_TO_WIN + " 條的人依序拿分（第 1、2、3 名 = " + pts + "）；第 " + BC.EXTRA_FROM_LINE + " 條起每多一條 +" + BC.EXTRA_LINE_POINTS + "（不論名次）" }),
        el("p", { text: "迷因海公牛：每答對 1 題 +" + QCF.POINTS_PER_CORRECT + "（搶答題由主持人判定）；最後依組別名次，該組每人再加 " + tb + " 分；額外加分（例如全文背誦）只加個人" }),
        el("p", { text: "陪酒小姐：每抽一張牌，抽到數字幾就 +幾分（A=1、J=11、Q=12、K=13）" }),
        el("p", { "class": "gold", text: "🎁 前 " + N + " 名有獎品" }),
        pg.extra > 0 ? el("p", { "class": "warn", text: "⚠️ 目前有 " + pg.winners.length + " 位得獎（完全同分，加賽規則也分不出），需要多準備 " + pg.extra + " 份禮物" }) : null,
        el("p", { "class": "small", text: "同分並列同名次；只有並列會讓得獎人超過 " + N + " 位時，才依「迷因海公牛分數 → 較早連成 3 條 → 線數 → 答對題數」分出先後。" }),
        el("div", { "class": "aw-src" }, [
          el("div", { text: "好友冰狗：" + statusText(bState && bState.status) }),
          el("div", { text: "迷因海公牛：" + statusText(qState && qState.status) }),
          el("div", { text: "陪酒小姐：" + statusText(cState && (cState.status === "playing" && CC_.allFinished(cState) ? "ended" : cState.status)) })
        ])
      ]));
    }

    function update() {
      rows = liveRows();
      var seq = sequence(), peek = mode === "peek";
      src.textContent = "冰狗 " + statusText(bState && bState.status) + "　海公牛 " + statusText(qState && qState.status) + "　小姐 " + statusText(cState && (cState.status === "playing" && CC_.allFinished(cState) ? "ended" : cState.status));
      chip.textContent = peek ? "總排名（劇透）" : "頒獎";
      btnMain.textContent = peek ? "← 回到頒獎畫面" : busy ? "揭曉中…" : step === 0 ? "🎁 開始頒獎" : step < seq.length ? "揭曉下一個 ›" : "再看一次";
      btnMain.disabled = busy || (!peek && !seq.length);
      btnPeek.style.display = peek ? "none" : "";
      btnPeek.disabled = busy;
      if (busy) return;                                            // 動畫進行中不重畫領獎台
      if (peek) renderPeek(); else renderStage();
    }

    // ---------- 密碼 ----------
    function startListening() {
      stores.bingo.subscribe(function (s) { bState = s; update(); });
      stores.quiz.subscribe(function (s) { qState = s; update(); });
      if (stores.card) stores.card.subscribe(function (s) { cState = s; update(); });
    }
    var needPin = opts.pin && !(function () { try { return sessionStorage.getItem(PIN_KEY) === "1"; } catch (e) { return false; } })();
    if (needPin) {
      var input = el("input", { type: "password", placeholder: "中控台密碼", autocomplete: "off" });
      var err = el("div", { "class": "err" });
      var gate = el("div", { "class": "bh-pin" });
      var form = el("form", {}, [el("h2", { text: "🔒 頒獎中控台" }), input, err, el("button", { "class": "bh-btn primary", type: "submit", text: "進入" })]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (input.value === opts.pin) { try { sessionStorage.setItem(PIN_KEY, "1"); } catch (x) {} gate.remove(); startListening(); }
        else { err.textContent = "密碼不對"; input.value = ""; }
      });
      gate.appendChild(form); stage.appendChild(gate);
    } else startListening();

    return { refresh: function () { frozen = null; step = 0; if (!busy) update(); } };
  }

  root.AwardGame = root.AwardGame || {};
  root.AwardGame.mountHost = mountHost;
})(typeof globalThis !== "undefined" ? globalThis : this);

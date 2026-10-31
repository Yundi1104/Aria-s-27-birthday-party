/**
 * 社交賓果 — 中控台（投影用）
 * BingoGame.mountHost(容器, store, 選項)
 * 畫面固定設計成 1280×720（16:9），再自動縮放到符合螢幕大小。
 */
(function (root) {
  "use strict";
  var D = root.BINGO_DATA, C = root.BingoCore, el = C.el, CFG = D.CONFIG;
  var PIN_KEY = "ariaBingo.hostok";

  function mountHost(host, store, opts) {
    opts = opts || {};
    var state = { status: "lobby", startedAt: null, players: {} };
    var connected = true, prevCounts = null, modalPid = null, armed = false, armTimer = null;
    var popQueue = [], popBusy = false, pulseUntil = {};

    host.innerHTML = "";
    var viewport = el("div", { "class": "bh-viewport" });
    var stage = el("div", { "class": "bh-stage" });
    viewport.appendChild(stage);
    host.appendChild(viewport);

    function fit() {
      var w = viewport.clientWidth || 1280, h = viewport.clientHeight || 720;
      var s = Math.min(w / 1280, h / 720);
      stage.style.transform = "translate(" + ((w - 1280 * s) / 2) + "px," + ((h - 720 * s) / 2) + "px) scale(" + s + ")";
    }
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(viewport);
    window.addEventListener("resize", fit);
    fit();

    // ---------- 上方列 ----------
    var chip = el("span", { "class": "bh-chip" });
    var clock = el("span", { "class": "bh-clock", title: "這局剩餘時間" });
    var stat = el("span", { "class": "bh-stat" });
    var conn = el("span", { "class": "bh-conn" });
    var btnStart = el("button", { "class": "bh-btn primary", type: "button", onclick: onStart });
    // 遊戲進行中要調整剩餘時間：用下拉選單（選了就加／減，選完會跳回「調整時間」），不佔一排按鈕
    chip.style.display = "none";                                                  // 「進行中／已結束」小標籤不顯示了（內容還是會更新，方便測試和除錯）
    var timeSel = el("select", { "class": "qh-secsel bh-timesel", title: "調整剩餘時間" });
    timeSel.appendChild(el("option", { value: "", text: "⏱ 調整時間" }));
    [[1, "＋ 1 分鐘"], [5, "＋ 5 分鐘"], [10, "＋ 10 分鐘"], [30, "＋ 30 分鐘"], [60, "＋ 1 小時"], [-1, "－ 1 分鐘"], [-5, "－ 5 分鐘"]].forEach(function (x) { timeSel.appendChild(el("option", { value: String(x[0] * 60), text: x[1] })); });
    timeSel.addEventListener("change", function () {
      var v = Number(timeSel.value); timeSel.value = ""; if (!v) return;
      if (v < 0) { var r = remainingSec(); if (r == null || r <= -v + 10) return; }          // 減時間時，至少要留 10 秒
      store.extend(v);
    });
    // 這局要倒數多久：開始前由主持人選（預設 = bingo-data.js 的 GAME_MINUTES；0 = 不限時，主持人自己按「結束遊戲」）
    var minutes = CFG.GAME_MINUTES || 0;
    var minSel = el("select", { "class": "qh-secsel bh-minsel", title: "這局倒數幾分鐘" });
    (CFG.MINUTE_CHOICES || [3, 5, 10, 15, 20, 30, 45, 60, 0]).concat(minutes && (CFG.MINUTE_CHOICES || [3, 5, 10, 15, 20, 30, 45, 60, 0]).indexOf(minutes) < 0 ? [minutes] : []).forEach(function (m) {
      minSel.appendChild(el("option", { value: String(m), text: "⏱ " + (m ? m + " 分鐘" : "不限時") }));
    });
    minSel.value = String(minutes);
    minSel.addEventListener("change", function () { minutes = Number(minSel.value); tickClock(); });
    var btnEnd = el("button", { "class": "bh-btn", type: "button", text: "結束遊戲", onclick: function () { store.setStatus("ended"); } });
    var btnReset = el("button", { "class": "bh-btn danger", type: "button", text: "重置", onclick: onReset });
    var controls = el("div", { "class": "bh-controls" }, [minSel, btnStart, timeSel, btnEnd, btnReset]);
    // 「‹ 中控台」：回到主持人入口（host-index.html）。由頁面傳 backHref 進來；按 H 把按鈕藏起來時它也會藏起來
    if (opts && opts.backHref) controls.insertBefore(el("a", { "class": "bh-btn bh-back", href: opts.backHref, text: "‹ 中控台" }), controls.firstChild);
    stage.appendChild(el("div", { "class": "bh-header" }, [
      el("div", { "class": "bh-titlebox" }, [
        el("div", { "class": "bh-title", text: "好友冰狗" }),                          // 寫遊戲名稱，投影出來大家才知道是什麼遊戲
        CFG.HOST_SUBTITLE ? el("div", { "class": "bh-sub", text: CFG.HOST_SUBTITLE }) : null
      ]),
      chip, clock, stat,
      el("span", { "class": "bh-spacer" }), controls
    ]));

    function totalSec() { return Math.round((minutes || 0) * 60); }
    function onStart() { store.setStatus("playing", { durationSec: totalSec() }); }

    // ---------- 倒數 ----------
    var autoEnded = false;
    function fmt(sec) {
      sec = Math.max(0, sec);
      var m = Math.floor(sec / 60), r = sec % 60;
      return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
    }
    function remainingSec() {
      if (state.status !== "playing" || !state.startedAt || !state.durationSec) return null;
      return Math.ceil((state.startedAt + state.durationSec * 1000 - store.now()) / 1000);
    }
    function tickClock() {
      var rem = remainingSec(), low = false, text;
      if (state.status === "playing" && rem == null) text = "不限時";
      else if (state.status === "playing" && rem != null) {
        text = fmt(rem); low = rem <= 60;
        if (rem <= 0 && CFG.AUTO_END !== false && !autoEnded) { autoEnded = true; store.setStatus("ended"); }
      } else if (state.status === "ended") {
        text = state.startedAt && state.durationSec && (state.startedAt + state.durationSec * 1000 - store.now()) <= 0 ? "時間到" : "已結束";
      } else {
        text = totalSec() ? fmt(totalSec()) : "不限時";
      }
      if (state.status !== "playing") autoEnded = false;
      clock.textContent = text ? "⏱ " + text : "";
      clock.className = "bh-clock" + (state.status === "playing" ? " run" : "") + (low ? " low" : "") + (state.status === "ended" ? " done" : "");
    }
    setInterval(tickClock, 500);

    function onReset() {
      if (!armed) {
        armed = true; btnReset.textContent = "再按一次確定重置"; btnReset.classList.add("armed");
        armTimer = setTimeout(disarm, 3500);
      } else {
        disarm(); prevCounts = null; popQueue = []; modalPid = null; store.reset();
      }
    }
    function disarm() {
      armed = false; clearTimeout(armTimer);
      btnReset.textContent = "重置"; btnReset.classList.remove("armed");
    }

    document.addEventListener("keydown", function (e) {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "h" || e.key === "H") controls.classList.toggle("hidden");
    });

    // ---------- 主畫面 ----------
    var COLS = 7, rows = Math.ceil(D.GUESTS.length / COLS);                      // 21 位 = 7 欄 × 3 列：每張小卡夠高，5×5 的格子完整顯示
    var grid = el("div", { "class": "bh-grid" });
    grid.style.gridTemplateColumns = "repeat(" + COLS + ",1fr)"; grid.style.gridTemplateRows = "repeat(" + rows + ",1fr)";
    var panelDone = el("div", { "class": "bh-panel", style: "flex:1;overflow:hidden;" });
    var panelChase = el("div", { "class": "bh-panel" });
    stage.appendChild(el("div", { "class": "bh-main" }, [
      grid,
      el("div", { "class": "bh-side" }, [panelDone, panelChase, el("div", { "class": "bh-hint" }, [conn])])
    ]));

    var modal = el("div", { "class": "bh-modal", style: "display:none;" });
    modal.addEventListener("click", function (e) { if (e.target === modal) { modalPid = null; renderModal(); } });
    stage.appendChild(modal);

    // ---------- 每連成一條線的大特效 ----------
    // 第 1 條：中等；第 2 條以上：更大；連成目標條數（拿分那一刻）：全螢幕最大，閃光 + 彩帶 + 名次
    function confetti(n) {
      var layer = el("div", { "class": "bh-confetti" }), bits = ["🎉", "✨", "🎊", "⭐", "💛", "💙"];
      for (var i = 0; i < n; i++) {
        var b = el("span", { text: bits[i % bits.length] });
        b.style.left = (Math.random() * 100) + "%"; b.style.animationDelay = (Math.random() * 0.9) + "s"; b.style.fontSize = (22 + Math.random() * 26) + "px";
        layer.appendChild(b);
      }
      stage.appendChild(layer);
      setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 4200);
    }
    function renderPop(ev) {
      var need = CFG.LINES_TO_WIN, lv = ev.justFinished ? 3 : (ev.count >= 2 ? 2 : 1);
      var what = ev.justFinished ? "🏆 第 " + ev.rank + " 個連成 " + need + " 條！ +" + ev.points + " 分"
               : ev.count === 1 ? "連成第 1 條！" : ev.count < need ? "連成第 " + ev.count + " 條！" : "連成第 " + ev.count + " 條！";
      if (ev.extraGain > 0) what += "　額外賽 +" + ev.extraGain + " 分";
      var pop = el("div", { "class": "bh-pop lv" + lv }, [
        el("div", { "class": "rings" }), el("div", { "class": "big", text: ev.justFinished ? "🏆" : lv === 2 ? "🔥" : "🎉" }),
        el("div", { "class": "who", text: ev.name }), el("div", { "class": "what", text: what })
      ]);
      stage.appendChild(pop);
      confetti(lv === 3 ? 60 : lv === 2 ? 30 : 14);
      if (lv === 3) { var fl = el("div", { "class": "bh-flash" }); stage.appendChild(fl); setTimeout(function () { if (fl.parentNode) fl.parentNode.removeChild(fl); }, 700); }
      var life = lv === 3 ? 3500 : 2300;
      setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, life);
      return life + 150;
    }
    function runPop() {
      if (popBusy || !popQueue.length) return;
      popBusy = true;
      var gap = renderPop(popQueue.shift());
      setTimeout(function () { popBusy = false; runPop(); }, gap);
    }
    function queuePop(ev) {
      popQueue.push(ev);
      while (popQueue.length > 5) { var k = popQueue.findIndex(function (x) { return !x.justFinished; }); popQueue.splice(k < 0 ? 0 : k, 1); }   // 一次來太多時，優先保留「拿分」的特效
      pulseUntil[ev.pid] = Date.now() + 3600; setTimeout(update, 3700);                                                                   // 那張小卡片也會閃一下
      runPop();
    }
    function fmtTime(ts) {
      var d = new Date(Number(ts) || 0), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      return p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
    }

    function miniCard(guestName, pid, r) {
      var need = CFG.LINES_TO_WIN;
      var card = el("div", { "class": "bh-card" + (r ? "" : " empty") + (r && r.rank ? " done" : "") + (pulseUntil[pid] > Date.now() ? " pulse" : ""), "data-pid": pid });
      var badge;
      if (!r) badge = el("span", { "class": "bh-badge", text: "未簽到" });
      else if (r.rank) badge = el("span", { "class": "bh-badge rank", text: "🏆 第" + r.rank });
      else badge = el("span", { "class": "bh-badge n" + Math.min(r.board.count, 3), text: r.board.count + "/" + need });
      card.appendChild(el("div", { "class": "bh-card-top" }, [el("span", { "class": "bh-name", text: guestName }), badge]));
      var mini = el("div", { "class": "bh-mini" });
      for (var i = 0; i < 25; i++) {
        var cls = "bh-cell";
        if (r && r.board.posMarked[i]) cls += r.board.inLine[i] ? " line" : " on";
        mini.appendChild(el("div", { "class": cls }));
      }
      card.appendChild(mini);
      if (r) card.addEventListener("click", function () { modalPid = pid; renderModal(); });
      return card;
    }

    function renderModal() {
      modal.innerHTML = "";
      var comp = C.compute(state), r = null;
      comp.rows.forEach(function (x) { if (x.pid === modalPid) r = x; });
      if (!modalPid || !r) { modal.style.display = "none"; return; }
      modal.style.display = "flex";
      var cells = C.cellMap(), big = el("div", { "class": "bh-big" });
      r.board.order.forEach(function (id, pos) {
        var c = cells[id], on = r.board.posMarked[pos];
        var cls = "bh-bigcell" + (on ? (r.board.inLine[pos] ? " line" : " on") : "");
        var kids = [C.qNode(c.q)];
        if (on) kids.push(el("b", { text: c.show || c.a || "✓" }));
        big.appendChild(el("div", { "class": cls }, kids));
      });
      modal.appendChild(el("div", { "class": "bh-modal-in" }, [
        el("h2", {}, [r.name + (r.rank ? "　🏆 第" + r.rank + "名" : ""),
          el("small", { text: "連線 " + r.board.count + " 條・答對 " + r.board.markedCount + " 格　（點空白處關閉）" })]),
        big
      ]));
    }

    function update() {
      var comp = C.compute(state), need = CFG.LINES_TO_WIN, byPid = {};
      comp.rows.forEach(function (r) { byPid[r.pid] = r; });

      // 有人每多連成一條 → 大特效
      var counts = {};
      comp.rows.forEach(function (r) { counts[r.pid] = r.board.count; });
      if (state.status === "lobby") { popQueue = []; }
      if (prevCounts) {
        comp.rows.forEach(function (r) {
          var before = prevCounts[r.pid] || 0;
          if (r.board.count > before) {
            var fin = !!r.rank && before < need && r.board.count >= need;
            queuePop({ name: r.name, pid: r.pid, count: r.board.count, justFinished: fin, rank: fin ? r.rank : null, points: fin ? r.points : 0, extraGain: C.extraPoints(r.board.count) - C.extraPoints(before) });
          }
        });
      }
      prevCounts = counts;

      // 狀態
      chip.className = "bh-chip" + (state.status === "playing" ? " playing" : state.status === "ended" ? " ended" : "");
      chip.textContent = state.status === "playing" ? "進行中" : state.status === "ended" ? "已結束" : "等待開始";
      stat.textContent = "已簽到 " + comp.rows.length + "/" + D.GUESTS.length;
      btnStart.textContent = state.status === "ended" ? "繼續遊戲" : "開始遊戲";
      btnStart.disabled = state.status === "playing";
      timeSel.style.display = state.status === "playing" && state.durationSec ? "" : "none";
      minSel.style.display = state.status === "playing" ? "none" : "";
      btnEnd.disabled = state.status !== "playing";
      var base = "點任一張卡片可看詳細盤面．按 H 可隱藏按鈕";
      if (store.mode === "local") { conn.textContent = "🟡 本機測試模式　" + base; }
      else if (store.mode === "firebase") { conn.textContent = (connected ? "🟢 已連線　" : "🔴 連線中斷　") + base; }
      else conn.textContent = base;
      tickClock();

      // 所有人的卡片（位置固定，不會跳來跳去）
      grid.innerHTML = "";
      D.GUESTS.forEach(function (g, i) { var pid = C.guestId(i); grid.appendChild(miniCard(g, pid, byPid[pid])); });

      // 排行榜
      panelDone.innerHTML = "";
      panelDone.appendChild(el("h2", { text: "🏆 最先連成 " + need + " 條" }));
      if (!comp.finished.length) panelDone.appendChild(el("div", { "class": "bh-empty", text: "還沒有人連成 " + need + " 條…" }));
      comp.finished.slice(0, 7).forEach(function (r) {
        panelDone.appendChild(el("div", { "class": "bh-rank-row" }, [
          el("span", { "class": "bh-rank-no", text: String(r.rank) }),
          el("span", { "class": "nm", text: r.name }),
          el("span", { "class": "ts", text: fmtTime(r.finishedAt), title: "連成 " + need + " 條的時間" }),
          el("span", { "class": "pt", text: "+" + r.points }),
          r.extra ? el("span", { "class": "ex", text: "+" + r.extra, title: "額外賽（第 " + (CFG.EXTRA_FROM_LINE || 4) + " 條起每條 +" + CFG.EXTRA_LINE_POINTS + "）：" + r.board.count + " 條" }) : null
        ]));
      });
      if (comp.finished.length > 7) panelDone.appendChild(el("div", { "class": "bh-empty", text: "…還有 " + (comp.finished.length - 7) + " 位" }));
      if (CFG.EXTRA_LINE_POINTS) panelDone.appendChild(el("div", { "class": "bh-extra-note", text: "額外賽：第 " + (CFG.EXTRA_FROM_LINE || 4) + " 條起，每多連成一條 +" + CFG.EXTRA_LINE_POINTS + "（不論名次）" }));

      panelChase.innerHTML = "";
      panelChase.appendChild(el("h2", { text: "🔥 追趕中" }));
      if (!comp.chasing.length) panelChase.appendChild(el("div", { "class": "bh-empty", text: "—" }));
      comp.chasing.slice(0, 5).forEach(function (r) {
        panelChase.appendChild(el("div", { "class": "bh-chase" }, [
          el("span", { text: r.name }), el("span", { text: r.board.count + " 條・" + r.board.markedCount + " 格" })
        ]));
      });

      if (modalPid) renderModal();
    }

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
      var form = el("form", {}, [el("h2", { text: "🔒 中控台" }), input, err, el("button", { "class": "bh-btn primary", type: "submit", text: "進入" })]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (input.value === opts.pin) {
          if (root.HostAuth) root.HostAuth.set(); try { sessionStorage.setItem(PIN_KEY, "1"); } catch (x) {}
          gate.remove(); startListening();
        } else { err.textContent = "密碼不對"; input.value = ""; }
      });
      gate.appendChild(form); stage.appendChild(gate);
    } else {
      startListening();
    }
  }

  root.BingoGame = root.BingoGame || {};
  root.BingoGame.mountHost = mountHost;
})(typeof globalThis !== "undefined" ? globalThis : this);

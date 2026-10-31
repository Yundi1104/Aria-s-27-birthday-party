/**
 * 陪酒小姐 — 中控台（投影用）
 * CardGame.mountHost(容器, store, 選項)
 * 畫面固定 1280×720，再自動縮放到符合螢幕大小。
 * 開局前：主持人點名字指定「誰來玩」（人數和名單都由主持人決定，沒被點到的人 = 這局不玩），可以分成 1~3 桌；
 * 開始後：每一桌顯示目前輪到誰、最新一張牌、全部人名、各自抽到的牌和分數（抽到數字幾就 +幾分，個人戰）。
 */
(function (root) {
  "use strict";
  var B = root.BINGO_DATA, CD = root.CARD_DATA, CC = root.CardCore, C = root.BingoCore, el = C.el;
  var PIN_KEY = "ariaCard.hostok";

  function mountHost(host, store, opts) {
    opts = opts || {};
    var BC = B.CONFIG;
    var state = { status: "lobby", mode: "roster", scoring: null, players: {}, tables: [] };
    var connected = true, armed = false, armTimer = null;
    var allPids = B.GUESTS.map(function (g, i) { return C.guestId(i); });
    // 開局前的設定（還沒開始，只存在中控台這邊）：tables[桌] = 這桌的名單（點的順序 = 輪流順序）；沒在任何一桌的人 = 這局不玩
    var plan = null;
    function makePlan() { plan = { tables: [[]], variant: "v10", auto: true, scoring: CD.CONFIG.SCORE_MODE || "first" }; }
    makePlan();
    function tableIdx(pid) { for (var i = 0; i < plan.tables.length; i++) if (plan.tables[i].indexOf(pid) >= 0) return i; return -1; }
    function tvariant(order) { return plan.auto ? CC.variantFor(order.length) : plan.variant; }
    function playingTables() { return plan.tables.filter(function (t) { return t.length > 0; }); }
    function canStart() { var ts = playingTables(); return ts.length > 0 && ts.every(function (t) { return t.length >= 2; }); }
    function planCap() {                                                // 開局前預告：每人前幾張計分
      var ts = playingTables(); if (!ts.length || plan.scoring === "all") return Infinity;
      return Math.min.apply(null, ts.map(function (t) { return Math.floor(52 / t.length); }));
    }

    function nameOf(pid) { var i = C.guestIndex(pid); return i >= 0 ? B.GUESTS[i] : pid; }

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
    var chip = el("span", { "class": "bh-chip" }); chip.style.display = "none";                   // 狀態小標籤不顯示（內容還是會更新）
    var stat = el("span", { "class": "bh-stat" });
    var conn = el("span", { "class": "bh-conn" });
    var btnStart = el("button", { "class": "bh-btn primary", type: "button", text: "開始遊戲", onclick: onStart });
    var btnEnd = el("button", { "class": "bh-btn", type: "button", text: "結束遊戲", onclick: function () { store.end(); } });
    var btnReset = el("button", { "class": "bh-btn danger", type: "button", text: "重置", onclick: onReset });
    var btnFree = el("button", { "class": "bh-btn", type: "button", onclick: function () { store.setFree(!state.free); } });   // 手機切換：主遊戲 ⇄ 自由開局（不計分）
    var controls = el("div", { "class": "bh-controls" }, [btnFree, btnStart, btnEnd, btnReset]);
    // 「‹ 中控台」：回到主持人入口（host-index.html）。由頁面傳 backHref 進來
    if (opts && opts.backHref) controls.insertBefore(el("a", { "class": "bh-btn bh-back", href: opts.backHref, text: "‹ 中控台" }), controls.firstChild);
    stage.appendChild(el("div", { "class": "bh-header" }, [
      el("div", { "class": "bh-titlebox" }, [
        el("div", { "class": "bh-title", text: "陪酒小姐" }),
        el("div", { "class": "bh-sub", text: CD.CONFIG.HOST_SUBTITLE || "" })
      ]),
      chip, stat, el("span", { "class": "bh-spacer" }), conn, controls
    ]));

    function onStart() {
      if (state.status !== "lobby" || !canStart()) return;
      store.start({ mode: "roster", scoring: plan.scoring, tables: playingTables().map(function (order) { return { order: order.slice(), deck: CC.makeDeck(), variant: tvariant(order) }; }) });
    }
    function onReset() {
      if (!armed) { armed = true; btnReset.textContent = "再按一次確定"; btnReset.classList.add("armed"); armTimer = setTimeout(disarm, 3500); }
      else { disarm(); makePlan(); store.reset(); }
    }
    function disarm() { armed = false; clearTimeout(armTimer); btnReset.textContent = "重置"; btnReset.classList.remove("armed"); }

    var main = el("div", { "class": "ch-main" });
    stage.appendChild(main);

    // ---------- 開局前：指定誰來玩（人數 + 名單）----------
    function online(pid) { return !!state.players[pid]; }
    function nameRow(pid, i) {
      return el("div", { "class": "ch-name" + (online(pid) ? " on" : ""), "data-pid": pid }, [
        el("span", { "class": "no", text: String(i + 1) }), el("span", { "class": "dot" }), el("span", { "class": "nm", text: nameOf(pid) })
      ]);
    }
    // 拖移：名字可以從左邊的名單拖到右邊的桌子（插在放開的位置）、在桌子之間拖、拖回左邊的名單 = 這局不玩
    function dropTo(pid, zone, beforePid) {
      var t = tableIdx(pid); if (t >= 0) plan.tables[t].splice(plan.tables[t].indexOf(pid), 1);
      var k = zone === "pool" ? -1 : parseInt(String(zone).slice(1), 10);
      if (k >= 0 && k < plan.tables.length) { var arr = plan.tables[k], bi = beforePid ? arr.indexOf(beforePid) : -1; if (bi >= 0) arr.splice(bi, 0, pid); else arr.push(pid); }
      update();
    }
    PartyDnd.enable(main, { itemSel: ".ch-name", zoneSel: "[data-zone]", keyOf: function (e) { return e.getAttribute("data-pid"); }, onDrop: dropTo });
    function setCount(n) {
      n = Math.max(1, Math.min(CD.CONFIG.MAX_TABLES || 3, n));
      while (plan.tables.length < n) plan.tables.push([]);
      while (plan.tables.length > n) plan.tables.pop();                  // 被拿掉的那幾桌的人 = 這局不玩
    }
    function cycle(pid) {                                                // 不玩 → 第 1 桌 → 第 2 桌 … → 不玩
      var t = tableIdx(pid);
      if (t < 0) plan.tables[0].push(pid);
      else { plan.tables[t].splice(plan.tables[t].indexOf(pid), 1); if (t + 1 < plan.tables.length) plan.tables[t + 1].push(pid); }
      update();
    }
    function pickAll(list) { plan.tables = plan.tables.map(function () { return []; }); var n = plan.tables.length; CC.shuffle(list).forEach(function (p, i) { plan.tables[i % n].push(p); }); }
    function renderSetup() {
      main.innerHTML = ""; main.className = "ch-main col";
      var count = plan.tables.length, picked = allPids.filter(function (p) { return tableIdx(p) >= 0; });
      var cap = planCap();
      var bar1 = el("div", { "class": "ch-modes" }, [
        el("div", { "class": "ch-stepper" }, [
          el("span", { text: "桌數" }),
          el("button", { "class": "ch-step", type: "button", text: "−", onclick: function () { setCount(count - 1); update(); } }),
          el("b", { text: String(count) }),
          el("button", { "class": "ch-step", type: "button", text: "＋", onclick: function () { setCount(count + 1); update(); } })
        ])
      ]);
      [["全選", function () { pickAll(allPids.slice()); update(); }],
       ["選已進場的", function () { pickAll(allPids.filter(online)); update(); }],
       ["清除名單", function () { plan.tables = plan.tables.map(function () { return []; }); update(); }],
       [count > 1 ? "🔀 隨機分桌＋排順序" : "🔀 隨機排順序", function () { pickAll(picked.slice()); update(); }]
      ].forEach(function (b) { bar1.appendChild(el("button", { "class": "bh-btn", type: "button", text: b[0], onclick: b[1] })); });
      main.appendChild(bar1);

      var vsample = tvariant(playingTables()[0] || []);
      var bar2 = el("div", { "class": "ch-variants" }, [
        el("span", { "class": "lab", text: "規則文字：" }),
        el("button", { "class": "ch-mode sm" + (vsample === "v10" ? " on" : ""), type: "button", text: "指定／蒙眼／左右喝 1 人", onclick: function () { plan.auto = false; plan.variant = "v10"; update(); } }),
        el("button", { "class": "ch-mode sm" + (vsample === "v20" ? " on" : ""), type: "button", text: "2 人", onclick: function () { plan.auto = false; plan.variant = "v20"; update(); } }),
        el("button", { "class": "bh-btn", type: "button", text: plan.auto ? "✓ 依人數自動" : "改回依人數自動", onclick: function () { plan.auto = true; update(); } }),
        el("span", { "class": "lab gap", text: "計分：" }),
        el("button", { "class": "ch-mode sm" + (plan.scoring !== "all" ? " on" : ""), type: "button", text: "每人前 k 張", title: "k = 52 ÷ 人數（無條件捨去），讓每個人機會一樣", onclick: function () { plan.scoring = "first"; update(); } }),
        el("button", { "class": "ch-mode sm" + (plan.scoring === "all" ? " on" : ""), type: "button", text: "每張都算", onclick: function () { plan.scoring = "all"; update(); } })
      ]);
      main.appendChild(bar2);

      var capTxt = !picked.length ? "" : cap === Infinity ? "　每張牌都算分" : "　52 張牌平分給大家，每人前 " + cap + " 張計分（抽到數字幾 +幾分）";
      main.appendChild(el("div", { "class": "ch-hint", text: "把名字拖到右邊的桌子（也可以在桌子裡拖來調順序、拖回左邊 = 不玩），或點名字換桌（沒被選的人 = 這局不玩）。已選 " + picked.length + " 人（至少每桌 2 人）。🟢 = 已用手機進場" + capTxt }));

      var pick = el("div", { "class": "bh-panel ch-setbox", "data-zone": "pool" }, [el("h2", { text: "名單（拖到右邊的桌子，或點一下）" })]);
      var grid = el("div", { "class": "ch-names two" });
      allPids.forEach(function (pid) {
        var t = tableIdx(pid), i = t >= 0 ? plan.tables[t].indexOf(pid) : -1;
        var row = el("div", { "class": "ch-name click" + (online(pid) ? " on" : "") + (t >= 0 ? " picked" : ""), "data-pid": pid }, [
          el("span", { "class": "no", text: i >= 0 ? String(i + 1) : "" }), el("span", { "class": "dot" }), el("span", { "class": "nm", text: nameOf(pid) }),
          count > 1 && t >= 0 ? el("span", { "class": "tg", text: "桌" + (t + 1) }) : null
        ]);
        row.addEventListener("click", function () { cycle(pid); });
        grid.appendChild(row);
      });
      pick.appendChild(grid);
      var ords = el("div", { "class": "ch-ords" });
      plan.tables.forEach(function (order, t) {
        var box = el("div", { "class": "bh-panel ch-setbox", "data-zone": "t" + t }, [el("h2", { text: count > 1 ? "第 " + (t + 1) + " 桌（" + order.length + " 人）" : "輪流順序（" + order.length + " 人）" })]);
        var list = el("div", { "class": "ch-names" + (order.length > 10 ? " two" : "") });
        order.forEach(function (pid, i) { list.appendChild(nameRow(pid, i)); });
        if (!order.length) list.appendChild(el("div", { "class": "bh-empty", text: "還沒有選人" }));
        box.appendChild(list); ords.appendChild(box);
      });
      main.appendChild(el("div", { "class": "ch-setup" }, [pick, ords]));
    }

    // ---------- 開始後：每一桌的畫面 ----------
    function tablePanel(tb, t, multi, sb) {
      var d = CC.derive(tb, state.mode), cur = d.currentPid, capTxt = sb.cap === Infinity ? "每張都算分" : "每人前 " + sb.cap + " 張計分";
      var panel = el("div", { "class": "ch-table " + (multi ? "narrow" : "wide") });

      var head = el("div", { "class": "ch-thead" }, [
        el("span", { "class": "ch-tname", text: multi ? "第 " + (t + 1) + " 桌・" + d.order.length + " 人" : d.order.length + " 人局" }),
        el("span", { "class": "ch-tprog", text: "已抽 " + d.drawn + " / " + d.total + " 張" }),
        el("span", { "class": "ch-tcap", text: capTxt }),
        el("div", { "class": "ch-bar" }, [el("div", { "class": "ch-fill", style: "width:" + (d.total ? d.drawn / d.total * 100 : 0) + "%" })])
      ]);

      var turn;
      if (d.finished) turn = el("div", { "class": "ch-turn end" }, [el("span", { "class": "who", text: "🎉 牌抽完了，這桌結束！" })]);
      else {
        turn = el("div", { "class": "ch-turn" }, [
          el("span", { "class": "lab", text: "輪到" }), el("span", { "class": "who", text: nameOf(cur) }),
          el("span", { "class": "ch-ctl" }, [
            el("button", { "class": "bh-btn primary", type: "button", text: "代抽", onclick: function () { store.draw(t, d.nextIndex, cur); } }),
            el("button", { "class": "bh-btn", type: "button", text: "跳過", onclick: function () { store.skip(t, d.nextIndex, cur); } })
          ])
        ]);
      }

      var stageEl;
      if (d.last) {
        var L = d.last, lastEv = (sb.byPid[L.pid] && sb.byPid[L.pid].cards.filter(function (c) { return c.n === L.n; })[0]) ? { counted: sb.byPid[L.pid].cards.filter(function (c) { return c.n === L.n; })[0].counted, points: sb.byPid[L.pid].cards.filter(function (c) { return c.n === L.n; })[0].value } : null, extra = (L.rank === 13 && d.kings.length > 1) ? "上一位 K：" + nameOf(d.kings[d.kings.length - 2].pid) : "";
        stageEl = el("div", { "class": "ch-stage" }, [
          CC.cardNode(L.card),
          el("div", { "class": "ch-info" }, [
            el("div", { "class": "who", text: nameOf(L.pid) + " 抽到" }),
            el("div", { "class": "pts" + (lastEv && lastEv.counted ? "" : " no"), text: lastEv && lastEv.counted ? "+" + lastEv.points + " 分" : "（這張不計分）" }),
            el("div", { "class": "ti", text: L.rule.icon + " " + L.rule.title }),
            el("div", { "class": "tx", text: L.rule.text }),
            extra ? el("div", { "class": "ex", text: extra }) : null
          ])
        ]);
      } else stageEl = el("div", { "class": "ch-stage empty", text: "等第一位抽牌…" });

      var keep = [];
      if (d.xiaojie) keep.push(el("span", { "class": "ch-chip" }, ["💃 陪酒小姐：" + nameOf(d.xiaojie.pid)]));
      if (d.shenjing) keep.push(el("span", { "class": "ch-chip" }, ["🤪 神經病：" + nameOf(d.shenjing.pid)]));
      d.toilet.forEach(function (ev) {
        keep.push(el("span", { "class": "ch-chip" }, ["🚽 廁所牌：" + nameOf(ev.pid),
          el("button", { "class": "ch-ctl ch-use", type: "button", text: "用掉", onclick: function () { store.useToilet(t, ev.n); } })]));
      });
      if (d.kings.length) keep.push(el("span", { "class": "ch-chip" }, ["👑 最近的 K：" + nameOf(d.kings[d.kings.length - 1].pid)]));
      var keepEl = el("div", { "class": "ch-keep" }, keep);

      var roster = el("div", { "class": "ch-roster" });
      roster.style.gridTemplateRows = "repeat(" + Math.ceil(d.order.length / 2) + ",1fr)";
      d.order.forEach(function (pid, i) {
        var last = d.lastByPid[pid];
        roster.appendChild(el("div", { "class": "ch-pl" + (pid === cur ? " turn" : "") + (online(pid) ? "" : " off") }, [
          el("span", { "class": "no", text: String(i + 1) }), el("span", { "class": "nm", text: nameOf(pid) }),
          el("span", { "class": "cd" + (last && CC.isRed(last.suit) ? " red" : ""), text: last ? CC.cardText(last.card) : "—" })
        ]));
      });

      // 這桌結束後：分數榜
      var board = null;
      if (d.finished) {
        board = el("div", { "class": "ch-board" }, [el("div", { "class": "bt", text: "🏆 分數榜" })]);
        sb.rows.filter(function (r) { return r.table === t; }).slice(0, multi ? 3 : 5).forEach(function (r) {
          board.appendChild(el("div", { "class": "br" }, [el("span", { "class": "rk r" + Math.min(r.rank, 4), text: String(r.rank) }), el("span", { "class": "nm", text: r.name }), el("span", { "class": "pt", text: r.points + " 分" })]));
        });
      }

      if (!multi) {
        var hist = el("div", { "class": "ch-hist" });
        d.events.slice().reverse().slice(0, 4).forEach(function (ev) {
          hist.appendChild(el("div", { "class": "ch-hrow" }, ev.skip
            ? [el("span", { text: nameOf(ev.pid) }), el("span", { text: "⏭ 跳過" })]
            : [el("span", { text: "#" + ev.cardNo + "　" + nameOf(ev.pid) }), el("span", { "class": CC.isRed(ev.suit) ? "red" : "", text: CC.cardText(ev.card) }), el("span", { text: ev.rule.icon + " " + ev.rule.title })]));
        });
        panel.appendChild(el("div", { "class": "ch-colL" }, [head, turn, stageEl, keepEl, board || hist]));
        panel.appendChild(el("div", { "class": "ch-colR" }, [el("div", { "class": "ch-rtitle", text: "輪流順序（" + d.order.length + " 人）" }), roster]));
      } else {
        panel.appendChild(head); panel.appendChild(turn); panel.appendChild(stageEl); panel.appendChild(keepEl); panel.appendChild(roster); if (board) panel.appendChild(board);
      }
      return panel;
    }

    function renderTables() {
      main.innerHTML = ""; main.className = "ch-main row";
      var multi = state.tables.length > 1, sb = CC.scoreboard(state);
      state.tables.forEach(function (tb, t) { main.appendChild(tablePanel(tb, t, multi, sb)); });
    }

    function update() {
      var st = state.status, finished = CC.allFinished(state);
      var ended = st === "ended" || finished;
      chip.className = "bh-chip" + (st === "playing" && !finished ? " playing" : ended ? " ended" : "");
      chip.textContent = st === "lobby" ? "設定中" : ended ? "已結束" : "進行中";
      if (st === "lobby") stat.textContent = "已選 " + allPids.filter(function (p) { return tableIdx(p) >= 0; }).length + " 人 · 已進場 " + Object.keys(state.players).length + "/" + B.GUESTS.length;
      else stat.textContent = state.tables.map(function (tb, i) {
        var d = CC.derive(tb, state.mode); return (state.tables.length > 1 ? "第" + (i + 1) + "桌 " : "已抽 ") + d.drawn + "/" + d.total;
      }).join("　");
      btnStart.disabled = st !== "lobby" || !canStart();
      btnEnd.disabled = st !== "playing" || finished;
      btnFree.textContent = state.free ? "手機：自由開局 ⇄ 切回主遊戲" : "切換成自由開局";
      btnFree.classList.toggle("on", !!state.free);
      if (state.free) chip.textContent = "自由開局中（不計分）";
      conn.textContent = store.mode === "local" ? "🟡 本機測試模式" : store.mode === "firebase" ? (connected ? "🟢 已連線" : "🔴 連線中斷") : "";
      if (st === "lobby") renderSetup(); else renderTables();
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
      var form = el("form", {}, [el("h2", { text: "🔒 陪酒小姐中控台" }), input, err, el("button", { "class": "bh-btn primary", type: "submit", text: "進入" })]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (input.value === opts.pin) { if (root.HostAuth) root.HostAuth.set(); try { sessionStorage.setItem(PIN_KEY, "1"); } catch (x) {} gate.remove(); startListening(); }
        else { err.textContent = "密碼不對"; input.value = ""; }
      });
      gate.appendChild(form); stage.appendChild(gate);
    } else startListening();
  }

  root.CardGame = root.CardGame || {};
  root.CardGame.mountHost = mountHost;
})(typeof globalThis !== "undefined" ? globalThis : this);

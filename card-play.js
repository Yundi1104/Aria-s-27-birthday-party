/**
 * 陪酒小姐 — 玩家端（手機畫面）
 * 預設是「主遊戲」（中控台開的局）；中控台切換成「自由開局」時，手機改成自己開桌（邀想玩的人一起玩，不計分）。
 * 輪到自己抽牌時，整個畫面蓋上半透明黑色，中間偏下出現「抽牌」按鈕。
 * CardGame.mountPlayer(容器, store, 選項)
 */
(function (root) {
  "use strict";
  var B = root.BINGO_DATA, CC = root.CardCore, C = root.BingoCore, el = C.el;
  var LS_KEY = "ariaBingo.me";            // 跟賓果、問答共用同一個「我是誰」

  function mountPlayer(host, store, opts) {
    opts = opts || {};
    var persist = opts.persistIdentity !== false;
    var me = null, state = null, connected = true, view = null, joining = false, lastSig = null;
    var lastAnim = {}, turnKeys = {}, toastTimer = null;
    var openRoom = null, creating = false, draft = { sel: [], variant: "v10", auto: true };

    if (persist) { try { me = localStorage.getItem(LS_KEY) || null; } catch (e) {} }
    if (me && C.guestIndex(me) < 0) me = null;
    if (opts.initialMe && C.guestIndex(opts.initialMe) >= 0) me = opts.initialMe;   // 預覽用：直接指定是誰

    host.innerHTML = "";
    var wrap = el("div", { "class": "bp-wrap" });
    var scroll = el("div", { "class": "bp-scroll" });
    var inner = el("div", { "class": "bp-inner" });
    var toast = el("div", { "class": "bp-toast" });
    var turnOv = el("div", { "class": "cp-turnov" });               // 輪到自己：半透明黑色遮罩 + 抽牌按鈕
    scroll.appendChild(inner); wrap.appendChild(scroll); wrap.appendChild(turnOv); wrap.appendChild(toast); host.appendChild(wrap);
    var turnFn = null;                                              // 這次 render 有輪到我的桌：抽牌要做的事

    function showToast(msg, good) {
      toast.textContent = msg; toast.className = "bp-toast show" + (good ? " good" : "");
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.className = "bp-toast"; }, 1600);
    }
    function nameOf(pid) { var i = C.guestIndex(pid); return i >= 0 ? B.GUESTS[i] : pid; }
    function redraw() { lastSig = null; render(); }
    function addNote() {
      if (store.mode === "local") inner.appendChild(el("div", { "class": "bp-note", text: "⚠️ 測試模式：還沒連上 Firebase，只有同一個瀏覽器的分頁會同步" }));
    }
    function backBtn(mini) {                                          // 左上角「返回」（回入口頁）；沒指定就不顯示
      if (!(opts.backHref || opts.onBack)) return null;
      var a = el("a", { "class": "bp-return" + (mini ? " mini" : ""), href: opts.backHref || "#", "aria-label": "返回", text: mini ? "‹" : "‹ 返回" });
      if (opts.onBack) a.addEventListener("click", function (e) { e.preventDefault(); opts.onBack(); });
      return a;
    }
    function addBack() { var a = backBtn(false); if (a) inner.appendChild(el("div", { "class": "bp-returnrow" }, [a])); }     // 簽到畫面用

    // ---------- 進場 ----------
    function renderJoin() {
      inner.innerHTML = "";
      var sel = el("select", { "class": "bp-select" });
      sel.appendChild(el("option", { value: "", text: "請選擇你的名字…" }));
      B.GUESTS.map(function (g, i) { return { g: g, pid: C.guestId(i) }; })
        .sort(function (a, b) { return a.g.localeCompare(b.g, "zh-Hant"); })
        .forEach(function (x) {
          var taken = opts.isTaken && opts.isTaken(x.pid);
          var o = el("option", { value: x.pid, text: x.g + (taken ? "（模擬玩家）" : "") });
          if (taken) o.disabled = true;
          sel.appendChild(o);
        });
      addBack(); addNote();
      inner.appendChild(el("div", { "class": "bp-join" }, [
        el("h1", { text: "🃏 陪酒小姐" }),
        el("p", {}, ["輪流抽牌，照牌上的規則玩", el("br"), "抽到數字幾就 +幾分（個人戰，會算進總排名）"]),
        el("label", { text: "你是誰？" }), sel,
        el("button", { "class": "bp-btn", type: "button", text: "進場",
          onclick: function () { if (!sel.value) { showToast("先選你的名字喔"); return; } enter(sel.value); } })
      ]));
    }
    function enter(pid) {
      me = pid;
      if (persist) { try { localStorage.setItem(LS_KEY, pid); } catch (e) {} }
      ensureJoined(); view = null; lastSig = null; render();
    }
    function ensureJoined() {
      if (joining || !me) return;
      joining = true;
      var pr = store.join(me, nameOf(me));
      var done = function () { joining = false; };
      if (pr && pr.then) pr.then(done, done); else done();
    }
    function switchUser() {
      me = null; view = null; lastSig = null; openRoom = null; creating = false;
      if (persist) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
      render();
    }

    // ---------- 一桌的畫面（主遊戲和自由開局共用）----------
    // ctx: { key, d, onDraw(n), onUse(ev) }
    function tableView(ctx) {
      var d = ctx.d, cur = d.currentPid, myTurn = cur === me, out = [];

      var sb = ctx.sb, my = sb && sb.byPid[me];
      if (my) {                                                       // 主遊戲才有分數（自由開局不計分）
        out.push(el("div", { "class": "cp-myscore" }, [
          el("b", { text: "你的分數 " + my.points }),
          el("span", { text: "　已抽 " + my.draws + " 張" + (sb.cap === Infinity ? "，每張都算分" : "，前 " + sb.cap + " 張計分") })
        ]));
      }

      if (ctx.stopped && !d.finished) {
        out.push(el("div", { "class": "cp-turn end", text: "這桌已結束" }));
      } else if (d.finished) {
        out.push(el("div", { "class": "cp-turn end", text: "🎉 牌抽完了，遊戲結束！" }));
      } else if (myTurn) {
        out.push(el("div", { "class": "cp-turn mine" }, [el("div", { "class": "cp-turn-main", text: "輪到你了！" })]));
        if (!turnFn) turnFn = function () { ctx.onDraw(d.nextIndex); };
      } else {
        out.push(el("div", { "class": "cp-turn" }, [
          el("div", { "class": "cp-turn-main", text: "輪到 " + nameOf(cur) + " 抽牌" })
        ]));
      }

      if (d.last) {
        var L = d.last, notes = [], lc = sb && sb.byPid[L.pid] ? sb.byPid[L.pid].cards.filter(function (c) { return c.n === L.n; })[0] : null;
        if (L.rank === 13 && d.kings.length > 1) notes.push("上一位 K：" + nameOf(d.kings[d.kings.length - 2].pid));
        out.push(el("div", { "class": "cp-stage" + (L.n !== lastAnim[ctx.key] ? " flip" : "") }, [
          CC.cardNode(L.card),
          el("div", { "class": "cp-info" }, [
            el("div", { "class": "cp-who", text: nameOf(L.pid) + " 抽到" }),
            lc ? el("div", { "class": "cp-pts" + (lc.counted ? "" : " no"), text: lc.counted ? "+" + lc.value + " 分" : "（這張不計分）" }) : null,
            el("div", { "class": "cp-title", text: L.rule.icon + " " + L.rule.title }),
            el("div", { "class": "cp-text", text: L.rule.text }),
            notes.length ? el("div", { "class": "cp-extra", text: notes.join("　") }) : null
          ])
        ]));
        lastAnim[ctx.key] = L.n;
      } else out.push(el("div", { "class": "cp-stage empty", text: "還沒有人抽牌" }));

      var chips = [];
      if (d.xiaojie) chips.push(el("span", { "class": "cp-chip" }, ["💃 陪酒小姐：" + nameOf(d.xiaojie.pid)]));
      if (d.shenjing) chips.push(el("span", { "class": "cp-chip" }, ["🤪 神經病：" + nameOf(d.shenjing.pid)]));
      d.toilet.forEach(function (ev) {
        var kids = ["🚽 廁所牌：" + nameOf(ev.pid)];
        if (ev.pid === me) kids.push(el("button", { "class": "cp-use", type: "button", text: "用掉", onclick: function () { ctx.onUse(ev); showToast("廁所牌已用掉"); } }));
        chips.push(el("span", { "class": "cp-chip" }, kids));
      });
      if (d.kings.length) chips.push(el("span", { "class": "cp-chip" }, ["👑 最近的 K：" + nameOf(d.kings[d.kings.length - 1].pid)]));
      if (chips.length) out.push(el("div", { "class": "cp-keep" }, [el("div", { "class": "cp-h", text: "目前有效" }), el("div", { "class": "cp-chips" }, chips)]));

      var roster = el("div", { "class": "cp-roster" });
      d.order.forEach(function (pid, i) {
        var last = d.lastByPid[pid];
        roster.appendChild(el("div", { "class": "cp-pl" + (pid === cur && !d.finished ? " turn" : "") + (pid === me ? " me" : "") }, [
          el("span", { "class": "no", text: String(i + 1) }), el("span", { "class": "nm", text: nameOf(pid) }),
          el("span", { "class": "cd" + (last && CC.isRed(last.suit) ? " red" : ""), text: last ? CC.cardText(last.card) : "—" })
        ]));
      });
      out.push(el("div", { "class": "cp-h", text: "輪流順序（" + d.order.length + " 人）" })); out.push(roster);
      // （這桌結束時，手機不顯示分數榜 / 名次，留到頒獎才揭曉；自己的分數看上面的「你的分數」）
      return out;
    }

    // ---------- 自由開局 ----------
    function roomLabel(r) { return r.d.order.length + " 人"; }

    function roomList(rooms) {
      var out = [el("button", { "class": "bp-btn", type: "button", text: "＋ 開一桌（自選人、自訂人數）",
        onclick: function () { creating = true; draft = { sel: [me], variant: "v10", auto: true }; redraw(); } })];
      out.push(el("div", { "class": "cp-h", text: "我的桌（" + rooms.length + "）" }));
      if (!rooms.length) out.push(el("div", { "class": "bp-note", text: "還沒有桌。想玩就自己開一桌，點名字邀朋友，大家用自己的手機輪流抽牌，不用等主持人。" }));
      rooms.forEach(function (r) {
        var mine = !r.over && r.d.currentPid === me;
        var st = r.over ? "已結束" : (mine ? "輪到你了！" : "進行中");
        out.push(el("button", { "class": "cp-room" + (mine ? " turn" : "") + (r.over ? " over" : ""), type: "button",
          onclick: function () { openRoom = r.id; redraw(); } }, [
          el("span", { "class": "t1", text: nameOf(r.room.creator) + " 開的桌　" + roomLabel(r) }),
          el("span", { "class": "t2", text: "已抽 " + r.d.drawn + "/" + r.d.total + "　" + st })
        ]));
      });
      return out;
    }

    function createForm() {
      var n = draft.sel.length, v = draft.auto ? CC.variantFor(n) : draft.variant, out = [];
      out.push(el("div", { "class": "cp-h", text: "開一桌：點名字選參加的人（點的順序 = 輪流順序）" }));
      var chips = el("div", { "class": "cp-pick" });
      B.GUESTS.map(function (g, i) { return C.guestId(i); }).forEach(function (pid) {
        var i = draft.sel.indexOf(pid), isMe = pid === me;
        var b = el("button", { "class": "cp-pickc" + (i >= 0 ? " on" : "") + (isMe ? " me" : ""), type: "button" }, [
          el("span", { "class": "no", text: i >= 0 ? String(i + 1) : "" }), el("span", { "class": "nm", text: nameOf(pid) })
        ]);
        b.addEventListener("click", function () {
          if (isMe) { showToast("你自己一定會在桌上"); return; }
          if (i >= 0) draft.sel.splice(i, 1); else draft.sel.push(pid);
          redraw();
        });
        chips.appendChild(b);
      });
      out.push(chips);
      out.push(el("div", { "class": "cp-quick" }, [
        el("button", { "class": "bp-link", type: "button", text: "全選", onclick: function () { draft.sel = [me].concat(B.GUESTS.map(function (g, i) { return C.guestId(i); }).filter(function (p) { return p !== me; })); redraw(); } }),
        el("button", { "class": "bp-link", type: "button", text: "只留我", onclick: function () { draft.sel = [me]; redraw(); } }),
        el("button", { "class": "bp-link", type: "button", text: "🔀 隨機排順序", onclick: function () { draft.sel = CC.shuffle(draft.sel); redraw(); } })
      ]));
      out.push(el("div", { "class": "cp-h", text: "已選 " + n + " 人　規則文字" }));
      out.push(el("div", { "class": "cp-seg" }, [
        el("button", { "class": v === "v10" ? "on" : "", type: "button", text: "指定／蒙眼／左右：1 人", onclick: function () { draft.auto = false; draft.variant = "v10"; redraw(); } }),
        el("button", { "class": v === "v20" ? "on" : "", type: "button", text: "2 人", onclick: function () { draft.auto = false; draft.variant = "v20"; redraw(); } })
      ]));
      out.push(el("div", { "class": "cp-note2", text: draft.auto ? "依人數自動選（目前 " + n + " 人 → " + (v === "v20" ? "2 人" : "1 人") + "），點上面可以自己改" : "已手動選擇" }));
      var go = el("button", { "class": "bp-btn", type: "button", text: n < 2 ? "至少要選 2 個人" : "開始這一桌",
        onclick: function () {
          if (draft.sel.length < 2) return;
          var id = "r" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
          store.createRoom(id, { creator: me, order: draft.sel.slice(), deck: CC.makeDeck(), variant: v });
          creating = false; openRoom = id; redraw();
        } });
      go.disabled = n < 2;
      out.push(go);
      out.push(el("button", { "class": "bp-btn ghost", type: "button", text: "取消", onclick: function () { creating = false; redraw(); } }));
      return out;
    }

    function roomView(r) {
      var d = r.d, isCreator = r.room.creator === me, out = [];
      out.push(el("div", { "class": "cp-roomhead" }, [
        el("button", { "class": "bp-link", type: "button", text: "← 我的桌", onclick: function () { openRoom = null; redraw(); } }),
        el("span", { "class": "t", text: nameOf(r.room.creator) + " 開的桌・" + roomLabel(r) + "・" + (CC.variantOf(r.room.variant) === "v20" ? "2 人版" : "1 人版") })
      ]));
      if (isCreator && !r.over) {
        out.push(el("div", { "class": "cp-ctl" }, [
          el("span", { "class": "lab", text: "開桌的人：" }),
          el("button", { "class": "cp-mini", type: "button", text: "幫 " + nameOf(d.currentPid) + " 抽",
            onclick: function () { store.roomDraw(r.id, d.nextIndex, d.currentPid); } }),
          el("button", { "class": "cp-mini", type: "button", text: "跳過", onclick: function () { store.roomSkip(r.id, d.nextIndex, d.currentPid); } }),
          el("button", { "class": "cp-mini danger", type: "button", text: "結束這桌", onclick: function () { store.roomEnd(r.id); } })
        ]));
      }
      tableView({ key: "room:" + r.id, d: d, stopped: !!r.room.ended,
        onDraw: function (n) { store.roomDraw(r.id, n, me); }, onUse: function (ev) { store.roomUseToilet(r.id, ev.n); } }).forEach(function (n) { out.push(n); });
      if (isCreator && r.over) out.push(el("button", { "class": "bp-btn ghost", type: "button", text: "刪除這桌",
        onclick: function () { store.roomDelete(r.id); openRoom = null; redraw(); } }));
      return out;
    }

    // ---------- 主畫面 ----------
    function renderGame() {
      var p = state.players[me];
      if (!p) { inner.textContent = "進場中…"; ensureJoined(); return; }
      joining = false;

      var tab = state.free ? "free" : "main";                        // 主遊戲 / 自由開局由中控台決定
      var playing = state.status !== "lobby" && state.tables.length > 0;
      var t = playing ? CC.tableOf(state, me) : -1;
      var d = t >= 0 ? CC.derive(state.tables[t], state.mode) : null;
      var rooms = CC.roomsOf(state, me);
      var roomsSig = rooms.map(function (r) { return r.id + ":" + r.d.events.length + ":" + Object.keys(r.room.used || {}).length + ":" + (r.over ? 1 : 0); }).join(",");
      var sig = [state.status, state.mode, t, d ? d.events.length : 0, d ? Object.keys(state.tables[t].used || {}).length : 0, connected,
                 state.tables.length, tab, openRoom, creating, roomsSig].join("|");
      if (sig === lastSig) return;
      lastSig = sig;

      // 輪到我時震動提醒（主遊戲或任何一桌）
      var keys = {};
      if (d && d.currentPid === me && !d.finished) keys.main = true;
      rooms.forEach(function (r) { if (!r.over && r.d.currentPid === me) keys["room:" + r.id] = true; });
      var fresh = Object.keys(keys).some(function (k) { return !turnKeys[k]; });
      turnKeys = keys;
      if (fresh && typeof navigator !== "undefined" && navigator.vibrate) { try { navigator.vibrate(200); } catch (e) {} }

      inner.innerHTML = ""; addNote(); turnFn = null;
      var top = el("div", { "class": "bp-top" }, [backBtn(true)]);
      if (top.firstChild) inner.appendChild(top);

      var nodes = [];
      if (tab === "main") {
        if (!playing) nodes.push(el("div", { "class": "bp-note" }, ["✅ 已進場"]));
        else if (t < 0 || !d) nodes.push(el("div", { "class": "bp-note" }, ["這局你不在名單裡，用看的就好 👀"]));
        else tableView({ key: "main", d: d, t: t, sb: CC.scoreboard(state), stopped: state.status === "ended",
          onDraw: function (n) { store.draw(t, n, me); }, onUse: function (ev) { store.useToilet(t, ev.n); } }).forEach(function (n) { nodes.push(n); });
      } else {
        if (creating) nodes = createForm();
        else if (openRoom) {
          var cur = rooms.filter(function (r) { return r.id === openRoom; })[0];
          nodes = cur ? roomView(cur) : [el("div", { "class": "bp-note", text: "建立中…" })];
        } else nodes = roomList(rooms);
      }
      nodes.forEach(function (n) { if (n) inner.appendChild(n); });
      paintTurn();
    }

    // 輪到自己：蓋上半透明黑色，中間偏下出現抽牌按鈕
    function paintTurn() {
      turnOv.innerHTML = "";
      if (!turnFn) { turnOv.className = "cp-turnov"; return; }
      var fn = turnFn;
      var btn = el("button", { "class": "cp-draw", type: "button", text: "🃏 抽牌" });
      btn.addEventListener("click", function () { btn.disabled = true; fn(); });
      turnOv.appendChild(el("div", { "class": "cp-turnov-in" }, [el("div", { "class": "cp-turnov-t", text: "輪到你了！" }), btn]));
      turnOv.className = "cp-turnov show";
    }

    function render() {
      if (!state) { inner.textContent = "載入中…"; return; }
      if (!me) { if (view !== "join") { renderJoin(); view = "join"; } return; }
      view = "game"; renderGame();
    }
    var offState = store.subscribe(function (s) { state = s; render(); });
    var offConn = store.onConnection ? store.onConnection(function (ok) { connected = ok; if (view === "game" && state) render(); }) : null;
    return {
      getMe: function () { return me; },
      switchUser: switchUser,                                       // 畫面上沒有「換人」了；只留給預覽/測試用
      destroy: function () { if (offState) offState(); if (offConn) offConn(); host.innerHTML = ""; }
    };
  }

  root.CardGame = root.CardGame || {};
  root.CardGame.mountPlayer = mountPlayer;
})(typeof globalThis !== "undefined" ? globalThis : this);

/**
 * 陪酒小姐 — 核心邏輯（洗牌、分桌、輪流順序、每一桌目前的狀態）。玩家端和中控台共用。
 *
 * 一桌（table）的資料：
 *   order  輪流順序（玩家 id 的陣列）    deck  這桌的整副牌（已洗好，例如 "H13"=紅心K）
 *   log    抽牌紀錄 { 第幾次: { pid, skip } }   used  已經用掉的廁所牌 { 第幾次: true }
 */
(function (root) {
  "use strict";
  function D() { return root.CARD_DATA; }

  var SUITS = ["S", "H", "D", "C"];
  var SUIT_SYM = { S: "♠", H: "♥", D: "♦", C: "♣" };
  var RANK_LABEL = { 1: "A", 11: "J", 12: "Q", 13: "K" };

  function rankLabel(r) { return RANK_LABEL[r] || String(r); }
  function parse(code) { return { suit: code.charAt(0), rank: Number(code.slice(1)) }; }
  function isRed(suit) { return suit === "H" || suit === "D"; }

  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function makeDeck(rnd) {
    var d = [];
    SUITS.forEach(function (s) { for (var r = 1; r <= 13; r++) d.push(s + r); });
    return shuffle(d, rnd);
  }

  // 把一份名單隨機分成 n 桌（盡量平均）；n = 1 就是一桌
  function planTables(pids, n, rnd) {
    var p = shuffle(pids, rnd), out = [], i;
    n = Math.max(1, n || 1);
    for (i = 0; i < n; i++) out.push([]);
    p.forEach(function (pid, k) { out[k % n].push(pid); });
    return out;
  }

  // 規則版本：'v20' = 20人局文字（指定2人…）、'v10' = 10人局文字（指定1人…）。為了相容，也接受舊的 'one' / 'two'
  function variantOf(x) { return (x === "one" || x === "v20") ? "v20" : "v10"; }
  function variantFor(n) { return n >= D().CONFIG.FREE_V20_MIN ? "v20" : "v10"; }       // 自由開局：依人數自動選
  function variantLabel(v) { return variantOf(v) === "v20" ? "指定／蒙眼／左右：2 人" : "指定／蒙眼／左右：1 人"; }

  // 這張牌的功能文字（依規則版本）
  function ruleFor(rank, x) {
    var r = D().RULES[rank], v20 = variantOf(x) === "v20";
    return { icon: r.icon, title: r.title, keep: r.keep || null, text: v20 ? (r.t20 || r.text) : (r.t10 || r.text) };
  }

  // ---------- 計分：抽到數字幾就 +幾分（個人戰）----------
  function cardValue(rank) {
    var m = D().CONFIG.POINTS;
    return m && m[rank] != null ? Number(m[rank]) : rank;
  }
  // 每人最多算幾張：mode = 'first'（每人前 k 張，k = 牌數 ÷ 桌上人數，各桌取最小的，大家一樣）或 'all'
  function scoreCap(state) {
    var mode = (state && state.scoring) || D().CONFIG.SCORE_MODE;
    if (mode === "all") return Infinity;
    var ts = ((state && state.tables) || []).filter(function (t) { return (t.order || []).length > 0; });
    if (!ts.length) return 0;
    return Math.min.apply(null, ts.map(function (t) { return Math.floor(((t.deck || []).length || 52) / t.order.length); }));
  }
  // 每個人的分數（只算主遊戲的桌子，自由開局不計分）。回傳 { cap, mode, rows（依分數排好、同分同名次）, byPid }
  function scoreboard(state) {
    var cap = scoreCap(state), mode = (state && state.scoring) || D().CONFIG.SCORE_MODE, by = {}, rows = [];
    ((state && state.tables) || []).forEach(function (tb, t) {
      var d = derive(tb, state.mode), seen = {};
      (tb.order || []).forEach(function (pid) { by[pid] = by[pid] || { pid: pid, table: t, points: 0, draws: 0, counted: 0, cards: [] }; });
      d.events.forEach(function (ev) {
        if (ev.skip) return;
        var r = by[ev.pid] = by[ev.pid] || { pid: ev.pid, table: t, points: 0, draws: 0, counted: 0, cards: [] };
        var counted = r.draws < cap, v = cardValue(ev.rank);
        r.draws++; if (counted) { r.counted++; r.points += v; }
        r.cards.push({ n: ev.n, card: ev.card, rank: ev.rank, value: v, counted: counted });
        ev.points = counted ? v : 0; ev.counted = counted;
      });
    });
    var B = root.BINGO_DATA, BC = root.BingoCore;
    Object.keys(by).forEach(function (pid) {
      var r = by[pid], i = BC ? BC.guestIndex(pid) : -1;
      r.name = (state.players && state.players[pid] && state.players[pid].name) || (i >= 0 ? B.GUESTS[i] : pid);
      rows.push(r);
    });
    rows.sort(function (a, b) { return b.points - a.points || b.counted - a.counted || String(a.name).localeCompare(String(b.name), "zh-Hant"); });
    rows.forEach(function (r, i) { var prev = rows[i - 1]; r.rank = prev && prev.points === r.points ? prev.rank : i + 1; });
    return { cap: cap, mode: mode, rows: rows, byPid: by };
  }

  // 把一桌的紀錄整理成：每次抽牌是誰抽到什麼、輪到誰、有哪些「持續有效」的牌
  function derive(table, mode) {
    table = table || {};
    var order = table.order || [], deck = table.deck || [], log = table.log || {}, used = table.used || {};
    var events = [], cardIdx = 0, n = 0;
    while (log[n]) {
      var e = log[n], ev = { n: n, pid: e.pid, skip: !!e.skip, at: e.at };
      if (!ev.skip) {
        if (cardIdx >= deck.length) break;
        var code = deck[cardIdx++], c = parse(code);
        ev.card = code; ev.rank = c.rank; ev.suit = c.suit; ev.cardNo = cardIdx;
        ev.rule = ruleFor(c.rank, table.variant || mode);
      }
      events.push(ev); n++;
    }
    var drawn = cardIdx, finished = deck.length > 0 && drawn >= deck.length;
    var lastByPid = {}, last = null, xiaojie = null, shenjing = null, toilet = [], kings = [];
    events.forEach(function (ev) {
      if (ev.skip) return;
      last = ev; lastByPid[ev.pid] = ev;
      if (ev.rank === 2) xiaojie = ev;
      if (ev.rank === 10) shenjing = ev;
      if (ev.rank === 8 && !used[ev.n]) toilet.push(ev);
      if (ev.rank === 13) kings.push(ev);
    });
    return {
      order: order, events: events, drawn: drawn, total: deck.length, finished: finished,
      currentPid: (finished || !order.length) ? null : order[events.length % order.length],
      nextIndex: events.length, last: last, lastByPid: lastByPid,
      xiaojie: xiaojie, shenjing: shenjing, toilet: toilet, kings: kings
    };
  }

  function tableOf(state, pid) {
    var ts = (state && state.tables) || [];
    for (var i = 0; i < ts.length; i++) if ((ts[i].order || []).indexOf(pid) >= 0) return i;
    return -1;
  }
  // 我參加的自由開局房間（新的在前）
  function roomsOf(state, pid) {
    var rooms = (state && state.rooms) || {};
    return Object.keys(rooms).map(function (id) { return { id: id, room: rooms[id] }; })
      .filter(function (x) { return (x.room.order || []).indexOf(pid) >= 0; })
      .sort(function (a, b) { return (b.room.createdAt || 0) - (a.room.createdAt || 0); })
      .map(function (x) { x.d = derive(x.room, x.room.variant); x.over = !!x.room.ended || x.d.finished; return x; });
  }
  function allFinished(state, mode) {
    var ts = (state && state.tables) || [];
    return ts.length > 0 && ts.every(function (t) { return derive(t, mode || state.mode).finished; });
  }

  // 牌面（一張撲克牌的畫面）
  function cardNode(code, extraClass) {
    var el = root.BingoCore.el, c = parse(code), lab = rankLabel(c.rank), sym = SUIT_SYM[c.suit];
    return el("div", { "class": "pc-card " + (isRed(c.suit) ? "red" : "blk") + (extraClass ? " " + extraClass : "") }, [
      el("div", { "class": "pc-corner tl" }, [el("b", { text: lab }), el("i", { text: sym })]),
      el("div", { "class": "pc-mid", text: sym }),
      el("div", { "class": "pc-corner br" }, [el("b", { text: lab }), el("i", { text: sym })])
    ]);
  }
  function cardText(code) { var c = parse(code); return SUIT_SYM[c.suit] + rankLabel(c.rank); }

  root.CardCore = {
    SUITS: SUITS, SUIT_SYM: SUIT_SYM, rankLabel: rankLabel, parse: parse, isRed: isRed, shuffle: shuffle, makeDeck: makeDeck,
    planTables: planTables, cardValue: cardValue, scoreCap: scoreCap, scoreboard: scoreboard, ruleFor: ruleFor, variantOf: variantOf, variantFor: variantFor, variantLabel: variantLabel, roomsOf: roomsOf, derive: derive, tableOf: tableOf, allFinished: allFinished,
    cardNode: cardNode, cardText: cardText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CardCore;
})(typeof globalThis !== "undefined" ? globalThis : this);

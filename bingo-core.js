/**
 * 社交賓果 — 核心邏輯（連線判定、題目打亂、排名計分）
 * 玩家端和中控台共用同一份，所以兩邊算出來的結果一定一致。
 */
(function (root) {
  "use strict";
  function D() { return root.BINGO_DATA; }
  var N = 5, TOTAL = 25;

  // 12 種連線：5 橫、5 直、2 斜
  var LINES = (function () {
    var L = [], r, c, a;
    for (r = 0; r < N; r++) { a = []; for (c = 0; c < N; c++) a.push(r * N + c); L.push(a); }
    for (c = 0; c < N; c++) { a = []; for (r = 0; r < N; r++) a.push(r * N + c); L.push(a); }
    a = []; for (r = 0; r < N; r++) a.push(r * N + r); L.push(a);
    a = []; for (r = 0; r < N; r++) a.push(r * N + (N - 1 - r)); L.push(a);
    return L;
  })();

  // ----- 固定種子的洗牌：同一個人每次打開，題目排列都一樣；不同人排列不同 -----
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeOrder(pid) {
    var ids = D().CELLS.map(function (c) { return c.id; });
    var r = rng(hash(pid + "|" + (D().CONFIG.SEED_SALT || "bingo")));
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    return ids;
  }

  function cellMap() {
    var m = {}; D().CELLS.forEach(function (c) { m[c.id] = c; }); return m;
  }
  function checkinCell() {
    return D().CELLS.filter(function (c) { return c.type === "checkin"; })[0] || null;
  }

  // ----- 答案比對（全形轉半形、去空白、不分大小寫）-----
  function normText(s) {
    return String(s == null ? "" : s)
      .replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, "").toLowerCase();
  }
  function checkAnswer(cell, value) {
    if (cell.type === "checkin") return true;
    var v = normText(value);
    if (!v) return false;
    if (!cell.type || cell.type === "friend") return v === normText(cell.a);
    return (cell.accept || []).some(function (a) { return normText(a) === v; });
  }

  // ----- 連線 -----
  function completedLines(posMarked) {
    var out = [];
    LINES.forEach(function (line, li) {
      if (line.every(function (p) { return posMarked[p]; })) out.push(li);
    });
    return out;
  }

  // 一個玩家目前的盤面狀態
  function playerBoard(player) {
    var order = (player && player.order) || [], marked = (player && player.marked) || {};
    var posMarked = [], i;
    for (i = 0; i < TOTAL; i++) posMarked.push(!!(order[i] && marked[order[i]]));
    var lines = completedLines(posMarked);
    var inLine = []; for (i = 0; i < TOTAL; i++) inLine.push(false);
    lines.forEach(function (li) { LINES[li].forEach(function (p) { inLine[p] = true; }); });
    return {
      order: order, posMarked: posMarked, lines: lines, inLine: inLine, count: lines.length,
      markedCount: posMarked.filter(Boolean).length
    };
  }

  // 重播這個人答對的順序，找出「第 N 條線完成」的那一刻（用來排名）
  function lineTime(player, need) {
    need = need || D().CONFIG.LINES_TO_WIN;
    var order = player.order || [], marked = player.marked || {}, pos = {}, i;
    order.forEach(function (id, idx) { pos[id] = idx; });
    var entries = Object.keys(marked).filter(function (id) { return id in pos; }).map(function (id) {
      return { t: Number(marked[id]) || 0, p: pos[id] };
    });
    entries.sort(function (a, b) { return a.t - b.t || a.p - b.p; });
    var cur = []; for (i = 0; i < TOTAL; i++) cur.push(false);
    for (i = 0; i < entries.length; i++) {
      cur[entries[i].p] = true;
      if (completedLines(cur).length >= need) return entries[i].t;
    }
    return null;
  }

  // 名次分數：表裡有的名次照表，之後的名次都拿 POINTS_AFTER
  function pointsFor(rank) {
    var c = D().CONFIG, P = c.POINTS;
    return rank <= P.length ? P[rank - 1] : (c.POINTS_AFTER != null ? c.POINTS_AFTER : P[P.length - 1]);
  }
  // 額外賽：連成的線數 >= EXTRA_FROM_LINE 之後，每多一條就 +EXTRA_LINE_POINTS（不論名次）
  function extraPoints(lineCount) {
    var c = D().CONFIG, from = c.EXTRA_FROM_LINE || 4, per = c.EXTRA_LINE_POINTS || 0;
    return lineCount >= from ? (lineCount - from + 1) * per : 0;
  }

  // 「他自己」的那一格：答案就是他自己名字的那題。遊戲一開始就自動幫他完成（自己不用去找自己）
  function ownCell(pid) {
    var idx = guestIndex(pid); if (idx < 0) return null;
    var name = D().GUESTS[idx], cells = D().CELLS, i;
    for (i = 0; i < cells.length; i++) if ((!cells[i].type || cells[i].type === "friend") && cells[i].a === name) return cells[i];
    return null;
  }
  // 把「自己的那一格」算進這個人的答對紀錄（遊戲開始之後才算；時間記成開始那一刻，不會影響名次）。
  // 所有畫面（手機、中控台、頒獎）都用這個，所以算出來的連線一定一致；資料庫裡不用另外存。
  function effectivePlayer(state, pid) {
    var p = state && state.players && state.players[pid];
    if (!p || !state.status || state.status === "lobby") return p;
    var oc = ownCell(pid);
    if (!oc || (p.marked && p.marked[oc.id])) return p;
    var m = {}; Object.keys(p.marked || {}).forEach(function (k) { m[k] = p.marked[k]; });
    m[oc.id] = Number(state.startedAt) || Number(p.joinedAt) || 0;
    var out = {}; Object.keys(p).forEach(function (k) { out[k] = p[k]; });
    out.marked = m; out.ownAuto = oc.id;
    return out;
  }

  // 整場排名：誰先連成 N 條 → 依序給分
  function compute(state) {
    var players = (state && state.players) || {}, need = D().CONFIG.LINES_TO_WIN;
    var rows = Object.keys(players).map(function (pid) {
      var p = effectivePlayer(state, pid), b = playerBoard(p);
      return {
        pid: pid, name: p.name, player: p, board: b, joinedAt: p.joinedAt || 0,
        finishedAt: b.count >= need ? lineTime(p, need) : null, rank: null, points: 0, extra: 0, total: 0
      };
    });
    var finished = rows.filter(function (r) { return r.finishedAt != null; })
      .sort(function (a, b) { return a.finishedAt - b.finishedAt || a.joinedAt - b.joinedAt; });
    finished.forEach(function (r, i) { r.rank = i + 1; r.points = pointsFor(i + 1); });
    rows.forEach(function (r) { r.extra = extraPoints(r.board.count); r.total = r.points + r.extra; });
    var chasing = rows.filter(function (r) { return r.finishedAt == null; })
      .sort(function (a, b) {
        return b.board.count - a.board.count || b.board.markedCount - a.board.markedCount || a.joinedAt - b.joinedAt;
      });
    return { rows: rows, finished: finished, chasing: chasing };
  }

  // 下拉選單還能選的朋友（已經配對成功的朋友不再出現）
  function remainingFriends(player) {
    var cells = cellMap(), marked = (player && player.marked) || {}, used = {};
    Object.keys(marked).forEach(function (id) {
      var c = cells[id]; if (c && (!c.type || c.type === "friend")) used[c.a] = true;
    });
    return optionNames().filter(function (g) { return !used[g]; });
  }

  // 下方人名選項：全部賓客，扣掉不要出現的人（壽星本人）
  function optionNames() {
    var hide = D().CONFIG.HIDE_FROM_OPTIONS || [];
    return D().GUESTS.filter(function (g) { return hide.indexOf(g) < 0; });
  }

  // 玩家 id：用賓客名單的順序編號
  function guestId(idx) { return "g" + (idx < 9 ? "0" : "") + (idx + 1); }
  function guestIndex(pid) {
    var g = D().GUESTS;
    for (var i = 0; i < g.length; i++) if (guestId(i) === pid) return i;
    return -1;
  }

  // 題目文字：資料裡用「|」標示可以換行的地方
  function qText(q) { return String(q).replace(/\|/g, ""); }        // 一般顯示：拿掉 |
  function qNode(q) {                                               // 手機格子：只在 | 的地方換行
    var wrap = el("span", { "class": "bp-q" });
    String(q).split("|").forEach(function (t) { if (t) wrap.appendChild(el("span", { "class": "bp-ck", text: t })); });
    return wrap;
  }

  // 小工具：建立 DOM 元素（文字一律用 textContent，不會被當成 HTML）
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (kid) {
      if (kid == null) return;
      e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return e;
  }

  var Core = {
    LINES: LINES, makeOrder: makeOrder, cellMap: cellMap, checkinCell: checkinCell,
    normText: normText, checkAnswer: checkAnswer, completedLines: completedLines,
    playerBoard: playerBoard, lineTime: lineTime, ownCell: ownCell, effectivePlayer: effectivePlayer, pointsFor: pointsFor, extraPoints: extraPoints, compute: compute,
    remainingFriends: remainingFriends, optionNames: optionNames, guestId: guestId, guestIndex: guestIndex, el: el, qText: qText, qNode: qNode
  };
  root.BingoCore = Core;
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
})(typeof globalThis !== "undefined" ? globalThis : this);

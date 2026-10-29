/**
 * 總排名 — 把好友冰狗（名次分數 + 額外賽）、迷因海公牛（個人答對 + 組別名次加分）和陪酒小姐（抽到數字幾 +幾分）加起來。
 * 輸入是兩個遊戲各自的 state（跟中控台、手機用的是同一份資料）。
 *
 * 名次規則：
 *   1. 總分高的在前。
 *   2. 同分 → 並列同名次（例如兩個人並列第 2 名，接著就沒有第 3 名）。
 *   3. 例外：如果並列會讓得獎人超過 PRIZE_COUNT（也就是「最後一個有獎品的名次」那裡同分），
 *      才用加賽規則分出先後：① 迷因海公牛分數高的 ② 連成 3 條比較早的 ③ 連成的線數比較多的 ④ 答對題數比較多的。
 *      四項都一樣才真的並列（中控台會提醒要多準備禮物）。
 */
(function (root) {
  "use strict";
  function A() { return root.AWARD_DATA.CONFIG; }

  // 加賽規則：回傳「比較用的數字」，越小越優先
  var TIE_KEYS = [
    { id: "quiz", label: "迷因海公牛分數較高者優先", val: function (r) { return -r.quiz; } },
    { id: "time", label: "較早連成 3 條者優先", val: function (r) { return r.finishedAt == null ? Infinity : r.finishedAt; } },
    { id: "lines", label: "連成線數較多者優先", val: function (r) { return -r.lines; } },
    { id: "correct", label: "答對題數較多者優先", val: function (r) { return -r.correct; } }
  ];
  function keyOf(r) { return TIE_KEYS.map(function (k) { return k.val(r); }); }
  function sameKey(a, b) { return keyOf(a).every(function (v, i) { return v === keyOf(b)[i]; }); }
  function cmpKey(a, b) {
    var ka = keyOf(a), kb = keyOf(b);
    for (var i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  }

  // 排名（會就地排序、填 rank / tied / tieNote）。rows 需要有 name、total、quiz、correct，可選 lines、finishedAt
  function rankRows(rows, cfg) {
    cfg = cfg || A();
    var N = cfg.PRIZE_COUNT || 3;
    rows.sort(function (a, b) { return b.total - a.total || String(a.name).localeCompare(String(b.name), "zh-Hant"); });
    var out = [], pos = 0;
    while (pos < rows.length) {
      var end = pos;
      while (end + 1 < rows.length && rows[end + 1].total === rows[pos].total) end++;
      var group = rows.slice(pos, end + 1), size = group.length;
      group.forEach(function (r) { r.tied = false; r.tieNote = ""; r.tieBroken = false; });
      var straddle = size > 1 && pos < N && pos + size > N;                       // 並列會讓得獎人超過 N 位
      if (straddle && cfg.TIEBREAK !== false) {
        group.sort(function (a, b) { return cmpKey(a, b) || String(a.name).localeCompare(String(b.name), "zh-Hant"); });
        var decided = TIE_KEYS.filter(function (k, ki) { return group.some(function (r) { return keyOf(r)[ki] !== keyOf(group[0])[ki]; }); })[0];
        group.forEach(function (r, i) {
          var first = 0; while (!sameKey(group[first], r)) first++;               // 四項都一樣的人才並列
          r.rank = pos + 1 + first; r.tieBroken = true;
          r.tied = group.filter(function (g) { return sameKey(g, r); }).length > 1;
          r.tieNote = "同分 " + r.total + "：" + (decided ? decided.label : "完全同分");
        });
      } else {
        group.forEach(function (r) { r.rank = pos + 1; r.tied = size > 1; });
        if (size > 1) group.forEach(function (r) { r.tieNote = "同分並列"; });
      }
      out = out.concat(group); pos = end + 1;
    }
    out.forEach(function (r, i) { rows[i] = r; });
    return rows;
  }

  // 回傳每個人的 { pid, name, bingo, quiz, total, rank, tied, tieNote, lines, finishedAt, correct }，已排好名次
  function combine(bingoState, quizState, cardState) {
    var B = root.BINGO_DATA, C = root.BingoCore, K = root.QuizCore, CC = root.CardCore, cfg = A();
    var bing = {}, quiz = {}, card = {};
    if (bingoState) C.compute(bingoState).rows.forEach(function (r) { bing[r.pid] = { pts: r.total || 0, lines: r.board.count, finishedAt: r.finishedAt }; });   // 名次分數 + 額外賽
    if (quizState) K.scoreboard(quizState).players.forEach(function (r) { quiz[r.pid] = { pts: r.total, correct: r.correct }; });                              // 答對題數 + 所屬組別名次的加分
    if (cardState && CC) CC.scoreboard(cardState).rows.forEach(function (r) { card[r.pid] = r.points; });          // 陪酒小姐：每抽一張，抽到數字幾 +幾分
    var pids = {};
    Object.keys(card).forEach(function (p) { pids[p] = true; });
    Object.keys(bing).forEach(function (p) { pids[p] = true; });
    Object.keys(quiz).forEach(function (p) { pids[p] = true; });
    var rows = Object.keys(pids).map(function (pid) {
      var idx = C.guestIndex(pid), name = idx >= 0 ? B.GUESTS[idx] : pid;
      var bb = bing[pid] || { pts: 0, lines: 0, finishedAt: null };
      var b = bb.pts * cfg.WEIGHT_BINGO, q = ((quiz[pid] && quiz[pid].pts) || 0) * cfg.WEIGHT_QUIZ, cd = (card[pid] || 0) * (cfg.WEIGHT_CARD == null ? 1 : cfg.WEIGHT_CARD);
      return { pid: pid, name: name, bingo: b, quiz: q, card: cd, total: b + q + cd, correct: (quiz[pid] && quiz[pid].correct) || 0, lines: bb.lines, finishedAt: bb.finishedAt, rank: 0 };
    }).filter(function (r) { return (cfg.EXCLUDE || []).indexOf(r.name) < 0; });
    return rankRows(rows, cfg);
  }

  // 有獎品的名次，依名次分組（並列的人在同一組）：{ winners, groups: [{ rank, members }]（名次小的在前）, extra: 超過幾位 }
  function prizeGroups(rows, n) {
    n = n || A().PRIZE_COUNT || 3;
    var winners = rows.filter(function (r) { return r.rank <= n; }), groups = [];
    winners.forEach(function (r) {
      var g = groups.filter(function (x) { return x.rank === r.rank; })[0];
      if (!g) { g = { rank: r.rank, members: [] }; groups.push(g); }
      g.members.push(r);
    });
    return { winners: winners, groups: groups, extra: Math.max(0, winners.length - n) };
  }

  root.AwardCore = { combine: combine, rankRows: rankRows, prizeGroups: prizeGroups, TIE_KEYS: TIE_KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = root.AwardCore;
})(typeof globalThis !== "undefined" ? globalThis : this);

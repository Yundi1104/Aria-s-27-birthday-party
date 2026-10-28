/**
 * 預覽/彩排專用：產生一份「好友冰狗、迷因海公牛、陪酒小姐都已經玩完」的模擬資料（實際派對用不到）
 */
(function (root) {
  "use strict";
  function seedFinished(bingo, quiz, card) {
    var B = root.BINGO_DATA, C = root.BingoCore, Q = root.QUIZ_DATA, CC = root.CardCore;
    var T = Date.now() - 3600 * 1000, cin = C.checkinCell().id, players = {}, pids = [], t = T;
    B.GUESTS.forEach(function (g, i) { var pid = C.guestId(i); pids.push(pid); players[pid] = { name: g, order: C.makeOrder(pid), joinedAt: T, marked: {} }; players[pid].marked[cin] = T; });
    for (var step = 0; step < 900; step++) {                    // 大家隨機答對格子，每次前進 0.4 秒
      t += 400;
      var pid = pids[Math.floor(Math.random() * pids.length)], p = players[pid];
      var left = p.order.filter(function (id) { return !p.marked[id]; });
      if (left.length && Math.random() < 0.8) p.marked[left[Math.floor(Math.random() * left.length)]] = t;
    }
    bingo.seed({ status: "ended", startedAt: T, durationSec: 600, players: players });

    var starts = {}, durs = {}, answers = {}, buzz = {}, judge = {}, qp = {}, K = root.QuizCore, last = Q.QUESTIONS.length - 1;
    Q.QUESTIONS.forEach(function (q, i) { starts[i] = T + i * 25000; durs[i] = q.type === "buzz" ? 0 : 20; answers[i] = {}; buzz[i] = {}; judge[i] = {}; });
    // 分成 4 組（大約 3 個人這局不玩）
    var pool = pids.slice().sort(function () { return Math.random() - 0.5; }), assign = {};
    pool.slice(3).forEach(function (pid, i) { assign[pid] = i % 4; });
    pids.forEach(function (pid, k) {
      qp[pid] = { name: B.GUESTS[k] };
      var skill = 0.3 + Math.random() * 0.65;
      Q.QUESTIONS.forEach(function (q, i) {
        if (q.todo) return;
        if (q.type === "buzz") { if (Math.random() < 0.4) buzz[i][pid] = starts[i] + 5200 + Math.random() * 3000; return; }
        if (Math.random() < 0.1) return;                          // 偶爾沒作答
        var n = q.options.length, right = Math.random() < skill, choice = q.answer;
        if (!right) { do { choice = Math.floor(Math.random() * n); } while (choice === q.answer); }
        answers[i][pid] = { choice: choice, at: starts[i] + (800 + Math.random() * 8000) };
      });
    });
    Q.QUESTIONS.forEach(function (q, i) {                        // 搶答題：第一個按的人答對
      if (q.type !== "buzz") return;
      var first = Object.keys(buzz[i]).filter(function (pid) { return assign[pid] != null; }).sort(function (a, b) { return buzz[i][a] - buzz[i][b]; })[0];
      if (first) judge[i][first] = true;
    });
    quiz.seed({ status: "ended", index: last, revealed: last, starts: starts, durs: durs, players: qp, answers: answers, buzz: buzz, judge: judge, teams: { count: 4, assign: assign } });

    // 陪酒小姐：大約 17 個人玩（3 個人不玩），一桌，52 張牌輪流抽完
    if (card && CC && card.seed) {
      var play = pids.slice().sort(function () { return Math.random() - 0.5; }).slice(3), deck = CC.makeDeck(), log = {}, cp = {};
      for (var n = 0; n < 52; n++) log[n] = { pid: play[n % play.length], at: T + 2400000 + n * 15000 };
      pids.forEach(function (pid, k) { cp[pid] = { name: B.GUESTS[k] }; });
      card.seed({ status: "ended", mode: "roster", scoring: "first", players: cp, rooms: {}, tables: [{ order: play, deck: deck, variant: CC.variantFor(play.length), log: log, used: {} }] });
    }
  }
  root.DemoSeed = { seedFinished: seedFinished };
})(typeof globalThis !== "undefined" ? globalThis : this);

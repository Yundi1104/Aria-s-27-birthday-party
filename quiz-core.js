/**
 * 問答遊戲（迷因海公牛）— 核心邏輯：題目順序、分組、作答、搶答、計分、組別排名、倒數。玩家端和中控台共用。
 *
 * state 長這樣：
 *   { status: 'lobby'|'intro'|'question'|'reveal'|'ended', index: 目前第幾題(QUESTIONS 的位置，0 開始), revealed: 已揭曉到第幾題,
 *     starts: { 題號: 這題開始的時間 }, durs: { 題號: 主持人設定的秒數（0 = 不倒數）}, revealAt: { 題號: 揭曉的時間 },
 *     players: { pid: { name } },
 *     teams: { count: 幾組, assign: { pid: 組別編號(0開始) }, mode: 'sum'|'average'(可不寫) },   ← 沒在 assign 裡的人 = 這局不玩
 *     answers: { 題號: { pid: { choice: 0~3, at: 最後一次改答案的時間 } } },   ← 選擇題：時間到之前可以一直改，只算最後一次
 *     buzz:    { 題號: { pid: 按下搶答的時間 } },                              ← 搶答題：每人只算第一次按
 *     judge:   { 題號: { pid: true(答對) | false(答錯) } },                    ← 搶答題：主持人判定
 *     extra:   { 題號: { pid: 加分 } } }                                       ← 額外加分（例如全文背誦 +20），只算個人
 *
 * 計分：每答對 1 題 +1 點（個人和所屬組別都算）。最後依組別名次，該組每個人再加 TEAM_BONUS（50/40/30/20/10）。額外加分只加個人。
 */
(function (root) {
  "use strict";
  function D() { return root.QUIZ_DATA; }
  function cfg() { return D().CONFIG; }

  var TEAM_ICONS = ["🔴", "🟡", "🟢", "🔵", "🟣", "🟠", "🟤", "⚪"];
  var TEAM_COLORS = ["#e0554f", "#f3b524", "#4caf6a", "#3b8fd6", "#8a5bc7", "#f08a3c", "#8d6e4a", "#9aa5b1"];
  function teamName(t) { return "第 " + (t + 1) + " 組"; }
  function teamIcon(t) { return TEAM_ICONS[t % TEAM_ICONS.length]; }
  function teamColor(t) { return TEAM_COLORS[t % TEAM_COLORS.length]; }
  function teamLabel(t) { return teamIcon(t) + " " + teamName(t); }

  // ---------- 題目順序（todo 的題目會被跳過）----------
  function Qs() { return D().QUESTIONS; }
  function question(i) { return Qs()[i] || null; }
  function isBuzz(i) { var q = question(i); return !!q && q.type === "buzz"; }
  function order() { var out = []; Qs().forEach(function (q, i) { if (!q.todo) out.push(i); }); return out; }
  function total() { return order().length; }
  function displayNo(i) { return order().indexOf(i) + 1; }          // 畫面上的「第幾題」（跳過待補的題目）
  function firstIndex() { var o = order(); return o.length ? o[0] : -1; }
  function lastIndex() { var o = order(); return o.length ? o[o.length - 1] : -1; }
  function nextIndex(i) { var o = order(); for (var k = 0; k < o.length; k++) if (o[k] > i) return o[k]; return -1; }
  function prevIndex(i) { var o = order(), p = -1; for (var k = 0; k < o.length; k++) { if (o[k] >= i) break; p = o[k]; } return p; }
  function category(i) { var q = question(i); return (q && q.cat) || ""; }
  function catInfo(cat) { return (D().CATEGORIES || {})[cat] || {}; }
  // 這一題是不是新分類的第一題（要先放分類封面）
  function isCatStart(i) { var c = category(i); if (!c) return false; var p = prevIndex(i); return p < 0 || category(p) !== c; }

  // 這題的預設秒數（主持人出題前可以改）；0 = 不倒數
  function defaultSeconds(i) {
    var q = question(i), c = cfg();
    if (q && q.seconds != null) return Number(q.seconds);
    if (q && q.type === "buzz") return c.BUZZ_SECONDS == null ? 0 : Number(c.BUZZ_SECONDS);
    return c.SECONDS;
  }
  // 實際秒數：開始時主持人設定的（存在 state.durs）；沒有就用預設
  function secondsFor(i, state) {
    var d = state && state.durs ? state.durs[i] : null;
    if (d != null && d !== "" && !isNaN(Number(d))) return Number(d);
    return defaultSeconds(i);
  }
  function startOf(state, i) {
    var t = state && state.starts ? state.starts[i] : null;
    return t ? Number(t) : null;
  }

  // 這題還剩幾秒（只有「作答中」才有意義；還沒收到開始時間 = null；不倒數 = Infinity）
  function remaining(state, now) {
    if (!state || state.status !== "question") return null;
    var st = startOf(state, state.index);
    if (!st) return null;
    var dur = secondsFor(state.index, state);
    if (!dur) return Infinity;
    return dur - (now - st) / 1000;
  }

  // ---------- 搶答 ----------
  function buzzDelay() { var d = cfg().BUZZ_DELAY; return d == null ? 5 : Number(d); }
  function unlockAt(state, i) { var st = startOf(state, i); return st ? st + buzzDelay() * 1000 : null; }
  // 搶答順序：[{ pid, name, team, at, ms(開放後幾毫秒按下), rank, judge }]，只算有分組的人、開放之後才按的
  function buzzList(state, i) {
    var bag = (state.buzz && state.buzz[i]) || {}, un = unlockAt(state, i), j = (state.judge && state.judge[i]) || {};
    var rows = Object.keys(bag).filter(function (pid) {
      var at = Number(bag[pid]);
      return at && teamOf(state, pid) >= 0 && (un == null || at >= un - 300);     // 0.3 秒的時鐘誤差寬限
    }).map(function (pid) {
      var at = Number(bag[pid]);
      return { pid: pid, name: nameOf(state, pid), team: teamOf(state, pid), at: at, ms: un == null ? 0 : Math.max(0, at - un),
               judge: j[pid] === true ? true : j[pid] === false ? false : null };
    });
    rows.sort(function (a, b) { return a.at - b.at || (a.pid < b.pid ? -1 : 1); });
    rows.forEach(function (r, k) { r.rank = k + 1; });
    return rows;
  }
  function buzzRank(state, i, pid) { var r = buzzList(state, i).filter(function (x) { return x.pid === pid; })[0]; return r ? r.rank : 0; }

  // ---------- 分組 ----------
  function teamsOf(state) {
    var t = (state && state.teams) || {};
    return { count: Math.max(0, Number(t.count) || 0), assign: t.assign || {}, mode: t.mode === "average" || t.mode === "sum" ? t.mode : null };
  }
  // 這個人在第幾組（0 開始）；沒分組 / 這局不玩 = -1
  function teamOf(state, pid) {
    var T = teamsOf(state), v = T.assign[pid];
    if (v == null || v === "" || isNaN(Number(v))) return -1;
    v = Number(v);
    return v >= 0 && v < T.count ? v : -1;
  }
  function playersOfTeam(state, t) {
    var T = teamsOf(state);
    return Object.keys(T.assign).filter(function (pid) { return teamOf(state, pid) === t; }).sort();
  }
  function assignedPids(state) {
    var T = teamsOf(state);
    return Object.keys(T.assign).filter(function (pid) { return teamOf(state, pid) >= 0; }).sort();
  }
  function nameOf(state, pid) {
    var p = state && state.players && state.players[pid];
    if (p && p.name) return p.name;
    var B = root.BINGO_DATA, C = root.BingoCore;
    if (B && C) { var i = C.guestIndex(pid); if (i >= 0) return B.GUESTS[i]; }
    return pid;
  }

  // ---------- 作答 ----------
  // 選擇題：某個人在某一題的作答結果（沒作答回傳 null）。只看「最後一次」的答案；晚於時限（含寬限）或揭曉之後才改的不算
  function evalAnswer(state, i, pid) {
    var q = question(i);
    if (!q || q.type === "buzz") return null;
    var a = state.answers && state.answers[i] && state.answers[i][pid];
    if (!a || typeof a.choice !== "number") return null;
    var dur = secondsFor(i, state), st = startOf(state, i), at = Number(a.at) || 0, g = cfg().LATE_GRACE_MS || 0;
    var elapsedMs = st ? Math.max(0, at - st) : 0;
    var late = st && dur ? elapsedMs > dur * 1000 + g : false;
    var ra = state.revealAt && state.revealAt[i];
    if (ra && at > Number(ra) + g) late = true;
    return { choice: a.choice, elapsedMs: elapsedMs, late: late, correct: !late && a.choice === q.answer };
  }
  // 不分題型：這個人這題算不算答對
  function isCorrect(state, i, pid) {
    if (isBuzz(i)) return !!(state.judge && state.judge[i] && state.judge[i][pid] === true) && teamOf(state, pid) >= 0;
    var r = evalAnswer(state, i, pid); return !!(r && r.correct);
  }
  function hasResponded(state, i, pid) {
    if (isBuzz(i)) return buzzRank(state, i, pid) > 0;
    var r = evalAnswer(state, i, pid); return !!(r && !r.late);
  }
  function pointsFor(i) { var q = question(i), c = cfg(); return q && q.points != null ? Number(q.points) : (c.POINTS_PER_CORRECT == null ? 1 : c.POINTS_PER_CORRECT); }
  function extraOf(state, i, pid) { var v = state.extra && state.extra[i] && state.extra[i][pid]; return v ? Number(v) || 0 : 0; }

  // 每個選項被選了幾次（只算有分組的人、沒超時的）
  function optionCounts(state, i) {
    var q = question(i), n = q && q.options ? q.options.length : 4, counts = [];
    for (var k = 0; k < n; k++) counts.push(0);
    assignedPids(state).forEach(function (pid) {
      var r = evalAnswer(state, i, pid);
      if (r && !r.late && r.choice >= 0 && r.choice < n) counts[r.choice]++;
    });
    return counts;
  }
  // 有分組的人裡，已經作答（或已按搶答）幾個
  function answeredCount(state, i) {
    return assignedPids(state).filter(function (pid) { return hasResponded(state, i, pid); }).length;
  }
  // 每一組這題的作答進度：[{ answered, size }]（用編號對應）
  function teamProgress(state, i) {
    var T = teamsOf(state), out = [], t;
    for (t = 0; t < T.count; t++) {
      var m = playersOfTeam(state, t);
      out.push({ size: m.length, answered: m.filter(function (pid) { return hasResponded(state, i, pid); }).length });
    }
    return out;
  }

  // ---------- 計分與排名 ----------
  // 只算「已經揭曉」的題目，作答中的題目不會提前影響排名。
  // 回傳 { players: [個人], teams: [每一組（依組別編號）], final: 是不是已經結束 }
  function scoreboard(state) {
    var c = cfg(), through = state.revealed == null ? -1 : Number(state.revealed);
    var T = teamsOf(state), mode = T.mode || c.TEAM_SCORE;                 // 組別怎麼比：中控台可以臨時切換，沒切就用設定檔
    var idx = order().filter(function (i) { return i <= through; });
    var players = assignedPids(state).map(function (pid) {
      var correct = 0, points = 0, extra = 0, gain = 0;
      idx.forEach(function (i) {
        var ok = isCorrect(state, i, pid), ex = extraOf(state, i, pid);
        if (ok) { correct++; points += pointsFor(i); if (i === through) gain = 1; }
        extra += ex;
      });
      return { pid: pid, name: nameOf(state, pid), team: teamOf(state, pid), correct: correct, extra: extra, personal: points + extra, gain: gain, bonus: 0, total: 0, rank: 0 };
    });

    var teams = [], t;
    for (t = 0; t < T.count; t++) {
      var mem = players.filter(function (p) { return p.team === t; });
      var sum = mem.reduce(function (a, p) { return a + p.correct; }, 0);
      var avg = mem.length ? sum / mem.length : 0;
      teams.push({
        team: t, name: teamName(t), icon: teamIcon(t), members: mem.map(function (p) { return p.pid; }), size: mem.length,
        correct: sum, avg: Math.round(avg * 100) / 100, gain: mem.reduce(function (a, p) { return a + (p.gain ? 1 : 0); }, 0),
        score: mode === "average" ? Math.round(avg * 100) / 100 : sum, rank: 0, bonus: 0
      });
    }
    // 組別名次：同分並列（1、1、3…），空的組不排名
    var ranked = teams.filter(function (x) { return x.size > 0; }).sort(function (a, b) { return b.score - a.score || a.team - b.team; });
    ranked.forEach(function (x, i) {
      var prev = ranked[i - 1];
      x.rank = prev && prev.score === x.score ? prev.rank : i + 1;
      x.bonus = (c.TEAM_BONUS || [])[x.rank - 1] || 0;
    });
    players.forEach(function (p) { p.bonus = teams[p.team].bonus; p.total = p.personal + p.bonus; });
    players.sort(function (a, b) { return b.total - a.total || b.correct - a.correct || String(a.name).localeCompare(String(b.name), "zh-Hant"); });
    players.forEach(function (p, i) { var prev = players[i - 1]; p.rank = prev && prev.total === p.total && prev.correct === p.correct ? prev.rank : i + 1; });
    return { players: players, teams: teams, ranked: ranked, final: state.status === "ended", mode: mode };
  }

  // ---------- 影片網址 → 內嵌播放器 ----------
  // 回傳 { kind: 'iframe'|'video', src, open(原始網址) }
  // 網址裡的開始時間：?t=94、&t=94s、?t=1m34s、&start=94 都可以 → 從第幾秒開始播
  function ytStart(url) {
    var m = /[?&#](?:t|start)=([0-9hms]+)/.exec(url); if (!m) return 0;
    var v = m[1]; if (/^\d+$/.test(v)) return parseInt(v, 10);
    var h = /(\d+)h/.exec(v), mi = /(\d+)m/.exec(v), se = /(\d+)s/.exec(v);
    return (h ? parseInt(h[1], 10) * 3600 : 0) + (mi ? parseInt(mi[1], 10) * 60 : 0) + (se ? parseInt(se[1], 10) : 0);
  }
  function videoEmbed(url) {
    if (!url) return null;
    var m = /(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/.exec(url);
    if (m) return { kind: "iframe", src: "https://www.youtube.com/embed/" + m[1] + "?rel=0&playsinline=1" + (ytStart(url) ? "&start=" + ytStart(url) : ""), open: url };
    m = /bilibili\.com\/video\/(BV[A-Za-z0-9]+)/.exec(url);
    if (m) return { kind: "iframe", src: "https://player.bilibili.com/player.html?bvid=" + m[1] + "&autoplay=0&high_quality=1&danmaku=0", open: url };
    if (/^https?:/.test(url) && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return { kind: "iframe", src: url, open: url };
    return { kind: "video", src: url, open: url };
  }

  root.QuizCore = {
    question: question, isBuzz: isBuzz, order: order, total: total, displayNo: displayNo, firstIndex: firstIndex, lastIndex: lastIndex,
    nextIndex: nextIndex, prevIndex: prevIndex, category: category, catInfo: catInfo, isCatStart: isCatStart,
    defaultSeconds: defaultSeconds, secondsFor: secondsFor, startOf: startOf, remaining: remaining,
    buzzDelay: buzzDelay, unlockAt: unlockAt, buzzList: buzzList, buzzRank: buzzRank,
    teamsOf: teamsOf, teamOf: teamOf, playersOfTeam: playersOfTeam, assignedPids: assignedPids, nameOf: nameOf,
    teamName: teamName, teamIcon: teamIcon, teamColor: teamColor, teamLabel: teamLabel, TEAM_ICONS: TEAM_ICONS, TEAM_COLORS: TEAM_COLORS,
    evalAnswer: evalAnswer, isCorrect: isCorrect, hasResponded: hasResponded, pointsFor: pointsFor, extraOf: extraOf,
    optionCounts: optionCounts, answeredCount: answeredCount, teamProgress: teamProgress, scoreboard: scoreboard, videoEmbed: videoEmbed
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.QuizCore;
})(typeof globalThis !== "undefined" ? globalThis : this);

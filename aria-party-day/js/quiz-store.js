/**
 * 問答遊戲 — 資料層（跟賓果一樣：有設定 Firebase 就即時同步，沒有就用本機版）
 *   subscribe(cb) / onConnection(cb) / now()
 *   join(pid, name)               玩家進場
 *   answer(pid, 題號, 選項)        玩家作答（時間到之前可以一直改，以最後一次為準）
 *   setTeams(組數, { pid: 組別編號 }, 計分方式)   中控台：分組（沒被分到組的人 = 這局不玩；計分方式 'sum' | 'average' 可不寫）
 *   showIntro(題號)                中控台：先放分類封面（換分類時）
 *   startQuestion(題號, 秒數)       中控台：開始這題（同時記下開始時間和秒數，倒數就是從這算；秒數 0 = 不倒數）
 *   setDuration(題號, 秒數)         中控台：作答中改秒數（加時、或不倒數的題目開始倒數）
 *   buzz(pid, 題號)                玩家按搶答（只記第一次）
 *   judge(題號, pid, true|false|null)   中控台：判定搶答的人答對 / 答錯 / 取消
 *   giveExtra(題號, pid, 分數|null)  中控台：額外加分（例如全文背誦 +20）
 *   reveal(題號)                   中控台：揭曉答案（排名從這時才算進這題）
 *   end() / reset()
 */
(function (root) {
  "use strict";
  var KEY = "ariaQuiz.state.v1";

  function blank() { return { status: "lobby", index: -1, revealed: -1, starts: {}, durs: {}, revealAt: {}, players: {}, answers: {}, buzz: {}, judge: {}, extra: {}, teams: { count: 0, assign: {} } }; }
  function bagSet(obj, i, pid, v) { obj[i] = obj[i] || {}; if (v == null) delete obj[i][pid]; else obj[i][pid] = v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ================= 本機版 / 記憶體版 =================
  function createLocalStore(opts) {
    opts = opts || {};
    var persist = opts.persist !== false && (function () {
      try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; }
    })();
    var state = blank(), subs = [];
    function load() {
      try { var raw = localStorage.getItem(KEY); state = raw ? Object.assign(blank(), JSON.parse(raw)) : blank(); } catch (e) { state = blank(); }
    }
    if (persist) load();
    // 通知所有訂閱者；如果有人在收到通知時又寫入資料，就等這一輪通知完再補發一次最新的，確保大家看到的順序一致
    var emitting = false, again = false;
    function emit() {
      if (emitting) { again = true; return; }
      emitting = true;
      try { do { again = false; var snap = clone(state); subs.slice().forEach(function (f) { f(snap); }); } while (again); }
      finally { emitting = false; }
    }
    function commit() {
      if (persist) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
      emit();
    }
    if (persist && typeof window !== "undefined") {
      window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); emit(); } });
    }
    return {
      mode: persist ? "local" : "memory",
      subscribe: function (cb) { subs.push(cb); cb(clone(state)); return function () { subs = subs.filter(function (f) { return f !== cb; }); }; },
      onConnection: function (cb) { cb(true); return function () {}; },
      now: function () { return Date.now(); },
      seed: function (s) { state = Object.assign(blank(), clone(s)); commit(); },     // 只給預覽/測試用：直接塞一份資料
      join: function (pid, name) {
        if (!state.players[pid]) { state.players[pid] = { name: name, joinedAt: Date.now() }; commit(); }
        return Promise.resolve();
      },
      answer: function (pid, i, choice) {
        state.answers[i] = state.answers[i] || {};
        var cur = state.answers[i][pid];
        if (!cur || cur.choice !== choice) { state.answers[i][pid] = { choice: choice, at: Date.now() }; commit(); }     // 可以改答案，記下最後一次
        return Promise.resolve();
      },
      setTeams: function (count, assign, mode) { state.teams = { count: count, assign: clone(assign || {}) }; if (mode) state.teams.mode = mode; commit(); return Promise.resolve(); },
      showIntro: function (i) { state.status = "intro"; state.index = i; commit(); return Promise.resolve(); },
      startQuestion: function (i, sec) {
        state.status = "question"; state.index = i; state.starts[i] = Date.now();
        if (sec != null) state.durs[i] = Number(sec); else delete state.durs[i];
        commit(); return Promise.resolve();
      },
      setDuration: function (i, sec) { state.durs[i] = Number(sec); commit(); return Promise.resolve(); },
      buzz: function (pid, i) {
        state.buzz[i] = state.buzz[i] || {};
        if (!state.buzz[i][pid]) { state.buzz[i][pid] = Date.now(); commit(); }        // 只算第一次按
        return Promise.resolve();
      },
      judge: function (i, pid, v) { bagSet(state.judge, i, pid, v === true || v === false ? v : null); commit(); return Promise.resolve(); },
      giveExtra: function (i, pid, pts) { bagSet(state.extra, i, pid, pts ? Number(pts) : null); commit(); return Promise.resolve(); },
      reveal: function (i) { state.status = "reveal"; state.revealed = i; if (!state.revealAt[i]) state.revealAt[i] = Date.now(); commit(); return Promise.resolve(); },
      end: function () { state.status = "ended"; commit(); return Promise.resolve(); },
      reset: function () { var keep = state.teams; state = blank(); state.teams = keep || state.teams; commit(); return Promise.resolve(); },   // 重置只清作答，分組保留（要清掉分組用「清除分組」）
      clearAll: function () { state = blank(); commit(); return Promise.resolve(); }
    };
  }

  // ================= Firebase 版 =================
  function createFirebaseStore() {
    var ready = root.PartyFirebase.get();
    var offset = 0;
    ready.then(function (h) { h.d.onValue(h.d.ref(h.db, ".info/serverTimeOffset"), function (s) { offset = s.val() || 0; }); });

    function normalize(v) {
      v = v || {};
      var out = { status: v.status || "lobby", index: v.index == null ? -1 : v.index, revealed: v.revealed == null ? -1 : v.revealed,
                  starts: {}, durs: {}, revealAt: {}, players: {}, answers: {}, buzz: {}, judge: {}, extra: {}, teams: { count: 0, assign: {} } };
      // Firebase 會把 0,1,2… 這種連號的 key 變成陣列，所以一律用 Object.keys 拆開
      ["starts", "durs", "revealAt"].forEach(function (k) {
        Object.keys(v[k] || {}).forEach(function (i) { if (v[k][i] != null) out[k][i] = v[k][i]; });
      });
      ["buzz", "judge", "extra"].forEach(function (k) {
        Object.keys(v[k] || {}).forEach(function (i) {
          var bag = v[k][i]; if (!bag) return;
          out[k][i] = {};
          Object.keys(bag).forEach(function (pid) { if (bag[pid] != null) out[k][i][pid] = bag[pid]; });
        });
      });
      Object.keys(v.players || {}).forEach(function (pid) { out.players[pid] = { name: (v.players[pid] || {}).name || pid }; });
      var tv = v.teams || {};
      out.teams.count = Number(tv.count) || 0; if (tv.mode) out.teams.mode = tv.mode;
      Object.keys(tv.assign || {}).forEach(function (pid) { if (tv.assign[pid] != null) out.teams.assign[pid] = tv.assign[pid]; });
      Object.keys(v.answers || {}).forEach(function (i) {
        var bag = v.answers[i]; if (!bag) return;
        out.answers[i] = {};
        Object.keys(bag).forEach(function (pid) { if (bag[pid]) out.answers[i][pid] = { choice: bag[pid].choice, at: bag[pid].at }; });
      });
      return out;
    }
    function listen(path, cb) {
      var off = null, dead = false;
      ready.then(function (h) { if (!dead) off = h.d.onValue(h.d.ref(h.db, path), cb); });
      return function () { dead = true; if (off) off(); };
    }
    return {
      mode: "firebase",
      subscribe: function (cb) { return listen("quiz", function (snap) { cb(normalize(snap.val())); }); },
      onConnection: function (cb) { return listen(".info/connected", function (s) { cb(!!s.val()); }); },
      now: function () { return Date.now() + offset; },
      join: function (pid, name) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/players/" + pid), { name: name, joinedAt: h.d.serverTimestamp() }); });
      },
      answer: function (pid, i, choice) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/answers/" + i + "/" + pid), { choice: choice, at: h.d.serverTimestamp() }); });
      },
      setTeams: function (count, assign, mode) {
        var v = { count: count, assign: assign || {} }; if (mode) v.mode = mode;
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/teams"), v); });
      },
      showIntro: function (i) {
        return ready.then(function (h) { return h.d.update(h.d.ref(h.db, "quiz"), { status: "intro", index: i }); });
      },
      startQuestion: function (i, sec) {
        return ready.then(function (h) {
          var u = { status: "question", index: i }; u["starts/" + i] = h.d.serverTimestamp(); u["durs/" + i] = sec == null ? null : Number(sec);
          return h.d.update(h.d.ref(h.db, "quiz"), u);
        });
      },
      setDuration: function (i, sec) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/durs/" + i), Number(sec)); });
      },
      buzz: function (pid, i) {        // 只記第一次按（已經按過就不再寫，不會被第二次按蓋掉）
        return ready.then(function (h) {
          var r = h.d.ref(h.db, "quiz/buzz/" + i + "/" + pid);
          return h.d.get(r).then(function (snap) { if (!snap.exists()) return h.d.set(r, h.d.serverTimestamp()); });
        });
      },
      judge: function (i, pid, v) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/judge/" + i + "/" + pid), v === true || v === false ? v : null); });
      },
      giveExtra: function (i, pid, pts) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/extra/" + i + "/" + pid), pts ? Number(pts) : null); });
      },
      reveal: function (i) {
        return ready.then(function (h) {
          var u = { status: "reveal", revealed: i }; u["revealAt/" + i] = h.d.serverTimestamp();
          return h.d.update(h.d.ref(h.db, "quiz"), u);
        });
      },
      end: function () { return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz/status"), "ended"); }); },
      reset: function () {      // 只清作答，分組保留
        return ready.then(function (h) { return h.d.update(h.d.ref(h.db, "quiz"), { status: "lobby", index: -1, revealed: -1, starts: null, durs: null, revealAt: null, answers: null, buzz: null, judge: null, extra: null, players: null }); });
      },
      clearAll: function () {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "quiz"), { status: "lobby", index: -1, revealed: -1 }); });
      }
    };
  }

  root.QuizStore = {
    create: function (opts) {
      opts = opts || {};
      if (opts.memory) return createLocalStore({ persist: false });
      if (root.FIREBASE_CONFIG && root.PartyFirebase) return createFirebaseStore();
      return createLocalStore({ persist: true });
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.QuizStore;
})(typeof globalThis !== "undefined" ? globalThis : this);

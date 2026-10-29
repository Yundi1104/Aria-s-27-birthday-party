/**
 * 資料層：把「存哪裡、怎麼即時同步」包起來，玩家端和中控台都只用這幾個函式：
 *   subscribe(cb)  任何資料變動就呼叫 cb(state)
 *   join / mark / setStatus / extend / reset / now
 * 有設定 Firebase 就用 Firebase（手機之間即時同步）；
 * 沒設定就用本機版（同一個瀏覽器的分頁之間同步，測試用）。
 *
 * state 長這樣：
 *   { status: 'lobby' | 'playing' | 'ended', startedAt, durationSec,   // 開始時間、這局幾秒（倒數用）
 *     players: { g01: { name, order:[...25個題目id], joinedAt, marked:{ 題目id: 答對時間 } } } }
 */
(function (root) {
  "use strict";
  var KEY = "ariaBingo.state.v1";

  function blank() { return { status: "lobby", startedAt: null, durationSec: null, players: {} }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ================= 本機版 / 記憶體版 =================
  function createLocalStore(opts) {
    opts = opts || {};
    var persist = opts.persist !== false && (function () {
      try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch (e) { return false; }
    })();
    var state = blank(), subs = [];

    function load() {
      try {
        var raw = localStorage.getItem(KEY);
        state = raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
      } catch (e) { state = blank(); }
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
      subscribe: function (cb) {
        subs.push(cb); cb(clone(state));
        return function () { subs = subs.filter(function (f) { return f !== cb; }); };
      },
      onConnection: function (cb) { cb(true); return function () {}; },
      join: function (pid, name, order, checkinId) {
        if (!state.players[pid]) {
          var now = Date.now(), m = {};
          if (checkinId) m[checkinId] = now;
          state.players[pid] = { name: name, order: order.slice(), joinedAt: now, marked: m };
          commit();
        }
        return Promise.resolve();
      },
      mark: function (pid, cellId) {
        var p = state.players[pid];
        if (p) { p.marked = p.marked || {}; if (!p.marked[cellId]) { p.marked[cellId] = Date.now(); commit(); } }
        return Promise.resolve();
      },
      // 開始遊戲時（s = 'playing'）順便記下開始時間和這局長度，倒數就是從這裡算的
      setStatus: function (s, o) {
        state.status = s;
        if (s === "playing") { state.startedAt = Date.now(); state.durationSec = (o && o.durationSec) || null; }
        commit(); return Promise.resolve();
      },
      extend: function (sec) {
        if (state.durationSec != null) { state.durationSec += sec; commit(); }
        return Promise.resolve();
      },
      now: function () { return Date.now(); },
      seed: function (s) { state = Object.assign(blank(), clone(s)); commit(); },     // 只給預覽/測試用：直接塞一份資料
      reset: function () { state = blank(); commit(); return Promise.resolve(); }
    };
  }

  // ================= Firebase Realtime Database 版 =================
  // 賓果和問答共用同一條 Firebase 連線（只初始化一次）
  var fbPromise = null;
  function getFirebase(cfg) {
    if (!fbPromise) {
      var base = "https://www.gstatic.com/firebasejs/10.12.2/";
      fbPromise = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-database.js")])
        .then(function (m) {
          var app = m[0].initializeApp(cfg);
          return { d: m[1], db: m[1].getDatabase(app) };
        });
      fbPromise.catch(function (e) { console.error("Firebase 載入失敗：", e); });
    }
    return fbPromise;
  }
  root.PartyFirebase = { get: function () { return getFirebase(root.FIREBASE_CONFIG); } };

  function createFirebaseStore(cfg) {
    var ready = getFirebase(cfg);

    // 伺服器時間和這台電腦時間的差（倒數用伺服器時間算，才不會因為電腦時鐘不準而亂掉）
    var offset = 0;
    ready.then(function (h) { h.d.onValue(h.d.ref(h.db, ".info/serverTimeOffset"), function (s) { offset = s.val() || 0; }); });

    function normalize(v) {
      v = v || {};
      var out = { status: v.status || "lobby", startedAt: v.startedAt || null, durationSec: v.durationSec || null, players: {} };
      var ps = v.players || {};
      Object.keys(ps).forEach(function (pid) {
        var p = ps[pid] || {};
        out.players[pid] = {
          name: p.name || pid,
          order: typeof p.order === "string" ? p.order.split(",").filter(Boolean) : (Array.isArray(p.order) ? p.order : []),
          joinedAt: p.joinedAt || 0,
          marked: p.marked || {}
        };
      });
      return out;
    }

    return {
      mode: "firebase",
      subscribe: function (cb) {
        var off = null, dead = false;
        ready.then(function (h) {
          if (dead) return;
          off = h.d.onValue(h.d.ref(h.db, "bingo"), function (snap) { cb(normalize(snap.val())); });
        });
        return function () { dead = true; if (off) off(); };
      },
      onConnection: function (cb) {
        var off = null, dead = false;
        ready.then(function (h) {
          if (dead) return;
          off = h.d.onValue(h.d.ref(h.db, ".info/connected"), function (s) { cb(!!s.val()); });
        });
        return function () { dead = true; if (off) off(); };
      },
      join: function (pid, name, order, checkinId) {
        return ready.then(function (h) {
          var r = h.d.ref(h.db, "bingo/players/" + pid);
          return h.d.get(r).then(function (snap) {
            if (snap.exists()) return;
            var marked = {};
            if (checkinId) marked[checkinId] = h.d.serverTimestamp();
            return h.d.set(r, { name: name, order: order.join(","), joinedAt: h.d.serverTimestamp(), marked: marked });
          });
        });
      },
      mark: function (pid, cellId) {
        return ready.then(function (h) {
          return h.d.set(h.d.ref(h.db, "bingo/players/" + pid + "/marked/" + cellId), h.d.serverTimestamp());
        });
      },
      setStatus: function (s, o) {
        return ready.then(function (h) {
          var tasks = [h.d.set(h.d.ref(h.db, "bingo/status"), s)];
          if (s === "playing") {
            tasks.push(h.d.set(h.d.ref(h.db, "bingo/startedAt"), h.d.serverTimestamp()));
            tasks.push(h.d.set(h.d.ref(h.db, "bingo/durationSec"), (o && o.durationSec) || null));
          }
          return Promise.all(tasks);
        });
      },
      extend: function (sec) {
        return ready.then(function (h) {
          return h.d.runTransaction(h.d.ref(h.db, "bingo/durationSec"), function (cur) { return cur == null ? cur : cur + sec; });
        });
      },
      now: function () { return Date.now() + offset; },
      reset: function () {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "bingo"), { status: "lobby" }); });
      }
    };
  }

  root.BingoStore = {
    create: function (opts) {
      opts = opts || {};
      if (opts.memory) return createLocalStore({ persist: false });
      if (root.FIREBASE_CONFIG) return createFirebaseStore(root.FIREBASE_CONFIG);
      return createLocalStore({ persist: true });
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.BingoStore;
})(typeof globalThis !== "undefined" ? globalThis : this);

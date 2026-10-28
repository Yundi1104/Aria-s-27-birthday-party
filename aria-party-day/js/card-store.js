/**
 * 陪酒小姐 — 資料層（跟賓果、問答一樣：有 Firebase 就即時同步，沒有就用本機版）
 *   subscribe(cb) / onConnection(cb) / now()
 *   join(pid, name)                 玩家進場
 *   start({ mode, scoring, tables:[{order, deck, variant}] })   中控台：開始遊戲（把每一桌的順序和洗好的牌寫進去；scoring = "first" | "all"，計分方式）
 *   draw(桌, 第幾次, pid)            抽牌          skip(桌, 第幾次, pid)   跳過這個人
 *   useToilet(桌, 第幾次)            用掉廁所牌
 *   end() / reset()
 *   自由開局（玩家自己開一桌）：createRoom(id, {creator, order, deck, variant}) / roomDraw / roomSkip / roomUseToilet / roomEnd / roomDelete
 */
(function (root) {
  "use strict";
  var KEY = "ariaCard.state.v1";

  function blank() { return { status: "lobby", mode: "roster", scoring: null, free: false, players: {}, tables: [], rooms: {} }; }
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
    function table(t) { return state.tables[t]; }
    return {
      mode: persist ? "local" : "memory",
      subscribe: function (cb) { subs.push(cb); cb(clone(state)); return function () { subs = subs.filter(function (f) { return f !== cb; }); }; },
      onConnection: function (cb) { cb(true); return function () {}; },
      now: function () { return Date.now(); },
      join: function (pid, name) {
        if (!state.players[pid]) { state.players[pid] = { name: name, joinedAt: Date.now() }; commit(); }
        return Promise.resolve();
      },
      seed: function (s) { state = Object.assign(blank(), clone(s)); commit(); },     // 只給預覽/測試用：直接塞一份資料
      start: function (plan) {
        state.status = "playing"; state.mode = plan.mode || "roster"; state.scoring = plan.scoring || null;
        state.tables = plan.tables.map(function (t) { return { order: t.order.slice(), deck: t.deck.slice(), variant: t.variant || null, log: {}, used: {} }; });
        commit(); return Promise.resolve();
      },
      draw: function (t, n, pid) {
        var tb = table(t); if (tb && !tb.log[n]) { tb.log[n] = { pid: pid, at: Date.now() }; commit(); }
        return Promise.resolve();
      },
      skip: function (t, n, pid) {
        var tb = table(t); if (tb && !tb.log[n]) { tb.log[n] = { pid: pid, skip: true, at: Date.now() }; commit(); }
        return Promise.resolve();
      },
      useToilet: function (t, n) {
        var tb = table(t); if (tb) { tb.used = tb.used || {}; tb.used[n] = true; commit(); }
        return Promise.resolve();
      },
      end: function () { state.status = "ended"; commit(); return Promise.resolve(); },
      setFree: function (on) { state.free = !!on; commit(); return Promise.resolve(); },   // 中控台切換：手機變成「自由開局」（不計分）
      // 自由開局：玩家自己開的房間（不經過中控台）
      createRoom: function (id, r) {
        state.rooms = state.rooms || {};
        state.rooms[id] = { creator: r.creator, order: r.order.slice(), deck: r.deck.slice(), variant: r.variant || "v10", log: {}, used: {}, ended: false, createdAt: Date.now() };
        commit(); return Promise.resolve();
      },
      roomDraw: function (id, n, pid) {
        var r = state.rooms && state.rooms[id]; if (r && !r.log[n]) { r.log[n] = { pid: pid, at: Date.now() }; commit(); }
        return Promise.resolve();
      },
      roomSkip: function (id, n, pid) {
        var r = state.rooms && state.rooms[id]; if (r && !r.log[n]) { r.log[n] = { pid: pid, skip: true, at: Date.now() }; commit(); }
        return Promise.resolve();
      },
      roomUseToilet: function (id, n) {
        var r = state.rooms && state.rooms[id]; if (r) { r.used = r.used || {}; r.used[n] = true; commit(); }
        return Promise.resolve();
      },
      roomEnd: function (id) { var r = state.rooms && state.rooms[id]; if (r) { r.ended = true; commit(); } return Promise.resolve(); },
      roomDelete: function (id) { if (state.rooms && state.rooms[id]) { delete state.rooms[id]; commit(); } return Promise.resolve(); },
      reset: function () { var keep = state.rooms || {}, free = state.free; state = blank(); state.rooms = keep; state.free = !!free; commit(); return Promise.resolve(); }   // 只重置主遊戲，自由開局的房間和「手機是不是自由開局」都不動
    };
  }

  // ================= Firebase 版 =================
  function createFirebaseStore() {
    var ready = root.PartyFirebase.get();
    var offset = 0;
    ready.then(function (h) { h.d.onValue(h.d.ref(h.db, ".info/serverTimeOffset"), function (s) { offset = s.val() || 0; }); });

    // Firebase 會把 0,1,2… 這種連號的 key 變成陣列，所以一律用 Object.keys 拆開；順序和牌是用字串存的
    function normalize(v) {
      v = v || {};
      var out = { status: v.status || "lobby", mode: v.mode || "roster", scoring: v.scoring || null, free: !!v.free, players: {}, tables: [], rooms: {} };
      Object.keys(v.players || {}).forEach(function (pid) { out.players[pid] = { name: (v.players[pid] || {}).name || pid }; });
      function oneTable(t) {
        var log = {}, used = {};
        Object.keys(t.log || {}).forEach(function (n) { if (t.log[n]) log[n] = { pid: t.log[n].pid, skip: !!t.log[n].skip, at: t.log[n].at }; });
        Object.keys(t.used || {}).forEach(function (n) { if (t.used[n]) used[n] = true; });
        return { order: String(t.order || "").split(",").filter(Boolean), deck: String(t.deck || "").split(",").filter(Boolean),
                 variant: t.variant || null, log: log, used: used };
      }
      var ts = v.tables || {};
      Object.keys(ts).forEach(function (k) { if (ts[k]) out.tables[Number(k)] = oneTable(ts[k]); });
      out.tables = out.tables.filter(Boolean);
      var rs = v.rooms || {};
      Object.keys(rs).forEach(function (id) {
        if (!rs[id]) return;
        var r = oneTable(rs[id]); r.creator = rs[id].creator; r.ended = !!rs[id].ended; r.createdAt = rs[id].createdAt || 0; r.variant = rs[id].variant || "v10";
        out.rooms[id] = r;
      });
      return out;
    }
    function listen(path, cb) {
      var off = null, dead = false;
      ready.then(function (h) { if (!dead) off = h.d.onValue(h.d.ref(h.db, path), cb); });
      return function () { dead = true; if (off) off(); };
    }
    function put(path, val) { return ready.then(function (h) { return h.d.set(h.d.ref(h.db, path), val); }); }
    return {
      mode: "firebase",
      subscribe: function (cb) { return listen("card", function (snap) { cb(normalize(snap.val())); }); },
      onConnection: function (cb) { return listen(".info/connected", function (s) { cb(!!s.val()); }); },
      now: function () { return Date.now() + offset; },
      join: function (pid, name) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "card/players/" + pid), { name: name, joinedAt: h.d.serverTimestamp() }); });
      },
      start: function (plan) {
        return ready.then(function (h) {
          var tables = {};
          plan.tables.forEach(function (t, i) { tables[i] = { order: t.order.join(","), deck: t.deck.join(","), variant: t.variant || null }; });
          return h.d.update(h.d.ref(h.db, "card"), { status: "playing", mode: plan.mode || "roster", scoring: plan.scoring || null, tables: tables });
        });
      },
      draw: function (t, n, pid) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "card/tables/" + t + "/log/" + n), { pid: pid, at: h.d.serverTimestamp() }); });
      },
      skip: function (t, n, pid) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "card/tables/" + t + "/log/" + n), { pid: pid, skip: true, at: h.d.serverTimestamp() }); });
      },
      useToilet: function (t, n) { return put("card/tables/" + t + "/used/" + n, true); },
      end: function () { return put("card/status", "ended"); },
      setFree: function (on) { return put("card/free", on ? true : null); },
      createRoom: function (id, r) {
        return ready.then(function (h) {
          return h.d.set(h.d.ref(h.db, "card/rooms/" + id), { creator: r.creator, order: r.order.join(","), deck: r.deck.join(","),
            variant: r.variant || "v10", ended: false, createdAt: h.d.serverTimestamp() });
        });
      },
      roomDraw: function (id, n, pid) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "card/rooms/" + id + "/log/" + n), { pid: pid, at: h.d.serverTimestamp() }); });
      },
      roomSkip: function (id, n, pid) {
        return ready.then(function (h) { return h.d.set(h.d.ref(h.db, "card/rooms/" + id + "/log/" + n), { pid: pid, skip: true, at: h.d.serverTimestamp() }); });
      },
      roomUseToilet: function (id, n) { return put("card/rooms/" + id + "/used/" + n, true); },
      roomEnd: function (id) { return put("card/rooms/" + id + "/ended", true); },
      roomDelete: function (id) { return put("card/rooms/" + id, null); },
      reset: function () {          // 只重置主遊戲（開局設定 + 人數進場），玩家自己開的房間不動
        return ready.then(function (h) {
          return Promise.all([h.d.set(h.d.ref(h.db, "card/status"), "lobby"), h.d.set(h.d.ref(h.db, "card/mode"), "roster"), h.d.set(h.d.ref(h.db, "card/scoring"), null),
                              h.d.set(h.d.ref(h.db, "card/tables"), null), h.d.set(h.d.ref(h.db, "card/players"), null)]);
        });
      }
    };
  }

  root.CardStore = {
    create: function (opts) {
      opts = opts || {};
      if (opts.memory) return createLocalStore({ persist: false });
      if (root.FIREBASE_CONFIG && root.PartyFirebase) return createFirebaseStore();
      return createLocalStore({ persist: true });
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CardStore;
})(typeof globalThis !== "undefined" ? globalThis : this);

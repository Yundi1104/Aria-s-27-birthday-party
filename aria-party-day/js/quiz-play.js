/**
 * 問答遊戲 — 玩家端（手機畫面）
 * QuizGame.mountPlayer(容器, store, 選項)
 */
(function (root) {
  "use strict";
  var B = root.BINGO_DATA, C = root.BingoCore, Q = root.QUIZ_DATA, K = root.QuizCore, el = C.el;
  var LS_KEY = "ariaBingo.me";            // 跟賓果共用同一個「我是誰」
  var LETTERS = ["A", "B", "C", "D"], CLS = ["a", "b", "c", "d"];

  function mountPlayer(host, store, opts) {
    opts = opts || {};
    var persist = opts.persistIdentity !== false;
    var me = null, state = null, connected = true, view = null, joining = false, lastSig = null;
    var pending = null;               // 剛點下去、還沒收到伺服器回應的答案 {i, choice}
    var toastTimer = null, refs = {};

    if (persist) { try { me = localStorage.getItem(LS_KEY) || null; } catch (e) {} }
    if (me && C.guestIndex(me) < 0) me = null;
    if (opts.initialMe && C.guestIndex(opts.initialMe) >= 0) me = opts.initialMe;   // 預覽用：直接指定是誰

    host.innerHTML = "";
    var wrap = el("div", { "class": "bp-wrap" });
    var scroll = el("div", { "class": "bp-scroll" });
    var inner = el("div", { "class": "bp-inner" });
    var toast = el("div", { "class": "bp-toast" });
    var mask = el("div", { "class": "bp-mask" });
    scroll.appendChild(inner); wrap.appendChild(scroll); wrap.appendChild(mask); wrap.appendChild(toast); host.appendChild(wrap);
    mask.addEventListener("click", function (e) { if (e.target === mask) closeScoring(); });

    // ---------- 計分說明（右上角「計分」）----------
    function closeScoring() { mask.classList.remove("show"); mask.innerHTML = ""; }
    function openScoring() {
      var C2 = Q.CONFIG, per = C2.POINTS_PER_CORRECT == null ? 1 : C2.POINTS_PER_CORRECT, tb = C2.TEAM_BONUS || [];
      var bonusQs = Q.QUESTIONS.filter(function (q) { return q.bonus && !q.todo; });
      var table = el("div", { "class": "bp-sc-table" });
      tb.forEach(function (pt, i) { table.appendChild(el("div", { "class": "bp-sc-cell" }, [el("span", { "class": "r", text: "第 " + (i + 1) + " 名組" }), el("b", { text: "+" + pt })])); });
      mask.innerHTML = "";
      mask.appendChild(el("div", { "class": "bp-sheet bp-scoring" }, [
        el("h3", { text: "🏆 迷因海公牛怎麼計分" }),
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "① 答對分：每答對 1 題 +" + per + " 分（算你自己的）" }),
          el("p", { text: "選擇題：時間到之前可以一直改答案，以最後一次為準。搶答題：題目出現 " + K.buzzDelay() + " 秒後才能按，主持人判定答對才算。" })
        ]),
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "② 組別加分：最後依組別名次，該組每個人都加" }), table,
          el("p", { "class": "s", text: "組別名次 = 全組答對題數加總；同分的組並列同名次。沒有分組的人這局不算分。" })
        ]),
        bonusQs.length ? el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "③ 額外加分" }),
          el("p", { text: bonusQs.map(function (q) { return q.bonus.label + " +" + q.bonus.points; }).join("；") + "（主持人點名加分，只加個人）" })
        ]) : null,
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: (bonusQs.length ? "④" : "③") + " 總分" }),
          el("p", { text: "迷因海公牛分數 = 答對分 + 組別加分" + (bonusQs.length ? " + 額外加分" : "") + "，會加進派對的遊戲總分（好友冰狗 + 迷因海公牛 + 陪酒小姐），總分前 3 名有禮物 🎁" })
        ]),
        el("button", { "class": "bp-btn", type: "button", text: "知道了", onclick: closeScoring })
      ]));
      mask.classList.add("show");
    }

    function showToast(msg, good) {
      toast.textContent = msg; toast.className = "bp-toast show" + (good ? " good" : "");
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.className = "bp-toast"; }, 1600);
    }
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
        el("h1", { text: "🧠 迷因海公牛" }),
        el("p", {}, ["看題目、選答案", el("br"), "時間到之前可以改答案，也可以跟組員討論！"]),
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
      var pr = store.join(me, B.GUESTS[C.guestIndex(me)]);
      var done = function () { joining = false; };
      if (pr && pr.then) pr.then(done, done); else done();
    }
    function switchUser() {
      me = null; view = null; lastSig = null;
      if (persist) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
      render();
    }

    // ---------- 作答 ----------
    // 時間到之前可以一直改答案，以最後一次為準
    function myAnswer() {
      if (pending && pending.i === state.index) return pending.choice;
      var a = state.answers[state.index] && state.answers[state.index][me];
      return a && typeof a.choice === "number" ? a.choice : null;
    }
    function choose(i) {
      if (state.status !== "question") return;
      if (K.teamOf(state, me) < 0) { showToast("這局你沒有分組，用看的就好"); return; }
      var rem = K.remaining(state, store.now());
      if (rem != null && rem <= 0) { showToast("時間到了"); return; }
      var before = myAnswer();
      if (before === i) return;
      pending = { i: state.index, choice: i };
      store.answer(me, state.index, i);
      showToast(before == null ? "已送出！可以再改" : "已改成 " + LETTERS[i], true);
      lastSig = null; render();
    }

    // ---------- 搶答 ----------
    var buzzedLocal = null;          // 剛按下、還沒收到伺服器回應的搶答 {i}
    function myBuzz() { return (buzzedLocal === state.index) || !!(state.buzz && state.buzz[state.index] && state.buzz[state.index][me]); }
    function pressBuzz() {
      if (state.status !== "question" || !K.isBuzz(state.index)) return;
      if (K.teamOf(state, me) < 0) { showToast("這局你沒有分組，用看的就好"); return; }
      var un = K.unlockAt(state, state.index);
      if (!un || store.now() < un) { showToast("還不能按喔"); return; }
      if (myBuzz()) return;
      buzzedLocal = state.index;
      store.buzz(me, state.index);
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
      lastSig = null; render();
    }

    // ---------- 畫面 ----------
    function bonusText() { return (Q.CONFIG.TEAM_BONUS || []).join(" / "); }
    function renderGame() {
      var p = state.players[me];
      if (!p) { inner.textContent = "進場中…"; ensureJoined(); return; }
      joining = false;

      if (state.status === "lobby") buzzedLocal = null;
      var board = K.scoreboard(state), team = K.teamOf(state, me);
      var mine = board.players.filter(function (r) { return r.pid === me; })[0] || null, trow = team >= 0 ? board.teams[team] : null;
      var status = state.status, qi = state.index, q = Q.QUESTIONS[qi], chosen = (q ? myAnswer() : null);
      var isBz = K.isBuzz(qi), bz = isBz && status !== "lobby" ? K.buzzRank(state, qi, me) + ":" + myBuzz() + ":" + (state.judge && state.judge[qi] ? state.judge[qi][me] : "") : "";
      var sig = [status, qi, chosen, bz, mine ? mine.total + ":" + mine.correct : "-", trow ? trow.rank + ":" + trow.score + ":" + trow.size : "-", team, K.teamsOf(state).count, state.revealed, connected, K.secondsFor(qi, state)].join("|");
      if (sig === lastSig) return;                 // 別人答題不用重畫（也不會洩漏他們的答案）
      lastSig = sig;

      inner.innerHTML = ""; refs = {};
      addNote();

      var scoreText = team < 0 ? "沒有分組" : K.teamLabel(team) + (state.revealed >= 0 && trow && trow.rank ? "・第 " + trow.rank + " 名" : "");
      inner.appendChild(el("div", { "class": "qp-top" }, [
        backBtn(true),
        el("div", { "class": "bp-who" }, [el("span", { "class": "bp-dot" + (connected ? "" : " off") }), p.name]),
        el("div", { "class": "qp-score", text: scoreText }),
        el("button", { "class": "bp-link", type: "button", text: "計分", onclick: openScoring }),
        el("button", { "class": "bp-link", type: "button", text: "換人", onclick: switchUser })
      ]));
      if (team >= 0 && status !== "lobby" && status !== "ended") {
        var bar = el("div", { "class": "qp-teambar", text: K.teamLabel(team) + "　你答對 " + (mine ? mine.correct : 0) + " 題　本組答對 " + (trow ? trow.correct : 0) + " 題" });
        bar.style.background = K.teamColor(team); inner.appendChild(bar);
      } else if (team < 0 && status !== "lobby" && status !== "ended") {
        inner.appendChild(el("div", { "class": "qp-observe", text: "👀 這局你沒有分組，用看的就好" }));
      }

      if (status === "lobby") {
        inner.appendChild(el("div", { "class": "bp-note" }, ["✅ 已進場"]));
        inner.appendChild(el("div", { "class": "qp-rules" }, [
          "共 " + K.total() + " 題，看大螢幕作答", el("br"),
          "時間到之前可以改答案，可以跟組員討論", el("br"),
          "搶答題：題目出現 " + K.buzzDelay() + " 秒後才能按搶答鈕", el("br"),
          "每答對 1 題 +" + Q.CONFIG.POINTS_PER_CORRECT + " 分", el("br"),
          "最後依組別名次，該組每個人加 " + bonusText() + " 分"
        ]));
        return;
      }
      if (status === "ended") { renderFinal(board, mine, team); return; }
      if (!q) return;
      if (status === "intro") {
        var cat = K.category(qi), info = K.catInfo(cat);
        inner.appendChild(el("div", { "class": "qp-intro" }, [
          el("div", { "class": "qp-intro-k", text: "下一個主題" }),
          info.img ? el("img", { "class": "qp-img", src: info.img, alt: "" }) : null,
          el("div", { "class": "qp-intro-t", text: cat }),
          info.sub ? el("div", { "class": "qp-intro-s", text: info.sub }) : null,
          el("div", { "class": "qp-wait", text: "等主持人出題…" })
        ]));
        return;
      }
      if (isBz) { renderBuzz(q, qi, team); tick(); return; }

      var reveal = status === "reveal", canPick = !reveal && team >= 0;
      var head = el("div", { "class": "qp-head" }, [el("span", { text: "第 " + K.displayNo(qi) + " / " + K.total() + " 題" })]);
      if (!reveal) { refs.time = el("span", { "class": "qp-time", text: "⏱" }); head.appendChild(refs.time); }
      inner.appendChild(head);
      if (!reveal) {
        refs.fill = el("div", { "class": "qp-fill" });
        inner.appendChild(el("div", { "class": "qp-bar" }, [refs.fill]));
      }
      addMedia(q, reveal);
      inner.appendChild(el("div", { "class": "qp-q", text: q.q }));
      if (q.bonus) inner.appendChild(el("div", { "class": "qp-bonus", text: "🎁 " + q.bonus.label + " 額外 +" + q.bonus.points + " 分" }));

      refs.opts = el("div", { "class": "qp-opts" });
      q.options.forEach(function (text, i) {
        var cls = "qp-opt " + CLS[i];
        if (reveal) cls += i === q.answer ? " right" : (i === chosen ? " wrong" : " dim");
        else if (i === chosen) cls += " chosen";
        var b = el("button", { "class": cls, type: "button" }, [
          el("span", { "class": "qp-letter", text: LETTERS[i] }), el("span", { "class": "qp-text", text: text }),
          el("span", { "class": "qp-mark", text: reveal ? (i === q.answer ? "✓" : (i === chosen ? "✗" : "")) : (i === chosen ? "●" : "") })
        ]);
        if (canPick) b.addEventListener("click", function () { choose(i); });       // 時間到之前，每個選項都可以點（改答案）
        refs.opts.appendChild(b);
      });
      inner.appendChild(refs.opts);

      if (!reveal) {
        inner.appendChild(el("div", { "class": "qp-wait", text: team < 0 ? "等待揭曉…" : chosen != null ? "已選 " + LETTERS[chosen] + "　時間到之前都可以改" : "點選你的答案　時間到之前都可以改，也可以跟組員討論" }));
      } else {
        var r = K.evalAnswer(state, qi, me), cls2 = "qp-result", msg;
        if (team < 0) { msg = "正確答案是 " + LETTERS[q.answer]; }
        else if (!r) { msg = "這題沒有作答（正確答案 " + LETTERS[q.answer] + "）"; }
        else if (r.late) { msg = "答太慢了，這題不算分"; }
        else if (r.correct) { msg = "答對了！ +" + K.pointsFor(qi) + " 分"; cls2 += " good"; }
        else { msg = "答錯了，正確答案是 " + LETTERS[q.answer]; cls2 += " bad"; }
        inner.appendChild(el("div", { "class": cls2, text: msg }));
        if (team >= 0 && trow) {
          var right = K.playersOfTeam(state, team).filter(function (pid) { var x = K.evalAnswer(state, qi, pid); return x && x.correct; }).length;
          inner.appendChild(el("div", { "class": "qp-teamres", text: K.teamLabel(team) + " 這題 " + right + " / " + trow.size + " 人答對　目前本組答對 " + trow.correct + " 題" + (trow.rank ? "（第 " + trow.rank + " 名）" : "") }));
        }
        var ex = K.extraOf(state, qi, me);
        if (ex) inner.appendChild(el("div", { "class": "qp-result good", text: "🎁 額外加分 +" + ex }));
        if (q.note) inner.appendChild(el("div", { "class": "qp-note2", text: "💡 " + q.note }));
        inner.appendChild(el("div", { "class": "qp-wait", text: K.nextIndex(qi) >= 0 ? "等主持人出下一題…" : "等主持人公布最終排名…" }));
      }
      tick();
    }

    // 題目圖片（揭曉時有答案圖就換成答案圖）；影片只在大螢幕播
    function addMedia(q, reveal) {
      var src = reveal && q.answerImg ? q.answerImg : q.img;
      if (src) inner.appendChild(el("img", { "class": "qp-img", src: src, alt: "" }));
      if (q.video && !(reveal && q.answerImg)) inner.appendChild(el("div", { "class": "qp-video", text: "🎬 請看大螢幕的影片（有聲音）" }));
    }

    // 搶答題：手機只有一顆搶答鈕
    function renderBuzz(q, qi, team) {
      var reveal = state.status === "reveal";
      var head = el("div", { "class": "qp-head" }, [el("span", { text: "第 " + K.displayNo(qi) + " / " + K.total() + " 題・🔔 搶答" })]);
      inner.appendChild(head);
      addMedia(q, reveal);
      inner.appendChild(el("div", { "class": "qp-q", text: q.q }));
      var pressed = myBuzz(), rank = K.buzzRank(state, qi, me), j = state.judge && state.judge[qi] ? state.judge[qi][me] : null;
      if (!reveal) {
        if (team < 0) { inner.appendChild(el("div", { "class": "qp-wait", text: "等待揭曉…" })); return; }
        refs.buzzBtn = el("button", { "class": "qp-buzz" + (pressed ? " done" : ""), type: "button", onclick: pressBuzz }, [
          el("span", { "class": "qp-buzz-t", text: pressed ? "已按下！" : "搶答" })
        ]);
        refs.buzzMsg = el("div", { "class": "qp-wait" });
        inner.appendChild(el("div", { "class": "qp-buzzwrap" }, [refs.buzzBtn]));
        inner.appendChild(refs.buzzMsg);
        if (pressed) refs.buzzMsg.textContent = rank ? "你是第 " + rank + " 個按的！等主持人點你回答" : "已送出…";
        if (j === true) refs.buzzMsg.textContent = "✅ 主持人判定你答對了！";
        else if (j === false) refs.buzzMsg.textContent = "❌ 主持人判定答錯了";
        tickBuzz();
        return;
      }
      var cls = "qp-result", msg;
      if (team < 0) msg = "答案：" + (q.answerText || "（待補）");
      else if (j === true) { msg = "答對了！ +" + K.pointsFor(qi) + " 分"; cls += " good"; }
      else if (j === false) { msg = "答錯了"; cls += " bad"; }
      else if (pressed) msg = rank ? "你是第 " + rank + " 個按的，這題沒有輪到你" : "這題沒有得分";
      else msg = "這題沒有搶答";
      inner.appendChild(el("div", { "class": cls, text: msg }));
      if (team >= 0) inner.appendChild(el("div", { "class": "qp-note2", text: "✅ 答案：" + (q.answerText || "（待補）") }));
      if (q.note) inner.appendChild(el("div", { "class": "qp-note2", text: "💡 " + q.note }));
      inner.appendChild(el("div", { "class": "qp-wait", text: K.nextIndex(qi) >= 0 ? "等主持人出下一題…" : "等主持人公布最終排名…" }));
    }
    function tickBuzz() {
      if (!refs.buzzBtn || !state || state.status !== "question") return;
      var un = K.unlockAt(state, state.index), now = store.now(), pressed = myBuzz();
      var locked = !un || now < un;
      refs.buzzBtn.disabled = locked || pressed;
      refs.buzzBtn.classList.toggle("locked", locked && !pressed);
      if (!pressed) {
        refs.buzzBtn.firstChild.textContent = locked ? (un ? Math.ceil((un - now) / 1000) : "…") : "搶答！";
        refs.buzzMsg.textContent = locked ? "題目出現 " + K.buzzDelay() + " 秒後才能按" : "快按！";
      }
    }

    function renderFinal(board, mine, team) {
      var trow = team >= 0 ? board.teams[team] : null;
      inner.appendChild(el("div", { "class": "qp-final" }, [
        el("div", { "class": "qp-final-title", text: "🏆 迷因海公牛結束" }),
        trow ? el("div", { "class": "qp-final-me", text: K.teamLabel(team) + " 第 " + trow.rank + " 名" }) : el("div", { "class": "qp-final-me", text: "這局你沒有分組" }),
        trow ? el("div", { "class": "qp-final-sub", text: "你答對 " + (mine ? mine.correct : 0) + " 題 +" + (mine ? mine.personal : 0) + "　組別名次每人 +" + trow.bonus + "　共 +" + (mine ? mine.total : 0) + " 分" }) : null
      ]));
      var list = el("div", { "class": "qp-top3" });
      board.ranked.slice(0, 5).forEach(function (t) {
        var row = el("div", { "class": "qp-top3-row" + (t.team === team ? " me" : "") }, [
          el("span", { text: t.rank <= 3 ? ["🥇", "🥈", "🥉"][t.rank - 1] : t.rank + "." }), el("span", { "class": "nm", text: t.icon + " " + t.name }),
          el("span", { "class": "pt", text: "答對 " + t.correct + " 題　每人 +" + t.bonus })
        ]);
        list.appendChild(row);
      });
      inner.appendChild(list);
    }

    // 倒數條：每 0.2 秒更新（只動時間和進度條，不重畫整個畫面）
    function tick() {
      tickBuzz();
      if (!state || state.status !== "question" || !refs.time) return;
      var rem = K.remaining(state, store.now());
      if (rem == null) { refs.time.textContent = "⏱ …"; return; }
      if (rem === Infinity) { refs.time.textContent = "⏱ 不限時"; refs.fill.style.width = "100%"; return; }
      var dur = K.secondsFor(state.index, state);
      refs.fill.style.width = Math.max(0, Math.min(100, rem / dur * 100)) + "%";
      refs.time.textContent = rem <= 0 ? "時間到" : "⏱ " + Math.ceil(rem);
      refs.time.className = "qp-time" + (rem <= 3 ? " low" : "");
      if (rem <= 0 && refs.opts) refs.opts.classList.add("over");
    }
    var timer = setInterval(tick, 200);

    function render() {
      if (!state) { inner.textContent = "載入中…"; return; }
      if (!me) { if (view !== "join") { renderJoin(); view = "join"; } return; }
      view = "game"; renderGame();
    }

    var offState = store.subscribe(function (s) { state = s; render(); });
    var offConn = store.onConnection ? store.onConnection(function (ok) { connected = ok; if (view === "game" && state) render(); }) : null;
    return {
      getMe: function () { return me; },
      destroy: function () { clearInterval(timer); if (offState) offState(); if (offConn) offConn(); host.innerHTML = ""; }
    };
  }

  root.QuizGame = root.QuizGame || {};
  root.QuizGame.mountPlayer = mountPlayer;
})(typeof globalThis !== "undefined" ? globalThis : this);

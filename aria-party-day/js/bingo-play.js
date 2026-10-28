/**
 * 社交賓果 — 玩家端（手機畫面）
 * 作答方式：把下面的人名「拖」到格子上；也可以先點名字、再點格子。
 * 日期/人數/身高/歲數/菜色這類不是人名的格子：點格子 → 選項按鈕。
 * BingoGame.mountPlayer(容器, store, 選項)
 */
(function (root) {
  "use strict";
  var D = root.BINGO_DATA, C = root.BingoCore, el = C.el, CFG = D.CONFIG;
  var LS_KEY = "ariaBingo.me", VIEW_KEY = "ariaBingo.view";
  var DRAG_OFFSET = 46;   // 拖曳時名字浮在手指上方多少像素，才不會被手指擋住

  function mountPlayer(host, store, opts) {
    opts = opts || {};
    var doc = host.ownerDocument || document;
    var persist = opts.persistIdentity !== false;
    var me = null, state = null, connected = true, view = null, joining = false, toastTimer = null;
    var viewMode = "grid";            // grid = 5×5 格子；list = 題目清單
    var selected = null;              // 「先點名字、再點格子」時，被選中的名字
    var flipped = {};                 // 答完的格子：點一下翻到題目面，id -> true
    var glowUntil = {}, wrongUntil = {};   // 剛答對/答錯的格子：邊框發光、紅框到什麼時候，id -> 時間
    var tutEl = null, tutTimers = [], tutScheduled = false;   // 教學遮罩
    var dragActive = false, pendingRender = false, lastSig = null, ownGlowed = false;

    if (persist) {
      try { me = localStorage.getItem(LS_KEY) || null; } catch (e) {}
      try { if (localStorage.getItem(VIEW_KEY) === "list") viewMode = "list"; } catch (e) {}
    }
    if (me && C.guestIndex(me) < 0) me = null;
    if (opts.initialMe && C.guestIndex(opts.initialMe) >= 0) me = opts.initialMe;   // 預覽用：直接指定是誰

    host.innerHTML = "";
    var wrap = el("div", { "class": "bp-wrap" });
    var scroll = el("div", { "class": "bp-scroll" });
    var inner = el("div", { "class": "bp-inner" });
    var mask = el("div", { "class": "bp-mask" });
    var toast = el("div", { "class": "bp-toast" });
    scroll.appendChild(inner);
    wrap.appendChild(scroll); wrap.appendChild(mask); wrap.appendChild(toast);
    host.appendChild(wrap);

    mask.addEventListener("click", function (e) { if (e.target === mask) closeSheet(); });

    function showToast(msg, good) {
      toast.textContent = msg;
      toast.className = "bp-toast show" + (good ? " good" : "");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.className = "bp-toast"; }, 1700);
    }
    function shake(node) {
      if (!node) return;
      node.classList.remove("bp-shake"); void node.offsetWidth; node.classList.add("bp-shake");
      setTimeout(function () { node.classList.remove("bp-shake"); }, 450);
    }
    function addNote() {
      if (store.mode === "local") {
        inner.appendChild(el("div", { "class": "bp-note", text: "⚠️ 測試模式：還沒連上 Firebase，只有同一個瀏覽器的分頁會同步" }));
      }
    }
    function backBtn(mini) {                                          // 左上角「返回」（回入口頁）；沒指定就不顯示
      if (!(opts.backHref || opts.onBack)) return null;
      var a = el("a", { "class": "bp-return" + (mini ? " mini" : ""), href: opts.backHref || "#", "aria-label": "返回", text: mini ? "‹" : "‹ 返回" });
      if (opts.onBack) a.addEventListener("click", function (e) { e.preventDefault(); opts.onBack(); });
      return a;
    }
    function addBack() { var a = backBtn(false); if (a) inner.appendChild(el("div", { "class": "bp-returnrow" }, [a])); }     // 簽到畫面用

    // ---------- 簽到畫面 ----------
    function renderJoin() {
      inner.innerHTML = "";
      var sel = el("select", { "class": "bp-select" });
      sel.appendChild(el("option", { value: "", text: "請選擇你的名字…" }));
      D.GUESTS.map(function (g, i) { return { g: g, pid: C.guestId(i) }; })
        .sort(function (a, b) { return a.g.localeCompare(b.g, "zh-Hant"); })
        .forEach(function (x) {
          var taken = opts.isTaken && opts.isTaken(x.pid);
          var o = el("option", { value: x.pid, text: x.g + (taken ? "（模擬玩家）" : "") });
          if (taken) o.disabled = true;
          sel.appendChild(o);
        });
      var btn = el("button", {
        "class": "bp-btn", type: "button", text: "簽到進場",
        onclick: function () { if (!sel.value) { showToast("先選你的名字喔"); return; } enter(sel.value); }
      });
      addBack(); addNote();
      inner.appendChild(el("div", { "class": "bp-join" }, [
        el("h1", { text: "🎉 " + CFG.TITLE }),
        el("p", {}, ["找出每一格描述的朋友", el("br"), "把名字拖到格子上，先連成 " + CFG.LINES_TO_WIN + " 條線就得分！"]),
        el("label", { text: "你是誰？" }), sel, btn
      ]));
    }

    function enter(pid) {
      me = pid;
      if (persist) { try { localStorage.setItem(LS_KEY, pid); } catch (e) {} }
      ensureJoined();
      view = null; lastSig = null; render();
    }

    function ensureJoined() {
      if (joining || !me) return;
      joining = true;
      var idx = C.guestIndex(me), cin = C.checkinCell();
      var pr = store.join(me, D.GUESTS[idx], C.makeOrder(me), cin ? cin.id : null);
      var done = function () { joining = false; };
      if (pr && pr.then) pr.then(done, done); else done();
    }

    function switchUser() {                                           // 畫面上沒有「換人」按鈕了；只留給預覽/測試用
      closeTutorial(false); tutScheduled = false; ownGlowed = false;
      me = null; view = null; lastSig = null; selected = null; closeSheet();
      if (persist) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
      render();
    }

    function setViewMode(m) {
      viewMode = m; lastSig = null;
      if (persist) { try { localStorage.setItem(VIEW_KEY, m); } catch (e) {} }
      render();
    }

    // ---------- 作答 ----------
    // 答錯：畫面正中間跳出又大又紅的提示（比底部的小提示明顯）
    var wrongEl = null, wrongTimer = null;
    function showWrong(cell) {
      if (wrongEl && wrongEl.parentNode) wrongEl.parentNode.removeChild(wrongEl);
      clearTimeout(wrongTimer);
      wrongEl = el("div", { "class": "bp-wrong" }, [el("div", { "class": "x", text: "✕" }), el("div", { "class": "t", text: "不是這個喔" }), el("div", { "class": "s", text: "再想想看～" })]);
      wrap.appendChild(wrongEl);
      wrongTimer = setTimeout(function () { if (wrongEl && wrongEl.parentNode) wrongEl.parentNode.removeChild(wrongEl); wrongEl = null; }, 1500);
      if (cell) {                                                     // 那一格紅框 + 抖一下（畫面會馬上重畫，所以記在 wrongUntil，重畫時再套上）
        wrongUntil[cell.id] = Date.now() + 900;
        var cur = inner.querySelector('[data-cell="' + cell.id + '"]'); if (cur) cur.classList.add("wrong");
        setTimeout(function () { var n = inner.querySelector('[data-cell="' + cell.id + '"]'); if (n) n.classList.remove("wrong"); }, 900);
      }
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120); } catch (e) {}
    }
    function glow(id) { glowUntil[id] = Date.now() + 2200; }          // 答對的格子邊框發光
    function tryAnswer(cell, value, node) {
      if (C.checkAnswer(cell, value)) {
        glow(cell.id);
        store.mark(me, cell.id);
        showToast("答對了！✓", true);
        return true;
      }
      shake(node);
      showWrong(cell);
      return false;
    }

    // ---------- 教學（第一次進來自動播放；上面「教學」可以重看）----------
    // 手指把「Aria」拖到「壽星是誰」→ 放開變黃色發光 → 半透明遮罩上出現說明文字；按「確定」關掉、按「重看教學」重播
    var TUT_KEY = "ariaBingo.tut.";
    function tutSeen() {
      if (root.__bingoTutSeen && root.__bingoTutSeen[me]) return true;
      if (persist) { try { return localStorage.getItem(TUT_KEY + me) === "1"; } catch (e) {} }
      return false;
    }
    function tutMark() {
      root.__bingoTutSeen = root.__bingoTutSeen || {}; root.__bingoTutSeen[me] = true;
      if (persist) { try { localStorage.setItem(TUT_KEY + me, "1"); } catch (e) {} }
    }
    function closeTutorial(mark) {
      tutTimers.forEach(clearTimeout); tutTimers = [];
      if (tutEl && tutEl.parentNode) tutEl.parentNode.removeChild(tutEl);
      tutEl = null;
      if (mark) tutMark();
    }
    function openTutorial() {
      closeTutorial(false);
      var ts = root.BINGO_TUT_SPEED || 1;
      function T(ms, fn) { tutTimers.push(setTimeout(fn, ms / ts)); }
      // 教學是「他自己」專屬的：把他自己的名字拖到他自己的那一格（答案就是他的那題）
      var gi = C.guestIndex(me), myName = gi >= 0 ? D.GUESTS[gi] : "Aria", own = C.ownCell(me);
      var others = [1, 2].map(function (k) { return D.GUESTS[(gi + k) % D.GUESTS.length]; });
      var cellN = el("div", { "class": "tut-cell" }, [el("span", { "class": "q", text: own ? C.qText(own.q) : "壽星是誰" })]);
      var chips = [myName, others[0], others[1]].map(function (n, i) { return el("span", { "class": "tut-chip c" + (i + 1), text: n }); });
      var ghost = el("span", { "class": "tut-ghost", text: myName });
      var finger = el("span", { "class": "tut-finger", text: "👆" });
      var stage = el("div", { "class": "tut-stage" }, [cellN].concat(chips, [ghost, finger]));
      var qtxt = own ? C.qText(own.q) : "", byName = (CFG.TUTORIAL_OWN_BY_NAME || {})[myName];       // 「你是 + 題目」（壽星特別寫成「你是壽星」）
      var capLines = byName ? [byName] : (CFG.TUTORIAL_OWN || ["你是{q}"]).map(function (t) { return String(t).replace("{q}", qtxt).replace("{name}", myName); });
      var cap = el("div", { "class": "tut-cap" }, [el("div", { "class": "big", text: capLines[0] }), capLines[1] ? el("div", { "class": "sm", text: capLines[1] }) : null]);
      var msg = el("div", { "class": "tut-msg" }, [
        el("div", { "class": "lines" }, (function () { var popN = 0; return (CFG.TUTORIAL || []).map(function (t) {
          var cls = "", txt = String(t), attrs = {};
          if (txt.charAt(0) === "!") { cls = "hl"; txt = txt.slice(1); } else if (txt.charAt(0) === "~") { cls = "note"; txt = txt.slice(1); }
          else if (txt.charAt(0) === "*") { cls = "pop"; txt = txt.slice(1); attrs.style = "--pd:" + (1.85 + 0.75 * popN++) + "s"; }   // 禮物盒跳完後，一行一行跳出來
          if (cls) attrs["class"] = cls;
          var p = el("p", attrs);                                                 // {gifts} → 三個禮物盒，教學動畫結束、文字出現後一個一個跳出來
          txt.split("{gifts}").forEach(function (part, i, arr) {
            if (part) p.appendChild(doc.createTextNode(part));
            if (i < arr.length - 1) for (var g = 1; g <= 3; g++) p.appendChild(el("span", { "class": "gift g" + g, text: "🎁" }));
          });
          return p;
        }); })()),
        el("div", { "class": "tut-btns" }, [
          el("button", { "class": "bp-btn ghost", type: "button", text: "重看教學", onclick: openTutorial }),
          el("button", { "class": "bp-btn", type: "button", text: "確定", onclick: function () { closeTutorial(true); } })
        ])
      ]);
      tutEl = el("div", { "class": "bp-tut" }, [stage, cap, msg]);
      wrap.appendChild(tutEl);
      T(350, function () { finger.classList.add("on"); });
      T(900, function () { finger.classList.add("press"); ghost.classList.add("on"); chips[0].classList.add("dim"); });
      T(1300, function () { finger.classList.add("drag"); ghost.classList.add("drag"); });          // 拖過去
      T(2700, function () { cellN.classList.add("hover"); });
      T(3000, function () {                                                                          // 放開：變黃色、邊框發光
        ghost.classList.remove("on"); finger.classList.remove("on"); cellN.classList.remove("hover");
        cellN.classList.add("filled"); cellN.querySelector(".q").textContent = myName;
      });
      T(3200, function () { cap.classList.add("show"); });                                           // 「你是 + 題目」停留久一點，讓他知道自己是誰
      T(7000, function () { msg.classList.add("show"); });                                           // 再出現說明文字
    }
    function maybeTutorial() {
      if (tutScheduled || tutEl || !me || tutSeen() || !state || state.status === "ended") return;
      tutScheduled = true;
      var ts = root.BINGO_TUT_SPEED || 1;
      setTimeout(function () { tutScheduled = false; if (!tutEl && me && !tutSeen()) openTutorial(); }, 500 / ts);
    }

    // 拖曳：用 Pointer Events，手機和電腦都能用
    function bindChip(chip, name, cellsById) {
      chip.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      chip.addEventListener("pointerdown", function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        var sx = e.clientX, sy = e.clientY, moved = false, ghost = null, hover = null;
        dragActive = true;

        function targetAt(x, y) {
          var t = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
          var n = t && t.closest ? t.closest("[data-cell]") : null;
          return (n && !n.classList.contains("marked")) ? n : null;
        }
        function onMove(ev) {
          if (!moved) {
            if (Math.sqrt(Math.pow(ev.clientX - sx, 2) + Math.pow(ev.clientY - sy, 2)) < 8) return;
            moved = true;
            ghost = el("div", { "class": "bp-ghost", text: name });
            doc.body.appendChild(ghost);
            chip.classList.add("dragging");
          }
          var gx = ev.clientX, gy = ev.clientY - DRAG_OFFSET;
          ghost.style.left = gx + "px"; ghost.style.top = gy + "px";
          var t = targetAt(gx, gy);
          if (t !== hover) { if (hover) hover.classList.remove("drop-hover"); if (t) t.classList.add("drop-hover"); hover = t; }
        }
        function finish(cancelled) {
          doc.removeEventListener("pointermove", onMove);
          doc.removeEventListener("pointerup", onUp);
          doc.removeEventListener("pointercancel", onCancel);
          if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
          chip.classList.remove("dragging");
          if (hover) hover.classList.remove("drop-hover");
          dragActive = false;
          if (!cancelled) {
            if (moved) {
              if (hover) { selected = null; tryAnswer(cellsById[hover.getAttribute("data-cell")], name, hover); }
            } else {
              selected = (selected === name) ? null : name;   // 沒拖動 = 點一下：選取/取消選取
            }
          }
          lastSig = null; pendingRender = false; render();
        }
        function onUp() { finish(false); }
        function onCancel() { finish(true); }
        doc.addEventListener("pointermove", onMove);
        doc.addEventListener("pointerup", onUp);
        doc.addEventListener("pointercancel", onCancel);
      });
    }

    // ---------- 遊戲畫面 ----------
    function answerText(cell) { return cell.show || cell.a || "✓"; }

    function renderGame() {
      if (!state.players[me]) { inner.textContent = "簽到中…"; ensureJoined(); return; }
      var p = C.effectivePlayer(state, me);           // 遊戲開始後，「自己的那一格」會自動幫他完成
      joining = false;
      if (p.ownAuto && !ownGlowed) { ownGlowed = true; glowUntil[p.ownAuto] = Date.now() + 2600; }       // 開始的那一刻，自己的那格發光一下

      var cells = C.cellMap(), b = C.playerBoard(p), comp = C.compute(state), need = CFG.LINES_TO_WIN;
      var my = comp.rows.filter(function (r) { return r.pid === me; })[0];
      var status = state.status, lobby = status === "lobby", canPlay = status === "playing";

      // 別人答題時資料會一直更新；只有跟「我」有關的東西變了才重畫，避免拖曳到一半畫面被換掉
      var sig = [status, connected, viewMode, selected, Object.keys(p.marked || {}).sort().join(","), my && my.rank, my && my.points].join("|");
      if (sig === lastSig) return;
      lastSig = sig;

      inner.innerHTML = "";
      addNote();

      inner.appendChild(el("div", { "class": "bp-top" }, [
        backBtn(true),
        el("span", { "class": "bp-spacer" }),
        el("button", { "class": "bp-link", type: "button", text: "教學", onclick: openTutorial }),
        el("button", { "class": "bp-link", type: "button", text: "計分", onclick: openScoring })
      ]));

      if (lobby) {
        inner.appendChild(el("div", { "class": "bp-note" }, ["✅ 已簽到！等主持人宣布開始…"]));
      } else if (my && my.rank) {
        inner.appendChild(el("div", { "class": "bp-banner", text: "🎉 你是第 " + my.rank + " 個連成 " + need + " 條！ +" + my.points + " 分" + (my.extra ? "　額外賽 +" + my.extra + " 分（" + b.count + " 條）" : "") }));
      } else if (status === "ended") {
        inner.appendChild(el("div", { "class": "bp-note", text: "遊戲結束，謝謝你的參與 💓" }));
      }

      if (!lobby) {
        var seg = el("div", { "class": "bp-seg" }, [
          el("button", { "class": viewMode === "grid" ? "on" : "", type: "button", text: "格子", onclick: function () { setViewMode("grid"); } }),
          el("button", { "class": viewMode === "list" ? "on" : "", type: "button", text: "清單", onclick: function () { setViewMode("list"); } })
        ]);
        var hint = canPlay ? (selected ? "點一格放上「" + selected + "」" : "把下面的名字拖到格子上") : "";
        inner.appendChild(el("div", { "class": "bp-bar" }, [seg, el("span", { "class": "bp-hint", text: hint })]));
      }

      var asList = viewMode === "list" && !lobby;
      var board = el("div", { "class": asList ? "bp-list" : "bp-board" });
      for (var pos = 0; pos < 25; pos++) {
        (function (pos) {
          var cell = cells[b.order[pos]], marked = b.posMarked[pos], inLine = b.inLine[pos], node;
          if (lobby) {
            node = el("button", { "class": "bp-cell locked", type: "button", text: "?" });
          } else if (asList) {
            node = el("button", { "class": "bp-row" + (marked ? " marked" : "") + (inLine ? " inline" : "") + (marked && glowUntil[cell.id] > Date.now() ? " glow" : "") + (!marked && wrongUntil[cell.id] > Date.now() ? " wrong" : ""), type: "button" });
            node.appendChild(el("span", { "class": "bp-row-q", text: C.qText(cell.q) }));
            node.appendChild(el("span", { "class": "bp-row-a", text: marked ? "✓ " + answerText(cell) : (canPlay && cell.type === "choice" ? "👆" : "") }));
          } else {
            node = el("button", { "class": "bp-cell" + (marked ? " marked" : "") + (inLine ? " inline" : "") + (marked && flipped[cell.id] ? " flipped" : "") + (marked && glowUntil[cell.id] > Date.now() ? " glow" : "") + (!marked && wrongUntil[cell.id] > Date.now() ? " wrong" : ""), type: "button" });
            if (marked) {
              // 正面：名字（大）+ 題目（小）；點一下翻到背面看完整題目
              node.appendChild(el("span", { "class": "bp-front" }, [
                el("span", { "class": "bp-ans", text: answerText(cell) }),
                el("span", { "class": "bp-sub" }, [C.qNode(cell.q)])
              ]));
              node.appendChild(el("span", { "class": "bp-back" }, [C.qNode(cell.q)]));
            } else {
              node.appendChild(C.qNode(cell.q));
              if (canPlay && cell.type === "choice") node.appendChild(el("span", { "class": "bp-tap", text: "👆" }));   // 這類題目用「點」的，右下角小手指提示
            }
          }
          if (!lobby) node.setAttribute("data-cell", cell.id);
          if (!lobby && !marked && canPlay) {
            node.addEventListener("click", function () {
              if (selected) { var n = selected; selected = null; tryAnswer(cell, n, node); lastSig = null; render(); }
              else if (cell.type === "choice") openSheet(cell);
              else showToast("把下面的名字拖到這一格 👇");
            });
          } else if (marked && !lobby && !asList) {
            node.addEventListener("click", function () {
              flipped[cell.id] = !flipped[cell.id];
              node.classList.toggle("flipped", !!flipped[cell.id]);
              node.classList.add("flipping");
              setTimeout(function () { node.classList.remove("flipping"); }, 320);
              fitCell(node);
            });
          } else { node.classList.add("view"); }
          board.appendChild(node);
        })(pos);
      }
      inner.appendChild(board);

      // 下方人名區（只有遊戲進行中才出現）
      if (canPlay) {
        var remaining = C.remainingFriends(p);
        // 自己的名字不用放（自己那一格已經自動完成），所以每個人下方都是「其他 20 個人」
        var names = C.optionNames().filter(function (n) { return n !== p.name; }).sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
        var chips = el("div", { "class": "bp-chips" });
        names.forEach(function (name) {
          var used = remaining.indexOf(name) < 0;
          var chip = el("button", { "class": "bp-chip" + (used ? " used" : "") + (selected === name ? " sel" : ""), type: "button", text: name });
          if (!used) bindChip(chip, name, cells);
          chips.appendChild(chip);
        });
        inner.appendChild(el("div", { "class": "bp-tray" }, [chips]));
      }

      fitSoon();
      maybeTutorial();
    }

    // 格子一樣大，所以字太多時把字縮小到塞得下
    var fitTimer = null;
    function fitSoon() {
      if (typeof requestAnimationFrame !== "function") return;
      cancelAnimationFrame(fitTimer);
      fitTimer = requestAnimationFrame(function () {
        var nodes = inner.querySelectorAll(".bp-cell:not(.locked)");
        for (var i = 0; i < nodes.length; i++) fitCell(nodes[i]);
      });
    }
    function fitCell(btn) {
      var child = [].slice.call(btn.children).filter(function (c) { return getComputedStyle(c).display !== "none"; })[0];
      if (!child) return;
      btn.style.fontSize = "";
      var size = parseFloat(getComputedStyle(btn).fontSize) || 12, guard = 0;
      while (size > 8 && guard++ < 14 && child.offsetHeight > btn.clientHeight - 4) {
        size -= 0.5; btn.style.fontSize = size + "px";
      }
    }
    if (typeof window !== "undefined") window.addEventListener("resize", fitSoon);

    // ---------- 選項面板（日期/人數/身高/歲數/菜色） ----------
    function openSheet(cell) {
      mask.innerHTML = "";
      var sheet = el("div", { "class": "bp-sheet" });
      sheet.appendChild(el("h3", { text: C.qText(cell.q) }));
      var opts2 = el("div", { "class": "bp-opts" });
      cell.options.forEach(function (name) {
        opts2.appendChild(el("button", {
          "class": "bp-opt", type: "button", text: name,
          onclick: function () {
            if (C.checkAnswer(cell, name)) { glow(cell.id); store.mark(me, cell.id); closeSheet(); showToast("答對了！✓", true); }
            else { shake(sheet); showWrong(null); }
          }
        }));
      });
      sheet.appendChild(opts2);
      sheet.appendChild(el("button", { "class": "bp-btn ghost", type: "button", text: "取消", onclick: closeSheet }));
      mask.appendChild(sheet);
      mask.classList.add("show");
    }
    function closeSheet() { mask.classList.remove("show"); mask.innerHTML = ""; }

    // ---------- 計分說明（上面「計分」按鈕）----------
    function openScoring() {
      mask.innerHTML = "";
      var P = CFG.POINTS || [], need = CFG.LINES_TO_WIN, from = CFG.EXTRA_FROM_LINE, per = CFG.EXTRA_LINE_POINTS, maxLines = 12;
      var table = el("div", { "class": "bp-sc-table" });
      P.forEach(function (pt, i) { table.appendChild(el("div", { "class": "bp-sc-cell" }, [el("span", { "class": "r", text: "第 " + (i + 1) + " 名" }), el("b", { text: "+" + pt })])); });
      table.appendChild(el("div", { "class": "bp-sc-cell wide" }, [el("span", { "class": "r", text: "第 " + (P.length + 1) + " 名以後" }), el("b", { text: "每人 +" + CFG.POINTS_AFTER })]));
      var exRows = el("div", { "class": "bp-sc-ex" });
      [from, from + 1, from + 2].concat([maxLines]).forEach(function (n, k) {
        if (k === 3) exRows.appendChild(el("span", { "class": "dots", text: "…" }));
        exRows.appendChild(el("span", { "class": "bp-sc-pill", text: n + " 條 +" + (n - from + 1) * per }));
      });
      var sheet = el("div", { "class": "bp-sheet bp-scoring" }, [
        el("h3", { text: "🏆 好友冰狗怎麼計分" }),
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "① 名次分：先連成 " + need + " 條線的人依序拿分" }),
          el("p", { text: "第 1 個連成 " + need + " 條線的人 +" + P[0] + "，之後每一名少 2 分。" }), table,
          el("p", { "class": "s", text: "沒有連成 " + need + " 條線 = 0 分。" })
        ]),
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "② 額外分：每多一條線都加分" }),
          el("p", { text: "從第 " + from + " 條線開始，每多連成一條 +" + per + " 分（不管第幾名都算）。" }), exRows
        ]),
        el("div", { "class": "bp-sc-sec" }, [
          el("div", { "class": "t", text: "③ 總分" }),
          el("p", { text: "好友冰狗分數 = 名次分 + 額外分，會加進派對的遊戲總分（好友冰狗 + 迷因海公牛 + 陪酒小姐），總分前 3 名有禮物 🎁" })
        ]),
        el("button", { "class": "bp-btn", type: "button", text: "知道了", onclick: closeSheet })
      ]);
      mask.appendChild(sheet);
      mask.classList.add("show");
    }

    // ---------- 主流程 ----------
    function render() {
      if (!state) { inner.textContent = "載入中…"; return; }
      if (!me) {
        if (view !== "join") { renderJoin(); view = "join"; }   // 簽到畫面只建一次，避免選到一半被重繪
        return;
      }
      if (dragActive) { pendingRender = true; return; }          // 拖曳中不重畫
      view = "game";
      renderGame();
    }

    var offState = store.subscribe(function (s) { state = s; render(); });
    var offConn = store.onConnection ? store.onConnection(function (ok) { connected = ok; if (view === "game" && state) render(); }) : null;

    return {
      getMe: function () { return me; },
      switchUser: switchUser,
      destroy: function () { closeTutorial(false); if (offState) offState(); if (offConn) offConn(); host.innerHTML = ""; }
    };
  }

  root.BingoGame = root.BingoGame || {};
  root.BingoGame.mountPlayer = mountPlayer;
})(typeof globalThis !== "undefined" ? globalThis : this);

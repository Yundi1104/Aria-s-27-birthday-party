/**
 * 入口頁、時程表、場地／轉帳資訊（賓客手機用）
 * PartyPages.mountHub / mountSchedule / mountInfo (容器, ctx)
 *   ctx.navigate(頁面名)  有給的話，點連結不換網頁而是呼叫它（預覽版用）；沒給就是正常的網頁連結
 *   ctx.stores            { bingo, quiz, card } 三個遊戲的資料（入口頁顯示狀態和「我的成績」）
 *   ctx.me()              目前是誰（預設讀手機上存的「我是誰」）
 *   ctx.setMe(pid)        簽到時記下「我是誰」（預設存進手機；預覽版自己處理）
 */
(function (root) {
  "use strict";
  var P = root.PARTY, C = root.BingoCore, B = root.BINGO_DATA, el = C.el;
  var PAGE_URL = { hub: "index.html", schedule: "schedule.html", info: "info.html", menu: "menu.html", bingo: "play.html", quiz: "quiz.html", card: "card.html" };

  function link(ctx, page, cls, kids) {
    var a = el("a", { "class": cls, href: PAGE_URL[page] }, kids);
    if (ctx.navigate) a.addEventListener("click", function (e) { e.preventDefault(); ctx.navigate(page); });
    return a;
  }
  function shell(root_, ctx) {
    root_.innerHTML = "";
    var wrap = el("div", { "class": "pg-wrap" }), inner = el("div", { "class": "pg-inner" });
    wrap.appendChild(inner); root_.appendChild(wrap);
    return inner;
  }
  // 所有頁面共用：左上角一個「返回」，右邊什麼都沒有
  function backBar(ctx) {
    return el("div", { "class": "pg-bar" }, [link(ctx, "hub", "pg-back", ["‹ 返回"])]);
  }
  // 頁面標題：用入口頁那張貼紙當標題（貼紙上已經有字）；找不到圖就退回文字標題
  function titleBlock(page, fallbackText) {
    var b = (P.HUB.BUTTONS || []).filter(function (x) { return x.page === page; })[0];
    var kids = [el("h1", { "class": b && b.img ? "pg-sr" : "", text: fallbackText })];
    if (b && b.img) kids.unshift(el("img", { "class": "pg-titleimg", src: b.img, alt: fallbackText }));
    return el("div", { "class": "pg-head" }, kids);
  }

  function timeText(it) { return it.to ? it.from + " ~ " + it.to : it.from; }
  // ---------- 入口頁 ----------
  function mountHub(host, ctx) {
    ctx = ctx || {};
    var H = P.HUB, inner = shell(host, ctx);
    var latest = { bingo: null, quiz: null, card: null };

    // 右上角齒輪：設定（深色模式）
    if (root.PartyTheme) {
      var setEl = el("div", { "class": "pg-set" });
      setEl.addEventListener("click", function (e) { if (e.target === setEl) setEl.classList.remove("show"); });
      var paintSet = function () {
        var cur = root.PartyTheme.get();
        setEl.innerHTML = "";
        var seg = el("div", { "class": "pg-set-seg" });
        [["light", "☀️ 淺色"], ["dark", "🌙 深色"], ["auto", "📱 跟著手機"]].forEach(function (x) {
          seg.appendChild(el("button", { "class": cur === x[0] ? "on" : "", type: "button", "data-theme": x[0], text: x[1],
            onclick: function () { root.PartyTheme.set(x[0]); paintSet(); } }));
        });
        setEl.appendChild(el("div", { "class": "pg-set-in" }, [
          el("h3", { text: "⚙️ 設定" }), el("p", { "class": "s", text: "只會改這支手機的畫面（所有遊戲和頁面都一起套用）" }),
          el("div", { "class": "pg-set-row", text: "外觀" }), seg,
          unlocked() ? el("div", { "class": "pg-set-row", text: "我是誰" }) : null,
          unlocked() ? el("button", { "class": "bp-btn ghost", type: "button", text: "👤 重新簽到（選錯名字、換人）", onclick: function () { setEl.classList.remove("show"); showCheckin(); } }) : null,
          el("button", { "class": "bp-btn", type: "button", text: "完成", onclick: function () { setEl.classList.remove("show"); } })
        ]));
      };
      inner.appendChild(el("button", { "class": "pg-gear", type: "button", "aria-label": "設定", title: "設定", text: "⚙️",
        onclick: function () { paintSet(); setEl.classList.add("show"); } }));
      host.firstChild.appendChild(setEl);
    }
    var head = el("div", { "class": "pg-head" }, [el("h1", { "class": H.LOGO ? "pg-sr" : "", text: "🎉 " + P.TITLE })]);
    if (H.LOGO) head.insertBefore(el("img", { "class": "pg-logo", src: H.LOGO, alt: P.TITLE }), head.firstChild);
    inner.appendChild(head);

    function unlocked() { return ctx.unlocked ? !!ctx.unlocked() : (root.PartyLock ? root.PartyLock.isUnlocked() : true); }
    // 派對解鎖（PARTY.UNLOCK_AT）之前：菜單和三個遊戲顯示「???」圖 + 小字「派對解鎖」，點了沒反應
    function lockedEntry(it) {
      var txt = P.LOCKED_TEXT || "派對解鎖", a;
      if (it.img) a = el("div", { "class": "pg-entry pg-imgbtn locked", "aria-disabled": "true", role: "img", "aria-label": "???　" + txt }, [el("img", { src: it.lockedImg || it.img, alt: "???　" + txt })]);       // 圖片裡已經有「派對解鎖」四個字
      else a = el("div", { "class": "pg-entry pg-tile locked", "aria-disabled": "true" }, [el("span", { "class": "ic", text: "❓" }), el("span", { "class": "tx" }, [el("b", { text: "???" }), el("small", { text: txt })])]);
      a.setAttribute("data-page", it.page); a.setAttribute("data-title", "???");
      return a;
    }
    function entry(it) {
      if (it.lock && !unlocked()) return lockedEntry(it);
      var desc = String(it.desc || "").replace("{lines}", B.CONFIG.LINES_TO_WIN), a;
      if (it.img) {                                                 // 貼紙圖片按鈕（圖片上通常已經有字）
        a = link(ctx, it.page, "pg-entry pg-imgbtn", [el("img", { src: it.img, alt: it.title }), SCORE_PAGES.indexOf(it.page) >= 0 ? el("span", { "class": "pg-score", "data-score": it.page }) : null]);
      } else {                                                      // 預設的文字方塊按鈕
        a = link(ctx, it.page, "pg-entry pg-tile", [
          el("span", { "class": "ic", text: it.icon || "" }),
          el("span", { "class": "tx" }, [el("b", { text: it.title }), el("small", { text: desc })])
        ]);
      }
      a.setAttribute("data-page", it.page); a.setAttribute("data-title", it.title);
      return a;
    }
    var gridEl = el("div", { "class": "pg-grid" }); inner.appendChild(gridEl);
    var SCORE_PAGES = ["bingo", "quiz", "card"];
    function paintGrid() { gridEl.innerHTML = ""; H.BUTTONS.forEach(function (it) { gridEl.appendChild(entry(it)); }); paintScore(); }
    paintGrid();
    if (H.TIP) inner.appendChild(el("p", { "class": "pg-tip", text: H.TIP }));

    function meId() {
      if (ctx.me) return ctx.me();
      try { return localStorage.getItem("ariaBingo.me"); } catch (e) { return null; }
    }
    function setMe(pid) {
      if (ctx.setMe) { ctx.setMe(pid); return; }
      try { localStorage.setItem("ariaBingo.me", pid); } catch (e) {}
    }

    // ---------- 進入入口頁：還沒簽到的人先跳出簽到視窗 ----------
    // 選名字 → 記下「我是誰」（三個遊戲共用）→ 同時在三個遊戲簽到（中控台就看得到誰到了；好友冰狗的簽到格也會打勾）
    var toastEl = el("div", { "class": "pg-toast" }), toastTimer = null;
    function toast(msg) { toastEl.textContent = msg; toastEl.className = "pg-toast show"; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.className = "pg-toast"; }, 2400); }
    function doCheckin(pid) {
      var gi = C.guestIndex(pid), name = B.GUESTS[gi], st = ctx.stores || {};
      setMe(pid);
      try { if (st.bingo) { var cin = C.checkinCell(); st.bingo.join(pid, name, C.makeOrder(pid), cin ? cin.id : null); } } catch (e) {}
      try { if (st.quiz) st.quiz.join(pid, name); } catch (e) {}
      try { if (st.card) st.card.join(pid, name); } catch (e) {}
      return name;
    }
    function showCheckin() {
      var old = host.querySelector(".pg-dlg"); if (old) old.parentNode.removeChild(old);
      var sel = el("select", { "class": "bp-select" }), hint = el("div", { "class": "hint" });
      sel.appendChild(el("option", { value: "", text: "請選擇你的名字…" }));
      B.GUESTS.map(function (g, i) { return { g: g, pid: C.guestId(i) }; })
        .sort(function (a, b) { return a.g.localeCompare(b.g, "zh-Hant"); })
        .forEach(function (x) { sel.appendChild(el("option", { value: x.pid, text: x.g })); });
      var dlg = el("div", { "class": "pg-dlg", role: "dialog", "aria-modal": "true" });
      var btn = el("button", { "class": "bp-btn", type: "button", text: "簽到", onclick: function () {
        if (!sel.value) { hint.textContent = "先選你的名字喔"; return; }
        var name = doCheckin(sel.value);
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        toast("✅ 簽到完成，歡迎 " + name + "！");
        if (latest.bingo || latest.quiz) paintScore();
      } });
      dlg.appendChild(el("div", { "class": "pg-dlg-card" }, [
        el("div", { "class": "em", text: "🎉" }),
        el("h2", { text: "歡迎來參加派對！" }),
        el("p", { text: "請先進行簽到" }),
        el("label", { text: "你是誰？" }), sel, hint, btn
      ]));
      host.appendChild(dlg);
      return dlg;
    }
    // 自己各遊戲的分數：用半透明的黑色小圓壓在遊戲圖示上，只寫數字（不寫名次；0 分或還沒有分數就不顯示）
    function paintScore() {
      var map = {}, pid = meId();
      if (pid && latest.bingo && latest.quiz && root.AwardCore) {
        var rows = root.AwardCore.combine(latest.bingo, latest.quiz, latest.card || undefined), mine = rows.filter(function (r) { return r.pid === pid; })[0];
        if (mine) map = { bingo: mine.bingo || 0, quiz: mine.quiz || 0, card: mine.card || 0 };
      }
      [].forEach.call(gridEl.querySelectorAll(".pg-score"), function (n) {
        var v = map[n.getAttribute("data-score")];
        if (v > 0) { n.textContent = String(v); n.style.display = ""; } else { n.textContent = ""; n.style.display = "none"; }
      });
    }

    var st = ctx.stores || {};
    ["bingo", "quiz", "card"].forEach(function (k) {
      if (st[k]) st[k].subscribe(function (s) { latest[k] = s; paintScore(); });
    });
    inner.appendChild(toastEl);
    // 簽到視窗：派對解鎖之後，第一次來（還沒簽到）才會跳出；解鎖之前只能看時程表和活動資訊
    function maybeCheckin() { var existing = meId(); if (unlocked() && !(existing && C.guestIndex(existing) >= 0)) showCheckin(); }
    maybeCheckin();
    if (!unlocked()) {                                                             // 頁面開著的時候時間到了：按鈕自動解鎖、跳出簽到
      var lockTimer = setInterval(function () { if (unlocked()) { clearInterval(lockTimer); paintGrid(); maybeCheckin(); } }, 3000);
    }
    return { refresh: function () { paintScore(); }, showCheckin: showCheckin };
  }

  // ---------- 時程表 ----------
  function mountSchedule(host, ctx) {
    ctx = ctx || {};
    var inner = shell(host, ctx);
    inner.appendChild(backBar(ctx));
    inner.appendChild(titleBlock("schedule", "時程表"));
    var list = el("div", { "class": "pg-sched" }); inner.appendChild(list);
    P.SCHEDULE.forEach(function (it) {
      list.appendChild(el("div", { "class": "pg-srow" }, [
        el("div", { "class": "tm", text: timeText(it) }),
        el("div", { "class": "wh" }, [el("div", { "class": "ti", text: it.title }), it.note ? el("div", { "class": "no", text: it.note }) : null])
      ]));
    });
    inner.appendChild(el("p", { "class": "pg-tip", text: "時間會依現場狀況機動微調。" }));
  }

  // ---------- 場地・轉帳資訊 ----------
  function mountInfo(host, ctx) {
    ctx = ctx || {};
    var inner = shell(host, ctx);
    var toastEl = el("div", { "class": "pg-toast" });
    var toastTimer = null;
    function toast(msg) { toastEl.textContent = msg; toastEl.className = "pg-toast show"; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.className = "pg-toast"; }, 1600); }
    // 複製：先用 execCommand（在手機上點擊的當下最穩），不行再用 clipboard API；都不行就把文字選起來，請他長按複製
    function copyViaExec(text) {
      var ta = el("textarea", { readonly: "readonly", style: "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;" });
      ta.value = text; document.body.appendChild(ta);
      var ok = false;
      try {
        if (/ipad|iphone|ipod/i.test(navigator.userAgent || "")) {
          var range = document.createRange(); range.selectNodeContents(ta);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); ta.setSelectionRange(0, 999999);
        } else ta.select();
        ok = !!(document.execCommand && document.execCommand("copy"));
      } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    function copy(text, afterFail) {
      if (copyViaExec(text)) { toast("複製成功"); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("複製成功"); }, function () { afterFail(); });
      } else afterFail();
    }
    // 自動複製不了（例如某些瀏覽器擋住）：把文字放進一個「已經選好」的框框，請他長按複製
    function showManual(holder, text) {
      var old = holder.querySelector(".pg-manual"); if (old) old.parentNode.removeChild(old);
      var inp = el("input", { "class": "pg-manual", type: "text", readonly: "readonly", value: text });
      holder.appendChild(inp);
      try { inp.focus(); inp.select(); inp.setSelectionRange(0, 999999); } catch (e) {}
      toast("沒辦法自動複製，請長按選取後複製");
    }

    inner.appendChild(backBar(ctx));
    inner.appendChild(titleBlock("info", "活動資訊"));

    function sec(title, kids) { return el("section", { "class": "pg-info" }, [el("h3", { text: title })].concat(kids)); }
    var mapBtn = el("a", { "class": "pg-btn", href: P.MAP_URL, target: "_blank", rel: "noopener", text: "🗺️ 打開地圖" });
    var addrBox = el("div", { "class": "pg-manualbox" });
    var copyAddr = el("button", { "class": "pg-btn ghost", type: "button", text: "複製地址", onclick: function () { copy(P.ADDRESS, function () { showManual(addrBox, P.ADDRESS); }); } });

    inner.appendChild(sec("📅 時間", [el("p", { "class": "big", text: P.DATE_TEXT })]));
    inner.appendChild(sec("📍 地點", [
      el("p", { "class": "big", text: P.PLACE }),
      el("p", { text: P.ADDRESS }),
      el("p", { text: "🚇 " + P.TRANSIT }),
      el("p", {}, P.TIPS.map(function (t, i) { return (i ? "　" : "") + "👉 " + t; })),
      el("div", { "class": "pg-btns" }, [mapBtn, copyAddr]), addrBox,
      el("a", { href: P.MAP_IMG, target: "_blank", rel: "noopener" }, [el("img", { "class": "pg-map", src: P.MAP_IMG, alt: "路線地圖" })])
    ]));
    var payBox = el("div", { "class": "pg-manualbox" });
    inner.appendChild(sec("💰 費用與轉帳", [
      el("p", { "class": "big", text: P.FEE }),
      el("p", { text: P.FEE_NOTE }),
      el("div", { "class": "pg-pay" }, [
        el("span", { "class": "acc", text: P.BANK.name + "　" + P.BANK.account }),
        el("button", { "class": "pg-copy", type: "button", text: "複製帳號", onclick: function () { copy(P.BANK.account, function () { showManual(payBox, P.BANK.account); }); } })
      ]), payBox
    ]));
    var rules = el("div", { "class": "pg-rules" });
    P.RULES.forEach(function (r) { rules.appendChild(el("details", {}, [el("summary", { text: r.title }), el("p", { text: r.text })])); });
    rules.appendChild(el("p", { "class": "pg-tip", text: P.RULES_FOOTER }));
    inner.appendChild(sec("📋 場地守則（點開看）", [rules]));
    inner.appendChild(toastEl);
  }


  // ---------- 菜單 ----------
  // 參考咖啡廳菜單圖：一張紙（奶油色）、大大的 MENU、分類標題、每道菜左邊小圖示 + 菜名 + 內容物。紙放在和其他頁一樣的背景上
  function squiggle() {
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 120 90"); svg.setAttribute("class", "mn-squig"); svg.setAttribute("aria-hidden", "true");
    var p1 = document.createElementNS(NS, "path"); p1.setAttribute("d", "M12 80 C4 50 22 18 52 20 C74 22 70 52 50 48 C36 45 44 24 66 12 C80 4 100 6 112 8");
    svg.appendChild(p1); return svg;
  }
  function mountMenu(host, ctx) {
    ctx = ctx || {};
    var M = root.MENU, avoid = {}, cards = [], inner = shell(host, ctx);           // 背景、寬度和其他頁完全一樣
    inner.appendChild(backBar(ctx));
    var sheet = el("div", { "class": "mn-sheet" }); inner.appendChild(sheet);

    sheet.appendChild(el("div", { "class": "mn-head" }, [
      squiggle(),
      M.KICKER ? el("div", { "class": "mn-kicker", text: M.KICKER }) : null,
      el("h1", { "class": "mn-title", text: M.TITLE || "MENU" }),
      el("span", { "class": "mn-dot o" }), el("span", { "class": "mn-dot f" })
    ]));
    sheet.appendChild(el("div", { "class": "mn-rule" }));

    var hasAllergens = M.ITEMS.some(function (it) { return it.allergens && it.allergens.length; });
    if (hasAllergens) {                                              // 有填過敏原資料才會出現這一排
      var chips = el("div", { "class": "chips" });
      M.ALLERGENS.forEach(function (a) {
        var c = el("button", { "class": "mn-chip", type: "button", text: a, onclick: function () { avoid[a] = !avoid[a]; c.classList.toggle("on", !!avoid[a]); paint(); } });
        chips.appendChild(c);
      });
      sheet.appendChild(el("div", { "class": "mn-filter" }, [el("div", { "class": "t", text: "有過敏？點選要避開的，含有的菜會標出來" }), chips]));
    }
    if (M.NOTE) sheet.appendChild(el("p", { "class": "mn-note", text: M.NOTE }));

    // 分類：沒填 sec 的菜放進最後面的「其他」
    var secs = (M.SECTIONS || []).slice(), known = {};
    secs.forEach(function (x) { known[x.key] = true; });
    if (M.ITEMS.some(function (it) { return !known[it.sec]; })) secs.push({ key: "_other", title: "其他", en: "" });
    secs.forEach(function (sc) {
      var items = M.ITEMS.filter(function (it) { return (known[it.sec] ? it.sec : "_other") === sc.key; });
      if (!items.length) return;
      var list = el("div", { "class": "mn-list" });
      items.forEach(function (it) {
        var ic = el("div", { "class": "mn-ic" + (it.img ? " has-img" : "") }, [it.img ? el("img", { src: it.img, alt: it.name }) : el("span", { "class": "em", text: it.emoji || "🍽️" })]);
        var ct = (it.contents && it.contents.length) ? it.contents.map(function (c) { return typeof c === "string" ? c : c.label; }).join(" · ") : (it.note || "");
        var row = el("div", { "class": "mn-item" }, [
          ic,
          el("div", { "class": "mn-bd" }, [el("div", { "class": "mn-nm", text: it.name }), ct ? el("div", { "class": "mn-ct", text: ct }) : null, el("div", { "class": "mn-flag" })])
        ]);
        list.appendChild(row); cards.push({ it: it, el: row });
      });
      sheet.appendChild(el("section", { "class": "mn-sec" }, [
        el("h2", { "class": "mn-sh" }, [sc.title, sc.en ? el("small", { text: sc.en }) : null]), list
      ]));
    });

    // 最下面：一句話
    if (M.FOOT) sheet.appendChild(el("div", { "class": "mn-foot" }, [el("span", { "class": "t", text: M.FOOT + " ♡" })]));

    // 往下滑時一道一道浮出來
    function reveal(node) { node.classList.add("in"); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } }); }, { threshold: 0.12 });
      cards.forEach(function (x) { io.observe(x.el); });
    } else cards.forEach(function (x) { reveal(x.el); });

    // 避開過敏原：含有 → 標紅變灰；沒標示 → 提醒詢問；確定沒有 → 正常
    function paint() {
      var picked = Object.keys(avoid).filter(function (k) { return avoid[k]; });
      cards.forEach(function (x) {
        var cls = "mn-item" + (x.el.classList.contains("in") ? " in" : ""), msg = "";
        if (picked.length) {
          if (!x.it.allergens) { cls += " unknown"; msg = "⚠ 尚未標示過敏原，請詢問主辦"; }
          else {
            var hit = picked.filter(function (a) { return x.it.allergens.indexOf(a) >= 0; });
            if (hit.length) { cls += " bad"; msg = "🚫 含 " + hit.join("、") + "，請避開"; }
          }
        }
        x.el.className = cls; x.el.querySelector(".mn-flag").textContent = msg;
      });
    }
    return { paint: paint };
  }

  root.PartyPages = { mountHub: mountHub, mountMenu: mountMenu, mountSchedule: mountSchedule, mountInfo: mountInfo, PAGE_URL: PAGE_URL };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PartyPages;
})(typeof globalThis !== "undefined" ? globalThis : this);

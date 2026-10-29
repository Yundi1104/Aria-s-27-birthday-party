/**
 * 拖移小工具（中控台分桌、分組用）— 滑鼠和觸控都可以（用 Pointer Events）。
 *
 *   PartyDnd.enable(root, {
 *     itemSel:  ".qh-pchip",          // 可以被拖的東西
 *     zoneSel:  "[data-zone]",         // 可以放進去的區域（要有 data-zone 屬性）
 *     keyOf:    function (itemEl) {},  // 這個東西是誰（例如 pid）
 *     onDrop:   function (key, zoneId, beforeKey) {}   // 放開時：key 放到 zoneId 這一區，插在 beforeKey 前面（null = 放最後面）
 *   });
 *
 * - 按住移動超過幾個像素才算「拖」，所以原本的「點一下」還是照常運作（拖完那一下不會再觸發點擊）。
 * - 拖的時候有一個跟著游標的小標籤，目前會放進去的區域會亮起來（.dz-over），插入位置前面會有一條線（.dz-before）。
 * - 區域裡的項目要排成一直排或一整塊（用上下位置判斷插在誰前面）。
 */
(function (root) {
  var THRESHOLD = 6;

  function enable(rootEl, cfg) {
    var drag = null, suppressClick = 0;

    function zoneAt(x, y) {
      var el = document.elementFromPoint(x, y);
      while (el && el !== document.body) { if (el.matches && el.matches(cfg.zoneSel)) return el; el = el.parentNode; }
      return null;
    }
    function beforeIn(zone, x, y, dragEl) {
      var items = [].slice.call(zone.querySelectorAll(cfg.itemSel)).filter(function (it) { return it !== dragEl && it.offsetParent !== null; });
      var best = null;
      items.forEach(function (it) {
        if (best) return;
        var r = it.getBoundingClientRect();
        var wide = r.width > zone.clientWidth * 0.6;                              // 一整排只有一個（單欄清單）→ 看上下；一排有好幾個（格子）→ 看左右
        if (y < r.top) best = it;                                                 // 在這一列上面
        else if (y <= r.bottom && (wide ? y < r.top + r.height / 2 : x < r.left + r.width / 2)) best = it;
      });
      return best;
    }
    function clearMarks() {
      [].slice.call(document.querySelectorAll(".dz-over,.dz-before")).forEach(function (n) { n.classList.remove("dz-over"); n.classList.remove("dz-before"); });
    }
    function move(ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x0, dy = ev.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dx) + Math.abs(dy) < THRESHOLD) return;
        drag.on = true;
        drag.ghost = document.createElement("div"); drag.ghost.className = "dnd-ghost"; drag.ghost.textContent = drag.label;
        document.body.appendChild(drag.ghost); drag.item.classList.add("dnd-src");
      }
      ev.preventDefault();
      drag.ghost.style.left = ev.clientX + "px"; drag.ghost.style.top = ev.clientY + "px";
      clearMarks();
      var z = zoneAt(ev.clientX, ev.clientY); drag.zone = z; drag.before = null;
      if (z) { z.classList.add("dz-over"); var b = beforeIn(z, ev.clientX, ev.clientY, drag.item); drag.before = b; if (b) b.classList.add("dz-before"); }
    }
    function up(ev) {
      document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", cancel, true);
      var d = drag; drag = null; if (!d) return;
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      clearMarks(); d.item.classList.remove("dnd-src");
      if (!d.on) return;
      suppressClick = Date.now();
      if (d.zone) cfg.onDrop(d.key, d.zone.getAttribute("data-zone"), d.before ? cfg.keyOf(d.before) : null);
    }
    function cancel() { up({}); }
    rootEl.addEventListener("pointerdown", function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      var t = ev.target; while (t && t !== rootEl && !(t.matches && t.matches(cfg.itemSel))) t = t.parentNode;
      if (!t || t === rootEl) return;
      drag = { item: t, key: cfg.keyOf(t), x0: ev.clientX, y0: ev.clientY, on: false, label: (t.getAttribute("data-label") || t.textContent || "").replace(/\s+/g, " ").trim(), zone: null, before: null };
      document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", cancel, true);
    });
    // 拖完放開的那一下，瀏覽器會再送一個 click：擋掉，不然會又「點一下換桌」
    rootEl.addEventListener("click", function (ev) { if (Date.now() - suppressClick < 400) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    // 拖的時候不要選到字、手機上不要捲動
    rootEl.addEventListener("dragstart", function (ev) { ev.preventDefault(); });
  }

  root.PartyDnd = { enable: enable };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PartyDnd;
})(typeof globalThis !== "undefined" ? globalThis : this);

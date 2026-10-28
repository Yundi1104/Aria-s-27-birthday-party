/**
 * 深色模式：每支手機自己記住（localStorage），入口頁右上角齒輪可以切換。
 *   "light" 淺色（預設）／"dark" 深色／"auto" 跟著手機設定
 * 放在每一頁 <head> 裡最前面載入，畫面才不會先亮一下再變暗。
 */
(function (root) {
  "use strict";
  var KEY = "ariaParty.theme", mq = null, mem = null;   // mem：手機不能存（例如無痕模式）時，至少這次有效
  function get() { var v = mem; try { var x = localStorage.getItem(KEY); if (x) v = x; } catch (e) {} return v === "dark" || v === "auto" ? v : "light"; }
  function resolved(v) {
    if (v === "auto") { try { mq = mq || root.matchMedia("(prefers-color-scheme: dark)"); return mq.matches ? "dark" : "light"; } catch (e) { return "light"; } }
    return v;
  }
  function apply() { if (root.document) root.document.documentElement.setAttribute("data-theme", resolved(get())); }
  function set(v) { mem = v; try { localStorage.setItem(KEY, v); } catch (e) {} apply(); }
  apply();
  try { root.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { if (get() === "auto") apply(); }); } catch (e) {}
  root.addEventListener && root.addEventListener("storage", function (e) { if (e.key === KEY) apply(); });   // 其他分頁改了也跟著變
  root.PartyTheme = { get: get, set: set, apply: apply };
})(typeof window !== "undefined" ? window : this);

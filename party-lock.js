/**
 * 派對解鎖 — 派對當天 PARTY.UNLOCK_AT（預設 10/31 17:30）之前，簽到和遊戲／菜單都先鎖著。
 *   PartyLock.isUnlocked()   現在解鎖了嗎
 *   PartyLock.guard()        給菜單、三個遊戲的手機頁用：還沒解鎖就把人送回入口頁（回傳 true = 正在導回去，不要再往下載入）
 * 製作的時候想提早看：網址後面加 ?unlock=1（這支瀏覽器會記住，之後不用再加）；加 ?unlock=0 改回鎖定。
 * 中控台（host.html 等）不受影響，主持人隨時進得去。
 */
(function (root) {
  var KEY = "ariaParty.unlock", forced = null;
  var m = /[?&]unlock=([01])(?:&|$)/.exec(String((root.location && root.location.search) || ""));
  if (m) {                                                      // ?unlock=1 / ?unlock=0（瀏覽器擋住儲存的話，這一次載入至少還是有效）
    forced = m[1] === "1";
    try { if (forced) root.localStorage.setItem(KEY, "1"); else root.localStorage.removeItem(KEY); } catch (e) {}
  }
  function unlockTime() { var t = Date.parse((root.PARTY && root.PARTY.UNLOCK_AT) || ""); return isNaN(t) ? 0 : t; }
  function isUnlocked(now) {
    if (forced === true) return true;
    if (forced !== false) { try { if (root.localStorage.getItem(KEY) === "1") return true; } catch (e) {} }
    var t = unlockTime(); if (!t) return true;                  // 沒設解鎖時間 = 一直開放
    return (now == null ? Date.now() : now) >= t;
  }
  function guard() {
    if (isUnlocked()) return false;
    try { root.location.replace("index.html"); } catch (e) {}
    return true;
  }
  root.PartyLock = { isUnlocked: isUnlocked, guard: guard, unlockTime: unlockTime, KEY: KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PartyLock;
})(typeof globalThis !== "undefined" ? globalThis : this);

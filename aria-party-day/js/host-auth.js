/**
 * 主持人密碼只要輸入一次：在 host-index.html（主持人入口）輸入密碼之後，這支瀏覽器 12 小時內，
 * 四個中控台（好友冰狗、迷因海公牛、陪酒小姐、頒獎）都不會再問密碼。
 * 如果直接打網址進某個中控台（沒有先從入口進來），那個中控台自己還是會問一次密碼，輸入之後其他中控台也都解開了。
 */
(function (root) {
  var KEY = "ariaHost.ok", TTL = 12 * 3600 * 1000;
  function ok() { try { var t = parseInt(root.localStorage.getItem(KEY) || "0", 10); return !!t && Date.now() - t < TTL; } catch (e) { return false; } }
  function set() { try { root.localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
  function clear() { try { root.localStorage.removeItem(KEY); } catch (e) {} }
  root.HostAuth = { ok: ok, set: set, clear: clear, KEY: KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HostAuth;
})(typeof globalThis !== "undefined" ? globalThis : this);

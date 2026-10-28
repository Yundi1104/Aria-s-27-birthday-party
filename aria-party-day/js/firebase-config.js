/**
 * Firebase 設定（跟著 README-遊戲設定.md 的步驟取得後，貼在下面）
 *
 * 還沒設定的時候保持 null：遊戲會進入「本機測試模式」——
 * 同一台電腦、同一個瀏覽器的不同分頁（例如 host.html 和 play.html）可以互相同步，
 * 拿來先看畫面、試玩都可以；但手機之間不會同步。
 *
 * 設定好之後長這樣：
 * window.FIREBASE_CONFIG = {
 *   apiKey: "AIza...",
 *   authDomain: "你的專案.firebaseapp.com",
 *   databaseURL: "https://你的專案-default-rtdb.asia-southeast1.firebasedatabase.app",
 *   projectId: "你的專案",
 *   appId: "1:123...:web:abc..."
 * };
 */
window.FIREBASE_CONFIG = null;

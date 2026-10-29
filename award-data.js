/**
 * 總排名（頒獎）— 設定。「前三名有獎品」的前三名 = 好友冰狗分數（名次 + 額外賽）+ 迷因海公牛分數（答對題數 + 組別名次加分）+ 陪酒小姐分數（抽到數字幾 +幾分）加總。
 */
(function (root) {
  var DATA = {
    CONFIG: {
      WEIGHT_BINGO: 1,        // 賓果分數的倍率（總分 = 賓果分數 × 這個數字 + 問答分數 × 下面那個數字）
      WEIGHT_QUIZ: 1,         // 問答分數的倍率
      WEIGHT_CARD: 1,         // 陪酒小姐分數的倍率
      EXCLUDE: ["Aria"],      // 不參加排名的人（壽星本人）；要列入就把這行清空：EXCLUDE: []
      PRIZE_COUNT: 3,         // 有獎品的名次（禮物數量）
      TIEBREAK: true          // 同分預設並列同名次；只有「並列會讓得獎人超過禮物數」時，才用加賽規則（迷因海公牛分數 → 較早連成 3 條 → 線數 → 答對題數）分出先後。設 false = 一律並列
    }
  };
  root.AWARD_DATA = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof globalThis !== "undefined" ? globalThis : this);

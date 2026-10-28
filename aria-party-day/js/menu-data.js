/**
 * 菜單 — 每一道菜的資料。要改菜色、補圖片、補過敏原，改這個檔案。
 *
 * 版面：參考妳給的咖啡廳菜單圖——一張「紙」，上面大大的 MENU，下面一個一個分類（SECTIONS），每道菜左邊一個小圖示、右邊菜名 + 內容物小字。
 * SECTIONS 是分類（順序就是畫面上的順序）：key 給菜用、title 是大標題、en 是旁邊的小英文。
 *
 * 每一道菜：
 *   name      菜名（粗體）
 *   sec       屬於哪個分類（填 SECTIONS 裡的 key）。沒填的會放進最後面的「其他」
 *   tag       （舊的小標籤，現在不顯示了，留著也沒關係）
 *   emoji     還沒有圖片時，先用這個 emoji 代替
 *   img       圖片路徑（例如 "images/menu/sushi.webp"）。有寫的話就會用圖片取代 emoji。圖片放在 images/menu/ 資料夾（去背的透明圖最好看）
 *   contents  內容物或口味，會用「 · 」隔開顯示在菜名下面的小字。沒有內容物的菜就不用寫。
 *   note      圖片旁邊的小字備註（可不寫）
 *   allergens 含有的過敏原（可不寫）。寫了才會出現上方的「避開過敏原」按鈕。
 *             沒寫 = 還沒標示（選了要避開的過敏原時，會提醒「尚未標示，請詢問主辦」）；寫 [] = 確定沒有。
 *   homemade  壽星親手做的（紅字）。目前頁面上「不顯示」，因為賓果有一題「哪一道菜是壽星做的」，顯示會破梗。
 */
(function (root) {
  var DATA = {
    KICKER: "ARIA'S 27TH BIRTHDAY",          // 大標題上面的小字
    TITLE: "MENU",                           // 大標題
    FOOT: "Good Food, Good Mood",           // 最下面的字
    NOTE: "",                               // 標題下面的小字（空白 = 不顯示）
    ALLERGENS: ["蛋", "奶", "小麥（麩質）", "花生／堅果", "甲殼類", "魚", "大豆", "酒精"],

    SECTIONS: [
      { key: "main", title: "主食", en: "MAIN" },
      { key: "snack", title: "小點與拼盤", en: "SNACKS" },
      { key: "sweet", title: "甜點", en: "SWEETS" },
      { key: "drink", title: "酒與特調", en: "DRINKS" }
    ],

    ITEMS: [
      { name: "13吋披薩 4個", sec: "main", tag: "MAIN", emoji: "🍕", img: "images/menu/pizza.webp" },
      { name: "三商炸雞", sec: "snack", tag: "SNACK", emoji: "🍗", img: "images/menu/chicken.webp" },
      { name: "起司拼盤", sec: "snack", tag: "PLATTER", emoji: "🧀", img: "images/menu/cheese.webp", contents: ["蘋果", "葡萄"], homemade: true },
      { name: "伏特加軟糖", sec: "sweet", tag: "SWEET", emoji: "🍬", img: "images/menu/gummy.webp", contents: ["伏特加", "小熊軟糖"], homemade: true },
      { name: "朗母青檸鳳梨", sec: "drink", tag: "SPECIAL", emoji: "🍍", img: "images/menu/pineapple.webp", homemade: true },
      { name: "蝦子蒜香義大利麵", sec: "main", tag: "MAIN", emoji: "🍝", contents: ["蝦子", "橄欖油", "蒜頭", "義大麵"], homemade: true },
      { name: "散壽司", sec: "main", tag: "MAIN", emoji: "🍣", img: "images/menu/sushi.webp", contents: ["玉子燒", "小黃瓜", "蟹柳絲", "海苔絲"], homemade: true },
      { name: "水果盤", sec: "snack", tag: "FRUIT", emoji: "🍉", img: "images/menu/fruit.webp", contents: ["蘋果切塊", "葡萄", "小蕃茄"], homemade: true },
      { name: "番茄沙沙醬、玉米片", sec: "snack", tag: "SNACK", emoji: "🌽", homemade: true },
      { name: "提拉米蘇", sec: "sweet", tag: "DESSERT", emoji: "🍰" },
      { name: "冷滷味", sec: "snack", tag: "SNACK", emoji: "🍢", contents: ["百頁", "海帶", "豆干", "鳥蛋", "甜不辣"] },
      { name: "鹽水雞", sec: "snack", tag: "SNACK", emoji: "🍗", contents: ["雞腿", "小黃瓜", "洋蔥", "玉米筍", "高麗菜"] },
      { name: "伏特加", sec: "drink", tag: "DRINK", emoji: "🍸" },
      { name: "蛋糕", sec: "sweet", tag: "DESSERT", emoji: "🎂" },
      { name: "餅乾糖果", sec: "snack", tag: "SNACK", emoji: "🍪" }
    ]
  };
  root.MENU = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof globalThis !== "undefined" ? globalThis : this);

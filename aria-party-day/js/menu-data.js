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
 *   homemade  瘦星親手做的（紅字）。目前頁面上「不顯示」，因為賓果有一題「哪一道菜是瘦星做的」，顯示會破梗。
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
      { name: "13吋披薩", sec: "main", tag: "MAIN", emoji: "🍕", img: "images/menu/pizza.webp" },
      { name: "蝦子蒜香義大利麵", sec: "main", tag: "MAIN", emoji: "🍝", img: "images/menu/shrimp.webp", contents: ["義大利麵", "蝦子", "蒜頭", "橄欖油"], homemade: true },
      { name: "散壽司", sec: "main", tag: "MAIN", emoji: "🍣", img: "images/menu/sushi.webp", contents: ["白飯", "壽司醋", "雞蛋", "蟹柳", "海苔絲", "毛豆"], homemade: true },

      { name: "三商炸雞", sec: "snack", tag: "SNACK", emoji: "🍗", img: "images/menu/chicken.webp" },
      { name: "起司拼盤", sec: "snack", tag: "PLATTER", emoji: "🧀", img: "images/menu/cheese.webp", homemade: true,
        contents: ["生火腿", "米蘭乾臘腸", "卡拉布雷塞臘腸", "胡椒臘腸", "義式生火腿片", "鮮奶油布里乾酪", "康堤乾酪", "芭拉維他卡本內乾酪", "綠葡萄", "小果醬（蜂蜜）", "餅乾片", "蝴蝶結餅乾"] },
      { name: "水果盤", sec: "snack", tag: "FRUIT", emoji: "🍉", img: "images/menu/fruit.webp", contents: ["蘋果", "葡萄", "小番茄"] },
      { name: "番茄沙沙醬、玉米片", sec: "snack", tag: "SNACK", emoji: "🌽", img: "images/menu/tomato.webp", contents: ["番茄", "香菜", "洋蔥", "檸檬"], homemade: true },
      { name: "鹽水雞", sec: "snack", tag: "SNACK", emoji: "🍗", img: "images/menu/cucumber.webp", contents: ["雞肉", "玉米筍", "小黃瓜", "高麗菜", "洋蔥"], homemade: true },


      { name: "伏特加（自由調酒）", sec: "drink", tag: "DRINK", emoji: "🍸", img: "images/menu/vodka.webp", contents: ["柳橙汁", "可樂", "伏特加"] },
      { name: "飲料暢飲", sec: "drink", tag: "DRINK", emoji: "🧃", img: "images/menu/juice.webp", note: "冰箱自取" }
    ]
  };
  root.MENU = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof globalThis !== "undefined" ? globalThis : this);

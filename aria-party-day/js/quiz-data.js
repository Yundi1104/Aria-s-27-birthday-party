/**
 * 迷因海公牛（問答）— 題目與設定。要改題目、圖片、影片、計分，只要改這個檔案。
 * 題目來源：生日派對.xlsx「問答遊戲」分頁（紅字 = 正確答案）。
 *
 * 每一題可以寫：
 *   no        Excel 上的題號（只是方便對照，畫面上不會出現）
 *   cat       分類（例如「紫禁城」）。分類換掉時，中控台會先出現一張分類封面（見下面 CATEGORIES）
 *   level     難度（易 / 中 / 難），只是顯示用
 *   type      "choice" = 選擇題（預設）；"buzz" = 搶答題（手機只有一顆搶答鈕，中控台看按下的順序和時間，主持人判定誰答對）
 *   q         題目文字
 *   img       題目圖片（放在 images/quiz/；GIF 也可以）
 *   video     影片：YouTube / bilibili 網址，或自己的影片檔（例如 "images/quiz/q01.mp4"）。只會在中控台（大螢幕）播放，有聲音
 *   answerImg 揭曉答案時換上的圖片（可不寫）
 *   options   選項（2 ~ 4 個）。搶答題不用寫
 *   answer    正確答案是第幾個選項：0 = 第 1 個、1 = 第 2 個 …
 *   answerText 搶答題的正確答案（揭曉時顯示）
 *   bonus     額外加分，例如 { points: 20, label: "全文背誦經典達 5 句以上" }（揭曉後主持人點名字加分，只加在個人，不算進組別分數）
 *   points    這題答對幾點（可不寫，不寫就用下面的 POINTS_PER_CORRECT）
 *   seconds   這題預設幾秒（可不寫）。實際秒數由主持人在中控台出題前決定
 *   todo      true = 題目還沒寫完，中控台會自動跳過這題
 *
 * 玩法：中控台把賓客分成幾組，每個人用自己的手機作答（時間到之前可以改答案、可以跟組員討論）。
 * 每答對 1 題 +3 分；最後依組別名次，該組每個人加 50 / 40 / 30 / 20 / 10 分。
 */
(function (root) {
  var DATA = {
    CONFIG: {
      SECONDS: 30,                 // 選擇題預設秒數（中控台出題前可以改）
      SECONDS_CHOICES: [10, 15, 20, 30, 45, 60, 90, 0],   // 中控台可以選的秒數；0 = 不倒數（主持人自己按揭曉）
      BUZZ_SECONDS: 0,             // 搶答題預設秒數（0 = 不倒數，主持人判定完再按揭曉）
      BUZZ_DELAY: 5,               // 搶答題：題目出現後幾秒才能按搶答鈕
      POINTS_PER_CORRECT: 3,       // 每個人答對 1 題 +3 分（算在自己身上）；組別名次是比全組「答對題數」
      TEAM_BONUS: [50, 40, 30, 20, 10],   // 最後依組別名次，該組「每個人」加幾分：第 1 名組 +50、第 2 名組 +40 … 第 5 名組 +10，更後面的組 0
      TEAM_SCORE: "sum",           // 組別怎麼比：sum = 全組答對題數加總；average = 平均每人答對題數
      AUTO_REVEAL: true,           // 倒數到 0 自動揭曉答案
      LATE_GRACE_MS: 1500,         // 網路延遲的寬限時間：倒數結束後 1.5 秒內送到的答案還算數
      SHOW_LIVE_COUNTS: false,     // 作答中，大螢幕要不要即時顯示各選項的人數（不顯示，免得大家直接看多數決）
      CATEGORY_INTRO: true,        // 換分類時先出現分類封面
      MAX_TEAMS: 8                 // 中控台最多可以分幾組
    },

    // 分類封面（換分類時中控台先顯示這張圖；沒有圖就只顯示大標題）
    CATEGORIES: {
      "暖身": { sub: "先來熱熱身" },
      "紫禁城": { img: "images/quiz/cat-forbidden.jpg", sub: "甄嬛傳" },
      "帕拉迪島": { img: "images/quiz/cat-paradis.jpg", sub: "進擊的巨人" },
      "哈利波特": { sub: "Harry Potter" },
      "真珠皮亞利": { img: "images/quiz/cat-pearl.jpg", sub: "真珠美人魚" },
      "比奇堡": { img: "images/quiz/cat-bikini.jpg", sub: "海綿寶寶" }
    },

    QUESTIONS: [
      // ---------- 暖身 ----------
      { no: 1, cat: "暖身", level: "易", q: "圖片主持人說了什麼",
        video: "https://www.youtube.com/watch?v=TZzRTTeJ80g",
        options: ["海公豬", "海公雞", "海公牛", "海公鴨"], answer: 2 },
      { no: 2, cat: "暖身", level: "易", q: "（第 2 題待補）", todo: true },
      { no: 3, cat: "暖身", level: "易", type: "buzz", q: "下一句台詞是什麼？",
        answerText: "（答案待補）" },

      // ---------- 紫禁城（甄嬛傳）----------
      { no: 4, cat: "紫禁城", level: "中", q: "安陵容是藉由送給甄嬛什麼物品，在其中暗藏麝香而導致甄嬛第一次小產？",
        img: "images/quiz/q04.jpg",
        options: ["息肌丸", "歡宜香", "舒痕膠", "鵝梨帳中香"], answer: 2 },
      { no: 5, cat: "紫禁城", level: "難", type: "buzz", q: "下一句台詞是什麼？",
        img: "images/quiz/q05.jpg", answerImg: "images/quiz/q05-answer.jpg", answerText: "你如今幾歲了" },
      { no: 6, cat: "紫禁城", level: "易", q: "這一段甄嬛對皇上死心，是因為哪一句？",
        img: "images/quiz/q06.jpg",
        options: ["賤人就是矯情", "翠果，打爛她的嘴", "人吃五穀雜糧，哪有不生病", "菀菀類卿"], answer: 3 },
      { no: 7, cat: "紫禁城", level: "易", q: "這一段是最著名的片段，事件名稱為？",
        img: "images/quiz/q07.jpg",
        options: ["滴血驗親", "假孕爭寵", "熹妃回宮", "純元故衣"], answer: 0,
        bonus: { points: 20, label: "全文背誦經典達 5 句以上" } },

      // ---------- 帕拉迪島（進擊的巨人）----------
      { no: 8, cat: "帕拉迪島", level: "易", q: "人類居住的三道城牆中，最外圍、也是最先被破壞的城牆名稱是什麼？",
        img: "images/quiz/q08.jpg",
        options: ["羅塞之牆", "席娜之牆", "瑪莉亞之牆"], answer: 2 },
      { no: 9, cat: "帕拉迪島", level: "中", q: "艾連在拖洛斯特區防衛戰中，失去了什麼？",
        img: "images/quiz/q09.jpg",
        options: ["左手、左腳", "右手、右腳", "左手、右腳", "右手、左腳"], answer: 0 },
      { no: 10, cat: "帕拉迪島", level: "難", q: "調查軍團在第幾次牆外調查中，終於看到了海洋？",
        img: "images/quiz/q10.jpg",
        options: ["56", "57", "58", "59"], answer: 2 },

      // ---------- 哈利波特 ----------
      { no: 11, cat: "哈利波特", level: "易", q: "在《死神的聖物》中，用「七個波特」戰術帶哈利離開水蠟樹街時，喪失了一隻耳朵的是誰？",
        img: "images/quiz/q11.jpg",
        options: ["喬治", "東施", "雷木思路平", "佛雷"], answer: 0 },
      { no: 12, cat: "哈利波特", level: "難", q: "佛地魔的魔杖與哈利波特的魔杖是「兄弟魔杖」，兩者的杖芯皆來自鳳凰佛客使的羽毛。請問佛地魔原本的魔杖木材是什麼？",
        img: "images/quiz/q12.jpg",
        options: ["柳木", "接骨木", "紫杉木", "冬青木"], answer: 2 },
      { no: 13, cat: "哈利波特", level: "難", q: "在《哈利波特：阿茲卡班的逃犯》電影中，天狼星·布萊克被關在阿茲卡班監獄時，他舉著的囚犯編號牌上的號碼是多少？",
        img: "images/quiz/q13.jpg",
        options: ["6969", "390", "719", "268"], answer: 1 },

      // ---------- 真珠皮亞利（真珠美人魚）----------
      { no: 14, cat: "真珠皮亞利", level: "易", q: "露亞等美人魚公主積極找齊散落在各地的七位美人魚公主，其最主要的目的是什麼？",
        img: "images/quiz/q14.jpg",
        options: ["召喚阿克安雷之娜女神", "和海斗生小寶寶", "尋找自己遺失的粉色真珠", "對付壞婊子米兒"], answer: 0 },
      { no: 15, cat: "真珠皮亞利", level: "中", q: "黑美人姐妹花由秀秀姊姊和咪咪妹妹組成，請問他們的真身是什麼？",
        options: ["帶魚", "燈籠魚", "魟魚", "比目魚"], answer: 1 },
      { no: 16, cat: "真珠皮亞利", level: "易", q: "海斗的雙胞胎哥哥「凱特」，是哪一個一族的末裔？",
        img: "images/quiz/q16.jpg", answerImg: "images/quiz/q16-answer.jpg",
        options: ["深海魔鬼族", "帕達拉薩族", "帕拉梅拉族", "帕拉米帝國"], answer: 1 },
      { no: 17, cat: "真珠皮亞利", level: "中", type: "buzz", q: "下一句歌詞是什麼？",
        answerText: "（答案待補）" },

      // ---------- 比奇堡（海綿寶寶）----------
      { no: 18, cat: "比奇堡", level: "難", q: "蟹堡王的創辦人兼老闆「蟹老闆」，他在營業執照上的全名（本名）叫做什麼？",
        options: ["厚理·蟹", "尤金·蟹", "亞瑟·蟹", "謝爾頓·蟹"], answer: 1 },
      { no: 19, cat: "比奇堡", level: "中", q: "松鼠珊迪非常熱愛她的故鄉，請問她是從哪裡來到比奇堡的？",
        options: ["亞利桑那州", "佛羅里達州", "德克薩斯州", "加利福尼亞"], answer: 2 },
      { no: 20, cat: "比奇堡", level: "中", q: "這是弗雷德，他在比奇堡內最常喊的經典台詞是？",
        video: "https://www.bilibili.com/video/BV1be411s7cJ/",
        options: ["我的腿！", "海綿寶寶！", "你們要倒大楣了！", "老兄，你要習慣"], answer: 0 }
    ]
  };

  root.QUIZ_DATA = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof globalThis !== "undefined" ? globalThis : this);

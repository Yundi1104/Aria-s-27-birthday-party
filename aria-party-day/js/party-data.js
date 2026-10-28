/**
 * 派對資訊 — 入口頁、時程表、場地／轉帳資訊 用的內容。要改時間、地點、帳號、時程，改這個檔案。
 * （場地守則的文字是從邀請函複製過來的。）
 */
(function (root) {
  var DATA = {
    TITLE: "Aria's 27歲生日派對",
    DATE_TEXT: "10/31（六）18:00 ~ 21:30",

    PLACE: "獨角獸派對",
    ADDRESS: "台北市大同區重慶北路一段26巷28號1樓",
    TRANSIT: "北門捷運站 Y19 出口走5分鐘",
    TIPS: ["巷口 7-11 旁邊進去", "到達之後從側門進入"],
    MAP_URL: "https://maps.app.goo.gl/NMrLSNxPdTXDvhNJ9",
    MAP_IMG: "images/map.jpg",

    FEE: "NT$1,000",
    FEE_NOTE: "若有學生證或10月生日可帶著證件，當天小折扣！",
    BANK: { name: "808 玉山銀行", account: "0521979167650" },

    // 派對當天什麼時候解鎖「簽到」和四顆遊戲／菜單按鈕（台灣時間）。在這之前，入口頁只能看時程表和活動資訊，
    // 其他按鈕是「???」、點了沒反應，也不會跳出簽到視窗。
    // 妳自己製作、想提早看的時候：網址後面加 ?unlock=1（這支瀏覽器會記住）；加 ?unlock=0 可以改回鎖定。
    UNLOCK_AT: "2026-10-31T17:30:00+08:00",
    LOCKED_TEXT: "派對解鎖",

    // 時程表：from / to 是 24 小時制 HH:MM（沒有結束時間的項目 to 寫 null）；note 是標題下面的小字（可不寫）
    SCHEDULE: [
      { from: "17:30", to: "18:00", title: "換裝時間", note: "有換裝需求可提早到，至廁所更換" },
      { from: "18:00", to: null,    title: "進場" },
      { from: "18:00", to: "19:00", title: "享用餐點" },
      { from: "19:00", to: "19:35", title: "遊戲時間" },
      { from: "19:35", to: "19:45", title: "頒獎" },
      { from: "19:45", to: "20:00", title: "大合照" },
      { from: "20:00", to: "21:20", title: "自由遊玩" },
      { from: "21:20", to: "21:30", title: "協助環境整理" }
    ],

    // 入口頁（主畫面）：最上面是標題圖，下面是六顆貼紙按鈕，一排兩個，照下面的順序排。
    // 換圖：把去背的貼紙（透明 WebP / PNG）放進 images/btn/，改那個按鈕的 img。
    // 如果拿掉某個按鈕的 img，就會變回文字方塊（用 icon、title、desc）。
    // lock: true = 派對解鎖（UNLOCK_AT）之前這顆按鈕顯示 lockedImg（「???」圖）、點了沒反應。
    HUB: {
      LOGO: "images/logo.webp",                                   // 不想用標題圖就刪掉這一行，會改顯示文字標題
      TIP: "",                       // 按鈕下面的小字（空白 = 不顯示）
      BUTTONS: [
        { page: "schedule", icon: "🗓️", title: "時程表", desc: "今天的流程", img: "images/btn/schedule.webp" },
        { page: "info", icon: "📍", title: "活動資訊", desc: "地址、地圖、費用與轉帳、場地守則", img: "images/btn/info.webp" },
        { page: "menu", icon: "🍽️", title: "菜單", desc: "每一道菜的內容物，往下滑看全部", img: "images/btn/menu.webp", lock: true, lockedImg: "images/btn/locked-menu.webp" },
        { page: "bingo", icon: "🎯", title: "好友冰狗", desc: "找出每一格描述的朋友，先連成 {lines} 條線拿分", img: "images/btn/bingo.webp", lock: true, lockedImg: "images/btn/locked-bingo.webp" },
        { page: "quiz", icon: "🧠", title: "迷因海公牛", desc: "分組搶答，可以跟組員討論，答對 1 題 +3 分", img: "images/btn/quiz.webp", lock: true, lockedImg: "images/btn/locked-quiz.webp" },
        { page: "card", icon: "🃏", title: "陪酒小姐", desc: "輪流抽牌的派對遊戲，抽到數字幾就 +幾分", img: "images/btn/card.webp", lock: true, lockedImg: "images/btn/locked-card.webp" }
      ]
    },

    RULES: [
      {
            "title": "清潔與垃圾",
            "text": "請保持場地整潔，如交還時發現嚴重清潔問題（如亂丟垃圾／使織物髒污）將酌收清潔費 $4000 起。離開前請將垃圾置於提供的垃圾袋內。"
      },
      {
            "title": "飲酒與嘔吐",
            "text": "如喝酒後在場內嘔吐（包括廁所），酌收清潔費 $4000 起／每次（視乎嘔吐位置）。\n如嘔吐物噴濺在電器、織物、球池等物品導致無法清潔，將視為損壞場地物品而需照價賠償。"
      },
      {
            "title": "攜帶酒水／球池",
            "text": "攜帶酒精類飲品進場將收取開瓶費 $500／瓶。嚴禁在球池內飲食，一經發現罰款 $4000。"
      },
      {
            "title": "個人財物",
            "text": "請小心妥善保管個人財物，本店將不負責與賠償任何損失，如有遺失物需要尋回請告知服務人員協尋。"
      },
      {
            "title": "設備使用",
            "text": "場地設備如因人為操縱不當而引致損毀，客人需按設施原價賠償。請勿直接調較音響設備及遊樂設備（switch），如有需要請向場地服務員詢問。只能使用藍丁膠或紙膠帶貼牆壁，如造成牆壁損壞亦須賠償。"
      },
      {
            "title": "人數與法律責任",
            "text": "所有出席人數皆計算在內，亦不設中途換人，如欲臨時增加人數也請告知服務人員。客人在本店內構成任何法律責任，一切由客人自行負責。"
      },
      {
            "title": "行為規範",
            "text": "嚴禁在場地內抽菸、吸毒、放煙火、打架，以及一切違法不文明之行為者將直接報警處理。如有違反本場地守則，場地職員有權邀請客人離開場地，費用將不會退還。"
      },
      {
            "title": "時間規定",
            "text": "預約時間確認後不設提早或遲到補時，煩請準時到達。如超時離場多餘 15 分鐘將直接按續鐘 1 小時價格計算。因故提早離場，收費仍會按照原先租場時間計算。"
      }
],
    RULES_FOOTER: "如有任何爭議，獨角獸派對將保留最終決定權。"
  };
  root.PARTY = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof globalThis !== "undefined" ? globalThis : this);

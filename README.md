# Aria's Birthday Party 邀請函問卷 — 設定教學

這份文件會教你三件事：
1. 設定 Google Sheet + Apps Script（收資料的地方）
2. 把 `ENDPOINT_URL` 貼回 `index.html`
3. 把整個資料夾放上 GitHub Pages（變成一個網址，可以分享給朋友）

不需要任何程式基礎，跟著點就好。整個流程大約 20–30 分鐘。

---

## Part 1：設定 Google Sheet + Apps Script

### 步驟 1：建立 Google Sheet
1. 到 [sheets.google.com](https://sheets.google.com)，建立一個「空白試算表」
2. 幫它取個名字，例如「生日派對報名回覆」
3. 這張表不用先打任何欄位，等下腳本會自動幫你補上標題列

### 步驟 2：打開 Apps Script 編輯器
1. 在剛剛的 Sheet 裡，點選上方選單 **擴充功能 → Apps Script**
2. 會開一個新分頁，裡面有一個 `Code.gs` 檔案，內容預設是空的 `function myFunction() {}`
3. 把裡面全部內容刪掉，改貼上這個資料夾裡的 **`apps-script.gs`** 檔案內容（整份複製貼上）

### 步驟 3：改密語
在你貼上去的程式碼最上面，找到這一行：
```
var SECRET = "aria27party";
```
把 `"aria27party"` 換成你自己想的一組密語（英文數字都可以，例如 `"aria0431secret"`）。**記得等一下要去 `index.html` 改成一樣的值**，這兩邊要完全對應。

### 步驟 4：部署成 Web App
1. 點右上角藍色的 **部署 → 新增部署作業**
2. 齒輪圖示旁邊選「類型」→ 選 **網頁應用程式**
3. 設定：
   - **執行身分**：我（你的帳號）
   - **具有存取權的使用者**：**任何人**（這一步很重要，一定要選「任何人」，不然朋友填表單會失敗）
4. 點「部署」
5. 第一次會跳出授權畫面，選你自己的帳號 → 可能會看到「Google 尚未驗證這個應用程式」的警告，這是正常的（因為是你自己寫的小工具），點 **進階 → 前往「你的專案名稱」（不安全）** → 允許
6. 部署完成後會給你一個網址，長得像：
   ```
   https://script.google.com/macros/s/AKfycb.......XXXX/exec
   ```
   **把這串網址複製起來**，等一下要貼到 `index.html`。

> ⚠️ 之後如果你有修改 `apps-script.gs` 的內容，記得要「管理部署作業 → 編輯 → 版本選新版本 → 部署」，單純存檔不會更新到已經部署的網址喔。

---

## Part 2：把網址貼回 index.html

1. 用記事本 / VSCode 或任何文字編輯器打開 `index.html`
2. 搜尋 `PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE`，會看到這一行：
   ```js
   var ENDPOINT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";
   ```
3. 把引號中間換成你剛剛拿到的網址，例如：
   ```js
   var ENDPOINT_URL = "https://script.google.com/macros/s/AKfycb.......XXXX/exec";
   ```
4. 再往下找到：
   ```js
   var SECRET_TOKEN = "aria27party";
   ```
   改成跟你在 `apps-script.gs` 裡設定的**一模一樣**的密語
5. 存檔

---

## Part 3：放上 GitHub Pages

### 步驟 1：申請 GitHub 帳號（如果還沒有）
到 [github.com](https://github.com) 註冊一個免費帳號。

### 步驟 2：建立新的 Repository
1. 登入後點右上角「+」→ **New repository**
2. Repository name 隨便取，例如 `aria-birthday-party`
3. 選 **Public**（免費版 GitHub Pages 必須是公開的）
4. 不用勾任何初始化選項，直接點 **Create repository**

### 步驟 3：上傳檔案
1. 在剛建立的空 repository 頁面，點 **uploading an existing file**（或 Add file → Upload files）
2. 把這個資料夾裡的東西**全部拖進去**：
   - `index.html`
   - 整個 `images` 資料夾（裡面有 `poster.png`、`background.png`、`map.jpg`、`qrcode-placeholder.png`）
   - `apps-script.gs`、`README.md` 放不放都可以，不影響網站運作
3. 下面填一下 commit message（隨便打，例如「first upload」），點 **Commit changes**

> 💡 拖曳資料夾時，GitHub 網頁版通常可以直接拖整個 `images` 資料夾進去，路徑會自動照資料夾結構建立，不用擔心。

### 步驟 4：開啟 GitHub Pages
1. 在 repository 頁面上方點 **Settings**
2. 左側選單找到 **Pages**
3. 在 「Build and deployment」→ Source 選 **Deploy from a branch**
4. Branch 選 **main**，資料夾選 **/(root)**，點 **Save**
5. 等大約 1 分鐘，重新整理這個頁面，會看到一行綠色文字：
   ```
   Your site is live at https://你的帳號.github.io/aria-birthday-party/
   ```
   這個網址就是你要分享給朋友的問卷連結！

---

## Part 4：換掉收款 QR code 圖片

目前 `images/qrcode-placeholder.png` 是一張暫時的提示圖。等你有正式的收款 QR code 圖片後：
1. 把新圖片命名成 **`qrcode-placeholder.png`**（檔名要一樣）
2. 到 GitHub repository 的 `images` 資料夾裡，點進原本的 `qrcode-placeholder.png`
3. 點右上角垃圾桶圖示刪除，再用 Upload files 把新圖上傳（檔名相同），或直接用「Add file → Upload files」上傳同名檔案覆蓋即可
4. 不用重新部署整個網站，幾秒後網頁就會顯示新圖

---

## Part 5：測試一次！

1. 打開你的 GitHub Pages 網址
2. 從頭到尾填一次（用你自己當測試資料）
3. 送出後，回去看 Google Sheet，確認有新增一列資料
4. 如果 Sheet 沒有新增資料，回頭檢查：
   - `index.html` 裡的 `ENDPOINT_URL` 有沒有貼對
   - `SECRET_TOKEN` 跟 Apps Script 裡的 `SECRET` 是否完全一樣（大小寫也要一致）
   - Apps Script 部署時「具有存取權的使用者」有沒有選「任何人」

確認沒問題後，就可以把連結私訊發給朋友囉 🎉

---

## 小提醒

- 網址跟程式碼因為放在公開的 GitHub repository，理論上任何人都看得到（包含你的 Apps Script 網址），但因為有密語驗證 + 蜜罐欄位 + 後端資料清洗，一般亂測試/機器人擋得住。
- 轉帳資訊那頁的銀行帳號是寫在公開網頁裡的，連結請盡量私訊分享，避免貼到公開社群。
- 如果之後想關閉問卷，把 Apps Script 的部署作業刪除，或把 `SECRET` 改掉但不同步更新 `index.html`，前端送出就會失敗，等於關閉收單。

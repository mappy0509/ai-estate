// content.js - DOM解析ロジック強化版 (自動応答対応)
console.log("AI-Prophet Content Script (v3) Loaded.");

// ページ内の情報を収集する関数
function scrapePageData() {
  // 1. 基本情報の取得
  const title = document.querySelector('.property-title')?.innerText || document.title;
  const address = document.querySelector('.address')?.innerText || "";
  const rent = document.querySelector('.rent')?.innerText || "0";
  const layout = document.querySelector('.layout')?.innerText || "";
  
  // 2. データの整形（カンマ削除や数値変換など）
  const cleanRent = parseInt(rent.replace(/,/g, ''), 10);

  // 3. データオブジェクトの作成
  const propertyData = {
    title: title,
    url: window.location.href,
    address: address,
    rent: cleanRent,
    layout: layout,
    scrapedAt: new Date().toISOString()
  };

  console.log("【解析完了】取得データ:", propertyData);
  return propertyData;
}

// 外部（background.jsやpopup.js）からの命令を待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_now") {
    const data = scrapePageData();
    sendResponse({ status: "success", data: data });
    
    // 取得したデータをそのままbackgroundへ転送（保存用）
    chrome.runtime.sendMessage({
      action: "scraped_data",
      data: data
    });
  }
});

// (開発用) ページを開いた瞬間に自動実行したい場合はコメントアウトを外す
// const autoData = scrapePageData();
// chrome.runtime.sendMessage({ action: "scraped_data", data: autoData });
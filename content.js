// content.js - マルチサイト対応版
console.log("AI-Prophet Content Script (Multi-Site) Loaded.");

// サイトごとの抽出ルール定義 (Strategy Pattern)
const SCRAPING_RULES = {
  // ITANDI BB (仮のセレクタ例)
  'www.itandi-bb.jp': {
    siteType: 'itandi',
    title: '.bukken-name',
    address: '.bukken-address',
    rent: '.bukken-rent',
    layout: '.bukken-layout'
  },
  // REINS (仮のセレクタ例)
  'system.reins.jp': {
    siteType: 'reins',
    title: '#lblBukkenName',
    address: '#lblShozaichi',
    rent: '#lblKakaku',
    layout: '#lblMadori'
  },
  // 開発用モックサイト (ローカルファイルや特定のテストドメイン)
  'default': {
    siteType: 'mock',
    title: '.property-title', // mock_site.htmlのクラス
    address: '.address',
    rent: '.rent',
    layout: '.layout'
  }
};

// 現在のドメインに合ったルールを取得
function getRule() {
  const hostname = window.location.hostname;
  // ドメインが定義されていればそれを、なければdefault(モック用)を使う
  return SCRAPING_RULES[hostname] || SCRAPING_RULES['default'];
}

function scrapePageData() {
  const rule = getRule();
  console.log(`【解析開始】適用ルール: ${rule.siteType} (Host: ${window.location.hostname})`);

  // ルールに基づいてDOMを取得
  const title = document.querySelector(rule.title)?.innerText || document.title;
  const address = document.querySelector(rule.address)?.innerText || "";
  const rentStr = document.querySelector(rule.rent)?.innerText || "0";
  const layout = document.querySelector(rule.layout)?.innerText || "";
  
  // データの整形
  const cleanRent = parseInt(rentStr.replace(/,/g, '').replace('万円', '0000'), 10);

  const propertyData = {
    title: title,
    url: window.location.href,
    address: address,
    rent: isNaN(cleanRent) ? 0 : cleanRent,
    layout: layout,
    siteType: rule.siteType, // 分析用に保存
    scrapedAt: new Date().toISOString()
  };

  console.log("【取得データ】", propertyData);
  return propertyData;
}

// メッセージ待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_now") {
    const data = scrapePageData();
    sendResponse({ status: "success", data: data });
    
    chrome.runtime.sendMessage({
      action: "scraped_data",
      data: data
    });
  }
});
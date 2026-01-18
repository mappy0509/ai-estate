// content.js - ドメイン判定修正版 (v2.2)
console.log("AI-Prophet Content Script (Domain Fixed) Loaded.");

/**
 * テキストから数値を抽出して日本円に変換するユーティリティ
 */
function parseJapanesePrice(text) {
  if (!text) return 0;
  const manMatch = text.match(/([0-9.]+)万円/);
  if (manMatch) {
    return Math.floor(parseFloat(manMatch[1]) * 10000);
  }
  const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

/**
 * 汎用ヘルパー: ラベル名から値を探す
 */
function findValueByLabel(labelText, parentSelector = 'body') {
  const rows = document.querySelectorAll(`${parentSelector} .DetailTable`);
  for (const row of rows) {
    const nameEl = row.querySelector('.ItemName');
    if (nameEl && nameEl.innerText.includes(labelText)) {
      const valueEl = row.querySelector('.ItemValue');
      return valueEl ? valueEl.innerText.trim() : "";
    }
  }
  return "";
}

/**
 * 設備リスト取得
 */
function getFacilities() {
  const facilities = [];
  const labelElements = document.querySelectorAll('.itandi-bb-ui__Grid');
  labelElements.forEach(labelEl => {
    const valueEl = labelEl.nextElementSibling;
    if (valueEl && valueEl.classList.contains('itandi-bb-ui__Flex')) {
      facilities.push(`${labelEl.innerText}: ${valueEl.innerText.replace(/\n/g, '')}`);
    }
  });
  const iconLabels = document.querySelectorAll('.css-pt9w62');
  iconLabels.forEach(el => {
    facilities.push(el.innerText);
  });
  return [...new Set(facilities)].join(' / ');
}

/**
 * 詳細費用取得
 */
function getCostDetails() {
  const costs = [];
  const rows = document.querySelectorAll('.DetailTable');
  const ignoreKeys = ['賃料', '所在地', '間取り', '築年数', '階建', '建物種別', '専有面積', '主要採光面', '構造'];
  
  rows.forEach(row => {
    const nameEl = row.querySelector('.ItemName');
    const valueEl = row.querySelector('.ItemValue');
    if (nameEl && valueEl) {
      const key = nameEl.innerText.trim();
      const val = valueEl.innerText.trim().replace(/\n/g, ' ');
      if (!ignoreKeys.some(k => key.includes(k)) && !val.includes('入力なし')) {
        costs.push(`${key}: ${val}`);
      }
    }
  });
  return costs.join('\n');
}

// ITANDI共通ロジック定義
const ITANDI_STRATEGY = {
  siteType: 'itandi',
  getTitle: () => document.querySelector('.BuildingName')?.innerText || document.title,
  getData: () => {
    const rentRaw = findValueByLabel('賃料'); 
    const rentVal = parseJapanesePrice(rentRaw.split('/')[0]);
    
    const feeRaw = findValueByLabel('管理費／共益費');
    const managementFee = parseJapanesePrice(feeRaw);

    const depositKeyMoneyRaw = findValueByLabel('敷礼保');
    let deposit = 0;
    const depositMatch = depositKeyMoneyRaw.match(/敷金:\s*([^/]+)/);
    if (depositMatch) deposit = parseJapanesePrice(depositMatch[1]);

    let keyMoney = 0;
    const keyMoneyMatch = depositKeyMoneyRaw.match(/礼金:\s*([^/]+)/);
    if (keyMoneyMatch) keyMoney = parseJapanesePrice(keyMoneyMatch[1]);

    return {
      address: findValueByLabel('所在地').replace('地図', '').replace(/\n/g, ' '),
      rent: rentVal,
      layout: findValueByLabel('間取り'),
      management_fee: managementFee,
      deposit: deposit,
      key_money: keyMoney,
      facilities: getFacilities(),
      cost_details: getCostDetails()
    };
  }
};

// サイトごとの抽出ルール (修正点: URLのパターンを網羅)
const SCRAPING_RULES = {
  'itandibb.com': ITANDI_STRATEGY,       // 今回のケース
  'www.itandibb.com': ITANDI_STRATEGY,   // wwwあり
  'www.itandi-bb.jp': ITANDI_STRATEGY,   // 旧ドメイン念のため
  
  'default': {
    siteType: 'mock',
    getTitle: () => document.querySelector('.property-title')?.innerText || document.title,
    getData: () => {
      return {
        address: document.querySelector('.address')?.innerText,
        rent: parseJapanesePrice(document.querySelector('.rent')?.innerText),
        layout: document.querySelector('.layout')?.innerText,
        facilities: "テスト設備",
        cost_details: "テスト費用"
      };
    }
  }
};

function getRule() {
  const hostname = window.location.hostname;
  // ドメイン完全一致がなければ default を返す
  return SCRAPING_RULES[hostname] || SCRAPING_RULES['default'];
}

function scrapePageData() {
  const rule = getRule();
  console.log(`【解析開始】適用ルール: ${rule.siteType} (Host: ${window.location.hostname})`);

  try {
    const title = rule.getTitle();
    const specificData = rule.getData();

    const propertyData = {
      title: title,
      url: window.location.href,
      address: specificData.address || "不明",
      rent: specificData.rent || 0,
      layout: specificData.layout || "不明",
      management_fee: specificData.management_fee || 0,
      deposit: specificData.deposit || 0,
      key_money: specificData.key_money || 0,
      facilities: specificData.facilities || "",
      cost_details: specificData.cost_details || "",
      siteType: rule.siteType,
      scrapedAt: new Date().toISOString()
    };

    console.log("【取得データ】", propertyData);
    return propertyData;

  } catch (e) {
    console.error("スクレイピングエラー:", e);
    return { title: "Error", error: e.toString() };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_now") {
    const tryScrape = (retryCount = 0) => {
      const data = scrapePageData();
      if ((!data.title || data.rent === 0) && retryCount < 5) {
        console.log(`データ未検出のためリトライ中... (${retryCount + 1}/5)`);
        setTimeout(() => tryScrape(retryCount + 1), 500);
      } else {
        chrome.runtime.sendMessage({ action: "scraped_data", data: data }, () => {
           sendResponse({ status: "success", data: data });
        });
      }
    };
    tryScrape();
    return true;
  }
});
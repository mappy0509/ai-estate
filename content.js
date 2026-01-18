// content.js - Robust Communication (v4.3)
console.log("AI-Prophet Content Script (v4.3) Loaded.");

// ==========================================
// 共通ユーティリティ (変更なし)
// ==========================================
function parseJapanesePrice(text) {
  if (!text) return 0;
  const manMatch = text.match(/([0-9.]+)万円/);
  if (manMatch) return Math.floor(parseFloat(manMatch[1]) * 10000);
  const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

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

// ==========================================
// 1. 詳細ページ解析ロジック (The Brain input)
// ==========================================
function getFacilities() {
  const facilities = [];
  document.querySelectorAll('.itandi-bb-ui__Grid').forEach(labelEl => {
    const valueEl = labelEl.nextElementSibling;
    if (valueEl?.classList.contains('itandi-bb-ui__Flex')) {
      facilities.push(`${labelEl.innerText}: ${valueEl.innerText.replace(/\n/g, '')}`);
    }
  });
  document.querySelectorAll('.css-pt9w62').forEach(el => facilities.push(el.innerText));
  return [...new Set(facilities)].join(' / ');
}

function getCostDetails() {
  const costs = [];
  const ignoreKeys = ['賃料', '所在地', '間取り', '築年数', '階建', '建物種別', '専有面積', '主要採光面', '構造'];
  document.querySelectorAll('.DetailTable').forEach(row => {
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

function scrapeDetailPage() {
  console.log("【解析モード】詳細ページ");
  try {
    const title = document.querySelector('.BuildingName')?.innerText || document.title;
    const rentRaw = findValueByLabel('賃料'); 
    const depositKeyMoneyRaw = findValueByLabel('敷礼保');
    
    let deposit = 0, keyMoney = 0;
    const depMatch = depositKeyMoneyRaw.match(/敷金:\s*([^/]+)/);
    if (depMatch) deposit = parseJapanesePrice(depMatch[1]);
    const keyMatch = depositKeyMoneyRaw.match(/礼金:\s*([^/]+)/);
    if (keyMatch) keyMoney = parseJapanesePrice(keyMatch[1]);

    return {
      success: true,
      data: {
        title: title,
        url: window.location.href,
        address: findValueByLabel('所在地').replace('地図', '').replace(/\n/g, ' '),
        rent: parseJapanesePrice(rentRaw.split('/')[0]),
        layout: findValueByLabel('間取り'),
        management_fee: parseJapanesePrice(findValueByLabel('管理費／共益費')),
        deposit: deposit,
        key_money: keyMoney,
        facilities: getFacilities(),
        cost_details: getCostDetails(),
        siteType: 'itandi',
        scrapedAt: new Date().toISOString()
      }
    };
  } catch (e) {
    console.error(e);
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// 2. 一覧ページ解析ロジック (The Legs + Pagination)
// ==========================================
async function scrapeListPageAndGoNext() {
  console.log("【解析モード】一覧リスト巡回開始");
  let hasNextPage = true;
  let allUrls = new Set();
  let pageCount = 1;

  while (hasNextPage) {
    console.log(`📄 Page ${pageCount} 解析中...`);

    const links = document.querySelectorAll('a[href^="/rent_rooms/"]');
    let newUrlsCount = 0;
    links.forEach(link => {
      if(link.href) {
        allUrls.add(link.href);
        newUrlsCount++;
      }
    });

    // 中間報告
    chrome.runtime.sendMessage({
        action: "crawling_urls",
        urls: Array.from(allUrls)
    });

    // 次へボタン処理
    const nextBtn = 
      document.querySelector('button[aria-label="Go to next page"]') || 
      document.querySelector('button[aria-label="next page"]') ||
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("次へ")) ||
      document.querySelector('.MuiPagination-ul li:last-child button');

    if (nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
      nextBtn.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
      pageCount++;
    } else {
      hasNextPage = false;
    }
  }

  return { success: true, count: allUrls.size };
}

// ==========================================
// メイン処理・分岐 (修正ポイント)
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_now") {
    
    const isDetailPage = /\/rent_rooms\/\d+/.test(window.location.pathname);

    if (isDetailPage) {
        // 【詳細ページ】
        // 即座にデータを取得して、sendResponseで返す（return true しない）
        const result = scrapeDetailPage();
        sendResponse({ type: 'detail', payload: result });
        // 同期的に返すので、ここで return true は不要
        return false; 

    } else {
        // 【一覧ページ】
        // 時間がかかるので Promise で処理し、return true する
        scrapeListPageAndGoNext().then(result => {
            sendResponse({ type: 'list_complete', payload: result });
        });
        return true; // 非同期応答の宣言
    }
  }
});
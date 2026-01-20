// ==================================================
// AI-Prophet Content Script
// Module: The Hand (Universal Pattern Matcher)
// Version: 7.0 (Client Delivery Grade)
// ==================================================

console.log("AI-Prophet Hand Module (v7.0 Universal) Loaded.");

// ==========================================
// ⚙️ 設定・定義 (Config)
// ==========================================
const CONFIG = {
  // 読み込み待機設定
  DEBOUNCE_MS: 3000,       // ページ描画待ち時間
  NEXT_PAGE_DELAY: 5000,   // ページ遷移後の待機時間

  // 1. 物件認識パターン (正規表現)
  // サイトが変わっても「家賃」や「間取り」の表記はほぼ共通であることを利用する
  PATTERNS: {
    // 価格: 数値 + "万円" または "円"
    PRICE: /([0-9,.]+) ?(万|円)/,
    // 間取り: 数値 + (R|K|D|L|S) の組み合わせ (例: 1LDK, 1R, 2DK)
    LAYOUT: /[0-9]+(R|K|D|L|S)+/,
    // 面積: 数値 + m2 or ㎡ (補完的要素)
    AREA: /([0-9,.]+) ?(㎡|m2|m\^2)/
  },

  // 2. 除外キーワード (ブラックリスト)
  // これが含まれるボタンやリンクは「詳細ページ」ではない
  IGNORE_LINKS: [
    "申込", "申請", "内見", "保証", "空室", "図面", "印刷", "登録", 
    "編集", "削除", "コピー", "お気に入り", "検討", "CSV", "PDF"
  ],

  // 3. 次へボタンの候補 (テキスト)
  NEXT_BTN_TEXT: ["次へ", "Next", "next", "＞", ">", "»", "次ページ"]
};

let scrapeTimeout = null;
let isAutoPaging = false; 

// ==========================================
// 🛠 ユーティリティ (Utility)
// ==========================================

// 要素からテキストを安全に取得
function safeGetText(el) {
  try {
    if (!el) return "";
    // visibilityがhiddenのものは無視するなどの高度な判定も可能だが、まずはテキスト取得
    const text = el.innerText || el.textContent || "";
    return typeof text === 'string' ? text.trim() : "";
  } catch (e) {
    return "";
  }
}

// ==========================================
// 🚶 ページネーション機能 (The Walker)
// ==========================================

function tryGoToNextPage() {
  console.log("🚶 AI-Prophet: 次のページを探しています...");
  
  try {
    // クリック可能な要素を広範囲に取得
    const candidates = document.querySelectorAll('a, button, li, span, div[role="button"], input[type="button"]');
    let nextBtn = null;
    let maxScore = 0;

    candidates.forEach(el => {
      const text = safeGetText(el);
      let score = 0;

      // テキスト一致判定
      if (CONFIG.NEXT_BTN_TEXT.includes(text)) score += 10;
      else if (CONFIG.NEXT_BTN_TEXT.some(k => text.includes(k) && text.length < 8)) score += 5;

      // aria-labelなどのアクセシビリティ属性もチェック (アイコンボタン対策)
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || "";
      if (CONFIG.NEXT_BTN_TEXT.some(k => label.includes(k))) score += 10;

      // クラス名に "next" が含まれていれば加点
      if (el.className && typeof el.className === 'string' && el.className.toLowerCase().includes('next')) {
        score += 3;
      }
      
      // 無効化(disabled)されていたら対象外
      if (el.hasAttribute('disabled') || el.classList.contains('disabled')) score = -1;

      if (score > maxScore) {
        maxScore = score;
        nextBtn = el;
      }
    });

    if (nextBtn && maxScore > 0) {
      console.log(`🚀 次へボタン特定: "${safeGetText(nextBtn) || 'Icon'}" (Score: ${maxScore})`);
      
      // 画面下部へスクロール
      window.scrollTo(0, document.body.scrollHeight);

      setTimeout(() => {
        isAutoPaging = true;
        nextBtn.click();
        
        // 遷移待ち
        setTimeout(() => { isAutoPaging = false; }, CONFIG.NEXT_PAGE_DELAY);
      }, 2000);
      
    } else {
      console.log("🏁 次のページは見つかりませんでした (最終ページ到達の可能性)。");
    }

  } catch (e) {
    console.error("Walker Error:", e);
  }
}

// ==========================================
// 🕵️ 汎用物件抽出ロジック (The Universal Scraper)
// ==========================================

function detectPropertyCards() {
  // アプローチ: 
  // 1. 画面内の「価格(万円)」を含む要素をすべて見つける
  // 2. その要素の親を遡り、同じ親の中に「間取り(LDK)」を含む要素があるか探す
  // 3. 両方含んでいれば、その親要素こそが「物件カード」であると認定する

  const allElements = document.body.getElementsByTagName('*');
  const potentialCards = new Set();
  
  // 探索負荷を下げるため、深すぎる要素やscriptタグなどは除外してもいいが、
  // 現代のPCなら全探索でも数ミリ秒で終わる
  
  for (const el of allElements) {
    // 子要素を持たない末端の要素(Text Nodeの親)を対象にする
    if (el.children.length === 0 && el.innerText) {
      if (CONFIG.PATTERNS.PRICE.test(el.innerText)) {
        // 価格を発見。親を遡って検証
        let parent = el.parentElement;
        // 5階層くらい遡って「カード」の範囲を探る
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          // すでに登録済みのカードの子孫ならスキップ
          if (potentialCards.has(parent)) break;

          // この親エリアの中に「間取り」があるか？
          if (CONFIG.PATTERNS.LAYOUT.test(parent.innerText)) {
             // 価格と間取りが同居している -> 物件カード認定！
             potentialCards.add(parent);
             break; // この価格要素についての探索は終了
          }
          parent = parent.parentElement;
        }
      }
    }
  }
  
  // Setから配列へ変換し、包含関係にある重複（親と子が両方登録された場合など）を整理
  // ここでは簡易的にそのままリスト化
  return Array.from(potentialCards);
}

function extractDetailUrl(card) {
  // カード内のリンクを全取得
  const links = Array.from(card.querySelectorAll('a'));
  if (links.length === 0) return null;

  let bestLink = null;
  let maxScore = -100;

  links.forEach(link => {
    const text = safeGetText(link);
    const href = link.href;
    let score = 0;

    // 1. 除外キーワードチェック (最優先)
    if (CONFIG.IGNORE_LINKS.some(ng => text.includes(ng))) {
      score = -999;
    } else {
      // 2. 加点要素
      // 「詳細」という文字そのもの
      if (text.includes("詳細")) score += 50;
      
      // 物件名っぽい（文字数が長く、数字だけではない）
      if (text.length > 5 && isNaN(parseInt(text))) score += 20;

      // 画像リンクの場合（imgタグを含むaタグ）は詳細へのリンク率が高い
      if (link.querySelector('img')) score += 10;
      
      // hrefが "#" や "javascript:" でない
      if (href && !href.includes("javascript") && !href.endsWith("#")) score += 5;
    }

    if (score > maxScore) {
      maxScore = score;
      bestLink = link;
    }
  });

  // スコアがマイナスのものしかなければリンクなしとする
  return (bestLink && maxScore > -100) ? bestLink.href : null;
}

function scrapePage() {
  if (isAutoPaging) return;

  console.log("🤖 AI-Prophet: 汎用パターン解析を開始...");
  
  const cards = detectPropertyCards();
  
  if (cards.length === 0) {
    console.log("⏳ 物件情報が見つかりません (描画待機中...)");
    return;
  }

  console.log(`🔍 候補エリアを ${cards.length} 件検出しました。解析します...`);

  const properties = [];

  cards.forEach((card, index) => {
    try {
      const text = safeGetText(card); // カード内の全テキスト
      
      // 正規表現でデータを抜き出す
      const priceMatch = text.match(CONFIG.PATTERNS.PRICE);
      const layoutMatch = text.match(CONFIG.PATTERNS.LAYOUT);
      
      const rawRent = priceMatch ? priceMatch[0] : "不明";
      const layout = layoutMatch ? layoutMatch[0] : "不明";
      
      // 物件名を推定 (カード内のテキストの冒頭部分や、一番目立つ文字)
      // 簡易的に先頭20文字を使用
      const buildingNameSnippet = text.substring(0, 20).replace(/\s/g, '').substring(0, 10);
      
      // 詳細URLを推論
      const detailUrl = extractDetailUrl(card);

      // 詳細URLが見つかったものだけを有効データとする
      if (detailUrl && detailUrl !== window.location.href) {
        properties.push({
          id: `prop-${index}-${buildingNameSnippet}`,
          buildingName: buildingNameSnippet,
          rawRent: rawRent,
          layout: layout,
          url: detailUrl,
          scrapedAt: new Date().toISOString()
        });
      }

    } catch (e) {
      console.error("Card Parse Error:", e);
    }
  });

  console.log(`✅ ${properties.length} 件の有効物件データを抽出完了。`);

  if (properties.length > 0) {
    // 1. URLリスト送信 (Backgroundへ)
    chrome.runtime.sendMessage({
      action: "crawling_urls",
      urls: properties.map(p => p.url)
    });
    
    // 2. データ保存 (Backgroundへ)
    chrome.runtime.sendMessage({
        action: "save_properties",
        data: properties
    });
    
    // 3. 次のページへ
    tryGoToNextPage();
  } else {
    // データが取れなくても次へ進むトライはする
    tryGoToNextPage();
  }
}

// ==========================================
// 👁 監視システム (Observer)
// ==========================================

const observer = new MutationObserver(() => {
  if (isAutoPaging) return;
  if (scrapeTimeout) clearTimeout(scrapeTimeout);
  scrapeTimeout = setTimeout(() => {
    scrapePage();
  }, CONFIG.DEBOUNCE_MS);
});

// body全体を監視対象にする
const targetNode = document.body;
if (targetNode) {
  observer.observe(targetNode, { childList: true, subtree: true });
}

// 初期起動
setTimeout(scrapePage, 3000);
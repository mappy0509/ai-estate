// background.js - データを保存する脳みそ
console.log("AI-Prophet Background Service Started.");

// メッセージを受け取るリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scraped_data") {
    const data = request.data;
    console.log("【データ受信】", data.title);

    // 1. 既存のデータを取得
    chrome.storage.local.get(['properties'], (result) => {
      const properties = result.properties || [];
      
      // 2. 新しいデータを追加（重複チェックは簡易的にURLで）
      const isDuplicate = properties.some(p => p.url === data.url);
      if (!isDuplicate) {
        properties.unshift(data); // 先頭に追加
        
        // 3. 保存（最大50件までにしておく）
        const newProperties = properties.slice(0, 50);
        chrome.storage.local.set({ properties: newProperties }, () => {
          console.log("データ保存完了。現在の件数:", newProperties.length);
        });
      }
    });

    sendResponse({ status: "success", msg: "保存しました" });
  }
});
// 画面が開かれたら、保存済みデータを表示する
document.addEventListener('DOMContentLoaded', loadList);

// ボタンが押されたら解析実行
document.getElementById('checkNow').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    // 変更点: content.js に "scrape_now" メッセージを送る
    chrome.tabs.sendMessage(tabs[0].id, { action: "scrape_now" }, (response) => {
      if (chrome.runtime.lastError) {
        // content.js が読み込まれていない場合のエラーハンドリング
        console.log("スクリプト注入中...", chrome.runtime.lastError.message);
        // 初回ロード時などで content.js がない場合は注入してから実行
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          files: ['content.js']
        }, () => {
          // 注入後にもう一度メッセージ送信
          setTimeout(() => {
             chrome.tabs.sendMessage(tabs[0].id, { action: "scrape_now" });
          }, 100);
        });
      } else {
        console.log("メッセージ送信成功:", response);
      }
      
      // リスト更新の待機時間を少し短縮
      setTimeout(loadList, 800);
    });
  });
});

// 保存されたデータをリスト表示する関数
function loadList() {
  chrome.storage.local.get(['history'], (result) => {
    const list = document.getElementById('list');
    const history = result.history || [];

    if (history.length === 0) {
      list.innerHTML = '<div class="empty-msg">データはまだありません</div>';
      return;
    }

    // リストを生成
    let html = '';
    history.forEach(item => {
      // 表示用の項目を少し調整
      const price = item.rent ? item.rent : '(価格未取得)';
      html += `
        <div class="item">
          <span class="item-title">${item.title}</span>
          <div class="item-url">${price} - <a href="${item.url}" target="_blank">Link</a></div>
        </div>
      `;
    });
    list.innerHTML = html;
  });
}
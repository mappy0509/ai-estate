// 画面が開かれたら、保存済みデータを表示する
document.addEventListener('DOMContentLoaded', loadList);

// ボタンが押されたら解析実行
document.getElementById('checkNow').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      files: ['content.js']
    }, () => {
      // 少し待ってからリストを再読み込み（データ保存の時間稼ぎ）
      setTimeout(loadList, 500);
    });
  });
});

// 保存されたデータをリスト表示する関数
function loadList() {
  chrome.storage.local.get(['properties'], (result) => {
    const list = document.getElementById('list');
    const properties = result.properties || [];

    if (properties.length === 0) {
      list.innerHTML = '<div class="empty-msg">データはまだありません</div>';
      return;
    }

    // リストを生成
    let html = '';
    properties.forEach(p => {
      html += `
        <div class="item">
          <span class="item-title">${p.title}</span>
          <div class="item-url">${p.url}</div>
        </div>
      `;
    });
    list.innerHTML = html;
  });
}
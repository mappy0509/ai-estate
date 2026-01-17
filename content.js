// content.js - ページに注入されてデータを吸い上げる
console.log("AI-Prophet Content Script Loaded.");

// ページが読み込まれたら即座に実行（本来は特定のドメインだけで動かす）
const pageData = {
  title: document.title,
  url: window.location.href,
  htmlLength: document.body.innerHTML.length,
  // 将来的にはここで「価格」「住所」などをDOMから引っこ抜く
};

// バックグラウンド（background.js）にデータを投げる
chrome.runtime.sendMessage({
  action: "scraped_data",
  data: pageData
}, (response) => {
  console.log("バックグラウンドからの応答:", response);
});
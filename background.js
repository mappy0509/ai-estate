// background.js - 自動巡回・安定化対応版 (v1.5)

try {
  // 1. ライブラリの読み込み
  importScripts('./libs/firebase-app-compat.js');
  importScripts('./libs/firebase-firestore-compat.js');

  console.log("AI-Prophet Background Service (Auto-Pilot V2) Starting...");

  const CURRENT_COMPANY_ID = "demo-company-001";
  const ALARM_NAME = "property_patrol";
  const PATROL_INTERVAL_MIN = 1;

  const firebaseConfig = {
    apiKey: "AIzaSyA51vTIKJSVEw2X6qRAVX2iWATTCAyybEU",
    authDomain: "ai-prophet.firebaseapp.com",
    projectId: "ai-prophet",
    storageBucket: "ai-prophet.firebasestorage.app",
    messagingSenderId: "601103845030",
    appId: "1:601103845030:web:4232cd179b6a81bb129667"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();

  // アラーム設定
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: PATROL_INTERVAL_MIN });
    console.log("アラームをセットしました。1分後に巡回を開始します。");
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      console.log(`⏰ 定期巡回スタート: ${new Date().toLocaleTimeString()}`);
      startPatrol();
    }
  });

  // 巡回実行メインロジック
  async function startPatrol() {
    const targetUrl = chrome.runtime.getURL('mock_site.html'); 
    
    // タブを作成
    chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
      // 読み込み完了まで待つリスナー
      const listener = async (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          
          console.log("ページ読込完了。解析スクリプトを注入します...");

          try {
            // 【重要】Content Scriptが読み込まれていない可能性を考慮し、手動で注入
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['content.js']
            });

            // 1秒待機してメッセージを送信
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: "scrape_now" }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn("メッセージ送信に失敗（無視して閉じます）:", chrome.runtime.lastError.message);
                  chrome.tabs.remove(tabId);
                  return;
                }
                
                console.log("解析成功:", response);

                // 保存が終わるまで少し長めに待ってから閉じる（証拠隠滅）
                setTimeout(() => {
                  chrome.tabs.remove(tabId);
                  console.log("パトロール完了。");
                }, 3000);
              });
            }, 1000);

          } catch (err) {
            console.error("スクリプト注入失敗:", err);
            chrome.tabs.remove(tabId);
          }
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // データ受信・保存
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scraped_data") {
      const data = request.data;
      console.log("【データ受信】Firestoreへ保存します:", data.title);

      const saveToFirebase = async () => {
        try {
          const docRef = await db.collection("properties").add({
            companyId: CURRENT_COMPANY_ID,
            title: data.title,
            url: data.url,
            address: data.address || "不明",
            rent: data.rent || 0,
            layout: data.layout || "不明",
            siteType: data.siteType || "unknown",
            scrapedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isAutoPatrol: true,
            status: "new"
          });
          console.log("【成功】Firestore保存完了 ID:", docRef.id);
          
          chrome.storage.local.get(['history'], (result) => {
            const history = result.history || [];
            history.unshift({ 
              title: `[AUTO] ${data.title}`,
              rent: data.rent ? `¥${data.rent.toLocaleString()}` : '', 
              id: docRef.id 
            });
            chrome.storage.local.set({ history: history.slice(0, 20) });
          });
        } catch (e) {
          console.error("【失敗】Firestore保存エラー:", e);
        }
      };

      saveToFirebase();
      sendResponse({ status: "processing" });
      return true;
    }
  });

} catch (e) {
  console.error("Critical Error in Background:", e);
}
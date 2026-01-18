// background.js - データ項目の追加対応
importScripts('./libs/firebase-app-compat.js');
importScripts('./libs/firebase-firestore-compat.js');

console.log("AI-Prophet Background Service (Compat Mode) Starting...");

const firebaseConfig = {
  apiKey: "AIzaSyA51vTIKJSVEw2X6qRAVX2iWATTCAyybEU",
  authDomain: "ai-prophet.firebaseapp.com",
  projectId: "ai-prophet",
  storageBucket: "ai-prophet.firebasestorage.app",
  messagingSenderId: "601103845030",
  appId: "1:601103845030:web:4232cd179b6a81bb129667"
};

let db;
try {
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.firestore();
  console.log("Firestore Ready.");
} catch (e) {
  console.error(e);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scraped_data") {
    const data = request.data;
    console.log("【データ受信】詳細データ:", data);

    if (!db) {
      sendResponse({ status: "error", msg: "DB未接続" });
      return true;
    }

    const saveToFirebase = async () => {
      try {
        // 保存する項目を増やしました
        const docRef = await db.collection("properties").add({
          title: data.title,
          url: data.url,
          address: data.address || "不明",
          rent: data.rent || 0,
          layout: data.layout || "不明",
          scrapedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: "new"
        });
        
        console.log("【送信成功】Document ID: ", docRef.id);
        
        // ローカル履歴も更新
        chrome.storage.local.get(['history'], (result) => {
          const history = result.history || [];
          // 表示用に少しリッチな情報を保存
          history.unshift({ 
            title: data.title, 
            rent: data.rent ? `¥${data.rent.toLocaleString()}` : '', 
            id: docRef.id 
          });
          chrome.storage.local.set({ history: history.slice(0, 20) });
        });

      } catch (e) {
        console.error("【送信エラー】", e);
      }
    };

    saveToFirebase();
    sendResponse({ status: "processing" });
    return true;
  }
});
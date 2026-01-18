// background.js - マルチテナント対応版
importScripts('./libs/firebase-app-compat.js');
importScripts('./libs/firebase-firestore-compat.js');

console.log("AI-Prophet Background Service (Compat Mode) Starting...");

// 開発用の仮の会社ID（本番ではログインユーザー情報から取得します）
const CURRENT_COMPANY_ID = "demo-company-001";

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
    console.log("【データ受信】保存処理開始:", data.title);

    if (!db) {
      sendResponse({ status: "error", msg: "DB未接続" });
      return true;
    }

    const saveToFirebase = async () => {
      try {
        // マルチテナント対応: companyId を付与して保存
        const docRef = await db.collection("properties").add({
          companyId: CURRENT_COMPANY_ID, // 👈 ここが重要！
          title: data.title,
          url: data.url,
          address: data.address || "不明",
          rent: data.rent || 0,
          layout: data.layout || "不明",
          siteType: data.siteType || "unknown", // どこのサイトから来たかも記録
          scrapedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: "new"
        });
        
        console.log("【送信成功】Document ID: ", docRef.id);
        
        chrome.storage.local.get(['history'], (result) => {
          const history = result.history || [];
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
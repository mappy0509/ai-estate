// background.js - Firebase連携版 (Compatモード)
// 【重要】manifest.json から "type": "module" を削除してください。
// 【重要】libsフォルダには -compat.js 版のファイルを保存してください。

// 1. ライブラリの読み込み (Compat版を使用) - 必ずファイルの先頭に記述
// ※ファイル名が正しいか確認してください（保存時に (1) などが付いていないか）
importScripts('./libs/firebase-app-compat.js');
importScripts('./libs/firebase-firestore-compat.js');

console.log("AI-Prophet Background Service (Compat Mode) Starting...");

// 2. Firebase設定
// あなたのプロジェクト「ai-prophet」の設定を反映しました
const firebaseConfig = {
  apiKey: "AIzaSyA51vTIKJSVEw2X6qRAVX2iWATTCAyybEU",
  authDomain: "ai-prophet.firebaseapp.com",
  projectId: "ai-prophet",
  storageBucket: "ai-prophet.firebasestorage.app",
  messagingSenderId: "601103845030",
  appId: "1:601103845030:web:4232cd179b6a81bb129667"
};

// 3. 初期化
let db;
try {
  // 二重初期化を防ぐチェック
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase App Initialized.");
  } else {
    console.log("Firebase App Already Initialized.");
  }
  
  db = firebase.firestore();
  console.log("Firestore Database Connection Ready.");

} catch (e) {
  console.error("【Firebase初期化エラー】設定値やライブラリ読み込みを確認してください:", e);
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scraped_data") {
    const data = request.data;
    console.log("【データ受信】Firebaseへ送信処理開始:", data.title);

    // DBが初期化できていない場合は中断
    if (!db) {
      console.error("【送信中断】データベースが初期化されていません。");
      sendResponse({ status: "error", msg: "DB未接続エラー" });
      return true;
    }

    // 保存処理 (非同期)
    const saveToFirebase = async () => {
      try {
        console.log("Firestoreへの書き込みを試行します...");
        
        // properties コレクションに追加
        const docRef = await db.collection("properties").add({
          title: data.title,
          url: data.url,
          scrapedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: "new"
        });
        
        console.log("【送信成功！】Document ID: ", docRef.id);
        
        // 履歴保存 (ローカル)
        chrome.storage.local.get(['history'], (result) => {
          const history = result.history || [];
          history.unshift({ title: data.title, url: data.url, id: docRef.id });
          chrome.storage.local.set({ history: history.slice(0, 20) });
        });

      } catch (e) {
        console.error("【送信失敗】詳細なエラー内容:", e);
        // よくあるエラー: 権限不足 (Permission Denied)
        if (e.code === 'permission-denied') {
           console.error("★ヒント: Firestoreのセキュリティルールで書き込みが許可されていない可能性があります。「テストモード」になっているか確認してください。");
        }
      }
    };

    saveToFirebase();
    sendResponse({ status: "processing", msg: "クラウドへ送信中..." });
    return true; // 非同期レスポンスのために必要
  }
});
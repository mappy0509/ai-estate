// ==================================================
// AI-Prophet Background Service
// Module: The Brain (Orchestrator & AI)
// Version: 5.1 (Fixed State Management)
// ==================================================

try {
  importScripts('./libs/firebase-app-compat.js');
  importScripts('./libs/firebase-firestore-compat.js');

  console.log("🧠 AI-Prophet Brain Module (v5.1) Starting...");

  // --- Configuration ---
  const CONFIG = {
    GEMINI_API_KEY: "AIzaSyBART7by64Wb_xzBW2kedthhtPaVCCrNCo", 
    GEMINI_MODEL: "gemini-1.5-flash",
    COMPANY_ID: "demo-company-001",
    PATROL_WAIT_MS: 3000
  };

  // --- Firebase Init ---
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

  // --- State Management ---
  let activePatrolTabId = null;
  // メモリ内の変数だけでなく、Storageでも状態を管理してPopupと同期する

  // ==========================================
  // 📨 メッセージハンドリング (Event Hub)
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      try {
        switch (request.action) {
          case "save_properties":
            console.log(`📥 受信: ${request.data.length}件の物件データ`);
            await handleIncomingProperties(request.data, sender.tab?.id);
            sendResponse({ status: "success" });
            break;

          case "crawling_urls":
            await handleNewUrls(request.urls);
            sendResponse({ status: "queued" });
            break;

          case "start_patrol":
            console.log("▶ パトロール開始指示を受信");
            await startPatrol();
            sendResponse({ status: "started" });
            break;
            
          case "stop_patrol":
             console.log("⏹ パトロール停止指示を受信");
             await stopPatrol();
             sendResponse({ status: "stopped" });
             break;

          default:
            console.log("Unknown action:", request.action);
        }
      } catch (e) {
        console.error("Message Handler Error:", e);
        sendResponse({ status: "error", error: e.toString() });
      }
    })();
    return true; 
  });

  // ==========================================
  // 🧠 コア・ロジック (The Brain)
  // ==========================================

  async function handleIncomingProperties(properties, senderTabId) {
    if (!properties || properties.length === 0) return;

    // 並列処理で保存＆AI生成
    const promises = properties.map(async (property) => {
      try {
        const docId = `${CONFIG.COMPANY_ID}_${property.id || btoa(encodeURIComponent(property.buildingName + property.roomNo))}`;
        const docRef = db.collection("properties").doc(docId);
        
        const snapshot = await docRef.get();
        const isNew = !snapshot.exists;

        const baseData = {
          ...property,
          companyId: CONFIG.COMPANY_ID,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          status: isNew ? "analyzing" : "updated"
        };
        
        await docRef.set(baseData, { merge: true });

        if (isNew) {
            const aiProposal = await generateProposalWithGemini(property);
            await docRef.update({
                ai_proposal: aiProposal,
                status: "ready",
                aiGeneratedAt: new Date().toISOString()
            });
        }
      } catch (e) {
        console.error("Save/AI Error:", e);
      }
    });

    await Promise.all(promises);
    console.log("✅ データ処理完了");

    // 現在パトロール中かどうかStorageを確認して判断
    const { isPatrolling } = await chrome.storage.local.get('isPatrolling');
    if (isPatrolling && senderTabId === activePatrolTabId) {
      finishTaskAndNext(senderTabId);
    }
  }

  async function generateProposalWithGemini(property) {
    if (!CONFIG.GEMINI_API_KEY) return "APIキー未設定";

    const prompt = `
      あなたはプロの不動産エージェントです。
      以下の物件情報をもとに、顧客に送る紹介文を作成してください。
      条件: 親しみやすい、200文字程度、絵文字あり。
      
      物件名: ${property.buildingName}
      賃料: ${property.rawRent}
      間取り: ${property.layout}
      住所: ${property.address}
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI生成失敗";
    } catch (error) {
      return `通信エラー: ${error.message}`;
    }
  }

  // ==========================================
  // 🚓 パトロール制御 (Control Logic)
  // ==========================================

  async function handleNewUrls(newUrls) {
    const { patrolQueue } = await chrome.storage.local.get('patrolQueue');
    const currentQueue = patrolQueue || [];
    const queueSet = new Set(currentQueue);
    const uniqueUrls = newUrls.filter(url => !queueSet.has(url));

    if (uniqueUrls.length > 0) {
      const updatedQueue = [...currentQueue, ...uniqueUrls];
      await chrome.storage.local.set({ patrolQueue: updatedQueue });
      console.log(`📦 キュー追加: ${uniqueUrls.length}件`);
      
      // 自動で開始したい場合はここで startPatrol() を呼ぶが、
      // ユーザー制御を優先するため今回は呼ばない（または設定による）
    }
  }

  async function startPatrol() {
    // 状態をONに更新
    await chrome.storage.local.set({ isPatrolling: true });
    processNextUrl();
  }

  async function stopPatrol() {
    await chrome.storage.local.set({ isPatrolling: false });
    activePatrolTabId = null;
  }

  async function processNextUrl() {
    // 実行許可が出ているか確認
    const { isPatrolling, patrolQueue } = await chrome.storage.local.get(['isPatrolling', 'patrolQueue']);
    
    if (!isPatrolling) {
        console.log("⏸ パトロール停止中");
        return;
    }

    if (!patrolQueue || patrolQueue.length === 0) {
      console.log("🎉 パトロール完了: キューが空です。");
      await chrome.storage.local.set({ isPatrolling: false });
      activePatrolTabId = null;
      return;
    }

    const nextUrl = patrolQueue[0];
    console.log(`🚀 次のURLへ: ${nextUrl}`);

    chrome.tabs.create({ url: nextUrl, active: false }, (tab) => {
      activePatrolTabId = tab.id;
      
      // タイムアウト監視 (20秒で強制次へ)
      setTimeout(async () => {
        // まだ同じタブIDがアクティブなら
        if (activePatrolTabId === tab.id) {
           // 再度現在の状態を確認（停止ボタンが押されたかもしれないので）
           const { isPatrolling: currentStatus } = await chrome.storage.local.get('isPatrolling');
           if (currentStatus) {
               console.warn("⚠️ タイムアウト: 応答なし。スキップします。");
               finishTaskAndNext(tab.id);
           }
        }
      }, 20000); 
    });
  }

  async function finishTaskAndNext(tabId) {
    try { if (tabId) await chrome.tabs.remove(tabId); } catch (e) {}

    const { patrolQueue } = await chrome.storage.local.get('patrolQueue');
    if (patrolQueue && patrolQueue.length > 0) {
        const newQueue = patrolQueue.slice(1);
        await chrome.storage.local.set({ patrolQueue: newQueue });
    }

    activePatrolTabId = null;

    setTimeout(() => {
      processNextUrl();
    }, CONFIG.PATROL_WAIT_MS); 
  }

} catch (e) {
  console.error("Critical Brain Error:", e);
}
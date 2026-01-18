// background.js - Robust Auto Patrol (v4.3)

try {
  importScripts('./libs/firebase-app-compat.js');
  importScripts('./libs/firebase-firestore-compat.js');

  console.log("AI-Prophet Background Service (v4.3) Starting...");

  const GEMINI_API_KEY = "AIzaSyBART7by64Wb_xzBW2kedthhtPaVCCrNCo"; 
  const CURRENT_COMPANY_ID = "demo-company-001";

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

  // ==========================================
  // 🔄 巡回キュー管理システム
  // ==========================================
  let isProcessingQueue = false;

  async function processNextUrl() {
    const { patrolQueue } = await chrome.storage.local.get('patrolQueue');
    
    if (!patrolQueue || patrolQueue.length === 0) {
      console.log("🎉 巡回完了: 全てのURLを処理しました。");
      isProcessingQueue = false;
      return;
    }

    isProcessingQueue = true;
    const nextUrl = patrolQueue[0];
    console.log(`🚀 次の巡回先へ移動中... (残り${patrolQueue.length}件):`, nextUrl);

    chrome.tabs.create({ url: nextUrl, active: false }, (tab) => {
      const listener = async (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          console.log("ページロード完了。解析開始...");
          
          // SPA描画待ち
          setTimeout(() => {
              // ★修正点: コールバックでデータを直接受け取る
              chrome.tabs.sendMessage(tabId, { action: "scrape_now" }, async (response) => {
                
                // エラーチェック
                if (chrome.runtime.lastError) {
                    console.warn("解析失敗(通信エラー):", chrome.runtime.lastError.message);
                    finishTaskAndNext(tabId, patrolQueue);
                    return;
                }

                if (!response) {
                    console.warn("解析失敗(応答なし)");
                    finishTaskAndNext(tabId, patrolQueue);
                    return;
                }

                // 詳細ページのデータ受信処理
                if (response.type === 'detail' && response.payload && response.payload.success) {
                    const data = response.payload.data;
                    console.log("✅ データ取得成功:", data.title);
                    
                    // DB保存 & AI生成処理
                    await saveAndGenerateAI(data);
                    
                    // 処理が終わったらタブを閉じて次へ
                    finishTaskAndNext(tabId, patrolQueue);

                } else if (response.type === 'list_complete') {
                    // 一覧完了（通常ここには来ないが念のため）
                    finishTaskAndNext(tabId, patrolQueue);
                } else {
                    console.warn("解析失敗(データ不正):", response);
                    finishTaskAndNext(tabId, patrolQueue);
                }
              });
          }, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // データ保存 & AI生成の分離関数
  async function saveAndGenerateAI(data) {
    try {
        const docRef = await db.collection("properties").add({
            companyId: CURRENT_COMPANY_ID,
            ...data,
            status: "analyzing"
        });

        // Gemini呼び出し
        const proposalText = await generateProposalWithGemini(data);
        
        await docRef.update({
            ai_proposal: proposalText,
            status: "ready"
        });
        console.log("✨ AI生成完了・保存済み");
    } catch(e) {
        console.error("保存プロセスエラー:", e);
    }
  }

  async function finishTaskAndNext(tabId, currentQueue) {
    try { await chrome.tabs.remove(tabId); } catch(e){}

    const newQueue = currentQueue.slice(1);
    await chrome.storage.local.set({ patrolQueue: newQueue });

    setTimeout(() => {
        processNextUrl();
    }, 3000); 
  }

  // ==========================================
  // AI生成ロジック
  // ==========================================
  async function generateProposalWithGemini(propertyData) {
    if (!GEMINI_API_KEY) return "APIキー未設定";
    const modelName = "gemini-2.5-flash"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `
      あなたはプロの不動産エージェントです。以下の物件データをもとに、顧客（LINEユーザー）に送る魅力的な提案メッセージを作成してください。
      【条件】
      - ターゲット: ${propertyData.layout} から想定される層
      - 文体: 親しみやすく、信頼感のある口調（絵文字あり）
      - 文字数: 400文字程度
      - 禁止事項: アスタリスク（*）やマークダウン記法は使用禁止。
      【物件データ】
      物件名: ${propertyData.title}
      家賃: ${propertyData.rent}円
      間取り: ${propertyData.layout}
      住所: ${propertyData.address}
      設備一覧: ${propertyData.facilities}
      費用詳細: ${propertyData.cost_details}
    `;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "生成失敗";
    } catch (error) {
      return `通信エラー: ${error.toString()}`;
    }
  }

  // ==========================================
  // メッセージ受信 (一覧ページからのURL受信のみ担当)
  // ==========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 一覧ページからURLリストが送られてきた時
    if (request.action === "crawling_urls") {
      const newUrls = request.urls;
      
      chrome.storage.local.get(['patrolQueue'], (result) => {
        const currentQueue = result.patrolQueue || [];
        const queueSet = new Set(currentQueue);
        const uniqueUrls = newUrls.filter(url => !queueSet.has(url));

        if (uniqueUrls.length > 0) {
          console.log(`📦 新規追加: ${uniqueUrls.length}件`);
          const updatedQueue = [...currentQueue, ...uniqueUrls];
          
          chrome.storage.local.set({ patrolQueue: updatedQueue }, () => {
            if (!isProcessingQueue) {
                processNextUrl(); // 処理開始
            }
          });
        }
      });
      // 一覧ページへの応答
      sendResponse({ status: "received" });
    }
    return true;
  });

} catch (e) {
  console.error("Critical Error:", e);
}
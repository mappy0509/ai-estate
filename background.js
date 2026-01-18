// background.js - Natural Text Style (v3.5)

try {
  // 1. ライブラリの読み込み
  importScripts('./libs/firebase-app-compat.js');
  importScripts('./libs/firebase-firestore-compat.js');

  console.log("AI-Prophet Background Service (Natural Text) Starting...");

  // ==========================================
  // 🔑 Gemini APIキー
  const GEMINI_API_KEY = "AIzaSyBART7by64Wb_xzBW2kedthhtPaVCCrNCo"; 
  // ==========================================

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
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      console.log(`⏰ 定期巡回スタート: ${new Date().toLocaleTimeString()}`);
      startPatrol();
    }
  });

  // 巡回実行メインロジック
  async function startPatrol() {
    // ※テスト時は mock_site.html または targetUrl を適宜変更してください
    const targetUrl = chrome.runtime.getURL('mock_site.html'); 
    
    chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
      const listener = async (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          console.log("ページ読込完了。解析リクエストを送信します...");

          const sendMessageWithRetry = (retries = 5) => {
            chrome.tabs.sendMessage(tabId, { action: "scrape_now" }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn(`送信失敗 (残り試行: ${retries}):`, chrome.runtime.lastError.message);
                if (retries > 0) {
                  setTimeout(() => sendMessageWithRetry(retries - 1), 1000);
                } else {
                  console.error("解析タイムアウト。タブを閉じます。");
                  chrome.tabs.remove(tabId);
                }
                return;
              }
              console.log("解析成功・応答あり。AI生成を待ちます...");
              
              // AI生成完了まで長めに待つ
              setTimeout(() => {
                chrome.tabs.remove(tabId);
                console.log("パトロール完了。タブを閉じました。");
              }, 15000);
            });
          };
          setTimeout(() => sendMessageWithRetry(5), 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // Gemini APIを叩く関数 (自然な文章版)
  async function generateProposalWithGemini(propertyData) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR_GEMINI_API_KEY")) {
      return "【設定エラー】APIキーがコードに設定されていません。";
    }

    const modelName = "gemini-2.5-flash"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    
    // プロンプト修正: アスタリスク禁止を追加
    const prompt = `
      あなたはプロの不動産エージェントです。以下の物件データをもとに、顧客（LINEユーザー）に送る魅力的な提案メッセージを作成してください。
      
      【条件】
      - ターゲット: ${propertyData.layout} という間取りから想定される層に響く内容。
      - 文体: 親しみやすく、信頼感のある口調（絵文字あり）。
      - 構成: 見出し、推しポイント、注意点フォロー、内見誘導。
      - 文字数: 400文字程度。
      - 【重要】禁止事項: アスタリスク（*）やマークダウン記法（**強調**など）は絶対に使わないでください。記号は絵文字や「！」、「・」などを使用し、人間がLINEで打つような自然なテキストにしてください。
      
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
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Gemini API Error Detail:", data);
        const errorCode = data.error?.code || response.status;
        const errorMsg = data.error?.message || response.statusText;
        return `【AIエラー】Code:${errorCode} - ${errorMsg}`;
      }

      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return generatedText || "【生成失敗】AIからの応答が空でした。";

    } catch (error) {
      console.error("Network Error:", error);
      return `【通信エラー】${error.toString()}`;
    }
  }

  // データ受信・保存・AI生成
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scraped_data") {
      const data = request.data;
      console.log("【データ受信】保存＆AI生成プロセス開始:", data.title);

      const processData = async () => {
        try {
          const docRef = await db.collection("properties").add({
            companyId: CURRENT_COMPANY_ID,
            title: data.title,
            url: data.url,
            address: data.address || "不明",
            rent: data.rent || 0,
            layout: data.layout || "不明",
            management_fee: data.management_fee || 0,
            deposit: data.deposit || 0,
            key_money: data.key_money || 0,
            facilities: data.facilities || "",
            cost_details: data.cost_details || "",
            siteType: data.siteType || "unknown",
            scrapedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isAutoPatrol: true,
            status: "analyzing"
          });
          
          console.log("【保存完了】ID:", docRef.id);

          console.log("🤖 Gemini AI思考中...");
          const proposalText = await generateProposalWithGemini(data);
          
          if (proposalText.startsWith("【")) {
              console.error("AI生成プロセス異常:", proposalText);
          } else {
              console.log("✨ 提案文生成完了");
          }

          await docRef.update({
            ai_proposal: proposalText,
            status: proposalText.startsWith("【") ? "error" : "ready"
          });

          chrome.storage.local.get(['history'], (result) => {
            const history = result.history || [];
            history.unshift({ 
              title: `[AI処理済] ${data.title}`,
              rent: data.rent ? `¥${data.rent.toLocaleString()}` : '', 
              id: docRef.id 
            });
            chrome.storage.local.set({ history: history.slice(0, 20) });
          });

        } catch (e) {
          console.error("【失敗】処理エラー:", e);
        }
      };

      processData();
      sendResponse({ status: "processing" });
      return true;
    }
  });

} catch (e) {
  console.error("Critical Error in Background:", e);
}
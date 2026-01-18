// popup.js - Cost Saving Mode (v5.0)

// 1. Firebase初期化
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

// UI要素
const listEl = document.getElementById('property-list');
const detailView = document.getElementById('detail-view');
const proposalTextEl = document.getElementById('proposal-text');
const closeBtn = document.getElementById('close-detail');
const actionBtn = document.getElementById('action-btn'); // ボタンを汎用化
const manualBtn = document.getElementById('manual-patrol-btn');

// 【エラー修正】日付フォーマット用（安全版）
const formatDate = (timestamp) => {
  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return '日時不明'; // データがない、または変換できない場合は安全な文字列を返す
  }
  try {
    const d = timestamp.toDate();
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch (e) {
    return '日時不明';
  }
};

// 2. Firestoreからデータをリアルタイム取得
function loadProperties() {
  db.collection("properties")
    .orderBy("scrapedAt", "desc")
    .limit(20)
    .onSnapshot((snapshot) => {
      listEl.innerHTML = ''; 

      if (snapshot.empty) {
        listEl.innerHTML = '<div class="empty-state">データがありません。<br>巡回を実行してください。</div>';
        return;
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const docId = doc.id; // IDも取得しておく
        
        const li = document.createElement('li');
        li.className = 'property-item';
        
        // ステータス表示ロジック変更
        let statusBadge = '';
        if (data.status === 'analyzing') {
          statusBadge = '<span class="status-badge status-analyzing">AI作成中...</span>';
        } else if (data.status === 'ready') {
          statusBadge = '<span class="status-badge status-ready">AI完了 ✨</span>';
        } else if (data.status === 'fetched') {
          statusBadge = '<span class="status-badge" style="background:#999">未作成</span>';
        } else if (data.status === 'error') {
          statusBadge = '<span class="status-badge status-error">エラー</span>';
        }

        const rent = data.rent ? `¥${data.rent.toLocaleString()}` : '価格不明';

        li.innerHTML = `
          <div class="item-header">
            <span class="rent">${rent}</span>
            ${statusBadge}
          </div>
          <div class="title">${data.title}</div>
          <div class="meta">
            <span>📅 ${formatDate(data.scrapedAt)}</span>
            <span>📍 ${data.layout || '-'}</span>
          </div>
        `;

        // クリックで詳細を開く（IDを渡すように変更）
        li.addEventListener('click', () => {
          openDetail(docId, data);
        });

        listEl.appendChild(li);
      });
    }, (error) => {
      console.error("データ取得エラー:", error);
      listEl.innerHTML = '<div class="empty-state" style="color:red">読み込みエラー発生</div>';
    });
}

// 3. 詳細画面の制御（生成ボタン vs コピーボタン）
let currentDocId = null;

function openDetail(docId, data) {
  currentDocId = docId;
  detailView.classList.add('open');

  // 文章エリアの初期化
  proposalTextEl.value = data.ai_proposal || "";

  // ボタンの状態を切り替える
  // まだAI生成していない(fetched)場合 -> 「✨ AI提案文を作成」ボタン
  // すでに生成済み(ready)の場合 -> 「📋 文章をコピー」ボタン
  // 生成中(analyzing)の場合 -> 無効化
  
  // イベントリスナーの重複登録を防ぐため、ボタンを再生成（クローン）
  const newBtn = actionBtn.cloneNode(true);
  actionBtn.parentNode.replaceChild(newBtn, actionBtn);
  
  const updateBtn = document.getElementById('action-btn'); // 新しいボタンを取得

  if (!data.ai_proposal || data.status === 'fetched') {
    // 【未生成モード】
    updateBtn.innerHTML = '✨ AI提案文を作成する';
    updateBtn.className = 'copy-btn';
    updateBtn.style.background = '#4285f4'; // Google Blue
    updateBtn.disabled = false;
    
    updateBtn.addEventListener('click', () => {
      // AI生成をリクエスト
      updateBtn.innerHTML = '🤖 作成中...';
      updateBtn.disabled = true;
      proposalTextEl.value = "AIが考え中です...\n（約10〜20秒お待ちください）";
      
      chrome.runtime.sendMessage({ 
        action: "generate_proposal_manual", 
        docId: currentDocId,
        data: data 
      });
    });

  } else if (data.status === 'analyzing') {
    // 【生成中モード】
    updateBtn.innerHTML = '🤖 AI思考中...';
    updateBtn.style.background = '#ccc';
    updateBtn.disabled = true;

  } else {
    // 【完了モード（コピー）】
    updateBtn.innerHTML = '📋 文章をコピー';
    updateBtn.className = 'copy-btn';
    updateBtn.style.background = '#34a853'; // Green
    updateBtn.disabled = false;

    updateBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(proposalTextEl.value);
      updateBtn.innerHTML = '✅ コピーしました！';
      setTimeout(() => { updateBtn.innerHTML = '📋 文章をコピー'; }, 2000);
    });
  }
}

// 閉じるボタン
closeBtn.addEventListener('click', () => {
  detailView.classList.remove('open');
});

// 手動解析ボタン
manualBtn.addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "scrape_now" }, (response) => {
        if (chrome.runtime.lastError) alert("ページをリロードしてください");
      });
    }
  });
});

loadProperties();
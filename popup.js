// popup.js - UI/UX 実装版

// 1. Firebase初期化 (background.jsと同じ設定)
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
const copyBtn = document.getElementById('copy-btn');
const manualBtn = document.getElementById('manual-patrol-btn');

// 日付フォーマット用
const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const d = timestamp.toDate();
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// 2. Firestoreからデータをリアルタイム取得
function loadProperties() {
  // 最新20件を取得
  db.collection("properties")
    .orderBy("scrapedAt", "desc")
    .limit(20)
    .onSnapshot((snapshot) => {
      listEl.innerHTML = ''; // リストクリア

      if (snapshot.empty) {
        listEl.innerHTML = '<div class="empty-state">データがありません。<br>巡回を実行してください。</div>';
        return;
      }

      snapshot.forEach((doc) => {
        const data = doc.data();
        const li = document.createElement('li');
        li.className = 'property-item';
        
        // ステータスに応じた表示
        let statusBadge = '';
        if (data.status === 'analyzing') {
          statusBadge = '<span class="status-badge status-analyzing">AI思考中...</span>';
        } else if (data.status === 'ready') {
          statusBadge = '<span class="status-badge status-ready">完了 ✨</span>';
        } else if (data.status === 'error') {
          statusBadge = '<span class="status-badge status-error">AIエラー</span>';
        } else {
          statusBadge = '<span class="status-badge status-analyzing">未処理</span>';
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

        // クリックで詳細を開く
        li.addEventListener('click', () => {
          openDetail(data);
        });

        listEl.appendChild(li);
      });
    }, (error) => {
      console.error("データ取得エラー:", error);
      listEl.innerHTML = '<div class="empty-state" style="color:red">読み込みエラー発生</div>';
    });
}

// 3. 詳細画面の制御
function openDetail(data) {
  // AI提案文があれば表示、なければプレースホルダー
  if (data.ai_proposal) {
    proposalTextEl.value = data.ai_proposal;
  } else if (data.status === 'analyzing') {
    proposalTextEl.value = "🤖 AIが一生懸命書いています...\nもう少しお待ちください。";
  } else {
    proposalTextEl.value = "提案文データがありません。";
  }

  detailView.classList.add('open');
}

// 閉じるボタン
closeBtn.addEventListener('click', () => {
  detailView.classList.remove('open');
});

// コピー機能
copyBtn.addEventListener('click', async () => {
  const text = proposalTextEl.value;
  try {
    await navigator.clipboard.writeText(text);
    
    // ボタンの見た目を一時的に変える
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '✅ コピーしました！';
    copyBtn.style.background = '#2d8a46';
    
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.background = '';
    }, 2000);
  } catch (err) {
    console.error('コピー失敗', err);
    alert('コピーに失敗しました');
  }
});

// 手動解析ボタン (現在のタブで実行)
manualBtn.addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      // content.jsへ直接メッセージ
      chrome.tabs.sendMessage(tabs[0].id, { action: "scrape_now" }, (response) => {
        // レスポンスがなくてもonSnapshotが更新を検知するのでOK
        if (chrome.runtime.lastError) {
          alert("エラー: ページをリロードしてから再試行してください。");
        }
      });
    }
  });
});

// 初期化実行
loadProperties();
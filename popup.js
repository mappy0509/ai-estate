// ==================================================
// AI-Prophet Popup Controller
// Version: 5.1 (Japanese & Robust Logic)
// ==================================================

document.addEventListener('DOMContentLoaded', () => {
  const ui = {
    statusText: document.getElementById('status-text'),
    statusDot: document.getElementById('status-dot'),
    queueCount: document.getElementById('queue-count'),
    btnStart: document.getElementById('btn-start'),
    btnClear: document.getElementById('btn-clear')
  };

  // --- 1. 状態監視 (State Monitoring) ---
  
  function updateUI() {
    chrome.storage.local.get(['patrolQueue', 'isPatrolling'], (result) => {
      const queue = result.patrolQueue || [];
      const count = queue.length;
      const isRunning = result.isPatrolling || false; // Backgroundの状態も見るように変更
      
      ui.queueCount.textContent = count;

      if (count > 0 && isRunning) {
        setRunningState();
      } else if (count > 0 && !isRunning) {
        setPausedState();
      } else {
        setIdleState();
      }
    });
  }

  function setRunningState() {
    ui.statusText.innerHTML = '<span class="dot bg-green"></span>自動巡回中...';
    ui.statusText.className = 'status-value status-active';
    ui.btnStart.disabled = true;
    ui.btnStart.textContent = '巡回中...';
    ui.btnStart.style.opacity = '0.6';
  }

  function setPausedState() {
    ui.statusText.innerHTML = '<span class="dot bg-warning" style="background-color: #ffc107;"></span>待機中';
    ui.statusText.className = 'status-value status-warning';
    ui.btnStart.disabled = false;
    ui.btnStart.textContent = '▶ 巡回再開';
    ui.btnStart.style.opacity = '1';
  }

  function setIdleState() {
    ui.statusText.innerHTML = '<span class="dot bg-gray"></span>待機中 (キュー空)';
    ui.statusText.className = 'status-value status-idle';
    ui.btnStart.disabled = false;
    ui.btnStart.textContent = '▶ 巡回開始';
    ui.btnStart.style.opacity = '1';
  }

  // リアルタイム更新（Storageの変更を検知）
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      updateUI();
    }
  });

  // 初回実行
  updateUI();

  // --- 2. ユーザーアクション (Controls) ---

  // パトロール再開（手動トリガー）
  ui.btnStart.addEventListener('click', () => {
    // まずキューの確認
    chrome.storage.local.get(['patrolQueue'], (result) => {
      const queue = result.patrolQueue || [];
      
      if (queue.length === 0) {
        alert("巡回するURLがありません。\nまずは物件一覧ページを開いて、リストを読み込ませてください。");
        return;
      }

      // メッセージ送信
      chrome.runtime.sendMessage({ action: "start_patrol" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Communication Error:", chrome.runtime.lastError.message);
            alert("エラー: バックグラウンドスクリプトが応答しません。拡張機能を再読み込みしてください。");
        } else {
            console.log("Start signal sent:", response);
            // 強制的にUIを「実行中」っぽく見せる（レスポンス待ちのタイムラグ対策）
            setRunningState();
        }
      });
    });
  });

  // キューのリセット（緊急停止）
  ui.btnClear.addEventListener('click', () => {
    if (confirm("巡回キューを全て削除し、パトロールを停止しますか？")) {
      chrome.storage.local.set({ patrolQueue: [], isPatrolling: false }, () => {
        // バックグラウンドにも停止信号を送る
        chrome.runtime.sendMessage({ action: "stop_patrol" });
        console.log("Queue cleared.");
        updateUI();
      });
    }
  });

});
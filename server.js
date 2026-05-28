/**
 * 行動予定管理アプリ - Express Server
 * REST APIでデータを管理し、静的ファイルを配信
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'schedules.json');

// === Middleware ===
app.use(express.json({ limit: '10mb' })); // 写真データ用に上限を設定

// APIリクエストのログ出力
app.use('/api', (req, res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

// エラーハンドリング: JSON パースエラー
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.error('JSON パースエラー:', err.message);
    return res.status(400).json({ error: 'JSONの形式が不正です' });
  }
  if (err.type === 'entity.too.large') {
    console.error('リクエストサイズ超過:', err.message);
    return res.status(413).json({ error: 'データサイズが大きすぎます（上限10MB）' });
  }
  next(err);
});

// === Data Helpers ===

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('データ読み込みエラー:', err.message);
  }
  return {};
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// === API Routes ===

/**
 * GET /api/schedules/:date
 * 指定日の全員分のデータを取得
 */
app.get('/api/schedules/:date', (req, res) => {
  const { date } = req.params;

  // 日付フォーマットバリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '日付フォーマットが不正です (YYYY-MM-DD)' });
  }

  const allData = loadData();
  const result = {};

  // 指定日のデータをフィルタリング
  Object.keys(allData).forEach(key => {
    if (key.startsWith(date + '_')) {
      const member = key.substring(date.length + 1);
      result[member] = allData[key];
    }
  });

  res.json(result);
});

/**
 * POST /api/schedules/:date/:member
 * 指定日・指定メンバーのデータを保存
 */
app.post('/api/schedules/:date/:member', (req, res) => {
  console.log('[POST Handler] Hit');
  const { date, member } = req.params;
  const { entries, photos } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '日付フォーマットが不正です' });
  }

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries は配列で指定してください' });
  }

  const allData = loadData();
  const key = `${date}_${member}`;

  // 内容があるかチェック
  const hasContent = entries.some(e => e.time || e.no || e.customer || e.content);
  const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;

  if (hasContent || hasPhotos) {
    allData[key] = {
      entries: entries,
      photos: photos || [],
      updatedAt: new Date().toISOString()
    };
  } else {
    delete allData[key];
  }

  saveData(allData);
  res.json({ success: true, message: `${member} の予定を保存しました` });
});

/**
 * DELETE /api/schedules/:date/:member
 * 指定日・指定メンバーのデータを削除
 */
app.delete('/api/schedules/:date/:member', (req, res) => {
  const { date, member } = req.params;

  const allData = loadData();
  const key = `${date}_${member}`;

  if (allData[key]) {
    delete allData[key];
    saveData(allData);
  }

  res.json({ success: true, message: `${member} の予定を削除しました` });
});

/**
 * DELETE /api/schedules/:date
 * 指定日の全員分データを削除
 */
app.delete('/api/schedules/:date', (req, res) => {
  const { date } = req.params;

  const allData = loadData();
  let deleted = 0;

  Object.keys(allData).forEach(key => {
    if (key.startsWith(date + '_')) {
      delete allData[key];
      deleted++;
    }
  });

  saveData(allData);
  res.json({ success: true, message: `${deleted}件のデータを削除しました` });
});

// === Static Files ===
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// === Fallback: SPA support ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === Start Server ===
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       行動予定管理アプリ サーバー          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  ローカル:  http://localhost:${PORT}          ║`);

  // ネットワークIPアドレスを表示
  const interfaces = require('os').networkInterfaces();
  Object.values(interfaces).forEach(nets => {
    nets.forEach(net => {
      if (net.family === 'IPv4' && !net.internal) {
        const padded = `http://${net.address}:${PORT}`;
        console.log(`║  ネットワーク: ${padded.padEnd(25)}║`);
      }
    });
  });

  console.log('╠══════════════════════════════════════════╣');
  console.log('║  スマホから上記ネットワークURLでアクセス    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

/**
 * 行動予定管理アプリ - Express Server
 * REST APIでデータを管理し、静的ファイルを配信
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

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

// === MongoDB Setup ===
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('⚠️ MONGODB_URI が設定されていません。データベースに接続できません。');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDBに接続しました'))
    .catch(err => console.error('❌ MongoDB接続エラー:', err));
}

// Mongoose Schema
const scheduleSchema = new mongoose.Schema({
  date: { type: String, required: true },
  member: { type: String, required: true },
  entries: { type: Array, default: [] },
  photos: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

scheduleSchema.index({ date: 1, member: 1 }, { unique: true });
const Schedule = mongoose.model('Schedule', scheduleSchema);


// === API Routes ===

/**
 * GET /api/schedules/:date
 * 指定日の全員分のデータを取得
 */
app.get('/api/schedules/:date', async (req, res) => {
  const { date } = req.params;

  // 日付フォーマットバリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '日付フォーマットが不正です (YYYY-MM-DD)' });
  }

  try {
    const schedules = await Schedule.find({ date });
    const result = {};
    schedules.forEach(s => {
      result[s.member] = {
        entries: s.entries,
        photos: s.photos,
        updatedAt: s.updatedAt
      };
    });
    res.json(result);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).json({ error: 'データベースエラー' });
  }
});

/**
 * POST /api/schedules/:date/:member
 * 指定日・指定メンバーのデータを保存
 */
app.post('/api/schedules/:date/:member', async (req, res) => {
  console.log('[POST Handler] Hit');
  const { date, member } = req.params;
  const { entries, photos } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '日付フォーマットが不正です' });
  }

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries は配列で指定してください' });
  }

  // 内容があるかチェック
  const hasContent = entries.some(e => e.time || e.no || e.customer || e.content);
  const hasPhotos = photos && Array.isArray(photos) && photos.length > 0;

  try {
    if (hasContent || hasPhotos) {
      // upsert (更新か新規作成)
      await Schedule.findOneAndUpdate(
        { date, member },
        { 
          entries: entries,
          photos: photos || [],
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } else {
      // 空の場合は削除
      await Schedule.findOneAndDelete({ date, member });
    }
    res.json({ success: true, message: `${member} の予定を保存しました` });
  } catch (err) {
    console.error('データ保存エラー:', err);
    res.status(500).json({ error: 'データベースエラー' });
  }
});

/**
 * DELETE /api/schedules/:date/:member
 * 指定日・指定メンバーのデータを削除
 */
app.delete('/api/schedules/:date/:member', async (req, res) => {
  const { date, member } = req.params;

  try {
    await Schedule.findOneAndDelete({ date, member });
    res.json({ success: true, message: `${member} の予定を削除しました` });
  } catch (err) {
    console.error('データ削除エラー:', err);
    res.status(500).json({ error: 'データベースエラー' });
  }
});

/**
 * DELETE /api/schedules/:date
 * 指定日の全員分データを削除
 */
app.delete('/api/schedules/:date', async (req, res) => {
  const { date } = req.params;

  try {
    const result = await Schedule.deleteMany({ date });
    res.json({ success: true, message: `${result.deletedCount}件のデータを削除しました` });
  } catch (err) {
    console.error('データ削除エラー:', err);
    res.status(500).json({ error: 'データベースエラー' });
  }
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

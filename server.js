const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'edu-lead-system-change-in-production';

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// ======== DATABASE ========
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    user_agent TEXT,
    referrer TEXT,
    page_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    level TEXT,
    major TEXT,
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    phone TEXT,
    name TEXT,
    content TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
`);

// Seed default admin
const adminRow = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!adminRow) {
  const defaultPwd = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = crypto.createHash('sha256').update(defaultPwd).digest('hex');
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hash);
  console.log(`✓ Default admin created — admin / ${defaultPwd}`);
}

// ======== AUTH MIDDLEWARE ========
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    req.admin = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

// ======== VISITOR API ========

// 1. 记录访问
app.post('/api/visit', (req, res) => {
  const { referrer, page_url } = req.body;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';

  db.prepare('INSERT INTO visits (ip, user_agent, referrer, page_url) VALUES (?, ?, ?, ?)').run(ip, ua, referrer || '', page_url || '');
  res.json({ ok: true });
});

// 2. 提交报名咨询
app.post('/api/lead', (req, res) => {
  const { name, phone, level, major } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: '姓名和电话为必填项' });
  }

  const result = db.prepare('INSERT INTO leads (name, phone, level, major) VALUES (?, ?, ?, ?)').run(name, phone, level || '', major || '');
  res.json({ ok: true, id: result.lastInsertRowid });
});

// 3. 发送留言消息
app.post('/api/message', (req, res) => {
  const { phone, name, content } = req.body;
  if (!phone || !content) {
    return res.status(400).json({ error: '手机号和留言内容为必填项' });
  }

  const existing = db.prepare('SELECT id FROM leads WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(phone);
  db.prepare('INSERT INTO messages (lead_id, phone, name, content) VALUES (?, ?, ?, ?)').run(existing ? existing.id : null, phone, name || '匿名', content);
  res.json({ ok: true });
});

// 4. 访客查询自己的消息
app.get('/api/messages', (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: '请提供手机号' });

  const messages = db.prepare('SELECT id, content, is_admin, created_at FROM messages WHERE phone = ? ORDER BY created_at ASC').all(phone);
  res.json({ messages });
});

// ======== ADMIN API ========

// 登录
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  const admin = db.prepare('SELECT id, username FROM admins WHERE username = ? AND password = ?').get(username, hash);

  if (!admin) return res.status(401).json({ error: '用户名或密码错误' });

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: admin.username });
});

// 统计数据
app.get('/api/admin/stats', auth, (req, res) => {
  res.json({
    totalVisits:       db.prepare('SELECT COUNT(*) c FROM visits').get().c,
    todayVisits:       db.prepare("SELECT COUNT(*) c FROM visits WHERE date(created_at) = date('now')").get().c,
    totalLeads:        db.prepare('SELECT COUNT(*) c FROM leads').get().c,
    newLeads:          db.prepare("SELECT COUNT(*) c FROM leads WHERE status = 'new'").get().c,
    unreadMessages:    db.prepare('SELECT COUNT(*) c FROM messages WHERE is_admin = 0 AND read = 0').get().c,
  });
});

// 访问记录
app.get('/api/admin/visits', auth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const visits = db.prepare('SELECT * FROM visits ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) c FROM visits').get().c;

  res.json({ visits, total, page, totalPages: Math.ceil(total / limit) });
});

// 线索列表
app.get('/api/admin/leads', auth, (req, res) => {
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  res.json({ leads });
});

// 更新线索状态
app.put('/api/admin/leads/:id', auth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// 获取所有会话
app.get('/api/admin/conversations', auth, (req, res) => {
  const conversations = db.prepare(`
    SELECT
      m.phone,
      COALESCE(m.name, l.name, '匿名') AS name,
      COUNT(*) AS message_count,
      SUM(CASE WHEN m.is_admin = 0 AND m.read = 0 THEN 1 ELSE 0 END) AS unread,
      MAX(m.created_at) AS last_message_at,
      (SELECT content FROM messages WHERE phone = m.phone ORDER BY created_at DESC LIMIT 1) AS last_content
    FROM messages m
    LEFT JOIN leads l ON m.lead_id = l.id
    GROUP BY m.phone
    ORDER BY last_message_at DESC
  `).all();
  res.json({ conversations });
});

// 获取某会话的详细消息
app.get('/api/admin/messages', auth, (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: '缺少 phone 参数' });

  const messages = db.prepare('SELECT * FROM messages WHERE phone = ? ORDER BY created_at ASC').all(phone);
  res.json({ messages });
});

// 标记已读
app.put('/api/admin/messages/read', auth, (req, res) => {
  const { phone } = req.body;
  db.prepare('UPDATE messages SET read = 1 WHERE phone = ? AND is_admin = 0').run(phone);
  res.json({ ok: true });
});

// 管理员回复
app.post('/api/admin/messages/reply', auth, (req, res) => {
  const { phone, content } = req.body;
  if (!phone || !content) return res.status(400).json({ error: '缺少参数' });

  db.prepare('INSERT INTO messages (phone, name, content, is_admin) VALUES (?, ?, ?, 1)').run(phone, '招生老师', content);
  res.json({ ok: true });
});

// ======== ADMIN PAGE ========
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ======== START ========
app.listen(PORT, '0.0.0.0', () => {
  const adminPwd = process.env.ADMIN_PASSWORD || 'admin123';
  console.log(`\n  🚀 服务已启动`);
  console.log(`  📄 宣传页:    http://localhost:${PORT}`);
  console.log(`  🔐 管理后台:  http://localhost:${PORT}/admin`);
  console.log(`  默认账号: admin / ${adminPwd}\n`);
});

// 《人工智能通识》模块一 课堂测验平台 —— 本地服务（零依赖，仅用 Node 内置模块）
// 启动： node server.js   访问： http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 二维码模块：用于教师端「访问码二维码」，安装在隔离 node workspace
let QR = null;
try { QR = require('qrcode'); }
catch (e) {
  try { QR = require(path.join(os.homedir(), '.workbuddy/binaries/node/workspace/node_modules/qrcode')); }
  catch (e2) { QR = null; }
}

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const QUIZ_FILE = path.join(DATA, 'questions.json');
const RESULT_FILE = path.join(DATA, 'results.json');
const PORT = process.env.PORT || 3000;
const TEACHER_TOKEN = process.env.TEACHER_TOKEN || 'teacher7400';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, ''); // 公网地址（内网穿透/部署后设置，使二维码与接口返回公网链接）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xls': 'application/vnd.ms-excel; charset=utf-8'
};

// ---------- 工具函数 ----------
function loadQuiz() {
  return JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf-8'));
}
function loadResults() {
  try {
    return JSON.parse(fs.readFileSync(RESULT_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
function saveResults(list) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(list, null, 2), 'utf-8');
}
function flattenQuestions(quiz) {
  const map = {};
  quiz.parts.forEach(p => {
    p.sections.forEach(s => {
      s.questions.forEach(q => {
        map[q.id] = { part: p.id, section: s.id, ...q };
      });
    });
  });
  return map;
}
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
// 取本机局域网 IPv4（用于生成教师端二维码的可扫码地址）
function getLanIp() {
  const nets = os.networkInterfaces();
  for (const k in nets) for (const n of nets[k]) {
    if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return 'localhost';
}
// 对外可访问的基础地址：优先从「当前请求域名」推导（公网/局域网/本地都正确），
// 其次 PUBLIC_URL 环境变量，最后回退局域网地址。这样无论公网地址怎么变，二维码都自动指向正确地址。
function getPublicBase(req) {
  if (req && req.headers && req.headers.host) {
    const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return `${proto}://${req.headers.host}`;
  }
  return PUBLIC_URL || `http://${getLanIp()}:${PORT}`;
}

// 判分（按单个小节/练习）：返回 {score,total,percent,sectionId,sectionTitle,partId,partName,details}
function gradeSection(quiz, sectionId, answers) {
  let target = null, part = null;
  quiz.parts.forEach(p => p.sections.forEach(s => {
    if (s.id === sectionId) { target = s; part = p; }
  }));
  if (!target) return null;
  let score = 0, total = 0;
  const details = [];
  target.questions.forEach(q => {
    total++;
    const correct = isCorrect(q, answers && answers[q.id]);
    if (correct) score++;
    details.push({
      qid: q.id,
      section: target.id,
      stem: q.stem,
      type: q.type,
      selected: answers ? answers[q.id] : undefined,
      answer: q.answer,
      correct,
      explain: q.explain
    });
  });
  const percent = total ? Math.round((score / total) * 1000) / 10 : 0;
  return {
    score, total, percent,
    sectionId: target.id, sectionTitle: target.title,
    partId: part.id, partName: part.name,
    details
  };
}
function isCorrect(q, sel) {
  if (sel === undefined || sel === null) return false;
  if (q.type === 'multiple') {
    const a = Array.isArray(q.answer) ? q.answer.slice().sort() : [];
    const s = Array.isArray(sel) ? sel.slice().sort() : [];
    if (a.length !== s.length) return false;
    return a.every((v, i) => v === s[i]);
  }
  return sel === q.answer;
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // 跨域支持：便于静态预览 / 本地 file:// 打开时也能访问接口
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    // 题库
    if (pathname === '/api/quiz' && req.method === 'GET') {
      return sendJSON(res, 200, loadQuiz());
    }

    // 服务信息（供前端生成二维码/提示局域网地址）
    if (pathname === '/api/info' && req.method === 'GET') {
      return sendJSON(res, 200, { ip: getLanIp(), port: PORT, token: TEACHER_TOKEN, base: getPublicBase(req) });
    }

    // 教师端访问码二维码：扫码直达「带 token 的教师端」链接
    // 注意：直接 res.end(svg) 在本环境某分支会返回空响应，故返回 JSON（含 base64 SVG），前端再渲染为图片
    if (pathname === '/api/teacher-qr' && req.method === 'GET') {
      if (!QR) return sendJSON(res, 500, { error: '二维码模块未加载' });
      const link = `${getPublicBase(req)}/?token=${encodeURIComponent(TEACHER_TOKEN)}&role=teacher`;
      try {
        const svg = await QR.toString(link, { type: 'svg', margin: 1 });
        const b64 = Buffer.from(svg, 'utf-8').toString('base64');
        return sendJSON(res, 200, { link, svg: b64 });
      } catch (e) {
        return sendJSON(res, 500, { error: '二维码生成失败' });
      }
    }

    // 提交答卷（按小节/练习）
    if (pathname === '/api/submit' && req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const className = (body.className || '').trim();
      const sectionId = (body.sectionId || '').trim();
      if (!name) return sendJSON(res, 400, { error: '请填写姓名' });
      if (!sectionId) return sendJSON(res, 400, { error: '练习信息缺失' });
      const quiz = loadQuiz();
      const result = gradeSection(quiz, sectionId, body.answers);
      if (!result) return sendJSON(res, 400, { error: '练习不存在' });
      const record = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        className: className || '未填写',
        sectionId: result.sectionId,
        sectionTitle: result.sectionTitle,
        partId: result.partId,
        partName: result.partName,
        score: result.score,
        total: result.total,
        percent: result.percent,
        details: result.details,
        submittedAt: new Date().toISOString()
      };
      const all = loadResults();
      all.push(record);
      saveResults(all);
      return sendJSON(res, 200, {
        score: result.score,
        total: result.total,
        percent: result.percent,
        sectionId: result.sectionId,
        sectionTitle: result.sectionTitle,
        partName: result.partName,
        details: result.details
      });
    }

    // 教师端：查看成绩（需 token）
    if (pathname === '/api/results' && req.method === 'GET') {
      if (url.searchParams.get('token') !== TEACHER_TOKEN)
        return sendJSON(res, 403, { error: '访问码错误' });
      const all = loadResults();
      all.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      return sendJSON(res, 200, { results: all, total: all.length });
    }

    // 教师端：导出（csv / xls）
    if (pathname === '/api/export' && req.method === 'GET') {
      if (url.searchParams.get('token') !== TEACHER_TOKEN)
        return sendJSON(res, 403, { error: '访问码错误' });
      const fmt = (url.searchParams.get('format') || 'csv').toLowerCase();
      const all = loadResults();

      if (fmt === 'xls') {
        const html = buildXls(all);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': 'attachment; filename="quiz_results.xls"'
        });
        return res.end(html);
      }
      // 默认 csv（带 BOM 以便 Excel 正确显示中文）
      const csv = buildCsv(all);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="quiz_results.csv"'
      });
      return res.end('﻿' + csv);
    }

    // 静态文件
    if (req.method === 'GET') {
      let rel = pathname === '/' ? '/index.html' : pathname;
      const filePath = path.join(PUBLIC, path.normalize(rel));
      if (!filePath.startsWith(PUBLIC)) {
        res.writeHead(403); return res.end('Forbidden');
      }
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        return fs.createReadStream(filePath).pipe(res);
      }
      res.writeHead(404); return res.end('Not Found');
    }

    res.writeHead(405); res.end('Method Not Allowed');
  } catch (e) {
    sendJSON(res, 500, { error: String(e && e.message || e) });
  }
});

function buildCsv(all) {
  const header = ['序号', '姓名', '班级', '练习（部分）', '得分', '正确率(%)', '提交时间'];
  const rows = [header.join(',')];
  all.forEach((r, i) => {
    const row = [
      i + 1,
      r.name,
      r.className,
      r.partName || r.sectionTitle || '',
      `${r.score}/${r.total}`,
      r.percent,
      new Date(r.submittedAt).toLocaleString('zh-CN')
    ];
    rows.push(row.map(csvEscape).join(','));
  });
  return rows.join('\r\n');
}
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function buildXls(all) {
  let thead = '<tr><th>序号</th><th>姓名</th><th>班级</th><th>练习（部分）</th><th>得分</th><th>正确率(%)</th><th>提交时间</th></tr>';
  let tbody = '';
  all.forEach((r, i) => {
    const tr = `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.className}</td><td>${r.partName || r.sectionTitle || ''}</td><td>${r.score}/${r.total}</td><td>${r.percent}</td><td>${new Date(r.submittedAt).toLocaleString('zh-CN')}</td></tr>`;
    tbody += tr;
  });
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
}

server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const lan = [];
  for (const k in nets) for (const n of nets[k]) {
    if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
  }
  console.log('================================================');
  console.log('  《人工智能通识》模块一 · 课堂测验平台 已启动');
  console.log('  本机访问:  http://localhost:' + PORT);
  if (lan.length) console.log('  同局域网学生访问:  http://' + lan[0] + ':' + PORT);
  console.log('  教师访问码: ' + TEACHER_TOKEN);
  console.log('================================================');
});

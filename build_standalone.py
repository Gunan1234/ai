# -*- coding: utf-8 -*-
"""生成自包含单文件课堂练习平台（内嵌全部 30 题，含第1题）。
用于替换线上缺题的发布版（workbuddy.link 快照）。
学生端/教师端 UI 与样式沿用原版，判分与成绩改为前端本地处理。
"""
import json, os, io, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
QUIZ_FILE = os.path.join(ROOT, "data", "questions.json")
CSS_FILE = os.path.join(ROOT, "public", "styles.css")
HTML_FILE = os.path.join(ROOT, "public", "index.html")
OUT_FILE = os.path.join(ROOT, "课堂练习平台_独立版.html")

with open(QUIZ_FILE, encoding="utf-8") as f:
    quiz = json.load(f)
with open(CSS_FILE, encoding="utf-8") as f:
    css = f.read()
with open(HTML_FILE, encoding="utf-8") as f:
    html = f.read()

# 提取 <body> ... </body> 之间的内容作为页面结构
body = html.split("<body>", 1)[1].rsplit("</body>", 1)[0]
# 去掉原版对外部 app.js 的引用（独立版改为内联脚本）
body = body.replace('<script src="app.js"></script>', '')

# 题库 JSON 安全嵌入（防止 </script> 截断）
quiz_json = json.dumps(quiz, ensure_ascii=False)
quiz_json = quiz_json.replace("</", "<\\/")

JS = r"""
const QUIZ = __QUIZ__;
const TEACHER_TOKEN = 'teacher7400';
const RESULTS_KEY = 'ai_quiz_results_v1';
const BEST_KEY = 'ai_quiz_best_v1';

const state = {
  quiz: QUIZ, answers: {}, student: null, currentSection: null,
  teacherToken: sessionStorage.getItem('teaToken') || '',
  results: [], filter: { search: '', cls: '', section: '', sort: 'time' }, lastDetails: null,
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } }
function saveBest(secId, percent) { const m = loadBest(); if (!(secId in m) || percent > m[secId]) { m[secId] = percent; localStorage.setItem(BEST_KEY, JSON.stringify(m)); } }

function countSections(q) { let n = 0; q.parts.forEach(p => n += p.sections.length); return n; }
function countQuestions(q) { let n = 0; q.parts.forEach(p => p.sections.forEach(s => n += s.questions.length)); return n; }
function findSection(secId) { let f = null; state.quiz.parts.forEach(p => p.sections.forEach(s => { if (s.id === secId) f = s; })); return f; }
function findPartOf(secId) { return state.quiz.parts.find(p => p.sections.some(s => s.id === secId)) || null; }
function allSections() { const l = []; state.quiz.parts.forEach(p => p.sections.forEach(s => l.push({ id: s.id, title: s.title }))); return l; }

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
function gradeSection(sectionId, answers) {
  let target = null, part = null;
  state.quiz.parts.forEach(p => p.sections.forEach(s => { if (s.id === sectionId) { target = s; part = p; } }));
  if (!target) return null;
  let score = 0, total = 0; const details = [];
  target.questions.forEach(q => {
    total++;
    const correct = isCorrect(q, answers && answers[q.id]);
    if (correct) score++;
    details.push({ qid: q.id, section: target.id, stem: q.stem, type: q.type, selected: answers ? answers[q.id] : undefined, answer: q.answer, correct, explain: q.explain });
  });
  const percent = total ? Math.round((score / total) * 1000) / 10 : 0;
  return { score, total, percent, sectionId: target.id, sectionTitle: target.title, partId: part.id, partName: part.name, details };
}

function init() {
  $('#secCount').textContent = countSections(state.quiz);
  $('#qCount').textContent = countQuestions(state.quiz);
  bindGlobal();
  checkAutoLogin();
  const qrw = $('#teaQrWrap'); if (qrw) qrw.classList.add('hidden');
}

function bindGlobal() {
  $$('.role-card').forEach(c => c.addEventListener('click', () => { if (c.dataset.role === 'student') showStudent(); else showTeacher(); }));
  $('#backHome').addEventListener('click', showHome);
}
function showView(id) { $$('.view').forEach(v => v.classList.add('hidden')); $('#' + id).classList.remove('hidden'); $('#backHome').classList.toggle('hidden', id === 'home'); }
function showHome() { showView('home'); }

function showStudent() {
  showView('student');
  $('#studentForm').classList.remove('hidden');
  $('#practiceList').classList.add('hidden');
  $('#quizWrap').classList.add('hidden');
  $('#resultWrap').classList.add('hidden');
  $('#stuName').value = ''; $('#stuClass').value = '';
}
$('#enterPractice') && $('#enterPractice').addEventListener('click', () => {
  const name = $('#stuName').value.trim();
  const cls = $('#stuClass').value.trim();
  if (!name) { toast('请填写姓名'); return; }
  if (!state.quiz) { toast('题库尚未加载'); return; }
  state.student = { name, className: cls || '未填写' };
  renderPracticeList();
  $('#studentForm').classList.add('hidden');
  $('#practiceList').classList.remove('hidden');
  window.scrollTo(0, 0);
});

function renderPracticeList() {
  $('#plStuInfo').textContent = `${state.student.name}（${state.student.className}）`;
  const best = loadBest();
  const body = $('#plBody'); body.innerHTML = '';
  state.quiz.parts.forEach(part => {
    const pg = document.createElement('div'); pg.className = 'pl-part';
    const grid = document.createElement('div'); grid.className = 'pl-grid';
    part.sections.forEach(sec => {
      const bestPct = best[sec.id];
      const card = document.createElement('div'); card.className = 'pl-card';
      card.innerHTML = `<div class="pl-card-title">${escapeHtml(part.name)}</div><div class="pl-card-sub">${escapeHtml(sec.title)}</div><div class="pl-card-meta">${sec.questions.length} 题 · 单选+判断</div><div class="pl-card-best">${bestPct !== undefined ? '最佳：' + bestPct + '%' : '未练习'}</div><button class="btn-primary pl-start" data-sec="${sec.id}">开始练习</button>`;
      card.querySelector('.pl-start').addEventListener('click', () => startSection(sec.id));
      grid.appendChild(card);
    });
    pg.appendChild(grid); body.appendChild(pg);
  });
}
function startSection(secId) {
  const sec = findSection(secId); if (!sec) return;
  const part = findPartOf(secId);
  state.currentSection = sec; state.answers = {};
  renderQuizSection(sec);
  $('#practiceList').classList.add('hidden');
  $('#resultWrap').classList.add('hidden');
  $('#quizWrap').classList.remove('hidden');
  $('#stuInfo').textContent = `${state.student.name}（${state.student.className}）`;
  $('#quizSecName').textContent = part ? part.name : sec.title;
  window.scrollTo(0, 0);
}
function renderQuizSection(sec) {
  const body = $('#quizBody'); body.innerHTML = '';
  sec.questions.forEach(q => body.appendChild(renderQuestion(q)));
  updateProgress();
}
function renderQuestion(q) {
  const el = document.createElement('div'); el.className = 'q';
  const tagClass = q.type === 'single' ? 'tag-single' : 'tag-judge';
  const tagText = q.type === 'single' ? '单选' : '判断';
  el.innerHTML = `<div class="q-stem"><span class="q-tag ${tagClass}">${tagText}</span>${escapeHtml(q.stem)}</div>`;
  const opts = document.createElement('div');
  q.options.forEach((opt, i) => {
    const o = document.createElement('label'); o.className = 'opt';
    o.innerHTML = `<input type="radio" name="${q.id}" value="${i}" /><span class="opt-text">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</span>`;
    o.addEventListener('click', (e) => {
      e.preventDefault();
      state.answers[q.id] = i;
      $$('.opt', el).forEach((op, oi) => op.classList.toggle('selected', oi === i));
      updateProgress();
    });
    opts.appendChild(o);
  });
  el.appendChild(opts);
  return el;
}
function updateProgress() {
  const sec = state.currentSection; if (!sec) return;
  const total = sec.questions.length;
  let answered = 0;
  sec.questions.forEach(q => { const a = state.answers[q.id]; if (a !== undefined && a !== null) answered++; });
  const pct = total ? Math.round(answered / total * 100) : 0;
  $('#progFill').style.width = pct + '%';
  $('#progText').textContent = `${answered} / ${total}`;
  const complete = answered === total;
  $('#submitQuiz').disabled = !complete;
  $('#submitHint').textContent = complete ? '' : '请答完所有题目再提交';
}
$('#quizBack') && $('#quizBack').addEventListener('click', backToPractice);
$('#backToPractice') && $('#backToPractice').addEventListener('click', backToPractice);
function backToPractice() {
  $('#quizWrap').classList.add('hidden');
  $('#resultWrap').classList.add('hidden');
  renderPracticeList();
  $('#practiceList').classList.remove('hidden');
  window.scrollTo(0, 0);
}
$('#plBackHome') && $('#plBackHome').addEventListener('click', showHome);

$('#submitQuiz') && $('#submitQuiz').addEventListener('click', submitQuiz);
function submitQuiz() {
  $('#submitQuiz').disabled = true;
  const result = gradeSection(state.currentSection.id, state.answers);
  if (!result) { toast('练习不存在'); $('#submitQuiz').disabled = false; return; }
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: state.student.name, className: state.student.className,
    sectionId: result.sectionId, sectionTitle: result.sectionTitle,
    partId: result.partId, partName: result.partName,
    score: result.score, total: result.total, percent: result.percent,
    details: result.details, submittedAt: new Date().toISOString()
  };
  const all = loadResultsLocal(); all.push(record); saveResultsLocal(all);
  saveBest(result.sectionId, result.percent);
  renderResult(result);
}
function renderResult(data) {
  state.lastDetails = data.details;
  $('#quizWrap').classList.add('hidden');
  $('#resultWrap').classList.remove('hidden');
  const deg = data.percent * 3.6;
  $('.score-ring').style.setProperty('--deg', deg + 'deg');
  $('#scoreNum').textContent = data.score;
  $('#scoreDen').textContent = '/ ' + data.total;
  $('#resultSec').textContent = data.partName || data.sectionTitle;
  $('#resultPercent').textContent = `正确率 ${data.percent}%`;
  const pb = $('#partBreak'); pb.innerHTML = '';
  const d = document.createElement('div'); d.className = 'pb';
  d.innerHTML = `本次练习<br><b>${data.score}/${data.total}</b> · ${data.percent}%`;
  pb.appendChild(d);
  renderReview(data.details, false);
  window.scrollTo(0, 0);
}
function renderReview(details, onlyWrong) {
  const wrap = $('#reviewWrap');
  wrap.innerHTML = '<h3 style="color:var(--blue)">题目解析</h3>';
  details.forEach((d, i) => {
    if (onlyWrong && d.correct) return;
    const q = findQuestion(d.qid);
    const rv = document.createElement('div');
    rv.className = 'rv ' + (d.correct ? 'ok' : 'no');
    const selText = formatAnswer(q, d.selected);
    const ansText = formatAnswer(q, d.answer);
    rv.innerHTML = `<div class="rv-head"><span class="rv-badge ${d.correct ? 'badge-ok' : 'badge-no'}">${d.correct ? '正确' : '错误'}</span> ${i + 1}. ${escapeHtml(d.stem)}</div><div class="rv-line">你的答案：${selText}</div><div class="rv-line">正确答案：${ansText}</div><div class="rv-exp">解析：${escapeHtml(d.explain || '')}</div>`;
    wrap.appendChild(rv);
  });
}
let reviewOnlyWrong = false;
$('#reviewWrong') && $('#reviewWrong').addEventListener('click', () => {
  reviewOnlyWrong = !reviewOnlyWrong;
  renderReview(state.lastDetails || [], reviewOnlyWrong);
  $('#reviewWrong').textContent = reviewOnlyWrong ? '查看全部解析' : '只看错题';
});
$('#stuHome') && $('#stuHome').addEventListener('click', showHome);

function showTeacher() {
  showView('teacher');
  if (state.teacherToken) { enterTeacher(state.teacherToken); }
  else { $('#teacherLogin').classList.remove('hidden'); $('#teacherDash').classList.add('hidden'); $('#teaErr').textContent = ''; }
}
function enterTeacher(token) {
  token = (token || '').trim();
  if (!token) { $('#teaErr').textContent = '请输入访问码'; return; }
  if (token !== TEACHER_TOKEN) { $('#teaErr').textContent = '访问码错误'; return; }
  state.teacherToken = token;
  sessionStorage.setItem('teaToken', token);
  showView('teacher');
  $('#teacherLogin').classList.add('hidden');
  $('#teacherDash').classList.remove('hidden');
  loadResults();
}
$('#teaLogin') && $('#teaLogin').addEventListener('click', () => { enterTeacher($('#teaToken').value.trim()); });
function checkAutoLogin() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const role = params.get('role');
  if (role === 'teacher' && token) { history.replaceState(null, '', location.pathname); enterTeacher(token); }
}

function loadResultsLocal() { try { return JSON.parse(localStorage.getItem(RESULTS_KEY)) || []; } catch (e) { return []; } }
function saveResultsLocal(list) { localStorage.setItem(RESULTS_KEY, JSON.stringify(list)); }
function loadResults() { state.results = loadResultsLocal(); renderDashboard(); }

function renderDashboard() {
  const r = applyFilter(state.results);
  const stats = $('#stats');
  if (r.length === 0) { stats.innerHTML = ''; $('#emptyTip').classList.remove('hidden'); }
  else {
    $('#emptyTip').classList.add('hidden');
    const percents = r.map(x => x.percent);
    const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length * 10) / 10;
    const max = Math.max(...percents);
    const pass = percents.filter(p => p >= 60).length;
    const passRate = Math.round(pass / percents.length * 1000) / 10;
    stats.innerHTML = `<div class="stat"><div class="v">${r.length}</div><div class="k">提交人次</div></div><div class="stat"><div class="v">${avg}%</div><div class="k">平均正确率</div></div><div class="stat"><div class="v">${max}%</div><div class="k">最高正确率</div></div><div class="stat"><div class="v">${passRate}%</div><div class="k">及格率(≥60%)</div></div>`;
  }
  renderSectionOverview();
  renderTable(r);
  const classes = [...new Set(state.results.map(x => x.className))].sort();
  const sel = $('#filterClass'); const curC = sel.value;
  sel.innerHTML = '<option value="">全部班级</option>' + classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (classes.includes(curC)) sel.value = curC;
  const secList = allSections();
  const ssel = $('#filterSection'); const curS = ssel.value;
  ssel.innerHTML = '<option value="">全部练习</option>' + secList.map(s => { const part = findPartOf(s.id); return `<option value="${s.id}">${escapeHtml(part ? part.name : s.title)}</option>`; }).join('');
  if (secList.some(s => s.id === curS)) ssel.value = curS;
}
function renderSectionOverview() {
  const secList = allSections();
  const map = {};
  secList.forEach(s => { const part = findPartOf(s.id); map[s.id] = { title: part ? part.name : s.title, sum: 0, n: 0, pass: 0 }; });
  state.results.forEach(x => { if (map[x.sectionId]) { map[x.sectionId].sum += x.percent; map[x.sectionId].n++; if (x.percent >= 60) map[x.sectionId].pass++; } });
  const wrap = $('#sectionOverview');
  const cards = secList.map(s => {
    const m = map[s.id];
    const avg = m.n ? Math.round(m.sum / m.n * 10) / 10 : null;
    const lvl = avg === null ? 'lv-none' : avg >= 80 ? 'lv-good' : avg >= 60 ? 'lv-mid' : 'lv-bad';
    return `<div class="so-card ${lvl}"><div class="so-name">${escapeHtml(m.title)}</div><div class="so-v">${avg === null ? '—' : avg + '%'}</div><div class="so-meta">${m.n} 人次 · 及格 ${m.pass}</div></div>`;
  }).join('');
  wrap.innerHTML = `<div class="so-title">各部分练习情况（平均正确率）</div><div class="so-cards">${cards}</div>`;
}
function applyFilter(list) {
  let r = list.slice();
  const { search, cls, section, sort } = state.filter;
  if (search) { const s = search.toLowerCase(); r = r.filter(x => x.name.toLowerCase().includes(s) || x.className.toLowerCase().includes(s)); }
  if (cls) r = r.filter(x => x.className === cls);
  if (section) r = r.filter(x => x.sectionId === section);
  if (sort === 'scoreDesc') r.sort((a, b) => b.percent - a.percent);
  else if (sort === 'scoreAsc') r.sort((a, b) => a.percent - b.percent);
  else if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else r.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return r;
}
function renderTable(r) {
  const thead = $('#resultTable thead');
  const tbody = $('#resultTable tbody');
  thead.innerHTML = `<tr><th>序号</th><th>姓名</th><th>班级</th><th>练习（部分）</th><th>得分</th><th>正确率</th><th>提交时间</th></tr>`;
  if (r.length === 0) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = r.map((x, i) => {
    const cls = x.percent >= 60 ? 'pass' : 'fail';
    return `<tr><td>${i + 1}</td><td class="cell-name">${escapeHtml(x.name)}</td><td>${escapeHtml(x.className)}</td><td>${escapeHtml(x.partName || x.sectionTitle || '')}</td><td>${x.score}/${x.total}</td><td class="${cls}">${x.percent}%</td><td>${new Date(x.submittedAt).toLocaleString('zh-CN')}</td></tr>`;
  }).join('');
}
$('#searchName') && $('#searchName').addEventListener('input', e => { state.filter.search = e.target.value; renderDashboard(); });
$('#filterClass') && $('#filterClass').addEventListener('change', e => { state.filter.cls = e.target.value; renderDashboard(); });
$('#filterSection') && $('#filterSection').addEventListener('change', e => { state.filter.section = e.target.value; renderDashboard(); });
$('#sortBy') && $('#sortBy').addEventListener('change', e => { state.filter.sort = e.target.value; renderDashboard(); });
$('#refreshBtn') && $('#refreshBtn').addEventListener('click', loadResults);
$('#exportCsv') && $('#exportCsv').addEventListener('click', () => exportFile('csv'));
$('#exportXls') && $('#exportXls').addEventListener('click', () => exportFile('xls'));

function exportFile(fmt) {
  if (!state.results.length) { toast('暂无数据可导出'); return; }
  if (fmt === 'xls') { const html = buildXls(state.results); downloadFile('quiz_results.xls', html, 'application/vnd.ms-excel'); toast('已开始导出 Excel'); }
  else { const csv = buildCsv(state.results); downloadFile('quiz_results.csv', '﻿' + csv, 'text/csv'); toast('已开始导出 CSV'); }
}
function buildCsv(all) {
  const header = ['序号', '姓名', '班级', '练习（部分）', '得分', '正确率(%)', '提交时间'];
  const rows = [header.join(',')];
  all.forEach((r, i) => {
    const row = [i + 1, r.name, r.className, r.partName || r.sectionTitle || '', `${r.score}/${r.total}`, r.percent, new Date(r.submittedAt).toLocaleString('zh-CN')];
    rows.push(row.map(csvEscape).join(','));
  });
  return rows.join('\r\n');
}
function csvEscape(v) { const s = String(v == null ? '' : v); if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'; return s; }
function buildXls(all) {
  let thead = '<tr><th>序号</th><th>姓名</th><th>班级</th><th>练习（部分）</th><th>得分</th><th>正确率(%)</th><th>提交时间</th></tr>';
  let tbody = '';
  all.forEach((r, i) => { const tr = `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.className}</td><td>${r.partName || r.sectionTitle || ''}</td><td>${r.score}/${r.total}</td><td>${r.percent}</td><td>${new Date(r.submittedAt).toLocaleString('zh-CN')}</td></tr>`; tbody += tr; });
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
}
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function findQuestion(qid) { let f = null; state.quiz.parts.forEach(p => p.sections.forEach(s => s.questions.forEach(q => { if (q.id === qid) f = q; }))); return f; }
function formatAnswer(q, ans) {
  if (ans === undefined || ans === null) return '（未作答）';
  if (q.type === 'multiple') { const arr = Array.isArray(ans) ? ans : [ans]; return arr.map(i => String.fromCharCode(65 + i)).join('、') || '（空）'; }
  return String.fromCharCode(65 + ans);
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200); }

init();
"""

js = JS.replace("__QUIZ__", quiz_json)

doc = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>《人工智能通识》模块一 · 课堂练习平台</title>
  <style>{css}</style>
</head>
<body>{body}
  <script>{js}</script>
</body>
</html>
"""

with io.open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write(doc)

# 统计校验
tot = 0
for p in quiz["parts"]:
    for s in p["sections"]:
        tot += len(s["questions"])
q1 = quiz["parts"][0]["sections"][0]["questions"][0]["stem"]
print(f"生成成功：{OUT_FILE}")
print(f"总题数 {tot} | 第1题 stem: {q1}")

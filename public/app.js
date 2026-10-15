// ====== 全局状态 ======
const state = {
  quiz: null,
  answers: {},        // { qid: number }
  student: null,      // {name, className}
  currentSection: null,
  teacherToken: sessionStorage.getItem('teaToken') || '',
  results: [],
  filter: { search: '', cls: '', section: '', sort: 'time' },
  lastDetails: null,
};

// 接口根地址：优先同源；否则回退到 http://localhost:3000（适配静态预览 / 本地文件打开）
let API_ROOT = '';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

// 本地最佳成绩（按小节记录，便于学生端列表展示）
const BEST_KEY = 'ai_quiz_best_v1';
function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } }
function saveBest(secId, percent) {
  const m = loadBest();
  if (!(secId in m) || percent > m[secId]) { m[secId] = percent; localStorage.setItem(BEST_KEY, JSON.stringify(m)); }
}

// ====== 初始化 ======
async function init() {
  try {
    const res = await fetch('api/quiz');
    if (res.ok) { state.quiz = await res.json(); API_ROOT = ''; }
    else throw new Error();
  } catch (e) {
    try {
      const res2 = await fetch('http://localhost:3000/api/quiz');
      if (res2.ok) { state.quiz = await res2.json(); API_ROOT = 'http://localhost:3000'; }
      else throw new Error();
    } catch (e2) { toast('加载题库失败：请确认服务已启动（node server.js）'); }
  }
  if (state.quiz) {
    $('#secCount').textContent = countSections(state.quiz);
    $('#qCount').textContent = countQuestions(state.quiz);
  }
  bindGlobal();
  checkAutoLogin();
}

function countSections(quiz) { let n = 0; quiz.parts.forEach(p => n += p.sections.length); return n; }
function countQuestions(quiz) { let n = 0; quiz.parts.forEach(p => p.sections.forEach(s => n += s.questions.length)); return n; }
function findSection(secId) {
  let found = null;
  state.quiz.parts.forEach(p => p.sections.forEach(s => { if (s.id === secId) found = s; }));
  return found;
}
function allSections() {
  const list = [];
  state.quiz.parts.forEach(p => p.sections.forEach(s => list.push({ id: s.id, title: s.title })));
  return list;
}

function bindGlobal() {
  $$('.role-card').forEach(c => c.addEventListener('click', () => {
    if (c.dataset.role === 'student') showStudent();
    else showTeacher();
  }));
  $('#backHome').addEventListener('click', showHome);
}

// ====== 视图切换 ======
function showView(id) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
  $('#backHome').classList.toggle('hidden', id === 'home');
}
function showHome() { showView('home'); }

// ====== 学生端 ======
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
  if (!state.quiz) { toast('题库尚未加载，请刷新页面或确认服务已启动'); return; }
  state.student = { name, className: cls || '未填写' };
  renderPracticeList();
  $('#studentForm').classList.add('hidden');
  $('#practiceList').classList.remove('hidden');
  window.scrollTo(0, 0);
});

function renderPracticeList() {
  $('#plStuInfo').textContent = `${state.student.name}（${state.student.className}）`;
  const best = loadBest();
  const body = $('#plBody');
  body.innerHTML = '';
  state.quiz.parts.forEach(part => {
    const pg = document.createElement('div');
    pg.className = 'pl-part';
    const grid = document.createElement('div');
    grid.className = 'pl-grid';
    part.sections.forEach(sec => {
      const bestPct = best[sec.id];
      const card = document.createElement('div');
      card.className = 'pl-card';
      card.innerHTML = `
        <div class="pl-card-title">${escapeHtml(part.name)}</div>
        <div class="pl-card-sub">${escapeHtml(sec.title)}</div>
        <div class="pl-card-meta">${sec.questions.length} 题 · 单选+判断</div>
        <div class="pl-card-best">${bestPct !== undefined ? '最佳：' + bestPct + '%' : '未练习'}</div>
        <button class="btn-primary pl-start" data-sec="${sec.id}">开始练习</button>`;
      card.querySelector('.pl-start').addEventListener('click', () => startSection(sec.id));
      grid.appendChild(card);
    });
    pg.appendChild(grid);
    body.appendChild(pg);
  });
}

function findPartOf(secId) {
  return state.quiz.parts.find(p => p.sections.some(s => s.id === secId)) || null;
}

function startSection(secId) {
  const sec = findSection(secId);
  if (!sec) return;
  const part = findPartOf(secId);
  state.currentSection = sec;
  state.answers = {};
  renderQuizSection(sec);
  $('#practiceList').classList.add('hidden');
  $('#resultWrap').classList.add('hidden');
  $('#quizWrap').classList.remove('hidden');
  $('#stuInfo').textContent = `${state.student.name}（${state.student.className}）`;
  $('#quizSecName').textContent = part ? part.name : sec.title;
  window.scrollTo(0, 0);
}

function renderQuizSection(sec) {
  const body = $('#quizBody');
  body.innerHTML = '';
  sec.questions.forEach(q => body.appendChild(renderQuestion(q)));
  updateProgress();
}

function renderQuestion(q) {
  const el = document.createElement('div');
  el.className = 'q';
  const tagClass = q.type === 'single' ? 'tag-single' : 'tag-judge';
  const tagText = q.type === 'single' ? '单选' : '判断';
  el.innerHTML = `<div class="q-stem"><span class="q-tag ${tagClass}">${tagText}</span>${escapeHtml(q.stem)}</div>`;
  const opts = document.createElement('div');
  q.options.forEach((opt, i) => {
    const o = document.createElement('label');
    o.className = 'opt';
    o.innerHTML = `<input type="radio" name="${q.id}" value="${i}" />
      <span class="opt-text">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</span>`;
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
  const sec = state.currentSection;
  if (!sec) return;
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
async function submitQuiz() {
  $('#submitQuiz').disabled = true;
  try {
    const res = await fetch(API_ROOT + '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.student.name,
        className: state.student.className,
        sectionId: state.currentSection.id,
        answers: state.answers
      })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || '提交失败'); $('#submitQuiz').disabled = false; return; }
    saveBest(data.sectionId, data.percent);
    renderResult(data);
  } catch (e) {
    toast('提交失败，请检查网络');
    $('#submitQuiz').disabled = false;
  }
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
  const d = document.createElement('div');
  d.className = 'pb';
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
    rv.innerHTML = `
      <div class="rv-head"><span class="rv-badge ${d.correct ? 'badge-ok' : 'badge-no'}">${d.correct ? '正确' : '错误'}</span> ${i + 1}. ${escapeHtml(d.stem)}</div>
      <div class="rv-line">你的答案：${selText}</div>
      <div class="rv-line">正确答案：${ansText}</div>
      <div class="rv-exp">解析：${escapeHtml(d.explain || '')}</div>`;
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

// ====== 教师端 ======
function showTeacher() {
  showView('teacher');
  if (state.teacherToken) {
    enterTeacher(state.teacherToken);
  } else {
    $('#teacherLogin').classList.remove('hidden');
    $('#teacherDash').classList.add('hidden');
    $('#teaErr').textContent = '';
    loadTeaQr();
  }
}

// 加载教师端访问码二维码（手机扫码直达教师端）
function loadTeaQr() {
  const img = $('#teaQr');
  if (!img) return;
  fetch(API_ROOT + '/api/teacher-qr?t=' + Date.now())
    .then(r => r.json())
    .then(d => {
      if (d && d.svg) {
        img.src = 'data:image/svg+xml;base64,' + d.svg;
        img.alt = '教师端访问码二维码';
        img.onerror = () => { const w = $('#teaQrWrap'); if (w) w.classList.add('hidden'); };
      } else {
        const w = $('#teaQrWrap'); if (w) w.classList.add('hidden');
      }
    })
    .catch(() => { const w = $('#teaQrWrap'); if (w) w.classList.add('hidden'); });
  fetch(API_ROOT + '/api/info').then(r => r.json()).then(d => {
    if (d && d.ip && d.ip !== 'localhost') {
      $('#teaLanTip').textContent = `手机扫码需与本机同一局域网；或也可访问：http://${d.ip}:${d.port}`;
    }
  }).catch(() => {});
}

// 进入教师端（手动输入 / 扫码自动登录 共用）
function enterTeacher(token) {
  token = (token || '').trim();
  if (!token) { $('#teaErr').textContent = '请输入访问码'; return; }
  state.teacherToken = token;
  sessionStorage.setItem('teaToken', token);
  showView('teacher');
  $('#teacherLogin').classList.add('hidden');
  $('#teacherDash').classList.remove('hidden');
  loadResults();
}

$('#teaLogin') && $('#teaLogin').addEventListener('click', () => {
  enterTeacher($('#teaToken').value.trim());
});

// 扫码进入：URL 带 ?token=xxx&role=teacher 时自动登录
function checkAutoLogin() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const role = params.get('role');
  if (role === 'teacher' && token) {
    history.replaceState(null, '', location.pathname); // 清掉 URL 中的明文访问码
    enterTeacher(token);
  }
}

async function loadResults() {
  try {
    const res = await fetch(API_ROOT + '/api/results?token=' + encodeURIComponent(state.teacherToken));
    const data = await res.json();
    if (!res.ok) {
      // 访问码错误/失效：退回登录框
      $('#teacherLogin').classList.remove('hidden');
      $('#teacherDash').classList.add('hidden');
      $('#teaErr').textContent = data.error || '访问码错误';
      loadTeaQr();
      return;
    }
    state.results = data.results || [];
    renderDashboard();
  } catch (e) { toast('加载成绩失败'); }
}

function renderDashboard() {
  const r = applyFilter(state.results);
  const stats = $('#stats');
  if (r.length === 0) {
    stats.innerHTML = '';
    $('#emptyTip').classList.remove('hidden');
  } else {
    $('#emptyTip').classList.add('hidden');
    const percents = r.map(x => x.percent);
    const avg = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length * 10) / 10;
    const max = Math.max(...percents);
    const pass = percents.filter(p => p >= 60).length;
    const passRate = Math.round(pass / percents.length * 1000) / 10;
    stats.innerHTML = `
      <div class="stat"><div class="v">${r.length}</div><div class="k">提交人次</div></div>
      <div class="stat"><div class="v">${avg}%</div><div class="k">平均正确率</div></div>
      <div class="stat"><div class="v">${max}%</div><div class="k">最高正确率</div></div>
      <div class="stat"><div class="v">${passRate}%</div><div class="k">及格率(≥60%)</div></div>`;
  }
  renderSectionOverview();
  renderTable(r);
  // 班级 & 练习下拉
  const classes = [...new Set(state.results.map(x => x.className))].sort();
  const sel = $('#filterClass');
  const curC = sel.value;
  sel.innerHTML = '<option value="">全部班级</option>' + classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (classes.includes(curC)) sel.value = curC;

  const secList = allSections();
  const ssel = $('#filterSection');
  const curS = ssel.value;
  ssel.innerHTML = '<option value="">全部练习</option>' + secList.map(s => {
    const part = findPartOf(s.id);
    return `<option value="${s.id}">${escapeHtml(part ? part.name : s.title)}</option>`;
  }).join('');
  if (secList.some(s => s.id === curS)) ssel.value = curS;
}

function renderSectionOverview() {
  const secList = allSections();
  const map = {};
  secList.forEach(s => {
    const part = findPartOf(s.id);
    map[s.id] = { title: part ? part.name : s.title, sum: 0, n: 0, pass: 0 };
  });
  state.results.forEach(x => {
    if (map[x.sectionId]) { map[x.sectionId].sum += x.percent; map[x.sectionId].n++; if (x.percent >= 60) map[x.sectionId].pass++; }
  });
  const wrap = $('#sectionOverview');
  const cards = secList.map(s => {
    const m = map[s.id];
    const avg = m.n ? Math.round(m.sum / m.n * 10) / 10 : null;
    const lvl = avg === null ? 'lv-none' : avg >= 80 ? 'lv-good' : avg >= 60 ? 'lv-mid' : 'lv-bad';
    return `<div class="so-card ${lvl}">
      <div class="so-name">${escapeHtml(m.title)}</div>
      <div class="so-v">${avg === null ? '—' : avg + '%'}</div>
      <div class="so-meta">${m.n} 人次 · 及格 ${m.pass}</div>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="so-title">各部分练习情况（平均正确率）</div><div class="so-cards">${cards}</div>`;
}

function applyFilter(list) {
  let r = list.slice();
  const { search, cls, section, sort } = state.filter;
  if (search) {
    const s = search.toLowerCase();
    r = r.filter(x => x.name.toLowerCase().includes(s) || x.className.toLowerCase().includes(s));
  }
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
    return `<tr>
      <td>${i + 1}</td>
      <td class="cell-name">${escapeHtml(x.name)}</td>
      <td>${escapeHtml(x.className)}</td>
      <td>${escapeHtml(x.partName || x.sectionTitle || '')}</td>
      <td>${x.score}/${x.total}</td>
      <td class="${cls}">${x.percent}%</td>
      <td>${new Date(x.submittedAt).toLocaleString('zh-CN')}</td>
    </tr>`;
  }).join('');
}

// 教师端事件
$('#searchName') && $('#searchName').addEventListener('input', e => { state.filter.search = e.target.value; renderDashboard(); });
$('#filterClass') && $('#filterClass').addEventListener('change', e => { state.filter.cls = e.target.value; renderDashboard(); });
$('#filterSection') && $('#filterSection').addEventListener('change', e => { state.filter.section = e.target.value; renderDashboard(); });
$('#sortBy') && $('#sortBy').addEventListener('change', e => { state.filter.sort = e.target.value; renderDashboard(); });
$('#refreshBtn') && $('#refreshBtn').addEventListener('click', loadResults);
$('#exportCsv') && $('#exportCsv').addEventListener('click', () => exportFile('csv'));
$('#exportXls') && $('#exportXls').addEventListener('click', () => exportFile('xls'));

function exportFile(fmt) {
  if (!state.results.length) { toast('暂无数据可导出'); return; }
  const p = new URLSearchParams();
  p.set('token', state.teacherToken);
  p.set('format', fmt);
  if (state.filter.cls) p.set('class', state.filter.cls);
  if (state.filter.section) p.set('section', state.filter.section);
  const label = state.filter.cls ? '（' + state.filter.cls + '）' : (state.filter.section ? '（当前小节）' : '（全部）');
  window.location.href = API_ROOT + '/api/export?' + p.toString();
  toast('已开始导出 ' + (fmt === 'xls' ? 'Excel' : 'CSV') + label);
}

// ====== 工具 ======
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function findQuestion(qid) {
  let found = null;
  state.quiz.parts.forEach(p => p.sections.forEach(s => s.questions.forEach(q => { if (q.id === qid) found = q; })));
  return found;
}
function formatAnswer(q, ans) {
  if (ans === undefined || ans === null) return '（未作答）';
  if (q.type === 'multiple') {
    const arr = Array.isArray(ans) ? ans : [ans];
    return arr.map(i => String.fromCharCode(65 + i)).join('、') || '（空）';
  }
  return String.fromCharCode(65 + ans);
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

init();

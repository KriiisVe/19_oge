const screen = document.getElementById('screen');

const SETTINGS = {
  ticketsPerSession: 12,     // сколько билетов в одной тренировке
  questionsPerTicket: 3      // фиксировано 3 по условию
};

let state = {
  phase: 'idle',             // idle | quiz | result
  tickets: [],               // [ [q,q,q], ... ]
  tIndex: 0,
  qIndex: 0,
  correct: 0,                // количество верных ответов (по вопросам)
  total: 0,                  // всего вопросов
  answered: false,
  lastWasCorrect: null
};

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

async function loadQuestions(){
  const res = await fetch('./questions.json', { cache: 'no-store' });
  return await res.json();
}

function buildTickets(all){
  // 2 верных + 1 неверный в каждом билете
  const trues = shuffle(all.filter(q => q.isTrue === true));
  const falses = shuffle(all.filter(q => q.isTrue === false));

  const maxTickets = Math.min(Math.floor(trues.length / 2), falses.length);
  const count = Math.min(SETTINGS.ticketsPerSession, maxTickets);

  const tickets = [];
  for (let i=0; i<count; i++){
    const q1 = trues.pop();
    const q2 = trues.pop();
    const q3 = falses.pop();
    tickets.push(shuffle([q1,q2,q3]));
  }
  return tickets;
}

function progressPercent(){
  const done = state.tIndex * SETTINGS.questionsPerTicket + state.qIndex;
  return Math.round((done / state.total) * 100);
}

function render(){
  if (state.phase === 'idle') return renderStart();
  if (state.phase === 'quiz') return renderQuestion();
  if (state.phase === 'result') return renderResult();
}

function renderStart(){
  screen.innerHTML = `
    <div class="meta">
      <div>Сессия: <b>${SETTINGS.ticketsPerSession}</b> билетов</div>
      <div>По <b>3</b> утверждения: <b>2 верных</b> + <b>1 неверное</b></div>
    </div>
    <div class="spacer"></div>
    <div class="q">Отвечай на каждое утверждение: <b>верно</b> или <b>неверно</b>. После ответа увидишь подсказку и кнопку «Дальше».</div>
    <div class="spacer"></div>
    <div class="row">
      <button class="primary" id="btnStart">Начать</button>
      <button class="ghost" id="btnReset">Сброс</button>
    </div>
  `;

  document.getElementById('btnStart').onclick = start;
  document.getElementById('btnReset').onclick = reset;
}

function renderQuestion(){
  const ticket = state.tickets[state.tIndex];
  const q = ticket[state.qIndex];

  const done = state.tIndex * SETTINGS.questionsPerTicket + state.qIndex;
  const total = state.total;

  const bar = progressPercent();
  const ticketNum = state.tIndex + 1;
  const qNum = state.qIndex + 1;

  const disabled = state.answered ? 'disabled' : '';

  let feedbackHtml = '';
  if (state.answered){
    const ok = state.lastWasCorrect === true;
    const cls = ok ? 'ok' : 'no';
    const msg = ok ? 'Верно!' : 'Не совсем.';
    const correctText = q.isTrue ? 'верно' : 'неверно';
    feedbackHtml = `
      <div class="feedback ${cls}">
        <strong>${msg}</strong> Правильный ответ: <b>${correctText.toUpperCase()}</b>.
      </div>
      <div class="spacer"></div>
      <div class="row">
        <button class="primary" id="btnNext">Дальше</button>
      </div>
    `;
  }

  screen.innerHTML = `
    <div class="meta">
      <div>Билет <b>${ticketNum}</b> / ${state.tickets.length} • Вопрос <b>${qNum}</b> / 3</div>
      <div>${done} / ${total}</div>
    </div>
    <div class="spacer"></div>
    <div class="progress"><div class="bar" style="width:${bar}%;"></div></div>
    <div class="spacer"></div>
    <div class="q">${escapeHtml(q.text)}</div>
    <div class="spacer"></div>
    <div class="row">
      <button class="good" id="btnTrue" ${disabled}>Верно</button>
      <button class="bad" id="btnFalse" ${disabled}>Неверно</button>
      <button class="ghost" id="btnReset">Сброс</button>
    </div>
    ${feedbackHtml}
  `;

  document.getElementById('btnTrue').onclick = () => answer(true);
  document.getElementById('btnFalse').onclick = () => answer(false);
  document.getElementById('btnReset').onclick = reset;

  if (state.answered){
    document.getElementById('btnNext').onclick = next;
  }
}

function renderResult(){
  const total = state.total;
  const correct = state.correct;

  const pct = total ? Math.round((correct/total)*100) : 0;

  screen.innerHTML = `
    <div class="meta">
      <div>Готово ✅</div>
      <div>Результат</div>
    </div>
    <div class="spacer"></div>
    <div class="q">
      <div style="font-size:18px; margin-bottom:6px;"><b>${correct}</b> из <b>${total}</b> верно</div>
      <div class="muted">Точность: <b>${pct}%</b></div>
    </div>
    <div class="spacer"></div>
    <div class="row">
      <button class="primary" id="btnAgain">Ещё раз (новая выборка)</button>
      <button class="ghost" id="btnReset">Сброс</button>
    </div>
  `;

  document.getElementById('btnAgain').onclick = start;
  document.getElementById('btnReset').onclick = reset;
}

function answer(userTrue){
  if (state.answered) return;

  const q = state.tickets[state.tIndex][state.qIndex];
  const correct = (userTrue === q.isTrue);

  state.answered = true;
  state.lastWasCorrect = correct;
  if (correct) state.correct += 1;

  save();
  render();
}

function next(){
  if (!state.answered) return;

  state.answered = false;
  state.lastWasCorrect = null;

  // следующий вопрос / билет
  state.qIndex += 1;
  if (state.qIndex >= SETTINGS.questionsPerTicket){
    state.qIndex = 0;
    state.tIndex += 1;
  }

  // конец
  const done = state.tIndex >= state.tickets.length;
  if (done){
    state.phase = 'result';
  }

  save();
  render();
}

function reset(){
  localStorage.removeItem('pwa-oge-state');
  state = {
    phase: 'idle',
    tickets: [],
    tIndex: 0,
    qIndex: 0,
    correct: 0,
    total: 0,
    answered: false,
    lastWasCorrect: null
  };
  render();
}

function save(){
  localStorage.setItem('pwa-oge-state', JSON.stringify(state));
}

function restore(){
  try{
    const raw = localStorage.getItem('pwa-oge-state');
    if (!raw) return;
    const s = JSON.parse(raw);
    // минимальная валидация
    if (!s || typeof s !== 'object') return;
    if (!Array.isArray(s.tickets)) return;
    state = s;
  }catch{}
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

async function start(){
  const all = await loadQuestions();
  if (!all.every(q => typeof q.isTrue === 'boolean')){
    alert('В questions.json не у всех вопросов заполнен isTrue.');
    return;
  }
  const tickets = buildTickets(all);

  state.phase = 'quiz';
  state.tickets = tickets;
  state.tIndex = 0;
  state.qIndex = 0;
  state.correct = 0;
  state.total = tickets.length * SETTINGS.questionsPerTicket;
  state.answered = false;
  state.lastWasCorrect = null;

  save();
  render();
}

// PWA service worker
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

restore();
render();

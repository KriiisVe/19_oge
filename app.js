const screen = document.getElementById('screen');

// --- Настройки ---
const SETTINGS = {
  ticketsPerSession: 40,
  questionsPerTicket: 3,
  minTruePerTicket: 1,
  maxTruePerTicket: 2,
};

const STORAGE_KEY = 'oge19_pwa_state_v7';

let state = {
  phase: 'idle', // idle | quiz | result
  tickets: [],
  tIndex: 0,
  correctQuestions: 0,
  totalQuestions: SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket,
};

// --- Утилиты ---
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadQuestions() {
  const res = await fetch('./questions.json', { cache: 'no-store' });
  return await res.json();
}

function buildSession(questions) {
  const trues = questions.filter((q) => q.isTrue === true);
  const falses = questions.filter((q) => q.isTrue === false);

  const tickets = [];
  for (let t = 0; t < SETTINGS.ticketsPerSession; t++) {
    // В каждом билете случайно: 1 или 2 истинных утверждения (остальные ложные)
    const trueNeeded = (Math.random() < 0.5) ? SETTINGS.minTruePerTicket : SETTINGS.maxTruePerTicket;
    const falseNeeded = SETTINGS.questionsPerTicket - trueNeeded;

    const picked = new Map(); // чтобы не было дублей внутри билета

    while ([...picked.values()].filter((q) => q.isTrue).length < trueNeeded) {
      const q = sample(trues);
      if (!picked.has(q.id)) picked.set(q.id, q);
    }
    while ([...picked.values()].filter((q) => !q.isTrue).length < falseNeeded) {
      const q = sample(falses);
      if (!picked.has(q.id)) picked.set(q.id, q);
    }

    const qs = shuffle([...picked.values()]);

    tickets.push({
      qs,
      answers: Array(qs.length).fill(false), // false = не отмечено, true = отмечено как истинное
      revealed: false,
      score: null,
      trueNeeded,
    });
  }
  return tickets;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.tickets) && typeof s.tIndex === 'number') {
      state = s;
    }
  } catch {
    // ignore
  }
}

function reset() {
  state = {
    phase: 'idle',
    tickets: [],
    tIndex: 0,
    correctQuestions: 0,
    totalQuestions: SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket,
  };
  save();
  render();
}

function selectedCount(ticket) {
  return ticket.answers.filter(Boolean).length;
}

function selectionReady(ticket) {
  return selectedCount(ticket) === ticket.trueNeeded;
}

function evaluateTicket(ticket) {
  let correct = 0;
  for (let i = 0; i < ticket.qs.length; i++) {
    const q = ticket.qs[i];
    const picked = ticket.answers[i] === true;
    const ok = (picked === q.isTrue);
    if (ok) correct++;
  }
  ticket.score = correct;
  ticket.revealed = true;
  return correct;
}

function animateScreenSwap(cb) {
  // лёгкая анимация смены контента
  screen.classList.add('screenOut');
  setTimeout(() => {
    cb();
    screen.classList.remove('screenOut');
  }, 160);
}

// --- Рендеры ---
function renderIdle() {
  screen.innerHTML = `
    <div >
    <p class="task">Выберите одно или два верных утверждения </p>
    <div class="actions">
      <button class="primary" id="btnStart">Начать</button>
      <button class="secondary" id="btnReset">Сброс</button>
        </div>
    </div>
  `;

  document.getElementById('btnReset').onclick = reset;
  document.getElementById('btnStart').onclick = async () => {
    const questions = await loadQuestions();
    const ok = Array.isArray(questions) && questions.every((q) => typeof q.isTrue === 'boolean');
    if (!ok) {
      alert('В questions.json у всех вопросов должно быть поле isTrue (true/false).');
      return;
    }
    state.phase = 'quiz';
    state.tickets = buildSession(questions);
    state.tIndex = 0;
    state.correctQuestions = 0;
    state.totalQuestions = SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket;
    save();
    render();
  };
}

function renderQuiz() {
  const ticket = state.tickets[state.tIndex];
  const ticketNumber = state.tIndex + 1;
  const picked = selectedCount(ticket);

  const taskText = (ticket.trueNeeded === 1)
    ? 'Какое из следующих утверждений является истинным высказыванием?'
    : 'Какие из следующих утверждений являются истинными высказываниями?';

  let html = `
    <div class="ticketTitle">
      <div><b>Билет ${ticketNumber}/${SETTINGS.ticketsPerSession}</b></div>
      <div class="badge">Счёт: ${state.correctQuestions}/${state.totalQuestions}</div>
    </div>

   

    <div class="task">${taskText}</div>
<div class="hint">${ticket.revealed ? '' : 'Нажми ещё раз, чтобы снять выбор.'}</div>
    <div class="ticketBody ${ticket.revealed ? 'revealed' : ''}" id="ticketBody">
  `;

  ticket.qs.forEach((q, i) => {
    const isSelected = ticket.answers[i] === true;

    // после раскрытия добавляем классы истины и (при желании) ошибки
    let cls = 'q';
    if (isSelected) cls += ' selected';
    if (ticket.revealed) {
      cls += ' disabled';
      cls += q.isTrue ? ' correct' : ' wrong';
    }

    // подпись результата показываем только после раскрытия (CSS)
    // Доп. пояснение — только если ученик ошибся, чтобы не шуметь.
    let extra = '';
    if (ticket.revealed) {
      if (q.isTrue && !isSelected) extra = 'Нужно было отметить.';
      if (!q.isTrue && isSelected) extra = 'Отмечать не нужно.';
    }
    const labelText = ticket.revealed
      ? (q.isTrue ? 'Истинно' : 'Ложно')
      : (q.isTrue ? 'Истинно' : 'Ложно'); // скрыто до reveal

    html += `
      <div class="${cls}" data-i="${i}" role="button" tabindex="0">
        <p class="qText">${escapeHtml(q.text)}</p>
        <div class="resultLabel">${labelText}${extra ? `<small>${escapeHtml(extra)}</small>` : ''}</div>
      </div>
    `;
  });

  html += `</div>`;

  const canProceed = ticket.revealed ? true : selectionReady(ticket);
  const btnLabel = ticket.revealed
    ? (ticketNumber === SETTINGS.ticketsPerSession ? 'К результатам' : 'Следующий билет')
    : 'Дальше';

  html += `
    <div class="actions">
      <button class="primary" id="btnNext" ${canProceed ? '' : 'disabled'}>${btnLabel}</button>
      <button class="secondary" id="btnReset">Сброс</button>
    </div>
  `;

  if (ticket.revealed) {
    html += `<div class="resultLine"><b>${ticket.score}/3</b></div>`;
  }

  screen.innerHTML = html;

  // выбор карточек
  screen.querySelectorAll('.q[data-i]').forEach((card) => {
    card.onclick = () => {
      if (ticket.revealed) return;
      const i = Number(card.dataset.i);
      const already = ticket.answers[i] === true;

      if (already) {
        ticket.answers[i] = false;
      } else {
        if (selectedCount(ticket) >= ticket.trueNeeded) return;
        ticket.answers[i] = true;
      }

      save();
      render();
    };
  });

  document.getElementById('btnReset').onclick = reset;
  document.getElementById('btnNext').onclick = () => {
    if (!ticket.revealed) {
      // раскрываем текущий билет
      const score = evaluateTicket(ticket);
      state.correctQuestions += score;
      save();
      render();
      return;
    }

    // билет раскрыт — идём дальше
    if (ticketNumber === SETTINGS.ticketsPerSession) {
      animateScreenSwap(() => {
        state.phase = 'result';
        save();
        render();
      });
      return;
    }

    animateScreenSwap(() => {
      state.tIndex += 1;
      save();
      render();
    });
  };
}

function renderResult() {
  const total = state.totalQuestions;
  const correct = state.correctQuestions;
  const pct = Math.round((correct / total) * 100);
  const full = state.tickets.filter((t) => t.score === 3).length;

  screen.innerHTML = `
    <div class="row">
      <div><b>Готово!</b></div>
      <div class="badge">${correct}/${total} • ${pct}%</div>
    </div>

    <div class="small">
      Верных ответов: <b>${correct}</b> из <b>${total}</b>.<br/>
      Билетов на 3/3: <b>${full}</b> из <b>${SETTINGS.ticketsPerSession}</b>.
    </div>

    <div class="actions">
      <button class="primary" id="btnAgain">Ещё раз</button>
      <button class="secondary" id="btnReset">Сброс</button>
    </div>
  `;

  document.getElementById('btnReset').onclick = reset;
  document.getElementById('btnAgain').onclick = async () => {
    const questions = await loadQuestions();
    state.phase = 'quiz';
    state.tickets = buildSession(questions);
    state.tIndex = 0;
    state.correctQuestions = 0;
    state.totalQuestions = SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket;
    save();
    render();
  };
}

function render() {
  if (state.phase === 'quiz' && (!state.tickets || state.tickets.length !== SETTINGS.ticketsPerSession)) {
    state.phase = 'idle';
  }
  if (state.phase === 'idle') return renderIdle();
  if (state.phase === 'quiz') return renderQuiz();
  return renderResult();
}

// --- Безопасность: экранируем текст вопросов ---
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// --- PWA service worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

restore();
render();

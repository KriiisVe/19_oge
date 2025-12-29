const screen = document.getElementById('screen');

const SETTINGS = {
  ticketsPerSession: 30,
  questionsPerTicket: 3,
  // В билете может быть 1 или 2 истинных утверждения (остальные — ложные).
  // При нехватке вопросов используем повторения.
  minTruePerTicket: 1,
  maxTruePerTicket: 2
};

const STORAGE_KEY = "oge19_pwa_state_v3";

let state = {
  phase: 'idle',     // idle | quiz | result
  tickets: [],       // [{qs:[q,q,q], answers:[true/false/null,...], revealed:false}, ...]
  tIndex: 0,
  correctQuestions: 0,
  totalQuestions: SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket
};

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleWithReplacement(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

async function loadQuestions(){
  const res = await fetch('./questions.json', { cache:'no-store' });
  return await res.json();
}

function buildSession(questions){
  const trues = questions.filter(q => q.isTrue === true);
  const falses = questions.filter(q => q.isTrue === false);

  const tickets = [];
  for(let t=0; t<SETTINGS.ticketsPerSession; t++){
    // Сколько истинных в этом билете: 1 или 2 (случайно)
    const trueNeeded = (Math.random() < 0.5) ? SETTINGS.minTruePerTicket : SETTINGS.maxTruePerTicket;
    const falseNeeded = SETTINGS.questionsPerTicket - trueNeeded;

    const picked = new Map(); // id -> q, чтобы не было дублей в билете

    // набираем истинные
    while([...picked.values()].filter(q=>q.isTrue).length < trueNeeded){
      const q = sampleWithReplacement(trues);
      if(!picked.has(q.id)) picked.set(q.id, q);
    }
    // набираем ложные
    while([...picked.values()].filter(q=>!q.isTrue).length < falseNeeded){
      const q = sampleWithReplacement(falses);
      if(!picked.has(q.id)) picked.set(q.id, q);
    }

    const qs = shuffle([...picked.values()]);
    tickets.push({
      qs,
      answers: Array(qs.length).fill(null), // true/false
      revealed: false,
      score: null, // сколько верно в этом билете
      trueNeeded
    });
  }
  return tickets;
}

function save(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){}
}

function reset(){
  state = {
    phase:'idle',
    tickets:[],
    tIndex:0,
    correctQuestions:0,
    totalQuestions: SETTINGS.ticketsPerSession * SETTINGS.questionsPerTicket
  };
  save();
  render();
}

function restore(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(!s || typeof s !== 'object') return;
    // минимальная валидация
    if(Array.isArray(s.tickets) && typeof s.tIndex === 'number'){
      state = s;
    }
  }catch(e){}
}

function allAnswered(ticket){
  // Нужно отметить ровно столько истинных, сколько в этом билете задумано
  return ticket.answers.filter(a => a === true).length === ticket.trueNeeded;
}

function evaluateTicket(ticket){
  // считаем верные ответы по 3 вопросам
  let correct = 0;
  for(let i=0;i<ticket.qs.length;i++){
    const q = ticket.qs[i];
    const a = ticket.answers[i];
    const userAns = (a === true);
      const isCorrect = (userAns === q.isTrue);
    if(isCorrect) correct++;
  }
  ticket.score = correct;
  ticket.revealed = true;

  // обновим общий счёт: добавляем только при первом раскрытии
  // (на всякий случай: если раскрыт повторно — не добавляем)
  return correct;
}

function renderIdle(){
  screen.innerHTML = `
    <div class="actions">
      <button class="primary" id="btnStart">Начать</button>
      <button class="secondary" id="btnReset">Сброс</button>
    </div>
  `;

  document.getElementById('btnStart').onclick = async () => {
    const questions = await loadQuestions();

    // если вдруг нет ключей
    const ok = questions.every(q => typeof q.isTrue === 'boolean');
    if(!ok){
      alert('В questions.json должны быть поля isTrue (true/false) для всех вопросов.');
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

  document.getElementById('btnReset').onclick = reset;
};

function renderQuiz(){
  const ticket = state.tickets[state.tIndex];
  const ticketNumber = state.tIndex + 1;

  const answeredCount = ticket.answers.filter(a => a === true).length;

  const taskText = (ticket.trueNeeded === 1)
    ? "Какое из следующих утверждений является истинным высказыванием?"
    : "Какие из следующих утверждений являются истинными высказываниями?";

  let html = `
    <div class="ticketTitle">
      <div>
        <b>Билет ${ticketNumber}/${SETTINGS.ticketsPerSession}</b>
      </div>
      <div class="badge">Счёт: ${state.correctQuestions}/${state.totalQuestions}</div>
    </div>

 

    <div class="task">${taskText}</div>
  `;

  ticket.qs.forEach((q, i) => {
    const a = ticket.answers[i];
    const isSelected = a === true;

    let cls = "q";
    if(isSelected) cls += " selected";
    if(ticket.revealed) cls += " disabled";
    let hint = "";
    if(ticket.revealed){
      const userAns = (a === true);
      const isCorrect = (userAns === q.isTrue);
      cls += isCorrect ? " correct" : " wrong";
      hint = `<div class="hint ${isCorrect ? "good":"bad"}">${isCorrect ? "✅" : "❌"}</div>`;
    }

    html += `
      <div class="${cls}" data-i="${i}" role="button" tabindex="0" aria-label="Отметить утверждение">
        <p class="qText">${q.text}</p>
        ${hint}
      </div>
    `;
  });

  const canNext = ticket.revealed ? true : allAnswered(ticket);
  const btnLabel = ticket.revealed
    ? (ticketNumber === SETTINGS.ticketsPerSession ? "К результатам" : "Следующий билет")
    : "Дальше";

  html += `
    <div class="actions">
      <button class="primary" id="btnNext" ${canNext ? "" : "disabled"}>${btnLabel}</button>
      <button class="secondary" id="btnReset">Сброс</button>
    </div>
  `;

  if(ticket.revealed){
    html += `<div class="resultLine"><b>${ticket.score}/3</b></div>`;
  }

  screen.innerHTML = html;

  // Клик по карточке: отметить/снять отметку
  screen.querySelectorAll('.q[data-i]').forEach(card => {
    card.onclick = () => {
      if(ticket.revealed) return;
      const i = Number(card.dataset.i);
      const currentlySelected = ticket.answers.filter(a => a === true).length;
      const selected = ticket.answers[i] === true;

      if(selected){
        ticket.answers[i] = null;
      } else {
        if(currentlySelected >= ticket.trueNeeded){
          return;
        }
        ticket.answers[i] = true;
      }
      save();
      render();
    };
  });

  document.getElementById('btnReset').onclick = reset;

  document.getElementById('btnNext').onclick = () => {
    if(!ticket.revealed){
      // раскрываем и считаем, сколько правильных в билете, и добавляем в общий счёт
      const before = ticket.revealed;
      const score = evaluateTicket(ticket);
      if(!before){
        state.correctQuestions += score;
      }
      save();
      render();
      return;
    }

    // если билет уже раскрыт — идём дальше/к результатам
    if(ticketNumber === SETTINGS.ticketsPerSession){
      state.phase = 'result';
      save();
      render();
      return;
    }

    state.tIndex += 1;
    save();
    render();
  };
}

function renderResult(){
  const total = state.totalQuestions;
  const correct = state.correctQuestions;
  const pct = Math.round((correct / total) * 100);

  // Дополнительно: сколько билетов решены полностью (3/3)
  const full = state.tickets.filter(t => t.score === 3).length;

  screen.innerHTML = `
    <div class="row">
      <div><b>Готово!</b></div>
      <div class="progress">${correct}/${total} • ${pct}%</div>
    </div>

    <div class="small">
      Верных ответов: <b>${correct}</b> из <b>${total}</b>.<br/>
      Билетов на 3/3: <b>${full}</b> из <b>${SETTINGS.ticketsPerSession}</b>.
    </div>

    <div class="actions">
      <button class="primary" id="btnAgain">Пройти ещё раз</button>
      <button class="secondary" id="btnReset">Сброс</button>
    </div>

    <div class="small">
      Каждый раз вопросы в билетах выбираются случайно.
    </div>
  `;

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

  document.getElementById('btnReset').onclick = reset;
}

function render(){
  if(state.phase === 'quiz' && (!state.tickets || state.tickets.length !== SETTINGS.ticketsPerSession)){
    // если состояние битое
    state.phase = 'idle';
  }

  if(state.phase === 'idle') return renderIdle();
  if(state.phase === 'quiz') return renderQuiz();
  return renderResult();
}

// PWA service worker
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

restore();
render();

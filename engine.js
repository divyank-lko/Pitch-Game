// ================================================================
// PITCH — Game Engine
// All game logic, state, rendering, sharing, Supabase
// ================================================================

// ── Config ──
const DOMAIN     = 'pitchcrickettrivia.in';
const MAX_GUESSES= 5;
const MAX_CLUES  = 4;
// Scoring: correct on guess N = (MAX_GUESSES+1-N) points
// Guess 1=5pts, Guess 2=4pts, Guess 3=3pts, Guess 4=2pts, Guess 5=1pt

// ── Milestones ──
const MILESTONES=[
  {min:100,key:'m_immortal',icon:'💫',color:'#E8D5FF',bg:'#3D1A6E'},
  {min:50, key:'m_god',     icon:'🙏',color:'#FFE4CC',bg:'#7A3000'},
  {min:30, key:'m_legend',  icon:'🐐',color:'#E8D5FF',bg:'#4A0080'},
  {min:20, key:'m_champion',icon:'👑',color:'#FFF4CC',bg:'#6B4A00'},
  {min:15, key:'m_pro',     icon:'⭐',color:'#CCFFE8',bg:'#004D20'},
  {min:10, key:'m_elite',   icon:'🏆',color:'#CCE8FF',bg:'#003B6B'},
  {min:7,  key:'m_awesome', icon:'🔥',color:'#FFD0D0',bg:'#6B0010'},
  {min:5,  key:'m_super',   icon:'💥',color:'#FFE4CC',bg:'#6B2A00'},
  {min:3,  key:'m_great',   icon:'🌟',color:'#FFF4CC',bg:'#5A4000'},
  {min:2,  key:'m_player',  icon:'⚡',color:'#D0D0D0',bg:'#2A2A2A'},
  {min:1,  key:'m_rookie',  icon:'🏏',color:'#C8D8C8',bg:'#1A2E1A'},
  {min:0,  key:'m_newcomer',icon:'🎯',color:'#B0B8B0',bg:'#1A2A1A'},
];
const getMilestone = s => MILESTONES.find(m=>s>=m.min)||MILESTONES[MILESTONES.length-1];

// ── Language ──
window.PITCH_LANG = localStorage.getItem('pitch_lang') || null;

function setLang(lang) {
  window.PITCH_LANG = lang;
  localStorage.setItem('pitch_lang', lang);
}

// ── Storage helpers ──
const getStats   = () => JSON.parse(localStorage.getItem('pitch_stats')||'{"played":0,"won":0,"streak":0,"maxStreak":0}');
const saveStats  = s  => localStorage.setItem('pitch_stats', JSON.stringify(s));
const getNick    = ()  => localStorage.getItem('pitch_nick')||'';
const setNick    = n   => localStorage.setItem('pitch_nick',n);
const getTodayR  = ()  => JSON.parse(localStorage.getItem(`pitch_r_${TODAY}`)||'null');
const saveTodayR = d   => localStorage.setItem(`pitch_r_${TODAY}`, JSON.stringify(d));
const getPracR   = i   => JSON.parse(localStorage.getItem(`pitch_p_${i}`)||'null');
const savePracR  = (i,d)=> localStorage.setItem(`pitch_p_${i}`, JSON.stringify(d));

// ── Date / puzzle ──
let TODAY, PUZZLE_NUM, TODAY_PLAYER;

function initDate() {
  TODAY       = new Date().toISOString().split('T')[0];
  PUZZLE_NUM  = Math.floor((new Date(TODAY)-new Date('2024-01-01'))/86400000)+1;
  TODAY_PLAYER= getDailyPuzzle(TODAY);
}

function fmtTime(s) {
  if(!s && s!==0) return '—';
  return s<60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
}
function fmtDisp(s) {
  const m=Math.floor(s/60), sec=s%60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}
function getWeekId() {
  const d=new Date(TODAY), day=d.getDay();
  const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
  return mon.toISOString().split('T')[0];
}

// ── Fuzzy matching engine ──
function levenshtein(a, b) {
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

function normalise(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ');
}

function findPlayer(input) {
  const q = normalise(input);
  if (!q) return {status:'empty'};

  // 1. Check aliases
  for (const [canonical, aliases] of Object.entries(PLAYER_ALIASES)) {
    if (aliases.some(a => normalise(a) === q)) {
      return {status:'match', name: canonical};
    }
  }

  // 2. Exact match (normalised)
  const exact = ALL_PLAYERS.find(p => normalise(p.n) === q);
  if (exact) return {status:'match', name: exact.n};

  // 3. Surname-only check
  const parts = q.split(' ');
  if (parts.length === 1) {
    const surname = parts[0];
    const matches = SURNAME_MAP[surname] || [];
    if (matches.length === 1) return {status:'match', name: matches[0]};
    if (matches.length > 1) return {status:'vague', count: matches.length};
    // No surname match — try fuzzy
  }

  // 4. Fuzzy match — Levenshtein ≤ 2
  let best = null, bestDist = 3;
  for (const p of ALL_PLAYERS) {
    const dist = levenshtein(q, normalise(p.n));
    if (dist < bestDist) { best=p.n; bestDist=dist; }
    // Also check first name + last name separately
    const nameParts = normalise(p.n).split(' ');
    for (const part of nameParts) {
      const d2 = levenshtein(q, part);
      if (d2 < bestDist && d2 <= 1) { best=p.n; bestDist=d2; }
    }
  }
  if (best && bestDist <= 2) return {status:'match', name: best};

  // 5. Contains check
  const contains = ALL_PLAYERS.filter(p => normalise(p.n).includes(q));
  if (contains.length === 1) return {status:'match', name: contains[0].n};
  if (contains.length > 1 && contains.length <= 3) return {status:'vague', count: contains.length};

  return {status:'notfound'};
}

// ── Game State ──
let state = {
  mode: 'today',      // 'today' | 'practice'
  player: null,
  practiceIdx: 0,
  cluesShown: 1,
  guessCount: 0,
  wrongGuesses: [],
  gameOver: false,
  won: false,
  timerSecs: 0,
  timerInterval: null,
  mqCurrent: 0,
  mqScore: 0,
  challengeData: null,
  acHighlight: -1,
};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  initDate();

  // Parse challenge URL param
  const params = new URLSearchParams(window.location.search);
  const c = params.get('c');
  if (c) {
    try {
      const [name, score, time, pNum] = c.split('-');
      state.challengeData = {name: decodeURIComponent(name), score: parseInt(score), time: parseInt(time), puzzleNum: parseInt(pNum)};
    } catch(e) {}
  }

  // Check if language is set
  if (!window.PITCH_LANG) {
    showScreen('langScreen');
    return;
  }

  initHome();
});

function initHome() {
  refreshHomeStats();
  buildPracticeList();

  if (SUPABASE_ON) {
    document.getElementById('homeLbSection').style.display = 'block';
    loadLeaderboard('homeLbBox', 'daily');
  }

  // Show challenge banner
  if (state.challengeData && state.challengeData.puzzleNum === PUZZLE_NUM) {
    const b = document.getElementById('homeChalBanner');
    const cd = state.challengeData;
    b.innerHTML = `<div class="cb-title">⚔️ ${t('chalFrom').toUpperCase()}: ${cd.name.toUpperCase()}</div>
      <div class="cb-body">${t('chalBody')}</div>
      <div class="cb-stats">${buildGrid({won:cd.score>0,score:cd.score,guessCount:MAX_GUESSES-cd.score+1})} · ${cd.score}/${MAX_GUESSES} pts · ⏱ ${fmtTime(cd.time)}</div>`;
    b.classList.add('show');
  }

  const existing = getTodayR();
  if (existing) {
    loadResult(existing);
    showScreen('resultScreen');
  } else {
    showScreen('homeScreen');
  }

  startCountdown();

  // Input listeners
  const gi = document.getElementById('guessInput');
  gi.addEventListener('keydown', e => {
    const items = document.querySelectorAll('#autocDrop .ac-item');
    if(e.key==='ArrowDown'){e.preventDefault();state.acHighlight=Math.min(state.acHighlight+1,items.length-1);renderAcHi(items);}
    else if(e.key==='ArrowUp'){e.preventDefault();state.acHighlight=Math.max(state.acHighlight-1,-1);renderAcHi(items);}
    else if(e.key==='Enter'){e.preventDefault();state.acHighlight>=0&&items[state.acHighlight]?selectAc(items[state.acHighlight].dataset.name):submitGuess();}
    else if(e.key==='Escape') closeAc();
  });
  gi.addEventListener('input', handleInput);
  document.addEventListener('click', e => { if(!e.target.closest('.guess-section')) closeAc(); });
  updateAllText();
}

// ── Language screen ──
function chooseLang(lang) {
  setLang(lang);
  updateAllText();
  initHome();
}

// ── Update all text to current language ──
function updateAllText() {
  document.querySelectorAll('[data-t]').forEach(el => {
    el.textContent = t(el.dataset.t);
  });
  document.querySelectorAll('[data-tp]').forEach(el => {
    el.placeholder = t(el.dataset.tp);
  });
  // Update logo subtitles
  const sub = document.getElementById('logoSub');
  if (sub) sub.textContent = t('logoSub');
}

// ── Screen management ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  updateAllText();
}

// ── Tabs ──
function switchTab(tab) {
  ['today','practice','stats'].forEach(t2 => {
    document.getElementById(`tab-${t2}`)?.classList.toggle('active', t2===tab);
    const el = document.getElementById(`tab-${t2}-content`);
    if (el) el.style.display = t2===tab ? 'block' : 'none';
  });
  if (tab==='stats') buildStatsGrid();
}

// ── Home stats ──
function refreshHomeStats() {
  const s=getStats(), m=getMilestone(s.streak);
  document.getElementById('homeStreakNum').textContent   = s.streak;
  document.getElementById('homeStreakIcon').textContent  = m.icon;
  document.getElementById('homeStreakLabel').textContent = t(m.key);
  document.getElementById('homeStreakLabel').style.color = m.color;
  document.getElementById('homeStreakCard').style.background = m.bg||'var(--card)';
  document.getElementById('homeStreakCard').style.borderColor = (m.color||'var(--border)')+'50';
  document.getElementById('homePlayed').textContent  = s.played;
  document.getElementById('homeWon').textContent     = s.won;
  document.getElementById('homeMax').textContent     = s.maxStreak;
  document.getElementById('homeWinPct').textContent  = s.played?Math.round(s.won/s.played*100)+'%':'—';
}

// ── Practice list ──
function buildPracticeList() {
  const list = document.getElementById('practiceList');
  list.innerHTML = '';
  const total = Math.min(PUZZLES.length, 20);
  for (let i=1; i<=total; i++) {
    const pIdx = (PUZZLE_NUM - i + PUZZLES.length*10) % PUZZLES.length;
    const player = PUZZLES[pIdx];
    const done = getPracR(pIdx);
    const div = document.createElement('div');
    div.className='pi';
    div.onclick = () => startGame('practice', pIdx);
    div.innerHTML = `
      <div>
        <div class="pi-num">PITCH #${Math.max(1,PUZZLE_NUM-i)} · ${i} ${window.PITCH_LANG==='hi'?'दिन पहले':'days ago'}</div>
        <div class="pi-name">${done?'??? ???':'??? ???'}</div>
      </div>
      <div style="text-align:right">
        ${done?`<div class="pi-done">${done.won?'✅':'❌'}</div><div class="pi-score">${done.score}/${MAX_GUESSES}pts · ${fmtTime(done.timeSeconds)}</div>`:'<div class="pi-done">▶</div>'}
      </div>`;
    list.appendChild(div);
  }
}

// ── Stats ──
function buildStatsGrid() {
  const s=getStats(), m=getMilestone(s.streak);
  document.getElementById('statsStreakNum').textContent   = s.streak;
  document.getElementById('statsStreakIcon').textContent  = m.icon;
  document.getElementById('statsStreakLabel').textContent = t(m.key);
  document.getElementById('statsStreakLabel').style.color = m.color;
  document.getElementById('statsStreakCard').style.background = m.bg||'var(--card)';
  document.getElementById('statsMaxStreak').textContent = s.maxStreak;

  const dist=[0,0,0,0,0,0]; // indices 0-5
  for(let k in localStorage) {
    if(k.startsWith('pitch_r_')||k.startsWith('pitch_p_')) {
      try{const r=JSON.parse(localStorage[k]);dist[r.score||0]++;}catch(e){}
    }
  }
  const max=Math.max(...dist,1);
  const grid = document.getElementById('statsDistGrid');
  if(grid) grid.innerHTML=[5,4,3,2,1,0].map(score=>{
    const count=dist[score]||0;
    const w=Math.round(count/max*100);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
      <div style="font-family:var(--font-d);font-size:18px;width:12px;color:var(--gold)">${score}</div>
      <div style="flex:1;height:18px;background:var(--surface);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${w}%;background:${score>=4?'var(--ok)':score>=2?'var(--gold)':'var(--red)'}"></div>
      </div>
      <div style="font-family:var(--font-m);font-size:12px;color:var(--muted);width:16px">${count}</div>
    </div>`;
  }).join('');
}

// ── Nickname modal ──
function openNickModal(cb) {
  document.getElementById('nameModal').classList.add('open');
  document.getElementById('nickInput').focus();
  const inp=document.getElementById('nickInput');
  const h=()=>{if(event.key==='Enter'){saveNick();inp.removeEventListener('keydown',h);}};
  inp.addEventListener('keydown',h);
  window._nickCb=cb;
}
function saveNick() {
  const v=document.getElementById('nickInput').value.trim();
  if(!v)return;
  setNick(v);
  document.getElementById('nameModal').classList.remove('open');
  if(window._nickCb)window._nickCb();
}

// ── Timer ──
function startTimer() {
  state.timerSecs=0;
  clearInterval(state.timerInterval);
  state.timerInterval=setInterval(()=>{
    state.timerSecs++;
    const el=document.getElementById('timerNum');
    if(el) el.textContent=fmtDisp(state.timerSecs);
  },1000);
}
function stopTimer(){clearInterval(state.timerInterval);}

// ── START GAME ──
function startGame(mode='today', practiceIdx=0) {
  if(mode==='today' && SUPABASE_ON && !getNick()) {
    openNickModal(()=>startGame(mode,practiceIdx));
    return;
  }
  state.mode         = mode;
  state.practiceIdx  = practiceIdx;
  state.player       = mode==='today' ? TODAY_PLAYER : getPracticePlayer(practiceIdx);
  state.cluesShown   = 1;
  state.guessCount   = 0;
  state.wrongGuesses = [];
  state.gameOver     = false;
  state.won          = false;
  state.acHighlight  = -1;

  buildDotsUI();
  renderClues();
  document.getElementById('prevGuesses').innerHTML='';
  document.getElementById('guessInput').value='';
  document.getElementById('gamePuzzleNum').textContent=`#${PUZZLE_NUM}`;
  document.getElementById('midgameShare').classList.remove('visible');
  document.getElementById('adMid').style.display='none';

  // Challenge mode bar
  const cb=document.getElementById('chalBar');
  if(state.challengeData&&state.challengeData.puzzleNum===PUZZLE_NUM&&mode==='today') {
    cb.classList.add('show');
  } else { cb.classList.remove('show'); }

  updateNextClueBtn();
  closeAc();
  startTimer();
  showScreen('gameScreen');
}

// ── Dots UI ──
function buildDotsUI() {
  const row=document.getElementById('attemptsRow');
  row.innerHTML='';
  for(let i=0;i<MAX_GUESSES;i++){
    const d=document.createElement('div');
    d.className='a-dot'+(i===0?' active':'');
    d.id=`dot_${i}`;
    row.appendChild(d);
  }
}
function updateDotsUI() {
  for(let i=0;i<MAX_GUESSES;i++){
    const d=document.getElementById(`dot_${i}`);
    if(!d)continue;
    d.className='a-dot';
    if(i<state.guessCount) d.classList.add(state.won&&i===state.guessCount-1?'won':'used');
    else if(i===state.guessCount&&!state.gameOver) d.classList.add('active');
  }
}

// ── Clues ──
function renderClues() {
  const lang=window.PITCH_LANG||'en';
  const stack=document.getElementById('cluesStack');
  stack.innerHTML='';
  const clueArr = state.player.clues[lang] || state.player.clues.en;
  for(let i=0;i<state.cluesShown;i++){
    const c=clueArr[i];
    const card=document.createElement('div');
    card.className='clue-card revealed';
    card.style.animationDelay=`${i*.07}s`;
    card.innerHTML=`
      <div class="clue-head">
        <span class="clue-num">${c.type}</span>
        <span class="clue-type">${c.label.toUpperCase()}</span>
      </div>
      <div class="clue-body">
        <div class="clue-value${c.mono?' mono':''}">${c.value}</div>
      </div>`;
    stack.appendChild(card);
  }
}

function revealNextClue() {
  if(state.cluesShown>=MAX_CLUES||state.gameOver)return;
  state.cluesShown++;
  renderClues();
  updateNextClueBtn();
  if(state.cluesShown>=3) document.getElementById('adMid').style.display='flex';
}
function updateNextClueBtn() {
  const btn=document.getElementById('nextClueBtn');
  if(!btn)return;
  if(state.cluesShown>=MAX_CLUES||state.gameOver){
    btn.disabled=true; btn.style.display='none';
  } else {
    btn.disabled=false; btn.style.display='block';
    const left=MAX_CLUES-state.cluesShown;
    btn.textContent=`${t('nextClue')} (${left} ${t('cluesLeft')})`;
  }
}

// ── Autocomplete ──
function handleInput() {
  const q=document.getElementById('guessInput').value.trim().toLowerCase();
  state.acHighlight=-1;
  if(q.length<2){closeAc();return;}
  const matches=ALL_PLAYERS.filter(p=>p.n.toLowerCase().includes(q)||
    (PLAYER_ALIASES[p.n]||[]).some(a=>a.includes(q))).slice(0,6);
  const drop=document.getElementById('autocDrop');
  if(!matches.length){closeAc();return;}
  drop.innerHTML='';
  matches.forEach(p=>{
    const item=document.createElement('div');
    item.className='ac-item'; item.dataset.name=p.n;
    item.innerHTML=`<span style="font-size:14px">🏏</span> ${p.n} <span style="font-size:11px;color:var(--muted);margin-left:auto">${p.c}</span>`;
    item.addEventListener('mousedown',e=>{e.preventDefault();selectAc(p.n);});
    drop.appendChild(item);
  });
  drop.classList.add('open');
}
function renderAcHi(items){items.forEach((el,i)=>el.classList.toggle('hi',i===state.acHighlight));}
function selectAc(name){document.getElementById('guessInput').value=name;closeAc();submitGuess();}
function closeAc(){const d=document.getElementById('autocDrop');d.classList.remove('open');d.innerHTML='';state.acHighlight=-1;}

// ── SUBMIT GUESS ──
function submitGuess() {
  if(state.gameOver)return;
  const input=document.getElementById('guessInput');
  const raw=input.value.trim();
  if(!raw)return;
  closeAc();

  const result = findPlayer(raw);

  if(result.status==='empty') return;

  if(result.status==='vague') {
    showToast(t('tooVague'));
    return; // NOT counted as wrong attempt
  }

  if(result.status==='notfound') {
    showToast(t('notFound'));
    shakeInput();
    // Count as wrong attempt — reveal next clue
    processWrongGuess(raw);
    return;
  }

  // We have a match
  const matchedName = result.name;

  if(state.wrongGuesses.includes(matchedName)) {
    showToast(t('alreadyGuessed'));
    return;
  }

  input.value='';
  state.guessCount++;

  if(normalise(matchedName)===normalise(state.player.name)) {
    // CORRECT
    state.won=true; state.gameOver=true;
    stopTimer();
    updateDotsUI();
    const score = Math.max(1, MAX_GUESSES+1-state.guessCount);
    endGame(true, score);
  } else {
    // WRONG
    processWrongGuess(matchedName);
  }
}

function processWrongGuess(name) {
  state.wrongGuesses.push(name);
  state.guessCount++;
  addWrongGuessUI(name);
  updateDotsUI();
  flashWrong();
  document.getElementById('midgameShare').classList.add('visible');

  if(state.guessCount>=MAX_GUESSES) {
    state.gameOver=true; stopTimer();
    setTimeout(()=>endGame(false,0), 600);
  } else {
    // Auto-reveal next clue on wrong guess
    if(state.cluesShown<MAX_CLUES) {
      state.cluesShown++;
      setTimeout(()=>{renderClues();updateNextClueBtn();},400);
    }
  }
}

function addWrongGuessUI(name) {
  const el=document.createElement('div'); el.className='prev-guess'; el.textContent=name;
  document.getElementById('prevGuesses').appendChild(el);
}
function flashWrong(){const el=document.createElement('div');el.className='wrong-flash';document.body.appendChild(el);setTimeout(()=>el.remove(),500);}
function shakeInput(){
  const inp=document.getElementById('guessInput');
  inp.style.borderColor='var(--red)';
  inp.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'none'}],{duration:350,easing:'ease'});
  setTimeout(()=>inp.style.borderColor='',700);
}
function showToast(msg){
  const t2=document.createElement('div');t2.className='toast';t2.textContent=msg;
  document.body.appendChild(t2);setTimeout(()=>t2.remove(),2200);
}

// ── Mid-game share ──
function shareMidGame() {
  const lang=window.PITCH_LANG||'en';
  const clueArr = state.player.clues[lang] || state.player.clues.en;
  const clue = clueArr[state.cluesShown-1];
  const txt = encodeURIComponent(
    `🏏 PITCH #${PUZZLE_NUM}\n\n${t('midShare').replace('📲 ','')}\n\n${t('clue2Label')}: "${clue.value}"\n\n${DOMAIN}`
  );
  window.open(`https://wa.me/?text=${txt}`,'_blank');
}

// ── END GAME ──
function endGame(didWin, score) {
  const stats=getStats();
  stats.played++;
  if(didWin){stats.won++;stats.streak++;stats.maxStreak=Math.max(stats.streak,stats.maxStreak);}
  else{stats.streak=0;}
  saveStats(stats);

  const result={won:didWin,score,guessCount:state.guessCount,cluesUsed:state.cluesShown,timeSeconds:state.timerSecs,player:state.player.name,streak:stats.streak,mode:state.mode};

  if(state.mode==='today') saveTodayR(result);
  else savePracR(state.practiceIdx, result);

  if(SUPABASE_ON&&didWin&&state.mode==='today') {
    submitScore({nickname:getNick(),score,cluesUsed:state.cluesShown,timeSeconds:state.timerSecs});
    submitWeeklyScore({nickname:getNick(),score});
  }

  setTimeout(()=>{
    loadResult(result);
    showScreen('resultScreen');
    if(didWin) launchConfetti();
  }, didWin?700:1100);
}

// ── RESULT SCREEN ──
const SCORE_MSGS={5:'score5',4:'score4',3:'score3',2:'score2',1:'score1',0:'score0lost'};

function loadResult(result) {
  const p = PUZZLES.find(x=>x.name===result.player) || TODAY_PLAYER;
  const stats=getStats();
  const lang=window.PITCH_LANG||'en';

  // Milestone banner
  const banner=document.getElementById('milestoneBanner');
  if(result.won&&result.streak>=3){
    const m=getMilestone(result.streak);
    banner.style.background=m.bg; banner.style.border=`1px solid ${m.color}40`;
    document.getElementById('mbIcon').textContent=m.icon;
    document.getElementById('mbStreak').textContent=result.streak;
    document.getElementById('mbStreak').style.color=m.color;
    document.getElementById('mbLabel').textContent=t(m.key);
    document.getElementById('mbLabel').style.color=m.color;
    document.getElementById('mbCap').textContent=t('streakKeep');
    banner.classList.add('show');
  } else { banner.classList.remove('show'); }

  // Outcome
  document.getElementById('resultOutcome').textContent=result.won?t('outcomeWon'):t('outcomeLost');
  document.getElementById('resultOutcome').className=`result-outcome ${result.won?'won':'lost'}`;

  const parts=p.name.split(' '), last=parts.pop();
  document.getElementById('resultPlayerName').innerHTML=`<span class="first">${parts.join(' ')} </span>${last}`;

  const msgKey = SCORE_MSGS[result.score] || 'score0lost';
  document.getElementById('resultSub').textContent = result.won ? t(msgKey) : (t('score0lost')+p.name);

  // Score row
  document.getElementById('rScore').textContent=result.won?result.score:'0';
  document.getElementById('rClues').textContent=result.cluesUsed;
  document.getElementById('rTime').textContent=fmtTime(result.timeSeconds);
  document.getElementById('rStreak').textContent=stats.streak;

  // Player card
  document.getElementById('playerCard').innerHTML=`
    <div class="pc-head">
      <span class="pc-flag">${p.flag}</span>
      <div><div class="pc-name">${p.name}</div><div class="pc-role">${p.country} · ${p.role}</div></div>
    </div>
    <div class="pc-stats">
      <div><div class="pc-sl">${t('matches')}</div><div class="pc-sv">${p.stats.matches}</div></div>
      <div><div class="pc-sl">${t('runsWkts')}</div><div class="pc-sv">${p.stats.runs}</div></div>
      <div><div class="pc-sl">${t('average')}</div><div class="pc-sv">${p.stats.avg}</div></div>
      <div><div class="pc-sl">${t('era')}</div><div class="pc-sv">${p.stats.era}</div></div>
    </div>`;

  // Did You Know
  const dyk = p.fact?.[lang] || p.fact?.en || '';
  const more = p.moreFacts?.[lang] || p.moreFacts?.en || '';
  document.getElementById('dykText').textContent = dyk;
  document.getElementById('dykExtra').textContent = more;
  document.getElementById('dykMore').style.display = more ? 'block' : 'none';

  // Mini Quiz — pick clues based on current lang
  initMQ(p, lang);

  // Share card
  const grid=buildGrid(result);
  document.getElementById('scNum').textContent=`#${PUZZLE_NUM}`;
  document.getElementById('scGrid').textContent=grid;
  document.getElementById('scText').textContent=result.won?`${result.score}/${MAX_GUESSES} pts · ${result.cluesUsed} clue${result.cluesUsed>1?'s':''} · ⏱ ${fmtTime(result.timeSeconds)}`:(lang==='hi'?'आज आउट!':'Stumped today!');

  // Challenge result comparison
  showChallengeResult(result);

  // Tomorrow teaser
  showTomorrowTeaser();

  // Leaderboards
  if(SUPABASE_ON){
    document.getElementById('resultLbSection').style.display='block';
    loadLeaderboard('resultLbBox','daily');
    document.getElementById('resultWeeklyLbSection').style.display='block';
    loadLeaderboard('resultWeeklyLbBox','weekly');
  }
}

function showChallengeResult(result) {
  const cd=state.challengeData;
  const cr=document.getElementById('chalResult');
  if(!cd||cd.puzzleNum!==PUZZLE_NUM||state.mode!=='today'){cr.classList.remove('show');return;}
  cr.classList.add('show');
  document.getElementById('crChallName').textContent=cd.name;
  document.getElementById('crChallScore').textContent=cd.score;
  document.getElementById('crChallTime').textContent=fmtTime(cd.time);
  document.getElementById('crYourScore').textContent=result.won?result.score:0;
  document.getElementById('crYourTime').textContent=fmtTime(result.timeSeconds);
  const yourScore=result.won?result.score:0;
  let winner='';
  if(yourScore>cd.score) winner=t('chalWon');
  else if(yourScore<cd.score) winner=t('chalLost');
  else winner=t('chalDraw');
  document.getElementById('crWinner').textContent=winner;
}

function showTomorrowTeaser() {
  const tomorrow = new Date(TODAY);
  tomorrow.setDate(tomorrow.getDate()+1);
  const tStr = tomorrow.toISOString().split('T')[0];
  const tPlayer = getDailyPuzzle(tStr);
  const lang=window.PITCH_LANG||'en';
  const el = document.getElementById('tomorrowTeaser');
  if(!el||!tPlayer)return;
  el.style.display='block';
  el.innerHTML=`<div class="tt-label">${t('teaserLabel')}</div>
    <div class="tt-body">
      ${t('teaserCountry')} ${tPlayer.flag} · ${t('teaserRole')} ${tPlayer.role} · ${t('teaserEra')} ${tPlayer.stats.era}
    </div>`;
}

// ── Did You Know toggle ──
function toggleDyk() {
  const extra=document.getElementById('dykExtra');
  const btn=document.getElementById('dykMore');
  const open=extra.classList.toggle('open');
  btn.textContent=open?t('dykLess'):t('dykMore');
}

// ── Mini Quiz ──
function initMQ(player, lang) {
  if(!player.quiz||!player.quiz.length){document.getElementById('mqBox').style.display='none';return;}
  state.mqCurrent=0; state.mqScore=0;
  document.getElementById('mqBox').style.display='block';
  document.getElementById('mqFinal').style.display='none';
  renderMQ(player, lang);
}

function renderMQ(player, lang) {
  const q=player.quiz[state.mqCurrent];
  if(!q){showMQFinal();return;}
  const total=player.quiz.length;
  document.getElementById('mqProg').textContent=`${state.mqCurrent+1} / ${total}`;
  document.getElementById('mqQ').textContent=q.q[lang]||q.q.en;
  const opts=document.getElementById('mqOpts');
  opts.innerHTML='';
  const options=q.o[lang]||q.o.en;
  options.forEach((opt,i)=>{
    const btn=document.createElement('button');
    btn.className='mq-opt'; btn.textContent=opt;
    btn.onclick=()=>answerMQ(i,q,player,lang);
    opts.appendChild(btn);
  });
  document.getElementById('mqFb').style.display='none';
  document.getElementById('mqNext').style.display='none';
}

function answerMQ(chosen, q, player, lang) {
  const btns=document.querySelectorAll('.mq-opt');
  btns.forEach(b=>b.disabled=true);
  btns[q.c].classList.add('correct');
  if(chosen!==q.c) btns[chosen].classList.add('wrong');
  else state.mqScore++;
  const fb=document.getElementById('mqFb');
  fb.textContent=q.exp[lang]||q.exp.en;
  fb.style.display='block';
  const nxt=document.getElementById('mqNext');
  nxt.style.display='block';
  if(state.mqCurrent>=player.quiz.length-1) {
    nxt.textContent=lang==='hi'?'नतीजा देखो →':'See Score →';
    nxt.onclick=()=>showMQFinal();
  } else {
    nxt.textContent=lang==='hi'?'अगला सवाल →':'Next Question →';
    nxt.onclick=()=>{state.mqCurrent++;renderMQ(player,lang);};
  }
}

function showMQFinal() {
  const player=PUZZLES.find(p=>p.name===TODAY_PLAYER.name)||TODAY_PLAYER;
  const total=player.quiz?player.quiz.length:3;
  const lang=window.PITCH_LANG||'en';
  document.getElementById('mqOpts').innerHTML='';
  document.getElementById('mqFb').style.display='none';
  document.getElementById('mqNext').style.display='none';
  const sc=document.getElementById('mqFinal');
  sc.style.display='block';
  sc.textContent=lang==='hi'?`क्विज़ स्कोर: ${state.mqScore}/${total} 🏏`:`Quiz Score: ${state.mqScore}/${total} 🏏`;
}

// ── Grid builder ──
function buildGrid(result) {
  let g='';
  for(let i=0;i<MAX_GUESSES;i++){
    if(result.won&&i===result.guessCount-1) g+='🟩';
    else if(i<(result.guessCount||0)) g+='🟥';
    else g+='⬛';
  }
  return g;
}

// ── Share text ──
function buildShareText() {
  const r=getTodayR(); if(!r)return'';
  const grid=buildGrid(r);
  const lang=window.PITCH_LANG||'en';
  const stats=getStats();
  const m=getMilestone(stats.streak);
  const date=new Date(TODAY).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  if(lang==='hi') {
    return `🏏 पिच #${PUZZLE_NUM} · ${date}\n${grid}\n${r.won?`${r.score}/${MAX_GUESSES} अंक · ${r.cluesUsed} सुराग · ⏱ ${fmtTime(r.timeSeconds)}`:'आज आउट!'}\n${stats.streak>=3?`${m.icon} ${stats.streak} दिन की स्ट्रीक · ${t(m.key)}\n`:''}\nखेलो: https://${DOMAIN}\n#PitchGame #Cricket #CricketIndia`;
  }
  return `🏏 PITCH #${PUZZLE_NUM} · ${date}\n${grid}\n${r.won?`${r.score}/${MAX_GUESSES} pts · ${r.cluesUsed} clue${r.cluesUsed>1?'s':''} · ⏱ ${fmtTime(r.timeSeconds)}`:'Stumped!'}\n${stats.streak>=3?`${m.icon} ${stats.streak}-day streak · ${t(m.key)}\n`:''}\nPlay: https://${DOMAIN}\n#PitchGame #Cricket #CricketIndia`;
}

function shareWhatsApp(){window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`,'_blank');}
function copyResult(){
  navigator.clipboard.writeText(buildShareText()).then(()=>{
    const btn=document.querySelector('.copy-btn'),orig=btn.textContent;
    btn.textContent=t('copiedMsg');setTimeout(()=>btn.textContent=orig,2000);
  });
}

// ── Challenge a friend ──
function challengeFriend() {
  const r=getTodayR(); if(!r)return;
  const nick=getNick()||'Anonymous';
  const payload=`${encodeURIComponent(nick)}-${r.score}-${r.timeSeconds}-${PUZZLE_NUM}`;
  const url=`https://${DOMAIN}/?c=${payload}`;
  const lang=window.PITCH_LANG||'en';
  const text = lang==='hi'
    ? `⚔️ ${nick} ने PITCH #${PUZZLE_NUM} में ${r.score}/${MAX_GUESSES} अंक बनाए!\nक्या तुम इससे बेहतर कर सकते हो?\n${buildGrid(r)}\n${url}`
    : `⚔️ ${nick} scored ${r.score}/${MAX_GUESSES} on PITCH #${PUZZLE_NUM}!\nCan you beat that?\n${buildGrid(r)}\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
}

// ── Countdown ──
function startCountdown(){setInterval(updateCD,1000);updateCD();}
function updateCD(){
  const el=document.getElementById('npTime');if(!el)return;
  const now=new Date(),mid=new Date();mid.setHours(24,0,0,0);
  let d=Math.floor((mid-now)/1000);
  const h=String(Math.floor(d/3600)).padStart(2,'0');d%=3600;
  el.textContent=`${h}:${String(Math.floor(d/60)).padStart(2,'0')}:${String(d%60).padStart(2,'0')}`;
}

// ── Confetti ──
function launchConfetti(){
  const colors=['#D4A843','#C41E3A','#F5F0E8','#2E7D32','#1565C0'];
  for(let i=0;i<60;i++){
    const el=document.createElement('div');el.className='cf';
    el.style.cssText=`left:${Math.random()*100}vw;top:-10px;background:${colors[i%colors.length]};width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;border-radius:${Math.random()>.5?'50%':'2px'};animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*.7}s;`;
    document.body.appendChild(el);setTimeout(()=>el.remove(),3500);
  }
}

// ── Supabase ──
async function submitScore({nickname,score,cluesUsed,timeSeconds}) {
  if(!SUPABASE_ON)return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_daily`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Prefer':'return=minimal'},
      body:JSON.stringify({date:TODAY,nickname,score,clues_used:cluesUsed,time_seconds:timeSeconds,puzzle_num:PUZZLE_NUM})
    });
  } catch(e){}
}

async function submitWeeklyScore({nickname,score}) {
  if(!SUPABASE_ON)return;
  const weekId=getWeekId();
  try {
    // Try upsert — increment score
    const res=await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_weekly?week_id=eq.${weekId}&nickname=eq.${encodeURIComponent(nickname)}`,{
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    const rows=await res.json();
    if(rows.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_weekly?week_id=eq.${weekId}&nickname=eq.${encodeURIComponent(nickname)}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},
        body:JSON.stringify({total_score:rows[0].total_score+score,games_played:rows[0].games_played+1,updated_at:new Date().toISOString()})
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/leaderboard_weekly`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Prefer':'return=minimal'},
        body:JSON.stringify({week_id:weekId,nickname,total_score:score,games_played:1})
      });
    }
  } catch(e){}
}

function escHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function loadLeaderboard(containerId, type='daily') {
  if(!SUPABASE_ON)return;
  const box=document.getElementById(containerId); if(!box)return;
  box.innerHTML=`<div class="lb-empty">${t('lbLoading')}</div>`;
  try {
    let url;
    if(type==='daily') {
      url=`${SUPABASE_URL}/rest/v1/leaderboard_daily?date=eq.${TODAY}&order=score.desc,clues_used.asc,time_seconds.asc&limit=10`;
    } else {
      const weekId=getWeekId();
      url=`${SUPABASE_URL}/rest/v1/leaderboard_weekly?week_id=eq.${weekId}&order=total_score.desc,games_played.asc&limit=10`;
    }
    const res=await fetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}});
    const rows=await res.json();
    if(!rows.length){box.innerHTML=`<div class="lb-empty">${t('lbEmpty')}</div>`;return;}
    const myNick=getNick();
    box.innerHTML=rows.map((r,i)=>{
      const rc=i===0?'g':i===1?'s':i===2?'b':'';
      const me=r.nickname===myNick?' style="background:var(--card)"':'';
      const scoreDisplay=type==='daily'?`${r.score}pt · ${fmtTime(r.time_seconds)}`:`${r.total_score}pts · ${r.games_played}g`;
      return `<div class="lb-row"${me}>
        <span class="lb-rank ${rc}">${i+1}</span>
        <span class="lb-name">${escHtml(r.nickname)}${r.nickname===myNick?' ✓':''}</span>
        <span class="lb-score">${scoreDisplay}</span>
      </div>`;
    }).join('');
  } catch(e){box.innerHTML=`<div class="lb-empty">${t('lbNoScores')}</div>`;}
}

function goHome(){refreshHomeStats();buildPracticeList();showScreen('homeScreen');}

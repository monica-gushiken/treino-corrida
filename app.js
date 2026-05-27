const PACES={
  walk:['leve','moderada'],
  run:['leve','moderada','forte','muito forte'],
  progressivo:['leve→moderada','moderada→forte','forte→muito forte']
};
const TYPE_LABEL={walk:'caminhada',trote:'trote',run:'corrida',progressivo:'progressivo'};
const TYPE_CLASS={walk:'bw',trote:'bt',run:'br',progressivo:'bp'};
const PHASE_NAME={walk:'Caminhando',trote:'Trotando',run:'Correndo',progressivo:'Progressivo',warmup:'Aquecendo',cooldown:'Desaquecendo'};
function defaultPace(type){return PACES[type]?.[0]||'leve';}

let workouts = JSON.parse(localStorage.getItem('workouts2') || 'null') || [
  {id:1,name:'Iniciante',warmup:5,warmupPace:'leve',reps:6,
   blocks:[{type:'run',mins:1,pace:'leve'},{type:'walk',mins:2,pace:'leve'}],
   cooldown:5,cooldownPace:'leve'}
];
let editingId=null, deleteTargetId=null;
let phases=[],phaseIdx=0,timeLeft=0,paused=false,timer=null,clockTimer=null,totalSecs=0,elapsed=0;
let workoutStartTime=0,workoutPausedMs=0,pauseStartTime=0;
let activeWorkout=null, audioCtx=null, wakeLock=null;
let currentBlocks=[];
let dragSrcIdx=null;
let swipeOpenCard=null;

function persist(){try{localStorage.setItem('workouts2',JSON.stringify(workouts))}catch(e){}}

async function acquireWakeLock(){
  if(!('wakeLock' in navigator))return;
  try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
}
function releaseWakeLock(){
  if(wakeLock){wakeLock.release();wakeLock=null;}
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&activeWorkout&&!paused)acquireWakeLock();
});

function getAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx}
function playBeep(type){
  try{
    const ctx=getAudio();
    const freqs=type==='start'?[880,1320]:type==='warning'?[660]:[440,660,880];
    freqs.forEach((freq,i)=>{
      const osc=ctx.createOscillator(),g=ctx.createGain();
      osc.connect(g);g.connect(ctx.destination);
      osc.type='sine';osc.frequency.value=freq;
      const t=ctx.currentTime+i*0.15;
      g.gain.setValueAtTime(0.35,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
      osc.start(t);osc.stop(t+0.18);
    });
  }catch(e){}
}

function fmt(s){return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function fmtMin(m){const mi=Math.floor(m),s=Math.round((m-mi)*60);return s>0?`${mi}:${String(s).padStart(2,'0')}`:`${mi}:00`}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active')}
function showAlert(msg){const b=document.getElementById('alertBanner');b.textContent=msg;b.classList.add('show');setTimeout(()=>b.classList.remove('show'),2200)}

/* SWIPE */
function closeSwipe(){
  if(!swipeOpenCard)return;
  const inner=swipeOpenCard.querySelector('.workout-card-inner');
  if(inner){inner.style.transition='transform 0.25s ease';inner.style.transform='translateX(0)';}
  swipeOpenCard=null;
}
function cardClick(id,el){
  const card=el.closest('.workout-card');
  if(swipeOpenCard===card){closeSwipe();return;}
  startWorkout(id);
}
function initSwipe(){
  let tx,ty,tc,swiping;
  document.addEventListener('touchstart',e=>{
    tc=e.target.closest('.workout-card');
    if(!tc){closeSwipe();return;}
    tx=e.touches[0].clientX;ty=e.touches[0].clientY;swiping=false;
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!tc)return;
    const dx=e.touches[0].clientX-tx,dy=e.touches[0].clientY-ty;
    if(!swiping){
      if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
      if(Math.abs(dy)>=Math.abs(dx)){tc=null;return;}
      swiping=true;
    }
    e.preventDefault();
    const inner=tc.querySelector('.workout-card-inner');
    const base=swipeOpenCard===tc?-160:0;
    inner.style.transition='none';
    inner.style.transform=`translateX(${Math.max(-160,Math.min(0,base+dx))}px)`;
  },{passive:false});
  document.addEventListener('touchend',e=>{
    if(!tc||!swiping){swiping=false;return;}
    const dx=e.changedTouches[0].clientX-tx;
    const inner=tc.querySelector('.workout-card-inner');
    inner.style.transition='transform 0.25s ease';
    const isOpen=swipeOpenCard===tc;
    if(!isOpen&&dx<-60){
      if(swipeOpenCard)closeSwipe();
      inner.style.transform='translateX(-160px)';
      swipeOpenCard=tc;
    } else if(isOpen&&dx>60){
      inner.style.transform='translateX(0)';
      swipeOpenCard=null;
    } else {
      inner.style.transform=isOpen?'translateX(-160px)':'translateX(0)';
    }
    swiping=false;tc=null;
  },{passive:true});
}
initSwipe();

/* MODAL */
function openModal(id,name){
  closeSwipe();
  deleteTargetId=id;
  document.getElementById('modalMsg').textContent=`Tem certeza que deseja excluir "${name}"? Esta ação não pode ser desfeita.`;
  document.getElementById('modalBg').classList.add('open');
}
function closeModal(){document.getElementById('modalBg').classList.remove('open');deleteTargetId=null}
function confirmDelete(){
  if(!deleteTargetId)return;
  workouts=workouts.filter(w=>w.id!==deleteTargetId);
  persist();closeModal();renderList();
}

function exportJSON(){
  const data=JSON.stringify(workouts,null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  const date=new Date().toISOString().slice(0,10);
  a.download=`treinos-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!Array.isArray(data))throw new Error();
      const valid=data.filter(w=>w.id&&w.name&&Array.isArray(w.blocks));
      if(!valid.length)throw new Error();
      const existingIds=new Set(workouts.map(w=>w.id));
      let added=0;
      valid.forEach(w=>{
        if(existingIds.has(w.id))w.id=Date.now()+Math.random();
        added++;
        workouts.push(w);
      });
      persist();renderList();
      showAlert(`${added} treino${added>1?'s':''} importado${added>1?'s':''}!`);
    }catch(err){
      showAlert('Arquivo inválido.');
    }
    e.target.value='';
  };
  reader.readAsText(file);
}

/* LIST */
function renderList(){
  swipeOpenCard=null;
  const el=document.getElementById('workoutList');
  if(!workouts.length){
    el.innerHTML=`<div class="empty-state"><i class="ti ti-run" aria-hidden="true"></i><p>Nenhum treino ainda.<br>Crie o seu primeiro treino!</p></div>`;
    return;
  }
  el.innerHTML=workouts.map(w=>{
    const blockTotal=w.blocks.reduce((a,b)=>a+b.mins,0);
    const total=w.warmup+w.reps*blockTotal+w.cooldown;
    const blockPills=w.blocks.map(b=>{
      const lbl=`${TYPE_LABEL[b.type]||b.type}${b.pace?' '+b.pace:''} ${fmtMin(b.mins)}`;
      return `<span class="badge ${TYPE_CLASS[b.type]||'bw'}">${lbl}</span>`;
    }).join(' ');
    return `<div class="workout-card">
      <div class="swipe-actions">
        <button class="swipe-edit" onclick="editWorkout(${w.id})"><i class="ti ti-edit"></i><span>Editar</span></button>
        <button class="swipe-delete" onclick="openModal(${w.id},'${w.name.replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i><span>Excluir</span></button>
      </div>
      <div class="workout-card-inner" onclick="cardClick(${w.id},this)">
        <div class="workout-card-top">
          <span class="workout-card-name">${w.name}</span>
        </div>
        <div class="workout-card-meta" style="margin-bottom:6px">
          <span><i class="ti ti-clock" aria-hidden="true" style="font-size:13px"></i> ${fmtMin(total)} min</span>
          <span><i class="ti ti-refresh" aria-hidden="true" style="font-size:13px"></i> ${w.reps}× rodadas</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${blockPills}</div>
      </div>
    </div>`;
  }).join('');
}

function goList(){if(timer)clearInterval(timer);renderList();showScreen('listScreen')}

/* BLOCKS */
function addBlock(type='run'){
  currentBlocks.push({type,mins:1,pace:defaultPace(type)});
  renderBlocks();updateSummary();
}
function removeBlock(i){
  if(currentBlocks.length<=1)return;
  currentBlocks.splice(i,1);
  renderBlocks();updateSummary();
}
function setBlockType(i,type){currentBlocks[i].type=type;currentBlocks[i].pace=defaultPace(type);renderBlocks();updateSummary()}
function setBlockMins(i,val){currentBlocks[i].mins=parseFloat(val)||0;updateSummary()}
function setBlockPace(i,val){currentBlocks[i].pace=val;}

function renderBlocks(){
  const list=document.getElementById('blockList');
  list.innerHTML=currentBlocks.map((b,i)=>`
    <div class="block-item" draggable="true" data-idx="${i}"
      ondragstart="dragStart(event,${i})" ondragover="dragOver(event,${i})"
      ondrop="drop(event,${i})" ondragend="dragEnd()">
      <span class="block-drag" aria-hidden="true"><i class="ti ti-grip-vertical"></i></span>
      <select class="block-type-sel" onchange="setBlockType(${i},this.value)">
        <option value="walk" ${b.type==='walk'?'selected':''}>caminhada</option>
        <option value="trote" ${b.type==='trote'?'selected':''}>trote</option>
        <option value="run" ${b.type==='run'?'selected':''}>corrida</option>
        <option value="progressivo" ${b.type==='progressivo'?'selected':''}>progressivo</option>
      </select>
      <input class="block-mins" type="number" value="${b.mins}" min="0.5" max="60" step="0.5"
        onchange="setBlockMins(${i},this.value)" oninput="setBlockMins(${i},this.value)">
      <span class="block-unit">min</span>
      <button class="block-del" onclick="removeBlock(${i})" aria-label="Remover bloco" ${currentBlocks.length<=1?'disabled style="opacity:0.2"':''}><i class="ti ti-x"></i></button>
      ${PACES[b.type]?`<div class="block-pace-row">
        <span class="block-pace-lbl">ritmo:</span>
        <select class="block-pace-sel" onchange="setBlockPace(${i},this.value)">
          ${PACES[b.type].map(p=>`<option value="${p}" ${b.pace===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>`:''}
    </div>`).join('');
}

/* DRAG & DROP */
function dragStart(e,i){dragSrcIdx=i;e.currentTarget.classList.add('dragging');e.dataTransfer.effectAllowed='move'}
function dragOver(e,i){e.preventDefault();document.querySelectorAll('.block-item').forEach(el=>el.classList.remove('drag-over'));if(i!==dragSrcIdx)e.currentTarget.classList.add('drag-over')}
function drop(e,i){
  e.preventDefault();
  if(i===dragSrcIdx)return;
  const moved=currentBlocks.splice(dragSrcIdx,1)[0];
  currentBlocks.splice(i,0,moved);
  renderBlocks();updateSummary();
}
function dragEnd(){document.querySelectorAll('.block-item').forEach(el=>{el.classList.remove('dragging','drag-over')})}

/* CONFIG */
function goNewWorkout(){
  editingId=null;
  document.getElementById('configTitle').textContent='Novo treino';
  document.getElementById('workoutName').value='';
  document.getElementById('warmupMin').value=5;
  document.getElementById('warmupPace').value='leve';
  document.getElementById('intervalReps').value=6;
  document.getElementById('cooldownMin').value=5;
  document.getElementById('cooldownPace').value='leve';
  currentBlocks=[{type:'run',mins:1,pace:'leve'},{type:'walk',mins:2,pace:'leve'}];
  renderBlocks();updateSummary();
  showScreen('configScreen');
}

function editWorkout(id){
  const w=workouts.find(x=>x.id===id);if(!w)return;
  editingId=id;
  document.getElementById('configTitle').textContent='Editar treino';
  document.getElementById('workoutName').value=w.name;
  document.getElementById('warmupMin').value=w.warmup;
  document.getElementById('warmupPace').value=w.warmupPace||'leve';
  document.getElementById('intervalReps').value=w.reps;
  document.getElementById('cooldownMin').value=w.cooldown;
  document.getElementById('cooldownPace').value=w.cooldownPace||'leve';
  currentBlocks=w.blocks.map(b=>({...b,pace:b.pace||defaultPace(b.type)}));
  renderBlocks();updateSummary();
  showScreen('configScreen');
}

function saveWorkout(){
  const name=document.getElementById('workoutName').value.trim()||'Treino sem nome';
  const cfg={
    name,
    warmup:parseFloat(document.getElementById('warmupMin').value)||0,
    warmupPace:document.getElementById('warmupPace').value,
    reps:parseInt(document.getElementById('intervalReps').value)||1,
    blocks:currentBlocks.map(b=>({...b})),
    cooldown:parseFloat(document.getElementById('cooldownMin').value)||0,
    cooldownPace:document.getElementById('cooldownPace').value,
  };
  if(editingId){
    const idx=workouts.findIndex(w=>w.id===editingId);
    if(idx>=0)workouts[idx]={...workouts[idx],...cfg};
  } else {
    workouts.push({id:Date.now(),...cfg});
  }
  persist();goList();
}

function updateSummary(){
  const warmup=parseFloat(document.getElementById('warmupMin').value)||0;
  const reps=parseInt(document.getElementById('intervalReps').value)||0;
  const cooldown=parseFloat(document.getElementById('cooldownMin').value)||0;
  const blockTotal=currentBlocks.reduce((a,b)=>a+(parseFloat(b.mins)||0),0);
  const interval=reps*blockTotal;
  document.getElementById('s-warmup').textContent=fmtMin(warmup);
  document.getElementById('s-interval').textContent=fmtMin(interval)+` (${reps}×)`;
  document.getElementById('s-cooldown').textContent=fmtMin(cooldown);
  document.getElementById('s-total').textContent=fmtMin(warmup+interval+cooldown);
}
['warmupMin','intervalReps','cooldownMin'].forEach(id=>{
  document.getElementById(id).addEventListener('input',updateSummary);
});

/* WORKOUT ENGINE */
function buildPhases(w){
  const p=[];
  if(w.warmup>0)p.push({name:PHASE_NAME.warmup,type:'warmup',pace:w.warmupPace||'leve',secs:Math.round(w.warmup*60)});
  for(let i=0;i<w.reps;i++){
    w.blocks.forEach(b=>{
      if(b.mins>0)p.push({
        name:PHASE_NAME[b.type]||b.type,
        type:b.type,
        pace:b.pace||defaultPace(b.type),
        secs:Math.round(b.mins*60),
        rep:i+1
      });
    });
  }
  if(w.cooldown>0)p.push({name:PHASE_NAME.cooldown,type:'cooldown',pace:w.cooldownPace||'leve',secs:Math.round(w.cooldown*60)});
  return p;
}

function startWorkout(id){
  const w=workouts.find(x=>x.id===id);if(!w)return;
  activeWorkout=w;
  phases=buildPhases(w);
  if(!phases.length)return;
  totalSecs=phases.reduce((a,p)=>a+p.secs,0);
  elapsed=0;phaseIdx=0;paused=false;
  workoutStartTime=Date.now();workoutPausedMs=0;
  document.getElementById('totalDisplay').textContent=fmt(totalSecs);
  if(clockTimer)clearInterval(clockTimer);
  clockTimer=setInterval(()=>{
    if(paused)return;
    const wallSecs=Math.floor((Date.now()-workoutStartTime-workoutPausedMs)/1000);
    document.getElementById('elapsedDisplay').textContent=fmt(Math.max(0,wallSecs));
  },1000);
  showScreen('workoutScreen');
  acquireWakeLock();
  enterPhase(0);playBeep('start');
}

function enterPhase(idx){
  phaseIdx=idx;
  const p=phases[idx],next=phases[idx+1];
  timeLeft=p.secs;
  const nameEl=document.getElementById('phaseName');
  nameEl.textContent=p.name;nameEl.className='phase-name '+(p.type||'');
  document.getElementById('paceLabel').textContent=p.pace||'';
  const isInterval=['run','walk','trote','progressivo'].includes(p.type);
  const badge=document.getElementById('roundBadge');
  if(isInterval&&p.rep){badge.style.display='block';badge.textContent=`Rodada ${p.rep} de ${activeWorkout.reps}`}
  else badge.style.display='none';
  document.getElementById('nextName').textContent=next
    ?`${next.name}${next.pace?' ('+next.pace+')':''}${next.rep?' · rodada '+next.rep:''}`
    :'Fim do treino';
  document.getElementById('btnPause').innerHTML='&#9646;&#9646;';
  if(timer)clearInterval(timer);
  timer=setInterval(tick,1000);
}

function tick(){
  if(paused)return;

  const wallElapsed=Math.floor((Date.now()-workoutStartTime-workoutPausedMs)/1000);

  if(wallElapsed>=totalSecs){clearInterval(timer);showDone();return;}

  // determina em qual fase o relógio de parede está
  let acc=0,targetIdx=0;
  for(let i=0;i<phases.length;i++){
    if(wallElapsed<acc+phases[i].secs){targetIdx=i;break;}
    acc+=phases[i].secs;
  }

  if(targetIdx!==phaseIdx){
    elapsed=acc;
    playBeep('phase');
    showAlert(phases[targetIdx].name+' — vamos!');
    enterPhase(targetIdx);
    // corrige timeLeft imediatamente após a transição
    timeLeft=Math.max(0,phases[targetIdx].secs-(Math.floor((Date.now()-workoutStartTime-workoutPausedMs)/1000)-acc));
    updateDisplay();
    return;
  }

  timeLeft=phases[phaseIdx].secs-(wallElapsed-elapsed);
  if(timeLeft<=5&&timeLeft>1)playBeep('warning');
  updateDisplay();
}

function updateDisplay(){
  document.getElementById('timerDisplay').textContent=fmt(timeLeft);
  const done=elapsed+(phases[phaseIdx].secs-timeLeft);
  const pct=Math.min(100,Math.round((done/totalSecs)*100));
  document.getElementById('progressFill').style.width=pct+'%';
  document.getElementById('progressLabel').textContent=pct+'%';
}

function togglePause(){
  paused=!paused;
  if(paused)pauseStartTime=Date.now();
  else workoutPausedMs+=Date.now()-pauseStartTime;
  document.getElementById('btnPause').innerHTML=paused?'&#9654;':'&#9646;&#9646;';
}
function stopWorkout(){if(timer)clearInterval(timer);if(clockTimer)clearInterval(clockTimer);releaseWakeLock();goList()}

function showDone(){
  const w=activeWorkout,totalMin=Math.round(totalSecs/60);
  document.getElementById('doneSub').textContent=`${w.name} · ${totalMin} minutos · ${w.reps} rodadas`;
  const runMin=Math.round(w.reps*w.blocks.filter(b=>['run','trote','progressivo'].includes(b.type)).reduce((a,b)=>a+b.mins,0));
  const walkMin=Math.round(w.reps*w.blocks.filter(b=>b.type==='walk').reduce((a,b)=>a+b.mins,0)+w.warmup+w.cooldown);
  document.getElementById('statGrid').innerHTML=`
    <div class="stat-box"><div class="val">${runMin} min</div><div class="lbl">corrida total</div></div>
    <div class="stat-box"><div class="val">${walkMin} min</div><div class="lbl">caminhada total</div></div>
    <div class="stat-box"><div class="val">${w.reps}</div><div class="lbl">rodadas</div></div>
    <div class="stat-box"><div class="val">${totalMin}</div><div class="lbl">min totais</div></div>`;
  releaseWakeLock();playBeep('done');showScreen('doneScreen');
}

renderList();

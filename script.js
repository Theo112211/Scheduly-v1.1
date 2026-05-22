// ══════════════════════════════════════════
//  CONFIG — Replace with your Supabase values
// ══════════════════════════════════════════
const SUPABASE_URL  = 'https://alrmzdrvvpvbbztmakzp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscm16ZHJ2dnB2YmJ6dG1ha3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjEyNjcsImV4cCI6MjA5NDk5NzI2N30.5bNPkLxpsctAi9cCfIvsF1LhJMMT3HoCmOl8O7tX0yA';
// ══════════════════════════════════════════

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let currentUser = null;

// ── Theme ──
let dark = localStorage.getItem('sched-theme') === 'dark';
applyTheme();
function applyTheme(){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  const ic = document.getElementById('themeIcon');
  if(ic) ic.className = dark ? 'ti ti-sun' : 'ti ti-moon';
  localStorage.setItem('sched-theme', dark?'dark':'light');
}
function toggleTheme(){ dark=!dark; applyTheme(); }

// ── Tabs ──
function switchTab(id, btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-'+id).classList.add('active');
  if(id==='saved') renderSaved();
}

// ── Auth ──
async function initAuth(){
  const {data:{session}} = await sb.auth.getSession();
  currentUser = session?.user ?? null;
  renderAuthArea();
  if(!currentUser) document.getElementById('authOverlay').style.display='flex';

  sb.auth.onAuthStateChange((_,session)=>{
    currentUser = session?.user ?? null;
    renderAuthArea();
    if(currentUser) { document.getElementById('authOverlay').style.display='none'; toast('Signed in ✓'); }
  });
}
function renderAuthArea(){
  const el = document.getElementById('authArea');
  if(currentUser){
    const email = currentUser.email||'';
    const short = email.split('@')[0].slice(0,16);
    el.innerHTML=`<div class="user-pill"><div class="user-dot"></div>${short}<button class="btn sm ghost" style="margin-left:4px;padding:3px 7px" onclick="doSignOut()"><i class="ti ti-logout"></i></button></div>`;
  } else {
    el.innerHTML=`<button class="btn sm primary" onclick="document.getElementById('authOverlay').style.display='flex'"><i class="ti ti-login"></i>Sign In</button>`;
  }
}
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPass').value;
  showAuthErr('');
  const{error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error) showAuthErr(error.message);
}
async function doSignup(){
  const name=document.getElementById('signupName').value.trim();
  const email=document.getElementById('signupEmail').value.trim();
  const pass=document.getElementById('signupPass').value;
  showAuthErr('');
  if(pass.length<6){showAuthErr('Password must be at least 6 characters.');return;}
  const{error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name}}});
  if(error) showAuthErr(error.message);
  else showAuthErr('Check your email to confirm your account.','info');
}
async function doSignOut(){
  await sb.auth.signOut();
  toast('Signed out');
}
function closeAuth(){ document.getElementById('authOverlay').style.display='none'; }
function showAuthErr(msg,type='error'){
  const el=document.getElementById('authErr');
  el.textContent=msg; el.style.display=msg?'block':'none';
  el.style.color=type==='info'?'var(--green)':'var(--red)';
  el.style.background=type==='info'?'var(--green-dim)':'var(--red-dim)';
}
function switchAuthTab(id, btn){
  document.querySelectorAll('.auth-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('authLogin').style.display=id==='login'?'block':'none';
  document.getElementById('authSignup').style.display=id==='signup'?'block':'none';
  showAuthErr('');
}

// ── State ──
const ALL_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const WKND=new Set(['Saturday','Sunday']);
let classes=[],slots=[],sessions={},activeDays=[...ALL_DAYS.slice(0,5)];
let assignTarget=null,ctxTarget=null,viewingId=null;
let allSaved=[];

// ── Day toggles ──
function initDays(){
  document.getElementById('dayToggles').innerHTML=ALL_DAYS.map(d=>`
    <label class="day-row">
      <input type="checkbox" id="day_${d}" ${activeDays.includes(d)?'checked':''} onchange="toggleDay('${d}',this.checked)"/>
      ${d}${WKND.has(d)?'<span class="weekend-tag">Weekend</span>':''}
    </label>`).join('');
}
function toggleDay(day,checked){
  if(checked&&!activeDays.includes(day)) activeDays.push(day);
  else activeDays=activeDays.filter(d=>d!==day);
  activeDays.sort((a,b)=>ALL_DAYS.indexOf(a)-ALL_DAYS.indexOf(b));
  if(!checked) for(const k of Object.keys(sessions)) if(k.startsWith(day+'::')) delete sessions[k];
  renderTT();
}

// ── Slots ──
function applySlots(){
  const s=document.getElementById('slotStart').value,e=document.getElementById('slotEnd').value;
  const i=parseInt(document.getElementById('slotInterval').value);
  if(!s||!e||s>=e){toast('Set a valid time range.');return;}
  slots=timeRange(s,e,i); sessions={}; renderTT();
}
function timeRange(s,e,i){
  const t=[];let[sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);
  let c=sh*60+sm,l=eh*60+em;
  while(c<l){const h=Math.floor(c/60),m=c%60;t.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);c+=i;}
  return t;
}

// ── Classes ──
function addClass(){
  const name=document.getElementById('classInput').value.trim();if(!name)return;
  const color=document.getElementById('classColor').value;
  if(classes.find(c=>c.name===name)){toast('Course already exists.');return;}
  classes.push({name,color});document.getElementById('classInput').value='';
  renderChips();renderLegend();renderTT();
}
function removeClass(i){
  const cls=classes[i];classes.splice(i,1);
  for(const k of Object.keys(sessions)) if(sessions[k]?.cls===cls.name) delete sessions[k];
  renderChips();renderLegend();renderTT();
}
function renderChips(){
  const el=document.getElementById('classList');
  if(!classes.length){el.innerHTML='<div class="empty-hint">No courses added yet</div>';return;}
  el.innerHTML=classes.map((c,i)=>`
    <div class="chip"><span><span class="chip-dot" style="background:${c.color}"></span>${c.name}</span>
    <button class="chip-rm" onclick="removeClass(${i})">×</button></div>`).join('');
}
function renderLegend(){
  const el=document.getElementById('legend');
  if(!classes.length){el.innerHTML='<span class="empty-hint" style="padding:4px 0">Add a course to see colours</span>';return;}
  el.innerHTML=classes.map(c=>`<span class="legend-chip"><span class="legend-dot" style="background:${c.color}"></span>${c.name}</span>`).join('');
}

// ── Time pill ──
function tpill(t){
  const[h,m]=t.split(':');const hr=parseInt(h),ap=hr>=12?'PM':'AM',h12=hr%12||12;
  return`<div class="t-pill"><span class="th">${h12}${m==='00'?'':':'+m}</span><span class="tm">${ap}</span></div>`;
}

// ── Conflicts ──
const sk=(day,t)=>`${day}::${t}`;
function conflicts(){
  const c={};
  for(const k of Object.keys(sessions)){
    const s=sessions[k];if(!s)continue;
    const[day,t]=k.split('::'),si=slots.indexOf(t);
    for(let d=1;d<s.duration;d++){const ok=sk(day,slots[si+d]);if(sessions[ok])c[ok]=true;}
  }return c;
}

// ── Render timetable ──
function hasSessions(){return Object.keys(sessions).some(k=>sessions[k]);}
function renderTT(){
  const tt=document.getElementById('tt');
  document.getElementById('saveTTBtn').style.display=hasSessions()&&currentUser?'flex':'none';
  if(!slots.length||!activeDays.length){
    tt.innerHTML=`<tr><td style="padding:32px;color:var(--text3);font-size:13px;text-align:center" colspan="${activeDays.length+1}">${!activeDays.length?'Enable at least one day.':'Set times and click Apply.'}</td></tr>`;
    renderConflict();return;
  }
  const C=conflicts(),occ=new Set();
  for(const k of Object.keys(sessions)){
    const s=sessions[k];if(!s)continue;
    const[day,t]=k.split('::'),si=slots.indexOf(t);
    for(let d=1;d<s.duration;d++) occ.add(sk(day,slots[si+d]));
  }
  let html='<tr><th style="width:70px"></th>'+activeDays.map(d=>`<th${WKND.has(d)?' class="wknd"':''}>${d}</th>`).join('')+'</tr>';
  for(let si=0;si<slots.length;si++){
    html+=`<tr><td class="time-col">${tpill(slots[si])}</td>`;
    for(const day of activeDays){
      const k=sk(day,slots[si]),iw=WKND.has(day);
      if(occ.has(k)){html+=`<td class="slot${iw?' wknd-slot':''}" style="cursor:default"></td>`;continue;}
      const s=sessions[k],isC=C[k];
      if(s){
        const cls=classes.find(c=>c.name===s.cls),bg=cls?cls.color:'#888',h=s.duration*40-4;
        html+=`<td class="slot${iw?' wknd-slot':''}${isC?' conflict-slot':''}"
          onclick="openAssign('${day}','${slots[si]}')"
          oncontextmenu="openCtx(event,'${day}','${slots[si]}')">
          <div class="session-block" style="background:${bg}1A;border:1.5px solid ${bg};color:${bg};height:${h}px">
            ${s.cls}${isC?'<span class="conflict-icon">⚠</span>':''}
          </div></td>`;
      }else{
        html+=`<td class="slot${iw?' wknd-slot':''}${isC?' conflict-slot':''}" onclick="openAssign('${day}','${slots[si]}')"></td>`;
      }
    }html+='</tr>';
  }
  tt.innerHTML=html;renderConflict();
}
function renderConflict(){
  const C=conflicts(),p=document.getElementById('conflictPanel'),n=Object.keys(C).length;
  if(!n){p.innerHTML='';return;}
  p.innerHTML=`<div class="card alert-card">
    <div class="card-label"><i class="ti ti-alert-triangle"></i>Conflicts (${n})</div>
    <div style="font-size:12px;color:var(--text2)">${n} slot${n>1?'s':''} double-booked. Fix by clicking the highlighted slot.</div>
  </div>`;
}

// ── Assign modal ──
function openAssign(day,t){
  if(!classes.length){toast('Add a course first.');return;}
  assignTarget={day,t};
  const k=sk(day,t),ex=sessions[k];
  document.getElementById('assignTitle').textContent=ex?`Edit: ${day} ${t}`:`Assign: ${day} ${t}`;
  const sel=document.getElementById('aClass');
  sel.innerHTML=classes.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
  if(ex){sel.value=ex.cls;document.getElementById('aDur').value=ex.duration;}
  else document.getElementById('aDur').value=1;
  document.getElementById('assignBg').style.display='flex';
}
function closeAssign(){document.getElementById('assignBg').style.display='none';assignTarget=null;}
function assignSession(){
  if(!assignTarget)return;
  const{day,t}=assignTarget,cls=document.getElementById('aClass').value;
  const dur=parseInt(document.getElementById('aDur').value),k=sk(day,t),si=slots.indexOf(t);
  if(si+dur>slots.length){toast('Duration exceeds available slots.');return;}
  const old=sessions[k];
  if(old) for(let d=1;d<old.duration;d++) delete sessions[sk(day,slots[si+d])];
  sessions[k]={cls,duration:dur};
  closeAssign();renderTT();
}

// ── Context menu (right-click / long-press) ──
function openCtx(e,day,t){
  e.preventDefault();e.stopPropagation();
  ctxTarget={day,t};
  const m=document.getElementById('ctxMenu');
  m.style.display='block';
  m.style.left=Math.min(e.clientX,window.innerWidth-160)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-90)+'px';
}
function closeCtx(){document.getElementById('ctxMenu').style.display='none';ctxTarget=null;}
function ctxEdit(){if(!ctxTarget)return;closeCtx();openAssign(ctxTarget.day,ctxTarget.t);}
function ctxUnassign(){
  if(!ctxTarget)return;
  const k=sk(ctxTarget.day,ctxTarget.t),s=sessions[k];
  if(s){const si=slots.indexOf(ctxTarget.t);for(let d=1;d<s.duration;d++) delete sessions[sk(ctxTarget.day,slots[si+d])];delete sessions[k];}
  closeCtx();renderTT();toast('Slot unassigned.');
}
document.addEventListener('click',e=>{if(!document.getElementById('ctxMenu').contains(e.target)) closeCtx();});

// ── Clear / Export ──
function clearAll(){if(!confirm('Clear the entire timetable?'))return;sessions={};renderTT();}
function exportCSV(){
  if(!slots.length){toast('Build a timetable first.');return;}
  const occ=new Set();
  for(const k of Object.keys(sessions)){const s=sessions[k];if(!s)continue;const[day,t]=k.split('::'),si=slots.indexOf(t);for(let d=1;d<s.duration;d++) occ.add(sk(day,slots[si+d]));}
  let csv='Time,'+activeDays.join(',')+'\n';
  for(const t of slots) csv+=t+','+activeDays.map(d=>{const k=sk(d,t);if(occ.has(k))return'"(cont.)"';const s=sessions[k];return s?`"${s.cls}"`:''}).join(',')+'\n';
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');
  a.href=url;a.download='scheduly-timetable.csv';a.click();URL.revokeObjectURL(url);
}

// ── Save modal ──
function openSaveModal(){
  if(!currentUser){document.getElementById('authOverlay').style.display='flex';return;}
  if(!hasSessions()){toast('Add at least one session first.');return;}
  document.getElementById('sCourse').value='';
  document.getElementById('sProgType').value='';
  document.getElementById('sNotes').value='';
  document.getElementById('sOtherSpec').value='';
  updateSaveConds();
  document.getElementById('saveBg').style.display='flex';
}
function closeSave(){document.getElementById('saveBg').style.display='none';}
function updateSaveConds(){
  const v=document.getElementById('sProgType').value;
  document.getElementById('cLevel').classList.toggle('on',v==='Under-Graduate');
  document.getElementById('cGrad').classList.toggle('on',v==='Graduate');
  document.getElementById('cOther').classList.toggle('on',v==='Diploma'||v==='Other');
}
async function confirmSave(){
  const course=document.getElementById('sCourse').value.trim();
  const progType=document.getElementById('sProgType').value;
  if(!course){toast('Enter a course name.');return;}
  if(!progType){toast('Select a programme type.');return;}
  let detail='';
  if(progType==='Under-Graduate') detail='Level '+document.getElementById('sLevel').value;
  else if(progType==='Graduate') detail=document.getElementById('sGradProg').value;
  else if(progType==='Diploma'||progType==='Other') detail=document.getElementById('sOtherSpec').value.trim();

  const payload={
    created_by:currentUser.id,
    course,prog_type:progType,detail,
    notes:document.getElementById('sNotes').value.trim(),
    active_days:activeDays,slots,
    classes:JSON.parse(JSON.stringify(classes)),
    sessions:JSON.parse(JSON.stringify(sessions))
  };
  const{error}=await sb.from('timetables').insert([payload]);
  if(error){toast('Save failed: '+error.message);return;}
  closeSave();toast('Timetable saved!');
  renderSaved();
}

// ── Saved timetables ──
const PROG_ORDER=['Regular','Evening','Weekend','Under-Graduate','Graduate','Diploma','Other'];
function pbClass(pt){return 'pb-'+pt.replace(/[^a-zA-Z]/g,'');}

async function renderSaved(){
  const q=document.getElementById('searchQ')?.value.trim().toLowerCase()||'';
  const fp=document.getElementById('searchProg')?.value||'';
  const el=document.getElementById('savedList');
  el.innerHTML='<div class="no-results"><i class="ti ti-loader"></i>Loading…</div>';

  let query=sb.from('timetables').select('*').order('created_at',{ascending:false});
  if(fp) query=query.eq('prog_type',fp);
  const{data,error}=await query;
  if(error){el.innerHTML='<div class="no-results">Error loading timetables.</div>';return;}

  let list=data||[];
  if(q) list=list.filter(r=>r.course.toLowerCase().includes(q)||(r.detail||'').toLowerCase().includes(q));
  allSaved=list;

  if(!list.length){el.innerHTML='<div class="no-results"><i class="ti ti-calendar-off"></i>No timetables found.</div>';return;}

  const groups={};
  for(const r of list){const g=r.prog_type||'Other';if(!groups[g])groups[g]=[];groups[g].push(r);}
  let html='';
  for(const cat of PROG_ORDER){
    if(!groups[cat])continue;
    html+=`<div class="saved-section">
      <div class="section-head"><span class="prog-badge ${pbClass(cat)}">${cat}</span>${groups[cat].length} timetable${groups[cat].length>1?'s':''}</div>`;
    for(const r of groups[cat]){
      const canEdit=currentUser&&(currentUser.id===r.created_by);
      html+=`<div class="tt-row">
        <div class="tt-row-info">
          <div class="tt-row-name">${r.course}</div>
          <div class="tt-row-meta">
            <span class="prog-badge ${pbClass(cat)}" style="font-size:10px">${r.prog_type}</span>
            ${r.detail?`<span>${r.detail}</span>`:''}
            <span>${new Date(r.created_at).toLocaleDateString()}</span>
            ${r.notes?`<span title="${r.notes}"><i class="ti ti-notes" style="font-size:12px"></i></span>`:''}
          </div>
        </div>
        <div class="tt-row-actions">
          ${canEdit?`<button class="btn sm ghost" onclick="loadRecord('${r.id}')"><i class="ti ti-pencil"></i>Load</button>`:''}
          <button class="btn sm" onclick="viewRecord('${r.id}')"><i class="ti ti-eye"></i>View</button>
        </div>
      </div>`;
    }html+='</div>';
  }
  el.innerHTML=html;
}
function clearSearch(){document.getElementById('searchQ').value='';document.getElementById('searchProg').value='';renderSaved();}

// ── View modal ──
function viewRecord(id){
  const r=allSaved.find(x=>x.id===id);if(!r)return;
  viewingId=id;
  document.getElementById('viewTitle').textContent=r.course;
  const cat=r.prog_type||'Other';
  document.getElementById('viewMeta').innerHTML=`
    <span class="prog-badge ${pbClass(cat)}">${r.prog_type}</span>
    ${r.detail?`<span>${r.detail}</span>`:''}
    <span>${new Date(r.created_at).toLocaleString()}</span>
    ${r.notes?`<span>${r.notes}</span>`:''}`;
  // Show/hide delete btn based on ownership
  const canEdit=currentUser&&(currentUser.id===r.created_by);
  document.getElementById('viewDelBtn').style.display=canEdit?'inline-flex':'none';
  document.getElementById('viewLoadBtn').style.display=canEdit?'inline-flex':'none';
  // Mini table
  const occ=new Set();
  const sess=r.sessions||{};
  for(const k of Object.keys(sess)){const s=sess[k];if(!s)continue;const[day,t]=k.split('::'),si=r.slots.indexOf(t);for(let d=1;d<s.duration;d++) occ.add(`${day}::${r.slots[si+d]}`);}
  let html='<tr><th style="width:60px"></th>'+r.active_days.map(d=>`<th${WKND.has(d)?' class="wknd"':''}>${d}</th>`).join('')+'</tr>';
  for(let si=0;si<r.slots.length;si++){
    const t=r.slots[si];
    html+=`<tr><td class="time-col">${tpill(t)}</td>`;
    for(const day of r.active_days){
      const k=`${day}::${t}`,iw=WKND.has(day);
      if(occ.has(k)){html+=`<td class="slot${iw?' wknd-slot':''}" style="cursor:default"></td>`;continue;}
      const s=sess[k];
      if(s){const cls=(r.classes||[]).find(c=>c.name===s.cls),bg=cls?cls.color:'#888',h=s.duration*40-4;
        html+=`<td class="slot${iw?' wknd-slot':''}"><div class="session-block" style="background:${bg}1A;border:1.5px solid ${bg};color:${bg};height:${h}px">${s.cls}</div></td>`;
      }else html+=`<td class="slot${iw?' wknd-slot':''}" style="cursor:default"></td>`;
    }html+='</tr>';
  }
  document.getElementById('viewTable').innerHTML=html;
  document.getElementById('viewBg').style.display='flex';
}
function closeView(){document.getElementById('viewBg').style.display='none';viewingId=null;}
async function deleteViewed(){
  if(!viewingId||!confirm('Delete this timetable permanently?'))return;
  const{error}=await sb.from('timetables').delete().eq('id',viewingId);
  if(error){toast('Delete failed.');return;}
  closeView();toast('Deleted.');renderSaved();
}
function loadFromView(){
  if(!viewingId)return;
  loadRecord(viewingId);closeView();
}
function loadRecord(id){
  const r=allSaved.find(x=>x.id===id);if(!r)return;
  if(!confirm(`Load "${r.course}"? This replaces your current timetable.`))return;
  classes=JSON.parse(JSON.stringify(r.classes||[]));
  activeDays=[...r.active_days];
  slots=[...r.slots];
  sessions=JSON.parse(JSON.stringify(r.sessions||{}));
  initDays();renderChips();renderLegend();renderTT();
  switchTab('builder',document.querySelector('.tab-btn'));
  toast('Timetable loaded.');
}

// ── Real-time subscription ──
sb.channel('timetables-changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'timetables'},()=>{
    if(document.getElementById('tab-saved').classList.contains('active')) renderSaved();
  }).subscribe();

// ── Toast ──
function toast(msg,dur=2800){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast';el.textContent=msg;
  document.body.appendChild(el);setTimeout(()=>el.remove(),dur);
}

// ── Init ──
initDays();
applySlots();
initAuth();
renderSaved();
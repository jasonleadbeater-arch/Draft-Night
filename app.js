const SUPABASE_URL='https://eaqkrtybkssrrtarlyap.supabase.co', SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhcWtydHlia3NzcnJ0YXJseWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MDU2MDgsImV4cCI6MjExMDE4MTYwOH0.9cAe5p0G7zCS_9cG6_aIkdVlgS3XjYR1mfa8ffgpd2k';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $app=document.getElementById('app');
let me=JSON.parse(localStorage.getItem('mtg')||'null'),R=null,P=[],K=[],X=[],B=[],ch=null,timer=null;

const img=c=>c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||'';
const slim=c=>({id:c.id,name:c.name,img:img(c),r:c.rarity,t:c.type_line});
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const sample=(a,k)=>shuffle([...a]).slice(0,k);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const myB=()=>B.find(b=>b.player_id===me.id)?.state;
const myPack=()=>K.find(k=>k.round===R.round&&k.holder_seat===me.seat&&k.cards.length);
const imgs=(arr,cls,attrs=()=>'')=>arr.map((c,i)=>`<img class="c ${cls}" src="${c.img}" title="${c.name}" ${attrs(c,i)}>`).join('');

/* ---------- entry ---------- */
const sets=[];let picked=[];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function home(){
  $app.innerHTML=`<div class="box hero"><h1>Draft Night</h1><p style="text-align:center">Pick a name, choose your sets, and draft with friends.</p>
  <label>Your name</label>
  <select id="nmsel" onchange="nmnew.style.display=this.value==='__new'?'inline-block':'none'"><option>Loading…</option></select>
  <input id="nmnew" placeholder="Enter a new name" style="display:none">
  <hr><label>Create a room</label>
  <select id="setsel" onchange="addSet(this.value);this.selectedIndex=0"><option value="">Loading sets…</option></select>
  <div id="chips"></div>
  <small>1 set = all three rounds. 2–3 sets = one set per round (in order; with 2 sets, round 3 repeats the first).</small><br>
  <button onclick="create()">Create room</button>
  <hr><label>Join a room</label><input id="rc" placeholder="Room code"><button onclick="join()">Join room</button></div>`;
  loadNames();loadSets();renderChips();
}
async function loadNames(){
  const {data}=await db.from('profiles').select('name').order('name');
  const names=data||[],last=localStorage.getItem('mtg_name');
  nmsel.innerHTML=names.map(p=>`<option ${p.name===last?'selected':''}>${esc(p.name)}</option>`).join('')+`<option value="__new">➕ New name…</option>`;
  if(!names.length){nmsel.value='__new';nmnew.style.display='inline-block'}
}
async function loadSets(){
  if(!sets.length){
    try{
      const j=await (await fetch('https://api.scryfall.com/sets')).json();
      const today=new Date().toISOString().slice(0,10),ok=['core','expansion','masters','draft_innovation'];
      sets.push(...j.data.filter(s=>!s.digital&&ok.includes(s.set_type)&&s.released_at<=today)
        .sort((a,b)=>b.released_at.localeCompare(a.released_at)));
    }catch(e){}
  }
  if(window.setsel)setsel.innerHTML='<option value="">+ Add a set…</option>'+
    sets.map(s=>`<option value="${s.code}">${esc(s.name)} (${s.code.toUpperCase()})</option>`).join('');
}
function addSet(c){
  if(!c)return;
  if(picked.length>=3)return alert('Up to 3 sets (one per round)');
  picked.push(c);renderChips();
}
function renderChips(){
  chips.innerHTML=picked.length?picked.map((c,i)=>`<span class="chip">${i+1}. ${c.toUpperCase()} <a onclick="picked.splice(${i},1);renderChips()">✕</a></span>`).join(''):'<small>No sets chosen yet</small>';
}
function getName(){
  const n=(nmsel.value==='__new'?nmnew.value:nmsel.value).trim();
  if(!n)alert('Choose a name or enter a new one');
  return n;
}
async function saveName(name){
  localStorage.setItem('mtg_name',name);
  await db.from('profiles').upsert({name},{onConflict:'name',ignoreDuplicates:true});
}
async function create(){
  const name=getName();if(!name)return;
  if(!picked.length)return alert('Add at least one set');
  const code=Math.random().toString(36).slice(2,6).toUpperCase();
  const {error}=await db.from('rooms').insert({code,set_code:picked.join(',')});
  if(error)return alert(error.message);
  await saveName(name);enter(code,name,0);
}
async function join(){
  const name=getName(),code=rc.value.trim().toUpperCase();
  if(!name)return;if(!code)return alert('Enter a room code');
  const {data:r}=await db.from('rooms').select('*').eq('code',code).single();
  if(!r)return alert('Room not found');
  const {data:ps}=await db.from('players').select('*').eq('room_code',code).order('seat');
  await saveName(name);
  const again=(ps||[]).find(p=>p.name.toLowerCase()===name.toLowerCase());
  if(again)return setMe(code,again);               // rejoin as the same player
  if(r.status!=='lobby')return alert('Draft already started. Rejoin with the name you joined with.');
  enter(code,name,(ps||[]).length);
}
function setMe(code,p){me={code,id:p.id,seat:p.seat,name:p.name};localStorage.setItem('mtg',JSON.stringify(me));boot()}
async function enter(code,name,seat){
  const {data,error}=await db.from('players').insert({room_code:code,name,seat}).select().single();
  if(error)return alert(error.message);
  setMe(code,data);
}
function leave(){localStorage.removeItem('mtg');location.reload()}

/* ---------- data + realtime ---------- */
async function load(){
  const q=t=>db.from(t).select('*').eq('room_code',me.code);
  const [r,p,k,x,b]=await Promise.all([db.from('rooms').select('*').eq('code',me.code).single(),
    q('players').order('seat'),q('packs'),q('picks').order('created_at'),q('boards')]);
  R=r.data;P=p.data||[];K=k.data||[];X=x.data||[];B=b.data||[];
  const cur=K.filter(k=>k.round===R.round);
  if(R.status==='draft'&&cur.length&&cur.every(k=>!k.cards.length)){
    // every pack in this round is empty: move on (guarded by round, so doing it twice is harmless)
    await db.from('rooms').update(R.round===3?{status:'play'}:{round:R.round+1}).eq('code',R.code).eq('round',R.round);
    return load();
  }
  render();
}
function boot(){
  load();
  ch=db.channel('room-'+me.code);
  ['rooms','players','packs','picks','boards'].forEach(table=>
    ch.on('postgres_changes',{event:'*',schema:'public',table,
      filter:table==='rooms'?`code=eq.${me.code}`:`room_code=eq.${me.code}`},
      ()=>{clearTimeout(timer);timer=setTimeout(load,150)}));
  ch.subscribe();
}

/* ---------- views ---------- */
function render(){
  if(!R)return;
  zoom.style.display='none';
  const views={lobby:lobbyV,draft:draftV,play:playV};
  $app.innerHTML=`<div class="bar">Room <b>${R.code}</b> · Sets <b>${R.set_code.toUpperCase().split(',').join(' + ')}</b> · ${esc(me.name)}
    <span style="flex:1"></span><button onclick="leave()">Leave</button></div>`+views[R.status]();
}
const lobbyV=()=>`<div class="box"><h3>Lobby — share code <b>${R.code}</b></h3>
  ${P.map(p=>`<div>${p.seat+1}. ${esc(p.name)}</div>`).join('')}
  ${me.seat===0?`<button id="go" onclick="start()">Start draft</button>`:'<p>Waiting for host…</p>'}</div>`;

/* ---------- draft ---------- */
async function fetchSet(code){
  let url=`https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent('e:'+code)}`,all=[];
  while(url){
    const r=await fetch(url);if(!r.ok)return null;
    const j=await r.json();all.push(...j.data);url=j.next_page;await sleep(100);
  }
  const b=all.filter(c=>c.booster);return b.length?b:all;
}
async function start(){
  go.disabled=true;
  const codes=R.set_code.split(','),pools={};
  for(const code of new Set(codes)){
    go.textContent=`Fetching ${code.toUpperCase()} from Scryfall…`;
    pools[code]=await fetchSet(code);
    if(!pools[code]){alert(`Scryfall found no cards for set code "${code}"`);return render()}
  }
  const n=P.length,rows=[];
  for(let rd=1;rd<=3;rd++){
    const cards=pools[codes[(rd-1)%codes.length]];
    const by=r=>cards.filter(c=>c.rarity===r&&!c.type_line.startsWith('Basic')).map(slim);
    const C=by('common'),U=by('uncommon'),Rr=by('rare'),M=by('mythic');
    for(let s=0;s<n;s++)rows.push({room_code:R.code,round:rd,holder_seat:s,
      cards:shuffle([...sample(Math.random()<1/8&&M.length?M:Rr.length?Rr:M,1),...sample(U,3),...sample(C,10)])});
  }
  await db.from('packs').insert(rows);
  await db.from('rooms').update({status:'draft',round:1}).eq('code',R.code);
}
function draftV(){
  const k=myPack(),mine=X.filter(x=>x.player_id===me.id);
  return `<div class="box"><h3>Round ${R.round}/3 · ${mine.length} picked · passing ${R.round%2?'left':'right'}</h3>
  ${k?`<div class="grid">${imgs(k.cards,'',c=>`onclick="pick('${k.id}','${c.id}')"`)}</div>`
     :'<p>Waiting for the next pack to be passed to you…</p>'}</div>
  <div class="box"><h4>Your picks (${mine.length})</h4><div class="grid">${imgs(mine.map(x=>x.card),'s')}</div></div>`;
}
let busy=false;
async function pick(pid,cid){
  if(busy)return;
  const k=K.find(k=>k.id===pid),c=k?.cards.find(c=>c.id===cid);if(!c)return;
  busy=true;
  try{
    const n=P.length,dir=R.round%2?1:-1,rest=k.cards.filter(c=>c.id!==cid);
    await db.from('picks').insert({room_code:me.code,player_id:me.id,card:c});
    await db.from('packs').update({cards:rest,holder_seat:(k.holder_seat+dir+n)%n}).eq('id',pid);
  }finally{busy=false}
  load();
}

/* ---------- deck builder + table ---------- */
function playV(){
  return myB()?table():builder();
}
function builder(){
  const mine=X.filter(x=>x.player_id===me.id),deck=mine.filter(x=>x.in_deck),side=mine.filter(x=>!x.in_deck);
  const tog=x=>`onclick="toggle('${x.id}',${!x.in_deck})"`;
  return `<div class="box"><h3>Deck (${deck.length}) — click to move to sideboard</h3>
    ${['Plains','Island','Swamp','Mountain','Forest'].map(l=>`<button onclick="land('${l}')">+${l}</button>`).join('')}
    <button onclick="startPlay()">Shuffle up &amp; draw 7</button>
    <div class="grid">${deck.map(x=>`<img class="c s" src="${x.card.img}" ${tog(x)}>`).join('')}</div></div>
    <div class="box"><h3>Sideboard (${side.length}) — click to add to deck</h3>
    <div class="grid">${side.map(x=>`<img class="c s" src="${x.card.img}" ${tog(x)}>`).join('')}</div></div>`;
}
async function toggle(id,v){await db.from('picks').update({in_deck:v}).eq('id',id);load()}
async function land(name){
  const c=await (await fetch(`https://api.scryfall.com/cards/named?exact=${name}`)).json();
  await db.from('picks').insert({room_code:me.code,player_id:me.id,card:slim(c),in_deck:true});load();
}
async function startPlay(){
  const lib=shuffle(X.filter(x=>x.player_id===me.id&&x.in_deck).map(x=>x.card));
  if(!lib.length)return alert('Add cards to your deck first');
  const state={hand:lib.splice(0,7),lib,bf:[],gy:[]};
  await db.from('boards').upsert({room_code:me.code,player_id:me.id,state});load();
}
function table(){
  return P.map(p=>{
    const s=B.find(b=>b.player_id===p.id)?.state,mine=p.id===me.id;
    if(!s)return `<div class="box"><b>${esc(p.name)}</b> — still building…</div>`;
    return `<div class="box"><b>${esc(p.name)}</b> · Library ${s.lib.length} · Hand ${s.hand.length} · Graveyard ${s.gy.length}
    <div class="grid">${s.bf.map((c,i)=>`<img class="c s ${c.tap?'tap':''}" src="${c.img}" title="${c.name}"
      ${mine?`onclick="act('tap',${i})" oncontextmenu="act('gy',${i});return false"`:''}>`).join('')}</div>
    <div class="grid">${imgs(s.gy,'t')}</div>
    ${mine?`<div><button onclick="act('draw')">Draw</button><button onclick="act('shuf')">Shuffle library</button>
      <button onclick="act('untap')">Untap all</button><button onclick="resetB()">Back to deck builder</button></div>
      <h4>Your hand (click = play, right-click = discard)</h4>
      <div class="grid">${imgs(s.hand,'',(c,i)=>`onclick="act('play',${i})" oncontextmenu="act('disc',${i});return false"`)}</div>`:''}
    </div>`}).join('');
}
async function act(a,i){
  const s=structuredClone(myB());
  if(a==='tap')s.bf[i].tap=!s.bf[i].tap;
  if(a==='gy')s.gy.push(s.bf.splice(i,1)[0]);
  if(a==='play')s.bf.push(s.hand.splice(i,1)[0]);
  if(a==='disc')s.gy.push(s.hand.splice(i,1)[0]);
  if(a==='draw'&&s.lib.length)s.hand.push(s.lib.shift());
  if(a==='shuf')shuffle(s.lib);
  if(a==='untap')s.bf.forEach(c=>c.tap=false);
  B.find(b=>b.player_id===me.id).state=s;render();
  await db.from('boards').update({state:s}).eq('room_code',me.code).eq('player_id',me.id);
}
async function resetB(){await db.from('boards').delete().eq('room_code',me.code).eq('player_id',me.id);load()}

/* ---------- hover zoom ---------- */
const zoom=document.createElement('img');zoom.id='zoom';document.body.appendChild(zoom);
const isCard=e=>e.target.tagName==='IMG'&&e.target.classList.contains('c');
const place=e=>{const left=e.clientX>innerWidth/2;zoom.style.left=left?'16px':'auto';zoom.style.right=left?'auto':'16px';zoom.style.transform='translateY(-50%)'};
let lastT=0,tmr,sx,sy,held=false;
document.addEventListener('mouseover',e=>{if(isCard(e)&&Date.now()-lastT>800){zoom.src=e.target.src;zoom.style.display='block';place(e)}});
document.addEventListener('mousemove',e=>{if(zoom.style.display==='block')place(e)});
document.addEventListener('mouseout',e=>{if(isCard(e))zoom.style.display='none'});

/* press-and-hold to zoom on touch screens */
document.addEventListener('touchstart',e=>{
  lastT=Date.now();held=false;clearTimeout(tmr);
  if(!isCard(e))return;
  const src=e.target.src;sx=e.touches[0].clientX;sy=e.touches[0].clientY;
  tmr=setTimeout(()=>{held=true;zoom.src=src;Object.assign(zoom.style,{display:'block',left:'50%',right:'auto',transform:'translate(-50%,-50%)'});navigator.vibrate?.(10)},350);
},{passive:true});
document.addEventListener('touchmove',e=>{if(Math.hypot(e.touches[0].clientX-sx,e.touches[0].clientY-sy)>10)clearTimeout(tmr)},{passive:true});
['touchend','touchcancel'].forEach(ev=>document.addEventListener(ev,()=>{
  lastT=Date.now();clearTimeout(tmr);zoom.style.display='none';if(held)setTimeout(()=>held=false,500)}));
// after a long-press, swallow the click / context menu so it doesn't play, pick or discard the card
['click','contextmenu'].forEach(ev=>document.addEventListener(ev,e=>{if(held){e.preventDefault();e.stopPropagation()}},true));

document.addEventListener('visibilitychange',()=>{if(!document.hidden&&me)load()});
setInterval(()=>{if(me&&R&&R.status==='draft')load()},5000);

me?boot():home();

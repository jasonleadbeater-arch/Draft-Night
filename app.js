const SUPABASE_URL='https://YOUR-PROJECT.supabase.co', SUPABASE_KEY='YOUR-ANON-KEY';
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
function home(){
  $app.innerHTML=`<div class="box"><h2>MTG Draft</h2>
  <input id="nm" placeholder="Your name"><hr>
  <input id="st" placeholder="Set code, e.g. dsk"><button onclick="create()">Create room</button><hr>
  <input id="rc" placeholder="Room code"><button onclick="join()">Join room</button></div>`;
}
async function create(){
  const name=nm.value.trim(),set=st.value.trim().toLowerCase();
  if(!name||!set)return alert('Need your name and a set code');
  const code=Math.random().toString(36).slice(2,6).toUpperCase();
  const {error}=await db.from('rooms').insert({code,set_code:set});
  if(error)return alert(error.message);
  enter(code,name,0);
}
async function join(){
  const name=nm.value.trim(),code=rc.value.trim().toUpperCase();
  if(!name||!code)return alert('Need your name and a room code');
  const {data:r}=await db.from('rooms').select('*').eq('code',code).single();
  if(!r)return alert('Room not found');
  if(r.status!=='lobby')return alert('Draft already started');
  const {count}=await db.from('players').select('*',{count:'exact',head:true}).eq('room_code',code);
  enter(code,name,count);
}
async function enter(code,name,seat){
  const {data,error}=await db.from('players').insert({room_code:code,name,seat}).select().single();
  if(error)return alert(error.message);
  me={code,id:data.id,seat,name};localStorage.setItem('mtg',JSON.stringify(me));boot();
}
function leave(){localStorage.removeItem('mtg');location.reload()}

/* ---------- data + realtime ---------- */
async function load(){
  const q=t=>db.from(t).select('*').eq('room_code',me.code);
  const [r,p,k,x,b]=await Promise.all([db.from('rooms').select('*').eq('code',me.code).single(),
    q('players').order('seat'),q('packs'),q('picks').order('created_at'),q('boards')]);
  R=r.data;P=p.data||[];K=k.data||[];X=x.data||[];B=b.data||[];render();
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
  $app.innerHTML=`<div class="bar">Room <b>${R.code}</b> · Set <b>${R.set_code.toUpperCase()}</b> · ${me.name}
    <span style="flex:1"></span><button onclick="leave()">Leave</button></div>`+views[R.status]();
}
const lobbyV=()=>`<div class="box"><h3>Lobby — share code <b>${R.code}</b></h3>
  ${P.map(p=>`<div>${p.seat+1}. ${p.name}</div>`).join('')}
  ${me.seat===0?`<button id="go" onclick="start()">Start draft</button>`:'<p>Waiting for host…</p>'}</div>`;

/* ---------- draft ---------- */
async function start(){
  go.disabled=true;go.textContent='Fetching cards from Scryfall…';
  let url=`https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(`e:${R.set_code}`)}`,all=[];
  while(url){
    const r=await fetch(url);
    if(!r.ok){alert(`Scryfall returned ${r.status} for set code "${R.set_code}". Check the code at scryfall.com/sets`);return render()}
    const j=await r.json();all.push(...j.data);url=j.next_page;await sleep(100);
  }
  const inBoosters=all.filter(c=>c.booster);
  if(inBoosters.length)all=inBoosters;
  const by=r=>all.filter(c=>c.rarity===r&&!c.type_line.startsWith('Basic')).map(slim);
  const C=by('common'),U=by('uncommon'),Rr=by('rare'),M=by('mythic'),n=P.length,rows=[];
  for(let rd=1;rd<=3;rd++)for(let s=0;s<n;s++)
    rows.push({room_code:R.code,round:rd,holder_seat:s,
      cards:shuffle([...sample(Math.random()<1/8&&M.length?M:Rr.length?Rr:M,1),...sample(U,3),...sample(C,10)])});
  await db.from('packs').insert(rows);
  await db.from('rooms').update({status:'draft',round:1}).eq('code',R.code);
}
function draftV(){
  const k=myPack(),mine=X.filter(x=>x.player_id===me.id);
  return `<div class="box"><h3>Round ${R.round}/3 · Pick ${mine.length+1} · passing ${R.round%2?'left':'right'}</h3>
  ${k?`<div class="grid">${imgs(k.cards,'',c=>`onclick="pick('${k.id}','${c.id}')"`)}</div>`
     :'<p>Waiting for the next pack to be passed to you…</p>'}</div>
  <div class="box"><h4>Your picks (${mine.length})</h4><div class="grid">${imgs(mine.map(x=>x.card),'s')}</div></div>`;
}
async function pick(pid,cid){
  const k=K.find(k=>k.id===pid),c=k?.cards.find(c=>c.id===cid);if(!c)return;
  const n=P.length,dir=R.round%2?1:-1,rest=k.cards.filter(c=>c.id!==cid);
  k.cards=rest;
  await db.from('picks').insert({room_code:me.code,player_id:me.id,card:c});
  await db.from('packs').update({cards:rest,holder_seat:(k.holder_seat+dir+n)%n}).eq('id',pid);
  if(K.filter(k=>k.round===R.round).every(k=>!k.cards.length))
    await db.from('rooms').update(R.round===3?{status:'play'}:{round:R.round+1}).eq('code',R.code).eq('round',R.round);
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
    if(!s)return `<div class="box"><b>${p.name}</b> — still building…</div>`;
    return `<div class="box"><b>${p.name}</b> · Library ${s.lib.length} · Hand ${s.hand.length} · Graveyard ${s.gy.length}
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

me?boot():home();

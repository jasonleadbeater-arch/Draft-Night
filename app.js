const SUPABASE_URL='https://eaqkrtybkssrrtarlyap.supabase.co', SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhcWtydHlia3NzcnJ0YXJseWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MDU2MDgsImV4cCI6MjExMDE4MTYwOH0.9cAe5p0G7zCS_9cG6_aIkdVlgS3XjYR1mfa8ffgpd2k';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);   // values come from config.js
const $app=document.getElementById('app');
const MIN_DECK=40,START_LIFE=20,MAX_HAND=7;
const PH=['upkeep','draw','main1','combat','main2','end'];
const PHN={untap:'Untap',upkeep:'Upkeep',draw:'Draw',main1:'Main 1',combat:'Combat',main2:'Main 2',end:'End'};
const FORMATS={
  draft:{name:'Booster Draft',info:'3 rounds of 14-card packs from your chosen set(s). Build a deck of at least 40 cards. 20 life.'},
  sealed:{name:'Sealed',info:'No drafting: every player opens 6 packs from the chosen set(s) and builds a deck of at least 40 cards. 20 life.'},
  cube:{name:'Cube Draft',info:'3 rounds of 15-card packs from a cube (each card appears once). Build a deck of at least 40 cards. 20 life.'}};
const CUBES=['vintage','legacy','modern','pauper','arena'];
let me=JSON.parse(localStorage.getItem('mtg')||'null'),R=null,P=[],K=[],X=[],B=[],ch=null,timer=null,hooking=false,MENU=[];

/* ---------- helpers ---------- */
const img=c=>c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||'';
const slim=c=>({id:c.id,name:c.name,img:img(c),r:c.rarity,t:c.type_line,kw:c.keywords||[]});
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const sample=(a,k)=>shuffle([...a]).slice(0,k);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const stOf=id=>B.find(b=>b.player_id===id)?.state;
const nm=id=>P.find(p=>p.id===id)?.name||'?';
const isLand=c=>/\bLand\b/.test((c.t||'').split(' // ')[0]);
const isCreature=c=>/\bCreature\b/.test(c.t||'');
const isInstant=c=>/\bInstant\b/.test(c.t||'');
const hasKw=(c,k)=>(c.kw||[]).includes(k);
const strip=c=>{const {tap,atk,sick,n,...r}=c;return r};
const myPack=()=>K.find(k=>k.round===R.round&&k.holder_seat===me.seat&&k.cards.length);
const tile=(c,cls,at)=>`<span class="w"><img class="c ${cls}${c.tap?' tap':''}" src="${c.img}" title="${esc(c.name)}" ${at}>${c.n?`<i class="bd">${c.n>0?'+':''}${c.n}/${c.n>0?'+':''}${c.n}</i>`:''}${c.atk?'<i class="bd a">⚔</i>':c.sick?'<i class="bd z">💤</i>':''}</span>`;
const imgs=(arr,cls,at=()=>'')=>arr.map((c,i)=>tile(c,cls,at(c,i))).join('');
function toast(m){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
  t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',3500)}
function openMenu(title,items){
  MENU=items;let d=document.getElementById('menu');
  if(!d){d=document.createElement('div');d.id='menu';d.onclick=e=>{if(e.target===d)closeMenu()};document.body.appendChild(d)}
  d.innerHTML=`<div class="mb"><b>${esc(title)}</b>${items.map((x,i)=>`<button onclick="runMenu(${i})">${x[0]}</button>`).join('')}<button class="ghost" onclick="closeMenu()">Cancel</button></div>`;
  d.style.display='flex';
}
const closeMenu=()=>{document.getElementById('menu').style.display='none'};
const runMenu=i=>{const f=MENU[i][1];closeMenu();f()};

/* ---------- entry ---------- */
const sets=[];let picked=[];
function home(){
  $app.innerHTML=`<div class="box hero"><h1>Draft Night</h1><p style="text-align:center">Pick a name, choose a format, and play with friends.</p>
  <label>Your name</label>
  <select id="nmsel" onchange="nmnew.style.display=this.value==='__new'?'inline-block':'none'"><option>Loading…</option></select>
  <input id="nmnew" placeholder="Enter a new name" style="display:none">
  <hr><label>Create a room</label>
  <select id="fmt" onchange="fmtChange()">${Object.entries(FORMATS).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('')}</select>
  <p id="fmtinfo" style="opacity:.8"></p>
  <div id="setbox"><select id="setsel" onchange="addSet(this.value);this.selectedIndex=0"><option value="">Loading sets…</option></select>
    <div id="chips"></div><small>1 set = all rounds / packs. 2–3 sets = one set per round (Draft), or cycled across the 6 packs (Sealed).</small></div>
  <div id="cubebox" style="display:none"><select id="cubesel">${CUBES.map(c=>`<option>${c}</option>`).join('')}</select></div>
  <button onclick="create()">Create room</button>
  <hr><label>Join a room</label><input id="rc" placeholder="Room code"><button onclick="join()">Join room</button></div>`;
  loadNames();loadSets();renderChips();fmtChange();
}
function fmtChange(){const f=fmt.value;fmtinfo.textContent=FORMATS[f].info;setbox.style.display=f==='cube'?'none':'block';cubebox.style.display=f==='cube'?'block':'none'}
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
      sets.push(...j.data.filter(s=>!s.digital&&ok.includes(s.set_type)&&s.released_at<=today).sort((a,b)=>b.released_at.localeCompare(a.released_at)));
    }catch(e){}
  }
  if(window.setsel)setsel.innerHTML='<option value="">+ Add a set…</option>'+sets.map(s=>`<option value="${s.code}">${esc(s.name)} (${s.code.toUpperCase()})</option>`).join('');
}
function addSet(c){if(!c)return;if(picked.length>=3)return alert('Up to 3 sets');picked.push(c);renderChips()}
function renderChips(){
  chips.innerHTML=picked.length?picked.map((c,i)=>`<span class="chip">${i+1}. ${c.toUpperCase()} <a onclick="picked.splice(${i},1);renderChips()">✕</a></span>`).join(''):'<small>No sets chosen yet</small>';
}
function getName(){
  const n=(nmsel.value==='__new'?nmnew.value:nmsel.value).trim();
  if(!n)alert('Choose a name or enter a new one');
  return n;
}
async function saveName(name){localStorage.setItem('mtg_name',name);await db.from('profiles').upsert({name},{onConflict:'name',ignoreDuplicates:true})}
async function create(){
  const name=getName();if(!name)return;
  const f=fmt.value,sc=f==='cube'?cubesel.value:picked.join(',');
  if(f!=='cube'&&!picked.length)return alert('Add at least one set');
  const code=Math.random().toString(36).slice(2,6).toUpperCase();
  const {error}=await db.from('rooms').insert({code,set_code:sc,format:f});
  if(error)return alert(error.message+'\n(Have you run the latest SQL from schema.sql?)');
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
  if(again)return setMe(code,again);
  if(r.status!=='lobby')return alert('Game already started. Rejoin with the name you joined with.');
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
    await db.from('rooms').update(R.round===3?{status:'play'}:{round:R.round+1}).eq('code',R.code).eq('round',R.round);
    return load();
  }
  render();
  if(!hooking){hooking=true;let acted=false;try{acted=await hooks()}finally{hooking=false}if(acted)load()}
}
function boot(){
  load();
  ch=db.channel('room-'+me.code);
  ['rooms','players','packs','picks','boards'].forEach(table=>
    ch.on('postgres_changes',{event:'*',schema:'public',table,filter:table==='rooms'?`code=eq.${me.code}`:`room_code=eq.${me.code}`},
      ()=>{clearTimeout(timer);timer=setTimeout(load,150)}));
  ch.subscribe();
}
// read-modify-write helpers: always start from the freshest copy in the database
async function edit(pid,fn){
  const {data}=await db.from('boards').select('state').eq('room_code',R.code).eq('player_id',pid).single();
  const s=data.state;fn(s);
  await db.from('boards').update({state:s}).eq('room_code',R.code).eq('player_id',pid);
  const b=B.find(b=>b.player_id===pid);if(b)b.state=s;render();
}
const mine=fn=>edit(me.id,fn);
async function game(fn){
  const {data}=await db.from('rooms').select('game').eq('code',R.code).single();
  const g=data.game,r=fn(g);if(r===false)return false;
  await db.from('rooms').update({game:g}).eq('code',R.code);
  R.game=g;render();return r===undefined?true:r;
}
const log=(g,m)=>{g.log.push(m);g.log=g.log.slice(-40)};

/* ---------- views ---------- */
function render(){
  if(!R)return;
  zoom.style.display='none';
  const f=R.format||'draft',label=f==='cube'?'Cube: '+R.set_code.toUpperCase():R.set_code.toUpperCase().split(',').join(' + ');
  const views={lobby:lobbyV,draft:draftV,play:playV};
  $app.innerHTML=`<div class="bar">Room <b>${R.code}</b> · ${FORMATS[f].name} · <b>${label}</b> · ${esc(me.name)}
    <span style="flex:1"></span><button onclick="leave()">Leave</button></div>`+views[R.status]();
}
const lobbyV=()=>`<div class="box"><h3>Lobby — share code <b>${R.code}</b></h3>
  <p>${FORMATS[R.format||'draft'].info}</p>
  ${P.map(p=>`<div>${p.seat+1}. ${esc(p.name)}</div>`).join('')}
  ${me.seat===0?`<button id="go" onclick="start()">Start</button>`:'<p>Waiting for host…</p>'}</div>`;

/* ---------- starting: card pools per format ---------- */
async function fetchQ(q){
  let url=`https://api.scryfall.com/cards/search?unique=cards&q=${encodeURIComponent(q)}`,all=[];
  while(url){
    const r=await fetch(url);if(!r.ok)return null;
    const j=await r.json();all.push(...j.data);url=j.next_page;await sleep(100);
  }
  return all;
}
async function fetchSet(code){const a=await fetchQ('e:'+code);if(!a)return null;const b=a.filter(c=>c.booster);return b.length?b:a}
const tiers=cards=>{const by=r=>cards.filter(c=>c.rarity===r&&!c.type_line.startsWith('Basic')).map(slim);return{C:by('common'),U:by('uncommon'),R:by('rare'),M:by('mythic')}};
const makePack=t=>shuffle([...sample(Math.random()<1/8&&t.M.length?t.M:t.R.length?t.R:t.M,1),...sample(t.U,3),...sample(t.C,10)]);
async function start(){
  go.disabled=true;const f=R.format||'draft',n=P.length;
  if(f==='cube'){
    go.textContent='Fetching cube from Scryfall…';
    const pool=await fetchQ('cube:'+R.set_code);
    if(!pool||!pool.length){alert(`Scryfall found no cube called "${R.set_code}"`);return render()}
    if(pool.length<n*45){alert(`This cube has ${pool.length} cards but ${n*45} are needed for ${n} players`);return render()}
    const cards=shuffle(pool.map(slim)),rows=[];
    for(let rd=1;rd<=3;rd++)for(let s=0;s<n;s++)rows.push({room_code:R.code,round:rd,holder_seat:s,cards:cards.splice(0,15)});
    await db.from('packs').insert(rows);
    return db.from('rooms').update({status:'draft',round:1}).eq('code',R.code);
  }
  const codes=R.set_code.split(','),T={};
  for(const code of new Set(codes)){
    go.textContent=`Fetching ${code.toUpperCase()} from Scryfall…`;
    const pool=await fetchSet(code);
    if(!pool||!pool.length){alert(`Scryfall found no cards for set code "${code}"`);return render()}
    T[code]=tiers(pool);
  }
  if(f==='sealed'){
    const rows=[];
    for(const p of P)for(let k=0;k<6;k++)makePack(T[codes[k%codes.length]]).forEach(card=>rows.push({room_code:R.code,player_id:p.id,card}));
    await db.from('picks').insert(rows);
    return db.from('rooms').update({status:'play'}).eq('code',R.code);
  }
  const rows=[];
  for(let rd=1;rd<=3;rd++)for(let s=0;s<n;s++)rows.push({room_code:R.code,round:rd,holder_seat:s,cards:makePack(T[codes[(rd-1)%codes.length]])});
  await db.from('packs').insert(rows);
  await db.from('rooms').update({status:'draft',round:1}).eq('code',R.code);
}

/* ---------- draft ---------- */
function draftV(){
  const k=myPack(),mp=X.filter(x=>x.player_id===me.id);
  return `<div class="box"><h3>Round ${R.round}/3 · ${mp.length} picked · passing ${R.round%2?'left':'right'}</h3>
  ${k?`<div class="grid">${imgs(k.cards,'',c=>`onclick="pick('${k.id}','${c.id}')"`)}</div>`:'<p>Waiting for the next pack to be passed to you…</p>'}</div>
  <div class="box"><h4>Your picks (${mp.length})</h4><div class="grid">${imgs(mp.map(x=>x.card),'s')}</div></div>`;
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

/* ---------- deck building ---------- */
const playV=()=>stOf(me.id)?(R.game?gameV():pregame()):builder();
function builder(){
  const mp=X.filter(x=>x.player_id===me.id),deck=mp.filter(x=>x.in_deck),side=mp.filter(x=>!x.in_deck);
  const tog=x=>`onclick="toggle('${x.id}',${!x.in_deck})"`;
  return `<div class="box"><h3>Deck (${deck.length} / ${MIN_DECK} minimum) — click to move to sideboard</h3>
    ${['Plains','Island','Swamp','Mountain','Forest'].map(l=>`<button onclick="land('${l}')">+${l}</button>`).join('')}
    <button onclick="ready()">Ready — shuffle &amp; draw 7</button>
    <div class="grid">${deck.map(x=>tile(x.card,'s',tog(x))).join('')}</div></div>
    <div class="box"><h3>Sideboard (${side.length}) — click to add to deck</h3>
    <div class="grid">${side.map(x=>tile(x.card,'s',tog(x))).join('')}</div></div>`;
}
async function toggle(id,v){await db.from('picks').update({in_deck:v}).eq('id',id);load()}
async function land(name){
  const c=await (await fetch(`https://api.scryfall.com/cards/named?exact=${name}`)).json();
  await db.from('picks').insert({room_code:me.code,player_id:me.id,card:slim(c),in_deck:true});load();
}
async function ready(){
  const deck=X.filter(x=>x.player_id===me.id&&x.in_deck).map(x=>x.card);
  if(deck.length<MIN_DECK)return toast(`Your deck needs at least ${MIN_DECK} cards (you have ${deck.length})`);
  const lib=shuffle(deck),hand=lib.splice(0,7);
  await db.from('boards').upsert({room_code:me.code,player_id:me.id,state:{lib,hand,bf:[],gy:[],ex:[],life:START_LIFE,poison:0,mull:0,pend:0,kept:false}});
  load();
}
const backToBuilder=async()=>{await db.from('boards').delete().eq('room_code',me.code).eq('player_id',me.id);load()};

/* ---------- opening hands (London mulligan) ---------- */
function pregame(){
  const s=stOf(me.id);
  const others=`<div class="box"><b>Players</b>${P.map(p=>`<div>${esc(p.name)}: ${stOf(p.id)?.kept?'✅ kept':stOf(p.id)?'deciding…':'building deck…'}</div>`).join('')}</div>`;
  if(s.kept)return `<div class="box"><h3>Waiting for everyone to keep their hand…</h3></div>`+others;
  return `<div class="box"><h3>Opening hand${s.mull?` (mulligan ${s.mull})`:''}</h3>
   ${s.pend>0?`<p>Choose <b>${s.pend}</b> card(s) to put on the bottom of your library — click them.</p>`
     :`<button onclick="keep()">Keep</button>${s.mull<6?'<button onclick="mull()">Mulligan</button>':''}<button onclick="backToBuilder()">Back to deck builder</button>`}
   <div class="grid">${imgs(s.hand,'',(c,i)=>s.pend>0?`onclick="bottomCard(${i})"`:'')}</div></div>`+others;
}
const mull=()=>mine(s=>{s.lib.push(...s.hand);shuffle(s.lib);s.hand=s.lib.splice(0,7);s.mull++});
const keep=()=>mine(s=>{if(s.mull>0)s.pend=s.mull;else s.kept=true});
const bottomCard=i=>mine(s=>{s.lib.push(s.hand.splice(i,1)[0]);if(--s.pend===0)s.kept=true});

/* ---------- game rules ---------- */
async function hooks(){
  if(R.status!=='play')return false;
  const g=R.game,s=stOf(me.id);
  if(!g){
    if(me.seat===0&&P.length&&P.every(p=>stOf(p.id)?.kept)){
      const order=shuffle(P.map(p=>p.id));
      await db.from('rooms').update({game:{turn:1,order,active:0,phase:'upkeep',landDrop:false,stack:[],winner:null,log:[`${nm(order[0])} goes first`]}}).eq('code',R.code).is('game',null);
      return true;
    }
    return false;
  }
  if(s&&!s.lost&&(s.life<=0||s.poison>=10||s.empty)){
    await mine(s=>{s.lost=true});await game(g=>{log(g,`☠ ${me.name} is eliminated`)});return true;
  }
  const alive=P.filter(p=>stOf(p.id)&&!stOf(p.id).lost);
  if(!g.winner&&P.length>1&&alive.length<=1){
    await game(g=>{if(g.winner)return false;g.winner=alive[0]?.id||'none';log(g,alive[0]?`🏆 ${alive[0].name} wins!`:'The game is a draw')});return true;
  }
  if(!g.winner&&g.phase==='untap'&&g.order[g.active]===me.id){   // untap step: automatic, no priority
    await mine(s=>s.bf.forEach(c=>{c.tap=false;c.sick=false;c.atk=false}));
    await game(g=>{if(g.phase!=='untap')return false;g.phase='upkeep'});return true;
  }
  return false;
}
const myTurn=()=>R.game.order[R.game.active]===me.id;
const inMain=()=>['main1','main2'].includes(R.game.phase);
function timing(c){
  const g=R.game;
  if(isLand(c)){
    if(!myTurn()||!inMain())return 'Lands can only be played during your own main phase';
    if(g.stack.length)return 'The stack must be empty to play a land';
    if(g.landDrop)return 'You have already played a land this turn';
    return null;
  }
  if(isInstant(c)||hasKw(c,'Flash'))return null;
  if(!myTurn()||!inMain())return 'Only instants and Flash cards can be cast outside your own main phase';
  if(g.stack.length)return 'The stack must be empty to cast this at sorcery speed';
  return null;
}
async function cast(i){
  const g=R.game,s=stOf(me.id),c=s.hand[i];
  if(!c||g.winner)return;if(s.lost)return toast('You have been eliminated');
  const why=timing(c);if(why)return toast(why);
  if(isLand(c)){
    await mine(s=>{s.bf.push(strip(s.hand.splice(i,1)[0]))});
    await game(g=>{g.landDrop=true;log(g,`${me.name} plays ${c.name}`)});
  }else{
    await mine(s=>{s.hand.splice(i,1)});
    await game(g=>{g.stack.push({uid:Math.random().toString(36).slice(2),card:c,by:me.id});log(g,`${me.name} casts ${c.name}`)});
  }
}
async function resolveTop(counter){
  const top=R.game.stack.at(-1);if(!top)return;
  const ok=await game(g=>{const t=g.stack.at(-1);if(!t||t.uid!==top.uid)return false;g.stack.pop();log(g,`${counter?'Countered':'Resolved'}: ${t.card.name}`);return true});
  if(!ok)return;
  const perm=!counter&&/\b(Creature|Artifact|Enchantment|Planeswalker|Battle)\b/.test(top.card.t||'');
  await edit(top.by,s=>{if(perm)s.bf.push({...top.card,sick:isCreature(top.card)});else s.gy.push(top.card)});
}
async function nextPhase(){
  const g=R.game;if(!myTurn()||g.winner)return;
  if(g.stack.length)return toast('Resolve everything on the stack first');
  if(g.phase==='end'){
    const s=stOf(me.id);
    if(s.hand.length>MAX_HAND)return toast(`Cleanup: discard down to ${MAX_HAND} cards (click a card in your hand → Discard)`);
    await mine(s=>s.bf.forEach(c=>c.atk=false));
    return game(g=>{let a=g.active;do{a=(a+1)%g.order.length}while(stOf(g.order[a])?.lost&&a!==g.active);
      g.active=a;g.turn++;g.phase='untap';g.landDrop=false;log(g,`— Turn ${g.turn}: ${nm(g.order[a])} —`)});
  }
  const nx=PH[PH.indexOf(g.phase)+1];
  if(nx==='draw'&&!(g.turn===1&&P.length===2))await mine(s=>{if(s.lib.length)s.hand.push(s.lib.shift());else s.empty=true});
  if(g.phase==='combat')await mine(s=>s.bf.forEach(c=>c.atk=false));
  await game(g=>{g.phase=nx});
}
async function attack(i){
  const g=R.game,c=stOf(me.id).bf[i];
  if(!myTurn()||g.phase!=='combat')return toast('You can only attack during your own combat phase');
  if(c.tap)return toast('That creature is tapped');
  if(hasKw(c,'Defender'))return toast('Creatures with Defender cannot attack');
  if(c.sick&&!hasKw(c,'Haste'))return toast('Summoning sick: it has not been under your control since your turn began (no Haste)');
  if(c.atk)return;
  await mine(s=>{const x=s.bf[i];x.atk=true;if(!hasKw(x,'Vigilance'))x.tap=true});
}
async function mv(from,i,to){
  await mine(s=>{const c=strip(s[from].splice(i,1)[0]);
    if(to==='lib')s.lib.unshift(c);else if(to==='bf')s.bf.push({...c,sick:isCreature(c)});else s[to].push(c)});
}
const life=(pid,d)=>edit(pid,s=>{s.life+=d});
const pois=pid=>edit(pid,s=>{s.poison++});
const drawEffect=()=>mine(s=>{if(s.lib.length)s.hand.push(s.lib.shift());else s.empty=true});
const concede=()=>{if(confirm('Concede the game?'))mine(s=>{s.lost=true})};

function handMenu(i){
  const c=stOf(me.id).hand[i];if(!c)return;
  openMenu(c.name,[[isLand(c)?'Play land':'Cast',()=>cast(i)],['Discard',()=>mv('hand',i,'gy')]]);
}
function bfMenu(i){
  const c=stOf(me.id).bf[i];if(!c)return;
  const it=[[c.tap?'Untap':'Tap',()=>mine(s=>{s.bf[i].tap=!s.bf[i].tap})]];
  if(isCreature(c))it.push(['Attack',()=>attack(i)]);
  it.push(['+1/+1 counter',()=>mine(s=>{s.bf[i].n=(s.bf[i].n||0)+1})],['−1/−1 counter',()=>mine(s=>{s.bf[i].n=(s.bf[i].n||0)-1})],
    ['To graveyard',()=>mv('bf',i,'gy')],['Exile',()=>mv('bf',i,'ex')],['Return to hand',()=>mv('bf',i,'hand')],['Top of library',()=>mv('bf',i,'lib')]);
  openMenu(c.name,it);
}
function zoneMenu(z,i){
  const c=stOf(me.id)[z][i];if(!c)return;
  openMenu(c.name,[['Return to hand',()=>mv(z,i,'hand')],['Put onto battlefield',()=>mv(z,i,'bf')],[z==='gy'?'Exile':'To graveyard',()=>mv(z,i,z==='gy'?'ex':'gy')]]);
}

function gameV(){
  const g=R.game,act=g.order[g.active],s=stOf(me.id);
  const head=`<div class="box"><h3>Turn ${g.turn} · ${esc(nm(act))}'s turn</h3>
    ${['untap',...PH].map(p=>`<span class="ph ${p===g.phase?'on':''}">${PHN[p]}</span>`).join('')}
    ${myTurn()&&!g.winner&&g.phase!=='untap'?`<button onclick="nextPhase()">${g.phase==='end'?'End turn →':'Next phase →'}</button>`:''}
    ${g.winner?`<h2>🏆 ${g.winner==='none'?'Draw':esc(nm(g.winner))+' wins!'}</h2>`:''}
    <div class="log">${g.log.slice(-8).reverse().map(esc).join('<br>')}</div></div>`;
  const stack=g.stack.length?`<div class="box"><h3>Stack (top first)</h3><div class="grid">${g.stack.slice().reverse().map(x=>`<div>${tile(x.card,'s','')}<br><small>${esc(nm(x.by))}</small></div>`).join('')}</div>
    <button onclick="resolveTop(false)">Resolve top</button><button onclick="resolveTop(true)">Counter top</button>
    <small>Agree with the other players before resolving (they may respond by casting instants).</small></div>`:'';
  return head+stack+P.map(panel).join('')+
    (s&&!s.lost?`<div class="box"><h4>Your hand (${s.hand.length}) — click a card</h4><div class="grid">${imgs(s.hand,'',(c,i)=>`onclick="handMenu(${i})"`)}</div></div>`:'');
}
function panel(p){
  const s=stOf(p.id),own=p.id===me.id,g=R.game;
  if(!s)return '';
  const zc=(arr,z)=>`<div class="grid">${imgs(arr,'t',(c,i)=>own?`onclick="zoneMenu('${z}',${i})"`:'')}</div>`;
  return `<div class="box ${g.order[g.active]===p.id?'active':''} ${s.lost?'lost':''}"><b>${esc(p.name)}</b>${s.lost?' ☠ eliminated':''}
   · ❤ <b>${s.life}</b>
   ${[-5,-1,1,5].map(d=>`<button class="sm" onclick="life('${p.id}',${d})">${d>0?'+':''}${d}</button>`).join('')}
   · ☠ poison ${s.poison} <button class="sm" onclick="pois('${p.id}')">+1</button>
   · Library ${s.lib.length} · Hand ${s.hand.length} · Graveyard ${s.gy.length} · Exile ${s.ex.length}
   <div class="grid">${imgs(s.bf,'s',(c,i)=>own?`onclick="bfMenu(${i})"`:'')}</div>
   ${s.gy.length?'<small>Graveyard</small>'+zc(s.gy,'gy'):''}${s.ex.length?'<small>Exile</small>'+zc(s.ex,'ex'):''}
   ${own&&!s.lost?`<div><button class="sm" onclick="drawEffect()">Draw a card (effect)</button><button class="sm" onclick="mine(s=>shuffle(s.lib))">Shuffle library</button><button class="sm" onclick="concede()">Concede</button></div>`:''}</div>`;
}

/* ---------- hover / press-and-hold zoom ---------- */
const zoom=document.createElement('img');zoom.id='zoom';document.body.appendChild(zoom);
const isCard=e=>e.target.tagName==='IMG'&&e.target.classList.contains('c');
const place=e=>{const left=e.clientX>innerWidth/2;zoom.style.left=left?'16px':'auto';zoom.style.right=left?'auto':'16px';zoom.style.transform='translateY(-50%)'};
let lastT=0,tmr,sx,sy,held=false;
document.addEventListener('mouseover',e=>{if(isCard(e)&&Date.now()-lastT>800){zoom.src=e.target.src;zoom.style.display='block';place(e)}});
document.addEventListener('mousemove',e=>{if(zoom.style.display==='block')place(e)});
document.addEventListener('mouseout',e=>{if(isCard(e))zoom.style.display='none'});
document.addEventListener('touchstart',e=>{
  lastT=Date.now();held=false;clearTimeout(tmr);
  if(!isCard(e))return;
  const src=e.target.src;sx=e.touches[0].clientX;sy=e.touches[0].clientY;
  tmr=setTimeout(()=>{held=true;zoom.src=src;Object.assign(zoom.style,{display:'block',left:'50%',right:'auto',transform:'translate(-50%,-50%)'});navigator.vibrate?.(10)},350);
},{passive:true});
document.addEventListener('touchmove',e=>{if(Math.hypot(e.touches[0].clientX-sx,e.touches[0].clientY-sy)>10)clearTimeout(tmr)},{passive:true});
['touchend','touchcancel'].forEach(ev=>document.addEventListener(ev,()=>{lastT=Date.now();clearTimeout(tmr);zoom.style.display='none';if(held)setTimeout(()=>held=false,500)}));
['click','contextmenu'].forEach(ev=>document.addEventListener(ev,e=>{if(held){e.preventDefault();e.stopPropagation()}},true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&me)load()});
setInterval(()=>{if(me&&R&&R.status!=='lobby')load()},5000);

me?boot():home();


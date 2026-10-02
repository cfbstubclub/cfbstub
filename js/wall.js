// Stub Club wall: rendering, tapping, matchups, export/restore. Persistence and routing live in app.js.
const TEAMS=DATA.teams,VENUES=DATA.venues,BOWLS=DATA.bowls;
const T=Object.fromEntries(TEAMS.map(t=>[t.id,t]));
const CONFS=["ACC","Big Ten","Big 12","SEC","American","CUSA","MAC","Mountain West","Pac-12","Sun Belt","Independent"];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"x";

// state: sets of ids; custom venues/bowls are lists of {id,name,...}
let S={stadiums:new Set(),teams:new Set(),bowls:new Set(),customVenues:[],customBowls:[],matchups:{},order:[]};const assets=null;
let canEdit=false;
const SAMPLE={stadiums:new Set(["v:asu","v:ariz","v:tex","v:ou","v:lsu","v:bama","v:usc","v:ucla","v:ore","v:unlv","v:byu","v:utah","v:nd","v:mich"]),
  teams:new Set(["asu","ariz","tex","ou","lsu","bama","usc","ucla","ore","unlv","byu","utah","nd","mich","osu","uga","colo","ttu","tcu","bsu","sdsu","wash","psu","unm","nmsu","haw","fsu","clem","navy","army"]),
  bowls:new Set(["fiesta-bowl","rose-bowl-game","cotton-bowl","las-vegas-bowl"]),customVenues:[],customBowls:[],photos:{},
  matchups:{"v:asu":{a:"ariz"},"v:nd":{a:"usc"},"v:unlv":{a:"x:Idaho State"},"v:ucla":{a:"usc"},"b:fiesta-bowl":{a:"ore",b:"tex"},"b:cotton-bowl":{a:"tex",b:"ou"},"b:rose-bowl-game":{a:"osu",b:"ore"}},
  order:["s:v:asu","b:fiesta-bowl","s:v:ariz","s:v:tex","b:cotton-bowl","s:v:ou","s:v:lsu","s:v:bama","s:v:usc","s:v:ucla","b:rose-bowl-game","s:v:ore","s:v:unlv","b:las-vegas-bowl","s:v:byu","s:v:utah","s:v:nd","s:v:mich"]};
let sampleMode=false,R=S;

const allVenues=()=>VENUES.concat((R.customVenues||[]).map(v=>({...v,id:"c:"+v.id,custom:true})));
const venue=id=>allVenues().find(v=>v.id===id);
const allBowls=()=>BOWLS.map(b=>({id:slug(b.name),name:b.name,venue:b.venue})).concat((R.customBowls||[]).map(b=>({...b,custom:true})));
const bowlById=id=>allBowls().find(b=>b.id===id);
const bowlVenue=(X,id)=>{const b=bowlById(id);if(!b)return "";return b.venue||(X.matchups&&X.matchups["b:"+id]&&X.matchups["b:"+id].venue)||""};
function visitedVenues(X){const v=new Set(X.stadiums);X.bowls.forEach(id=>{const bv=bowlVenue(X,id);if(bv)v.add(bv)});return v}
function viaBowls(X,vid){return [...X.bowls].filter(id=>bowlVenue(X,id)===vid).map(bowlById)}
function normOrder(X){const want=[...[...X.stadiums].map(id=>"s:"+id),...[...X.bowls].map(id=>"b:"+id)];const w=new Set(want);
  const o=(X.order||[]).filter(k=>w.has(k));const have=new Set(o);want.forEach(k=>{if(!have.has(k))o.push(k)});X.order=o;return o}

function lum(hex){const n=parseInt(hex.slice(1),16),f=c=>(c/=255)<=.03928?c/12.92:((c+.055)/1.055)**2.4;return .2126*f(n>>16&255)+.7152*f(n>>8&255)+.0722*f(n&255)}
function badge(id,cls=""){const t=T[id];const fg=lum(t.c1)>.45?"#111":"#fff";const k=t.abbr.length<=2?.42:t.abbr.length===3?.36:t.abbr.length===4?.3:.25;
  return `<span class="badge ${cls}" style="--c1:${t.c1};--c2:${t.c2};--fg:${fg};--k:${k}" aria-hidden="true">${esc(t.abbr)}</span>`}

/* ---------- saving: local-first, one write in flight ---------- */
let saveTimer=null,saving=false,dirty=false;
function snapshot(){return{stadiums:[...S.stadiums],teams:[...S.teams],bowls:[...S.bowls],customVenues:S.customVenues,customBowls:S.customBowls,matchups:S.matchups,order:normOrder(S)}}
function queueSave(){dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(flush,350)}
async function flush(){
  if(saving||!dirty)return;saving=true;dirty=false;
  try{await window.saveCollection(snapshot())}
  catch(e){dirty=true;toast("Couldn't save that change. It will retry on your next tap.")}
  finally{saving=false;if(dirty)queueSave()}
}

/* ---------- toggling ---------- */
function toggle(kind,id,label){
  if(!canEdit){window.onLockedTap&&window.onLockedTap();return}
  const set=S[kind],was=set.has(id);
  const before={stadiums:new Set(S.stadiums),teams:new Set(S.teams),bowls:new Set(S.bowls),order:[...normOrder(S)]};
  was?set.delete(id):set.add(id);
  if(kind!=="teams"){const k=(kind==="stadiums"?"s:":"b:")+id;S.order=was?S.order.filter(x=>x!==k):S.order.concat(k)}
  let extra=kind==="bowls"&&!was?" · it gets its own ticket stub":"";
  queueSave();render();
  const verb=kind==="stadiums"?(was?"Unmarked":"Visited"):kind==="teams"?(was?"Unmarked":"Seen"):(was?"Unmarked":"Attended");
  toast(`${verb}: ${label}${extra}`,()=>{S.stadiums=before.stadiums;S.teams=before.teams;S.bowls=before.bowls;S.order=before.order;queueSave();render()});
}

/* ---------- views ---------- */
function cellHTML(kind,id,on,inner,cls=""){
  return `<button class="cell ${cls}" data-k="${kind}" data-id="${esc(id)}" aria-pressed="${on}">${inner}<span class="mark" aria-hidden="true">✓</span></button>`}
function hash(s){let h=7;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h}
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function inkOf(t){const c=[t.c1,t.c2].filter(x=>lum(x)<.35).sort((a,b)=>lum(a)-lum(b));return c[0]||"#3A3F3C"}
function pennant(t,w){
  const h=Math.round(w*.42),b=Math.round(w*.12),dy=b*h/(2*w);
  const label=(t.name.length<=8?t.name:t.abbr).toUpperCase();
  const txt=contrast(t.c1,t.c2)>=3?t.c2:(lum(t.c1)>.45?"#111":"#fff");
  const avail=(w-b)*.56,fs=Math.min(h*.42,avail/(label.length*.6)),tl=label.length*fs*.6>avail?` textLength="${avail.toFixed(1)}" lengthAdjust="spacingAndGlyphs"`:"";
  return `<svg class="pn" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="0,0 ${w},${h/2} 0,${h}" fill="${t.c1}" stroke="rgba(0,0,0,.2)" stroke-width=".8"/><polygon points="0,0 ${b},${dy.toFixed(1)} ${b},${(h-dy).toFixed(1)} 0,${h}" fill="${t.c2}"/><line x1="${b+2}" y1="${(dy+2).toFixed(1)}" x2="${b+2}" y2="${(h-dy-2).toFixed(1)}" stroke="${t.c2}" stroke-width=".8" stroke-dasharray="1.5 1.5"/><text x="${b+4}" y="${h/2}" dominant-baseline="central" font-size="${fs.toFixed(1)}" fill="${txt}"${tl}>${esc(label)}</text></svg>`}
const NEUTRAL=["#2B4C7E","#2C6A44","#7B2D3B"];
const sideAbbr=x=>!x?"":x.startsWith("x:")?x.slice(2):(T[x]?T[x].abbr:"");
function matchupText(key){const isB=key.startsWith("b:"),vid=key.slice(2),m=R.matchups&&R.matchups[isB?key:vid];if(!m)return "";
  const v=isB?null:venue(vid);
  if(v&&v.home){const o=sideAbbr(m.a);return o?`${T[v.home].abbr} vs ${o}`:""}
  const a=sideAbbr(m.a),b=sideAbbr(m.b);return a&&b?`${a} vs ${b}`:(a||b)}
function stubHTML(key,i){const isB=key.startsWith("b:"),id=key.slice(2);
  const bw=isB?bowlById(id):null;const bvid=isB?bowlVenue(R,id):"";const v=isB?(bvid?venue(bvid):null):venue(id);if(isB&&!bw||!isB&&!v)return "";
  const t=!isB&&v.home?T[v.home]:null;const band=isB?PIN_COLORS[hash(bw.name)%PIN_COLORS.length]:t?(lum(t.c1)>.5?t.c2:t.c1):NEUTRAL[hash(v.id)%3];
  const rot=((hash(key)%9)-4)*.6;const mt=matchupText(key);
  const label=isB?(()=>{const l=/^CFP /.test(bw.name)?"CFP TITLE GAME":bw.name.replace(/ Game$/,"").replace(/^Famous /,"").toUpperCase();return `<span style="font-size:${l.length>14?6.5:l.length>10?7.5:9}px;letter-spacing:${l.length>14?".05em":".12em"}">${esc(l)}</span>`})():"<span>ADMIT ONE</span>";
  const title=isB?bw.name:v.name;const place=v?`${esc(v.city)}${v.st?", "+esc(v.st):""}`:"Venue not set";
  const tail=mt||isB?"":t?" · "+esc(t.abbr):" · Neutral site";
  return `<button class="stub${isB?" bowlstub":""}" data-stub="${esc(key)}" style="transform:rotate(${rot}deg)" title="${esc(title)}${canEdit&&!sampleMode?" · tap to add the matchup":""}"><span class="band${isB?" bowlband":""}" style="background:${band}">${label}</span>
  <span class="main"><b class="${mt?"one":""}">${esc(isB?(v?v.name:bw.name):v.name)}</b>${mt?`<strong class="vs">${esc(mt)}</strong>`:""}<i>${place}${tail}</i></span>
  <span class="tear"><span>NO.</span><em class="num">${String(i+1).padStart(3,"0")}</em><span>GATE</span></span></button>`}
const PIN_COLORS=["#C8372D","#E0A526","#2F6FB5","#2C7A4B","#7A3E9D","#D9632B","#1F8A8A"];
function pinShape(kind,c){
  if(kind===1){const P="M32 3 L58 11 V32 C58 48 46 58 32 63 C18 58 6 48 6 32 V11 Z";return `<path d="${P}" fill="#C9A646"/><path d="${P}" transform="translate(3.8 3.8) scale(.88)" fill="${c}"/><path d="${P}" transform="translate(9 9) scale(.72)" fill="none" stroke="#F3E4B0" stroke-width="1.6"/>`}
  if(kind===2){const hx=r=>Array.from({length:6},(_,k)=>{const a=Math.PI/6+k*Math.PI/3;return (32+r*Math.cos(a)).toFixed(1)+","+(32+r*Math.sin(a)).toFixed(1)}).join(" ");return `<polygon points="${hx(31)}" fill="#C9A646"/><polygon points="${hx(27.5)}" fill="${c}"/><polygon points="${hx(21)}" fill="none" stroke="#F3E4B0" stroke-width="1.4"/>`}
  if(kind===3){return `<polygon points="20,34 12,63 20,58 26,63 30,40" fill="${c}" stroke="#C9A646" stroke-width="1.2"/><polygon points="44,34 52,63 44,58 38,63 34,40" fill="${c}" stroke="#C9A646" stroke-width="1.2"/><circle cx="32" cy="28" r="26" fill="#C9A646"/><circle cx="32" cy="28" r="23" fill="${c}"/><circle cx="32" cy="28" r="17" fill="none" stroke="#F3E4B0" stroke-width="1.3"/>`}
  return `<circle cx="32" cy="32" r="30" fill="#C9A646"/><circle cx="32" cy="32" r="27" fill="${c}"/><circle cx="32" cy="32" r="20" fill="none" stroke="#F3E4B0" stroke-width="1.4"/>`}
function epinHTML(b,controls){const on=R.bowls.has(b.id);const h=hash(b.name);const c=PIN_COLORS[h%PIN_COLORS.length],kind=(h>>4)%4;
  const cy=kind===3?28:kind===1?30:32;
  const cfp=/^CFP /.test(b.name);const words=cfp?"CFP":b.name.replace(/ Bowl$/i,"").toUpperCase();const fs=cfp?14:words.length>12?8:words.length>8?9.5:11;
  const tw=kind===3?30:36,tl=words.length*fs*.58>tw?` textLength="${tw}" lengthAdjust="spacingAndGlyphs"`:"";
  const photo=on&&R.photos&&R.photos[b.id];
  const inner=photo?`<clipPath id="cp-${esc(b.id)}"><circle cx="32" cy="${cy}" r="${kind===3?16:18}"/></clipPath><image href="/_blob/${esc(photo)}" x="${32-20}" y="${cy-20}" width="40" height="40" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${esc(b.id)})"/><circle cx="32" cy="${cy}" r="${kind===3?16:18}" fill="none" stroke="#F3E4B0" stroke-width="1.6"/>`
    :`<text x="32" y="${cy-10}" text-anchor="middle" font-size="9" fill="#F3E4B0">★</text><text x="32" y="${cy+3}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="800" fill="#FFF" letter-spacing=".04em"${tl}>${esc(words)}</text><text class="m" x="32" y="${cy+15}" text-anchor="middle" font-size="6" fill="#F3E4B0" letter-spacing=".15em">${cfp?"TITLE GAME":"BOWL"}</text>`;
  const ctl=controls&&on&&canEdit&&assets&&!sampleMode?`<span class="pctl">${photo?`<button data-photo="${esc(b.id)}">Change photo</button><button data-unphoto="${esc(b.id)}">Remove</button>`:`<button data-photo="${esc(b.id)}">+ Add photo</button>`}</span>`:"";
  return `<div class="pinwrap"><button class="epin ${on?"":"off"}" data-k="bowls" data-id="${esc(b.id)}" aria-pressed="${on}" title="${esc(b.name)}"><svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">${pinShape(kind,c)}${inner}</svg><span>${esc(b.name)}</span></button>${ctl}</div>`}
function stadiumCell(v){const reg=R.stadiums.has(v.id),vb=viaBowls(R,v.id),on=reg||vb.length>0;const t=v.home?T[v.home]:null;
  const via=vb.length?` · ${reg?"also ":""}${vb.map(b=>esc(b.name)).join(", ")}`:"";
  return cellHTML("stadiums",v.id,on,`${t?pennant(t,46):`<span class="badge venue sm">◆</span>`}<span class="txt"><span class="nm">${esc(v.name)}</span><span class="sub">${t?esc(t.name)+" · ":""}${esc(v.city)}${v.st?", "+esc(v.st):""}${via}</span></span>`)}
function teamCell(t){const on=R.teams.has(t.id);
  return cellHTML("teams",t.id,on,`${pennant(t,58)}<span class="txt"><span class="nm">${esc(t.name)}</span></span>`,"team")}
function bowlCell(b){const on=R.bowls.has(b.id);const v=b.venue?venue(b.venue):null;
  return cellHTML("bowls",b.id,on,`<span class="txt"><span class="nm">${esc(b.name)}</span><span class="sub">${v?esc(v.city)+(v.st?", "+esc(v.st):""):"Your addition"}</span></span>`)}

let fState="all",query="";
function toolbar(ph){return `<div class="toolbar">${[["all","All"],["on","Checked"],["off","Not yet"]].map(([k,l])=>`<button class="chip" data-filter="${k}" aria-pressed="${fState===k}">${l}</button>`).join("")}
  <input class="search" id="q" type="search" placeholder="${ph}" value="${esc(query)}" aria-label="${ph}"></div>`}
const passes=(on,text)=>(fState==="all"||(fState==="on")===on)&&(!query||text.toLowerCase().includes(query.toLowerCase()));

function vOverview(){
  const order=normOrder(R),vv=visitedVenues(R);
  const seen=TEAMS.filter(t=>R.teams.has(t.id));
  const pw=innerWidth<620?92:118;
  const pens=seen.map(t=>`<button class="pin" data-k="teams" data-id="${t.id}" title="${esc(t.name)} · tap to unmark" style="transform:rotate(${((hash(t.id)%11)-5)*.9}deg)">${pennant(t,pw)}</button>`).join("");
  const stubs=order.map(stubHTML).join("")+Array.from({length:!canEdit?0:order.length<8?4:2},()=>`<a class="stub blank" href="#stadiums">+ Next stadium</a>`).join("");
  const bowls=allBowls().slice().sort((a,b)=>R.bowls.has(b.id)-R.bowls.has(a.id));
  return `<div class="sec-h"><h2>Teams seen</h2><a class="label" href="#teams">All 138 by conference →</a></div>
  <div class="hang">${pens||`<p class="hang-empty">No pennants yet. <a href="#teams">Pick the teams you've seen →</a></p>`}</div>
  <div class="sec-h" style="margin-top:30px"><h2>Stadiums</h2><span class="label num">${order.length} ticket stub${order.length===1?"":"s"} · ${TEAMS.filter(t=>vv.has(t.venue)).length} of 138 FBS homes${canEdit&&!sampleMode?" · tap a stub to add the matchup":""}</span></div>
  <div class="cork"><div class="stubs">${stubs}</div></div>
  <div class="sec-h" style="margin-top:30px"><h2>Bowl pins</h2><span class="label num">${R.bowls.size} of ${allBowls().length} collected · tap a pin to mark it</span></div>
  <div class="pinboard">${bowls.map(b=>epinHTML(b,false)).join("")}</div>
  ${canEdit&&!sampleMode?`<section class="backup"><div><h3>Backup &amp; move</h3><p>Download your whole collection as one file to keep as a backup. Moving over from the Claude version? Use Restore with the file you exported there.</p></div>
  <div class="bk-acts"><button class="btn primary" id="exportBtn">Download my collection</button><button class="btn" id="importBtn">Restore from a file</button></div></section>`:""}`;
}

function vStadiums(){
  const others=allVenues().filter(v=>!v.home);
  const vv=visitedVenues(R);const oth=others.filter(v=>passes(vv.has(v.id),v.name+" "+v.city+" "+(v.st||"")));
  let out=toolbar("Search stadiums, teams or cities")+`<p class="hint">Tap a stadium to mark it visited. Tap again to unmark.</p>`;
  out+=CONFS.map(c=>{const ts=TEAMS.filter(t=>t.conf===c);const list=ts.map(t=>venue(t.venue)).filter(v=>passes(vv.has(v.id),v.name+" "+T[v.home].name+" "+v.city));
    if(!list.length)return "";const vis=ts.filter(t=>vv.has(t.venue)).length;
    return `<section class="block"><div class="sec-h"><h2>${c}</h2><span class="label num">${vis} / ${ts.length} visited</span></div><div class="cells">${list.map(stadiumCell).join("")}</div></section>`}).join("");
  out+=`<section class="block"><div class="sec-h"><h2>Neutral &amp; bowl venues</h2><span class="label num">${others.filter(v=>vv.has(v.id)).length} visited</span></div>
    ${oth.length?`<div class="cells">${oth.map(stadiumCell).join("")}</div>`:`<p class="empty">No venues match.</p>`}
    ${canEdit?`<form class="addrow" id="addVenue"><input id="avName" placeholder="Another stadium (e.g. Rose Bowl, Arrowhead)" aria-label="Stadium name" required><input id="avCity" placeholder="City" aria-label="City" required><input id="avSt" placeholder="State" aria-label="State" style="flex:0 1 90px"><button class="btn" type="submit">Add &amp; mark visited</button></form>`:""}</section>`;
  return out;
}
function vTeams(){
  const pw=innerWidth<620?62:78;
  const rows=CONFS.map(c=>{const ts=TEAMS.filter(t=>t.conf===c);const list=ts.filter(t=>passes(R.teams.has(t.id),t.name+" "+t.abbr));if(!list.length)return "";
    const seen=ts.filter(t=>R.teams.has(t.id)).length;
    return `<div class="wrow"><div class="cn">${c}<small class="num">${seen} / ${ts.length}</small></div><div class="pens">${list.map(t=>`<button class="pen ${R.teams.has(t.id)?"":"off"}" data-k="teams" data-id="${t.id}" title="${esc(t.name)}${R.teams.has(t.id)?" · seen":""}" aria-pressed="${R.teams.has(t.id)}" aria-label="${esc(t.name)}">${pennant(t,pw)}</button>`).join("")}</div></div>`}).join("");
  return toolbar("Search teams")+`<p class="hint">Tap a pennant for every team you've seen play in person, home or away.</p><div class="wall">${rows||`<p class="empty">No teams match.</p>`}</div>`;
}
function vBowls(){
  const list=allBowls().filter(b=>passes(R.bowls.has(b.id),b.name));
  return toolbar("Search bowls")+`<p class="hint">Tap a pin for each bowl you've attended. Each bowl gets its own ticket stub with the bowl name on it, separate from any regular-season stub at that stadium.</p>
  <div class="pinboard">${list.length?list.map(b=>epinHTML(b,true)).join(""):`<p class="empty" style="color:#C9D0E0">No bowls match.</p>`}
  ${canEdit?`<form class="addrow dark" id="addBowl" style="flex-basis:100%"><input id="abName" placeholder="A bowl not listed, e.g. Poinsettia Bowl" aria-label="Bowl name" required><button class="btn" type="submit">Add pin</button></form>`:""}</div>`;
}

const VIEWS={overview:vOverview,stadiums:vStadiums,teams:vTeams,bowls:vBowls};
const current=()=>{const h=location.hash.slice(1);return VIEWS[h]?h:"overview"};
function render(){
  R=window.currentCollection?window.currentCollection():S;
  const vvh=visitedVenues(R);const hv=TEAMS.filter(t=>vvh.has(t.venue)).length;
  $("#counts").innerHTML=`<a href="#teams"><span>${R.teams.size}<span class="of">/138</span></span><small>Teams seen</small></a><a href="#stadiums"><span>${hv}<span class="of">/138</span></span><small>Home stadiums</small></a><a href="#bowls"><span>${R.bowls.size}</span><small>Bowls</small></a>`;
  const v=current();
  document.querySelectorAll("#tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.v===v?"page":"false"));
  const q=document.activeElement&&document.activeElement.id==="q"?document.activeElement.selectionStart:null;
  $("#view").innerHTML=VIEWS[v]();
  if(q!=null){const el=$("#q");if(el){el.focus();el.setSelectionRange(q,q)}}
  window.afterRender&&window.afterRender();
}
let rw=innerWidth<620;addEventListener("resize",()=>{if((innerWidth<620)!==rw){rw=!rw;render()}});
addEventListener("hashchange",()=>{fState="all";query="";render();scrollTo(0,0)});

$("#view").addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");if(g){location.hash=g.dataset.go;return}
  if(e.target.id==="exportBtn"){exportCollection();return}
  if(e.target.id==="importBtn"){$("#restoreIn").value="";$("#restoreIn").click();return}
  const sb=e.target.closest("[data-stub]");if(sb){if(!canEdit){location.hash="stadiums"}else openMatchup(sb.dataset.stub);return}
  const c=e.target.closest("[data-k]");
  if(c){const k=c.dataset.k,id=c.dataset.id;
    const label=k==="teams"?T[id].name:k==="stadiums"?venue(id).name:allBowls().find(b=>b.id===id).name;
    toggle(k,id,label);return}
  const f=e.target.closest("[data-filter]");if(f){fState=f.dataset.filter;render()}
});
$("#view").addEventListener("input",e=>{if(e.target.id==="q"){query=e.target.value;render()}});
$("#view").addEventListener("submit",e=>{
  e.preventDefault();if(!canEdit)return;
  if(e.target.id==="addVenue"){const name=$("#avName").value.trim(),city=$("#avCity").value.trim(),st=$("#avSt").value.trim();if(!name||!city)return;
    let id=slug(name);while(S.customVenues.some(v=>v.id===id))id+="-2";
    S.customVenues=S.customVenues.concat({id,name,city,st});S.stadiums.add("c:"+id);S.order=normOrder(S).concat("s:c:"+id);queueSave();render();toast(`Added and marked visited: ${name}`)}
  if(e.target.id==="addBowl"){const name=$("#abName").value.trim();if(!name)return;
    const hit=allBowls().find(b=>b.name.toLowerCase()===name.toLowerCase());
    if(hit){if(!S.bowls.has(hit.id))toggle("bowls",hit.id,hit.name);else toast(`${hit.name} is already marked`);return}
    let id="c-"+slug(name);while(S.customBowls.some(b=>b.id===id))id+="-2";
    S.customBowls=S.customBowls.concat({id,name});S.bowls.add(id);S.order=normOrder(S).concat("b:"+id);queueSave();render();toast(`Added and marked attended: ${name}`)}
});

let toastT;function toast(msg,undo){$("#toastMsg").textContent=msg;const u=$("#undoBtn");u.hidden=!undo;u.onclick=()=>{undo();$("#toast").hidden=true};$("#toast").hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>$("#toast").hidden=true,undo?5000:2600)}

/* ---------- matchups ---------- */
let mVenue=null;
const TEAMS_AZ=TEAMS.slice().sort((a,b)=>a.name.localeCompare(b.name));
const teamLabel=x=>!x?"":x.startsWith("x:")?x.slice(2):(T[x]?T[x].name:"");
function teamFromText(txt){const q=txt.trim().toLowerCase();if(!q)return "";const t=TEAMS.find(t=>t.name.toLowerCase()===q||t.abbr.toLowerCase()===q);return t?t.id:"x:"+txt.trim()}
const venueLabel=v=>`${v.name} — ${v.city}${v.st?", "+v.st:""}`;
function venueFromText(txt){const q=txt.trim().toLowerCase();if(!q)return "";const vs=allVenues();
  const v=vs.find(v=>venueLabel(v).toLowerCase()===q)||vs.find(v=>v.name.toLowerCase()===q);return v?v.id:"new:"+txt.trim()}
function openMatchup(key){mVenue=key;const isB=key.startsWith("b:"),id=key.slice(2);
  const bw=isB?bowlById(id):null,bvid=isB?bowlVenue(S,id):"",v=isB?(bvid?venue(bvid):null):venue(id);const m=S.matchups[isB?key:id]||{};
  const homeGame=!isB&&v.home;
  $("#mTitle").textContent=isB?bw.name:v.name;
  $("#mSub").textContent=isB?(bw.venue?`At ${v.name}. Who played?`:"Where was it, and who played?"):homeGame?`${T[v.home].name} home game. Who did they play?`:"Neutral site. Who played?";
  $("#teamList").innerHTML=TEAMS_AZ.map(t=>`<option value="${esc(t.name)}">`).join("");
  const needV=isB&&!(bw.venue);$("#mVWrap").hidden=!needV;
  if(needV){$("#venueList").innerHTML=allVenues().slice().sort((a,b)=>a.name.localeCompare(b.name)).map(v=>`<option value="${esc(venueLabel(v))}">`).join("");const cv=m.venue&&venue(m.venue);$("#mV").value=cv?venueLabel(cv):""}
  $("#mALabel").textContent=homeGame?"Opponent (optional)":"Team 1";$("#mBWrap").hidden=!!homeGame;
  $("#mRemove").textContent=isB?"Remove this bowl":"Remove this stub";
  $("#mA").value=teamLabel(m.a);$("#mB").value=teamLabel(m.b);$("#mdlg").showModal()}
$("#mCancel").addEventListener("click",()=>$("#mdlg").close());
$("#mRemove").addEventListener("click",()=>{const isB=mVenue.startsWith("b:"),id=mVenue.slice(2);$("#mdlg").close();if(isB)toggle("bowls",id,bowlById(id).name);else toggle("stadiums",id,venue(id).name)});
$("#mform").addEventListener("submit",e=>{e.preventDefault();const isB=mVenue.startsWith("b:"),id=mVenue.slice(2);
  const v=isB?null:venue(id),homeGame=!isB&&v.home,mk=isB?mVenue:id;
  const a=teamFromText($("#mA").value),b=homeGame?"":teamFromText($("#mB").value);
  let vsel="";if(isB&&!$("#mVWrap").hidden){vsel=venueFromText($("#mV").value);
    if(vsel.startsWith("new:")){const name=vsel.slice(4);let cid=slug(name);while(S.customVenues.some(x=>x.id===cid))cid+="-2";S.customVenues=S.customVenues.concat({id:cid,name,city:"",st:""});vsel="c:"+cid}}
  const before={teams:new Set(S.teams),matchups:{...S.matchups}};
  const m={...S.matchups};if(a||b||vsel){m[mk]=homeGame?{a}:{a,b};if(vsel)m[mk].venue=vsel}else delete m[mk];S.matchups=m;
  let added=[];if($("#mSeen").checked){[homeGame?v.home:"",a,b].forEach(x=>{if(x&&T[x]&&!S.teams.has(x)){S.teams.add(x);added.push(T[x].abbr)}})}
  queueSave();render();$("#mdlg").close();
  toast(a||b||vsel?`Saved${added.length?" · marked "+added.join(", ")+" seen":""}`:"Matchup cleared",()=>{S.teams=before.teams;S.matchups=before.matchups;queueSave();render()})});

/* ---------- export / restore ---------- */
function exportData(){const d=snapshot();delete d.photos;return{app:"cfbstub",format:1,exportedAt:new Date().toISOString(),...d}}
async function exportCollection(){
  const json=JSON.stringify(exportData(),null,2);const name=`cfbstub-collection-${new Date().toISOString().slice(0,10)}.json`;
  const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast("Collection file downloaded")
}
$("#restoreIn").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());if(d.app!=="cfbstub"||!Array.isArray(d.stadiums))throw new Error("format");
    const before=snapshot();
    S={stadiums:new Set(d.stadiums),teams:new Set(d.teams||[]),bowls:new Set(d.bowls||[]),customVenues:d.customVenues||[],customBowls:d.customBowls||[],matchups:d.matchups||{},order:d.order||[]};normOrder(S);
    queueSave();render();
    toast(`Restored ${S.teams.size} teams, ${S.order.length} stubs, ${S.bowls.size} bowls`,()=>{S={stadiums:new Set(before.stadiums),teams:new Set(before.teams),bowls:new Set(before.bowls),customVenues:before.customVenues,customBowls:before.customBowls,matchups:before.matchups,order:before.order};queueSave();render()})}
  catch(x){toast("That file isn't a Stub Club collection export.")}});

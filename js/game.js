'use strict';
// ====================================================================== game: state, input, interactions, physics, cameras, HUD, saving, sandbox menu
initMaterials();initCarMats();initPartMats();
Radio.onChange(drawLCD);
scene.add(camera);
const viewModel=new THREE.Group();viewModel.position.set(.2,-.2,-.45);camera.add(viewModel);
const $=id=>document.getElementById(id);

const person=makePerson();
const vehicles=[];       // drivable vehicles in the world
const loose=[];          // things lying in the world: {kind,obj,prop,vel}
const animals=[];        // chickens
const puffs=[];          // little effect particles
const P={vehicle:null,x:0,y:0,z:0,h:0,vy:0,health:100,hunger:100,warmth:100,stamina:100,staminaWait:0,hot:[null,null,null,null],sel:0,holding:null,phase:0,grounded:true,moveAmp:0,inside:null,cause:'',crouch:0};
const GAME={mode:'survival',hunger:true,infFuel:false};
const CAM={fp:false,yawOff:0,pitch:0,lastMouse:0};
let lastV=null,vehId=1;
let state='menu',setKey='desert',startZ=0,best=0,maxZ=0,menuOpen=false,saveT=0,shootT=0,recoil=0;
let storm=false,stormT=0,nextStorm=0,stormAmt=0,overheatToastT=0,coldToastT=0,hungryToastT=0,shake=0,stationMsgT=0;
const input={up:false,down:false,left:false,right:false,run:false,jump:false,crouch:false,fire:false};
const E={down:false,t:0,fired:false,target:null};let promptAction=null;

function loadBest(k){try{return parseFloat(localStorage.getItem('endless-road-best-'+k))||0;}catch(e){return 0;}}
function saveBest(k,v){try{localStorage.setItem('endless-road-best-'+k,String(v));}catch(e){}}
function toast(msg,kind){const el=document.createElement('div');el.className='toast'+(kind?' '+kind:'');el.textContent=msg;$('toasts').appendChild(el);setTimeout(()=>el.remove(),2800);while($('toasts').children.length>3)$('toasts').firstChild.remove();}

// ---------------------------------------------------------------------- sound effects (gunshots, chickens)
const SFX=(()=>{let ctx=null,buf=null;
  const init=()=>{if(ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;ctx=new AC();buf=ctx.createBuffer(1,ctx.sampleRate*.5,ctx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return true;};
  const noise=(dur,g,f,type='lowpass',dist=1)=>{if(!init())return;const t=ctx.currentTime,s=ctx.createBufferSource();s.buffer=buf;const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;const v=ctx.createGain();
    v.gain.setValueAtTime(g*dist,t);v.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(fl);fl.connect(v);v.connect(ctx.destination);s.start(t);s.stop(t+dur);};
  const tone=(f0,f1,dur,g,type='square',dist=1)=>{if(!init())return;const t=ctx.currentTime,o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);const v=ctx.createGain();
    v.gain.setValueAtTime(g*dist,t);v.gain.exponentialRampToValueAtTime(.001,t+dur);const fl=ctx.createBiquadFilter();fl.type='bandpass';fl.frequency.value=1400;o.connect(fl);fl.connect(v);v.connect(ctx.destination);o.start(t);o.stop(t+dur+.02);};
  return {init,
    shot:(rifle)=>{noise(rifle?.35:.2,rifle?.9:.6,rifle?1800:2600);tone(rifle?120:180,40,.12,.5,'sine');},
    hit:()=>noise(.08,.25,4000,'highpass'),
    cluck:(dist=1)=>{tone(520,380,.09,.12,'sawtooth',dist);setTimeout(()=>tone(560,400,.08,.1,'sawtooth',dist),130);},
    squawk:(dist=1)=>{tone(900,500,.18,.18,'sawtooth',dist);setTimeout(()=>tone(1000,520,.22,.16,'sawtooth',dist),190);},
    clunk:()=>{noise(.12,.35,600);tone(140,70,.1,.2,'sine');}};})();

// ---------------------------------------------------------------------- vehicles
function spawnVehicle(type,opts,x,z,h){
  const C=makeVehicle(type,opts);scene.add(C.group);
  const V={id:vehId++,C,type,x,z,h,vx:0,vz:0,y:surfaceH(x,z),pitch:0,roll:0,fuel:opts.fuel??100,engine:opts.hp??(opts.rusty?55:100),heat:0,heater:true,wheelSpin:0,steerVis:0,lastVf:0,cargo:null,sink:0,needle:{speed:0,rpm:0,fuel:0,temp:0}};
  vehicles.push(V);placeVehicle(V);return V;
}
function placeVehicle(V){const g=V.C.group;g.position.set(V.x,V.y-(V.sink||0),V.z);g.rotation.order='YXZ';g.rotation.set(V.pitch,V.h,V.roll);g.updateMatrixWorld(true);}
function removeVehicle(V){scene.remove(V.C.group);vehicles.splice(vehicles.indexOf(V),1);if(lastV===V)lastV=vehicles[0]||null;}
const _w=new THREE.Vector3();
function worldPoint(C,local){return C.group.localToWorld(_w.set(...local)).clone();}
function vSpeed(V){return Math.hypot(V.vx,V.vz);}
function nearestVehicle(maxD){let b=null,bd=maxD;for(const V of vehicles){const d=Math.hypot(V.x-P.x,V.z-P.z);if(d<bd){bd=d;b=V;}}return b;}
function ownerVehicle(C){return vehicles.find(V=>V.C===C)||null;}

// ---------------------------------------------------------------------- start / end
function seatPerson(V){const s=V.C.spec.seat;V.C.group.add(person.group);person.group.position.set(s[0],s[1]-.92,s[2]);person.group.rotation.set(0,0,0);pose(person,'sit');}
function resetWorld(key,seed,roff){
  setKey=key;S=SETTINGS[key];SEED=seed;ROFF=roff;
  clearChunks();taken.clear();
  while(vehicles.length)removeVehicle(vehicles[0]);
  for(const l of loose)scene.remove(l.obj);loose.length=0;
  for(const a of animals)scene.remove(a.obj);animals.length=0;
  if(P.holding){person.hold.remove(P.holding.obj);P.holding=null;}
  if(person.group.parent)person.group.parent.remove(person.group);
  setupWorldMaterials();
  skyU.top.value.set(S.skyTop);skyU.horizon.value.set(S.horizon);skyU.sunDir.value.set(...S.sunDir).normalize();skyU.sunCol.value.set(S.sunCol);skyU.haze.value=0;
  buildEnv();
  scene.fog.color.copy(lin(S.horizon));scene.fog.near=40;scene.fog.far=S.fogFar;
  hemi.color.copy(lin(S.hemi[0]));hemi.groundColor.copy(lin(S.hemi[1]));hemi.intensity=S.hemi[2];
  sun.color.copy(lin(S.sunCol));sun.intensity=S.sunI;
  pMat.color.copy(lin(S.weather==='sandstorm'?0xd9a25e:S.weather==='blizzard'?0xffffff:0xb8cfe6));
  pMat.size=S.weather==='rain'?.08:S.weather==='blizzard'?.16:.12;
  seedParticles();points.visible=false;
}
function showHud(){
  $('warmWrap').classList.toggle('hidden',S.hazard!=='cold');
  $('tHeat').classList.toggle('hidden',S.hazard!=='cold');
  $('sbBtn').classList.toggle('hidden',GAME.mode!=='sandbox');
  $('tFire').classList.toggle('hidden',true);
  $('bestTxt').textContent=GAME.mode==='sandbox'?'Sandbox mode':(best>0?'Best '+best.toFixed(2)+' km':'');
  $('toasts').innerHTML='';
  ['menu','over','pause'].forEach(s=>$(s).classList.add('hidden'));
  $('hud').classList.remove('hidden');if(isTouch)$('touch').classList.remove('hidden');
  state='play';last=performance.now();
}
function startGame(key,mode,opts={}){
  GAME.mode=mode||GAME.mode;GAME.hunger=true;GAME.infFuel=false;
  resetWorld(key,opts.seed??((Math.random()*2**31)|0),opts.roff??Math.random()*100);
  const z=opts.near?opts.near.z-12:10,x=opts.near?opts.near.x+4:roadX(z);
  const colors=['white','red','blue','green','yellow'];
  const V=spawnVehicle('pickup',{color:PAINTS[colors[(Math.random()*colors.length)|0]]},x,z,Math.atan(roadSlope(z)));
  Object.assign(P,{vehicle:V,health:100,hunger:100,warmth:100,stamina:100,hot:[null,null,null,null],sel:0,holding:null,vy:0,inside:null,cause:'',farToast:false,x,z,y:surfaceH(x,z),h:V.h});
  if(GAME.mode==='sandbox')P.hot=['beans','water',null,null];
  lastV=V;seatPerson(V);
  startZ=opts.startZ??z;maxZ=z;best=loadBest(key);
  storm=false;stormAmt=0;nextStorm=45+Math.random()*30;stormT=0;
  manageChunks(true,z);precompile();
  CAM.yawOff=0;CAM.pitch=0;
  const f={x:Math.sin(V.h),z:Math.cos(V.h)};camera.position.set(V.x-f.x*10,V.y+5,V.z-f.z*10);
  showHud();saveT=0;
  toast(isTouch?'Tap E when stopped to get out':'Click the game to look around with the mouse · V switches view');
  setTimeout(()=>{if(state==='play')toast(GAME.mode==='sandbox'?'Press M for the sandbox menu':S.hazard==='heat'?'Ease off the gas if the engine gets hot!':S.hazard==='cold'?'Heater is ON (H). It uses fuel.':'Avoid the mud and fallen logs!');},3000);
}
function precompile(){
  const mats=[...Object.values(M),...Object.values(CARMAT).filter(m=>m&&m.isMaterial),...Object.values(CARMAT.gauges),...Object.values(paintCache),...Object.values(PM),...Object.values(houseMats()),TERRAIN_MAT,ROAD_MAT];
  const g=new THREE.Group();mats.forEach((m,i)=>{const me=new THREE.Mesh(G.box,m);me.castShadow=true;me.position.set(P.x+(i%8),-200,P.z+(i>>3));g.add(me);});
  scene.add(g);try{renderer.compile(scene,camera);}catch(e){}scene.remove(g);
}
function endGame(why,title){
  if(state!=='play')return;state='over';exitLock();
  if(Net.role!=='guest')deleteSave(setKey);
  const km=progress(),isBest=GAME.mode==='survival'&&km>best+.005;if(isBest){best=km;saveBest(setKey,km);}
  $('overTitle').textContent=title;$('overWhy').textContent=why;$('overDist').textContent=km.toFixed(2)+' km';
  $('overBest').textContent=GAME.mode==='sandbox'?'Sandbox mode':isBest?'🏆 New best in '+S.name+'!':'Best in '+S.name+': '+best.toFixed(2)+' km';
  $('over').classList.remove('hidden');$('touch').classList.add('hidden');hidePrompt();refreshMenu();
}
function toMenu(){if(state==='play'||state==='pause')saveGame();Radio.power(false);Radio.toggle(false);closeSandbox();exitLock();Net.leave();state='menu';
  ['over','pause','hud','touch'].forEach(s=>$(s).classList.add('hidden'));$('menu').classList.remove('hidden');refreshMenu();}
function progress(){return Math.max(0,maxZ-startZ)/1000;}

// ---------------------------------------------------------------------- saving
const SAVE_KEY=k=>'endless-road-save-v4-'+k;
function serialize(){
  const vs=vehicles.map(V=>{const slots={},open={};for(const[n,s]of Object.entries(V.C.slots)){let d=descOf(s.obj);if(d&&n==='engine')d.hp=V.engine;slots[n]=d;if(s.hinge)open[n]=s.open;}
    return {type:V.type,p:V.C.pdesc,x:V.x,z:V.z,h:V.h,fuel:V.fuel,engine:V.engine,heat:V.heat,heater:V.heater,slots,open,cargo:V.cargo?descOf(V.cargo.obj):null};});
  return {v:4,key:setKey,mode:GAME.mode,GAME:{...GAME},SEED,ROFF,startZ,maxZ,at:Date.now(),
    P:{x:P.x,y:P.y,z:P.z,h:P.h,health:P.health,hunger:P.hunger,warmth:P.warmth,stamina:P.stamina,hot:P.hot,sel:P.sel,inV:P.vehicle?vehicles.indexOf(P.vehicle):-1,lastV:vehicles.indexOf(lastV),hold:P.holding?descOf(P.holding.obj):null},
    vehicles:vs,loose:loose.map(l=>({d:descOf(l.obj),x:l.obj.position.x,y:l.obj.position.y,z:l.obj.position.z,ry:l.obj.rotation.y})),
    animals:animals.filter(a=>!a.tag&&!a.held).map(a=>({x:a.x,z:a.z})),taken:[...taken]};
}
function saveGame(){if(state!=='play'&&state!=='pause')return;if(Net.role==='guest')return;try{localStorage.setItem(SAVE_KEY(setKey),JSON.stringify(serialize()));}catch(e){}}
function loadSave(k){try{const s=JSON.parse(localStorage.getItem(SAVE_KEY(k))||'null');return s&&s.v===4?s:null;}catch(e){return null;}}
function deleteSave(k){try{localStorage.removeItem(SAVE_KEY(k));}catch(e){}}
function continueGame(k){
  const s=loadSave(k);if(!s)return startGame(k,chosenMode);
  GAME.mode=s.mode;Object.assign(GAME,s.GAME);
  resetWorld(k,s.SEED,s.ROFF);for(const t of s.taken)taken.add(t);
  for(const d of s.vehicles){
    const V=spawnVehicle(d.type,d.p==='rust'?{rusty:true,fuel:d.fuel}:{color:d.p,fuel:d.fuel},d.x,d.z,d.h);
    Object.assign(V,{engine:d.engine,heat:d.heat,heater:d.heater});
    for(const[n,sd]of Object.entries(d.slots)){const sl=V.C.slots[n];if(!sl)continue;if(sl.obj)sl.parent.remove(sl.obj);sl.obj=null;if(sd)attachTo(sl,makeFromDesc(sd));if(d.open&&d.open[n]){sl.open=true;sl.openAmt=1;}}
    if(d.cargo){const o=makeFromDesc(d.cargo);loadCargo(V,{kind:d.cargo.k,obj:o});}
  }
  for(const l of s.loose){const o=makeFromDesc(l.d);scene.add(o);restPose(o,l.d.k,l.x,0,l.z,l.ry);o.position.y=l.y;loose.push({kind:l.d.k,obj:o,prop:isProp(l.d.k)});}
  for(const a of s.animals)spawnChicken(a.x,a.z,null);
  Object.assign(P,{health:s.P.health,hunger:s.P.hunger,warmth:s.P.warmth,stamina:s.P.stamina,hot:s.P.hot,sel:s.P.sel,x:s.P.x,y:s.P.y,z:s.P.z,h:s.P.h,vehicle:null,holding:null,vy:0,cause:'',farToast:false});
  lastV=vehicles[s.P.lastV]||vehicles[0]||null;
  if(s.P.inV>=0&&vehicles[s.P.inV]){P.vehicle=vehicles[s.P.inV];seatPerson(P.vehicle);}else{scene.add(person.group);if(s.P.hold){const o=makeFromDesc(s.P.hold);holdObj(s.P.hold.k,o);}}
  startZ=s.startZ;maxZ=s.maxZ;best=loadBest(k);
  storm=false;stormAmt=0;nextStorm=45+Math.random()*30;
  manageChunks(true,P.vehicle?P.vehicle.z:P.z);precompile();
  const V=P.vehicle||lastV;if(V){const f={x:Math.sin(V.h),z:Math.cos(V.h)};camera.position.set(V.x-f.x*10,V.y+5,V.z-f.z*10);}
  showHud();toast('💾 Welcome back! Your game was loaded','good');
}
addEventListener('beforeunload',saveGame);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveGame();});

// ---------------------------------------------------------------------- input
const keyMap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',KeyQ:'run',ShiftLeft:'crouch',ShiftRight:'crouch',Space:'jump'};
const isTouch=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window);
function locked(){return document.pointerLockElement===renderer.domElement;}
function exitLock(){try{if(locked())document.exitPointerLock();}catch(e){}}
renderer.domElement.addEventListener('mousedown',e=>{
  if(state!=='play'||menuOpen)return;SFX.init();
  if(!locked()&&!isTouch){try{const p=renderer.domElement.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(err){}return;}
  if(e.button===0){input.fire=true;}
});
addEventListener('mouseup',e=>{if(e.button===0)input.fire=false;});
document.addEventListener('mousemove',e=>{
  if(!locked()||state!=='play')return;
  const s=.0024;CAM.lastMouse=performance.now();
  if(P.vehicle){CAM.yawOff=clamp(CAM.yawOff-e.movementX*s,CAM.fp?-2.2:-Math.PI,CAM.fp?2.2:Math.PI);CAM.pitch=clamp(CAM.pitch-e.movementY*s,-1.1,.9);}
  else{P.h-=e.movementX*s;CAM.pitch=clamp(CAM.pitch-e.movementY*s,-1.3,1.2);}
});
document.addEventListener('wheel',e=>{if(state!=='play'||menuOpen)return;P.sel=(P.sel+(e.deltaY>0?1:3))%4;},{passive:true});
addEventListener('keydown',e=>{
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;
  if(menuOpen&&e.code!=='KeyM'&&e.code!=='Escape')return;
  if(keyMap[e.code]){input[keyMap[e.code]]=true;e.preventDefault();}
  if(e.repeat)return;
  if(state==='play'){
    if(e.code==='KeyE')eDown();
    if(e.code==='KeyF')useSelected();
    if(e.code==='KeyG')drop();
    if(e.code==='KeyH'&&S.hazard==='cold')toggleHeater();
    if(e.code==='KeyV'){CAM.fp=!CAM.fp;toast(CAM.fp?'👁️ First-person view':'🎥 Third-person view');}
    if(e.code==='KeyR')Radio.toggle();
    if(e.code==='KeyN'){if(Radio.on)Radio.next();else Radio.power(true);}
    if(e.code==='BracketRight')Radio.setVol(Radio.vol+.1);
    if(e.code==='BracketLeft')Radio.setVol(Radio.vol-.1);
    if(e.code==='KeyM'&&GAME.mode==='sandbox')toggleSandbox();
    if(/^Digit[1-4]$/.test(e.code))P.sel=+e.code.slice(5)-1;
  }
  if(e.code==='KeyP'&&(state==='play'||state==='pause'))togglePause();
  if(e.code==='Escape'&&menuOpen)closeSandbox();
});
addEventListener('keyup',e=>{if(keyMap[e.code])input[keyMap[e.code]]=false;if(e.code==='KeyE')eUp();});
addEventListener('blur',()=>{for(const k in input)input[k]=false;E.down=false;});
function toggleHeater(){const V=P.vehicle||lastV;if(!V)return;V.heater=!V.heater;toast(V.heater?'🔥 Heater on':'Heater off');}
function togglePause(){if(state==='play'){state='pause';exitLock();saveGame();$('pause').classList.remove('hidden');Radio.suspend(true);}else if(state==='pause'){state='play';$('pause').classList.add('hidden');last=performance.now();Radio.suspend(false);}}
function bindHold(id,key){const el=$(id);
  const on=e=>{e.preventDefault();input[key]=true;el.classList.add('on');try{el.setPointerCapture(e.pointerId);}catch(_){}};
  const off=()=>{input[key]=false;el.classList.remove('on');};
  el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('lostpointercapture',off);}
bindHold('tL','left');bindHold('tR','right');bindHold('tGas','up');bindHold('tBrk','down');bindHold('tFire','fire');bindHold('tCrouch','crouch');
$('tAct').addEventListener('pointerdown',e=>{e.preventDefault();if(state==='play')eDown();});
$('tAct').addEventListener('pointerup',e=>{e.preventDefault();if(state==='play')eUp();});
const tap=(id,f)=>$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(state==='play'||id==='tPause')f();});
tap('tHeat',toggleHeater);tap('tPause',togglePause);tap('tEat',useSelected);tap('tDrop',drop);tap('tView',()=>{CAM.fp=!CAM.fp;});
Radio.bindUI();
$('retryBtn').onclick=()=>startGame(setKey);$('menuBtn').onclick=toMenu;$('resumeBtn').onclick=togglePause;$('quitBtn').onclick=toMenu;
$('sbBtn').addEventListener('click',()=>toggleSandbox());
document.querySelectorAll('.hslot').forEach((el,i)=>el.addEventListener('pointerdown',e=>{e.preventDefault();P.sel=i;}));

// ---------------------------------------------------------------------- start menu (modes, continue, multiplayer)
let chosenMode='survival';
document.querySelectorAll('.modeBtn').forEach(b=>b.addEventListener('click',()=>{chosenMode=b.dataset.mode;document.querySelectorAll('.modeBtn').forEach(x=>x.classList.toggle('sel',x===b));}));
function refreshMenu(){
  for(const k of Object.keys(SETTINGS)){const b=loadBest(k),s=loadSave(k);
    $('best-'+k).textContent=b>0?'🏆 Best: '+b.toFixed(2)+' km':'';
    const c=$('cont-'+k);c.classList.toggle('hidden',!s);if(s)c.textContent=`▶ Continue · ${s.mode==='sandbox'?'Sandbox':'Survival'} · ${(Math.max(0,s.maxZ-s.startZ)/1000).toFixed(2)} km`;}
}
refreshMenu();
const hostWanted=()=>$('mpHost').checked;
function playerName(){const n=($('mpName').value||'').trim().slice(0,14);try{localStorage.setItem('endless-road-name',n);}catch(e){}return n||'Player';}
try{$('mpName').value=localStorage.getItem('endless-road-name')||'';}catch(e){}
async function maybeHost(){if(!hostWanted())return;try{const code=await Net.host(playerName());toast(`👥 Friends can join with code ${code}`,'good');}catch(e){toast('Could not start multiplayer: '+(e.message||e.type||'error'),'warn');}}
document.querySelectorAll('.card').forEach(c=>c.addEventListener('keydown',e=>{if(e.key==='Enter')c.click();}));
document.querySelectorAll('.card').forEach(c=>c.addEventListener('click',e=>{
  Radio.init();Radio.suspend(false);SFX.init();
  if(e.target.closest('.cont'))continueGame(c.dataset.set);else{deleteSave(c.dataset.set);startGame(c.dataset.set,chosenMode);}
  maybeHost();
}));
Net.onWelcome={world:()=>({key:setKey,mode:GAME.mode,seed:SEED,roff:ROFF,startZ,near:{x:P.vehicle?P.vehicle.x:P.x,z:P.vehicle?P.vehicle.z:P.z}})};
Net.onStatus=t=>{$('room').textContent=t?`👥 ${t}${Net.role==='host'?' · share this code':''} · ${Net.count+1} playing`:'';$('room').classList.toggle('hidden',!t);};
$('mpJoin').addEventListener('click',async()=>{
  const code=$('mpCode').value.trim();if(code.length<4){$('mpMsg').textContent='Type the 5-letter code your friend sees';return;}
  $('mpMsg').textContent='Connecting…';Radio.init();Radio.suspend(false);SFX.init();
  try{await Net.join(code,playerName(),w=>{startGame(w.key,w.mode,{seed:w.seed,roff:w.roff,startZ:w.startZ,near:w.near});});$('mpMsg').textContent='';}
  catch(e){$('mpMsg').textContent=e.message||'Could not connect';}
});

// ---------------------------------------------------------------------- holding things
function placeInHand(hand,kind,obj){
  hand.add(obj);obj.position.set(0,0,0);obj.rotation.set(0,0,0);obj.scale.set(1,1,1);obj.visible=true;
  if(kind==='wheel'||kind==='rim'||kind==='tyre'){obj.rotation.set(0,Math.PI/2,0);obj.position.set(0,0,.05);}
  else if(kind==='doorL'||kind==='doorR'){obj.rotation.set(0,Math.PI/2,0);obj.position.set(0,-.75,.05);}
  else if(kind==='hood'||kind==='trunk'||kind==='tailgate'){obj.rotation.set(-1.3,0,0);obj.position.set(0,.1,.15);}
  else if(kind==='jerry'){obj.position.set(0,-.45,0);}
  else if(kind==='toolbox'||kind==='battery'){obj.position.set(0,-.2,0);}
  else if(kind==='engine'){obj.position.set(0,-.1,.15);}
  else if(kind==='seat'){obj.position.set(0,-.3,.1);obj.rotation.set(0,Math.PI,0);}
  else if(kind==='chicken'){obj.position.set(0,-.3,0);}
  else if(isGun(kind)){obj.position.set(.2,.25,0);}
  else if(isProp(kind)){obj.position.set(0,-.55,.1);}
  obj.traverse(m=>{if(m.isMesh)m.castShadow=true;});
}
function holdObj(kind,obj){
  P.holding={kind,obj};placeInHand(person.hold,kind,obj);
  $('tFire').classList.toggle('hidden',!isGun(kind));
}
function releaseHeld(){const h=P.holding;if(!h)return null;person.hold.remove(h.obj);P.holding=null;viewModel.clear();$('tFire').classList.add('hidden');return h;}
function addHot(kind){const i=P.hot.indexOf(null);if(i<0)return false;P.hot[i]=kind;P.sel=i;return true;}
const heavy=k=>k==='engine'||k==='seat'||k.startsWith('door')||k==='hood'||k==='tailgate'||k==='trunk'||isProp(k);

// ---------------------------------------------------------------------- interaction candidates
function slotName(s){return s.type==='seat'?(s.name==='seatD'?"driver's seat":'passenger seat'):PART_NAMES[s.type];}
function candidates(){
  const out=[];const px=P.x,pz=P.z;const H=P.holding;
  const add=(x,y,z,r,label,fn,hold)=>{const d=Math.hypot(x-px,z-pz);if(d<r&&Math.abs(y-(P.y+1))<2.2)out.push({x,y,z,d,label,fn,hold});};
  const scanVehicle=(C,V)=>{
    const ha=hoodAccess(C);
    for(const s of Object.values(C.slots)){
      const wp=worldPoint(C,s.point);const nm=slotName(s);
      if(s.obj&&!H){
        if(s.needsHood&&!ha)continue;
        const take=()=>{const o=s.obj;s.parent.remove(o);s.obj=null;s.open=false;s.openAmt=0;if(s.hinge)s.hinge.rotation[s.axis]=0;if(s.id)taken.add(s.id);
          if(s.type==='engine'&&V){o.userData.desc.hp=V.engine;V.engine=0;}
          SFX.clunk();holdObj(kindOf(o),o);toast(`You took off the ${s.type==='wheel'?descName(descOf(o)):nm}`);};
        if(s.hinge)add(wp.x,wp.y,wp.z,1.3,`${s.open?'Close':'Open'} the ${nm}`,()=>{s.open=!s.open;},{label:'take it off',fn:take});
        else add(wp.x,wp.y,wp.z,1.25,`Take out the ${s.type==='engine'?descName(descOf(s.obj)):nm}`.replace('Take out the wheel','Take off the wheel').replace('Take out the battery','Take out the battery'),take);
      }
      if(s.obj&&s.type==='wheel'&&H&&H.kind==='tyre'&&!s.obj.userData.tyreObj)
        add(wp.x,wp.y,wp.z,1.45,`Put the ${descName(descOf(H.obj))} on`,()=>{const h=releaseHeld();putTyreOn(s.obj,h.obj);SFX.clunk();toast('🛞 Tyre fitted','good');});
      if(!s.obj&&H&&fits(s.type,H.kind)&&(!s.needsHood||ha)){
        add(wp.x,wp.y,wp.z,1.45,`Fit the ${descName(descOf(H.obj))}`,()=>{const h=releaseHeld();attachTo(s,h.obj);s.open=false;s.openAmt=0;
          if(s.type==='engine'&&V)V.engine=h.obj.userData.desc.hp??100;SFX.clunk();toast(`🔧 ${descName(descOf(h.obj))} fitted`,'good');});
      }
    }
    if(V){
      for(const gp of C.spec.getIn){const wp=worldPoint(C,gp);add(wp.x,wp.y,wp.z,1.3,`Get in the ${C.spec.name.toLowerCase()}`,()=>enterVehicle(V));}
      if(H&&H.kind==='jerry'){const fn=()=>{releaseHeld();V.fuel=Math.min(100,V.fuel+35);toast('⛽ Poured in the fuel (+35)','good');};
        for(const sx of[1.1,-1.1]){const wp=worldPoint(C,[sx,.9,-1.6]);add(wp.x,wp.y,wp.z,1.7,'Pour fuel into the tank',fn);}}
      if(H&&H.kind==='toolbox'&&C.slots.engine.obj){const wp=worldPoint(C,[0,1,V.type==='buggy'?-2.3:2.4]);
        add(wp.x,wp.y,wp.z,1.9,'Fix the engine',()=>{releaseHeld();V.engine=Math.min(100,V.engine+40);V.brokeToast=false;toast('🔧 Engine repaired (+40)','good');});}
    }
  };
  for(const V of vehicles)if(Math.hypot(V.x-px,V.z-pz)<7)scanVehicle(V.C,V);
  // loose wheels: take tyres off rims, or put them back on
  const wheelThing=(o,x,y,z,pick)=>{
    const w=o,hasT=!!w.userData.tyreObj;
    if(!H)add(x,y,z,1.5,`Pick up the ${descName(descOf(w))}`,pick,hasT?{label:'take the tyre off',fn:()=>{const t=takeTyreOff(w);SFX.clunk();holdObj('tyre',t);toast('You took the tyre off the rim');}}:null);
    else if(H.kind==='tyre'&&!hasT)add(x,y,z,1.5,`Put the ${descName(descOf(H.obj))} on the rim`,()=>{const h=releaseHeld();putTyreOn(w,h.obj);SFX.clunk();toast('🛞 Tyre fitted on the rim','good');});
  };
  nearChunks(pz,ch=>{
    for(const C of ch.wrecks)if(Math.hypot(C.group.position.x-px,C.group.position.z-pz)<7)scanVehicle(C,null);
    for(const d of ch.doors){add(d.x,d.y+1,d.z,2.2,d.open?'Close the door':'Open the door',()=>{d.open=!d.open;});}
    for(const it of ch.items){if(it.taken)continue;
      const pick=()=>{it.taken=true;taken.add(it.id);it.mesh.parent.remove(it.mesh);};
      if(isSmall(it.kind))add(it.x,it.y,it.z,1.5,`Pick up ${descName(descOf(it.mesh))}`,()=>{if(!addHot(it.kind)){toast('Your hotbar is full','warn');return;}pick();toast(`${descEm(descOf(it.mesh))} Got ${descName(descOf(it.mesh))}${isFood(it.kind)?' (F to eat)':''}`,'good');});
      else if(it.mesh.userData.rimObj){const p=it.mesh.position;wheelThing(it.mesh,p.x,it.y,p.z,()=>{pick();holdObj(kindOf(it.mesh),it.mesh);});}
      else if(!H)add(it.x,it.y,it.z,1.5,`Pick up the ${descName(descOf(it.mesh))}`,()=>{pick();holdObj(it.kind,it.mesh);toast(`You picked up the ${descName(descOf(it.mesh))}`);});
    }
  });
  for(const l of loose){const o=l.obj.position;
    if(isSmall(l.kind))add(o.x,o.y,o.z,1.5,`Pick up ${descName(descOf(l.obj))}`,()=>{if(!addHot(l.kind)){toast('Your hotbar is full','warn');return;}loose.splice(loose.indexOf(l),1);scene.remove(l.obj);});
    else if(l.obj.userData.rimObj)wheelThing(l.obj,o.x,o.y,o.z,()=>{loose.splice(loose.indexOf(l),1);scene.remove(l.obj);holdObj(kindOf(l.obj),l.obj);});
    else if(!H)add(o.x,o.y,o.z,1.6,`Pick up the ${descName(descOf(l.obj))}`,()=>{loose.splice(loose.indexOf(l),1);scene.remove(l.obj);holdObj(l.kind,l.obj);});
  }
  if(!H)for(const a of animals){if(a.held)continue;add(a.x,a.y+.3,a.z,1.4,'Pick up the chicken',()=>{a.held=true;scene.remove(a.obj);holdObj('chicken',a.obj);P.holding.animal=a;SFX.squawk();});}
  return out;
}
function chooseTarget(c){
  if(!c.length)return null;
  if(CAM.fp||locked()){
    const eye=new THREE.Vector3(P.x,P.y+(P.crouch>.5?1.15:1.62),P.z),dir=lookDir();let best=null,ba=1e9;
    for(const k of c){const v=new THREE.Vector3(k.x,k.y,k.z).sub(eye);const d=v.length();if(d>3)continue;const a=v.normalize().angleTo(dir);
      if(a<Math.atan(.45/Math.max(d,.3))+.12&&a<ba){ba=a;best=k;}}
    if(best||CAM.fp)return best;
  }
  c.sort((a,b)=>a.d-b.d);return c[0];
}
function lookDir(){const p=CAM.pitch;return new THREE.Vector3(Math.sin(P.h)*Math.cos(p),Math.sin(p),Math.cos(P.h)*Math.cos(p));}
function eDown(){E.down=true;E.t=0;E.fired=false;E.target=P.vehicle?null:promptAction;}
function eUp(){
  if(!E.down)return;E.down=false;
  if(E.fired)return;
  if(P.vehicle){if(vSpeed(P.vehicle)>3){toast('Stop first');return;}exitVehicle();return;}
  if(E.target)E.target.fn();
}
function exitVehicle(){
  const V=P.vehicle;P.vehicle=null;V.C.group.remove(person.group);scene.add(person.group);
  const out=worldPoint(V.C,[V.type==='buggy'?-1.5:-1.6,0,-.3]);
  P.x=out.x;P.z=out.z;P.y=surfaceH(P.x,P.z);P.h=V.h+(CAM.fp?CAM.yawOff:0);P.vy=0;CAM.yawOff=0;
  person.group.rotation.set(0,P.h,0);
  if(V.cargo){const c=V.cargo;V.cargo=null;V.C.group.remove(c.obj);holdObj(c.kind,c.obj);if(c.animal)P.holding.animal=c.animal;toast(`You grabbed the ${descName(descOf(c.obj))} from the ${V.type==='pickup'?'back':'roof'}`);}
}
function loadCargo(V,h){
  V.cargo=h;V.C.group.add(h.obj);
  const spot=V.type==='pickup'?[0,.75,-1.6]:V.type==='buggy'?[0,.85,-1.2]:[0,1.62,-.2];
  h.obj.position.set(...spot);h.obj.rotation.set(0,0,0);h.obj.scale.set(1,1,1);
  if(h.kind==='wheel'||h.kind==='rim'||h.kind==='tyre'){h.obj.rotation.set(0,0,Math.PI/2);h.obj.position.y+=.05;}
  if(h.kind.startsWith('door')){h.obj.rotation.set(0,0,Math.PI/2);h.obj.position.x+=.45;h.obj.position.y-=.07;}
}
function enterVehicle(V){
  if(!V.C.slots.seatD||!V.C.slots.seatD.obj){toast("💺 There's no driver's seat! Fit one first",'warn');return;}
  if(P.holding){
    if(V.cargo){toast('There is already something loaded. Drop what you are holding first (G)','warn');return;}
    const h=releaseHeld();loadCargo(V,h);toast(`Loaded the ${descName(descOf(h.obj))} ${V.type==='pickup'?'in the back':'on the roof'}`);
  }
  P.vehicle=V;lastV=V;scene.remove(person.group);seatPerson(V);CAM.yawOff=0;
}
function useSelected(){
  const k=P.hot[P.sel];
  if(!k){const f=P.hot.findIndex(x=>x&&isFood(x));if(f<0){toast('Nothing in this hotbar slot');return;}P.sel=f;return useSelected();}
  if(isFood(k)){if(P.hunger>=99&&GAME.hunger){toast('You are not hungry');return;}P.hot[P.sel]=null;P.hunger=Math.min(100,P.hunger+FOOD[k].val);toast(`${FOOD[k].em} Ate ${FOOD[k].name.toLowerCase()} (+${FOOD[k].val})`,'good');return;}
  if(isCD(k)){const near=P.vehicle||nearestVehicle(4);if(!near){toast('Take the CD to a car to play it');return;}
    P.hot[P.sel]=null;Radio.addCD(k,true);toast(`💿 Playing "${CD_BY_ID[k].name}"`,'good');}
}
function drop(){
  if(P.vehicle)return;
  const f={x:Math.sin(P.h),z:Math.cos(P.h)},x=P.x+f.x*1.1,z=P.z+f.z*1.1;
  if(P.holding){const h=releaseHeld();
    if(h.kind==='chicken'&&h.animal){const a=h.animal;a.held=false;a.tag=null;a.x=x;a.z=z;a.y=floorAt(x,z);scene.add(a.obj);a.state='flee';a.t=1.5;SFX.squawk();return;}
    scene.add(h.obj);restPose(h.obj,h.kind,x,floorAt(x,z),z,P.h);loose.push({kind:h.kind,obj:h.obj,prop:isProp(h.kind)});SFX.clunk();return;}
  const k=P.hot[P.sel];if(!k)return;P.hot[P.sel]=null;
  const m=makeFromDesc({k});scene.add(m);restPose(m,k,x,floorAt(x,z),z,P.h);loose.push({kind:k,obj:m});
}

// ---------------------------------------------------------------------- physics helpers
function findPatch(x,z){let hit=null;nearChunks(z,ch=>{for(const p of ch.patches)if(z>p.z0&&z<p.z1&&Math.abs(x-(roadX(z)+p.off))<p.w/2)hit=p;});return hit;}
function houseAt(x,z,pad=0){let hit=null;nearChunks(z,ch=>{for(const h of ch.houses)if(x>h.x0-pad&&x<h.x1+pad&&z>h.z0-pad&&z<h.z1+pad)hit=h;});return hit;}
function floorAt(x,z){const h=houseAt(x,z,.2);return h?h.fy:surfaceH(x,z);}
function pushCircle(o,r,selfV){
  let res=null;
  const circ=(cx,cz,cr)=>{const dx=o.x-cx,dz=o.z-cz,dd=Math.hypot(dx,dz),min=cr+r;
    if(dd<min&&dd>1e-4){const nx=dx/dd,nz=dz/dd;o.x+=nx*(min-dd);o.z+=nz*(min-dd);res={nx,nz};}};
  nearChunks(o.z,ch=>{
    for(const c of ch.colliders){if(c.dead)continue;if(c.soft){const dd=Math.hypot(o.x-c.x,o.z-c.z);if(dd<c.r+r)res={soft:c};continue;}circ(c.x,c.z,c.r);}
    for(const b of ch.boxes){
      if(b.door&&b.door.amt>.4)continue;
      const cx=clamp(o.x,b.x0,b.x1),cz=clamp(o.z,b.z0,b.z1);const dx=o.x-cx,dz=o.z-cz,dd=Math.hypot(dx,dz);
      if(dd<r){let nx,nz;if(dd>1e-4){nx=dx/dd;nz=dz/dd;o.x+=nx*(r-dd);o.z+=nz*(r-dd);}
        else{const l=o.x-b.x0,rr=b.x1-o.x,f=o.z-b.z0,bk=b.z1-o.z,m=Math.min(l,rr,f,bk);
          if(m===l){o.x=b.x0-r;nx=-1;nz=0;}else if(m===rr){o.x=b.x1+r;nx=1;nz=0;}else if(m===f){o.z=b.z0-r;nx=0;nz=-1;}else{o.z=b.z1+r;nx=0;nz=1;}}
        res={nx,nz};}
    }
  });
  for(const l of loose)if(l.prop&&!l.vel){const p=l.obj.position;circ(p.x,p.z,.4);}
  for(const V of vehicles){if(V===selfV)continue;const f={x:Math.sin(V.h),z:Math.cos(V.h)};for(const off of[-1.3,0,1.3])circ(V.x+f.x*off,V.z+f.z*off,.95);}
  for(const[cx,cz,cr]of Net.circles())circ(cx,cz,cr);
  return res;
}

// ---------------------------------------------------------------------- vehicle physics
function updateVehicle(V,dt){
  const drive=P.vehicle===V,C=V.C,sp=C.spec;
  const throttle=drive&&input.up?1:0,brake=drive&&input.down?1:0,steer=drive?(input.left?1:0)-(input.right?1:0):0,hand=drive&&input.jump;
  const f={x:Math.sin(V.h),z:Math.cos(V.h)},r={x:Math.cos(V.h),z:-Math.sin(V.h)};
  let vf=V.vx*f.x+V.vz*f.z,vr=V.vx*r.x+V.vz*r.z;
  for(const s of Object.values(C.slots))if(s.hinge){s.openAmt+=((s.open?1:0)-s.openAmt)*Math.min(1,dt*6);s.hinge.rotation[s.axis]=s.angle*s.openAmt;}
  if(!drive&&Math.abs(vf)<.02&&Math.abs(vr)<.02&&!V.dirty){V.vx=V.vz=0;V.heat=Math.max(0,V.heat-6*dt);vehicleVisual(V,0,0,0,dt);return;}
  V.dirty=false;
  const ms=missing(C),eng=engineSpec(C),tf=tyreFactors(C);
  const onRoad=Math.abs(V.x-roadX(V.z))<5.6;
  let grip=onRoad?S.grip*tf.road:S.offGrip*sp.offGrip*tf.off,maxS=(onRoad?S.maxSpeed*Math.min(1.08,tf.road):S.offMax*sp.offMax*Math.min(1.4,tf.off))*sp.maxS,drag=onRoad?.05:S.offDrag*sp.offDrag/Math.max(.7,tf.off);
  if(S.patch==='ice')grip*=1+(tf.ice-1)*.35;
  const patch=findPatch(V.x,V.z);
  if(patch){if(S.patch==='ice')grip=.55*tf.ice;else if(S.patch==='mud'){maxS=Math.min(maxS,(storm?7:11)*(V.type==='buggy'?1.6:1)*tf.mud);drag+=(storm?2.2:1.4)/tf.mud;}else{maxS=Math.min(maxS,24);drag+=.5;}}
  if(stormAmt>.5){if(S.weather==='rain'){grip*=.6;if(!onRoad){maxS*=.75;drag+=.6;}}if(S.weather==='sandstorm')maxS*=.85;if(S.weather==='blizzard')grip*=.8;}
  if(ms.wheels){maxS*=Math.max(.08,1-.38*ms.wheels);drag+=ms.wheels*1.2;grip*=Math.max(.3,1-.2*ms.wheels);}
  if(ms.bare){maxS*=Math.max(.3,1-.15*ms.bare);drag+=ms.bare*.5;}
  if(eng)maxS*=Math.pow(eng.power,.35);
  const canDrive=(V.fuel>0||GAME.infFuel)&&V.engine>0&&ms.wheels<3&&!ms.battery&&!!eng;
  if(drive&&throttle&&!V.noGoToast&&(ms.battery||!eng)){V.noGoToast=true;toast(!eng?'⚙️ There is no engine! Fit one under the bonnet':'🔋 No battery! The engine won\'t start','warn');}
  if(eng&&!ms.battery)V.noGoToast=false;
  const power=(.45+.55*(V.engine/100))*(1+.04*ms.panels)*(sp.accel/13)*(eng?eng.power:0);
  if(throttle&&canDrive){if(vf<maxS)vf+=(vf<0?24:13)*power*dt;}
  if(brake){if(vf>.5)vf-=26*dt;else if(canDrive&&vf>-9)vf-=8*dt;}
  if(hand)vf-=Math.sign(vf)*Math.min(Math.abs(vf),18*dt);
  if(!throttle&&!brake&&vf<0)vf+=Math.min(-vf,4*dt);
  if(!drive)vf-=Math.sign(vf)*Math.min(Math.abs(vf),8*dt);
  if(vf>maxS)vf-=(vf-maxS)*1.6*dt;
  vf-=vf*drag*dt*.3;
  if(!throttle)vf-=Math.sign(vf)*Math.min(Math.abs(vf),1.0*dt);
  const hF=surfaceH(V.x+f.x*1.8,V.z+f.z*1.8),hB=surfaceH(V.x-f.x*1.8,V.z-f.z*1.8);const slope=(hF-hB)/3.6;
  vf-=9.8*slope*.75*dt*(drive||Math.abs(vf)>.3?1:0)/((eng&&eng.hill&&slope>0&&throttle)?eng.hill:1);
  const spd=Math.abs(vf);
  let pull=0;if(ms.wheels){const L=(!C.slots.wheelFL.obj)+(!C.slots.wheelRL.obj),R=(!C.slots.wheelFR.obj)+(!C.slots.wheelRR.obj);pull=(L-R)*.35;}
  V.h+=(steer*1.9+pull)*Math.min(1,spd/5)*(vf>=0?1:-1)/(1+spd/45)*dt;
  vr-=vr*Math.min(1,grip*(hand?.25:1)*dt);
  V.vx=f.x*vf+r.x*vr;V.vz=f.z*vf+r.z*vr;
  V.x+=V.vx*dt;V.z+=V.vz*dt;
  const rx=roadX(V.z);if(V.x-rx>280){V.x=rx+280;V.vx*=-.3;}if(V.x-rx<-280){V.x=rx-280;V.vx*=-.3;}
  for(const off of[-1.3,0,1.3]){
    const o={x:V.x+f.x*off,z:V.z+f.z*off};const ox=o.x,oz=o.z;
    const res=pushCircle(o,1.0,V);if(!res)continue;
    if(res.soft){const c=res.soft;c.dead=true;if(c.mesh){c.mesh.scale.y*=.35;c.mesh.scale.x*=1.3;}V.vx*=.45;V.vz*=.45;V.engine=Math.max(0,V.engine-3);if(drive){toast('Snowdrift! Slowed you right down','warn');shake=.3;}continue;}
    V.x+=o.x-ox;V.z+=o.z-oz;
    const vn=-(V.vx*res.nx+V.vz*res.nz);
    if(vn>0){V.vx+=res.nx*vn*1.4;V.vz+=res.nz*vn*1.4;V.vx*=.6;V.vz*=.6;
      if(vn>3){const dmg=Math.round(vn*1.15*(1+.15*ms.panels));if(eng)V.engine=Math.max(0,V.engine-dmg);if(drive){toast('💥 Crash! Engine −'+dmg,'warn');flash();shake=Math.min(1,vn/20);
        if(dmg>15){P.health-=dmg*.35*(1+.3*ms.doors);P.cause='crash';}}}}
  }
  // knock props over when you drive into them
  for(const l of loose)if(l.prop){const p=l.obj.position,dx=p.x-V.x,dz=p.z-V.z,d=Math.hypot(dx,dz);if(d<1.9&&spd>2){l.vel=l.vel||{x:0,y:0,z:0,s:0};l.vel.x+=V.vx*.8+dx/d*2;l.vel.z+=V.vz*.8+dz/d*2;l.vel.y=3;l.vel.s=(Math.random()-.5)*12;}}
  if(drive)nearChunks(V.z,ch=>{
    for(const p of ch.pickups){if(p.taken)continue;
      if(Math.hypot(V.x-p.x,V.z-p.z)<2.6){p.taken=true;taken.add(p.id);p.mesh.visible=false;
        if(p.type==='fuel'){V.fuel=Math.min(100,V.fuel+18);toast('⛽ +18 fuel','good');}else if(eng){V.engine=Math.min(100,V.engine+25);V.brokeToast=false;toast('🔧 Engine repaired +25','good');}}}
    if(ch.station){const s=ch.station,d=Math.hypot(V.x-s.x,V.z-s.z);
      if(d<12){if(vSpeed(V)<3){V.fuel=Math.min(100,V.fuel+30*dt);if(eng)V.engine=Math.min(100,V.engine+12*dt);V.heat=Math.max(0,V.heat-30*dt);P.warmth=Math.min(100,P.warmth+25*dt);showPrompt('⛽ Filling up… '+Math.round(V.fuel)+'%');}
        else showPrompt('Stop here to fill up and fix your car');stationMsgT=.2;}}
  });
  const heaterOn=S.hazard==='cold'&&V.heater&&drive;
  if(drive&&!GAME.infFuel)V.fuel-=(.04+throttle*.62*(onRoad?1:1.25)*(eng?eng.fuel:1)+(heaterOn?.28:0))*dt;
  V.fuel=Math.max(0,V.fuel);
  const ratio=clamp(vf/S.maxSpeed,0,1.2),hot=S.hazard==='heat'||ms.radiator;
  if(hot&&eng){const mult=(ms.radiator?3:1)*(ms.hood?.55:1)*eng.heat;V.heat+=throttle&&canDrive?(.4+ratio*3.6+(stormAmt>.5&&S.hazard==='heat'?.8:0))*mult*dt:-8*dt;}
  else V.heat-=8*dt;
  V.heat=clamp(V.heat,0,100);
  if(V.heat>=100&&eng){V.engine=Math.max(0,V.engine-5*dt);if(drive){overheatToastT-=dt;if(overheatToastT<=0){toast(ms.radiator?'🔥 No radiator! The engine is cooking':'🔥 Overheating! Let go of the gas','warn');overheatToastT=3;}}}
  if(eng&&V.engine<=0){V.engine=0;if(drive&&!V.brokeToast){V.brokeToast=true;toast('💀 Engine broke down! Find a repair kit 🧰','warn');}}
  if(drive&&V.fuel<=0&&!GAME.infFuel&&!V.fuelToast){V.fuelToast=true;toast('Out of fuel! Look for a jerry can ⛽','warn');}
  if(V.fuel>0)V.fuelToast=false;
  if(!drive&&Math.abs(vf)>.02)V.dirty=true;
  vehicleVisual(V,vf,steer,slope,dt,brake,throttle&&canDrive);
}
function vehicleVisual(V,vf,steer,slope,dt,brake,running){
  const C=V.C,f={x:Math.sin(V.h),z:Math.cos(V.h)},r={x:Math.cos(V.h),z:-Math.sin(V.h)};
  V.y=surfaceH(V.x,V.z);
  if(slope===0){const hF=surfaceH(V.x+f.x*1.8,V.z+f.z*1.8),hB=surfaceH(V.x-f.x*1.8,V.z-f.z*1.8);slope=(hF-hB)/3.6;}
  const hL=surfaceH(V.x+r.x,V.z+r.z),hR=surfaceH(V.x-r.x,V.z-r.z);
  let tiltP=0,tiltR=0,sink=0;const sl=C.slots;
  const corner=(s,p,rr)=>{const o=s.obj;const d=!o?.1:!o.userData.tyreObj?.06:0;if(d){tiltP+=p*d/.1*.06;tiltR+=rr*d/.1*.07;sink+=d;}};
  corner(sl.wheelFL,1,-1);corner(sl.wheelFR,1,1);corner(sl.wheelRL,-1,-1);corner(sl.wheelRR,-1,1);
  V.sink=Math.min(.28,sink);
  const k=Math.min(1,dt*10);
  V.pitch+=(-Math.atan(slope)+tiltP-V.pitch)*k;V.roll+=(Math.atan((hL-hR)/2)+tiltR-V.roll)*k;
  V.wheelSpin+=vf*dt/.36;V.steerVis+=(steer*.45-V.steerVis)*k;V.lastVf=vf;V.braking=!!brake&&vf>.5;V.running=!!running||(P.vehicle===V&&V.engine>0&&!missing(C).battery&&!!engineSpec(C)&&(V.fuel>0||GAME.infFuel));
  placeVehicle(V);
  for(const[name,piv]of Object.entries(C.pivots)){const s=C.slots[name];if(s.obj)s.obj.rotation.x=V.wheelSpin;if(name.startsWith('wheelF'))piv.rotation.y=V.steerVis;}
  if(C.steer)C.steer.rotation.z=V.steerVis*2.6;
  for(const t of C.tails)t.material=V.braking?CARMAT.tailOn:CARMAT.tail;
}
function updateDashboard(V,dt){
  const C=V.C;if(!C.needles)return;const ms=missing(C);
  const tgt={speed:Math.abs(V.lastVf)*3.6/200,rpm:V.running?(.8+Math.abs(V.lastVf)/S.maxSpeed*4.8+(input.up?.7:0))/8:0,fuel:V.fuel/100,temp:V.running||V.heat>1?.32+V.heat/100*.68:0};
  for(const k in C.needles){V.needle[k]+=(clamp(tgt[k],0,1)-V.needle[k])*Math.min(1,dt*6);C.needles[k].rotation.z=2.3-V.needle[k]*4.6;}
  const L=C.lights,set=(m,on,mat)=>{if(m)m.material=on?mat:CARMAT.lightOff;};
  set(L.engine,V.engine<30||V.heat>85||!engineSpec(C),CARMAT.lightRed);set(L.fuel,V.fuel<15&&!GAME.infFuel,CARMAT.lightAmber);set(L.battery,ms.battery,CARMAT.lightRed);set(L.heater,S.hazard==='cold'&&V.heater,CARMAT.lightBlue);
}

// ---------------------------------------------------------------------- person
function updatePerson(dt){
  if(P.vehicle)return;
  const lk=locked();
  const turn=(input.left?1:0)-(input.right?1:0);
  if(!lk)P.h+=turn*2.7*dt;
  P.crouch+=((input.crouch?1:0)-P.crouch)*Math.min(1,dt*10);
  const crouching=P.crouch>.5;
  const fw=(input.up?1:0)-(input.down?.6:0),strafe=lk?turn:0;
  const wantRun=input.run&&fw>0&&!crouching&&!(P.holding&&heavy(P.holding.kind))&&P.stamina>5;
  const spd=crouching?1.5:wantRun?6.2:(P.holding&&heavy(P.holding.kind)?2.4:3.3);
  const f={x:Math.sin(P.h),z:Math.cos(P.h)},r={x:Math.cos(P.h),z:-Math.sin(P.h)};
  let mx=f.x*fw+r.x*strafe*.8,mz=f.z*fw+r.z*strafe*.8;const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  P.x+=mx*spd*dt;P.z+=mz*spd*dt;
  const moving=ml>.05;
  if(wantRun&&moving){P.stamina=Math.max(0,P.stamina-18*dt);P.staminaWait=.8;}else{P.staminaWait-=dt;if(P.staminaWait<=0)P.stamina=Math.min(100,P.stamina+12*dt);}
  const o={x:P.x,z:P.z};pushCircle(o,.32,null);P.x=o.x;P.z=o.z;
  const gy=floorAt(P.x,P.z);
  if(input.jump&&P.grounded&&P.stamina>8&&!crouching){P.vy=5.5;P.grounded=false;P.stamina-=10;P.staminaWait=.8;}
  P.vy-=18*dt;P.y+=P.vy*dt;
  if(P.y<=gy){P.y=gy;P.vy=0;P.grounded=true;}else if(P.y-gy>.05)P.grounded=false;
  if(P.grounded&&P.y<gy+.3)P.y=gy;
  P.phase+=(moving?spd:0)*dt*2.4;
  P.moveAmp+=((moving?(wantRun?.85:.55):0)-P.moveAmp)*Math.min(1,dt*8);
  person.group.position.set(P.x,P.y-P.crouch*.38,P.z);person.group.rotation.set(0,P.h,0);if(koT>0){person.group.rotation.x=-1.45*Math.min(1,(3-koT)*4);person.group.position.y+=.15;}
  pose(person,crouching?'crouch':(P.holding&&isGun(P.holding.kind))?'aim':P.holding?'carry':'walk',P.phase,P.moveAmp);
  P.inside=houseAt(P.x,P.z,-.1);
  const c=candidates();promptAction=chooseTarget(c);
  if(E.down&&E.target&&E.target.hold&&!E.fired){E.t+=dt;if(E.t>.55){E.fired=true;E.target.hold.fn();}}
  if(Math.hypot(P.x-(lastV?lastV.x:P.x),P.z-(lastV?lastV.z:P.z))>420&&!P.farToast){P.farToast=true;toast('You are very far from your car!','warn');}
  // shooting
  shootT-=dt;
  if(input.fire&&P.holding&&isGun(P.holding.kind)&&shootT<=0)shoot(P.holding.kind);
}

// ---------------------------------------------------------------------- guns (sandbox): hit targets, knock things over, scare chickens
function spawnPuff(x,y,z,col,n=6,spread=.3,up=1){
  for(let i=0;i<n;i++){const m=new THREE.Mesh(G.sphere,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.8,depthWrite:false}));m.scale.setScalar(.05+Math.random()*.05);m.position.set(x,y,z);scene.add(m);
    puffs.push({m,v:new THREE.Vector3((Math.random()-.5)*spread*6,Math.random()*up*2,(Math.random()-.5)*spread*6),t:.6+Math.random()*.4});}
}
function shoot(kind){
  const rifle=kind==='rifle';shootT=rifle?.6:.28;recoil=1;SFX.shot(rifle);
  const o=camera.position.clone(),d=new THREE.Vector3();camera.getWorldDirection(d);
  const head=new THREE.Vector3(P.x,P.y+1.5,P.z);const t0=CAM.fp?0:Math.max(0,o.distanceTo(head)-.2);
  const range=rifle?160:70;let best=null,bt=range;
  const sph=(c,rad,what)=>{const oc=c.clone().sub(o),tc=oc.dot(d);if(tc<t0)return;const d2=oc.lengthSq()-tc*tc;if(d2>rad*rad)return;const t=tc-Math.sqrt(rad*rad-d2);if(t<bt){bt=t;best=what;}};
  for(const a of animals)if(!a.held)sph(new THREE.Vector3(a.x,a.y+.28,a.z),.28,{a});
  for(const l of loose)if(l.prop){const p=l.obj.position;sph(new THREE.Vector3(p.x,p.y+(l.kind==='target'?1.05:.45),p.z),l.kind==='target'?.5:.45,{l});}
  for(const r of Net.targets()){sph(new THREE.Vector3(r.x,r.y+(r.cr?.6:1.2),r.z),.32,{r});sph(new THREE.Vector3(r.x,r.y+(r.cr?.35:.55),r.z),.3,{r});}
  for(const V of vehicles)sph(new THREE.Vector3(V.x,V.y+.8,V.z),1.3,{V});
  nearChunks(P.z,ch=>{for(const C of ch.wrecks){const p=C.group.position;sph(new THREE.Vector3(p.x,p.y+.8,p.z),1.3,{V:true});}});
  // ground
  for(let t=Math.max(t0,1);t<bt;t+=.5){const p=o.clone().addScaledVector(d,t);if(p.y<floorAt(p.x,p.z)){bt=t;best={ground:true};break;}}
  const hit=o.clone().addScaledVector(d,bt);
  if(!best)return;
  if(best.a){const a=best.a;a.state='flee';a.t=5;a.h=Math.atan2(a.x-P.x,a.z-P.z);a.vy=3;SFX.squawk();spawnPuff(hit.x,hit.y,hit.z,0xffffff,10,.5,1.2);toast('🐔 BAWK! The chicken flaps away','good');}
  else if(best.r){const r=best.r;SFX.hit();spawnPuff(hit.x,hit.y,hit.z,0xffe066,8,.3,1);Net.sendHit(r.id,rifle?50:25);toast(`🎯 You hit ${r.name}!`,'good');}
  else if(best.l){const l=best.l;SFX.hit();
    if(l.kind==='target'){const c=l.obj.localToWorld(new THREE.Vector3(0,1.05,.04)),dd=c.distanceTo(hit);toast(dd<.09?'🎯 BULLSEYE!':dd<.25?'🎯 Great shot!':'🎯 Hit!','good');spawnPuff(hit.x,hit.y,hit.z,0x8a5a33,5,.2);}
    else{l.vel=l.vel||{x:0,y:0,z:0,s:0};l.vel.x+=d.x*(rifle?7:4);l.vel.z+=d.z*(rifle?7:4);l.vel.y+=rifle?3.5:2.2;l.vel.s+=(Math.random()-.5)*14;spawnPuff(hit.x,hit.y,hit.z,0xcccccc,5,.2);}}
  else if(best.V){SFX.hit();spawnPuff(hit.x,hit.y,hit.z,0xffd27a,6,.15,.6);}
  else spawnPuff(hit.x,hit.y+.05,hit.z,new THREE.Color(S.ground[1]).getHex(),8,.25,.8);
}
function updateProps(dt){
  for(const l of loose){if(!l.vel)continue;const v=l.vel,o=l.obj;
    o.position.x+=v.x*dt;o.position.z+=v.z*dt;v.y-=12*dt;o.position.y+=v.y*dt;o.rotation.y+=v.s*dt;
    if(l.kind!=='target'){o.rotation.z+=v.s*.3*dt;}
    const gy=floorAt(o.position.x,o.position.z);
    if(o.position.y<=gy){o.position.y=gy;v.y=Math.abs(v.y)>2?-v.y*.3:0;v.x*=.8;v.z*=.8;v.s*=.8;
      if(Math.hypot(v.x,v.z)<.2&&Math.abs(v.y)<.5){if(l.kind==='cone'||l.kind==='barrel')o.rotation.z=Math.abs(o.rotation.z)>.6?Math.PI/2*Math.sign(o.rotation.z):0;else o.rotation.z=0;l.vel=null;}}
  }
  for(let i=puffs.length-1;i>=0;i--){const p=puffs[i];p.t-=dt;p.m.position.addScaledVector(p.v,dt);p.v.y-=3*dt;p.m.material.opacity=Math.max(0,p.t);if(p.t<=0){scene.remove(p.m);p.m.material.dispose();puffs.splice(i,1);}}
}

// ---------------------------------------------------------------------- chickens
function spawnChicken(x,z,tag){
  const obj=makeChicken();obj.userData.desc={k:'chicken'};const a={obj,rig:obj.userData.rig,x,z,y:floorAt(x,z),h:Math.random()*6.28,vy:0,state:'wander',t:Math.random()*3,phase:0,tag,eggT:50+Math.random()*80,cluckT:4+Math.random()*10,held:false};
  scene.add(obj);animals.push(a);return a;
}
chunkHook=(ch,removed)=>{
  if(removed){for(let i=animals.length-1;i>=0;i--){const a=animals[i];if(a.tag&&a.tag.startsWith(ch.i+':')&&!a.held){scene.remove(a.obj);animals.splice(i,1);}}return;}
  if(ch.chickens)for(const[x,z,id]of ch.chickens)if(!taken.has(id)&&!animals.some(a=>a.tag===id))spawnChicken(x,z,id);
};
function updateAnimals(dt){
  for(const a of animals){
    if(a.held)continue;
    const dp=Math.hypot(a.x-P.x,a.z-P.z);
    if(a.tag&&dp>4){} // stays near its house
    a.t-=dt;
    if(dp<2.2&&a.state!=='flee'&&!P.vehicle){a.state='flee';a.t=2;a.h=Math.atan2(a.x-P.x,a.z-P.z);if(Math.random()<.5)SFX.cluck(1);}
    if(a.t<=0){if(a.state==='flee'||Math.random()<.4){a.state='peck';a.t=1+Math.random()*2;}else{a.state='wander';a.t=1+Math.random()*3;a.h+=(Math.random()-.5)*2.5;}}
    const spd=a.state==='flee'?3.2:a.state==='wander'?.7:0;
    a.x+=Math.sin(a.h)*spd*dt;a.z+=Math.cos(a.h)*spd*dt;
    const o={x:a.x,z:a.z};pushCircle(o,.2,null);a.x=o.x;a.z=o.z;
    const gy=floorAt(a.x,a.z);a.vy-=14*dt;a.y+=a.vy*dt;if(a.y<gy){a.y=gy;a.vy=0;}
    a.phase+=spd*dt*12;
    const R=a.rig;a.obj.position.set(a.x,a.y,a.z);a.obj.rotation.y=a.h;
    R.legs[0].rotation.x=Math.sin(a.phase)*.6*(spd>0?1:0);R.legs[1].rotation.x=-Math.sin(a.phase)*.6*(spd>0?1:0);
    R.head.rotation.x=a.state==='peck'?(.6+Math.sin(performance.now()/90)*.5):Math.sin(a.phase*.5)*.15;
    const flap=a.state==='flee'?Math.sin(performance.now()/40)*.9:0;R.wings[0].rotation.z=-flap;R.wings[1].rotation.z=flap;
    a.cluckT-=dt;if(a.cluckT<=0){a.cluckT=6+Math.random()*10;if(dp<15&&state==='play')SFX.cluck(clamp(1-dp/15,0,1));}
    a.eggT-=dt;if(a.eggT<=0){a.eggT=70+Math.random()*90;if(dp<60){const m=makeFromDesc({k:'egg'});scene.add(m);restPose(m,'egg',a.x-Math.sin(a.h)*.3,floorAt(a.x,a.z),a.z-Math.cos(a.h)*.3,0);loose.push({kind:'egg',obj:m});}}
    if(!a.tag&&dp>350){a.far=true;}
  }
}

// ---------------------------------------------------------------------- survival & weather
function updateSurvival(dt){
  const running=!P.vehicle&&input.run&&input.up;
  if(GAME.hunger){P.hunger-=(P.vehicle?.22:.3)*(running?2:1)*dt;if(P.hunger<=0){P.hunger=0;P.health-=1.3*dt;P.cause='hunger';}
    if(P.hunger<20){hungryToastT-=dt;if(hungryToastT<=0){toast(P.hot.some(isFood)?'😫 You are starving! Press F to eat':'😫 You are starving! Search abandoned houses for food','warn');hungryToastT=6;}}}
  else P.hunger=100;
  if(S.hazard==='cold'){
    const V=P.vehicle;let d;
    if(V){const ms=missing(V.C);d=-(stormAmt>.5?2.2:1.0)*(1+.45*ms.doors)*(V.type==='buggy'?1.6:1);if(V.heater&&(V.fuel>0||GAME.infFuel)&&V.engine>0&&engineSpec(V.C)&&V.type!=='buggy')d+=3.0*(1-.3*ms.doors);}
    else if(P.inside)d=-.35;else d=-(stormAmt>.5?3:1.5);
    P.warmth=clamp(P.warmth+d*dt,0,100);
    if(P.warmth<25){coldToastT-=dt;if(coldToastT<=0){toast(P.vehicle?'🥶 Freezing! Turn on the heater (H)':'🥶 Freezing! Get back in the car or find shelter','warn');coldToastT=5;}}
    if(P.warmth<=0){P.health-=2.5*dt;P.cause='cold';}
  }
  if(P.hunger>50&&(S.hazard!=='cold'||P.warmth>30))P.health+=.5*dt;
  P.health=Math.min(100,P.health);
  if(P.health<=0){P.health=0;const msg={hunger:['You ran out of food.','Starved!'],cold:['You froze in the mountains.','Too cold!'],crash:['That crash was too much.','Ouch!']}[P.cause]||['You collapsed.','Game over'];endGame(msg[0],msg[1]);}
  maxZ=Math.max(maxZ,P.vehicle?P.vehicle.z:P.z);
}
function updateWeather(dt){
  if(storm){stormT-=dt;if(stormT<=0){storm=false;nextStorm=45+Math.random()*50;toast('☀️ The weather is clearing','good');}}
  else{nextStorm-=dt;if(nextStorm<=0){storm=true;stormT=18+Math.random()*16;toast(S.stormMsg,'warn');}}
  stormAmt+=((storm?1:0)-stormAmt)*Math.min(1,dt*.6);
}
function flash(){const f=$('flash');f.style.opacity=1;setTimeout(()=>f.style.opacity=0,120);}
let promptHtml='';
function showPrompt(t,html){const p=$('prompt');if(promptHtml!==t){promptHtml=t;if(html)p.innerHTML=t;else p.textContent=t;}p.classList.remove('hidden');}
function hidePrompt(){$('prompt').classList.add('hidden');promptHtml='';}

// ---------------------------------------------------------------------- multiplayer: getting hit by a friend knocks you out, then you wake up at your car
let koT=0;
Net.onHit=d=>{
  if(state!=='play'||koT>0)return;
  P.health-=d.dmg;flash();shake=.4;SFX.hit();
  if(P.health>0){toast(`💥 ${d.name} hit you! (−${d.dmg})`,'warn');return;}
  P.health=1;koT=3;Net.sendKo(d.from,d.name);toast(`💫 ${d.name} knocked you out!`,'warn');$('ko').classList.remove('hidden');
};
Net.onKo=d=>{if(d.by===Net.id)toast(`💫 You knocked out ${d.name}!`,'good');else toast(`💫 ${d.byName} knocked out ${d.name}`);};
function updateKo(dt){
  if(koT<=0)return;koT-=dt;for(const k in input)input[k]=false;
  if(koT<=0){$('ko').classList.add('hidden');P.health=100;
    if(P.holding){const h=releaseHeld();if(h.animal){const a=h.animal;a.held=false;a.x=P.x+.6;a.z=P.z;a.y=floorAt(a.x,a.z);a.state='flee';a.t=2;scene.add(h.obj);}else{scene.add(h.obj);restPose(h.obj,h.kind,P.x,floorAt(P.x,P.z),P.z,P.h);loose.push({kind:h.kind,obj:h.obj,prop:isProp(h.kind)});}}
    const V=lastV;if(V&&!P.vehicle){const p=worldPoint(V.C,[-1.6,0,-.3]);P.x=p.x;P.z=p.z;P.y=floorAt(p.x,p.z);P.vy=0;}
    toast('You wake up next to your car','good');}
}

// ---------------------------------------------------------------------- multiplayer: send my state ~12 times a second
let netT=0;
function netSend(dt){
  if(Net.role==='off')return;netT-=dt;if(netT>0)return;netT=.08;
  const V=P.vehicle;
  Net.broadcast({t:'st',id:Net.id,name:Net.name,col:Net.col,x:P.x,y:P.y,z:P.z,h:P.h,cr:P.crouch>.5,ph:P.phase,amp:P.moveAmp,hold:P.holding?descOf(P.holding.obj):null,ko:koT>0,
    v:V?{type:V.type,p:V.C.pdesc,x:V.x,y:V.y-(V.sink||0),z:V.z,h:V.h,pitch:V.pitch,roll:V.roll,ws:V.wheelSpin,sv:V.steerVis}:null});
}

// ---------------------------------------------------------------------- render
const camLook=new THREE.Vector3();let hiddenRoof=null;const UP=new THREE.Vector3(0,1,0);let vmKind=null;
function setBodyVisible(body,head){for(const c of person.group.children){if(c===person.hold)continue;c.visible=c===person.head?head:body;}}
function render(dt){
  const V=P.vehicle;let want,look;
  camera.up.copy(UP);
  if(V){
    const g=V.C.group;
    if(performance.now()-CAM.lastMouse>1600&&!CAM.fp){CAM.yawOff*=Math.max(0,1-dt*1.5);CAM.pitch*=Math.max(0,1-dt*1.5);}
    if(CAM.fp){
      const eye=worldPoint(V.C,V.C.spec.eye);
      const yo=CAM.yawOff,p=CAM.pitch-.14;const ld=new THREE.Vector3(Math.sin(yo)*Math.cos(p),Math.sin(p),Math.cos(yo)*Math.cos(p)).applyQuaternion(g.quaternion);
      camera.position.copy(eye);camera.up.set(0,1,0).applyQuaternion(g.quaternion);camera.lookAt(eye.clone().add(ld));
      camLook.copy(eye).add(ld);setBodyVisible(true,false);
    } else {
      const yaw=V.h+CAM.yawOff,f={x:Math.sin(yaw),z:Math.cos(yaw)},el=clamp(.38-CAM.pitch*.7,-.1,1.2);
      want=new THREE.Vector3(V.x-f.x*8.5*Math.cos(el),V.y+1.2+8.5*Math.sin(el),V.z-f.z*8.5*Math.cos(el));
      look=new THREE.Vector3(V.x+f.x*3,V.y+1.3,V.z+f.z*3);setBodyVisible(true,true);
    }
  } else {
    const f={x:Math.sin(P.h),z:Math.cos(P.h)},eyeH=1.62-P.crouch*.45;
    if(CAM.fp){
      const eye=new THREE.Vector3(P.x,P.y+eyeH+Math.sin(P.phase*2)*.025*P.moveAmp,P.z);camera.position.copy(eye);camera.lookAt(eye.clone().add(lookDir()));camLook.copy(eye).add(lookDir());
      setBodyVisible(false,false);
    } else if(P.inside){want=new THREE.Vector3(P.x-f.x*2.2,P.inside.fy+6.5,P.z-f.z*2.2);look=new THREE.Vector3(P.x+f.x*.6,P.y+.6,P.z+f.z*.6);setBodyVisible(true,true);}
    else{const el=clamp(.32-CAM.pitch*.8,-.25,1.25);want=new THREE.Vector3(P.x-f.x*4.2*Math.cos(el),P.y+eyeH-.1+4.2*Math.sin(el),P.z-f.z*4.2*Math.cos(el));look=new THREE.Vector3(P.x+f.x*1.2,P.y+eyeH-.2,P.z+f.z*1.2);setBodyVisible(true,true);}
  }
  if(want){
    camera.position.lerp(want,1-Math.exp(-dt*(V?4:7)));
    camLook.lerp(look,1-Math.exp(-dt*9));
    const gh=groundH(camera.position.x,camera.position.z)+(V?1.4:.6);if(camera.position.y<gh&&!P.inside)camera.position.y=gh;
    if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*2);}
    camera.lookAt(camLook);
  }
  // first-person gun in view
  const gunNow=!V&&CAM.fp&&P.holding&&isGun(P.holding.kind)?P.holding.kind:null;
  if(gunNow!==vmKind){viewModel.clear();if(gunNow){const gm=makeGun(gunNow);gm.rotation.y=Math.PI;gm.position.set(0,0,-.08);if(gunNow==='rifle')gm.position.set(-.04,.02,-.12);viewModel.add(gm);}vmKind=gunNow;}
  if(P.holding&&isGun(P.holding.kind))P.holding.obj.visible=!CAM.fp;
  recoil=Math.max(0,recoil-dt*8);viewModel.position.set(.2,-.2+recoil*.02,-.45+recoil*.06);viewModel.rotation.x=recoil*.15;
  const roofNow=(V||CAM.fp)?null:(P.inside?P.inside.roof:null);
  if(hiddenRoof!==roofNow){if(hiddenRoof)hiddenRoof.visible=true;if(roofNow)roofNow.visible=false;hiddenRoof=roofNow;}
  chunks.forEach(ch=>{for(const d of ch.doors){d.amt+=((d.open?1:0)-d.amt)*Math.min(1,dt*5);d.hinge.rotation.y=d.sign*d.amt*1.45;}});
  if(V)Radio.setEnv(20000,1);
  else if(lastV){const d=Math.hypot(P.x-lastV.x,P.z-lastV.z),ms=missing(lastV.C);Radio.setEnv(ms.doors?2500:900,clamp(1-d/(ms.doors?45:28),0,1)*(ms.doors?.85:.55));}
  sky.position.copy(camera.position);clouds.position.set(camera.position.x,0,camera.position.z);
  const fx=V?V.x:P.x,fy=V?V.y:P.y,fz=V?V.z:P.z;
  const sd=skyU.sunDir.value;sun.position.set(fx+sd.x*90,fy+sd.y*90,fz+sd.z*90);sun.target.position.set(fx,fy,fz);
  const fc=lin(S.horizon).lerp(lin(S.stormSky),stormAmt);
  scene.fog.color.copy(fc);scene.fog.far=S.fogFar+(S.stormFogFar-S.fogFar)*stormAmt;scene.fog.near=40-32*stormAmt;
  skyU.horizon.value.set(S.horizon).lerp(new THREE.Color(S.stormSky),stormAmt);skyU.top.value.set(S.skyTop).lerp(new THREE.Color(S.stormSky),stormAmt*.9);skyU.haze.value=stormAmt;
  clouds.userData.mat.opacity=.9*(1-stormAmt);
  sun.intensity=S.sunI*(1-.6*stormAmt);
  points.visible=stormAmt>.05;
  if(points.visible){
    pMat.opacity=.9*stormAmt;points.position.set(fx,fy,fz);
    const w=S.weather,vx=w==='sandstorm'?26:w==='blizzard'?6:1,vy=w==='sandstorm'?-1:w==='blizzard'?-4:-30;
    for(let i=0;i<PN;i++){const k=i*3;pPos[k]+=(vx+Math.sin(i)*2)*dt;pPos[k+1]+=vy*dt;pPos[k+2]+=Math.cos(i*1.7)*2*dt;
      if(pPos[k+1]<0)pPos[k+1]+=35;if(pPos[k+1]>35)pPos[k+1]-=35;if(pPos[k]>50)pPos[k]-=100;if(pPos[k]<-50)pPos[k]+=100;if(pPos[k+2]>50)pPos[k+2]-=100;if(pPos[k+2]<-50)pPos[k+2]+=100;}
    pGeo.attributes.position.needsUpdate=true;
  }
  const t=performance.now()/1000;
  chunks.forEach(ch=>ch.pickups.forEach(p=>{if(!p.taken){p.mesh.rotation.y=t*2;p.mesh.position.y=p.baseY+Math.sin(t*3+p.z)*.15;}}));
  renderer.render(scene,camera);
}

// ---------------------------------------------------------------------- HUD
const bar=(id,v)=>{$(id).style.width=clamp(v,0,100)+'%';};
function updateHud(){
  const V=P.vehicle||nearestVehicle(8)||lastV;
  $('carBox').classList.toggle('hidden',!V);
  if(V){const ms=missing(V.C),eng=engineSpec(V.C);
    $('carName').textContent=(P.vehicle?'🚗 ':'🚗 Nearby ')+V.C.spec.name+(eng?' · '+eng.short:' · no engine');
    bar('fuelBar',V.fuel);$('fuelTxt').textContent=GAME.infFuel?'∞':Math.round(V.fuel)+'%';
    bar('engBar',eng?V.engine:0);$('engTxt').textContent=eng?Math.round(V.engine)+'%':'none';
    $('engBar').style.background=V.engine>50?'#52c46b':V.engine>25?'#f9c74f':'#e63946';
    const showHeat=S.hazard==='heat'||ms.radiator;$('heatWrap').classList.toggle('hidden',!showHeat);
    if(showHeat){bar('heatBar',V.heat);$('heatTxt').textContent=V.heat>85?'HOT!':Math.round(V.heat)+'%';}
    const miss=ms.list.map(n=>slotName(V.C.slots[n]));const uniq=[...new Set(miss)];
    $('partsTxt').textContent=(uniq.length?'Missing: '+uniq.map(m=>m+(miss.filter(x=>x===m).length>1?' ×'+miss.filter(x=>x===m).length:'')).join(', '):'All parts fitted ✓')+(ms.bare?` · ${ms.bare} wheel${ms.bare>1?'s':''} with no tyre`:'')+(V.cargo?' · Loaded: '+descName(descOf(V.cargo.obj)):'');
    $('spd').textContent=Math.round(Math.abs(V.lastVf||0)*3.6);
  }
  $('speedo').classList.toggle('hidden',!P.vehicle||CAM.fp);
  bar('hpBar',P.health);bar('stBar',P.stamina);bar('hunBar',P.hunger);
  if(S.hazard==='cold')bar('warmBar',P.warmth);
  $('hunWrap').classList.toggle('dim',!GAME.hunger);
  document.querySelectorAll('.hslot').forEach((el,i)=>{const k=P.hot[i];el.classList.toggle('sel',i===P.sel);el.querySelector('.em').textContent=k?descEm({k}):'';el.title=k?descName({k}):'';});
  $('holdTxt').textContent=P.holding?'✋ Holding: '+descName(descOf(P.holding.obj))+(isGun(P.holding.kind)?'  (click to shoot, G to drop)':'  (G to drop)'):'';
  $('holdTxt').classList.toggle('hidden',!P.holding);
  $('dist').textContent=progress().toFixed(2)+' km';
  $('weather').textContent=stormAmt>.5?S.stormName:'☀️ Clear';
  $('cross').classList.toggle('hidden',!(CAM.fp||(locked()&&!P.vehicle)));
  if(Net.role!=='off'&&Net.code){$('room').textContent=`👥 Room ${Net.code}${Net.role==='host'?' · share this code':''} · ${Net.count+1} playing`;$('room').classList.remove('hidden');}else $('room').classList.add('hidden');
  if(stationMsgT>0)return;
  if(P.vehicle){if(vSpeed(P.vehicle)<1.5)showPrompt('<kbd>E</kbd> Get out',true);else hidePrompt();return;}
  const a=promptAction;
  if(a){let h=`<kbd>E</kbd> ${a.label}`;if(a.hold)h+=` <span class="hold">· hold <kbd>E</kbd> ${a.hold.label}</span>`;
    if(E.down&&E.target===a&&a.hold&&!E.fired)h+=`<div class="hbar"><i style="width:${Math.min(100,E.t/.55*100)}%"></i></div>`;showPrompt(h,true);}
  else hidePrompt();
}

// ---------------------------------------------------------------------- sandbox menu
const SB={tab:'vehicles',sel:null,color:'blue',rusty:false,fuel:100,engine:'V6',tyre:'road',rim:'steel',cat:'all',thumbs:{}};
function toggleSandbox(){menuOpen?closeSandbox():openSandbox();}
function openSandbox(){if(GAME.mode!=='sandbox')return;menuOpen=true;exitLock();for(const k in input)input[k]=false;$('sandbox').classList.remove('hidden');renderSandbox();}
function closeSandbox(){menuOpen=false;$('sandbox').classList.add('hidden');}
let thumbR=null;
function thumb(key,build){
  if(SB.thumbs[key])return SB.thumbs[key];
  try{
    if(!thumbR){thumbR=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});thumbR.setSize(160,110);thumbR.outputEncoding=THREE.sRGBEncoding;thumbR.toneMapping=THREE.ACESFilmicToneMapping;}
    const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x887766,1.1));const dl=new THREE.DirectionalLight(0xffffff,2.2);dl.position.set(3,5,4);sc.add(dl);
    const obj=build();sc.add(obj);obj.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(obj),c=box.getCenter(new THREE.Vector3()),s=Math.max(.15,box.getSize(new THREE.Vector3()).length());
    const cam=new THREE.PerspectiveCamera(32,160/110,.005,100);cam.position.copy(c).add(new THREE.Vector3(1.1,.6,-.7).normalize().multiplyScalar(s*1.35));cam.lookAt(c);
    thumbR.render(sc,cam);SB.thumbs[key]=thumbR.domElement.toDataURL();
  }catch(e){SB.thumbs[key]='';}
  return SB.thumbs[key];
}
const CATS={all:'All',food:'Food',parts:'Car parts',wheels:'Wheels',fun:'Fun',cds:'CDs'};
function catOf(d){const k=d.k;if(isFood(k))return'food';if(isCD(k))return'cds';if(k==='tyre'||k==='rim'||k==='wheel')return'wheels';if(['engine','seat','battery','radiator','jerry','toolbox'].includes(k))return'parts';return'fun';}
const specKey=d=>JSON.stringify(d);
function labelOf(d){const n=descName(d);return n[0].toUpperCase()+n.slice(1);}
function renderSandbox(){
  document.querySelectorAll('.sbTab').forEach(b=>b.classList.toggle('sel',b.dataset.tab===SB.tab));
  const grid=$('sbGrid'),side=$('sbSide');
  let entries=[];
  if(SB.tab==='vehicles')entries=Object.keys(VTYPES).map(k=>({key:'v:'+k,label:VTYPES[k].name,img:()=>thumb('v:'+k+SB.color+SB.rusty+SB.tyre+SB.rim,()=>makeVehicle(k,{color:PAINTS[SB.color],rusty:SB.rusty,tyre:SB.tyre,rim:SB.rim}).group)}));
  else if(SB.tab==='items')entries=SPAWNABLE.filter(d=>SB.cat==='all'||catOf(d)===SB.cat).map(d=>({key:'i:'+specKey(d),label:labelOf(d),img:()=>thumb('i:'+specKey(d),()=>makeFromDesc(d))}));
  if(SB.tab==='game'){grid.innerHTML='';side.innerHTML=gameTabHtml();bindGameTab();$('sbCats').innerHTML='';return;}
  $('sbCats').innerHTML=SB.tab==='items'?Object.entries(CATS).map(([k,n])=>`<button data-cat="${k}" class="${SB.cat===k?'sel':''}">${n}</button>`).join(''):'';
  $('sbCats').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{SB.cat=b.dataset.cat;SB.sel=null;renderSandbox();});
  grid.innerHTML=entries.map(e=>`<button class="sbItem${SB.sel===e.key?' sel':''}" data-key='${e.key.replace(/'/g,"&#39;")}'><img alt="" src="${e.img()}"><span>${e.label}</span></button>`).join('');
  grid.querySelectorAll('.sbItem').forEach(b=>b.onclick=()=>{SB.sel=b.dataset.key;renderSandbox();});
  const sel=entries.find(e=>e.key===SB.sel)||entries[0];if(!SB.sel&&sel)SB.sel=sel.key;
  let h=`<div class="sbPrev"><img alt="" src="${sel?sel.img():''}"><b>${sel?sel.label:''}</b></div>`;
  if(SB.tab==='vehicles'){
    const seg=(name,opts,cur,attr)=>`<div class="sbOpt"><label>${name}</label><div class="seg">${opts.map(([v,l])=>`<button data-${attr}="${v}" class="${cur===v?'sel':''}">${l}</button>`).join('')}</div></div>`;
    h+=`<div class="sbOpt"><label>Colour</label><div class="sw">${Object.entries(PAINTS).map(([n,c])=>`<i data-c="${n}" class="${SB.color===n&&!SB.rusty?'sel':''}" style="background:#${new THREE.Color(c).getHexString()}"></i>`).join('')}</div></div>`;
    h+=seg('Condition',[['0','Shiny'],['1','Rusty']],SB.rusty?'1':'0','r');
    h+=seg('Engine',Object.entries(ENGINES).map(([k,e])=>[k,e.short]),SB.engine,'e');
    h+=seg('Tyres',Object.entries(TYRES).map(([k,t])=>[k,t.name.replace(' tyre','').replace('Racing ','')]),SB.tyre,'t');
    h+=seg('Rims',Object.entries(RIMS).map(([k,t])=>[k,t.name.replace(' rim','')]),SB.rim,'m');
    h+=seg('Fuel',[['100','Full'],['50','Half'],['10','Empty']],String(SB.fuel),'f');
  }
  h+=`<button class="btn spawn" id="sbSpawn">Spawn</button>`;
  side.innerHTML=h;
  side.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{SB.color=b.dataset.c;SB.rusty=false;renderSandbox();});
  side.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{SB.rusty=b.dataset.r==='1';renderSandbox();});
  side.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{SB.engine=b.dataset.e;renderSandbox();});
  side.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{SB.tyre=b.dataset.t;renderSandbox();});
  side.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{SB.rim=b.dataset.m;renderSandbox();});
  side.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{SB.fuel=+b.dataset.f;renderSandbox();});
  $('sbSpawn').onclick=()=>spawnSelected();
}
function spawnSelected(){
  if(!SB.sel)return;const t=SB.sel.slice(0,1),rest=SB.sel.slice(2);
  const h=P.vehicle?P.vehicle.h:P.h,bx=P.vehicle?P.vehicle.x:P.x,bz=P.vehicle?P.vehicle.z:P.z,f={x:Math.sin(h),z:Math.cos(h)};
  if(t==='v'){const x=bx+f.x*7,z=bz+f.z*7;spawnVehicle(rest,{color:PAINTS[SB.color],rusty:SB.rusty,fuel:SB.fuel,engine:SB.engine,tyre:SB.tyre,rim:SB.rim},x,z,h);toast(`Spawned a ${VTYPES[rest].name.toLowerCase()}`,'good');}
  else{const d=JSON.parse(rest),x=bx+f.x*2.2,z=bz+f.z*2.2;
    if(d.k==='chicken'){spawnChicken(x,z,null);toast('🐔 Bawk!','good');SFX.cluck();return;}
    const o=makeFromDesc(d);scene.add(o);restPose(o,d.k,x,floorAt(x,z),z,h);loose.push({kind:d.k,obj:o,prop:isProp(d.k)});toast(`Spawned ${descName(d)}`,'good');}
}
function gameTabHtml(){
  const tg=(id,on,label,desc)=>`<div class="sbRow"><div><b>${label}</b><small>${desc}</small></div><button class="tgl${on?' on':''}" id="${id}">${on?'ON':'OFF'}</button></div>`;
  return `<div class="sbList">${tg('gHunger',GAME.hunger,'Hunger','You need to eat to stay alive')}${tg('gFuel',GAME.infFuel,'Infinite fuel','Never run out of fuel')}
  <div class="sbRow"><div><b>Weather</b><small>Change it right now</small></div><div class="seg"><button id="gClear">☀️ Clear</button><button id="gStorm">${S.stormName}</button></div></div>
  <div class="sbRow"><div><b>Fix my car</b><small>Full fuel, engine and every missing part back on</small></div><button class="btn" id="gFix">Fix</button></div>
  <div class="sbRow"><div><b>Heal me</b><small>Full health, food and warmth</small></div><button class="btn" id="gHeal">Heal</button></div>
  <div class="sbRow"><div><b>Clear spawned stuff</b><small>Removes items, chickens and extra cars you spawned</small></div><button class="btn alt" id="gClean">Clear</button></div></div>`;
}
function bindGameTab(){
  $('gHunger').onclick=()=>{GAME.hunger=!GAME.hunger;renderSandbox();};
  $('gFuel').onclick=()=>{GAME.infFuel=!GAME.infFuel;renderSandbox();};
  $('gClear').onclick=()=>{storm=false;stormAmt=0;nextStorm=999;};
  $('gStorm').onclick=()=>{storm=true;stormT=40;};
  $('gFix').onclick=()=>{const V=P.vehicle||lastV;if(!V)return;V.fuel=100;V.heat=0;const fresh=makeVehicle(V.type,V.C.pdesc==='rust'?{rusty:true}:{color:V.C.pdesc});
    for(const[n,s]of Object.entries(V.C.slots)){if(!s.obj&&fresh.slots[n]&&fresh.slots[n].obj)attachTo(s,fresh.slots[n].obj);else if(s.type==='wheel'&&s.obj&&!s.obj.userData.tyreObj)putTyreOn(s.obj,makeTyre('road'));}
    V.engine=100;toast('🔧 Car fully fixed','good');};
  $('gHeal').onclick=()=>{P.health=100;P.hunger=100;P.warmth=100;P.stamina=100;toast('❤️ All better','good');};
  $('gClean').onclick=()=>{for(const l of loose)scene.remove(l.obj);loose.length=0;
    for(let i=animals.length-1;i>=0;i--)if(!animals[i].tag&&!animals[i].held){scene.remove(animals[i].obj);animals.splice(i,1);}
    for(const V of [...vehicles])if(V!==P.vehicle&&V!==lastV)removeVehicle(V);toast('Cleared');};
}
document.querySelectorAll('.sbTab').forEach(b=>b.addEventListener('click',()=>{SB.tab=b.dataset.tab;SB.sel=null;renderSandbox();}));
$('sbClose').addEventListener('click',closeSandbox);

// ---------------------------------------------------------------------- loop
let last=performance.now();
function step(dt){
  if(stationMsgT>0){stationMsgT-=dt;if(stationMsgT<=0)hidePrompt();}
  for(const V of [...vehicles])updateVehicle(V,dt);
  if(P.vehicle)updateDashboard(P.vehicle,dt);
  updateKo(dt);updatePerson(dt);updateProps(dt);updateAnimals(dt);updateWeather(dt);updateSurvival(dt);
  Net.update(dt);netSend(dt);
  manageChunks(false,P.vehicle?P.vehicle.z:P.z);
  saveT+=dt;if(saveT>20){saveT=0;saveGame();}
}
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(state==='play'){step(dt);if(state==='play')updateHud();}
  if(state!=='menu')render(state==='play'?dt:0);
}
requestAnimationFrame(loop);

// hook used by automated tests
window.__game={renderer,scene,camera,P,CAM,input,vehicles,loose,animals,GAME,startGame,continueGame,saveGame,loadSave,roadX,candidates,chooseTarget,eDown,eUp,useSelected,drop,openSandbox,closeSandbox,spawnSelected,SB,chunks,shoot,spawnChicken,
  get state(){return state;},forceStorm(){nextStorm=0;},step(n,dt){for(let i=0;i<n;i++){step(dt);render(dt);}updateHud();},tap(){eDown();eUp();},hold(){eDown();E.t=1;if(E.target&&E.target.hold){E.fired=true;E.target.hold.fn();}E.down=false;}};

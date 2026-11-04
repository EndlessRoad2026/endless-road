'use strict';
// ====================================================================== game: state, input, interactions, physics, cameras, HUD, sandbox menu
initMaterials();initCarMats();
Radio.onChange(drawLCD);
const $=id=>document.getElementById(id);

const person=makePerson();
const vehicles=[];       // drivable vehicles in the world
const loose=[];          // things lying in the world (dropped or spawned): {kind,obj,prop}
const P={vehicle:null,x:0,y:0,z:0,h:0,vy:0,health:100,hunger:100,warmth:100,stamina:100,staminaWait:0,hot:[null,null,null,null],sel:0,holding:null,phase:0,grounded:true,moveAmp:0,inside:null,cause:''};
const GAME={mode:'survival',hunger:true,infFuel:false};
const CAM={fp:false,yawOff:0,pitch:0,lastMouse:0};
let lastV=null;          // vehicle you last drove (dashboard/HUD/radio follow it)
let state='menu',setKey='desert',startZ=0,best=0,maxZ=0,menuOpen=false;
let storm=false,stormT=0,nextStorm=0,stormAmt=0,overheatToastT=0,coldToastT=0,hungryToastT=0,shake=0,stationMsgT=0;
const input={up:false,down:false,left:false,right:false,run:false,jump:false};
const E={down:false,t:0,fired:false,target:null};let promptAction=null;

function loadBest(k){try{return parseFloat(localStorage.getItem('endless-road-best-'+k))||0;}catch(e){return 0;}}
function saveBest(k,v){try{localStorage.setItem('endless-road-best-'+k,String(v));}catch(e){}}
function refreshMenuBests(){for(const k of Object.keys(SETTINGS)){const b=loadBest(k);$('best-'+k).textContent=b>0?'🏆 Best: '+b.toFixed(2)+' km':'';}}
refreshMenuBests();
function toast(msg,kind){const el=document.createElement('div');el.className='toast'+(kind?' '+kind:'');el.textContent=msg;$('toasts').appendChild(el);setTimeout(()=>el.remove(),2800);while($('toasts').children.length>3)$('toasts').firstChild.remove();}

// ---------------------------------------------------------------------- vehicles
function spawnVehicle(type,opts,x,z,h){
  const C=makeVehicle(type,opts);scene.add(C.group);
  const V={C,type,x,z,h,vx:0,vz:0,y:surfaceH(x,z),pitch:0,roll:0,fuel:opts.fuel??100,engine:opts.rusty?55:100,heat:0,heater:true,wheelSpin:0,steerVis:0,lastVf:0,cargo:null,sink:0,needle:{speed:0,rpm:0,fuel:0,temp:0}};
  vehicles.push(V);placeVehicle(V);return V;
}
function placeVehicle(V){const g=V.C.group;g.position.set(V.x,V.y-(V.sink||0),V.z);g.rotation.order='YXZ';g.rotation.set(V.pitch,V.h,V.roll);g.updateMatrixWorld(true);}
function removeVehicle(V){scene.remove(V.C.group);vehicles.splice(vehicles.indexOf(V),1);if(lastV===V)lastV=vehicles[0]||null;}
const _w=new THREE.Vector3();
function worldPoint(C,local){return C.group.localToWorld(_w.set(...local)).clone();}
function vSpeed(V){return Math.hypot(V.vx,V.vz);}
function nearestVehicle(maxD){let b=null,bd=maxD;for(const V of vehicles){const d=Math.hypot(V.x-P.x,V.z-P.z);if(d<bd){bd=d;b=V;}}return b;}

// ---------------------------------------------------------------------- start / end
function seatPerson(V){const s=V.C.spec.seat;V.C.group.add(person.group);person.group.position.set(s[0],s[1]-.92,s[2]);person.group.rotation.set(0,0,0);pose(person,'sit');}
function startGame(key,mode){
  setKey=key;S=SETTINGS[key];GAME.mode=mode||GAME.mode;
  SEED=(Math.random()*2**31)|0;ROFF=Math.random()*100;
  clearChunks();taken.clear();
  while(vehicles.length)removeVehicle(vehicles[0]);
  for(const l of loose)scene.remove(l.obj);loose.length=0;
  if(P.holding){person.hold.remove(P.holding.obj);P.holding=null;}
  setupWorldMaterials();
  skyU.top.value.set(S.skyTop);skyU.horizon.value.set(S.horizon);skyU.sunDir.value.set(...S.sunDir).normalize();skyU.sunCol.value.set(S.sunCol);skyU.haze.value=0;
  buildEnv();
  scene.fog.color.copy(lin(S.horizon));scene.fog.near=40;scene.fog.far=S.fogFar;
  hemi.color.copy(lin(S.hemi[0]));hemi.groundColor.copy(lin(S.hemi[1]));hemi.intensity=S.hemi[2];
  sun.color.copy(lin(S.sunCol));sun.intensity=S.sunI;
  pMat.color.copy(lin(S.weather==='sandstorm'?0xd9a25e:S.weather==='blizzard'?0xffffff:0xb8cfe6));
  pMat.size=S.weather==='rain'?.08:S.weather==='blizzard'?.16:.12;
  seedParticles();points.visible=false;
  const z=10,x=roadX(z);
  const colors=['white','red','blue','green','yellow'];
  const V=spawnVehicle('pickup',{color:PAINTS[colors[(Math.random()*colors.length)|0]]},x,z,Math.atan(roadSlope(z)));
  Object.assign(P,{vehicle:V,health:100,hunger:100,warmth:100,stamina:100,hot:[null,null,null,null],sel:0,holding:null,vy:0,inside:null,cause:'',farToast:false});
  if(GAME.mode==='sandbox'){P.hot=['beans','water',null,null];}
  lastV=V;seatPerson(V);
  startZ=z;maxZ=z;best=loadBest(key);
  storm=false;stormAmt=0;nextStorm=45+Math.random()*30;stormT=0;
  manageChunks(true,z);precompile();
  $('warmWrap').classList.toggle('hidden',S.hazard!=='cold');
  $('tHeat').classList.toggle('hidden',S.hazard!=='cold');
  $('sbBtn').classList.toggle('hidden',GAME.mode!=='sandbox');
  $('bestTxt').textContent=GAME.mode==='sandbox'?'Sandbox mode':(best>0?'Best '+best.toFixed(2)+' km':'');
  $('toasts').innerHTML='';
  ['menu','over','pause'].forEach(s=>$(s).classList.add('hidden'));
  $('hud').classList.remove('hidden');if(isTouch)$('touch').classList.remove('hidden');
  CAM.yawOff=0;CAM.pitch=0;
  const f={x:Math.sin(V.h),z:Math.cos(V.h)};camera.position.set(V.x-f.x*10,V.y+5,V.z-f.z*10);
  state='play';last=performance.now();
  toast(isTouch?'Tap E when stopped to get out':'Click the game to look around with the mouse · V switches view');
  setTimeout(()=>{if(state==='play')toast(GAME.mode==='sandbox'?'Press M for the sandbox menu':S.hazard==='heat'?'Ease off the gas if the engine gets hot!':S.hazard==='cold'?'Heater is ON (H). It uses fuel.':'Avoid the mud and fallen logs!');},3000);
}
function precompile(){
  const mats=[...Object.values(M),...Object.values(CARMAT).filter(m=>m&&m.isMaterial),...Object.values(CARMAT.gauges),...Object.values(paintCache),...Object.values(houseMats()),TERRAIN_MAT,ROAD_MAT];
  const g=new THREE.Group();mats.forEach((m,i)=>{const me=new THREE.Mesh(G.box,m);me.castShadow=true;me.position.set(P.x+(i%8),-200,P.z+(i>>3));g.add(me);});
  scene.add(g);try{renderer.compile(scene,camera);}catch(e){}scene.remove(g);
}
function endGame(why,title){
  if(state!=='play')return;state='over';exitLock();
  const km=progress(),isBest=GAME.mode==='survival'&&km>best+.005;if(isBest){best=km;saveBest(setKey,km);}
  $('overTitle').textContent=title;$('overWhy').textContent=why;$('overDist').textContent=km.toFixed(2)+' km';
  $('overBest').textContent=GAME.mode==='sandbox'?'Sandbox mode':isBest?'🏆 New best in '+S.name+'!':'Best in '+S.name+': '+best.toFixed(2)+' km';
  $('over').classList.remove('hidden');$('touch').classList.add('hidden');hidePrompt();refreshMenuBests();
}
function toMenu(){Radio.power(false);Radio.toggle(false);closeSandbox();exitLock();state='menu';['over','pause','hud','touch'].forEach(s=>$(s).classList.add('hidden'));$('menu').classList.remove('hidden');refreshMenuBests();}
function progress(){return Math.max(0,maxZ-startZ)/1000;}

// ---------------------------------------------------------------------- input
const keyMap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ShiftLeft:'run',ShiftRight:'run',Space:'jump'};
const isTouch=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window);
function locked(){return document.pointerLockElement===renderer.domElement;}
function exitLock(){try{if(locked())document.exitPointerLock();}catch(e){}}
renderer.domElement.addEventListener('click',()=>{if(state==='play'&&!menuOpen&&!isTouch){try{const p=renderer.domElement.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(e){}}});
document.addEventListener('mousemove',e=>{
  if(!locked()||state!=='play')return;
  const s=.0024;CAM.lastMouse=performance.now();
  if(P.vehicle){CAM.yawOff=clamp(CAM.yawOff-e.movementX*s,CAM.fp?-2.2:-Math.PI,CAM.fp?2.2:Math.PI);CAM.pitch=clamp(CAM.pitch-e.movementY*s,-1.1,.9);}
  else{P.h-=e.movementX*s;CAM.pitch=clamp(CAM.pitch-e.movementY*s,-1.3,1.2);}
});
document.addEventListener('wheel',e=>{if(state!=='play'||menuOpen)return;P.sel=(P.sel+(e.deltaY>0?1:3))%4;},{passive:true});
addEventListener('keydown',e=>{
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
function togglePause(){if(state==='play'){state='pause';exitLock();$('pause').classList.remove('hidden');Radio.suspend(true);}else if(state==='pause'){state='play';$('pause').classList.add('hidden');last=performance.now();Radio.suspend(false);}}
function bindHold(id,key){const el=$(id);
  const on=e=>{e.preventDefault();input[key]=true;el.classList.add('on');try{el.setPointerCapture(e.pointerId);}catch(_){}};
  const off=()=>{input[key]=false;el.classList.remove('on');};
  el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('lostpointercapture',off);}
bindHold('tL','left');bindHold('tR','right');bindHold('tGas','up');bindHold('tBrk','down');
$('tAct').addEventListener('pointerdown',e=>{e.preventDefault();if(state==='play')eDown();});
$('tAct').addEventListener('pointerup',e=>{e.preventDefault();if(state==='play')eUp();});
const tap=(id,f)=>$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(state==='play'||id==='tPause')f();});
tap('tHeat',toggleHeater);tap('tPause',togglePause);tap('tEat',useSelected);tap('tDrop',drop);tap('tView',()=>{CAM.fp=!CAM.fp;});
Radio.bindUI();
let chosenMode='survival';
document.querySelectorAll('.modeBtn').forEach(b=>b.addEventListener('click',()=>{chosenMode=b.dataset.mode;document.querySelectorAll('.modeBtn').forEach(x=>x.classList.toggle('sel',x===b));}));
document.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>{Radio.init();Radio.suspend(false);startGame(c.dataset.set,chosenMode);}));
$('retryBtn').onclick=()=>startGame(setKey);$('menuBtn').onclick=toMenu;$('resumeBtn').onclick=togglePause;$('quitBtn').onclick=toMenu;
$('sbBtn').addEventListener('click',()=>toggleSandbox());
document.querySelectorAll('.hslot').forEach((el,i)=>el.addEventListener('pointerdown',e=>{e.preventDefault();P.sel=i;}));

// ---------------------------------------------------------------------- holding things
function holdObj(kind,obj){
  P.holding={kind,obj};person.hold.add(obj);obj.position.set(0,0,0);obj.rotation.set(0,0,0);obj.scale.set(1,1,1);obj.visible=true;
  if(kind==='wheel'){obj.rotation.set(0,Math.PI/2,0);obj.position.set(0,0,.05);}
  else if(kind==='doorL'||kind==='doorR'){obj.rotation.set(0,Math.PI/2,0);obj.position.set(0,-.75,.05);}
  else if(kind==='hood'||kind==='trunk'||kind==='tailgate'){obj.rotation.set(-1.3,0,0);obj.position.set(0,.1,.15);}
  else if(kind==='jerry'){obj.position.set(0,-.45,0);}
  else if(kind==='toolbox'||kind==='battery'){obj.position.set(0,-.2,0);}
  else if(kind==='radiator'){obj.rotation.set(0,0,0);obj.position.set(0,0,.05);}
  else if(isProp(kind)){obj.position.set(0,-.55,.1);}
  obj.traverse(m=>{if(m.isMesh)m.castShadow=true;});
}
function releaseHeld(){const h=P.holding;if(!h)return null;person.hold.remove(h.obj);P.holding=null;return h;}
// the actual part object inside an item group (wheel/battery/radiator items wrap the real part)
function partFromItem(mesh){return mesh.userData.inner||mesh;}
function addHot(kind){const i=P.hot.indexOf(null);if(i<0)return false;P.hot[i]=kind;P.sel=i;return true;}

// ---------------------------------------------------------------------- interaction candidates
function candidates(){
  const out=[];const px=P.x,pz=P.z;
  const add=(x,y,z,r,label,fn,hold)=>{const d=Math.hypot(x-px,z-pz);if(d<r&&Math.abs(y-(P.y+1))<2.2)out.push({x,y,z,d,label,fn,hold});};
  const scanVehicle=(C,V)=>{
    const ha=hoodAccess(C);
    for(const s of Object.values(C.slots)){
      const wp=worldPoint(C,s.point);const nm=PART_NAMES[s.type];
      if(s.obj&&!P.holding){
        if(s.needsHood&&!ha)continue;
        const take=()=>{const o=s.obj;s.parent.remove(o);s.obj=null;s.open=false;s.openAmt=0;if(s.hinge)s.hinge.rotation[s.axis]=0;if(s.id)taken.add(s.id);holdObj(s.type,o);toast(`You took off the ${nm}`);};
        if(s.hinge)add(wp.x,wp.y,wp.z,1.3,`${s.open?'Close':'Open'} the ${nm}`,()=>{s.open=!s.open;},{label:'take it off',fn:take});
        else add(wp.x,wp.y,wp.z,1.25,`Take off the ${nm}`,take);
      }
      if(!s.obj&&P.holding&&slotTypeFits(s.type,P.holding.kind)&&(!s.needsHood||ha)){
        add(wp.x,wp.y,wp.z,1.45,`Put on the ${nm}`,()=>{const h=releaseHeld();s.obj=h.obj;attachHome(h.obj,s.parent);s.open=false;s.openAmt=0;toast(`🔧 ${nm[0].toUpperCase()+nm.slice(1)} fitted`,'good');});
      }
    }
    if(V){
      for(const gp of C.spec.getIn){const wp=worldPoint(C,gp);add(wp.x,wp.y,wp.z,1.3,`Get in the ${C.spec.name.toLowerCase()}`,()=>enterVehicle(V));}
      if(P.holding&&P.holding.kind==='jerry'){const fn=()=>{releaseHeld();V.fuel=Math.min(100,V.fuel+35);toast('⛽ Poured in the fuel (+35)','good');};
        for(const sx of[1.1,-1.1]){const wp=worldPoint(C,[sx,.9,-1.6]);add(wp.x,wp.y,wp.z,1.7,'Pour fuel into the tank',fn);}}
      if(P.holding&&P.holding.kind==='toolbox'){const wp=worldPoint(C,[0,1,V.type==='buggy'?-2.3:2.4]);
        add(wp.x,wp.y,wp.z,1.9,'Fix the engine',()=>{releaseHeld();V.engine=Math.min(100,V.engine+40);V.brokeToast=false;toast('🔧 Engine repaired (+40)','good');});}
    }
  };
  for(const V of vehicles)if(Math.hypot(V.x-px,V.z-pz)<7)scanVehicle(V.C,V);
  nearChunks(pz,ch=>{
    for(const C of ch.wrecks)if(Math.hypot(C.group.position.x-px,C.group.position.z-pz)<7)scanVehicle(C,null);
    for(const d of ch.doors){const dx=d.x,dz=d.z;add(dx,d.y+1,dz,2.2,d.open?'Close the door':'Open the door',()=>{d.open=!d.open;});}
    for(const it of ch.items){if(it.taken)continue;
      const pick=()=>{it.taken=true;taken.add(it.id);it.mesh.parent.remove(it.mesh);};
      if(isSmall(it.kind))add(it.x,it.y,it.z,1.5,`Pick up ${itemName(it.kind)}`,()=>{if(!addHot(it.kind)){toast('Your hotbar is full','warn');return;}pick();toast(`${itemEm(it.kind)} Got ${itemName(it.kind)}${isFood(it.kind)?' (F to eat)':''}`,'good');});
      else if(!P.holding)add(it.x,it.y,it.z,1.5,`Pick up the ${itemName(it.kind)}`,()=>{pick();holdObj(it.kind,partFromItem(it.mesh));toast(`You picked up the ${itemName(it.kind)}`);});
    }
  });
  for(const l of loose){const o=l.obj.position;
    if(isSmall(l.kind))add(o.x,o.y,o.z,1.5,`Pick up ${itemName(l.kind)}`,()=>{if(!addHot(l.kind)){toast('Your hotbar is full','warn');return;}loose.splice(loose.indexOf(l),1);scene.remove(l.obj);});
    else if(!P.holding)add(o.x,o.y,o.z,1.6,`Pick up the ${itemName(l.kind)}`,()=>{loose.splice(loose.indexOf(l),1);scene.remove(l.obj);holdObj(l.kind,partFromItem(l.obj));});
  }
  return out;
}
function chooseTarget(c){
  if(!c.length)return null;
  if(CAM.fp||locked()){
    const eye=new THREE.Vector3(P.x,P.y+1.62,P.z),dir=lookDir();let best=null,ba=1e9;
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
  if(V.cargo){const c=V.cargo;V.cargo=null;V.C.group.remove(c.obj);holdObj(c.kind,c.obj);toast(`You grabbed the ${itemName(c.kind)} from the ${V.type==='pickup'?'back':'roof'}`);}
}
function enterVehicle(V){
  if(P.holding){
    if(V.cargo){toast('There is already something loaded. Drop what you are holding first (G)','warn');return;}
    const h=releaseHeld();V.cargo=h;V.C.group.add(h.obj);
    const spot=V.type==='pickup'?[0,.75,-1.6]:V.type==='buggy'?[0,.85,-1.2]:[0,1.62,-.2];
    h.obj.position.set(...spot);h.obj.rotation.set(0,0,0);
    if(h.kind==='wheel'){h.obj.rotation.set(0,0,Math.PI/2);h.obj.position.y+=.05;}
    if(h.kind.startsWith('door')){h.obj.rotation.set(0,0,Math.PI/2);h.obj.position.x+=.45;h.obj.position.y-=.07;}
    toast(`Loaded the ${itemName(h.kind)} ${V.type==='pickup'?'in the back':'on the roof'}`);
  }
  P.vehicle=V;lastV=V;scene.remove(person.group);seatPerson(V);CAM.yawOff=0;
}
function useSelected(){
  const k=P.hot[P.sel];
  if(!k){const f=P.hot.findIndex(x=>x&&isFood(x));if(f<0){toast('Nothing in this hotbar slot');return;}P.sel=f;return useSelected();}
  if(isFood(k)){if(P.hunger>=99){toast('You are not hungry');return;}P.hot[P.sel]=null;P.hunger=Math.min(100,P.hunger+FOOD[k].val);toast(`${FOOD[k].em} Ate ${FOOD[k].name.toLowerCase()} (+${FOOD[k].val})`,'good');return;}
  if(isCD(k)){const near=P.vehicle||nearestVehicle(4);if(!near){toast('Take the CD to a car to play it');return;}
    P.hot[P.sel]=null;Radio.addCD(k,true);toast(`💿 Playing "${CD_BY_ID[k].name}"`,'good');}
}
function placeOnGround(obj,kind,x,z){
  const y=floorAt(x,z);scene.add(obj);obj.position.set(x,y,z);obj.rotation.set(0,P.h,0);
  if(kind==='wheel'){obj.rotation.set(0,P.h,Math.PI/2);obj.position.y=y+.36;}
  else if(kind.startsWith('door')){obj.rotation.set(0,P.h+Math.PI/2,Math.PI/2);obj.position.y=y+.05;}
  else if(kind==='hood'||kind==='trunk'||kind==='tailgate'){obj.position.y=y+.05;}
  else if(kind==='battery'){obj.position.y=y+.1;}
  else if(kind==='radiator'){obj.position.y=y+.23;}
}
function drop(){
  if(P.vehicle)return;
  const f={x:Math.sin(P.h),z:Math.cos(P.h)},x=P.x+f.x*1.1,z=P.z+f.z*1.1;
  if(P.holding){const h=releaseHeld();placeOnGround(h.obj,h.kind,x,z);loose.push({kind:h.kind,obj:h.obj,prop:isProp(h.kind)});return;}
  const k=P.hot[P.sel];if(!k)return;P.hot[P.sel]=null;
  const m=itemMesh(k);scene.add(m);m.position.set(x,floorAt(x,z),z);loose.push({kind:k,obj:m});
}

// ---------------------------------------------------------------------- physics helpers
function findPatch(x,z){let hit=null;nearChunks(z,ch=>{for(const p of ch.patches)if(z>p.z0&&z<p.z1&&Math.abs(x-(roadX(z)+p.off))<p.w/2)hit=p;});return hit;}
function houseAt(x,z,pad=0){let hit=null;nearChunks(z,ch=>{for(const h of ch.houses)if(x>h.x0-pad&&x<h.x1+pad&&z>h.z0-pad&&z<h.z1+pad)hit=h;});return hit;}
function floorAt(x,z){const h=houseAt(x,z,.2);return h?h.fy:surfaceH(x,z);}
function pushCircle(o,r,selfV){
  let res=null;
  const circ=(cx,cz,cr,soft)=>{const dx=o.x-cx,dz=o.z-cz,dd=Math.hypot(dx,dz),min=cr+r;
    if(dd<min&&dd>1e-4){if(soft){res={soft};return;}const nx=dx/dd,nz=dz/dd;o.x+=nx*(min-dd);o.z+=nz*(min-dd);res={nx,nz};}};
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
  for(const l of loose)if(l.prop){const p=l.obj.position;circ(p.x,p.z,.4);}
  for(const V of vehicles){if(V===selfV)continue;const f={x:Math.sin(V.h),z:Math.cos(V.h)};for(const off of[-1.3,0,1.3])circ(V.x+f.x*off,V.z+f.z*off,.95);}
  return res;
}

// ---------------------------------------------------------------------- vehicle physics
function updateVehicle(V,dt){
  const drive=P.vehicle===V,C=V.C,sp=C.spec;
  const throttle=drive&&input.up?1:0,brake=drive&&input.down?1:0,steer=drive?(input.left?1:0)-(input.right?1:0):0,hand=drive&&input.jump;
  const f={x:Math.sin(V.h),z:Math.cos(V.h)},r={x:Math.cos(V.h),z:-Math.sin(V.h)};
  let vf=V.vx*f.x+V.vz*f.z,vr=V.vx*r.x+V.vz*r.z;
  // hinged parts swing open/closed
  for(const s of Object.values(C.slots))if(s.hinge){s.openAmt+=((s.open?1:0)-s.openAmt)*Math.min(1,dt*6);s.hinge.rotation[s.axis]=s.angle*s.openAmt;}
  if(!drive&&Math.abs(vf)<.02&&Math.abs(vr)<.02&&!V.dirty){V.vx=V.vz=0;V.heat=Math.max(0,V.heat-6*dt);vehicleVisual(V,0,0,0,dt);return;}
  V.dirty=false;
  const ms=missing(C);
  const onRoad=Math.abs(V.x-roadX(V.z))<5.6;
  let grip=onRoad?S.grip:S.offGrip*sp.offGrip,maxS=(onRoad?S.maxSpeed:S.offMax*sp.offMax)*sp.maxS,drag=onRoad?.05:S.offDrag*sp.offDrag;
  const patch=findPatch(V.x,V.z);
  if(patch){if(S.patch==='ice')grip=.55;else if(S.patch==='mud'){maxS=Math.min(maxS,(storm?7:11)*(V.type==='buggy'?1.6:1));drag+=storm?2.2:1.4;}else{maxS=Math.min(maxS,24);drag+=.5;}}
  if(stormAmt>.5){if(S.weather==='rain'){grip*=.6;if(!onRoad){maxS*=.75;drag+=.6;}}if(S.weather==='sandstorm')maxS*=.85;if(S.weather==='blizzard')grip*=.8;}
  if(ms.wheels){maxS*=Math.max(.08,1-.38*ms.wheels);drag+=ms.wheels*1.2;grip*=Math.max(.3,1-.2*ms.wheels);}
  const canDrive=(V.fuel>0||GAME.infFuel)&&V.engine>0&&ms.wheels<3&&!ms.battery;
  if(drive&&throttle&&ms.battery&&!V.battToast){V.battToast=true;toast('🔋 No battery! The engine won\'t start','warn');}
  if(!ms.battery)V.battToast=false;
  const power=(.45+.55*(V.engine/100))*(1+.04*ms.panels)*(sp.accel/13);
  if(throttle&&canDrive){if(vf<maxS)vf+=(vf<0?24:13)*power*dt;}
  if(brake){if(vf>.5)vf-=26*dt;else if(canDrive&&vf>-9)vf-=8*dt;}
  if(hand)vf-=Math.sign(vf)*Math.min(Math.abs(vf),18*dt);
  if(!throttle&&!brake&&vf<0)vf+=Math.min(-vf,4*dt);
  if(!drive)vf-=Math.sign(vf)*Math.min(Math.abs(vf),8*dt);
  if(vf>maxS)vf-=(vf-maxS)*1.6*dt;
  vf-=vf*drag*dt*.3;
  if(!throttle)vf-=Math.sign(vf)*Math.min(Math.abs(vf),1.0*dt);
  const hF=surfaceH(V.x+f.x*1.8,V.z+f.z*1.8),hB=surfaceH(V.x-f.x*1.8,V.z-f.z*1.8);const slope=(hF-hB)/3.6;
  vf-=9.8*slope*.75*dt*(drive||Math.abs(vf)>.3?1:0);
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
    if(res.soft){const c=res.soft;c.dead=true;if(c.mesh){c.mesh.scale.y*=.35;c.mesh.scale.x*=1.3;}V.vx*=.45;V.vz*=.45;V.engine-=3;if(drive){toast('Snowdrift! Slowed you right down','warn');shake=.3;}continue;}
    V.x+=o.x-ox;V.z+=o.z-oz;
    const vn=-(V.vx*res.nx+V.vz*res.nz);
    if(vn>0){V.vx+=res.nx*vn*1.4;V.vz+=res.nz*vn*1.4;V.vx*=.6;V.vz*=.6;
      if(vn>3){const dmg=Math.round(vn*1.15*(1+.15*ms.panels));V.engine-=dmg;if(drive){toast('💥 Crash! Engine −'+dmg,'warn');flash();shake=Math.min(1,vn/20);
        if(dmg>15){P.health-=dmg*.35*(1+.3*ms.doors);P.cause='crash';}}}}
  }
  if(drive)nearChunks(V.z,ch=>{
    for(const p of ch.pickups){if(p.taken)continue;
      if(Math.hypot(V.x-p.x,V.z-p.z)<2.6){p.taken=true;taken.add(p.id);p.mesh.visible=false;
        if(p.type==='fuel'){V.fuel=Math.min(100,V.fuel+18);toast('⛽ +18 fuel','good');}else{V.engine=Math.min(100,V.engine+25);V.brokeToast=false;toast('🔧 Engine repaired +25','good');}}}
    if(ch.station){const s=ch.station,d=Math.hypot(V.x-s.x,V.z-s.z);
      if(d<12){if(vSpeed(V)<3){V.fuel=Math.min(100,V.fuel+30*dt);V.engine=Math.min(100,V.engine+12*dt);V.heat=Math.max(0,V.heat-30*dt);P.warmth=Math.min(100,P.warmth+25*dt);showPrompt('⛽ Filling up… '+Math.round(V.fuel)+'%');}
        else showPrompt('Stop here to fill up and fix your car');stationMsgT=.2;}}
  });
  const heaterOn=S.hazard==='cold'&&V.heater&&drive;
  if(drive&&!GAME.infFuel)V.fuel-=(.04+throttle*.62*(onRoad?1:1.25)+(heaterOn?.28:0))*dt;
  V.fuel=Math.max(0,V.fuel);
  const ratio=clamp(vf/S.maxSpeed,0,1.2),hot=S.hazard==='heat'||ms.radiator;
  if(hot){const mult=(ms.radiator?3:1)*(ms.hood?.55:1);V.heat+=throttle&&canDrive?(.4+ratio*3.6+(stormAmt>.5&&S.hazard==='heat'?.8:0))*mult*dt:-8*dt;}
  else V.heat-=8*dt;
  V.heat=clamp(V.heat,0,100);
  if(V.heat>=100){V.engine-=5*dt;if(drive){overheatToastT-=dt;if(overheatToastT<=0){toast(ms.radiator?'🔥 No radiator! The engine is cooking':'🔥 Overheating! Let go of the gas','warn');overheatToastT=3;}}}
  if(V.engine<=0){V.engine=0;if(drive&&!V.brokeToast){V.brokeToast=true;toast('💀 Engine broke down! Find a repair kit 🧰','warn');}}
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
  if(!sl.wheelFL.obj){tiltP+=.06;tiltR-=.07;sink+=.1;}if(!sl.wheelFR.obj){tiltP+=.06;tiltR+=.07;sink+=.1;}
  if(!sl.wheelRL.obj){tiltP-=.06;tiltR-=.07;sink+=.1;}if(!sl.wheelRR.obj){tiltP-=.06;tiltR+=.07;sink+=.1;}
  V.sink=Math.min(.28,sink);
  const k=Math.min(1,dt*10);
  V.pitch+=(-Math.atan(slope)+tiltP-V.pitch)*k;V.roll+=(Math.atan((hL-hR)/2)+tiltR-V.roll)*k;
  V.wheelSpin+=vf*dt/.36;V.steerVis+=(steer*.45-V.steerVis)*k;V.lastVf=vf;V.braking=!!brake&&vf>.5;V.running=!!running||(P.vehicle===V&&V.engine>0&&!missing(C).battery&&(V.fuel>0||GAME.infFuel));
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
  set(L.engine,V.engine<30||V.heat>85,CARMAT.lightRed);set(L.fuel,V.fuel<15&&!GAME.infFuel,CARMAT.lightAmber);set(L.battery,ms.battery,CARMAT.lightRed);set(L.heater,S.hazard==='cold'&&V.heater,CARMAT.lightBlue);
}

// ---------------------------------------------------------------------- person
function updatePerson(dt){
  if(P.vehicle)return;
  const lk=locked();
  const turn=(input.left?1:0)-(input.right?1:0);
  if(!lk)P.h+=turn*2.7*dt;
  const fw=(input.up?1:0)-(input.down?.6:0),strafe=lk?turn:0;
  const wantRun=input.run&&fw>0&&!P.holding&&P.stamina>5;
  const spd=(wantRun?6.2:(P.holding?2.6:3.3));
  const f={x:Math.sin(P.h),z:Math.cos(P.h)},r={x:Math.cos(P.h),z:-Math.sin(P.h)};
  let mx=f.x*fw+r.x*strafe*.8,mz=f.z*fw+r.z*strafe*.8;const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  P.x+=mx*spd*dt;P.z+=mz*spd*dt;
  const moving=ml>.05;
  if(wantRun&&moving){P.stamina=Math.max(0,P.stamina-18*dt);P.staminaWait=.8;}else{P.staminaWait-=dt;if(P.staminaWait<=0)P.stamina=Math.min(100,P.stamina+12*dt);}
  const o={x:P.x,z:P.z};pushCircle(o,.32,null);P.x=o.x;P.z=o.z;
  const gy=floorAt(P.x,P.z);
  if(input.jump&&P.grounded&&P.stamina>8){P.vy=5.5;P.grounded=false;P.stamina-=10;P.staminaWait=.8;}
  P.vy-=18*dt;P.y+=P.vy*dt;
  if(P.y<=gy){P.y=gy;P.vy=0;P.grounded=true;}else if(P.y-gy>.05)P.grounded=false;
  if(P.grounded&&P.y<gy+.3)P.y=gy;
  P.phase+=(moving?spd:0)*dt*2.4;
  P.moveAmp+=((moving?(wantRun?.85:.55):0)-P.moveAmp)*Math.min(1,dt*8);
  person.group.position.set(P.x,P.y,P.z);person.group.rotation.set(0,P.h,0);
  pose(person,P.holding?'carry':'walk',P.phase,P.moveAmp);
  P.inside=houseAt(P.x,P.z,-.1);
  const c=candidates();promptAction=chooseTarget(c);
  if(E.down&&E.target&&E.target.hold&&!E.fired){E.t+=dt;if(E.t>.55){E.fired=true;E.target.hold.fn();}}
  if(Math.hypot(P.x-(lastV?lastV.x:P.x),P.z-(lastV?lastV.z:P.z))>420&&!P.farToast){P.farToast=true;toast('You are very far from your car!','warn');}
}

// ---------------------------------------------------------------------- survival & weather
function updateSurvival(dt){
  const running=!P.vehicle&&input.run&&input.up;
  if(GAME.hunger){P.hunger-=(P.vehicle?.22:.3)*(running?2:1)*dt;if(P.hunger<=0){P.hunger=0;P.health-=1.3*dt;P.cause='hunger';}
    if(P.hunger<20){hungryToastT-=dt;if(hungryToastT<=0){toast(P.hot.some(isFood)?'😫 You are starving! Press F to eat':'😫 You are starving! Search abandoned houses for food','warn');hungryToastT=6;}}}
  else P.hunger=100;
  if(S.hazard==='cold'){
    const V=P.vehicle;let d;
    if(V){const ms=missing(V.C);d=-(stormAmt>.5?2.2:1.0)*(1+.45*ms.doors)*(V.type==='buggy'?1.6:1);if(V.heater&&(V.fuel>0||GAME.infFuel)&&V.engine>0&&V.type!=='buggy')d+=3.0*(1-.3*ms.doors);}
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

// ---------------------------------------------------------------------- render
const camLook=new THREE.Vector3();let hiddenRoof=null;const UP=new THREE.Vector3(0,1,0);
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
    const f={x:Math.sin(P.h),z:Math.cos(P.h)};
    if(CAM.fp){
      const eye=new THREE.Vector3(P.x,P.y+1.62+Math.sin(P.phase*2)*.025*P.moveAmp,P.z);camera.position.copy(eye);camera.lookAt(eye.clone().add(lookDir()));camLook.copy(eye).add(lookDir());
      setBodyVisible(false,false);
    } else if(P.inside){want=new THREE.Vector3(P.x-f.x*2.2,P.inside.fy+6.5,P.z-f.z*2.2);look=new THREE.Vector3(P.x+f.x*.6,P.y+.6,P.z+f.z*.6);setBodyVisible(true,true);}
    else{const el=clamp(.32-CAM.pitch*.8,-.25,1.25);want=new THREE.Vector3(P.x-f.x*4.2*Math.cos(el),P.y+1.5+4.2*Math.sin(el),P.z-f.z*4.2*Math.cos(el));look=new THREE.Vector3(P.x+f.x*1.2,P.y+1.4,P.z+f.z*1.2);setBodyVisible(true,true);}
  }
  if(want){
    camera.position.lerp(want,1-Math.exp(-dt*(V?4:7)));
    camLook.lerp(look,1-Math.exp(-dt*9));
    const gh=groundH(camera.position.x,camera.position.z)+(V?1.4:.6);if(camera.position.y<gh&&!P.inside)camera.position.y=gh;
    if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*2);}
    camera.lookAt(camLook);
  }
  const roofNow=(V||CAM.fp)?null:(P.inside?P.inside.roof:null);
  if(hiddenRoof!==roofNow){if(hiddenRoof)hiddenRoof.visible=true;if(roofNow)roofNow.visible=false;hiddenRoof=roofNow;}
  // doors swing
  chunks.forEach(ch=>{for(const d of ch.doors){d.amt+=((d.open?1:0)-d.amt)*Math.min(1,dt*5);d.hinge.rotation.y=d.sign*d.amt*1.45;}});
  // radio: muffled when you are outside the car
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
  if(V){const ms=missing(V.C);
    $('carName').textContent=(P.vehicle?'🚗 ':'🚗 Nearby ')+V.C.spec.name;
    bar('fuelBar',V.fuel);$('fuelTxt').textContent=GAME.infFuel?'∞':Math.round(V.fuel)+'%';
    bar('engBar',V.engine);$('engTxt').textContent=Math.round(V.engine)+'%';
    $('engBar').style.background=V.engine>50?'#52c46b':V.engine>25?'#f9c74f':'#e63946';
    const showHeat=S.hazard==='heat'||ms.radiator;$('heatWrap').classList.toggle('hidden',!showHeat);
    if(showHeat){bar('heatBar',V.heat);$('heatTxt').textContent=V.heat>85?'HOT!':Math.round(V.heat)+'%';}
    const miss=ms.list.map(n=>PART_NAMES[V.C.slots[n].type]);const uniq=[...new Set(miss)];
    $('partsTxt').textContent=(uniq.length?'Missing: '+uniq.map(m=>m+(miss.filter(x=>x===m).length>1?' ×'+miss.filter(x=>x===m).length:'')).join(', '):'All parts fitted ✓')+(V.cargo?' · Loaded: '+itemName(V.cargo.kind):'');
    $('spd').textContent=Math.round(Math.abs(V.lastVf||0)*3.6);
  }
  $('speedo').classList.toggle('hidden',!P.vehicle||CAM.fp);
  bar('hpBar',P.health);bar('stBar',P.stamina);bar('hunBar',P.hunger);
  if(S.hazard==='cold')bar('warmBar',P.warmth);
  $('hunWrap').classList.toggle('dim',!GAME.hunger);
  document.querySelectorAll('.hslot').forEach((el,i)=>{const k=P.hot[i];el.classList.toggle('sel',i===P.sel);el.querySelector('.em').textContent=k?itemEm(k):'';el.title=k?itemName(k):'';});
  $('holdTxt').textContent=P.holding?'✋ Holding: '+itemName(P.holding.kind)+'  (G to drop)':'';
  $('holdTxt').classList.toggle('hidden',!P.holding);
  $('dist').textContent=progress().toFixed(2)+' km';
  $('weather').textContent=stormAmt>.5?S.stormName:'☀️ Clear';
  $('cross').classList.toggle('hidden',!(CAM.fp||(locked()&&!P.vehicle)));
  // prompt
  if(stationMsgT>0)return;
  if(P.vehicle){if(vSpeed(P.vehicle)<1.5)showPrompt('<kbd>E</kbd> Get out',true);else hidePrompt();return;}
  const a=promptAction;
  if(a){let h=`<kbd>E</kbd> ${a.label}`;if(a.hold)h+=` <span class="hold">· hold <kbd>E</kbd> ${a.hold.label}</span>`;
    if(E.down&&E.target===a&&a.hold&&!E.fired)h+=`<div class="hbar"><i style="width:${Math.min(100,E.t/.55*100)}%"></i></div>`;showPrompt(h,true);}
  else hidePrompt();
}

// ---------------------------------------------------------------------- sandbox menu
const SB={tab:'vehicles',sel:null,color:'blue',rusty:false,fuel:100,thumbs:{}};
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
    const box=new THREE.Box3().setFromObject(obj),c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()).length();
    const cam=new THREE.PerspectiveCamera(32,160/110,.01,100);cam.position.copy(c).add(new THREE.Vector3(1.1,.6,-.7).normalize().multiplyScalar(s*1.35));cam.lookAt(c);
    thumbR.render(sc,cam);SB.thumbs[key]=thumbR.domElement.toDataURL();
  }catch(e){SB.thumbs[key]='';}
  return SB.thumbs[key];
}
function renderSandbox(){
  document.querySelectorAll('.sbTab').forEach(b=>b.classList.toggle('sel',b.dataset.tab===SB.tab));
  const grid=$('sbGrid'),side=$('sbSide');
  let entries=[];
  if(SB.tab==='vehicles')entries=Object.keys(VTYPES).map(k=>({key:'v:'+k,label:VTYPES[k].name,img:()=>thumb('v:'+k+SB.color+SB.rusty,()=>makeVehicle(k,{color:PAINTS[SB.color],rusty:SB.rusty}).group)}));
  else if(SB.tab==='items')entries=ITEM_KINDS.map(k=>({key:'i:'+k,label:isCD(k)?'CD: '+CD_BY_ID[k].name:(FOOD[k]?FOOD[k].name:PART_NAMES[k][0].toUpperCase()+PART_NAMES[k].slice(1)),img:()=>thumb('i:'+k,()=>itemMesh(k))}));
  if(SB.tab==='game'){grid.innerHTML='';side.innerHTML=gameTabHtml();bindGameTab();return;}
  grid.innerHTML=entries.map(e=>`<button class="sbItem${SB.sel===e.key?' sel':''}" data-key="${e.key}"><img alt="" src="${e.img()}"><span>${e.label}</span></button>`).join('');
  grid.querySelectorAll('.sbItem').forEach(b=>b.onclick=()=>{SB.sel=b.dataset.key;renderSandbox();});
  const sel=entries.find(e=>e.key===SB.sel)||entries[0];if(!SB.sel&&sel)SB.sel=sel.key;
  let h=`<div class="sbPrev"><img alt="" src="${sel?sel.img():''}"><b>${sel?sel.label:''}</b></div>`;
  if(SB.tab==='vehicles'){
    h+=`<div class="sbOpt"><label>Colour</label><div class="sw">${Object.entries(PAINTS).map(([n,c])=>`<i data-c="${n}" class="${SB.color===n&&!SB.rusty?'sel':''}" style="background:#${new THREE.Color(c).getHexString()}"></i>`).join('')}</div></div>`;
    h+=`<div class="sbOpt"><label>Condition</label><div class="seg"><button data-r="0" class="${!SB.rusty?'sel':''}">Shiny</button><button data-r="1" class="${SB.rusty?'sel':''}">Rusty</button></div></div>`;
    h+=`<div class="sbOpt"><label>Fuel</label><div class="seg">${[100,50,10].map(f=>`<button data-f="${f}" class="${SB.fuel===f?'sel':''}">${f===100?'Full':f===50?'Half':'Empty'}</button>`).join('')}</div></div>`;
  }
  h+=`<button class="btn spawn" id="sbSpawn">Spawn</button>`;
  side.innerHTML=h;
  side.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{SB.color=b.dataset.c;SB.rusty=false;renderSandbox();});
  side.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{SB.rusty=b.dataset.r==='1';renderSandbox();});
  side.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{SB.fuel=+b.dataset.f;renderSandbox();});
  $('sbSpawn').onclick=()=>spawnSelected();
}
function spawnSelected(){
  if(!SB.sel)return;const[t,k]=SB.sel.split(':');
  const h=P.vehicle?P.vehicle.h:P.h,bx=P.vehicle?P.vehicle.x:P.x,bz=P.vehicle?P.vehicle.z:P.z,f={x:Math.sin(h),z:Math.cos(h)};
  if(t==='v'){const x=bx+f.x*7,z=bz+f.z*7;spawnVehicle(k,{color:PAINTS[SB.color],rusty:SB.rusty,fuel:SB.fuel},x,z,h);toast(`Spawned a ${VTYPES[k].name.toLowerCase()}`,'good');}
  else{const x=bx+f.x*2.2,z=bz+f.z*2.2;const m=itemMesh(k);
    if(isSmall(k)){scene.add(m);m.position.set(x,floorAt(x,z),z);loose.push({kind:k,obj:m});}
    else{placeOnGround(partFromItem(m),k,x,z);loose.push({kind:k,obj:partFromItem(m),prop:isProp(k)});}
    toast(`Spawned ${itemName(k)}`,'good');}
}
function gameTabHtml(){
  const tg=(id,on,label,desc)=>`<div class="sbRow"><div><b>${label}</b><small>${desc}</small></div><button class="tgl${on?' on':''}" id="${id}">${on?'ON':'OFF'}</button></div>`;
  return `<div class="sbList">${tg('gHunger',GAME.hunger,'Hunger','You need to eat to stay alive')}${tg('gFuel',GAME.infFuel,'Infinite fuel','Never run out of fuel')}
  <div class="sbRow"><div><b>Weather</b><small>Change it right now</small></div><div class="seg"><button id="gClear">☀️ Clear</button><button id="gStorm">${S.stormName}</button></div></div>
  <div class="sbRow"><div><b>Fix my car</b><small>Full fuel, engine and every part back on</small></div><button class="btn" id="gFix">Fix</button></div>
  <div class="sbRow"><div><b>Heal me</b><small>Full health, food and warmth</small></div><button class="btn" id="gHeal">Heal</button></div>
  <div class="sbRow"><div><b>Clear spawned stuff</b><small>Removes items you spawned or dropped</small></div><button class="btn alt" id="gClean">Clear</button></div></div>`;
}
function bindGameTab(){
  $('gHunger').onclick=()=>{GAME.hunger=!GAME.hunger;renderSandbox();};
  $('gFuel').onclick=()=>{GAME.infFuel=!GAME.infFuel;renderSandbox();};
  $('gClear').onclick=()=>{storm=false;stormAmt=0;nextStorm=999;};
  $('gStorm').onclick=()=>{storm=true;stormT=40;};
  $('gFix').onclick=()=>{const V=P.vehicle||lastV;if(!V)return;V.fuel=100;V.engine=100;V.heat=0;const fresh=makeVehicle(V.type,{color:0xffffff});
    for(const[n,s]of Object.entries(V.C.slots))if(!s.obj){const o=fresh.slots[n].obj;if(!o)continue;o.traverse(m=>{if(m.isMesh&&m.material===fresh.paint)m.material=V.C.paint;});s.obj=o;attachHome(o,s.parent);}
    toast('🔧 Car fully fixed','good');};
  $('gHeal').onclick=()=>{P.health=100;P.hunger=100;P.warmth=100;P.stamina=100;toast('❤️ All better','good');};
  $('gClean').onclick=()=>{for(const l of loose)scene.remove(l.obj);loose.length=0;toast('Cleared');};
}
document.querySelectorAll('.sbTab').forEach(b=>b.addEventListener('click',()=>{SB.tab=b.dataset.tab;SB.sel=null;renderSandbox();}));
$('sbClose').addEventListener('click',closeSandbox);

// ---------------------------------------------------------------------- loop
let last=performance.now();
function step(dt){
  if(stationMsgT>0){stationMsgT-=dt;if(stationMsgT<=0)hidePrompt();}
  for(const V of [...vehicles])updateVehicle(V,dt);
  if(P.vehicle)updateDashboard(P.vehicle,dt);
  updatePerson(dt);updateWeather(dt);updateSurvival(dt);
  manageChunks(false,P.vehicle?P.vehicle.z:P.z);
}
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,(now-last)/1000);last=now;
  if(state==='play'){step(dt);if(state==='play')updateHud();}
  if(state!=='menu')render(state==='play'?dt:0);
}
requestAnimationFrame(loop);

// hook used by automated tests
window.__game={renderer,scene,camera,P,CAM,input,vehicles,GAME,startGame,roadX,candidates,chooseTarget,eDown,eUp,useSelected,drop,openSandbox,closeSandbox,spawnSelected,SB,chunks,
  get state(){return state;},forceStorm(){nextStorm=0;},step(n,dt){for(let i=0;i<n;i++){step(dt);render(dt);}updateHud();},tap(){eDown();eUp();},hold(){eDown();E.t=1;if(E.target&&E.target.hold){E.fired=true;E.target.hold.fn();}E.down=false;}};

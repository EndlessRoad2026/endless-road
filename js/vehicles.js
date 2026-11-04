'use strict';
// ====================================================================== vehicles (sedan, pickup, buggy), engine bay, dashboard, person

const VTYPES={
  sedan: {name:'Sedan', maxS:1,   accel:13,  offMax:1,   offGrip:1,   offDrag:1,   seat:[-.38,.6,-.12], eye:[-.38,1.3,-.05], getIn:[[1.2,.85,-.45],[-1.2,.85,-.45]]},
  pickup:{name:'Pickup',maxS:.95, accel:12.5,offMax:1.15,offGrip:1.1, offDrag:.85, seat:[-.38,.6,-.12], eye:[-.38,1.3,-.05], getIn:[[1.2,.85,-.45],[-1.2,.85,-.45]]},
  buggy: {name:'Buggy', maxS:.92, accel:15,  offMax:1.7, offGrip:1.5, offDrag:.45, seat:[-.36,.58,-.2], eye:[-.36,1.3,-.18], getIn:[[1.15,.8,-.2],[-1.15,.8,-.2]]}
};
const PAINTS={blue:0x2a6fdb,green:0x2e8b57,red:0xc0392b,yellow:0xe0b030,white:0xeeeeea,black:0x1d1f22,orange:0xe2692b,teal:0x1f9c9a};

// ---------------------------------------------------------------------- shared car geometry (built once)
const CG={};
(function buildCarGeos(){
  const R=.47,AY=.37,YB=.36;
  const ext=(shape,depth,bevel=true)=>{const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:14});g.rotateY(-Math.PI/2);return g;};
  let s=new THREE.Shape();s.moveTo(.85,YB);s.lineTo(1.35-R,YB);s.absarc(1.35,AY,R,Math.PI,0,true);s.lineTo(2.18,YB);s.lineTo(2.26,.52);s.lineTo(2.24,.84);s.lineTo(.85,.96);s.lineTo(.85,YB);
  CG.fenderF=ext(s,.2);
  s=new THREE.Shape();s.moveTo(-2.22,YB);s.lineTo(-1.35-R,YB);s.absarc(-1.35,AY,R,Math.PI,0,true);s.lineTo(-.95,YB);s.lineTo(-.95,.96);s.lineTo(-2.14,.93);s.lineTo(-2.24,.82);s.lineTo(-2.26,.52);s.lineTo(-2.22,YB);
  CG.fenderR=ext(s,.2);
  s=new THREE.Shape();s.moveTo(-.95,.33);s.lineTo(.85,.33);s.lineTo(.85,.96);s.lineTo(-.95,.96);s.lineTo(-.95,.33);
  CG.door=ext(s,.07);
  s=new THREE.Shape();s.moveTo(-.9,.97);s.lineTo(.8,.97);s.lineTo(.34,1.39);s.lineTo(-.9,1.39);s.lineTo(-.9,.97);
  CG.doorGlass=new THREE.ExtrudeGeometry(s,{depth:.015,bevelEnabled:false});CG.doorGlass.rotateY(-Math.PI/2);
  s=new THREE.Shape();s.moveTo(-.95,.97);s.lineTo(-.95,1.39);s.lineTo(-.73,1.39);s.lineTo(-1.02,.97);
  CG.qGlass=new THREE.ExtrudeGeometry(s,{depth:.015,bevelEnabled:false});CG.qGlass.rotateY(-Math.PI/2);
  // door window frame (thin outline)
  s=new THREE.Shape();s.moveTo(-.92,.96);s.lineTo(.84,.96);s.lineTo(.36,1.41);s.lineTo(-.92,1.41);s.lineTo(-.92,.96);
  const hole=new THREE.Path();hole.moveTo(-.88,.98);hole.lineTo(.76,.98);hole.lineTo(.33,1.37);hole.lineTo(-.88,1.37);hole.lineTo(-.88,.98);s.holes.push(hole);
  CG.doorFrame=ext(s,.05,false);
  CG.tyre=new THREE.CylinderGeometry(.36,.36,.22,28,1,true);CG.tyre.rotateZ(Math.PI/2);
  CG.shoulder=new THREE.TorusGeometry(.32,.05,8,28);CG.shoulder.rotateY(Math.PI/2);
  CG.sidewall=new THREE.RingGeometry(.22,.33,28);CG.sidewall.rotateY(Math.PI/2);
  CG.rim=new THREE.CylinderGeometry(.22,.22,.2,22);CG.rim.rotateZ(Math.PI/2);
  CG.dish=new THREE.CylinderGeometry(.15,.19,.06,20);CG.dish.rotateZ(Math.PI/2);
  CG.hub=new THREE.CylinderGeometry(.06,.07,.06,12);CG.hub.rotateZ(Math.PI/2);
  CG.lug=new THREE.CylinderGeometry(.013,.013,.03,6);CG.lug.rotateZ(Math.PI/2);
  CG.wheelTorus=new THREE.TorusGeometry(.19,.026,10,32);
  CG.light=new THREE.CylinderGeometry(.1,.1,.06,18);CG.light.rotateX(Math.PI/2);
  CG.ring=new THREE.TorusGeometry(.105,.015,6,20);
  CG.halfCyl=new THREE.CylinderGeometry(1,1,1,16,1,false,-Math.PI/2,Math.PI);
  CG.tube=new THREE.CylinderGeometry(1,1,1,8);
})();
function treadTex(){return cached('tread',()=>{const c=pixCanvas(256,32,(x,y)=>{const v=((x+(y>16?6:0))%12<6)?38:18;return[v,v,v];});const t=texOf(c);t.repeat.set(3,1);return {map:t,normal:normalFrom(c,3)};});}
const LCD={canvas:canvasOf(256,48)};LCD.tex=texOf(LCD.canvas,true,false);
function drawLCD(text){const x=LCD.canvas.getContext('2d');x.fillStyle='#071a0e';x.fillRect(0,0,256,48);x.fillStyle=text?'#7dff9b':'#244a30';x.font='bold 22px monospace';x.textBaseline='middle';
  x.fillText((text||'-- radio off --').slice(0,19),8,25);LCD.tex.needsUpdate=true;}
drawLCD('');

const CARMAT={
  glass:std(0xa8c0d0,{roughness:.02,metalness:.3,transparent:true,opacity:.2,depthWrite:false,envMapIntensity:1.6}),
  chrome:std(0xe6e6e6,{roughness:.12,metalness:1}),
  black:std(0x18191b,{roughness:.6}),
  plastic:std(0x2a2b2e,{roughness:.7}),
  dash:std(0x3a3430,{roughness:.8}),
  rubber:std(0x1c1c1c,{roughness:.95}),
  tyre:null,
  rim:std(0xc4c8cc,{roughness:.25,metalness:.95}),
  rimDark:std(0x6c7075,{roughness:.4,metalness:.8}),
  grille:null,
  head:std(0xfff6d8,{emissive:0x332a10,roughness:.05,metalness:.3}),
  amber:std(0xffa630,{emissive:0x331a00,roughness:.2}),
  tail:std(0xc1121f,{emissive:0x300000,roughness:.2}),
  tailOn:std(0xff2a2a,{emissive:0xff1010,emissiveIntensity:1.3}),
  seat:null,
  carpet:std(0x2d2a28,{roughness:1}),
  headliner:std(0xb9ad98,{roughness:1}),
  engine:std(0x4a4e54,{roughness:.4,metalness:.75}),
  engineDark:std(0x2a2c30,{roughness:.55,metalness:.6}),
  valve:std(0xb3261e,{roughness:.35,metalness:.4}),
  hose:std(0x141414,{roughness:.8}),
  washer:std(0x4fa3e0,{roughness:.2,transparent:true,opacity:.7}),
  battTop:std(0x111111,{roughness:.6}),
  termRed:std(0xd32f2f,{roughness:.4}),
  fins:null,
  gaugeRing:std(0xd0d0d0,{roughness:.2,metalness:1}),
  needle:new THREE.MeshBasicMaterial({color:0xff5a1f}),
  lightOff:std(0x1a1a1a,{roughness:.4}),
  lightRed:new THREE.MeshBasicMaterial({color:0xff2a2a}),lightAmber:new THREE.MeshBasicMaterial({color:0xffb020}),lightBlue:new THREE.MeshBasicMaterial({color:0x3fa9ff}),lightGreen:new THREE.MeshBasicMaterial({color:0x3cff6a}),
  lcd:new THREE.MeshBasicMaterial({map:LCD.tex}),
  mirror:std(0xdfe8f0,{roughness:.02,metalness:1}),
  plate:null,
  cage:std(0x2b2d30,{roughness:.4,metalness:.8})
};
function initCarMats(){
  const tr=treadTex(),fab=fabricTex(),gr=grilleTex();
  CARMAT.tyre=std(0xffffff,{map:tr.map,normalMap:tr.normal,roughness:.95});
  CARMAT.seat=std(0x6b4a3a,{map:fab.map,normalMap:fab.normal,roughness:.95});
  CARMAT.grille=std(0xffffff,{map:gr.map,normalMap:gr.normal,roughness:.5,metalness:.6});
  CARMAT.fins=std(0xffffff,{map:finTex(),roughness:.5,metalness:.7,side:THREE.DoubleSide});
  CARMAT.plate=std(0xffffff,{map:plateTex('LOUIS 1'),roughness:.5});
  CARMAT.battLabel=std(0xffffff,{map:labelTex('VOLTMAX',['12V  55Ah','HEAVY DUTY'],'#e9e4d8','#1b1b1b','#e2692b'),roughness:.5});
  const rt=rustTex();
  CARMAT.rust=std(0xffffff,{map:rt.map,normalMap:rt.normal,roughness:.9,metalness:.25});
  CARMAT.gauges={};for(const k of['speed','rpm','fuel','temp'])CARMAT.gauges[k]=new THREE.MeshBasicMaterial({map:gaugeTex(k)});
}
const paintCache={};
function paintMat(color){const k=color;if(!paintCache[k])paintCache[k]=new THREE.MeshPhysicalMaterial({color:lin(color),roughness:.35,metalness:.4,clearcoat:.8,clearcoatRoughness:.15});return paintCache[k];}

// ---------------------------------------------------------------------- dashboard
function addDashboard(g,C,opts={}){
  const dx=opts.driverX??-.38,z=opts.z??.62,mini=!!opts.mini;
  if(!mini){
    part(g,G.box,CARMAT.dash,0,.8,z+.04,1.62,.3,.36);
    part(g,G.box,CARMAT.dash,0,.965,z+.1,1.64,.06,.3,.1,0,0);
    part(g,G.box,CARMAT.plastic,dx,.99,z-.11,.62,.22,.1);              // cluster backing
    part(g,CG.halfCyl,CARMAT.dash,dx,1.1,z-.12,.32,.62,.13,0,0,Math.PI/2); // cluster hood
    part(g,G.box,CARMAT.plastic,.38,.8,z-.15,.42,.16,.02);             // glovebox
    part(g,G.box,CARMAT.chrome,.38,.82,z-.162,.06,.015,.01);
    for(const vx of[-.68,.66])part(g,G.box,CARMAT.grille,vx,.9,z-.15,.14,.07,.02);
    // radio head unit
    part(g,G.box,CARMAT.black,0,.86,z-.16,.36,.11,.04);
    part(g,G.plane,CARMAT.lcd,0,.875,z-.183,.2,.04,1,0,Math.PI,0);
    for(const kx of[-.14,.14])part(g,G.cyl,CARMAT.chrome,kx,.86,z-.185,.018,.02,.018,Math.PI/2,0,0);
    for(let k=0;k<5;k++)part(g,G.box,CARMAT.plastic,-.08+k*.04,.83,z-.184,.03,.014,.01);
    part(g,G.box,CARMAT.engineDark,0,.9,z-.183,.16,.006,.004); // cd slot
    part(g,G.box,CARMAT.plastic,0,.6,z-.42,.22,.3,.5);                // centre console
    part(g,G.cyl,CARMAT.chrome,0,.8,z-.55,.01,.2,.01,-.3,0,0);part(g,G.sphere,CARMAT.black,0,.9,z-.58,.03,.03,.03); // gear lever
  } else {
    part(g,G.box,CARMAT.cage,0,.85,z,1.2,.06,.06);
    part(g,G.box,CARMAT.plastic,dx,.93,z-.02,.42,.18,.06);
  }
  // gauges
  C.needles={};
  const gauge=(kind,x,y,r)=>{
    const gg=new THREE.Group();gg.position.set(x,y,(mini?z-.055:z-.165));gg.rotation.set(-.12,Math.PI,0);g.add(gg);
    const face=new THREE.Mesh(G.circle,CARMAT.gauges[kind]);face.scale.setScalar(r);gg.add(face);
    const ring=new THREE.Mesh(CG.ring,CARMAT.gaugeRing);ring.scale.setScalar(r/.105);gg.add(ring);
    const piv=new THREE.Group();piv.position.z=.004;gg.add(piv);
    const nd=new THREE.Mesh(G.box,CARMAT.needle);nd.scale.set(r*.05,r*.85,.002);nd.position.y=r*.38;piv.add(nd);
    const cap=new THREE.Mesh(G.cyl,CARMAT.black);cap.scale.set(r*.1,.004,r*.1);cap.rotation.x=Math.PI/2;cap.position.z=.006;gg.add(cap);
    C.needles[kind]=piv;
  };
  if(!mini){gauge('speed',dx-.14,.99,.085);gauge('rpm',dx+.14,.99,.085);gauge('fuel',dx,1.035,.04);gauge('temp',dx,.945,.04);}
  else{gauge('speed',dx-.1,.94,.06);gauge('fuel',dx+.1,.94,.05);}
  // warning lights
  C.lights={};
  const lightsAt=mini?[[dx,.87]]:[[dx-.27,.9],[dx-.2,.9],[dx+.2,.9],[dx+.27,.9]];
  ['engine','fuel','battery','heater'].slice(0,lightsAt.length).forEach((k,i)=>{
    const m=new THREE.Mesh(G.circle,CARMAT.lightOff);m.scale.setScalar(.012);m.position.set(lightsAt[i][0],lightsAt[i][1],(mini?z-.056:z-.166));m.rotation.y=Math.PI;g.add(m);C.lights[k]=m;});
  // steering wheel
  const col=part(g,G.cyl,CARMAT.plastic,dx,.86,z-.2,.035,.32,.035,-1.15,0,0);
  const sw=new THREE.Group();sw.position.set(dx,.94,z-.42);sw.rotation.x=-.5;g.add(sw);
  const inner=new THREE.Group();sw.add(inner);C.steer=inner;
  part(inner,CG.wheelTorus,CARMAT.black,0,0,0,1,1,1);
  for(const a of[-Math.PI/2,Math.PI/6,Math.PI*5/6]){const sp=part(inner,G.box,CARMAT.chrome,Math.cos(a)*.095,Math.sin(a)*.095,0,.17,.022,.012,0,0,a);}
  part(inner,G.cyl,CARMAT.black,0,0,-.01,.05,.04,.05,Math.PI/2,0,0);
  part(inner,G.cyl,CARMAT.chrome,0,0,-.032,.025,.004,.025,Math.PI/2,0,0);
  // pedals
  for(const px of[dx-.1,dx+.06,dx+.16])part(g,G.box,CARMAT.black,px,.5,z-.12,.06,.1,.02,-.5,0,0);
}

// ---------------------------------------------------------------------- vehicle builder
// Slots own the position a part sits at (home), so any part fits any vehicle of the right kind.
function attachTo(s,obj){s.parent.add(obj);const h=s.home;obj.position.set(...h.p);obj.rotation.set(...(h.r||[0,0,0]));obj.scale.setScalar(h.s||1);obj.visible=true;s.obj=obj;}
function makeVehicle(type='sedan',opts={}){
  const rusty=!!opts.rusty,pdesc=rusty?'rust':(opts.color??PAINTS.blue);
  const paint=paintOf(pdesc);
  const glassOn=!opts.noGlass;
  const g=new THREE.Group();
  const C={type,group:g,slots:{},pivots:{},paint,pdesc,tails:[],spec:VTYPES[type]};
  const slot=(name,stype,point,home,obj,hinge,needsHood)=>{
    let parent=g,h=null;
    if(hinge){h=new THREE.Group();h.position.set(...hinge.p);g.add(h);parent=h;}
    const s={name,type:stype,point,parent,hinge:h,axis:hinge?hinge.axis:null,angle:hinge?hinge.angle:0,open:false,openAmt:0,obj:null,needsHood,home};
    C.slots[name]=s;if(obj)attachTo(s,obj);return s;
  };
  const mk=d=>makeFromDesc(d);
  if(type==='buggy'){buildBuggy(g,C,paint,slot,mk,opts);return C;}

  for(const[x,geo]of[[.9,CG.fenderF],[-.7,CG.fenderF]]){const m=sharedMesh(geo,paint);m.position.x=x;g.add(m);}
  part(g,G.box,paint,0,.6,2.2,1.42,.34,.08);
  part(g,G.box,CARMAT.grille,0,.66,2.245,1.05,.26,.02);
  part(g,G.box,CARMAT.chrome,0,.66,2.255,1.1,.02,.02);
  part(g,G.box,CARMAT.chrome,0,.42,2.3,1.92,.13,.14);
  part(g,G.box,CARMAT.plate,0,.42,2.38,.42,.11,.01);
  for(const sx of[1,-1]){part(g,CG.light,CARMAT.head,sx*.62,.7,2.25,1,1,1);part(g,CG.ring,CARMAT.chrome,sx*.62,.7,2.285,1,1,1);part(g,G.box,CARMAT.amber,sx*.82,.52,2.26,.12,.06,.03);}
  part(g,G.box,CARMAT.carpet,0,.4,-.05,1.66,.06,1.86);
  part(g,G.box,paint,.86,.36,-.05,.08,.08,1.8);part(g,G.box,paint,-.86,.36,-.05,.08,.08,1.8);
  part(g,G.box,CARMAT.engineDark,0,.4,1.52,1.4,.05,1.3);
  for(const sx of[1,-1])part(g,G.box,CARMAT.engineDark,sx*.68,.66,1.52,.04,.5,1.25);
  part(g,G.box,CARMAT.engineDark,0,.66,.9,1.36,.5,.04);
  part(g,G.box,CARMAT.engineDark,0,.92,.88,1.42,.08,.08);
  for(const sx of[-.32,.32])part(g,G.box,CARMAT.black,sx,.975,.86,.5,.015,.02,0,sx>0?-.12:.12,0);
  part(g,G.box,CARMAT.engineDark,0,.42,1.45,.3,.06,.3);   // engine mount, visible when the engine is out
  for(const sx of[.5,-.5])part(g,G.box,CARMAT.engineDark,sx,.3,0,.1,.1,4.0);
  addDashboard(g,C,{driverX:-.38,z:.62});
  for(const sx of[1,-1]){beam(g,G.box,paint,[sx*.8,.96,.84],[sx*.72,1.42,.3],.07,.06);}
  if(glassOn)beam(g,G.box,CARMAT.glass,[0,.96,.83],[0,1.42,.3],1.42,.012);
  part(g,G.box,CARMAT.black,0,1.37,.26,.15,.045,.02);part(g,G.plane,CARMAT.mirror,0,1.37,.248,.135,.035,1,0,Math.PI,0);
  for(const sx of[-.38,.38])part(g,G.box,CARMAT.headliner,sx,1.402,.22,.36,.015,.14);
  for(const sx of[-.38,.38])part(g,G.box,CARMAT.engineDark,sx,.43,-.12,.34,.02,.34); // seat rails
  for(const[x,geo]of[[.9,CG.fenderR],[-.7,CG.fenderR]]){const m=sharedMesh(geo,paint);m.position.x=x;g.add(m);}
  part(g,G.box,CARMAT.chrome,0,.42,-2.3,1.92,.13,.14);
  part(g,G.cyl,CARMAT.chrome,.6,.32,-2.3,.035,.2,.035,Math.PI/2,0,0);
  if(type==='sedan'){
    part(g,G.box,paint,0,.66,-2.2,1.42,.48,.08);
    part(g,G.box,CARMAT.plate,0,.62,-2.245,.42,.11,.01);
    for(const sx of[1,-1]){C.tails.push(part(g,G.box,CARMAT.tail,sx*.62,.8,-2.25,.34,.14,.03));part(g,G.box,CARMAT.amber,sx*.85,.8,-2.25,.08,.14,.03);
      beam(g,G.box,paint,[sx*.8,.96,-1.0],[sx*.72,1.42,-.72],.1,.06);}
    part(g,G.box,paint,0,1.44,-.21,1.5,.05,1.06);
    part(g,G.box,CARMAT.headliner,0,1.412,-.21,1.44,.01,1.0);
    for(const dz of[-.6,.2])part(g,G.box,CARMAT.chrome,0,1.5,dz,1.4,.03,.04);
    if(glassOn){beam(g,G.box,CARMAT.glass,[0,.96,-1.0],[0,1.42,-.73],1.42,.012);
      for(const sx of[1,-1]){const q=sharedMesh(CG.qGlass,CARMAT.glass);q.position.x=sx>0?.86:-.845;q.castShadow=false;g.add(q);}}
    part(g,G.box,CARMAT.seat,0,.5,-.82,1.5,.13,.4);part(g,G.box,CARMAT.seat,0,.82,-1.02,1.5,.55,.1,-.1);
    part(g,G.box,CARMAT.carpet,0,.42,-1.55,1.38,.05,1.15);
    slot('trunk','trunk',[0,1.0,-2.45],{p:[0,-.025,-.6],r:[-.025,0,0]},mk({k:'trunk',p:pdesc}),{p:[0,.97,-.95],axis:'x',angle:1.2});
  } else {
    part(g,G.box,paint,0,1.44,-.25,1.5,.05,1.1);
    part(g,G.box,CARMAT.headliner,0,1.412,-.25,1.44,.01,1.04);
    part(g,G.box,paint,0,1.02,-.86,1.6,.14,.07);part(g,G.box,paint,0,1.4,-.86,1.6,.08,.07);
    for(const sx of[1,-1])part(g,G.box,paint,sx*.73,1.21,-.86,.16,.38,.07);
    if(glassOn)part(g,G.box,CARMAT.glass,0,1.21,-.86,1.3,.32,.012);
    if(glassOn)for(const sx of[1,-1]){const q=sharedMesh(CG.qGlass,CARMAT.glass);q.position.x=sx>0?.86:-.845;q.scale.z=.6;q.position.z=-.38;q.castShadow=false;g.add(q);}
    part(g,G.box,CARMAT.engineDark,0,.58,-1.6,1.66,.05,1.38);
    for(let k=-3;k<=3;k++)part(g,G.box,CARMAT.engine,k*.22,.615,-1.6,.04,.02,1.36);
    for(const sx of[1,-1]){part(g,G.box,paint,sx*.85,.85,-1.6,.06,.52,1.42);part(g,G.box,CARMAT.chrome,sx*.85,1.12,-1.6,.1,.03,1.44);
      C.tails.push(part(g,G.box,CARMAT.tail,sx*.84,.85,-2.31,.1,.3,.03));}
    part(g,G.box,paint,0,.85,-.93,1.66,.52,.05);
    part(g,G.box,CARMAT.plate,0,.42,-2.38,.42,.11,.01);
    slot('tailgate','tailgate',[0,.85,-2.55],{p:[0,.26,0]},mk({k:'tailgate',p:pdesc}),{p:[0,.57,-2.28],axis:'x',angle:-1.5});
  }
  slot('hood','hood',[0,1.0,2.4],{p:[0,-.025,.67],r:[.074,0,0]},mk({k:'hood',p:pdesc}),{p:[0,.96,.86],axis:'x',angle:-1.15});
  slot('doorL','doorL',[1.2,.85,.45],{p:[0,0,-.85]},mk({k:'doorL',p:pdesc,g:glassOn?1:0}),{p:[.9,0,.85],axis:'y',angle:-1.1});
  slot('doorR','doorR',[-1.2,.85,.45],{p:[0,0,-.85]},mk({k:'doorR',p:pdesc,g:glassOn?1:0}),{p:[-.82,0,.85],axis:'y',angle:1.1});
  slot('engine','engine',[0,.98,1.45],{p:[0,.58,1.42]},mk({k:'engine',v:opts.engine||'V6'}),null,true);
  slot('battery','battery',[.46,.85,1.85],{p:[.46,.6,1.85]},mk({k:'battery'}),null,true);
  slot('radiator','radiator',[0,.92,2.12],{p:[0,.64,2.08]},mk({k:'radiator'}),null,true);
  slot('seatD','seat',[-.38,.9,-.1],{p:[-.38,.5,-.12]},mk({k:'seat',v:opts.seat||'standard'}));
  slot('seatP','seat',[.38,.9,-.1],{p:[.38,.5,-.12]},mk({k:'seat',v:opts.seat||'standard'}));
  addWheels(g,C,.78,.36,1.35,1,opts);
  return C;
}
function addWheels(g,C,ax,ay,az,scale,opts={}){
  const pts={wheelFL:[ax,ay,az],wheelFR:[-ax,ay,az],wheelRL:[ax,ay,-az],wheelRR:[-ax,ay,-az]};
  for(const[name,p]of Object.entries(pts)){
    const piv=new THREE.Group();piv.position.set(...p);piv.scale.setScalar(scale);g.add(piv);C.pivots[name]=piv;
    const s={name,type:'wheel',point:[Math.sign(p[0])*(Math.abs(p[0])+.47*scale),.4,p[2]],parent:piv,hinge:null,obj:null,open:false,openAmt:0,home:{p:[0,0,0]}};
    C.slots[name]=s;attachTo(s,makeFromDesc({k:'wheel',rim:opts.rim||'steel',tyre:opts.tyre||'road'}));
  }
}
function buildBuggy(g,C,paint,slot,mk,opts){
  part(g,G.box,CARMAT.engineDark,0,.44,0,1.3,.06,3.2);
  part(g,G.box,paint,0,.6,1.55,1.3,.3,.6,-.35,0,0);
  part(g,G.box,paint,0,.78,1.15,1.2,.06,.5,.12,0,0);
  for(const sx of[1,-1]){part(g,G.box,paint,sx*.66,.58,.1,.06,.28,2.2);}
  const T=(a,b)=>beam(g,CG.tube,CARMAT.cage,a,b,.035,.035,'y');
  for(const sx of[1,-1]){
    T([sx*.62,.48,.75],[sx*.55,1.42,.15]);T([sx*.62,.48,-.85],[sx*.55,1.5,-.65]);
    T([sx*.55,1.42,.15],[sx*.55,1.5,-.65]);T([sx*.62,.48,.75],[sx*.62,.48,1.7]);
    T([sx*.62,.48,-.85],[sx*.55,.55,-2.0]);T([sx*.55,1.5,-.65],[sx*.55,.6,-1.95]);
    T([sx*.62,.6,.75],[sx*.62,.6,-.85]);
  }
  T([-.55,1.42,.15],[.55,1.42,.15]);T([-.55,1.5,-.65],[.55,1.5,-.65]);T([-.55,.6,-1.95],[.55,.6,-1.95]);T([-.62,.48,1.7],[.62,.48,1.7]);
  T([-.55,1.5,-.65],[.55,.48,-.85]);
  part(g,G.box,CARMAT.chrome,0,.5,1.85,1.4,.08,.08);
  for(const sx of[1,-1]){part(g,CG.light,CARMAT.head,sx*.4,1.46,.2,.7,.7,1);C.tails.push(part(g,G.box,CARMAT.tail,sx*.5,.62,-2.0,.12,.08,.03));}
  part(g,G.cyl,CARMAT.chrome,.25,.7,-2.0,.05,.4,.05,Math.PI/2.4,0,0);part(g,G.cyl,CARMAT.chrome,-.25,.7,-2.0,.05,.4,.05,Math.PI/2.4,0,0);
  part(g,G.box,CARMAT.engineDark,0,.48,-1.45,.4,.06,.4);
  addDashboard(g,C,{driverX:-.36,z:.62,mini:true});
  slot('seatD','seat',[-.36,.9,-.2],{p:[-.36,.55,-.2]},mk({k:'seat',v:opts.seat||'racing'}));
  slot('seatP','seat',[.36,.9,-.2],{p:[.36,.55,-.2]},mk({k:'seat',v:opts.seat||'racing'}));
  slot('engine','engine',[0,1.0,-1.45],{p:[0,.62,-1.45],r:[0,Math.PI,0]},mk({k:'engine',v:opts.engine||'I4'}));
  slot('battery','battery',[.75,.8,-.95],{p:[.42,.6,-.95]},mk({k:'battery'}));
  slot('radiator','radiator',[0,.9,-2.35],{p:[0,.75,-2.0],s:.8},mk({k:'radiator'}));
  addWheels(g,C,.92,.42,1.32,1.17,opts);
}
function missing(C){const m={wheels:0,panels:0,doors:0,hood:false,battery:false,radiator:false,engine:false,seatD:false,bare:0,list:[]};
  for(const s of Object.values(C.slots)){
    if(!s.obj){m.list.push(s.name);
      if(s.type==='wheel')m.wheels++;else if(s.type==='battery')m.battery=true;else if(s.type==='radiator')m.radiator=true;else if(s.type==='engine')m.engine=true;
      else if(s.type==='seat'){if(s.name==='seatD')m.seatD=true;}
      else{m.panels++;if(s.type.startsWith('door'))m.doors++;if(s.type==='hood')m.hood=true;}}
    else if(s.type==='wheel'&&!s.obj.userData.tyreObj)m.bare++;}
  return m;}
function hoodAccess(C){const h=C.slots.hood;return !h||!h.obj||h.open;}
// grip factors from the tyres that are fitted
function tyreFactors(C){let n=0,road=0,off=0,ice=0,mud=0;
  for(const nm of['wheelFL','wheelFR','wheelRL','wheelRR']){const s=C.slots[nm];if(!s||!s.obj)continue;const t=s.obj.userData.tyreObj;
    const T=t?TYRES[t.userData.desc.v]||TYRES.road:{road:.45,off:.45,ice:.3,mud:.4};road+=T.road;off+=T.off;ice+=T.ice;mud+=T.mud;n++;}
  return n?{road:road/n,off:off/n,ice:ice/n,mud:mud/n}:{road:1,off:1,ice:1,mud:1};}
function engineSpec(C){const e=C.slots.engine&&C.slots.engine.obj;return e?ENGINES[e.userData.desc.v]||ENGINES.V6:null;}

// ---------------------------------------------------------------------- person
function makePerson(shirtCol=0xd9822b,capCol=0x2c6e49){
  const g=new THREE.Group();
  const fab=fabricTex();
  const skin=std(0xc98e62,{roughness:.6}),shirt=std(shirtCol,{roughness:.9,map:fab.map,normalMap:fab.normal}),pants=std(0x34465e,{roughness:.9,map:fab.map,normalMap:fab.normal}),
    shoe=std(0x2a221c,{roughness:.7}),hair=std(0x2b1a10,{roughness:.9}),cap=std(capCol,{roughness:.8});
  const limb=(parent,x,y,z,r1,r2,len,mat)=>{const piv=new THREE.Group();piv.position.set(x,y,z);parent.add(piv);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,len,12),mat);m.castShadow=true;m.position.y=-len/2;piv.add(m);
    const j=new THREE.Mesh(G.sphere,mat);j.scale.setScalar(r1);j.castShadow=true;piv.add(j);return piv;};
  const hipL=limb(g,.1,.92,0,.085,.065,.46,pants),hipR=limb(g,-.1,.92,0,.085,.065,.46,pants);
  const kneeL=limb(hipL,0,-.46,0,.065,.05,.42,pants),kneeR=limb(hipR,0,-.46,0,.065,.05,.42,pants);
  for(const k of[kneeL,kneeR]){const s=new THREE.Mesh(G.box,shoe);s.scale.set(.11,.08,.26);s.position.set(0,-.44,.06);s.castShadow=true;k.add(s);}
  const pelvis=new THREE.Mesh(G.box,pants);pelvis.scale.set(.34,.16,.2);pelvis.position.y=.94;pelvis.castShadow=true;g.add(pelvis);
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.2,.16,.56,14),shirt);torso.scale.z=.62;torso.position.y=1.24;torso.castShadow=true;g.add(torso);
  const shoulders=new THREE.Mesh(G.sphere,shirt);shoulders.scale.set(.25,.08,.13);shoulders.position.y=1.47;g.add(shoulders);
  const neck=new THREE.Mesh(G.cyl,skin);neck.scale.set(.05,.08,.05);neck.position.y=1.55;g.add(neck);
  const head=new THREE.Group();head.position.y=1.66;g.add(head);
  const hd=new THREE.Mesh(G.sphere,skin);hd.scale.set(.11,.13,.12);hd.castShadow=true;head.add(hd);
  const hr=new THREE.Mesh(G.sphere,hair);hr.scale.set(.115,.08,.125);hr.position.set(0,.06,-.01);head.add(hr);
  const cp=new THREE.Mesh(G.cyl,cap);cp.scale.set(.12,.05,.12);cp.position.y=.1;head.add(cp);
  const brim=new THREE.Mesh(G.box,cap);brim.scale.set(.2,.015,.13);brim.position.set(0,.08,.12);head.add(brim);
  for(const ex of[.04,-.04]){const e=new THREE.Mesh(G.sphere,CARMAT.black);e.scale.setScalar(.014);e.position.set(ex,.01,.11);head.add(e);}
  const nose=new THREE.Mesh(G.sphere,skin);nose.scale.set(.02,.03,.025);nose.position.set(0,-.02,.12);head.add(nose);
  const shL=limb(g,.25,1.46,0,.055,.05,.3,shirt),shR=limb(g,-.25,1.46,0,.055,.05,.3,shirt);
  const elL=limb(shL,0,-.3,0,.045,.04,.27,skin),elR=limb(shR,0,-.3,0,.045,.04,.27,skin);
  for(const e of[elL,elR]){const h=new THREE.Mesh(G.sphere,skin);h.scale.setScalar(.05);h.position.y=-.3;e.add(h);}
  const hold=new THREE.Group();hold.position.set(0,1.1,.5);g.add(hold);
  return {group:g,hipL,hipR,kneeL,kneeR,shL,shR,elL,elR,head,hold};
}
function pose(P,mode,ph,amp){
  if(mode==='sit'){P.hipL.rotation.x=P.hipR.rotation.x=-1.45;P.kneeL.rotation.x=P.kneeR.rotation.x=1.3;
    P.shL.rotation.x=P.shR.rotation.x=-1.0;P.elL.rotation.x=P.elR.rotation.x=-.45;P.shL.rotation.z=.1;P.shR.rotation.z=-.1;return;}
  if(mode==='crouch'){const s=Math.sin(ph)*amp*.5;P.hipL.rotation.x=-1.05+s;P.hipR.rotation.x=-1.05-s;P.kneeL.rotation.x=P.kneeR.rotation.x=1.9;
    P.shL.rotation.x=P.shR.rotation.x=-.5;P.elL.rotation.x=P.elR.rotation.x=-.6;P.shL.rotation.z=.1;P.shR.rotation.z=-.1;return;}
  if(mode==='aim'){const s=Math.sin(ph)*amp;P.hipL.rotation.x=s;P.hipR.rotation.x=-s;P.kneeL.rotation.x=P.kneeR.rotation.x=Math.abs(s)*.6;
    P.shR.rotation.x=-1.5;P.elR.rotation.x=0;P.shL.rotation.x=-1.35;P.elL.rotation.x=-.3;P.shL.rotation.z=-.4;P.shR.rotation.z=.05;return;}
  const s=Math.sin(ph)*amp;
  P.hipL.rotation.x=s;P.hipR.rotation.x=-s;
  P.kneeL.rotation.x=Math.max(0,-Math.sin(ph-.6))*amp*1.3;P.kneeR.rotation.x=Math.max(0,Math.sin(ph-.6))*amp*1.3;
  if(mode==='carry'){P.shL.rotation.x=P.shR.rotation.x=-1.15;P.elL.rotation.x=P.elR.rotation.x=-.5;P.shL.rotation.z=-.15;P.shR.rotation.z=.15;}
  else{P.shL.rotation.x=-s*.8;P.shR.rotation.x=s*.8;P.elL.rotation.x=P.elR.rotation.x=-.25-amp*.3;P.shL.rotation.z=.06;P.shR.rotation.z=-.06;}
}

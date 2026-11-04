'use strict';
// ====================================================================== parts & items: every thing you can pick up, fit, spawn or save
// Each object carries userData.desc, a small description that can rebuild it exactly (used for saving & multiplayer).

const ENGINES={
  I4:    {name:'Inline-4 engine',short:'I4',    power:.8, fuel:.7, heat:.85,cover:0x2f6fd0,w:.42},
  V6:    {name:'V6 engine',      short:'V6',    power:1,  fuel:1,  heat:1,  cover:0xb3261e,w:.5},
  V8:    {name:'V8 engine',      short:'V8',    power:1.35,fuel:1.45,heat:1.2,cover:0xe2692b,w:.58},
  diesel:{name:'Diesel engine',  short:'Diesel',power:.95,fuel:.62,heat:.9, cover:0x3a3d42,w:.5,hill:1.5}
};
const SEATS={
  standard:{name:'Standard seat'},
  sport:   {name:'Sport seat'},
  racing:  {name:'Racing seat'}
};
const TYRES={
  road:   {name:'Road tyre',     road:1,   off:1,   ice:1,   mud:1},
  offroad:{name:'Off-road tyre', road:.93, off:1.4, ice:1.1, mud:1.6},
  snow:   {name:'Snow tyre',     road:.95, off:1.1, ice:2.4, mud:1.1},
  slick:  {name:'Racing slick',  road:1.15,off:.7,  ice:.55, mud:.7}
};
const RIMS={
  steel:{name:'Steel rim'},chrome:{name:'Chrome rim'},black:{name:'Black rim'},gold:{name:'Gold rim'}
};

// ---------------------------------------------------------------------- textures for labels
function canLabelTex(title,bg,fg){return cached('can'+title,()=>{const c=canvasOf(256,128),x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,256,128);
  x.fillStyle='rgba(255,255,255,.25)';x.fillRect(0,14,256,6);x.fillRect(0,108,256,6);
  x.fillStyle=fg;x.font='bold 40px sans-serif';x.textAlign='center';x.fillText(title,128,74);
  x.font='bold 16px sans-serif';x.fillText('ENDLESS ROAD FOODS',128,100);
  for(let i=0;i<6;i++){x.fillStyle='rgba(120,60,20,.9)';x.beginPath();x.ellipse(30+i*40,36,8,5,0,0,7);x.fill();}
  return texOf(c,true,false);});}
function targetTex(){return cached('target',()=>{const c=canvasOf(256,256),x=c.getContext('2d');
  for(let i=0;i<6;i++){x.fillStyle=i%2?'#f4f0e6':'#d32f2f';x.beginPath();x.arc(128,128,124-i*20,0,7);x.fill();}
  x.fillStyle='#ffd166';x.beginPath();x.arc(128,128,10,0,7);x.fill();return texOf(c,true,false);});}

const PM={};
function initPartMats(){
  const pl=plankTex(false),fab=fabricTex();
  Object.assign(PM,{
    beans:std(0xffffff,{map:canLabelTex('BEANS','#c0392b','#fff4e2'),roughness:.4,metalness:.3}),
    soup:std(0xffffff,{map:canLabelTex('SOUP','#2a7ab0','#fff4e2'),roughness:.4,metalness:.3}),
    tin:std(0xd8dade,{roughness:.25,metalness:.95}),
    crust:std(0xb7742f,{roughness:.85}),crumb:std(0xf1d9a8,{roughness:.95}),
    water:std(0x8fd0ff,{roughness:.03,metalness:0,transparent:true,opacity:.45,depthWrite:false}),
    waterLabel:std(0x2c88d9,{roughness:.5}),blueCap:std(0x1d4fa0,{roughness:.4}),
    banana:std(0xf1d34b,{roughness:.6}),bananaTip:std(0x4a3a20,{roughness:.8}),
    husk:std(0x6b4a2e,{roughness:1,flatShading:true}),
    egg:std(0xf3e6cf,{roughness:.5}),
    wood:std(0x8a5a33,{map:pl.map,normalMap:pl.normal,roughness:.8}),
    gunMetal:std(0x2b2d31,{roughness:.35,metalness:.85}),gunGrip:std(0x3b2a1f,{roughness:.7}),
    lens:std(0x3a6ea5,{roughness:.05,metalness:.5}),
    target:std(0xffffff,{map:targetTex(),roughness:.8}),
    chicken:std(0xf7f3ea,{roughness:.9}),comb:std(0xd7261e,{roughness:.6}),beak:std(0xf2a51a,{roughness:.6}),legs:std(0xe8a33d,{roughness:.6}),
    seatStd:std(0x6b4a3a,{map:fab.map,normalMap:fab.normal,roughness:.95}),
    seatSport:std(0x1e1f22,{map:fab.map,normalMap:fab.normal,roughness:.7}),seatStripe:std(0xc0392b,{roughness:.6}),
    seatRace:std(0x1f4fa8,{map:fab.map,normalMap:fab.normal,roughness:.8}),harness:std(0xd9a12b,{roughness:.6}),
    gold:std(0xd4a63a,{roughness:.2,metalness:1}),blackRim:std(0x1b1c1f,{roughness:.35,metalness:.7}),stud:std(0xe8eef3,{roughness:.2,metalness:1}),
    slick:std(0x151515,{roughness:.55})
  });
}

// ---------------------------------------------------------------------- body panels
const paintOf=p=>p==='rust'?CARMAT.rust:paintMat(p);
function buildHood(p){const paint=paintOf(p),g=new THREE.Group();part(g,G.box,paint,0,0,0,1.42,.05,1.38);part(g,G.box,CARMAT.chrome,0,.03,.6,.08,.02,.2);
  part(g,G.box,CARMAT.engineDark,0,-.03,0,1.2,.01,1.2);return g;}
function buildTrunk(p){const paint=paintOf(p),g=new THREE.Group();part(g,G.box,paint,0,0,0,1.42,.05,1.2);part(g,G.box,CARMAT.chrome,0,0,-.58,.3,.04,.03);return g;}
function buildTailgate(p){const paint=paintOf(p),g=new THREE.Group();part(g,G.box,paint,0,0,0,1.62,.5,.05);part(g,G.box,CARMAT.chrome,0,.15,-.03,.24,.05,.02);return g;}
function buildDoor(side,p,glass){const paint=paintOf(p),d=new THREE.Group();
  d.add(sharedMesh(CG.door,paint));
  if(glass){const gl=sharedMesh(CG.doorGlass,CARMAT.glass);gl.position.x=-.03;gl.castShadow=false;d.add(gl);}
  const fr=sharedMesh(CG.doorFrame,paint);fr.position.x=-.01;d.add(fr);
  part(d,G.box,CARMAT.chrome,-.035,.965,-.05,.09,.025,1.78);
  part(d,G.box,CARMAT.chrome,side>0?.015:-.085,.82,-.6,.03,.04,.16);
  part(d,G.box,CARMAT.seat,side>0?-.09:.02,.66,-.05,.03,.5,1.7);
  part(d,G.box,CARMAT.plastic,side>0?-.11:.04,.72,-.2,.05,.03,.4);
  // wing mirror lives on the door
  part(d,G.box,CARMAT.black,side>0?.03:-.1,1.02,.7,.06,.03,.06);part(d,G.box,CARMAT.black,side>0?.09:-.16,1.08,.7,.04,.11,.16);
  part(d,G.plane,CARMAT.mirror,side>0?.09:-.16,1.08,.615,.035,.1,1,0,Math.PI,0);
  return d;}

// ---------------------------------------------------------------------- engine bay parts
function makeBattery(){
  const g=new THREE.Group();const L=CARMAT.battLabel,T=CARMAT.battTop;
  const b=new THREE.Mesh(G.box,[L,L,T,T,L,L]);b.scale.set(.26,.2,.17);b.castShadow=true;b.userData.shared=true;g.add(b);
  part(g,G.cyl,CARMAT.termRed,.08,.115,0,.018,.03,.018);part(g,G.cyl,CARMAT.black,-.08,.115,0,.018,.03,.018);
  part(g,G.box,CARMAT.black,0,.105,0,.12,.012,.03);return g;
}
function makeRadiator(){
  const g=new THREE.Group();
  part(g,G.box,CARMAT.engineDark,0,0,0,1.15,.44,.05);
  part(g,G.plane,CARMAT.fins,0,0,.03,1.0,.36,1);part(g,G.plane,CARMAT.fins,0,0,-.03,1.0,.36,1,0,Math.PI,0);
  part(g,G.box,CARMAT.engine,-.55,0,0,.08,.46,.09);part(g,G.box,CARMAT.engine,.55,0,0,.08,.46,.09);
  part(g,G.cyl,CARMAT.termRed,.4,.25,0,.035,.04,.035);return g;
}
const coverMats={};
function makeEngine(type='V6'){
  const E=ENGINES[type]||ENGINES.V6,g=new THREE.Group(),w=E.w;
  const cover=coverMats[type]||(coverMats[type]=std(E.cover,{roughness:.35,metalness:.45}));
  part(g,G.box,CARMAT.engine,0,0,0,w,.3,.55);                         // block
  part(g,G.box,CARMAT.engineDark,0,-.16,0,w-.04,.08,.5);              // oil pan
  if(type==='I4'){part(g,G.box,cover,0,.2,0,.2,.1,.5);for(let k=0;k<4;k++)part(g,G.cyl,CARMAT.black,.12,.22,-.18+k*.12,.015,.06,.015);part(g,G.cyl,CARMAT.black,-.15,.26,.05,.13,.07,.13);}
  else{
    const tilt=type==='diesel'?.25:.45;
    for(const sx of[1,-1]){part(g,G.box,cover,sx*w*.4,.21,0,.16,.1,.52,0,0,-sx*tilt);part(g,G.box,CARMAT.engineDark,sx*(w/2+.06),.04,0,.06,.1,.46);}
    part(g,G.box,CARMAT.engine,0,.22,0,.22,.1,.45);
    if(type==='V8'){part(g,G.cyl,CARMAT.chrome,0,.34,0,.27,.09,.27);part(g,G.cyl,CARMAT.chrome,0,.4,0,.04,.03,.04);
      for(const sx of[1,-1])for(let k=0;k<4;k++)part(g,G.cyl,CARMAT.chrome,sx*(w/2+.1),.0,-.18+k*.12,.025,.08,.025,0,0,Math.PI/2);}
    else if(type==='diesel'){ // turbo snail
      const t=part(g,new THREE.TorusGeometry(.07,.04,8,16),CARMAT.engine,.3,.18,.12,1,1,1,0,Math.PI/2,0);t.userData.shared=false;
      part(g,G.cyl,CARMAT.engine,.3,.18,.12,.05,.12,.05,0,0,Math.PI/2);part(g,G.box,CARMAT.black,0,.33,0,.4,.04,.4);}
    else{part(g,G.cyl,CARMAT.black,0,.32,0,.21,.08,.21);part(g,G.cyl,CARMAT.chrome,0,.37,0,.03,.02,.03);}
  }
  // front accessories (towards +z = radiator side)
  part(g,G.cyl,CARMAT.engine,.3*w/.5,.14,.3,.07,.1,.07,0,0,Math.PI/2);
  const belt=part(g,new THREE.TorusGeometry(.1,.012,6,20),CARMAT.hose,0,.04,.31,1,1,1,0,Math.PI/2,0);belt.userData.shared=false;
  part(g,G.cyl,CARMAT.engineDark,0,.04,.31,.07,.04,.07,0,0,Math.PI/2);
  part(g,G.cyl,CARMAT.engineDark,0,.06,.42,.05,.04,.05,Math.PI/2,0,0);
  for(let k=0;k<4;k++)part(g,G.box,CARMAT.engineDark,0,.06,.43,.05,.34,.012,0,0,k*Math.PI/4);
  beam(g,G.cyl,CARMAT.hose,[-.3,.17,.63],[-.18,.14,.2],.035,.035,'y');
  beam(g,G.cyl,CARMAT.hose,[.3,-.08,.63],[.2,-.08,.2],.035,.035,'y');
  return g;
}
const seatMat=t=>t==='sport'?PM.seatSport:t==='racing'?PM.seatRace:PM.seatStd;
function makeSeat(type='standard'){
  const g=new THREE.Group(),m=seatMat(type);
  part(g,G.box,m,0,0,0,.5,.13,.5);
  if(type==='racing'){
    part(g,G.box,m,0,.4,-.27,.5,.78,.1,-.12,0,0);
    for(const sx of[1,-1]){part(g,G.box,m,sx*.23,.1,0,.06,.14,.46);part(g,G.box,m,sx*.23,.42,-.24,.07,.6,.12,-.12,0,0);
      part(g,G.box,PM.harness,sx*.1,.45,-.2,.05,.6,.01,-.12,0,0);}
    part(g,G.box,CARMAT.black,0,.62,-.22,.18,.1,.02,-.12,0,0);
  } else {
    part(g,G.box,m,0,.34,-.28,.5,.6,.11,-.15,0,0);
    part(g,G.box,m,0,.71,-.32,.26,.14,.1,-.15,0,0);
    if(type==='sport'){for(const sx of[1,-1]){part(g,G.box,m,sx*.22,.36,-.24,.07,.5,.14,-.15,0,0);part(g,G.box,m,sx*.22,.08,0,.06,.1,.44);}
      part(g,G.box,PM.seatStripe,0,.34,-.223,.08,.58,.01,-.15,0,0);part(g,G.box,PM.seatStripe,0,.066,0,.08,.01,.46);}
  }
  part(g,G.box,CARMAT.engineDark,0,-.1,0,.42,.06,.42);
  return g;
}

// ---------------------------------------------------------------------- tyres & rims
function makeRim(type='steel'){
  const g=new THREE.Group();
  const face=type==='chrome'?CARMAT.rim:type==='black'?PM.blackRim:type==='gold'?PM.gold:CARMAT.rimDark;
  part(g,CG.rim,type==='steel'?CARMAT.rimDark:face,0,0,0,1,1,1);
  const spokes={steel:0,chrome:5,black:6,gold:8}[type]||0;
  for(const sx of[1,-1]){
    if(type==='steel'){part(g,CG.dish,CARMAT.rim,sx*.1,0,0,1,1,1);part(g,CG.hub,CARMAT.chrome,sx*.13,0,0,1,1,1);}
    else{part(g,CG.hub,face,sx*.11,0,0,1.3,1.3,1.3);
      for(let k=0;k<spokes;k++){const a=k/spokes*Math.PI*2;part(g,G.box,face,sx*.105,Math.cos(a)*.11,Math.sin(a)*.11,.03,.16,.035,a,0,0);}}
    for(let k=0;k<5;k++){const a=k/5*Math.PI*2;part(g,CG.lug,CARMAT.chrome,sx*.14,Math.cos(a)*.05,Math.sin(a)*.05,1,1,1);}
  }
  return g;
}
function makeTyre(type='road'){
  const g=new THREE.Group();
  const tread=type==='slick'?PM.slick:CARMAT.tyre;
  const t=part(g,CG.tyre,tread,0,0,0,1,1,1);if(type==='slick')t.scale.x=1.15;
  for(const sx of[.11,-.11]){part(g,CG.shoulder,CARMAT.rubber,sx*(type==='slick'?1.1:1),0,0,1,1,1);part(g,CG.sidewall,CARMAT.rubber,sx*1.05*(type==='slick'?1.1:1),0,0,1,1,1);}
  if(type==='offroad'){for(let k=0;k<18;k++){const a=k/18*Math.PI*2;for(const sx of[-.06,.06])part(g,G.box,CARMAT.rubber,sx+(k%2?.02:-.02),Math.cos(a)*.37,Math.sin(a)*.37,.09,.035,.07,a,0,0);}}
  if(type==='snow'){for(let k=0;k<24;k++){const a=k/24*Math.PI*2;part(g,G.box,PM.stud,(k%3-1)*.07,Math.cos(a)*.362,Math.sin(a)*.362,.012,.012,.012);}}
  return g;
}
function makeWheel(rim='steel',tyre='road'){
  const w=new THREE.Group();const r=makeRim(rim);r.userData.desc={k:'rim',v:rim};w.add(r);w.userData.rimObj=r;
  if(tyre){const t=makeTyre(tyre);t.userData.desc={k:'tyre',v:tyre};w.add(t);w.userData.tyreObj=t;}
  w.userData.desc={k:'wheel'};return w;
}
// descriptor of a wheel always reflects what's actually on it
function wheelDesc(w){const r=w.userData.rimObj,t=w.userData.tyreObj;return t?{k:'wheel',rim:r.userData.desc.v,tyre:t.userData.desc.v}:{k:'rim',v:r.userData.desc.v};}
function putTyreOn(w,t){w.add(t);t.position.set(0,0,0);t.rotation.set(0,0,0);t.scale.set(1,1,1);t.visible=true;w.userData.tyreObj=t;}
function takeTyreOff(w){const t=w.userData.tyreObj;if(!t)return null;w.remove(t);w.userData.tyreObj=null;return t;}

// ---------------------------------------------------------------------- guns, target, chicken
function makeGun(type){
  const g=new THREE.Group();
  if(type==='pistol'){
    part(g,G.box,PM.gunMetal,0,.03,0,.04,.045,.22);part(g,G.box,PM.gunMetal,0,-.005,-.01,.034,.03,.18);
    part(g,G.box,PM.gunGrip,0,-.07,-.07,.036,.12,.055,.25,0,0);
    part(g,G.cyl,PM.gunMetal,0,.03,.12,.012,.03,.012,Math.PI/2,0,0);
    part(g,G.box,PM.gunMetal,0,.058,.09,.006,.012,.01);part(g,G.box,PM.gunMetal,0,.058,-.09,.02,.012,.01);
    const tg=part(g,new THREE.TorusGeometry(.022,.004,6,12),PM.gunMetal,0,-.035,-.02,1,1,1,0,Math.PI/2,0);tg.userData.shared=false;
  } else {
    part(g,G.box,PM.wood,0,-.02,-.33,.05,.11,.32,.06,0,0);
    part(g,G.box,PM.gunMetal,0,.01,-.06,.055,.07,.28);
    part(g,G.cyl,PM.gunMetal,0,.02,.36,.014,.6,.014,Math.PI/2,0,0);
    part(g,G.box,PM.wood,0,-.015,.18,.05,.05,.32);
    part(g,G.box,PM.gunMetal,0,-.07,-.03,.035,.1,.06,-.2,0,0);
    part(g,G.cyl,PM.gunMetal,0,.085,-.05,.022,.24,.022,Math.PI/2,0,0);part(g,G.cyl,PM.lens,0,.085,.075,.024,.01,.024,Math.PI/2,0,0);
    part(g,G.box,PM.gunMetal,0,.06,-.05,.02,.03,.04);part(g,G.cyl,PM.gunMetal,.04,.02,-.12,.008,.05,.008,0,0,Math.PI/2);
  }
  return g;
}
function makeTarget(){const g=new THREE.Group();part(g,G.circle,PM.target,0,1.05,.035,.45,.45,1);part(g,G.circle,PM.wood,0,1.05,.03,.47,.47,1,0,Math.PI,0);
  part(g,G.cyl,PM.wood,0,1.05,.0,.47,.05,.47,Math.PI/2,0,0);
  for(const sx of[-.3,.3])part(g,G.box,PM.wood,sx,.55,-.12,.05,1.1,.05,.2,0,0);return g;}
function makeChicken(){
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);
  part(body,G.sphere,PM.chicken,0,.27,0,.15,.13,.19);
  part(body,G.sphere,PM.chicken,0,.33,-.16,.09,.1,.07,-.6,0,0);           // tail
  for(const s of[1,-1]){const w=part(body,G.sphere,PM.chicken,s*.13,.28,0,.04,.09,.14);w.name='wing'+(s>0?'L':'R');}
  const head=new THREE.Group();head.position.set(0,.42,.15);body.add(head);
  part(head,G.sphere,PM.chicken,0,0,0,.075,.08,.075);
  part(head,G.cone,PM.beak,0,-.005,.085,.025,.05,.02,Math.PI/2,0,0);
  for(const k of[-1,0,1])part(head,G.sphere,PM.comb,0,.075+(k===0?.015:0),.01+k*.025,.012,.03,.02);
  part(head,G.sphere,PM.comb,0,-.05,.06,.015,.03,.012);
  for(const s of[1,-1])part(head,G.sphere,CARMAT.black,s*.055,.02,.04,.012,.012,.012);
  const legs=[];
  for(const s of[1,-1]){const L=new THREE.Group();L.position.set(s*.05,.17,0);g.add(L);part(L,G.cyl,PM.legs,0,-.08,0,.012,.16,.012);part(L,G.box,PM.legs,0,-.16,.03,.05,.01,.08);legs.push(L);}
  g.userData.rig={body,head,legs,wings:[body.getObjectByName('wingL'),body.getObjectByName('wingR')]};
  return g;
}

// ---------------------------------------------------------------------- detailed food & supplies
const LATHE={};
function lathe(key,pts,seg=20){return LATHE[key]||(LATHE[key]=new THREE.LatheGeometry(pts.map(([x,y])=>new THREE.Vector2(x,y)),seg));}
function makeFood(k){
  const g=new THREE.Group();
  if(k==='beans'||k==='soup'){
    const side=k==='beans'?PM.beans:PM.soup;const m=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.13,24,1,true),side);m.position.y=.075;m.castShadow=true;g.add(m);
    part(g,lathe('canEnd',[[0,0],[.058,0],[.062,.006],[.06,.01],[0,.008]]),PM.tin,0,.138,0,1,1,1);part(g,lathe('canEnd',[[0,0]]),PM.tin,0,.012,0,1,-1,1);
    part(g,G.cyl,PM.tin,0,.01,0,.061,.012,.061);
  } else if(k==='bread'){
    part(g,G.box,PM.crust,0,.05,0,.14,.08,.24);part(g,G.cyl,PM.crust,0,.09,0,.07,.24,.05,0,0,Math.PI/2);
    for(let i=-1;i<=1;i++)part(g,G.box,PM.crumb,0,.135,i*.06,.08,.008,.015,0,.4,0);
  } else if(k==='water'){
    part(g,lathe('bottle',[[0,0],[.045,0],[.05,.01],[.05,.17],[.04,.2],[.017,.235],[.017,.25],[0,.25]]),PM.water,0,0,0,1,1,1);
    part(g,G.cyl,PM.waterLabel,0,.1,0,.051,.06,.051);part(g,G.cyl,PM.blueCap,0,.26,0,.02,.025,.02);
  } else if(k==='bananas'){
    for(let i=0;i<4;i++){const c=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.02,0),new THREE.Vector3(.08,.03+i*.005,-.02+i*.012),new THREE.Vector3(.17,.08,(i-1.5)*.03));
      const m=new THREE.Mesh(new THREE.TubeGeometry(c,10,.022,8,false),PM.banana);m.castShadow=true;g.add(m);}
    part(g,G.cyl,PM.bananaTip,-.01,.025,0,.015,.04,.015,0,0,1.3);
  } else if(k==='coconut'){part(g,G.ico,PM.husk,0,.11,0,.11,.12,.1);for(const a of[0,2.1,4.2])part(g,G.sphere,CARMAT.black,Math.cos(a)*.025,.225,Math.sin(a)*.025,.012,.008,.012);}
  else if(k==='egg'){part(g,G.sphere,PM.egg,0,.05,0,.04,.052,.04);}
  return g;
}
function makeJerry(){const g=new THREE.Group();part(g,G.box,M.redCan,0,.33,0,.5,.62,.22);
  for(const s of[1,-1]){part(g,G.box,M.redCan,0,.33,s*.114,.44,.04,.012,0,0,.9);part(g,G.box,M.redCan,0,.33,s*.114,.44,.04,.012,0,0,-.9);}
  for(const dx of[-.12,0,.12])part(g,G.box,M.redCan,dx,.69,0,.04,.1,.05);part(g,G.box,M.redCan,0,.74,0,.3,.04,.05);
  part(g,G.cyl,M.kitGrey,.19,.7,0,.035,.08,.035);return g;}
function makeToolbox(){const g=new THREE.Group();part(g,G.box,M.kit,0,.13,0,.7,.26,.3);part(g,G.box,M.kit,0,.3,0,.72,.08,.32);
  for(const s of[1,-1])part(g,G.box,CARMAT.chrome,s*.25,.26,.162,.06,.06,.01);
  part(g,G.box,M.kitGrey,0,.4,0,.42,.04,.05);for(const s of[1,-1])part(g,G.box,M.kitGrey,s*.2,.36,0,.03,.08,.04);return g;}
function makeProp(k){const g=new THREE.Group();
  if(k==='barrel'){part(g,G.cyl,M.barrel,0,.45,0,.3,.9,.3);for(const y of[.15,.45,.75])part(g,G.cyl,M.barrelRing,0,y,0,.305,.03,.305);part(g,G.cyl,M.barrelRing,.15,.9,0,.04,.02,.04);}
  else if(k==='crate'){part(g,G.box,M.crate,0,.4,0,.8,.8,.8);for(const s of[-1,1]){part(g,G.box,M.trunk,s*.41,.4,0,.02,.8,.12);part(g,G.box,M.trunk,0,.4,s*.41,.12,.8,.02);}}
  else if(k==='cone'){part(g,G.cone,M.cone,0,.35,0,.18,.7,.18);part(g,G.cyl,M.coneW,0,.4,0,.115,.08,.115);part(g,G.cyl,M.coneW,0,.22,0,.15,.06,.15);part(g,G.box,M.cone,0,.02,0,.4,.04,.4);}
  return g;}
function makeCD(id){const cd=CD_BY_ID[id],g=new THREE.Group();if(!cdMatCache[id])cdMatCache[id]=std(cd.col,{roughness:.4});
  part(g,G.box,M.cdCase,0,.01,0,.14,.012,.125);part(g,G.cyl,M.cd,0,.018,0,.06,.002,.06);part(g,G.cyl,cdMatCache[id],0,.0195,0,.045,.002,.045);return g;}

// ---------------------------------------------------------------------- the one factory
// desc.k is the base kind; desc.v the variant; desc.p the paint colour ('rust' for rusty)
const CD_BY_ID=Object.fromEntries(CD_SONGS.map(c=>[c.id,c]));const cdMatCache={};
function makeFromDesc(desc){
  const k=desc.k;let o;
  switch(k){
    case 'hood':o=buildHood(desc.p);break;
    case 'trunk':o=buildTrunk(desc.p);break;
    case 'tailgate':o=buildTailgate(desc.p);break;
    case 'doorL':o=buildDoor(1,desc.p,desc.g!==0);break;
    case 'doorR':o=buildDoor(-1,desc.p,desc.g!==0);break;
    case 'battery':o=makeBattery();break;
    case 'radiator':o=makeRadiator();break;
    case 'engine':o=makeEngine(desc.v||'V6');break;
    case 'seat':o=makeSeat(desc.v||'standard');break;
    case 'wheel':o=makeWheel(desc.rim||'steel',desc.tyre||'road');break;
    case 'rim':o=makeWheel(desc.v||'steel',null);break;
    case 'tyre':o=makeTyre(desc.v||'road');break;
    case 'jerry':o=makeJerry();break;
    case 'toolbox':o=makeToolbox();break;
    case 'barrel':case 'crate':case 'cone':o=makeProp(k);break;
    case 'target':o=makeTarget();break;
    case 'pistol':case 'rifle':o=makeGun(k);break;
    case 'chicken':o=makeChicken();break;
    default:o=CD_BY_ID[k]?makeCD(k):makeFood(k);
  }
  o.userData.desc=Object.assign({},desc);
  if(k==='wheel'||k==='rim')o.userData.desc=wheelDesc(o);
  return o;
}
function descOf(o){if(!o)return null;if(o.userData.rimObj)return wheelDesc(o);return Object.assign({},o.userData.desc);}
function kindOf(o){return descOf(o).k;}
// which slot types accept which kinds
function fits(slotType,kind){return slotType===kind||(slotType==='wheel'&&kind==='rim');}

const isFood=k=>!!FOOD[k];
const isCD=k=>!!CD_BY_ID[k];
const isSmall=k=>isFood(k)||isCD(k);
const isProp=k=>k==='barrel'||k==='crate'||k==='cone'||k==='target';
const isGun=k=>k==='pistol'||k==='rifle';
function descName(d){
  if(!d)return '';const k=d.k;
  if(FOOD[k])return FOOD[k].name.toLowerCase();
  if(isCD(k))return 'CD: '+CD_BY_ID[k].name;
  if(k==='engine')return ENGINES[d.v||'V6'].name;
  if(k==='seat')return SEATS[d.v||'standard'].name.toLowerCase();
  if(k==='tyre')return TYRES[d.v||'road'].name.toLowerCase();
  if(k==='rim')return RIMS[d.v||'steel'].name.toLowerCase();
  if(k==='wheel')return `wheel (${TYRES[d.tyre||'road'].name.toLowerCase()})`;
  if(k==='pistol')return 'pistol';if(k==='rifle')return 'rifle';if(k==='target')return 'target';if(k==='chicken')return 'chicken';
  return PART_NAMES[k]||k;
}
function descEm(d){const k=d.k;return FOOD[k]?FOOD[k].em:isCD(k)?'💿':({engine:'⚙️',seat:'💺',tyre:'🛞',rim:'⭕',wheel:'🛞',pistol:'🔫',rifle:'🔫',target:'🎯',chicken:'🐔'})[k]||PART_EM[k]||'❔';}
FOOD.egg={name:'Egg',em:'🥚',val:12};
PART_NAMES.engine='engine';PART_NAMES.seat='seat';PART_NAMES.tyre='tyre';PART_NAMES.rim='rim';

// everything the sandbox menu can spawn
const SPAWNABLE=[
  ...['beans','soup','bread','water','bananas','coconut','egg'].map(k=>({k})),
  {k:'jerry'},{k:'toolbox'},{k:'battery'},{k:'radiator'},
  ...Object.keys(ENGINES).map(v=>({k:'engine',v})),
  ...Object.keys(SEATS).map(v=>({k:'seat',v})),
  ...Object.keys(TYRES).map(v=>({k:'tyre',v})),
  ...Object.keys(RIMS).map(v=>({k:'rim',v})),
  {k:'wheel',rim:'steel',tyre:'road'},
  {k:'chicken'},{k:'pistol'},{k:'rifle'},{k:'target'},
  {k:'barrel'},{k:'crate'},{k:'cone'},
  ...CD_SONGS.map(c=>({k:c.id}))
];

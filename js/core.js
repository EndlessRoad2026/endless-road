'use strict';
// ====================================================================== core: settings, helpers, renderer, textures, materials
const lin=h=>new THREE.Color(h).convertSRGBToLinear();

const SETTINGS = {
  desert: {
    key:'desert', name:'Desert', skyTop:0x2f7fe0, horizon:0xcfe0ef, stormSky:0xc08a50,
    fogFar:480, stormFogFar:65,
    ground:[0xe9b766,0xd9a04c,0xc68a3c], road:'asphalt',
    lowAmp:10, detailAmp:3.5, mtnAmp:24,
    grip:7, offGrip:4, maxSpeed:40, offMax:22, offDrag:.5,
    hazard:'heat', weather:'sandstorm', patch:'sand',
    sunDir:[.45,.62,-.35], sunCol:0xfff1d8, sunI:2.9, hemi:[0xcfe2ff,0xc0965a,.55],
    stormName:'🌪️ Sandstorm!', stormMsg:'Sandstorm! You can hardly see.',
    foods:['beans','water','bread'], house:{wall:0xb89a7a,floor:0xc08a5a,trim:0x5a3e28,door:0x7a5a3c},
    mesa:[0xb5653a,0xcf8a52], poles:true
  },
  snow: {
    key:'snow', name:'Snowy Mountains', skyTop:0x5d86b8, horizon:0xdfe7ef, stormSky:0xeef2f6,
    fogFar:380, stormFogFar:55,
    ground:[0xf7f9fc,0xe4ebf2,0xd2dce6], road:'snowy',
    lowAmp:15, detailAmp:4, mtnAmp:80,
    grip:3.4, offGrip:2.2, maxSpeed:34, offMax:14, offDrag:1.1,
    hazard:'cold', weather:'blizzard', patch:'ice',
    sunDir:[.4,.42,-.5], sunCol:0xfff6ee, sunI:2.2, hemi:[0xdce8ff,0x9aa7b6,.6],
    stormName:'❄️ Blizzard!', stormMsg:'Blizzard! It is getting colder fast.',
    foods:['soup','bread','water'], house:{wall:0x8a6446,floor:0xa0784f,trim:0x3e2a1b,door:0x5c3f2a},
    mesa:[0x7f868d,0x6b7178], poles:true
  },
  jungle: {
    key:'jungle', name:'Jungle', skyTop:0x4f8cc0, horizon:0xc2d4bd, stormSky:0x6b7d6c,
    fogFar:250, stormFogFar:95,
    ground:[0x3f7531,0x2f5c26,0x52692c], road:'dirt',
    lowAmp:8, detailAmp:5, mtnAmp:28,
    grip:6, offGrip:3.2, maxSpeed:32, offMax:13, offDrag:1.0,
    hazard:'none', weather:'rain', patch:'mud',
    sunDir:[.3,.7,-.3], sunCol:0xfff2d6, sunI:2.4, hemi:[0xd7f0dc,0x40552d,.6],
    stormName:'🌧️ Heavy rain', stormMsg:'Rain! The road is slippery and the mud is deeper.',
    foods:['bananas','coconut','beans','water'], house:{wall:0x8b7656,floor:0x9a7550,trim:0x3e3020,door:0x5a4630},
    mesa:[0x6b6d5e,0x5d6152], poles:true
  }
};
const FOOD={
  beans:{name:'Can of beans',em:'🥫',val:30},
  soup:{name:'Can of soup',em:'🥫',val:32},
  bread:{name:'Bread',em:'🍞',val:25},
  water:{name:'Water bottle',em:'💧',val:15},
  bananas:{name:'Bananas',em:'🍌',val:20},
  coconut:{name:'Coconut',em:'🥥',val:22}
};
const PART_NAMES={hood:'bonnet',trunk:'boot lid',tailgate:'tailgate',doorL:'left door',doorR:'right door',wheel:'wheel',battery:'battery',radiator:'radiator',jerry:'jerry can',toolbox:'repair kit',barrel:'barrel',crate:'crate',cone:'traffic cone'};
const PART_EM={hood:'🚘',trunk:'🚘',tailgate:'🚘',doorL:'🚪',doorR:'🚪',wheel:'🛞',battery:'🔋',radiator:'♨️',jerry:'⛽',toolbox:'🧰',barrel:'🛢️',crate:'📦',cone:'🚧'};

// ---------------------------------------------------------------------- noise & helpers
let SEED=1,S=SETTINGS.desert,ROFF=0;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function hash2(ix,iy){let h=Math.imul(ix,374761393)^Math.imul(iy,668265263)^SEED;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;}
function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  const a=hash2(ix,iy),b=hash2(ix+1,iy),c=hash2(ix,iy+1),d=hash2(ix+1,iy+1);return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;}
function fbm(x,y){let s=0,a=.5,f=1;for(let i=0;i<4;i++){s+=a*noise(x*f,y*f);f*=2;a*=.5;}return s/.9375;}
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function roadX(z){return 46*Math.sin(z/320+ROFF)+17*Math.sin(z/101+ROFF*2.3);}
function roadSlope(z){return (roadX(z+1)-roadX(z-1))/2;}
function lowH(x,z){return S.lowAmp*(noise(x*.0035+100,z*.0035)*2-1);}
function roadH(z){return lowH(roadX(z),z);}
function groundH(x,z){
  const d=Math.abs(x-roadX(z)),t=smooth(6,24,d);
  if(t===0)return roadH(z);
  const nat=lowH(x,z)+S.detailAmp*(fbm(x*.025,z*.025)*2-1)+S.mtnAmp*smooth(40,240,d)*fbm(x*.008+50,z*.008);
  return roadH(z)*(1-t)+nat*t;
}
function surfaceH(x,z){return Math.abs(x-roadX(z))<5.5?roadH(z)+.06:groundH(x,z);}

// ---------------------------------------------------------------------- renderer / scene
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(1.75,window.devicePixelRatio||1));
renderer.setSize(innerWidth,innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,1000);
const hemi=new THREE.HemisphereLight(0xffffff,0x888888,.6);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,2);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:220});
sun.shadow.bias=-0.0004;sun.shadow.normalBias=.03;
scene.add(sun,sun.target);
scene.fog=new THREE.Fog(0xffffff,40,400);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

const skyU={top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color(1,1,1)},haze:{value:0}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(900,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyU,
  vertexShader:'varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
  fragmentShader:'uniform vec3 top,horizon,sunCol,sunDir;uniform float haze;varying vec3 vD;void main(){vec3 d=normalize(vD);float h=clamp(d.y,0.,1.);vec3 c=mix(horizon,top,pow(h,.45)*(1.-haze));float s=max(dot(d,normalize(sunDir)),0.);c+=sunCol*(pow(s,900.)*2.5+pow(s,10.)*.22)*(1.-haze*.9);if(d.y<0.)c=horizon;gl_FragColor=vec4(c,1.);}'
}));
sky.renderOrder=-2;sky.frustumCulled=false;scene.add(sky);
const pmrem=new THREE.PMREMGenerator(renderer);let envRT=null;
function buildEnv(){
  const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
  const hex=h=>'#'+new THREE.Color(h).getHexString();
  const gr=x.createLinearGradient(0,0,0,128);gr.addColorStop(0,hex(S.skyTop));gr.addColorStop(.47,hex(S.horizon));gr.addColorStop(.5,hex(S.horizon));gr.addColorStop(.53,hex(S.ground[1]));gr.addColorStop(1,hex(S.ground[2]));
  x.fillStyle=gr;x.fillRect(0,0,256,128);
  x.fillStyle='rgba(255,255,240,.9)';x.beginPath();x.arc(64,22,6,0,7);x.fill();
  const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;t.encoding=THREE.sRGBEncoding;
  try{if(envRT)envRT.dispose();envRT=pmrem.fromEquirectangular(t);scene.environment=envRT.texture;}catch(e){scene.environment=null;}
  t.dispose();
}

// ---------------------------------------------------------------------- procedural textures
function makeGrid(P,seed){const r=seed?mulberry32(seed):Math.random;const g=new Float32Array(P*P);for(let i=0;i<g.length;i++)g[i]=r();
  return(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  const i0=((ix%P)+P)%P,i1=(i0+1)%P,j0=((iy%P)+P)%P,j1=(j0+1)%P;const a=g[j0*P+i0],b=g[j0*P+i1],c=g[j1*P+i0],d=g[j1*P+i1];return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;};}
function canvasOf(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function pixCanvas(w,h,fn){const c=canvasOf(w,h);const ctx=c.getContext('2d');const img=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=fn(x,y);const k=(y*w+x)*4;img.data[k]=v[0];img.data[k+1]=v[1];img.data[k+2]=v[2];img.data[k+3]=255;}
  ctx.putImageData(img,0,0);return c;}
function texOf(c,srgb=true,rep=true){const t=new THREE.CanvasTexture(c);if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=ANISO;if(srgb)t.encoding=THREE.sRGBEncoding;return t;}
// normal map from the brightness of a canvas (dark = lower), tileable
function normalFrom(c,strength=2){
  const w=c.width,h=c.height,d=c.getContext('2d').getImageData(0,0,w,h).data;const H=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)H[i]=(d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11)/255;
  const o=canvasOf(w,h),ox=o.getContext('2d'),img=ox.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=(H[y*w+(x+1)%w]-H[y*w+(x-1+w)%w])*strength,dy=(H[((y+1)%h)*w+x]-H[((y-1+h)%h)*w+x])*strength;
    let nx=-dx,ny=dy,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;const k=(y*w+x)*4;
    img.data[k]=(nx*.5+.5)*255;img.data[k+1]=(ny*.5+.5)*255;img.data[k+2]=(nz*.5+.5)*255;img.data[k+3]=255;}
  ox.putImageData(img,0,0);return texOf(o,false);
}
const TC={};
function cached(k,f){return TC[k]||(TC[k]=f());}
function groundTex(kind){return cached('g'+kind,()=>{
  const n1=makeGrid(16,3),n2=makeGrid(64,4),rr=mulberry32(5);
  const c=pixCanvas(256,256,(x,y)=>{
    const a=n1(x/16,y/16),b=n2(x/4,y/4),r=rr();let v;
    if(kind==='desert'){v=222+Math.sin((x*.9+y*.25+a*40)/256*Math.PI*2*9)*16+b*16+r*12-16;}
    else if(kind==='snow'){v=238+a*10+b*6+(r>.996?17:0)-6;}
    else{const blade=n2(x/1.5,y/6);v=170+blade*75+a*20+r*20-20;}
    v=clamp(v,0,255);return[v,v,v];});
  return {map:texOf(c),normal:normalFrom(c,kind==='desert'?3:kind==='snow'?1.2:2.5)};});}
function roadTex(kind){return cached('r'+kind,()=>{
  const n1=makeGrid(16,6),n2=makeGrid(64,7),n3=makeGrid(8,8),rr=mulberry32(9);
  const W=256,H=512;
  const c=pixCanvas(W,H,(x,y)=>{
    const a=n1(x/16,y/32),b=n2(x/4,y/8),r=rr(),u=x/W;
    if(kind==='asphalt'){
      let v=64+a*22+b*14+r*22;
      const edge=(u>.035&&u<.065)||(u>.935&&u<.965),wear=n3(x/32,y/32)>.33;
      if(edge&&wear)return[205+r*30,205+r*30,195+r*30];
      if(u>.487&&u<.513&&(y%512)<213&&wear)return[225,186,60+r*30];
      if(u<.02||u>.98)v*=.8;return[v,v*.98,v*.95];}
    if(kind==='snowy'){
      let v=88+a*20+b*12+r*14;const track=Math.min(Math.abs(u-.28),Math.abs(u-.72));
      const s=clamp(clamp((n1(x/10,y/20)-.25)*1.6,0,1)*(track<.08?.15:1)+smooth(.3,.06,Math.min(u,1-u))*1.2,0,1);const w=230+r*20;
      return[v+(w-v)*s,v+(w-v)*s,v+(w+8-v)*s];}
    const track=Math.min(Math.abs(u-.28),Math.abs(u-.72));
    let R=128+a*30+b*20+r*16,G=96+a*22+b*15+r*12,B=64+a*14+b*10+r*8;
    if(track<.07){R*=.72;G*=.7;B*=.68;}
    if(Math.abs(u-.5)<.07&&n2(x/2,y/2)>.55){R=70;G=110+r*40;B=40;}
    if(u<.04||u>.96){R=R*.6+30;G=G*.6+55;B=B*.6+20;}
    return[R,G,B];});
  if(kind==='asphalt'){ // cracks and patches
    const ctx=c.getContext('2d');const cr=mulberry32(11);ctx.strokeStyle='rgba(20,20,20,.55)';
    for(let k=0;k<14;k++){ctx.lineWidth=.6+cr();ctx.beginPath();let x=cr()*W,y=cr()*H;ctx.moveTo(x,y);for(let s=0;s<8;s++){x+=(cr()-.5)*30;y+=(cr()-.3)*28;ctx.lineTo(x,y);}ctx.stroke();}
    ctx.fillStyle='rgba(30,30,32,.35)';for(let k=0;k<4;k++)ctx.fillRect(30+cr()*180,cr()*H,20+cr()*40,20+cr()*50);
  }
  return {map:texOf(c),normal:normalFrom(c,kind==='dirt'?3:1.6)};});}
function rustTex(){return cached('rust',()=>{
  const n1=makeGrid(8,12),n2=makeGrid(32,13),rr=mulberry32(14);
  const c=pixCanvas(256,256,(x,y)=>{const a=n1(x/32,y/32),b=n2(x/8,y/8),r=rr();
    const rust=clamp((a*.7+b*.5-.45)*3,0,1);const base=[96+a*30,90+a*26,84+a*22],rc=[110+b*45,52+b*22,26];
    return base.map((v,i)=>v*(1-rust)+rc[i]*rust+(r-.5)*16);});
  return {map:texOf(c),normal:normalFrom(c,2.5)};});}
function corrugatedTex(){return cached('corr',()=>{
  const n1=makeGrid(8,15),rr=mulberry32(16);
  const c=pixCanvas(128,128,(x,y)=>{const s=150+Math.sin(x/128*Math.PI*2*10)*45;const a=n1(x/16,y/16);const rust=clamp((a-.45)*3,0,1);const r=(rr()-.5)*10;
    return[s*(1-rust)+150*rust+r,s*(1-rust)+80*rust+r,s*(1-rust)+45*rust+r];});
  return {map:texOf(c),normal:normalFrom(c,4)};});}
// wood planks: horizontal = planks run along u
function plankTex(horizontal){return cached('plank'+(horizontal?'h':'v'),()=>{
  const n1=makeGrid(64,17),n2=makeGrid(8,18),rr=mulberry32(19);const W=256,H=256,PW=32;
  const tone=[];for(let i=0;i<8;i++)tone.push(.82+rr()*.3);
  const knots=[];for(let i=0;i<6;i++)knots.push([rr()*W,rr()*H,4+rr()*5]);
  const c=pixCanvas(W,H,(px,py)=>{
    const x=horizontal?py:px,y=horizontal?px:py;
    const pl=Math.floor(x/PW),inP=x%PW;const shift=pl*53;
    let g=n1(x/2+pl*9,(y+shift)/40)*1.0;g+=Math.sin((x+n2(x/16,(y+shift)/32)*30)*.9)*.25;
    let v=(150+g*40)*tone[pl%8];
    for(const[kx,ky,kr]of knots){const d=Math.hypot(px-kx,py-ky);if(d<kr*2.4)v*=.75+.25*smooth(0,kr*2.4,d);}
    if(inP<1.5||inP>PW-1)v*=.35;
    const endJ=((y+shift)%(H))<1.2;if(endJ)v*=.4;
    v+=(rr()-.5)*10;return[v,v*.78,v*.56];});
  return {map:texOf(c),normal:normalFrom(c,3)};});}
function fabricTex(){return cached('fab',()=>{const rr=mulberry32(21);const c=pixCanvas(64,64,(x,y)=>{const v=170+((x+y)%4<2?14:-14)+(rr()-.5)*14;return[v,v,v];});return {map:texOf(c),normal:normalFrom(c,1.5)};});}
function grilleTex(){return cached('grille',()=>{const c=pixCanvas(128,64,(x,y)=>{const v=(x%8<4)?60:20;const h=(y%16<2)?90:0;const t=Math.max(v,h);return[t,t,t];});return {map:texOf(c),normal:normalFrom(c,4)};});}
function finTex(){return cached('fins',()=>{const c=pixCanvas(128,64,(x,y)=>{const v=(x%3===0)?190:70;return[v*.9,v*.92,v];});return texOf(c);});}
function labelTex(top,lines,bg,fg,stripe){const c=canvasOf(256,128);const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,256,128);
  if(stripe){x.fillStyle=stripe;x.fillRect(0,86,256,18);}x.fillStyle=fg;x.font='bold 40px sans-serif';x.textAlign='center';x.fillText(top,128,52);
  x.font='bold 22px sans-serif';lines.forEach((l,i)=>x.fillText(l,128,80+i*26));const t=texOf(c,true,false);return t;}
function plateTex(text){return cached('plate'+text,()=>{const c=canvasOf(256,64);const x=c.getContext('2d');x.fillStyle='#f6f2e4';x.fillRect(0,0,256,64);
  x.strokeStyle='#222';x.lineWidth=4;x.strokeRect(3,3,250,58);x.fillStyle='#1b1b1b';x.font='bold 40px monospace';x.textAlign='center';x.fillText(text,128,46);return texOf(c,true,false);});}
function gaugeTex(kind){return cached('gauge'+kind,()=>{
  const c=canvasOf(256,256),x=c.getContext('2d'),cx=128,cy=128;
  const gr=x.createRadialGradient(cx,cy,10,cx,cy,128);gr.addColorStop(0,'#1d1f22');gr.addColorStop(1,'#0c0d0e');x.fillStyle=gr;x.beginPath();x.arc(cx,cy,127,0,7);x.fill();
  x.strokeStyle='#c9c9c9';x.lineWidth=6;x.beginPath();x.arc(cx,cy,121,0,7);x.stroke();
  const spec={speed:{max:200,major:20,minor:10,label:'km/h'},rpm:{max:8,major:1,minor:.5,label:'RPM x1000',red:6.5},fuel:{max:1,major:.5,minor:.25,label:'FUEL',txt:['E','½','F']},temp:{max:1,major:.5,minor:.25,label:'TEMP',txt:['C','','H'],red:.8}}[kind];
  const ang=t=>2.3-t*4.6;const pt=(t,r)=>[cx-Math.sin(ang(t))*r,cy-Math.cos(ang(t))*r];
  if(spec.red){x.strokeStyle='#d32f2f';x.lineWidth=12;x.beginPath();x.arc(cx,cy,100,-Math.PI/2-ang(spec.red/spec.max)*-1-Math.PI,0,false);}
  if(spec.red){x.beginPath();const a0=spec.red/spec.max;for(let t=a0;t<=1.0001;t+=.01){const[p,q]=pt(t,100);t===a0?x.moveTo(p,q):x.lineTo(p,q);}x.strokeStyle='#d32f2f';x.lineWidth=12;x.stroke();}
  for(let v=0;v<=spec.max+1e-6;v+=spec.minor){const t=v/spec.max,maj=Math.abs(v/spec.major-Math.round(v/spec.major))<1e-6;
    const[a,b]=pt(t,108),[p,q]=pt(t,maj?86:96);x.strokeStyle='#f1f1f1';x.lineWidth=maj?5:2.5;x.beginPath();x.moveTo(a,b);x.lineTo(p,q);x.stroke();
    if(maj&&!spec.txt){const[tx,ty]=pt(t,64);x.fillStyle='#f1f1f1';x.font='bold 22px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(Math.round(v)),tx,ty);}}
  if(spec.txt)spec.txt.forEach((s,i)=>{const[tx,ty]=pt(i/2,66);x.fillStyle=i===0&&kind==='fuel'?'#ff6b5b':'#f1f1f1';x.font='bold 30px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(s,tx,ty);});
  x.fillStyle='#bbb';x.font='bold 16px sans-serif';x.textAlign='center';x.fillText(spec.label,cx,cy+62);
  return texOf(c,true,false);});}

// ---------------------------------------------------------------------- shared geometry & materials
const std=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:lin(c),roughness:.85,metalness:0},o));
const G={
  box:new THREE.BoxGeometry(1,1,1),
  cyl:new THREE.CylinderGeometry(1,1,1,12),
  cylT:new THREE.CylinderGeometry(.6,1,1,8),
  cone:new THREE.ConeGeometry(1,1,9),
  ico:new THREE.IcosahedronGeometry(1,1),
  ico0:new THREE.IcosahedronGeometry(1,0),
  sphere:new THREE.SphereGeometry(1,14,10),
  blade:new THREE.ConeGeometry(.05,1,3),
  circle:new THREE.CircleGeometry(1,32),
  plane:new THREE.PlaneGeometry(1,1)
};
G.rocks=[0,1,2,3].map(k=>{const g=new THREE.IcosahedronGeometry(1,1);const p=g.attributes.position;const rr=mulberry32(99+k);
  const map=new Map();for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(3)).join();if(!map.has(key))map.set(key,.75+rr()*.5);const s=map.get(key);p.setXYZ(i,p.getX(i)*s,p.getY(i)*s*.8,p.getZ(i)*s);}
  g.computeVertexNormals();return g;});
// tall eroded rock column for mesas / cliffs
G.mesa=(()=>{const g=new THREE.CylinderGeometry(1,1.15,1,9,6);const p=g.attributes.position;const rr=mulberry32(77);const m=new Map();
  for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(3)).join();if(!m.has(key))m.set(key,.8+rr()*.35);const s=m.get(key);
    const y=p.getY(i);const band=1+Math.sin(y*14)*.05;p.setXYZ(i,p.getX(i)*s*band,y,p.getZ(i)*s*band);}
  g.computeVertexNormals();return g;})();
G.gable=(()=>{const sh=new THREE.Shape();sh.moveTo(-.5,0);sh.lineTo(.5,0);sh.lineTo(0,1);sh.lineTo(-.5,0);const g=new THREE.ExtrudeGeometry(sh,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);return g;})();
G.frond=(()=>{const g=new THREE.PlaneGeometry(.9,4.2,1,6);g.translate(0,2.1,0);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);const t=y/4.2;p.setZ(i,-t*t*2.2);p.setX(i,p.getX(i)*(1-t*.7));}g.rotateX(-Math.PI/2+.5);g.computeVertexNormals();return g;})();

const M={};
function initMaterials(){
  const flatRock=c=>std(c,{flatShading:true,roughness:.95});
  const pl=plankTex(false),plh=plankTex(true),cor=corrugatedTex(),fab=fabricTex();
  Object.assign(M,{
    rockD:flatRock(0xb07b4f),rockS:flatRock(0x7f868d),rockJ:flatRock(0x6b6d5e),
    cactus:std(0x4f7f35,{roughness:.7}),trunk:std(0x5b4130,{roughness:.95}),pTrunk:std(0x7a6346,{roughness:.95}),
    pine:std(0x24503a,{flatShading:true}),pine2:std(0x2d5f43,{flatShading:true}),snowCap:std(0xf2f6fa,{flatShading:true,roughness:.6}),
    leaf1:std(0x2f6f2a,{flatShading:true}),leaf2:std(0x467f2f,{flatShading:true}),leaf3:std(0x3a7a3a,{flatShading:true}),
    frond:std(0x3f7f30,{side:THREE.DoubleSide,roughness:.7}),bush:std(0x3b6e2d,{flatShading:true}),dryBush:std(0x8a7350,{flatShading:true}),
    grass:std(0x5d9a3c,{roughness:.8}),dryGrass:std(0xb59b62),deadWood:std(0x8f7a60),
    log:std(0x5a3d22,{roughness:.95}),drift:std(0xf4f8fc,{roughness:.6}),
    redCan:std(0xc1121f,{roughness:.35,metalness:.3}),pumpY:std(0xffb703,{roughness:.5}),
    kit:std(0xb22222,{roughness:.4,metalness:.4}),kitGrey:std(0x555a60,{roughness:.5,metalness:.6}),
    wall:std(0xf1e6d2),roofRed:std(0xc62828,{roughness:.6}),padMat:std(0x3a3a3a,{roughness:.95}),
    mud:std(0x2e1f10,{roughness:.25,metalness:0}),ice:std(0xcfe9ff,{roughness:.08,metalness:.1,transparent:true,opacity:.8}),
    sand:std(0xd9a352,{roughness:1,map:groundTex('desert').map,polygonOffset:true,polygonOffsetFactor:-2}),
    tin:std(0xffffff,{map:cor.map,normalMap:cor.normal,roughness:.65,metalness:.45,side:THREE.DoubleSide}),
    plank:std(0xffffff,{map:pl.map,normalMap:pl.normal,roughness:.9}),
    crate:std(0xc79a62,{map:pl.map,normalMap:pl.normal,roughness:.9}),barrel:std(0x2f5f9a,{roughness:.45,metalness:.5}),barrelRing:std(0x2a2a2a,{roughness:.5,metalness:.8}),
    cone:std(0xff6a13,{roughness:.6}),coneW:std(0xf4f4f4,{roughness:.6}),
    canLabel:std(0xc0392b,{roughness:.5,metalness:.3}),canTop:std(0xcccccc,{roughness:.3,metalness:.9}),
    bread:std(0xc68b4e,{roughness:.9}),bottle:std(0x6fb6e8,{roughness:.05,transparent:true,opacity:.6}),cap:std(0x1d4fa0),
    banana:std(0xf1d34b,{roughness:.6}),coconut:std(0x6b4a2e,{roughness:.9}),soupLabel:std(0x2a7ab0,{roughness:.5,metalness:.3}),
    cd:std(0xd8dde3,{roughness:.12,metalness:1}),cdCase:std(0x222831,{roughness:.3,transparent:true,opacity:.85}),
    glow:new THREE.MeshBasicMaterial({color:0xffe08a,transparent:true,opacity:.35,depthWrite:false}),
    pole:std(0x6b5236,{map:plh.map,normalMap:plh.normal,roughness:.95}),insul:std(0x9fb8a0,{roughness:.2,metalness:.1}),wire:new THREE.LineBasicMaterial({color:0x1b1b1b}),
    mattress:std(0xd9d2c0,{map:fab.map,normalMap:fab.normal,roughness:1}),blanket:std(0x7a2e2e,{map:fab.map,normalMap:fab.normal,roughness:1}),
    rug:std(0x8a3b2a,{map:fab.map,normalMap:fab.normal,roughness:1}),metalDark:std(0x3b3d40,{roughness:.6,metalness:.7}),
    winGlass:std(0xa8c8d8,{roughness:.05,metalness:.2,transparent:true,opacity:.3,depthWrite:false})
  });
}

// --- batching: merges many small props into a few draw calls; optional world-space UVs for walls
const NI=new Map();function nonIdx(g){let n=NI.get(g);if(!n){n=g.index?g.toNonIndexed():g;NI.set(g,n);}return n;}
const _m4=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3();
class Batch{
  constructor(){this.map=new Map();}
  add(geo,mat,x,y,z,sx,sy,sz,ry=0,rx=0,rz=0){
    _m4.compose(_v.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz,'YXZ')),_s.set(sx,sy,sz));
    let a=this.map.get(mat);if(!a){a=[];this.map.set(mat,a);}a.push([nonIdx(geo),_m4.clone()]);
  }
  build(group,cast=true,worldUV=0){
    for(const[mat,arr]of this.map){
      let total=0;for(const[g]of arr)total+=g.attributes.position.count;
      const pos=new Float32Array(total*3),nor=new Float32Array(total*3),uv=new Float32Array(total*2);let o=0;
      const nm=new THREE.Matrix3(),v=new THREE.Vector3(),n=new THREE.Vector3();
      for(const[g,m]of arr){
        const P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv;nm.getNormalMatrix(m);
        for(let i=0;i<P.count;i++){
          v.fromBufferAttribute(P,i).applyMatrix4(m);pos[(o+i)*3]=v.x;pos[(o+i)*3+1]=v.y;pos[(o+i)*3+2]=v.z;
          n.fromBufferAttribute(N,i).applyMatrix3(nm).normalize();nor[(o+i)*3]=n.x;nor[(o+i)*3+1]=n.y;nor[(o+i)*3+2]=n.z;
          if(worldUV){const ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);let a,b;
            if(ax>=ay&&ax>=az){a=v.z;b=v.y;}else if(ay>=az){a=v.x;b=v.z;}else{a=v.x;b=v.y;}
            uv[(o+i)*2]=a/worldUV;uv[(o+i)*2+1]=b/worldUV;}
          else if(U){uv[(o+i)*2]=U.getX(i);uv[(o+i)*2+1]=U.getY(i);}
        }
        o+=P.count;
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=cast;mesh.receiveShadow=true;group.add(mesh);
    }
  }
}
function sharedMesh(geo,mat){const m=new THREE.Mesh(geo,mat);m.userData.shared=true;m.castShadow=true;m.receiveShadow=true;return m;}
function part(parent,geo,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const m=sharedMesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);parent.add(m);return m;}
function beam(parent,geo,mat,a,b,w,h,axis){ // stretch a unit shape between two points
  const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b);const len=A.distanceTo(B);
  const m=sharedMesh(geo,mat);m.position.copy(A).add(B).multiplyScalar(.5);
  if(axis==='y'){m.scale.set(w,len,h);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());}
  else{m.scale.set(w,h,len);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),B.clone().sub(A).normalize());}
  parent.add(m);return m;
}

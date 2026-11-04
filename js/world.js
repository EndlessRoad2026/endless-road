'use strict';
// ====================================================================== world: endless terrain chunks, houses, wrecks, power lines, rock formations, clouds, weather
const CH=120,STEP=5;
const OFFS=[-320,-240,-175,-125,-90,-66,-48,-35,-26,-19,-14,-10,-7.5,-5.5,-3,0,3,5.5,7.5,10,14,19,26,35,48,66,90,125,175,240,320];
const chunks=new Map();
const taken=new Set();   // ids of things already picked up, so they don't respawn

function ribbon(z0,z1,step,off,half,lift,mat,vScale=12){
  const n=Math.max(2,Math.ceil((z1-z0)/step)+1);
  const pos=new Float32Array(n*6),uv=new Float32Array(n*4),idx=[];
  for(let r=0;r<n;r++){
    const z=z0+(z1-z0)*r/(n-1),rx=roadX(z)+off,y=roadH(z)+lift;
    pos.set([rx-half,y,z,rx+half,y,z],r*6);uv.set([0,z/vScale,1,z/vScale],r*4);
    if(r<n-1){const a=r*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;return m;
}

let TERRAIN_MAT=null,ROAD_MAT=null;const HOUSEMAT={};
function setupWorldMaterials(){
  const gt=groundTex(S.key),rt=roadTex(S.road);
  TERRAIN_MAT=new THREE.MeshStandardMaterial({vertexColors:true,map:gt.map,normalMap:gt.normal,normalScale:new THREE.Vector2(.8,.8),roughness:S.key==='snow'?.75:.95,metalness:0});
  ROAD_MAT=new THREE.MeshStandardMaterial({map:rt.map,normalMap:rt.normal,roughness:S.road==='snowy'?.6:.9,metalness:0,polygonOffset:true,polygonOffsetFactor:-1});
  M.mesa1=std(S.mesa[0],{flatShading:true,roughness:.95});M.mesa2=std(S.mesa[1],{flatShading:true,roughness:.95});
}
function houseMats(){if(!HOUSEMAT[S.key]){const H=S.house,ph=plankTex(true),pv=plankTex(false);
  HOUSEMAT[S.key]={wall:std(H.wall,{map:ph.map,normalMap:ph.normal,roughness:.95}),floor:std(H.floor,{map:pv.map,normalMap:pv.normal,roughness:.9}),
    trim:std(H.trim,{map:pv.map,normalMap:pv.normal}),door:std(H.door,{map:pv.map,normalMap:pv.normal,roughness:.9})};}return HOUSEMAT[S.key];}

function buildChunk(i){
  const rnd=mulberry32((SEED^Math.imul(i+7919,2654435761))>>>0);
  const group=new THREE.Group();
  const z0=i*CH,rows=CH/STEP+1,cols=OFFS.length;
  const cs=S.ground.map(lin),tmp=new THREE.Color(),rockCol=lin(0x8a9098),mudCol=lin(0x5a4426);
  const pos=new Float32Array(rows*cols*3),col=new Float32Array(rows*cols*3),uv=new Float32Array(rows*cols*2),idx=[];
  for(let r=0;r<rows;r++){
    const z=z0+r*STEP,rx=roadX(z);
    for(let c=0;c<cols;c++){
      const x=rx+OFFS[c],y=groundH(x,z),k=(r*cols+c);
      pos[k*3]=x;pos[k*3+1]=y;pos[k*3+2]=z;uv[k*2]=x/7;uv[k*2+1]=z/7;
      const a=fbm(x*.03,z*.03),b=noise(x*.12,z*.12);
      tmp.copy(cs[0]).lerp(cs[1],a).lerp(cs[2],clamp((b-.55)*2,0,1)*.6);
      if(S.key==='snow'&&Math.abs(OFFS[c])>60)tmp.lerp(rockCol,clamp((fbm(x*.02+9,z*.02)-.45)*2.2,0,.75));
      if(S.key==='jungle'&&Math.abs(OFFS[c])<9)tmp.lerp(mudCol,.45);
      if(S.key==='desert'&&Math.abs(OFFS[c])<8)tmp.multiplyScalar(.93);
      col[k*3]=tmp.r;col[k*3+1]=tmp.g;col[k*3+2]=tmp.b;
    }
  }
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;idx.push(a,d,b,b,d,e);}
  const tg=new THREE.BufferGeometry();
  tg.setAttribute('position',new THREE.BufferAttribute(pos,3));tg.setAttribute('color',new THREE.BufferAttribute(col,3));tg.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  tg.setIndex(idx);tg.computeVertexNormals();
  const terrain=new THREE.Mesh(tg,TERRAIN_MAT);terrain.receiveShadow=true;group.add(terrain);
  group.add(ribbon(z0,z0+CH,3,0,5,.06,ROAD_MAT));

  const ch={i,group,colliders:[],boxes:[],patches:[],pickups:[],items:[],wrecks:[],houses:[],doors:[],station:null};
  const B=new Batch();
  const isStation=(i%14===6),stZ=z0+60;

  let houseSpot=null;
  if(!isStation&&i>0&&rnd()<.32){const side=rnd()<.5?-1:1,z=z0+25+rnd()*(CH-50),dist=17+rnd()*10;houseSpot={x:roadX(z)+side*dist,z,side};}
  let wreckSpot=null;
  if(!isStation&&i>1&&rnd()<.3){const side=rnd()<.5?-1:1,z=z0+15+rnd()*(CH-30),dist=10+rnd()*14;wreckSpot={x:roadX(z)+side*dist,z,side};
    if(houseSpot&&Math.hypot(wreckSpot.x-houseSpot.x,wreckSpot.z-houseSpot.z)<16)wreckSpot=null;}
  const clearOf=(x,z)=>{
    if(houseSpot&&Math.abs(x-houseSpot.x)<10&&Math.abs(z-houseSpot.z)<10)return false;
    if(wreckSpot&&Math.hypot(x-wreckSpot.x,z-wreckSpot.z)<6)return false;
    if(isStation&&Math.abs(z-stZ)<24&&x>roadX(z)&&x-roadX(z)<36)return false;
    if(Math.abs(x-(roadX(z)+11))<1.6)return false; // power line strip
    return true;
  };

  // ---- scenery
  const count={desert:22,snow:40,jungle:80}[S.key];
  for(let n=0;n<count;n++){
    const z=z0+rnd()*CH,side=rnd()<.5?-1:1;
    const dist=(S.key==='jungle'?8.5:10)+Math.pow(rnd(),1.6)*(S.key==='jungle'?110:170);
    const x=roadX(z)+side*dist;if(!clearOf(x,z))continue;
    const y=groundH(x,z),s=.7+rnd()*.9,t=rnd(),ry=rnd()*6.28;
    if(S.key==='desert'){
      if(t<.45){const k=(rnd()*4)|0;B.add(G.rocks[k],M.rockD,x,y+.2*s,z,1.6*s,1.2*s,1.4*s,ry);if(rnd()<.5)B.add(G.rocks[(k+1)%4],M.rockD,x+1.2*s,y,z+.6*s,.7*s,.6*s,.7*s,ry);ch.colliders.push({x,z,r:1.5*s});}
      else if(t<.75){
        const h=3+rnd()*3;B.add(G.cyl,M.cactus,x,y+h/2,z,.32,h,.32);B.add(G.sphere,M.cactus,x,y+h,z,.32,.3,.32);
        const arms=1+((rnd()*2)|0);
        for(let a=0;a<arms;a++){const sd=a===0?1:-1,ah=h*(.4+rnd()*.25),al=.9+rnd()*.8;
          B.add(G.cyl,M.cactus,x+sd*.45,y+ah,z,.2,.2,.2,0,0,Math.PI/2);B.add(G.cyl,M.cactus,x+sd*.6,y+ah+al/2,z,.2,al,.2);B.add(G.sphere,M.cactus,x+sd*.6,y+ah+al,z,.2,.2,.2);}
        ch.colliders.push({x,z,r:.55});
      } else if(t<.92){B.add(G.ico0,M.dryBush,x,y+.35*s,z,.9*s,.55*s,.9*s,ry);}
      else{const h=2.5+rnd()*2;B.add(G.cylT,M.deadWood,x,y+h/2,z,.12,h,.12);B.add(G.cylT,M.deadWood,x+.4,y+h*.75,z,.06,1.4,.06,0,0,-.7);B.add(G.cylT,M.deadWood,x-.3,y+h*.65,z,.05,1.1,.05,0,0,.8);ch.colliders.push({x,z,r:.3});}
    } else if(S.key==='snow'){
      if(t<.85){
        const h=(6+rnd()*6)*s,w=1.9*s;
        B.add(G.cyl,M.trunk,x,y+h*.1,z,.22*s,h*.2,.22*s);
        for(let L=0;L<4;L++){const f=L/4,lh=h*.42*(1-f*.35),ly=y+h*(.18+f*.2)+lh/2,lw=w*(1-f*.6);
          B.add(G.cone,L%2?M.pine2:M.pine,x,ly,z,lw,lh,lw,ry+L);B.add(G.cone,M.snowCap,x,ly+lh*.18,z,lw*.72,lh*.68,lw*.72,ry+L);}
        ch.colliders.push({x,z,r:.6*s});
      } else {const k=(rnd()*4)|0;B.add(G.rocks[k],M.rockS,x,y+.3*s,z,2*s,1.5*s,1.8*s,ry);B.add(G.ico,M.snowCap,x,y+1.05*s,z,1.5*s,.4*s,1.3*s,ry);ch.colliders.push({x,z,r:1.8*s});}
    } else {
      if(t<.42){
        const h=7+rnd()*8;B.add(G.cylT,M.trunk,x,y+h/2,z,.38*s,h,.38*s);
        for(let L=0;L<3+((rnd()*2)|0);L++){B.add(G.ico,[M.leaf1,M.leaf2,M.leaf3][L%3],x+(rnd()-.5)*3*s,y+h-.5+rnd()*2,z+(rnd()-.5)*3*s,(2.2+rnd())*s,(1.6+rnd()*.6)*s,(2.2+rnd())*s,ry);}
        ch.colliders.push({x,z,r:.7*s});
      } else if(t<.68){
        const h=6+rnd()*5,lean=(rnd()-.5)*.5,segs=5;let px=x,py=y,pz=z;
        for(let k=0;k<segs;k++){const sl=h/segs;B.add(G.cylT,M.pTrunk,px+lean*k*.25,py+sl/2,pz,.2,sl*1.05,.2,0,0,-lean*.3);py+=sl;}
        const tx=px+lean*segs*.25;
        for(let f=0;f<8;f++)B.add(G.frond,M.frond,tx,py,pz,1.1,1,1.1,f/8*Math.PI*2+ry);
        if(rnd()<.5)B.add(G.sphere,M.coconut,tx+.2,py-.25,pz,.16,.16,.16);
        ch.colliders.push({x,z,r:.4});
      } else if(t<.88)B.add(G.ico,M.bush,x,y+.6,z,1.6*s,1.1*s,1.6*s,ry);
      else{for(let f=0;f<6;f++)B.add(G.frond,M.leaf2,x,y,z,.35,.3,.35,f+ry);}
    }
  }
  if(S.key!=='snow'){
    for(let n=0;n<(S.key==='jungle'?90:40);n++){
      const z=z0+rnd()*CH,side=rnd()<.5?-1:1,x=roadX(z)+side*(6+rnd()*30);if(!clearOf(x,z))continue;const y=groundH(x,z);
      const mat=S.key==='jungle'?M.grass:M.dryGrass;
      for(let b=0;b<5;b++)B.add(G.blade,mat,x+(rnd()-.5)*.5,y+.25,z+(rnd()-.5)*.5,1,.5+rnd()*.5,1,0,(rnd()-.5)*.6,(rnd()-.5)*.6);
    }
  }
  // ---- big rock formations / mesas / cliffs far from the road
  if(rnd()<({desert:.5,snow:.35,jungle:.25}[S.key])){
    const side=rnd()<.5?-1:1,z=z0+rnd()*CH,x=roadX(z)+side*(70+rnd()*140),y=groundH(x,z)-2;
    const w=10+rnd()*14,h=18+rnd()*22,ry=rnd()*6;
    let yy=y,ww=w;const layers=2+((rnd()*2)|0);
    for(let L=0;L<layers;L++){const lh=h/layers*(1-L*.1);B.add(G.mesa,L%2?M.mesa2:M.mesa1,x+(rnd()-.5)*2,yy+lh/2,z+(rnd()-.5)*2,ww,lh,ww*(.7+rnd()*.4),ry+L);yy+=lh*.95;ww*=.78;}
    if(S.key==='snow')B.add(G.ico,M.snowCap,x,yy+.5,z,ww*1.05,2.5,ww*.9,ry);
    if(S.key==='jungle')B.add(G.ico,M.leaf1,x,yy+.5,z,ww*1.05,2.5,ww*.9,ry);
    ch.colliders.push({x,z,r:w*.9});
  }
  // ---- power lines along the right side of the road
  if(S.poles){
    const SP=45,wires=[];
    const poleAt=k=>{const z=k*SP,x=roadX(z)+11;return{x,z,y:groundH(x,z)};};
    for(let k=Math.ceil(z0/SP);k*SP<z0+CH;k++){
      const p=poleAt(k),q=poleAt(k+1);const ang=Math.atan2(q.x-p.x,q.z-p.z);
      B.add(G.cylT,M.pole,p.x,p.y+4.5,p.z,.13,9,.13);
      B.add(G.box,M.pole,p.x,p.y+8.4,p.z,2.2,.14,.14,ang);
      for(const o of[-.9,0,.9]){const ox=Math.cos(ang)*o,oz=-Math.sin(ang)*o;B.add(G.cyl,M.insul,p.x+ox,p.y+8.6,p.z+oz,.05,.22,.05);
        const a=new THREE.Vector3(p.x+ox,p.y+8.72,p.z+oz),qa=Math.atan2(poleAt(k+2).x-q.x,poleAt(k+2).z-q.z),b=new THREE.Vector3(q.x+Math.cos(qa)*o,q.y+8.72,q.z-Math.sin(qa)*o);
        for(let s=0;s<10;s++){const t0=s/10,t1=(s+1)/10;const sag=t=>Math.sin(t*Math.PI)*1.1;
          wires.push(a.x+(b.x-a.x)*t0,a.y+(b.y-a.y)*t0-sag(t0),a.z+(b.z-a.z)*t0,a.x+(b.x-a.x)*t1,a.y+(b.y-a.y)*t1-sag(t1),a.z+(b.z-a.z)*t1);}}
      ch.colliders.push({x:p.x,z:p.z,r:.3});
    }
    if(wires.length){const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));group.add(new THREE.LineSegments(wg,M.wire));}
  }
  // ---- road obstacles (more the further you go)
  if(i>2&&rnd()<Math.min(.75,.2+i*.005)){
    const z=z0+15+rnd()*(CH-30),off=(rnd()<.5?-1:1)*(1.5+rnd()*1.8),x=roadX(z)+off,y=roadH(z);
    if(!(isStation&&Math.abs(z-stZ)<25)){
      if(S.key==='desert'){B.add(G.rocks[1],M.rockD,x,y+.35,z,1.3,1,1.2,rnd()*6);ch.colliders.push({x,z,r:1.25});}
      else if(S.key==='snow'){const m=sharedMesh(G.sphere,M.drift);m.position.set(x,y-.2,z);m.scale.set(2.6,1.3,2);group.add(m);ch.colliders.push({x,z,r:2.2,soft:true,mesh:m});}
      else{const ang=(rnd()-.5)*.4;B.add(G.cyl,M.log,x,y+.45,z,.45,6,.45,ang,0,Math.PI/2);for(let k=-2;k<=2;k++)ch.colliders.push({x:x+k*1.3,z,r:.75});}
    }
  }
  const np=rnd()<.6?(rnd()<.4?2:1):0;
  for(let n=0;n<np;n++){
    const len=14+rnd()*26,zc=z0+len/2+rnd()*(CH-len),off=(rnd()-.5)*4,w=5+rnd()*5;
    const mat=S.patch==='mud'?M.mud:S.patch==='ice'?M.ice:M.sand;
    group.add(ribbon(zc-len/2,zc+len/2,3,off,w/2,.1,mat));
    ch.patches.push({z0:zc-len/2,z1:zc+len/2,off,w});
  }
  const far=i*CH,pFuel=Math.max(.1,.32-far/30000),pKit=Math.max(.06,.14-far/40000);
  if(i>0&&rnd()<pFuel)ch.pickups.push(makePickup('fuel',z0+rnd()*CH,(rnd()-.5)*5,group,`${i}:p0`));
  if(i>1&&rnd()<pKit)ch.pickups.push(makePickup('kit',z0+rnd()*CH,(rnd()-.5)*5,group,`${i}:p1`));
  if(S.key==='jungle'&&rnd()<.35){const z=z0+rnd()*CH,side=rnd()<.5?-1:1,x=roadX(z)+side*(7+rnd()*4);addItem(ch,group,{k:rnd()<.5?'bananas':'coconut'},x,groundH(x,z)+.02,z,`${i}:fruit`);}

  if(houseSpot)buildHouse(ch,group,B,houseSpot,rnd);
  if(wreckSpot)buildWreck(ch,group,wreckSpot,rnd);
  if(isStation){
    const rx=roadX(stZ),sx=rx+18,y=groundH(sx,stZ);
    group.add(ribbon(stZ-14,stZ+14,4,12,7,.07,M.padMat));
    B.add(G.box,M.wall,sx+6,y+2,stZ,6,4,10);B.add(G.box,M.roofRed,sx+6,y+4.2,stZ,6.6,.5,10.6);
    B.add(G.box,M.roofRed,sx-3,y+5,stZ,10,.4,12);
    for(const dz of[-4,4]){B.add(G.box,M.wall,sx-3,y+2.5,stZ+dz,.4,5,.4);B.add(G.box,M.pumpY,sx-1,y+.9,stZ+dz,.8,1.8,.6);}
    B.add(G.box,M.pumpY,rx+8,roadH(stZ)+5,stZ-18,3,1.4,.2);B.add(G.box,M.wall,rx+8,roadH(stZ)+2.2,stZ-18,.2,4.4,.2);
    ch.station={x:rx+12,z:stZ};
    ch.boxes.push({x0:sx+3,x1:sx+9,z0:stZ-5,z1:stZ+5});
    addItem(ch,group,{k:S.foods[0]},sx+2.6,y+.1,stZ+1,`${i}:snack`);
  }
  B.build(group);
  scene.add(group);
  return ch;
}

function makePickup(type,z,off,group,id){
  const x=roadX(z)+off,y=roadH(z)+.9;
  const g=new THREE.Group();g.position.set(x,y,z);
  if(type==='fuel'){part(g,G.box,M.redCan,0,0,0,.5,.7,.25);part(g,G.box,M.kitGrey,.12,.42,0,.12,.14,.12);}
  else{part(g,G.box,M.kit,0,0,0,.7,.35,.3);part(g,G.box,M.kitGrey,0,.22,0,.4,.06,.06);}
  const glow=new THREE.Mesh(G.sphere,M.glow);glow.scale.setScalar(.9);glow.userData.shared=true;g.add(glow);
  group.add(g);
  const p={type,x,z,mesh:g,taken:taken.has(id),baseY:y,id};if(p.taken)g.visible=false;return p;
}

// ---------------------------------------------------------------------- items lying in the world
// how a thing rests on the ground
function restPose(o,k,x,y,z,ry=0){
  o.position.set(x,y,z);o.rotation.set(0,ry,0);
  if(k==='wheel'||k==='rim'||k==='tyre'){o.rotation.set(0,ry,Math.PI/2);o.position.y=y+.36;}
  else if(k==='doorL'||k==='doorR'){o.rotation.set(0,ry+Math.PI/2,Math.PI/2);o.position.y=y+.05;}
  else if(k==='hood'||k==='trunk'||k==='tailgate')o.position.y=y+.05;
  else if(k==='battery')o.position.y=y+.1;
  else if(k==='radiator')o.position.y=y+.23;
  else if(k==='engine')o.position.y=y+.25;
  else if(k==='seat')o.position.y=y+.13;
  else if(k==='pistol'||k==='rifle'){o.rotation.set(0,ry,Math.PI/2);o.position.y=y+.03;}
}
function addItem(ch,group,desc,x,y,z,id){
  if(taken.has(id))return;
  const m=makeFromDesc(desc);restPose(m,desc.k,x,y,z,Math.random()*6);group.add(m);ch.items.push({kind:desc.k,x,y,z,mesh:m,id});
}
let chunkHook=null; // game.js uses this to spawn animals for new chunks

// ---------------------------------------------------------------------- abandoned house
function buildHouse(ch,group,B,spot,rnd){
  const HM=houseMats(),wallM=HM.wall,floorM=HM.floor;
  const w=6+rnd()*2.5,d=7+rnd()*3,h=2.8,th=.18;
  const cx=spot.x,cz=spot.z;
  let gy=-1e9;for(const[dx,dz]of[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[0,0]])gy=Math.max(gy,groundH(cx+dx,cz+dz));
  const fy=gy+.2;
  const x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2;
  const hb=new Batch(),fb=new Batch();
  fb.add(G.box,floorM,cx,fy-1.5,cz,w+.4,3,d+.4);
  const seg=(ax,a0,a1,fixed,y0,y1,block)=>{
    const len=a1-a0;if(len<=.01)return;const mid=(a0+a1)/2;
    if(ax==='x')hb.add(G.box,wallM,mid,fy+(y0+y1)/2,fixed,len,y1-y0,th);
    else hb.add(G.box,wallM,fixed,fy+(y0+y1)/2,mid,th,y1-y0,len);
    if(block){if(ax==='x')ch.boxes.push({x0:a0,x1:a1,z0:fixed-th/2,z1:fixed+th/2});else ch.boxes.push({x0:fixed-th/2,x1:fixed+th/2,z0:a0,z1:a1});}
  };
  const doorX=spot.side>0?x0:x1,backX=spot.side>0?x1:x0;
  const dz0=cz-.6,dz1=cz+.6;
  seg('z',z0,dz0,doorX,0,h,true);seg('z',dz1,z1,doorX,0,h,true);seg('z',dz0,dz1,doorX,2.15,h,false);
  seg('z',z0,cz-.7,backX,0,h,true);seg('z',cz+.7,z1,backX,0,h,true);seg('z',cz-.7,cz+.7,backX,0,1,true);seg('z',cz-.7,cz+.7,backX,2,h,false);
  for(const zz of[z0,z1]){seg('x',x0,cx-.6,zz,0,h,true);seg('x',cx+.6,x1,zz,0,h,true);seg('x',cx-.6,cx+.6,zz,0,1,true);seg('x',cx-.6,cx+.6,zz,2,h,false);}
  // corner posts and trim
  for(const xx of[x0,x1])for(const zz of[z0,z1])hb.add(G.box,HM.trim,xx,fy+h/2,zz,.24,h,.24);
  hb.add(G.box,HM.trim,doorX,fy+2.2,cz,th+.06,.12,1.4);
  for(const s of[-1,1])hb.add(G.box,HM.trim,doorX,fy+1.08,cz+s*.66,th+.06,2.16,.1);
  hb.build(group,true,1.6);fb.build(group,true,1.6);
  // window frames, bars and broken glass
  const win=(x,z,alongX)=>{
    const fr=(a,b,c,sx,sy,sz)=>B.add(G.box,HM.trim,a,b,c,sx,sy,sz);
    if(alongX){fr(x,fy+1,z,1.3,.08,th+.08);fr(x,fy+2,z,1.3,.08,th+.08);fr(x-.62,fy+1.5,z,.08,1,th+.08);fr(x+.62,fy+1.5,z,.08,1,th+.08);fr(x,fy+1.5,z,.05,1,.05);fr(x,fy+1.5,z,1.2,.05,.05);
      if(rnd()<.6)B.add(G.box,M.winGlass,x-.3,fy+1.25,z,.55,.45,.01);}
    else{fr(x,fy+1,z,th+.08,.08,1.5);fr(x,fy+2,z,th+.08,.08,1.5);fr(x,fy+1.5,z-.72,th+.08,1,.08);fr(x,fy+1.5,z+.72,th+.08,1,.08);fr(x,fy+1.5,z,.05,1,.05);fr(x,fy+1.5,z,.05,.05,1.4);
      if(rnd()<.6)B.add(G.box,M.winGlass,x,fy+1.75,z+.35,.01,.45,.6);}
  };
  win(cx,z0,true);win(cx,z1,true);win(backX,cz,false);
  // roof (separate so it can be hidden when you're inside in third-person)
  const roof=new THREE.Group();
  const roofM=S.key==='snow'?M.snowCap:M.tin;
  const slab=(sx,rz,mat,lift,len,zoff)=>{const m=sharedMesh(G.box,mat);m.scale.set(w/2+.5,.06,len);m.position.set(cx+sx*(w/4+.12),fy+h+.45+lift,cz+zoff);m.rotation.z=rz;roof.add(m);return m;};
  const caved=rnd()<.5,len2=caved?d*.55:d+.7,z2=caved?-d*.2:0;
  if(S.key==='snow'){slab(-1,.32,HM.trim,0,d+.7,0);slab(1,-.32,HM.trim,0,len2,z2);slab(-1,.32,roofM,.07,d+.7,0);slab(1,-.32,roofM,.07,len2,z2);}
  else{slab(-1,.32,roofM,0,d+.7,0);slab(1,-.32,roofM,0,len2,z2);}
  for(const zz of[z0,z1]){const gab=sharedMesh(G.gable,wallM);gab.scale.set(w,.47+.0825*w,th);gab.position.set(cx,fy+h,zz);roof.add(gab);}
  const ridge=sharedMesh(G.box,HM.trim);ridge.scale.set(.18,.18,d+.8);ridge.position.set(cx,fy+h+.47+.0825*w,cz);roof.add(ridge);
  group.add(roof);
  // door that opens: hinge on the jamb
  const hinge=new THREE.Group();hinge.position.set(doorX,fy,cz-.6);group.add(hinge);
  const panel=new THREE.Group();hinge.add(panel);
  part(panel,G.box,HM.door,0,1.06,.6,.07,2.1,1.18);
  for(const yy of[.4,1.06,1.7])part(panel,G.box,HM.trim,0,yy,.6,.09,.1,1.12);
  part(panel,G.box,CARMAT.chrome,spot.side>0?-.06:.06,1.0,1.05,.04,.05,.12);
  part(panel,G.sphere,CARMAT.chrome,spot.side>0?-.08:.08,1.0,1.08,.03,.03,.03);
  const door={hinge,x:doorX,z:cz,y:fy,open:false,amt:0,sign:spot.side>0?1:-1,box:{x0:doorX-.1,x1:doorX+.1,z0:cz-.6,z1:cz+.6,door:null}};
  door.box.door=door;ch.boxes.push(door.box);ch.doors.push(door);
  // furniture
  const inX=spot.side>0?1:-1; // direction into the house from the door
  const tx=cx+inX*(w/2-1.1),tz=cz-d/2+1.3;
  B.add(G.box,M.crate,tx,fy+.78,tz,1.2,.06,.8);for(const[a,b]of[[-.5,-.32],[.5,-.32],[-.5,.32],[.5,.32]])B.add(G.box,M.crate,tx+a,fy+.38,tz+b,.06,.76,.06);
  B.add(G.box,M.crate,tx-.9*inX,fy+.45,tz,.42,.06,.42);B.add(G.box,M.crate,tx-.9*inX-.19*inX,fy+.75,tz,.05,.6,.42);for(const[a,b]of[[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]])B.add(G.box,M.crate,tx-.9*inX+a,fy+.22,tz+b,.04,.44,.04);
  const sx=cx,sz=cz+d/2-.45;
  B.add(G.box,M.crate,sx,fy+1,sz,2.2,2,.06);for(const yy of[.5,1.1,1.7])B.add(G.box,M.crate,sx,fy+yy,sz-.2,2.2,.05,.4);for(const s of[-1,1])B.add(G.box,M.crate,sx+s*1.1,fy+1,sz-.2,.05,2,.42);
  // bed
  const bx=cx+inX*(w/2-1.0),bz=cz+d/2-2.2;
  B.add(G.box,M.crate,bx,fy+.25,bz,1.0,.3,2.0);B.add(G.box,M.mattress,bx,fy+.47,bz,.92,.16,1.9);B.add(G.box,M.blanket,bx,fy+.56,bz+.25,.94,.04,1.3);B.add(G.box,M.mattress,bx,fy+.6,bz-.75,.6,.1,.3);
  B.add(G.box,M.crate,bx,fy+.6,bz-1.02,1.0,.9,.06);
  B.add(G.box,M.rug,cx,fy+.015,cz,1.6,.02,2.2);
  B.add(G.cyl,M.barrel,cx-inX*(w/2-.6),fy+.45,cz-d/2+.6,.3,.9,.3);
  B.add(G.box,M.crate,cx-inX*(w/2-.7),fy+.35,cz+d/2-1.5,.7,.7,.7,rnd());
  ch.boxes.push({x0:tx-.62,x1:tx+.62,z0:tz-.42,z1:tz+.42,low:true});
  ch.boxes.push({x0:bx-.5,x1:bx+.5,z0:bz-1,z1:bz+1,low:true});
  // loot
  const id=ch.i+':h',foods=S.foods,pick=()=>({k:foods[(rnd()*foods.length)|0]});
  addItem(ch,group,pick(),tx-.3,fy+.81,tz,id+'0');
  if(rnd()<.7)addItem(ch,group,pick(),sx-.6,fy+1.13,sz-.2,id+'1');
  if(rnd()<.45)addItem(ch,group,pick(),sx+.5,fy+.53,sz-.2,id+'2');
  const lr=rnd(),pickOf=o=>{const k=Object.keys(o);return k[(rnd()*k.length)|0];};
  let loot=null;
  if(lr<.2)loot={k:'jerry'};else if(lr<.35)loot={k:'toolbox'};else if(lr<.47)loot={k:'wheel',rim:pickOf(RIMS),tyre:pickOf(TYRES)};
  else if(lr<.55)loot={k:'battery'};else if(lr<.62)loot={k:'radiator'};else if(lr<.7)loot={k:'tyre',v:pickOf(TYRES)};
  else if(lr<.76)loot={k:'engine',v:pickOf(ENGINES)};else if(lr<.82)loot={k:'seat',v:pickOf(SEATS)};else if(lr<.86)loot={k:'rim',v:pickOf(RIMS)};
  if(loot)addItem(ch,group,loot,cx,fy,cz-.5,id+'3');
  if(rnd()<.35){const notOwned=CD_SONGS.filter(c=>!Radio.hasCD(c.id));const pool=notOwned.length?notOwned:CD_SONGS;addItem(ch,group,{k:pool[(rnd()*pool.length)|0].id},sx+.2,fy+1.73,sz-.2,id+'4');}
  if(S.key!=='snow'&&rnd()<.45){ch.chickens=ch.chickens||[];const n=1+((rnd()*3)|0);for(let c=0;c<n;c++)ch.chickens.push([cx+(spot.side>0?-1:1)*(w/2+2+rnd()*4),cz+(rnd()-.5)*6,`${ch.i}:ck${c}`]);}
  ch.houses.push({x0,x1,z0,z1,fy,roof,h});
}

function buildWreck(ch,group,spot,rnd){
  const pickOf=o=>{const k=Object.keys(o);return k[(rnd()*k.length)|0];};
  const C=makeVehicle(rnd()<.5?'sedan':'pickup',{rusty:true,noGlass:true,engine:pickOf(ENGINES),seat:rnd()<.7?'standard':pickOf(SEATS),tyre:pickOf(TYRES),rim:rnd()<.6?'steel':pickOf(RIMS)});
  const h=rnd()*6.28;
  for(const name of Object.keys(C.slots)){
    const id=`${ch.i}:w:${name}`;const s=C.slots[name];
    if(rnd()<.35||taken.has(id)){if(s.obj)s.parent.remove(s.obj);s.obj=null;}
    else if(s.type==='wheel'&&s.obj&&rnd()<.2){takeTyreOff(s.obj);}
    s.id=id;
    if(s.hinge&&s.obj&&rnd()<.3){s.open=true;s.openAmt=1;s.hinge.rotation[s.axis]=s.angle;}
  }
  const y=groundH(spot.x,spot.z);
  C.group.position.set(spot.x,y-.05,spot.z);
  const m=missing(C);
  C.group.rotation.order='YXZ';C.group.rotation.set((rnd()-.5)*.06,h,(rnd()-.5)*.08);
  if(m.wheels>0)C.group.position.y-=.12*Math.min(2,m.wheels);
  group.add(C.group);
  C.wreck=true;C.h=h;C.chunk=ch.i;
  ch.wrecks.push(C);
  const f={x:Math.sin(h),z:Math.cos(h)};
  for(const o of[-1.3,0,1.3])ch.colliders.push({x:spot.x+f.x*o,z:spot.z+f.z*o,r:1.0});
}

function disposeChunk(ch){
  scene.remove(ch.group);
  ch.group.traverse(o=>{if((o.isMesh||o.isLineSegments)&&!o.userData.shared){o.geometry.dispose();}});
}
function clearChunks(){chunks.forEach(disposeChunk);chunks.clear();}
function manageChunks(all,fz){
  const ci=Math.floor(fz/CH);
  for(const[k,ch]of chunks)if(k<ci-2||k>ci+4){disposeChunk(ch);chunks.delete(k);if(chunkHook)chunkHook(ch,true);}
  let built=0;
  for(let k=ci-1;k<=ci+3;k++){if(!chunks.has(k)){const ch=buildChunk(k);chunks.set(k,ch);if(chunkHook)chunkHook(ch);if(!all&&++built>=1)break;}}
}
function nearChunks(z,f){const ci=Math.floor(z/CH);for(let k=ci-1;k<=ci+1;k++){const ch=chunks.get(k);if(ch)f(ch);}}

// ---------------------------------------------------------------------- clouds
const clouds=new THREE.Group();scene.add(clouds);
(function makeClouds(){
  const c=canvasOf(256,128),x=c.getContext('2d');const rr=mulberry32(31);
  for(let k=0;k<26;k++){const px=40+rr()*176,py=50+rr()*40,r=18+rr()*34;const gr=x.createRadialGradient(px,py,0,px,py,r);gr.addColorStop(0,'rgba(255,255,255,.95)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.beginPath();x.arc(px,py,r,0,7);x.fill();}
  const t=texOf(c,true,false);
  const mat=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:false,opacity:.9});
  for(let k=0;k<22;k++){const s=new THREE.Sprite(mat);const a=rr()*Math.PI*2,d=250+rr()*450;s.position.set(Math.cos(a)*d,140+rr()*120,Math.sin(a)*d);const sc=160+rr()*200;s.scale.set(sc,sc*.45,1);s.renderOrder=-1;clouds.add(s);}
  clouds.userData.mat=mat;
})();

// ---------------------------------------------------------------------- weather particles
const PN=2600;
const pGeo=new THREE.BufferGeometry();const pPos=new Float32Array(PN*3);pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
const pMat=new THREE.PointsMaterial({size:.12,transparent:true,opacity:.8,depthWrite:false});
const points=new THREE.Points(pGeo,pMat);points.frustumCulled=false;scene.add(points);
function seedParticles(){for(let i=0;i<PN;i++){pPos[i*3]=(Math.random()-.5)*100;pPos[i*3+1]=Math.random()*35;pPos[i*3+2]=(Math.random()-.5)*100;}pGeo.attributes.position.needsUpdate=true;}

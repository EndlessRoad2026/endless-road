'use strict';
// ====================================================================== multiplayer: one player hosts, friends join with a room code.
// Uses PeerJS (WebRTC) so players connect directly; the host relays everyone's position to everyone else.
const Net=(()=>{
  const PREFIX='endlessroad-v4-';
  let role='off',peer=null,conns=[],hostConn=null,myId=null,code=null,name='Player',col=0xd9822b,onWelcome=null,statusCb=()=>{};
  const remotes=new Map(); // id -> {name,col,person,tag,veh:{key,C},cur,tgt,last}
  const COLS=[0xd9822b,0x2f80ed,0x27ae60,0x9b51e0,0xeb5757,0xf2c94c];
  function loadLib(){return new Promise((res,rej)=>{if(window.Peer)return res();const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';s.onload=()=>res();s.onerror=()=>rej(new Error('Could not load the multiplayer library'));document.head.appendChild(s);});}
  const mkCode=()=>Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random()*24)|0]).join('');
  function status(t){statusCb(t);}
  async function host(playerName,cb){
    name=playerName||'Host';await loadLib();role='host';col=COLS[0];
    return new Promise((res,rej)=>{
      const tryOpen=(n)=>{code=mkCode();peer=new Peer(PREFIX+code);
        peer.on('open',id=>{myId=id;status('Room '+code);res(code);});
        peer.on('error',e=>{if(e.type==='unavailable-id'&&n<5){peer.destroy();tryOpen(n+1);}else{status('Multiplayer error: '+e.type);rej(e);}});
        peer.on('connection',c=>{
          c.on('open',()=>{if(conns.length>=5){c.send({t:'full'});setTimeout(()=>c.close(),300);return;}conns.push(c);});
          c.on('data',d=>onHostData(c,d));
          c.on('close',()=>{conns=conns.filter(x=>x!==c);if(c.pid){dropRemote(c.pid);broadcast({t:'bye',id:c.pid});toast(`👋 ${c.pname||'A player'} left`);}});
        });
      };tryOpen(0);
    });
  }
  function onHostData(c,d){
    if(d.t==='hello'){c.pid=d.id;c.pname=d.name;const pcol=COLS[(conns.indexOf(c)+1)%COLS.length];
      c.send({t:'welcome',col:pcol,world:onWelcome.world(),you:d.id});toast(`👋 ${d.name} joined`);return;}
    if(d.t==='st'){applyState(d);for(const o of conns)if(o!==c&&o.open)o.send(d);}
  }
  async function join(roomCode,playerName,welcomeCb){
    name=playerName||'Player';await loadLib();role='guest';code=roomCode.toUpperCase().trim();
    return new Promise((res,rej)=>{
      peer=new Peer();
      peer.on('open',id=>{myId=id;hostConn=peer.connect(PREFIX+code,{reliable:false});
        const t=setTimeout(()=>{rej(new Error('Could not find that room'));},12000);
        hostConn.on('open',()=>hostConn.send({t:'hello',id:myId,name}));
        hostConn.on('data',d=>{
          if(d.t==='welcome'){clearTimeout(t);col=d.col;welcomeCb(d.world);status('Room '+code);res();}
          else if(d.t==='full'){clearTimeout(t);rej(new Error('That room is full'));}
          else if(d.t==='st')applyState(d);
          else if(d.t==='bye')dropRemote(d.id);
        });
        hostConn.on('close',()=>{toast('Lost connection to the host','warn');status('Disconnected');role='off';for(const id of [...remotes.keys()])dropRemote(id);});
      });
      peer.on('error',e=>{rej(new Error(e.type==='peer-unavailable'?'Could not find that room. Check the code.':'Multiplayer error: '+e.type));});
    });
  }
  function broadcast(d){if(role==='host'){for(const c of conns)if(c.open)c.send(d);}else if(role==='guest'&&hostConn&&hostConn.open)hostConn.send(d);}
  function leave(){try{for(const c of conns)c.close();if(hostConn)hostConn.close();if(peer)peer.destroy();}catch(e){}conns=[];hostConn=null;peer=null;role='off';code=null;for(const id of [...remotes.keys()])dropRemote(id);status('');}
  // ---- remote players
  function nameTag(text,c){const cv=canvasOf(256,64),x=cv.getContext('2d');x.fillStyle='rgba(0,0,0,.55)';x.beginPath();x.roundRect?x.roundRect(8,8,240,48,14):x.rect(8,8,240,48);x.fill();
    x.fillStyle='#'+new THREE.Color(c).getHexString();x.font='bold 28px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text.slice(0,14),128,33);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texOf(cv,true,false),depthTest:false,transparent:true}));s.scale.set(1.2,.3,1);s.renderOrder=5;return s;}
  function applyState(d){
    if(d.id===myId)return;
    let r=remotes.get(d.id);
    if(!r){r={name:d.name,col:d.col,person:makePerson(d.col,0x222222),veh:null,cur:null,tgt:null};r.tag=nameTag(d.name,d.col);scene.add(r.person.group);scene.add(r.tag);remotes.set(d.id,r);}
    r.tgt=d;r.last=performance.now();if(!r.cur)r.cur=JSON.parse(JSON.stringify(d));
  }
  function dropRemote(id){const r=remotes.get(id);if(!r)return;scene.remove(r.person.group);scene.remove(r.tag);if(r.veh)scene.remove(r.veh.C.group);remotes.delete(id);}
  const lerp=(a,b,t)=>a+(b-a)*t,lerpA=(a,b,t)=>{let d=b-a;d=Math.atan2(Math.sin(d),Math.cos(d));return a+d*t;};
  function update(dt){
    const k=Math.min(1,dt*10);
    for(const[id,r]of remotes){
      const c=r.cur,t=r.tgt;if(!t)continue;
      c.x=lerp(c.x,t.x,k);c.y=lerp(c.y,t.y,k);c.z=lerp(c.z,t.z,k);c.h=lerpA(c.h,t.h,k);
      if(t.v){
        const key=t.v.type+':'+t.v.p;
        if(!r.veh||r.veh.key!==key){if(r.veh)scene.remove(r.veh.C.group);const C=makeVehicle(t.v.type,t.v.p==='rust'?{rusty:true}:{color:t.v.p});scene.add(C.group);r.veh={key,C};}
        if(!c.v)c.v=JSON.parse(JSON.stringify(t.v));
        for(const f of['x','y','z'])c.v[f]=lerp(c.v[f],t.v[f],k);for(const f of['h','pitch','roll'])c.v[f]=lerpA(c.v[f],t.v[f],k);
        const g=r.veh.C.group;g.position.set(c.v.x,c.v.y,c.v.z);g.rotation.order='YXZ';g.rotation.set(c.v.pitch,c.v.h,c.v.roll);
        for(const[nm,piv]of Object.entries(r.veh.C.pivots)){const s=r.veh.C.slots[nm];if(s.obj)s.obj.rotation.x=t.v.ws;if(nm.startsWith('wheelF'))piv.rotation.y=t.v.sv;}
        if(r.person.group.parent!==g){const s=r.veh.C.spec.seat;g.add(r.person.group);r.person.group.position.set(s[0],s[1]-.92,s[2]);r.person.group.rotation.set(0,0,0);pose(r.person,'sit');}
        r.tag.position.set(c.v.x,c.v.y+2.3,c.v.z);
      } else {
        c.v=null;
        if(r.person.group.parent!==scene)scene.add(r.person.group);
        if(r.veh){scene.remove(r.veh.C.group);r.veh=null;}
        r.person.group.position.set(c.x,c.y-(t.cr?.38:0),c.z);r.person.group.rotation.set(0,c.h,0);
        pose(r.person,t.cr?'crouch':t.hold?'carry':'walk',t.ph,t.amp);
        r.tag.position.set(c.x,c.y+(t.cr?1.7:2.1),c.z);
      }
      if(performance.now()-r.last>15000)dropRemote(id);
    }
  }
  function circles(){const out=[];for(const r of remotes.values()){const c=r.cur;if(!c)continue;
    if(c.v){const f={x:Math.sin(c.v.h),z:Math.cos(c.v.h)};for(const o of[-1.3,0,1.3])out.push([c.v.x+f.x*o,c.v.z+f.z*o,.95]);}else out.push([c.x,c.z,.3]);}return out;}
  return {host,join,leave,broadcast,update,circles,get role(){return role;},get code(){return code;},get id(){return myId;},get name(){return name;},get col(){return col;},get count(){return remotes.size;},
    set onWelcome(o){onWelcome=o;},set onStatus(f){statusCb=f;},remotes};
})();

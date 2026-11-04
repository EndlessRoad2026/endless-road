'use strict';
// ====================================================================== CAR RADIO + CD player (original music generated live with Web Audio)
const CD_SONGS=[
  {id:'cd1',name:'Desert Groove',style:'country',bpm:104,root:52,scale:'mixo',prog:[0,3,0,4],seed:101,col:'#e0a030'},
  {id:'cd2',name:'Iron Horse',style:'rock',bpm:136,root:42,scale:'minor',prog:[0,6,5,6],seed:202,col:'#c0392b'},
  {id:'cd3',name:'Midnight Oasis',style:'synth',bpm:92,root:47,scale:'minor',prog:[0,3,4,5],seed:303,col:'#6c5ce7'},
  {id:'cd4',name:'Lucky Tyre',style:'country',bpm:126,root:55,scale:'major',prog:[0,4,3,4],seed:404,col:'#27ae60'},
  {id:'cd5',name:'Static Sky',style:'lofi',bpm:76,root:50,scale:'dorian',prog:[0,2,3,6],seed:505,col:'#3498db'},
  {id:'cd6',name:'Banana Boogie',style:'synth',bpm:118,root:53,scale:'major',prog:[0,5,3,4],seed:606,col:'#f1c40f'}
];
const Radio=(()=>{
  const SCALES={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],mixo:[0,2,4,5,7,9,10]};
  const STATIONS=[
    {name:'Dusty FM',tag:'country & folk',style:'country',songs:[
      {name:'Dusty Highway',bpm:112,root:50,scale:'major',prog:[0,3,4,0],seed:11},
      {name:'Cactus Moon',bpm:96,root:52,scale:'mixo',prog:[0,6,3,0],seed:23},
      {name:'Long Way Home',bpm:120,root:55,scale:'major',prog:[0,4,5,3],seed:37}]},
    {name:'Chill Wave',tag:'lo-fi beats',style:'lofi',songs:[
      {name:'Rainy Window',bpm:78,root:57,scale:'dorian',prog:[0,3,6,4],seed:5},
      {name:'Slow Sunday',bpm:84,root:53,scale:'major',prog:[0,5,1,4],seed:8},
      {name:'Sleepy Engine',bpm:72,root:55,scale:'minor',prog:[0,5,2,6],seed:19}]},
    {name:'Rock 88',tag:'rock',style:'rock',songs:[
      {name:'Full Throttle',bpm:142,root:40,scale:'minor',prog:[0,5,6,4],seed:3},
      {name:'Rusty Wheels',bpm:128,root:45,scale:'mixo',prog:[0,6,3,0],seed:44},
      {name:'Sandstorm Riders',bpm:150,root:43,scale:'minor',prog:[0,2,5,6],seed:71}]},
    {name:'Neon Night',tag:'synthwave',style:'synth',songs:[
      {name:'Night Drive',bpm:100,root:45,scale:'minor',prog:[0,5,2,6],seed:9},
      {name:'Neon Dunes',bpm:108,root:48,scale:'dorian',prog:[0,6,5,3],seed:29},
      {name:'Starlight Road',bpm:96,root:50,scale:'major',prog:[0,4,5,3],seed:63}]}
  ];
  let owned=[];try{owned=JSON.parse(localStorage.getItem('endless-road-cds')||'[]');}catch(e){}
  const CDST={name:'💿 CD player',tag:'',style:'country',songs:[],cd:true};
  function refreshCD(){CDST.songs=CD_SONGS.filter(s=>owned.includes(s.id));CDST.tag=owned.length+' CD'+(owned.length===1?'':'s');}
  refreshCD();STATIONS.push(CDST);
  const listeners=[];
  let ctx=null,master,muffle,comp,delay,delayFb,delaySend,noiseBuf,dist,timer=null;
  let on=false,vol=.6,st=0,sg=0,nextT=0,step=0,songStart=0,melody=null,env={m:20000,a:1};
  try{const v=parseFloat(localStorage.getItem('endless-road-vol'));if(v>=0&&v<=1)vol=v;}catch(e){}
  function init(){
    if(ctx)return true;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    ctx=new AC();
    master=ctx.createGain();master.gain.value=0;
    muffle=ctx.createBiquadFilter();muffle.type='lowpass';muffle.frequency.value=20000;muffle.Q.value=.7;
    comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
    master.connect(muffle);muffle.connect(comp);comp.connect(ctx.destination);
    delay=ctx.createDelay(1);delayFb=ctx.createGain();delayFb.gain.value=.32;delaySend=ctx.createGain();delaySend.gain.value=.25;
    delaySend.connect(delay);delay.connect(delayFb);delayFb.connect(delay);delay.connect(master);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    dist=ctx.createWaveShaper();const c=new Float32Array(256);for(let i=0;i<256;i++){const x=i/128-1;c[i]=Math.tanh(x*4);}dist.curve=c;dist.connect(master);
    return true;
  }
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  // --- instruments
  function tone(type,f,t,dur,g,dest,{a=.005,r=.08,cut=0,q=1,det=0,glide=0}={}){
    const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);if(glide)o.frequency.exponentialRampToValueAtTime(glide,t+dur);o.detune.value=det;
    const v=ctx.createGain();v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(g,t+a);v.gain.setValueAtTime(g,t+Math.max(a,dur-r));v.gain.linearRampToValueAtTime(0,t+dur);
    let node=o;if(cut){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.frequency.setValueAtTime(cut,t);fl.Q.value=q;o.connect(fl);node=fl;}
    node.connect(v);v.connect(dest||master);o.start(t);o.stop(t+dur+.05);return v;
  }
  function noise(t,dur,g,type,freq,dest){const s=ctx.createBufferSource();s.buffer=noiseBuf;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;
    const v=ctx.createGain();v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f);f.connect(v);v.connect(dest||master);s.start(t,Math.random()*.5);s.stop(t+dur+.02);}
  function kick(t,g=.9){const o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.13);
    const v=ctx.createGain();v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+.35);o.connect(v);v.connect(master);o.start(t);o.stop(t+.4);}
  function snare(t,g=.4){noise(t,.16,g,'bandpass',1900);tone('triangle',190,t,.08,g*.5);}
  function hat(t,g=.12,open=false){noise(t,open?.22:.045,g,'highpass',7500);}
  function chordNotes(song,deg,oct=0,seven=false){const sc=SCALES[song.scale];const n=[0,2,4].concat(seven?[6]:[]).map(k=>{const i=deg+k;return song.root+12+oct*12+sc[i%7]+12*Math.floor(i/7);});return n;}
  function scaleNote(song,deg,oct){const sc=SCALES[song.scale];const i=((deg%7)+7)%7;return song.root+24+oct*12+sc[i]+12*Math.floor(deg/7);}
  function makeMelody(song){
    const rnd=mulberry32(song.seed*7919+1);const motif=(len,density)=>{const m=[];let deg=(rnd()*5)|0;for(let i=0;i<len;i++){if(rnd()<density){deg+=[-2,-1,-1,0,1,1,2,3][(rnd()*8)|0];deg=clamp(deg,-3,9);m.push({deg,len:rnd()<.3?2:1});}else m.push(null);}return m;};
    const dens={country:.45,lofi:.3,rock:.35,synth:.5}[song.style||STATIONS[st].style];
    return {A:motif(32,dens),B:motif(32,dens*1.2)};
  }
  function playStep(s,t){
    const song=STATIONS[st].songs[sg];if(!song)return;const style=song.style||STATIONS[st].style,spb=60/song.bpm/4;
    const bar=Math.floor(s/16),i=s%16,deg=song.prog[bar%song.prog.length],section=Math.floor(bar/8)%2;
    const intro=bar<2;
    let tt=t;if(style==='lofi'&&i%2===1)tt+=spb*.28; // swing
    const root=song.root+chordNotes(song,deg)[0]-song.root-12;
    if(style==='country'){
      if(i%8===0)kick(tt,.8);if(i%8===4&&!intro)snare(tt,.28);if(i%2===0)hat(tt,.06);
      if(i%4===0){const n=chordNotes(song,deg,-2);tone('triangle',mtof(i%8===0?n[0]:n[2]),tt,spb*3,.38,master,{cut:900});}
      if(i%2===0){const n=chordNotes(song,deg);const nt=n[(i/2)%3];tone('triangle',mtof(nt),tt,spb*3,.1);tone('square',mtof(nt),tt,spb*1.2,.025,master,{cut:2400});}
    } else if(style==='lofi'){
      if(i===0||i===10)kick(tt,.6);if(i===4||i===12)snare(tt,.16);if(i%2===0)hat(tt,.04);
      if(i===0){chordNotes(song,deg,0,true).forEach((n,k)=>{tone('sine',mtof(n),tt+k*.012,spb*15,.07,master,{a:.08,r:.6});tone('triangle',mtof(n),tt+k*.012,spb*15,.03,delaySend,{a:.08,r:.6,det:6});});}
      if(i===0||i===8)tone('sine',mtof(chordNotes(song,deg,-2)[0]),tt,spb*6,.42,master,{a:.01,r:.3});
      if(i===0&&bar%2===0)noise(tt,spb*32,.012,'highpass',3000); // vinyl hiss
    } else if(style==='rock'){
      if(i===0||i===6||i===8||i===10)kick(tt,.95);if(i===4||i===12)snare(tt,.45);if(i%2===0)hat(tt,.09,i===14);
      const n=chordNotes(song,deg,-1);
      if(!intro||i%4===0){if(i%2===0){tone('sawtooth',mtof(n[0]),tt,spb*1.6,.13,dist,{cut:2200});tone('sawtooth',mtof(n[0]+7),tt,spb*1.6,.1,dist,{cut:2200,det:8});}}
      if(i%2===0)tone('sawtooth',mtof(n[0]-12),tt,spb*1.8,.22,master,{cut:500});
      if(i===0&&bar%8===0)noise(tt,1.2,.12,'highpass',5000); // crash
    } else {
      if(i%4===0)kick(tt,.85);if(i===4||i===12){snare(tt,.3);noise(tt,.3,.08,'bandpass',1200,delaySend);}if(i%2===1)hat(tt,.05);
      const b=chordNotes(song,deg,-2)[0];tone('sawtooth',mtof(i%2?b+12:b),tt,spb*.9,.16,master,{cut:700,q:4});
      if(i===0)chordNotes(song,deg).forEach(n=>{tone('sawtooth',mtof(n),tt,spb*16,.035,master,{a:.3,r:.5,cut:1400,det:-7});tone('sawtooth',mtof(n),tt,spb*16,.035,delaySend,{a:.3,r:.5,cut:1400,det:7});});
      if(!intro){const n=chordNotes(song,deg,1);tone('square',mtof(n[[0,1,2,1][i%4]]),tt,spb*.8,.025,delaySend,{cut:3000});}
    }
    // melody
    if(!intro&&bar%16<14){
      const m=(section?melody.B:melody.A)[(bar%2)*16+i];
      if(m){const nt=scaleNote(song,m.deg+deg,style==='rock'?-1:0);const dur=spb*(m.len*2);
        if(style==='country')tone('sawtooth',mtof(nt),tt,dur,.05,master,{cut:1800,a:.01});
        else if(style==='lofi')tone('triangle',mtof(nt),tt,dur*1.5,.09,delaySend,{a:.01,r:.3});
        else if(style==='rock')tone('square',mtof(nt),tt,dur,.05,dist,{cut:2600});
        else tone('square',mtof(nt),tt,dur,.04,delaySend,{cut:2500});}
    }
  }
  function tick(){
    if(!on||!ctx)return;
    const song=STATIONS[st].songs[sg];if(!song)return;const spb=60/song.bpm/4;
    while(nextT<ctx.currentTime+.15){playStep(step,nextT);nextT+=spb;step++;}
    if(step>=16*48){next(true);} // move on after 48 bars
  }
  function startSong(){if(!ctx)return;const song=STATIONS[st].songs[sg];if(!song){ui();return;}melody=makeMelody(song);step=0;nextT=ctx.currentTime+.08;delay.delayTime.value=60/song.bpm*.75;ui();}
  function applyGain(){if(!ctx)return;const g=on?vol*vol*env.a*.9:0;master.gain.setTargetAtTime(g,ctx.currentTime,.08);muffle.frequency.setTargetAtTime(env.m,ctx.currentTime,.1);}
  function power(v){if(!init())return;on=v===undefined?!on:v;if(ctx.state==='suspended')ctx.resume();
    if(on){if(!timer)timer=setInterval(tick,25);startSong();}else{clearInterval(timer);timer=null;}applyGain();ui();}
  function pick(s,g){st=s;sg=g;if(!on)power(true);else startSong();}
  function next(auto){const n=STATIONS[st].songs.length||1;sg=(sg+1)%n;if(on)startSong();ui();}
  function prev(){const n=STATIONS[st].songs.length||1;sg=(sg+n-1)%n;if(on)startSong();ui();}
  function setVol(v){vol=clamp(v,0,1);try{localStorage.setItem('endless-road-vol',String(vol));}catch(e){}applyGain();ui();}
  function setEnv(muffleHz,att){if(Math.abs(env.m-muffleHz)>50||Math.abs(env.a-att)>.02){env={m:muffleHz,a:att};applyGain();}}
  function suspend(v){if(!ctx)return;if(v)ctx.suspend();else ctx.resume();}
  // --- UI
  const $=id=>document.getElementById(id);
  function ui(){
    const el=$('radio');if(!el)return;
    $('rPower').classList.toggle('on',on);
    const cs=STATIONS[st].songs[sg];
    $('rLcd').innerHTML=on?(cs?`<b>${STATIONS[st].name}</b> · ${cs.name}`:'NO DISC'):'<span style="opacity:.5">radio off</span>';
    listeners.forEach(f=>f(lcdText()));
    $('rStations').innerHTML=STATIONS.map((s,k)=>`<button class="rs${k===st?' sel':''}${s.cd?' cdb':''}" data-st="${k}">${s.name}<small>${s.tag}</small></button>`).join('');
    $('rSongs').innerHTML=(STATIONS[st].cd&&!STATIONS[st].songs.length)?'<div style="opacity:.6;padding:6px">No CDs yet. Find them in abandoned houses!</div>':STATIONS[st].songs.map((s,k)=>`<button class="rsong${on&&k===sg?' sel':''}" data-sg="${k}">${on&&k===sg?'♪ ':''}${s.name}<small>${s.bpm} bpm</small></button>`).join('');
    $('rVol').value=Math.round(vol*100);$('rVolTxt').textContent=Math.round(vol*100)+'%';
    $('radioBtn').classList.toggle('on',on);
  }
  function bindUI(){
    const blur=e=>{if(e&&e.target&&e.target.blur)e.target.blur();};
    $('rStations').addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(!b)return;st=+b.dataset.st;sg=0;if(on)startSong();else power(true);ui();blur(e);});
    $('rSongs').addEventListener('click',e=>{const b=e.target.closest('[data-sg]');if(!b)return;pick(st,+b.dataset.sg);blur(e);});
    $('rPower').onclick=e=>{power();blur(e);};$('rPrev').onclick=e=>{prev();blur(e);};$('rNext').onclick=e=>{next();blur(e);};
    $('rVol').addEventListener('input',e=>setVol(e.target.value/100));$('rVol').addEventListener('change',blur);
    $('radioBtn').addEventListener('pointerdown',e=>{e.preventDefault();toggle();});
    $('rClose').onclick=e=>{toggle(false);blur(e);};
    ui();
  }
  function toggle(v){const el=$('radio');const show=v===undefined?el.classList.contains('hidden'):v;el.classList.toggle('hidden',!show);if(show)init();ui();}
  function lcdText(){if(!on)return '';const cs=STATIONS[st].songs[sg];return cs?(STATIONS[st].cd?'CD  ':STATIONS[st].name.toUpperCase()+'  ')+cs.name:'NO DISC';}
  function addCD(id,play){if(!owned.includes(id)){owned.push(id);try{localStorage.setItem('endless-road-cds',JSON.stringify(owned));}catch(e){}refreshCD();}
    if(play){st=STATIONS.indexOf(CDST);sg=CDST.songs.findIndex(s=>s.id===id);if(!on)power(true);else startSong();}ui();}
  function hasCD(id){return owned.includes(id);}
  function onChange(f){listeners.push(f);f(lcdText());}
  return {addCD,hasCD,onChange,lcdText,bindUI,power,next,prev,setVol,setEnv,toggle,suspend,init,get on(){return on;},get vol(){return vol;}};
})();

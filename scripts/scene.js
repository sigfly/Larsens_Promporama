const canvas=document.getElementById('view'),ctx=canvas.getContext('2d');
const voice=document.getElementById('voice');
const fartAudio=document.getElementById('fartAudio');
// Web Audio uses one shared clock for BOTH sounds, the lips and fart clouds.
// The old HTML <audio> elements remain for developer controls / compatibility.
const AudioContextClass=window.AudioContext||window.webkitAudioContext;
let audioEngine=null, audioBuffersPromise=null, audioBuffers=null, audioEngineError=null;
let audioPlaybackToken=0, scheduledFartVisual=null, speechAudioStartAt=null;
let activeAudioSources=[];
let playbackPaused=false, pauseStartedAt=0, pausedAudioTime=0;
const mediaCancellations=new Set();
function getAudioEngine(){
 if(!AudioContextClass)throw new Error('Web Audio is not supported on this browser');
 if(!audioEngine)audioEngine=new AudioContextClass({latencyHint:'interactive'});
 return audioEngine;
}
function wavDataToBytes(uri){
 const base64=uri.substring(uri.indexOf(',')+1);
 const binary=atob(base64);
 const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes.buffer;
}
async function decodeAudioAsset(engine,src){
 if(src.startsWith('data:'))return engine.decodeAudioData(wavDataToBytes(src));
 const response=await fetch(src);
 if(!response.ok)throw new Error(`Could not load ${src}: ${response.status}`);
 return engine.decodeAudioData(await response.arrayBuffer());
}
function prepareAudioBuffers(){
 if(audioBuffersPromise)return audioBuffersPromise;
 try{
  const engine=getAudioEngine();
  audioBuffersPromise=(async()=>{
   // All 19 clips plus the two original voice clips decoded just once.
   const items=await Promise.all([
    ...EMBEDDED_FART_AUDIO.map(x=>decodeAudioAsset(engine,x.src)),
    ...EMBEDDED_AUDIO.map(x=>decodeAudioAsset(engine,x))
   ]);
   audioBuffers={farts:items.slice(0,EMBEDDED_FART_AUDIO.length),speech:items.slice(EMBEDDED_FART_AUDIO.length)};
   return audioBuffers;
  })();
 }catch(e){audioEngineError=e;audioBuffersPromise=Promise.reject(e);}
 audioBuffersPromise.catch(e=>{audioEngineError=e;console.warn('Audio decoding unavailable, using compatible fallback:',e)});
 return audioBuffersPromise;
}
function unlockAudioOnUserClick(){
 // IMPORTANT: resume directly inside the 'Promp ivei' click handler.
 // Android Chrome otherwise may suspend sound until another touch.
 try{
  const engine=getAudioEngine();
  const resume=engine.resume();
  if(resume&&resume.catch)resume.catch(e=>{audioEngineError=e;console.warn('Web Audio resume:',e)});
  prepareAudioBuffers();
 }catch(e){audioEngineError=e;console.warn('Falling back to HTML audio:',e)}
}
function audibleAudioTime(){
 if(!audioEngine)return -Infinity;
 if(playbackPaused)return pausedAudioTime;
 if(audioEngine.state!=='running')return -Infinity;
 if(typeof audioEngine.getOutputTimestamp==='function'){
  const ts=audioEngine.getOutputTimestamp();
  if(ts && Number.isFinite(ts.contextTime) && Number.isFinite(ts.performanceTime)
     && ts.performanceTime>0 && Math.abs(ts.performanceTime-performance.now())<3000){
   return ts.contextTime+(performance.now()-ts.performanceTime)/1000;
  }
 }
 // Older mobile browsers: approximate when audio reaches the speakers.
 return Math.max(0,audioEngine.currentTime-(audioEngine.baseLatency||0)-(audioEngine.outputLatency||0));
}
function stopWebAudioPair(){
 audioPlaybackToken++;
 for(const cancel of [...mediaCancellations])cancel();
 for(const source of activeAudioSources){try{source.stop()}catch(e){}}
 activeAudioSources=[];
 scheduledFartVisual=null;
 speechAudioStartAt=null;
}
function currentSpeechPlaybackTime(){
 return speechAudioStartAt===null ? voice.currentTime : Math.max(0,audibleAudioTime()-speechAudioStartAt);
}
function activateScheduledVisual(now){
 const pending=scheduledFartVisual;
 if(!pending)return;
 if(audibleAudioTime()+0.001<pending.audioStart)return;
 scheduledFartVisual=null;
 // Pose, score and the first cloud now begin with the audible fart,
 // not with the JavaScript request to start playing a clip.
 increaseScore(pending.which);
 setPose(fartControlMap[pending.which].pose);
 currentSpeech=fartControlMap[pending.which].speechClip;
 speechAudioStartAt=pending.audioStart;
 setSpeechButtonsActive(currentSpeech);
 const remaining=pending.duration-Math.max(0,audibleAudioTime()-pending.audioStart);
  if(remaining>0 && !document.hidden)triggerFartCloud(pending.which,remaining,now);
}
async function waitForAudibleEnd(targetTime,token,duration){
 let remaining=(duration+4)*1000, previous=performance.now();
 while(token===audioPlaybackToken && remaining>0){
  const now=performance.now();
  if(!playbackPaused)remaining-=now-previous;
  previous=now;
  if(!playbackPaused && audibleAudioTime()>=targetTime)return;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
}
const forwardImage=new Image(),turnedImage=new Image();
function updateStatus(){
 const el=document.getElementById('loadStatus');
 if(forwardImage.naturalWidth && turnedImage.naturalWidth){
   el.textContent='Ready — both photos, speech clips, fart sounds and animation are stored inside this HTML file.';
   el.style.color='#a2d9bf';
 } else if (forwardImage.complete && turnedImage.complete){
   el.textContent='Image decoding failed. Please open this HTML file in Chrome rather than a document preview.';
   el.style.color='#ffd18a';
 }
}
forwardImage.onload=updateStatus;turnedImage.onload=updateStatus;
forwardImage.onerror=updateStatus;turnedImage.onerror=updateStatus;
forwardImage.src=EMBEDDED_FORWARD;turnedImage.src=EMBEDDED_WOMAN;
let pose='front', currentSpeech=-1;
const speechButtons=Array.from(document.querySelectorAll('[data-clip]'));
const sprites=Array.from({length:18},(_,i)=>{const img=new Image();img.src=EMBEDDED_MOUTHS[i];return img});
const womanSprites=Array.from({length:18},(_,i)=>{const img=new Image();img.src=EMBEDDED_WOMAN_MOUTHS[i];return img});
const $=id=>document.getElementById(id);
const poseControlMap={
 front:{x:'fx',y:'fy',w:'fw',strength:'fstrength',delay:'fdelay',out:{x:'fxv',y:'fyv',w:'fwv',strength:'fsv',delay:'fdv'}},
 woman:{x:'wx',y:'wy',w:'ww',strength:'wstrength',delay:'wdelay',out:{x:'wxv',y:'wyv',w:'wwv',strength:'wsv',delay:'wdv'}}
};
function readPoseSettings(which){
 const m=poseControlMap[which];
 return {x:+$(m.x).value,y:+$(m.y).value,w:+$(m.w).value,strength:+$(m.strength).value/100,delay:+$(m.delay).value/1000};
}
function updatePoseOutputs(which){
 const m=poseControlMap[which], o=readPoseSettings(which);
 $(m.out.x).textContent=o.x; $(m.out.y).textContent=o.y; $(m.out.w).textContent=o.w;
 $(m.out.strength).textContent=Math.round(o.strength*100)+'%'; $(m.out.delay).textContent=Math.round(o.delay*1000)+' ms';
 return o;
}
function settings(){ updatePoseOutputs('front'); updatePoseOutputs('woman'); return readPoseSettings(pose); }
for(const which of ['front','woman']){ const m=poseControlMap[which]; for(const id of [m.x,m.y,m.w,m.strength,m.delay]) $(id).addEventListener('input',()=>settings()); }

const fartControlMap={
 woman:{size:'fwSize',rate:'fwRate',x:'fwx',y:'fwy',out:{size:'fwSizeValue',rate:'fwRateValue',x:'fwxValue',y:'fwyValue'},dir:-1,color:[188,188,188],button:'fartWomanBtn',speechClip:0,pose:'woman',label:'Woman'},
 man:{size:'rmSize',rate:'rmRate',x:'rmx',y:'rmy',out:{size:'rmSizeValue',rate:'rmRateValue',x:'rmxValue',y:'rmyValue'},dir:1,color:[182,182,182],button:'fartManBtn',speechClip:1,pose:'front',label:'Right man'}
};
const fartState={woman:{puffs:[],activeUntil:0,lastSpawn:0},man:{puffs:[],activeUntil:0,lastSpawn:0}};
function readFartSettings(which){ const m=fartControlMap[which]; return {size:+$(m.size).value/100,rate:+$(m.rate).value/100,x:+$(m.x).value,y:+$(m.y).value,dir:m.dir,color:m.color,label:m.label}; }
function updateFartOutputs(which){
 const m=fartControlMap[which], s=readFartSettings(which);
 $(m.out.size).textContent=Math.round(s.size*100)+'%'; $(m.out.rate).textContent=Math.round(s.rate*100)+'%';
 $(m.out.x).textContent=s.x; $(m.out.y).textContent=s.y; return s;
}
for(const which of Object.keys(fartControlMap)){ const m=fartControlMap[which]; for(const id of [m.size,m.rate,m.x,m.y]) $(id).addEventListener('input',()=>updateFartOutputs(which)); updateFartOutputs(which); }

function updateAutoFartOutputs(reschedule=false){
 const interval=+$('autoFartFreq').value;
 $('autoFartFreqValue').textContent=interval+' s';
 $('autoFartFreq').style.setProperty('--progress',((interval-1)/599*100)+'%');
 // While waiting, changing the slider alters the pause measured from the
 // previous completed sound pair, rather than starting a new countdown.
 if(reschedule && autoFartEnabled && autoFartPhase==='waiting'){
  nextAutoFartAt=autoWaitStartedAt+interval;
 }
}
$('autoFartFreq').addEventListener('input',()=>updateAutoFartOutputs(true));
updateAutoFartOutputs(false);

function rand(min,max){ return min+Math.random()*(max-min); }
function square(){
 const s={x:+$('sx').value,y:+$('sy').value,size:+$('ss').value};
 s.x=Math.max(0,Math.min(s.x,forwardImage.naturalWidth-s.size)); s.y=Math.max(0,Math.min(s.y,forwardImage.naturalHeight-s.size));
 $('sxValue').textContent=s.x; $('syValue').textContent=s.y; $('ssValue').textContent=s.size+' px'; return s;
}
function setSpeechButtonsActive(idx){ speechButtons.forEach((q,i)=>q.classList.toggle('active',i===idx)); }
async function playSpeechClip(k){
 stopWebAudioPair();
 voice.pause(); currentSpeech=k; voice.src=EMBEDDED_AUDIO[k]; voice.currentTime=0;
 try{ await voice.play(); }catch(e){ console.error('Speech playback failed:',e); }
 setSpeechButtonsActive(k);
}
function stopSpeech(){ stopWebAudioPair(); resetPause(); fartAudio.pause(); voice.pause(); voice.currentTime=0; currentSpeech=-1; setSpeechButtonsActive(-1); }

function spawnFartPuff(which,bias=1){
 const st=fartState[which], s=readFartSettings(which), dir=s.dir;
 const baseRadius=(18+Math.random()*14)*s.size*bias, sourceSpread=9*s.size;
 st.puffs.push({
  x:s.x+rand(-sourceSpread,sourceSpread*0.4), y:s.y+rand(-sourceSpread*0.55,sourceSpread*0.55),
  vx:dir*(55+Math.random()*40)*s.size*(0.8+Math.random()*0.45), vy:rand(-10,10), radius:baseRadius,
  ttl:rand(1.2,2.1), age:0, alpha:rand(0.30,0.50), wobble:rand(10,24), spin:Math.random()*Math.PI*2,
  blobs:Array.from({length:4+Math.floor(Math.random()*3)},()=>({dx:rand(-0.75,0.75),dy:rand(-0.55,0.55),scale:rand(0.45,0.95)}))
 });
}
function triggerFartCloud(which,duration,now=performance.now()/1000){
 const st=fartState[which];
 st.activeUntil=now+duration; st.lastSpawn=now-0.12;
 for(let i=0;i<3;i++)spawnFartPuff(which,1.1-i*0.12);
 updateFartButtons(now);
}
function resetPause(){
 playbackPaused=false;
 if(audioEngine?.state==='suspended')audioEngine.resume().catch(console.warn);
 $('pause').textContent='Pause';
}
function stopAllFarts(){
 resetPause();
 for(const which of Object.keys(fartState)){ fartState[which].activeUntil=0; fartState[which].puffs=[]; }
 fartAudio.pause(); fartAudio.currentTime=0;
 stopWebAudioPair();
 updateFartButtons(performance.now()/1000);
}
function updateFartButtons(now){
 for(const which of Object.keys(fartControlMap)) $(fartControlMap[which].button).classList.toggle('active',fartState[which].activeUntil>now||fartState[which].puffs.length>0);
 $('autoFartStart').classList.toggle('active',autoFartEnabled);
 $('autoFartStop').classList.toggle('active',!autoFartEnabled);
}
function updateFarts(now,dt){
 if(playbackPaused)return;
 activateScheduledVisual(now);
 for(const which of Object.keys(fartState)){
  const st=fartState[which], s=readFartSettings(which), interval=Math.max(0.045,0.12/Math.max(0.6,s.rate));
  if(document.hidden){st.puffs=[];st.lastSpawn=now;continue;}
   if(now<st.activeUntil){ while(st.lastSpawn+interval<=now){ st.lastSpawn+=interval; spawnFartPuff(which,rand(0.8,1.15)); } }
  const next=[];
  for(const puff of st.puffs){
   puff.age+=dt; if(puff.age>=puff.ttl)continue; const life=puff.age/puff.ttl;
   puff.x+=puff.vx*dt+Math.sin(puff.spin+puff.age*3.2)*puff.wobble*dt*0.75;
   puff.y+=puff.vy*dt+Math.cos(puff.spin+puff.age*2.7)*puff.wobble*dt*0.35-4*dt;
   puff.vx*=Math.pow(0.992,dt*60); puff.vy*=Math.pow(0.995,dt*60); puff.radius+=(18+18*(1-life))*dt*s.size; next.push(puff);
  }
  st.puffs=next;
 }
 updateFartButtons(now);
}
function drawSinglePuff(puff,color){
 const life=puff.age/puff.ttl, alpha=Math.max(0,(1-life))*puff.alpha; if(alpha<=0.002)return;
 ctx.save();
 for(const blob of puff.blobs){
  const bx=puff.x+blob.dx*puff.radius*(0.55+life*0.25), by=puff.y+blob.dy*puff.radius*(0.55+life*0.2), br=puff.radius*blob.scale*(1+life*0.18);
  const grad=ctx.createRadialGradient(bx-br*0.22,by-br*0.2,br*0.16,bx,by,br);
  grad.addColorStop(0,`rgba(255,255,255,${alpha*0.9})`);
  grad.addColorStop(0.32,`rgba(${color[0]},${color[1]},${color[2]},${alpha*0.88})`);
  grad.addColorStop(0.7,`rgba(132,132,132,${alpha*0.46})`);
  grad.addColorStop(1,'rgba(70,70,70,0)');
  ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fill();
 }
 ctx.restore();
}
function drawFarts(){
 for(const which of Object.keys(fartState)){ const s=readFartSettings(which); for(const puff of fartState[which].puffs) drawSinglePuff(puff,s.color); }
 if($('fartMarker').checked){
  for(const which of Object.keys(fartControlMap)){
   const s=readFartSettings(which); ctx.save(); ctx.lineWidth=2; ctx.strokeStyle='#7dff8d'; ctx.fillStyle='#b7ff98'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
   ctx.beginPath(); ctx.moveTo(s.x-14,s.y); ctx.lineTo(s.x+14,s.y); ctx.moveTo(s.x,s.y-14); ctx.lineTo(s.x,s.y+14); ctx.stroke();
   ctx.beginPath(); ctx.arc(s.x,s.y,4,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
 }
}
function chooseRandomFartSound(){ return EMBEDDED_FART_AUDIO[Math.floor(Math.random()*EMBEDDED_FART_AUDIO.length)]; }
const fartScores={woman:0,man:0};
function increaseScore(which){
 fartScores[which]++;
 $('fartScore').textContent=`${fartScores.woman}-${fartScores.man}`;
}
// Return a promise that settles when the actual media finishes, not when play() starts.
// The fallback prevents the show freezing if a browser cannot play a particular file.
function playMediaThrough(media, src, expectedSeconds){
 media.pause(); media.src=src; media.currentTime=0;
 return new Promise(resolve=>{
  let settled=false;
  let timer=0;
   let remaining=Math.max(3500,(expectedSeconds+3)*1000), previous=performance.now();
  const finish=()=>{
   if(settled)return;
   settled=true;
   clearInterval(timer);
    mediaCancellations.delete(finish);
   media.removeEventListener('ended',finish);
   media.removeEventListener('error',finish);
   resolve();
  };
  mediaCancellations.add(finish);
   media.addEventListener('ended',finish);
  media.addEventListener('error',finish);
  timer=setInterval(()=>{const now=performance.now();if(!playbackPaused)remaining-=now-previous;previous=now;if(remaining<=0)finish();},100);
  try{
   const promise=media.play();
   if(promise && promise.catch)promise.catch(e=>{console.warn('Sound blocked:',e);finish();});
  }catch(e){console.warn('Sound unavailable:',e);finish();}
 });
}
let sceneStarted=false, autoFartEnabled=false, nextAutoFartAt=0, autoWaitStartedAt=0;
let autoFartPhase='off', autoSequenceId=0;
async function playFartEvent(which, chosenSound=null){
 if(!sceneStarted)return;
 const eventToken=audioPlaybackToken;
 const sound=chosenSound||chooseRandomFartSound();
 const cfg=fartControlMap[which];
 $('autoFartHint').textContent=`Last fart: ${cfg.label} — ${sound.file} (${sound.duration.toFixed(2)} s). Cloud duration follows the chosen sound.`;
 try{
  const buffers=await prepareAudioBuffers();
   if(eventToken!==audioPlaybackToken)return;
  const engine=getAudioEngine();
  if(engine.state!=='running')await engine.resume();
  if(engine.state!=='running')throw new Error('Audio engine is not running');
  const index=EMBEDDED_FART_AUDIO.indexOf(sound);
  if(index<0)throw new Error('Unrecognized fart sound');
  // Kill any prior pair if the developer controls interrupted the show.
  stopWebAudioPair();
  voice.pause();
  fartAudio.pause();
  currentSpeech=-1;
  setSpeechButtonsActive(-1);
  const token=audioPlaybackToken;
  const fartSource=engine.createBufferSource();
  const speechSource=engine.createBufferSource();
  fartSource.buffer=buffers.farts[index];
  speechSource.buffer=buffers.speech[cfg.speechClip];
  fartSource.connect(engine.destination);
  speechSource.connect(engine.destination);
  activeAudioSources=[fartSource,speechSource];
  // A short look-ahead provides the browser time to queue audio reliably.
  // Both clips share this EXACT start time on the Web Audio clock.
  const startAt=engine.currentTime+0.16;
  const fartDuration=fartSource.buffer.duration;
  const pairDuration=Math.max(fartDuration,speechSource.buffer.duration);
  scheduledFartVisual={which,audioStart:startAt,duration:fartDuration,token};
  // No clouds or pose switch happen here: that is done once sound reaches
  // the output device (via getOutputTimestamp) inside the animation loop.
  fartSource.start(startAt);
  speechSource.start(startAt);
  await waitForAudibleEnd(startAt+pairDuration,token,pairDuration+0.16);
  if(token===audioPlaybackToken){
   // Guarantee a visual update if the tab briefly missed animation frames.
   activateScheduledVisual(performance.now()/1000);
   currentSpeech=-1;
   speechAudioStartAt=null;
   setSpeechButtonsActive(-1);
   activeAudioSources=[];
  }
  return;
 }catch(e){
  if(eventToken!==audioPlaybackToken)return;
   console.warn('Web Audio unavailable for this event; using HTML audio:',e);
  stopWebAudioPair();
  // Compatible fallback: wait for the audio element to actually enter
  // the playing state BEFORE displaying the first cloud.
  const fallbackToken=audioPlaybackToken;
   let fired=false;
  const startFallbackVisual=()=>{
   if(fired || fallbackToken!==audioPlaybackToken)return;
   fired=true;
   increaseScore(which);
   setPose(cfg.pose);
   triggerFartCloud(which,sound.duration);
   currentSpeech=cfg.speechClip;
   setSpeechButtonsActive(cfg.speechClip);
  };
  fartAudio.addEventListener('playing',startFallbackVisual,{once:true});
  const fartFinished=playMediaThrough(fartAudio,sound.src,sound.duration);
  const speechFinished=playMediaThrough(voice,EMBEDDED_AUDIO[cfg.speechClip],clips[cfg.speechClip].duration);
  await Promise.all([fartFinished,speechFinished]);
  fartAudio.removeEventListener('playing',startFallbackVisual);
  if(fallbackToken!==audioPlaybackToken)return;
  currentSpeech=-1;
  setSpeechButtonsActive(-1);
 }
}
function updateAutoFartStatus(now){
 const interval=+$('autoFartFreq').value;
 if(!autoFartEnabled){ $('autoFartState').textContent='Random farting: off'; }
 else if(autoFartPhase==='playing'){$('autoFartState').textContent='Playing fart and response';}
 else{
  const left=Math.max(0,nextAutoFartAt-now);
  $('autoFartState').textContent=`Pause after sound: ${interval} s — next in ${left.toFixed(1)} s`;
 }
}
function scheduleNextAutoFart(){
 autoWaitStartedAt=performance.now()/1000;
 nextAutoFartAt=autoWaitStartedAt+(+$('autoFartFreq').value);
 autoFartPhase='waiting';
}
async function triggerRandomAutoFart(){
 if(!autoFartEnabled||autoFartPhase!=='waiting')return;
 autoFartPhase='playing';
 const run=autoSequenceId;
 const which=Math.random()<0.5?'woman':'man';
 try{await playFartEvent(which,chooseRandomFartSound());}
 catch(e){console.error('Fart event failed:',e);}
 finally{
  // The interval begins only AFTER the last of both sound clips ends.
  if(autoFartEnabled&&run===autoSequenceId)scheduleNextAutoFart();
 }
}
function startAutoFarts(){
 if(!sceneStarted)return;
 ++autoSequenceId;
 autoFartEnabled=true;
 scheduleNextAutoFart();
 updateFartButtons(performance.now()/1000);
}
function stopAutoFarts(){
 ++autoSequenceId; autoFartEnabled=false; autoFartPhase='off';
 updateFartButtons(performance.now()/1000);
 updateAutoFartStatus(performance.now()/1000);
}
function updateAutoFarts(now){
 if(!playbackPaused&&autoFartEnabled&&autoFartPhase==='waiting'&&now>=nextAutoFartAt){
  triggerRandomAutoFart().catch(console.error);
 }
 updateAutoFartStatus(now);
}

let lastFrame=performance.now()/1000;
function draw(){
 const now=performance.now()/1000, dt=Math.min(0.05,Math.max(0.001,now-lastFrame)); lastFrame=now;
 updateAutoFarts(now); updateFarts(now,dt);
 ctx.fillStyle='#000'; ctx.fillRect(0,0,1920,1080);
 if(forwardImage.complete && forwardImage.naturalWidth>0){
  const scale=Math.min(1920/forwardImage.naturalWidth,1080/forwardImage.naturalHeight), left=(1920-forwardImage.naturalWidth*scale)/2, top=(1080-forwardImage.naturalHeight*scale)/2;
  ctx.drawImage(forwardImage,left,top,forwardImage.naturalWidth*scale,forwardImage.naturalHeight*scale);
  const s=square();
  if(pose==='woman'&&turnedImage.complete&&turnedImage.naturalWidth===forwardImage.naturalWidth&&turnedImage.naturalHeight===forwardImage.naturalHeight) ctx.drawImage(turnedImage,s.x,s.y,s.size,s.size,left+s.x*scale,top+s.y*scale,s.size*scale,s.size*scale);
  if($('showSquare').checked){ ctx.save(); ctx.strokeStyle='#f6ce4f'; ctx.lineWidth=2; ctx.setLineDash([8,5]); ctx.strokeRect(left+s.x*scale,top+s.y*scale,s.size*scale,s.size*scale); ctx.restore(); }
 }
 drawFarts();
 const o=settings();
 if(currentSpeech>=0&&(speechAudioStartAt!==null||(!voice.ended&&voice.currentTime>0))){
  const clip=clips[currentSpeech], t=currentSpeechPlaybackTime()-o.delay, fi=Math.floor(t*clip.fps), idx=fi>=0&&fi<clip.poses.length?clip.poses[fi]:-1;
  if(idx>=0){
   const sc=o.w/15;
   if(pose==='front'){
    const sprite=sprites[idx];
    if(sprite.complete&&sprite.naturalWidth){ ctx.save(); ctx.globalAlpha=Math.min(1,o.strength/.84); ctx.drawImage(sprite,o.x-32*sc,o.y-31*sc,68*sc,70*sc); ctx.restore(); }
   } else {
    const sprite=womanSprites[idx];
    if(sprite.complete&&sprite.naturalWidth){ ctx.save(); ctx.globalAlpha=Math.min(1,o.strength/.84); ctx.drawImage(sprite,o.x-24*sc,o.y-22*sc,48*sc,44*sc); ctx.restore(); }
   }
  }
 }
 if($('marker').checked){
  ctx.save(); ctx.lineWidth=2; ctx.strokeStyle='#ffe27a'; ctx.fillStyle='#ffdf65'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
  ctx.beginPath(); ctx.moveTo(o.x-17,o.y); ctx.lineTo(o.x+17,o.y); ctx.moveTo(o.x,o.y-17); ctx.lineTo(o.x,o.y+17); ctx.stroke();
  ctx.beginPath(); ctx.arc(o.x,o.y,4,0,Math.PI*2); ctx.fill(); ctx.restore();
 }
 const sec=voice.currentTime||0; $('time').textContent=`${Math.floor(sec/60)}:${(sec%60).toFixed(2).padStart(5,'0')}`;
 requestAnimationFrame(draw);
}
function setPose(next){ pose=next; $('front').classList.toggle('active',pose==='front'); $('woman').classList.toggle('active',pose==='woman'); }
$('front').onclick=()=>setPose('front');
$('woman').onclick=()=>setPose('woman');
for(const b of speechButtons) b.onclick=async()=>{ await playSpeechClip(+b.dataset.clip); };
async function togglePlaybackPause(){
 if(currentSpeech<0 && activeAudioSources.length===0)return;
 const next=!playbackPaused;
 const frozenTime=audibleAudioTime();
 try{
  if(activeAudioSources.length){
   if(next)await audioEngine.suspend(); else await audioEngine.resume();
  }else{
   if(next){voice.pause();fartAudio.pause();}
   else await Promise.all([voice,fartAudio].filter(m=>m.src&&!m.ended).map(m=>m.play()));
  }
  if(next){pauseStartedAt=performance.now()/1000;pausedAudioTime=frozenTime;}
  else{
   const elapsed=performance.now()/1000-pauseStartedAt;
   for(const st of Object.values(fartState)){st.activeUntil+=elapsed;st.lastSpawn+=elapsed;}
  }
  playbackPaused=next;
  $('pause').textContent=next?'Resume':'Pause';
 }catch(error){console.warn('Could not pause or resume playback:',error);}
}
$('pause').onclick=()=>togglePlaybackPause();
$('stop').onclick=()=>stopSpeech();
voice.onended=()=>{ currentSpeech=-1; setSpeechButtonsActive(-1); };
$('fartWomanBtn').onclick=()=>playFartEvent('woman').catch(console.error);
$('fartManBtn').onclick=()=>playFartEvent('man').catch(console.error);
$('autoFartStart').onclick=()=>startAutoFarts();
$('autoFartStop').onclick=()=>stopAutoFarts();
$('fartStopBtn').onclick=()=>stopAllFarts();
// Curtain stays completely closed for five seconds after page load.
// Then both halves draw apart, revealing the already-loaded scene and start button.
const curtainEl=$('theatreCurtain');
const startButton=$('sceneStart');
window.setTimeout(()=>{
 curtainEl.classList.add('opening');
 const reduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 window.setTimeout(()=>{
  curtainEl.hidden=true;
  startButton.disabled=false;
 }, reduced ? 360 : 2950);
},5000);
// Only a real button press starts the countdown or any sound.
startButton.addEventListener('click',()=>{
 if(sceneStarted||startButton.disabled)return;
 sceneStarted=true;
 unlockAudioOnUserClick();
 $('startOverlay').hidden=true;
 startAutoFarts();
 updateAutoFartStatus(performance.now()/1000);
});
// Ctrl+Shift+D optionally reveals all retained test controls; Escape hides them again.
document.addEventListener('keydown',e=>{
 if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='d'){$('developerPanel').hidden=!$('developerPanel').hidden;e.preventDefault();}
 if(e.key==='Escape')$('developerPanel').hidden=true;
});
prepareAudioBuffers().catch(()=>{});
settings(); updateAutoFartStatus(performance.now()/1000); requestAnimationFrame(draw);

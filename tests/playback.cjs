const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let time = 10000;
const nodes = new Map();
function node(id) {
 if (!nodes.has(id)) nodes.set(id, {value:'100', checked:false, currentTime:0, ended:false, paused:true,
  classList:{toggle(){},add(){}},style:{setProperty(){}},addEventListener(){},removeEventListener(){},
  getContext(){return {}},pause(){this.paused=true},play(){return Promise.reject(new Error('blocked'))}});
 return nodes.get(id);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]+)"/g))node(match[1]).value=match[2];
const context=vm.createContext({console:{warn(){},error(){}},document:{hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}},
 window:{setTimeout(){},matchMedia:()=>({matches:false})},Image:class{},performance:{now:()=>time},
 setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame(){},Uint8Array,atob,fetch});
const run=code=>vm.runInContext(code,context);
run(fs.readFileSync(path.join(root,'scripts/media.js'),'utf8'));
run(fs.readFileSync(path.join(root,'scripts/scene.js'),'utf8'));
(async()=>{
 run(`audioEngine={state:'running',currentTime:10,suspend:async function(){this.state='suspended'},resume:async function(){this.state='running'}};
 activeAudioSources=[{stop(){}}]; currentSpeech=0; fartState.woman.activeUntil=15; fartState.woman.lastSpawn=10;`);
 await run('togglePlaybackPause()');
 assert.equal(run('playbackPaused'),true);
 assert.equal(run('audioEngine.state'),'suspended');
 time+=2000;
 await run('togglePlaybackPause()');
 assert.equal(run('playbackPaused'),false);
 assert.equal(run('fartState.woman.activeUntil'),17);
 console.log('PASS: Web Audio pause/resume and cloud timing');
 run(`scheduledFartVisual={which:'woman',audioStart:1,duration:1};audioEngine.currentTime=10;
 fartState.woman.puffs=[];activateScheduledVisual(12);`);
 assert.equal(run('fartScores.woman'),1);
 assert.equal(run('fartState.woman.puffs.length'),0);
 console.log('PASS: expired background event does not restart cloud');
 run(`sceneStarted=true;audioBuffersPromise=Promise.reject(new Error('decode failed'));`);
 await run("playFartEvent('man')");
 assert.equal(run('fartScores.man'),0);
 assert.equal(run('fartState.man.puffs.length'),0);
 console.log('PASS: failed fallback playback gives no score or cloud');
 run(`voice.play=()=>new Promise(()=>{});`);
 const waiting=run("playMediaThrough(voice,'test.wav',1)");
 run('stopSpeech()');
 await waiting;
 assert.equal(run('mediaCancellations.size'),0);
 console.log('PASS: stop settles pending fallback playback');
 for(const match of (html+fs.readFileSync(path.join(root,'scripts/media.js'),'utf8')).matchAll(/(?:assets|scripts|styles)\/[\w/.-]+/g))
  assert.ok(fs.existsSync(path.join(root,match[0])),match[0]);
 console.log('PASS: local source and media references exist');
})().catch(error=>{console.error(error);process.exitCode=1});

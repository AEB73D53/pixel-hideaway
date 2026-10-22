import { MAX_BYTES, MAX_PIXELS, parsePNG, validateMetadata, transform } from './core.js';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file-input','dropzone','upload-label','upload-help','selected-file','file-name','file-details','clear-file','sample-button','password','toggle-password','random-password','process-button','cancel-button','reset-button','download-button','scramble-tab','restore-tab','controls','key-title','input-title','output-title','input-tag','output-tag','input-canvas','output-canvas','input-demo','output-demo','input-caption','output-caption','input-size','output-size','preview-badge','result-placeholder','status','progress-wrap','progress','result-info-title','result-info-text'].map(id => [id, $(id)]));
let mode = 'scramble', file = null, result = null, worker = null, busy = false, loading = false, loadVersion = 0;
let downloadURL = null;
const supported = !!(globalThis.crypto?.subtle && globalThis.Worker && globalThis.OffscreenCanvas && globalThis.CompressionStream && globalThis.DecompressionStream && globalThis.createImageBitmap);
const bytesLabel = n => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function status(message, kind = '') {
  ui.status.className = 'status-message' + (kind ? ' ' + kind : '');
  ui.status.querySelector('span').textContent = message;
  ui.status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}
function invalidateResult() {
  result = null;
  if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = null; }
  ui['download-button'].disabled = true;
  ui['result-info-title'].textContent = mode === 'scramble' ? '给图片加一点神秘感' : '让画面回到原样';
  ui['result-info-text'].textContent = mode === 'scramble' ? '保留所有像素，随时用口令还原。' : '上传原始混淆 PNG，输入相同口令。';
  ui['output-canvas'].getContext('2d').clearRect(0, 0, ui['output-canvas'].width, ui['output-canvas'].height);
  ui['result-placeholder'].hidden = false;
  ui['result-placeholder'].querySelector('small').textContent = mode === 'scramble' ? '准备好后，点击「开始混淆」' : '准备好后，点击「开始还原」';
  ui['output-demo'].hidden = true;
  ui['output-caption'].textContent = '等待处理'; ui['output-size'].textContent = '—';
}
function setBusy(value) {
  busy = value;
  for (const id of ['dropzone','clear-file','sample-button','password','random-password','scramble-tab','restore-tab','reset-button']) ui[id].disabled = value;
  ui['process-button'].disabled = value || loading || !supported;
  ui['cancel-button'].hidden = !value;
  ui['progress-wrap'].hidden = !value;
  ui.controls.setAttribute('aria-busy', String(value));
  ui['process-button'].querySelector('span').textContent = value ? '正在处理…' : mode === 'scramble' ? '开始混淆' : '开始还原';
}
function stopWorker() {
  worker?.terminate(); worker = null;
  setBusy(false);
}
function canvasDraw(bitmap, canvas) {
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}
async function displayBlob(blob, canvas, isCurrent = () => true) {
  const bitmap = await createImageBitmap(blob);
  if (isCurrent()) canvasDraw(bitmap, canvas);
  bitmap.close();
}
function drawSample(canvas) {
  canvas.width = 720; canvas.height = 540;
  const c = canvas.getContext('2d'), w = 720, h = 540;
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#d4e4ec'); sky.addColorStop(.56, '#efdaca'); sky.addColorStop(1, '#d1dcd9');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f8e0b9'; c.beginPath(); c.arc(540, 137, 46, 0, Math.PI * 2); c.fill();
  const path = (points, color) => { c.fillStyle = color; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); };
  path([[0,300],[64,244],[98,257],[175,170],[234,220],[305,158],[365,235],[420,204],[497,269],[550,242],[628,292],[720,250],[720,540],[0,540]], '#8eaaa9');
  path([[139,207],[175,170],[211,200],[187,191],[172,198],[164,188]], '#dce3df');
  path([[275,190],[305,158],[337,197],[313,184],[303,191],[294,179]], '#dce3df');
  path([[0,311],[80,293],[168,318],[230,290],[313,332],[430,281],[515,309],[611,268],[720,302],[720,540],[0,540]], '#688b85');
  path([[0,353],[90,335],[188,359],[307,340],[414,358],[550,340],[720,355],[720,540],[0,540]], '#b6cccb');
  const lake = c.createLinearGradient(0,350,0,540); lake.addColorStop(0,'#aec5c7'); lake.addColorStop(1,'#dce3d7');c.fillStyle=lake;c.fillRect(0,361,w,179);
  c.strokeStyle='#dce5de';c.lineWidth=2;
  for(let i=0;i<22;i++){let y=366+i*7;c.beginPath();c.moveTo(300+Math.sin(i*2)*65,y);c.lineTo(480+Math.cos(i)*65,y);c.stroke();}
  path([[0,383],[70,364],[152,400],[202,430],[160,473],[232,540],[0,540]], '#557669');
  path([[720,367],[648,382],[591,414],[638,438],[552,493],[583,540],[720,540]], '#789381');
  function tree(x,y,s){c.fillStyle='#45665b';c.fillRect(x-2*s,y,4*s,45*s);path([[x,y-64*s],[x-18*s,y-10*s],[x-12*s,y-14*s],[x-26*s,y+15*s],[x+26*s,y+15*s],[x+12*s,y-14*s],[x+18*s,y-10*s]],'#45665b');}
  tree(51,372,1.2);tree(19,367,.8);tree(110,400,.8);tree(663,405,.9);tree(700,398,1.2);
  // A quiet, deterministic grain gives the sample a printed-postcard texture.
  const image=c.getImageData(0,0,w,h);let seed=42;
  for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;const n=((seed>>>24)/255-.5)*7;for(let j=0;j<3;j++)image.data[i+j]+=n;}
  c.putImageData(image,0,0);
}
function demoPreview() {
  drawSample(ui['input-canvas']);
  const c = ui['input-canvas'], pixels = c.getContext('2d').getImageData(0,0,c.width,c.height);
  const shuffled = transform(pixels.data,c.width,c.height,'0123456789abcdef0123456789abcdef');
  ui['output-canvas'].width=c.width;ui['output-canvas'].height=c.height;
  ui['output-canvas'].getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(shuffled.buffer),c.width,c.height),0,0);
  ui['result-placeholder'].hidden=true;
  ui['input-demo'].hidden=false; ui['output-demo'].hidden=false;
  ui['input-caption'].textContent='每一张图片，都有另一种可能';
  ui['output-caption'].textContent='像素换个位置，小秘密就藏好了';
  ui['input-size'].textContent='—'; ui['output-size'].textContent='—';
  ui['preview-badge'].textContent='效果示意';
}
async function loadFile(candidate) {
  if (!candidate || busy || !supported) return;
  const version = ++loadVersion;
  loading = true; ui['process-button'].disabled = true;
  try {
    if (candidate.size > MAX_BYTES) throw new Error('图片超过 50 MB，请选择更小的图片。');
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    const png = parsePNG(bytes);
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const webp = new TextDecoder().decode(bytes.subarray(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8,12)) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error('请选择有效的 PNG、JPG 或 WebP 图片。');
    if (mode === 'restore' && !png?.metadata) throw new Error('请上传本站生成的原始混淆 PNG，当前图片没有还原参数。');
    if (png?.metadata) validateMetadata(png.metadata, png.header);
    if (png && png.header.width * png.header.height > MAX_PIXELS) throw new Error('图片超过 1200 万像素，请先缩小尺寸。');
    const bitmap = await createImageBitmap(candidate);
    const { width, height } = bitmap;
    if (width * height > MAX_PIXELS) { bitmap.close(); throw new Error('图片超过 1200 万像素，请先缩小尺寸。'); }
    if (version !== loadVersion) { bitmap.close(); return; }
    file = candidate;
    invalidateResult();
    canvasDraw(bitmap,ui['input-canvas']); bitmap.close();
    ui['input-demo'].hidden=true;
    ui['selected-file'].hidden=false;
    ui['file-name'].textContent=candidate.name;
    ui['file-details'].textContent=`${width} × ${height} · ${bytesLabel(candidate.size)}`;
    ui['input-caption'].textContent=candidate.name;
    ui['input-size'].textContent=`${width} × ${height}`;
    ui['preview-badge'].textContent='已载入图片';
    ui['upload-label'].textContent='点击或拖拽，更换图片';
    if (mode === 'scramble' && png?.metadata) status('这是一张已经混淆的图片。需要还原时，请切换到「图片还原」。');
    else status(mode==='scramble'?'图片已准备好。设置口令后，点击「开始混淆」。':'已识别 PH1 还原参数。输入原口令，点击「开始还原」。');
  } catch(error) {
    if(version===loadVersion) status(/图片|文件|PNG|参数/.test(error.message)?error.message:'无法读取图片，请检查文件是否完整，或更换一张图片。','error');
  } finally {
    if(version===loadVersion){loading=false;ui['process-button'].disabled=busy||!supported;}
    ui['file-input'].value='';
  }
}
function setMode(next) {
  if(busy || next===mode) return;
  ++loadVersion; loading=false; ui['process-button'].disabled=!supported;
  const previousResult=result;
  mode=next;
  ui['scramble-tab'].classList.toggle('active',mode==='scramble');ui['restore-tab'].classList.toggle('active',mode==='restore');
  for(const id of ['scramble-tab','restore-tab']){const active=(id==='scramble-tab')===(mode==='scramble');ui[id].setAttribute('aria-selected',String(active));ui[id].tabIndex=active?0:-1;}
  ui.controls.setAttribute('aria-labelledby',mode==='scramble'?'scramble-tab':'restore-tab');
  ui['key-title'].textContent=mode==='scramble'?'设置混淆口令':'输入原来的口令';
  ui.password.placeholder=mode==='scramble'?'输入一个你记得住的口令':'输入生成混淆图时的口令';
  ui.password.autocomplete=mode==='scramble'?'new-password':'current-password';
  ui['sample-button'].hidden=mode==='restore';ui['random-password'].hidden=mode==='restore';
  ui['upload-help'].innerHTML=mode==='restore'?'仅支持本站生成的原始 PNG<br>最大 50 MB · 最多 1200 万像素':'PNG、JPG、WebP · 最大 50 MB<br>最多 1200 万像素';
  ui['input-title'].textContent=mode==='scramble'?'原始图片':'混淆图片';
  ui['output-title'].textContent=mode==='scramble'?'混淆结果':'还原结果';
  ui['process-button'].querySelector('span').textContent=mode==='scramble'?'开始混淆':'开始还原';
  ui['file-input'].accept=mode==='restore'?'image/png':'image/png,image/jpeg,image/webp';
  invalidateResult();
  // Switching directly after a successful operation reuses its PNG.
  if(previousResult){loadFile(new File([previousResult.blob],previousResult.name,{type:'image/png'}));}
  else {
    status(mode==='restore'?'上传本站生成的原始混淆 PNG，并输入相同口令。':'上传图片开始，或试试左侧的示例图片。');
    if(!file){ui['input-canvas'].getContext('2d').clearRect(0,0,ui['input-canvas'].width,ui['input-canvas'].height);ui['input-demo'].hidden=true;ui['input-caption'].textContent='等待上传';ui['preview-badge'].textContent='等待上传';if(mode==='scramble')demoPreview();}
  }
}
async function processImage() {
  if(busy || loading || !supported) return;
  if(!file){status('请先上传一张图片，或点击「试试示例」。','error');ui.dropzone.focus();return;}
  if(!ui.password.value){status('请先填写口令，还原图片时也需要它。','error');ui.password.focus();return;}
  const password=ui.password.value, source=file, activeMode=mode;
  invalidateResult();setBusy(true);ui.progress.value=0;status('正在准备处理…');
  const currentWorker = new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker=currentWorker;
  currentWorker.onmessage=async({data})=>{
    if(worker!==currentWorker)return;
    if(data.error){stopWorker();status(data.error,'error');return;}
    if(data.progress){ui.progress.value=data.progress;status(data.message);return;}
    if(data.done){
      try{
        const clean=source.name.replace(/\.[^.]+$/,'').replace(/-(scrambled|restored)$/,'');
        const name=`${clean}-${activeMode==='scramble'?'scrambled':'restored'}.png`;
        await displayBlob(data.blob,ui['output-canvas'],()=>worker===currentWorker);
        if(worker!==currentWorker)return;
        result={blob:data.blob,name,mode:activeMode};
        downloadURL=URL.createObjectURL(data.blob);
        ui['result-placeholder'].hidden=true;ui['output-demo'].hidden=true;
        ui['output-caption'].textContent=activeMode==='scramble'?'像素已打乱 · PNG 无损保存':'完整性验证通过 · RGBA 像素已还原';
        ui['output-size'].textContent=`${data.width} × ${data.height}`;
        ui['preview-badge'].textContent=activeMode==='scramble'?'混淆完成':'还原完成';
        ui['result-info-title'].textContent=activeMode==='scramble'?'混淆完成，小秘密藏好了':'还原完成，画面回来了';
        ui['result-info-text'].textContent=`PNG · ${bytesLabel(data.blob.size)} · ${activeMode==='scramble'?'包含还原参数':'像素完整性校验通过'}`;
        ui['download-button'].disabled=false;
        status(activeMode==='scramble'?'混淆成功！下载原始 PNG 并保管好口令；切换「图片还原」可立即验证。':'还原成功！像素完整性校验通过，可以下载还原图片。','success');
      }catch{status('图片已处理，但无法显示结果。请尝试较小的图片。','error');}
      finally{if(worker===currentWorker)stopWorker();}
    }
  };
  currentWorker.onerror=()=>{if(worker===currentWorker){stopWorker();status('处理线程意外停止，可能是内存不足。请缩小图片后重试。','error');}};
  currentWorker.postMessage({file:source,password,mode:activeMode});
}
function reset() {
  ++loadVersion;loading=false;stopWorker();file=null;invalidateResult();
  ui.password.value='';ui.password.type='password';ui['toggle-password'].setAttribute('aria-pressed','false');ui['toggle-password'].setAttribute('aria-label','显示口令');
  ui['file-input'].value='';ui['selected-file'].hidden=true;ui['upload-label'].textContent='点击上传，或拖拽到这里';
  ui['input-caption'].textContent='等待上传';ui['input-size'].textContent='—';ui['preview-badge'].textContent='等待上传';
  ui['input-canvas'].getContext('2d').clearRect(0,0,ui['input-canvas'].width,ui['input-canvas'].height);ui['input-demo'].hidden=true;
  if(mode==='scramble')demoPreview();
  status(mode==='scramble'?'上传图片开始，或试试左侧的示例图片。':'上传本站生成的原始混淆 PNG，并输入相同口令。');
}
ui.dropzone.addEventListener('click',()=>ui['file-input'].click());
ui['file-input'].addEventListener('change',e=>loadFile(e.target.files[0]));
for(const event of ['dragenter','dragover'])ui.dropzone.addEventListener(event,e=>{e.preventDefault();if(!busy)ui.dropzone.classList.add('dragover');});
for(const event of ['dragleave','drop'])ui.dropzone.addEventListener(event,e=>{e.preventDefault();ui.dropzone.classList.remove('dragover');});
ui.dropzone.addEventListener('drop',e=>{if(e.dataTransfer.files.length>1)status('每次请选择一张图片。','error');else loadFile(e.dataTransfer.files[0]);});
// Prevent an accidental drop outside the target from navigating away.
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
ui['sample-button'].addEventListener('click',async()=>{if(busy||loading)return;const canvas=document.createElement('canvas');drawSample(canvas);if(!ui.password.value)ui.password.value='pixel-demo-2026';canvas.toBlob(blob=>{if(blob)loadFile(new File([blob],'山间来信.png',{type:'image/png'}));},'image/png');});
ui['clear-file'].addEventListener('click',reset);ui['reset-button'].addEventListener('click',reset);
ui['scramble-tab'].addEventListener('click',()=>setMode('scramble'));ui['restore-tab'].addEventListener('click',()=>setMode('restore'));
for(const id of ['scramble-tab','restore-tab'])ui[id].addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();setMode(e.key==='Home'?'scramble':e.key==='End'?'restore':mode==='scramble'?'restore':'scramble');ui[mode==='scramble'?'scramble-tab':'restore-tab'].focus();}});
ui['toggle-password'].addEventListener('click',()=>{const show=ui.password.type==='password';ui.password.type=show?'text':'password';ui['toggle-password'].setAttribute('aria-pressed',String(show));ui['toggle-password'].setAttribute('aria-label',show?'隐藏口令':'显示口令');});
ui['random-password'].addEventListener('click',()=>{ui.password.value=[...crypto.getRandomValues(new Uint8Array(10))].map(v=>v.toString(16).padStart(2,'0')).join('');invalidateResult();status('已生成随机口令。请点击眼睛图标查看并妥善保存。');});
ui.password.addEventListener('input',()=>{if(result){invalidateResult();status('口令已更改，请重新处理图片。');}});
ui.password.addEventListener('keydown',e=>{if(e.key==='Enter')processImage();});
ui['process-button'].addEventListener('click',processImage);
ui['cancel-button'].addEventListener('click',()=>{stopWorker();status('已取消处理。可以调整图片或口令后重试。');});
ui['download-button'].addEventListener('click',()=>{if(!result||!downloadURL)return;const a=document.createElement('a');a.href=downloadURL;a.download=result.name;document.body.append(a);a.click();a.remove();});
window.addEventListener('pagehide',()=>{worker?.terminate();if(downloadURL)URL.revokeObjectURL(downloadURL);});
demoPreview();
if(!supported){status('当前浏览器缺少本地处理能力。请使用新版 Chrome、Edge、Firefox 或 Safari，并通过 HTTPS 或 localhost 打开。','error');for(const id of ['process-button','dropzone','sample-button','random-password'])ui[id].disabled=true;}

const tools = {line:'Линия',arrow:'Стрелка',circle:'Круг',angle:'Угол',text:'Текст',brush:'Кисть',eraser:'Ластик'};
const palette = {red:['#ff616d','Красный'],green:['#4de4a3','Зелёный'],yellow:['#ffe064','Жёлтый']};

export function annotationPanel(choices,draft,esc) {
  const options = choices.map(item=>`<option value="${esc(item.media.url)}">${item.label}</option>`).join('');
  return `<div id="annotationPanel" class="annotation-layout">
    <section class="panel"><div class="ph"><h2>Видео упражнения</h2></div><div class="pb">
    <div class="field"><label for="annotationSource">Исходное видео</label><select id="annotationSource">${options}</select></div>
    <div class="video"><video id="annotationVideo" src="${esc(choices[0].media.url)}" controls playsinline preload="metadata"></video></div>
    <div class="tools annotation-actions"><button class="btn primary" id="captureFrame">Сделать стоп-кадр</button></div>
    ${choices.length>1?`<details><summary>Сравнить видео до и после</summary><div class="field"><label for="compareSource">Второе видео</label><select id="compareSource">${options}</select></div>
    <div class="video"><video id="compareVideo" src="${esc(choices[1].media.url)}" controls playsinline preload="none"></video></div>
    <label for="compareSeek">Синхронная позиция</label><input id="compareSeek" type="range" min="0" max="1000" value="0"></details>`:''}
    </div></section>
    <section class="panel"><div class="ph"><h2>Разметка кадра</h2></div><div class="pb">
    <p class="sub" id="frameHelp">Поставь видео на нужный момент и сделай стоп-кадр.</p>
    <div class="canvas-shell" hidden><canvas id="markCanvas" aria-label="Кадр для рисования"></canvas></div>
    <fieldset class="annotation-workspace" id="markTools" disabled><legend>Инструмент</legend>
    <div class="tools mark-tools">${Object.entries(tools).map(([id,label])=>`<button class="btn" data-mark="${id}" aria-pressed="${id==='arrow'}">${label}</button>`).join('')}</div>
    <div class="tools annotation-actions"><label for="markColor">Цвет</label><select id="markColor">${Object.entries(palette).map(([id,[,label]])=>`<option value="${id}">${label}</option>`).join('')}</select>
    <input id="markText" placeholder="Подпись на кадре" maxlength="70" aria-label="Подпись на кадре" hidden></div>
    <div class="tools annotation-actions"><button class="btn" id="markUndo">Отменить</button><button class="btn" id="markRedo">Повторить</button><button class="btn" id="markClear">Очистить</button>
    <button class="btn primary" id="markSave">Прикрепить кадр</button></div></fieldset>
    <div class="frame-list" id="frameList">${(draft.frames||[]).map(frame=>`<figure><img src="${esc(frame.url)}" alt="Кадр с пометками"><button class="btn" data-remove-frame="${esc(frame.url)}">Убрать кадр</button></figure>`).join('')}</div>
    <details class="recording"><summary>Записать разбор</summary><p class="smallnote">Запись включает клиентское видео и разметку стоп-кадра. Для голоса браузер запросит доступ к микрофону.</p>
    <label><input id="recordMic" type="checkbox"> Записать голос</label><div class="tools annotation-actions">
    <button class="btn" id="recordStart">Начать запись</button><button class="btn" id="recordPause" disabled>Пауза</button>
    <button class="btn primary" id="recordStop" disabled>Сохранить запись</button></div>
    <div id="recordPreview">${draft.recording?`<video controls playsinline src="${esc(draft.recording.url)}"></video>`:''}</div></details>
    </div></section></div>`;
}

function drawShape(ctx,shape,w,h) {
  const points = shape.points.map(([x,y])=>[x*w,y*h]);
  const [start] = points;
  const end = points.at(-1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3,w/220);
  ctx.strokeStyle = ctx.fillStyle = shape.color;
  ctx.beginPath();
  ctx.moveTo(...start);
  if (shape.type==='text') {
    ctx.font = `600 ${Math.round(w/24)}px system-ui`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#101513';
    ctx.strokeText(shape.text,...start);
    ctx.fillText(shape.text,...start);
  } else if (shape.type==='circle') {
    const radius = Math.hypot(end[0]-start[0],end[1]-start[1]);
    ctx.beginPath();
    ctx.arc(...start,radius,0,Math.PI*2);
    ctx.stroke();
  } else {
    for (const point of points.slice(1)) ctx.lineTo(...point);
    if (shape.type==='arrow') {
      const angle = Math.atan2(end[1]-start[1],end[0]-start[0]);
      for (const turn of [-0.5,0.5]) {
        ctx.moveTo(...end);
        ctx.lineTo(end[0]-Math.cos(angle+turn)*w/30,end[1]-Math.sin(angle+turn)*w/30);
      }
    }
    ctx.stroke();
    if (shape.type==='angle' && points.length===3) {
      const [a,b,c] = points;
      const first = Math.atan2(a[1]-b[1],a[0]-b[0]);
      const last = Math.atan2(c[1]-b[1],c[0]-b[0]);
      const degrees = Math.round(Math.acos(Math.cos(first-last))*180/Math.PI);
      ctx.font=`${Math.round(w/29)}px system-ui`;
      ctx.fillText(degrees+'°',b[0]+8,b[1]-8);
    }
  }
  ctx.restore();
}

function segmentDistance(point,start,end) {
  const dx = end[0]-start[0];
  const dy = end[1]-start[1];
  const projection = dx||dy ? ((point[0]-start[0])*dx+(point[1]-start[1])*dy)/(dx*dx+dy*dy) : 0;
  const t = Math.max(0,Math.min(1,projection));
  return Math.hypot(point[0]-start[0]-t*dx,point[1]-start[1]-t*dy);
}
function hits(shape,point) {
  const [start] = shape.points;
  if (shape.type==='circle') {
    const end = shape.points.at(-1);
    return Math.abs(Math.hypot(point[0]-start[0],point[1]-start[1])-Math.hypot(end[0]-start[0],end[1]-start[1]))<.04;
  }
  if (shape.type==='text') return Math.hypot(point[0]-start[0],point[1]-start[1])<.08;
  return shape.points.slice(1).some((end,i)=>segmentDistance(point,shape.points[i],end)<.035);
}

export function mountAnnotation(panel,editor,handlers) {
  const find = id => panel.querySelector('#'+id);
  const video = find('annotationVideo');
  const canvas = find('markCanvas');
  const context = canvas.getContext('2d');
  const work = find('markTools');
  let tool = 'arrow';
  let color = palette.red[0];
  let current = null;
  let corners = [];
  let recorder;
  let feed;
  let raf;
  let recordingCanvas;
  let recordingFrame = false;
  editor.stack ??= [[]];
  editor.position ??= 0;
  const shapes = () => editor.stack[editor.position];
  const draw = () => {
    if (!editor.frame) return;
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(editor.frame,0,0,canvas.width,canvas.height);
    for (const shape of shapes()) drawShape(context,shape,canvas.width,canvas.height);
    if (current) drawShape(context,current,canvas.width,canvas.height);
    find('markUndo').disabled = editor.position===0;
    find('markRedo').disabled = editor.position===editor.stack.length-1;
  };
  function showFrame() {
    canvas.width = editor.frame.width;
    canvas.height = editor.frame.height;
    canvas.closest('.canvas-shell').hidden = false;
    work.disabled = false;
    find('frameHelp').textContent = 'Кадр на '+editor.time.toFixed(2)+' с. Выбери инструмент и сделай пометки.';
    draw();
  }
  function commit(next) {
    editor.stack.splice(editor.position+1,Infinity,next);
    editor.position++;
    draw();
  }
  if (editor.frame) showFrame();
  find('annotationSource').addEventListener('change',event=>{ video.src=event.target.value; });
  find('captureFrame').addEventListener('click',()=>{
    if (video.readyState<2 || video.seeking) return handlers.notify('Дождись загрузки кадра.');
    video.pause();
    const frame = document.createElement('canvas');
    frame.width = Math.min(video.videoWidth,1280);
    frame.height = Math.round(frame.width*video.videoHeight/video.videoWidth);
    frame.getContext('2d').drawImage(video,0,0,frame.width,frame.height);
    Object.assign(editor,{frame,time:video.currentTime,stack:[[]],position:0});
    corners = [];
    recordingFrame = true;
    showFrame();
  });
  video.addEventListener('play',()=>{ recordingFrame=false; });
  panel.querySelectorAll('[data-mark]').forEach(button=>button.addEventListener('click',()=>{
    tool=button.dataset.mark;
    corners=[];
    find('markText').hidden=tool!=='text';
    panel.querySelectorAll('[data-mark]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if (tool==='angle') find('frameHelp').textContent='Коснись первой точки, вершины угла и конечной точки.';
  }));
  find('markColor').addEventListener('change',event=>{ color=palette[event.target.value][0]; });
  const point = event => {
    const rect=canvas.getBoundingClientRect();
    return [Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height))];
  };
  canvas.addEventListener('pointerdown',event=>{
    const start=point(event);
    if (tool==='eraser') {
      const index=shapes().findLastIndex(shape=>hits(shape,start));
      if (index>=0) commit(shapes().filter((_,i)=>i!==index));
      return;
    }
    if (tool==='text') {
      const text=find('markText').value.trim();
      if (!text) return handlers.notify('Сначала введи подпись.');
      return commit([...shapes(),{type:tool,color,points:[start],text}]);
    }
    if (tool==='angle') {
      corners.push(start);
      if (corners.length===3) {
        commit([...shapes(),{type:tool,color,points:corners}]);
        corners=[];
      }
      return;
    }
    current={type:tool,color,points:[start,start]};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if (!current) return;
    if (current.type==='brush') current.points.push(point(event));
    else current.points[1]=point(event);
    draw();
  });
  canvas.addEventListener('pointerup',event=>{
    if (!current) return;
    current.points[current.points.length-1]=point(event);
    const completed=current;
    current=null;
    commit([...shapes(),completed]);
  });
  canvas.addEventListener('pointercancel',()=>{current=null;draw();});
  find('markUndo').onclick=()=>{if (editor.position>0) editor.position--;draw();};
  find('markRedo').onclick=()=>{if (editor.position<editor.stack.length-1) editor.position++;draw();};
  find('markClear').onclick=()=>commit([]);
  const frames = find('frameList');
  frames.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-frame]');
    if (!button) return;
    handlers.removeFrame(button.dataset.removeFrame);
    button.closest('figure').remove();
  });
  find('markSave').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try {
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const url=await handlers.frame(blob,editor.time);
      const figure=document.createElement('figure');
      const img=document.createElement('img');
      img.src=url;
      img.alt='Кадр с пометками';
      const remove=document.createElement('button');
      remove.className='btn';
      remove.textContent='Убрать кадр';
      remove.dataset.removeFrame=url;
      figure.append(img,remove);
      frames.append(figure);
    } catch (error) { handlers.notify(error.message); }
    finally { button.disabled=false; }
  });
  const compare=find('compareVideo');
  if (compare) {
    find('compareSource').selectedIndex=1;
    find('compareSource').addEventListener('change',event=>{compare.src=event.target.value;});
    find('compareSeek').addEventListener('input',event=>{
      const fraction=Number(event.target.value)/1000;
      for (const player of [video,compare]) if (Number.isFinite(player.duration)) player.currentTime=player.duration*fraction;
    });
  }

  const start=find('recordStart');
  const pause=find('recordPause');
  const stop=find('recordStop');
  start.onclick=async()=>{
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return handlers.notify('Этот браузер не поддерживает запись разбора.');
    if (video.readyState<2) return handlers.notify('Дождись загрузки видео.');
    start.disabled=true;
    try {
      const voice=find('recordMic').checked ? await navigator.mediaDevices.getUserMedia({audio:true}) : null;
      recordingCanvas=document.createElement('canvas');
      recordingCanvas.width=Math.min(video.videoWidth,960);
      recordingCanvas.height=Math.round(recordingCanvas.width*video.videoHeight/video.videoWidth);
      const ctx=recordingCanvas.getContext('2d');
      feed=recordingCanvas.captureStream(24);
      for (const track of voice?.getTracks()||[]) feed.addTrack(track);
      const mimeType=voice?'video/webm;codecs=vp8,opus':'video/webm;codecs=vp8';
      recorder=new MediaRecorder(feed,{mimeType});
      const chunks=[];
      recorder.ondataavailable=event=>{if (event.data.size) chunks.push(event.data);};
      recorder.onstop=async()=>{
        cancelAnimationFrame(raf);
        feed.getTracks().forEach(track=>track.stop());
        pause.disabled=stop.disabled=true;
        try {
          const url=await handlers.recording(new Blob(chunks,{type:'video/webm'}));
          const player=document.createElement('video');
          player.controls=player.playsInline=true;
          player.src=url;
          find('recordPreview').replaceChildren(player);
        } catch (error) { handlers.notify(error.message); }
        finally { start.disabled=false; }
      };
      function frame() {
        if (!panel.isConnected) { if (recorder.state!=='inactive') recorder.stop(); return; }
        ctx.drawImage(recordingFrame&&editor.frame?canvas:video,0,0,recordingCanvas.width,recordingCanvas.height);
        raf=requestAnimationFrame(frame);
      }
      recorder.start(200);
      frame();
      pause.disabled=stop.disabled=false;
      pause.textContent='Пауза';
    } catch (error) {
      feed?.getTracks().forEach(track=>track.stop());
      start.disabled=false;
      handlers.notify('Не удалось начать запись. '+error.message);
    }
  };
  pause.onclick=()=>{
    if (recorder.state==='recording') {recorder.pause();pause.textContent='Продолжить';}
    else if (recorder.state==='paused') {recorder.resume();pause.textContent='Пауза';}
  };
  stop.onclick=()=>{if (recorder.state!=='inactive') recorder.stop();};
}

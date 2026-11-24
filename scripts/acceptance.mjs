import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {browser} from './cdp.mjs';

const app = process.env.TRENI_TEST_URL || 'http://127.0.0.1:4183';
const screenshots = process.env.TRENI_SCREENSHOTS;
const b = await browser(Number(process.env.TRENI_CDP_PORT||9331));
const {run,send} = b;
const failures = [];
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const state = async()=> (await fetch(app+'/api/state').then(r=>r.json())).state;
const wait = async (predicate,label='DOM ready') => {
  for (let i=0;i<70;i++) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error('Timed out: '+label);
};
const dom = expression=>run(`(()=>{const $=(s)=>document.querySelector(s); const all=(s)=>[...document.querySelectorAll(s)];return (${expression});})()`);
const click = selector=>dom(`$(${JSON.stringify(selector)}).click()`);
const clickText = text=>dom(`all('#view button').find(btn=>btn.textContent.trim()===${JSON.stringify(text)}).click()`);
const fill = (selector,value,event='input') => dom(`(()=>{const el=$(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));return el.value;})()`);
const has = text => dom(`$('#view').innerText.includes(${JSON.stringify(text)})`);
const go = async page => {
  await click(`.topnav [data-page="${page}"]`);
  await sleep(80);
};
const navigate = async url=>{
  await send('Page.navigate',{url:app+'/'+url});
  await wait(()=>dom("!!$('#modeBtn') && !!$('#view h1')"));
};
const test = async (id,description,action)=>{
  try {
    await action();
    console.log(`${id} PASS ${description}`);
  } catch (error) {
    console.error(`${id} FAIL ${description}: ${error.message}`);
    failures.push(id);
  }
};
const shot = async name => {
  if (!screenshots) return;
  await mkdir(screenshots,{recursive:true});
  const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(screenshots,name+'.png'),Buffer.from(png.data,'base64'));
};
async function drag(source,target,atEnd=false) {
  return dom(`(()=>{
    const source=$(${JSON.stringify(source)}),target=$(${JSON.stringify(target)});
    const dataTransfer=new DataTransfer();
    const rect=target.getBoundingClientRect();
    const send=(element,type,clientY)=>element.dispatchEvent(new DragEvent(type,{dataTransfer,bubbles:true,cancelable:true,clientY}));
    send(source,'dragstart',0);
    const y=${atEnd}?rect.bottom-1:rect.top+1;
    send(target,'dragover',y);
    const indicator=!!$('.insert-before,.insert-after,.insert-empty');
    send(target,'drop',y);
    send(source,'dragend',y);
    return indicator;
  })()`);
}
async function dragWithMouse(from,to) {
  const points=await dom(`(()=>{
    const a=$(${JSON.stringify(from)}).getBoundingClientRect(), z=$(${JSON.stringify(to)}).getBoundingClientRect();
    return {from:{x:a.left+8,y:a.top+a.height/2},to:{x:z.left+8,y:z.top+3}};
  })()`);
  await send('Input.setInterceptDrags',{enabled:true});
  try {
    const intercepted=b.once('Input.dragIntercepted');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+20,y:points.from.y,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...points.to,button:'left',buttons:1});
    const {data}=await intercepted;
    for (const type of ['dragEnter','dragOver']) await send('Input.dispatchDragEvent',{type,...points.to,data});
    assert.ok(await dom("!!$('.insert-before,.insert-after,.insert-empty')"));
    await send('Input.dispatchDragEvent',{type:'drop',...points.to,data});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1});
  } finally { await send('Input.setInterceptDrags',{enabled:false}); }
}
async function selectFile(selector,filename) {
  const {root} = await send('DOM.getDocument');
  const {nodeId} = await send('DOM.querySelector',{nodeId:root.nodeId,selector});
  await send('DOM.setFileInputFiles',{nodeId,files:[filename]});
}
async function drawArrow() {
  const rect=await dom("(()=>{const r=$('#markCanvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()");
  assert.ok(rect.w>100);
  const a={x:rect.x+rect.w*.3,y:rect.y+rect.h*.3};
  const z={x:rect.x+rect.w*.65,y:rect.y+rect.h*.55};
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...z,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...z,button:'left',buttons:0,clickCount:1});
}
async function playable(selector) {
  await wait(()=>dom(`$(${JSON.stringify(selector)})?.readyState>=2`),'video frame');
  assert.ok(await run(`(async()=>{const v=document.querySelector(${JSON.stringify(selector)});await v.play();await new Promise(r=>setTimeout(r,450));const moved=v.currentTime>.1;v.pause();return moved;})()`));
}
let assignment, session, exercise, uploadMedia, priorWeeks, frameUrl;
try {
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('');
  assert.equal((await state()).blocks.length,0,'Use a fresh TRENI_STORAGE directory');
  await test('T01','Навигация, Назад и Главная в обеих ролях',async()=>{
    for (const page of ['clients','constructor','queue']) {
      await go(page);
      assert.ok(await dom("!!$('[data-action=back]')"));
      await click('[data-action=back]');
      await wait(()=>has('Кабинет тренера'));
    }
    await click('#modeBtn');
    for (const page of ['program','feedback','profile']) {
      await go(page);
      await click('[data-action=back]');
      await wait(()=>has('Твой тренировочный кабинет'));
    }
    await go('home');
  });
  await test('T02','Анкета, сохранение сервера и повторная загрузка',async()=>{
    await go('profile');
    const fields={name:'Тестовая Александра',birth:'29.02.2000',sex:'Женский',height:'169',weight:'58.5',
      goal:'Вернуться к тренировкам и повысить выносливость.\nТри занятия.',limits:'Свободное описание ограничений.',experience:'Зал 2 года.',
      activity:'Прогулки',schedule:'Пн и Чт'};
    for (const [field,value] of Object.entries(fields)) await fill(`[name=${field}]`,value);
    await click('[data-action=save-profile]');
    await wait(async()=> (await state()).clients[0].goal===fields.goal);
    await navigate('#client/profile');
    for (const [field,value] of Object.entries(fields)) assert.equal(await dom(`$('[name=${field}]').value`),value);
  });
  await test('T03','Будущая и несуществующая даты не сохраняются',async()=>{
    for (const [birth,error] of [['29.02.2001','существующую дату'],['01.01.9999','в будущем']]) {
      await fill('[name=birth]',birth);
      await click('[data-action=save-profile]');
      assert.ok(await has(error));
      assert.equal((await state()).clients[0].birth,'29.02.2000');
    }
  });
  await test('T04','Выбор клиента, анкета и полноширинные длинные поля',async()=>{
    await click('#modeBtn');
    await go('constructor');
    await fill('#clientSelect','max','change');
    assert.ok(await has('Вернуться к регулярным тренировкам'));
    assert.ok(await has('Предпочитает две тренировки'));
    assert.equal(await dom("all('.fact-long').length"),3);
    assert.equal(await dom("$('.fact-long b').clientWidth > $('.facts').clientWidth*.85"),true);
    await fill('#clientSelect','alex','change');
  });
  await test('T05','1065 карточек, независимая прокрутка, поиск и фильтр',async()=>{
    assert.equal(await dom("all('#libList .libcard').length"),1065);
    const positions=await dom("(()=>{const list=$('.library-scroll');const y=$('.trainingScroll').getBoundingClientRect().top;list.scrollTop=list.scrollHeight;return [list.scrollTop,y,$('.trainingScroll').getBoundingClientRect().top];})()");
    assert.ok(positions[0]>10000);
    assert.equal(positions[1],positions[2]);
    await fill('#libSearch','Болгарский');
    assert.ok(await dom("all('.libcard').length>0 && all('.libcard').length<50"));
    await click('[data-action=cat][data-cat=Ноги]');
    assert.equal(await dom("$('#libSearch').value"),'Болгарский');
    await fill('#libSearch','');
    await click('[data-action=cat][data-cat=Все]');
  });
  await test('T06','Перетаскивание мышью из библиотеки, вставка и перенос Т1/Т2/Т3',async()=>{
    await dragWithMouse('.libcard[data-id=current-2]','[data-drop=T1] .bcard');
    await wait(async()=> (await state()).program.weeks[1].T1[0].exid==='current-2');
    assert.ok(await drag('[data-drop=T1] .bcard:nth-child(1)','[data-drop=T1] .bcard:nth-child(2)',true));
    assert.ok(await drag('[data-drop=T1] .bcard:nth-child(2)','[data-drop=T2] .bcard'));
    assert.ok(await drag('[data-drop=T2] .bcard:nth-child(1)','[data-drop=T3] .bcard',true));
    assert.ok(await drag('.libcard[data-id=current-3]','[data-drop=T2] .bcard'));
    await wait(async()=> (await state()).program.weeks[1].T3.at(-1).exid==='current-2');
    await navigate('#coach/constructor');
    assert.ok(await dom("$('[data-drop=T3]').innerText.includes('Болгарский')"));
  });
  await test('T07','Копирование 1 → 5, правка 5, копирование 5 → 10',async()=>{
    await fill('#copyTo','5');
    await click('[data-action=copy-week]');
    await wait(async()=> (await state()).program.weekCount===5);
    const weeks=(await state()).program.weeks;
    for (let i=2;i<=5;i++) assert.deepEqual(weeks[i],weeks[1]);
    priorWeeks=structuredClone([weeks[1],weeks[2],weeks[3],weeks[4]]);
    await fill('.traincol textarea[data-training-comment=T1]','Спокойная эксцентрика, неделя 5.');
    await fill('#copyTo','10');
    await click('[data-action=copy-week]');
    await wait(async()=> (await state()).program.weekCount===10);
    const after=(await state()).program.weeks;
    assert.deepEqual([after[1],after[2],after[3],after[4]],priorWeeks);
    for (let i=6;i<=10;i++) assert.deepEqual(after[i],after[5]);
    assert.match(after[5].comments.T1,/неделя 5/);
  });
  await test('T08','Индивидуальные подходы, диапазон и отдых',async()=>{
    await click('[data-action=week][data-week="1"]');
    await click('[data-drop=T1] [data-action=edit-ex]');
    await fill('#quickWeight','40');
    await fill('#quickReps','12');
    await fill('#quickCount','3');
    await fill('#quickRest','60');
    await click('[data-action=apply-quick]');
    await fill('[data-edit=w][data-index="0"]','42.5');
    await fill('[data-edit=r][data-index="1"]','11');
    await fill('[data-edit=rest][data-index="2"]','120');
    await fill('#repRange','12–15');
    await fill('#protocol','1a');
    await click('[data-action=save-edit]');
    await wait(async()=> (await state()).program.weeks[1].T1[0].protocol==='1a');
    const item=(await state()).program.weeks[1].T1[0];
    assert.deepEqual(item.sets,[{w:'42.5',r:'12',rest:60},{w:'40',r:'11',rest:60},{w:'40',r:'12',rest:'120'}]);
    assert.equal(item.range,'12–15');
    await shot('01-constructor');
  });
  await test('T09','Назначение передаёт блок и тренировки выбранному клиенту',async()=>{
    await fill('[data-program=name]','Проверочный блок Т23');
    await click('[data-action=assign]');
    await wait(async()=> (await state()).blocks.length===1);
    const database=await state();
    assignment=database.blocks[0];
    session=database.sessions.find(s=>s.blockId===assignment.id && s.training==='T1' && s.week===1);
    exercise=session.exercises[0];
    await click('#modeBtn');
    await go('program');
    assert.ok(await has('Проверочный блок Т23'));
    assert.equal(assignment.clientId,'alex');
  });
  await test('T10','Отдельное готовое демо-выполнение',async()=>{
    await click('[data-page=workout][data-id=demo-run]');
    assert.equal(await dom("all('.setrow input[data-actual]').length"),6);
    assert.equal(await dom("$('[data-actual=weight]').placeholder"),'45');
    assert.equal(await dom("$('[data-actual=weight]').value"),'');
    await click('[data-action=back]');
    await wait(()=>has('Проверочный блок Т23'));
  });
  await test('T11','Раздельные план и факт, отметка и дополнительный подход',async()=>{
    await click(`[data-page=workout][data-id="${session.id}"]`);
    await fill('[data-actual=weight][data-index="0"]','41.25');
    await click('[data-done="0"]');
    await click('[data-action=add-set]');
    await wait(async()=> (await state()).sessions.find(s=>s.id===session.id).exercises[0].sets.length===4);
    const sets=(await state()).sessions.find(s=>s.id===session.id).exercises[0].sets;
    assert.equal(sets[0].plan_weight,'42.5');
    assert.equal(sets[0].actual_weight,'41.25');
    assert.equal(sets[0].actual_reps,'12');
    assert.equal(sets[3].plan_weight,sets[2].plan_weight);
    assert.equal(sets[3].added_by_client,true);
  });
  await test('T12','Таймер у последнего подхода, пауза, +30 секунд, пропуск',async()=>{
    await click(`[data-done="${session.exercises.at(-1).sets.length-1}"][data-exercise="${session.exercises.at(-1).id}"]`);
    await click('[data-action=timer-pause]');
    const first=await dom("$('#timerDisplay').textContent");
    await sleep(1100);
    assert.equal(await dom("$('#timerDisplay').textContent"),first);
    await click('[data-action=timer-add]');
    const seconds=value=>{const [a,b]=value.split(':').map(Number);return a*60+b;};
    assert.equal(seconds(await dom("$('#timerDisplay').textContent")),seconds(first)+30);
    await click('[data-action=timer-skip]');
    assert.equal(await dom("$('#timerDisplay').textContent"),'00:00');
  });
  await test('T13','Загрузка локального WebM и отправка того же отчёта',async()=>{
    await fill('[data-work-comment]','Комментарий клиента Т13');
    await selectFile('[data-upload]',fileURLToPath(new URL('../public/demo.webm',import.meta.url)));
    await wait(async()=> (await state()).sessions.find(s=>s.id===session.id).exercises[0].media?.url,'uploaded video');
    uploadMedia=(await state()).sessions.find(s=>s.id===session.id).exercises[0].media;
    assert.match(uploadMedia.url,/^\/media\/.+\.webm$/);
    await wait(()=>dom("!$('[data-action=finish]').disabled"));
    await click('[data-action=finish]');
    await wait(async()=> (await state()).sessions.find(s=>s.id===session.id).status==='submitted');
  });
  await test('T14','Проверка из очереди и воспроизведение файла клиента',async()=>{
    await click('#modeBtn');
    await go('queue');
    await click(`[data-id="${session.id}"][data-page=review]`);
    assert.equal(await dom("$('#reviewPlayer').getAttribute('src')"),uploadMedia.url);
    assert.ok(await has('Комментарий клиента Т13'));
    await playable('#reviewPlayer');
    const res=await fetch(app+uploadMedia.url,{headers:{Range:'bytes=0-99'}});
    assert.equal(res.status,206);
    assert.equal((await res.arrayBuffer()).byteLength,100);
  });
  await test('T15','История демо, реальные старые видео и отсутствующие файлы',async()=>{
    await go('queue');
    await clickText('Открыть демо-проверку');
    await playable('#reviewPlayer');
    await click('#videoHistory summary');
    assert.equal(await dom("all('[data-action=history-item]').length"),5);
    await click('[data-action=history-item][data-index="2"]');
    assert.equal(await dom("$('#reviewPlayer').getAttribute('src')"),'/demo-history.webm');
    await playable('#reviewPlayer');
    await click('[data-action=history-item][data-index="1"]');
    assert.ok(await has('Видео не загружено'));
    await click('[data-action=history-item][data-index="0"]');
    await wait(()=>dom("$('#reviewPlayer')?.readyState>=2"));
    await shot('02-review');
  });
  await test('T16','Даты и факты за 3 недели, текущий план/факт',async()=>{
    const trends=await dom("all('.trend.entry').map(row=>row.innerText)");
    assert.equal(trends.length,3);
    assert.ok(trends[0].includes('Неделя 12')&&trends[0].includes('17 нояб.')&&trends[0].includes('45 кг × 12'));
    assert.ok(trends[1].includes('Неделя 11')&&trends[1].includes('45 кг × 11'));
    assert.ok(trends[2].includes('Неделя 10')&&trends[2].includes('42,5 кг × 12'));
    assert.ok(await has('План'));
    assert.ok(await has('Факт'));
  });
  await test('T17','Корректировка на упражнение с величиной в кг',async()=>{
    await navigate('#coach/review/'+session.id);
    assert.equal(await dom("all('#adjust').length"),1);
    assert.ok(await dom("$('#adjustAmount').hidden"));
    await fill('#adjust','Уменьшить');
    assert.ok(!await dom("$('#adjustAmount').hidden"));
    await fill('#adjustKg','2.5');
  });
  await test('T18','Комментарии по session_id и упражнению, видны клиенту',async()=>{
    await fill('#feedbackText','Проверка Т18: держи стабильный корпус.');
    await click('[data-action=save-review]');
    await wait(async()=> (await state()).sessions.find(s=>s.id===session.id).exercises[0].feedback?.text.startsWith('Проверка Т18'));
    const checked=(await state()).sessions.find(s=>s.id===session.id).exercises[0];
    assert.equal(checked.id,exercise.id);
    assert.equal(checked.feedback.adjust,'Уменьшить');
    assert.equal(checked.feedback.kg,'2.5');
    await click('#modeBtn');
    await go('feedback');
    assert.ok(await has(checked.feedback.text));
  });
  await test('T19','Десктопные колонки и закреплённое мобильное меню',async()=>{
    await navigate('#coach/constructor');
    const columns=await dom("all('.traincol').slice(0,3).map(card=>[card.offsetLeft,card.offsetTop])");
    assert.ok(columns[0][0]<columns[1][0] && columns[1][0]<columns[2][0]);
    assert.equal(new Set(columns.map(col=>col[1])).size,1);
    await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
    await navigate('#client/workout/demo-run');
    assert.equal(await dom("getComputedStyle($('.mobile')).position"),'fixed');
    assert.ok(await dom("$('.mobile').getBoundingClientRect().bottom===innerHeight"));
    assert.ok(await dom("document.documentElement.scrollWidth<=innerWidth"));
    await shot('03-mobile');
    await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  });
  await test('T20','Пауза, стоп-кадр, стрелка, сохранение и показ клиенту',async()=>{
    await navigate('#coach/annotation/'+session.id+'/'+exercise.id);
    await playable('#annotationVideo');
    await click('#captureFrame');
    await click('[data-mark=arrow]');
    await drawArrow();
    assert.ok(await dom("!$('#markUndo').disabled"));
    await click('#markSave');
    await wait(()=>dom("!!$('#frameList img')"));
    frameUrl=await dom("$('#frameList img').getAttribute('src')");
    await shot('04-annotation');
  });
  await test('T21','Отмена, повтор, очистка и цвет без изменения видео',async()=>{
    const colored = async (r,g,b) => dom(`(()=>{
      const c=$('#markCanvas'), x=Math.round(c.width*.475), y=Math.round(c.height*.425);
      const px=c.getContext('2d').getImageData(x-8,y-8,16,16).data;
      for(let i=0;i<px.length;i+=4) if (Math.abs(px[i]-${r})<9 && Math.abs(px[i+1]-${g})<9 && Math.abs(px[i+2]-${b})<9) return true;
      return false;
    })()`);
    assert.ok(await colored(255,97,109),'Red arrow visible');
    await click('#markUndo');
    assert.ok(!await colored(255,97,109),'Undo removed the arrow');
    await click('#markRedo');
    assert.ok(await colored(255,97,109),'Redo restored the arrow');
    await click('#markClear');
    assert.ok(!await colored(255,97,109),'Clear removed the arrow');
    await fill('#markColor','green','change');
    await drawArrow();
    assert.ok(await colored(77,228,163),'New arrow used green');
    assert.equal(await dom("$('#annotationVideo').getAttribute('src')"),uploadMedia.url);
    await clickText('К проверке');
    await click('[data-action=save-review]');
    await wait(async()=> (await state()).sessions.find(s=>s.id===session.id).exercises[0].feedback?.frames[0]?.url===frameUrl);
    await navigate('#client/feedback/'+session.id);
    assert.equal(await dom("$('.feedback-item img').getAttribute('src')"),frameUrl);
    assert.equal(await fetch(app+frameUrl).then(response=>response.status),200);
    await shot('05-client-feedback');
  });
  await test('T22','Раздельные базы, 1065 и 495, исходные заголовки и ID',async()=>{
    const data=await fetch(app+'/catalog.json').then(r=>r.json());
    assert.equal(data.current.length,1065);
    assert.equal(data.legacy.length,495);
    assert.equal(new Set([...data.current,...data.legacy].map(row=>row.id)).size,1560);
    assert.ok(data.current.every(row=>row.name===row.original['Название упражнения (оригинал)'] && row.source_id===row.original['ID источника']));
    assert.ok(data.legacy.every(row=>row.name===row.original['Название (оригинал)'] && row.source_id===row.original.ID));
    await navigate('#coach/constructor');
    await fill('#catalogSource','legacy','change');
    assert.equal(await dom("all('.libcard').length"),495);
  });
  await test('T23','Чистая БД → анкета → назначение → отправка → ответ',async()=>{
    assert.ok(session && assignment && uploadMedia && frameUrl);
    const database=await state();
    assert.equal(database.clients[0].profileSaved,true);
    const report=database.sessions.find(item=>item.id===session.id);
    assert.equal(report.blockId,assignment.id);
    assert.equal(report.exercises[0].sets[0].actual_weight,'41.25');
    assert.equal(report.exercises[0].media.url,uploadMedia.url);
    assert.equal(report.exercises[0].feedback.frames[0].url,frameUrl);
    await navigate('#coach/review/'+session.id+'/'+report.exercises[1].id);
    await fill('#feedbackText','Обратная связь по второму упражнению.');
    await click('[data-action=save-review]');
    await wait(async()=> (await state()).sessions.find(item=>item.id===session.id).status==='reviewed');
    await navigate('#client/feedback/'+session.id);
    assert.ok(await has('Обратная связь по второму упражнению'));
    assert.ok(await has('Проверка Т18'));
  });
  await test('EX01','Запись видеоразбора без микрофона, пауза и воспроизведение',async()=>{
    await navigate('#coach/annotation/demo-review');
    await playable('#annotationVideo');
    await click('.recording summary');
    await click('#recordStart');
    await wait(()=>dom("!$('#recordPause').disabled"));
    await run("document.querySelector('#annotationVideo').play()");
    await sleep(700);
    await click('#recordPause');
    await sleep(300);
    await click('#recordPause');
    await sleep(800);
    await click('#recordStop');
    await wait(()=>dom("!!$('#recordPreview video')"));
    await playable('#recordPreview video');
  });
  assert.deepEqual(b.errors,[],'Unhandled browser errors');
  console.log(`Summary: ${24-failures.length}/24 passed (23 acceptance checks + 1 recording check).`);
  if (failures.length) process.exitCode=1;
} finally { b.close(); }

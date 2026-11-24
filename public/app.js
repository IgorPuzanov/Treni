import {constructorPage, libraryCards} from './builder.js';
import {annotationPanel, mountAnnotation} from './annotation.js';

const view = document.querySelector('#view');
const modal = document.querySelector('#modal');
const $ = (selector, parent = document) => parent.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const deviceMode = document.querySelector('meta[name="treni-device-storage"]') !== null;
async function startDeviceStorage() {
  if (!deviceMode) return;
  if (!navigator.serviceWorker) throw new Error('Открой приложение в Safari или Chrome по защищённой ссылке HTTPS.');
  await navigator.serviceWorker.register('./service-worker.js');
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Хранилище телефона не запустилось. Обнови страницу.')),12000);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      clearTimeout(timeout);
      resolve();
    },{once:true});
  });
}
const read = async (url, options) => {
  const response = await fetch(url.replace(/^\//,'./'), options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Сервер недоступен');
  return data;
};
await startDeviceStorage().catch(error=>{
  view.textContent = error.message;
  throw error;
});
const [catalog, photos, initial] = await Promise.all(['/catalog.json','/photos.json','/api/state'].map(url => read(url))).catch(error => {
  view.textContent = 'Не удалось открыть Трени. Проверь запуск сервера и обнови страницу. ' + error.message;
  throw error;
});
const S = initial.state;
let revision = initial.revision;
let pending = Promise.resolve();
let dirty = false;
let saveError = '';
let saveSequence = 0;
let uploadInProgress = false;
let annotationBusy = false;

function toast(message) {
  const target = $('#toast');
  target.setAttribute('role','status');
  target.textContent = message;
  target.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => target.classList.remove('show'), 3000);
}
function persist() {
  const state = JSON.stringify(S);
  dirty = true;
  const sequence = ++saveSequence;
  pending = pending.catch(() => {}).then(async () => {
    const saved = await read('/api/state', {
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:`{"revision":${revision},"state":${state}}`,keepalive:state.length < 24000
    });
    revision = saved.revision;
    saveError = '';
    if (sequence === saveSequence) dirty = false;
  }).catch(error => {
    if (sequence === saveSequence) {
      saveError = error.message;
      toast('Сохранение не подтверждено. ' + saveError);
    }
    throw error;
  });
  pending.catch(() => {});
  return pending;
}
async function saved(message) {
  await persist();
  if (message) toast(message);
}
window.addEventListener('beforeunload', event => {
  if (dirty || uploadInProgress || annotationBusy) event.preventDefault();
});

const routes = {
  coach:['home','clients','constructor','queue','review','annotation'],
  client:['home','profile','program','workout','feedback']
};
function routeFromHash() {
  const [role,page,id,exercise] = location.hash.slice(1).split('/');
  if (routes[role]?.includes(page)) return {role,page,id,exercise};
  return {role:'coach',page:'home'};
}
let route = routeFromHash();
let navigationDepth = 0;
let weekNo = 1;
let train = 'T1';
let source = 'current';
let cat = 'Все';
let query = '';
let libraryCollapsed = false;
let profileDraft = null;
let clientFilter = 'active';
let edit = null;
let selectedVideo = null;
let rest = {remaining:0,until:0};
const reviewDrafts = new Map();
const annotationDrafts = new Map();
const day = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dateLabel = value => value ? new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium'}).format(new Date(value+'T12:00:00')) : 'Дата появится после отправки';
const today = () => day(new Date());
const C = () => S.clients.find(client => client.id === S.clientId) || S.clients[0];
const nameOf = id => S.clients.find(client => client.id === id)?.name || 'Клиент';
const W = week => S.program.weeks[week];
const trainings = week => Object.keys(week).filter(key => /^T\d+$/.test(key)).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
const emptyWeek = (count = 3) => ({...Object.fromEntries(Array.from({length:count},(_,i)=>['T'+(i+1),[]])),comments:{}});
const activeSession = () => S.sessions.find(session => session.id === route.id);
const activeExercise = (session = activeSession()) => session?.exercises.find(exercise => exercise.id === route.exercise) || session?.exercises[0];
const exerciseCatalog = () => [...catalog[source],...S.ownExercises];
const getExercise = id => [...catalog.current,...catalog.legacy,...S.ownExercises].find(item => item.id === id);
const categoryPhotos = new Map([['Ноги',0],['Ягодицы',0],['Спина',1],['Плечи',2],['Руки',4],['Пресс',5]]);
const photoIndices = new Map([...catalog.current,...catalog.legacy].map(item=>[item.id,categoryPhotos.get(item.category) ?? 3]));
const thumb = id => photos[photoIndices.get(id) ?? 0];
const context = () => ({S,C,W,weekNo,train,source,cat,query,libraryCollapsed,EX:exerciseCatalog(),trainings,head,esc,age,thumb});
const button = (text, action, options = {}) => `<button type="button" class="btn${options.primary?' primary':''}" data-action="${action}"${options.attrs?' '+options.attrs:''}>${text}</button>`;
const goButton = (text,page,id='',exercise='',primary=false,role='') => button(text,'go',{primary,attrs:`data-page="${page}" data-id="${esc(id)}" data-exercise="${esc(exercise)}" data-role="${role}"`});
const heading = (label,title,body) => `<section class="panel"><div class="ph"><${label}>${title}</${label}></div><div class="pb">${body}</div></section>`;
function head(title,sub='',actions='') {
  return `<div class="head"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="tools">${actions.includes('data-action="back"')?'':button('← Назад','back')}${actions}</div></div>`;
}
function go(page, {role=route.role,id='',exercise=''} = {}) {
  const hash = '#'+[role,page,id,exercise].filter(Boolean).join('/');
  if (hash !== location.hash) history.pushState({depth:++navigationDepth},'',hash);
  route = routeFromHash();
  selectedVideo = null;
  render();
  window.scrollTo(0,0);
}
window.addEventListener('popstate', () => {
  navigationDepth = history.state?.depth || 0;
  route = routeFromHash();
  selectedVideo = null;
  render();
});
navigationDepth = history.state?.depth || 0;

function navigation() {
  const items = route.role === 'coach'
    ? [['home','⌂','Главная'],['clients','♙','Клиенты'],['constructor','▦','Конструктор'],['queue','✓','Проверка']]
    : [['home','⌂','Главная'],['program','▦','Программа'],['feedback','✓','Обратная связь'],['profile','♙','Анкета']];
  for (const selector of ['.topnav','.rail','.mobile']) {
    $(selector).innerHTML = items.map(([page,icon,label])=>`<button class="nav ${route.page===page?'active':''}" data-action="go" data-page="${page}" aria-label="${label}"><span aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('');
  }
  $('#modeBtn').textContent = route.role === 'coach' ? 'Режим: Тренер ▾' : 'Режим: Клиент ▾';
  document.body.dataset.role = route.role;
}

function render() {
  navigation();
  if (!edit) modal.innerHTML = '';
  const pages = {
    home:route.role==='coach'?coachHome:clientHome, clients:profile, profile, constructor:()=>constructorPage(context()),
    program, workout, queue, review, feedback, annotation:annotationPage
  };
  view.innerHTML = pages[route.page]();
  if (route.page === 'annotation') mountAnnotations();
  tick();
}

const clientSession = session => session.clientId === C().id;
const sessionTitle = session => `Неделя ${session.week} · ${session.training}`;
const statusLabel = session => ({assigned:'Назначена',progress:'В процессе',submitted:'Ожидает проверки',reviewed:'Проверена'}[session.status]);
const activeBlocks = () => S.blocks.filter(block => block.clientId === C().id);
const demoRun = () => S.sessions.find(session => session.id === 'demo-run');
const sessionLink = (session,page,role=route.role) => goButton(page==='review'?'Открыть проверку':session.status==='assigned'||session.status==='progress'?'Выполнить':'Открыть тренировку',page,session.id,'',true,role);
function sessionCard(session,page) {
  return `<div class="row session-row"><div class="grow"><b>${sessionTitle(session)} · ${esc(session.blockName)}</b><small>${route.role==='coach'?esc(nameOf(session.clientId))+' · ':''}${statusLabel(session)} · ${session.exercises.length} упр.</small></div>${sessionLink(session,page)}</div>`;
}
function coachHome() {
  const waiting = S.sessions.filter(session => session.status==='submitted' && session.id!=='demo-review');
  return head('Кабинет тренера','Назначай тренировки и проверяй отчёты клиентов.',goButton('Открыть конструктор','constructor','','',true)) +
    `<div class="grid homegrid">${heading('h2','Ожидают проверки',waiting.map(session=>sessionCard(session,'review')).join('')||'<p class="sub">Новых отчётов пока нет.</p>')}
    ${heading('h2','Демонстрация',`<p class="sub">Неделя 13, Т2. Выполни тренировку самостоятельно или открой отдельный готовый отчёт с видео и историей.</p><div class="tools">${goButton('Выполнить демо-тренировку','workout','demo-run','',true,'client')}${goButton('Открыть демо-проверку','review','demo-review','',false,'coach')}</div>`)}
    ${heading('h2','Клиенты',S.clients.map(client=>`<div class="row"><div class="grow"><b>${esc(client.name)}</b><small>${esc(client.goal||'Цель не указана')}</small></div>${button('Карточка','open-profile',{attrs:`data-id="${esc(client.id)}"`})}</div>`).join(''))}</div>`;
}
function clientHome() {
  const hasFeedback = S.sessions.some(session=> (clientSession(session)||session.id==='demo-run') && session.status==='reviewed' && (!session.demo||session.id==='demo-run'));
  return head('Привет, '+esc(C().name.split(' ')[0]||'спортсмен')+'!','Твой тренировочный кабинет') +
    `<div class="grid homegrid">${heading('h2','Моя программа',`<p class="sub">${activeBlocks().length?esc(activeBlocks().at(-1).name):'Тренер пока не назначил программу.'}</p>${goButton('Открыть программу','program','','',true)}`)}
    ${heading('h2','Демо-тренировка',`<p class="sub">${sessionTitle(demoRun())} · ${statusLabel(demoRun())}</p>${sessionLink(demoRun(),'workout')}`)}
    ${heading('h2','Обратная связь',`<p class="sub">${hasFeedback?'Тренер сохранил обратную связь.':'Ответ появится после проверки тренером.'}</p>${goButton('Открыть обратную связь','feedback')}`)}
    ${heading('h2','Анкета',goButton(C().profileSaved?'Редактировать анкету':'Заполнить анкету','profile'))}</div>`;
}
function program() {
  return head('Моя программа',esc(C().name)) + activeBlocks().slice().reverse().map(block=>{
    const sessions = S.sessions.filter(session=>session.blockId===block.id);
    return `<div class="block-section">${heading('h2',esc(block.name),`<p class="preline sub">${esc(block.desc)}</p>${sessions.map(session=>sessionCard(session,'workout')).join('')}`)}</div>`;
  }).join('') + heading('h2','Демо-тренировка',sessionCard(demoRun(),'workout'));
}
function queue() {
  const reports = S.sessions.filter(session=>(!session.demo || session.id==='demo-run') && ['submitted','reviewed'].includes(session.status));
  return head('Проверка тренировок','Отчёты клиентов',goButton('Открыть демо-проверку','review','demo-review','',true)) +
    heading('h2','Отчёты',reports.sort((a,b)=>Number(a.status==='reviewed')-Number(b.status==='reviewed')).map(session=>sessionCard(session,'review')).join('')||'<p class="sub">Отправленные тренировки появятся здесь.</p>');
}

function parseBirth(value) {
  const match = /^(\d{2})\.(\d{2})\.([1-9]\d{3})$/.exec(value);
  if (!match) return '';
  const [,d,m,y] = match;
  const date = new Date(+y,+m-1,+d);
  return date.getFullYear()===+y && date.getMonth()===+m-1 && date.getDate()===+d ? day(date) : '';
}
function age(birth) {
  const parsed = parseBirth(birth);
  if (!parsed) return 'Не указано';
  const now = today();
  return (Number(now.slice(0,4))-Number(parsed.slice(0,4))-(now.slice(5)<parsed.slice(5)?1:0))+' лет';
}
const profileFields = {
  name:'Имя и фамилия',birth:'Дата рождения',sex:'Пол',height:'Рост, см',weight:'Исходный вес, кг',
  goal:'Цель',limits:'Здоровье и ограничения',experience:'Тренировочный опыт',activity:'Зал и другая активность',schedule:'График'
};
function profile() {
  const coach = route.role==='coach';
  const c = profileDraft?.id===C().id ? {...C(),...profileDraft} : C();
  const field = name => {
    const value = esc(c[name]);
    const id = 'profile-'+name;
    let control = `<input id="${id}" name="${name}" value="${value}" placeholder="Не указано">`;
    if (name==='birth') control = `<div class="tools"><input id="${id}" name="birth" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" value="${value}" style="flex:1"><input type="date" id="birthCalendar" max="${today()}" value="${parseBirth(c.birth)}" aria-label="Календарь" style="width:46px;padding:5px"></div>`;
    if (name==='sex') control = `<select name="sex" id="${id}">${['','Женский','Мужской'].map(option=>`<option value="${option}" ${c.sex===option?'selected':''}>${option||'Не указано'}</option>`).join('')}</select>`;
    if (['goal','limits','experience','activity','schedule'].includes(name)) control = `<textarea id="${id}" name="${name}" placeholder="Не указано">${value}</textarea>`;
    return `<div class="field"><label for="${id}">${profileFields[name]}</label>${control}</div>`;
  };
  const tabs = coach ? heading('h2','Клиенты',
    `<div class="tools">${button('Активные','client-filter',{attrs:'data-id="active"',primary:clientFilter==='active'})}${button('На паузе','client-filter',{attrs:'data-id="paused"',primary:clientFilter==='paused'})}</div>
    ${S.clients.filter(item=>item.status===clientFilter).sort((a,b)=>Number(S.sessions.some(s=>s.clientId===b.id&&!s.demo&&s.status==='submitted'))-Number(S.sessions.some(s=>s.clientId===a.id&&!s.demo&&s.status==='submitted'))).map(item=>`<div class="row"><div class="grow"><b>${esc(item.name)}</b>${S.notifications.some(n=>n.clientId===item.id&&n.kind==='profile')?'<small>Анкета заполнена</small>':''}</div>${button('Открыть','open-profile',{attrs:`data-id="${item.id}"`,primary:item.id===c.id})}</div>`).join('')||'<p class="sub">В этом списке пока пусто.</p>'}`) : '';
  return head(coach?'Карточка клиента':'Анкета',esc(c.name),button('Сохранить анкету','save-profile',{primary:true})) +
    `<div class="grid ${coach?'profile-grid':''}">${tabs}${heading('h2','Анкета',
      `<form id="profileForm" novalidate><div class="fieldrow">${field('name')}${field('birth')}</div><div class="fieldrow">${field('sex')}<div class="fieldrow">${field('height')}${field('weight')}</div></div>
      ${['goal','limits','experience','activity','schedule'].map(field).join('')}
      <p id="profileError" class="error" role="alert"></p><div class="tools profile-save">${button('Сохранить анкету','save-profile',{primary:true})}${coach?button(c.status==='paused'?'Возобновить':'Поставить на паузу','pause-client'):goButton('Заполнить позже','home')}</div></form>
      ${coach?`<hr><div class="field"><label for="coach-notes">Заметки тренера</label><textarea id="coach-notes" placeholder="Не указано">${esc(c.notes)}</textarea>${c.noteDate?`<small class="sub">${dateLabel(c.noteDate)}</small>`:''}</div><div class="tools">${button('Сохранить заметку','save-note')}${goButton('Программа','constructor')}${goButton('История отчётов','queue')}</div>`:''}`)}</div>`;
}
async function saveProfile() {
  const values = Object.fromEntries(Array.from(new FormData($('#profileForm')),([key,value])=>[key,value.trim()]));
  const date = parseBirth(values.birth);
  const message = values.birth && !date ? 'Введи существующую дату в формате ДД.ММ.ГГГГ.' :
    date>today() ? 'Дата рождения не может быть в будущем.' : '';
  if (message) {
    $('#profileError').textContent = message;
    $('#profile-birth').setAttribute('aria-invalid','true');
    $('#profile-birth').focus();
    return;
  }
  const c = C();
  Object.assign(c,values,{profileSaved:true});
  if (!S.notifications.some(item=>item.clientId===c.id && item.kind==='profile')) S.notifications.push({kind:'profile',clientId:c.id,date:today()});
  await saved('Анкета сохранена');
  profileDraft = null;
  render();
}

function refreshBuilder(keepScroll = true) {
  const selectors = ['.library-scroll','.trainingScroll','.cPanel .pb.scroll'];
  const offsets = selectors.map(selector=>[ $(selector)?.scrollLeft||0, $(selector)?.scrollTop||0 ]);
  render();
  if (keepScroll) selectors.forEach((selector,i)=>$(selector)?.scrollTo(...offsets[i]));
}
function selectWeek(number) {
  weekNo = number;
  if (!W(weekNo)[train]) train = 'T1';
  refreshBuilder();
}
function addWeek() {
  const last = W(S.program.weekCount);
  S.program.weeks[++S.program.weekCount] = emptyWeek(trainings(last).length);
  persist();
  selectWeek(S.program.weekCount);
}
function copyWeek() {
  const from = Number($('#copyFrom').value);
  const to = Number($('#copyTo').value);
  if (!W(from) || !Number.isInteger(to) || to<=from || to>52) return toast('Укажи конечную неделю после исходной, до 52 включительно.');
  for (let week=from+1;week<=to;week++) S.program.weeks[week]=structuredClone(W(from));
  S.program.weekCount = Math.max(to,S.program.weekCount);
  saved(`Неделя ${from} скопирована до недели ${to}`).catch(()=>{});
  selectWeek(to);
}
function addExercise(id,target=train,index=W(weekNo)[target].length) {
  const exercise = getExercise(id);
  if (!exercise) return;
  W(weekNo)[target].splice(index,0,{
    uid:crypto.randomUUID(),exid:id,name:exercise.name,cat:exercise.category,range:'10–12',protocol:'',
    sets:Array.from({length:3},()=>({w:'20',r:'10',rest:90}))
  });
  train=target;
  persist();
  refreshBuilder();
}
function newExercise() {
  modal.innerHTML = `<div class="modalback"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="new-title">
    <div class="ph"><h2 id="new-title">Новое упражнение</h2>${button('Закрыть','close-modal')}</div>
    <div class="field"><label for="customName">Название</label><input id="customName" maxlength="160"></div>
    <div class="field"><label for="customCategory">Категория</label><select id="customCategory">${['Ноги','Ягодицы','Спина','Грудь','Плечи','Руки','Корпус','Кардио','Разминка','Растяжка','Мобилити','Функциональные'].map(category=>`<option>${category}</option>`).join('')}</select></div>
    ${button('Создать упражнение','save-custom',{primary:true})}</div></div>`;
  $('#customName').focus();
}
function putCustom() {
  const name = $('#customName').value.trim();
  if (!name) return toast('Введи название упражнения.');
  const category = $('#customCategory').value;
  S.ownExercises.push({id:crypto.randomUUID(),name,category,custom:true});
  modal.innerHTML = '';
  if (route.page==='constructor') refreshBuilder();
  return saved('Новое упражнение добавлено в библиотеку');
}
function editExercise(uid,target) {
  train = target;
  const item = W(weekNo)[train].find(exercise=>exercise.uid===uid);
  if (!item) return;
  edit = structuredClone(item);
  renderEdit();
}
const numericField = (value, attrs) => `<input type="number" inputmode="decimal" value="${esc(value)}" ${attrs}>`;
function renderEdit() {
  modal.innerHTML = `<div class="modalback"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
    <div class="tools spaced"><h2 id="edit-title">${esc(edit.name)}</h2>${button('Закрыть','close-modal')}</div>
    <div class="fieldrow"><div class="field"><label for="repRange">Диапазон повторений</label><select id="repRange">${['5–8','8–10','10–12','12–15','Точное число'].map(range=>`<option ${range===(edit.range||'10–12')?'selected':''}>${range}</option>`).join('')}</select></div>
    <div class="field"><label for="protocol">Метка связки (например, 4a и 4b)</label><input id="protocol" value="${esc(edit.protocol)}" maxlength="20"></div></div>
    <div class="field"><label>Быстрый ввод</label><div class="quick-sets">
    ${numericField(edit.quick?.count??edit.sets.length,'id="quickCount" min="1" max="30" aria-label="Число подходов"')}
    ${numericField(edit.quick?.reps??edit.sets[0].r,'id="quickReps" min="1" aria-label="Повторения"')}
    ${numericField(edit.quick?.weight??edit.sets[0].w,'id="quickWeight" min="0" step="any" aria-label="Вес, кг"')}
    ${numericField(edit.quick?.rest??edit.sets[0].rest,'id="quickRest" min="0" list="rest-presets" aria-label="Отдых, сек"')}
    <datalist id="rest-presets"><option value="60"><option value="90"><option value="120"></datalist>${button('Применить','apply-quick')}</div></div>
    <div class="setedit edit-labels"><b>№</b><b>Вес, кг</b><b>Повторы</b><b>Отдых, с</b><span></span></div>
    <div id="editRows">${edit.sets.map((set,i)=>`<div class="setedit"><b>${i+1}</b>
      ${numericField(set.w,`data-edit="w" data-index="${i}" min="0" step="any" aria-label="Вес подхода ${i+1}"`)}
      ${numericField(set.r,`data-edit="r" data-index="${i}" min="1" aria-label="Повторения подхода ${i+1}"`)}
      ${numericField(set.rest,`data-edit="rest" data-index="${i}" min="0" list="rest-presets" aria-label="Отдых подхода ${i+1}"`)}
      ${button('×','del-edit',{attrs:`data-index="${i}" aria-label="Удалить подход ${i+1}"`})}</div>`).join('')}</div>
    <div class="tools spaced">${button('＋ Добавить подход','add-edit')}${button('Сохранить упражнение','save-edit',{primary:true})}</div></div></div>`;
}
function saveEdit() {
  if (edit.sets.some(set=>set.w==='' || set.r==='' || set.rest==='' || +set.w<0 || !Number.isInteger(+set.r) || +set.r<1 || !Number.isInteger(+set.rest) || +set.rest<0)) {
    return toast('Проверь вес, целое число повторений и время отдыха.');
  }
  delete edit.quick;
  const items = W(weekNo)[train];
  const index = items.findIndex(x=>x.uid===edit.uid);
  items[index] = edit;
  edit = null;
  refreshBuilder();
  return saved('Параметры упражнения сохранены');
}
function quickSets() {
  const fields = ['Count','Reps','Weight','Rest'].map(key=>$('#quick'+key));
  if (fields.some(field=> !field.value || !field.checkValidity())) return toast('Заполни четыре значения для быстрого ввода.');
  const [count,reps,weight,rest] = fields.map(field=>field.value);
  edit.quick = {count,reps,weight,rest};
  edit.sets = Array.from({length:Number(count)},()=>({r:reps,w:weight,rest:Number(rest)}));
  renderEdit();
}
async function assign() {
  const entries = Object.entries(S.program.weeks).flatMap(([week,weekPlan])=>
    trainings(weekPlan).filter(t=>weekPlan[t].length).map(t=>({week:Number(week),training:t,items:weekPlan[t],comment:weekPlan.comments[t]||''})));
  if (!entries.length) return toast('Добавь упражнение хотя бы в одну тренировку.');
  const client = C();
  const id = crypto.randomUUID();
  const block = {id,clientId:client.id,name:S.program.name.trim()||'Тренировочный блок',desc:S.program.desc,wish:S.program.wish};
  const assigned = entries.map(entry=>({
    id:crypto.randomUUID(),blockId:id,blockName:block.name,clientId:client.id,week:entry.week,training:entry.training,
    status:'assigned',comment:entry.comment,date:null,exercises:entry.items.map(item=>({
      id:item.uid,catalogId:item.exid,name:item.name,category:item.cat,protocol:item.protocol,range:item.range,
      comment:'',media:null,feedback:null,sets:item.sets.map(set=>({
        plan_weight:set.w,plan_reps:set.r,actual_weight:'',actual_reps:'',rest:Number(set.rest),done:false,added_by_client:false
      }))
    }))
  }));
  S.blocks.push(block);
  S.sessions.push(...assigned);
  await saved('Программа назначена · '+client.name);
}

function actualInput(set,key,exercise,i,locked) {
  const weight = key==='weight';
  return `<input type="number" data-actual="${key}" data-exercise="${exercise.id}" data-index="${i}"
    inputmode="${weight?'decimal':'numeric'}" step="${weight?'any':'1'}" min="0" aria-label="${weight?'Вес':'Повторения'}, подход ${i+1}"
    value="${esc(set['actual_'+key])}" placeholder="${esc(set['plan_'+key])}" ${locked?'disabled':''}>`;
}
function mediaTag(media, attrs='') {
  return media ? `<video controls playsinline preload="metadata" src="${esc(media.url)}" ${media.poster?`poster="${esc(media.poster)}"`:''} ${attrs}></video>` : '<div class="no-video">Видео не загружено</div>';
}
function workoutExercise(exercise,i,locked) {
  const attrs = `data-exercise="${exercise.id}"`;
  return `<section class="exercisebox workout-exercise">
    <h2>${i+1}. ${esc(exercise.name)}</h2>${exercise.protocol?`<p class="sub">Связка ${esc(exercise.protocol)}</p>`:''}
    <div class="setrow setlabels"><span>№</span><span>Вес, кг</span><span>Повторения</span><span>✓</span></div>
    ${exercise.sets.map((set,index)=>`<div class="setrow">
      <b>${index+1}${set.added_by_client?'<sup title="Дополнительный подход">+</sup>':''}</b>
      ${actualInput(set,'weight',exercise,index,locked)}${actualInput(set,'reps',exercise,index,locked)}
      <input aria-label="Отметить подход ${index+1}" type="checkbox" data-done="${index}" ${attrs} ${set.done?'checked':''} ${locked?'disabled':''}>
    </div>`).join('')}
    ${locked?'':`<div class="tools set-actions">${button('−','remove-set',{attrs:attrs+' aria-label="Убрать последний подход"'})}<span>Подход</span>${button('+','add-set',{attrs:attrs+' aria-label="Добавить подход"'})}</div>`}
    <div class="field"><label for="comment-${exercise.id}">Комментарий</label>
      <textarea id="comment-${exercise.id}" data-work-comment ${attrs} ${locked?'disabled':''}>${esc(exercise.comment)}</textarea></div>
    <div class="field"><label for="video-${exercise.id}">Видео выполнения</label>
    ${locked?'':`<input id="video-${exercise.id}" type="file" accept="video/*,.mp4,.webm,.mov,.ogv" data-upload ${attrs} ${uploadInProgress?'disabled':''}>`}</div>
    ${exercise.media?`<div class="video workout-video">${mediaTag(exercise.media)}</div><p class="smallnote">${esc(exercise.media.name)}</p>`:'<span class="smallnote">Видео не загружено</span>'}</section>`;
}
function workout() {
  const session = activeSession();
  if (!session || (!session.demo && !clientSession(session))) return program();
  const locked = ['submitted','reviewed'].includes(session.status);
  const actions = session.id==='demo-run'&&locked ? button('Начать демо заново','restart-demo') : '';
  const footer = locked ? `<p class="sub">${statusLabel(session)}</p><div class="tools">
    ${session.exercises.some(exercise=>exercise.feedback)?goButton('Смотреть обратную связь','feedback',session.id,'',true):''}
    ${goButton('Открыть отчёт тренером','review',session.id,'',false,'coach')}</div>` :
    button('Завершить тренировку','finish',{primary:true,attrs:uploadInProgress?'disabled':''});
  return head('Выполнение тренировки',sessionTitle(session)+' · '+esc(session.blockName),actions) + `<div class="grid workgrid">
    <section class="panel"><div class="ph"><h2>${sessionTitle(session)}</h2><span class="pill">${statusLabel(session)}</span></div>
    <div class="pb">${session.comment?`<p class="preline sub">${esc(session.comment)}</p>`:''}
    <p class="sub">Серым показаны назначенные значения. Отметь подход, чтобы записать результат.</p>
    ${session.id==='demo-run'&&!locked?'<p class="smallnote">Для пробы загрузки подойдёт <a href="./demo.webm" download="treni-test.webm">синтетическое видео WebM</a>.</p>':''}
    ${session.exercises.map((exercise,i)=>workoutExercise(exercise,i,locked)).join('')}${footer}</div></section>
    ${locked?'':`<aside class="panel rest-panel"><div class="ph"><h2>Таймер отдыха</h2></div><div class="pb"><div class="timer"><strong id="timerDisplay">00:00</strong></div><div class="tools timer-actions">
      ${button('Пауза','timer-pause')}${button('+30 с','timer-add')}${button('Пропустить','timer-skip')}</div></div></aside>`}</div>`;
}
function editSet(exercise,add) {
  const last = exercise.sets.at(-1);
  if (add) exercise.sets.push({...last,actual_weight:'',actual_reps:'',done:false,added_by_client:true});
  else {
    if (exercise.sets.length<2) return toast('Оставь хотя бы один подход.');
    if ((last.done || last.actual_weight!=='' || last.actual_reps!=='') && !confirm('Удалить последний подход и его результаты?')) return;
    exercise.sets.pop();
  }
  startSession(activeSession());
  persist();
  render();
}
function startSession(session) {
  if (session.status==='assigned') session.status='progress';
}
function tick() {
  const display = $('#timerDisplay');
  const seconds = rest.until ? Math.max(0,Math.ceil((rest.until-Date.now())/1000)) : rest.remaining;
  if (!seconds && rest.until) {
    rest = {until:0,remaining:0};
    if (route.page==='workout') toast('Время отдыха закончилось');
  }
  if (!display) return;
  display.textContent = [Math.floor(seconds/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  $('[data-action="timer-pause"]').textContent = rest.until ? 'Пауза' : 'Продолжить';
  $('[data-action="timer-pause"]').disabled = !seconds;
}
setInterval(tick,250);
function timerAction(action) {
  const remaining = rest.until ? Math.max(0,Math.ceil((rest.until-Date.now())/1000)) : rest.remaining;
  if (action==='timer-pause') rest = rest.until ? {until:0,remaining} : {until:Date.now()+remaining*1000,remaining};
  if (action==='timer-add') rest = rest.until ? {...rest,until:rest.until+30000} : {until:0,remaining:remaining+30};
  if (action==='timer-skip') rest = {until:0,remaining:0};
  tick();
}
async function finish() {
  const session = activeSession();
  if (uploadInProgress || !['assigned','progress'].includes(session?.status)) return;
  if (!session.exercises.some(exercise=>exercise.sets.some(set=>set.done))) return toast('Отметь хотя бы один выполненный подход.');
  session.status='submitted';
  session.date=today();
  session.submittedAt=new Date().toISOString();
  await saved('Тренировка отправлена тренеру');
  rest={until:0,remaining:0};
  render();
}

async function upload(blob, type=blob.type) {
  return read('/api/media',{method:'POST',headers:{'Content-Type':type},body:blob});
}
async function inspectVideo(file) {
  const element = document.createElement('video');
  const url = URL.createObjectURL(file);
  try {
    element.muted = true;
    element.preload = 'auto';
    await new Promise((resolve,reject)=>{
      const timeout = setTimeout(()=>reject(new Error('Файл слишком долго открывается. Попробуй MP4 или WebM.')),8000);
      element.onloadeddata = () => {clearTimeout(timeout);resolve();};
      element.onerror = () => {clearTimeout(timeout);reject(new Error('Браузер не воспроизводит этот файл. Попробуй MP4 или WebM.'));};
      element.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(element.videoWidth,320);
    canvas.height = Math.round(canvas.width*element.videoHeight/element.videoWidth);
    canvas.getContext('2d').drawImage(element,0,0,canvas.width,canvas.height);
    return {duration:Number.isFinite(element.duration)?element.duration:null,poster:await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))};
  } finally { URL.revokeObjectURL(url); }
}
async function attachVideo(file,session,exercise) {
  if (uploadInProgress) return;
  if (file.size>150*1024*1024) return toast('Размер видео должен быть не больше 150 МБ.');
  uploadInProgress=true;
  render();
  toast('Загружается видео…');
  try {
    const {duration,poster} = await inspectVideo(file);
    const type = file.type || ({mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',ogv:'video/ogg'}[file.name.split('.').at(-1).toLowerCase()]);
    const video = await upload(file,type);
    const thumbnail = poster ? await upload(poster).catch(()=>null) : null;
    exercise.media = {name:file.name,url:video.url,poster:thumbnail?.url||'',duration};
    startSession(session);
    await saved('Видео прикреплено');
  } finally {
    uploadInProgress=false;
    if (route.page==='workout') render();
  }
}

function historyFor(session,exercise) {
  return S.sessions.filter(past=>past.id!==session.id && past.clientId===session.clientId &&
    ['submitted','reviewed'].includes(past.status) && (session.demo
      ? past.demo && past.week<session.week
      : !past.demo && (past.submittedAt||past.date)<(session.submittedAt||session.date)))
    .flatMap(past=>past.exercises.filter(item=>item.catalogId===exercise.catalogId).map(item=>({session:past,exercise:item})))
    .sort((a,b)=>(b.session.submittedAt||b.session.date).localeCompare(a.session.submittedAt||a.session.date));
}
const reviewKey = (session,exercise) => session.id+'/'+exercise.id;
function draftFor(session,exercise) {
  const key = reviewKey(session,exercise);
  if (!reviewDrafts.has(key)) reviewDrafts.set(key,structuredClone(exercise.feedback||{text:'',adjust:'Оставить',kg:'',frames:[]}));
  return reviewDrafts.get(key);
}
function durationLabel(duration) {
  if (!Number.isFinite(duration)) return 'Длительность не указана';
  return Math.floor(duration/60)+':'+String(Math.round(duration%60)).padStart(2,'0');
}
const formatWeight = value => String(value).replace('.',',');
function setResult(weight,reps) {
  return `${weight===''?'—':esc(formatWeight(weight))+' кг'} × ${reps===''?'—':esc(reps)}`;
}
function previousWeeks(history,session) {
  const weeks = new Set();
  return history.filter(item=>{
    if (item.session.blockId===session.blockId && item.session.week>=session.week) return false;
    const week = item.session.blockId+'/'+item.session.week;
    if (weeks.has(week) || weeks.size>=3) return false;
    weeks.add(week);
    return true;
  });
}
function review() {
  const session = activeSession();
  if (!session || !['submitted','reviewed'].includes(session.status)) return queue();
  const exercise = activeExercise(session);
  const past = historyFor(session,exercise);
  const mediaList = [{session,exercise},...past];
  const chosen = mediaList[selectedVideo ?? 0];
  const chosenMedia = chosen?.exercise.media;
  const draft = draftFor(session,exercise);
  const historyCards = mediaList.map(({session:item,exercise:ex},index)=>`<button type="button" class="historyitem ${index===(selectedVideo??0)?'selected':''}"
    data-action="history-item" data-index="${index}" aria-pressed="${index===(selectedVideo??0)}">
    ${ex.media?.poster?`<img src="${esc(ex.media.poster)}" alt="">`:'<span class="missing-poster" aria-hidden="true">—</span>'}
    <strong>${index===0?'Текущее видео':'Неделя '+item.week}</strong><small>${dateLabel(item.date)} · ${ex.media?durationLabel(ex.media.duration):'Файл отсутствует'}</small></button>`).join('');
  const links = session.exercises.map((item,i)=>`<button type="button" class="btn ${item.id===exercise.id?'active':''}" data-action="go" data-page="review" data-id="${session.id}" data-exercise="${item.id}">
    ${esc(item.protocol||String(i+1))} · ${esc(item.name)}</button>`).join('');
  const nearby = S.sessions.filter(item=>item.id!==session.id && item.blockId===session.blockId && item.week===session.week && !item.demo && ['submitted','reviewed'].includes(item.status));
  const mediaPanel = `<section><div class="panel">
      <div class="ph"><div><h2>${esc(exercise.name)}</h2><div class="sub">${chosen?.session.id===session.id?'Текущее видео':'История · неделя '+chosen?.session.week}</div></div></div>
      <div class="pb"><div class="video review-video">${mediaTag(chosenMedia,'id="reviewPlayer"')}</div>
      ${chosenMedia?`<p class="smallnote">${esc(chosenMedia.name)}</p>`:''}
      <details class="panel history" id="videoHistory" ${selectedVideo!==null?'open':''}><summary class="historyhead">История видео</summary>
      <div class="historyitems">${historyCards}</div></details>
      ${chosenMedia?`<div class="tools video-tools">${button('Разбор техники','open-annotation',{primary:true,attrs:`data-url="${esc(chosenMedia.url)}"`})}</div>`:''}</div></div>
      <div class="review-block">${heading('h3','Комментарий клиента',`<p class="preline">${esc(exercise.comment||'Комментарий не добавлен.')}</p>`)}</div></section>`;
  const comments = [
    ...(exercise.feedback?[{session,exercise}]:[]),...past
  ].filter(item=>item.exercise.feedback?.text).map(({session:item,exercise:ex})=>`<div class="comment"><div class="commentmeta"><span>Неделя ${item.week}</span><span>${dateLabel(ex.feedback.date||item.date)}</span></div><p class="preline">${esc(ex.feedback.text)}</p></div>`).join('');
  const commentPanel = heading('h3','Комментарии к упражнению',`${comments||'<p class="sub">Предыдущих комментариев пока нет.</p>'}
    <div class="field"><label for="feedbackText">Обратная связь клиенту</label><textarea id="feedbackText" data-review="text" placeholder="Что улучшить к следующей тренировке">${esc(draft.text)}</textarea></div>
    ${draft.frames?.length?`<p class="sub">Аннотированные кадры · ${draft.frames.length}</p>`:''}${draft.recording?'<p class="sub">Видеозапись разбора прикреплена</p>':''}`);
  const trend = previousWeeks(past,session).map(({session:item,exercise:ex})=>`<div class="trend entry">
    <b>Неделя ${item.week}</b><small class="sub">${dateLabel(item.date)}</small>
    <div>${ex.sets.map((set,index)=>`<span class="trend-set">${index+1}. ${setResult(set.actual_weight,set.actual_reps)}</span>`).join('')}</div></div>`).join('');
  const adjust = `<div class="field"><label for="adjust">Нагрузка на следующую тренировку</label>
    <select id="adjust" data-review="adjust">${['Увеличить','Оставить','Уменьшить'].map(value=>`<option ${value===draft.adjust?'selected':''}>${value}</option>`).join('')}</select></div>
    <div class="field" id="adjustAmount" ${draft.adjust==='Оставить'?'hidden':''}><label for="adjustKg">Изменение, кг</label>
    ${numericField(draft.kg,'id="adjustKg" data-review="kg" min="0.01" step="any"')}</div>`;
  const sets = `<div class="tablewrap"><table><thead><tr><th>№</th><th>План</th><th>Факт</th></tr></thead><tbody>${exercise.sets.map((set,i)=>`<tr>
    <td>${i+1}${set.added_by_client?'<sup title="Добавлен клиентом">+</sup>':''}</td>
    <td><span class="result">${setResult(set.plan_weight,set.plan_reps)}</span></td><td><span class="result">${setResult(set.actual_weight,set.actual_reps)}</span> ${set.done?'✓':''}</td></tr>`).join('')}</tbody></table></div>`;
  return head('Проверка тренировки',sessionTitle(session)+' · '+esc(nameOf(session.clientId))+' · '+dateLabel(session.date),
    button('Сохранить проверку','save-review',{primary:true})) + `<div class="review">
    <section class="panel"><div class="ph"><h3>Тренировочный план</h3></div><div class="reviewlist"><span class="smallnote">${esc(session.blockName)}</span>
    <span class="pill green">${sessionTitle(session)}</span>${nearby.map(item=>goButton(sessionTitle(item),'review',item.id)).join('')}${links}<span class="pill">${statusLabel(session)}</span>
    ${button('＋ Своё упражнение','new-exercise')}</div></section>
    ${mediaPanel}${commentPanel}<section class="reviewRight">${heading('h3','Тренд · 3 предыдущие недели',trend||'<p class="sub">За предыдущие недели данных пока нет.</p>')}
    <div class="review-block">${heading('h3','Корректировка нагрузки',adjust)}</div><div class="review-block">${heading('h3','Подходы · план / факт',sets)}</div></section></div>`;
}
async function saveReview() {
  const session = activeSession();
  const exercise = activeExercise(session);
  const draft = draftFor(session,exercise);
  if (draft.adjust!=='Оставить' && (!Number.isFinite(Number(draft.kg)) || Number(draft.kg)<=0)) {
    $('#adjustKg').focus();
    return toast('Укажи, на сколько килограммов изменить нагрузку.');
  }
  exercise.feedback = {...structuredClone(draft),kg:draft.adjust==='Оставить'?'':draft.kg,date:today()};
  session.status = session.exercises.every(item=>item.feedback) ? 'reviewed' : 'submitted';
  if (!S.notifications.some(item=>item.sessionId===session.id && item.kind==='review')) S.notifications.push({kind:'review',sessionId:session.id,clientId:session.clientId,date:today()});
  await saved('Проверка сохранена · клиент увидит ответ');
  render();
}
function feedback() {
  const reports = S.sessions.filter(session=>(clientSession(session)||session.id==='demo-run') &&
    (!session.demo||['demo-run','demo-review'].includes(session.id)) && session.exercises.some(exercise=>exercise.feedback));
  const shown = route.id ? reports.filter(session=>session.id===route.id) : reports.slice().reverse();
  return head('Обратная связь тренера','Комментарии, кадры разбора и рекомендации по нагрузке') +
    (shown.map(session=>`<div class="block-section">${heading('h2',sessionTitle(session)+' · '+esc(session.blockName),session.exercises.filter(exercise=>exercise.feedback).map(exercise=>{
      const f = exercise.feedback;
      return `<section class="exercisebox feedback-item"><h3>${esc(exercise.name)}</h3><p class="sub">${dateLabel(f.date)}</p>
      ${f.text?`<p class="preline">${esc(f.text)}</p>`:''}
      <p><b>Нагрузка</b> · ${esc(f.adjust)}${f.kg?' на '+esc(formatWeight(f.kg))+' кг':''}</p>
      ${(f.frames||[]).map(frame=>`<figure><img src="${esc(frame.url)}" alt="Аннотированный кадр"><figcaption>Отметки тренера · ${durationLabel(frame.time)}</figcaption></figure>`).join('')}
      ${f.recording?`<div class="video">${mediaTag(f.recording)}</div>`:''}</section>`;
    }).join('')+goButton('Открыть тренировку','workout',session.id))}</div>`).join('')||heading('h2','Ответа пока нет','<p class="sub">Здесь появятся сохранённые комментарии тренера.</p>'));
}
function annotationPage() {
  const session = activeSession();
  const exercise = activeExercise(session);
  if (!session || !exercise || !['submitted','reviewed'].includes(session.status)) return queue();
  const pastMedia = historyFor(session,exercise).filter(item=>item.exercise.media).map(item=>({
    label:`Неделя ${item.session.week} · ${dateLabel(item.session.date)}`,media:item.exercise.media
  }));
  const available = [...(exercise.media?[{label:'Текущий отчёт',media:exercise.media}]:[]),...pastMedia];
  const selected = annotationDrafts.get(reviewKey(session,exercise))?.selected;
  const preferred = available.find(item=>item.media.url===selected);
  if (preferred) {
    available.splice(available.indexOf(preferred),1);
    available.unshift(preferred);
  }
  return head('Разбор техники',esc(exercise.name)+' · '+sessionTitle(session),goButton('К проверке','review',session.id,exercise.id))+
    (available.length?annotationPanel(available.map(item=>({...item,label:esc(item.label)})),draftFor(session,exercise),esc) :
      heading('h2','Видео отсутствует','<p class="sub">Выбери упражнение, у которого есть текущее видео или видео в истории.</p>'));
}
function mountAnnotations() {
  const panel = $('#annotationPanel');
  if (!panel) return;
  const session = activeSession();
  const exercise = activeExercise(session);
  const draft = draftFor(session,exercise);
  const key = reviewKey(session,exercise);
  let editor = annotationDrafts.get(key);
  if (!editor) {
    editor = {};
    annotationDrafts.set(key,editor);
  }
  mountAnnotation(panel,editor,{
    notify:toast,
    async frame(blob,time) {
      annotationBusy = true;
      try {
        const file = await upload(blob);
        draft.frames.push({url:file.url,time});
        toast('Кадр прикреплён к черновику проверки');
        return file.url;
      } finally { annotationBusy = false; }
    },
    removeFrame(url) { draft.frames = draft.frames.filter(frame=>frame.url!==url); },
    async recording(blob) {
      annotationBusy = true;
      try {
        const file = await upload(blob,'video/webm');
        draft.recording = {url:file.url,name:'Запись разбора'};
        toast('Запись прикреплена к черновику проверки');
        return file.url;
      } finally { annotationBusy = false; }
    }
  });
}

const actions = {
  go(button) {
    const {page,id,exercise,role} = button.dataset;
    go(page,{id,exercise,role:role||route.role});
  },
  back() { if (navigationDepth) history.back(); else go('home'); },
  mode() { go('home',{role:route.role==='coach'?'client':'coach'}); },
  'open-profile'(button) { S.clientId=button.dataset.id; persist(); go('clients'); },
  'client-filter'(button) { clientFilter=button.dataset.id; render(); },
  'save-profile': saveProfile,
  async 'pause-client'() {
    C().status = C().status==='active'?'paused':'active';
    clientFilter = C().status;
    await saved();
    render();
  },
  async 'save-note'() {
    C().notes=$('#coach-notes').value.trim();
    C().noteDate=today();
    await saved('Заметка сохранена');
    render();
  },
  assign,
  'save-program'() { return saved('Программа сохранена'); },
  'add-week'() { if (S.program.weekCount<52) addWeek(); else toast('Достигнут предел в 52 недели.'); },
  'add-training'() {
    const week = W(weekNo);
    train = 'T'+(trainings(week).length+1);
    week[train]=[];
    persist();
    refreshBuilder();
    $(`[data-drop="${train}"]`).scrollIntoView({block:'nearest',inline:'nearest'});
  },
  'copy-week':copyWeek,
  week(button) { selectWeek(Number(button.dataset.week)); },
  cat(button) { cat=button.dataset.cat; refreshBuilder(); $('.library-scroll').scrollTop=0; },
  'toggle-library'() { libraryCollapsed=!libraryCollapsed; refreshBuilder(); },
  'select-train'(button) { train=button.dataset.train; refreshBuilder(); },
  'add-ex'(button) { addExercise(button.dataset.id); },
  'edit-ex'(button) { editExercise(button.dataset.uid,button.dataset.train); },
  'remove-ex'(button) {
    const items = W(weekNo)[button.dataset.train];
    const index = items.findIndex(item=>item.uid===button.dataset.uid);
    if (index>=0) items.splice(index,1);
    persist();
    refreshBuilder();
  },
  'close-modal'() { edit=null; modal.innerHTML=''; },
  'save-edit':saveEdit,
  'apply-quick':quickSets,
  'add-edit'() {
    edit.sets.push({...edit.sets.at(-1)});
    renderEdit();
  },
  'del-edit'(button) {
    if (edit.sets.length===1) return toast('Оставь хотя бы один подход.');
    edit.sets.splice(Number(button.dataset.index),1);
    renderEdit();
  },
  'new-exercise':newExercise,
  'save-custom':putCustom,
  'add-set'(button) { editSet(activeSession().exercises.find(ex=>ex.id===button.dataset.exercise),true); },
  'remove-set'(button) { editSet(activeSession().exercises.find(ex=>ex.id===button.dataset.exercise),false); },
  'timer-pause'() { timerAction('timer-pause'); },
  'timer-add'() { timerAction('timer-add'); },
  'timer-skip'() { timerAction('timer-skip'); },
  finish,
  async 'restart-demo'() {
    if (!confirm('Начать демонстрацию заново? Результаты и ответ текущего демо будут сброшены.')) return;
    const previous = demoRun();
    previous.status='progress';
    previous.exercises.forEach(exercise=>{
      reviewDrafts.delete(reviewKey(previous,exercise));
      annotationDrafts.delete(reviewKey(previous,exercise));
      Object.assign(exercise,{comment:'',media:null,feedback:null,sets:Array.from({length:3},()=>({
        plan_weight:'45',plan_reps:'12',actual_weight:'',actual_reps:'',done:false,rest:90,added_by_client:false
      }))});
    });
    await saved('Демо готово к выполнению');
    render();
  },
  'history-item'(button) {
    selectedVideo=Number(button.dataset.index);
    render();
  },
  'open-annotation'(button) {
    const session=activeSession();
    const exercise=activeExercise(session);
    const key=reviewKey(session,exercise);
    const editor=annotationDrafts.get(key)||{};
    editor.selected=button.dataset.url;
    annotationDrafts.set(key,editor);
    go('annotation',{id:session.id,exercise:exercise.id});
  },
  'save-review': saveReview
};
document.addEventListener('click',async event=>{
  const target = event.target.closest('[data-action]');
  const action = actions[target?.dataset.action];
  if (!action) return;
  try { await action(target); } catch(error) { toast(error.message); }
});
document.addEventListener('submit',event=>{
  if (event.target.id!=='profileForm') return;
  event.preventDefault();
  saveProfile().catch(error=>toast(error.message));
});
document.addEventListener('input',event=>{
  const target = event.target;
  if (target.id==='libSearch') {
    query=target.value;
    $('#libList').innerHTML=libraryCards(context());
    $('.library-scroll').scrollTop=0;
  }
  if (target.dataset.program) {
    S.program[target.dataset.program]=target.value;
    persist();
  }
  if (target.dataset.trainingComment) {
    W(weekNo).comments[target.dataset.trainingComment]=target.value;
    document.querySelectorAll(`[data-training-comment="${target.dataset.trainingComment}"]`).forEach(el=>{
      if (el!==target) el.value=target.value;
    });
    persist();
  }
  if (target.closest('#profileForm') && target.name) {
    if (profileDraft?.id!==C().id) profileDraft={id:C().id};
    profileDraft[target.name]=target.value;
    if (target.name==='birth') {
      $('#profileError').textContent='';
      target.removeAttribute('aria-invalid');
    }
  }
  if (target.dataset.edit) edit.sets[Number(target.dataset.index)][target.dataset.edit]=target.value;
  if (target.id==='protocol') edit.protocol=target.value.trim();
  if (target.id==='repRange') edit.range=target.value;
  if (target.dataset.review) {
    const draft = draftFor(activeSession(),activeExercise());
    draft[target.dataset.review]=target.value;
    if (target.dataset.review==='adjust') $('#adjustAmount').hidden=target.value==='Оставить';
  }
  if (target.dataset.actual || target.matches('[data-work-comment]')) {
    const session = activeSession();
    const exercise = session.exercises.find(item=>item.id===target.dataset.exercise);
    if (target.dataset.actual) {
      if (target.value && !target.checkValidity()) return;
      exercise.sets[Number(target.dataset.index)]['actual_'+target.dataset.actual]=target.value;
    } else exercise.comment=target.value;
    startSession(session);
    persist();
  }
});
document.addEventListener('change',event=>{
  const target = event.target;
  if (target.id==='clientSelect') { S.clientId=target.value; persist(); refreshBuilder(); }
  if (target.id==='catalogSource') { source=target.value;cat='Все';refreshBuilder(); }
  if (target.id==='birthCalendar' && target.value) {
    const [y,m,d]=target.value.split('-');
    const input=$('#profile-birth');
    input.value=`${d}.${m}.${y}`;
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  if (target.matches('[data-done]')) {
    const session = activeSession();
    const exercise = session.exercises.find(item=>item.id===target.dataset.exercise);
    const set = exercise.sets[Number(target.dataset.done)];
    const inputs = [...target.closest('.setrow').querySelectorAll('[data-actual]')];
    if (target.checked && inputs.some(input=>!input.checkValidity())) {
      target.checked=false;
      return toast('Проверь значения веса и повторений.');
    }
    set.done=target.checked;
    if (set.done) {
      for (const input of inputs) {
        const key = input.dataset.actual;
        set['actual_'+key] = input.value || set['plan_'+key];
        input.value = set['actual_'+key];
      }
      rest = set.rest ? {until:Date.now()+set.rest*1000,remaining:set.rest} : {until:0,remaining:0};
      tick();
    }
    startSession(session);
    persist();
  }
  if (target.matches('[data-upload]') && target.files[0]) {
    const session = activeSession();
    attachVideo(target.files[0],session,session.exercises.find(exercise=>exercise.id===target.dataset.exercise)).catch(error=>toast(error.message));
  }
});
document.addEventListener('keydown', event=>{
  if (event.key==='Escape' && modal.firstChild) actions['close-modal']();
});

let dragged = null;
const clearInsertion = () => document.querySelectorAll('.insert-before,.insert-after,.insert-empty').forEach(el=>el.classList.remove('insert-before','insert-after','insert-empty'));
document.addEventListener('dragstart',event=>{
  const card = event.target.closest('[data-drag]');
  if (!card) return;
  const {drag,id,train,uid} = card.dataset;
  dragged = {drag,id,train,uid};
  event.dataTransfer.setData('text/plain',id||uid);
  event.dataTransfer.effectAllowed = drag==='lib'?'copy':'move';
});
function insertion(event,zone) {
  const cards = [...zone.querySelectorAll('.bcard')];
  const firstBelow = cards.findIndex(card=>{
    const rect = card.getBoundingClientRect();
    return event.clientY<rect.top+rect.height/2;
  });
  return {cards,index:firstBelow<0?cards.length:firstBelow};
}
document.addEventListener('dragover',event=>{
  const zone = event.target.closest('[data-drop]');
  clearInsertion();
  if (!dragged || !zone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect=dragged.drag==='lib'?'copy':'move';
  const {cards,index}=insertion(event,zone);
  if (!cards.length) zone.classList.add('insert-empty');
  else if (index===cards.length) cards.at(-1).classList.add('insert-after');
  else cards[index].classList.add('insert-before');
});
document.addEventListener('dragend',()=>{dragged=null;clearInsertion();});
document.addEventListener('drop',event=>{
  const zone = event.target.closest('[data-drop]');
  if (!zone || !dragged) return;
  event.preventDefault();
  clearInsertion();
  const target = zone.dataset.drop;
  const {index} = insertion(event,zone);
  const item = dragged;
  dragged=null;
  if (item.drag==='lib') return addExercise(item.id,target,index);
  const from = W(weekNo)[item.train];
  const position = from.findIndex(exercise=>exercise.uid===item.uid);
  if (position<0) return;
  const [exercise] = from.splice(position,1);
  W(weekNo)[target].splice(item.train===target&&position<index?index-1:index,0,exercise);
  train=target;
  persist();
  refreshBuilder();
});

render();

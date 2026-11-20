const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const button = document.querySelector('#listen');
const label = document.querySelector('#listenLabel');
const status = document.querySelector('#status');
const reply = document.querySelector('#reply');
const heard = document.querySelector('#heard');
const core = document.querySelector('#coreDot');
const commandForm = document.querySelector('#commandForm');
const commandInput = document.querySelector('#commandInput');
const source = document.querySelector('#source');
const conversation = document.querySelector('#conversation');
let recognition;
let speaking = false;
let lastSearchTopic = '';
let researchRun = 0;
let awaitingWeatherCity = false;
let lastAssistantText = '';
let lastDateOffset = null;
let timerInterval = null;
let timerRemaining = 300;
let timerEndAt = null;
let timerPaused = false;
let stopwatchInterval = null;
let stopwatchElapsed = 0;
let stopwatchStartedAt = 0;
let stopwatchLaps = [];
let automationRoutines = [];
let editingAutomationId = null;
let alarmAudioContext=null;
const scheduledEventsFired=new Set();

function addMessage(role, text) {
  const item = document.createElement('article');
  item.className = `chat-message ${role}`;
  const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'EU' : 'J';
  const content = document.createElement('div'); content.className = 'message-content';
  const name = document.createElement('b'); name.textContent = role === 'user' ? 'VOCÊ' : 'J.A.R.V.I.S.';
  const body = document.createElement('p'); body.textContent = text;
  const time = document.createElement('small'); time.textContent = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  content.append(name, body, time); item.append(avatar, content); conversation.append(item);
  while (conversation.querySelectorAll('.chat-message').length > 36) conversation.querySelector('.chat-message').remove();
  conversation.scrollTop = conversation.scrollHeight;
}
function renderTimer() {
  const total = Math.max(0,timerRemaining);
  const hours = Math.floor(total/3600), minutes = Math.floor((total%3600)/60), seconds = total%60;
  document.querySelector('#timerDisplay').textContent = hours ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}` : `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  document.querySelector('#timerPanel').classList.toggle('timer-active', Boolean(timerInterval));
  document.querySelector('#timerState').textContent = timerInterval ? 'EM ANDAMENTO' : timerPaused ? 'PAUSADO' : timerRemaining === 0 ? 'FINALIZADO' : 'PRONTO';
}
function startTimer(seconds) {
  clearInterval(timerInterval); timerRemaining=Math.max(1,Math.min(seconds,86400)); timerEndAt=Date.now()+timerRemaining*1000; timerPaused=false;
  renderTimer();
  timerInterval=setInterval(()=>{
    timerRemaining=Math.max(0,Math.ceil((timerEndAt-Date.now())/1000)); renderTimer();
    if (timerRemaining===0) { clearInterval(timerInterval); timerInterval=null; timerEndAt=null; timerPaused=false; renderTimer(); status.textContent='TEMPORIZADOR FINALIZADO'; say('Seu temporizador terminou.'); }
  },250);
  renderTimer();
}
function pauseTimer() {
  if (!timerInterval) return false;
  timerRemaining=Math.max(0,Math.ceil((timerEndAt-Date.now())/1000)); clearInterval(timerInterval); timerInterval=null; timerEndAt=null; timerPaused=true; renderTimer(); return true;
}
function resumeTimer() {
  if (!timerPaused || timerRemaining<=0) return false;
  startTimer(timerRemaining); return true;
}
function resetTimer() {
  clearInterval(timerInterval); timerInterval=null; timerEndAt=null; timerPaused=false; timerRemaining=300; renderTimer();
}
function stopwatchCurrent() { return stopwatchElapsed+(stopwatchInterval?performance.now()-stopwatchStartedAt:0); }
function formatStopwatch(milliseconds) {
  const centiseconds=Math.floor(milliseconds/10)%100, totalSeconds=Math.floor(milliseconds/1000);
  const hours=Math.floor(totalSeconds/3600), minutes=Math.floor((totalSeconds%3600)/60), seconds=totalSeconds%60;
  const main=hours?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  return `${main}.${String(centiseconds).padStart(2,'0')}`;
}
function renderStopwatch() {
  document.querySelector('#stopwatchDisplay').textContent=formatStopwatch(stopwatchCurrent());
  document.querySelector('#stopwatchPanel').classList.toggle('stopwatch-active',Boolean(stopwatchInterval));
  document.querySelector('#stopwatchState').textContent=stopwatchInterval?'EM ANDAMENTO':stopwatchElapsed?'PAUSADO':'PRONTO';
  document.querySelector('#stopwatchStart').textContent=stopwatchInterval?'PAUSAR':stopwatchElapsed?'RETOMAR':'INICIAR';
  const list=document.querySelector('#stopwatchLaps');list.replaceChildren();
  stopwatchLaps.slice().reverse().forEach((lap,index)=>{const row=document.createElement('li');const name=document.createElement('span');name.textContent=`Volta ${stopwatchLaps.length-index}`;const time=document.createElement('b');time.textContent=`+${formatStopwatch(lap.delta)}  ·  ${formatStopwatch(lap.total)}`;row.append(name,time);list.append(row);});
}
function startStopwatch() {
  if(stopwatchInterval)return;
  stopwatchStartedAt=performance.now();stopwatchInterval=setInterval(renderStopwatch,30);renderStopwatch();
}
function pauseStopwatch() {
  if(!stopwatchInterval)return false;
  stopwatchElapsed+=performance.now()-stopwatchStartedAt;clearInterval(stopwatchInterval);stopwatchInterval=null;renderStopwatch();return true;
}
function resetStopwatch() {
  clearInterval(stopwatchInterval);stopwatchInterval=null;stopwatchElapsed=0;stopwatchStartedAt=0;stopwatchLaps=[];renderStopwatch();
}
function recordStopwatchLap() {
  const total=stopwatchCurrent();if(total<10)return null;
  const previous=stopwatchLaps.at(-1)?.total||0;
  stopwatchLaps.push({total,delta:total-previous});if(stopwatchLaps.length>20)stopwatchLaps.shift();renderStopwatch();return formatStopwatch(total);
}

function say(text) {
  reply.textContent = text;
  lastAssistantText = text;
  addMessage('assistant', text);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR'; utterance.rate = 1; speaking = true;
  utterance.onend = () => { speaking = false; };
  speechSynthesis.speak(utterance);
}
function setListening(on) {
  button.classList.toggle('listening', on); core.classList.toggle('active', on);
  label.textContent = on ? 'PARAR DE OUVIR' : 'COMEÇAR A OUVIR';
  status.textContent = on ? 'OUVINDO' : 'PRONTO';
}
function clean(text) { return text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/:/g,' ').replace(/[.!?;]/g,'').replace(/\s+/g,' ').trim(); }
function answerDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const formatted = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date);
  lastDateOffset = offset;
  if (offset === 0) return say(`Hoje é ${formatted}.`);
  if (offset === 1) return say(`Amanhã será ${formatted}.`);
  if (offset === -1) return say(`Ontem foi ${formatted}.`);
  if (offset === 2) return say(`Depois de amanhã será ${formatted}.`);
  return say(`Daqui a ${offset} dias será ${formatted}.`);
}
const sites = { youtube:'https://www.youtube.com', google:'https://www.google.com', 'youtube music':'https://music.youtube.com', spotify:'https://open.spotify.com', netflix:'https://www.netflix.com', gmail:'https://mail.google.com', instagram:'https://www.instagram.com', whatsapp:'https://web.whatsapp.com', github:'https://github.com', twitch:'https://www.twitch.tv' };
const automationStorageKey='jarvis-routines-v1';
const automationTypes={open:'Abrir site',search:'Pesquisar na web',map:'Abrir mapa',speak:'Falar mensagem',timer:'Iniciar temporizador',pauseTimer:'Pausar temporizador',resetTimer:'Cancelar temporizador',startStopwatch:'Iniciar cronômetro',pauseStopwatch:'Pausar cronômetro',resetStopwatch:'Zerar cronômetro'};
try{const saved=JSON.parse(localStorage.getItem(automationStorageKey)||'[]');automationRoutines=Array.isArray(saved)?saved.filter((routine)=>routine&&typeof routine.id==='string'&&typeof routine.name==='string'&&typeof routine.trigger==='string'&&Array.isArray(routine.steps)):[]}catch{automationRoutines=[];}
function persistAutomations(){try{localStorage.setItem(automationStorageKey,JSON.stringify(automationRoutines));return true;}catch{document.querySelector('#automationStatus').textContent='Não foi possível salvar neste navegador.';return false;}}
function addAutomationStep(type='open',value=''){
  const row=document.createElement('div');row.className='automation-step';const select=document.createElement('select');select.className='automation-type';select.setAttribute('aria-label','Tipo de ação');
  Object.entries(automationTypes).forEach(([key,label])=>select.add(new Option(label,key)));select.value=automationTypes[type]?type:'open';
  const input=document.createElement('input');input.className='automation-value';input.type='text';input.maxLength=240;input.value=value;input.setAttribute('aria-label','Detalhe da ação');
  const remove=document.createElement('button');remove.type='button';remove.className='remove-step';remove.textContent='×';remove.setAttribute('aria-label','Remover ação');remove.addEventListener('click',()=>row.remove());
  const updatePlaceholder=()=>{const current=select.value;input.disabled=['pauseTimer','resetTimer','startStopwatch','pauseStopwatch','resetStopwatch'].includes(current);input.placeholder=current==='timer'?'Duração: 5 minutos ou 2 horas':current==='speak'?'Mensagem para falar':current==='search'?'O que pesquisar':current==='map'?'Cidade ou lugar':current==='open'?'Site: YouTube ou https://…':'Esta ação não precisa de detalhes';};
  select.addEventListener('change',updatePlaceholder);updatePlaceholder();row.append(select,input,remove);document.querySelector('#automationSteps').append(row);
}
function renderAutomations(){
  const list=document.querySelector('#automationList');list.replaceChildren();if(!automationRoutines.length){const empty=document.createElement('p');empty.className='automation-empty';empty.textContent='Suas rotinas salvas aparecerão aqui.';list.append(empty);return;}
  automationRoutines.forEach((routine)=>{const card=document.createElement('article');card.className='automation-card';const title=document.createElement('h3');title.textContent=routine.name;const trigger=document.createElement('p');const schedule=routine.schedule?.enabled?` · DIÁRIO ${routine.schedule.start}–${routine.schedule.end}`:'';trigger.textContent=`Diga ou digite: “${routine.trigger}” · ${routine.steps.length} ${routine.steps.length===1?'ação':'ações'}${schedule}`;const actions=document.createElement('div');actions.className='automation-card-actions';
    [['EXECUTAR','run'],['EDITAR','edit'],['EXCLUIR','delete']].forEach(([label,action])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{if(action==='run')executeAutomation(routine,true);if(action==='edit')editAutomation(routine);if(action==='delete'){automationRoutines=automationRoutines.filter((item)=>item.id!==routine.id);persistAutomations();renderAutomations();document.querySelector('#automationStatus').textContent='Rotina excluída.';}});actions.append(button);});card.append(title,trigger,actions);list.append(card);});
}
function setAutomationSchedule(schedule){const enabled=Boolean(schedule?.enabled);document.querySelector('#automationScheduled').checked=enabled;document.querySelector('#automationStartTime').disabled=!enabled;document.querySelector('#automationEndTime').disabled=!enabled;document.querySelector('#automationStartTime').value=schedule?.start||'05:00';document.querySelector('#automationEndTime').value=schedule?.end||'06:00';}
function resetAutomationForm(){editingAutomationId=null;document.querySelector('#automationName').value='';document.querySelector('#automationTrigger').value='';document.querySelector('#automationSteps').replaceChildren();addAutomationStep();setAutomationSchedule(null);document.querySelector('#saveAutomation').textContent='SALVAR ROTINA';document.querySelector('#automationStatus').textContent='Disponível por texto e voz.';}
function editAutomation(routine){editingAutomationId=routine.id;document.querySelector('#automationName').value=routine.name;document.querySelector('#automationTrigger').value=routine.trigger;document.querySelector('#automationSteps').replaceChildren();routine.steps.forEach((step)=>addAutomationStep(step.type,step.value));setAutomationSchedule(routine.schedule);document.querySelector('#saveAutomation').textContent='ATUALIZAR ROTINA';document.querySelector('#automationStatus').textContent='Editando rotina.';document.querySelector('#automationName').focus();}
function saveAutomation(){const name=document.querySelector('#automationName').value.trim(),trigger=document.querySelector('#automationTrigger').value.trim(),steps=Array.from(document.querySelectorAll('.automation-step')).map((row)=>({type:row.querySelector('.automation-type').value,value:row.querySelector('.automation-value').value.trim()})),statusLine=document.querySelector('#automationStatus');
  if(!name||!trigger){statusLine.textContent='Preencha o nome e a frase de ativação.';return;}const noValueActions=['pauseTimer','resetTimer','startStopwatch','pauseStopwatch','resetStopwatch'];if(!steps.length||steps.some((step)=>!noValueActions.includes(step.type)&&!step.value)){statusLine.textContent='Adicione uma ação e preencha os detalhes necessários.';return;}
  const scheduled=document.querySelector('#automationScheduled').checked,startTime=document.querySelector('#automationStartTime').value,endTime=document.querySelector('#automationEndTime').value;if(scheduled&&(!startTime||!endTime||startTime>=endTime)){statusLine.textContent='Escolha um horário final depois do horário inicial.';return;}
  const normalized=clean(trigger);if(automationRoutines.some((item)=>item.id!==editingAutomationId&&clean(item.trigger)===normalized)){statusLine.textContent='Essa frase já ativa outra rotina.';return;}
  const routine={id:editingAutomationId||createUuid(),name,trigger,steps,schedule:scheduled?{enabled:true,start:startTime,end:endTime}:{enabled:false,start:'05:00',end:'06:00'}};if(editingAutomationId)automationRoutines=automationRoutines.map((item)=>item.id===editingAutomationId?routine:item);else automationRoutines.push(routine);if(!persistAutomations())return;renderAutomations();resetAutomationForm();statusLine.textContent='Rotina salva neste computador.';
}
function automationOpenUrl(value){const alias=sites[clean(value)];if(alias)return alias;try{const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function executeAutomation(routine,manual=false,scheduledStart=false){if(manual)addMessage('user',`Executar rotina: ${routine.name}`);const responses=[];let opened=0;
  for(const step of routine.steps){const value=String(step.value||'').trim();if(step.type==='open'){const url=automationOpenUrl(value);if(url){window.open(url,'_blank','noopener');opened++;}else responses.push(`não reconheci o site ${value}`);}
    else if(step.type==='search'){window.open(`https://www.google.com/search?q=${encodeURIComponent(value)}`,'_blank','noopener');opened++;}else if(step.type==='map'){window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`,'_blank','noopener');opened++;}else if(step.type==='speak')responses.push(value);
    else if(step.type==='timer'){const parsed=value.match(/^(\d+)\s*(segundos?|seg|minutos?|min|horas?|h)$/i);if(parsed){const amount=Number(parsed[1]),unit=clean(parsed[2]),seconds=amount*(/^(seg|s)/.test(unit)?1:/^h/.test(unit)?3600:60);if(seconds>0&&seconds<=86400){startTimer(seconds);responses.push(`temporizador de ${value} iniciado`);}else responses.push('a duração do temporizador precisa ser de até 24 horas');}else responses.push(`não entendi a duração “${value}”; use, por exemplo, 5 minutos`);}
    else if(step.type==='pauseTimer')responses.push(pauseTimer()?'temporizador pausado':'não havia temporizador ativo');else if(step.type==='resetTimer'){resetTimer();responses.push('temporizador cancelado');}else if(step.type==='startStopwatch'){startStopwatch();responses.push('cronômetro iniciado');}else if(step.type==='pauseStopwatch')responses.push(pauseStopwatch()?'cronômetro pausado':'o cronômetro já estava parado');else if(step.type==='resetStopwatch'){resetStopwatch();responses.push('cronômetro zerado');}}
  const summary=[opened?`${opened} ${opened===1?'página aberta':'páginas abertas'}`:'',...responses].filter(Boolean).join('. ');say(scheduledStart?`Sua rotina ${routine.name} começou no horário programado${summary?`: ${summary}`:''}.`:summary?`Rotina ${routine.name} concluída: ${summary}.`:`Rotina ${routine.name} concluída.`);
}
function prepareAlarmAudio(){try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){alarmAudioContext ||= new AudioContextClass();alarmAudioContext.resume();}}catch{}}
function playAlarm(){
  try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;alarmAudioContext ||= new AudioContextClass();alarmAudioContext.resume();const context=alarmAudioContext,now=context.currentTime;
    for(let index=0;index<8;index++){const start=now+index*.48,oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='square';oscillator.frequency.value=index%2?660:880;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.12,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.32);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.34);}
  }catch{document.querySelector('#automationStatus').textContent='O navegador bloqueou o som. Interaja com a página e confira o volume.';}
}
function checkScheduledAutomations(){const now=new Date(),time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  automationRoutines.filter((routine)=>routine.schedule?.enabled).forEach((routine)=>{const startKey=`${routine.id}:${day}:start`,endKey=`${routine.id}:${day}:end`;
    if(time===routine.schedule.start&&!scheduledEventsFired.has(startKey)){scheduledEventsFired.add(startKey);playAlarm();executeAutomation(routine,false,true);}
    if(time===routine.schedule.end&&!scheduledEventsFired.has(endKey)){scheduledEventsFired.add(endKey);if(scheduledEventsFired.has(startKey)){playAlarm();say(`O horário da rotina ${routine.name} terminou. Bom trabalho!`);}}
  });
}
document.querySelector('#automationScheduled').addEventListener('change',(event)=>{document.querySelector('#automationStartTime').disabled=!event.target.checked;document.querySelector('#automationEndTime').disabled=!event.target.checked;if(event.target.checked)prepareAlarmAudio();});
setInterval(checkScheduledAutomations,1000);
document.querySelector('#addAutomationStep').addEventListener('click',()=>addAutomationStep());document.querySelector('#saveAutomation').addEventListener('click',()=>{if(document.querySelector('#automationScheduled').checked)prepareAlarmAudio();saveAutomation();});document.querySelector('#newAutomation').addEventListener('click',resetAutomationForm);resetAutomationForm();
const currencyAliases={real:'BRL',reais:'BRL','real brasileiro':'BRL','reais brasileiros':'BRL',brl:'BRL',dolar:'USD',dolares:'USD','dolar americano':'USD','dolares americanos':'USD',usd:'USD',euro:'EUR',euros:'EUR',eur:'EUR',libra:'GBP',libras:'GBP',gbp:'GBP',iene:'JPY',ienes:'JPY',jpy:'JPY','dolar canadense':'CAD',cad:'CAD','peso argentino':'ARS',pesos:'ARS',ars:'ARS','peso mexicano':'MXN',mxn:'MXN','franco suico':'CHF',chf:'CHF',yuan:'CNY',cny:'CNY',rupia:'INR',inr:'INR','dolar australiano':'AUD',aud:'AUD'};
function currencyCode(value) {
  const phrase=clean(value).replace(/^r\$\s*/,'').trim();
  return currencyAliases[phrase]||(/^[a-z]{3}$/i.test(phrase)?phrase.toUpperCase():null);
}
async function convertCurrency(amount, from, to) {
  const request=++researchRun;
  document.querySelector('#currencyResult').textContent='Consultando a taxa de referência…';
  if(!Number.isFinite(amount)||amount<0){say('Digite um valor válido para converter.');return;}
  document.querySelector('#currencyAmount').value=String(amount);
  document.querySelector('#currencyFrom').value=from;document.querySelector('#currencyTo').value=to;
  if(from===to){const answer=`${amount.toLocaleString('pt-BR')} ${from} equivale ao mesmo valor em ${to}.`;document.querySelector('#currencyResult').textContent=answer;say(answer);return;}
  status.textContent='CONSULTANDO COTAÇÃO';say(`Consultando a cotação de referência entre ${from} e ${to}.`);
  try{
    const response=await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
    if(!response.ok)throw new Error();
    const data=await response.json();if(request!==researchRun)return;
    const converted=amount*data.rate;
    const start=new Intl.NumberFormat('pt-BR',{style:'currency',currency:from}).format(amount);
    const end=new Intl.NumberFormat('pt-BR',{style:'currency',currency:to}).format(converted);
    const answer=`${start} equivalem a ${end}, usando a taxa de referência de ${data.date}.`;
    document.querySelector('#currencyResult').textContent=`${start} = ${end} · taxa de ${data.date}`;
    const link=document.createElement('a');link.href='https://frankfurter.dev/';link.target='_blank';link.rel='noopener';link.textContent='Fonte da cotação: Frankfurter';
    source.replaceChildren(link);source.classList.remove('hidden');status.textContent='COTAÇÃO ATUALIZADA';say(answer);
  }catch{
    if(request!==researchRun)return;
    document.querySelector('#currencyResult').textContent='Não consegui obter a taxa agora.';status.textContent='COTAÇÃO INDISPONÍVEL';say('Não consegui consultar essa moeda agora. Confira os códigos e a conexão com a internet.');
  }
}
function weatherText(code) {
  if (code === 0) return 'Céu limpo'; if (code === 1) return 'Predominantemente limpo'; if (code === 2) return 'Parcialmente nublado'; if (code === 3) return 'Nublado';
  if ([45,48].includes(code)) return 'Neblina'; if ([51,53,55,56,57].includes(code)) return 'Garoa'; if ([61,63,65,66,67,80,81,82].includes(code)) return 'Chuva';
  if ([71,73,75,77,85,86].includes(code)) return 'Neve'; if ([95,96,99].includes(code)) return 'Trovoada'; return 'Condição variável';
}
async function getWeather(city) {
  const run = ++researchRun;
  awaitingWeatherCity = false; status.textContent = 'BUSCANDO CLIMA'; say(`Vou consultar o clima de ${city}.`);
  try {
    const geoParams = new URLSearchParams({name:city,count:'1',language:'pt',format:'json'});
    const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${geoParams}`);
    if (!geoResponse.ok) throw new Error();
    const location = (await geoResponse.json()).results?.[0];
    if (!location) throw new Error();
    const forecastParams = new URLSearchParams({latitude:location.latitude,longitude:location.longitude,current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min',timezone:'auto',forecast_days:'1'});
    const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams}`);
    if (!forecastResponse.ok) throw new Error();
    const data = await forecastResponse.json();
    if (run !== researchRun) return;
    const current = data.current, daily = data.daily;
    const place = [location.name, location.admin1].filter(Boolean).join(', ');
    document.querySelector('#weatherTemp').textContent = `${Math.round(current.temperature_2m)}°`;
    document.querySelector('#weatherPlace').textContent = place;
    document.querySelector('#weatherDescription').textContent = `${weatherText(current.weather_code)} · Máx. ${Math.round(daily.temperature_2m_max[0])}° / Mín. ${Math.round(daily.temperature_2m_min[0])}°`;
    document.querySelector('#weatherFeels').textContent = `${Math.round(current.apparent_temperature)}°`;
    document.querySelector('#weatherHumidity').textContent = `${current.relative_humidity_2m}%`;
    document.querySelector('#weatherWind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    const answer = `Em ${place}, agora está ${weatherText(current.weather_code).toLocaleLowerCase('pt-BR')} e ${Math.round(current.temperature_2m)} graus. Sensação de ${Math.round(current.apparent_temperature)} graus, umidade em ${current.relative_humidity_2m} por cento. Hoje: máxima de ${Math.round(daily.temperature_2m_max[0])} e mínima de ${Math.round(daily.temperature_2m_min[0])} graus.`;
    reply.textContent = answer; lastAssistantText = answer; addMessage('assistant', answer);
    const link = document.createElement('a'); link.href='https://open-meteo.com/'; link.target='_blank'; link.rel='noopener'; link.textContent='Dados do clima: Open-Meteo';
    source.replaceChildren(link); source.classList.remove('hidden'); status.textContent='CLIMA ATUALIZADO';
    if ('speechSynthesis' in window) { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(answer); utterance.lang='pt-BR'; speechSynthesis.speak(utterance); }
  } catch {
    if (run !== researchRun) return;
    status.textContent='CLIMA INDISPONÍVEL'; say(`Não consegui consultar o clima de ${city}. Confira a conexão e tente novamente.`);
  }
}
async function research(query) {
  const run = ++researchRun;
  status.textContent = 'PESQUISANDO';
  say(`Vou procurar uma explicação sobre ${query}.`);
  const params = new URLSearchParams({action:'query',list:'search',srsearch:query,srlimit:'3',format:'json',origin:'*'});
  try {
    const searchResponse = await fetch(`https://pt.wikipedia.org/w/api.php?${params}`);
    if (!searchResponse.ok) throw new Error('A fonte não respondeu.');
    const searchData = await searchResponse.json();
    const matches = searchData.query?.search || [];
    for (const match of matches) {
      const extractParams = new URLSearchParams({action:'query',prop:'extracts',explaintext:'1',exchars:'3200',titles:match.title,format:'json',origin:'*'});
      const articleResponse = await fetch(`https://pt.wikipedia.org/w/api.php?${extractParams}`);
      if (!articleResponse.ok) continue;
      const articleData = await articleResponse.json();
      const page = Object.values(articleData.query?.pages || {})[0];
      const extract = page?.extract?.replace(/\s+/g,' ').trim();
      if (!extract || extract.length < 100) continue;
      if (run !== researchRun) return;
      const answer = extract.length > 1100 ? `${extract.slice(0, extract.lastIndexOf(' ', 1080))}…` : extract;
      reply.textContent = answer;
      const link = document.createElement('a');
      link.href = `https://pt.wikipedia.org/wiki/${encodeURIComponent(match.title.replace(/ /g,'_'))}`;
      link.target = '_blank'; link.rel = 'noopener'; link.textContent = `Fonte: Wikipédia — ${match.title}`;
      source.replaceChildren(link); source.classList.remove('hidden');
      status.textContent = 'RESPOSTA ENCONTRADA';
      const voiceAnswer = answer.length > 650 ? `${answer.slice(0, answer.lastIndexOf(' ', 620))}… Consulte a fonte na tela para ler o restante.` : answer;
      say(voiceAnswer);
      return;
    }
    if (run !== researchRun) return;
    showSearchFallback(query);
  } catch {
    if (run === researchRun) showSearchFallback(query);
  }
}
function showSearchFallback(query) {
  reply.textContent = `Não encontrei um resumo confiável sobre “${query}” nas fontes disponíveis. Você pode abrir uma busca na web.`;
  const link = document.createElement('a');
  link.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Abrir busca na web';
  source.replaceChildren(link); source.classList.remove('hidden');
  status.textContent = 'SEM RESUMO';
  say(`Não encontrei um resumo confiável sobre ${query}. Deixei uma opção de busca na tela.`);
}
function searchWeb(query) {
  let cleaned = query.trim()
    .replace(/\bcll\b|\bcel\b/gi, 'celular')
    .replace(/\bcelular\b/gi, 'celular')
    .replace(/\blego builder\b/gi, 'LEGO Builder');
  if (/^(e |mas e |tambem |e no |e na |e para |e pra )/.test(cleaned) && lastSearchTopic) {
    cleaned = `${lastSearchTopic} ${cleaned.replace(/^(e |mas e |tambem )/, '')}`;
  }
  lastSearchTopic = cleaned;
  research(cleaned);
}
function runCommand(raw) {
  researchRun++;
  source.replaceChildren(); source.classList.add('hidden');
  const text = clean(raw).replace(/^(jarvis|j a r v i s)[ ,]*/, '').trim();
  if (!text) return say('Pode falar. Estou ouvindo.');
  status.textContent = 'PRONTO'; addMessage('user', raw.trim());
  const routine=automationRoutines.find((item)=>clean(item.trigger)===text||text===`executar rotina ${clean(item.trigger)}`);
  if(routine)return executeAutomation(routine);
  if (awaitingWeatherCity) {
    if (/^(cancelar|deixa|esquece)$/.test(text)) { awaitingWeatherCity=false; return say('Tudo bem, cancelei a consulta do clima.'); }
    return getWeather(raw.trim());
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite)$/.test(text)) return say('Olá! Como posso ajudar?');
  if (/^(?:que horas (?:sao|e)|me diga as horas|qual o horario agora|horario agora|hora agora)$/.test(text)) return say(`Agora são ${new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}.`);
  const relativeDate = text.match(/^(?:(?:que dia (?:e|vai ser|sera) |qual a data (?:de )?|data (?:de )?|e )?(hoje|amanha|depois de amanha|ontem)|daqui a (\d+) dias?)$/);
  if (relativeDate) {
    const offsets = {hoje:0,amanha:1,'depois de amanha':2,ontem:-1};
    const offset = relativeDate[2] ? Math.min(Number(relativeDate[2]),365) : offsets[relativeDate[1]];
    return answerDate(offset);
  }
  if (/^(que dia|qual a data|data de hoje|que data e hoje)$/.test(text)) return answerDate(0);
  if (/^e depois$/.test(text) && lastDateOffset !== null) return answerDate(lastDateOffset + 1);
  const mapRequest = text.match(/^(?:mapa de|abrir mapa de|como chegar (?:em|a)) (.+)$/);
  if (mapRequest) { window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapRequest[1])}`,'_blank','noopener'); return say(`Abrindo o mapa de ${mapRequest[1]}.`); }
  const youtubeRequest = text.match(/^(?:pesquisar|pesquise|buscar|procure)(?: videos?)? (.+?) (?:no|na) youtube$/) || text.match(/^(?:pesquisar no youtube|buscar no youtube|youtube) (.+)$/);
  if (youtubeRequest) { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeRequest[1])}`,'_blank','noopener'); return say(`Pesquisando ${youtubeRequest[1]} no YouTube.`); }
  const numberRange = text.match(/^(?:escolha|escolher|sortear) (?:um )?numero entre (-?\d+) (?:e|ate) (-?\d+)$/);
  if (numberRange) { const low=Number(numberRange[1]), high=Number(numberRange[2]); if (low>high) return say('O primeiro número precisa ser menor que o segundo.'); return say(`Escolhi o número ${Math.floor(Math.random()*(high-low+1))+low}.`); }
  const pick = text.match(/^(?:escolha|escolher|decida|decidir) entre (.+?) ou (.+)$/);
  if (pick) return say(`Minha escolha é ${Math.random()<0.5?pick[1]:pick[2]}.`);
  if (/^(?:jogar|jogue|rolar|role|lancar|lance)(?: um)? dado$/.test(text)) return say(`O dado caiu no ${Math.floor(Math.random()*6)+1}.`);
  if (/^(?:jogar|jogue|lancar|lance)(?: uma)? moeda$|^cara ou coroa$/.test(text)) return say(Math.random()<0.5?'Deu cara.':'Deu coroa.');
  if (/^(?:pausar|parar)(?: o)? (?:timer|temporizador)$/.test(text)) return pauseTimer() ? say('Temporizador pausado.') : say('Não há um temporizador em andamento.');
  if (/^(?:retomar|continuar)(?: o)? (?:timer|temporizador)$/.test(text)) return resumeTimer() ? say('Temporizador retomado.') : say('Não há um temporizador pausado para retomar.');
  if (/^(?:cancelar|zerar)(?: o)? (?:timer|temporizador)$/.test(text)) { resetTimer(); return say('Temporizador cancelado.'); }
  if (/^(?:quanto falta|quanto tempo falta)(?: no| para o)? (?:timer|temporizador)$/.test(text)) return timerInterval || timerPaused ? say(`Faltam ${document.querySelector('#timerDisplay').textContent}.`) : say('Não há um temporizador ativo.');
  if (/^(?:iniciar|comecar|retomar|continuar)(?: o)? cronometro$/.test(text)) { startStopwatch(); return say('Cronômetro iniciado.'); }
  if (/^(?:pausar|parar)(?: o)? cronometro$/.test(text)) return pauseStopwatch() ? say('Cronômetro pausado.') : say('O cronômetro não está rodando.');
  if (/^(?:zerar|reiniciar|resetar)(?: o)? cronometro$/.test(text)) { resetStopwatch(); return say('Cronômetro zerado.'); }
  if (/^(?:marcar|registrar)(?: uma)? volta(?: no cronometro)?$/.test(text)) { const lap=recordStopwatchLap(); return lap ? say(`Volta registrada em ${lap}.`) : say('Inicie o cronômetro antes de marcar uma volta.'); }
  if (/^(?:quanto tempo|tempo decorrido)(?: no| do)? cronometro$/.test(text)) return say(`O cronômetro marca ${formatStopwatch(stopwatchCurrent())}.`);
  const currencyMatch=text.match(/^(?:(?:converter|converta)\s+|quanto e )?(-?\d+(?:[.,]\d+)?)\s+(.+?)\s+(?:para|pra|em)\s+(.+)$/);
  if (currencyMatch) {
    const amount=Number(currencyMatch[1].replace(',','.')),from=currencyCode(currencyMatch[2]),to=currencyCode(currencyMatch[3]);
    if(from&&to)return convertCurrency(amount,from,to);
  }
  const spokenNumbers = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20};
  const timerText = text.replace(/\bmeia hora\b/g,'30 minutos').replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)(?=\s+(?:segundos?|seg|minutos?|min|horas?|h)\b)/,word=>String(spokenNumbers[word]));
  const timerMatch = timerText.match(/(?:timer|temporizador)(?:\s+(?:de|para|pra|em|por|ex|exemplo|mude|mudar|alterar|ajustar|definir|colocar)){0,5}\s+(\d+)\s*(segundos?|seg|minutos?|min|horas?|h)\b/);
  if (timerMatch) {
    const amount=Number(timerMatch[1]), unit=timerMatch[2];
    const seconds=amount*(/^(?:seg|s)/.test(unit)?1:/^h/.test(unit)?3600:60);
    startTimer(seconds); return say(`Temporizador de ${amount} ${unit} iniciado.`);
  }
  const weatherMatch = text.match(/^(?:qual (?:e|a) )?(?:o )?(?:clima|tempo|previsao(?: do tempo)?)(?: (?:em|para|de) (.+))?$/) || text.match(/^como (?:esta|vai ficar) o tempo(?: em (.+))?$/);
  if (weatherMatch) {
    if (weatherMatch[1]) return getWeather(weatherMatch[1]);
    awaitingWeatherCity = true; return say('Claro. De qual cidade você quer saber o clima? Digite, por exemplo, “Curitiba”.');
  }
  if (/^(abra|abrir|acessar|vai para) /.test(text)) {
    const target = text.replace(/^(abra|abrir|acessar|vai para) /,'').replace(/^o |^a |^site do |^site da /,'').trim();
    if (sites[target]) { window.open(sites[target], '_blank', 'noopener'); return say(`Abrindo ${target}.`); }
    const domain = target.replace(/\s+/g,'');
    if (/^[a-z0-9-]+\.(com|org|net|com\.br|br)$/.test(domain)) { window.open(`https://${domain}`,'_blank','noopener'); return say(`Abrindo ${domain}.`); }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(target)}`,'_blank','noopener'); return say(`Pesquisei ${target} na internet.`);
  }
  if (/^(pesquisar|pesquise|buscar|procure) /.test(text)) {
    const query = text.replace(/^(pesquisar|pesquise|buscar|procure) /,'');
    return searchWeb(query);
  }
  const percent = text.match(/^(-?\d+(?:[.,]\d+)?)% (?:de|do) (-?\d+(?:[.,]\d+)?)$/);
  if (percent) return say(`${percent[1]} por cento de ${percent[2]} é ${Number((Number(percent[1].replace(',','.')) * Number(percent[2].replace(',','.')) / 100).toPrecision(10)).toLocaleString('pt-BR')}.`);
  const temperature = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:graus? )?(?:celsius|c)\s*(?:para|em)\s*(?:graus? )?(?:fahrenheit|f)/);
  if (temperature) { const c = Number(temperature[1].replace(',','.')); return say(`${c} graus Celsius equivalem a ${Number((c * 9 / 5 + 32).toFixed(1)).toLocaleString('pt-BR')} graus Fahrenheit.`); }
  const fahrenheit = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:graus? )?(?:fahrenheit|f)\s*(?:para|em)\s*(?:graus? )?(?:celsius|c)/);
  if (fahrenheit) { const f = Number(fahrenheit[1].replace(',','.')); return say(`${f} graus Fahrenheit equivalem a ${Number(((f - 32) * 5 / 9).toFixed(1)).toLocaleString('pt-BR')} graus Celsius.`); }
  const distance = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:quilometros|km)\s*(?:para|em)\s*(?:milhas|mi)/);
  if (distance) { const km = Number(distance[1].replace(',','.')); return say(`${km} quilômetros equivalem a ${Number((km * 0.621371).toFixed(2)).toLocaleString('pt-BR')} milhas.`); }
  const conversions = [
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:milhas|mi)\s*(?:para|em)\s*(?:quilometros|km)/,factor:1.60934,from:'milhas',to:'quilômetros',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|quilogramas?)\s*(?:para|em)\s*(?:libras|lb)/,factor:2.20462,from:'quilogramas',to:'libras',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:libras|lb)\s*(?:para|em)\s*(?:kg|quilos?|quilogramas?)/,factor:0.453592,from:'libras',to:'quilogramas',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:metros?|m)\s*(?:para|em)\s*(?:pes|ft)/,factor:3.28084,from:'metros',to:'pés',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:pes|ft)\s*(?:para|em)\s*(?:metros?|m)/,factor:0.3048,from:'pés',to:'metros',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:centimetros?|cm)\s*(?:para|em)\s*(?:polegadas|in)/,factor:0.393701,from:'centímetros',to:'polegadas',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:litros?|l)\s*(?:para|em)\s*(?:galoes?|gal)/,factor:0.264172,from:'litros',to:'galões americanos',digits:2},
    {pattern:/(-?\d+(?:[.,]\d+)?)\s*(?:galoes?|gal)\s*(?:para|em)\s*(?:litros?|l)/,factor:3.78541,from:'galões americanos',to:'litros',digits:2}
  ];
  for (const conversion of conversions) {
    const match=text.match(conversion.pattern);
    if (match) { const value=Number(match[1].replace(',','.')); const converted=Number((value*conversion.factor).toFixed(conversion.digits)); return say(`${value} ${conversion.from} equivalem a ${converted.toLocaleString('pt-BR')} ${conversion.to}.`); }
  }
  const power = text.match(/^(?:raiz quadrada de|raiz de) (\d+(?:[.,]\d+)?)$/);
  if (power) { const value=Number(power[1].replace(',','.')); return value<0 ? say('Não consigo calcular a raiz quadrada de um número negativo neste modo.') : say(`A raiz quadrada de ${value} é ${Number(Math.sqrt(value).toFixed(4)).toLocaleString('pt-BR')}.`); }
  const square = text.match(/^quadrado de (-?\d+(?:[.,]\d+)?)$/);
  if (square) { const value=Number(square[1].replace(',','.')); return say(`O quadrado de ${value} é ${Number((value*value).toPrecision(10)).toLocaleString('pt-BR')}.`); }
  const scalar = text.match(/^(dobro|triplo|metade) de (-?\d+(?:[.,]\d+)?)$/);
  if (scalar) { const value=Number(scalar[2].replace(',','.')); const result=scalar[1]==='dobro'?value*2:scalar[1]==='triplo'?value*3:value/2; return say(`${scalar[1][0].toUpperCase()+scalar[1].slice(1)} de ${value} é ${Number(result.toPrecision(10)).toLocaleString('pt-BR')}.`); }
  const calc = text.match(/(?:quanto e |calcule )?(-?\d+(?:[.,]\d+)?)\s*(mais|menos|vezes|dividido por|\+|-|x|\*|\/|por)\s*(-?\d+(?:[.,]\d+)?)/);
  if (calc) {
    const a=Number(calc[1].replace(',','.')), b=Number(calc[3].replace(',','.')); const op=calc[2];
    const result = op==='mais'||op==='+' ? a+b : op==='menos'||op==='-' ? a-b : op==='vezes'||op==='x'||op==='*' ? a*b : b===0 ? null : a/b;
    if (result===null) return say('Não é possível dividir por zero.');
    return say(`O resultado é ${Number(result.toPrecision(10)).toLocaleString('pt-BR')}.`);
  }
  if (/ajuda|o que voce faz|quais comandos/.test(text)) return say('Posso abrir sites, pesquisar assuntos, buscar vídeos, mostrar mapas, consultar clima e cotações de moedas, dizer hora e datas, fazer cálculos, usar temporizador e cronômetro, e realizar sorteios.');
  return searchWeb(text);
}
commandForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = commandInput.value.trim();
  if (!text) return;
  heard.textContent = `Você digitou: “${text}”`;
  commandInput.value = '';
  runCommand(text);
});
document.querySelectorAll('[data-command]').forEach((shortcut) => shortcut.addEventListener('click', () => {
  const command = shortcut.dataset.command;
  heard.textContent = `Atalho: “${command}”`;
  runCommand(command);
}));
const mapDialog=document.querySelector('#mapDialog'), drawDialog=document.querySelector('#drawDialog'), toolsDialog=document.querySelector('#toolsDialog'), automationDialog=document.querySelector('#automationDialog');
let worldMap=null, worldMarker=null, mapLastLocation=null;
function ensureWorldMap() {
  const fallback=document.querySelector('#mapFallback');
  if(!window.L){fallback.textContent='O mapa detalhado precisa de internet para carregar.';fallback.classList.remove('hidden');return false;}
  if(worldMap)return true;
  fallback.textContent='Carregando mapa cartográfico…';fallback.classList.remove('hidden');
  worldMap=L.map('worldMap',{minZoom:2,maxZoom:19,worldCopyJump:true,scrollWheelZoom:true}).setView([18,0],2);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'});
  tiles.on('tileload',()=>fallback.classList.add('hidden'));
  tiles.on('tileerror',()=>{if(fallback.classList.contains('hidden'))return;fallback.textContent='Não consegui carregar os mapas. Confira a conexão com a internet.';});
  tiles.addTo(worldMap);
  worldMap.on('click',(event)=>{
    const {lat,lng}=event.latlng;const coordinateLabel=`${lat.toFixed(4)}, ${lng.toFixed(4)}`;mapLastLocation={lat,lng,label:coordinateLabel};document.querySelector('#mapPlaceInput').value=coordinateLabel;
    document.querySelector('#selectedContinent').textContent='Ponto escolhido no mapa';
    document.querySelector('#mapCoordinates').textContent=`${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    if(worldMarker)worldMarker.setLatLng(event.latlng);else worldMarker=L.circleMarker(event.latlng,{radius:8,color:'#e8ffff',weight:2,fillColor:'#31bccb',fillOpacity:.9}).addTo(worldMap);
    worldMarker.bindPopup(`Local selecionado<br>${lat.toFixed(4)}°, ${lng.toFixed(4)}°`).openPopup();
  });
  return true;
}
document.querySelector('#openMapMenu').addEventListener('click',()=>{mapDialog.showModal();setTimeout(()=>{if(ensureWorldMap())worldMap.invalidateSize();},80);});
document.querySelector('#openDrawMenu').addEventListener('click',()=>drawDialog.showModal());
document.querySelector('#openToolsMenu').addEventListener('click',()=>{toolsDialog.showModal();document.querySelector('#toolsHome').classList.remove('hidden');document.querySelectorAll('[data-tool-view]').forEach((view)=>view.classList.add('hidden'));});
document.querySelector('#openAutomationMenu').addEventListener('click',()=>{automationDialog.showModal();renderAutomations();});
document.querySelectorAll('[data-close-dialog]').forEach((closeButton)=>closeButton.addEventListener('click',()=>closeButton.closest('dialog').close()));
for (const dialog of [mapDialog,drawDialog,toolsDialog,automationDialog]) dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close();});
mapDialog.addEventListener('close',()=>{if(worldMap)setTimeout(()=>worldMap.invalidateSize(),50);});
const continentPlaces={
  'América do Norte':['Nova York','Cidade do México','Toronto','Los Angeles'],
  'América do Sul':['São Paulo','Rio de Janeiro','Buenos Aires','Lima'],
  'Europa':['Lisboa','Paris','Londres','Roma'],
  'África':['Cairo','Nairóbi','Cidade do Cabo','Marrakech'],
  'Ásia':['Tóquio','Seul','Mumbai','Bangkok'],
  'Oceania':['Sydney','Melbourne','Auckland','Suva']
};
const continentCenters={'América do Norte':[42,-102],'América do Sul':[-15,-60],'Europa':[51,15],'África':[4,20],'Ásia':[35,90],'Oceania':[-25,135]};
async function locateMapPlace(place) {
  if(!ensureWorldMap())return;
  document.querySelector('#mapPlaceInput').value=place;document.querySelector('#mapCoordinates').textContent=`Localizando ${place}…`;
  try{
    const params=new URLSearchParams({name:place,count:'1',language:'pt',format:'json'});
    const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    if(!response.ok)throw new Error();
    const location=(await response.json()).results?.[0];if(!location)throw new Error();
    const point=[location.latitude,location.longitude];worldMap.flyTo(point,Math.max(worldMap.getZoom(),8),{duration:1.1});
    if(worldMarker)worldMarker.remove();
    worldMarker=L.circleMarker(point,{radius:8,color:'#e8ffff',weight:2,fillColor:'#31bccb',fillOpacity:.9}).addTo(worldMap);
    const label=[location.name,location.admin1,location.country].filter(Boolean).join(', ');
    worldMarker.bindPopup(label).openPopup();mapLastLocation={lat:location.latitude,lng:location.longitude,label};
    document.querySelector('#selectedContinent').textContent=label;
    document.querySelector('#mapCoordinates').textContent=`${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`;
  }catch{document.querySelector('#mapCoordinates').textContent=`Não encontrei “${place}”. Tente outro nome.`;}
}
function selectContinent(region) {
  document.querySelectorAll('[data-continent]').forEach((item)=>item.classList.toggle('selected',item.dataset.continent===region));
  document.querySelector('#selectedContinent').textContent=region;
  document.querySelector('#mapPlaceInput').value='';mapLastLocation=null;
  document.querySelector('#mapCoordinates').textContent='Região selecionada · escolha uma cidade ou explore o mapa';
  if(ensureWorldMap()){if(worldMarker){worldMarker.remove();worldMarker=null;}worldMap.flyTo(continentCenters[region],3,{duration:1.1});}
  const places=document.querySelector('#mapPlaces'); places.replaceChildren();
  for(const place of continentPlaces[region]||[]){
    const chip=document.createElement('button'); chip.type='button'; chip.className='map-city'; chip.textContent=place;
    chip.addEventListener('click',()=>{document.querySelectorAll('.map-city').forEach((item)=>item.classList.toggle('selected',item===chip));locateMapPlace(place);});
    places.append(chip);
  }
}
document.querySelectorAll('[data-continent]').forEach((continent)=>continent.addEventListener('click',()=>selectContinent(continent.dataset.continent)));
document.querySelector('#mapPlaceForm').addEventListener('submit',(event)=>{
  event.preventDefault(); const place=document.querySelector('#mapPlaceInput').value.trim();
  if(place)locateMapPlace(place);
});
document.querySelector('#openMapExternal').addEventListener('click',()=>{
  const place=document.querySelector('#mapPlaceInput').value.trim()||mapLastLocation?.label;
  if(!place)return;mapDialog.close();heard.textContent=`Abrindo o mapa de ${place}`;runCommand(`mapa de ${place}`);
});
const drawModes={names:document.querySelector('#drawNamesMode'),numbers:document.querySelector('#drawNumbersMode'),chance:document.querySelector('#drawChanceMode')};
document.querySelectorAll('[data-draw-tab]').forEach((tab)=>tab.addEventListener('click',()=>{
  document.querySelectorAll('[data-draw-tab]').forEach((item)=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});
  Object.entries(drawModes).forEach(([name,section])=>section.classList.toggle('hidden',name!==tab.dataset.drawTab));
}));
let drawnNames=new Set();
const drawResult=document.querySelector('#drawResult');
function showDrawResult(result,spoken=result) {
  drawResult.querySelector('strong').textContent=result; drawResult.classList.remove('result-pop'); void drawResult.offsetWidth; drawResult.classList.add('result-pop'); say(spoken);
}
document.querySelector('#drawNames').addEventListener('input',()=>{drawnNames.clear();});
document.querySelector('#drawNameButton').addEventListener('click',()=>{
  const names=document.querySelector('#drawNames').value.split(/[\n,]+/).map((name)=>name.trim()).filter(Boolean);
  if(!names.length)return showDrawResult('Adicione pelo menos um nome.','Escreva os nomes dos participantes para começar o sorteio.');
  const eligible=document.querySelector('#noRepeat').checked?names.filter((name)=>!drawnNames.has(name)):names;
  if(!eligible.length)return showDrawResult('Todos os nomes já foram sorteados.','Todos os nomes já saíram. Clique em novo sorteio para começar de novo.');
  const winner=eligible[Math.floor(Math.random()*eligible.length)]; if(document.querySelector('#noRepeat').checked)drawnNames.add(winner);
  showDrawResult(winner,`O nome sorteado foi ${winner}.`);
});
document.querySelector('#resetNameDraw').addEventListener('click',()=>{drawnNames.clear();showDrawResult('Pronto para sortear','Novo sorteio iniciado.');});
document.querySelector('#drawNumberButton').addEventListener('click',()=>{
  const min=Number(document.querySelector('#drawMin').value),max=Number(document.querySelector('#drawMax').value);
  if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min>max)return showDrawResult('Confira os limites do sorteio.','O número inicial precisa ser inteiro e menor ou igual ao número final.');
  const result=Math.floor(Math.random()*(max-min+1))+min; showDrawResult(String(result),`O número sorteado foi ${result}.`);
});
document.querySelector('#rollDieButton').addEventListener('click',()=>{const value=Math.floor(Math.random()*6)+1;showDrawResult(`⚄ ${value}`,`O dado caiu no ${value}.`);});
document.querySelector('#flipCoinButton').addEventListener('click',()=>{const result=Math.random()<.5?'Cara':'Coroa';showDrawResult(result,`Deu ${result.toLocaleLowerCase('pt-BR')}.`);});
const advancedTools=[
  {id:'url',icon:'↗',title:'URL encode/decode',desc:'Codificar texto para links',view:`<textarea class="tool-textarea" id="urlInput" rows="4" placeholder="Texto ou URL…"></textarea><div class="tool-button-row"><button data-url-action="encode" type="button">CODIFICAR</button><button data-url-action="decode" type="button">DECODIFICAR</button></div><pre class="json-output" id="urlOutput"></pre>`},
  {id:'base64',icon:'64',title:'Base64',desc:'Codificar e decodificar texto',view:`<textarea class="tool-textarea" id="base64Input" rows="4" placeholder="Texto…"></textarea><div class="tool-button-row"><button data-base64-action="encode" type="button">CODIFICAR</button><button data-base64-action="decode" type="button">DECODIFICAR</button></div><pre class="json-output" id="base64Output"></pre>`},
  {id:'hash',icon:'#',title:'Gerador SHA-256',desc:'Criar hash localmente',view:`<textarea class="tool-textarea" id="hashInput" rows="4" placeholder="Texto para gerar o hash…"></textarea><button class="tool-action" id="makeHash" type="button">GERAR SHA-256</button><pre class="json-output" id="hashOutput"></pre>`},
  {id:'htmlentities',icon:'</>',title:'Entidades HTML',desc:'Escapar ou revelar caracteres',view:`<textarea class="tool-textarea" id="htmlEntityInput" rows="4" placeholder="Texto HTML…"></textarea><div class="tool-button-row"><button data-html-action="escape" type="button">ESCAPAR</button><button data-html-action="unescape" type="button">REVELAR</button></div><pre class="json-output" id="htmlEntityOutput"></pre>`},
  {id:'regex',icon:'.*',title:'Testador de regex',desc:'Encontrar padrões no texto',view:`<div class="tool-fields two"><label>Padrão<input id="regexPattern" placeholder="Ex.: \\d+"></label><label>Flags<input id="regexFlags" value="gi"></label></div><textarea class="tool-textarea" id="regexText" rows="4" placeholder="Texto para verificar…"></textarea><button class="tool-action" id="runRegex" type="button">TESTAR PADRÃO</button><pre class="json-output" id="regexOutput"></pre>`},
  {id:'csvjson',icon:'⇄',title:'CSV ↔ JSON',desc:'Converter tabelas e objetos',view:`<textarea class="tool-textarea" id="csvJsonInput" rows="5" placeholder="Cole CSV ou JSON…"></textarea><div class="tool-button-row"><button data-csv-action="json" type="button">CSV PARA JSON</button><button data-csv-action="csv" type="button">JSON PARA CSV</button></div><pre class="json-output" id="csvJsonOutput"></pre>`},
  {id:'markdown',icon:'M↓',title:'Prévia Markdown',desc:'Visualizar texto formatado',view:`<textarea class="tool-textarea" id="markdownInput" rows="5" placeholder="# Título · **negrito** · *itálico* · código"></textarea><div class="markdown-preview" id="markdownPreview">A prévia aparece aqui.</div>`},
  {id:'lorem',icon:'Aa',title:'Lorem Ipsum',desc:'Gerar texto de preenchimento',view:`<label class="simple-label">Parágrafos<input type="number" id="loremCount" min="1" max="10" value="3"></label><button class="tool-action" id="makeLorem" type="button">GERAR TEXTO</button><textarea class="tool-textarea generated-text" id="loremOutput" rows="7" readonly></textarea>`},
  {id:'diff',icon:'±',title:'Comparar textos',desc:'Ver diferenças linha a linha',view:`<div class="tool-fields two"><label>Texto A<textarea class="tool-textarea" id="diffTextA" rows="5"></textarea></label><label>Texto B<textarea class="tool-textarea" id="diffTextB" rows="5"></textarea></label></div><button class="tool-action" id="compareText" type="button">COMPARAR</button><pre class="json-output diff-output" id="diffOutput"></pre>`},
  {id:'sortlist',icon:'≡',title:'Organizar listas',desc:'Ordenar, remover repetidos ou misturar',view:`<textarea class="tool-textarea" id="listInput" rows="6" placeholder="Um item por linha…"></textarea><div class="tool-button-row"><button data-list-action="sort" type="button">ORDENAR A–Z</button><button data-list-action="unique" type="button">SEM REPETIDOS</button><button data-list-action="shuffle" type="button">MISTURAR</button></div><textarea class="tool-textarea generated-text" id="listOutput" rows="5" readonly></textarea>`},
  {id:'stats',icon:'Σ',title:'Estatística rápida',desc:'Média, mediana e moda',view:`<textarea class="tool-textarea" id="statsInput" rows="4" placeholder="Números separados por espaço ou vírgula…"></textarea><button class="tool-action" id="calculateStats" type="button">CALCULAR ESTATÍSTICAS</button><p class="tool-output" id="statsOutput">—</p>`},
  {id:'percentchange',icon:'%',title:'Variação percentual',desc:'Comparar valor inicial e final',view:`<div class="tool-fields two"><label>Valor inicial<input type="number" id="percentOld" step="any"></label><label>Valor final<input type="number" id="percentNew" step="any"></label></div><button class="tool-action" id="calculatePercentChange" type="button">CALCULAR VARIAÇÃO</button><p class="tool-output" id="percentChangeOutput">—</p>`},
  {id:'prime',icon:'ℙ',title:'Primos e fatores',desc:'Verificar e fatorar inteiros',view:`<label class="simple-label">Número inteiro<input type="number" id="primeInput" step="1" min="1" max="1000000000000"></label><button class="tool-action" id="analyzePrime" type="button">ANALISAR NÚMERO</button><p class="tool-output" id="primeOutput">—</p>`},
  {id:'gcd',icon:'∩',title:'MDC e MMC',desc:'Encontrar divisores comuns',view:`<div class="tool-fields two"><label>Primeiro inteiro<input type="number" id="gcdA" step="1"></label><label>Segundo inteiro<input type="number" id="gcdB" step="1"></label></div><button class="tool-action" id="calculateGcd" type="button">CALCULAR MDC E MMC</button><p class="tool-output" id="gcdOutput">—</p>`},
  {id:'baseconvert',icon:'010',title:'Bases numéricas',desc:'Decimal, binário, octal e hexadecimal',view:`<div class="tool-fields two"><label>Valor<input id="baseValue" value="42"></label><label>De base<select id="baseFrom"><option value="10">Decimal</option><option value="2">Binário</option><option value="8">Octal</option><option value="16">Hexadecimal</option></select></label><label>Para base<select id="baseTo"><option value="2">Binário</option><option value="8">Octal</option><option value="10">Decimal</option><option value="16">Hexadecimal</option></select></label></div><button class="tool-action" id="convertBase" type="button">CONVERTER BASE</button><p class="tool-output" id="baseOutput">—</p>`},
  {id:'roman',icon:'Ⅻ',title:'Números romanos',desc:'Converter romano e decimal',view:`<label class="simple-label">Valor<input id="romanInput" placeholder="Ex.: 2026 ou MMXXVI"></label><div class="tool-button-row"><button data-roman-action="toRoman" type="button">DECIMAL → ROMANO</button><button data-roman-action="toNumber" type="button">ROMANO → DECIMAL</button></div><p class="tool-output" id="romanOutput">—</p>`},
  {id:'speed',icon:'◉',title:'Distância, velocidade e tempo',desc:'Calcular a variável que falta',view:`<p class="dialog-intro">Preencha duas opções e deixe uma em branco.</p><div class="tool-fields three"><label>Distância (km)<input id="speedDistance" type="number" min="0" step="any"></label><label>Velocidade (km/h)<input id="speedRate" type="number" min="0" step="any"></label><label>Tempo (h)<input id="speedTime" type="number" min="0" step="any"></label></div><button class="tool-action" id="calculateSpeed" type="button">CALCULAR</button><p class="tool-output" id="speedOutput">—</p>`},
  {id:'age',icon:'♧',title:'Calculadora de idade',desc:'Idade exata em anos, meses e dias',view:`<div class="tool-fields two"><label>Data de nascimento<input type="date" id="birthDate"></label><label>Calcular até<input type="date" id="ageAtDate"></label></div><button class="tool-action" id="calculateAge" type="button">CALCULAR IDADE</button><p class="tool-output" id="ageOutput">—</p>`},
  {id:'timestamp',icon:'◴',title:'Unix timestamp',desc:'Converter data e segundos Unix',view:`<label class="simple-label">Timestamp em segundos<input type="number" id="timestampInput" step="1" placeholder="Ex.: 1795123200"></label><button class="tool-action" id="timestampToDate" type="button">TIMESTAMP → DATA</button><p class="tool-output" id="timestampDateOutput">—</p><hr class="tool-divider"><label class="simple-label">Data e hora<input type="datetime-local" id="timestampDate"></label><button class="tool-action" id="dateToTimestamp" type="button">DATA → TIMESTAMP</button><p class="tool-output" id="dateTimestampOutput">—</p>`},
  {id:'timezone',icon:'◷',title:'Conversor de fuso horário',desc:'Comparar hora entre cidades',view:`<label class="simple-label">Data e hora de origem<input type="datetime-local" id="timezoneInput"></label><div class="tool-fields two"><label>Fuso de origem<select id="timezoneFrom"></select></label><label>Converter para<select id="timezoneTo"></select></label></div><button class="tool-action" id="convertTimezone" type="button">CONVERTER HORÁRIO</button><p class="tool-output" id="timezoneOutput">—</p>`}
];
for(const tool of advancedTools){
  const card=document.createElement('button');card.type='button';card.dataset.toolOpen=tool.id;const icon=document.createElement('i');icon.textContent=tool.icon;const title=document.createElement('b');title.textContent=tool.title;const description=document.createElement('small');description.textContent=tool.desc;card.append(icon,title,description);document.querySelector('#toolsGrid').append(card);
  const view=document.createElement('section');view.className='tool-view hidden';view.dataset.toolView=tool.id;view.innerHTML=`<div class="tool-view-head"><button data-tool-back type="button">← FERRAMENTAS</button><h3>${tool.title}</h3></div>${tool.view}`;toolsDialog.append(view);
}
document.querySelector('#toolsSearch').addEventListener('input',(event)=>{
  const query=event.target.value.trim().toLocaleLowerCase('pt-BR');
  document.querySelectorAll('#toolsGrid [data-tool-open]').forEach((card)=>card.classList.toggle('hidden',Boolean(query&&!card.textContent.toLocaleLowerCase('pt-BR').includes(query))));
});
document.querySelectorAll('[data-tool-open]').forEach((card)=>card.addEventListener('click',()=>{
  document.querySelector('#toolsHome').classList.add('hidden');
  document.querySelectorAll('[data-tool-view]').forEach((view)=>view.classList.toggle('hidden',view.dataset.toolView!==card.dataset.toolOpen));
  if(card.dataset.toolOpen==='calendar')renderCalendar();
}));
document.querySelectorAll('[data-tool-back]').forEach((button)=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-tool-view]').forEach((view)=>view.classList.add('hidden'));document.querySelector('#toolsHome').classList.remove('hidden');
}));
document.querySelectorAll('[data-url-action]').forEach((button)=>button.addEventListener('click',()=>{
  const input=document.querySelector('#urlInput').value;
  try{document.querySelector('#urlOutput').textContent=button.dataset.urlAction==='encode'?encodeURIComponent(input):decodeURIComponent(input);}catch{document.querySelector('#urlOutput').textContent='Não consegui decodificar. Confira o texto.';}
}));
function encodeBase64Utf8(value){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
function decodeBase64Utf8(value){const binary=atob(value.trim()),bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
document.querySelectorAll('[data-base64-action]').forEach((button)=>button.addEventListener('click',()=>{
  try{const input=document.querySelector('#base64Input').value;document.querySelector('#base64Output').textContent=button.dataset.base64Action==='encode'?encodeBase64Utf8(input):decodeBase64Utf8(input);}catch{document.querySelector('#base64Output').textContent='Texto Base64 inválido ou com codificação incorreta.';}
}));
document.querySelector('#makeHash').addEventListener('click',async()=>{
  try{const bytes=new TextEncoder().encode(document.querySelector('#hashInput').value),digest=await crypto.subtle.digest('SHA-256',bytes);document.querySelector('#hashOutput').textContent=Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,'0')).join('');}catch{document.querySelector('#hashOutput').textContent='Hash SHA-256 indisponível neste navegador.';}
});
function escapeHtml(value){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
document.querySelectorAll('[data-html-action]').forEach((button)=>button.addEventListener('click',()=>{
  const input=document.querySelector('#htmlEntityInput').value,output=document.querySelector('#htmlEntityOutput');
  if(button.dataset.htmlAction==='escape')output.textContent=escapeHtml(input);else{const parsed=new DOMParser().parseFromString(input,'text/html');output.textContent=parsed.documentElement.textContent;}
}));
document.querySelector('#runRegex').addEventListener('click',()=>{
  const pattern=document.querySelector('#regexPattern').value,flags=document.querySelector('#regexFlags').value,text=document.querySelector('#regexText').value,out=document.querySelector('#regexOutput');
  try{const regex=new RegExp(pattern,flags.includes('g')?flags:`${flags}g`),matches=Array.from(text.matchAll(regex)).slice(0,100);out.textContent=matches.length?matches.map((match)=>`“${match[0]}” · posição ${match.index}`).join('\n'):'Nenhuma correspondência.';}catch(error){out.textContent=`Expressão inválida: ${error.message}`;}
});
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'&&text[i+1]==='"'){field+='"';i++;}else if(char==='"')quoted=false;else field+=char;}
    else if(char==='"')quoted=true;
    else if(char===','){row.push(field);field='';}
    else if(char==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(char!=='\r')field+=char;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  if(rows.length<2)throw new Error('Inclua uma linha de cabeçalho e pelo menos uma linha de dados.');
  const headers=rows.shift().map((value)=>value.trim());
  return rows.filter((values)=>values.some((value)=>value!=='')).map((values)=>Object.fromEntries(headers.map((key,index)=>[key,values[index]??''])));
}
function quoteCsv(value){const text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
document.querySelectorAll('[data-csv-action]').forEach((button)=>button.addEventListener('click',()=>{
  const input=document.querySelector('#csvJsonInput').value,out=document.querySelector('#csvJsonOutput');
  try{
    if(button.dataset.csvAction==='json')out.textContent=JSON.stringify(parseCsv(input),null,2);
    else{const rows=JSON.parse(input);if(!Array.isArray(rows)||!rows.every((row)=>row&&typeof row==='object'&&!Array.isArray(row)))throw new Error('Forneça uma lista JSON de objetos.');const headers=[...new Set(rows.flatMap((row)=>Object.keys(row)))];out.textContent=[headers.map(quoteCsv).join(','),...rows.map((row)=>headers.map((key)=>quoteCsv(row[key])).join(','))].join('\n');}
  }catch(error){out.textContent=`Não consegui converter: ${error.message}`;}
}));
document.querySelector('#markdownInput').addEventListener('input',(event)=>{
  const preview=document.querySelector('#markdownPreview');let safe=escapeHtml(event.target.value);
  safe=safe.replace(/^### (.+)$/gm,'<h4>$1</h4>').replace(/^## (.+)$/gm,'<h3>$1</h3>').replace(/^# (.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`(.+?)`/g,'<code>$1</code>');
  preview.innerHTML=safe.split(/\n{2,}/).map((block)=>/^<h[2-4]>/.test(block)?block:`<p>${block.replace(/\n/g,'<br>')}</p>`).join('');
});
const loremSentences=['Lorem ipsum dolor sit amet, consectetur adipiscing elit.','Vivamus vitae justo sed augue consequat blandit.','Integer posuere, erat a facilisis luctus, justo risus aliquet est, sed commodo sem mi ut erat.','Praesent feugiat magna ac sem tincidunt, vitae commodo dui varius.','Sed ut perspiciatis unde omnis iste natus error sit voluptatem.','Donec vel sapien at magna tincidunt consectetur.'];
document.querySelector('#makeLorem').addEventListener('click',()=>{const count=Math.max(1,Math.min(10,Number(document.querySelector('#loremCount').value)||1)),paragraphs=Array.from({length:count},(_,index)=>Array.from({length:3+index%3},()=>loremSentences[Math.floor(Math.random()*loremSentences.length)]).join(' '));document.querySelector('#loremOutput').value=paragraphs.join('\n\n');});
document.querySelector('#compareText').addEventListener('click',()=>{
  const left=document.querySelector('#diffTextA').value.split('\n'),right=document.querySelector('#diffTextB').value.split('\n'),out=[];
  for(let i=0;i<Math.max(left.length,right.length);i++){if(left[i]===right[i])out.push(`  ${left[i]??''}`);else{if(left[i]!==undefined)out.push(`− ${left[i]}`);if(right[i]!==undefined)out.push(`+ ${right[i]}`);}}
  document.querySelector('#diffOutput').textContent=out.join('\n');
});
document.querySelectorAll('[data-list-action]').forEach((button)=>button.addEventListener('click',()=>{
  const input=document.querySelector('#listInput').value.split(/\r?\n/).map((item)=>item.trim()).filter(Boolean);let result=input;
  if(button.dataset.listAction==='sort')result=input.sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  if(button.dataset.listAction==='unique')result=[...new Map(input.map((item)=>[item.toLocaleLowerCase('pt-BR'),item])).values()];
  if(button.dataset.listAction==='shuffle')for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  document.querySelector('#listOutput').value=result.join('\n');
}));
document.querySelector('#calculateStats').addEventListener('click',()=>{
  const raw=document.querySelector('#statsInput').value.trim(),values=raw.split(/[\s,;]+/).filter(Boolean).map(Number),out=document.querySelector('#statsOutput');
  if(!values.length||values.some((value)=>!Number.isFinite(value))){out.textContent='Digite uma lista de números válida.';return;}
  const sorted=[...values].sort((a,b)=>a-b),sum=values.reduce((total,value)=>total+value,0),middle=Math.floor(sorted.length/2),median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  const counts=new Map();values.forEach((value)=>counts.set(value,(counts.get(value)||0)+1));const maxCount=Math.max(...counts.values()),modes=[...counts].filter(([,count])=>count===maxCount).map(([value])=>value);
  out.textContent=`Quantidade: ${values.length} · Média: ${(sum/values.length).toLocaleString('pt-BR')} · Mediana: ${median.toLocaleString('pt-BR')} · Moda: ${maxCount===1?'sem repetição':modes.join(', ')}`;
});
document.querySelector('#calculatePercentChange').addEventListener('click',()=>{
  const oldValue=Number(document.querySelector('#percentOld').value),newValue=Number(document.querySelector('#percentNew').value),out=document.querySelector('#percentChangeOutput');
  if(!document.querySelector('#percentOld').value||!document.querySelector('#percentNew').value){out.textContent='Preencha os dois valores.';return;}
  if(oldValue===0){out.textContent=newValue===0?'Sem variação.':'Não há percentual definido quando o valor inicial é zero.';return;}
  const change=(newValue-oldValue)/Math.abs(oldValue)*100,direction=change>0?'aumento':change<0?'queda':'sem variação';out.textContent=`${Math.abs(change).toLocaleString('pt-BR',{maximumFractionDigits:4})}% de ${direction}.`;
});
document.querySelector('#analyzePrime').addEventListener('click',()=>{
  const value=Number(document.querySelector('#primeInput').value),out=document.querySelector('#primeOutput');
  if(!Number.isSafeInteger(value)||value<1||value>1e12){out.textContent='Digite um inteiro entre 1 e 1.000.000.000.000.';return;}
  if(value===1){out.textContent='1 não é primo e não tem fatoração prima.';return;}
  let remainder=value;const factors=[];for(let divisor=2;divisor<=Math.sqrt(remainder);divisor+=(divisor===2?1:2)){let power=0;while(remainder%divisor===0){remainder/=divisor;power++;}if(power)factors.push(power>1?`${divisor}^${power}`:String(divisor));}
  if(remainder>1)factors.push(String(remainder));out.textContent=`${factors.length===1&&factors[0]===String(value)?'É primo.':'Não é primo.'} Fatoração: ${factors.join(' × ')}.`;
});
document.querySelector('#calculateGcd').addEventListener('click',()=>{
  let a=Number(document.querySelector('#gcdA').value),b=Number(document.querySelector('#gcdB').value),out=document.querySelector('#gcdOutput');
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)){out.textContent='Digite dois números inteiros válidos.';return;}
  const originalA=a,originalB=b;a=Math.abs(a);b=Math.abs(b);while(b)[a,b]=[b,a%b];const gcd=a,lcm=gcd===0?0:Math.abs(originalA/gcd*originalB);out.textContent=`MDC: ${gcd.toLocaleString('pt-BR')} · MMC: ${lcm.toLocaleString('pt-BR')}`;
});
document.querySelector('#convertBase').addEventListener('click',()=>{
  const raw=document.querySelector('#baseValue').value.trim(),from=Number(document.querySelector('#baseFrom').value),to=Number(document.querySelector('#baseTo').value),out=document.querySelector('#baseOutput');
  const digits='0123456789abcdefghijklmnopqrstuvwxyz'.slice(0,from),valid=new RegExp(`^[+-]?[${digits}]+$`,'i');
  if(!valid.test(raw)){out.textContent='O valor não corresponde à base selecionada.';return;}
  const value=parseInt(raw,from);if(!Number.isSafeInteger(value)){out.textContent='Esse número ultrapassa a precisão segura do navegador.';return;}out.textContent=`${value.toString(to).toUpperCase()} (base ${to})`;
});
const romanValues=[['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
document.querySelectorAll('[data-roman-action]').forEach((button)=>button.addEventListener('click',()=>{
  const raw=document.querySelector('#romanInput').value.trim().toUpperCase(),out=document.querySelector('#romanOutput');
  if(button.dataset.romanAction==='toRoman'){
    let value=Number(raw);if(!Number.isInteger(value)||value<1||value>3999){out.textContent='Digite um inteiro entre 1 e 3999.';return;}
    let result='';for(const [symbol,n] of romanValues)while(value>=n){result+=symbol;value-=n;}out.textContent=result;
  }else{
    if(!/^[IVXLCDM]+$/.test(raw)){out.textContent='Digite um número romano válido.';return;}
    let total=0;for(let i=0;i<raw.length;i++){const current=romanValues.find(([symbol])=>symbol===raw[i])[1],next=romanValues.find(([symbol])=>symbol===raw[i+1])?.[1]||0;total+=current<next?-current:current;}
    let value=total,canonical='';for(const [symbol,n] of romanValues)while(value>=n){canonical+=symbol;value-=n;}out.textContent=canonical===raw?String(total):'Forma romana inválida.';
  }
}));
document.querySelector('#calculateSpeed').addEventListener('click',()=>{
  const ids=['speedDistance','speedRate','speedTime'],values=ids.map((id)=>document.querySelector(`#${id}`).value.trim()),missing=values.map((value,index)=>value===''?index:-1).filter((index)=>index>=0),nums=values.map(Number),out=document.querySelector('#speedOutput');
  if(missing.length!==1||nums.some((value,index)=>!values[index]?false:!Number.isFinite(value)||value<0)){out.textContent='Preencha exatamente dois valores positivos e deixe um em branco.';return;}
  const target=missing[0];if((target===0&&nums[2]===0)||(target===1&&nums[2]===0)||(target===2&&nums[1]===0)){out.textContent='Não é possível dividir por zero.';return;}
  const result=target===0?nums[1]*nums[2]:target===1?nums[0]/nums[2]:nums[0]/nums[1],labels=['Distância','Velocidade','Tempo'],units=['km','km/h','h'];document.querySelector(`#${ids[target]}`).value=String(result);out.textContent=`${labels[target]}: ${Number(result.toPrecision(8)).toLocaleString('pt-BR')} ${units[target]}.`;
});
function exactAge(birth,at){let years=at.getFullYear()-birth.getFullYear(),months=at.getMonth()-birth.getMonth(),days=at.getDate()-birth.getDate();if(days<0){months--;days+=new Date(at.getFullYear(),at.getMonth(),0).getDate();}if(months<0){years--;months+=12;}return {years,months,days};}
document.querySelector('#ageAtDate').value=todayISO(new Date());
document.querySelector('#calculateAge').addEventListener('click',()=>{
  const birthText=document.querySelector('#birthDate').value,atText=document.querySelector('#ageAtDate').value,out=document.querySelector('#ageOutput');if(!birthText||!atText){out.textContent='Preencha as duas datas.';return;}
  const birth=new Date(`${birthText}T00:00:00`),at=new Date(`${atText}T00:00:00`);if(at<birth){out.textContent='A data final precisa ser posterior ao nascimento.';return;}
  const age=exactAge(birth,at);out.textContent=`${age.years} anos, ${age.months} meses e ${age.days} dias.`;
});
document.querySelector('#timestampToDate').addEventListener('click',()=>{
  const seconds=Number(document.querySelector('#timestampInput').value),out=document.querySelector('#timestampDateOutput');if(!Number.isFinite(seconds)){out.textContent='Digite um timestamp válido em segundos.';return;}
  const date=new Date(seconds*1000);out.textContent=Number.isNaN(date.getTime())?'Timestamp fora do intervalo.':`${date.toISOString()} · ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeStyle:'long'}).format(date)}`;
});
document.querySelector('#dateToTimestamp').addEventListener('click',()=>{
  const value=document.querySelector('#timestampDate').value,out=document.querySelector('#dateTimestampOutput');if(!value){out.textContent='Escolha uma data e hora.';return;}const date=new Date(value);out.textContent=`${Math.floor(date.getTime()/1000)} segundos · ${date.toISOString()}`;
});
const timezoneOptions=[['America/Sao_Paulo','São Paulo'],['America/New_York','Nova York'],['America/Los_Angeles','Los Angeles'],['Europe/London','Londres'],['Europe/Lisbon','Lisboa'],['Europe/Paris','Paris'],['Asia/Tokyo','Tóquio'],['Asia/Dubai','Dubai'],['Asia/Singapore','Singapura'],['Australia/Sydney','Sydney']];
for(const id of ['timezoneFrom','timezoneTo']){const select=document.querySelector(`#${id}`);timezoneOptions.forEach(([zone,label])=>select.add(new Option(`${label} · ${zone}`,zone)));}
document.querySelector('#timezoneFrom').value='America/Sao_Paulo';document.querySelector('#timezoneTo').value='Europe/London';
const localDateTimeValue=(date)=>`${todayISO(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
document.querySelector('#timezoneInput').value=localDateTimeValue(new Date());
function localTimeInZoneToDate(value,zone){
  const [datePart,timePart]=value.split('T'),[year,month,day]=datePart.split('-').map(Number),[hour,minute]=timePart.split(':').map(Number),desired=Date.UTC(year,month-1,day,hour,minute);let guess=desired;
  for(let i=0;i<3;i++){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    const values=Object.fromEntries(parts.filter((part)=>part.type!=='literal').map((part)=>[part.type,Number(part.value)]));
    const represented=Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute);guess+=desired-represented;
  }
  return new Date(guess);
}
document.querySelector('#convertTimezone').addEventListener('click',()=>{
  const value=document.querySelector('#timezoneInput').value,from=document.querySelector('#timezoneFrom').value,to=document.querySelector('#timezoneTo').value,out=document.querySelector('#timezoneOutput');if(!value){out.textContent='Escolha uma data e hora de origem.';return;}
  try{const instant=localTimeInZoneToDate(value,from),formatted=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeStyle:'short',timeZone:to}).format(instant),source=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:from}).format(instant);out.textContent=`${source} em ${timezoneOptions.find(([zone])=>zone===from)[1]} corresponde a ${formatted} em ${timezoneOptions.find(([zone])=>zone===to)[1]}.`;}catch{out.textContent='Não consegui converter estes fusos horários.';}
});
const worldCities=[['São Paulo','America/Sao_Paulo'],['Nova York','America/New_York'],['Londres','Europe/London'],['Lisboa','Europe/Lisbon'],['Tóquio','Asia/Tokyo'],['Sydney','Australia/Sydney']];
const worldClockGrid=document.querySelector('#worldClockGrid');
worldCities.forEach(([city,zone])=>{const card=document.createElement('article');card.className='world-clock';card.dataset.timezone=zone;const name=document.createElement('span');name.textContent=city.toLocaleUpperCase('pt-BR');const time=document.createElement('strong');const date=document.createElement('small');card.append(name,time,date);worldClockGrid.append(card);});
function updateWorldClocks(){worldClockGrid.querySelectorAll('.world-clock').forEach((card)=>{const now=new Date(),zone=card.dataset.timezone;card.querySelector('strong').textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:zone}).format(now);card.querySelector('small').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'short',timeZone:zone}).format(now);});}
let calendarCursor=new Date(),calendarChosen=new Date();
function renderCalendar(){
  const grid=document.querySelector('#calendarGrid'),year=calendarCursor.getFullYear(),month=calendarCursor.getMonth();
  document.querySelector('#calendarMonth').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(calendarCursor);
  grid.replaceChildren();['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].forEach((day)=>{const label=document.createElement('span');label.className='weekday';label.textContent=day;grid.append(label);});
  const offset=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
  for(let i=0;i<offset;i++){const blank=document.createElement('span');grid.append(blank);}
  const today=new Date();
  for(let day=1;day<=days;day++){
    const button=document.createElement('button');button.type='button';button.className='calendar-day';button.textContent=String(day);
    if(year===today.getFullYear()&&month===today.getMonth()&&day===today.getDate())button.classList.add('today');
    if(year===calendarChosen.getFullYear()&&month===calendarChosen.getMonth()&&day===calendarChosen.getDate())button.classList.add('selected');
    button.addEventListener('click',()=>{calendarChosen=new Date(year,month,day);renderCalendar();document.querySelector('#calendarSelection').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(calendarChosen);});grid.append(button);
  }
}
document.querySelector('#calendarPrev').addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();});
document.querySelector('#calendarNext').addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();});
const todayISO=(date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const nowDate=new Date(),tomorrowDate=new Date();tomorrowDate.setDate(tomorrowDate.getDate()+1);
document.querySelector('#dateStart').value=todayISO(nowDate);document.querySelector('#dateEnd').value=todayISO(tomorrowDate);
document.querySelector('#calculateDateDiff').addEventListener('click',()=>{
  const start=document.querySelector('#dateStart').value,end=document.querySelector('#dateEnd').value;if(!start||!end)return;
  const a=Date.parse(`${start}T00:00:00Z`),b=Date.parse(`${end}T00:00:00Z`),days=Math.abs(Math.round((b-a)/86400000));
  const result=`${days} ${days===1?'dia':'dias'} entre as datas.`;document.querySelector('#dateDiffResult').textContent=result;say(result);
});
const unitDefinitions={
  length:[['km','Quilômetros',1000],['m','Metros',1],['cm','Centímetros',.01],['mi','Milhas',1609.344],['ft','Pés',.3048],['in','Polegadas',.0254]],
  mass:[['kg','Quilogramas',1],['g','Gramas',.001],['lb','Libras',.45359237],['oz','Onças',.0283495]],
  volume:[['l','Litros',1],['ml','Mililitros',.001],['gal','Galões (EUA)',3.785411784]],
  temperature:[['c','Celsius'],['f','Fahrenheit']]
};
function fillUnitChoices(){
  const category=document.querySelector('#unitCategory').value,from=document.querySelector('#unitFrom'),to=document.querySelector('#unitTo'),units=unitDefinitions[category];
  from.replaceChildren();to.replaceChildren();units.forEach(([value,label])=>{const a=new Option(label,value),b=new Option(label,value);from.add(a);to.add(b);});
  from.value=units[0][0];to.value=units[1][0];
}
document.querySelector('#unitCategory').addEventListener('change',fillUnitChoices);fillUnitChoices();
document.querySelector('#convertUnitButton').addEventListener('click',()=>{
  const value=Number(document.querySelector('#unitAmount').value),category=document.querySelector('#unitCategory').value,from=document.querySelector('#unitFrom').value,to=document.querySelector('#unitTo').value;
  if(!Number.isFinite(value))return;
  let result;
  if(category==='temperature')result=from==='c'?(value*9/5+32):(value-32)*5/9;
  else{const baseFrom=unitDefinitions[category].find((unit)=>unit[0]===from)[2],baseTo=unitDefinitions[category].find((unit)=>unit[0]===to)[2];result=value*baseFrom/baseTo;}
  const answer=`${value.toLocaleString('pt-BR')} ${from} = ${Number(result.toPrecision(8)).toLocaleString('pt-BR')} ${to}.`;
  document.querySelector('#unitResult').textContent=answer;say(answer);
});
function secureRandomIndex(max){const range=0x100000000,limit=Math.floor(range/max)*max,buffer=new Uint32Array(1);do{crypto.getRandomValues(buffer);}while(buffer[0]>=limit);return buffer[0]%max;}
document.querySelector('#generatePassword').addEventListener('click',()=>{
  const length=Number(document.querySelector('#passwordLength').value),groups=[];
  if(length<8||length>64){say('Escolha um tamanho entre 8 e 64 caracteres.');return;}
  if(document.querySelector('#passUpper').checked)groups.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
  if(document.querySelector('#passLower').checked)groups.push('abcdefghijkmnpqrstuvwxyz');
  if(document.querySelector('#passNumbers').checked)groups.push('23456789');
  if(document.querySelector('#passSymbols').checked)groups.push('!@#$%&*+-=?');
  if(!groups.length){say('Selecione pelo menos um tipo de caractere.');return;}
  const chars=groups.map((group)=>group[secureRandomIndex(group.length)]),all=groups.join('');
  while(chars.length<length)chars.push(all[secureRandomIndex(all.length)]);
  for(let i=chars.length-1;i>0;i--){const j=secureRandomIndex(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
  const password=chars.join('');document.querySelector('#passwordResult').value=password;say('Gerei uma senha segura no seu navegador.');
});
async function copyToolText(value){try{await navigator.clipboard.writeText(value);status.textContent='COPIADO';setTimeout(()=>{if(status.textContent==='COPIADO')status.textContent='PRONTO';},1600);}catch{say('Não consegui copiar automaticamente neste navegador.');}}
document.querySelector('#copyPassword').addEventListener('click',()=>copyToolText(document.querySelector('#passwordResult').value));
const textWorkbench=document.querySelector('#textWorkbench');
function updateTextStats(){const text=textWorkbench.value,words=text.trim()?text.trim().split(/\s+/u).length:0;document.querySelector('#textStats').textContent=`${words} palavras · ${text.length} caracteres · ${text.replace(/\s/g,'').length} sem espaços`;}
textWorkbench.addEventListener('input',updateTextStats);
document.querySelectorAll('[data-text-action]').forEach((button)=>button.addEventListener('click',()=>{
  const text=textWorkbench.value,action=button.dataset.textAction;
  if(action==='upper')textWorkbench.value=text.toLocaleUpperCase('pt-BR');
  if(action==='lower')textWorkbench.value=text.toLocaleLowerCase('pt-BR');
  if(action==='title')textWorkbench.value=text.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/gu,(letter)=>letter.toLocaleUpperCase('pt-BR'));
  if(action==='reverse')textWorkbench.value=Array.from(text).reverse().join('');
  if(action==='copy')return copyToolText(text);
  updateTextStats();
}));
function updateColor(){
  const hex=document.querySelector('#colorPicker').value.toUpperCase(),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  const rn=r/255,gn=g/255,bn=b/255,max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),delta=max-min;let h=0,s=0,l=(max+min)/2;
  if(delta){s=delta/(1-Math.abs(2*l-1));if(max===rn)h=60*(((gn-bn)/delta)%6);else if(max===gn)h=60*((bn-rn)/delta+2);else h=60*((rn-gn)/delta+4);}
  if(h<0)h+=360;document.querySelector('#colorHex').textContent=hex;document.querySelector('#colorRgb').textContent=`RGB(${r}, ${g}, ${b})`;document.querySelector('#colorHsl').textContent=`HSL(${Math.round(h)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`;document.querySelector('#colorSwatch').style.backgroundColor=hex;
}
document.querySelector('#colorPicker').addEventListener('input',updateColor);updateColor();
document.querySelector('#formatJson').addEventListener('click',()=>{
  try{document.querySelector('#jsonOutput').textContent=JSON.stringify(JSON.parse(document.querySelector('#jsonInput').value),null,2);}catch(error){document.querySelector('#jsonOutput').textContent=`JSON inválido: ${error.message}`;}
});
document.querySelector('#minifyJson').addEventListener('click',()=>{
  try{document.querySelector('#jsonOutput').textContent=JSON.stringify(JSON.parse(document.querySelector('#jsonInput').value));}catch(error){document.querySelector('#jsonOutput').textContent=`JSON inválido: ${error.message}`;}
});
document.querySelector('#splitBill').addEventListener('click',()=>{
  const amount=Number(document.querySelector('#billAmount').value),tip=Number(document.querySelector('#billTip').value),people=Number(document.querySelector('#billPeople').value);
  if(amount<0||tip<0||people<1||!Number.isInteger(people))return say('Confira o total, a gorjeta e a quantidade de pessoas.');
  const total=amount*(1+tip/100),each=total/people,fmt=(value)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  const answer=`Total com gorjeta: ${fmt(total)}. Cada pessoa paga ${fmt(each)}.`;document.querySelector('#billResult').textContent=answer;say(answer);
});
function createUuid(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,(byte)=>byte.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
document.querySelector('#generateUuid').addEventListener('click',()=>{const value=createUuid();document.querySelector('#uuidResult').value=value;say('Identificador UUID criado.');});
document.querySelector('#copyUuid').addEventListener('click',()=>copyToolText(document.querySelector('#uuidResult').value));
document.querySelector('#timerStart').addEventListener('click', () => { startTimer(300); say('Temporizador de 5 minutos iniciado.'); });
document.querySelector('#timerPause').addEventListener('click', () => { say(pauseTimer() ? 'Temporizador pausado.' : 'Não há um temporizador em andamento.'); });
document.querySelector('#timerReset').addEventListener('click', () => { resetTimer(); say('Temporizador reiniciado para 5 minutos.'); });
document.querySelector('#stopwatchStart').addEventListener('click',()=>runCommand(stopwatchInterval?'pausar cronometro':'iniciar cronometro'));
document.querySelector('#stopwatchLap').addEventListener('click',()=>runCommand('marcar volta'));
document.querySelector('#stopwatchReset').addEventListener('click',()=>runCommand('zerar cronometro'));
renderStopwatch();
document.querySelector('#convertCurrencyButton').addEventListener('click',()=>{
  const amount=document.querySelector('#currencyAmount').value,from=document.querySelector('#currencyFrom').value,to=document.querySelector('#currencyTo').value;
  runCommand(`converter ${amount} ${from} para ${to}`);
});
document.querySelector('#swapCurrencies').addEventListener('click',()=>{
  const from=document.querySelector('#currencyFrom'),to=document.querySelector('#currencyTo'),current=from.value;from.value=to.value;to.value=current;
});
renderTimer();
document.querySelector('#clearChat').addEventListener('click', () => {
  researchRun++; window.speechSynthesis?.cancel(); conversation.replaceChildren(); source.replaceChildren(); source.classList.add('hidden');
  lastSearchTopic=''; awaitingWeatherCity=false; lastAssistantText=''; lastDateOffset=null;
  const welcome = document.createElement('div'); welcome.className='welcome-message';
  const avatar=document.createElement('span'); avatar.className='message-avatar'; avatar.textContent='J';
  const content=document.createElement('div'); content.className='message-content';
  const name=document.createElement('b'); name.textContent='J.A.R.V.I.S.';
  const message=document.createElement('p'); message.textContent='Conversa limpa. Estou pronto para ajudar.';
  const time=document.createElement('small'); time.textContent='AGORA'; content.append(name,message,time); welcome.append(avatar,content); conversation.append(welcome);
  say('Conversa limpa. Estou pronto para ajudar.');
});
document.querySelector('#copyReply').addEventListener('click', async () => {
  if (!lastAssistantText) return;
  try { await navigator.clipboard.writeText(lastAssistantText); status.textContent='COPIADO'; setTimeout(()=>{if(status.textContent==='COPIADO')status.textContent='PRONTO';},1800); }
  catch { status.textContent='CÓPIA INDISPONÍVEL'; setTimeout(()=>{if(status.textContent==='CÓPIA INDISPONÍVEL')status.textContent='PRONTO';},1800); }
});
function updateClock() {
  const now = new Date();
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
  document.querySelector('#today').textContent = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(now).toLocaleUpperCase('pt-BR');
  updateWorldClocks();
}
updateClock(); setInterval(updateClock,1000);
if (!Recognition) {
  status.textContent='MODO TEXTO'; button.disabled=true; label.textContent='VOZ INDISPONÍVEL NESTE NAVEGADOR';
} else {
  recognition = new Recognition(); recognition.lang='pt-BR'; recognition.interimResults=true; recognition.continuous=false;
  recognition.onstart=()=>setListening(true);
  recognition.onend=()=>{setListening(false);};
  recognition.onerror=(event)=>{setListening(false); say(event.error==='not-allowed'?'O microfone está bloqueado. Permita o acesso ao microfone nas configurações do navegador.':'Não consegui ouvir. Confira o microfone e tente novamente.');};
  recognition.onresult=(event)=>{
    let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const text=event.results[i][0].transcript;
      if(event.results[i].isFinal){heard.textContent=`Você disse: “${text}”`; runCommand(text);} else interim+=text;
    }
    if(interim) heard.textContent=`Ouvindo: “${interim}”`;
  };
  button.addEventListener('click',()=>{ if(button.classList.contains('listening')) recognition.stop(); else { try { recognition.start(); } catch {} } });
}


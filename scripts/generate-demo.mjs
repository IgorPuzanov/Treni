import {writeFile} from 'node:fs/promises';
import {browser} from './cdp.mjs';

const drawing = async historical => {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  const line = (from,to,color,width) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.moveTo(...from);
    ctx.lineTo(...to);
    ctx.stroke();
  };
  function paint(t) {
    ctx.fillStyle='#0d1d1c';
    ctx.fillRect(0,0,960,600);
    ctx.fillStyle='#132b29';
    ctx.fillRect(35,34,890,525);
    for (let x=55;x<920;x+=36) line([x,130],[x,504],'#1a3531',1);
    for (let y=144;y<520;y+=36) line([48,y],[910,y],'#1a3531',1);
    ctx.fillStyle='#e3f4ec';
    ctx.font='600 32px system-ui';
    ctx.fillText('Отведение бедра',64,91);
    ctx.font='16px system-ui';
    ctx.fillStyle='#a8c6bd';
    ctx.fillText('Синтетический ролик для теста воспроизведения и разметки',65,121);
    ctx.fillText(historical?'История · неделя 11':'Демо · неделя 13',65,537);
    const theta = (historical?.42:.62) * (.5-.5*Math.cos(t*Math.PI));
    const hip = [480,310], knee=[480+Math.sin(theta)*90,310+Math.cos(theta)*90];
    const ankle=[480+Math.sin(theta)*166,310+Math.cos(theta)*166];
    line([250,497],[730,497],'#54796e',3);
    line([395,185],[395,497],'#578277',9);
    line([395,185],[435,185],'#578277',9);
    line([395,245],[465,201],'#acc9bf',14);
    line([465,201],hip,'#acc9bf',23);
    line(hip,[456,398],'#88aaa0',19);
    line([456,398],[448,476],'#88aaa0',17);
    line([448,477],[433,484],'#88aaa0',14);
    line(hip,knee,'#44d6b6',22);
    line(knee,ankle,'#44d6b6',18);
    line(ankle,[ankle[0]+18,ankle[1]+6],'#44d6b6',15);
    ctx.fillStyle='#c3dbd2';
    ctx.beginPath();
    ctx.arc(465,169,24,0,Math.PI*2);
    ctx.fill();
    for (const [x,y] of [hip,knee,ankle]) {
      ctx.beginPath();
      ctx.fillStyle='#effff8';
      ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fill();
    }
    line([701,529],[887,529],'#31534b',3);
    line([701,529],[701+186*Math.max(.02,t/4),529],'#44d6b6',3);
  }
  paint(.7);
  const poster = canvas.toDataURL('image/png').split(',')[1];
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:780000});
  const chunks=[];
  recorder.ondataavailable=event=>chunks.push(event.data);
  const stopped = new Promise(resolve=>recorder.onstop=resolve);
  const start = performance.now();
  recorder.start();
  await new Promise(resolve=>{
    function step() {
      const time=(performance.now()-start)/1000;
      paint(Math.min(time,4));
      if (time<4) requestAnimationFrame(step);
      else resolve();
    }
    step();
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach(track=>track.stop());
  const file = await new Promise(resolve=>{
    const reader = new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
  });
  return {poster,file};
};
const b = await browser();
try {
  for (const historical of [false,true]) {
    const data = await b.run('('+drawing.toString()+')('+historical+')');
    await writeFile(new URL(historical?'../public/demo-history.webm':'../public/demo.webm',import.meta.url),Buffer.from(data.file,'base64'));
    await writeFile(new URL(historical?'../public/demo-history.png':'../public/demo-poster.png',import.meta.url),Buffer.from(data.poster,'base64'));
  }
} finally { b.close(); }

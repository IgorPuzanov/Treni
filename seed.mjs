export const DEMO={id:'DEMO-GLUTE-01',name:'Отведение бедра на среднюю ягодичную',category:'Ягодицы',subcategory:'Средняя ягодичная',equipment:'Тренажёр / кроссовер'};
const clone=x=>JSON.parse(JSON.stringify(x)),emptyWeek=()=>({T1:[],T2:[],T3:[],comments:{T1:'',T2:'',T3:''}});
const original = {
  "clients": [
    {
      "id": "alex",
      "name": "Александра Козлова",
      "birth": "14.08.1998",
      "sex": "Женский",
      "height": "167",
      "weight": "58.4",
      "goal": "Укрепить мышцы, улучшить форму и повысить выносливость.",
      "limits": "Иногда чувствую дискомфорт в колене. Избегать резкой ударной нагрузки.",
      "experience": "Занималась в зале около года, был перерыв.",
      "notes": "Предпочитает понятные инструкции и постепенное увеличение нагрузки."
    }
  ],
  "program": {
    "name": "Силовая программа — 8 недель",
    "desc": "Постепенное развитие силы и выносливости с контролем техники и восстановления.",
    "wish": "Акцент на ягодицы и корпус, умеренная интенсивность. Следить за самочувствием колена.",
    "weekCount": 3,
    "weeks": {
      "1": {
        "T1": [
          {
            "uid": "a1",
            "exid": "TM-0001",
            "name": "Румынская тяга (с упором бёдрами)",
            "cat": "Ноги",
            "sets": [
              {
                "w": "40",
                "r": "10",
                "rest": 90
              },
              {
                "w": "40",
                "r": "10",
                "rest": 90
              },
              {
                "w": "40",
                "r": "10",
                "rest": 90
              }
            ]
          },
          {
            "uid": "a2",
            "exid": "TM-0037",
            "name": "Жим платформы горизонтальный широкая постановка",
            "cat": "Ноги",
            "sets": [
              {
                "w": "70",
                "r": "12",
                "rest": 90
              },
              {
                "w": "70",
                "r": "12",
                "rest": 90
              },
              {
                "w": "70",
                "r": "12",
                "rest": 90
              }
            ]
          }
        ],
        "T2": [
          {
            "uid": "a3",
            "exid": "TM-0007",
            "name": "Кикбэк с упором на скамью (акцент на среднюю ягодичную)",
            "cat": "Ноги",
            "sets": [
              {
                "w": "15",
                "r": "12",
                "rest": 60
              },
              {
                "w": "15",
                "r": "12",
                "rest": 60
              },
              {
                "w": "15",
                "r": "12",
                "rest": 60
              }
            ]
          }
        ],
        "T3": [
          {
            "uid": "a4",
            "exid": "TM-0023",
            "name": "Горизонтальная тяга нейтральным хватом с мягкими рукоятками (акцент на широчайшие)",
            "cat": "Спина",
            "sets": [
              {
                "w": "35",
                "r": "12",
                "rest": 90
              },
              {
                "w": "35",
                "r": "12",
                "rest": 90
              }
            ]
          }
        ],
        "comments": {
          "T1": "",
          "T2": "Контроль амплитуды.",
          "T3": ""
        }
      },
      "2": {
        "T1": [],
        "T2": [],
        "T3": [],
        "comments": {
          "T1": "",
          "T2": "",
          "T3": ""
        }
      },
      "3": {
        "T1": [],
        "T2": [],
        "T3": [],
        "comments": {
          "T1": "",
          "T2": "",
          "T3": ""
        }
      }
    }
  },
  "submission": {
    "comment": "Самочувствие хорошее. В последнем подходе было тяжело, но технику сохранила.",
    "sets": [
      {
        "pw": "45",
        "pr": "12",
        "fw": "45",
        "fr": "12",
        "done": true
      },
      {
        "pw": "45",
        "pr": "12",
        "fw": "45",
        "fr": "12",
        "done": true
      },
      {
        "pw": "45",
        "pr": "12",
        "fw": "45",
        "fr": "11",
        "done": true
      }
    ]
  },
  "review": {
    "comments": [
      {
        "week": 11,
        "date": "10 нояб.",
        "text": "Голову нейтрально, корпус стабильнее. Амплитуду чуть увеличить, в верхней точке на 1–2 сек. зафиксировать."
      },
      {
        "week": 10,
        "date": "30 сент.",
        "text": "Уже лучше: корпус меньше гуляет, движение более контролируемое. Продолжай работать над амплитудой."
      },
      {
        "week": 9,
        "date": "15 авг.",
        "text": "Чувствовалась компенсация поясницей, корпус уходил вперёд. Рекомендую снизить вес и сфокусироваться на стабильности таза."
      }
    ]
  }
};

export function initialState() {
  const {clients,program,submission,review} = clone(original);
  program.name = 'Силовая программа';
  clients[0].activity = 'Зал и прогулки';
  clients[0].schedule = 'Три раза в неделю';
  clients[0].status = 'active';
  clients.push({
    id:'max',name:'Максим Орлов',birth:'03.06.1993',sex:'Мужской',height:'180',weight:'77',
    goal:'Вернуться к регулярным тренировкам после перерыва и укрепить мышцы корпуса.',
    limits:'Начать с умеренной нагрузки и отслеживать самочувствие.',experience:'Два года самостоятельных тренировок.',
    activity:'Плавание',schedule:'Вторник и суббота',notes:'Предпочитает две тренировки в неделю.',status:'active'
  });
  const dates = ['2026-10-27','2026-11-03','2026-11-10','2026-11-17','2026-11-24'];
  const weeks = [9,10,11,12,13];
  const base = {clientId:'alex',blockId:'demo',blockName:'Демо-блок',training:'T2',comment:'Контроль амплитуды и стабильности корпуса.',demo:true};
  const demos = weeks.map((week,i) => {
    const past = i < 4;
    const media = i === 2 ? {name:'Синтетический ролик недели 11',url:'/demo-history.webm',poster:'/demo-history.png',duration:4} :
      i === 4 ? {name:'Синтетический ролик недели 13',url:'/demo.webm',poster:'/demo-poster.png',duration:4} : null;
    return {
      ...base,id:i === 4 ? 'demo-review' : 'demo-week-'+week, week,date:dates[i],status:past?'reviewed':'submitted',
      exercises:[{
        id:'demo-ex-'+week,catalogId:DEMO.id,name:DEMO.name,category:DEMO.category,protocol:'1',
        comment:submission.comment,media,
        sets:submission.sets.map((set,j)=>({
          plan_weight:set.pw,plan_reps:set.pr,actual_weight:i<2?'42.5':'45',
          actual_reps:j===2 && i!==3?'11':'12',done:true,rest:90,added_by_client:false
        })),
        feedback:past?{text:review.comments.find(item=>item.week===week)?.text||'Контроль амплитуды в каждом повторении.',adjust:'Оставить',kg:'',frames:[],date:dates[i]}:null
      }]
    };
  });
  const run = clone(demos.at(-1));
  run.id = 'demo-run';
  run.status = 'progress';
  run.exercises[0].comment = '';
  run.exercises[0].media = null;
  run.exercises[0].sets.forEach(set => Object.assign(set,{actual_weight:'',actual_reps:'',done:false}));
  return {clients,clientId:'alex',program,blocks:[],sessions:[...demos,run],ownExercises:[],notifications:[]};
}

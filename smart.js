// === Утилиты ===
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];
const ls = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  remove: (k) => localStorage.removeItem(k)
};
const fmtDate = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(dt.getDate())}.${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};
const diffMins = (a,b) => Math.round((a - b)/60000);
const toast = (msg) => { const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2200); };

// === Состояние ===
let user = ls.get("ss_user", null);
let tasks = ls.get("ss_tasks", []);
let schedule = ls.get("ss_schedule", null);

const DAY_NAMES = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];

// === Пример расписания ===
const defaultSchedule = [
  { name:"Понедельник", lessons:[
    { time:"08:00", title:"Математический анализ", room:"205", teacher:"проф. Иванов И.И." },
    { time:"09:40", title:"Программирование", room:"312", teacher:"доц. Ким А.Н." },
    { time:"11:30", title:"Английский язык", room:"401", teacher:"преп. Браун Е.В." }
  ]},
  { name:"Вторник", lessons:[
    { time:"08:00", title:"Физика", room:"208", teacher:"доц. Сидоров С.С." },
    { time:"09:40", title:"Алгоритмы", room:"105", teacher:"асс. Петров В.Н." }
  ]},
  { name:"Среда", lessons:[
    { time:"09:40", title:"Информатика", room:"Онлайн", teacher:"преп. Джонсон М.А." }
  ]}
];

// === Приветствие / вход ===
const loginModal = $("#loginModal");
const greeting = $("#greeting");
const userNameInput = $("#userNameInput");
$("#saveUserBtn").addEventListener("click", ()=>{
  const val = userNameInput.value.trim();
  if(!val) return toast("Введите имя");
  user = { name: val };
  ls.set("ss_user", user);
  greeting.textContent = `Привет, ${user.name}!`;
  loginModal.classList.remove("show");
});
if(!user){ loginModal.classList.add("show"); } else { greeting.textContent = `Привет, ${user.name}!`; }

// === Вкладки ===
$$(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".tab").forEach(b=>b.classList.remove("active"));
    $$(".tab-panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    $("#"+btn.dataset.tab).classList.add("active");
    updateStats();
  });
});

// === Расписание ===
if(!schedule){ schedule = defaultSchedule; ls.set("ss_schedule", schedule); }
const weekGrid = $("#weekGrid");

const renderSchedule = ()=>{
  weekGrid.innerHTML = "";
  schedule.forEach((day, dayIdx)=>{
    const card = document.createElement("div");
    card.className = "day-card";
    const h = document.createElement("h3"); h.textContent = day.name; card.appendChild(h);
    day.lessons.forEach((l,i)=>{
      const row = document.createElement("div");
      row.className = "lesson";
      row.innerHTML = `
        <div class="info">
          <div class="time">${l.time}</div>
          <div class="title">${l.title} <span class="muted">(${l.room})</span></div>
          <div class="muted">${l.teacher || ""}</div>
        </div>
        <button class="remove">Удалить</button>
      `;
      row.querySelector(".remove").addEventListener("click", ()=>{
        schedule[dayIdx].lessons.splice(i,1);
        ls.set("ss_schedule", schedule);
        renderSchedule();
      });
      card.appendChild(row);
    });
    weekGrid.appendChild(card);
  });
};
renderSchedule();

// === Добавление пары вручную ===
const lessonModal = $("#lessonModal");
$("#addLessonBtn").addEventListener("click", ()=>lessonModal.classList.add("show"));
$("#cancelLessonBtn").addEventListener("click", ()=>lessonModal.classList.remove("show"));
$("#saveLessonBtn").addEventListener("click", ()=>{
  const day = +$("#lessonDay").value;
  const time = $("#lessonTime").value || "08:00";
  const title = $("#lessonTitle").value.trim();
  if(!title) return toast("Введите предмет, аудиторию и преподавателя");
  while(schedule.length <= day){ schedule.push({ name:DAY_NAMES[schedule.length] || `День ${schedule.length+1}`, lessons:[] }); }
  if(!schedule[day]) schedule[day] = { name: DAY_NAMES[day], lessons: [] };
  schedule[day].lessons.push({ time, title, room:"", teacher:"" });
  ls.set("ss_schedule", schedule);
  $("#lessonTitle").value = "";
  lessonModal.classList.remove("show");
  renderSchedule();
  toast("Пара добавлена");
});

// === Импорт расписания из Excel (обновлённый, универсальный) ===
$("#excelInput").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const byDay = {};
    rows.forEach(r => {
      // нормализуем ключи (убираем пробелы, делаем нижний регистр)
      const norm = Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v])
      );

      // ищем подходящие названия колонок
      const day = norm["день"] || norm["день недели"] || norm["day"] || norm["weekday"];
      const time = norm["время"] || norm["время пары"] || norm["начало"] || norm["time"];
      const title = norm["предмет"] || norm["дисциплина"] || norm["курс"] || norm["название"];
      const room = norm["аудитория"] || norm["каб."] || norm["кабинет"] || norm["room"];
      const teacher = norm["преподаватель"] || norm["лектор"] || norm["учитель"] || norm["teacher"];

      if(!day || !title) return;
      if(!byDay[day]) byDay[day] = [];
      byDay[day].push({
        time: time || "—",
        title,
        room: room || "—",
        teacher: teacher || ""
      });
    });

    schedule = Object.keys(byDay).map(d => ({ name:d, lessons:byDay[d] }));
    ls.set("ss_schedule", schedule);
    renderSchedule();
    toast("📘 Расписание импортировано из Excel (автораспознавание)");
  } catch (err) {
    console.error(err);
    toast("Ошибка при чтении файла Excel");
  }
});

// === Задачи ===
const taskForm = $("#taskForm");
const taskList = $("#taskList");

const sortTasks = (a,b)=>{
  const pr = {high:0,medium:1,low:2};
  if(a.done !== b.done) return a.done - b.done;
  const d = new Date(a.dueISO) - new Date(b.dueISO);
  if(d !== 0) return d;
  return pr[a.prio] - pr[b.prio];
};

const renderTasks = ()=>{
  tasks.sort(sortTasks);
  taskList.innerHTML = "";
  const now = new Date();
  tasks.forEach(t=>{
    const due = new Date(t.dueISO);
    const overdue = (due < now) && !t.done;
    const minsLeft = diffMins(due, now);
    const soon = minsLeft <= 60 && minsLeft >= 0 && !t.done;

    const item = document.createElement("div");
    item.className = `task ${t.done?'done':''} ${t.prio} ${overdue?'overdue':(soon?'due-soon':'')}`;
    item.innerHTML = `
      <input type="checkbox" ${t.done?'checked':''}>
      <div class="content">
        <div class="title">${t.text}</div>
        <div class="meta">
          <span class="tag prio-${t.prio}">${t.prio}</span>
          <span class="due">дедлайн: ${fmtDate(due)}</span>
        </div>
      </div>
      <div class="controls">
        <button class="del">🗑️</button>
      </div>
    `;
    item.querySelector("input").addEventListener("change", e=>{
      t.done = e.target.checked; saveTasks(); renderTasks(); updateStats();
    });
    item.querySelector(".del").addEventListener("click", ()=>{
      tasks = tasks.filter(x=>x.id!==t.id);
      saveTasks(); renderTasks(); updateStats();
    });
    taskList.appendChild(item);
  });
};
const saveTasks = ()=>ls.set("ss_tasks", tasks);

taskForm.addEventListener("submit",(e)=>{
  e.preventDefault();
  const text = $("#taskText").value.trim();
  const due = $("#taskDue").value;
  const prio = $("#taskPrio").value;
  if(!text || !due) return toast("Заполни задачу и дедлайн");
  const id = Date.now();
  tasks.push({ id, text, dueISO: due, prio, done:false });
  saveTasks();
  taskForm.reset();
  renderTasks(); updateStats();
  toast("Задача добавлена");
});

// === Статистика ===
const updateStats = ()=>{
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const rate = total ? Math.round(done/total*100) : 0;
  $("#kpiTotal").textContent = total;
  $("#kpiDone").textContent = done;
  $("#kpiRate").textContent = rate + "%";

  const open = tasks.filter(t=>!t.done).sort((a,b)=>new Date(a.dueISO)-new Date(b.dueISO));
  if(open.length){
    const next = open[0];
    $("#kpiNext").textContent = `${fmtDate(next.dueISO)} • ${next.text}`;
  } else $("#kpiNext").textContent = "—";

  const soon = open.filter(t => (new Date(t.dueISO)-new Date()) <= 48*60*60*1000);
  const hot = $("#hotList");
  hot.innerHTML = "";
  soon.forEach(t=>{
    const div = document.createElement("div");
    div.className = `task ${t.prio}`;
    div.innerHTML = `<div></div><div class="content"><div class="title">${t.text}</div><div class="meta"><span class="due">до ${fmtDate(t.dueISO)}</span></div></div>`;
    hot.appendChild(div);
  });
};

// === Уведомления ===
$("#requestNotifBtn").addEventListener("click", async ()=>{
  try {
    const perm = await Notification.requestPermission();
    toast(perm === "granted" ? "Уведомления включены" : "Отклонено");
  } catch { toast("Ошибка уведомлений"); }
});
setInterval(()=>{
  const now = new Date();
  tasks.forEach(t=>{
    if(t.done || t.notified) return;
    const due = new Date(t.dueISO);
    const mins = diffMins(due, now);
    if(mins <= 60 && mins >= 0){
      if(Notification.permission === "granted")
        new Notification("Скоро дедлайн ⏰", { body: `${t.text} • ${fmtDate(due)}` });
      toast(`Напоминание: ${t.text}`);
      t.notified = true; saveTasks();
    }
  });
},60000);

// === Telegram demo ===
$("#tgConnectBtn").addEventListener("click", ()=>{
  const u = $("#tgUser").value.trim();
  if(!u.startsWith("@")) return toast("Введите @username");
  ls.set("ss_tg_user", { username:u });
  toast("Telegram подключён (демо)");
});
$("#tgTestBtn").addEventListener("click", ()=>{
  const data = ls.get("ss_tg_user", null);
  if(!data) return toast("Сначала подключи Telegram");
  const bot="SmartScheduleDemoBot";
  window.open(`https://t.me/${bot}?start=test`, "_blank");
  toast(`Отправлено уведомление ${data.username}`);
});

$("#openAIChatBtn").addEventListener("click", () => {
  window.open("https://chat.openai.com/", "_blank");
});


// === Сброс ===
$("#clearAllBtn").addEventListener("click", ()=>{
  if(confirm("Удалить все данные?")){
    ["ss_user","ss_tasks","ss_schedule","ss_tg_user"].forEach(ls.remove);
    location.reload();
  }
});

// === Переключатель темы ===
const root = document.documentElement;
const themeToggleBtn = $("#themeToggleBtn");

const applyTheme = (theme) => {
  root.setAttribute("data-theme", theme);
  ls.set("ss_theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная";
};

const savedTheme = ls.get("ss_theme", "dark");
applyTheme(savedTheme);

themeToggleBtn.addEventListener("click", () => {
  const newTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(newTheme);
});



// === Инициализация ===
const boot=()=>{renderSchedule();renderTasks();updateStats();};
boot();

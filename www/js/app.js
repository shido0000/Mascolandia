import { t, ta, setLang, getLang, detectLang, LANGS } from "./i18n.js";
import {
  getState, subscribe, update, uid, isPremium, activePet, petById,
  consultCredits, exportJson, replaceState, FREE_LIMITS, loadState,
} from "./store.js";
import { getCatalog, productById, isOwned, purchase, applyPurchase, restorePurchases, SUBSCRIPTION_PLANS } from "./iap.js";
import { requestNotificationPermission, scheduleRoutineReminder, cancelRoutineReminder, haptic } from "./notifications.js";
import { Share } from "@capacitor/share";
import { saveCard, getCard, hasCard, deleteCard, maskCard } from "./crypto.js";
import { pay } from "./ussd.js";

const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");

const TABS = [
  { id: "home", icon: "🏠", label: "tabHome" },
  { id: "health", icon: "❤️", label: "tabHealth" },
  { id: "routines", icon: "⏰", label: "tabRoutines" },
  { id: "expenses", icon: "💰", label: "tabExpenses" },
  { id: "store", icon: "🛍️", label: "tabStore" },
];

let currentRoute = "home";
let expenseMonth = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLang(), { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(n) {
  return `${Number(n).toLocaleString(getLang(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} CUP`;
}

function formatPrice(n) {
  return `${n} CUP`;
}

async function processPayment(amount, onSuccess) {
  if (!(await hasCard())) {
    toast(t("cardMissing"));
    navigate("settings");
    return;
  }
  toast(t("payProcessing"));
  const res = await pay(amount);
  if (res.ok) {
    toast(t("paySuccess", { amount }));
    onSuccess();
  } else {
    toast(t("payError"));
  }
}

function petAge(birth) {
  if (!birth) return "";
  const b = new Date(birth), now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  months = Math.max(0, months);
  const y = Math.floor(months / 12), m = months % 12;
  return y > 0 ? `${y} ${t("years")}${m ? ` ${m} ${t("months")}` : ""}` : `${m} ${t("months")}`;
}

function applyTheme(theme) {
  const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme === "system" ? system : theme;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  modalRoot.querySelector(".modal-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function confirmModal(title, text, onOk, okLabel) {
  openModal(`
    <h2>${esc(title)}</h2>
    <p style="font-size:.88rem;color:var(--text-soft);margin-bottom:6px">${esc(text)}</p>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn danger" id="m-ok">${esc(okLabel || t("delete"))}</button>
    </div>`);
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-ok").onclick = () => { closeModal(); onOk(); };
}

function paywallModal() {
  openModal(`
    <h2>👑 ${esc(t("plansTitle"))}</h2>
    <p style="font-size:.85rem;color:var(--text-soft)">${esc(t("premiumBanner"))}</p>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-go">${esc(t("seePlans"))}</button>
    </div>`);
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-go").onclick = () => { closeModal(); navigate("premium"); };
}

function requirePremiumOr(action) {
  if (isPremium()) action();
  else paywallModal();
}

function navigate(route) {
  currentRoute = route;
  render();
}

function render() {
  renderTabbar();
  renderPetSwitcher();
  const views = { home: renderHome, health: renderHealth, routines: renderRoutines, expenses: renderExpenses, store: renderStore, premium: renderPremium, settings: renderSettings };
  view.innerHTML = "";
  views[currentRoute]();
  view.scrollTop = 0;
}

function renderTabbar() {
  tabbar.innerHTML = TABS.map((tb) => `
    <button class="tab ${currentRoute === tb.id ? "active" : ""}" data-route="${tb.id}">
      <span class="tab-icon">${tb.icon}</span>${esc(t(tb.label))}
    </button>`).join("");
  tabbar.querySelectorAll(".tab").forEach((b) => (b.onclick = () => navigate(b.dataset.route)));
}

function renderPetSwitcher() {
  const sw = document.getElementById("pet-switcher");
  const s = getState();
  sw.innerHTML = s.pets
    .map((p) => `<button class="pet-chip ${p.id === s.activePetId ? "active" : ""}" data-pet="${p.id}"><span class="emoji">${p.emoji}</span>${esc(p.name)}</button>`)
    .join("") + `<button class="pet-chip" data-pet="add" id="chip-add-pet"><span class="emoji">＋</span></button>`;
  sw.querySelectorAll("[data-pet]").forEach((b) => {
    b.onclick = () => {
      if (b.dataset.pet === "add") {
        if (!isPremium() && s.pets.length >= FREE_LIMITS.pets) paywallModal();
        else petFormModal();
      } else {
        update((st) => (st.activePetId = b.dataset.pet));
      }
    };
  });
}

function petFormModal(pet = null) {
  const speciesOpts = ["dog", "cat", "other"].map((sp) => `<option value="${sp}" ${pet?.species === sp ? "selected" : ""}>${esc(t(sp))}</option>`).join("");
  openModal(`
    <h2>${esc(pet ? t("editPet") : t("addPet"))}</h2>
    <div class="field"><label>${esc(t("petName"))} *</label><input id="f-name" value="${esc(pet?.name || "")}" /></div>
    <div class="field-row">
      <div class="field"><label>${esc(t("species"))}</label><select id="f-species">${speciesOpts}</select></div>
      <div class="field"><label>${esc(t("breed"))}</label><input id="f-breed" value="${esc(pet?.breed || "")}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${esc(t("birthDate"))}</label><input type="date" id="f-birth" value="${pet?.birthDate || ""}" /></div>
      <div class="field"><label>${esc(t("weight"))}</label><input type="number" step="0.1" min="0" id="f-weight" value="${pet?.weightKg ?? ""}" /></div>
    </div>
    <div class="field"><label>Emoji</label>
      <div class="chip-row" id="f-emoji">
        ${["🐶", "🐱", "🐰", "🐦", "🐹", "🐢", "🐾"].map((e) => `<button class="chip ${pet?.emoji === e ? "active" : ""}" data-e="${e}">${e}</button>`).join("")}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-save">${esc(t("save"))}</button>
    </div>`);
  let emoji = pet?.emoji || "🐾";
  modalRoot.querySelectorAll("#f-emoji .chip").forEach((c) => (c.onclick = () => {
    emoji = c.dataset.e;
    modalRoot.querySelectorAll("#f-emoji .chip").forEach((x) => x.classList.toggle("active", x === c));
  }));
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-save").onclick = () => {
    const name = document.getElementById("f-name").value.trim();
    if (!name) return toast(t("required"));
    const data = {
      name,
      species: document.getElementById("f-species").value,
      breed: document.getElementById("f-breed").value.trim(),
      birthDate: document.getElementById("f-birth").value,
      weightKg: parseFloat(document.getElementById("f-weight").value) || null,
      emoji,
    };
    update((st) => {
      if (pet) Object.assign(st.pets.find((p) => p.id === pet.id), data);
      else {
        const p = { id: uid(), ...data };
        st.pets.push(p);
        st.activePetId = p.id;
      }
    });
    closeModal();
    toast(t("saved"));
  };
}

function premiumBanner() {
  if (isPremium()) {
    const s = getState();
    return `<div class="banner"><span class="banner-icon">👑</span><div><strong>${esc(t("premiumActive"))}</strong><br/>${esc(t("renewsOn"))} ${fmtDate(s.subscription.renews)}</div></div>`;
  }
  return `<div class="paywall-card"><h2>👑 ${esc(t("premium"))}</h2><p>${esc(t("premiumBanner"))}</p><button class="btn" id="btn-see-plans">${esc(t("seePlans"))}</button></div>`;
}

function renderHome() {
  const s = getState();
  const pet = activePet();
  const now = new Date();
  const monthKey = todayKey(now).slice(0, 7);
  const monthSpent = s.expenses.filter((e) => e.date.startsWith(monthKey)).reduce((a, e) => a + e.amount, 0);
  const weekday = now.getDay();
  const todayRoutines = pet ? s.routines.filter((r) => r.petId === pet.id && r.active && (r.days.includes(weekday) || r.days.length === 0)) : [];
  const log = s.routineLog[todayKey()] || {};
  const done = todayRoutines.filter((r) => log[r.id]).length;
  view.innerHTML = `
    ${premiumBanner()}
    <div class="card" style="display:flex;align-items:center;gap:14px">
      <div style="font-size:2.4rem">${pet?.emoji || "🐾"}</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:1.05rem">${esc(t("hello"))}, ${esc(pet?.name || "")} 👋</div>
        <div style="font-size:.78rem;color:var(--text-soft)">${pet ? `${esc(t(pet.species))}${pet.breed ? " · " + esc(pet.breed) : ""}${pet.birthDate ? " · " + esc(petAge(pet.birthDate)) : ""}${pet.weightKg ? " · " + pet.weightKg + " " + t("kg") : ""}` : esc(t("needPetFirst"))}</div>
      </div>
      ${pet ? `<button class="icon-btn" id="btn-edit-pet">✏️</button>` : ""}
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-value">${done}/${todayRoutines.length}</div><div class="stat-label">${esc(t("routinesToday"))}</div></div>
      <div class="stat"><div class="stat-value">${fmtMoney(monthSpent)}</div><div class="stat-label">${esc(t("spentThisMonth"))}</div></div>
      <div class="stat"><div class="stat-value">${pet ? s.health.filter((h) => h.petId === pet.id).length : 0}</div><div class="stat-label">${esc(t("healthRecords"))}</div></div>
    </div>
    <div class="section-title">${esc(t("routinesToday"))}</div>
    <div class="card" id="home-routines"></div>
    <div class="section-title">${esc(t("quickActions"))}</div>
    <div class="chip-row">
      <button class="chip" data-qa="health">❤️ ${esc(t("registerHealth"))}</button>
      <button class="chip" data-qa="routine">⏰ ${esc(t("addRoutine"))}</button>
      <button class="chip" data-qa="expense">💰 ${esc(t("addExpense"))}</button>
    </div>`;
  if (!pet) {
    document.getElementById("home-routines").innerHTML = `<div class="empty"><span class="empty-icon">🐾</span>${esc(t("needPetFirst"))}</div>`;
  } else if (!todayRoutines.length) {
    document.getElementById("home-routines").innerHTML = `<div class="empty"><span class="empty-icon">😴</span>${esc(t("nothingToday"))}</div>`;
  } else if (done === todayRoutines.length) {
    document.getElementById("home-routines").innerHTML = `<div class="empty"><span class="empty-icon">🎉</span>${esc(t("allDoneToday"))}</div>`;
  } else {
    document.getElementById("home-routines").innerHTML = todayRoutines.map((r) => routineRow(r, log[r.id])).join("");
    bindRoutineChecks(document.getElementById("home-routines"));
  }
  const editBtn = document.getElementById("btn-edit-pet");
  if (editBtn) editBtn.onclick = () => petFormModal(pet);
  view.querySelector("#btn-see-plans").onclick = () => navigate("premium");
  view.querySelectorAll("[data-qa]").forEach((b) => {
    b.onclick = () => {
      if (!pet) return toast(t("needPetFirst"));
      if (b.dataset.qa === "health") healthFormModal();
      if (b.dataset.qa === "routine") routineFormModal();
      if (b.dataset.qa === "expense") expenseFormModal();
    };
  });
}

const ROUTINE_ICONS = ["🍖", "🚶", "💊", "💧", "🧼", "🎾", "😴", "🚽"];

function routineFormModal(routine = null) {
  const pet = activePet();
  const days = routine?.days || [0, 1, 2, 3, 4, 5, 6];
  openModal(`
    <h2>${esc(routine ? t("edit") : t("addRoutine"))}</h2>
    <div class="field"><label>${esc(t("routineName"))} *</label><input id="f-rname" value="${esc(routine?.name || "")}" /></div>
    <div class="field"><label>Icono</label>
      <div class="chip-row" id="f-ricon">${ROUTINE_ICONS.map((i) => `<button class="chip ${routine?.icon === i ? "active" : ""}" data-i="${i}">${i}</button>`).join("")}</div>
    </div>
    <div class="field-row">
      <div class="field"><label>${esc(t("time"))}</label><input type="time" id="f-rtime" value="${routine?.time || "08:00"}" /></div>
      <div class="field"><label>${esc(t("days"))}</label><div class="chip-row" id="f-rdays" style="margin:0">${[0, 1, 2, 3, 4, 5, 6].map((d) => `<button class="chip ${days.includes(d) ? "active" : ""}" data-d="${d}">${t("daysShort")[d]}</button>`).join("")}</div></div>
    </div>
    <div class="modal-actions">
      ${routine ? `<button class="btn danger" id="m-del">${esc(t("delete"))}</button>` : ""}
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-save">${esc(t("save"))}</button>
    </div>`);
  let icon = routine?.icon || "🍖";
  let selDays = new Set(days);
  modalRoot.querySelectorAll("#f-ricon .chip").forEach((c) => (c.onclick = () => {
    icon = c.dataset.i;
    modalRoot.querySelectorAll("#f-ricon .chip").forEach((x) => x.classList.toggle("active", x === c));
  }));
  modalRoot.querySelectorAll("#f-rdays .chip").forEach((c) => (c.onclick = () => {
    const d = Number(c.dataset.d);
    selDays.has(d) ? selDays.delete(d) : selDays.add(d);
    c.classList.toggle("active");
  }));
  document.getElementById("m-cancel").onclick = closeModal;
  if (routine) {
    document.getElementById("m-del").onclick = () =>
      confirmModal(t("deleteRoutine"), routine.name, () => {
        update((st) => {
          st.routines = st.routines.filter((r) => r.id !== routine.id);
        });
        cancelRoutineReminder(routine.id);
      });
  }
  document.getElementById("m-save").onclick = () => {
    const name = document.getElementById("f-rname").value.trim();
    if (!name) return toast(t("required"));
    const time = document.getElementById("f-rtime").value;
    const data = { name, icon, time, days: [...selDays].sort() };
    update((st) => {
      if (routine) Object.assign(st.routines.find((r) => r.id === routine.id), data);
      else st.routines.push({ id: uid(), petId: pet.id, active: true, ...data });
    });
    if (getState().settings.notifications && isPremium()) {
      const saved = getState().routines.find((r) => r.name === name && r.petId === pet.id);
      if (saved) scheduleRoutineReminder(saved);
    }
    closeModal();
    toast(t("saved"));
  };
}

function routineRow(r, isDone) {
  return `
    <div class="list-item ${isDone ? "routine-done" : ""}" data-rid="${r.id}">
      <div class="li-icon">${r.icon}</div>
      <div class="li-main">
        <div class="li-title">${esc(r.name)}</div>
        <div class="li-sub">${esc(r.time || "")}${r.days.length === 7 ? " · " + esc(t("everyDay")) : ""}</div>
      </div>
      <button class="check-btn ${isDone ? "done" : ""}" data-check="${r.id}">${isDone ? "✓" : ""}</button>
    </div>`;
}

function bindRoutineChecks(container) {
  container.querySelectorAll("[data-check]").forEach((b) => {
    b.onclick = async () => {
      const rid = b.dataset.check;
      const key = todayKey();
      haptic();
      update((st) => {
        st.routineLog[key] = st.routineLog[key] || {};
        if (st.routineLog[key][rid]) delete st.routineLog[key][rid];
        else st.routineLog[key][rid] = Date.now();
      });
      const wasDone = b.classList.contains("done");
      if (!wasDone) toast(t("routineDone"));
    };
  });
}

function renderRoutines() {
  const s = getState();
  const pet = activePet();
  const weekday = new Date().getDay();
  const petRoutines = pet ? s.routines.filter((r) => r.petId === pet.id) : [];
  const log = s.routineLog[todayKey()] || {};
  const today = petRoutines.filter((r) => r.active && (r.days.includes(weekday) || r.days.length === 0));
  view.innerHTML = `
    ${!isPremium() && s.settings.notifications ? `<div class="banner warning"><span class="banner-icon">🔒</span><div>${esc(t("remindersLocked"))} <a href="#" id="lnk-prem" style="color:var(--primary);font-weight:700">${esc(t("seePlans"))}</a></div></div>` : ""}
    <div class="section-title">${esc(t("today"))} · ${esc(t("doneCount", { done: today.filter((r) => log[r.id]).length, total: today.length }))}</div>
    <div class="card" id="today-list"></div>
    <div class="section-title">${esc(t("activeRoutines"))} (${petRoutines.length})</div>
    <div class="card" id="all-list"></div>
    <button class="btn" id="btn-add-routine">＋ ${esc(t("addRoutine"))}</button>`;
  const todayList = document.getElementById("today-list");
  todayList.innerHTML = today.length
    ? today.map((r) => routineRow(r, log[r.id])).join("")
    : `<div class="empty"><span class="empty-icon">😴</span>${esc(t("nothingToday"))}</div>`;
  bindRoutineChecks(todayList);
  const allList = document.getElementById("all-list");
  allList.innerHTML = petRoutines.length
    ? petRoutines.map((r) => `
      <div class="list-item" data-edit="${r.id}">
        <div class="li-icon">${r.icon}</div>
        <div class="li-main"><div class="li-title">${esc(r.name)}</div><div class="li-sub">${esc(r.time || "")} · ${r.days.length === 7 ? esc(t("everyDay")) : r.days.map((d) => t("daysShort")[d]).join(" ")}</div></div>
        <div class="li-end">›</div>
      </div>`).join("")
    : `<div class="empty"><span class="empty-icon">⏰</span>${esc(t("noRoutines"))}</div>`;
  allList.querySelectorAll("[data-edit]").forEach((el) => (el.onclick = () => routineFormModal(petRoutines.find((r) => r.id === el.dataset.edit))));
  document.getElementById("btn-add-routine").onclick = () => (pet ? routineFormModal() : toast(t("needPetFirst")));
  const lnk = document.getElementById("lnk-prem");
  if (lnk) lnk.onclick = (e) => { e.preventDefault(); navigate("premium"); };
}

const HEALTH_TYPES = {
  vaccine: { icon: "💉" },
  deworming: { icon: "🪱" },
  vetVisit: { icon: "🩺" },
  treatment: { icon: "💊" },
  weightLog: { icon: "⚖️" },
};

function healthFormModal(record = null) {
  const pet = activePet();
  const typeOpts = Object.keys(HEALTH_TYPES).map((k) => `<option value="${k}" ${record?.type === k ? "selected" : ""}>${HEALTH_TYPES[k].icon} ${esc(t(k))}</option>`).join("");
  openModal(`
    <h2>${esc(record ? t("edit") : t("addRecord"))}</h2>
    <div class="field"><label>${esc(t("recordType"))}</label><select id="f-htype">${typeOpts}</select></div>
    <div class="field-row">
      <div class="field"><label>${esc(t("date"))}</label><input type="date" id="f-hdate" value="${record?.date || todayKey()}" /></div>
      <div class="field"><label>${esc(t("weight"))}</label><input type="number" step="0.1" min="0" id="f-hweight" value="${record?.weightKg ?? ""}" /></div>
    </div>
    <div class="field"><label>${esc(t("title"))} *</label><input id="f-htitle" value="${esc(record?.title || "")}" /></div>
    <div class="field"><label>${esc(t("notes"))}</label><textarea id="f-hnotes">${esc(record?.notes || "")}</textarea></div>
    <div class="banner warning"><span class="banner-icon">⚠️</span><div>${esc(t("disclaimerHealth"))}</div></div>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-save">${esc(t("save"))}</button>
    </div>`);
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-save").onclick = () => {
    const title = document.getElementById("f-htitle").value.trim();
    if (!title) return toast(t("required"));
    const data = {
      type: document.getElementById("f-htype").value,
      date: document.getElementById("f-hdate").value || todayKey(),
      weightKg: parseFloat(document.getElementById("f-hweight").value) || null,
      title,
      notes: document.getElementById("f-hnotes").value.trim(),
    };
    const s = getState();
    const count = s.health.filter((h) => h.petId === pet.id).length;
    if (!record && !isPremium() && count >= FREE_LIMITS.healthRecords) return paywallModal();
    update((st) => {
      if (record) Object.assign(st.health.find((h) => h.id === record.id), data);
      else st.health.push({ id: uid(), petId: pet.id, ...data });
      if (data.weightKg) {
        const p = st.pets.find((p) => p.id === pet.id);
        if (p) p.weightKg = data.weightKg;
      }
    });
    closeModal();
    toast(t("saved"));
  };
}

function buildHealthReport(pet) {
  const s = getState();
  const rows = s.health.filter((h) => h.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date));
  const lines = rows.map((h) => `- ${fmtDate(h.date)} [${t(h.type)}] ${h.title}${h.weightKg ? ` (${h.weightKg} ${t("kg")})` : ""}${h.notes ? ` — ${h.notes}` : ""}`);
  return `${t("appName")} — ${t("reportTitle", { pet: pet.name })}\n${"=".repeat(40)}\n${t("disclaimerHealth")}\n\n${lines.join("\n") || t("noRecords")}`;
}

async function shareReport(text) {
  try {
    await Share.share({ title: t("appName"), text });
  } catch {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mascolandia-report.txt";
    a.click();
  }
}

function renderHealth() {
  const s = getState();
  const pet = activePet();
  const all = pet ? s.health.filter((h) => h.petId === pet.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const limited = !isPremium() && all.length > FREE_LIMITS.healthRecords;
  const shown = limited ? all.slice(0, FREE_LIMITS.healthRecords) : all;
  view.innerHTML = `
    <div class="banner warning"><span class="banner-icon">⚠️</span><div>${esc(t("disclaimerHealth"))}</div></div>
    <div style="display:flex;gap:10px;margin-bottom:14px">
      <button class="btn" id="btn-add-health" style="flex:1">＋ ${esc(t("addRecord"))}</button>
      <button class="btn secondary" id="btn-export" style="flex:1">📄 ${esc(t("exportReport"))}</button>
    </div>
    ${limited ? `<div class="banner"><span class="banner-icon">👑</span><div>${esc(t("historyLimit", { n: FREE_LIMITS.healthRecords }))} <a href="#" id="lnk-prem" style="color:var(--primary);font-weight:700">${esc(t("seePlans"))}</a></div></div>` : ""}
    <div class="card" id="health-list"></div>`;
  const list = document.getElementById("health-list");
  list.innerHTML = shown.length
    ? shown.map((h) => `
      <div class="list-item" data-hid="${h.id}">
        <div class="li-icon">${HEALTH_TYPES[h.type]?.icon || "❤️"}</div>
        <div class="li-main"><div class="li-title">${esc(h.title)}</div><div class="li-sub">${esc(fmtDate(h.date))} · ${esc(t(h.type))}${h.notes ? `<br/>${esc(h.notes)}` : ""}</div></div>
        ${h.weightKg ? `<div class="li-end">${h.weightKg} ${t("kg")}</div>` : ""}
      </div>`).join("")
    : `<div class="empty"><span class="empty-icon">❤️</span>${esc(t("noRecords"))}</div>`;
  list.querySelectorAll("[data-hid]").forEach((el) => {
    el.onclick = () => healthFormModal(s.health.find((h) => h.id === el.dataset.hid));
  });
  document.getElementById("btn-add-health").onclick = () => (pet ? healthFormModal() : toast(t("needPetFirst")));
  document.getElementById("btn-export").onclick = () =>
    requirePremiumOr(() => pet && shareReport(buildHealthReport(pet)));
  const lnk = document.getElementById("lnk-prem");
  if (lnk) lnk.onclick = (e) => { e.preventDefault(); navigate("premium"); };
}

const EXPENSE_CATS = ["food", "vet", "meds", "grooming", "toys", "accessories", "otherExpense"];

function expenseFormModal(expense = null) {
  const pet = activePet();
  const catOpts = EXPENSE_CATS.map((c) => `<option value="${c}" ${expense?.category === c ? "selected" : ""}>${esc(t(c))}</option>`).join("");
  openModal(`
    <h2>${esc(t("addExpense"))}</h2>
    <div class="field-row">
      <div class="field"><label>${esc(t("category"))}</label><select id="f-ecat">${catOpts}</select></div>
      <div class="field"><label>${esc(t("amount"))} *</label><input type="number" step="0.01" min="0" id="f-eamt" value="${expense?.amount ?? ""}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>${esc(t("date"))}</label><input type="date" id="f-edate" value="${expense?.date || todayKey()}" /></div>
      <div class="field"><label>${esc(t("note"))}</label><input id="f-enote" value="${esc(expense?.note || "")}" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-save">${esc(t("save"))}</button>
    </div>`);
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-save").onclick = () => {
    const amount = parseFloat(document.getElementById("f-eamt").value);
    if (!(amount > 0)) return toast(t("required"));
    const data = {
      category: document.getElementById("f-ecat").value,
      amount,
      date: document.getElementById("f-edate").value || todayKey(),
      note: document.getElementById("f-enote").value.trim(),
    };
    update((st) => {
      if (expense) Object.assign(st.expenses.find((e) => e.id === expense.id), data);
      else st.expenses.push({ id: uid(), petId: pet?.id || null, ...data });
    });
    closeModal();
    toast(t("saved"));
  };
}

function renderExpenses() {
  const s = getState();
  if (!expenseMonth) expenseMonth = todayKey().slice(0, 7);
  const rows = s.expenses.filter((e) => e.date.startsWith(expenseMonth)).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((a, e) => a + e.amount, 0);
  const byCat = EXPENSE_CATS.map((c) => ({ cat: c, total: rows.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0) })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const max = Math.max(...byCat.map((x) => x.total), 1);
  view.innerHTML = `
    <div class="field"><input type="month" id="f-month" value="${expenseMonth}" /></div>
    <div class="stat-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat"><div class="stat-value">${fmtMoney(total)}</div><div class="stat-label">${esc(t("total"))} · ${esc(t("month"))}</div></div>
      <div class="stat"><div class="stat-value">${rows.length}</div><div class="stat-label">${esc(t("expensesTitle"))}</div></div>
    </div>
    <div class="card"><h2>${esc(t("byCategory"))}</h2>
      ${byCat.length ? `<div class="bar-chart">${byCat.map((x) => `
        <div class="bar-row"><div class="bar-label">${esc(t(x.cat))}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((x.total / max) * 100)}%"></div></div><div class="bar-amount">${fmtMoney(x.total)}</div></div>`).join("")}</div>`
      : `<div class="empty">${esc(t("noExpenses"))}</div>`}
    </div>
    <div class="card" id="exp-list"></div>
    <button class="btn" id="btn-add-expense">＋ ${esc(t("addExpense"))}</button>`;
  document.getElementById("exp-list").innerHTML = rows.length
    ? rows.map((e) => `
      <div class="list-item" data-eid="${e.id}">
        <div class="li-icon">${{ food: "🍖", vet: "🩺", meds: "💊", grooming: "✂️", toys: "🧸", accessories: "🎒", otherExpense: "📦" }[e.category] || "📦"}</div>
        <div class="li-main"><div class="li-title">${esc(t(e.category))}</div><div class="li-sub">${esc(fmtDate(e.date))}${e.note ? " · " + esc(e.note) : ""}</div></div>
        <div class="li-end">${fmtMoney(e.amount)}</div>
      </div>`).join("")
    : `<div class="empty">${esc(t("noExpenses"))}</div>`;
  document.getElementById("exp-list").querySelectorAll("[data-eid]").forEach((el) => {
    el.onclick = () => expenseFormModal(s.expenses.find((e) => e.id === el.dataset.eid));
  });
  document.getElementById("f-month").onchange = (e) => {
    expenseMonth = e.target.value || expenseMonth;
    render();
  };
  document.getElementById("btn-add-expense").onclick = () => expenseFormModal();
}

function renderStore() {
  const s = getState();
  const cat = getCatalog();
  const groups = [
    { title: "storeTraining", kind: "training" },
    { title: "storeExercise", kind: "exercise" },
    { title: "storeConsults", kind: "consult" },
  ];
  view.innerHTML = `
    ${groups.map((g) => `
      <div class="section-title">${esc(t(g.title))}</div>
      <div class="card">
        ${Object.entries(cat).filter(([, p]) => p.kind === g.kind).map(([id, p]) => {
          const owned = g.kind === "consult" ? consultCredits() > 0 : isOwned(s.purchases, id);
          return `
          <div class="list-item store-item">
            <div class="li-icon">${p.icon}</div>
            <div class="li-main">
              <div class="li-title">${esc(t(p.i18nName))}</div>
              <div class="li-sub">${esc(t(p.i18nDesc))}</div>
            </div>
            ${owned && g.kind !== "consult"
              ? `<button class="btn small secondary" data-open="${id}">${esc(t("open"))}</button>`
              : g.kind === "consult"
                ? `<button class="btn small" data-buy="${id}">${esc(t("buy"))} · ${formatPrice(p.price)}</button>`
                : isOwned(s.purchases, id)
                  ? `<span class="owned-tag">✓ ${esc(t("owned"))}</span>`
                  : `<button class="btn small" data-buy="${id}">${esc(t("buy"))} · ${formatPrice(p.price)}</button>`}
          </div>`;
        }).join("")}
      </div>`).join("")}
    <div id="consult-section"></div>
    <button class="btn secondary" id="btn-restore">↩️ ${esc(t("restore"))}</button>`;
  view.querySelectorAll("[data-buy]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.buy;
      const p = productById(id);
      openModal(`
        <h2>${esc(t("buyConfirm"))}</h2>
        <p style="font-size:.88rem;color:var(--text-soft)">${p.icon} <strong>${esc(t(p.i18nName))}</strong><br/>${esc(t(p.i18nDesc))}</p>
        <p style="font-size:.78rem;color:var(--text-soft);margin:8px 0">${esc(t("buyConfirmText"))}</p>
        <div class="modal-actions">
          <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
          <button class="btn" id="m-ok">${esc(t("confirmPurchase", { price: formatPrice(p.price) }))}</button>
        </div>`);
      document.getElementById("m-cancel").onclick = closeModal;
      document.getElementById("m-ok").onclick = async () => {
        document.getElementById("m-ok").disabled = true;
        await processPayment(p.price, () => {
          purchase(id);
          update((st) => applyPurchase(st, id));
          closeModal();
          toast(t("purchased"));
          render();
        });
        document.getElementById("m-ok").disabled = false;
      };
    };
  });
  view.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = () => {
      const p = productById(b.dataset.open);
      const steps = ta(p.i18nName + "Steps");
      openModal(`
        <h2>${p.icon} ${esc(t(p.i18nName))}</h2>
        <div class="tpl-content"><ol>${steps.map((s2) => `<li>${esc(s2)}</li>`).join("")}</ol></div>
        <button class="btn" id="m-close">${esc(t("cancel"))}</button>`);
      document.getElementById("m-close").onclick = closeModal;
    };
  });
  renderConsultSection();
  document.getElementById("btn-restore").onclick = async () => {
    await restorePurchases();
    toast(t("restored"));
  };
}

function renderConsultSection() {
  const sec = document.getElementById("consult-section");
  if (!sec) return;
  const s = getState();
  const credits = consultCredits();
  sec.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2 style="margin:0">🩺 ${esc(t("requestConsult"))}</h2>
        <span class="badge ${credits ? "ok" : ""}">${credits ? `${credits} ${esc(t("credits"))}` : esc(t("noCredits"))}</span>
      </div>
      <div class="banner warning" style="margin-bottom:10px"><span class="banner-icon">⚠️</span><div>${esc(t("consultDisclaimer"))}</div></div>
      <button class="btn" id="btn-consult" ${credits ? "" : "disabled"}>${esc(t("requestConsult"))}</button>
      ${s.consults.length ? `<div style="margin-top:10px">${s.consults.slice().reverse().map((c) => `
        <div class="list-item">
          <div class="li-icon">${c.mode === "video" ? "📹" : "💬"}</div>
          <div class="li-main"><div class="li-title">${esc(c.topic)}</div><div class="li-sub">${esc(fmtDate(c.date))} · ${esc(t(c.mode))}${petById(c.petId) ? " · " + esc(petById(c.petId).name) : ""}</div></div>
          <span class="badge">⏳</span>
        </div>`).join("")}</div>` : ""}
    </div>`;
  document.getElementById("btn-consult").onclick = () => consultFormModal();
}

function consultFormModal() {
  const pet = activePet();
  openModal(`
    <h2>🩺 ${esc(t("requestConsult"))}</h2>
    <div class="field"><label>${esc(t("consultTopic"))} *</label><textarea id="f-ctopic"></textarea></div>
    <div class="field"><label>${esc(t("consultMode"))}</label>
      <div class="seg" id="f-cmode">
        <button class="active" data-m="chat">💬 ${esc(t("chat"))}</button>
        <button data-m="video">📹 ${esc(t("video"))}</button>
      </div>
    </div>
    <div class="banner warning"><span class="banner-icon">⚠️</span><div>${esc(t("consultDisclaimer"))}</div></div>
    <div class="modal-actions">
      <button class="btn secondary" id="m-cancel">${esc(t("cancel"))}</button>
      <button class="btn" id="m-ok">${esc(t("requestConsult"))}</button>
    </div>`);
  let mode = "chat";
  modalRoot.querySelectorAll("#f-cmode button").forEach((b) => (b.onclick = () => {
    mode = b.dataset.m;
    modalRoot.querySelectorAll("#f-cmode button").forEach((x) => x.classList.toggle("active", x === b));
  }));
  document.getElementById("m-cancel").onclick = closeModal;
  document.getElementById("m-ok").onclick = () => {
    const topic = document.getElementById("f-ctopic").value.trim();
    if (!topic) return toast(t("required"));
    update((st) => {
      st.purchases["cons.pack1"]--;
      st.consults.push({ id: uid(), petId: pet?.id || null, topic, mode, date: todayKey() });
    });
    closeModal();
    toast(t("consultRequested"));
    render();
  };
}

function renderPremium() {
  const s = getState();
  view.innerHTML = `
    <div class="paywall-card" style="text-align:center;padding:26px 18px">
      <div style="font-size:2.6rem">👑</div>
      <h2 style="font-size:1.2rem">${esc(t("plansTitle"))}</h2>
      <p>${esc(t("plansSub"))}</p>
    </div>
    <ul class="paywall-list card" style="list-style:none">
      <li>📚 ${esc(t("benefitHistory"))}</li>
      <li>🔔 ${esc(t("benefitReminders"))}</li>
      <li>🐾 ${esc(t("benefitPets"))}</li>
      <li>📊 ${esc(t("benefitReports"))}</li>
    </ul>
    ${isPremium()
      ? `<div class="banner"><span class="banner-icon">✅</span><div><strong>${esc(t("premiumActive"))}</strong><br/>${esc(t("renewsOn"))} ${fmtDate(s.subscription.renews)}<br/><span style="font-size:.72rem">${esc(t("manageSub"))}</span></div></div>`
      : Object.entries(SUBSCRIPTION_PLANS).map(([id, p]) => `
          <div class="card plan-card">
            <div class="plan-info">
              <div class="plan-name">${esc(t(id === "yearly" ? "planYearly" : "planMonthly"))}</div>
              <div class="plan-price">${formatPrice(p.price)} <small>${esc(t(p.period))}</small></div>
            </div>
            <button class="btn" data-plan="${id}">${esc(t("subscribe"))}</button>
          </div>`).join("") +
        `<p style="font-size:.72rem;color:var(--text-soft);margin:2px 2px 14px">${esc(t("subSimulated"))}</p>`}
    <button class="btn secondary" id="btn-restore">↩️ ${esc(t("restore"))}</button>`;
  view.querySelectorAll("[data-plan]").forEach((b) => {
    b.onclick = async () => {
      const plan = b.dataset.plan;
      const price = SUBSCRIPTION_PLANS[plan].price;
      b.disabled = true;
      await processPayment(price, async () => {
        const renews = new Date();
        if (plan === "monthly") renews.setDate(renews.getDate() + 30);
        else renews.setFullYear(renews.getFullYear() + 1);
        update((st) => {
          st.subscription = { plan, since: todayKey(), renews: todayKey(renews) };
        });
        toast(t("subscribed"));
        render();
      });
      b.disabled = false;
    };
  });
  document.getElementById("btn-restore").onclick = async () => {
    await restorePurchases();
    toast(t("restored"));
  };
}

function renderSettings() {
  const s = getState();
  const langBtn = (id, label) => `<button class="${s.settings.lang === id ? "active" : ""}" data-lang="${id}">${label}</button>`;
  const themeBtn = (id, label) => `<button class="${s.settings.theme === id ? "active" : ""}" data-theme-opt="${id}">${esc(t(label))}</button>`;
  view.innerHTML = `
    <div class="card">
      <div class="settings-row"><div><div class="sr-label">${esc(t("premium"))}</div><div class="sr-sub">${isPremium() ? esc(t("premiumActive")) : esc(t("freeAccount"))}</div></div><button class="btn small" id="st-premium">${isPremium() ? "👑" : esc(t("seePlans"))}</button></div>
      <div class="settings-row"><div><div class="sr-label">${esc(t("language"))}</div></div></div>
      <div class="seg" style="margin-bottom:14px">${langBtn("es", "Español")}${langBtn("en", "English")}${langBtn("pt", "Português")}</div>
      <div class="settings-row"><div><div class="sr-label">${esc(t("theme"))}</div></div></div>
      <div class="seg">${themeBtn("system", "themeSystem")}${themeBtn("light", "themeLight")}${themeBtn("dark", "themeDark")}</div>
    </div>
    <div class="card" id="card-section"></div>
    <div class="card">
      <div class="settings-row">
        <div><div class="sr-label">${esc(t("notifications"))}</div><div class="sr-sub">${esc(t("notificationsSub"))}</div></div>
        <label class="switch"><input type="checkbox" id="st-notif" ${s.settings.notifications ? "checked" : ""} /><span class="track"></span></label>
      </div>
      <div class="settings-row"><div><div class="sr-label">${esc(t("exportData"))}</div></div><button class="btn small secondary" id="st-export">⬇️</button></div>
      <div class="settings-row"><div><div class="sr-label" style="color:var(--danger)">${esc(t("resetData"))}</div></div><button class="btn small danger" id="st-reset">🗑️</button></div>
    </div>
    <div class="card">
      <h2>${esc(t("about"))}</h2>
      <p style="font-size:.82rem;color:var(--text-soft);line-height:1.5">${esc(t("aboutText"))}</p>
      <div class="banner warning" style="margin:10px 0 0"><span class="banner-icon">⚠️</span><div>${esc(t("disclaimerGeneral"))}</div></div>
    </div>`;
  view.querySelectorAll("[data-lang]").forEach((b) => {
    b.onclick = () => {
      update((st) => (st.settings.lang = b.dataset.lang));
      setLang(b.dataset.lang);
      render();
    };
  });
  view.querySelectorAll("[data-theme-opt]").forEach((b) => {
    b.onclick = () => {
      update((st) => (st.settings.theme = b.dataset.themeOpt));
      applyTheme(b.dataset.themeOpt);
      render();
    };
  });
  document.getElementById("st-notif").onchange = async (e) => {
    if (e.target.checked && !isPremium()) {
      e.target.checked = false;
      return paywallModal();
    }
    if (e.target.checked) await requestNotificationPermission();
    update((st) => (st.settings.notifications = e.target.checked));
    if (e.target.checked && isPremium()) {
      for (const r of getState().routines.filter((r) => r.active)) await scheduleRoutineReminder(r);
    }
  };
  document.getElementById("st-premium").onclick = () => navigate("premium");
  renderCardSection();
  document.getElementById("st-export").onclick = async () => {
    const json = exportJson();
    try {
      await Share.share({ title: t("appName"), text: json });
    } catch {
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mascolandia-data.json";
      a.click();
    }
  };
  document.getElementById("st-reset").onclick = () =>
    confirmModal(t("resetData"), t("resetConfirm"), () => {
      replaceState(defaultSettings());
      toast(t("deleteData"));
    }, t("deleteData"));
}

async function renderCardSection() {
  const sec = document.getElementById("card-section");
  if (!sec) return;
  const card = await getCard();
  if (card) {
    sec.innerHTML = `
      <div class="settings-row">
        <div><div class="sr-label">💳 ${esc(t("payMethod"))}</div><div class="sr-sub">${esc(maskCard(card.number))} · ${esc(card.bank === "bandec" ? t("bankBandec") : t("bankBanmet"))}</div></div>
        <button class="btn small danger" id="st-delcard">🗑️</button>
      </div>
      <div class="sr-sub" style="font-size:.72rem;color:var(--text-soft);margin-top:8px">🔒 ${esc(t("payMethodSub"))}</div>`;
    document.getElementById("st-delcard").onclick = () =>
      confirmModal(t("deleteCardBtn"), maskCard(card.number), async () => {
        await deleteCard();
        toast(t("deleteData"));
        renderCardSection();
      });
    return;
  }
  sec.innerHTML = `
    <h2 style="margin-bottom:10px">💳 ${esc(t("payMethod"))}</h2>
    <div class="field"><label>${esc(t("cardNumber"))}</label><input id="f-cardnum" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" /></div>
    <div class="field-row">
      <div class="field"><label>${esc(t("cardPin"))}</label><input id="f-cardpin" type="password" inputmode="numeric" maxlength="8" /></div>
      <div class="field"><label>${esc(t("cardBank"))}</label>
        <select id="f-cardbank">
          <option value="banmet">${esc(t("bankBanmet"))}</option>
          <option value="bandec">${esc(t("bankBandec"))}</option>
        </select>
      </div>
    </div>
    <div class="sr-sub" style="font-size:.72rem;color:var(--text-soft);margin-bottom:10px">🔒 ${esc(t("payMethodSub"))}</div>
    <button class="btn" id="st-savecard">💾 ${esc(t("saveCardBtn"))}</button>`;
  document.getElementById("st-savecard").onclick = async () => {
    const number = document.getElementById("f-cardnum").value.replace(/\s/g, "");
    const pin = document.getElementById("f-cardpin").value.trim();
    const bank = document.getElementById("f-cardbank").value;
    if (!/^\d{16,19}$/.test(number) || !pin) return toast(t("invalidCard"));
    await saveCard({ number, pin, bank });
    toast(t("cardSaved"));
    renderCardSection();
  };
}

function defaultSettings() {
  return { settings: { lang: getLang(), theme: "system", notifications: true }, pets: [], activePetId: null, health: [], routines: [], expenses: [], consults: [], subscription: { plan: "free", since: null, renews: null }, purchases: {}, routineLog: {} };
}

document.getElementById("btn-settings").onclick = () => {
  currentRoute === "settings" ? navigate("home") : navigate("settings");
};

const media = window.matchMedia("(prefers-color-scheme: dark)");
media.addEventListener("change", () => {
  if (getState().settings.theme === "system") applyTheme("system");
});

subscribe(() => {
  if (currentRoute !== "settings") render();
});

(async function init() {
  await loadState();
  const s = getState();
  if (!s.settings.lang) s.settings.lang = detectLang();
  setLang(s.settings.lang || detectLang());
  applyTheme(s.settings.theme || "system");
  if (!s.activePetId && s.pets.length) s.activePetId = s.pets[0].id;
  render();
})();

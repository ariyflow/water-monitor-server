const DEVICES_API = "/api/devices";
const SETTINGS_API = "/api/settings";

const selDevice = document.getElementById("sel-device");
const btnSettings = document.getElementById("btn-settings");
const btnRefresh = document.getElementById("btn-refresh");
const summaryEl = document.getElementById("summary");
const tbody = document.getElementById("tbody");
const pageInfoEl = document.getElementById("page-info");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const pageSizeEl = document.getElementById("page-size");
const pageInput = document.getElementById("page-input");
const btnGoto = document.getElementById("btn-goto");
const toast = document.getElementById("toast");

const settingsModal = document.getElementById("settings-modal");
const settingsForm = document.getElementById("settings-form");
const settingsTitle = document.getElementById("settings-title");
const btnSettingsCancel = document.getElementById("btn-settings-cancel");

const SETTINGS_FIELDS = ["temp_low_c", "temp_high_c", "flow_high_lpm", "ec_high_us_cm", "turb_high_ntu"];
const COLS = 8;

const state = {
  devices: [],
  selectedDeviceId: null,
  selectedSerial: null,
  page: 1,
  pageSize: Number(pageSizeEl.value),
  total: 0,
};

function totalPages() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}

function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 2500);
}

function esc(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "请求失败");
  }
  return res;
}

function setEmpty(text) {
  tbody.innerHTML = `<tr><td colspan="${COLS}" class="empty">${text}</td></tr>`;
  pageInfoEl.textContent = "第 0 / 0 页";
  btnPrev.disabled = true;
  btnNext.disabled = true;
  pageInput.value = 1;
  pageInput.max = 1;
  pageInput.disabled = true;
  btnGoto.disabled = true;
}

function renderRows(records) {
  if (!records.length) {
    setEmpty("暂无数据");
    return;
  }
  tbody.innerHTML = records.map((r) => `<tr>
    <td>${esc(r.id)}</td>
    <td>${esc(r.serial || "—")}</td>
    <td>${esc(r.ph)}</td>
    <td>${esc(r.temperature)}</td>
    <td>${esc(r.flow)}</td>
    <td>${esc(r.turbidity)}</td>
    <td>${esc(r.conductivity)}</td>
    <td>${esc(r.created_at)}</td>
  </tr>`).join("");
  pageInfoEl.textContent = `第 ${state.page} / ${totalPages()} 页（共 ${state.total} 条）`;
  btnPrev.disabled = state.page <= 1;
  btnNext.disabled = state.page >= totalPages();
  pageInput.value = state.page;
  pageInput.max = totalPages();
  pageInput.disabled = false;
  btnGoto.disabled = false;
}

async function loadDevices() {
  setEmpty("加载中...");
  btnSettings.disabled = true;
  selDevice.innerHTML = `<option value="">请选择设备</option>`;
  try {
    const res = await apiFetch(DEVICES_API);
    const json = await res.json();
    state.devices = json.data || [];
    state.devices.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name ? `${d.name}（${d.serial}）` : d.serial;
      selDevice.appendChild(opt);
    });
    summaryEl.textContent = `共 ${state.devices.length} 个设备`;
    if (state.devices.length) autoSelectFirstDevice();
  } catch (err) {
    setEmpty("加载失败");
    showToast("加载失败", "error");
  }
}

function autoSelectFirstDevice() {
  selDevice.value = state.devices[0].id;
  selectDevice();
}

function selectDevice() {
  const deviceId = Number(selDevice.value);
  const device = state.devices.find((d) => d.id === deviceId) || null;
  state.selectedDeviceId = deviceId || null;
  state.selectedSerial = device ? device.serial : null;

  if (!device) {
    btnSettings.disabled = true;
    setEmpty("请选择设备");
    summaryEl.textContent = "请选择设备";
    return;
  }

  btnSettings.disabled = false;
  summaryEl.textContent = device.name ? `${device.name}（${device.serial}）` : device.serial;
  loadRecords(1);
}

async function loadRecords(page) {
  state.page = page || 1;
  if (!state.selectedDeviceId) {
    setEmpty("请选择设备");
    return;
  }
  setEmpty("加载中...");
  const offset = (state.page - 1) * state.pageSize;
  const url = `/api/sensors?device_id=${state.selectedDeviceId}&limit=${state.pageSize}&offset=${offset}`;
  try {
    const res = await apiFetch(url);
    const json = await res.json();
    state.total = json.total;
    state.page = Math.floor(json.offset / state.pageSize) + 1;
    renderRows(json.data || []);
  } catch (err) {
    setEmpty("加载失败");
    showToast("加载失败", "error");
  }
}

function gotoPage() {
  if (!state.selectedDeviceId) return;
  let page = parseInt(pageInput.value, 10);
  if (isNaN(page) || page < 1) page = 1;
  page = Math.min(page, totalPages());
  loadRecords(page);
}

async function openSettings() {
  if (!state.selectedSerial) return;
  settingsTitle.textContent = state.selectedSerial;
  settingsForm.reset();
  try {
    const res = await apiFetch(`${SETTINGS_API}?serial=${encodeURIComponent(state.selectedSerial)}`);
    const json = await res.json();
    if (json.data) {
      SETTINGS_FIELDS.forEach((f) => { settingsForm[f].value = json.data[f] ?? ""; });
    }
  } catch (err) {
    showToast("阈值加载失败", "error");
  }
  settingsModal.classList.remove("hidden");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
}

async function saveSettings(e) {
  e.preventDefault();
  if (!state.selectedSerial) return;
  const payload = { serial: state.selectedSerial };
  SETTINGS_FIELDS.forEach((f) => {
    const v = settingsForm[f].value.trim();
    if (v !== "") payload[f] = v;
  });
  try {
    const res = await apiFetch(SETTINGS_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    showToast("阈值保存成功", "success");
    closeSettings();
  } catch (err) {
    showToast(err.message || "保存失败", "error");
  }
}

selDevice.addEventListener("change", selectDevice);
btnRefresh.addEventListener("click", () => loadRecords(state.page));
btnSettings.addEventListener("click", openSettings);
pageSizeEl.addEventListener("change", () => {
  state.pageSize = Number(pageSizeEl.value);
  loadRecords(1);
});
btnPrev.addEventListener("click", () => loadRecords(state.page - 1));
btnNext.addEventListener("click", () => loadRecords(state.page + 1));
btnGoto.addEventListener("click", gotoPage);
pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") gotoPage(); });

btnSettingsCancel.addEventListener("click", closeSettings);
settingsForm.addEventListener("submit", saveSettings);
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeSettings(); });

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch (err) {}
    window.location.href = "/login";
  });
}

loadDevices();

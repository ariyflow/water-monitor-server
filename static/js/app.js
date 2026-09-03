const API = "/api/sensors";

const state = { editingId: null };

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res;
}

const tbody = document.getElementById("tbody");
const totalEl = document.getElementById("total");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const modalForm = document.getElementById("modal-form");

const toast = document.getElementById("toast");

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

async function loadData() {
  tbody.innerHTML = `<tr><td colspan="9" class="empty">加载中...</td></tr>`;
  try {
    const res = await apiFetch(API);
    const json = await res.json();
    totalEl.textContent = `共 ${json.total} 条记录`;
    if (!json.data.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">暂无数据</td></tr>`;
      return;
    }
    tbody.innerHTML = json.data.map(renderRow).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">加载失败</td></tr>`;
    showToast("加载失败", "error");
  }
}

function renderRow(r) {
  return `<tr>
    <td>${esc(r.id)}</td>
    <td>${esc(r.serial || "—")}</td>
    <td>${esc(r.ph)}</td>
    <td>${esc(r.temperature)}</td>
    <td>${esc(r.flow)}</td>
    <td>${esc(r.turbidity)}</td>
    <td>${esc(r.conductivity)}</td>
    <td>${esc(r.created_at)}</td>
    <td>
      <button class="btn btn-sm" data-edit="${r.id}">编辑</button>
      <button class="btn btn-sm" data-settings="${esc(r.serial)}">阈值</button>
      <button class="btn btn-sm btn-danger" data-del="${r.id}">删除</button>
    </td>
  </tr>`;
}

function openModal(record = null) {
  state.editingId = record ? record.id : null;
  modalTitle.textContent = record ? "编辑记录" : "新增记录";
  modalForm.reset();
  if (record) {
    modalForm.serial.value = record.serial || "";
    modalForm.ph.value = record.ph || "";
    modalForm.temperature.value = record.temperature || "";
    modalForm.flow.value = record.flow || "";
    modalForm.turbidity.value = record.turbidity || "";
    modalForm.conductivity.value = record.conductivity || "";
  }
  modal.classList.remove("hidden");
}

function closeModal() { modal.classList.add("hidden"); }

function formPayload() {
  return {
    serial: modalForm.serial.value.trim(),
    ph: modalForm.ph.value.trim(),
    temperature: modalForm.temperature.value.trim(),
    flow: modalForm.flow.value.trim(),
    turbidity: modalForm.turbidity.value.trim(),
    conductivity: modalForm.conductivity.value.trim(),
  };
}

async function saveRecord(e) {
  e.preventDefault();
  const payload = formPayload();
  if (!payload.serial) {
    showToast("设备序列号不能为空", "error");
    return;
  }
  try {
    if (state.editingId) {
      await apiFetch(`${API}/${state.editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("更新成功", "success");
    } else {
      await apiFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      showToast("新增成功", "success");
    }
    closeModal();
    loadData();
  } catch (err) {
    showToast("保存失败", "error");
  }
}

async function deleteRecord(id) {
  if (!confirm("确定删除该记录吗？")) return;
  try {
    await apiFetch(`${API}/${id}`, { method: "DELETE" });
    showToast("删除成功", "success");
    loadData();
  } catch (err) {
    showToast("删除失败", "error");
  }
}

const settingsModal = document.getElementById("settings-modal");
const settingsForm = document.getElementById("settings-form");
const settingsTitle = document.getElementById("settings-title");
let settingsSerial = null;

const SETTINGS_FIELDS = ["temp_low_c", "temp_high_c", "flow_high_lpm", "ec_high_us_cm", "turb_high_ntu"];

async function openSettings(serial) {
  settingsSerial = serial;
  settingsTitle.textContent = `阈值设置 · ${serial}`;
  settingsForm.reset();

  try {
    const res = await apiFetch(`/api/settings?serial=${encodeURIComponent(serial)}`);
    const json = await res.json();
    if (json.data) {
      SETTINGS_FIELDS.forEach((f) => {
        settingsForm[f].value = json.data[f] ?? "";
      });
    }
  } catch (err) {
    showToast("阈值加载失败", "error");
  }
  settingsModal.classList.remove("hidden");
}

function closeSettings() {
  settingsModal.classList.add("hidden");
  settingsSerial = null;
}

async function saveSettings(e) {
  e.preventDefault();
  if (!settingsSerial) return;

  const payload = { serial: settingsSerial };
  SETTINGS_FIELDS.forEach((f) => {
    const v = settingsForm[f].value.trim();
    if (v !== "") payload[f] = v;
  });

  try {
    const res = await apiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "保存失败");
    }
    showToast("阈值保存成功", "success");
    closeSettings();
  } catch (err) {
    showToast(err.message || "保存失败", "error");
  }
}

document.getElementById("btn-settings-cancel").addEventListener("click", closeSettings);
settingsForm.addEventListener("submit", saveSettings);
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeSettings(); });

document.getElementById("btn-refresh").addEventListener("click", loadData);
document.getElementById("btn-add").addEventListener("click", () => openModal());

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {}
    window.location.href = "/login";
  });
}
document.getElementById("btn-cancel").addEventListener("click", closeModal);
modalForm.addEventListener("submit", saveRecord);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

tbody.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const settingsBtn = e.target.closest("[data-settings]");
  const delBtn = e.target.closest("[data-del]");
  if (editBtn) {
    const id = Number(editBtn.dataset.edit);
    apiFetch(`${API}/${id}`)
      .then((r) => r.json())
      .then((json) => openModal(json.data));
  } else if (settingsBtn) {
    openSettings(settingsBtn.dataset.settings);
  } else if (delBtn) {
    deleteRecord(Number(delBtn.dataset.del));
  }
});

loadData();

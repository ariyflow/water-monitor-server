// =============================================
// admin.js — 管理员后台特有逻辑
// =============================================

const USERS_API = '/api/admin/users';

const selUser = document.getElementById('sel-user');
const selDevice = document.getElementById('sel-device');
const tbody = document.getElementById('tbody');
const summaryEl = document.getElementById('summary');
const pageInfoEl = document.getElementById('page-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const pageSizeEl = document.getElementById('page-size');
const defaultPageSize = 50;
const getPageSize = () => (pageSizeEl ? parseInt(pageSizeEl.value, 10) : defaultPageSize);
const pageInput = document.getElementById('page-input');
const btnGoto = document.getElementById('btn-goto');

const userActionsEl = document.getElementById('user-actions');
const uaUsername = document.getElementById('ua-username');
const uaRole = document.getElementById('ua-role');
const btnResetPwd = document.getElementById('btn-reset-pwd');
const btnDelUser = document.getElementById('btn-del-user');
const pwdModal = document.getElementById('pwd-modal');
const pwdForm = document.getElementById('pwd-form');
const pwdUsername = document.getElementById('pwd-username');

const state = {
  users: [],
  devices: [],
  page: 1,
  total: 0,
  pageSize: getPageSize(),
  selectedUserId: null,
};

function totalPages() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}

function setEmpty(text) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="empty">${text}</td></tr>`;
  if (pageInfoEl) pageInfoEl.textContent = '第 0 / 0 页';
  if (btnPrev) btnPrev.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (pageInput) { pageInput.value = 1; pageInput.max = 1; pageInput.disabled = true; }
  if (btnGoto) btnGoto.disabled = true;
}

function renderRows(records) {
  if (!tbody) return;
  if (!records.length) {
    setEmpty('暂无数据');
    return;
  }
  tbody.innerHTML = records.map((r) => `<tr>
    <td>${esc(r.id)}</td>
    <td>${esc(r.ph)}</td>
    <td>${esc(r.temperature)}</td>
    <td>${esc(r.flow)}</td>
    <td>${esc(r.turbidity)}</td>
    <td>${esc(r.conductivity)}</td>
    <td>${esc(r.created_at)}</td>
  </tr>`).join('');

  if (pageInfoEl) pageInfoEl.textContent = `第 ${state.page} / ${totalPages()} 页（共 ${state.total} 条）`;
  if (btnPrev) btnPrev.disabled = state.page <= 1;
  if (btnNext) btnNext.disabled = state.page >= totalPages();
  if (pageInput) { pageInput.value = state.page; pageInput.max = totalPages(); }
}

async function loadUsers() {
  if (!selUser || !selDevice) return;
  setEmpty('加载中...');
  selDevice.disabled = true;
  selDevice.innerHTML = '<option value="">请先选择用户</option>';
  selUser.innerHTML = '<option value="">请选择用户</option>';
  try {
    const res = await apiFetch(USERS_API);
    const json = await res.json();
    state.users = json.data || [];
    state.users.forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.username}${u.is_admin ? '（管理员）' : ''}`;
      selUser.appendChild(opt);
    });
    if (summaryEl) summaryEl.textContent = `共 ${state.users.length} 个用户`;
  } catch (err) {
    setEmpty('加载失败');
    showToast('加载失败', 'error');
  }
}

async function loadDevices(userId) {
  if (!selDevice) return;
  state.devices = [];
  state.page = 1;
  state.total = 0;
  selDevice.innerHTML = '<option value="">请选择设备</option>';
  selDevice.disabled = true;
  setEmpty('请选择用户与设备');
  try {
    const res = await apiFetch(`${USERS_API}/${userId}/devices`);
    const json = await res.json();
    state.devices = json.data || [];
    state.devices.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = (d.name ? `${d.name}（${d.serial}）` : d.serial);
      selDevice.appendChild(opt);
    });
    selDevice.disabled = state.devices.length === 0;
    if (summaryEl) summaryEl.textContent = `该用户共 ${state.devices.length} 个设备`;
  } catch (err) {
    showToast('加载设备失败', 'error');
  }
}

async function loadRecords(deviceId, page) {
  if (!deviceId || !tbody) return;
  state.page = page || 1;
  setEmpty('加载中...');
  const url = `/api/admin/devices/${deviceId}/records?page=${state.page}&limit=${state.pageSize}`;
  try {
    const res = await apiFetch(url);
    const json = await res.json();
    state.total = json.total;
    state.page = json.page;
    renderRows(json.data || []);
    if (pageInput) pageInput.disabled = false;
    if (btnGoto) btnGoto.disabled = false;
  } catch (err) {
    setEmpty('加载失败');
    showToast('加载失败', 'error');
  }
}

function showUserActions(user) {
  if (!userActionsEl) return;
  if (!user) {
    userActionsEl.style.display = 'none';
    state.selectedUserId = null;
    return;
  }
  state.selectedUserId = user.id;
  if (uaUsername) uaUsername.textContent = user.username;
  if (uaRole) {
    uaRole.textContent = user.is_admin ? '管理员' : '普通用户';
    uaRole.className = `badge ${user.is_admin ? 'admin' : ''}`;
  }
  userActionsEl.style.display = 'flex';
}

// 事件绑定
if (selUser) {
  selUser.addEventListener('change', () => {
    const userId = Number(selUser.value);
    const user = state.users.find((u) => u.id === userId) || null;
    showUserActions(user);
    if (!userId) {
      if (selDevice) {
        selDevice.innerHTML = '<option value="">请先选择用户</option>';
        selDevice.disabled = true;
      }
      setEmpty('请选择用户与设备');
      return;
    }
    loadDevices(userId);
  });
}

if (selDevice) {
  selDevice.addEventListener('change', () => {
    const deviceId = Number(selDevice.value);
    if (!deviceId) {
      setEmpty('请选择设备');
      return;
    }
    if (typeof window.adminRefreshData === 'function') {
      window.adminRefreshData();
    } else {
      loadRecords(deviceId, 1);
    }
  });
}

if (pageSizeEl) {
  pageSizeEl.addEventListener('change', () => {
    state.pageSize = parseInt(pageSizeEl.value, 10);
    const deviceId = Number(selDevice ? selDevice.value : 0);
    if (deviceId) loadRecords(deviceId, 1);
  });
}

if (btnPrev) {
  btnPrev.addEventListener('click', () => {
    const deviceId = Number(selDevice ? selDevice.value : 0);
    if (deviceId) loadRecords(deviceId, state.page - 1);
  });
}
if (btnNext) {
  btnNext.addEventListener('click', () => {
    const deviceId = Number(selDevice ? selDevice.value : 0);
    if (deviceId) loadRecords(deviceId, state.page + 1);
  });
}

function gotoPage() {
  const deviceId = Number(selDevice ? selDevice.value : 0);
  if (!deviceId) return;
  let page = parseInt(pageInput ? pageInput.value : 1, 10);
  if (isNaN(page) || page < 1) page = 1;
  page = Math.min(page, totalPages());
  loadRecords(deviceId, page);
}

if (btnGoto) btnGoto.addEventListener('click', gotoPage);
if (pageInput) {
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoPage();
  });
}

function openPwdModal() {
  if (!state.selectedUserId || !pwdModal || !pwdForm || !pwdUsername) return;
  const user = state.users.find((u) => u.id === state.selectedUserId);
  pwdUsername.value = user ? user.username : '';
  pwdForm.password.value = '';
  pwdForm.password2.value = '';
  pwdModal.classList.remove('hidden');
}

function closePwdModal() {
  if (pwdModal) pwdModal.classList.add('hidden');
}

async function resetPassword(e) {
  if (!e) return;
  e.preventDefault();
  if (!pwdForm) return;
  const p1 = pwdForm.password.value;
  const p2 = pwdForm.password2.value;
  if (p1 !== p2) {
    showToast('两次输入的密码不一致', 'error');
    return;
  }
  try {
    await apiFetch(`/api/admin/users/${state.selectedUserId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p1 }),
    });
    showToast('密码已更新', 'success');
    closePwdModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser() {
  if (!state.selectedUserId) return;
  const user = state.users.find((u) => u.id === state.selectedUserId);
  const name = user ? user.username : '';
  const ok = confirm(
    `确定要删除用户「${name}」吗？\n\n将同步删除该用户的所有设备以及这些设备下的全部数据。\n此操作不可恢复！`
  );
  if (!ok) return;
  try {
    const res = await apiFetch(`/api/admin/users/${state.selectedUserId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    showToast(`用户及 ${json.device_count || 0} 个设备已删除`, 'success');
    if (selUser) selUser.value = '';
    showUserActions(null);
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

if (btnResetPwd) btnResetPwd.addEventListener('click', openPwdModal);
if (btnDelUser) btnDelUser.addEventListener('click', deleteUser);
if (pwdForm) pwdForm.addEventListener('submit', resetPassword);
const pwdCancel = document.getElementById('btn-pwd-cancel');
if (pwdCancel) pwdCancel.addEventListener('click', closePwdModal);
if (pwdModal) pwdModal.addEventListener('click', (e) => { if (e.target === pwdModal) closePwdModal(); });

const backBtn = document.getElementById('btn-back');
if (backBtn) backBtn.addEventListener('click', () => (window.location.href = '/'));
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (err) {}
    window.location.href = '/login';
  });
}

// 初始化自定义下拉
initCustomSelects();
loadUsers();
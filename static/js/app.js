// =============================================
// app.js — 普通用户端业务逻辑（含图表）
// =============================================

const DEVICES_API = '/api/devices';
const SETTINGS_API = '/api/settings';

// ---- DOM 引用 ----
const selDevice = document.getElementById('sel-device');
const btnSettings = document.getElementById('btn-settings');
const btnRefresh = document.getElementById('btn-refresh');
const deviceInfo = document.getElementById('device-info');
const tbody = document.getElementById('tbody');
const pageInfoEl = document.getElementById('page-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const pageSizeEl = document.getElementById('page-size');
const pageInput = document.getElementById('page-input');
const btnGoto = document.getElementById('btn-goto');

const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const settingsTitle = document.getElementById('settings-title');
const btnSettingsCancel = document.getElementById('btn-settings-cancel');

const modeSlider = document.getElementById('mode-slider');
const toggleBtns = document.querySelectorAll('#metric-selector .toggle-btn');
const timeRangeSelect = document.getElementById('time-range');
const listView = document.getElementById('list-view');
const chartView = document.getElementById('chart-view');
const chartCanvas = document.getElementById('sensorChart');
const chartInfo = document.getElementById('chart-info');

const SETTINGS_FIELDS = ['temp_low_c', 'temp_high_c', 'flow_high_lpm', 'ec_high_us_cm', 'turb_high_ntu', 'ph_low', 'ph_high'];
const COLS = 8;

const state = {
  devices: [],
  selectedDeviceId: null,
  selectedSerial: null,
  page: 1,
  pageSize: pageSizeEl ? Number(pageSizeEl.value) : 50,
  total: 0,
};

let chartInstance = null;
let currentRecords = [];

// ---- 工具函数 ----
function totalPages() {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}

function setEmpty(text) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${COLS}" class="empty">${text}</td></tr>`;
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
    <td>${esc(r.serial || '—')}</td>
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
  if (pageInput) { pageInput.value = state.page; pageInput.max = totalPages(); pageInput.disabled = false; }
  if (btnGoto) btnGoto.disabled = false;
}

function formatTime(isoString, showFullDate = false) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const pad = n => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  if (showFullDate) return `${year}-${month}-${day} ${hours}:${minutes}`;
  return `${hours}:${minutes}`;
}

function formatChartLabel(isoString, prevDate) {
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const dateStr = d.toDateString();
  if (prevDate && dateStr === prevDate) return formatTime(isoString, false);
  return formatTime(isoString, true);
}

function getSelectedMetrics() {
  const checked = [];
  toggleBtns.forEach(btn => {
    if (btn.classList.contains('active')) checked.push(btn.dataset.value);
  });
  return checked;
}

function getViewMode() {
  if (!modeSlider) return 'list';
  return modeSlider.classList.contains('chart') ? 'chart' : 'list';
}

function getTimeRangeHours() {
  return timeRangeSelect ? parseInt(timeRangeSelect.value, 10) : 168;
}

// ---- API 加载 ----
async function loadDevices() {
  if (!selDevice) return;
  setEmpty('加载中...');
  if (btnSettings) btnSettings.disabled = true;
  selDevice.innerHTML = '<option value="">请选择设备</option>';
  try {
    const res = await apiFetch(DEVICES_API);
    const json = await res.json();
    state.devices = json.data || [];
    state.devices.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name || d.serial;
      selDevice.appendChild(opt);
    });
    if (deviceInfo) deviceInfo.textContent = `共 ${state.devices.length} 个设备`;
    if (state.devices.length) autoSelectFirstDevice();
  } catch (err) {
    setEmpty('加载失败');
    showToast('加载失败: ' + err.message, 'error');
  }
}

function autoSelectFirstDevice() {
  if (!selDevice || state.devices.length === 0) return;
  selDevice.value = state.devices[0].id;
  selectDevice();
}

function selectDevice() {
  if (!selDevice) return;
  const deviceId = Number(selDevice.value);
  const device = state.devices.find((d) => d.id === deviceId) || null;
  state.selectedDeviceId = deviceId || null;
  state.selectedSerial = device ? device.serial : null;

  if (!device) {
    if (btnSettings) btnSettings.disabled = true;
    setEmpty('请选择设备');
    if (deviceInfo) deviceInfo.textContent = '请选择设备';
    return;
  }

  if (btnSettings) btnSettings.disabled = false;
  if (deviceInfo) deviceInfo.textContent = device.name ? `${device.name}（${device.serial}）` : device.serial;
  refreshData();
}

async function refreshData() {
  try {
    const deviceId = state.selectedDeviceId;
    if (!deviceId) {
      setEmpty('请选择设备');
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      if (chartInfo) chartInfo.textContent = '请选择设备';
      return;
    }
    const mode = getViewMode();
    if (mode === 'list') {
      if (listView) listView.classList.remove('hidden');
      if (chartView) chartView.classList.add('hidden');
      await loadRecords(state.page);
    } else {
      if (listView) listView.classList.add('hidden');
      if (chartView) chartView.classList.remove('hidden');
      await loadChartData(deviceId, getTimeRangeHours());
    }
  } catch (err) {
    console.error('刷新失败:', err);
    showToast('刷新失败: ' + err.message, 'error');
  }
}

async function loadRecords(page) {
  if (!state.selectedDeviceId) {
    setEmpty('请选择设备');
    return;
  }
  state.page = page || 1;
  setEmpty('加载中...');
  const offset = (state.page - 1) * state.pageSize;
  const url = `/api/sensors?device_id=${state.selectedDeviceId}&limit=${state.pageSize}&offset=${offset}`;
  try {
    const res = await apiFetch(url);
    const json = await res.json();
    state.total = json.total;
    state.page = Math.floor(json.offset / state.pageSize) + 1;
    currentRecords = json.data || [];
    renderRows(currentRecords);
  } catch (err) {
    setEmpty('加载失败');
    showToast('加载失败: ' + err.message, 'error');
  }
}

async function loadChartData(deviceId, hours) {
  if (!deviceId || !chartInfo) {
    if (chartInfo) chartInfo.textContent = '请选择设备';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  const metrics = getSelectedMetrics();
  if (metrics.length === 0) {
    if (chartInfo) chartInfo.textContent = '请至少选择一个指标';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  if (chartInfo) chartInfo.textContent = '加载中...';
  try {
    const limit = 500;
    const url = `/api/sensors?device_id=${deviceId}&limit=${limit}&offset=0`;
    const res = await apiFetch(url);
    const json = await res.json();
    let data = json.data || [];
    if (data.length === 0) {
      if (chartInfo) chartInfo.textContent = '该设备无数据';
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      return;
    }
    data = data.filter(d => d.created_at);
    if (data.length === 0) { if (chartInfo) chartInfo.textContent = '数据缺少时间戳'; return; }
    data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (hours) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - hours * 3600 * 1000);
      data = data.filter(d => new Date(d.created_at) >= cutoff);
    }
    if (data.length === 0) {
      if (chartInfo) chartInfo.textContent = '所选时间段内无数据';
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      return;
    }
    currentRecords = data;

    const labels = [];
    let prevDate = null;
    data.forEach(d => {
      labels.push(formatChartLabel(d.created_at, prevDate));
      prevDate = new Date(d.created_at).toDateString();
    });

    const metricMap = {
      ph: { label: 'pH', borderColor: '#4a7cf7' },
      temperature: { label: '温度 (°C)', borderColor: '#f9a825' },
      flow: { label: '流量 (L/min)', borderColor: '#2ecf7a' },
      turbidity: { label: '浊度 (NTU)', borderColor: '#a29bfe' },
      conductivity: { label: '电导率 (μS/cm)', borderColor: '#fd79a8' }
    };

    const datasets = [];
    metrics.forEach(key => {
      const meta = metricMap[key];
      if (!meta) return;
      const values = data.map(d => { const v = parseFloat(d[key]); return isNaN(v) ? null : v; });
      if (values.every(v => v === null)) return;
      datasets.push({
        label: meta.label,
        data: values,
        borderColor: meta.borderColor,
        backgroundColor: meta.borderColor + '20',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 1,
        pointHoverRadius: 5,
        fill: false,
        spanGaps: false
      });
    });

    if (datasets.length === 0) {
      if (chartInfo) chartInfo.textContent = '所选指标无有效数据';
      return;
    }

    if (!chartCanvas) return;
    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets = datasets;
      chartInstance.update();
    } else {
      const ctx = chartCanvas.getContext('2d');
      if (!ctx) { if (chartInfo) chartInfo.textContent = '无法获取绘图上下文'; return; }
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#4a5a72', usePointStyle: true, padding: 20 }
            },
            tooltip: {
              backgroundColor: 'rgba(255,255,255,0.9)',
              titleColor: '#1a2639',
              bodyColor: '#1a2639',
              borderColor: 'rgba(74,124,247,0.1)',
              borderWidth: 1,
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (context.parsed.y !== null) label += ': ' + context.parsed.y.toFixed(2);
                  return label;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#8a9bb0', maxTicksLimit: 20, autoSkip: true },
              title: { display: true, text: '时间', color: '#8a9bb0' },
              grid: { color: 'rgba(0,0,0,0.03)' }
            },
            y: {
              ticks: { color: '#8a9bb0' },
              title: { display: true, text: '数值', color: '#8a9bb0' },
              grid: { color: 'rgba(0,0,0,0.03)' }
            }
          }
        }
      });
    }
    if (chartInfo) chartInfo.textContent = `显示 ${datasets.length} 个指标，共 ${data.length} 个数据点`;
  } catch (e) {
    console.error('图表加载异常:', e);
    if (chartInfo) chartInfo.textContent = '图表加载失败: ' + e.message;
    showToast('图表加载失败: ' + e.message, 'error');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  }
}

function gotoPage() {
  if (!state.selectedDeviceId) return;
  let page = parseInt(pageInput ? pageInput.value : 1, 10);
  if (isNaN(page) || page < 1) page = 1;
  page = Math.min(page, totalPages());
  state.page = page;
  refreshData();
}

async function openSettings() {
  if (!state.selectedSerial) return;
  if (settingsTitle) settingsTitle.textContent = state.selectedSerial;
  if (settingsForm) settingsForm.reset();
  try {
    const res = await apiFetch(`${SETTINGS_API}?serial=${encodeURIComponent(state.selectedSerial)}`);
    const json = await res.json();
    if (json.data && settingsForm) {
      SETTINGS_FIELDS.forEach((f) => {
        const el = settingsForm[f];
        if (el) el.value = json.data[f] ?? '';
      });
    }
  } catch (err) {
    showToast('阈值加载失败: ' + err.message, 'error');
  }
  if (settingsModal) settingsModal.classList.remove('hidden');
}

function closeSettings() {
  if (settingsModal) settingsModal.classList.add('hidden');
}

async function saveSettings(e) {
  e.preventDefault();
  if (!state.selectedSerial || !settingsForm) return;
  const payload = { serial: state.selectedSerial };
  SETTINGS_FIELDS.forEach((f) => {
    const el = settingsForm[f];
    if (el) {
      const v = el.value.trim();
      if (v !== '') payload[f] = v;
    }
  });
  try {
    await apiFetch(SETTINGS_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showToast('阈值保存成功', 'success');
    closeSettings();
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (err) {}
    window.location.href = '/login';
  });
}

function initApp() {
  if (selDevice) selDevice.addEventListener('change', selectDevice);
  if (btnRefresh) btnRefresh.addEventListener('click', refreshData);
  if (btnSettings) btnSettings.addEventListener('click', openSettings);
  if (btnSettingsCancel) btnSettingsCancel.addEventListener('click', closeSettings);
  if (settingsForm) settingsForm.addEventListener('submit', saveSettings);
  if (settingsModal) settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (state.page > 1) { state.page--; refreshData(); }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (state.page < totalPages()) { state.page++; refreshData(); }
    });
  }
  if (btnGoto) btnGoto.addEventListener('click', gotoPage);
  if (pageInput) pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoPage();
  });
  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', function() {
      state.pageSize = Number(this.value);
      state.page = 1;
      refreshData();
    });
  }

  if (modeSlider) {
    modeSlider.addEventListener('click', function(e) {
      e.stopPropagation();
      this.classList.toggle('chart');
      refreshData();
    });
  }

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      this.classList.toggle('active');
      if (getViewMode() === 'chart') refreshData();
    });
  });

  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('change', function() {
      if (getViewMode() === 'chart') refreshData();
    });
  }

  if (typeof initCustomSelects === 'function') {
    initCustomSelects();
  }
}

loadDevices().then(() => {
  initApp();
}).catch(err => {
  console.error('初始化失败:', err);
  showToast('初始化失败: ' + err.message, 'error');
});
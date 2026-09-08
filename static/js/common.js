// =============================================
// common.js — 公共工具函数
// =============================================

// ---------- Toast ----------
// =============================================
// common.js — 公共工具函数
// =============================================

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3000);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    throw new Error('会话已过期，请重新登录');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '请求失败');
  }
  return res;
}

function esc(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let activeGlobalDropdown = null;
function closeAllGlobalDropdown() {
  if (activeGlobalDropdown) {
    activeGlobalDropdown.menu.classList.remove('open');
    const arrow = activeGlobalDropdown.trigger.querySelector('.arrow');
    if (arrow) arrow.classList.remove('open');
    activeGlobalDropdown = null;
  }
}

function initCustomSelects() {
  const containers = document.querySelectorAll('.custom-select');
  containers.forEach(container => {
    const trigger = container.querySelector('.dropdown-trigger');
    const selectedText = trigger.querySelector('.selected-text');
    const selectId = container.dataset.selectId;
    if (!selectId) return;
    const originalSelect = document.getElementById(selectId);
    if (!originalSelect) return;

    const menuEl = document.createElement('div');
    menuEl.className = 'global-dropdown-menu';
    document.body.appendChild(menuEl);
    container._globalMenu = menuEl;

    function populateOptions() {
      menuEl.innerHTML = '';
      const options = originalSelect.options;
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const div = document.createElement('div');
        div.className = 'option' + (opt.selected ? ' selected' : '');
        div.dataset.value = opt.value;
        div.dataset.index = i;
        div.innerHTML = opt.text + (opt.selected ? ' <span class="check">✓</span>' : '');
        menuEl.appendChild(div);
      }
      const selectedOption = originalSelect.options[originalSelect.selectedIndex];
      selectedText.textContent = selectedOption ? selectedOption.text : '请选择';
    }

    function openDropdown() {
      populateOptions();
      closeAllGlobalDropdown();

      const rect = trigger.getBoundingClientRect();
      menuEl.style.left = rect.left + 'px';
      menuEl.style.top = (rect.bottom + 6) + 'px';
      menuEl.style.width = rect.width + 'px';

      const viewportH = window.innerHeight;
      const menuHeight = Math.min(240, menuEl.scrollHeight);
      if ((rect.bottom + 6 + menuHeight) > viewportH) {
        menuEl.style.top = (rect.top - 6 - menuHeight) + 'px';
      }

      menuEl.classList.add('open');
      const arrow = trigger.querySelector('.arrow');
      if (arrow) arrow.classList.add('open');
      activeGlobalDropdown = { trigger, menu: menuEl };
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (activeGlobalDropdown && activeGlobalDropdown.menu === menuEl) {
        closeAllGlobalDropdown();
        return;
      }
      openDropdown();
    });

    menuEl.addEventListener('click', function (e) {
      const option = e.target.closest('.option');
      if (!option) return;
      const index = parseInt(option.dataset.index, 10);
      originalSelect.selectedIndex = index;
      const event = new Event('change', { bubbles: true });
      originalSelect.dispatchEvent(event);
      selectedText.textContent = option.textContent.replace(' ✓', '');
      closeAllGlobalDropdown();
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
    });

    originalSelect.addEventListener('change', function () {
      const idx = this.selectedIndex;
      const opt = this.options[idx];
      if (opt) selectedText.textContent = opt.text;
    });

    const observer = new MutationObserver(() => populateOptions());
    observer.observe(originalSelect, { childList: true, subtree: true });
    container._observer = observer;

    populateOptions();
  });

  document.addEventListener('click', closeAllGlobalDropdown, true);
  window.addEventListener('scroll', closeAllGlobalDropdown);
  window.addEventListener('resize', closeAllGlobalDropdown);
}
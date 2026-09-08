// =============================================
// auth.js — 登录/注册页面逻辑（含滑块动画）
// =============================================

// ---- DOM 引用 ----
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const msgEl = document.getElementById("auth-msg");
const tabs = document.querySelectorAll(".auth-tab");
const tabsContainer = document.getElementById("authTabs");
const authBox = document.getElementById("authBox");

// ---- 判空保护 ----
if (!loginForm || !registerForm || !msgEl || !tabsContainer || !authBox) {
  console.error("❌ 关键 DOM 元素缺失，请检查 HTML 中是否包含对应 ID");
}

function showMsg(message, type = "error") {
  if (!msgEl) return;
  msgEl.textContent = message;
  msgEl.className = `auth-msg ${type}`;
}

function switchTab(tab) {
  // 1. 激活按钮
  tabs.forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });

  // 2. 切换表单
  if (loginForm) loginForm.classList.toggle("hidden", tab !== "login");
  if (registerForm) registerForm.classList.toggle("hidden", tab !== "register");

  // 3. 清空消息
  showMsg("");

  // 4. 切换滑块 + 卡片高度
  if (tab === "login") {
    tabsContainer.classList.remove("register-active");
    authBox.classList.remove("register-active");
  } else {
    tabsContainer.classList.add("register-active");
    authBox.classList.add("register-active");
  }
}

// ---- 绑定事件 ----
tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// ---- 登录/注册请求 ----
async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "请求失败");
  return json;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");
    try {
      await post("/api/auth/login", {
        username: loginForm.username.value.trim(),
        password: loginForm.password.value,
      });
      window.location.href = "/";
    } catch (err) {
      showMsg(err.message);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMsg("");
    const password = registerForm.password.value;
    const password2 = registerForm.password2.value;
    if (password !== password2) {
      showMsg("两次输入的密码不一致");
      return;
    }
    try {
      await post("/api/auth/register", {
        username: registerForm.username.value.trim(),
        password,
      });
      window.location.href = "/";
    } catch (err) {
      showMsg(err.message);
    }
  });
}
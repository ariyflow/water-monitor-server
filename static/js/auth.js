const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const msgEl = document.getElementById("auth-msg");

const tabs = document.querySelectorAll(".auth-tab");

function showMsg(message, type = "error") {
  msgEl.textContent = message;
  msgEl.className = `auth-msg ${type}`;
}

function switchTab(tab) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  loginForm.classList.toggle("hidden", tab !== "login");
  registerForm.classList.toggle("hidden", tab !== "register");
  showMsg("");
}

tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

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

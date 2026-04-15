const authPanel = document.getElementById("authPanel");
const adminApp = document.getElementById("adminApp");
const authForm = document.getElementById("authForm");
const authBtn = document.getElementById("authBtn");
const authMessage = document.getElementById("authMessage");
const authTabs = document.querySelectorAll(".auth-tab");
const nameField = document.getElementById("nameField");
const inviteField = document.getElementById("inviteField");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const inviteCodeInput = document.getElementById("inviteCode");
const userSummary = document.getElementById("userSummary");
const logoutBtn = document.getElementById("logoutBtn");
const notifyStatus = document.getElementById("notifyStatus");

const createForm = document.getElementById("create-form");
const longUrlInput = document.getElementById("longUrl");
const customCodeInput = document.getElementById("customCode");
const noteInput = document.getElementById("note");
const formMessage = document.getElementById("formMessage");
const summary = document.getElementById("summary");
const list = document.getElementById("list");
const emptyState = document.getElementById("emptyState");
const refreshBtn = document.getElementById("refreshBtn");
const submitBtn = document.getElementById("submitBtn");
const linkTemplate = document.getElementById("linkTemplate");

let authMode = "login";
let inviteCodeRequired = false;
let currentUser = null;
const defaultTitle = document.title;
let titleFlashTimer = null;

function formatTime(input) {
  if (!input) return "暂无访问";
  const date = new Date(input);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function setFormMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`.trim();
}

function setAuthMessage(text, type = "") {
  authMessage.textContent = text;
  authMessage.className = `form-message ${type}`.trim();
}

function renderCurrentUser(user) {
  currentUser = user;
  if (!user) {
    userSummary.textContent = "未登录";
    return;
  }

  userSummary.textContent = `${user.name} · ${user.email}`;
}

function updateNotifyStatus(text) {
  if (notifyStatus) {
    notifyStatus.textContent = text;
  }
}

function showAdmin(isAuthenticated) {
  authPanel.hidden = isAuthenticated;
  adminApp.hidden = !isAuthenticated;
}

function updateAuthMode(mode) {
  authMode = mode;
  authTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });

  nameField.hidden = mode !== "register";
  inviteField.hidden = mode !== "register" || !inviteCodeRequired;
  authBtn.textContent = mode === "register" ? "创建独立后台" : "登录管理台";
  passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
  setAuthMessage("");
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function playNotificationSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const notes = [
    { frequency: 880, duration: 0.12 },
    { frequency: 1174.66, duration: 0.18 }
  ];
  let offset = audioContext.currentTime;

  for (const note of notes) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, offset);
    gainNode.gain.setValueAtTime(0.0001, offset);
    gainNode.gain.exponentialRampToValueAtTime(0.18, offset + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, offset + note.duration);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(offset);
    oscillator.stop(offset + note.duration);
    offset += note.duration * 0.92;
  }

  window.setTimeout(() => {
    audioContext.close().catch(() => {});
  }, 800);
}

function flashTitle(message) {
  if (titleFlashTimer) {
    window.clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }

  let tick = 0;
  titleFlashTimer = window.setInterval(() => {
    document.title = tick % 2 === 0 ? message : defaultTitle;
    tick += 1;

    if (tick > 7 || document.visibilityState === "visible") {
      window.clearInterval(titleFlashTimer);
      titleFlashTimer = null;
      document.title = defaultTitle;
    }
  }, 900);
}

async function tryNotify(title, body) {
  if (!("Notification" in window)) {
    updateNotifyStatus("当前浏览器不支持系统通知，仍会播放提示音。");
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body });
    updateNotifyStatus("提示音和浏览器通知已启用。");
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
      updateNotifyStatus("提示音和浏览器通知已启用。");
      return;
    }
  }

  updateNotifyStatus("提示音已启用；如果你允许浏览器通知，完成时还会弹出提醒。");
}

async function notifyTaskDone(shortUrl) {
  playNotificationSound();
  flashTitle("短链已生成");
  await tryNotify("短链接已生成", `可以复制并发送：${shortUrl}`);
}

function renderLinks(links) {
  list.innerHTML = "";

  if (!links.length) {
    emptyState.hidden = false;
    summary.textContent = "当前共 0 条短链。";
    return;
  }

  emptyState.hidden = true;
  const totalVisits = links.reduce((sum, item) => sum + Number(item.visits || 0), 0);
  summary.textContent = `当前共 ${links.length} 条短链，累计跳转 ${totalVisits} 次。`;

  for (const item of links) {
    const fragment = linkTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".link-card");
    const shortLink = fragment.querySelector(".short-link");
    const badge = fragment.querySelector(".badge");
    const longLink = fragment.querySelector(".long-link");
    const meta = fragment.querySelector(".meta");
    const copyBtn = fragment.querySelector(".copy-btn");
    const openShortBtn = fragment.querySelector(".open-short-btn");
    const openBtn = fragment.querySelector(".open-btn");
    const deleteBtn = fragment.querySelector(".delete-btn");

    shortLink.href = item.shortUrl;
    shortLink.textContent = item.shortUrl;
    badge.textContent = `${item.visits} 次访问`;
    longLink.textContent = item.longUrl;
    meta.textContent = `备注：${item.note || "无"} | 创建：${formatTime(item.createdAt)} | 最后访问：${formatTime(item.lastVisitedAt)}`;

    copyBtn.addEventListener("click", async () => {
      try {
        await copyText(item.shortUrl);
        copyBtn.textContent = "已复制";
        window.setTimeout(() => {
          copyBtn.textContent = "复制短链";
        }, 1200);
      } catch (error) {
        alert("复制失败，请手动复制");
      }
    });

    openBtn.href = item.longUrl;
    openBtn.textContent = "打开原链接";
    openShortBtn.href = item.shortUrl;
    openShortBtn.textContent = "打开短链接";

    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm(`确认删除短链 ${item.shortUrl} 吗？`);
      if (!confirmed) return;

      const response = await fetch(`/api/links/${encodeURIComponent(item.code)}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        alert(payload.error || "删除失败");
        return;
      }

      card.remove();
      await loadLinks();
    });

    list.appendChild(fragment);
  }
}

async function loadLinks() {
  const response = await fetch("/api/links");
  if (response.status === 401) {
    renderCurrentUser(null);
    showAdmin(false);
    summary.textContent = "";
    return;
  }

  const payload = await response.json();
  renderCurrentUser(payload.user || null);
  renderLinks(payload.links || []);
}

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    updateAuthMode(tab.dataset.mode);
  });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");
  authBtn.disabled = true;
  authBtn.textContent = authMode === "register" ? "创建中..." : "登录中...";

  try {
    const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload = {
      email: emailInput.value,
      password: passwordInput.value
    };

    if (authMode === "register") {
      payload.name = nameInput.value;
      payload.inviteCode = inviteCodeInput.value;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setAuthMessage(data.error || `${authMode === "register" ? "注册" : "登录"}失败`, "error");
      return;
    }

    renderCurrentUser(data.user || null);
    showAdmin(true);
    authForm.reset();
    setAuthMessage(authMode === "register" ? "注册成功，已进入你的后台" : "登录成功", "success");
    await loadLinks();
  } catch (error) {
    setAuthMessage("网络异常，请稍后再试", "error");
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = authMode === "register" ? "创建独立后台" : "登录管理台";
  }
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormMessage("");
  submitBtn.disabled = true;
  submitBtn.textContent = "生成中...";

  try {
    const response = await fetch("/api/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        longUrl: longUrlInput.value,
        customCode: customCodeInput.value,
        note: noteInput.value
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      setFormMessage(payload.error || "生成失败，请稍后再试", "error");
      return;
    }

    const shortUrl = payload.link.shortUrl;
    setFormMessage(`短链接已生成：${shortUrl}`, "success");
    await copyText(shortUrl).catch(() => {});
    await notifyTaskDone(shortUrl);
    createForm.reset();
    await loadLinks();
  } catch (error) {
    setFormMessage("网络异常，生成失败", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "生成短链接";
  }
});

refreshBtn.addEventListener("click", () => {
  loadLinks().catch(() => {
    summary.textContent = "列表刷新失败，请稍后再试。";
  });
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", {
    method: "POST"
  }).catch(() => {});
  renderCurrentUser(null);
  setFormMessage("");
  setAuthMessage("你已退出登录", "success");
  showAdmin(false);
});

async function bootstrap() {
  try {
    const response = await fetch("/api/auth/status");
    const payload = await response.json();

    inviteCodeRequired = Boolean(payload.inviteCodeRequired);
    updateAuthMode("login");
    renderCurrentUser(payload.user || null);
    showAdmin(Boolean(payload.authenticated));

    if (payload.authenticated) {
      await loadLinks();
      return;
    }

    updateNotifyStatus("生成成功后会播放提示音，并尝试发送浏览器提醒。");
  } catch (error) {
    setAuthMessage("后台状态检测失败，请确认服务已正常启动。", "error");
  }
}

bootstrap();

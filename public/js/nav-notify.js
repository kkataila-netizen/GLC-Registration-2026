/* ============================================================
   Nav notification – polls for unread chat messages.
   Shows a toast banner + nav badge + browser notification.
   ============================================================ */
(() => {
  "use strict";

  const POLL_INTERVAL = 8000;
  const API = "/chat-api";
  let lastUnread = -1; // -1 = first check
  let notificationsGranted = false;
  let toast = null;

  function getUser() {
    try {
      const stored = localStorage.getItem("glc-user");
      if (stored) return JSON.parse(stored);
      const chat = localStorage.getItem("glc-chat-user");
      if (chat) return JSON.parse(chat);
    } catch { /* ignore */ }
    return null;
  }

  function getPeopleLink() {
    const links = document.querySelectorAll(".top-nav__links a");
    for (const a of links) {
      if (a.getAttribute("href") === "/people.html") return a;
    }
    return null;
  }

  /* ── Toast banner ──────────────────────────────── */
  function createToast() {
    if (toast) return toast;
    toast = document.createElement("div");
    toast.className = "chat-toast";
    toast.innerHTML = `
      <span class="chat-toast__icon">💬</span>
      <span class="chat-toast__text"></span>
      <button class="chat-toast__open">Open Chat</button>
      <button class="chat-toast__close">&times;</button>
    `;
    toast.hidden = true;
    document.body.appendChild(toast);

    toast.querySelector(".chat-toast__close").addEventListener("click", () => {
      toast.hidden = true;
    });
    toast.querySelector(".chat-toast__open").addEventListener("click", () => {
      window.open("/chat.html", "glc-chat", "width=960,height=700");
      toast.hidden = true;
    });
    return toast;
  }

  function showToast(count) {
    const t = createToast();
    t.querySelector(".chat-toast__text").textContent =
      `You have ${count} unread message${count !== 1 ? "s" : ""}`;
    t.hidden = false;
  }

  /* ── Nav badge ─────────────────────────────────── */
  function updateBadge(link, count) {
    let badge = link.querySelector(".nav-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-badge";
        link.style.position = "relative";
        link.appendChild(badge);
      }
      badge.textContent = count > 99 ? "99+" : count;
      badge.hidden = false;

      const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
      document.title = `(${count > 99 ? "99+" : count}) ${baseTitle}`;
    } else {
      if (badge) badge.hidden = true;
      if (toast) toast.hidden = true;
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
    }
  }

  /* ── Browser notification ──────────────────────── */
  function sendBrowserNotification(count) {
    if (!notificationsGranted) return;
    if (document.hasFocus()) return;
    try {
      new Notification("GLC Chat", {
        body: `You have ${count} unread message${count !== 1 ? "s" : ""}`,
        tag: "glc-chat"
      });
    } catch { /* ignore */ }
  }

  /* ── Poll ───────────────────────────────────────── */
  async function checkUnread(user, link) {
    try {
      const res = await fetch(`${API}/unread?user=${encodeURIComponent(user.email)}`);
      if (!res.ok) return;
      const { unread } = await res.json();

      // New messages arrived
      if (unread > 0 && unread > lastUnread && lastUnread >= 0) {
        showToast(unread);
        sendBrowserNotification(unread);
      }

      updateBadge(link, unread);
      lastUnread = unread;
    } catch { /* network error – skip */ }
  }

  function init() {
    const user = getUser();
    if (!user) return;

    const link = getPeopleLink();
    if (!link) return;

    // Inject toast styles
    const style = document.createElement("style");
    style.textContent = `
      .chat-toast {
        position: fixed;
        top: 60px;
        right: 1rem;
        display: flex;
        align-items: center;
        gap: .625rem;
        padding: .625rem 1rem;
        background: #1e293b;
        color: #fff;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,.2);
        z-index: 9999;
        font-family: inherit;
        font-size: .875rem;
        animation: toastSlide .35s ease;
      }
      .chat-toast[hidden] { display: none; }
      .chat-toast__icon { font-size: 1.25rem; }
      .chat-toast__text { flex: 1; }
      .chat-toast__open {
        padding: .3125rem .75rem;
        border: none;
        border-radius: 6px;
        background: #395542;
        color: #fff;
        font-size: .8125rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .chat-toast__open:hover { background: #2d4435; }
      .chat-toast__close {
        background: none;
        border: none;
        color: rgba(255,255,255,.5);
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0 .25rem;
        line-height: 1;
      }
      .chat-toast__close:hover { color: #fff; }
      @keyframes toastSlide {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // Request notification permission
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        notificationsGranted = true;
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(p => {
          notificationsGranted = p === "granted";
        });
      }
    }

    checkUnread(user, link);
    setInterval(() => checkUnread(user, link), POLL_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

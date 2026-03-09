/* ============================================================
   Nav notification – polls for unread chat messages.
   Shows a toast banner + nav badge + browser notification.

   Toast stays visible as long as unread > 0.
   Only resets when user clicks "Open Chat" (marks all read).
   The × button hides the toast temporarily until new messages.
   ============================================================ */
(() => {
  "use strict";

  const POLL_INTERVAL = 8000;
  const API = "/chat-api";
  let lastUnread = 0;
  let toastDismissed = false;   // true after user clicks ×
  let notificationsGranted = false;
  let toast = null;
  let currentUser = null;

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
      const href = a.getAttribute("href") || "";
      if (href === "/people.html" || href === "/people") return a;
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

    // × button: hide temporarily (reappears if new messages arrive)
    toast.querySelector(".chat-toast__close").addEventListener("click", () => {
      toast.hidden = true;
      toastDismissed = true;
    });

    // Open Chat: mark ALL messages as read, then open chat window
    toast.querySelector(".chat-toast__open").addEventListener("click", async () => {
      toast.hidden = true;
      window.open("/chat.html", "glc-chat", "width=960,height=700");
      // Mark all conversations as read so unread resets to 0
      if (currentUser) {
        try {
          await fetch(`${API}/mark-all-read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user: currentUser.email })
          });
        } catch { /* ignore */ }
      }
    });
    return toast;
  }

  function showToast(count) {
    const t = createToast();
    t.querySelector(".chat-toast__text").textContent =
      `You have ${count} unread message${count !== 1 ? "s" : ""}`;
    t.hidden = false;
  }

  function hideToast() {
    if (toast) toast.hidden = true;
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

      // Update badge + title (always reflects true count)
      updateBadge(link, unread);

      if (unread > 0) {
        // New messages arrived (count went up) → reset dismiss, show toast
        if (unread > lastUnread) {
          toastDismissed = false;
          showToast(unread);
          sendBrowserNotification(unread);
        }
        // Still have unread and user hasn't dismissed → keep toast visible
        else if (!toastDismissed) {
          showToast(unread);
        }
      } else {
        // All read → hide everything, reset dismiss state
        hideToast();
        toastDismissed = false;
      }

      lastUnread = unread;
    } catch { /* network error – skip */ }
  }

  function init() {
    const user = getUser();
    if (!user) return;
    currentUser = user;

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

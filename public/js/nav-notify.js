/* ============================================================
   Nav notification badge – polls for unread chat messages
   and highlights the People tab when new messages arrive.
   Also sends a browser notification for new messages.
   ============================================================ */
(() => {
  "use strict";

  const POLL_INTERVAL = 8000; // 8 seconds
  const API = "/chat-api";
  let lastUnread = 0;
  let notificationsGranted = false;

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

      // Pulse animation on new messages
      if (count > lastUnread) {
        link.classList.add("nav-link--notify");
        setTimeout(() => link.classList.remove("nav-link--notify"), 2000);
      }

      // Update page title with unread count
      const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
      document.title = `(${count > 99 ? "99+" : count}) ${baseTitle}`;
    } else {
      if (badge) badge.hidden = true;
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
    }
  }

  function sendBrowserNotification(count) {
    if (!notificationsGranted) return;
    if (document.hasFocus()) return; // only notify when tab is not focused

    try {
      new Notification("GLC Chat", {
        body: `You have ${count} unread message${count !== 1 ? "s" : ""}`,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23395542'/><text x='16' y='22' text-anchor='middle' fill='white' font-size='18' font-weight='bold'>G</text></svg>",
        tag: "glc-chat" // prevents duplicate notifications
      });
    } catch { /* ignore */ }
  }

  async function checkUnread(user, link) {
    try {
      const res = await fetch(`${API}/unread?user=${encodeURIComponent(user.email)}`);
      if (!res.ok) return;
      const { unread } = await res.json();

      // Browser notification when count increases
      if (unread > lastUnread && lastUnread >= 0) {
        sendBrowserNotification(unread);
      }

      updateBadge(link, unread);
      lastUnread = unread;
    } catch { /* network error – skip silently */ }
  }

  function init() {
    const user = getUser();
    if (!user) return;

    const link = getPeopleLink();
    if (!link) return;

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

    // Initial check
    checkUnread(user, link);

    // Poll periodically
    setInterval(() => checkUnread(user, link), POLL_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

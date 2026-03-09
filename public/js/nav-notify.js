/* ============================================================
   Nav notification badge – polls for unread chat messages
   and highlights the People tab when new messages arrive.
   ============================================================ */
(() => {
  "use strict";

  const POLL_INTERVAL = 15000; // 15 seconds
  const API = "/chat-api";

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

      // Update page title with unread count
      const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
      document.title = `(${count > 99 ? "99+" : count}) ${baseTitle}`;
    } else {
      if (badge) badge.hidden = true;
      // Restore original title
      document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
    }
  }

  async function checkUnread(user, link) {
    try {
      const res = await fetch(`${API}/unread?user=${encodeURIComponent(user.email)}`);
      if (!res.ok) return;
      const { unread } = await res.json();
      updateBadge(link, unread);
    } catch { /* network error – skip silently */ }
  }

  function init() {
    const user = getUser();
    if (!user) return; // not logged in – nothing to notify

    const link = getPeopleLink();
    if (!link) return; // no People link on this page

    // Initial check
    checkUnread(user, link);

    // Poll periodically
    setInterval(() => checkUnread(user, link), POLL_INTERVAL);
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

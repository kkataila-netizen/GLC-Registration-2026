/* ============================================================
   GLC Chat – simplified client
   ============================================================ */
(() => {
  "use strict";

  const API = "/chat-api";
  const POLL_MS = 3000;

  /* ── state ─────────────────────────────────────── */
  let me = null;
  let users = [];
  let activeConvId = null;
  let messages = [];
  let lastMsgTs = null;
  let pollTimer = null;

  const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#d97706",
                  "#0891b2","#be185d","#4f46e5","#16a34a","#ea580c"];

  /* ── DOM refs ──────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const loginPrompt = $("loginPrompt");
  const app         = $("app");
  const userSearch  = $("userSearch");
  const userList    = $("userList");
  const chatEmpty   = $("chatEmpty");
  const chatActive  = $("chatActive");
  const chatTitle   = $("chatTitle");
  const chatMessages = $("chatMessages");
  const msgInput    = $("msgInput");
  const sendBtn     = $("sendBtn");

  /* ── helpers ───────────────────────────────────── */
  function esc(s) {
    const d = document.createElement("div"); d.textContent = s; return d.innerHTML;
  }
  function initials(name) {
    const p = name.trim().split(/\s+/);
    return p.length > 1 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
  }
  function colorFor(name) {
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return COLORS[Math.abs(h) % COLORS.length];
  }
  function timeStr(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function dateLabel(iso) {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0,0,0,0);
    const day = new Date(d); day.setHours(0,0,0,0);
    const diff = (today - day) / 86400000;
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return res.json();
  }

  /* ── init ──────────────────────────────────────── */
  async function init() {
    // Must be logged in
    const stored = localStorage.getItem("glc-user") || localStorage.getItem("glc-chat-user");
    if (!stored) {
      loginPrompt.hidden = false;
      return;
    }
    me = JSON.parse(stored);

    // Load users
    try {
      const data = await api("/users");
      users = data.users || [];
    } catch {
      users = [];
    }

    if (!users.some(u => u.email === me.email)) {
      loginPrompt.hidden = false;
      return;
    }

    app.hidden = false;
    renderUserList("");

    userSearch.addEventListener("input", () => renderUserList(userSearch.value));

    // If opened with ?dm= param, auto-open that conversation
    const dmTarget = new URLSearchParams(window.location.search).get("dm");
    if (dmTarget) openDM(dmTarget);
  }

  /* ── user list (sidebar) ───────────────────────── */
  function renderUserList(q) {
    const term = q.toLowerCase();
    const others = users.filter(u =>
      u.email !== me.email &&
      (u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    );

    userList.innerHTML = others.map(u => {
      const active = activeConvId && activeConvId === dmIdFor(u.email) ? "user-item--active" : "";
      return `
        <div class="user-item ${active}" data-email="${esc(u.email)}">
          <div class="user-item__avatar" style="background:${colorFor(u.name)}">${initials(u.name)}</div>
          <div class="user-item__info">
            <div class="user-item__name">${esc(u.name)}</div>
            ${u.organization ? `<div class="user-item__org">${esc(u.organization)}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    userList.querySelectorAll(".user-item").forEach(el => {
      el.addEventListener("click", () => openDM(el.dataset.email));
    });
  }

  function dmIdFor(email) {
    const sorted = [me.email, email].sort();
    return `dm:${sorted[0]}:${sorted[1]}`;
  }

  /* ── open DM ───────────────────────────────────── */
  async function openDM(targetEmail) {
    const sorted = [me.email, targetEmail].sort();
    const convId = `dm:${sorted[0]}:${sorted[1]}`;

    // Create conversation if it doesn't exist
    await api("/conversations", {
      method: "POST",
      body: { type: "dm", members: [me.email, targetEmail] }
    });

    activeConvId = convId;
    lastMsgTs = null;
    messages = [];

    // Update UI
    const target = users.find(u => u.email === targetEmail);
    chatTitle.textContent = target ? target.name : targetEmail;
    chatEmpty.style.display = "none";
    chatActive.hidden = false;
    app.classList.add("app--chat-open");
    renderUserList(userSearch.value);

    await loadMessages();
    await markRead();

    // Start polling
    clearInterval(pollTimer);
    pollTimer = setInterval(pollMessages, POLL_MS);

    msgInput.focus();
  }

  /* ── messages ──────────────────────────────────── */
  async function loadMessages() {
    const { messages: m } = await api(`/conversations/${encodeURIComponent(activeConvId)}/messages`);
    messages = m;
    if (m.length) lastMsgTs = m[m.length - 1].timestamp;
    renderMessages();
    scrollToBottom();
  }

  async function pollMessages() {
    if (!activeConvId) return;
    const since = lastMsgTs ? `?since=${encodeURIComponent(lastMsgTs)}` : "";
    const { messages: newMsgs } = await api(`/conversations/${encodeURIComponent(activeConvId)}/messages${since}`);
    if (newMsgs && newMsgs.length) {
      for (const m of newMsgs) {
        if (!messages.some(x => x.id === m.id)) messages.push(m);
      }
      lastMsgTs = messages[messages.length - 1].timestamp;
      renderMessages();
      scrollToBottom();
      await markRead();
    }
  }

  function renderMessages() {
    let html = "";
    let lastDate = "";

    for (const m of messages) {
      const d = dateLabel(m.timestamp);
      if (d !== lastDate) {
        html += `<div class="date-sep">${d}</div>`;
        lastDate = d;
      }
      const isMine = m.sender === me.email;
      const cls = isMine ? "msg--mine" : "msg--other";

      html += `
        <div class="msg ${cls}">
          <div>
            <div class="msg__bubble">${esc(m.text)}</div>
            <div class="msg__time">${timeStr(m.timestamp)}</div>
          </div>
        </div>
      `;
    }
    chatMessages.innerHTML = html;
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /* ── send message ──────────────────────────────── */
  async function sendMessage(text) {
    if (!activeConvId || !text) return;
    await api(`/conversations/${encodeURIComponent(activeConvId)}/messages`, {
      method: "POST",
      body: { sender: me.email, senderName: me.name, text, type: "text", fileData: "", fileName: "" }
    });
    lastMsgTs = null;
    await loadMessages();
  }

  sendBtn.addEventListener("click", () => {
    const t = msgInput.value.trim();
    if (t) { sendMessage(t); msgInput.value = ""; }
  });

  msgInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  /* ── read receipts ─────────────────────────────── */
  async function markRead() {
    if (!activeConvId) return;
    await api(`/conversations/${encodeURIComponent(activeConvId)}/read`, {
      method: "POST",
      body: { user: me.email }
    });
  }

  /* ── init ──────────────────────────────────────── */
  init();
})();

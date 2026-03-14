/* ============================================================
   GLC Chat – simplified client with group support
   ============================================================ */
(() => {
  "use strict";

  const API = "/chat-api";
  const POLL_MS = 3000;
  const BROADCAST_CONV_ID = "group:broadcast-communications";
  const ADMIN_EMAIL = "kkataila@banyansoftware.com";

  /* ── state ─────────────────────────────────────── */
  let me = null;
  let users = [];
  let groups = [];  // group conversations the user belongs to
  let unreadCounts = {};  // convId → unread count
  let activeConvId = null;
  let activeConvType = "dm"; // "dm" or "group"
  let messages = [];
  let lastMsgTs = null;
  let pollTimer = null;
  let unreadTimer = null;

  const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#d97706",
                  "#0891b2","#be185d","#4f46e5","#16a34a","#ea580c"];

  /* ── DOM refs ──────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const loginPrompt  = $("loginPrompt");
  const app          = $("app");
  const userSearch   = $("userSearch");
  const userList     = $("userList");
  const chatEmpty    = $("chatEmpty");
  const chatActive   = $("chatActive");
  const chatTitle    = $("chatTitle");
  const chatMessages = $("chatMessages");
  const msgInput     = $("msgInput");
  const sendBtn      = $("sendBtn");
  const addPersonBtn = $("addPersonBtn");

  // Modal refs
  const addPeopleModal   = $("addPeopleModal");
  const addPeopleList    = $("addPeopleList");
  const addPeopleClose   = $("addPeopleClose");
  const addPeopleCancel  = $("addPeopleCancel");
  const addPeopleConfirm = $("addPeopleConfirm");
  const groupNameInput   = $("groupNameInput");

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
  function nameFor(email) {
    const u = users.find(u => u.email === email);
    return u ? u.name : email;
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return res.json();
  }

  /* ── unread counts ────────────────────────────────── */
  async function loadUnreadCounts() {
    try {
      const data = await api(`/unread-per-conv?user=${encodeURIComponent(me.email)}`);
      unreadCounts = data.counts || {};
    } catch {
      unreadCounts = {};
    }
    renderSidebar(userSearch ? userSearch.value : "");
  }

  /* ── init ──────────────────────────────────────── */
  async function init() {
    const stored = localStorage.getItem("glc-user") || localStorage.getItem("glc-chat-user");
    if (!stored) {
      loginPrompt.hidden = false;
      return;
    }
    me = JSON.parse(stored);

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

    // Load group conversations + unread counts
    try {
      const convData = await api(`/conversations?user=${encodeURIComponent(me.email)}`);
      groups = (convData.conversations || []).filter(c => c.type === "group");
    } catch {
      groups = [];
    }
    await loadUnreadCounts();

    app.hidden = false;
    renderSidebar("");

    userSearch.addEventListener("input", () => renderSidebar(userSearch.value));

    // Poll unread counts every 10 seconds to keep sidebar badges fresh
    unreadTimer = setInterval(loadUnreadCounts, 10000);

    // If opened with ?conv= param, auto-open that conversation (DM or group)
    const params = new URLSearchParams(window.location.search);
    const convParam = params.get("conv");
    const dmTarget = params.get("dm");

    if (convParam) {
      if (convParam.startsWith("dm:")) {
        // Extract the other person's email from dm:email1:email2
        const parts = convParam.split(":");
        const otherEmail = parts[1] === me.email ? parts[2] : parts[1];
        openDM(otherEmail);
      } else if (convParam.startsWith("group:")) {
        // Find the group in our loaded groups list
        const group = groups.find(g => g.id === convParam);
        if (group) {
          openGroup(group.id, group.name);
        }
      }
    } else if (dmTarget) {
      openDM(dmTarget);
    }
  }

  /* ── sidebar (groups + users) ────────────────────── */
  function renderSidebar(q) {
    const term = q.toLowerCase();
    let html = "";

    // Groups section
    const matchingGroups = groups.filter(g =>
      g.name.toLowerCase().includes(term)
    );
    if (matchingGroups.length) {
      html += `<div class="sidebar__section-label">Groups</div>`;
      html += matchingGroups.map(g => {
        const active = activeConvId === g.id ? "user-item--active" : "";
        const memberCount = g.members.length;
        const unread = unreadCounts[g.id] || 0;
        const badgeHtml = unread > 0 ? `<span class="user-item__badge">${unread > 99 ? "99+" : unread}</span>` : "";
        return `
          <div class="user-item ${active}" data-group-id="${esc(g.id)}" data-group-name="${esc(g.name)}">
            <div class="user-item__avatar" style="background:${colorFor(g.name)}">${initials(g.name)}</div>
            <div class="user-item__info">
              <div class="user-item__name">${esc(g.name)}</div>
              <div class="user-item__org">${memberCount} member${memberCount !== 1 ? "s" : ""}</div>
            </div>
            ${badgeHtml}
          </div>
        `;
      }).join("");
    }

    // People section
    const others = users.filter(u =>
      u.email !== me.email &&
      (u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    );
    if (others.length) {
      if (matchingGroups.length) {
        html += `<div class="sidebar__section-label">People</div>`;
      }
      html += others.map(u => {
        const convId = dmIdFor(u.email);
        const active = activeConvId && activeConvId === convId ? "user-item--active" : "";
        const unread = unreadCounts[convId] || 0;
        const badgeHtml = unread > 0 ? `<span class="user-item__badge">${unread > 99 ? "99+" : unread}</span>` : "";
        return `
          <div class="user-item ${active}" data-email="${esc(u.email)}">
            <div class="user-item__avatar" style="background:${colorFor(u.name)}">${initials(u.name)}</div>
            <div class="user-item__info">
              <div class="user-item__name">${esc(u.name)}</div>
              ${u.organization ? `<div class="user-item__org">${esc(u.organization)}</div>` : ""}
            </div>
            ${badgeHtml}
          </div>
        `;
      }).join("");
    }

    userList.innerHTML = html;

    // Wire up click handlers
    userList.querySelectorAll("[data-email]").forEach(el => {
      el.addEventListener("click", () => openDM(el.dataset.email));
    });
    userList.querySelectorAll("[data-group-id]").forEach(el => {
      el.addEventListener("click", () => openGroup(el.dataset.groupId, el.dataset.groupName));
    });
  }

  function dmIdFor(email) {
    const sorted = [me.email, email].sort();
    return `dm:${sorted[0]}:${sorted[1]}`;
  }

  /* ── open conversation (DM or group) ────────────── */
  async function openConversation(convId, title, type) {
    activeConvId = convId;
    activeConvType = type;
    lastMsgTs = null;
    messages = [];

    chatTitle.textContent = title;
    chatEmpty.style.display = "none";
    chatActive.hidden = false;
    app.classList.add("app--chat-open");
    renderSidebar(userSearch.value);

    await loadMessages();
    await markRead();

    // Clear unread badge for this conversation immediately
    delete unreadCounts[convId];
    renderSidebar(userSearch.value);

    clearInterval(pollTimer);
    pollTimer = setInterval(pollMessages, POLL_MS);

    // Broadcast channel is read-only for non-admin users
    const inputArea = document.querySelector(".chat__input-area");
    if (convId === BROADCAST_CONV_ID && me.email !== ADMIN_EMAIL) {
      inputArea.style.display = "none";
    } else {
      inputArea.style.display = "";
      msgInput.focus();
    }
  }

  async function openDM(targetEmail) {
    const sorted = [me.email, targetEmail].sort();
    const convId = `dm:${sorted[0]}:${sorted[1]}`;

    await api("/conversations", {
      method: "POST",
      body: { type: "dm", members: [me.email, targetEmail] }
    });

    const target = users.find(u => u.email === targetEmail);
    await openConversation(convId, target ? target.name : targetEmail, "dm");
  }

  async function openGroup(convId, groupName) {
    await openConversation(convId, groupName, "group");
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
      // Don't auto-mark as read on poll — only mark read when
      // the receiver explicitly opens/clicks the conversation (openDM)
    }
  }

  function renderMessages() {
    let html = "";
    let lastDate = "";
    const isGroup = activeConvType === "group";

    for (const m of messages) {
      const d = dateLabel(m.timestamp);
      if (d !== lastDate) {
        html += `<div class="date-sep">${d}</div>`;
        lastDate = d;
      }
      const isMine = m.sender === me.email;
      const cls = isMine ? "msg--mine" : "msg--other";

      // In group chats, show sender name on other people's messages
      const senderLabel = (isGroup && !isMine)
        ? `<div class="msg__sender">${esc(m.senderName || nameFor(m.sender))}</div>`
        : "";

      html += `
        <div class="msg ${cls}">
          <div>
            ${senderLabel}
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

  /* ── Add People modal ──────────────────────────── */
  function getCurrentMembers() {
    // For a DM, extract the two member emails from the conv ID
    if (activeConvId.startsWith("dm:")) {
      const parts = activeConvId.split(":");
      return [parts[1], parts[2]];
    }
    // For groups we don't have member data cached — return just me
    return [me.email];
  }

  function showAddPeopleModal() {
    const currentMembers = getCurrentMembers();

    // Build the people checklist
    addPeopleList.innerHTML = users.map(u => {
      const isMember = currentMembers.includes(u.email);
      const isMe = u.email === me.email;
      const label = isMe ? `${esc(u.name)} (you)` : esc(u.name);
      const mutedClass = isMember ? "modal__person-name--muted" : "";

      return `
        <label class="modal__person">
          <input type="checkbox" value="${esc(u.email)}"
            ${isMember ? "checked disabled" : ""}>
          <span class="modal__person-name ${mutedClass}">${label}</span>
        </label>
      `;
    }).join("");

    groupNameInput.value = "";
    addPeopleModal.hidden = false;
    groupNameInput.focus();
  }

  function hideAddPeopleModal() {
    addPeopleModal.hidden = true;
  }

  async function createGroupFromModal() {
    const name = groupNameInput.value.trim();
    if (!name) {
      groupNameInput.focus();
      return;
    }

    // Gather all checked emails
    const checked = [...addPeopleList.querySelectorAll("input[type=checkbox]:checked")]
      .map(cb => cb.value);

    if (checked.length < 2) return; // need at least 2 people

    // Make sure current user is included
    if (!checked.includes(me.email)) checked.push(me.email);

    // Create group conversation
    const { conversation } = await api("/conversations", {
      method: "POST",
      body: { type: "group", name, members: checked }
    });

    // Add to local groups list so it appears in sidebar
    if (!groups.some(g => g.id === conversation.id)) {
      groups.push(conversation);
    }

    hideAddPeopleModal();

    // Switch to the new group
    await openGroup(conversation.id, conversation.name);
  }

  // Wire up modal buttons
  addPersonBtn.addEventListener("click", showAddPeopleModal);
  addPeopleClose.addEventListener("click", hideAddPeopleModal);
  addPeopleCancel.addEventListener("click", hideAddPeopleModal);
  addPeopleConfirm.addEventListener("click", createGroupFromModal);

  // Close modal on overlay click
  addPeopleModal.addEventListener("click", e => {
    if (e.target === addPeopleModal) hideAddPeopleModal();
  });

  // Close modal on Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !addPeopleModal.hidden) hideAddPeopleModal();
  });

  /* ── init ──────────────────────────────────────── */
  init();
})();

/* ============================================================
   GLC Chat – vanilla JS client
   ============================================================ */
(() => {
  "use strict";

  const API = "/chat-api";
  const POLL_MSG = 3000;
  const POLL_PRESENCE = 15000;
  const POLL_TYPING = 2000;
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

  /* ── state ───────────────────────────────────────── */
  let me = null;                 // { name, email }
  let users = [];                // all registered users
  let conversations = [];        // user's conversations
  let activeConvId = null;       // currently open conversation
  let messages = [];             // messages in active conv
  let presence = {};             // { email: { name, online } }
  let pollTimers = {};           // interval IDs
  let lastMsgTs = null;          // for incremental polling
  let reactionTargetMsgId = null;

  const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#d97706",
                  "#0891b2","#be185d","#4f46e5","#16a34a","#ea580c"];

  /* ── DOM refs ────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const identityModal  = $("identityModal");
  const identitySearch = $("identitySearch");
  const identityList   = $("identityList");
  const groupModal     = $("groupModal");
  const groupName      = $("groupName");
  const groupMemberSearch = $("groupMemberSearch");
  const groupMemberList = $("groupMemberList");
  const groupCancel    = $("groupCancel");
  const groupCreate    = $("groupCreate");
  const app            = $("app");
  const convSearch     = $("convSearch");
  const convList       = $("convList");
  const myAvatar       = $("myAvatar");
  const myName         = $("myName");
  const onlineCount    = $("onlineCount");
  const chatEmpty      = $("chatEmpty");
  const chatActive     = $("chatActive");
  const chatTitle      = $("chatTitle");
  const chatSubtitle   = $("chatSubtitle");
  const chatSettingsBtn = $("chatSettingsBtn");
  const chatMessages   = $("chatMessages");
  const typingIndicator = $("typingIndicator");
  const typingText     = $("typingText");
  const msgInput       = $("msgInput");
  const sendBtn        = $("sendBtn");
  const fileInput      = $("fileInput");
  const emojiTrigger   = $("emojiTrigger");
  const emojiPicker    = $("emojiPicker");
  const reactionPicker = $("reactionPicker");
  const newGroupBtn    = $("newGroupBtn");
  const gsModal        = $("groupSettingsModal");
  const gsName         = $("gsName");
  const gsMemberSearch = $("gsMemberSearch");
  const gsMemberList   = $("gsMemberList");
  const gsCancel       = $("gsCancel");
  const gsSave         = $("gsSave");

  /* ── utilities ───────────────────────────────────── */
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
  function avatarHtml(name, cls = "") {
    return `<div class="avatar ${cls}" style="background:${colorFor(name)}">${initials(name)}</div>`;
  }
  function timeStr(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  function convDisplayName(conv) {
    if (conv.type === "group") return conv.name;
    const other = conv.members.find(m => m !== me.email);
    const u = users.find(u => u.email === other);
    return u ? u.name : other;
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return res.json();
  }

  /* ── identity ────────────────────────────────────── */
  async function init() {
    try {
      const data = await api("/users");
      users = data.users || [];
    } catch (e) {
      console.error("Failed to load users:", e);
      users = [];
    }

    if (users.length === 0) {
      identityList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-muted)">No registered attendees found. <a href=\"/\" target=\"_blank\">Register first</a>.</div>';
      return;
    }

    // Check persisted login (from registration/login page)
    const loggedIn = localStorage.getItem("glc-user");
    if (loggedIn) {
      const parsed = JSON.parse(loggedIn);
      if (users.some(u => u.email === parsed.email)) {
        me = parsed;
        identityModal.hidden = true;
        startApp();
        return;
      }
    }

    // Fallback: check old chat-only identity
    const saved = localStorage.getItem("glc-chat-user");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (users.some(u => u.email === parsed.email)) {
        me = parsed;
        identityModal.hidden = true;
        startApp();
        return;
      }
    }
    showIdentityModal();
  }

  function showIdentityModal() {
    identityModal.hidden = false;
    renderIdentityList("");
    identitySearch.addEventListener("input", () => renderIdentityList(identitySearch.value));
  }

  function renderIdentityList(q) {
    const term = q.toLowerCase();
    const filtered = users.filter(u =>
      u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
    );
    identityList.innerHTML = filtered.map(u => `
      <div class="modal__list-item" data-email="${esc(u.email)}">
        ${avatarHtml(u.name, "avatar--sm")}
        <div>
          <div style="font-weight:600;font-size:.875rem">${esc(u.name)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${esc(u.email)}</div>
        </div>
      </div>
    `).join("");
    identityList.querySelectorAll(".modal__list-item").forEach(el => {
      el.addEventListener("click", () => {
        const email = el.dataset.email;
        const user = users.find(u => u.email === email);
        me = { name: user.name, email: user.email };
        localStorage.setItem("glc-chat-user", JSON.stringify(me));
        identityModal.hidden = true;
        startApp();
      });
    });
  }

  /* ── app start ───────────────────────────────────── */
  async function startApp() {
    app.hidden = false;
    myAvatar.style.background = colorFor(me.name);
    myAvatar.textContent = initials(me.name);
    myName.textContent = me.name;

    // Check if opened with DM target
    const params = new URLSearchParams(window.location.search);
    const dmTarget = params.get("dm");

    await loadConversations();
    await updatePresence();

    // Start polling
    pollTimers.convs = setInterval(loadConversations, POLL_MSG);
    pollTimers.presence = setInterval(updatePresence, POLL_PRESENCE);

    // If DM target specified, open/create that conversation
    if (dmTarget) {
      await openDM(dmTarget);
    }
  }

  /* ── conversations ───────────────────────────────── */
  async function loadConversations() {
    const { conversations: c } = await api(`/conversations?user=${encodeURIComponent(me.email)}`);
    conversations = c;
    renderConversations();
  }

  function renderConversations() {
    const q = convSearch.value.toLowerCase();
    const filtered = conversations.filter(c => {
      const name = convDisplayName(c).toLowerCase();
      const preview = (c.lastMessage?.text || "").toLowerCase();
      return name.includes(q) || preview.includes(q);
    });

    convList.innerHTML = filtered.map(c => {
      const name = convDisplayName(c);
      const isOnline = c.type === "dm" && presence[c.members.find(m => m !== me.email)]?.online;
      const preview = c.lastMessage
        ? `${c.lastMessage.senderName}: ${c.lastMessage.text}`
        : "No messages yet";
      const time = c.lastMessage ? timeStr(c.lastMessage.timestamp) : "";
      const active = c.id === activeConvId ? "conv-item--active" : "";
      const groupIcon = c.type === "group" ? "👥 " : "";

      return `
        <div class="conv-item ${active}" data-id="${esc(c.id)}">
          <div class="conv-item__avatar">
            ${avatarHtml(name)}
            ${isOnline ? '<div class="conv-item__dot"></div>' : ""}
          </div>
          <div class="conv-item__info">
            <div class="conv-item__name">${groupIcon}${esc(name)}</div>
            <div class="conv-item__preview">${esc(preview)}</div>
          </div>
          <div class="conv-item__time">${time}</div>
        </div>
      `;
    }).join("");

    convList.querySelectorAll(".conv-item").forEach(el => {
      el.addEventListener("click", () => openConversation(el.dataset.id));
    });
  }

  async function openConversation(convId) {
    activeConvId = convId;
    lastMsgTs = null;
    messages = [];

    chatEmpty.style.display = "none";
    chatActive.hidden = false;
    app.classList.add("app--chat-open");

    const conv = conversations.find(c => c.id === convId);
    chatTitle.textContent = convDisplayName(conv);

    if (conv.type === "group") {
      chatSubtitle.textContent = `${conv.members.length} members`;
      chatSettingsBtn.hidden = false;
    } else {
      const otherEmail = conv.members.find(m => m !== me.email);
      const online = presence[otherEmail]?.online;
      chatSubtitle.textContent = online ? "Online" : "";
      chatSettingsBtn.hidden = true;
    }

    renderConversations();
    await loadMessages();
    await markRead();

    // Start message polling for this conv
    clearInterval(pollTimers.msgs);
    clearInterval(pollTimers.typing);
    pollTimers.msgs = setInterval(pollMessages, POLL_MSG);
    pollTimers.typing = setInterval(pollTyping, POLL_TYPING);
  }

  async function openDM(targetEmail) {
    // Find existing DM or create new
    const sorted = [me.email, targetEmail].sort();
    const dmId = `dm:${sorted[0]}:${sorted[1]}`;
    let conv = conversations.find(c => c.id === dmId);
    if (!conv) {
      const { conversation } = await api("/conversations", {
        method: "POST",
        body: { type: "dm", members: [me.email, targetEmail] }
      });
      conv = conversation;
      await loadConversations();
    }
    openConversation(conv.id);
  }

  /* ── messages ────────────────────────────────────── */
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
    if (newMsgs.length) {
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
    const conv = conversations.find(c => c.id === activeConvId);
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

      // Reactions html
      let reactHtml = "";
      if (m.reactions && Object.keys(m.reactions).length) {
        reactHtml = '<div class="msg__reactions">';
        for (const [emoji, users] of Object.entries(m.reactions)) {
          const mine = users.includes(me.email) ? "msg__reaction--mine" : "";
          reactHtml += `<span class="msg__reaction ${mine}" data-msg="${m.id}" data-emoji="${emoji}">${emoji} <span class="msg__reaction-count">${users.length}</span></span>`;
        }
        reactHtml += "</div>";
      }

      // Read receipts
      let readHtml = "";
      if (isMine && m.readBy) {
        const readers = m.readBy.filter(r => r.email !== me.email);
        if (readers.length > 0) {
          readHtml = `<div class="msg__read"><span class="msg__read-check">✓✓</span> Read by ${readers.length}</div>`;
        } else {
          readHtml = `<div class="msg__read">✓ Sent</div>`;
        }
      }

      // Content
      let contentHtml = "";
      if (m.type === "image" && m.fileData) {
        contentHtml = `<img class="msg__image" src="${m.fileData}" alt="${esc(m.fileName)}">`;
      } else if (m.type === "file" && m.fileData) {
        contentHtml = `<a class="msg__file" href="${m.fileData}" download="${esc(m.fileName)}">
          <span class="msg__file-icon">📄</span>
          <div><div class="msg__file-name">${esc(m.fileName)}</div></div>
        </a>`;
      }
      if (m.text) contentHtml = `<div>${esc(m.text)}</div>` + contentHtml;

      const senderLabel = !isMine && conv?.type === "group"
        ? `<div class="msg__sender">${esc(m.senderName)}</div>` : "";

      html += `
        <div class="msg ${cls}" data-id="${m.id}">
          ${!isMine ? avatarHtml(m.senderName, "avatar--sm") : ""}
          <div>
            ${senderLabel}
            <div class="msg__bubble">
              ${contentHtml}
              <button class="msg__react-btn" data-msg="${m.id}">😊</button>
            </div>
            <div class="msg__time">${timeStr(m.timestamp)}</div>
            ${reactHtml}
            ${readHtml}
          </div>
        </div>
      `;
    }
    chatMessages.innerHTML = html;

    // Attach reaction listeners
    chatMessages.querySelectorAll(".msg__react-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        showReactionPicker(btn.dataset.msg, btn);
      });
    });
    chatMessages.querySelectorAll(".msg__reaction").forEach(el => {
      el.addEventListener("click", () => {
        toggleReaction(el.dataset.msg, el.dataset.emoji);
      });
    });
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /* ── send message ────────────────────────────────── */
  async function sendMessage(text, type = "text", fileData = "", fileName = "") {
    if (!activeConvId) return;
    if (!text && !fileData) return;
    await api(`/conversations/${encodeURIComponent(activeConvId)}/messages`, {
      method: "POST",
      body: { sender: me.email, senderName: me.name, text, type, fileData, fileName }
    });
    lastMsgTs = null; // force full reload
    await loadMessages();
    await loadConversations();
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

  // Typing indicator — send on input
  let typingTimeout = null;
  msgInput.addEventListener("input", () => {
    if (!activeConvId) return;
    clearTimeout(typingTimeout);
    api(`/typing/${encodeURIComponent(activeConvId)}`, {
      method: "POST",
      body: { user: me.email }
    });
    typingTimeout = setTimeout(() => {}, 3000);
  });

  /* ── file upload ─────────────────────────────────── */
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert("File must be under 2 MB");
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const isImage = file.type.startsWith("image/");
      sendMessage("", isImage ? "image" : "file", reader.result, file.name);
      fileInput.value = "";
    };
    reader.readAsDataURL(file);
  });

  /* ── emoji picker (input) ────────────────────────── */
  emojiTrigger.addEventListener("click", () => {
    emojiPicker.hidden = !emojiPicker.hidden;
  });
  emojiPicker.querySelectorAll("[data-emoji]").forEach(el => {
    el.addEventListener("click", () => {
      msgInput.value += el.dataset.emoji;
      msgInput.focus();
    });
  });

  /* ── reaction picker ─────────────────────────────── */
  function showReactionPicker(msgId, anchor) {
    reactionTargetMsgId = msgId;
    const rect = anchor.getBoundingClientRect();
    reactionPicker.style.top = `${rect.top - 40}px`;
    reactionPicker.style.left = `${rect.left}px`;
    reactionPicker.hidden = false;
  }

  reactionPicker.querySelectorAll("[data-r]").forEach(el => {
    el.addEventListener("click", () => {
      if (reactionTargetMsgId) toggleReaction(reactionTargetMsgId, el.dataset.r);
      reactionPicker.hidden = true;
    });
  });

  document.addEventListener("click", e => {
    if (!reactionPicker.contains(e.target) && !e.target.classList.contains("msg__react-btn")) {
      reactionPicker.hidden = true;
    }
  });

  async function toggleReaction(msgId, emoji) {
    await api(`/conversations/${encodeURIComponent(activeConvId)}/messages/${msgId}/react`, {
      method: "POST",
      body: { emoji, user: me.email }
    });
    // Reload messages to show updated reactions
    await loadMessages();
  }

  /* ── read receipts ───────────────────────────────── */
  async function markRead() {
    if (!activeConvId) return;
    await api(`/conversations/${encodeURIComponent(activeConvId)}/read`, {
      method: "POST",
      body: { user: me.email }
    });
  }

  /* ── presence ────────────────────────────────────── */
  async function updatePresence() {
    await api("/presence", { method: "POST", body: { email: me.email, name: me.name } });
    const { presence: p } = await api("/presence");
    presence = p;
    const count = Object.values(p).filter(v => v.online).length;
    onlineCount.textContent = `● ${count} online`;
    renderConversations();

    // Update chat subtitle if DM
    if (activeConvId) {
      const conv = conversations.find(c => c.id === activeConvId);
      if (conv?.type === "dm") {
        const otherEmail = conv.members.find(m => m !== me.email);
        chatSubtitle.textContent = presence[otherEmail]?.online ? "Online" : "";
      }
    }
  }

  /* ── typing indicators ──────────────────────────── */
  async function pollTyping() {
    if (!activeConvId) return;
    const { typing } = await api(`/typing/${encodeURIComponent(activeConvId)}`);
    const typers = Object.keys(typing).filter(u => u !== me.email);
    if (typers.length) {
      const names = typers.map(e => {
        const u = users.find(u => u.email === e);
        return u ? u.name.split(" ")[0] : e;
      });
      typingText.textContent = names.length === 1
        ? `${names[0]} is typing...`
        : `${names.join(", ")} are typing...`;
      typingIndicator.hidden = false;
    } else {
      typingIndicator.hidden = true;
    }
  }

  /* ── group creation ──────────────────────────────── */
  let selectedGroupMembers = new Set();

  newGroupBtn.addEventListener("click", () => {
    selectedGroupMembers = new Set([me.email]);
    groupName.value = "";
    groupMemberSearch.value = "";
    groupModal.hidden = false;
    renderGroupMembers("");
  });
  groupCancel.addEventListener("click", () => { groupModal.hidden = true; });

  groupMemberSearch.addEventListener("input", () => renderGroupMembers(groupMemberSearch.value));

  function renderGroupMembers(q) {
    const term = q.toLowerCase();
    const filtered = users.filter(u =>
      u.email !== me.email &&
      (u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
    );
    groupMemberList.innerHTML = filtered.map(u => {
      const sel = selectedGroupMembers.has(u.email) ? "modal__list-item--selected" : "";
      return `<div class="modal__list-item ${sel}" data-email="${esc(u.email)}">
        ${avatarHtml(u.name, "avatar--sm")}
        <div>
          <div style="font-weight:600;font-size:.875rem">${esc(u.name)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${esc(u.email)}</div>
        </div>
      </div>`;
    }).join("");
    groupMemberList.querySelectorAll(".modal__list-item").forEach(el => {
      el.addEventListener("click", () => {
        const email = el.dataset.email;
        if (selectedGroupMembers.has(email)) selectedGroupMembers.delete(email);
        else selectedGroupMembers.add(email);
        renderGroupMembers(groupMemberSearch.value);
      });
    });
  }

  groupCreate.addEventListener("click", async () => {
    const name = groupName.value.trim();
    if (!name) { groupName.focus(); return; }
    if (selectedGroupMembers.size < 2) { alert("Add at least one other member"); return; }
    const members = [...selectedGroupMembers];
    const { conversation } = await api("/conversations", {
      method: "POST",
      body: { type: "group", name, members }
    });
    groupModal.hidden = true;
    await loadConversations();
    openConversation(conversation.id);
  });

  /* ── group settings ──────────────────────────────── */
  let gsSelectedMembers = new Set();

  chatSettingsBtn.addEventListener("click", () => {
    const conv = conversations.find(c => c.id === activeConvId);
    if (!conv) return;
    gsName.value = conv.name;
    gsSelectedMembers = new Set(conv.members);
    gsMemberSearch.value = "";
    gsModal.hidden = false;
    renderGsMembers("");
  });
  gsCancel.addEventListener("click", () => { gsModal.hidden = true; });
  gsMemberSearch.addEventListener("input", () => renderGsMembers(gsMemberSearch.value));

  function renderGsMembers(q) {
    const term = q.toLowerCase();
    const filtered = users.filter(u =>
      u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
    );
    gsMemberList.innerHTML = filtered.map(u => {
      const sel = gsSelectedMembers.has(u.email) ? "modal__list-item--selected" : "";
      return `<div class="modal__list-item ${sel}" data-email="${esc(u.email)}">
        ${avatarHtml(u.name, "avatar--sm")}
        <div>
          <div style="font-weight:600;font-size:.875rem">${esc(u.name)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${esc(u.email)}</div>
        </div>
      </div>`;
    }).join("");
    gsMemberList.querySelectorAll(".modal__list-item").forEach(el => {
      el.addEventListener("click", () => {
        const email = el.dataset.email;
        if (gsSelectedMembers.has(email)) gsSelectedMembers.delete(email);
        else gsSelectedMembers.add(email);
        renderGsMembers(gsMemberSearch.value);
      });
    });
  }

  gsSave.addEventListener("click", async () => {
    const name = gsName.value.trim();
    if (!name) { gsName.focus(); return; }
    await api(`/conversations/${encodeURIComponent(activeConvId)}`, {
      method: "PUT",
      body: { name, members: [...gsSelectedMembers] }
    });
    gsModal.hidden = true;
    await loadConversations();
    chatTitle.textContent = name;
    chatSubtitle.textContent = `${gsSelectedMembers.size} members`;
  });

  /* ── search conversations ────────────────────────── */
  convSearch.addEventListener("input", () => renderConversations());

  /* ── mobile back button ──────────────────────────── */
  document.addEventListener("click", e => {
    if (e.target.classList.contains("chat__back")) {
      app.classList.remove("app--chat-open");
      chatActive.hidden = true;
      chatEmpty.style.display = "";
      activeConvId = null;
      clearInterval(pollTimers.msgs);
      clearInterval(pollTimers.typing);
    }
  });

  /* ── init ────────────────────────────────────────── */
  init();
})();

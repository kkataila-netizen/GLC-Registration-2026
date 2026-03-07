import { getStore } from "@netlify/blobs";

/* ── helpers ────────────────────────────────────────── */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function uuid() { return crypto.randomUUID(); }

async function blobGet(store, key) {
  try { return (await store.get(key, { type: "json" })) || null; }
  catch { return null; }
}

/* ── store accessors ────────────────────────────────── */
async function getConversations() {
  const s = getStore("chat-conversations");
  return (await blobGet(s, "all")) || [];
}
async function saveConversations(data) {
  const s = getStore("chat-conversations");
  await s.setJSON("all", data);
}

async function getMessages(convId) {
  const s = getStore("chat-messages");
  return (await blobGet(s, convId)) || [];
}
async function saveMessages(convId, msgs) {
  const s = getStore("chat-messages");
  await s.setJSON(convId, msgs);
}

async function getPresence() {
  const s = getStore("chat-presence");
  return (await blobGet(s, "all")) || {};
}
async function savePresence(data) {
  const s = getStore("chat-presence");
  await s.setJSON("all", data);
}

async function getTyping(convId) {
  const s = getStore("chat-typing");
  return (await blobGet(s, convId)) || {};
}
async function saveTyping(convId, data) {
  const s = getStore("chat-typing");
  await s.setJSON(convId, data);
}

async function getRegistrations() {
  const s = getStore("registrations");
  try { return (await s.get("all", { type: "json" })) || []; }
  catch { return []; }
}

/* ── route handler ──────────────────────────────────── */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/chat-api/, "");
  const method = req.method;

  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  /* ── GET /users ─────────────────────────────────── */
  if (method === "GET" && /^\/users\/?$/.test(path)) {
    const regs = await getRegistrations();
    const users = regs.map(r => ({ name: r.name, email: r.email, organization: r.organization || "" }));
    return json({ users });
  }

  /* ── GET /conversations?user=email ──────────────── */
  if (method === "GET" && /^\/conversations\/?$/.test(path)) {
    const user = url.searchParams.get("user");
    if (!user) return json({ error: "user param required" }, 400);
    let convs = await getConversations();
    convs = convs.filter(c => c.members.includes(user));
    convs.sort((a, b) => {
      const ta = a.lastMessage?.timestamp || a.createdAt;
      const tb = b.lastMessage?.timestamp || b.createdAt;
      return new Date(tb) - new Date(ta);
    });
    return json({ conversations: convs });
  }

  /* ── POST /conversations ────────────────────────── */
  if (method === "POST" && /^\/conversations\/?$/.test(path)) {
    const body = await req.json();
    const { type, name, members } = body;
    if (!members || !Array.isArray(members) || members.length < 2) {
      return json({ error: "members array with ≥2 emails required" }, 400);
    }
    const convs = await getConversations();

    if (type === "dm") {
      const sorted = [...members].sort();
      const id = `dm:${sorted[0]}:${sorted[1]}`;
      const existing = convs.find(c => c.id === id);
      if (existing) return json({ conversation: existing });
      const conv = { id, type: "dm", name: "", members: sorted, createdBy: members[0], createdAt: new Date().toISOString(), lastMessage: null };
      convs.push(conv);
      await saveConversations(convs);
      return json({ conversation: conv }, 201);
    }

    if (type === "group") {
      if (!name) return json({ error: "Group name required" }, 400);
      const id = `group:${uuid()}`;
      const conv = { id, type: "group", name, members: [...new Set(members)], createdBy: members[0], createdAt: new Date().toISOString(), lastMessage: null };
      convs.push(conv);
      await saveConversations(convs);
      return json({ conversation: conv }, 201);
    }
    return json({ error: "type must be dm or group" }, 400);
  }

  /* ── PUT /conversations/:id  (update group) ─────── */
  const putConv = path.match(/^\/conversations\/(.+?)\/?$/);
  if (method === "PUT" && putConv) {
    const convId = decodeURIComponent(putConv[1]);
    const body = await req.json();
    const convs = await getConversations();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx === -1) return json({ error: "Not found" }, 404);
    if (body.name !== undefined) convs[idx].name = body.name;
    if (body.members) convs[idx].members = [...new Set(body.members)];
    await saveConversations(convs);
    return json({ conversation: convs[idx] });
  }

  /* ── GET /conversations/:id/messages?since=ts ───── */
  const getMsg = path.match(/^\/conversations\/(.+?)\/messages\/?$/);
  if (method === "GET" && getMsg) {
    const convId = decodeURIComponent(getMsg[1]);
    let msgs = await getMessages(convId);
    const since = url.searchParams.get("since");
    if (since) {
      msgs = msgs.filter(m => new Date(m.timestamp) > new Date(since));
    }
    return json({ messages: msgs });
  }

  /* ── POST /conversations/:id/messages ───────────── */
  const postMsg = path.match(/^\/conversations\/(.+?)\/messages\/?$/);
  if (method === "POST" && postMsg) {
    const convId = decodeURIComponent(postMsg[1]);
    const body = await req.json();
    if (!body.sender || !body.text && !body.fileData) {
      return json({ error: "sender and (text or fileData) required" }, 400);
    }
    const msg = {
      id: uuid(),
      sender: body.sender,
      senderName: body.senderName || body.sender,
      text: body.text || "",
      type: body.type || "text",
      fileName: body.fileName || "",
      fileData: body.fileData || "",
      reactions: {},
      readBy: [{ email: body.sender, at: new Date().toISOString() }],
      timestamp: new Date().toISOString()
    };
    const msgs = await getMessages(convId);
    msgs.push(msg);
    await saveMessages(convId, msgs);

    // update lastMessage on conversation
    const convs = await getConversations();
    const conv = convs.find(c => c.id === convId);
    if (conv) {
      conv.lastMessage = { text: msg.text || `📎 ${msg.fileName}`, senderName: msg.senderName, timestamp: msg.timestamp };
      await saveConversations(convs);
    }
    return json({ message: msg }, 201);
  }

  /* ── POST /conversations/:id/messages/:msgId/react ─ */
  const reactMatch = path.match(/^\/conversations\/(.+?)\/messages\/(.+?)\/react\/?$/);
  if (method === "POST" && reactMatch) {
    const convId = decodeURIComponent(reactMatch[1]);
    const msgId = decodeURIComponent(reactMatch[2]);
    const body = await req.json();
    const { emoji, user } = body;
    if (!emoji || !user) return json({ error: "emoji and user required" }, 400);
    const msgs = await getMessages(convId);
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return json({ error: "Message not found" }, 404);
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(user);
    if (idx >= 0) msg.reactions[emoji].splice(idx, 1);
    else msg.reactions[emoji].push(user);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    await saveMessages(convId, msgs);
    return json({ reactions: msg.reactions });
  }

  /* ── POST /conversations/:id/read ───────────────── */
  const readMatch = path.match(/^\/conversations\/(.+?)\/read\/?$/);
  if (method === "POST" && readMatch) {
    const convId = decodeURIComponent(readMatch[1]);
    const body = await req.json();
    const { user } = body;
    if (!user) return json({ error: "user required" }, 400);
    const msgs = await getMessages(convId);
    const now = new Date().toISOString();
    let updated = false;
    for (const m of msgs) {
      if (!m.readBy) m.readBy = [];
      if (!m.readBy.some(r => r.email === user)) {
        m.readBy.push({ email: user, at: now });
        updated = true;
      }
    }
    if (updated) await saveMessages(convId, msgs);
    return json({ success: true });
  }

  /* ── POST /presence ─────────────────────────────── */
  if (method === "POST" && /^\/presence\/?$/.test(path)) {
    const body = await req.json();
    const { email, name } = body;
    if (!email) return json({ error: "email required" }, 400);
    const pres = await getPresence();
    pres[email] = { name: name || email, lastSeen: new Date().toISOString() };
    await savePresence(pres);
    return json({ success: true });
  }

  /* ── GET /presence ──────────────────────────────── */
  if (method === "GET" && /^\/presence\/?$/.test(path)) {
    const pres = await getPresence();
    const now = Date.now();
    const result = {};
    for (const [email, info] of Object.entries(pres)) {
      const ago = now - new Date(info.lastSeen).getTime();
      result[email] = { ...info, online: ago < 30000 };
    }
    return json({ presence: result });
  }

  /* ── POST /typing/:conversationId ───────────────── */
  const postTyping = path.match(/^\/typing\/(.+?)\/?$/);
  if (method === "POST" && postTyping) {
    const convId = decodeURIComponent(postTyping[1]);
    const body = await req.json();
    const { user } = body;
    if (!user) return json({ error: "user required" }, 400);
    const typing = await getTyping(convId);
    typing[user] = new Date().toISOString();
    await saveTyping(convId, typing);
    return json({ success: true });
  }

  /* ── GET /typing/:conversationId ────────────────── */
  const getTyp = path.match(/^\/typing\/(.+?)\/?$/);
  if (method === "GET" && getTyp) {
    const convId = decodeURIComponent(getTyp[1]);
    const typing = await getTyping(convId);
    const now = Date.now();
    const active = {};
    for (const [user, ts] of Object.entries(typing)) {
      if (now - new Date(ts).getTime() < 4000) active[user] = ts;
    }
    return json({ typing: active });
  }

  return json({ error: "Not found" }, 404);
};

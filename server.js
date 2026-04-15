const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-session-secret";
const INVITE_CODE = process.env.INVITE_CODE || "";
const DATA_DIR_ENV = process.env.DATA_DIR || "";
const SESSION_COOKIE = "short_link_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = DATA_DIR_ENV ? path.resolve(DATA_DIR_ENV) : path.join(rootDir, "data");
const dataFile = path.join(dataDir, "links.json");

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const adminPath = "/";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  for (const entry of header.split(";")) {
    const [rawName, ...rest] = entry.trim().split("=");
    if (!rawName) continue;
    cookies[rawName] = decodeURIComponent(rest.join("="));
  }

  return cookies;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendText(res, 404, "Not Found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(buffer);
  });
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(userId) {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(12).toString("hex")
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function readSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (!token || !token.includes(".")) {
    return { authenticated: false };
  }

  const [encoded, signature] = token.split(".");
  const expected = sign(encoded);

  if (!safeEqualText(signature, expected)) {
    return { authenticated: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || Number(payload.exp) < Date.now() || !payload.userId) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      userId: payload.userId,
      expiresAt: payload.exp
    };
  } catch (error) {
    return { authenticated: false };
  }
}

function getCookieOptions(maxAgeMs) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict"
  ];

  if (BASE_URL.startsWith("https://")) {
    parts.push("Secure");
  }

  if (typeof maxAgeMs === "number") {
    parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  }

  return parts;
}

function setSessionCookie(res, userId) {
  const token = createSessionToken(userId);
  const cookie = getCookieOptions(SESSION_TTL_MS);
  cookie[0] = `${SESSION_COOKIE}=${token}`;
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function clearSessionCookie(res) {
  const cookie = getCookieOptions(0);
  cookie[0] = `${SESSION_COOKIE}=`;
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function sendUnauthorized(res) {
  sendJson(res, 401, { error: "请先登录你的账号" });
}

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ users: [], links: [] }, null, 2));
  }
}

function normalizeDbShape(raw) {
  if (!raw || typeof raw !== "object") {
    return { users: [], links: [] };
  }

  if (Array.isArray(raw.links) && Array.isArray(raw.users)) {
    return raw;
  }

  if (Array.isArray(raw.links) && !Array.isArray(raw.users)) {
    return { users: [], links: raw.links };
  }

  if (Array.isArray(raw)) {
    return { users: [], links: raw };
  }

  return { users: [], links: [] };
}

function loadDb() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return normalizeDbShape(JSON.parse(raw));
  } catch (error) {
    return { users: [], links: [] };
  }
}

function saveDb(db) {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeUrl(input) {
  if (typeof input !== "string") {
    throw new Error("请输入有效的长链接");
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("长链接不能为空");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持 http 或 https 链接");
  }

  return parsed.toString();
}

function isValidCode(code) {
  return /^[A-Za-z0-9_-]{4,24}$/.test(code);
}

function createCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let code = "";

  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }

  return code;
}

function getShortUrl(code) {
  return `${BASE_URL.replace(/\/$/, "")}/${code}`;
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(":");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return safeEqualText(digest, expectedHash);
}

function sanitizeEmail(value) {
  if (typeof value !== "string") {
    throw new Error("请输入邮箱");
  }

  const email = value.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    throw new Error("请输入正确的邮箱地址");
  }

  return email;
}

function sanitizeName(value) {
  if (typeof value !== "string") {
    throw new Error("请输入昵称");
  }

  const name = value.trim();
  if (name.length < 2 || name.length > 24) {
    throw new Error("昵称长度需要在 2 到 24 个字符之间");
  }

  return name;
}

function sanitizePassword(value) {
  if (typeof value !== "string") {
    throw new Error("请输入密码");
  }

  const password = value.trim();
  if (password.length < 6) {
    throw new Error("密码至少需要 6 位");
  }

  return password;
}

function findUserByEmail(db, email) {
  return db.users.find((item) => item.email === email);
}

function findUserById(db, userId) {
  return db.users.find((item) => item.id === userId);
}

function formatLink(item) {
  return {
    id: item.id,
    code: item.code,
    shortUrl: getShortUrl(item.code),
    longUrl: item.longUrl,
    note: item.note || "",
    visits: item.visits || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastVisitedAt: item.lastVisitedAt || null
  };
}

function formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

async function handleApi(req, res, url) {
  const db = loadDb();
  const session = readSession(req);
  const currentUser = session.userId ? findUserById(db, session.userId) : null;

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      port: PORT,
      baseUrl: BASE_URL,
      totalLinks: db.links.length,
      totalUsers: db.users.length,
      inviteCodeRequired: Boolean(INVITE_CODE)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    sendJson(res, 200, {
      authenticated: Boolean(currentUser),
      expiresAt: session.expiresAt || null,
      inviteCodeRequired: Boolean(INVITE_CODE),
      user: currentUser ? formatUser(currentUser) : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const body = await parseBody(req);
      const name = sanitizeName(body.name);
      const email = sanitizeEmail(body.email);
      const password = sanitizePassword(body.password);
      const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

      if (INVITE_CODE && inviteCode !== INVITE_CODE) {
        sendJson(res, 403, { error: "邀请码不正确" });
        return;
      }

      if (findUserByEmail(db, email)) {
        sendJson(res, 409, { error: "这个邮箱已经注册过了，请直接登录" });
        return;
      }

      const now = new Date().toISOString();
      const user = {
        id: createId("user"),
        name,
        email,
        passwordHash: hashPassword(password),
        createdAt: now
      };

      db.users.push(user);
      saveDb(db);
      setSessionCookie(res, user.id);

      sendJson(res, 201, {
        ok: true,
        user: formatUser(user)
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "注册失败" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await parseBody(req);
      const email = sanitizeEmail(body.email);
      const password = sanitizePassword(body.password);
      const user = findUserByEmail(db, email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { error: "邮箱或密码错误" });
        return;
      }

      setSessionCookie(res, user.id);
      sendJson(res, 200, {
        ok: true,
        user: formatUser(user)
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "登录失败" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!currentUser) {
    sendUnauthorized(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/links") {
    const links = db.links
      .filter((item) => item.ownerId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(formatLink);

    sendJson(res, 200, {
      links,
      user: formatUser(currentUser)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/links") {
    try {
      const body = await parseBody(req);
      const longUrl = normalizeUrl(body.longUrl);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 100) : "";
      const customCode = typeof body.customCode === "string" ? body.customCode.trim() : "";

      let code = customCode || createCode(6);

      if (customCode && !isValidCode(customCode)) {
        sendJson(res, 400, { error: "短链后缀只能是 4-24 位字母、数字、下划线或中划线" });
        return;
      }

      if (!customCode) {
        while (db.links.some((item) => item.code === code)) {
          code = createCode(6);
        }
      } else if (db.links.some((item) => item.code === code)) {
        sendJson(res, 409, { error: "这个短链后缀已经被占用，请换一个" });
        return;
      }

      const now = new Date().toISOString();
      const record = {
        id: createId("link"),
        ownerId: currentUser.id,
        code,
        longUrl,
        note,
        visits: 0,
        createdAt: now,
        updatedAt: now,
        lastVisitedAt: null
      };

      db.links.push(record);
      saveDb(db);

      sendJson(res, 201, { link: formatLink(record) });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "创建短链接失败" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/links/")) {
    const code = decodeURIComponent(url.pathname.replace("/api/links/", ""));
    const index = db.links.findIndex((item) => item.code === code && item.ownerId === currentUser.id);

    if (index === -1) {
      sendJson(res, 404, { error: "短链接不存在，或你没有权限删除它" });
      return;
    }

    const [deleted] = db.links.splice(index, 1);
    saveDb(db);
    sendJson(res, 200, { deleted: formatLink(deleted) });
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

function handleRedirect(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === adminPath || pathname === "/index.html") {
    serveFile(res, path.join(publicDir, "index.html"), "text/html; charset=utf-8");
    return;
  }

  if (pathname === "/app.js") {
    serveFile(res, path.join(publicDir, "app.js"), "application/javascript; charset=utf-8");
    return;
  }

  if (pathname === "/styles.css") {
    serveFile(res, path.join(publicDir, "styles.css"), "text/css; charset=utf-8");
    return;
  }

  if (pathname === "/favicon.ico") {
    sendText(res, 204, "");
    return;
  }

  const code = pathname.slice(1);
  if (!code) {
    sendText(res, 404, "Not Found");
    return;
  }

  const db = loadDb();
  const record = db.links.find((item) => item.code === code);

  if (!record) {
    sendText(res, 404, "短链接不存在");
    return;
  }

  record.visits = Number(record.visits || 0) + 1;
  record.lastVisitedAt = new Date().toISOString();
  record.updatedAt = record.lastVisitedAt;
  saveDb(db);

  res.writeHead(302, {
    Location: record.longUrl,
    "Cache-Control": "no-store"
  });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  handleRedirect(req, res, url);
});

server.listen(PORT, HOST, () => {
  ensureStorage();
  if (SESSION_SECRET === "change-this-session-secret") {
    console.warn("SESSION_SECRET is using the default value. Please change it before public deployment.");
  }
  console.log(`Short link tool is running at ${BASE_URL}`);
});

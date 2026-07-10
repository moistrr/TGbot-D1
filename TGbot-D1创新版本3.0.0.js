const USER_STATE = {
  NEW: 'new',
  PENDING: 'pending_verification',
  VERIFIED: 'verified'
};

const DEFAULTS = {
  welcome_msg:
    '在发消息之前，先进行反广告验证，请回答下面的问题以判断是否为机器人，验证完成之后请等待3秒钟之后再发送消息以防发生失败！',
  verif_q:
    '问题：1+1=?\n\n提示：\n1. 正确答案不是“2”。\n2. 答案在机器人简介内，请看简介的答案进行回答。',
  verif_a: '3',
  keyword_responses: '[]',
  block_keywords: '[]',
  block_threshold: '5',
  authorized_admins: '[]',

  enable_image_forwarding: 'true',
  enable_link_forwarding: 'true',
  enable_text_forwarding: 'true',
  enable_audio_forwarding: 'true',
  enable_sticker_forwarding: 'true',
  enable_user_forwarding: 'true',
  enable_group_forwarding: 'true',
  enable_channel_forwarding: 'true'
};

const LIMITS = {
  welcome_msg: 4000,
  verif_q: 4000,
  verif_a: 300,
  block_threshold: 3,
  authorized_admins: 2000,
  block_keyword: 200,
  auto_reply_pattern: 200,
  auto_reply_response: 4000,
  filter_text: 5000
};

const ADMIN_STATE_TTL_MS = 10 * 60 * 1000;
const RULE_PAGE_SIZE = 20;
const TOPIC_LOCK_TIMEOUT_SECONDS = 30;
const DATABASE_RETENTION_SECONDS = 90 * 24 * 60 * 60;

const USER_UPDATE_FIELDS = new Set([
  'user_state',
  'is_blocked',
  'is_muted',
  'block_count',
  'topic_id',
  'info_card_message_id',
  'user_info_json',
  'topic_creating',
  'topic_lock_at',
  'created_at',
  'updated_at'
]);

let migrationPromise = null;

/* -------------------------------------------------------------------------- */
/*                               通用辅助函数                                   */
/* -------------------------------------------------------------------------- */

function escapeHtml(text) {
  if (text === null || text === undefined) return '';

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBoolText(value, defaultValue = true) {
  if (typeof value !== 'string') return defaultValue;
  return value.toLowerCase() === 'true';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '[未知时间]';

  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '[未知时间]';
  }

  return date.toLocaleString('zh-CN', {
    hour12: false
  });
}

function randomId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampPage(page, totalItems) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / RULE_PAGE_SIZE)
  );

  const normalizedPage = Number.isInteger(Number(page))
    ? Number(page)
    : 0;

  return {
    page: Math.max(
      0,
      Math.min(normalizedPage, totalPages - 1)
    ),
    totalPages
  };
}

function hasLinks(message) {
  const entities = [
    ...(message?.entities || []),
    ...(message?.caption_entities || [])
  ];

  return entities.some((entity) => {
    return (
      entity.type === 'url' ||
      entity.type === 'text_link' ||
      entity.type === 'email'
    );
  });
}

function getForwardType(message) {
  const origin = message?.forward_origin;

  if (origin) {
    if (
      origin.type === 'user' ||
      origin.type === 'hidden_user'
    ) {
      return 'user';
    }

    if (origin.type === 'channel') {
      return 'channel';
    }

    if (origin.type === 'chat') {
      const chatType = origin.sender_chat?.type;

      if (chatType === 'channel') {
        return 'channel';
      }

      if (
        chatType === 'group' ||
        chatType === 'supergroup'
      ) {
        return 'group';
      }

      return 'group';
    }
  }

  // 兼容旧版 Telegram Bot API 字段
  if (message?.forward_from_chat?.type === 'channel') {
    return 'channel';
  }

  if (
    message?.forward_from_chat?.type === 'group' ||
    message?.forward_from_chat?.type === 'supergroup'
  ) {
    return 'group';
  }

  if (
    message?.forward_from ||
    message?.forward_sender_name
  ) {
    return 'user';
  }

  return null;
}

function detectMessageKind(message) {
  if (
    message?.photo ||
    message?.video ||
    message?.document ||
    message?.video_note
  ) {
    return 'media';
  }

  if (message?.audio || message?.voice) {
    return 'audio_voice';
  }

  if (message?.sticker || message?.animation) {
    return 'sticker_gif';
  }

  if (message?.text || message?.caption) {
    return 'text';
  }

  return 'other';
}

function getMessageText(message) {
  return String(
    message?.text ||
    message?.caption ||
    ''
  ).slice(0, LIMITS.filter_text);
}

function getMessageStorageKey(direction, messageId) {
  return `${direction}:${messageId}`;
}

function isTopicInvalidError(error) {
  const text = String(error?.message || error).toLowerCase();

  return (
    text.includes('message thread not found') ||
    text.includes('message thread is closed') ||
    text.includes('topic_closed') ||
    text.includes('topic was deleted') ||
    text.includes('forum topic was closed') ||
    text.includes('message thread id is invalid')
  );
}

function validateEnvironment(env) {
  const missing = [];

  if (!env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!env.ADMIN_GROUP_ID) missing.push('ADMIN_GROUP_ID');
  if (!env.ADMIN_IDS) missing.push('ADMIN_IDS');
  if (!env.WEBHOOK_SECRET) missing.push('WEBHOOK_SECRET');
  if (!env.TG_BOT_DB) missing.push('TG_BOT_DB');

  if (missing.length > 0) {
    throw new Error(
      `缺少环境变量或绑定：${missing.join(', ')}`
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             Telegram API 封装                               */
/* -------------------------------------------------------------------------- */

async function telegramApi(
  token,
  method,
  params = {},
  attempt = 0
) {
  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (attempt < 2) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    throw new Error(
      `Telegram 网络请求失败 (${method})：` +
      `${error?.message || error}`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Telegram API 返回非 JSON 内容 ` +
      `(${method}, HTTP ${response.status})`
    );
  }

  if (!data.ok) {
    const retryAfter = Number(
      data.parameters?.retry_after || 0
    );

    if (
      data.error_code === 429 &&
      retryAfter > 0 &&
      attempt < 2
    ) {
      await sleep(
        Math.min(retryAfter * 1000, 10000)
      );

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    if (
      response.status >= 500 &&
      attempt < 2
    ) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    const error = new Error(
      data.description ||
      `Telegram API 错误：${method}`
    );

    error.errorCode = data.error_code;
    error.parameters = data.parameters;

    throw error;
  }

  return data.result;
}

/* -------------------------------------------------------------------------- */
/*                                数据库迁移                                    */
/* -------------------------------------------------------------------------- */

async function ensureUserColumn(
  env,
  columnName,
  definition
) {
  const result = await env.TG_BOT_DB.prepare(
    'PRAGMA table_info(users)'
  ).all();

  const columns = result?.results || [];
  const exists = columns.some(
    (column) => column.name === columnName
  );

  if (!exists) {
    await env.TG_BOT_DB.prepare(
      `ALTER TABLE users ADD COLUMN ` +
      `${columnName} ${definition}`
    ).run();
  }
}

async function dbMigrate(env) {
  if (!env.TG_BOT_DB) {
    throw new Error(
      "D1 database binding 'TG_BOT_DB' is missing."
    );
  }

  const queries = [
    `
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY NOT NULL,
      user_state TEXT NOT NULL DEFAULT 'new',
      is_blocked INTEGER NOT NULL DEFAULT 0,
      is_muted INTEGER NOT NULL DEFAULT 0,
      block_count INTEGER NOT NULL DEFAULT 0,
      topic_id TEXT,
      info_card_message_id TEXT,
      user_info_json TEXT,
      topic_creating INTEGER NOT NULL DEFAULT 0,
      topic_lock_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS messages (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      text TEXT,
      date INTEGER,
      PRIMARY KEY (user_id, message_id)
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS processed_updates (
      update_id TEXT PRIMARY KEY NOT NULL,
      processed_at INTEGER NOT NULL
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_users_topic_id
    ON users(topic_id)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_messages_date
    ON messages(date)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_processed_updates_time
    ON processed_updates(processed_at)
    `
  ];

  await env.TG_BOT_DB.batch(
    queries.map((query) =>
      env.TG_BOT_DB.prepare(query)
    )
  );

  // 兼容旧数据库结构
  await ensureUserColumn(
    env,
    'topic_creating',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await ensureUserColumn(
    env,
    'topic_lock_at',
    'INTEGER'
  );
}

async function ensureMigration(env) {
  if (!migrationPromise) {
    migrationPromise = dbMigrate(env).catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

async function cleanupDatabase(env) {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - DATABASE_RETENTION_SECONDS;

  try {
    await env.TG_BOT_DB.batch([
      env.TG_BOT_DB.prepare(
        'DELETE FROM messages WHERE date < ?'
      ).bind(cutoff),

      env.TG_BOT_DB.prepare(
        'DELETE FROM processed_updates ' +
        'WHERE processed_at < ?'
      ).bind(cutoff)
    ]);
  } catch (error) {
    console.error(
      '清理数据库失败：',
      error?.message || error
    );
  }
}

async function claimUpdate(updateId, env) {
  if (
    updateId === null ||
    updateId === undefined
  ) {
    return true;
  }

  const result = await env.TG_BOT_DB.prepare(`
    INSERT OR IGNORE INTO processed_updates (
      update_id,
      processed_at
    ) VALUES (?, ?)
  `).bind(
    String(updateId),
    Math.floor(Date.now() / 1000)
  ).run();

  return Number(result?.meta?.changes || 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*                               配置数据库操作                                  */
/* -------------------------------------------------------------------------- */

async function dbConfigGet(key, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT value FROM config WHERE key = ?'
  ).bind(key).first();

  return row ? row.value : null;
}

async function dbConfigPut(key, value, env) {
  await env.TG_BOT_DB.prepare(`
    INSERT INTO config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value
  `).bind(key, String(value)).run();
}

async function dbConfigDelete(key, env) {
  await env.TG_BOT_DB.prepare(
    'DELETE FROM config WHERE key = ?'
  ).bind(key).run();
}

async function getConfig(
  key,
  env,
  defaultValue = ''
) {
  const value = await dbConfigGet(key, env);

  if (value !== null) {
    return value;
  }

  if (DEFAULTS[key] !== undefined) {
    return DEFAULTS[key];
  }

  return defaultValue;
}

async function setConfig(key, value, env) {
  await dbConfigPut(key, value, env);
}

/* -------------------------------------------------------------------------- */
/*                                用户数据库操作                                 */
/* -------------------------------------------------------------------------- */

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    is_blocked: Number(user.is_blocked) === 1,
    is_muted: Number(user.is_muted) === 1,
    topic_creating:
      Number(user.topic_creating) === 1,
    user_info: user.user_info_json
      ? safeJsonParse(user.user_info_json, null)
      : null
  };
}

async function dbUserGet(userId, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT * FROM users WHERE user_id = ?'
  ).bind(String(userId)).first();

  return normalizeUser(row);
}

async function dbUserGetOrCreate(userId, env) {
  const normalizedId = String(userId);
  const now = Math.floor(Date.now() / 1000);

  await env.TG_BOT_DB.prepare(`
    INSERT OR IGNORE INTO users (
      user_id,
      user_state,
      is_blocked,
      is_muted,
      block_count,
      topic_creating,
      created_at,
      updated_at
    ) VALUES (?, ?, 0, 0, 0, 0, ?, ?)
  `).bind(
    normalizedId,
    USER_STATE.NEW,
    now,
    now
  ).run();

  return dbUserGet(normalizedId, env);
}

async function dbUserUpdate(userId, data, env) {
  if (
    !data ||
    Object.keys(data).length === 0
  ) {
    return;
  }

  const payload = {
    ...data,
    updated_at: Math.floor(Date.now() / 1000)
  };

  if (payload.user_info !== undefined) {
    payload.user_info_json =
      payload.user_info === null
        ? null
        : JSON.stringify(payload.user_info);

    delete payload.user_info;
  }

  const keys = Object.keys(payload).filter(
    (key) => USER_UPDATE_FIELDS.has(key)
  );

  if (keys.length === 0) {
    return;
  }

  const fields = keys
    .map((key) => `${key} = ?`)
    .join(', ');

  const values = keys.map((key) => {
    const value = payload[key];

    if (
      key === 'is_blocked' ||
      key === 'is_muted' ||
      key === 'topic_creating'
    ) {
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
    }

    return value;
  });

  await env.TG_BOT_DB.prepare(
    `UPDATE users SET ${fields} WHERE user_id = ?`
  ).bind(
    ...values,
    String(userId)
  ).run();
}

async function dbTopicUserGet(topicId, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT user_id FROM users WHERE topic_id = ?'
  ).bind(String(topicId)).first();

  return row ? row.user_id : null;
}

async function incrementBlockCount(
  userId,
  threshold,
  env
) {
  await env.TG_BOT_DB.prepare(`
    UPDATE users
    SET
      block_count = block_count + 1,
      is_blocked = CASE
        WHEN block_count + 1 >= ? THEN 1
        ELSE is_blocked
      END,
      updated_at = ?
    WHERE user_id = ?
  `).bind(
    threshold,
    Math.floor(Date.now() / 1000),
    String(userId)
  ).run();

  const user = await dbUserGetOrCreate(userId, env);

  return {
    currentCount: Number(user.block_count || 0),
    shouldAutoBlock:
      Number(user.block_count || 0) >= threshold,
    isBlocked: user.is_blocked
  };
}

/* -------------------------------------------------------------------------- */
/*                               消息记录数据库                                  */
/* -------------------------------------------------------------------------- */

async function dbMessageDataPut(
  userId,
  messageId,
  data,
  env
) {
  await env.TG_BOT_DB.prepare(`
    INSERT INTO messages (
      user_id,
      message_id,
      text,
      date
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, message_id)
    DO UPDATE SET
      text = excluded.text,
      date = excluded.date
  `).bind(
    String(userId),
    String(messageId),
    data?.text || '',
    data?.date || null
  ).run();
}

async function dbMessageDataGet(
  userId,
  messageId,
  env
) {
  const row = await env.TG_BOT_DB.prepare(`
    SELECT text, date
    FROM messages
    WHERE user_id = ?
      AND message_id = ?
  `).bind(
    String(userId),
    String(messageId)
  ).first();

  return row || null;
}

/* -------------------------------------------------------------------------- */
/*                               管理员权限管理                                  */
/* -------------------------------------------------------------------------- */

function getPrimaryAdminIds(env) {
  if (!env.ADMIN_IDS) return [];

  return env.ADMIN_IDS
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isPrimaryAdmin(userId, env) {
  return getPrimaryAdminIds(env).includes(
    String(userId)
  );
}

async function getAuthorizedAdmins(env) {
  const raw = await getConfig(
    'authorized_admins',
    env,
    '[]'
  );

  const list = safeJsonParse(raw, []);

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((value) => String(value).trim())
    .filter((value) => /^\d+$/.test(value));
}

async function isAdminUser(userId, env) {
  if (isPrimaryAdmin(userId, env)) {
    return true;
  }

  const admins = await getAuthorizedAdmins(env);

  return admins.includes(String(userId));
}

/* -------------------------------------------------------------------------- */
/*                             管理员输入状态管理                                 */
/* -------------------------------------------------------------------------- */

async function getAdminState(userId, env) {
  const raw = await dbConfigGet(
    `admin_state:${userId}`,
    env
  );

  if (!raw) return null;

  const state = safeJsonParse(raw, null);

  if (!state || typeof state !== 'object') {
    await clearAdminState(userId, env);
    return null;
  }

  if (
    !state.createdAt ||
    Date.now() - Number(state.createdAt) >
      ADMIN_STATE_TTL_MS
  ) {
    await clearAdminState(userId, env);
    return null;
  }

  return state;
}

async function setAdminState(userId, state, env) {
  await dbConfigPut(
    `admin_state:${userId}`,
    JSON.stringify({
      ...state,
      createdAt: Date.now()
    }),
    env
  );
}

async function clearAdminState(userId, env) {
  await dbConfigDelete(
    `admin_state:${userId}`,
    env
  );
}

/* -------------------------------------------------------------------------- */
/*                              正则及过滤规则                                   */
/* -------------------------------------------------------------------------- */

function mergeRegexFlags(...groups) {
  // 禁止 g/y，避免 test() 状态化。
  const allowed = 'imsuv';
  let merged = '';

  for (const group of groups) {
    for (const flag of String(group || '')) {
      if (
        allowed.includes(flag) &&
        !merged.includes(flag)
      ) {
        merged += flag;
      }
    }
  }

  // u 和 v 不能同时使用
  if (
    merged.includes('u') &&
    merged.includes('v')
  ) {
    merged = merged.replace('v', '');
  }

  return merged;
}

function looksDangerousRegex(source) {
  // 只能防住部分常见灾难性回溯，不是完整正则分析器。
  const nestedQuantifier =
    /(\([^)]*[+*][^)]*\))[+*{]/;

  const repeatedWildcard =
    /(\.\*|\.\+).*(\.\*|\.\+)/;

  return (
    nestedQuantifier.test(source) ||
    repeatedWildcard.test(source)
  );
}

function buildRegexRule(
  pattern,
  defaultFlags = 'i'
) {
  let source = String(pattern || '').trim();
  let flags = defaultFlags;

  if (!source) {
    throw new Error('表达式不能为空');
  }

  if (
    source.length >
    LIMITS.auto_reply_pattern
  ) {
    throw new Error(
      `表达式不能超过 ` +
      `${LIMITS.auto_reply_pattern} 个字符`
    );
  }

  const literalMatch = source.match(
    /^\/([\s\S]*)\/([a-z]*)$/i
  );

  if (literalMatch) {
    source = literalMatch[1];
    flags = mergeRegexFlags(
      defaultFlags,
      literalMatch[2]
    );
  }

  const inlineFlagsMatch = source.match(
    /^\(\?([a-z]+)\)/i
  );

  if (inlineFlagsMatch) {
    flags = mergeRegexFlags(
      flags,
      inlineFlagsMatch[1].toLowerCase()
    );

    source = source.slice(
      inlineFlagsMatch[0].length
    );
  }

  if (!source) {
    throw new Error('正则表达式内容不能为空');
  }

  if (looksDangerousRegex(source)) {
    throw new Error(
      '表达式可能造成严重性能问题，请简化正则'
    );
  }

  return new RegExp(source, flags);
}

function validateRegexPattern(pattern) {
  buildRegexRule(pattern);
}

async function getAutoReplyRules(env) {
  const raw = await getConfig(
    'keyword_responses',
    env,
    '[]'
  );

  const rules = safeJsonParse(raw, []);

  return Array.isArray(rules)
    ? rules.filter(
        (rule) =>
          rule &&
          typeof rule === 'object' &&
          rule.keywords !== undefined
      )
    : [];
}

async function getBlockKeywords(env) {
  const raw = await getConfig(
    'block_keywords',
    env,
    '[]'
  );

  const keywords = safeJsonParse(raw, []);

  return Array.isArray(keywords)
    ? keywords.map(String)
    : [];
}

async function getBlockThreshold(env) {
  const raw = await getConfig(
    'block_threshold',
    env,
    '5'
  );

  const threshold = Number(raw);

  if (
    !Number.isInteger(threshold) ||
    threshold < 1 ||
    threshold > 100
  ) {
    return 5;
  }

  return threshold;
}

async function findBlockKeyword(text, env) {
  if (!text) return null;

  const keywords = await getBlockKeywords(env);
  const safeText = String(text).slice(
    0,
    LIMITS.filter_text
  );

  for (const keyword of keywords) {
    try {
      const regex = buildRegexRule(keyword);

      if (regex.test(safeText)) {
        return keyword;
      }
    } catch (error) {
      console.error(
        '无效屏蔽关键词正则：',
        keyword,
        error?.message || error
      );
    }
  }

  return null;
}

async function matchAutoReply(text, env) {
  if (!text) return null;

  const rules = await getAutoReplyRules(env);
  const safeText = String(text).slice(
    0,
    LIMITS.filter_text
  );

  for (const rule of rules) {
    try {
      const regex = buildRegexRule(
        rule.keywords
      );

      if (regex.test(safeText)) {
        return rule.response || null;
      }
    } catch (error) {
      console.error(
        '自动回复规则错误：',
        rule,
        error?.message || error
      );
    }
  }

  return null;
}

async function getFilterConfig(env) {
  return {
    media: toBoolText(
      await getConfig(
        'enable_image_forwarding',
        env,
        'true'
      )
    ),
    link: toBoolText(
      await getConfig(
        'enable_link_forwarding',
        env,
        'true'
      )
    ),
    text: toBoolText(
      await getConfig(
        'enable_text_forwarding',
        env,
        'true'
      )
    ),
    audio_voice: toBoolText(
      await getConfig(
        'enable_audio_forwarding',
        env,
        'true'
      )
    ),
    sticker_gif: toBoolText(
      await getConfig(
        'enable_sticker_forwarding',
        env,
        'true'
      )
    ),
    user_forward: toBoolText(
      await getConfig(
        'enable_user_forwarding',
        env,
        'true'
      )
    ),
    group_forward: toBoolText(
      await getConfig(
        'enable_group_forwarding',
        env,
        'true'
      )
    ),
    channel_forward: toBoolText(
      await getConfig(
        'enable_channel_forwarding',
        env,
        'true'
      )
    )
  };
}

async function checkForwardFilters(message, env) {
  const filters = await getFilterConfig(env);
  const kind = detectMessageKind(message);
  const forwardType = getForwardType(message);

  if (kind === 'media' && !filters.media) {
    return {
      ok: false,
      reason: '当前不允许发送图片、视频或文件。'
    };
  }

  if (
    kind === 'audio_voice' &&
    !filters.audio_voice
  ) {
    return {
      ok: false,
      reason: '当前不允许发送语音或音频。'
    };
  }

  if (
    kind === 'sticker_gif' &&
    !filters.sticker_gif
  ) {
    return {
      ok: false,
      reason: '当前不允许发送贴纸或 GIF。'
    };
  }

  if (kind === 'text' && !filters.text) {
    return {
      ok: false,
      reason: '当前不允许发送文本。'
    };
  }

  if (hasLinks(message) && !filters.link) {
    return {
      ok: false,
      reason: '当前不允许发送链接。'
    };
  }

  if (
    forwardType === 'user' &&
    !filters.user_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自用户的消息。'
    };
  }

  if (
    forwardType === 'group' &&
    !filters.group_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自群组的消息。'
    };
  }

  if (
    forwardType === 'channel' &&
    !filters.channel_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自频道的消息。'
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                             用户资料卡与话题                                  */
/* -------------------------------------------------------------------------- */

function buildUserInfoPayload(
  from,
  firstMessageDate = null
) {
  const userId = String(from.id);
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';

  const displayName = (
    `${firstName}` +
    `${lastName ? ` ${lastName}` : ''}`
  ).trim() || '未知用户';

  const usernameRaw = from.username || '';

  const usernameDisplay = usernameRaw
    ? `@${usernameRaw}`
    : '无';

  const topicName = (
    `${displayName} (${userId})`
  ).slice(0, 128);

  const clickableName =
    `<a href="tg://user?id=${userId}">` +
    `${escapeHtml(displayName)}</a>`;

  const usernameText = usernameRaw
    ? `<a href="https://t.me/` +
      `${encodeURIComponent(usernameRaw)}">` +
      `@${escapeHtml(usernameRaw)}</a>`
    : '无';

  const firstTimeText = firstMessageDate
    ? `<b>首次消息时间:</b> ` +
      `<code>${escapeHtml(
        formatTimestamp(firstMessageDate)
      )}</code>`
    : '';

  const infoCard = `
👤 <b>用户资料卡</b>
<b>姓名:</b> ${clickableName}
<b>用户名:</b> ${usernameText}
<b>ID:</b> <code>${escapeHtml(userId)}</code>
${firstTimeText}
  `.trim();

  return {
    userId,
    displayName,
    usernameRaw,
    usernameDisplay,
    topicName,
    infoCard
  };
}

function getProfileUrl(userId, usernameRaw) {
  if (
    usernameRaw &&
    /^[A-Za-z0-9_]{5,32}$/.test(usernameRaw)
  ) {
    return (
      `https://t.me/` +
      encodeURIComponent(usernameRaw)
    );
  }

  return `tg://user?id=${userId}`;
}

function getInfoCardButtons(
  userId,
  isBlocked,
  isMuted,
  usernameRaw = ''
) {
  return {
    inline_keyboard: [
      [
        {
          text: isBlocked
            ? '✅ 解除屏蔽'
            : '🚫 屏蔽用户',
          callback_data:
            `${isBlocked ? 'unblock' : 'block'}:` +
            `${userId}`
        },
        {
          text: isMuted
            ? '🔔 恢复通知'
            : '🔕 静音通知',
          callback_data:
            `${isMuted ? 'unmute' : 'mute'}:` +
            `${userId}`
        }
      ],
      [
        {
          text: '📌 置顶资料卡',
          callback_data: `pin_card:${userId}`
        },
        {
          text: '🔄 刷新资料卡',
          callback_data: `refresh_card:${userId}`
        }
      ],
      [
        {
          text: '👤 查看资料',
          url: getProfileUrl(
            userId,
            usernameRaw
          )
        }
      ]
    ]
  };
}

function buildCardSignature(payload) {
  return JSON.stringify({
    name: payload.displayName || '',
    usernameRaw: payload.usernameRaw || ''
  });
}

async function refreshUserInfoCard(
  userId,
  from,
  env,
  force = false
) {
  const user = await dbUserGetOrCreate(
    userId,
    env
  );

  if (
    !user.topic_id ||
    !user.info_card_message_id
  ) {
    return {
      updated: false,
      reason: 'missing_card'
    };
  }

  const firstMessageDate =
    user.user_info?.first_message_date ||
    user.created_at ||
    null;

  const payload = buildUserInfoPayload(
    from,
    firstMessageDate
  );

  const oldSignature = JSON.stringify({
    name: user.user_info?.name || '',
    usernameRaw:
      user.user_info?.username_raw || ''
  });

  const newSignature =
    buildCardSignature(payload);

  if (
    !force &&
    oldSignature === newSignature
  ) {
    return {
      updated: false,
      reason: 'not_modified'
    };
  }

  await telegramApi(
    env.BOT_TOKEN,
    'editMessageText',
    {
      chat_id: env.ADMIN_GROUP_ID,
      message_id: Number(
        user.info_card_message_id
      ),
      text: payload.infoCard,
      parse_mode: 'HTML',
      reply_markup: getInfoCardButtons(
        userId,
        user.is_blocked,
        user.is_muted,
        payload.usernameRaw
      )
    }
  );

  await dbUserUpdate(
    userId,
    {
      user_info: {
        name: payload.displayName,
        username: payload.usernameDisplay,
        username_raw: payload.usernameRaw,
        first_message_date: firstMessageDate
      }
    },
    env
  );

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(
          user.topic_id
        ),
        name: payload.topicName
      }
    );
  } catch (error) {
    const message = String(
      error?.message || error
    );

    if (
      !message.includes(
        'TOPIC_NOT_MODIFIED'
      ) &&
      !message.includes(
        'topic is not modified'
      )
    ) {
      console.error(
        '更新话题名称失败：',
        message
      );
    }
  }

  return {
    updated: true,
    reason: 'updated'
  };
}

async function createInfoCard(
  message,
  user,
  topicId,
  env
) {
  const payload = buildUserInfoPayload(
    message.from,
    message.date
  );

  const sent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id: Number(topicId),
      text: payload.infoCard,
      parse_mode: 'HTML',
      reply_markup: getInfoCardButtons(
        payload.userId,
        user.is_blocked,
        user.is_muted,
        payload.usernameRaw
      )
    }
  );

  await dbUserUpdate(
    payload.userId,
    {
      info_card_message_id:
        String(sent.message_id),
      user_info: {
        name: payload.displayName,
        username: payload.usernameDisplay,
        username_raw: payload.usernameRaw,
        first_message_date: message.date
      }
    },
    env
  );

  return sent.message_id;
}

async function waitForUserTopic(userId, env) {
  for (let i = 0; i < 12; i += 1) {
    await sleep(250);

    const user = await dbUserGet(
      userId,
      env
    );

    if (user?.topic_id) {
      return user.topic_id;
    }

    if (!user?.topic_creating) {
      break;
    }
  }

  return null;
}

async function ensureUserTopic(
  message,
  existingUser,
  env
) {
  const userId = String(message.from.id);
  let user =
    existingUser ||
    await dbUserGetOrCreate(userId, env);

  if (user.topic_id) {
    if (!user.info_card_message_id) {
      try {
        await createInfoCard(
          message,
          user,
          user.topic_id,
          env
        );
      } catch (error) {
        console.error(
          '补建资料卡失败：',
          error?.message || error
        );
      }
    }

    return user.topic_id;
  }

  const now = Math.floor(Date.now() / 1000);
  const staleTime =
    now - TOPIC_LOCK_TIMEOUT_SECONDS;

  const lockResult =
    await env.TG_BOT_DB.prepare(`
      UPDATE users
      SET
        topic_creating = 1,
        topic_lock_at = ?,
        updated_at = ?
      WHERE user_id = ?
        AND topic_id IS NULL
        AND (
          topic_creating = 0
          OR topic_lock_at IS NULL
          OR topic_lock_at < ?
        )
    `).bind(
      now,
      now,
      userId,
      staleTime
    ).run();

  const acquired =
    Number(lockResult?.meta?.changes || 0) > 0;

  if (!acquired) {
    const topicId = await waitForUserTopic(
      userId,
      env
    );

    if (topicId) {
      return topicId;
    }

    user = await dbUserGetOrCreate(
      userId,
      env
    );

    if (user.topic_id) {
      return user.topic_id;
    }

    throw new Error(
      '用户话题正在创建，请稍后重试'
    );
  }

  try {
    const payload = buildUserInfoPayload(
      message.from,
      message.date
    );

    const topic = await telegramApi(
      env.BOT_TOKEN,
      'createForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        name: payload.topicName
      }
    );

    const topicId = String(
      topic.message_thread_id
    );

    // 先保存话题 ID，避免资料卡发送失败时重复创建话题。
    await dbUserUpdate(
      userId,
      {
        topic_id: topicId,
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    try {
      await createInfoCard(
        message,
        user,
        topicId,
        env
      );
    } catch (error) {
      console.error(
        '创建用户资料卡失败：',
        error?.message || error
      );
    }

    return topicId;
  } catch (error) {
    await dbUserUpdate(
      userId,
      {
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    throw error;
  }
}

async function maybeAutoRefreshUserCard(
  message,
  env
) {
  if (!message?.from?.id) return;

  const userId = String(message.from.id);
  const user = await dbUserGetOrCreate(
    userId,
    env
  );

  if (
    !user.topic_id ||
    !user.info_card_message_id
  ) {
    return;
  }

  const oldName =
    user.user_info?.name || '';

  const oldUsernameRaw =
    user.user_info?.username_raw || '';

  const newName = (
    `${message.from.first_name || ''}` +
    `${message.from.last_name
      ? ` ${message.from.last_name}`
      : ''}`
  ).trim() || '未知用户';

  const newUsernameRaw =
    message.from.username || '';

  if (
    oldName === newName &&
    oldUsernameRaw === newUsernameRaw
  ) {
    return;
  }

  try {
    await refreshUserInfoCard(
      userId,
      message.from,
      env
    );
  } catch (error) {
    console.error(
      '自动刷新资料卡失败：',
      error?.message || error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                消息转发                                       */
/* -------------------------------------------------------------------------- */

async function saveUserMessageRecord(
  message,
  env
) {
  if (!message.text && !message.caption) {
    return;
  }

  try {
    await dbMessageDataPut(
      String(message.from.id),
      getMessageStorageKey(
        'user',
        message.message_id
      ),
      {
        text:
          message.text ||
          message.caption ||
          '',
        date: message.date
      },
      env
    );
  } catch (error) {
    console.error(
      '保存用户消息记录失败：',
      error?.message || error
    );
  }
}

async function relayUserMessageToTopic(
  message,
  user,
  env
) {
  let topicId = user.topic_id;

  if (!topicId) {
    topicId = await ensureUserTopic(
      message,
      user,
      env
    );
  } else {
    await maybeAutoRefreshUserCard(
      message,
      env
    );
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'copyMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        from_chat_id:
          String(message.chat.id),
        message_id:
          message.message_id,
        disable_notification:
          Boolean(
            user.is_blocked ||
            user.is_muted
          )
      }
    );
  } catch (error) {
    if (!isTopicInvalidError(error)) {
      throw error;
    }

    console.error(
      '用户话题已失效，准备重建：',
      error?.message || error
    );

    await dbUserUpdate(
      String(message.from.id),
      {
        topic_id: null,
        info_card_message_id: null,
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    const refreshedUser =
      await dbUserGetOrCreate(
        message.from.id,
        env
      );

    const newTopicId =
      await ensureUserTopic(
        message,
        refreshedUser,
        env
      );

    await telegramApi(
      env.BOT_TOKEN,
      'copyMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(newTopicId),
        from_chat_id:
          String(message.chat.id),
        message_id:
          message.message_id,
        disable_notification:
          Boolean(
            user.is_blocked ||
            user.is_muted
          )
      }
    );
  }

  await saveUserMessageRecord(
    message,
    env
  );
}

async function relayAdminMessageToUser(
  message,
  userId,
  env
) {
  return telegramApi(
    env.BOT_TOKEN,
    'copyMessage',
    {
      chat_id: String(userId),
      from_chat_id:
        String(message.chat.id),
      message_id: message.message_id
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                               菜单渲染函数                                    */
/* -------------------------------------------------------------------------- */

async function renderMenu(
  env,
  {
    chatId,
    messageId = 0,
    text,
    reply_markup,
    parse_mode = 'HTML'
  }
) {
  const params = {
    chat_id: chatId,
    text,
    parse_mode,
    reply_markup
  };

  if (!messageId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editMessageText',
      {
        ...params,
        message_id: messageId
      }
    );
  } catch (error) {
    const errorText = String(
      error?.message || error
    ).toLowerCase();

    if (
      errorText.includes(
        'message is not modified'
      )
    ) {
      return;
    }

    if (
      errorText.includes(
        'message to edit not found'
      ) ||
      errorText.includes(
        "message can't be edited"
      )
    ) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        params
      );

      return;
    }

    throw error;
  }
}

async function showMainMenu(
  chatId,
  env,
  messageId = 0
) {
  const text = `
⚙️ <b>机器人主配置菜单</b>

请选择要管理的配置类别：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '📝 基础配置（验证问答）',
          callback_data:
            'config:menu:base'
        }
      ],
      [
        {
          text: '🤖 自动回复管理',
          callback_data:
            'config:menu:autoreply'
        }
      ],
      [
        {
          text: '🚫 关键词屏蔽管理',
          callback_data:
            'config:menu:keyword'
        }
      ],
      [
        {
          text: '🔗 按类型过滤管理',
          callback_data:
            'config:menu:filter'
        }
      ],
      [
        {
          text: '🧑‍💻 协管员授权设置',
          callback_data:
            'config:menu:authorized'
        }
      ],
      [
        {
          text: '🔄 刷新主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showBaseMenu(
  chatId,
  env,
  messageId = 0
) {
  const welcomeMsg = await getConfig(
    'welcome_msg',
    env
  );

  const verificationQuestion =
    await getConfig('verif_q', env);

  const verificationAnswer =
    await getConfig('verif_a', env);

  const text = `
⚙️ <b>基础配置（人机验证）</b>

<b>当前设置：</b>
• 欢迎消息：${escapeHtml(welcomeMsg).slice(0, 30)}${welcomeMsg.length > 30 ? '…' : ''}
• 验证问题：${escapeHtml(verificationQuestion).slice(0, 30)}${verificationQuestion.length > 30 ? '…' : ''}
• 验证答案：<code>${escapeHtml(verificationAnswer)}</code>

请选择要修改的配置项：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '📝 编辑欢迎消息',
          callback_data:
            'config:edit:welcome_msg'
        }
      ],
      [
        {
          text: '❓ 编辑验证问题',
          callback_data:
            'config:edit:verif_q'
        }
      ],
      [
        {
          text: '🔑 编辑验证答案',
          callback_data:
            'config:edit:verif_a'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showAutoReplyMenu(
  chatId,
  env,
  messageId = 0
) {
  const rules = await getAutoReplyRules(env);

  const text = `
🤖 <b>自动回复管理</b>

当前规则数量：${rules.length}

新增规则格式：
<code>关键词表达式===回复内容</code>
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '➕ 新增规则',
          callback_data:
            'config:add:keyword_responses'
        }
      ],
      [
        {
          text: '📋 查看规则列表',
          callback_data:
            'config:list:keyword_responses:0'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showKeywordMenu(
  chatId,
  env,
  messageId = 0
) {
  const keywords =
    await getBlockKeywords(env);

  const threshold =
    await getBlockThreshold(env);

  const preview = keywords
    .slice(0, 5)
    .map(
      (keyword) =>
        `• ${escapeHtml(keyword)}`
    )
    .join('\n') || '无';

  const text = `
🚫 <b>关键词屏蔽管理</b>

当前阈值：<code>${threshold}</code>
当前规则数量：${keywords.length}

前 5 条预览：
${preview}
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '➕ 新增屏蔽关键词',
          callback_data:
            'config:add:block_keywords'
        }
      ],
      [
        {
          text: '📝 修改屏蔽阈值',
          callback_data:
            'config:edit:block_threshold'
        }
      ],
      [
        {
          text: '📋 查看关键词列表',
          callback_data:
            'config:list:block_keywords:0'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

function filterStatus(value) {
  return value ? '✅ 开' : '❌ 关';
}

async function showFilterMenu(
  chatId,
  env,
  messageId = 0
) {
  const filters =
    await getFilterConfig(env);

  const text = `
🔗 <b>按类型过滤管理</b>

点击按钮即可切换状态：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text:
            `1. 图片/视频/文件 ` +
            filterStatus(filters.media),
          callback_data:
            'config:toggle:' +
            'enable_image_forwarding:' +
            `${!filters.media}`
        }
      ],
      [
        {
          text:
            `2. 链接 ` +
            filterStatus(filters.link),
          callback_data:
            'config:toggle:' +
            'enable_link_forwarding:' +
            `${!filters.link}`
        },
        {
          text:
            `3. 文本 ` +
            filterStatus(filters.text),
          callback_data:
            'config:toggle:' +
            'enable_text_forwarding:' +
            `${!filters.text}`
        }
      ],
      [
        {
          text:
            `4. 音频/语音 ` +
            filterStatus(
              filters.audio_voice
            ),
          callback_data:
            'config:toggle:' +
            'enable_audio_forwarding:' +
            `${!filters.audio_voice}`
        }
      ],
      [
        {
          text:
            `5. 贴纸/GIF ` +
            filterStatus(
              filters.sticker_gif
            ),
          callback_data:
            'config:toggle:' +
            'enable_sticker_forwarding:' +
            `${!filters.sticker_gif}`
        }
      ],
      [
        {
          text:
            `6. 用户转发 ` +
            filterStatus(
              filters.user_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_user_forwarding:' +
            `${!filters.user_forward}`
        }
      ],
      [
        {
          text:
            `7. 群组转发 ` +
            filterStatus(
              filters.group_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_group_forwarding:' +
            `${!filters.group_forward}`
        }
      ],
      [
        {
          text:
            `8. 频道转发 ` +
            filterStatus(
              filters.channel_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_channel_forwarding:' +
            `${!filters.channel_forward}`
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showAuthorizedMenu(
  chatId,
  env,
  messageId = 0
) {
  const primaryAdmins =
    getPrimaryAdminIds(env);

  const authorized =
    await getAuthorizedAdmins(env);

  const all = [
    ...new Set([
      ...primaryAdmins,
      ...authorized
    ])
  ];

  const text = `
🧑‍💻 <b>协管员授权设置</b>

<b>主管理员：</b>
<code>${escapeHtml(primaryAdmins.join(', ') || '无')}</code>

<b>已授权协管员：</b>
<code>${escapeHtml(authorized.join(', ') || '无')}</code>

<b>总人数：</b>${all.length}

输入格式：多个 ID 使用英文逗号分隔。
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '✏️ 设置/修改协管员列表',
          callback_data:
            'config:edit:authorized_admins'
        }
      ],
      [
        {
          text:
            `🗑️ 清空协管员列表 ` +
            `(${authorized.length}人)`,
          callback_data:
            'config:clear:authorized_admins'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

/* -------------------------------------------------------------------------- */
/*                               验证处理                                       */
/* -------------------------------------------------------------------------- */

async function handleStart(
  chatId,
  env
) {
  const welcomeMessage = await getConfig(
    'welcome_msg',
    env
  );

  const verificationQuestion =
    await getConfig('verif_q', env);

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: welcomeMessage
    }
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: verificationQuestion
    }
  );

  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.PENDING
    },
    env
  );
}

async function handleVerification(
  chatId,
  answer,
  env
) {
  const expected = await getConfig(
    'verif_a',
    env,
    '3'
  );

  const expectedAnswers = expected
    .split('|')
    .map((item) =>
      item.trim().toLowerCase()
    )
    .filter(Boolean);

  const normalized = String(answer || '')
    .trim()
    .toLowerCase();

  const isCorrect =
    expectedAnswers.includes(normalized);

  if (!isCorrect) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '🥺 抱歉，这次没有回答正确，' +
          '请重新查看提示后再试。'
      }
    );

    return false;
  }

  // 先更新状态，再通知用户，避免用户快速发送消息时状态未保存。
  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.VERIFIED
    },
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '🎉 验证成功！现在可以开始发送消息了。'
    }
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/*                             管理员配置输入处理                                 */
/* -------------------------------------------------------------------------- */

async function sendAdminInputError(
  userId,
  text,
  env
) {
  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: userId,
      text
    }
  );
}

async function handleAdminConfigInput(
  userId,
  text,
  state,
  env
) {
  if (
    !state ||
    state.action !== 'awaiting_input'
  ) {
    await clearAdminState(userId, env);
    return;
  }

  if (
    String(text || '').toLowerCase() ===
    '/cancel'
  ) {
    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '❌ 已取消输入。'
      }
    );

    await showMainMenu(userId, env);
    return;
  }

  let finalValue = String(text || '');

  if (!finalValue.trim()) {
    await sendAdminInputError(
      userId,
      '⚠️ 输入内容不能为空，或发送 /cancel 取消。',
      env
    );

    return;
  }

  if (state.key === 'welcome_msg') {
    if (
      finalValue.length >
      LIMITS.welcome_msg
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 欢迎消息最多允许 ` +
        `${LIMITS.welcome_msg} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'verif_q') {
    if (
      finalValue.length > LIMITS.verif_q
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 验证问题最多允许 ` +
        `${LIMITS.verif_q} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'verif_a') {
    finalValue = finalValue.trim();

    if (
      finalValue.length > LIMITS.verif_a
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 验证答案最多允许 ` +
        `${LIMITS.verif_a} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'block_threshold') {
    const threshold = Number(
      finalValue.trim()
    );

    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      threshold > 100
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 屏蔽阈值必须是 1 到 100 之间的整数。',
        env
      );

      return;
    }

    finalValue = String(threshold);
  }

  if (state.key === 'authorized_admins') {
    if (
      finalValue.length >
      LIMITS.authorized_admins
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 协管员列表内容过长。',
        env
      );

      return;
    }

    const ids = [
      ...new Set(
        finalValue
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];

    const invalidIds = ids.filter(
      (id) => !/^\d+$/.test(id)
    );

    if (invalidIds.length > 0) {
      await sendAdminInputError(
        userId,
        `⚠️ 以下 ID 格式不正确：` +
        `${invalidIds.slice(0, 5).join(', ')}`,
        env
      );

      return;
    }

    finalValue = JSON.stringify(ids);
  }

  if (state.key === 'block_keywords_add') {
    const newKeyword =
      finalValue.trim();

    if (
      newKeyword.length >
      LIMITS.block_keyword
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 关键词表达式最多允许 ` +
        `${LIMITS.block_keyword} 个字符。`,
        env
      );

      return;
    }

    try {
      validateRegexPattern(newKeyword);
    } catch (error) {
      await sendAdminInputError(
        userId,
        `⚠️ 无效的表达式：` +
        `${error?.message || error}`,
        env
      );

      return;
    }

    const keywords =
      await getBlockKeywords(env);

    if (keywords.includes(newKeyword)) {
      await sendAdminInputError(
        userId,
        '⚠️ 该关键词已经存在。',
        env
      );

      return;
    }

    keywords.push(newKeyword);

    await setConfig(
      'block_keywords',
      JSON.stringify(keywords),
      env
    );

    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '✅ 屏蔽关键词已添加。'
      }
    );

    await showKeywordMenu(userId, env);
    return;
  }

  if (
    state.key === 'keyword_responses_add'
  ) {
    const separatorIndex =
      finalValue.indexOf('===');

    const keywordExpression =
      separatorIndex >= 0
        ? finalValue
            .slice(0, separatorIndex)
            .trim()
        : '';

    const responseText =
      separatorIndex >= 0
        ? finalValue
            .slice(separatorIndex + 3)
            .trim()
        : '';

    if (
      !keywordExpression ||
      !responseText
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 格式错误，请使用：' +
        '关键词表达式===回复内容',
        env
      );

      return;
    }

    if (
      keywordExpression.length >
      LIMITS.auto_reply_pattern
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 关键词表达式最多允许 ` +
        `${LIMITS.auto_reply_pattern} 个字符。`,
        env
      );

      return;
    }

    if (
      responseText.length >
      LIMITS.auto_reply_response
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 回复内容最多允许 ` +
        `${LIMITS.auto_reply_response} 个字符。`,
        env
      );

      return;
    }

    try {
      validateRegexPattern(
        keywordExpression
      );
    } catch (error) {
      await sendAdminInputError(
        userId,
        `⚠️ 无效的表达式：` +
        `${error?.message || error}`,
        env
      );

      return;
    }

    const rules =
      await getAutoReplyRules(env);

    rules.push({
      id: randomId(),
      keywords: keywordExpression,
      response: responseText
    });

    await setConfig(
      'keyword_responses',
      JSON.stringify(rules),
      env
    );

    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '✅ 自动回复规则已添加。'
      }
    );

    await showAutoReplyMenu(userId, env);
    return;
  }

  await setConfig(
    state.key,
    finalValue,
    env
  );

  await clearAdminState(userId, env);

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: userId,
      text:
        `✅ 配置项 ${state.key} 已更新。`
    }
  );

  if (
    [
      'welcome_msg',
      'verif_q',
      'verif_a'
    ].includes(state.key)
  ) {
    await showBaseMenu(userId, env);
  } else if (
    state.key === 'block_threshold'
  ) {
    await showKeywordMenu(userId, env);
  } else if (
    state.key === 'authorized_admins'
  ) {
    await showAuthorizedMenu(
      userId,
      env
    );
  } else {
    await showMainMenu(userId, env);
  }
}

/* -------------------------------------------------------------------------- */
/*                               私聊消息处理                                    */
/* -------------------------------------------------------------------------- */

async function handleBlockedKeyword(
  userId,
  chatId,
  hitKeyword,
  env
) {
  const threshold =
    await getBlockThreshold(env);

  const result = await incrementBlockCount(
    userId,
    threshold,
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        `⚠️ 您的消息触发了关键词过滤器 ` +
        `(${result.currentCount}/${threshold} 次)，` +
        `消息已丢弃。`
    }
  );

  if (result.shouldAutoBlock) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '❌ 您已多次触发关键词过滤，' +
          '当前已被自动屏蔽。'
      }
    );
  }

  console.log(
    `用户 ${userId} 命中关键词：`,
    hitKeyword
  );
}

async function handlePrivateMessage(
  message,
  env
) {
  if (!message?.chat?.id) return;

  const chatId =
    String(message.chat.id);

  const userId =
    String(message.from?.id || chatId);

  const text = getMessageText(message);
  const commandText =
    String(message.text || '').trim();

  const isPrimary =
    isPrimaryAdmin(userId, env);

  const isAdmin =
    await isAdminUser(userId, env);

  if (
    commandText === '/start' ||
    commandText === '/help'
  ) {
    if (isPrimary) {
      await showMainMenu(chatId, env);
      return;
    }

    const user =
      await dbUserGetOrCreate(
        userId,
        env
      );

    if (isAdmin) {
      if (
        user.user_state !==
        USER_STATE.VERIFIED
      ) {
        await dbUserUpdate(
          userId,
          {
            user_state:
              USER_STATE.VERIFIED
          },
          env
        );
      }

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '✅ 您是已授权协管员，可以在管理群用户话题中回复消息。'
        }
      );

      return;
    }

    if (
      user.user_state ===
      USER_STATE.VERIFIED
    ) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '您已通过验证，可以直接发送消息。'
        }
      );
    } else {
      await handleStart(chatId, env);
    }

    return;
  }

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (user.is_blocked) {
    return;
  }

  if (isPrimary) {
    const adminState =
      await getAdminState(userId, env);

    if (adminState) {
      if (!message.text) {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: chatId,
            text:
              '⚠️ 当前正在等待文本配置，' +
              '请发送文字或使用 /cancel 取消。'
          }
        );

        return;
      }

      await handleAdminConfigInput(
        userId,
        message.text,
        adminState,
        env
      );

      return;
    }
  }

  if (
    isAdmin &&
    user.user_state !==
      USER_STATE.VERIFIED
  ) {
    await dbUserUpdate(
      userId,
      {
        user_state: USER_STATE.VERIFIED
      },
      env
    );

    user.user_state =
      USER_STATE.VERIFIED;
  }

  if (
    user.user_state === USER_STATE.NEW
  ) {
    await handleStart(chatId, env);
    return;
  }

  if (
    user.user_state ===
    USER_STATE.PENDING
  ) {
    if (!message.text) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '请使用文字回答验证问题。'
        }
      );

      return;
    }

    await handleVerification(
      chatId,
      message.text,
      env
    );

    return;
  }

  if (
    user.user_state !==
    USER_STATE.VERIFIED
  ) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '请使用 /start 命令开始验证。'
      }
    );

    return;
  }

  const hitKeyword =
    await findBlockKeyword(text, env);

  if (hitKeyword) {
    await handleBlockedKeyword(
      userId,
      chatId,
      hitKeyword,
      env
    );

    return;
  }

  const filterResult =
    await checkForwardFilters(
      message,
      env
    );

  if (!filterResult.ok) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          `⚠️ ${filterResult.reason}`
      }
    );

    return;
  }

  const autoReply =
    await matchAutoReply(text, env);

  if (autoReply) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: autoReply
      }
    );
  }

  await relayUserMessageToTopic(
    message,
    user,
    env
  );
}

/* -------------------------------------------------------------------------- */
/*                              管理员回复处理                                   */
/* -------------------------------------------------------------------------- */

async function handleAdminReply(
  message,
  env
) {
  if (
    !message?.is_topic_message ||
    !message?.message_thread_id
  ) {
    return;
  }

  if (
    String(message.chat.id) !==
    String(env.ADMIN_GROUP_ID)
  ) {
    return;
  }

  if (message.from?.is_bot) {
    return;
  }

  const senderId =
    String(message.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    return;
  }

  const topicId =
    String(message.message_thread_id);

  const userId =
    await dbTopicUserGet(
      topicId,
      env
    );

  if (!userId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        text:
          '❌ 找不到该话题对应的用户 ID，无法转发消息。'
      }
    );

    return;
  }

  try {
    await relayAdminMessageToUser(
      message,
      userId,
      env
    );

    if (
      message.text ||
      message.caption
    ) {
      await dbMessageDataPut(
        userId,
        getMessageStorageKey(
          'admin',
          message.message_id
        ),
        {
          text:
            message.text ||
            message.caption ||
            '',
          date: message.date
        },
        env
      );
    }
  } catch (error) {
    console.error(
      '管理员消息转发失败：',
      error?.message || error
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        text:
          `❌ 转发消息给用户 ${userId} 失败：` +
          `${error?.message || error}`
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               编辑消息处理                                    */
/* -------------------------------------------------------------------------- */

async function handleRelayEditedMessage(
  editedMessage,
  env
) {
  if (!editedMessage?.from?.id) return;

  const userId =
    String(editedMessage.from.id);

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (
    user.is_blocked ||
    user.user_state !==
      USER_STATE.VERIFIED ||
    !user.topic_id
  ) {
    return;
  }

  const text =
    getMessageText(editedMessage);

  const hitKeyword =
    await findBlockKeyword(text, env);

  if (hitKeyword) {
    await handleBlockedKeyword(
      userId,
      String(editedMessage.chat.id),
      hitKeyword,
      env
    );

    return;
  }

  const filterResult =
    await checkForwardFilters(
      editedMessage,
      env
    );

  if (!filterResult.ok) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id:
            String(editedMessage.chat.id),
          text:
            `⚠️ 编辑后的消息未通过过滤：` +
            `${filterResult.reason}`
        }
      );
    } catch (error) {
      console.error(
        '发送编辑过滤提示失败：',
        error?.message || error
      );
    }

    return;
  }

  const storageKey =
    getMessageStorageKey(
      'user',
      editedMessage.message_id
    );

  const stored =
    await dbMessageDataGet(
      userId,
      storageKey,
      env
    );

  const originalText =
    stored?.text ||
    '[原始内容无法获取或不是文本内容]';

  const originalDate = stored?.date
    ? formatTimestamp(stored.date)
    : '[发送时间无法获取]';

  const newContent =
    editedMessage.text ||
    editedMessage.caption ||
    '[非文本或媒体内容]';

  await dbMessageDataPut(
    userId,
    storageKey,
    {
      text: newContent,
      date:
        editedMessage.edit_date ||
        editedMessage.date
    },
    env
  );

  const notificationText = `
⚠️ <b>用户消息已修改</b>

<b>原消息发送时间：</b>
<code>${escapeHtml(originalDate)}</code>

<b>原始内容：</b>
${escapeHtml(originalText)}

<b>修改后的内容：</b>
${escapeHtml(newContent)}
  `.trim();

  try {
    await maybeAutoRefreshUserCard(
      editedMessage,
      env
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: notificationText,
        parse_mode: 'HTML'
      }
    );
  } catch (error) {
    console.error(
      '处理用户编辑消息失败：',
      error?.message || error
    );
  }
}

async function handleAdminEditedReply(
  editedMessage,
  env
) {
  if (
    !editedMessage?.is_topic_message ||
    !editedMessage?.message_thread_id
  ) {
    return;
  }

  if (
    String(editedMessage.chat.id) !==
    String(env.ADMIN_GROUP_ID)
  ) {
    return;
  }

  if (editedMessage.from?.is_bot) {
    return;
  }

  const senderId =
    String(editedMessage.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    return;
  }

  const topicId =
    String(editedMessage.message_thread_id);

  const userId =
    await dbTopicUserGet(
      topicId,
      env
    );

  if (!userId) {
    return;
  }

  const storageKey =
    getMessageStorageKey(
      'admin',
      editedMessage.message_id
    );

  const stored =
    await dbMessageDataGet(
      userId,
      storageKey,
      env
    );

  if (!stored) {
    return;
  }

  const newText =
    editedMessage.text ||
    editedMessage.caption ||
    '[媒体内容]';

  const originalTime =
    formatTimestamp(stored.date);

  const editTime =
    formatTimestamp(
      editedMessage.edit_date ||
      editedMessage.date
    );

  const notificationText = `
⚠️ <b>管理员编辑了之前的回复</b>

<b>原发送或上次编辑时间：</b>
<code>${escapeHtml(originalTime)}</code>

<b>本次编辑时间：</b>
<code>${escapeHtml(editTime)}</code>

<b>原消息内容：</b>
${escapeHtml(stored.text)}

<b>新消息内容：</b>
${escapeHtml(newText)}
  `.trim();

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: notificationText,
        parse_mode: 'HTML'
      }
    );

    await dbMessageDataPut(
      userId,
      storageKey,
      {
        text: newText,
        date:
          editedMessage.edit_date ||
          editedMessage.date
      },
      env
    );
  } catch (error) {
    console.error(
      '处理管理员编辑消息失败：',
      error?.message || error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             配置列表和删除处理                                 */
/* -------------------------------------------------------------------------- */

async function handleConfigMenu(
  chatId,
  messageId,
  key,
  env
) {
  if (key === 'base') {
    return showBaseMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'autoreply') {
    return showAutoReplyMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'keyword') {
    return showKeywordMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'filter') {
    return showFilterMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'authorized') {
    return showAuthorizedMenu(
      chatId,
      env,
      messageId
    );
  }

  return showMainMenu(
    chatId,
    env,
    messageId
  );
}

async function handleRuleList(
  chatId,
  messageId,
  type,
  pageValue,
  env
) {
  let rows = [];
  let text = '';

  if (type === 'keyword_responses') {
    const rules =
      await getAutoReplyRules(env);

    const pageInfo =
      clampPage(pageValue, rules.length);

    const start =
      pageInfo.page * RULE_PAGE_SIZE;

    const pageRules = rules.slice(
      start,
      start + RULE_PAGE_SIZE
    );

    text =
      `📋 <b>自动回复规则列表</b>\n\n` +
      `共 ${rules.length} 条，` +
      `第 ${pageInfo.page + 1}/` +
      `${pageInfo.totalPages} 页`;

    rows = pageRules.map((rule, index) => [
      {
        text:
          `删除 ${start + index + 1}. ` +
          `${String(rule.keywords).slice(0, 25)}`,
        callback_data:
          `config:delete:keyword_responses:` +
          `${rule.id}:${pageInfo.page}`
      }
    ]);

    const navigation = [];

    if (pageInfo.page > 0) {
      navigation.push({
        text: '⬅️ 上一页',
        callback_data:
          `config:list:keyword_responses:` +
          `${pageInfo.page - 1}`
      });
    }

    if (
      pageInfo.page <
      pageInfo.totalPages - 1
    ) {
      navigation.push({
        text: '下一页 ➡️',
        callback_data:
          `config:list:keyword_responses:` +
          `${pageInfo.page + 1}`
      });
    }

    if (navigation.length) {
      rows.push(navigation);
    }

    rows.push([
      {
        text: '⬅️ 返回',
        callback_data:
          'config:menu:autoreply'
      }
    ]);
  } else if (
    type === 'block_keywords'
  ) {
    const keywords =
      await getBlockKeywords(env);

    const pageInfo =
      clampPage(pageValue, keywords.length);

    const start =
      pageInfo.page * RULE_PAGE_SIZE;

    const pageKeywords = keywords.slice(
      start,
      start + RULE_PAGE_SIZE
    );

    text =
      `📋 <b>屏蔽关键词列表</b>\n\n` +
      `共 ${keywords.length} 条，` +
      `第 ${pageInfo.page + 1}/` +
      `${pageInfo.totalPages} 页`;

    rows = pageKeywords.map(
      (keyword, index) => [
        {
          text:
            `删除 ${start + index + 1}. ` +
            `${String(keyword).slice(0, 25)}`,
          callback_data:
            `config:delete:block_keywords:` +
            `${start + index}:${pageInfo.page}`
        }
      ]
    );

    const navigation = [];

    if (pageInfo.page > 0) {
      navigation.push({
        text: '⬅️ 上一页',
        callback_data:
          `config:list:block_keywords:` +
          `${pageInfo.page - 1}`
      });
    }

    if (
      pageInfo.page <
      pageInfo.totalPages - 1
    ) {
      navigation.push({
        text: '下一页 ➡️',
        callback_data:
          `config:list:block_keywords:` +
          `${pageInfo.page + 1}`
      });
    }

    if (navigation.length) {
      rows.push(navigation);
    }

    rows.push([
      {
        text: '⬅️ 返回',
        callback_data:
          'config:menu:keyword'
      }
    ]);
  } else {
    return;
  }

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup: {
      inline_keyboard: rows
    }
  });
}

async function handleRuleDelete(
  chatId,
  messageId,
  type,
  value,
  page,
  env
) {
  if (type === 'keyword_responses') {
    const rules =
      await getAutoReplyRules(env);

    const next = rules.filter(
      (rule) =>
        String(rule.id) !== String(value)
    );

    await setConfig(
      'keyword_responses',
      JSON.stringify(next),
      env
    );

    return handleRuleList(
      chatId,
      messageId,
      type,
      page,
      env
    );
  }

  if (type === 'block_keywords') {
    const keywords =
      await getBlockKeywords(env);

    const index = Number(value);

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < keywords.length
    ) {
      keywords.splice(index, 1);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );
    }

    return handleRuleList(
      chatId,
      messageId,
      type,
      page,
      env
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              Callback Query                                 */
/* -------------------------------------------------------------------------- */

async function answerCallback(
  callbackId,
  env,
  text = '',
  showAlert = false
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'answerCallbackQuery',
      {
        callback_query_id: callbackId,
        text,
        show_alert: showAlert
      }
    );
  } catch (error) {
    console.error(
      '回答 Callback Query 失败：',
      error?.message || error
    );
  }
}

async function handleConfigCallback(
  callbackQuery,
  env
) {
  const chatId =
    String(callbackQuery.from.id);

  const message =
    callbackQuery.message;

  if (!message?.message_id) {
    await answerCallback(
      callbackQuery.id,
      env,
      '菜单消息不存在。',
      true
    );

    return;
  }

  if (!isPrimaryAdmin(chatId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '只有主管理员可以修改配置。',
      true
    );

    return;
  }

  const parts =
    String(callbackQuery.data || '')
      .split(':');

  const action = parts[1] || '';
  const key = parts[2] || '';
  const value = parts[3];
  const extra = parts[4];

  await answerCallback(
    callbackQuery.id,
    env,
    '处理中…'
  );

  if (action === 'menu') {
    await handleConfigMenu(
      chatId,
      message.message_id,
      key,
      env
    );

    return;
  }

  if (action === 'toggle') {
    const allowedToggleKeys = new Set([
      'enable_image_forwarding',
      'enable_link_forwarding',
      'enable_text_forwarding',
      'enable_audio_forwarding',
      'enable_sticker_forwarding',
      'enable_user_forwarding',
      'enable_group_forwarding',
      'enable_channel_forwarding'
    ]);

    if (!allowedToggleKeys.has(key)) {
      return;
    }

    await setConfig(
      key,
      value === 'true'
        ? 'true'
        : 'false',
      env
    );

    await showFilterMenu(
      chatId,
      env,
      message.message_id
    );

    return;
  }

  if (action === 'edit') {
    const editableKeys = new Set([
      'welcome_msg',
      'verif_q',
      'verif_a',
      'block_threshold',
      'authorized_admins'
    ]);

    if (!editableKeys.has(key)) {
      return;
    }

    await setAdminState(
      chatId,
      {
        action: 'awaiting_input',
        key
      },
      env
    );

    let prompt =
      `请发送新的 ${key} 值：`;

    if (key === 'welcome_msg') {
      prompt = '请发送新的欢迎消息：';
    } else if (key === 'verif_q') {
      prompt = '请发送新的验证问题：';
    } else if (key === 'verif_a') {
      prompt =
        '请发送新的验证答案；多个答案使用 | 分隔：';
    } else if (
      key === 'block_threshold'
    ) {
      prompt =
        '请发送新的屏蔽次数阈值（1～100）：';
    } else if (
      key === 'authorized_admins'
    ) {
      prompt =
        '请发送协管员 ID 列表，多个 ID 使用英文逗号分隔：';
    }

    await renderMenu(env, {
      chatId,
      messageId: message.message_id,
      text:
        `${prompt}\n\n` +
        `状态将在 10 分钟后过期。\n` +
        `发送 /cancel 取消。`,
      parse_mode: undefined
    });

    return;
  }

  if (action === 'add') {
    if (
      ![
        'keyword_responses',
        'block_keywords'
      ].includes(key)
    ) {
      return;
    }

    await setAdminState(
      chatId,
      {
        action: 'awaiting_input',
        key: `${key}_add`
      },
      env
    );

    const prompt =
      key === 'keyword_responses'
        ? '请发送新的自动回复规则：\n' +
          '格式：关键词表达式===回复内容'
        : '请发送新的屏蔽关键词表达式：';

    await renderMenu(env, {
      chatId,
      messageId: message.message_id,
      text:
        `${prompt}\n\n` +
        `状态将在 10 分钟后过期。\n` +
        `发送 /cancel 取消。`,
      parse_mode: undefined
    });

    return;
  }

  if (action === 'list') {
    await handleRuleList(
      chatId,
      message.message_id,
      key,
      value || 0,
      env
    );

    return;
  }

  if (action === 'delete') {
    await handleRuleDelete(
      chatId,
      message.message_id,
      key,
      value,
      extra || 0,
      env
    );

    return;
  }

  if (
    action === 'clear' &&
    key === 'authorized_admins'
  ) {
    await setConfig(
      'authorized_admins',
      '[]',
      env
    );

    await showAuthorizedMenu(
      chatId,
      env,
      message.message_id
    );
  }
}

async function handleUserCardCallback(
  callbackQuery,
  env
) {
  const message =
    callbackQuery.message;

  if (
    !message ||
    String(message.chat.id) !==
      String(env.ADMIN_GROUP_ID)
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '该按钮只能在管理群中使用。',
      true
    );

    return;
  }

  const [
    action,
    targetUserId
  ] = String(
    callbackQuery.data || ''
  ).split(':');

  const allowedActions = new Set([
    'block',
    'unblock',
    'mute',
    'unmute',
    'pin_card',
    'refresh_card'
  ]);

  if (
    !allowedActions.has(action) ||
    !/^\d+$/.test(
      String(targetUserId || '')
    )
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '无效操作。',
      true
    );

    return;
  }

  let user =
    await dbUserGetOrCreate(
      targetUserId,
      env
    );

  if (action === 'pin_card') {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'pinChatMessage',
        {
          chat_id: message.chat.id,
          message_id:
            message.message_id,
          disable_notification: true
        }
      );

      await dbUserUpdate(
        targetUserId,
        {
          info_card_message_id:
            String(message.message_id)
        },
        env
      );

      await answerCallback(
        callbackQuery.id,
        env,
        '✅ 已置顶资料卡。'
      );
    } catch (error) {
      await answerCallback(
        callbackQuery.id,
        env,
        `❌ 置顶失败：` +
        `${error?.message || error}`,
        true
      );
    }

    return;
  }

  if (action === 'refresh_card') {
    try {
      const chatObject =
        await telegramApi(
          env.BOT_TOKEN,
          'getChat',
          {
            chat_id: targetUserId
          }
        );

      const result =
        await refreshUserInfoCard(
          targetUserId,
          chatObject,
          env,
          true
        );

      let tip = '✅ 资料卡已刷新。';

      if (
        !result.updated &&
        result.reason === 'missing_card'
      ) {
        tip = '⚠️ 找不到资料卡消息。';
      }

      await answerCallback(
        callbackQuery.id,
        env,
        tip
      );
    } catch (error) {
      console.error(
        '刷新资料卡失败：',
        error?.message || error
      );

      await answerCallback(
        callbackQuery.id,
        env,
        `❌ 刷新失败：` +
        `${error?.message || error}`,
        true
      );
    }

    return;
  }

  try {
    if (
      action === 'block' ||
      action === 'unblock'
    ) {
      await dbUserUpdate(
        targetUserId,
        {
          is_blocked:
            action === 'block'
        },
        env
      );
    }

    if (
      action === 'mute' ||
      action === 'unmute'
    ) {
      await dbUserUpdate(
        targetUserId,
        {
          is_muted:
            action === 'mute'
        },
        env
      );
    }

    user = await dbUserGetOrCreate(
      targetUserId,
      env
    );

    const usernameRaw =
      user.user_info?.username_raw || '';

    await telegramApi(
      env.BOT_TOKEN,
      'editMessageReplyMarkup',
      {
        chat_id: message.chat.id,
        message_id:
          message.message_id,
        reply_markup:
          getInfoCardButtons(
            targetUserId,
            user.is_blocked,
            user.is_muted,
            usernameRaw
          )
      }
    );

    let toast = '✅ 操作成功。';

    if (action === 'block') {
      toast = '🚫 已屏蔽该用户。';
    }

    if (action === 'unblock') {
      toast = '✅ 已解除屏蔽。';
    }

    if (action === 'mute') {
      toast = '🔕 已静音通知。';
    }

    if (action === 'unmute') {
      toast = '🔔 已恢复通知。';
    }

    await answerCallback(
      callbackQuery.id,
      env,
      toast
    );
  } catch (error) {
    console.error(
      `处理 ${action} 失败：`,
      error?.message || error
    );

    await answerCallback(
      callbackQuery.id,
      env,
      '❌ 操作失败，请重试。',
      true
    );
  }
}

async function handleCallbackQuery(
  callbackQuery,
  env
) {
  if (!callbackQuery?.from?.id) {
    return;
  }

  const senderId =
    String(callbackQuery.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    await answerCallback(
      callbackQuery.id,
      env,
      '您无权执行该操作。',
      true
    );

    return;
  }

  const data =
    String(callbackQuery.data || '');

  if (data.startsWith('config:')) {
    await handleConfigCallback(
      callbackQuery,
      env
    );

    return;
  }

  await handleUserCardCallback(
    callbackQuery,
    env
  );
}

/* -------------------------------------------------------------------------- */
/*                               Update 入口                                    */
/* -------------------------------------------------------------------------- */

async function handleUpdate(update, env) {
  const accepted = await claimUpdate(
    update?.update_id,
    env
  );

  if (!accepted) {
    console.log(
      '忽略重复 Update：',
      update?.update_id
    );

    return;
  }

  if (update.message) {
    if (
      update.message.chat.type ===
      'private'
    ) {
      await handlePrivateMessage(
        update.message,
        env
      );
    } else if (
      String(update.message.chat.id) ===
      String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminReply(
        update.message,
        env
      );
    }

    return;
  }

  if (update.edited_message) {
    if (
      update.edited_message.chat.type ===
      'private'
    ) {
      await handleRelayEditedMessage(
        update.edited_message,
        env
      );
    } else if (
      String(
        update.edited_message.chat.id
      ) === String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminEditedReply(
        update.edited_message,
        env
      );
    }

    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(
      update.callback_query,
      env
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Cloudflare Worker 入口                               */
/* -------------------------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {
    try {
      validateEnvironment(env);
      await ensureMigration(env);
    } catch (error) {
      console.error(
        '初始化失败：',
        error?.message || error
      );

      return new Response(
        `Initialization Error: ` +
        `${error?.message || error}`,
        {
          status: 500,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    if (request.method === 'GET') {
      return new Response(
        'Telegram Bot Worker is running.',
        {
          status: 200,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    if (request.method !== 'POST') {
      return new Response(
        'Method Not Allowed',
        {
          status: 405,
          headers: {
            Allow: 'GET, POST'
          }
        }
      );
    }

    const webhookSecret = request.headers.get(
      'X-Telegram-Bot-Api-Secret-Token'
    );

    if (
      !webhookSecret ||
      webhookSecret !== env.WEBHOOK_SECRET
    ) {
      console.warn(
        '收到未通过 Webhook Secret 验证的请求。'
      );

      return new Response(
        'Unauthorized',
        {
          status: 401
        }
      );
    }

    let update;

    try {
      update = await request.json();
    } catch (error) {
      console.error(
        '解析 Telegram Update 失败：',
        error?.message || error
      );

      return new Response(
        'Bad Request',
        {
          status: 400
        }
      );
    }

    ctx.waitUntil(
      handleUpdate(update, env).catch(
        (error) => {
          console.error(
            '异步处理 Update 失败：',
            error?.stack ||
            error?.message ||
            error
          );
        }
      )
    );

    // 随机执行清理，避免每次请求都清理数据库。
    if (Math.random() < 0.01) {
      ctx.waitUntil(cleanupDatabase(env));
    }

    return new Response('OK', {
      status: 200,
      headers: {
        'content-type':
          'text/plain; charset=utf-8'
      }
    });
  }
};

/* =====================================================================
 * TGbot-D1 3.0.5 增强版（Fork 自 moistrr/TGbot-D1；单文件 Worker，
 * 版本号见下方 BOT_VERSION 常量。逐版变更史见仓库 README-增强版.md
 * 与各 Release 说明，本文件头只留部署与维护必须知道的事项。）
 * =====================================================================
 * 部署要点
 * - 必填变量：BOT_TOKEN、ADMIN_IDS（逗号分隔，主管理员在前）、
 *   ADMIN_GROUP_ID、WEBHOOK_SECRET；D1 绑定名必须为 TG_BOT_DB。
 * - 可选变量：TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY，缺一即
 *   自动回退静态问答验证，机器人不会因缺密钥不可用。
 * - setWebhook 须带 secret_token，且 allowed_updates 含 message /
 *   edited_message / callback_query / message_reaction /
 *   my_chat_member 五类，缺类对应功能会静默失效。
 * 安全模型
 * - 出口只有 api.telegram.org、Turnstile siteverify 与 GitHub
 *   Release 检查三处；无硬编码凭据；SQL 全参数化。
 * - 验证链接用 WEBHOOK_SECRET 的 HMAC-SHA256 签名（绑访客、10 分
 *   钟）；网页（指南 / 管理台 / 访客列表）复用 usrlist 签名（绑主
 *   管理员、30 分钟），接口每次复核身份，后两页仅主管理员可用。
 * - D1 不存消息正文：只存转发配对（rxmap）、状态与备注；配对类记
 *   录 90 天清理；verified_ttl_days 到期删访客行与话题映射，回来
 *   的人会新建话题。
 * 功能清单（与仓库 README-增强版 条目对应）
 * Turnstile / 问答双验证与回退；管理员一次性通行证（网页访客列表发放，机器人私聊送达，30 分钟有效、凭 Telegram 身份确认、用后即焚，救济怎么也过不了验证的访客）；验证提示、通行证与成功回执都会记录消息 ID 并自动清理：通过验证即撤回提示与未用通行证，成功回执在首条消息转发成功后撤回，过期通行证在访客下次互动时清扫，状态类消息只保留最新一条；访客列表会显示待验证访客的通行证状态（已发证剩余分钟），发证动作返回到期时间并即时刷新行内徽标；第三轮三路审计修复：删人/重置/超时清理连带作废通行证、Turnstile 确认补封禁检查、删证与发证改原子条件操作、熔断到期通知与熔断回复改原子占用、验证提示加 3 分钟节流、反应镜像补访客状态检查、初始化错误不外泄细节、节流标记在验证成功/删人/超时清理时一并清掉；引用转发（含部分引用，三级降级）；
 * 反应双向同步；原地编辑同步 + 回复关联的 ✏️ 提示（Bot API 编辑
 * 无原生标记）；拉黑 / 取消拉黑提醒（my_chat_member + 403 兜底、
 * 标记去重）；/delete 按配对连带删除私聊原消息（原生删除无机器人
 * 事件、无法同步，属平台限制）；管理员备注 /note 同步到话题名
 * 「备注｜名字 (ID)」；网页访客列表（搜索 / 筛选 / 分页 / 备注 /
 * 跳话题）与数据统计（24h / 7d / 30d，统计口径 90 天）；网页管理
 * 台（原按钮菜单已下线，旧按钮回迁移提示）；新手引导 /guide；
 * 自动检查更新；服务熔断 /pause /resume（手动触发，闸门在去重之
 * 前；到期惰性恢复——由到期后第一条更新触发解除并通知，属刻意
 * 设计；服务熔断回复每访客每轮最多一条，由新消息与按钮点击触发，被封禁者静默；管理台里关闭服务熔断回复时语句输入框自动隐藏；熔断期间访客新发的消息当场删除（私聊收到的消息 48 小时内可删，与 /delete 连带删除同一机制）；对熔断前已送达消息的编辑与反应不拦、照常实时同步到对侧副本，避免恢复后两边记录不一致，也不触发熔断回复；恢复服务时把每位访客那张「请稍后再试」原地翻成「✅ 服务已恢复」）；主菜单只保留最新一对：删除推迟一轮，新菜单送达后删的是上一条菜单与触发它的 /start，最新一条 /start 始终保留在聊天里方便点按重发、刷新过期的网页链接（追踪存 config 的 mainmenu:<chatId>，JSON {m, c}）；三页 POST 出口带错误码翻译，unauthorized 显示为「链接已过期，重新发送 /start 换新菜单」，不再把英文错误码原样弹给管理员；整段对话清空：网页访客列表删除升级为「连话题、私聊一起清空」（连带批量删除访客私聊中的聊天副本），话题内 /clear 命令做同样的双边清空但保留话题与访客档案，均按 rxmap 配对批量删除、私聊侧受 48 小时限制、执行后报告实删与删不掉的条数；命令回执类话题通知（备注查看/保存/删除、重置验证、封禁/解封结果、资料卡重建、话题内熔断开启/恢复/状态结果、未识别命令）改为短暂显示，发出约 5 秒后自动删除；访客解除拉黑、发出 ✅ 提醒时，之前那条 🚫 拉黑提醒会被一并删掉（编号记在 blocknotice:<访客>）；话题里管理员发出的命令消息在处理后一并撤回（未识别的命令同样），只短暂留回执、不留命令原文；主菜单追踪记录带写入时间戳，超过 48 小时（记录里的消息号已过 Telegram 删除窗口）会被数据库清扫整行删掉，读到过期记录时也直接跳过注定失败的删除。第四轮审计修复：问答验证答错 5 次锁定 30 分钟防穷举；三页签名链接按用途分权（引导/列表/管理台互不通用），签名密钥可改用独立的 LINK_SECRET 与 webhook 校验值解耦（未配置时回退 WEBHOOK_SECRET）；整段对话清空仅主管理员可操作、确认防重复执行、访客记录已删时点确认不再把空档案建回来，且清空只删开始那一刻收集到的快照记录（清空期间新到的消息配对不受影响），提示行改分块批量查询与批量删除；拉黑提醒记账竞态收尾，删档与超时清理一并清记账；主菜单追踪清扫按值条件删防误删新鲜记录、原地编辑不再刷新追踪时间戳（时间戳只记消息号的出生时刻）、旧格式纯数字追踪恢复解析；话题被手动关闭时先重开原话题再投递、不再误判失效重建；转发失败（内容受保护等）会在话题里提醒、群权限丢失时改走主管理员私聊告警；已验证访客发送过频会被限流丢弃并提醒；反应同步补匿名管理员处理，付费/自定义 emoji 不再误清已镜像的普通反应；短暂通知落 ephem 记账，定时删除没赶上时由数据库清扫补删；菜单签名链接的来源地址改为随请求传递（去掉可被任意请求覆盖的全局变量）；以频道身份发帖等没有 from 的消息直接忽略、不再抛错；命令 @ 的机器人名不是本机器人时完全忽略；/note 保存失败时保留命令原文便于改了重发。定制化扩展：管理台新增「参数与开关」（转发限流强度、通行证/验证链接有效期、问答锁定次数与时长、命令回执停留秒数可调，均带范围校验；编辑提示、反应同步、转发失败提醒、拉黑提醒四个总开关）与「文案与呈现」（验证成功/答错、熔断恢复、拉黑/解封五句文案可改；话题名四种样式；主菜单五个按钮逐个显隐；访客列表默认排序与每页条数存服务端配置）两区；按访客例外：信任标记 is_trusted（列表/资料卡设置即置已验证并按验证成功收尾，闸门处对未验证的信任访客自动放行，重置验证与 /reverify 连带撤销，超时清理豁免，资料卡按钮仅主管理员）与放行标记 relay_exempt（免转发限流与类型过滤，关键词封禁照常），列表行带徽标与切换按钮，/api/users 附 uiDefaults 供列表页套用默认排序与页大小。
 * 三页（指南 / 管理台 / 访客列表）约定
 * - 页眉 position:fixed + 脚本实测高度补偿 body padding-top，
 *   不要改回 sticky：iOS 上 sticky 在滚动中逐帧重定位会闪烁。
 * - 滚动一律脚本逐帧驱动（requestAnimationFrame），不要改用原生
 *   behavior:smooth 或 matchMedia 门控：原生平滑在 Telegram 内嵌
 *   网页视图 / 嵌套滚动环境会退化为瞬移；签名页响应已加
 *   Cache-Control: no-store 防网页视图缓存旧页，不要去掉。
 * - 逐帧动画可被滚轮 / 触摸打断；指南与管理台带滚动定位高亮
 *   （scrollspy），访客列表的标签 / 筛选切换带方向滑动动画。
 */

const USER_STATE = {
  NEW: 'new',
  PENDING: 'pending_verification',
  VERIFIED: 'verified'
};

const DEFAULTS = {
  welcome_msg:
    '在发消息之前，先完成人机验证，验证完成之后请等待3秒钟之后再发送消息以防发生失败！',
  verif_q:
    '问题：1+1=?\n\n提示：\n1. 正确答案不是“2”。\n2. 答案在机器人简介内，请看简介的答案进行回答。',
  verif_a: '3',
  verify_mode: 'turnstile',
  keyword_responses: '[]',
  block_keywords: '[]',
  block_threshold: '5',
  verified_ttl_days: '0',
  pause_reply_enabled: 'true',
  pause_reply_text: '请稍后再试',
  authorized_admins: '[]',

  relay_burst: '30',
  relay_refill_per_sec: '5',
  pass_ttl_min: '30',
  verify_link_min: '10',
  quiz_max_attempts: '5',
  quiz_lock_min: '30',
  notice_stay_sec: '5',

  hint_enabled: 'true',
  reaction_sync_enabled: 'true',
  relay_fail_notice_enabled: 'true',
  block_notice_enabled: 'true',

  verify_success_text:
    '🎉 验证成功！现在可以开始发送消息了。',
  quiz_wrong_text:
    '🥺 抱歉，这次没有回答正确，请重新查看提示后再试。',
  pause_restored_text:
    '✅ 服务已恢复，可以正常发送消息了。',
  block_notice_text:
    '🚫 对方已将机器人拉黑，后续消息将无法送达。',
  unblock_notice_text:
    '✅ 对方已解除对机器人的拉黑，可以继续正常收发消息。',

  topic_title_style: 'note_first',
  menu_btn_panel: 'true',
  menu_btn_list: 'true',
  menu_btn_guide: 'true',
  menu_btn_updchk: 'true',
  menu_btn_pause: 'true',
  userlist_sort: 'active',
  userlist_page_size: '20',

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
  authorized_admins: 2000,
  block_keyword: 200,
  pause_reply_text: 500,
  auto_reply_pattern: 200,
  auto_reply_response: 4000,
  filter_text: 5000
};

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
  'admin_note',
  'verify_prompt_msg_id',
  'receipt_msg_id',
  'is_trusted',
  'relay_exempt',
  'topic_creating',
  'topic_lock_at',
  'created_at',
  'updated_at'
]);

let migrationPromise = null;
let botCommandsPromise = null;

async function ensureBotCommands(env) {
  if (botCommandsPromise) {
    return botCommandsPromise;
  }

  botCommandsPromise = Promise.all([
    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        commands: [
          {
            command: 'ban',
            description: '封禁当前话题访客'
          },
          {
            command: 'unban',
            description: '解除当前话题访客封禁'
          },
          {
            command: 'delete',
            description: '删除被回复的消息'
          },
          {
            command: 'clear',
            description: '清空与当前话题访客的全部聊天记录'
          },
          {
            command: 'terminate',
            description: '删除当前访客话题'
          },
          {
            command: 'card',
            description: '重新创建当前访客资料卡'
          },
          {
            command: 'reverify',
            description: '让当前话题访客重新验证'
          },
          {
            command: 'note',
            description: '给当前话题访客打备注（/note 内容）'
          },
          {
            command: 'notedelete',
            description: '删除当前话题访客的备注'
          },
          {
            command: 'pause',
            description: '服务熔断（/pause 分钟）'
          },
          {
            command: 'resume',
            description: '恢复机器人服务'
          }
        ]
      }
    ),

    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        scope: { type: 'all_private_chats' },
        commands: [
          {
            command: 'start',
            description: '开始使用'
          },
          {
            command: 'help',
            description: '获取帮助'
          },
          {
            command: 'testverify',
            description: '打开 Turnstile 验证测试页'
          },
          {
            command: 'version',
            description: '查看版本与检查更新'
          },
          {
            command: 'panel',
            description: '打开网页管理台'
          },
          {
            command: 'pause',
            description: '服务熔断（可带分钟数）'
          },
          {
            command: 'resume',
            description: '恢复机器人服务'
          }
        ]
      }
    )
  ]).catch((error) => {
    botCommandsPromise = null;

    console.error(
      '注册机器人命令失败：',
      error?.message || error
    );
  });

  return botCommandsPromise;
}


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

function isMessageNotModifiedError(error) {
  return String(error?.message || error)
    .toLowerCase()
    .includes('message is not modified');
}


function toBoolText(value, defaultValue = true) {
  if (typeof value !== 'string') return defaultValue;
  return value.toLowerCase() === 'true';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '[]';

  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '[]';
  }

  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
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
    text.includes('topic was deleted') ||
    text.includes('forum topic was closed') ||
    text.includes('message thread id is invalid')
  );
}

// 话题只是被管理员手动「关闭」（不是删除/失效）：
// 关闭不该触发重建新话题，调用方先尝试重开原话题。
function isTopicClosedError(error) {
  const text = String(error?.message || error).toLowerCase();

  return (
    text.includes('message thread is closed') ||
    text.includes('topic_closed')
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
    try {
      await env.TG_BOT_DB.prepare(
        `ALTER TABLE users ADD COLUMN ` +
        `${columnName} ${definition}`
      ).run();
    } catch (error) {
      // 多个实例并发迁移时，后到者会撞上「列已存在」，视为成功。
      if (
        !String(error?.message || error).includes(
          'duplicate column'
        )
      ) {
        throw error;
      }
    }
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
      admin_note TEXT NOT NULL DEFAULT '',
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

  await ensureUserColumn(
    env,
    'admin_note',
    "TEXT NOT NULL DEFAULT ''"
  );

  await ensureUserColumn(
    env,
    'verify_prompt_msg_id',
    'INTEGER'
  );

  await ensureUserColumn(
    env,
    'receipt_msg_id',
    'INTEGER'
  );

  await ensureUserColumn(
    env,
    'is_trusted',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await ensureUserColumn(
    env,
    'relay_exempt',
    'INTEGER NOT NULL DEFAULT 0'
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

// 短暂通知补删清扫：定时删除随请求上下文被回收时
// 没删成的回执，按 ephem: 记账在这里补删。
async function sweepEphemeralNotices(env) {
  let rows = [];

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('ephem:%')
      .all();

    rows = result?.results || [];
  } catch (error) {
    console.error(
      '读取短暂通知记账失败：',
      error?.message || error
    );

    return;
  }

  const nowMs = Date.now();

  for (const row of rows) {
    const msgId = String(row.key).slice(6);

    if (!/^\d+$/.test(msgId)) {
      await dbConfigDelete(String(row.key), env);

      continue;
    }

    let parsed = null;

    try {
      parsed = JSON.parse(row.value);
    } catch (_) {
      parsed = null;
    }

    const dueAt = Number(parsed?.at || 0);

    if (dueAt && dueAt <= nowMs) {
      await quietDeleteMessage(
        env,
        parsed?.c || env.ADMIN_GROUP_ID,
        msgId
      );

      await dbConfigDeleteIfValue(
        String(row.key),
        String(row.value),
        env
      );
    }
  }
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

    await cleanupExpiredUsers(env, now);

    await cleanupStaleMenuTracks(env);

    await sweepEphemeralNotices(env);
  } catch (error) {
    console.error(
      '清理数据库失败：',
      error?.message || error
    );
  }
}

// 主菜单追踪（mainmenu:<chatId>）超过保鲜期后，里面的消息号
// 已过 Telegram 删除窗口、留着也没用，整个记录删掉。
// 没有时间戳的旧记录不动：下次打开菜单覆盖写入时会带上
// 时间戳，之后自然进入清扫范围。
async function cleanupStaleMenuTracks(env) {
  let rows = [];

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('mainmenu:%')
      .all();

    rows = result?.results || [];
  } catch (error) {
    console.error(
      '读取主菜单追踪记录失败：',
      error?.message || error
    );

    return;
  }

  const nowMs = Date.now();

  for (const row of rows) {
    let t = 0;

    try {
      t = Number(JSON.parse(row.value)?.t) || 0;
    } catch (_) {
      t = 0;
    }

    if (t && nowMs - t > MENU_TRACK_TTL_MS) {
      // 按快照值条件删：枚举之后管理员恰好开了菜单、
      // 写入了新鲜记录时，不要把新鲜行误删掉。
      await dbConfigDeleteIfValue(
        String(row.key),
        String(row.value),
        env
      );
    }
  }
}

async function cleanupExpiredUsers(env, now) {
  const ttlDays =
    Number(
      await getConfig(
        'verified_ttl_days',
        env,
        '0'
      )
    ) || 0;

  if (
    !Number.isInteger(ttlDays) ||
    ttlDays <= 0
  ) {
    return;
  }

  const cutoff = now - ttlDays * 86400;

  const result =
    await env.TG_BOT_DB.prepare(
      'SELECT user_id, is_trusted FROM users ' +
      'WHERE user_state IN (?, ?) ' +
      'AND is_blocked = 0 AND is_muted = 0 ' +
      'AND updated_at IS NOT NULL ' +
      'AND updated_at < ? LIMIT 200'
    )
      .bind(
        USER_STATE.VERIFIED,
        USER_STATE.PENDING,
        cutoff
      )
      .all();

  for (const row of result?.results || []) {
    const userId = String(row.user_id);

    // 管理员（含协管员）账号永不清理。
    if (await isAdminUser(userId, env)) {
      continue;
    }

    // 已设为信任（免验证）的访客不清理，
    // 否则信任标记随档案一起消失（已随 SELECT 带出，不再逐行点读）。
    if (Number(row.is_trusted || 0) === 1) {
      continue;
    }

    // 删除时复检全部条件，避免「选中后访客恰好回来活跃」
    // 的竞态把活跃访客误删（TOCTOU）。
    const deleted =
      await env.TG_BOT_DB.prepare(
        'DELETE FROM users WHERE user_id = ? ' +
        'AND user_state IN (?, ?) ' +
        'AND is_blocked = 0 AND is_muted = 0 ' +
        'AND updated_at < ?'
      )
        .bind(
          userId,
          USER_STATE.VERIFIED,
          USER_STATE.PENDING,
          cutoff
        )
        .run();

    if (
      deleted?.meta &&
      deleted.meta.changes === 0
    ) {
      continue;
    }

    await env.TG_BOT_DB.prepare(
      'DELETE FROM messages WHERE user_id = ?'
    )
      .bind(userId)
      .run();

    await dbConfigDelete(
      `botblocked:${userId}`,
      env
    );

    await dbConfigDelete(
      `pass:${userId}`,
      env
    );

    await dbConfigDelete(
      `pausenote:${userId}`,
      env
    );

    await dbConfigDelete(
      `pausemsg:${userId}`,
      env
    );

    await dbConfigDelete(
      `promptat:${userId}`,
      env
    );

    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );
  }
}

async function touchUserActivity(user, env) {
  const now =
    Math.floor(Date.now() / 1000);

  // 至多每天打卡一次，避免每条消息多一次写。
  if (now - Number(user.updated_at || 0) < 86400) {
    return;
  }

  try {
    // 只写时间戳本身：写回快照里的 user_state 会在竞态下
    // 覆盖管理员刚做的重置/状态变更。
    await env.TG_BOT_DB.prepare(
      'UPDATE users SET updated_at = ? ' +
      'WHERE user_id = ?'
    )
      .bind(now, user.user_id)
      .run();
  } catch (error) {
    console.error(
      '刷新访客活跃时间失败：',
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

async function dbConfigClaim(key, value, env) {
  // 原子占用：仅当当前值与目标值不同才写入，
  // 返回 true 表示本次调用完成了这次状态迁移。
  const result = await env.TG_BOT_DB.prepare(
    'INSERT INTO config (key, value) ' +
    'VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE ' +
    'SET value = excluded.value ' +
    'WHERE config.value != excluded.value'
  )
    .bind(key, String(value))
    .run();

  return !result?.meta || result.meta.changes > 0;
}

async function dbConfigDelete(key, env) {
  await env.TG_BOT_DB.prepare(
    'DELETE FROM config WHERE key = ?'
  ).bind(key).run();
}

// 原子条件删：值仍是调用方读到的那份才删，返回是否真的删掉。
// 用来防「读到旧值→期间被改写→无条件删误删新值」一类竞态。
async function dbConfigDeleteIfValue(key, value, env) {
  const result = await env.TG_BOT_DB.prepare(
    'DELETE FROM config WHERE key = ? AND value = ?'
  )
    .bind(key, String(value))
    .run();

  return !result?.meta || result.meta.changes > 0;
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
/*                                访客数据库操作                                 */
/* -------------------------------------------------------------------------- */

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    is_blocked: Number(user.is_blocked) === 1,
    is_muted: Number(user.is_muted) === 1,
    is_trusted: Number(user.is_trusted) === 1,
    relay_exempt:
      Number(user.relay_exempt) === 1,
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

function messageDataPutStatement(
  userId,
  messageId,
  data,
  env
) {
  return env.TG_BOT_DB.prepare(`
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
  );
}

async function dbMessageDataPut(
  userId,
  messageId,
  data,
  env
) {
  await messageDataPutStatement(
    userId,
    messageId,
    data,
    env
  ).run();
}

function messageDataDeleteStatement(
  userId,
  messageId,
  env
) {
  return env.TG_BOT_DB.prepare(
    'DELETE FROM messages ' +
    'WHERE user_id = ? AND message_id = ?'
  ).bind(String(userId), String(messageId));
}

async function dbMessageDataDelete(
  userId,
  messageId,
  env
) {
  await messageDataDeleteStatement(
    userId,
    messageId,
    env
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
      reason: '当前不允许转发来自访客的消息。'
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
/*                             访客资料卡与话题                                  */
/* -------------------------------------------------------------------------- */

function buildUserInfoPayload(
  from,
  firstMessageDate = null,
  adminNote = '',
  titleStyle = 'note_first'
) {
  const userId = String(from.id);
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';

  const displayName = (
    `${firstName}` +
    `${lastName ? ` ${lastName}` : ''}`
  ).trim() || '未知访客';

  const usernameRaw = from.username || '';

  const usernameDisplay = usernameRaw
    ? `@${usernameRaw}`
    : '无';

  // 话题名把备注放最前面，方便在话题列表侧边栏直接
  // 看到：只取备注第一行非空内容并单独限长；无备注时
  // 与原格式一致。总长仍守话题名的 128 字上限。
  const noteTitleLine = String(adminNote || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line) || '';

  // 按码点截断：普通 slice 按 UTF-16 码元切，可能把 emoji
  // 从代理对中间切开、留下孤代理字符。
  const trimByCodePoints = (text, max) => {
    const chars = Array.from(text);

    return chars.length > max
      ? chars.slice(0, max).join('')
      : text;
  };

  const noteTitle =
    Array.from(noteTitleLine).length > 40
      ? `${trimByCodePoints(noteTitleLine, 40)}…`
      : noteTitleLine;

  // 带 ID 的样式先拼正文、再给尾部「 (ID)」留位截断：
  // 整体一刀切会把长名字访客的 ID 切掉（甚至切出半个括号），
  // 话题就失去了最可靠的身份锚点。
  const idSuffix = ` (${userId})`;

  const topicBody =
    titleStyle === 'no_note'
      ? `${displayName}`
      : titleStyle === 'name_first'
        ? noteTitle
          ? `${displayName}｜${noteTitle}`
          : `${displayName}`
        : noteTitle
          ? `${noteTitle}｜${displayName}`
          : `${displayName}`;

  const topicName =
    titleStyle === 'no_id'
      ? trimByCodePoints(topicBody, 128)
      : trimByCodePoints(
          topicBody,
          128 - Array.from(idSuffix).length
        ) + idSuffix;

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

  const noteText = adminNote
    ? `\n<b>备注:</b> ${escapeHtml(adminNote)}`
    : '';

  const infoCard = `
👤 <b>访客资料卡</b>
<b>姓名:</b> ${clickableName}
<b>用户名:</b> ${usernameText}
<b>ID:</b> <code>${escapeHtml(userId)}</code>
${firstTimeText}${noteText}
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

function getProfileUrl(usernameRaw) {
  const username = String(
    usernameRaw || ''
  ).trim();

  if (
    !/^[A-Za-z0-9_]{5,32}$/.test(username)
  ) {
    return null;
  }

  return (
    `https://t.me/` +
    encodeURIComponent(username)
  );
}

function getInfoCardButtons(
  userId,
  isBlocked,
  isMuted,
  usernameRaw = '',
  isTrusted = false,
  isExempt = false
) {
  const rows = [
    [
      {
        text: isBlocked
          ? '✅ 解除屏蔽'
          : '🚫 屏蔽访客',
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
        callback_data:
          `refresh_card:${userId}`
      }
    ]
  ];

  rows.push([
    {
      text: isTrusted
        ? '↩️ 取消信任'
        : '🤝 设为信任',
      callback_data:
        `${isTrusted ? 'untrust' : 'trust'}:` +
        `${userId}`
    },
    {
      text: isExempt
        ? '↩️ 取消放行'
        : '🕊 设为放行',
      callback_data:
        `${isExempt ? 'unexempt' : 'exempt'}:` +
        `${userId}`
    }
  ]);

  const profileUrl =
    getProfileUrl(usernameRaw);

  /*
   * 只有访客具有有效公开用户名时，
   * 才显示“查看资料”按钮。
   *
   * 不再使用 tg://user?id=... 作为按钮链接，
   * 避免 BUTTON_USER_PRIVACY_RESTRICTED。
   */
  if (profileUrl) {
    rows.push([
      {
        text: '👤 查看资料',
        url: profileUrl
      }
    ]);
  }

  return {
    inline_keyboard: rows
  };
}


function buildCardSignature(payload) {
  return JSON.stringify({
    name: payload.displayName || '',
    usernameRaw: payload.usernameRaw || ''
  });
}

async function renameForumTopic(
  topicId,
  topicName,
  env
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(
          topicId
        ),
        name: topicName
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
    firstMessageDate,
    user.admin_note || '',
    await getConfig('topic_title_style', env, 'note_first')
  );

  // 话题名先行同步：改名不依赖资料卡编辑的结果——
  // 卡片内容未变（编辑返回未修改）或编辑失败时，
  // 话题名也必须跟上（备注变更走的就是这条路径）。
  await renameForumTopic(
    user.topic_id,
    payload.topicName,
    env
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

    try {
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
          payload.usernameRaw,
          user.is_trusted,
          user.relay_exempt
        )
      }
    );
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }
  }


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

  return {
    updated: true,
    reason: 'updated'
  };
}

// 备注变更后把话题里的资料卡原地刷新（无卡片时静默跳过）。
async function refreshCardAfterNoteChange(
  userId,
  env
) {
  try {
    const user = await dbUserGet(userId, env);

    if (!user?.topic_id) {
      return;
    }

    if (!user?.info_card_message_id) {
      // 没有资料卡时资料卡刷新走不通，但话题名仍要
      // 同步：用存档资料拼出话题名后直接改名。
      const payload = buildUserInfoPayload(
        {
          id: Number(userId),
          first_name:
            user.user_info?.name || '未知访客',
          username:
            user.user_info?.username_raw || ''
        },
        null,
        user.admin_note || '',
        await getConfig(
          'topic_title_style',
          env,
          'note_first'
        )
      );

      await renameForumTopic(
        user.topic_id,
        payload.topicName,
        env
      );

      return;
    }

    const chatObject = await telegramApi(
      env.BOT_TOKEN,
      'getChat',
      { chat_id: String(userId) }
    );

    await refreshUserInfoCard(
      userId,
      chatObject,
      env,
      true
    );
  } catch (error) {
    console.error(
      '备注变更后刷新资料卡失败：',
      error?.message || error
    );
  }
}

async function createInfoCard(
  message,
  user,
  topicId,
  env
) {
  const payload = buildUserInfoPayload(
    message.from,
    message.date,
    user.admin_note || '',
    await getConfig('topic_title_style', env, 'note_first')
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
        payload.usernameRaw,
        user.is_trusted,
        user.relay_exempt
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
const infoCardPromises = new Map();

async function ensureUserInfoCard(
  message,
  user,
  topicId,
  env
) {
  const userId = String(message.from.id);
  const lockKey = `${userId}:${topicId}`;

  const freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  if (freshUser.info_card_message_id) {
    return freshUser.info_card_message_id;
  }

  if (infoCardPromises.has(lockKey)) {
    return infoCardPromises.get(lockKey);
  }

  const task = (async () => {
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const currentUser =
        await dbUserGetOrCreate(userId, env);

      if (currentUser.info_card_message_id) {
        return currentUser.info_card_message_id;
      }

      try {
        return await createInfoCard(
          message,
          currentUser,
          topicId,
          env
        );
      } catch (error) {
        lastError = error;

        console.error(
          `创建资料卡失败（${attempt}/3），访客 ${userId}：`,
          error?.message || error
        );

        if (attempt < 3) {
          await sleep(attempt * 500);
        }
      }
    }

    console.error(
      `访客 ${userId} 的资料卡创建失败：`,
      lastError?.message || lastError
    );

    return null;
  })();

  infoCardPromises.set(lockKey, task);

  try {
    return await task;
  } finally {
    if (infoCardPromises.get(lockKey) === task) {
      infoCardPromises.delete(lockKey);
    }
  }
}

async function recreateUserInfoCard(
  userId,
  topicId,
  env
) {
  const normalizedUserId = String(userId);
  const normalizedTopicId = String(topicId);

  let user = await dbUserGetOrCreate(
    normalizedUserId,
    env
  );

  const oldCardMessageId =
    user.info_card_message_id;

  const userInfo = user.user_info || {};

  const displayName =
    String(userInfo.name || '').trim() ||
    `访客 ${normalizedUserId}`;

  const usernameRaw =
    String(userInfo.username_raw || '').trim();

  const firstMessageDate = Number(
    userInfo.first_message_date ||
    user.created_at ||
    Math.floor(Date.now() / 1000)
  );

  await dbUserUpdate(
    normalizedUserId,
    {
      topic_id: normalizedTopicId,
      info_card_message_id: null,
      topic_creating: false,
      topic_lock_at: null
    },
    env
  );

  user = await dbUserGetOrCreate(
    normalizedUserId,
    env
  );

  const syntheticMessage = {
    from: {
      id: normalizedUserId,
      first_name: displayName,
      username: usernameRaw || undefined
    },
    date: firstMessageDate
  };

  let newCardMessageId;

  try {
    newCardMessageId = await createInfoCard(
      syntheticMessage,
      user,
      normalizedTopicId,
      env
    );
  } catch (error) {
    // 重建失败时恢复旧资料卡 ID，避免数据库状态进一步损坏。
    await dbUserUpdate(
      normalizedUserId,
      {
        info_card_message_id:
          oldCardMessageId || null
      },
      env
    );

    throw error;
  }

  // 新卡创建成功后再删除旧卡，避免先删除后创建失败。
  if (
    oldCardMessageId &&
    String(oldCardMessageId) !==
      String(newCardMessageId)
  ) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id: Number(oldCardMessageId)
        }
      );
    } catch (error) {
      console.warn(
        `旧资料卡不存在或无法删除，访客 ${normalizedUserId}：`,
        error?.message || error
      );
    }
  }

  return newCardMessageId;
}

async function waitForUserTopic(userId, env) {
  for (let i = 0; i < 40; i += 1) {
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
    await ensureUserInfoCard(
      message,
      user,
      user.topic_id,
      env
    );
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
      '访客话题正在创建，请稍后重试'
    );
  }

  try {
    const payload = buildUserInfoPayload(
      message.from,
      message.date,
      '',
      await getConfig('topic_title_style', env, 'note_first')
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

    await ensureUserInfoCard(
      message,
      user,
      topicId,
      env
    );

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
  ).trim() || '未知访客';

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


// 组装对侧引用参数：counterpartId 是被引用消息在目标会话
// 里的 ID；message.quote 存在时把部分引用片段原样带上。
function buildReplyParameters(
  message,
  counterpartId
) {
  const replyParameters = {
    message_id: Number(counterpartId),
    allow_sending_without_reply: true
  };

  const quote = message?.quote;

  if (
    quote &&
    typeof quote.text === 'string' &&
    quote.text
  ) {
    replyParameters.quote = quote.text;

    if (Number.isFinite(quote.position)) {
      replyParameters.quote_position =
        quote.position;
    }

    if (
      Array.isArray(quote.entities) &&
      quote.entities.length
    ) {
      replyParameters.quote_entities =
        quote.entities;
    }
  }

  return replyParameters;
}

// 引用转发三级降级：带片段引用 → 整条引用 → 普通发送。
// 只有带 reply_parameters 的尝试失败时才逐级重试，
// 最后一级仍失败则把错误抛回调用方原有处理。
async function copyMessageWithReplyFallback(
  token,
  params,
  replyParameters
) {
  if (!replyParameters) {
    return telegramApi(
      token,
      'copyMessage',
      params
    );
  }

  try {
    return await telegramApi(
      token,
      'copyMessage',
      {
        ...params,
        reply_parameters: replyParameters
      }
    );
  } catch (firstError) {
    if (!replyParameters.quote) {
      return telegramApi(
        token,
        'copyMessage',
        params
      );
    }

    const wholeReply = { ...replyParameters };

    delete wholeReply.quote;
    delete wholeReply.quote_position;
    delete wholeReply.quote_entities;

    try {
      return await telegramApi(
        token,
        'copyMessage',
        {
          ...params,
          reply_parameters: wholeReply
        }
      );
    } catch {
      return telegramApi(
        token,
        'copyMessage',
        params
      );
    }
  }
}

async function relayUserMessageToTopic(
  message,
  user,
  env
) {
  const userId = String(message.from.id);

  // 获取最新访客状态，防止并发请求使用过期数据。
  let freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  // 统一确保话题存在，同时补建缺失的资料卡。
  let topicId = await ensureUserTopic(
    message,
    freshUser,
    env
  );

  freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  if (!freshUser.info_card_message_id) {
    await ensureUserInfoCard(
      message,
      freshUser,
      topicId,
      env
    );
  } else {
    await maybeAutoRefreshUserCard(
      message,
      env
    );
  }

  // 若访客引用了某条机器人消息，把引用换算到话题侧 ID。
  let replyParameters = null;

  const visitorRepliedId =
    message.reply_to_message?.message_id;

  if (visitorRepliedId) {
    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `p:${userId}:${visitorRepliedId}`,
      env
    );

    const topicCounterpart = String(
      pair?.text || ''
    );

    if (/^\d+$/.test(topicCounterpart)) {
      replyParameters = buildReplyParameters(
        message,
        topicCounterpart
      );
    }
  }

  let copiedMessageId = null;

  try {
    const copyResult =
      await copyMessageWithReplyFallback(
      env.BOT_TOKEN,
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
            freshUser.is_blocked ||
            freshUser.is_muted
          )
      },
      replyParameters
    );

    copiedMessageId =
      copyResult?.message_id || null;
  } catch (error) {
    if (isTopicClosedError(error)) {
      // 话题只是被手动关闭：重开原话题后重投一次，
      // 不把「关闭」当「失效」去新建一个话题顶替。
      // 重开或重投失败时异常自然上抛，由调用方走
      // 转发失败通知。
      await telegramApi(
        env.BOT_TOKEN,
        'reopenForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id: Number(topicId)
        }
      );

      const reopenRetry =
        await copyMessageWithReplyFallback(
          env.BOT_TOKEN,
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
                freshUser.is_blocked ||
                freshUser.is_muted
              )
          },
          replyParameters
        );

      copiedMessageId =
        reopenRetry?.message_id || null;
    } else if (!isTopicInvalidError(error)) {
      throw error;
    } else {
      console.error(
        '访客话题已失效，准备重建：',
        error?.message || error
      );

      await dbUserUpdate(
        userId,
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
          userId,
          env
        );

      const newTopicId =
        await ensureUserTopic(
          message,
          refreshedUser,
          env
        );

      const newestUser =
        await dbUserGetOrCreate(
          userId,
          env
        );

      if (!newestUser.info_card_message_id) {
        await ensureUserInfoCard(
          message,
          newestUser,
          newTopicId,
          env
        );
      }

      const retryCopyResult =
        await copyMessageWithReplyFallback(
        env.BOT_TOKEN,
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
              newestUser.is_blocked ||
              newestUser.is_muted
            )
        },
        replyParameters
      );

      copiedMessageId =
        retryCopyResult?.message_id ||
        null;

      topicId = newTopicId;
    }
  }

  if (copiedMessageId) {
    await storeMessagePair(
      userId,
      message.message_id,
      copiedMessageId,
      env
    );
  }

  if (copiedMessageId) {
    // 首条正经消息已送达话题，成功回执/状态通知使命完成，顺手撤回。
    await clearSlotMessage(
      env,
      userId,
      'receipt_msg_id'
    );
  }

}

async function relayAdminMessageToUser(
  message,
  userId,
  env
) {
  // 若管理员引用了话题里的某条消息，把引用换算到访客
  // 私聊侧的原始消息 ID（配对不存在或已墓碑时不带引用）。
  let replyParameters = null;

  const adminRepliedId =
    message.reply_to_message?.message_id;

  if (adminRepliedId) {
    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `t:${adminRepliedId}`,
      env
    );

    const pairText = String(pair?.text || '');

    if (pairText && pairText !== 'gone') {
      const [pairUserId, pairPrivateId] =
        pairText.split(':');

      if (
        pairUserId === String(userId) &&
        /^\d+$/.test(pairPrivateId || '')
      ) {
        replyParameters =
          buildReplyParameters(
            message,
            pairPrivateId
          );
      }
    }
  }

  const copyResult =
    await copyMessageWithReplyFallback(
      env.BOT_TOKEN,
      {
        chat_id: String(userId),
        from_chat_id:
          String(message.chat.id),
        message_id: message.message_id
      },
      replyParameters
    );

  if (copyResult?.message_id) {
    await storeMessagePair(
      userId,
      copyResult.message_id,
      message.message_id,
      env
    );
  }

  return copyResult;
}

/* -------------------------------------------------------------------------- */
/*                      消息反应同步（改版新增）                               */
/* -------------------------------------------------------------------------- */

const REACTION_MAP_USER = 'rxmap';

const EDIT_HINT_TEXT = '✏️ 对方修改了这条消息';

async function storeMessagePair(
  userId,
  privateMessageId,
  topicMessageId,
  env
) {
  const now =
    Math.floor(Date.now() / 1000);

  try {
    // 两个方向的配对一次 batch 写入，避免半对儿。
    await env.TG_BOT_DB.batch([
      messageDataPutStatement(
        REACTION_MAP_USER,
        `p:${userId}:${privateMessageId}`,
        {
          text: String(topicMessageId),
          date: now
        },
        env
      ),

      messageDataPutStatement(
        REACTION_MAP_USER,
        `t:${topicMessageId}`,
        {
          text:
            `${userId}:${privateMessageId}`,
          date: now
        },
        env
      )
    ]);
  } catch (error) {
    console.error(
      '保存消息配对失败：',
      error?.message || error
    );
  }
}

async function replaceEditHint(
  env,
  { chatId, threadId, replyToMessageId, hintKey }
) {
  const oldHint = await dbMessageDataGet(
    REACTION_MAP_USER,
    hintKey,
    env
  );

  if (oldHint?.text) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: chatId,
          message_id: Number(oldHint.text)
        }
      );
    } catch (error) {
      console.error(
        '删除旧编辑提示失败：',
        error?.message || error
      );
    }
  }

  if (
    (await getConfig('hint_enabled', env, 'true')) !==
    'true'
  ) {
    // 关着的时候旧提示上面已经删了：指针记录一并清掉，
    // 否则之后每次编辑都会对那个已不存在的消息号重复发删除。
    if (oldHint?.text) {
      await dbMessageDataDelete(
        REACTION_MAP_USER,
        hintKey,
        env
      );
    }

    return;
  }

  try {
    const params = {
      chat_id: chatId,
      text: EDIT_HINT_TEXT,
      reply_parameters: {
        message_id: Number(replyToMessageId)
      }
    };

    if (threadId !== undefined) {
      params.message_thread_id = threadId;
    }

    const sentHint = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    if (sentHint?.message_id) {
      await dbMessageDataPut(
        REACTION_MAP_USER,
        hintKey,
        {
          text: String(sentHint.message_id),
          date: Math.floor(Date.now() / 1000)
        },
        env
      );

      // 并发编辑竞态收尾：提示指针若已被后来的编辑
      // 改写，本次这条就是落败者，删掉以保持恒一条。
      const currentHint =
        await dbMessageDataGet(
          REACTION_MAP_USER,
          hintKey,
          env
        );

      if (
        currentHint &&
        currentHint.text !==
          String(sentHint.message_id)
      ) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'deleteMessage',
            {
              chat_id: chatId,
              message_id:
                Number(sentHint.message_id)
            }
          );
        } catch (error) {
          /* 收尾失败无妨 */
        }
      }
    }
  } catch (error) {
    console.error(
      '发送编辑提示失败：',
      error?.message || error
    );
  }
}

async function tombstoneTopicMessage(
  topicMessageId,
  env
) {
  // 管理员用 /delete 删掉话题侧消息后调用：把该消息的同步
  // 映射标记为 gone 并清掉路由行与提示，之后对它的编辑/反应
  // 一律静默丢弃，防止被删内容借回退通知重新出现。
  let resolvedPair = null;

  try {
    const now =
      Math.floor(Date.now() / 1000);

    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `t:${topicMessageId}`,
      env
    );

    let userId = null;

    if (pair?.text && pair.text !== 'gone') {
      const separator =
        pair.text.indexOf(':');

      if (separator > 0) {
        userId =
          pair.text.slice(0, separator);

        const privateMessageId =
          pair.text.slice(separator + 1);

        resolvedPair = {
          userId,
          privateMessageId
        };

        // 两行墓碑一次 batch 写完（与 storeMessagePair
        // 同一口径）：分开写时第二写失败会留下半边墓碑，
        // 已删消息的编辑会走回退路径借通知「复活」。
        await env.TG_BOT_DB.batch([
          messageDataPutStatement(
            REACTION_MAP_USER,
            `t:${topicMessageId}`,
            { text: 'gone', date: now },
            env
          ),

          messageDataPutStatement(
            REACTION_MAP_USER,
            `p:${userId}:${privateMessageId}`,
            { text: 'gone', date: now },
            env
          )
        ]);

        const hintSpecs = [
          {
            key: `hint:t:${topicMessageId}`,
            chatId: userId
          },
          {
            key:
              `hint:p:${userId}:` +
              `${privateMessageId}`,
            chatId: env.ADMIN_GROUP_ID
          }
        ];

        for (const spec of hintSpecs) {
          const hint =
            await dbMessageDataGet(
              REACTION_MAP_USER,
              spec.key,
              env
            );

          if (hint?.text) {
            try {
              await telegramApi(
                env.BOT_TOKEN,
                'deleteMessage',
                {
                  chat_id: spec.chatId,
                  message_id:
                    Number(hint.text)
                }
              );
            } catch (error) {
              /* 提示可能已被手动删除 */
            }

            await dbMessageDataDelete(
              REACTION_MAP_USER,
              spec.key,
              env
            );
          }
        }
      }
    }

    if (!userId) {
      const owner =
        await env.TG_BOT_DB.prepare(
          'SELECT user_id FROM messages ' +
          'WHERE message_id = ?'
        )
          .bind(
            getMessageStorageKey(
              'admin',
              topicMessageId
            )
          )
          .first();

      userId = owner?.user_id
        ? String(owner.user_id)
        : null;
    }

    if (userId) {
      await dbMessageDataDelete(
        userId,
        getMessageStorageKey(
          'admin',
          topicMessageId
        ),
        env
      );
    }
  } catch (error) {
    console.error(
      '标记已删除消息失败：',
      error?.message || error
    );
  }

  return resolvedPair;
}

function extractEmojiReactions(
  reactions
) {
  if (!Array.isArray(reactions)) {
    return [];
  }

  const emojis = [];

  for (const item of reactions) {
    if (
      item?.type === 'emoji' &&
      item.emoji &&
      !emojis.includes(item.emoji)
    ) {
      emojis.push(item.emoji);
    }
  }

  return emojis;
}

async function mirrorReaction(
  env,
  targetChatId,
  targetMessageId,
  emojis
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'setMessageReaction',
      {
        chat_id: String(targetChatId),
        message_id:
          Number(targetMessageId),
        reaction: emojis.map(
          (emoji) => ({
            type: 'emoji',
            emoji
          })
        )
      }
    );
  } catch (error) {
    // 目标消息已删除、该聊天不允许此反应等情况直接忽略。
    console.warn(
      '镜像消息反应失败（已忽略）：',
      error?.message || error
    );
  }
}

function isNotModifiedError(error) {
  return String(
    error?.message || error
  )
    .toLowerCase()
    .includes('message is not modified');
}

function buildEditedMedia(source) {
  const extra = {};

  if (source.caption !== undefined) {
    extra.caption = source.caption;
  }

  if (source.caption_entities) {
    extra.caption_entities =
      source.caption_entities;
  }

  if (source.photo?.length) {
    return {
      type: 'photo',
      media:
        source.photo[
          source.photo.length - 1
        ].file_id,
      ...extra
    };
  }

  if (source.video) {
    return {
      type: 'video',
      media: source.video.file_id,
      ...extra
    };
  }

  if (source.animation) {
    return {
      type: 'animation',
      media: source.animation.file_id,
      ...extra
    };
  }

  if (source.document) {
    return {
      type: 'document',
      media: source.document.file_id,
      ...extra
    };
  }

  if (source.audio) {
    return {
      type: 'audio',
      media: source.audio.file_id,
      ...extra
    };
  }

  return null;
}

async function tryEditCounterpartMessage(
  env,
  targetChatId,
  targetMessageId,
  source
) {
  const chatId = String(targetChatId);
  const messageId =
    Number(targetMessageId);

  if (!messageId) {
    return false;
  }

  try {
    if (source.text) {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        text: source.text
      };

      if (source.entities) {
        params.entities = source.entities;
      }

      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        params
      );

      return true;
    }

    const media = buildEditedMedia(source);

    if (media) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'editMessageMedia',
          {
            chat_id: chatId,
            message_id: messageId,
            media
          }
        );

        return true;
      } catch (error) {
        if (isNotModifiedError(error)) {
          return true;
        }

        // 媒体本身替换失败时，退而求其次只同步说明文字。
        if (source.caption === undefined) {
          throw error;
        }
      }
    }

    if (source.caption !== undefined) {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        caption: source.caption || ''
      };

      if (source.caption_entities) {
        params.caption_entities =
          source.caption_entities;
      }

      await telegramApi(
        env.BOT_TOKEN,
        'editMessageCaption',
        params
      );

      return true;
    }

    return false;
  } catch (error) {
    if (isNotModifiedError(error)) {
      return true;
    }

    console.warn(
      '原地编辑对应消息失败，改用通知方式：',
      error?.message || error
    );

    return false;
  }
}

async function handleMessageReaction(
  reaction,
  env
) {
  const chat = reaction?.chat;
  const reactor = reaction?.user;

  if (!chat) {
    return;
  }

  if (
    (await getConfig(
      'reaction_sync_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  // 匿名管理员（以群/频道身份）的反应没有普通 user：
  // user 是 GroupAnonymousBot（1087968824）或带
  // actor_chat。在管理群里按管理员侧处理。
  const isAnonymousAdminReaction =
    Boolean(reaction?.actor_chat) ||
    Number(reactor?.id || 0) === 1087968824;

  if (!reactor && !isAnonymousAdminReaction) {
    return;
  }

  // 忽略机器人账号的反应：镜像动作本身会产生反应更新，
  // 不过滤会来回打转；其他机器人的反应也不转发。
  // （匿名管理员的 GroupAnonymousBot 除外，见上。）
  if (reactor?.is_bot && !isAnonymousAdminReaction) {
    return;
  }

  const emojis =
    extractEmojiReactions(
      reaction.new_reaction
    );

  // 新反应里只有付费 emoji（⭐）时机器人没法镜像：
  // 付费反应是叠加在普通反应之上的，整体跳过，
  // 不要把之前镜像好的普通反应误清掉。（自定义 emoji
  // 与普通 emoji 同槽替换，仍按镜像普通子集的老口径。）
  const rawNewReactions = Array.isArray(
    reaction.new_reaction
  )
    ? reaction.new_reaction
    : [];

  if (
    rawNewReactions.length &&
    !emojis.length &&
    rawNewReactions.every(
      (item) => item?.type === 'paid'
    )
  ) {
    return;
  }

  if (chat.type === 'private') {
    const userId = String(chat.id);

    if (!reactor || String(reactor.id) !== userId) {
      return;
    }

    const stored =
      await dbMessageDataGet(
        REACTION_MAP_USER,
        `p:${userId}:${reaction.message_id}`,
        env
      );

    if (
      !stored?.text ||
      stored.text === 'gone'
    ) {
      return;
    }

    const reactorUser = await dbUserGet(userId, env);

    if (
      !reactorUser ||
      Number(reactorUser.is_blocked || 0) === 1 ||
      reactorUser.user_state !== USER_STATE.VERIFIED
    ) {
      return;
    }

    await mirrorReaction(
      env,
      env.ADMIN_GROUP_ID,
      stored.text,
      emojis
    );

    return;
  }

  if (
    String(chat.id) ===
    String(env.ADMIN_GROUP_ID)
  ) {
    if (!isAnonymousAdminReaction) {
      const reactorId =
        String(reactor.id);

      if (
        !(await isAdminUser(
          reactorId,
          env
        ))
      ) {
        return;
      }
    }

    const stored =
      await dbMessageDataGet(
        REACTION_MAP_USER,
        `t:${reaction.message_id}`,
        env
      );

    if (!stored?.text) {
      return;
    }

    const separator =
      stored.text.indexOf(':');

    if (separator < 1) {
      return;
    }

    const userId =
      stored.text.slice(0, separator);

    const privateMessageId =
      stored.text.slice(separator + 1);

    await mirrorReaction(
      env,
      userId,
      privateMessageId,
      emojis
    );
  }
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
    const sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    return sent?.message_id || 0;
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
      return messageId;
    }

    if (
      errorText.includes(
        'message to edit not found'
      ) ||
      errorText.includes(
        "message can't be edited"
      )
    ) {
      const sent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        params
      );

      return sent?.message_id || 0;
    }

    throw error;
  }

  return messageId;
}

// 主菜单追踪记录的保鲜期：超过后记录里的消息号已过
// Telegram 的 48 小时删除窗口，读时作废、清扫时整行删除。
const MENU_TRACK_TTL_MS = 48 * 60 * 60 * 1000;

async function showMainMenu(
  chatId,
  env,
  messageId = 0,
  triggerMessageId = 0,
  origin = ''
) {
  const updateCache =
    await readUpdateCache(env);

  const updateState =
    describeUpdateState(updateCache);

  const versionLine =
    updateState.status === 'update' &&
    updateCache?.url
      ? `当前版本：${BOT_VERSION}｜🆕 <a href="${escapeHtml(updateCache.url)}">有新版本 ${escapeHtml(updateCache.tag)}</a>`
      : `当前版本：${BOT_VERSION}`;

  const pauseState = await getPauseState(env);

  const pauseLine = pauseState
    ? `\n⏸ <b>服务熔断中</b>，${describePauseRemaining(pauseState)}\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`
    : '';

  const text = `
⚙️ <b>机器人主菜单</b>
${versionLine}${pauseLine}
  `.trim();

  const keyboard = [];

  const menuButtons = {
    panel:
      (await getConfig('menu_btn_panel', env, 'true')) ===
      'true',
    list:
      (await getConfig('menu_btn_list', env, 'true')) ===
      'true',
    guide:
      (await getConfig('menu_btn_guide', env, 'true')) ===
      'true',
    updchk:
      (await getConfig('menu_btn_updchk', env, 'true')) ===
      'true',
    pause:
      (await getConfig('menu_btn_pause', env, 'true')) ===
      'true'
  };

  const listOrigin = getPublicOrigin(
    origin,
    env
  );

  if (listOrigin) {
    if (menuButtons.panel) keyboard.push([
      {
        text: '🛠 网页管理台',
        web_app: {
          url: await buildPanelUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);

    if (menuButtons.list) keyboard.push([
      {
        text: '📋 访客列表',
        web_app: {
          url: await buildUserListUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);

    if (menuButtons.guide) keyboard.push([
      {
        text: '📖 新手引导',
        web_app: {
          url: await buildGuideUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);
  }

  if (menuButtons.updchk) keyboard.push([
    {
      text: '🔄 检查更新',
      callback_data: 'updchk:check'
    }
  ]);

  if (menuButtons.pause && pauseState) {
    keyboard.push([
      {
        text: '▶️ 恢复服务',
        callback_data: 'pause:resume'
      }
    ]);
  } else if (menuButtons.pause) {
    keyboard.push([
      {
        text: '⏸ 服务熔断',
        callback_data: 'pause:menu'
      }
    ]);
  }

  const reply_markup = {
    inline_keyboard: keyboard
  };

  const menuMessageId = await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });

  // 主菜单只保留最新一对：删除推迟一轮——新发菜单送达后，
  // 删掉的是上一条主菜单与触发它的那条 /start（或 /help）命令消息，
  // 最新的一条命令消息始终留在聊天里，点一下就能重发刷新菜单
  // （网页链接 30 分钟过期，靠它快速拿新链接）；原地编辑形态只更新追踪。
  try {
    if (menuMessageId) {
      const trackKey = `mainmenu:${chatId}`;

      let prevMenuId = 0;
      let prevCmdId = 0;
      let trackTs = 0;

      const rawTrack = await dbConfigGet(trackKey, env);

      if (rawTrack) {
        let parsedTrack = null;

        try {
          parsedTrack = JSON.parse(rawTrack);
        } catch (_) {
          parsedTrack = null;
        }

        if (typeof parsedTrack === 'number') {
          // 旧格式：纯数字只记了菜单编号。注意
          // JSON.parse('4242') 不抛错、直接返回数字，
          // 必须在这里单独接住（放进 catch 永远走不到）。
          prevMenuId = parsedTrack || 0;
        } else if (parsedTrack) {
          prevMenuId =
            parseInt(parsedTrack?.m || '0', 10) || 0;

          prevCmdId =
            parseInt(parsedTrack?.c || '0', 10) || 0;

          trackTs = Number(parsedTrack?.t) || 0;

          // 追踪超过保鲜期：里面的消息号已过 Telegram
          // 删除窗口、删不动了，直接作废，跳过删除尝试。
          if (
            trackTs &&
            Date.now() - trackTs > MENU_TRACK_TTL_MS
          ) {
            prevMenuId = 0;
            prevCmdId = 0;
          }
        }
      }

      if (!messageId) {
        if (prevMenuId && prevMenuId !== menuMessageId) {
          await quietDeleteMessage(env, chatId, prevMenuId);
        }

        if (prevCmdId && prevCmdId !== triggerMessageId) {
          await quietDeleteMessage(env, chatId, prevCmdId);
        }

        await dbConfigPut(
          trackKey,
          JSON.stringify({
            m: menuMessageId,
            c: triggerMessageId || 0,
            t: Date.now()
          }),
          env
        );
      } else {
        await dbConfigPut(
          trackKey,
          JSON.stringify({
            m: menuMessageId,
            c: prevCmdId,
            // 原地编辑不换消息号：时间戳保持消息号的
            // 「出生时刻」，不要按渲染时刻刷新——否则
            // 靠按钮导航的管理员命令号永远不过期、
            // 记录也永远清不掉。旧记录没戳时补一个。
            t: trackTs || Date.now()
          }),
          env
        );
      }
    }
  } catch (_) {
    // 追踪失败不影响菜单本身
  }
}

/* -------------------------------------------------------------------------- */
/*                               验证处理                                       */
/* -------------------------------------------------------------------------- */

async function handleStart(
  chatId,
  env,
  origin = ''
) {
  const welcomeMessage = await getConfig(
    'welcome_msg',
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: welcomeMessage
    }
  );

  const mode =
    await getEffectiveVerifyMode(env);

  if (mode === 'turnstile') {
    await sendTurnstilePrompt(
      chatId,
      env,
      origin
    );
  } else {
    const verificationQuestion =
      await getConfig('verif_q', env);

    if (!(await promptThrottled(env, chatId))) {
      const promptSent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: verificationQuestion
        }
      );

      await trackSlotMessage(
        env,
        chatId,
        'verify_prompt_msg_id',
        promptSent?.message_id
      );

      await markPromptSent(env, chatId);
    }
  }

  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.PENDING
    },
    env
  );
}

// 问答验证防爆破：连续答错达上限后锁定一段时间。
// 问答是静态共享答案，没有次数限制时可被在线穷举。

async function handleVerification(
  chatId,
  answer,
  env
) {
  const lockKey = `quizlock:${chatId}`;
  const lockRaw = await dbConfigGet(lockKey, env);

  let lockState = null;

  try {
    lockState = lockRaw ? JSON.parse(lockRaw) : null;
  } catch (_) {
    lockState = null;
  }

  // 锁定中：静默拒绝（不回复、不写库），刷屏也烧不了额度。
  if (
    lockState &&
    Number(lockState.until || 0) > Date.now()
  ) {
    return false;
  }

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
    // 参数只在答错需要计数时才读：锁定中的垃圾答案在上方已静默
    // 返回，不再为它们多付两次配置读取。
    const quizMaxAttempts = await clampedIntConfig(
      'quiz_max_attempts',
      env,
      5,
      1,
      20
    );

    const quizLockMin = await clampedIntConfig(
      'quiz_lock_min',
      env,
      30,
      1,
      1440
    );

    const attempts =
      Number(lockState?.n || 0) + 1;

    if (attempts >= quizMaxAttempts) {
      await dbConfigPut(
        lockKey,
        JSON.stringify({
          n: 0,
          until: Date.now() + quizLockMin * 60 * 1000
        }),
        env
      );

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '🚫 答错次数过多，验证已锁定 ' +
            `${quizLockMin} 分钟，请稍后再试。`
        }
      );

      return false;
    }

    await dbConfigPut(
      lockKey,
      JSON.stringify({ n: attempts, until: 0 }),
      env
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: await textConfig('quiz_wrong_text', env)
      }
    );

    return false;
  }

  // 答对后清掉计数与锁定。
  await dbConfigDelete(lockKey, env);

  // 先更新状态，再通知访客，避免访客快速发送消息时状态未保存。
  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.VERIFIED
    },
    env
  );

  await cleanupAfterVerified(env, chatId);

  const successSent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: await textConfig('verify_success_text', env)
    }
  );

  await trackSlotMessage(
    env,
    chatId,
    'receipt_msg_id',
    successSent?.message_id
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/*                    Turnstile 小程序验证（改版新增）                          */
/* -------------------------------------------------------------------------- */

// 读侧整数配置：与写侧 validateScalarConfig 共用同一套范围口径。
// 写入口有校验，但配置也可能被带外写入坏值（负数/超大），
// 读取时一律钳回 [min, max]，坏值最多退化为边界行为、不会整类停摆。
// 一次读回整张 config 表（面板加载等批量场景用）：
// 配置表只有几十行，一次全表读替代几十次逐键点读，
// 避免串行往返叠加延迟、逼近单请求子请求上限。
async function getAllConfigMap(env) {
  const map = {};

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config WHERE key LIKE ?'
    )
      .bind('%')
      .all();

    for (const row of result?.results || []) {
      map[String(row.key)] = row.value;
    }
  } catch (error) {
    console.error('读取全部配置失败：', error?.message || error);
  }

  return map;
}

// 文案配置读取：被带外写成空串时回退默认值（getConfig 只对缺值回退）。
// 五句可配文案的写侧都强制非空，读到空串必是带外坏值，
// 直接拿去发消息会被 Telegram 以空文本拒绝、或让提醒静默消失。
async function textConfig(key, env) {
  const value = await getConfig(key, env);

  if (value === '') {
    return DEFAULTS[key] ?? value;
  }

  return value;
}

async function clampedIntConfig(key, env, def, min, max) {
  const n = Number(await getConfig(key, env, String(def)));

  if (!Number.isFinite(n)) {
    return def;
  }

  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function verifyLinkTtlMs(env) {
  const min = await clampedIntConfig(
    'verify_link_min',
    env,
    10,
    1,
    120
  );

  return min * 60 * 1000;
}

async function passLinkTtlMs(env) {
  const min = await clampedIntConfig(
    'pass_ttl_min',
    env,
    30,
    1,
    1440
  );

  return min * 60 * 1000;
}

function isTurnstileConfigured(env) {
  return Boolean(
    env.TURNSTILE_SITE_KEY &&
    env.TURNSTILE_SECRET_KEY
  );
}

async function getEffectiveVerifyMode(env) {
  const mode = await getConfig(
    'verify_mode',
    env,
    'turnstile'
  );

  if (
    mode === 'turnstile' &&
    isTurnstileConfigured(env)
  ) {
    return 'turnstile';
  }

  return 'quiz';
}

function getPublicOrigin(requestOrigin, env) {
  const configured = String(
    env.PUBLIC_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (configured) {
    return configured;
  }

  return String(requestOrigin || '')
    .trim()
    .replace(/\/+$/, '');
}

// 链接签名密钥：优先用独立的 LINK_SECRET，未配置时回退
// WEBHOOK_SECRET（保持旧行为）。两者解耦后，webhook 校验值
// 泄露不再连带击穿全部签名链接（验证/通行证/三页）。
function linkSecret(env) {
  return env.LINK_SECRET || env.WEBHOOK_SECRET;
}

async function hmacSha256Hex(key, data) {
  const encoder = new TextEncoder();

  const cryptoKey =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(String(key)),
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(String(data))
    );

  return [...new Uint8Array(signature)]
    .map((byte) =>
      byte.toString(16).padStart(2, '0')
    )
    .join('');
}

function timingSafeEqualString(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < left.length; i += 1) {
    diff |=
      left.charCodeAt(i) ^
      right.charCodeAt(i);
  }

  return diff === 0;
}

async function buildVerifyUrl(
  origin,
  userId,
  env,
  testMode = false
) {
  const exp =
    Date.now() + (await verifyLinkTtlMs(env));

  const signature =
    await hmacSha256Hex(
      linkSecret(env),
      testMode
        ? `tsverify-test:${userId}:${exp}`
        : `tsverify:${userId}:${exp}`
    );

  const params = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    s: signature
  });

  if (testMode) {
    params.set('m', 'test');
  }

  return `${origin}/verify?${params.toString()}`;
}

async function checkVerifySignature(
  userId,
  expRaw,
  signature,
  env,
  testMode = false
) {
  const uid = String(userId || '');

  if (!/^\d{1,20}$/.test(uid)) {
    return false;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (!Number.isFinite(exp) || exp <= now) {
    return false;
  }

  const expected =
    await hmacSha256Hex(
      linkSecret(env),
      testMode
        ? `tsverify-test:${uid}:${exp}`
        : `tsverify:${uid}:${exp}`
    );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return false;
  }

  // 上界只防离谱的远期伪造值，用写侧上限做固定宽限：
  // 管理员调短有效期不会追溯作废已发出的链接（真实有效期由 exp 本身决定）。
  return exp <= now + 120 * 60 * 1000 + 60 * 1000;
}


async function buildPassUrl(origin, userId, nonce, exp, env) {
  const signature = await hmacSha256Hex(
    linkSecret(env),
    `pass:${userId}:${exp}:${nonce}`
  );

  const params = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    n: String(nonce),
    s: signature
  });

  return `${origin}/pass?${params.toString()}`;
}

async function checkPassSignature(userId, expRaw, nonce, signature, env) {
  const uid = String(userId || '');

  if (!/^\d{1,20}$/.test(uid)) {
    return false;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (!Number.isFinite(exp) || exp <= now) {
    return false;
  }

  const expected = await hmacSha256Hex(
    linkSecret(env),
    `pass:${uid}:${exp}:${String(nonce || '')}`
  );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return false;
  }

  // 同 verify：固定宽限（写侧上限 1440 分钟），调短不追溯作废存量通行证；
  // 通行证的真实有效期另由库内记录的到期时间兜底。
  return exp <= now + 1440 * 60 * 1000 + 60 * 1000;
}

async function passRecordGet(userId, env) {
  const raw = await dbConfigGet(`pass:${userId}`, env);

  if (!raw) {
    return null;
  }

  try {
    const rec = JSON.parse(raw);
    return rec && rec.n ? rec : null;
  } catch {
    return null;
  }
}

// 静默删一条机器人自己的消息：已被访客删掉、超期删不动等一律忽略。
async function quietDeleteMessage(env, chatId, messageId) {
  if (!messageId) {
    return;
  }

  try {
    await telegramApi(env.BOT_TOKEN, 'deleteMessage', {
      chat_id: chatId,
      message_id: Number(messageId)
    });
  } catch {
    /* 删除失败不打扰主流程 */
  }
}

// 记账槽位：column 为 verify_prompt_msg_id / receipt_msg_id。
// 写入新 ID 前先删掉槽里的旧消息，保证同类消息只留最新一条。
async function trackSlotMessage(env, userId, column, messageId) {
  if (!messageId) {
    return;
  }

  const user = await dbUserGetOrCreate(userId, env);
  const oldId = Number(user?.[column] || 0);
  const newId = Number(messageId);

  if (oldId && oldId !== newId) {
    await quietDeleteMessage(env, userId, oldId);
  }

  if (oldId !== newId) {
    await dbUserUpdate(
      userId,
      { [column]: newId },
      env
    );
  }
}

// 撤回槽位里的消息并清空记录（没有记录时什么都不做）。
async function clearSlotMessage(env, userId, column) {
  const user = await dbUserGetOrCreate(userId, env);
  const oldId = Number(user?.[column] || 0);

  if (!oldId) {
    return;
  }

  await dbUserUpdate(
    userId,
    { [column]: null },
    env
  );

  await quietDeleteMessage(env, userId, oldId);
}

// 作废某访客的未用通行证：删记录并删掉证消息。
// 删人、重置验证、验证成功联动都走这里，保证「重新来过」收得干净。
async function voidUserPass(env, userId) {
  const rec = await passRecordGet(userId, env);

  await dbConfigDelete(`pass:${userId}`, env);

  if (rec?.m) {
    await quietDeleteMessage(env, userId, rec.m);
  }
}

// 任意入口验证通过后的联动清理：撤回验证提示；
// 若还有未使用的通行证，一并删消息并作废（人已通过，证留着只是风险）。
async function cleanupAfterVerified(env, userId) {
  await clearSlotMessage(
    env,
    userId,
    'verify_prompt_msg_id'
  );

  await voidUserPass(env, userId);

  await dbConfigDelete(`promptat:${userId}`, env);
}

// 过期通行证清扫：访客下次互动时顺手删掉过期通行证消息并清记录。
// 删除用「值仍是读到的那份」的原子条件删：期间被重发的新证不受影响。
async function sweepExpiredPass(env, userId) {
  const key = `pass:${userId}`;
  const raw = await dbConfigGet(key, env);

  if (!raw) {
    return;
  }

  let rec = null;

  try {
    rec = JSON.parse(raw);
  } catch {
    return;
  }

  if (!rec?.n || Number(rec.e) > Date.now()) {
    return;
  }

  const deleted = await dbConfigDeleteIfValue(
    key,
    raw,
    env
  );

  if (deleted && rec.m) {
    await quietDeleteMessage(env, userId, rec.m);
  }
}

// 验证提示节流：同一访客 3 分钟内只发一次提示，
// 挡住待验证访客刷消息放大 Telegram 调用与 D1 写入。
const PROMPT_RESEND_MIN_MS = 180000;

async function promptThrottled(env, userId) {
  const last = Number(
    (await dbConfigGet(`promptat:${userId}`, env)) || 0
  );

  return Date.now() - last < PROMPT_RESEND_MIN_MS;
}

async function markPromptSent(env, userId) {
  await dbConfigPut(
    `promptat:${userId}`,
    String(Date.now()),
    env
  );
}

// 校验 Telegram Mini App initData 并返回打开者访客 ID：
// 链接可以被转发，只有打开者本人与通行证绑定访客一致才算数。
async function telegramInitDataUserId(initDataRaw, botToken) {
  try {
    const params = new URLSearchParams(String(initDataRaw || ''));
    const hash = params.get('hash');

    if (!hash) {
      return null;
    }

    params.delete('hash');

    const pairs = [];

    for (const [k, v] of params.entries()) {
      pairs.push(`${k}=${v}`);
    }

    pairs.sort();

    const enc = new TextEncoder();

    const webAppKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secret = await crypto.subtle.sign(
      'HMAC',
      webAppKey,
      enc.encode(String(botToken || ''))
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sig = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      enc.encode(pairs.join('\n'))
    );

    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (!timingSafeEqualString(hex, hash)) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    if (
      !authDate ||
      authDate > nowSec + 300 ||
      nowSec - authDate > 3600
    ) {
      return null;
    }

    const user = JSON.parse(params.get('user') || 'null');

    return user && user.id != null ? String(user.id) : null;
  } catch {
    return null;
  }
}

async function sendTestVerifyPrompt(
  chatId,
  env,
  origin
) {
  if (!isTurnstileConfigured(env)) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '⚠️ 尚未配置 Turnstile 密钥，' +
          '无法打开测试验证页。'
      }
    );

    return;
  }

  const base = getPublicOrigin(
    origin,
    env
  );

  if (!base) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '⚠️ 无法确定验证页地址，' +
          '无法打开测试验证页。'
      }
    );

    return;
  }

  const url = await buildVerifyUrl(
    base,
    chatId,
    env,
    true
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '🧪 Turnstile 测试验证（测试模式）：' +
        '完成验证只会显示测试结果，' +
        '不会修改任何访客的验证状态。' +
        '链接 10 分钟内有效，' +
        '需要新链接随时再发 /testverify。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🧪 打开测试验证页',
              web_app: { url }
            }
          ]
        ]
      }
    }
  );
}

async function sendTurnstilePrompt(
  chatId,
  env,
  origin
) {
  if (await promptThrottled(env, chatId)) {
    return;
  }

  const base = getPublicOrigin(
    origin,
    env
  );

  if (!base) {
    // 无法确定验证页地址时回退静态问题，避免访客卡死。
    const question = await getConfig(
      'verif_q',
      env
    );

    const promptSent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: question
      }
    );

    await trackSlotMessage(
      env,
      chatId,
      'verify_prompt_msg_id',
      promptSent?.message_id
    );

    await markPromptSent(env, chatId);

    return;
  }

  const url = await buildVerifyUrl(
    base,
    chatId,
    env
  );

  const promptSent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '请点击下方按钮完成人机验证，' +
        '链接 10 分钟内有效。' +
        '验证通过后即可发送消息。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔐 点我完成人机验证',
              web_app: { url }
            }
          ]
        ]
      }
    }
  );

  await trackSlotMessage(
    env,
    chatId,
    'verify_prompt_msg_id',
    promptSent?.message_id
  );

  await markPromptSent(env, chatId);
}

function renderVerifyPage(env, params) {
  // m 不在签名覆盖范围内，只接受白名单值；
  // 同时把 < 转义掉，杜绝跳出内联脚本块。
  const payload = JSON.stringify({
    u: String(params.u),
    e: String(params.e),
    s: String(params.s),
    m: params.m === 'test' ? 'test' : ''
  }).replace(/</g, '\\u003c');

  const siteKey = escapeHtml(
    env.TURNSTILE_SITE_KEY
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>人机验证</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px 16px; background: #17212b; color: #fff; }
  main { max-width: 420px; margin: 0 auto; text-align: center; }
  h1 { font-size: 20px; margin: 8px 0 12px; }
  p { color: #a7b5c4; font-size: 14px; line-height: 1.6; }
  .cf-turnstile { display: flex; justify-content: center; margin: 20px 0; }
  #status { min-height: 24px; color: #fff; }
</style>
</head>
<body>
<main>
  <h1>人机验证</h1>
  <p>请完成下方验证，确认您不是机器人。</p>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError"></div>
  <p id="status"></p>
</main>
<script>
  var payload = ${payload};

  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  async function onTurnstileSuccess(token) {
    setStatus('正在确认验证结果…');

    try {
      var resp = await fetch('/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          u: payload.u,
          e: payload.e,
          s: payload.s,
          m: payload.m,
          token: token
        })
      });

      var data = {};

      try {
        data = await resp.json();
      } catch (ignored) {}

      if (resp.ok && data.ok) {
        if (payload.m === 'test') {
          setStatus('✅ 测试验证成功！这是测试模式，未修改任何访客的验证状态，可以关闭此页面。');
        } else {
          setStatus('✅ 验证成功！可以关闭此页面，回到 Telegram 继续发送消息。');
        }

        if (window.Telegram && Telegram.WebApp) {
          Telegram.WebApp.ready();
        }
      } else {
        setStatus('❌ 验证未通过，请刷新页面重试。');

        if (window.turnstile) {
          turnstile.reset();
        }
      }
    } catch (error) {
      setStatus('❌ 网络异常，请刷新页面重试。');
    }
  }

  function onTurnstileError() {
    setStatus('❌ 验证组件加载失败，请检查网络后刷新页面。');
  }
</script>
</body>
</html>`;
}


function buildPassPage(params) {
  const payload = JSON.stringify({
    u: String(params.u),
    e: String(params.e),
    n: String(params.n),
    s: String(params.s)
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>验证通行证</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px 16px; background: #17212b; color: #fff; }
  main { max-width: 420px; margin: 0 auto; text-align: center; }
  h1 { font-size: 20px; margin: 8px 0 12px; }
  p { color: #a7b5c4; font-size: 14px; line-height: 1.6; }
  button { margin-top: 14px; padding: 12px 22px; font-size: 16px; border: 0; border-radius: 10px; background: #2b5278; color: #fff; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  #status { min-height: 24px; color: #fff; margin-top: 14px; }
</style>
</head>
<body>
<main>
  <h1>🎫 验证通行证</h1>
  <p>管理员为你发放了一张一次性通行证。<br>点击下方按钮即可通过验证，回到对话就能直接发消息。</p>
  <button id="go">✅ 确认通过验证</button>
  <p id="status"></p>
</main>
<script>
  var payload = ${payload};
  var btn = document.getElementById('go');
  var st = document.getElementById('status');
  if (window.Telegram && Telegram.WebApp) { Telegram.WebApp.ready(); Telegram.WebApp.expand(); }
  btn.addEventListener('click', function () {
    var initData = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || '';
    if (!initData) {
      st.textContent = '请从 Telegram 里打开这张通行证，不要用浏览器直接打开链接。';
      return;
    }
    btn.disabled = true;
    st.textContent = '正在确认…';
    var body = { u: payload.u, e: payload.e, n: payload.n, s: payload.s, initData: initData };
    fetch('/pass/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) {
        st.textContent = '🎉 验证成功！回到对话即可直接发消息。';
        setTimeout(function () { if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close(); }, 1200);
      } else {
        btn.disabled = false;
        var msgs = {
          bad_signature: '通行证无效或已过期，请联系管理员重新发放。',
          bad_initdata: '无法确认你的 Telegram 身份，请从与机器人的对话里打开通行证。',
          used_or_invalid: '这张通行证已使用或已失效，请联系管理员重新发放。',
          blocked: '账号已被封禁，通行证无法使用，请联系管理员。'
        };
        st.textContent = msgs[d.error] || ('确认失败：' + (d.error || '未知错误'));
      }
    }).catch(function () {
      btn.disabled = false;
      st.textContent = '网络异常，请重试。';
    });
  });
</script>
</body>
</html>`;
}

async function handlePassPage(request, env) {
  const url = new URL(request.url);

  const u = url.searchParams.get('u') || '';
  const e = url.searchParams.get('e') || '';
  const n = url.searchParams.get('n') || '';
  const s = url.searchParams.get('s') || '';

  const valid = await checkPassSignature(u, e, n, s, env);
  const rec = valid ? await passRecordGet(u, env) : null;

  if (!valid || !rec || rec.n !== n || Number(rec.e) !== Number(e)) {
    return new Response(
      '通行证无效或已失效，请联系管理员重新发放。',
      {
        status: 403,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }

  return new Response(buildPassPage({ u, e, n, s }), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function handlePassConfirm(request, env) {
  const jsonResponse = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'bad_json' });
  }

  const u = String(body?.u || '');
  const e = String(body?.e || '');
  const n = String(body?.n || '');
  const s = String(body?.s || '');

  const valid = await checkPassSignature(u, e, n, s, env);

  if (!valid) {
    return jsonResponse(403, { ok: false, error: 'bad_signature' });
  }

  const openerId = await telegramInitDataUserId(
    body?.initData,
    env.BOT_TOKEN
  );

  if (openerId !== u) {
    return jsonResponse(403, { ok: false, error: 'bad_initdata' });
  }

  const rec = await passRecordGet(u, env);

  if (!rec || rec.n !== n || Number(rec.e) !== Number(e)) {
    return jsonResponse(403, { ok: false, error: 'used_or_invalid' });
  }

  const user = await dbUserGetOrCreate(u, env);

  if (Number(user.is_blocked || 0) === 1) {
    return jsonResponse(403, { ok: false, error: 'blocked' });
  }

  await dbConfigDelete(`pass:${u}`, env);

  if (rec.m) {
    await quietDeleteMessage(env, u, rec.m);
  }

  await cleanupAfterVerified(env, u);

  if (user.user_state !== USER_STATE.VERIFIED) {
    await dbUserUpdate(
      u,
      { user_state: USER_STATE.VERIFIED },
      env
    );

    try {
      const successSent = await telegramApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: u,
        text: await textConfig('verify_success_text', env)
      });

      await trackSlotMessage(
        env,
        u,
        'receipt_msg_id',
        successSent?.message_id
      );
    } catch (error) {
      console.error(
        '通行证通过后通知访客失败：',
        error?.message || error
      );
    }
  }

  return jsonResponse(200, { ok: true });
}

async function handleVerifyPage(
  request,
  env
) {
  if (!isTurnstileConfigured(env)) {
    return new Response(
      '验证服务尚未配置完成，请联系管理员。',
      {
        status: 503,
        headers: {
          'content-type':
            'text/plain; charset=utf-8'
        }
      }
    );
  }

  const url = new URL(request.url);

  const u =
    url.searchParams.get('u') || '';
  const e =
    url.searchParams.get('e') || '';
  const s =
    url.searchParams.get('s') || '';

  const m =
    url.searchParams.get('m') || '';

  const valid =
    await checkVerifySignature(
      u,
      e,
      s,
      env,
      m === 'test'
    );

  if (!valid) {
    return new Response(
      '验证链接无效或已过期，' +
      '请回到机器人发送 /start 获取新链接。',
      {
        status: 403,
        headers: {
          'content-type':
            'text/plain; charset=utf-8'
        }
      }
    );
  }

  return new Response(
    renderVerifyPage(env, { u, e, s, m }),
    {
      status: 200,
      headers: {
        'content-type':
          'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}

async function handleVerifyConfirm(
  request,
  env
) {
  const jsonResponse = (
    status,
    data
  ) =>
    new Response(
      JSON.stringify(data),
      {
        status,
        headers: {
          'content-type':
            'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );

  if (!isTurnstileConfigured(env)) {
    return jsonResponse(503, {
      ok: false,
      error: 'not_configured'
    });
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: 'bad_json'
    });
  }

  const u = String(body?.u || '');
  const e = String(body?.e || '');
  const s = String(body?.s || '');

  const testMode =
    String(body?.m || '') === 'test';
  const token =
    String(body?.token || '');

  if (
    token.length < 10 ||
    token.length > 2048
  ) {
    return jsonResponse(400, {
      ok: false,
      error: 'bad_token'
    });
  }

  const valid =
    await checkVerifySignature(
      u,
      e,
      s,
      env,
      testMode
    );

  if (!valid) {
    return jsonResponse(403, {
      ok: false,
      error: 'bad_signature'
    });
  }

  let verifyResult;

  try {
    const form = new URLSearchParams();

    form.set(
      'secret',
      env.TURNSTILE_SECRET_KEY
    );
    form.set('response', token);

    const remoteIp = request.headers.get(
      'CF-Connecting-IP'
    );

    if (remoteIp) {
      form.set('remoteip', remoteIp);
    }

    const resp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10000)
      }
    );

    verifyResult = await resp.json();
  } catch (error) {
    console.error(
      'Turnstile siteverify 调用失败：',
      error?.message || error
    );

    return jsonResponse(502, {
      ok: false,
      error: 'siteverify_unreachable'
    });
  }

  if (!verifyResult?.success) {
    console.warn(
      'Turnstile 校验未通过：',
      JSON.stringify(
        verifyResult?.['error-codes'] || []
      )
    );

    return jsonResponse(403, {
      ok: false,
      error: 'turnstile_failed'
    });
  }

  const expectedHost =
    new URL(request.url).hostname;

  if (
    verifyResult.hostname &&
    verifyResult.hostname !==
      expectedHost
  ) {
    console.warn(
      'Turnstile hostname 不匹配：',
      verifyResult.hostname,
      expectedHost
    );

    return jsonResponse(403, {
      ok: false,
      error: 'hostname_mismatch'
    });
  }

  if (testMode) {
    if (!(await isAdminUser(u, env))) {
      return jsonResponse(403, {
        ok: false,
        error: 'test_not_allowed'
      });
    }

    return jsonResponse(200, {
      ok: true,
      test: true
    });
  }

  const user =
    await dbUserGetOrCreate(u, env);

  if (Number(user.is_blocked || 0) === 1) {
    return jsonResponse(403, {
      ok: false,
      error: 'blocked'
    });
  }

  if (
    user.user_state !==
    USER_STATE.VERIFIED
  ) {
    await dbUserUpdate(
      u,
      {
        user_state: USER_STATE.VERIFIED
      },
      env
    );

    await cleanupAfterVerified(env, u);

    try {
      const successSent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: u,
          text: await textConfig('verify_success_text', env)
        }
      );

      await trackSlotMessage(
        env,
        u,
        'receipt_msg_id',
        successSent?.message_id
      );
    } catch (error) {
      // 状态已保存，通知失败只记日志，不让接口报 500 误导访客。
      console.error(
        '验证成功后通知访客失败：',
        error?.message || error
      );
    }
  }

  return jsonResponse(200, {
    ok: true
  });
}

/* -------------------------------------------------------------------------- */
/*                             管理员配置输入处理                                 */
/* -------------------------------------------------------------------------- */

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
    `访客 ${userId} 命中关键词：`,
    hitKeyword
  );
}

/* -------------------------------------------------------------------------- */
/*                 转发失败通知与已验证访客限速（审计第四轮新增）                */
/* -------------------------------------------------------------------------- */

const RELAY_FAIL_NOTICE_MIN_MS = 10 * 60 * 1000;

function isRightsError(error) {
  const text = String(
    error?.message || error
  ).toLowerCase();

  return (
    text.includes('not enough rights') ||
    text.includes('administrator rights') ||
    text.includes('chat admin required') ||
    text.includes('bot is not a member') ||
    text.includes('bot was kicked')
  );
}

// 转发失败不再静默：节流后往访客话题里留一行提醒；
// 话题发不进去（群权限丢失等）时改走主管理员私聊兜底。
async function notifyRelayFailure(
  message,
  user,
  env,
  error
) {
  const userId = String(message.from.id);

  // 本函数由转发失败的 catch 调用：开关读再失败也不能覆盖原失败路径，
  // 读不到就按默认（开）处理。
  let failNoticeEnabled = true;

  try {
    failNoticeEnabled =
      (await getConfig(
        'relay_fail_notice_enabled',
        env,
        'true'
      )) === 'true';
  } catch (_) {
    failNoticeEnabled = true;
  }

  if (!failNoticeEnabled) {
    return;
  }

  try {
    const throttleKey = `copyfail:${userId}`;
    const last = Number(
      (await dbConfigGet(throttleKey, env)) || 0
    );

    if (
      Date.now() - last <
      RELAY_FAIL_NOTICE_MIN_MS
    ) {
      return;
    }

    await dbConfigPut(
      throttleKey,
      String(Date.now()),
      env
    );

    if (isRightsError(error)) {
      await notifyPrimaryAdmins(
        env,
        '⚠️ 机器人似乎已失去管理群的管理员权限，' +
        '访客消息无法转发进话题，请检查群权限。'
      );

      return;
    }

    const fresh = await dbUserGet(userId, env);
    const topicId =
      fresh?.topic_id || user?.topic_id;

    let delivered = false;

    if (topicId) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id: Number(topicId),
            text:
              '⚠️ 访客发来的一条消息未能转发到话题' +
              '（内容可能受保护限制或接口异常），' +
              '对方以为已发送成功，请留意。'
          }
        );

        delivered = true;
      } catch (_) {
        delivered = false;
      }
    }

    if (!delivered) {
      await notifyPrimaryAdmins(
        env,
        `⚠️ 访客 ${userId} 的一条消息转发失败，` +
        '未能送达话题。'
      );
    }
  } catch (_) {
    /* 通知失败不影响主流程 */
  }
}

// 已验证访客转发限速（内存令牌桶，尽力而为）：
// 挡住刷屏把 D1 写入与 Telegram 调用成倍放大烧穿
// 免费额度；超速消息直接丢弃并节流提醒。
const relayBuckets = new Map();
const RELAY_LIMIT_NOTICE_MIN_MS = 10 * 60 * 1000;

function relayRateLimitAllow(userId, capacity, refillPerSec) {
  const now = Date.now();

  let bucket = relayBuckets.get(userId);

  if (!bucket) {
    if (relayBuckets.size >= 1000) {
      relayBuckets.delete(
        relayBuckets.keys().next().value
      );
    }

    bucket = {
      tokens: capacity,
      at: now,
      noticedAt: 0
    };

    relayBuckets.set(userId, bucket);
  }

  const elapsedSec = (now - bucket.at) / 1000;

  bucket.tokens = Math.min(
    capacity,
    bucket.tokens +
      elapsedSec * refillPerSec
  );

  bucket.at = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;

  return true;
}

async function notifyRelayRateLimited(user, env) {
  const userId = String(user?.user_id || '');
  const bucket = relayBuckets.get(userId);
  const now = Date.now();

  if (
    bucket &&
    now - bucket.noticedAt <
      RELAY_LIMIT_NOTICE_MIN_MS
  ) {
    return;
  }

  if (bucket) {
    bucket.noticedAt = now;
  }

  if (!user?.topic_id) {
    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(user.topic_id),
        text:
          '⚠️ 该访客发送消息过于频繁，' +
          '超出部分已被限流丢弃。'
      }
    );
  } catch (_) {
    /* 提醒失败不影响限速本身 */
  }
}

async function handlePrivateMessage(
  message,
  env,
  origin = ''
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
      await showMainMenu(chatId, env, 0, message.message_id || 0, origin);
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
            '✅ 您是已授权协管员，可以在管理群访客话题中回复消息。'
        }
      );

      return;
    }

    // 被信任的访客点 /start 也应直接放行（下面随即按已验证回应），
    // 而不是先收到一条验证提示、再等下一条普通消息才被闸门放行。
    if (
      user.is_trusted &&
      !user.is_blocked &&
      user.user_state !== USER_STATE.VERIFIED
    ) {
      await dbUserUpdate(
        userId,
        { user_state: USER_STATE.VERIFIED },
        env
      );

      user.user_state = USER_STATE.VERIFIED;

      await cleanupAfterVerified(env, chatId);
    }

    if (
      user.user_state ===
      USER_STATE.VERIFIED
    ) {
      await clearSlotMessage(
        env,
        chatId,
        'receipt_msg_id'
      );

      const noticeSent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '您已通过验证，可以直接发送消息。'
        }
      );

      await trackSlotMessage(
        env,
        chatId,
        'receipt_msg_id',
        noticeSent?.message_id
      );
    } else {
      await handleStart(chatId, env, origin);
    }

    return;
  }

  if (commandText === '/testverify') {
    if (isAdmin) {
      await sendTestVerifyPrompt(
        chatId,
        env,
        origin
      );
    }

    return;
  }

  if (commandText === '/version') {
    if (isPrimary) {
      const state = await checkForUpdates(
        env,
        true
      );

      const described =
        describeUpdateState(state);

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            'ℹ️ <b>版本信息</b>\n\n' +
            `当前版本：${BOT_VERSION}\n` +
            escapeHtml(described.line) +
            (state?.url &&
            described.status === 'update'
              ? `\n<a href="${escapeHtml(state.url)}">打开 Release 页</a>`
              : '') +
            (described.status === 'failed'
              ? '\n⚠️ 最近一次检查失败，请稍后再试。'
              : ''),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
    }

    return;
  }

  const pauseMatch = commandText.match(
    /^\/pause(?:\s+(\d+))?$/
  );

  if (commandText === '/panel') {
    if (isPrimary) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: '🛠 网页管理台（链接 30 分钟内有效，过期重新发送 /panel）',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🛠 打开网页管理台',
                  web_app: {
                    url: await buildPanelUrl(
                      origin,
                      userId,
                      env
                    )
                  }
                }
              ]
            ]
          }
        }
      );
    }

    return;
  }

  if (pauseMatch || commandText === '/resume') {
    if (isPrimary) {
      if (commandText === '/resume') {
        const state = await getPauseState(env);

        if (!state) {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text: '当前没有处于暂停状态。'
            }
          );
        } else {
          await performResume(env, userId);

          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text:
                '▶️ 机器人已恢复服务，' +
                '访客消息恢复正常转发。'
            }
          );
        }
      } else {
        const state = await getPauseState(env);
        const arg = pauseMatch[1];

        if (!arg && state) {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text:
                `⏸ 服务熔断进行中，${describePauseRemaining(state)}。\n` +
                '重新计时发送 /pause 分钟数，' +
                '立即恢复发送 /resume。\n' +
                'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；若一直没人发消息，收不到通知是正常的——服务熔断其实已经结束，只是没通知。'
            }
          );
        } else {
          const minutes = arg
            ? Number(arg)
            : PAUSE_DEFAULT_MINUTES;

          if (
            !Number.isInteger(minutes) ||
            minutes < 1 ||
            minutes > PAUSE_MAX_MINUTES
          ) {
            await telegramApi(
              env.BOT_TOKEN,
              'sendMessage',
              {
                chat_id: chatId,
                text:
                  '⚠️ 用法：/pause [分钟数]，' +
                  '例如 /pause 30；不带数字默认 60 分钟，' +
                  '最大 10080 分钟（7 天）。'
              }
            );
          } else {
            const fresh = await performPause(
              env,
              minutes,
              userId
            );

            const replyOn =
              (await getConfig(
                'pause_reply_enabled',
                env,
                'true'
              )) === 'true';

            await telegramApi(
              env.BOT_TOKEN,
              'sendMessage',
              {
                chat_id: chatId,
                text:
                  `⏸ 服务熔断已开启，${describePauseRemaining(fresh)}。\n` +
                  '暂停期间访客新发的消息会被删除（对已送达消息的编辑与反应照常同步）' +
                  (replyOn
                    ? '，每位访客会收到一条回复提醒'
                    : '，且不会收到任何回复') +
                  '。恢复请发送 /resume。\n' +
                  'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；若一直没人发消息，收不到通知是正常的——服务熔断其实已经结束，只是没通知。'
              }
            );
          }
        }
      }
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

  if (!isAdmin) {
    await sweepExpiredPass(env, userId);
  }

  if (
    user.user_state ===
    USER_STATE.VERIFIED
  ) {
    await touchUserActivity(user, env);
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
    user.is_trusted &&
    !user.is_blocked &&
    user.user_state !== USER_STATE.VERIFIED
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

    await cleanupAfterVerified(env, userId);
  }

  if (
    user.user_state === USER_STATE.NEW
  ) {
    await handleStart(chatId, env, origin);
    return;
  }

  if (
    user.user_state ===
    USER_STATE.PENDING
  ) {
    const mode =
      await getEffectiveVerifyMode(env);

    if (mode === 'turnstile') {
      await sendTurnstilePrompt(
        chatId,
        env,
        origin
      );

      return;
    }

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
    user.relay_exempt
      ? { ok: true }
      : await checkForwardFilters(
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

  if (!user.relay_exempt) {
    // 这两读在转发容错之外：读失败绝不能让已消费的消息静默丢失，
    // 失败就用默认参数继续转发。
    let relayBurst = 30;
    let relayRefill = 5;

    try {
      relayBurst = await clampedIntConfig(
        'relay_burst',
        env,
        30,
        1,
        1000
      );

      relayRefill = await clampedIntConfig(
        'relay_refill_per_sec',
        env,
        5,
        1,
        100
      );
    } catch (error) {
      console.error(
        '读取转发限流参数失败，按默认值继续：',
        error?.message || error
      );
    }

    if (
      !relayRateLimitAllow(
        userId,
        relayBurst,
        relayRefill
      )
    ) {
      await notifyRelayRateLimited(user, env);

      return;
    }
  }

  try {
    await relayUserMessageToTopic(
      message,
      user,
      env
    );
  } catch (error) {
    console.error(
      '转发访客消息失败：',
      error?.message || error
    );

    await notifyRelayFailure(
      message,
      user,
      env,
      error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              管理员回复处理                                   */
/* -------------------------------------------------------------------------- */
function parseAdminCommand(text) {
  const value = String(text || '').trim();

  const match = value.match(
    /^\/([a-zA-Z_]+)(?:@(\w+))?(?:\s+([\s\S]+))?$/
  );

  if (!match) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    suffix: match[2] || '',
    argument: match[3]?.trim() || ''
  };
}

// 本机器人用户名（getMe 拉一次后缓存进 config）：
// 用于识别「/命令@别的机器人」——那是发给别人的，
// 本机器人应完全忽略，而不是照常执行或吞掉。
async function getBotUsername(env) {
  const cached = await dbConfigGet(
    'sys:bot-username',
    env
  );

  if (cached) {
    return cached;
  }

  try {
    const me = await telegramApi(
      env.BOT_TOKEN,
      'getMe',
      {}
    );

    const name = String(me?.username || '');

    if (name) {
      await dbConfigPut(
        'sys:bot-username',
        name,
        env
      );
    }

    return name;
  } catch (_) {
    return '';
  }
}

async function resolveTopicUserId(
  message,
  env,
  argument = ''
) {
  if (argument) {
    const userId = argument
      .split(/\s+/)[0]
      .trim();

    if (/^\d+$/.test(userId)) {
      return userId;
    }

    return null;
  }

  if (!message?.message_thread_id) {
    return null;
  }

  return dbTopicUserGet(
    String(message.message_thread_id),
    env
  );
}

async function sendTopicNotice(
  message,
  text,
  env
) {
  return telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id:
        Number(message.message_thread_id),
      text
    }
  );
}

// 短暂通知：命令回执类提示看过即走，发出约 5 秒后自动删除，不在话题里留痕。
// 删除任务挂在 ctx.waitUntil 上（尽力而为）；时长可用 EPHEMERAL_NOTICE_MS 覆盖。
async function sendEphemeralTopicNotice(
  message,
  text,
  env,
  ctx
) {
  const sent =
    await sendTopicNotice(message, text, env);

  const noticeId = sent?.message_id;

  if (!noticeId) {
    return sent;
  }

  // 时长读在通知发出后、且调用方后面还接着命令撤回等步骤：
  // 读失败绝不能把整条链抛断，失败用默认 5 秒。
  let staySec = 5;

  try {
    staySec = await clampedIntConfig(
      'notice_stay_sec',
      env,
      5,
      1,
      120
    );
  } catch (_) {
    staySec = 5;
  }

  const delayMs =
    Number(env?.EPHEMERAL_NOTICE_MS) > 0
      ? Number(env.EPHEMERAL_NOTICE_MS)
      : staySec * 1000;

  // 落一条待删记账：定时删除挂在请求上下文上，
  // 万一上下文被回收没删成，数据库清扫会按记账
  // 补删（见 sweepEphemeralNotices）。
  const markerKey = `ephem:${noticeId}`;

  try {
    await dbConfigPut(
      markerKey,
      JSON.stringify({
        c: String(env.ADMIN_GROUP_ID),
        at: Date.now() + delayMs
      }),
      env
    );
  } catch (_) {
    /* 记账失败不影响短暂通知本身 */
  }

  const task = (async () => {
    await sleep(delayMs);

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      noticeId
    );

    await dbConfigDelete(markerKey, env);
  })();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  } else {
    task.catch(() => {});
  }

  return sent;
}

async function handleAdminCommand(
  message,
  env,
  ctx = null
) {
  const parsed =
    parseAdminCommand(message.text);

  if (!parsed) {
    return false;
  }

  const allowedCommands = new Set([
  'ban',
  'unban',
  'delete',
  'clear',
  'terminate',
  'card',
  'reverify',
  'note',
  'notedelete',
  'pause',
  'resume'
]);

  if (!allowedCommands.has(parsed.command)) {
    return false;
  }

  const senderId =
    String(message.from?.id || '');

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    return true;
  }

  if (
    parsed.command === 'pause' ||
    parsed.command === 'resume'
  ) {
    if (!isPrimaryAdmin(senderId, env)) {
      await sendTopicNotice(
        message,
        '⚠️ 服务熔断开关仅主管理员可操作。',
        env
      );

      return true;
    }

    if (parsed.command === 'resume') {
      const state = await getPauseState(env);

      if (!state) {
        await sendEphemeralTopicNotice(
          message,
          '当前没有处于暂停状态。',
          env,
          ctx
        );
      } else {
        await performResume(env, senderId);

        await sendEphemeralTopicNotice(
          message,
          '▶️ 机器人已恢复服务。',
          env,
          ctx
        );
      }

      return true;
    }

    const state = await getPauseState(env);
    const arg = String(parsed.argument || '').trim();

    if (!arg && state) {
      await sendEphemeralTopicNotice(
        message,
        `⏸ 服务熔断进行中，${describePauseRemaining(state)}。\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`,
        env,
        ctx
      );

      return true;
    }

    const minutes = arg
      ? Number(arg)
      : PAUSE_DEFAULT_MINUTES;

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      await sendTopicNotice(
        message,
        '⚠️ 用法：/pause [分钟数]，例如 /pause 30；' +
          '不带数字默认 60 分钟。',
        env
      );

      return true;
    }

    const fresh = await performPause(
      env,
      minutes,
      senderId
    );

    await sendEphemeralTopicNotice(
      message,
      `⏸ 服务熔断已开启，${describePauseRemaining(fresh)}。\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`,
      env,
      ctx
    );

    return true;
  }

  const topicId = String(
    message.message_thread_id || ''
  );

  if (!topicId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        text:
          '⚠️ 这些命令只能在访客话题中使用。'
      }
    );

    return true;
  }

  if (parsed.command === 'reverify') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/reverify 访客ID',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      {
        user_state: USER_STATE.PENDING,
        is_trusted: 0
      },
      env
    );

    await voidUserPass(env, userId);

    await sendEphemeralTopicNotice(
      message,
      '🔄 已将该访客重置为待验证状态。\n' +
      '对方下次发送消息或 /start 时，' +
      '将重新进行人机验证。',
      env,
      ctx
    );

    return true;
  }

  if (
    parsed.command === 'note' ||
    parsed.command === 'notedelete'
  ) {
    // 备注命令只按话题定位访客，绝不把参数当作访客 ID
    // （备注内容可能以数字开头）。
    const userId =
      await resolveTopicUserId(
        message,
        env
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。',
        env
      );

      return 'keep';
    }

    const target =
      await dbUserGetOrCreate(userId, env);

    if (parsed.command === 'notedelete') {
      if (!target.admin_note) {
        await sendEphemeralTopicNotice(
          message,
          '📝 当前没有备注可删除。',
          env,
          ctx
        );

        return true;
      }

      await dbUserUpdate(
        userId,
        { admin_note: '' },
        env
      );

      await refreshCardAfterNoteChange(
        userId,
        env
      );

      await sendEphemeralTopicNotice(
        message,
        '🗑 备注已删除。',
        env,
        ctx
      );

      return true;
    }

    const noteText = parsed.argument;

    if (!noteText) {
      await sendEphemeralTopicNotice(
        message,
        target.admin_note
          ? `📝 当前备注：\n${target.admin_note}`
          : '📝 当前暂无备注。\n' +
            '用法：/note 备注内容',
        env,
        ctx
      );

      return true;
    }

    if (noteText.length > 500) {
      await sendTopicNotice(
        message,
        '⚠️ 备注太长（上限 500 字），未保存。',
        env
      );

      return 'keep';
    }

    await dbUserUpdate(
      userId,
      { admin_note: noteText },
      env
    );

    await refreshCardAfterNoteChange(
      userId,
      env
    );

    await sendEphemeralTopicNotice(
      message,
      '📝 备注已保存。',
      env,
      ctx
    );

    return true;
  }

  if (parsed.command === 'ban') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/ban 访客ID',
        env
      );

      return true;
    }

    const user =
      await dbUserGetOrCreate(
        userId,
        env
      );

    await dbUserUpdate(
      userId,
      {
        is_blocked: true
      },
      env
    );

    await sendEphemeralTopicNotice(
      message,
      `🚫 已封禁访客 ${userId}。`,
      env,
      ctx
    );

    if (!user.is_blocked) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: userId,
            text:
              '⚠️ 您已被管理员封禁，' +
              '无法继续发送消息。'
          }
        );
      } catch (error) {
        console.error(
          '发送封禁通知失败：',
          error?.message || error
        );
      }
    }

    return true;
  }

  if (parsed.command === 'unban') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/unban 访客ID',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      {
        is_blocked: false,
        block_count: 0
      },
      env
    );

    await sendEphemeralTopicNotice(
      message,
      `✅ 已解除访客 ${userId} 的封禁。`,
      env,
      ctx
    );

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: userId,
          text:
            '✅ 管理员已解除对您的封禁，' +
            '现在可以继续发送消息。'
        }
      );
    } catch (error) {
      console.error(
        '发送解禁通知失败：',
        error?.message || error
      );
    }

    return true;
  }

  if (parsed.command === 'delete') {
    const repliedMessage =
      message.reply_to_message;

    if (!repliedMessage?.message_id) {
      await sendTopicNotice(
        message,
        '⚠️ 请先回复要删除的消息，再发送 /delete。',
        env
      );

      return true;
    }

    let deletedPair = null;

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id:
            repliedMessage.message_id
        }
      );

      deletedPair =
        await tombstoneTopicMessage(
          repliedMessage.message_id,
          env
        );

      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id:
            message.message_id
        }
      );
    } catch (error) {
      await sendTopicNotice(
        message,
        `❌ 删除消息失败：` +
        `${error?.message || error}`,
        env
      );
    }

    // 连带删除访客私聊中的原消息（存在配对时）：
    // 访客已自行删除（not found）视为已删、不提示；
    // 其余失败（如消息超过 48 小时、机器人被拉黑）
    // 在话题里留一行说明，话题侧删除结果不变。
    if (deletedPair) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'deleteMessage',
          {
            chat_id: deletedPair.userId,
            message_id:
              Number(
                deletedPair.privateMessageId
              )
          }
        );
      } catch (error) {
        const reason =
          error?.message || String(error);

        if (!/not found/i.test(reason)) {
          await sendTopicNotice(
            message,
            '⚠️ 话题侧已删除，但访客私聊中的' +
              `原消息删除失败：${reason}`,
            env
          );
        }
      }
    }

    return true;
  }
  if (parsed.command === 'clear') {
    // 整段清空连访客私聊副本一并删除、不可恢复，
    // 与服务熔断同口径：仅主管理员可操作。
    if (!isPrimaryAdmin(senderId, env)) {
      await sendTopicNotice(
        message,
        '⛔ 整段对话清空仅主管理员可操作。',
        env
      );

      return true;
    }

    const userId =
      await resolveTopicUserId(
        message,
        env
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。',
        env
      );

      return true;
    }

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(topicId),
        text:
          `🧹 确认清空与访客 ${userId} 的全部聊天记录？\n` +
          '将删除：话题内的全部转发副本、访客私聊中的全部聊天副本，以及全部消息配对记录。\n' +
          '注意：私聊里 48 小时前的消息删不掉，执行后会报告条数。\n' +
          '话题本身和访客档案保留，对方之后仍可继续聊天。',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🧹 确认清空',
                callback_data:
                  `clear:yes:${userId}`
              },
              {
                text: '取消',
                callback_data:
                  `clear:no:${userId}`
              }
            ]
          ]
        }
      }
    );

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      message.message_id
    );

    return true;
  }

if (parsed.command === 'card') {
  const userId =
    await resolveTopicUserId(
      message,
      env,
      parsed.argument
    );

  if (!userId) {
    await sendTopicNotice(
      message,
      '❌ 找不到当前话题对应的访客 ID。\n' +
      '映射丢失时可以使用：/card 访客ID',
      env
    );

    return true;
  }

  try {
    await dbUserGetOrCreate(userId, env);

    // 指定访客 ID 时，将当前话题重新绑定给该访客。
    if (parsed.argument) {
      await env.TG_BOT_DB.prepare(`
        UPDATE users
        SET
          topic_id = NULL,
          info_card_message_id = NULL,
          topic_creating = 0,
          topic_lock_at = NULL,
          updated_at = ?
        WHERE topic_id = ?
          AND user_id <> ?
      `).bind(
        Math.floor(Date.now() / 1000),
        topicId,
        String(userId)
      ).run();

      await dbUserUpdate(
        userId,
        {
          topic_id: topicId,
          topic_creating: false,
          topic_lock_at: null
        },
        env
      );
    }

    await recreateUserInfoCard(
      userId,
      topicId,
      env
    );

    await sendEphemeralTopicNotice(
      message,
      `✅ 访客 ${userId} 的资料卡已重新创建。`,
      env,
      ctx
    );
  } catch (error) {
    console.error(
      `重建访客 ${userId} 的资料卡失败：`,
      error?.stack ||
      error?.message ||
      error
    );

    await sendTopicNotice(
      message,
      `❌ 重新创建资料卡失败：` +
      `${error?.message || error}`,
      env
    );
  }

  return true;
}

  if (parsed.command === 'terminate') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/terminate 访客ID',
        env
      );

      return true;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id:
            Number(topicId)
        }
      );

      await dbUserUpdate(
        userId,
        {
          topic_id: null,
          info_card_message_id: null,
          topic_creating: false,
          topic_lock_at: null
        },
        env
      );
    } catch (error) {
      await sendTopicNotice(
        message,
        `❌ 删除话题失败：` +
        `${error?.message || error}`,
        env
      );
    }

    return true;
  }

  return false;
}

async function handleAdminReply(
  message,
  env,
  ctx = null
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

  // 以频道身份发帖等场景下消息可能没有 from：
  // 无从核验发送者身份，直接忽略（避免后面解引用抛错）。
  if (!message.from) {
    return;
  }

  // 话题服务消息（关闭/重开/改名/置顶通知等）不是管理员的
  // 回复内容，且 Telegram 不允许复制，直接忽略，
  // 避免误报「转发失败」。
  if (
    message.forum_topic_created ||
    message.forum_topic_edited ||
    message.forum_topic_closed ||
    message.forum_topic_reopened ||
    message.general_forum_topic_hidden ||
    message.general_forum_topic_unhidden ||
    message.pinned_message
  ) {
    return;
  }

  const senderId =
    String(message.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
  return;
}

if (
  message.text &&
  message.text.trim().startsWith('/')
) {
  // 命令带了 @ 后缀且不是本机器人：是发给别的机器人的，
  // 完全忽略（不执行、不提示、不撤回、也不转发给访客）。
  const parsedForTarget =
    parseAdminCommand(message.text);

  if (parsedForTarget?.suffix) {
    const botUsername =
      await getBotUsername(env);

    if (
      botUsername &&
      parsedForTarget.suffix.toLowerCase() !==
        botUsername.toLowerCase()
    ) {
      return;
    }
  }

  const handled =
    await handleAdminCommand(
      message,
      env,
      ctx
    );

  if (handled) {
    // 命令已处理：把管理员发出的命令消息本身也撤回，
    // 话题里只留短暂显示的回执、不留命令原文。
    // （/clear 分支已先行删除，这里重复删会静默跳过。）
    // 例外：handled === 'keep' 表示处理未成功且命令原文
    // 本身是内容载体（如 /note 保存失败），保留原文，
    // 管理员还能照着改了重发。
    if (handled !== 'keep') {
      await quietDeleteMessage(
        env,
        env.ADMIN_GROUP_ID,
        message.message_id
      );
    }

    return;
  }

  // 形如命令但不在白名单里：多半是打错或已下线的命令，
  // 提示管理员并吞掉，不要转发给访客。
  const parsedUnknown =
    parseAdminCommand(message.text);

  if (parsedUnknown) {
    await sendEphemeralTopicNotice(
      message,
      `⚠️ 未识别的命令 /${parsedUnknown.command}，未转发给访客。`,
      env,
      ctx
    );

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      message.message_id
    );

    return;
  }
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
          '❌ 找不到该话题对应的访客 ID，无法转发消息。'
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

    // 改版：只写空正文的路由行，供管理员编辑事件定位目标访客，
    // 不保存消息正文（正文只存在于 Telegram）。
    await dbMessageDataPut(
      userId,
      getMessageStorageKey(
        'admin',
        message.message_id
      ),
      {
        text: '',
        date: message.date
      },
      env
    );
  } catch (error) {
    console.error(
      '管理员消息转发失败：',
      error?.message || error
    );

    if (isBotBlockedError(error)) {
      const wasFlagged =
        (await dbConfigGet(
          `botblocked:${userId}`,
          env
        )) === '1';

      await noteBotBlocked(userId, env);

      if (wasFlagged) {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id:
              Number(topicId),
            text:
              '❌ 对方已拉黑机器人，' +
              '这条消息未能送达。'
          }
        );
      }

      return;
    }

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        text:
          `❌ 转发消息给访客 ${userId} 失败：` +
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

  const filterResult = user.relay_exempt
    ? { ok: true }
    : await checkForwardFilters(
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

  const notificationText = `
⚠️ <b>访客消息已修改</b>

<b>原消息发送时间：</b>
<code>${escapeHtml(originalDate)}</code>

<b>原始内容：</b>
${escapeHtml(originalText)}

<b>修改后的内容：</b>
${escapeHtml(newContent)}
  `.trim();

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `p:${userId}:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退通知。
  if (pair?.text === 'gone') {
    return;
  }

  let editedInPlace = false;

  if (pair?.text) {
    editedInPlace =
      await tryEditCounterpartMessage(
        env,
        env.ADMIN_GROUP_ID,
        pair.text,
        editedMessage
      );
  }

  if (editedInPlace) {
    const hintKey =
      `hint:p:${userId}:` +
      `${editedMessage.message_id}`;

    await replaceEditHint(env, {
      chatId: env.ADMIN_GROUP_ID,
      threadId: Number(user.topic_id),
      replyToMessageId: Number(pair.text),
      hintKey
    });

    try {
      await maybeAutoRefreshUserCard(
        editedMessage,
        env
      );
    } catch (error) {
      console.error(
        '自动刷新资料卡失败：',
        error?.message || error
      );
    }

    return;
  }

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
      '处理访客编辑消息失败：',
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
${escapeHtml(stored.text || '[原始内容未保存]')}

<b>新消息内容：</b>
${escapeHtml(newText)}
  `.trim();

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `t:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退通知。
  if (pair?.text === 'gone') {
    return;
  }

  let editedInPlace = false;
  let counterpartId = null;

  if (pair?.text) {
    const separator =
      pair.text.indexOf(':');

    if (
      separator > 0 &&
      pair.text.slice(0, separator) ===
        String(userId)
    ) {
      counterpartId =
        pair.text.slice(separator + 1);

      editedInPlace =
        await tryEditCounterpartMessage(
          env,
          userId,
          counterpartId,
          editedMessage
        );
    }
  }

  if (editedInPlace) {
    const hintKey =
      `hint:t:${editedMessage.message_id}`;

    await replaceEditHint(env, {
      chatId: userId,
      replyToMessageId: Number(counterpartId),
      hintKey
    });

    return;
  }

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
    'refresh_card',
    'trust',
    'untrust',
    'exempt',
    'unexempt'
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

  if (await isAdminUser(targetUserId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '不能对管理员账号执行此操作。',
      true
    );

    return;
  }

  let user =
    await dbUserGet(
      targetUserId,
      env
    );

  if (!user) {
    await answerCallback(
      callbackQuery.id,
      env,
      '无效操作。',
      true
    );

    return;
  }

  if (
    action === 'trust' ||
    action === 'untrust'
  ) {
    // 信任 = 直接放行进门，仅主管理员可操作
    // （与 /clear、服务熔断的权限口径一致）。
    if (
      !isPrimaryAdmin(callbackQuery.from?.id, env)
    ) {
      await answerCallback(
        callbackQuery.id,
        env,
        '⛔ 信任设置仅主管理员可操作。',
        true
      );

      return;
    }

    if (action === 'untrust') {
      await dbUserUpdate(
        targetUserId,
        { is_trusted: 0 },
        env
      );
    } else {
      if (user.is_blocked) {
        await answerCallback(
          callbackQuery.id,
          env,
          '对方已被封禁，请先解封再设为信任。',
          true
        );

        return;
      }

      if (user.user_state === USER_STATE.VERIFIED) {
        // 已是已验证状态：只补信任标记，不再重复发成功提示、
        // 也不顶掉既有的验证回执槽。
        await dbUserUpdate(
          targetUserId,
          { is_trusted: 1 },
          env
        );
      } else {
        await dbUserUpdate(
          targetUserId,
          {
            is_trusted: 1,
            user_state: USER_STATE.VERIFIED
          },
          env
        );

        await cleanupAfterVerified(env, targetUserId);

        try {
          const successSent = await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: targetUserId,
              text: await getConfig(
                'verify_success_text',
                env
              )
            }
          );

          await trackSlotMessage(
            env,
            targetUserId,
            'receipt_msg_id',
            successSent?.message_id
          );
        } catch (error) {
          console.error(
            '发送信任验证成功提示失败：',
            error?.message || error
          );
        }
      }
    }

    user = await dbUserGetOrCreate(
      targetUserId,
      env
    );

    const usernameRaw2 =
      user.user_info?.username_raw || '';

    await telegramApi(
      env.BOT_TOKEN,
      'editMessageReplyMarkup',
      {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: getInfoCardButtons(
          targetUserId,
          user.is_blocked,
          user.is_muted,
          usernameRaw2,
          user.is_trusted,
          user.relay_exempt
        )
      }
    );

    await answerCallback(
      callbackQuery.id,
      env,
      action === 'trust'
        ? '🤝 已设为信任，该访客已通过验证。'
        : '↩️ 已取消信任（当前验证状态不变）。'
    );

    return;
  }

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

      if (!result.updated) {
        if (result.reason === 'missing_card') {
          tip = '⚠️ 找不到资料卡消息。';
        } else if (
          result.reason === 'not_modified'
        ) {
          tip = '✅ 资料卡已是最新，无需刷新。';
        }
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

    if (
      action === 'exempt' ||
      action === 'unexempt'
    ) {
      // 放行会绕过转发限流与类型过滤两道保护，与信任同级，
      // 只允许主管理员操作（网页列表那条路径同样强制主管理员）。
      if (
        !isPrimaryAdmin(
          callbackQuery.from?.id,
          env
        )
      ) {
        await telegramApi(
          env.BOT_TOKEN,
          'answerCallbackQuery',
          {
            callback_query_id:
              callbackQuery.id,
            text: '放行设置仅主管理员可操作',
            show_alert: true
          }
        );

        return;
      }

      await dbUserUpdate(
        targetUserId,
        {
          relay_exempt:
            action === 'exempt'
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
            usernameRaw,
            user.is_trusted,
            user.relay_exempt
          )
      }
    );

    let toast = '✅ 操作成功。';

    if (action === 'block') {
      toast = '🚫 已屏蔽该访客。';
    }

    if (action === 'unblock') {
      toast = '✅ 已解除屏蔽。';
    }

    if (action === 'exempt') {
      toast = '🕊 已设为放行（免限流与类型过滤）。';
    }

    if (action === 'unexempt') {
      toast = '↩️ 已取消放行。';
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
  env,
  origin = ''
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

  if (data === 'menu:main') {
    await answerCallback(
      callbackQuery.id,
      env
    );

    await showMainMenu(
      String(callbackQuery.from.id),
      env,
      callbackQuery.message?.message_id || 0,
      0,
      origin
    );

    return;
  }

  if (data.startsWith('config:')) {
    // 配置菜单已迁移到网页管理台，
    // 旧消息上的按钮只回一条迁移提示。
    await answerCallback(
      callbackQuery.id,
      env,
      '⚙️ 配置已迁移到网页管理台，请回主菜单打开。',
      true
    );

    return;
  }

  if (data.startsWith('pause:')) {
    await handlePauseCallback(
      callbackQuery,
      env,
      origin
    );

    return;
  }

  if (data.startsWith('clear:')) {
    await handleClearCallback(
      callbackQuery,
      env
    );

    return;
  }

  if (data.startsWith('updchk:')) {
    await handleUpdateCheckCallback(
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

/* -------------------------------------------------------------------------- */
/*                         拉黑 / 解除拉黑提醒（改版新增）                        */
/* -------------------------------------------------------------------------- */

function isBotBlockedError(error) {
  return /blocked by the user/i.test(
    String(error?.message || error)
  );
}

async function noteBotBlocked(userId, env) {
  const flagKey = `botblocked:${userId}`;

  // 原子占用：my_chat_member 与发送失败兜底两条触发路径
  // 并发命中时，只让先占用成功的一方发提醒。
  const claimed = await dbConfigClaim(
    flagKey,
    '1',
    env
  );

  if (!claimed) {
    return;
  }

  const user =
    await dbUserGetOrCreate(userId, env);

  if (user.is_blocked || !user.topic_id) {
    return;
  }

  if (
    (await getConfig(
      'block_notice_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  let sent = null;

  try {
    sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: await textConfig('block_notice_text', env)
      }
    );
  } catch (error) {
    console.error(
      '发送拉黑提醒失败：',
      error?.message || error
    );
  }

  // 记下这条 🚫 提醒的编号：对方解除拉黑、发出 ✅ 提醒时把它一并删掉。
  if (sent?.message_id) {
    await dbConfigPut(
      `blocknotice:${userId}`,
      String(sent.message_id),
      env
    );

    // 竞态收尾：记账期间对方若已解除拉黑（解除侧先跑完、
    // 没读到这条记账），这条 🚫 已不是最新状态——
    // 自行删掉并清记账，免得话题里留下一条永远
    // 没人删的过期拉黑提醒（拉黑标记已被解除侧删走
    // 是判据：标记还在说明仍处于拉黑状态）。
    if (
      (await dbConfigGet(flagKey, env)) !== '1'
    ) {
      await quietDeleteMessage(
        env,
        env.ADMIN_GROUP_ID,
        sent.message_id
      );

      await dbConfigDelete(
        `blocknotice:${userId}`,
        env
      );
    }
  }
}

async function noteBotUnblocked(
  userId,
  env
) {
  const flagKey = `botblocked:${userId}`;

  if (
    (await dbConfigGet(flagKey, env)) !==
    '1'
  ) {
    return;
  }

  await dbConfigDelete(flagKey, env);

  const user =
    await dbUserGetOrCreate(userId, env);

  if (user.is_blocked || !user.topic_id) {
    // 不发 ✅ 的场合记账也没有意义了，一并清掉：
    // 残留的旧消息号日后可能被当成删除指针误用。
    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );

    return;
  }

  // 先清旧 🚫：开关只管「发不发新提醒」，过时状态不能因为
  // 开关关着就永远挂在话题里（原先联动删除排在发送之后，关开关时被一并跳过）。
  const storedNotice = await dbConfigGet(
    `blocknotice:${userId}`,
    env
  );

  if (
    storedNotice &&
    (await dbConfigGet(flagKey, env)) !== '1'
  ) {
    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      storedNotice
    );

    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );
  }

  if (
    (await getConfig(
      'block_notice_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  let sent = null;

  try {
    sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: await textConfig('unblock_notice_text', env)
      }
    );
  } catch (error) {
    console.error(
      '发送解除拉黑提醒失败：',
      error?.message || error
    );
  }

  void sent;
}

async function handleMyChatMember(
  chatMember,
  env
) {
  if (
    !chatMember ||
    chatMember.chat?.type !== 'private'
  ) {
    return;
  }

  const userId = String(chatMember.chat.id);

  if (await isAdminUser(userId, env)) {
    return;
  }

  const oldStatus =
    chatMember.old_chat_member?.status;

  const newStatus =
    chatMember.new_chat_member?.status;

  if (
    newStatus === 'kicked' &&
    oldStatus !== 'kicked'
  ) {
    await noteBotBlocked(userId, env);
  } else if (
    oldStatus === 'kicked' &&
    newStatus === 'member'
  ) {
    await noteBotUnblocked(userId, env);
  }
}

// 整段对话清空：按 rxmap 配对收集一位访客在私聊与话题两侧的全部消息编号
// （含 ✏️ 编辑提示消息），供批量删除使用。配对值 'gone'（已单独删除的墓碑）跳过。
async function collectConversationMessageIds(
  userId,
  env
) {
  const pairRows = await env.TG_BOT_DB.prepare(
    'SELECT message_id, text FROM messages ' +
    'WHERE user_id = ? AND (message_id LIKE ? ' +
    'OR (message_id LIKE ? AND text LIKE ?))'
  ).bind(
    REACTION_MAP_USER,
    `p:${userId}:%`,
    't:%',
    `${userId}:%`
  ).all();

  const privateIds = new Set();
  const topicIds = new Set();
  const pairKeys = [];

  for (const row of pairRows.results || []) {
    const mid = String(row.message_id || '');
    const text = String(row.text || '');

    // 配对行（含墓碑）的键先记下：清空收尾只删这份
    // 快照里的行，清空期间新到的消息不在快照内。
    pairKeys.push(mid);

    if (text === 'gone') {
      continue;
    }

    if (mid.startsWith(`p:${userId}:`)) {
      const priv = Number(
        mid.slice(`p:${userId}:`.length)
      );
      const topic = Number(text);

      if (priv) privateIds.add(priv);
      if (topic) topicIds.add(topic);
    } else if (mid.startsWith('t:')) {
      const topic = Number(mid.slice(2));
      const priv = Number(text.split(':')[1]);

      if (topic) topicIds.add(topic);
      if (priv) privateIds.add(priv);
    }
  }

  const hintRows = await env.TG_BOT_DB.prepare(
    'SELECT message_id, text FROM messages ' +
    'WHERE user_id = ? AND message_id LIKE ?'
  ).bind(
    REACTION_MAP_USER,
    `hint:p:${userId}:%`
  ).all();

  const hintKeys = [];

  for (const row of hintRows.results || []) {
    hintKeys.push(String(row.message_id || ''));

    const hid = Number(row.text);

    if (hid) topicIds.add(hid);
  }

  // hint:t: 改按 100 条分块 IN 查询：逐条点读在长对话
  // 下要串行上千次；顺手把键记进 hintKeys 供收尾删除。
  const topicIdList = [...topicIds];

  for (let i = 0; i < topicIdList.length; i += 100) {
    const chunk = topicIdList.slice(i, i + 100);
    const keys = chunk.map(
      (topicId) => `hint:t:${topicId}`
    );

    hintKeys.push(...keys);

    const placeholders = keys
      .map(() => '?')
      .join(', ');

    const hintTRows = await env.TG_BOT_DB.prepare(
      'SELECT message_id, text FROM messages ' +
      'WHERE user_id = ? AND message_id IN (' +
      placeholders +
      ')'
    ).bind(REACTION_MAP_USER, ...keys).all();

    for (const row of hintTRows.results || []) {
      const hid = Number(row.text);

      if (hid) privateIds.add(hid);
    }
  }

  return {
    privateIds: [...privateIds],
    topicIds: [...topicIds],
    pairKeys,
    hintKeys
  };
}

// 批量删除并计数：整批失败时退回逐条删，
// 「消息不存在」按既有口径视为已删。
async function deleteMessagesCounted(
  env,
  chatId,
  ids
) {
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessages',
        {
          chat_id: chatId,
          message_ids: chunk
        }
      );

      ok += chunk.length;
    } catch {
      for (const id of chunk) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'deleteMessage',
            {
              chat_id: chatId,
              message_id: id
            }
          );

          ok += 1;
        } catch (error) {
          if (
            /not found/i.test(
              String(error?.message || error)
            )
          ) {
            ok += 1;
          } else {
            failed += 1;
          }
        }
      }
    }
  }

  return { ok, failed };
}

// 清空执行体：删私聊副本（必做）+ 话题内副本（可选），
// 然后删掉该访客的全部配对与提示记账行。
async function wipeConversationCopies(
  userId,
  env,
  includeTopicContents
) {
  const { privateIds, topicIds, pairKeys, hintKeys } =
    await collectConversationMessageIds(
      userId,
      env
    );

  const priv = await deleteMessagesCounted(
    env,
    userId,
    privateIds
  );

  let topic = { ok: 0, failed: 0 };

  if (includeTopicContents) {
    topic = await deleteMessagesCounted(
      env,
      env.ADMIN_GROUP_ID,
      topicIds
    );
  }

  // 收尾只删收集快照里的配对/提示行（按 100 条分块
  // batch）：此前按前缀无条件删，清空期间新到的消息
  // 配对会被误扫、副本成孤儿；快照之外的行一律不碰。
  const recordKeys = [...pairKeys, ...hintKeys];

  for (let i = 0; i < recordKeys.length; i += 100) {
    const chunk = recordKeys.slice(i, i + 100);

    await env.TG_BOT_DB.batch(
      chunk.map((key) =>
        messageDataDeleteStatement(
          REACTION_MAP_USER,
          key,
          env
        )
      )
    );
  }

  return { private: priv, topic };
}

// /clear 的确认按钮回调：clear:yes:<访客ID> / clear:no:<访客ID>。
async function handleClearCallback(
  callbackQuery,
  env
) {
  const data = String(callbackQuery.data || '');
  const parts = data.split(':');
  const action = parts[1];
  const userId = parts[2] || '';

  const clickerId = String(
    callbackQuery.from?.id || ''
  );

  if (!/^\d{1,20}$/.test(userId)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '参数错误。',
      true
    );

    return;
  }

  if (
    !userId ||
    !(await isAdminUser(clickerId, env))
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '无权操作。',
      true
    );

    return;
  }

  const msg = callbackQuery.message || {};
  const chatId = msg.chat?.id;
  const threadId = msg.message_thread_id;

  const editConfirm = async (text) => {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          text
        }
      );
    } catch {
      /* 确认消息已被删时忽略 */
    }
  };

  if (action === 'no') {
    await answerCallback(callbackQuery.id, env);

    await editConfirm('🚫 已取消清空，聊天记录未动。');

    return;
  }

  if (action !== 'yes') {
    return;
  }

  // 执行侧再验一次主管理员（发命令时验过，
  // 点确认的未必是同一人）。
  if (!isPrimaryAdmin(clickerId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '整段对话清空仅主管理员可操作。',
      true
    );

    return;
  }

  // 只读校验：访客记录已被删时不要先把空行建回来。
  const target =
    await dbUserGet(userId, env);

  if (!target) {
    await answerCallback(
      callbackQuery.id,
      env,
      '访客记录已不存在。',
      true
    );

    return;
  }

  if (
    !target.topic_id ||
    String(target.topic_id) !== String(threadId)
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '该话题已不属于这位访客。',
      true
    );

    return;
  }

  // 防重复执行：拿确认消息编号做原子占用——同一条
  // 确认被点两次（双击、并发回调）时只有第一个占得上，
  // 后来的直接拒绝，避免两遍清空互相覆盖计数报告、
  // 白烧调用。占用不释放：新一条 /clear 的确认编号
  // 不同，照常能占上、正常执行。
  const claimWon = await dbConfigClaim(
    `clearrun:${userId}`,
    `m:${msg.message_id || 0}`,
    env
  );

  if (!claimWon) {
    await answerCallback(
      callbackQuery.id,
      env,
      '这条确认已在执行或已执行过，请勿重复点击。',
      true
    );

    return;
  }

  await answerCallback(
    callbackQuery.id,
    env,
    '正在清空…'
  );

  const wipe = await wipeConversationCopies(
    userId,
    env,
    true
  );

  const lines = [
    `🧹 已清空与访客 ${userId} 的聊天记录：`,
    `· 话题内删除 ${wipe.topic.ok} 条` +
      (wipe.topic.failed
        ? `，${wipe.topic.failed} 条删除失败`
        : ''),
    `· 私聊删除 ${wipe.private.ok} 条` +
      (wipe.private.failed
        ? `，${wipe.private.failed} 条删不掉（多为超过 48 小时）`
        : ''),
    '话题与访客档案已保留，对方之后仍可继续聊天。'
  ];

  await editConfirm(lines.join('\n'));
}

async function purgeManagedUser(
  userId,
  deleteTopic,
  env
) {
  const user =
    await dbUserGetOrCreate(userId, env);

  let topicDeleted = false;

  if (deleteTopic && user.topic_id) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id:
            Number(user.topic_id)
        }
      );

      topicDeleted = true;
    } catch (error) {
      console.error(
        '删除话题失败（继续删记录）：',
        error?.message || error
      );
    }
  }

  // 连带作废未用通行证（删记录并删证消息），防删档后凭旧证复活。
  await voidUserPass(env, userId);

  // 拉黑提醒记账一并清理：话题还在时先删那条 🚫，
  // 再删记账行，免得残留编号日后被误当删除指针。
  const staleBlockNotice =
    await dbConfigGet(
      `blocknotice:${userId}`,
      env
    );

  if (staleBlockNotice && user.topic_id) {
    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      staleBlockNotice
    );
  }

  await dbConfigDelete(
    `blocknotice:${userId}`,
    env
  );

  await env.TG_BOT_DB.batch([
    env.TG_BOT_DB.prepare(
      'DELETE FROM messages WHERE user_id = ?'
    ).bind(userId),

    env.TG_BOT_DB.prepare(
      'DELETE FROM users WHERE user_id = ?'
    ).bind(userId),

    env.TG_BOT_DB.prepare(
      'DELETE FROM messages ' +
      'WHERE user_id = ? ' +
      'AND (message_id LIKE ? OR ' +
      '(message_id LIKE ? AND text LIKE ?))'
    ).bind(
      REACTION_MAP_USER,
      `p:${userId}:%`,
      't:%',
      `${userId}:%`
    )
  ]);

  await dbConfigDelete(
    `botblocked:${userId}`,
    env
  );

  await dbConfigDelete(
    `pausenote:${userId}`,
    env
  );

  await dbConfigDelete(
    `pausemsg:${userId}`,
    env
  );

  await dbConfigDelete(
    `promptat:${userId}`,
    env
  );

  return topicDeleted;
}

/* -------------------------------------------------------------------------- */
/*                         自动检查更新（改版新增）                             */
/* -------------------------------------------------------------------------- */

const BOT_VERSION = 'v1.2.3';
const UPDATE_REPO = 'realadmin/TGbot-D1';
const UPDATE_CACHE_KEY = 'sys:latest-release';
const UPDATE_NOTIFIED_KEY = 'sys:update-notified';
const UPDATE_FRESH_MS = 6 * 60 * 60 * 1000;
const UPDATE_NEGATIVE_MS = 30 * 60 * 1000;
const UPDATE_MANUAL_FLOOR_MS = 5 * 60 * 1000;

function compareVersions(a, b) {
  const parse = (value) =>
    String(value || '')
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);

    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

async function readUpdateCache(env) {
  const raw =
    await dbConfigGet(UPDATE_CACHE_KEY, env);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function fetchLatestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tgbotd1-update-check'
      },
      signal: AbortSignal.timeout(8000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}`
    );
  }

  const data = await response.json();

  if (!data?.tag_name) {
    throw new Error('GitHub 返回缺少 tag_name');
  }

  const rawUrl = String(data.html_url || '');

  return {
    tag: String(data.tag_name),
    url: rawUrl.startsWith('https://github.com/')
      ? rawUrl
      : `https://github.com/${UPDATE_REPO}/releases`,
    name: String(data.name || data.tag_name)
  };
}

async function checkForUpdates(env, force = false) {
  const now = Date.now();
  const cache = await readUpdateCache(env);

  if (cache?.lastAttempt) {
    const floor = force
      ? UPDATE_MANUAL_FLOOR_MS
      : cache.lastOk
        ? UPDATE_FRESH_MS
        : UPDATE_NEGATIVE_MS;

    if (now - cache.lastAttempt < floor) {
      return cache;
    }
  }

  let next;

  try {
    const release = await fetchLatestRelease();

    next = {
      tag: release.tag,
      url: release.url,
      name: release.name,
      checkedAt: now,
      lastAttempt: now,
      lastOk: true
    };
  } catch (error) {
    console.error(
      '检查更新失败：',
      error?.message || error
    );

    // 已有新鲜的成功结果时，失败不覆盖它，
    // 免得菜单在接下来一段时间里误报失败/过期。
    if (
      cache?.lastOk &&
      cache.checkedAt &&
      now - cache.checkedAt < UPDATE_FRESH_MS
    ) {
      return cache;
    }

    next = {
      tag: cache?.tag || null,
      url: cache?.url || null,
      name: cache?.name || null,
      checkedAt: cache?.checkedAt || 0,
      lastAttempt: now,
      lastOk: false
    };
  }

  await dbConfigPut(
    UPDATE_CACHE_KEY,
    JSON.stringify(next),
    env
  );

  if (
    next.lastOk &&
    next.tag &&
    compareVersions(next.tag, BOT_VERSION) > 0
  ) {
    // 先原子占用通知名额再发送，避免并发检查重复通知；
    // 若一个管理员都没送达，释放名额留待下次重试。
    const claimed = await dbConfigClaim(
      UPDATE_NOTIFIED_KEY,
      next.tag,
      env
    );

    if (claimed) {
      let delivered = 0;

      for (const adminId of
        getPrimaryAdminIds(env)) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: adminId,
              text:
                '🆕 <b>机器人有新版本可用</b>\n\n' +
                `当前版本：${BOT_VERSION}\n` +
                `最新版本：<a href="${escapeHtml(next.url)}">${escapeHtml(next.tag)}</a>\n\n` +
                '到 GitHub 仓库的 Release 页下载新版代码，' +
                '粘贴到 Worker 里部署即可（与平时部署方法相同）。',
              parse_mode: 'HTML',
              disable_web_page_preview: true
            }
          );

          delivered += 1;
        } catch (error) {
          console.error(
            '发送更新通知失败：',
            error?.message || error
          );
        }
      }

      if (delivered === 0) {
        await dbConfigDelete(
          UPDATE_NOTIFIED_KEY,
          env
        );
      }
    }
  }

  return next;
}

async function maybeCheckForUpdates(env) {
  try {
    await checkForUpdates(env);
  } catch (error) {
    console.error(
      '自动检查更新异常：',
      error?.message || error
    );
  }
}

function describeUpdateState(cache) {
  if (!cache || !cache.tag) {
    return {
      status: cache ? 'failed' : 'unknown',
      line: '最新版本：未知（尚无成功检查记录）'
    };
  }

  const timeText = cache.checkedAt
    ? formatTimestamp(
        Math.floor(cache.checkedAt / 1000)
      )
    : '未知';

  if (compareVersions(cache.tag, BOT_VERSION) > 0) {
    return {
      status: 'update',
      line:
        `最新版本：${cache.tag}（🆕 有更新，上次成功检查：${timeText}）`
    };
  }

  if (!cache.lastOk) {
    return {
      status: 'stale',
      line:
        `最新版本：${cache.tag}（已是最新，上次成功检查：${timeText}；最近一次检查失败，显示上次结果）`
    };
  }

  return {
    status: 'current',
    line:
      `最新版本：${cache.tag}（已是最新，上次成功检查：${timeText}）`
  };
}

async function handlePauseCallback(
  callbackQuery,
  env,
  origin = ''
) {
  const senderId = String(callbackQuery.from.id);
  const callbackId = callbackQuery.id;
  const messageId =
    callbackQuery.message?.message_id || 0;
  const data = String(callbackQuery.data || '');

  if (!isPrimaryAdmin(senderId, env)) {
    await answerCallback(
      callbackId,
      env,
      '⚠️ 服务熔断开关仅主管理员可操作。',
      true
    );

    return;
  }

  if (data === 'pause:menu') {
    await answerCallback(callbackId, env);

    await renderMenu(env, {
      chatId: senderId,
      messageId,
      text:
        '⏸ <b>服务熔断</b>\n\n' +
        '选择暂停时长。暂停期间访客新发的消息' +
        '会被删除（对已送达消息的编辑与反应照常同步，管理员不受影响），到期自动恢复，' +
        '也可随时在主菜单或用 /resume 提前恢复。\n' +
        'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '30 分钟',
              callback_data: 'pause:for:30'
            },
            {
              text: '60 分钟',
              callback_data: 'pause:for:60'
            }
          ],
          [
            {
              text: '4 小时',
              callback_data: 'pause:for:240'
            },
            {
              text: '24 小时',
              callback_data: 'pause:for:1440'
            }
          ],
          [
            {
              text: '↩️ 返回主菜单',
              callback_data: 'menu:main'
            }
          ]
        ]
      }
    });

    return;
  }

  if (data.startsWith('pause:for:')) {
    const minutes = Number(
      data.slice('pause:for:'.length)
    );

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      await answerCallback(
        callbackId,
        env,
        '时长无效。',
        true
      );

      return;
    }

    const state = await performPause(
      env,
      minutes,
      senderId
    );

    await answerCallback(
      callbackId,
      env,
      `⏸ 已暂停，${describePauseRemaining(state)}`
    );

    await showMainMenu(senderId, env, messageId, 0, origin);

    return;
  }

  if (data === 'pause:resume') {
    await performResume(env, senderId);

    await answerCallback(
      callbackId,
      env,
      '▶️ 已恢复服务'
    );

    await showMainMenu(senderId, env, messageId, 0, origin);

    return;
  }

  await answerCallback(callbackId, env);
}

async function handleUpdateCheckCallback(
  callbackQuery,
  env
) {
  const senderId =
    String(callbackQuery.from.id);

  if (!isPrimaryAdmin(senderId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '仅主管理员可执行此操作。',
      true
    );

    return;
  }

  const chatId =
    String(callbackQuery.message.chat.id);

  const messageId =
    callbackQuery.message.message_id;

  const before = await readUpdateCache(env);

  const state = await checkForUpdates(
    env,
    true
  );

  const throttled = Boolean(
    before &&
    state &&
    before.lastAttempt === state.lastAttempt
  );

  const described =
    describeUpdateState(state);

  let text =
    '🔄 <b>检查更新</b>\n\n' +
    `当前版本：${BOT_VERSION}\n` +
    escapeHtml(described.line);

  if (described.status === 'failed') {
    text +=
      '\n⚠️ 最近一次检查失败，请稍后再试。';
  }

  if (throttled) {
    text +=
      '\n（刚检查过不久，这是缓存结果；' +
      '手动检查最短间隔 5 分钟。）';
  }

  const keyboard = [];

  if (
    described.status === 'update' &&
    state?.url
  ) {
    keyboard.push([
      {
        text: '⬇️ 打开 Release 页',
        url: state.url
      }
    ]);
  }

  keyboard.push([
    {
      text: '🔄 再次检查',
      callback_data: 'updchk:check'
    }
  ]);

  keyboard.push([
    {
      text: '⬅️ 返回主菜单',
      callback_data: 'menu:main'
    }
  ]);

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                         网页版访客列表（改版新增）                           */
/* -------------------------------------------------------------------------- */

const USERLIST_LINK_TTL_MS = 30 * 60 * 1000;

// 签名链接按用途分权：访客列表（usrlist）/ 网页管理台（panel）/
// 新手引导（guide）三套签名互不通用——只读性质的引导链接
// 不再等于全权管理凭据，列表链接也改不了配置。
function panelScopeForPath(path) {
  if (path === '/panel') {
    return 'panel';
  }

  if (path === '/guide') {
    return 'guide';
  }

  return 'usrlist';
}

async function buildSignedPanelUrl(
  origin,
  adminId,
  env,
  path
) {
  const exp = Date.now() + USERLIST_LINK_TTL_MS;

  const signature = await hmacSha256Hex(
    linkSecret(env),
    `${panelScopeForPath(path)}:${adminId}:${exp}`
  );

  const params = new URLSearchParams({
    u: String(adminId),
    e: String(exp),
    s: signature
  });

  return `${origin}${path}?${params.toString()}`;
}

async function buildUserListUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/users'
  );
}

async function buildGuideUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/guide'
  );
}

async function checkUserListAuth(
  uid,
  expRaw,
  signature,
  env,
  scope = 'usrlist'
) {
  const id = String(uid || '');

  if (!/^\d{1,20}$/.test(id)) {
    return null;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (
    !Number.isFinite(exp) ||
    exp <= now ||
    exp > now + USERLIST_LINK_TTL_MS + 60 * 1000
  ) {
    return null;
  }

  const expected = await hmacSha256Hex(
    linkSecret(env),
    `${scope}:${id}:${exp}`
  );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return null;
  }

  if (!isPrimaryAdmin(id, env)) {
    return null;
  }

  return id;
}

async function panelQueryAdminId(
  request,
  env,
  scope = 'usrlist'
) {
  const url = new URL(request.url);

  return checkUserListAuth(
    url.searchParams.get('u'),
    url.searchParams.get('e'),
    url.searchParams.get('s'),
    env,
    scope
  );
}

async function signedPageResponse(
  request,
  env,
  builder,
  expiredText,
  scope = 'usrlist'
) {
  const adminId =
    await panelQueryAdminId(request, env, scope);

  if (!adminId) {
    return new Response(
      '<!doctype html><meta charset="utf-8">' +
      '<p style="font-family:sans-serif;padding:24px">' +
      expiredText +
      '</p>',
      {
        status: 403,
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      }
    );
  }

  return new Response(builder(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function parseUserInfoForList(user) {
  let name = '';
  let username = '';

  try {
    const info = JSON.parse(
      user.user_info_json || '{}'
    );

    name = String(
      info.name ||
      [info.first_name, info.last_name]
        .filter(Boolean)
        .join(' ') ||
      ''
    );

    username = String(
      info.username_raw || info.username || ''
    );

    if (username === '无') {
      username = '';
    }
  } catch (error) {
    name = '';
    username = '';
  }

  return { name, username };
}

async function handleUserListPage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildUserListPage,
    '链接无效或已过期，请回到机器人主菜单重新打开访客列表。'
  );
}

async function handleUserListApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const result = await env.TG_BOT_DB.prepare(
    'SELECT user_id, user_state, is_blocked, ' +
    'is_muted, is_trusted, relay_exempt, topic_id, ' +
    'created_at, updated_at, ' +
    'user_info_json, admin_note FROM users ' +
    'ORDER BY updated_at DESC LIMIT 1000'
  )
    .all();

  const rows = result?.results || [];

  const users = await Promise.all(
    rows
    .filter(
      (user) => !isPrimaryAdmin(user.user_id, env)
    )
    .map(async (user) => {
      const info = parseUserInfoForList(user);

      let passExp = 0;

      if (
        !user.is_blocked &&
        user.user_state === USER_STATE.PENDING
      ) {
        const rec = await passRecordGet(
          String(user.user_id),
          env
        );

        if (rec && Number(rec.e) > Date.now()) {
          passExp = Number(rec.e);
        }
      }

      return {
        id: String(user.user_id),
        name: info.name,
        username: info.username,
        state: user.is_blocked
          ? 'blocked'
          : String(user.user_state || ''),
        muted: Boolean(user.is_muted),
        topic: Boolean(user.topic_id),
        topic_id: user.topic_id
          ? String(user.topic_id)
          : '', 
        created_at: user.created_at || 0,
        updated_at: user.updated_at || 0,
        note: user.admin_note || '',
        passExp,
        trusted: Boolean(user.is_trusted),
        exempt: Boolean(user.relay_exempt)
      };
    })
  );

  const groupLinkId = String(
    env.ADMIN_GROUP_ID || ''
  ).replace(/^-100/, '');

  return Response.json({
    ok: true,
    group: groupLinkId,
    users,
    uiDefaults: {
      sort:
        await getConfig('userlist_sort', env, 'active'),
      pageSize: await clampedIntConfig(
        'userlist_page_size',
        env,
        20,
        5,
        100
      )
    }
  });
}

async function countRows(env, sql, binds) {
  const row = await env.TG_BOT_DB.prepare(sql)
    .bind(...binds)
    .first();

  return Number(row?.n || 0);
}

async function countUsersWhere(env, extraSql, binds) {
  const adminIds = getPrimaryAdminIds(env);

  let sql = 'SELECT COUNT(*) AS n FROM users';
  const allBinds = [];

  if (adminIds.length) {
    sql +=
      ' WHERE user_id NOT IN (' +
      adminIds.map(() => '?').join(',') +
      ')';

    allBinds.push(...adminIds);
  }

  if (extraSql) {
    sql +=
      (adminIds.length ? ' AND ' : ' WHERE ') +
      extraSql;

    allBinds.push(...binds);
  }

  return countRows(env, sql, allBinds);
}

async function handleStatsApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const since1 = now - 86400;
  const since7 = now - 7 * 86400;
  const since30 = now - 30 * 86400;

  const inSql =
    'SELECT COUNT(*) AS n FROM messages ' +
    'WHERE user_id = ? AND message_id LIKE ? ' +
    'AND date >= ?';

  const outSql =
    'SELECT COUNT(*) AS n FROM messages ' +
    'WHERE message_id LIKE ? AND date >= ?';

  const [
    total,
    verified,
    pending,
    fresh,
    blocked,
    muted,
    botBlocked,
    new1,
    new7,
    new30,
    act1,
    act7,
    act30,
    in1,
    in7,
    in30,
    out1,
    out7,
    out30
  ] = await Promise.all([
    countUsersWhere(env, '', []),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.VERIFIED]
    ),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.PENDING]
    ),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.NEW]
    ),
    countUsersWhere(env, 'is_blocked = 1', []),
    countUsersWhere(env, 'is_muted = 1', []),
    countRows(
      env,
      'SELECT COUNT(*) AS n FROM config ' +
      'WHERE key LIKE ? AND value = ?',
      ['botblocked:%', '1']
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since1]
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since7]
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since30]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since1]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since7]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since30]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since1]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since7]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since30]
    ),
    countRows(env, outSql, ['admin:%', since1]),
    countRows(env, outSql, ['admin:%', since7]),
    countRows(env, outSql, ['admin:%', since30])
  ]);

  return Response.json({
    ok: true,
    users: {
      total,
      verified,
      pending,
      fresh,
      blocked,
      muted,
      botBlocked
    },
    growth: { d1: new1, d7: new7, d30: new30 },
    active: { d1: act1, d7: act7, d30: act30 },
    messages: {
      in: { d1: in1, d7: in7, d30: in30 },
      out: { d1: out1, d7: out7, d30: out30 }
    }
  });
}

async function buildPanelUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/panel'
  );
}

async function handlePanelPage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildPanelPage,
    '链接无效或已过期，请回到机器人主菜单重新打开网页管理台。',
    'panel'
  );
}

async function handleGuidePage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildGuidePage,
    '链接无效或已过期，请回到机器人主菜单重新打开新手引导。',
    'guide'
  );
}

function buildGuidePage() {
  return `<!doctype html>
<html lang=\"zh-CN\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>新手引导</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-padding-top: 190px; }
  /* 章节跳转动画由脚本逐帧驱动，不用 CSS scroll-behavior 以免双重平滑互相干扰 */
  body { font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0f1a24; color: #dbe6f2; padding-top: 190px; padding-bottom: 30px; }
  header { position: fixed; top: 0; left: 0; right: 0; background: #13222f; padding: 12px 14px 10px; border-bottom: 1px solid #22374a; z-index: 3; transform: translateZ(0); will-change: transform; }
  h1 { font-size: 19px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 3px; line-height: 1.55; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
  .chip { color: #b8cbdd; text-decoration: none; font-size: 12.5px; border: 1px solid #2b3a47; padding: 5px 10px; border-radius: 999px; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  main { padding: 12px; max-width: 760px; margin: 0 auto; }
  section { background: #16242f; border: 1px solid #22374a; border-radius: 12px; padding: 14px 15px; margin-bottom: 12px; }
  h2 { font-size: 16px; margin-bottom: 9px; }
  p, li { font-size: 14px; line-height: 1.7; color: #c6d5e3; }
  ul, ol { padding-left: 20px; }
  li { margin: 3px 0; }
  p { margin: 6px 0; }
  code { background: #0d1620; border: 1px solid #2b3a47; border-radius: 6px; padding: 1px 6px; font-size: 13px; color: #9fd0ff; white-space: nowrap; }
  .cmd { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px dashed #22374a; align-items: baseline; }
  .cmd:last-child { border-bottom: 0; }
  .cmd div { font-size: 13.5px; line-height: 1.6; color: #c6d5e3; }
  .tip { background: #2a2118; border: 1px solid #57452a; color: #ecd9ac; border-radius: 10px; padding: 9px 12px; font-size: 13.5px; line-height: 1.65; margin-top: 9px; }
  .q { font-weight: 600; color: #eef5fb; margin-top: 11px; font-size: 14px; }
  b.k { color: #fff; }
</style>
</head>
<body>
<header id="ghead">
  <h1>📖 新手引导</h1>
  <div class=\"sub\">双向聊天机器人使用手册 · 当前版本 ${BOT_VERSION}<br>看完这一页，就能上手和访客聊天了。</div>
  <div class=\"chips\">
    <a class=\"chip\" href=\"#g-intro\">项目说明</a>
    <a class=\"chip\" href=\"#g-start\">开始使用</a>
    <a class=\"chip\" href=\"#g-verify\">验证</a>
    <a class=\"chip\" href=\"#g-chat\">接待日常</a>
    <a class=\"chip\" href=\"#g-cmd\">命令速查</a>
    <a class=\"chip\" href=\"#g-panel\">网页管理台</a>
    <a class=\"chip\" href=\"#g-users\">访客列表</a>
    <a class=\"chip\" href=\"#g-update\">版本更新</a>
    <a class=\"chip\" href=\"#g-faq\">常见问题</a>
  </div>
</header>
<main>

  <section id=\"g-intro\">
    <h2>🧭 项目说明</h2>
    <p>这是一个<b class=\"k\">双向聊天机器人</b>，给个人自用：访客在私聊里给机器人发消息，消息会自动转到管理员群里一个属于他本人的专属「话题」；你在话题里打字回复，机器人再把话带回访客的私聊。一人一个话题，谁和谁的话分得清清楚楚，不会串线。</p>
    <ul>
      <li>它是在开源项目 TGbot-D1（3.0.5）基础上增强的版本：真人验证与一次性通行证、引用转发、消息编辑与表情同步、拉黑提醒、管理员备注、服务熔断、网页管理台、访客列表与数据统计、自动检查更新，都包含在你现在用的这一版里。</li>
      <li><b class=\"k\">隐私口径：</b>机器人只负责「搬运」消息，<b class=\"k\">不保存聊天正文</b>。数据库里只留转发所需的配对记录，并只保留 90 天。</li>
      <li><b class=\"k\">费用：</b>它跑在 Cloudflare 的免费额度上，日常使用量完全免费，不用绑卡。</li>
    </ul>
  </section>

  <section id=\"g-start\">
    <h2>🚀 开始使用</h2>
    <ol>
      <li><b class=\"k\">打开主菜单：</b>在机器人私聊里发送 <code>/start</code>，网页管理台、访客列表和这本引导都在这里。菜单只留最新一份：再发一次 /start，上一次的 /start 和旧菜单会被自动删掉，不会在聊天里堆积（若隔了超过 48 小时才回来，旧菜单已过 Telegram 的删除期限、删不掉，会留在那里，手动删一下即可）；留下的这条 /start 点一下就能再发，网页链接过期时靠它刷新最方便。</li>
      <li><b class=\"k\">先定验证方式：</b>进「网页管理台 → 基础配置」，选一种验证方式（推荐 Turnstile，访客点一下就通过），顺便把欢迎消息改成你想对访客说的第一句话。</li>
      <li><b class=\"k\">把机器人发给访客：</b>访客打开私聊、完成验证之后给你发消息，你的群里就会自动多出一个以他名字命名的话题。</li>
      <li><b class=\"k\">在话题里直接回复：</b>不需要任何额外设置，在他的话题里打字、发图，就是发给他本人。</li>
    </ol>
    <div class=\"tip\">访客那边的视角：打开机器人 → 点「开始」→ 按提示完成一次验证 → 直接打字聊天。验证只做一次，之后不用再验。</div>
  </section>

  <section id=\"g-verify\">
    <h2>🛡 验证</h2>
    <p>验证是用来挡垃圾机器人和广告号的：没通过验证的人，发什么都不会转进群里。</p>
    <ul>
      <li><b class=\"k\">Turnstile 小程序验证（推荐）：</b>访客点「开始验证」按钮，弹出一个小页面自动完成人机校验，几秒通过，体验最顺。</li>
      <li><b class=\"k\">静态问答验证：</b>你出一道题，访客答对才放行；答案可以准备多个，用竖线 <code>|</code> 分隔，答中任意一个都算对。连着答错 5 次会被锁定 30 分钟（防有人对着答案穷举），锁定期间他发什么都不会有回应，过后自动解锁。次数和时长可以在管理台「参数与开关」里改。</li>
      <li><b class=\"k\">在哪里切换：</b>网页管理台 → 基础配置 → 验证方式。选了 Turnstile 后，问题和答案两项会自动隐藏；如果还没配好 Turnstile 密钥，机器人会自动用问答模式兜底，不会把人卡死。</li>
      <li><b class=\"k\">让某人重新验证：</b>打开他的话题，发送 <code>/reverify</code>，他下一次发消息前要重新过一遍验证。</li>
      <li><b class=\"k\">自己先试一遍：</b>私聊发送 <code>/testverify</code> 会拿到一个测试验证链接，点开能看到访客眼中的验证页长什么样；测试模式只是看看样子，不会真的放行或记录任何人。</li>
      <li><b class=\"k\">🎫 一次性通行证（救济通道）：</b>个别访客怎么也过不了验证（比如网络连不上验证服务）时，在访客列表里他那一行点「🎫 通行证」，机器人会私聊发给他一张通行证（默认 30 分钟内有效，有效期可在管理台「参数与开关」里改），他点开确认即通过验证。通行证必须本人点开才有效，转发给别人没用，用过即作废；不依赖 Turnstile 配置，没配密钥也能发。</li>
      <li><b class=\"k\">🤝 信任（免验证）：</b>熟人可以免掉验证：在访客列表他那一行点「🤝 信任」，或在他话题的资料卡上点「设为信任」，他立即通过验证（会收到验证成功提示），以后也一直免验证；点「取消信任」收回。注意：对他「重置验证」或在话题里发 /reverify 会连信任一起撤销；被封禁的人要先解封才能设信任；资料卡上的信任按钮只有主管理员能操作。</li>
      <li><b class=\"k\">验证消息会自己清理：</b>验证提示、通行证和「🎉 验证成功」这类流程消息，用完后会被机器人自动删掉，不在访客对话里堆积：反复索要验证只留最新一条提示，通过验证时提示立即清掉，成功提示等他第一条正经消息送达后再删；过期没用的通行证会在他下次来发消息时清扫。</li>
    </ul>
  </section>

  <section id=\"g-chat\">
    <h2>💬 接待日常</h2>
    <ul>
      <li><b class=\"k\">资料卡：</b>每个话题顶部都钉着访客的资料卡（名字、ID、状态、你的备注）。卡片不见了就在话题里发 <code>/card</code> 重新生成；卡片上的按钮可以直接封禁、解封、静音、刷新。</li>
      <li><b class=\"k\">引用回复会跟着走：</b>你在话题里引用某条消息再回复，访客那边看到的也是引用着他原话的回复；访客引用着回复你时同理，连他框选一小段文字的「部分引用」都会原样带过去。</li>
      <li><b class=\"k\">改错字会同步：</b>直接编辑你已发送的消息，对方那边会同步改好，旁边出现一行「✏️ 对方修改了这条消息」的小提示。Telegram 不给机器人提供官方的「已编辑」标记，这行提示就是补这个用的；访客编辑他的消息时，你这边也一样。</li>
      <li><b class=\"k\">删消息两边一起删：</b>在话题里回复选中要删的那条消息，再发 <code>/delete</code>，两边同时删除。注意：访客私聊那边的原消息只能删 48 小时以内的，超了删不掉时会在话题里留一行说明。</li>
      <li><b class=\"k\">整段对话清空：</b>在话题里发 <code>/clear</code> 并点确认，会把这个话题里的转发副本和访客私聊里的聊天副本成批删掉，话题本身保留、之后还能接着聊；48 小时前的私聊消息删不掉，清完会在话题里报告删了多少、多少删不掉。这个操作只有主管理员能做，协管员发命令或点确认都会被拦下。</li>
      <li><b class=\"k\">表情回应会同步：</b>你给某条消息贴的 emoji，对方那边也会贴上（会显示成机器人贴的，因为 Telegram 只允许机器人以自己的名义贴）。</li>
      <li><b class=\"k\">拉黑有提醒：</b>访客把机器人拉黑时，他的话题里会出现 🚫 提醒；他取消拉黑时有 ✅ 提醒，不用你去猜他还在不在；发出 ✅ 提醒的同时，之前那条 🚫 提醒会被一并删掉，话题里只留最新状态。</li>
      <li><b class=\"k\">转发失败有提醒：</b>极少数消息（比如带内容保护的内容）机器人复制不了、转不进话题时，会在话题里留一行 ⚠️ 提醒你留意（对方还以为发送成功了）；要是在群里手动关闭了某个话题，访客再发消息时机器人会先把话题重新打开再投递，不会另建新话题；访客短时间内发得太频繁时，超出部分会被限流丢弃，并在话题里提醒一次。</li>
      <li><b class=\"k\">命令回执不留痕：</b>你在话题里发出的命令消息，会在处理后立即被撤回；/note 的查看与保存、/notedelete、/reverify、/ban、/unban、/card 重建、话题里 /pause 与 /resume 的结果提示，还有打错命令时的「未识别的命令」提示，都是短暂显示，约 5 秒后自动删除，话题里不会堆积这类回执。例外：/note 保存失败（比如备注超长）时，命令原文会保留下来，方便你照着改短了重发。</li>
      <li><b class=\"k\">被轰炸时先开启服务熔断：</b>私聊发 <code>/pause 60</code> 暂停机器人 60 分钟（主菜单、网页管理台里也有开关），期间访客新发的消息会被机器人当场删除、不补送——消息发出去就消失，就是还在暂停的信号；对熔断前已送达消息的编辑和反应照常同步到话题副本，两边记录保持一致；开启服务熔断回复时，每位访客会收到一条「请稍后再试」，恢复后记得提醒对方重发重要消息；恢复服务时，那条「请稍后再试」会自动改成「✅ 服务已恢复」，访客一看便知。到期自动恢复（恢复通知会在到期后第一条消息到来时一并送达，没人发消息时收不到通知是正常的），也可随时 <code>/resume</code> 提前恢复。</li>
    </ul>
  </section>

  <section id=\"g-cmd\">
    <h2>⌨️ 命令速查</h2>
    <p>下面这些命令都在<b class=\"k\">访客的话题里</b>发送（在私聊里发没用）：</p>
    <div class=\"cmd\"><code>/ban</code><div>封禁这位访客：他的消息不再转进来。</div></div>
    <div class=\"cmd\"><code>/unban</code><div>解除封禁，恢复正常转发。</div></div>
    <div class=\"cmd\"><code>/delete</code><div>先回复选中一条消息、再发这条命令：双向删除那条消息。</div></div>
    <div class=\"cmd\"><code>/terminate</code><div>结束会话并删掉整个话题（删了找不回来，谨慎用）。</div></div>
    <div class=\"cmd\"><code>/clear</code><div>清空和这位访客的整段聊天记录：话题里的转发副本和访客私聊里的副本一起删（会先弹确认按钮），话题和访客档案保留；私聊里 48 小时前的消息删不掉，清完会报告条数。</div></div>
    <div class=\"cmd\"><code>/card</code><div>重新生成这个话题的资料卡。</div></div>
    <div class=\"cmd\"><code>/reverify</code><div>让这位访客重新做一次验证。</div></div>
    <div class=\"cmd\"><code>/note 内容</code><div>给这位访客存一条只有管理员看得到的备注（如「老客户，注意时效」）；只发 /note 是查看，/notedelete 是删除。备注除了显示在资料卡上，还会同步到话题名最前面（格式「备注｜名字 (ID)」），在群的话题列表里一眼就能看到。</div></div>
    <p style=\"margin-top:10px\">在<b class=\"k\">私聊</b>里用的命令：</p>
    <div class=\"cmd\"><code>/start</code><div>打开主菜单。</div></div>
    <div class=\"cmd\"><code>/help</code><div>和 /start 一样，打开主菜单。</div></div>
    <div class=\"cmd\"><code>/testverify</code><div>拿一条验证页的测试链接，自己先体验一遍。</div></div>
    <div class=\"cmd\"><code>/version</code><div>查看当前版本，以及有没有新版本。</div></div>
    <div class=\"cmd\"><code>/panel</code><div>直接打开网页管理台（只有主管理员可用）。主菜单里关掉了管理台按钮时，也可以用这个命令临时打开。</div></div>
    <div class=\"cmd\"><code>/pause 60</code><div>开启服务熔断，暂停机器人 60 分钟（不写数字 = 60 分钟，话题里也能发）：期间访客新发的消息会被删除、不送达（对已送达消息的编辑与反应照常同步），到期自动恢复。</div></div>
    <div class=\"cmd\"><code>/resume</code><div>立即恢复机器人服务（话题里也能发）。</div></div>
  </section>

  <section id=\"g-panel\">
    <h2>🛠 网页管理台</h2>
    <p>从主菜单打开，<b class=\"k\">只有主管理员能进</b>。所有设置都集中在这里，改完点对应的「保存」立即生效：</p>
    <ul>
      <li><b class=\"k\">基础配置：</b>欢迎消息、验证方式与题目、已验证超时清理。超时清理填一个天数（比如 90），长期没动静的访客会被自动清除并释放位置；填 0 表示永不自动清。注意：被清掉的人下次再来会新建一个话题，老话题会留着当存档。</li>
      <li><b class=\"k\">类型过滤：</b>不想转发的消息类型（贴纸、语音、视频等）在这里关掉，对方发了也不会过到对面去。</li>
      <li><b class=\"k\">屏蔽关键词：</b>访客的话里出现关键词会被拦下并记一次数，次数达到你设的阈值就自动封禁他。不会写正则表达式也没关系，直接填普通词句就行。</li>
      <li><b class=\"k\">自动回复：</b>访客的话包含某个词时，机器人自动回一句你预设的话（比如包含「价格」就自动回价目说明）。</li>
      <li><b class=\"k\">协管员：</b>把帮你接待的人的 Telegram 数字 ID 填进来（多个用逗号隔开）。协管员能在话题里回复、用命令、贴表情，但进不了网页管理台，也看不到访客列表。</li>
      <li><b class=\"k\">服务熔断：</b>被消息轰炸时在这里一键暂停机器人（或用 /pause 命令），可设定暂停时长、到期自动恢复；还能设置暂停期间给访客的回复语句，或关掉回复保持完全静默。</li>
      <li><b class=\"k\">参数与开关：</b>转发限流的强度、通行证与验证链接的有效期、问答锁定的次数与时长、命令回执停留几秒，都能在这里调（数字都带安全范围，填超了不保存）；还有四个功能开关——编辑提示、反应同步、转发失败提醒、拉黑提醒，用不上哪个就关掉。</li>
      <li><b class=\"k\">文案与呈现：</b>验证成功 / 答错、熔断恢复、拉黑 / 解封这几句机器人说的话，能改成你自己的口气；话题名的样式（备注在前还是名字在前、带不带 ID）、主菜单上显示哪些按钮、访客列表默认排序与每页条数，也都在这里。</li>
    </ul>
    <div class=\"tip\">管理台的网页链接 30 分钟过期；打开时、或者开着页面闲置超时后保存时，都会提示过期，重新发送 /start、在新主菜单上重新打开就行。</div>
  </section>

  <section id=\"g-users\">
    <h2>📋 访客列表与数据统计</h2>
    <ul>
      <li><b class=\"k\">两个标签页：</b>「访客列表」和「数据统计」，默认打开列表页，点顶部标签切换。</li>
      <li><b class=\"k\">找人：</b>顶部搜索框可以按名字、用户名、数字 ID、甚至你写的备注来搜；下面的「全部 / 已验证 / 待验证 / 已屏蔽」是快速筛选；还能换排序顺序。</li>
      <li><b class=\"k\">对某个人操作：</b>每行有「重置验证」（让他重新验证）、「话题」（一键跳到话题群里和他的对话）、「删除」（“仅删除记录”只删机器人这边的档案，话题和聊天记录都不动；“连话题、私聊一起清空”会连群里的话题、和访客与机器人私聊里的聊天副本一起清掉，私聊里 48 小时前的消息删不掉，清完会报告条数）、「🎫 通行证」（给还没通过验证的人发一张一次性通行证，他点开确认即可通过）和「备注」（写一句只有管理员看得到的话，会同步显示到他的资料卡上）。发完通行证后，他那一行会出现「🎫 已发证 · 剩 N 分钟」徽标，按钮变成「🎫 重新发放」，他用证通过后徽标自动消失。行里还有「🤝 信任」（设为信任后免验证，见「验证」一节）和「🕊 放行」（对这个人免转发限流、免类型过滤，适合话多或常发大文件的人；关键词封禁对他照常有效）；设了信任或放行的人，行上会挂对应徽标。</li>
      <li><b class=\"k\">统计页：</b>能看到访客总数、已验证 / 待验证人数，以及过去 24 小时、7 天、30 天分别新增了多少人、多少人活跃、收发了多少条消息。提醒一句：消息量是按转发记录数的，系统只留最近 90 天，所以统计最多往前看 90 天。</li>
    </ul>
  </section>

  <section id=\"g-update\">
    <h2>🔄 版本与更新</h2>
    <ul>
      <li>主菜单顶部、标题下面有一行当前版本号；有新版本时，那一行会变成可以点开的链接，机器人也会私聊通知主管理员一次（只通知一次，不刷屏）。</li>
      <li>想手动确认时，点主菜单的「🔄 检查更新」；查太勤会被限速（5 分钟最多查一次），这是故意的，防止白白消耗额度。</li>
      <li>升级不丢东西：访客、配置、备注都存在数据库里，按项目仓库里的部署教程、换上新版文件重新部署即可。</li>
    </ul>
  </section>

  <section id=\"g-faq\">
    <h2>❓ 常见问题</h2>
    <p class=\"q\">关掉某个话题，是不是就把这个访客停掉了？</p>
    <p>不是。关话题只对普通群成员生效，机器人和管理员照样能在里面发消息。想真正停掉一个访客，在他的话题里发 /ban；想连话题一起清掉，发 /terminate。</p>
    <p class=\"q\">输入 / 时，/note 这些新命令不出现在候选里？</p>
    <p>那是 Telegram App 自己缓存了旧的命令名单，彻底关掉 App 再重开就会刷新；等不及也可以把命令手打全，一样有效。</p>
    <p class=\"q\">编辑过的消息为什么没有官方的「已编辑」小字？</p>
    <p>Telegram 不允许机器人给消息加官方编辑标记，所以机器人用一行「✏️ 对方修改了这条消息」的提示代替，一样看得懂。</p>
    <p class=\"q\">贴的表情为什么显示成机器人贴的？</p>
    <p>Telegram 只允许机器人以自己的名义贴表情，同步到对方那边自然显示机器人名字，这个改不了。</p>
    <p class=\"q\">访客说验证一直过不了，怎么办？</p>
    <p>先让他换个网络或重启 App 再试。还是不行，就给他发一张一次性通行证：打开访客列表，在他那一行点「🎫 通行证」，机器人会私聊发给他一张 30 分钟有效的通行证，他点开确认就能通过，不用再折腾验证。你也可以发 /testverify 自己点一遍，看看验证页是否正常，或者在管理台临时把验证方式切成静态问答，让他先通过。</p>
    <p class=\"q\">网页打开提示「链接无效或已过期」？</p>
    <p>管理台、访客列表和这本引导的链接都是 30 分钟有效的签名链接：打开时报错、或者页面开久了点保存提示「链接已过期」，都是它到期了。重新发送 /start，在新主菜单上重新打开即可；保存失败的那次修改不会生效，记得重新填一遍。</p>
  </section>

</main>
<script>
  var gPad = 0;
  function gFixPad() {
    var hd = document.getElementById('ghead');
    if (!hd) return;
    var h = hd.offsetHeight;
    var v = h + 10;
    if (v !== gPad) {
      gPad = v;
      document.documentElement.style.scrollPaddingTop = v + 'px';
      document.body.style.paddingTop = h + 'px';
    }
  }
  var gPadTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(gPadTimer);
    gPadTimer = setTimeout(gFixPad, 120);
  });
  gFixPad();
  var gAnim = 0;
  function gStopAnim() {
    if (gAnim) { cancelAnimationFrame(gAnim); gAnim = 0; }
  }
  window.addEventListener('wheel', gStopAnim, { passive: true });
  window.addEventListener('touchstart', gStopAnim, { passive: true });
  function gScrollTo(target) {
    var pad = parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0;
    var startY = window.pageYOffset || 0;
    var startX = window.pageXOffset || 0;
    var endY = startY + target.getBoundingClientRect().top - pad;
    var dist = endY - startY;
    if (!dist && !startX) return;
    gStopAnim();
    var dur = Math.min(600, Math.max(220, Math.round(Math.abs(dist) * 0.35)));
    var t0 = 0;
    function gStep(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      window.scrollTo(Math.round(startX * (1 - e)), Math.round(startY + dist * e));
      gAnim = p < 1 ? requestAnimationFrame(gStep) : 0;
    }
    gAnim = requestAnimationFrame(gStep);
  }
  var gChips = document.querySelectorAll('.chip');
  for (var i = 0; i < gChips.length; i++) {
    gChips[i].addEventListener('click', function (ev) {
      var id = this.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      gScrollTo(target);
      try { history.replaceState(null, '', id); } catch (e) {}
    });
  }
  var gSecs = document.querySelectorAll('section[id]');
  function gSpy() {
    var line = (window.pageYOffset || 0) + (parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0) + 4;
    var atBottom = (window.pageYOffset || 0) + window.innerHeight >= document.documentElement.scrollHeight - 2;
    var cur = null;
    for (var i = 0; i < gSecs.length; i++) {
      if (gSecs[i].offsetTop <= line) cur = gSecs[i];
      else break;
    }
    if (atBottom && gSecs.length) cur = gSecs[gSecs.length - 1];
    for (var j = 0; j < gChips.length; j++) {
      gChips[j].classList.toggle('on', !!cur && gChips[j].getAttribute('href') === '#' + cur.id);
    }
  }
  var gSpyTick = false;
  window.addEventListener('scroll', function () {
    if (gSpyTick) return;
    gSpyTick = true;
    requestAnimationFrame(function () { gSpyTick = false; gSpy(); });
  }, { passive: true });
  gSpy();
</script>
</body>
</html>`;
}

function buildPanelPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>网页管理台</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; padding-top: 104px; }
  html { scroll-padding-top: 114px; }
  header { position: fixed; top: 0; left: 0; right: 0; background: #17212b; padding: 12px 14px; z-index: 2; transform: translateZ(0); will-change: transform; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid #2b3a47; color: #9db2c5; font-size: 13px; text-decoration: none; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  main { padding: 12px 12px 34px; }
  section { background: #17212b; border-radius: 12px; padding: 13px 14px; margin-bottom: 12px; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  label { display: block; color: #9db2c5; font-size: 12.5px; margin: 12px 0 5px; }
  label:first-of-type { margin-top: 2px; }
  textarea, input[type=text], input[type=number], select { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 15px; }
  textarea { resize: vertical; line-height: 1.5; }
  .hint { color: #5f7488; font-size: 12px; margin-top: 5px; line-height: 1.5; }
  .save { margin-top: 8px; padding: 7px 18px; border-radius: 8px; border: 0; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; }
  .save:disabled { opacity: .5; }
  .danger { background: #5c2222; color: #ffb4b4; }
  .swrow { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #22303d; }
  .swrow:last-child { border-bottom: 0; }
  .swrow span { font-size: 14.5px; }
  .swrow input { width: 22px; height: 22px; accent-color: #2b5278; }
  .item { display: flex; gap: 8px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #22303d; }
  .item:last-child { border-bottom: 0; }
  .item .tx { flex: 1; font-size: 14px; word-break: break-all; line-height: 1.5; }
  .item .tx .sub { color: #9db2c5; font-size: 12.5px; }
  .item button { padding: 5px 11px; border-radius: 8px; border: 0; background: #5c2222; color: #ffb4b4; font-size: 13px; cursor: pointer; flex-shrink: 0; }
  .addrow { display: flex; gap: 8px; margin-top: 10px; }
  .addrow input { flex: 1; }
  .addrow button { padding: 8px 15px; border-radius: 8px; border: 0; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; flex-shrink: 0; }
  .empty { color: #5f7488; font-size: 13px; padding: 6px 0; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #2b5278; color: #fff; padding: 9px 16px; border-radius: 10px; display: none; font-size: 14px; z-index: 5; max-width: 86vw; text-align: center; }
  .loadfail { text-align: center; color: #f28b8b; padding: 30px 0; }
</style>
</head>
<body>
<header id="phead">
  <h1>🛠 网页管理台</h1>
  <div class="chips">
    <a class="chip" href="#sec-base">基础配置</a>
    <a class="chip" href="#sec-filter">类型过滤</a>
    <a class="chip" href="#sec-keyword">屏蔽关键词</a>
    <a class="chip" href="#sec-reply">自动回复</a>
    <a class="chip" href="#sec-admin">协管员</a>
    <a class="chip" href="#sec-pause">服务熔断</a>
    <a class="chip" href="#sec-tune">参数与开关</a>
    <a class="chip" href="#sec-style">文案与呈现</a>
  </div>
</header>
<main id="main">
  <div class="empty" id="loading">加载中…</div>

  <section id="sec-base" hidden>
    <h2>📝 基础配置（验证）</h2>
    <label>欢迎消息</label>
    <textarea id="f_welcome" rows="4"></textarea>
    <button class="save" data-k="welcome_msg" data-t="f_welcome">保存</button>
    <label>验证方式</label>
    <select id="f_verifymode">
      <option value="turnstile">Turnstile 小程序验证</option>
      <option value="quiz">静态问答验证</option>
    </select>
    <div class="hint" id="vmode_hint"></div>
    <button class="save" data-k="verify_mode" data-t="f_verifymode">保存</button>
    <div id="w_verifq">
    <label>验证问题（静态问答模式）</label>
    <textarea id="f_verifq" rows="3"></textarea>
    <button class="save" data-k="verif_q" data-t="f_verifq">保存</button>
    </div>
    <div id="w_verifa">
    <label>验证答案（多个答案用 | 分隔）</label>
    <input type="text" id="f_verifa">
    <button class="save" data-k="verif_a" data-t="f_verifa">保存</button>
    </div>
    <label>已验证超时清理（天，0 = 永不自动清理）</label>
    <input type="number" id="f_ttl" min="0" max="3650" step="1">
    <div class="hint">超过该天数无活跃的已验证/待验证访客会被自动清除（含其话题映射，旧话题保留为无主存档）。</div>
    <button class="save" data-k="verified_ttl_days" data-t="f_ttl">保存</button>
  </section>

  <section id="sec-filter" hidden>
    <h2>🔗 按类型过滤</h2>
    <div id="filters"></div>
    <div class="hint">关掉的类型将不再转发给对方。点开关立即生效。</div>
  </section>

  <section id="sec-keyword" hidden>
    <h2>🚫 屏蔽关键词</h2>
    <label>自动封禁阈值（命中次数，1～100）</label>
    <input type="number" id="f_threshold" min="1" max="100" step="1">
    <button class="save" data-k="block_threshold" data-t="f_threshold">保存</button>
    <label>关键词列表（支持正则表达式）</label>
    <div id="kw_list"></div>
    <div class="addrow">
      <input type="text" id="kw_new" placeholder="新的屏蔽关键词/表达式">
      <button id="kw_add">添加</button>
    </div>
  </section>

  <section id="sec-reply" hidden>
    <h2>🤖 自动回复</h2>
    <div id="rp_list"></div>
    <label>新增规则：关键词表达式（支持正则）</label>
    <input type="text" id="rp_pattern" placeholder="例如：价格|多少钱">
    <label>回复内容</label>
    <textarea id="rp_response" rows="3"></textarea>
    <button class="save" id="rp_add">添加规则</button>
  </section>

  <section id="sec-admin" hidden>
    <h2>🧑‍💻 协管员</h2>
    <label>协管员 ID 列表（英文逗号分隔）</label>
    <textarea id="f_admins" rows="2"></textarea>
    <div class="hint">协管员可在话题里回复访客、使用话题命令与资料卡按钮，但不能改配置。主管理员不在此列。</div>
    <button class="save" data-k="authorized_admins" data-t="f_admins">保存</button>
    <button class="save danger" id="admins_clear">清空协管员</button>
  </section>
  <section id="sec-pause" hidden>
    <h2>⏸ 服务熔断</h2>
    <div class="hint" id="pause_status">读取中…</div>
    <label>暂停时长（分钟，1～10080）</label>
    <input type="number" id="f_pause_min" min="1" max="10080" step="1" value="60">
    <button class="save danger" id="pause_start">⏸ 暂停机器人</button>
    <button class="save" id="pause_resume">▶️ 恢复服务</button>
    <label>服务熔断期间回复访客</label>
    <select id="f_pausereplymode">
      <option value="true">开启：每位访客每轮暂停最多收到一条</option>
      <option value="false">关闭：完全静默</option>
    </select>
    <button class="save" data-k="pause_reply_enabled" data-t="f_pausereplymode">保存</button>
    <div id="w_pausereply">
    <label>回复语句</label>
    <textarea id="f_pausereply" rows="2"></textarea>
    <button class="save" data-k="pause_reply_text" data-t="f_pausereply">保存</button>
    </div>
    <div class="hint">暂停期间访客新发的消息会被删除、不转发，恢复后不会补送，请提醒对方重发重要内容；对已送达消息的编辑与表情反应照常同步，两边记录保持一致。已被封禁的访客不会收到回复。暂停到期会自动恢复，也可随时恢复；到期时不会立刻发通知，恢复通知会在到期后第一条消息到来时一并送达，没人发消息时收不到通知是正常的。</div>
  </section>
  <section id="sec-tune" hidden>
    <h2>⚙️ 参数与开关</h2>
    <div class="hint">说明：把问答「连错锁定次数」调小后，之前已答错多次的访客会按新次数提前锁定；已经在锁定期内的访客按落锁时的时长走完。验证链接与通行证的有效期调短，不影响已经发出去的（按发出时的时长到期）。</div>
    <label>转发限流：突发条数（1～1000）</label>
    <input type="number" id="t_burst" min="1" max="1000" step="1">
    <button class="save" data-k="relay_burst" data-t="t_burst">保存</button>
    <label>转发限流：每秒回填条数（1～100）</label>
    <input type="number" id="t_refill" min="1" max="100" step="1">
    <button class="save" data-k="relay_refill_per_sec" data-t="t_refill">保存</button>
    <label>通行证有效期（分钟，1～1440）</label>
    <input type="number" id="t_passmin" min="1" max="1440" step="1">
    <button class="save" data-k="pass_ttl_min" data-t="t_passmin">保存</button>
    <label>验证链接有效期（分钟，1～120）</label>
    <input type="number" id="t_vlinkmin" min="1" max="120" step="1">
    <button class="save" data-k="verify_link_min" data-t="t_vlinkmin">保存</button>
    <label>问答验证：连续答错几次锁定（1～20）</label>
    <input type="number" id="t_quizmax" min="1" max="20" step="1">
    <button class="save" data-k="quiz_max_attempts" data-t="t_quizmax">保存</button>
    <label>问答验证：锁定分钟（1～1440）</label>
    <input type="number" id="t_quizlock" min="1" max="1440" step="1">
    <button class="save" data-k="quiz_lock_min" data-t="t_quizlock">保存</button>
    <label>命令回执停留秒数（1～120）</label>
    <input type="number" id="t_stay" min="1" max="120" step="1">
    <button class="save" data-k="notice_stay_sec" data-t="t_stay">保存</button>
    <label>✏️ 编辑提示（编辑同步时那行小提示）</label>
    <select id="t_hint"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="hint_enabled" data-t="t_hint">保存</button>
    <label>表情反应双向同步</label>
    <select id="t_reaction"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="reaction_sync_enabled" data-t="t_reaction">保存</button>
    <label>转发失败提醒（话题 ⚠️ 与管理员告警）</label>
    <select id="t_relayfail"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="relay_fail_notice_enabled" data-t="t_relayfail">保存</button>
    <label>拉黑 / 解封提醒</label>
    <select id="t_blocknotice"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="block_notice_enabled" data-t="t_blocknotice">保存</button>
    <div class="hint">数字参数都带安全范围，超出范围会报错不保存；开关关掉后对应功能整体停用，随时可以再打开。</div>
  </section>
  <section id="sec-style" hidden>
    <h2>🎨 文案与呈现</h2>
    <label>验证成功提示（发给访客）</label>
    <textarea id="s_vsuccess" rows="2"></textarea>
    <button class="save" data-k="verify_success_text" data-t="s_vsuccess">保存</button>
    <label>问答答错提示（未到锁定次数时）</label>
    <textarea id="s_vwrong" rows="2"></textarea>
    <button class="save" data-k="quiz_wrong_text" data-t="s_vwrong">保存</button>
    <label>服务恢复提示（熔断恢复时，原暂停消息翻成这句）</label>
    <textarea id="s_restored" rows="2"></textarea>
    <button class="save" data-k="pause_restored_text" data-t="s_restored">保存</button>
    <label>拉黑提醒（发到访客的话题里）</label>
    <textarea id="s_block" rows="2"></textarea>
    <button class="save" data-k="block_notice_text" data-t="s_block">保存</button>
    <label>解封提醒（发到访客的话题里）</label>
    <textarea id="s_unblock" rows="2"></textarea>
    <button class="save" data-k="unblock_notice_text" data-t="s_unblock">保存</button>
    <label>话题名样式</label>
    <select id="s_title">
      <option value="note_first">备注｜名字 (ID)（现行）</option>
      <option value="name_first">名字｜备注 (ID)</option>
      <option value="no_id">备注｜名字（不带 ID，同名访客将无法区分）</option>
      <option value="no_note">名字 (ID)（备注不上标题）</option>
    </select>
    <div class="hint">只影响之后新建或刷新的话题名；已有话题在下次刷新资料卡或改备注时跟随新样式。</div>
    <button class="save" data-k="topic_title_style" data-t="s_title">保存</button>
    <label>主菜单按钮：网页管理台</label>
    <select id="m_panel"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_panel" data-t="m_panel">保存</button>
    <div class="hint">⚠️ 关掉管理台按钮后，主菜单里不再有任何网页入口；可用私聊命令 /panel 临时打开（或先留一个未过期的管理台页面再关）。</div>
    <label>主菜单按钮：访客列表</label>
    <select id="m_list"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_list" data-t="m_list">保存</button>
    <label>主菜单按钮：新手引导</label>
    <select id="m_guide"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_guide" data-t="m_guide">保存</button>
    <label>主菜单按钮：检查更新</label>
    <select id="m_updchk"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_updchk" data-t="m_updchk">保存</button>
    <label>主菜单按钮：服务熔断 / 恢复服务</label>
    <select id="m_pause"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_pause" data-t="m_pause">保存</button>
    <div class="hint">其余按钮关掉只是不再显示，对应功能仍可通过命令等方式使用（管理台按钮例外，见上方警示）。</div>
    <label>访客列表默认排序</label>
    <select id="s_sort">
      <option value="active">按最近活跃</option>
      <option value="new">按最新注册</option>
      <option value="old">按最早注册</option>
    </select>
    <button class="save" data-k="userlist_sort" data-t="s_sort">保存</button>
    <label>访客列表每页条数（5～100）</label>
    <input type="number" id="s_pagesize" min="5" max="100" step="1">
    <button class="save" data-k="userlist_page_size" data-t="s_pagesize">保存</button>
  </section>
</main>
<div id="toast"></div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var FILTER_DEFS = [
  ['enable_image_forwarding', '图片/视频/文件'],
  ['enable_link_forwarding', '链接'],
  ['enable_text_forwarding', '文本'],
  ['enable_audio_forwarding', '音频/语音'],
  ['enable_sticker_forwarding', '贴纸/GIF'],
  ['enable_user_forwarding', '访客转发'],
  ['enable_group_forwarding', '群组转发'],
  ['enable_channel_forwarding', '频道转发']
];
var KW = [], RP = [];

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2200);
}

var ERROR_TEXT = { unauthorized: '链接已过期，重新发送 /start 换新菜单', 'too large': '内容太长', 'bad json': '请求格式错误', 'bad userId': '参数错误' };
function translateError(d) {
  if (d && d.error && ERROR_TEXT[d.error]) d.error = ERROR_TEXT[d.error];
  return d;
}
function post(path, extra) {
  var b = { u: AUTH.u, e: AUTH.e, s: AUTH.s };
  for (var k in extra) b[k] = extra[k];
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b)
  }).then(function (r) { return r.json(); }).then(translateError);
}

function renderKw() {
  var box = document.getElementById('kw_list');
  box.textContent = '';
  if (!KW.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '暂无关键词';
    box.appendChild(e);
    return;
  }
  KW.forEach(function (kw, i) {
    var row = document.createElement('div');
    row.className = 'item';
    var tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = (i + 1) + '. ' + kw;
    row.appendChild(tx);
    var b = document.createElement('button');
    b.textContent = '删除';
    b.onclick = function () {
      b.disabled = true;
      post('/api/config/list', { key: 'block_keywords', op: 'delete', index: i }).then(function (d) {
        if (d.ok) { KW = d.keywords; toast('已删除'); renderKw(); }
        else { b.disabled = false; toast('删除失败：' + (d.error || '')); }
      });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}

function renderRp() {
  var box = document.getElementById('rp_list');
  box.textContent = '';
  if (!RP.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '暂无自动回复规则';
    box.appendChild(e);
    return;
  }
  RP.forEach(function (r, i) {
    var row = document.createElement('div');
    row.className = 'item';
    var tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = r.keywords;
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = '→ ' + r.response;
    tx.appendChild(sub);
    row.appendChild(tx);
    var b = document.createElement('button');
    b.textContent = '删除';
    b.onclick = function () {
      b.disabled = true;
      post('/api/config/list', { key: 'keyword_responses', op: 'delete', index: i }).then(function (d) {
        if (d.ok) { RP = d.autoReplies; toast('已删除'); renderRp(); }
        else { b.disabled = false; toast('删除失败：' + (d.error || '')); }
      });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}

function renderFilters(vals) {
  var box = document.getElementById('filters');
  box.textContent = '';
  FILTER_DEFS.forEach(function (def) {
    var row = document.createElement('div');
    row.className = 'swrow';
    var s = document.createElement('span');
    s.textContent = def[1];
    row.appendChild(s);
    var c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = !!vals[def[0]];
    c.onchange = function () {
      var want = c.checked;
      post('/api/config/toggle', { key: def[0], value: want }).then(function (d) {
        if (d.ok) toast(def[1] + (want ? ' 已开启' : ' 已关闭'));
        else { c.checked = !want; toast('修改失败：' + (d.error || '')); }
      }).catch(function () { c.checked = !want; toast('修改失败'); });
    };
    row.appendChild(c);
    box.appendChild(row);
  });
}

var saveBtns = document.querySelectorAll('.save[data-k]');
for (var i = 0; i < saveBtns.length; i++) {
  saveBtns[i].onclick = function () {
    var btn = this;
    var key = btn.getAttribute('data-k');
    var el = document.getElementById(btn.getAttribute('data-t'));
    if (key === 'menu_btn_panel' && el.value === 'false') {
      if (!confirm('关掉后主菜单里将不再有管理台入口。之后可私聊发送 /panel 临时打开管理台（链接 30 分钟内有效），确认关闭？')) return;
    }
    btn.disabled = true;
    post('/api/config/set', { key: key, value: el.value }).then(function (d) {
      btn.disabled = false;
      if (d.ok) toast('已保存');
      else toast('保存失败：' + (d.error || ''));
    }).catch(function () { btn.disabled = false; toast('保存失败'); });
  };
}

document.getElementById('kw_add').onclick = function () {
  var el = document.getElementById('kw_new');
  var v = el.value.trim();
  if (!v) { toast('先输入关键词'); return; }
  post('/api/config/list', { key: 'block_keywords', op: 'add', value: v }).then(function (d) {
    if (d.ok) { KW = d.keywords; el.value = ''; toast('已添加'); renderKw(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('rp_add').onclick = function () {
  var p = document.getElementById('rp_pattern');
  var r = document.getElementById('rp_response');
  post('/api/config/list', { key: 'keyword_responses', op: 'add', pattern: p.value, response: r.value }).then(function (d) {
    if (d.ok) { RP = d.autoReplies; p.value = ''; r.value = ''; toast('规则已添加'); renderRp(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('admins_clear').onclick = function () {
  post('/api/config/set', { key: 'authorized_admins', value: '' }).then(function (d) {
    if (d.ok) { document.getElementById('f_admins').value = ''; toast('协管员已清空'); }
    else toast('清空失败：' + (d.error || ''));
  });
};

function renderPauseStatus(st) {
  var el = document.getElementById('pause_status');
  if (!el) return;
  if (st && st.active) {
    el.textContent = '当前状态：⏸ 已暂停，' + (st.remaining_text || '') + '。';
  } else {
    el.textContent = '当前状态：▶️ 正常服务中。';
  }
}
document.getElementById('pause_start').onclick = function () {
  var m = Number(document.getElementById('f_pause_min').value);
  if (!Number.isInteger(m) || m < 1 || m > 10080) { toast('暂停时长必须是 1～10080 的整数分钟'); return; }
  post('/api/config/pause', { action: 'pause', minutes: m }).then(function (d) {
    if (d.ok) { renderPauseStatus(d.pause_state); toast('已暂停机器人'); }
    else toast('暂停失败：' + (d.error || ''));
  });
};
document.getElementById('pause_resume').onclick = function () {
  post('/api/config/pause', { action: 'resume' }).then(function (d) {
    if (d.ok) { renderPauseStatus(d.pause_state); toast('已恢复服务'); }
    else toast('恢复失败：' + (d.error || ''));
  });
};

function applyPauseReply() {
  var on = document.getElementById('f_pausereplymode').value === 'true';
  document.getElementById('w_pausereply').style.display = on ? '' : 'none';
}
document.getElementById('f_pausereplymode').addEventListener('change', applyPauseReply);

function applyVmode() {
  var quiz = document.getElementById('f_verifymode').value === 'quiz';
  document.getElementById('w_verifq').style.display = quiz ? '' : 'none';
  document.getElementById('w_verifa').style.display = quiz ? '' : 'none';
}
document.getElementById('f_verifymode').addEventListener('change', applyVmode);

fetch('/api/config?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    // 填充守卫：任一字段元素缺失只跳过该项，不再中断整条填充链
    // （否则末尾的分区解隐与各渲染都执行不到、整页瘫痪）。
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
    function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
    if (!d.ok) {
      document.getElementById('loading').className = 'loadfail';
      setText('loading', '加载失败：无权访问或链接已过期，请回主菜单重新打开。');
      return;
    }
    document.getElementById('loading').hidden = true;
    setVal('f_welcome', d.welcome_msg || '');
    setVal('f_verifq', d.verif_q || '');
    setVal('f_verifa', d.verif_a || '');
    setVal('f_verifymode', d.verify_mode || 'turnstile');
    applyVmode();
    setText('vmode_hint', d.turnstileReady ? '' : '提示：尚未配置 TURNSTILE 密钥，即使选择 Turnstile 也会自动回退为静态问答。');
    setVal('f_ttl', d.verified_ttl_days);
    setVal('f_threshold', d.block_threshold);
    setVal('f_admins', (d.authorizedAdmins || []).join(', '));
    setVal('f_pausereply', d.pause_reply_text || '请稍后再试');
    setVal('f_pausereplymode', d.pause_reply_enabled ? 'true' : 'false');
    applyPauseReply();
    renderPauseStatus(d.pause_state);
    setVal('t_burst', d.relay_burst);
    setVal('t_refill', d.relay_refill_per_sec);
    setVal('t_passmin', d.pass_ttl_min);
    setVal('t_vlinkmin', d.verify_link_min);
    setVal('t_quizmax', d.quiz_max_attempts);
    setVal('t_quizlock', d.quiz_lock_min);
    setVal('t_stay', d.notice_stay_sec);
    setVal('t_hint', d.hint_enabled ? 'true' : 'false');
    setVal('t_reaction', d.reaction_sync_enabled ? 'true' : 'false');
    setVal('t_relayfail', d.relay_fail_notice_enabled ? 'true' : 'false');
    setVal('t_blocknotice', d.block_notice_enabled ? 'true' : 'false');
    setVal('s_vsuccess', d.verify_success_text || '');
    setVal('s_vwrong', d.quiz_wrong_text || '');
    setVal('s_restored', d.pause_restored_text || '');
    setVal('s_block', d.block_notice_text || '');
    setVal('s_unblock', d.unblock_notice_text || '');
    setVal('s_title', d.topic_title_style || 'note_first');
    setVal('m_panel', d.menu_buttons && d.menu_buttons.panel ? 'true' : 'false');
    setVal('m_list', d.menu_buttons && d.menu_buttons.list ? 'true' : 'false');
    setVal('m_guide', d.menu_buttons && d.menu_buttons.guide ? 'true' : 'false');
    setVal('m_updchk', d.menu_buttons && d.menu_buttons.updchk ? 'true' : 'false');
    setVal('m_pause', d.menu_buttons && d.menu_buttons.pause ? 'true' : 'false');
    setVal('s_sort', d.userlist_sort || 'active');
    setVal('s_pagesize', d.userlist_page_size);
    KW = d.keywords || [];
    RP = d.autoReplies || [];
    renderFilters(d.filters || {});
    renderKw();
    renderRp();
    var secs = document.querySelectorAll('section');
    for (var j = 0; j < secs.length; j++) secs[j].hidden = false;
    pSpy();
  })
  .catch(function () {
    document.getElementById('loading').className = 'loadfail';
    document.getElementById('loading').textContent = '加载失败，请回主菜单重新打开。';
  });
var pPad = 0;
function pFixPad() {
  var hd = document.getElementById('phead');
  if (!hd) return;
  var h = hd.offsetHeight;
  if (h && h !== pPad) {
    pPad = h;
    document.body.style.paddingTop = h + 'px';
    document.documentElement.style.scrollPaddingTop = (h + 10) + 'px';
  }
}
var pPadTimer = 0;
window.addEventListener('resize', function () {
  clearTimeout(pPadTimer);
  pPadTimer = setTimeout(pFixPad, 120);
});
pFixPad();
var pAnim = 0;
function pStopAnim() {
  if (pAnim) { cancelAnimationFrame(pAnim); pAnim = 0; }
}
window.addEventListener('wheel', pStopAnim, { passive: true });
window.addEventListener('touchstart', pStopAnim, { passive: true });
function pScrollToY(endY) {
  var startY = window.pageYOffset || 0;
  var startX = window.pageXOffset || 0;
  var dy = endY - startY;
  if (!dy && !startX) return;
  pStopAnim();
  var dist = Math.max(Math.abs(dy), Math.abs(startX));
  var dur = Math.min(600, Math.max(220, Math.round(dist * 0.35)));
  var t0 = 0;
  function pStep(ts) {
    if (!t0) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    window.scrollTo(Math.round(startX * (1 - e)), Math.round(startY + dy * e));
    pAnim = p < 1 ? requestAnimationFrame(pStep) : 0;
  }
  pAnim = requestAnimationFrame(pStep);
}
var pChips = document.querySelectorAll('.chip');
for (var pi = 0; pi < pChips.length; pi++) {
  pChips[pi].addEventListener('click', function (ev) {
    var id = this.getAttribute('href');
    if (!id || id.charAt(0) !== '#') return;
    var target = document.querySelector(id);
    if (!target) return;
    ev.preventDefault();
    var pad = parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0;
    pScrollToY((window.pageYOffset || 0) + target.getBoundingClientRect().top - pad);
    try { history.replaceState(null, '', id); } catch (e) {}
  });
}
var pSecs = document.querySelectorAll('section[id]');
function pSpy() {
  var line = (window.pageYOffset || 0) + (parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0) + 4;
  var atBottom = (window.pageYOffset || 0) + window.innerHeight >= document.documentElement.scrollHeight - 2;
  var cur = null;
  for (var i = 0; i < pSecs.length; i++) {
    if (pSecs[i].offsetParent === null) continue;
    if (pSecs[i].offsetTop <= line) cur = pSecs[i];
    else break;
  }
  if (atBottom && pSecs.length) cur = pSecs[pSecs.length - 1];
  for (var j = 0; j < pChips.length; j++) {
    pChips[j].classList.toggle('on', !!cur && pChips[j].getAttribute('href') === '#' + cur.id);
  }
}
var pSpyTick = false;
window.addEventListener('scroll', function () {
  if (pSpyTick) return;
  pSpyTick = true;
  requestAnimationFrame(function () { pSpyTick = false; pSpy(); });
}, { passive: true });
</script>
</body>
</html>`;
}

function validateScalarConfig(key, rawValue) {
  // 与原按钮版待输入流程逐项一致的校验与规范化。
  const raw = String(rawValue ?? '');

  if (key === 'welcome_msg') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.welcome_msg) {
      return {
        error:
          `欢迎消息最多允许 ${LIMITS.welcome_msg} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'verif_q') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.verif_q) {
      return {
        error:
          `验证问题最多允许 ${LIMITS.verif_q} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'verif_a') {
    const value = raw.trim();

    if (!value) {
      return { error: '内容不能为空' };
    }

    if (value.length > LIMITS.verif_a) {
      return {
        error:
          `验证答案最多允许 ${LIMITS.verif_a} 个字符`
      };
    }

    return { value };
  }

  if (key === 'verify_mode') {
    if (raw !== 'turnstile' && raw !== 'quiz') {
      return { error: '验证方式无效' };
    }

    return { value: raw };
  }

  if (key === 'verified_ttl_days') {
    const days = Number(raw.trim());

    if (
      !Number.isInteger(days) ||
      days < 0 ||
      days > 3650
    ) {
      return {
        error:
          '超时天数必须是 0 到 3650 之间的整数（0 表示不自动清理）'
      };
    }

    return { value: String(days) };
  }

  if (key === 'block_threshold') {
    const threshold = Number(raw.trim());

    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      threshold > 100
    ) {
      return {
        error: '屏蔽阈值必须是 1 到 100 之间的整数'
      };
    }

    return { value: String(threshold) };
  }

  const INT_RANGES = {
    relay_burst: [1, 1000, '限流突发条数'],
    relay_refill_per_sec: [1, 100, '限流每秒回填'],
    pass_ttl_min: [1, 1440, '通行证有效分钟'],
    verify_link_min: [1, 120, '验证链接有效分钟'],
    quiz_max_attempts: [1, 20, '问答锁定答错次数'],
    quiz_lock_min: [1, 1440, '问答锁定分钟'],
    notice_stay_sec: [1, 120, '回执停留秒数'],
    userlist_page_size: [5, 100, '访客列表每页条数']
  };

  if (INT_RANGES[key]) {
    const [min, max, label] =
      INT_RANGES[key];

    const num = Number(raw.trim());

    if (
      !Number.isInteger(num) ||
      num < min ||
      num > max
    ) {
      return {
        error:
          `${label}必须是 ${min} 到 ${max} 之间的整数`
      };
    }

    return { value: String(num) };
  }

  const BOOL_KEYS = new Set([
    'hint_enabled',
    'reaction_sync_enabled',
    'relay_fail_notice_enabled',
    'block_notice_enabled',
    'menu_btn_panel',
    'menu_btn_list',
    'menu_btn_guide',
    'menu_btn_updchk',
    'menu_btn_pause'
  ]);

  if (BOOL_KEYS.has(key)) {
    if (raw !== 'true' && raw !== 'false') {
      return { error: '开关值无效' };
    }

    return { value: raw };
  }

  const TEXT_LIMITS = {
    verify_success_text: 300,
    quiz_wrong_text: 300,
    pause_restored_text: 300,
    block_notice_text: 300,
    unblock_notice_text: 300
  };

  if (TEXT_LIMITS[key]) {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > TEXT_LIMITS[key]) {
      return {
        error:
          `文案最多允许 ${TEXT_LIMITS[key]} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'topic_title_style') {
    if (
      ![
        'note_first',
        'name_first',
        'no_id',
        'no_note'
      ].includes(raw)
    ) {
      return { error: '话题名样式无效' };
    }

    return { value: raw };
  }

  if (key === 'userlist_sort') {
    if (
      !['active', 'new', 'old'].includes(raw)
    ) {
      return { error: '列表排序方式无效' };
    }

    return { value: raw };
  }

  if (key === 'authorized_admins') {
    if (raw.length > LIMITS.authorized_admins) {
      return { error: '协管员列表内容过长' };
    }

    const ids = [
      ...new Set(
        raw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];

    const invalidIds = ids.filter(
      (id) => !/^\d+$/.test(id)
    );

    if (invalidIds.length > 0) {
      return {
        error:
          '以下 ID 格式不正确：' +
          invalidIds.slice(0, 5).join(', ')
      };
    }

    return { value: JSON.stringify(ids) };
  }

  if (key === 'pause_reply_enabled') {
    if (raw !== 'true' && raw !== 'false') {
      return { error: '开关值无效' };
    }

    return { value: raw };
  }

  if (key === 'pause_reply_text') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.pause_reply_text) {
      return {
        error:
          `回复语句最多允许 ${LIMITS.pause_reply_text} 个字符`
      };
    }

    return { value: raw };
  }

  return { error: '不允许修改的配置项' };
}

async function readPanelPostBody(
  request,
  env,
  scope = 'usrlist'
) {
  if (
    Number(
      request.headers.get('content-length') || 0
    ) > 16384
  ) {
    return {
      response: Response.json(
        { ok: false, error: 'too large' },
        { status: 413 }
      )
    };
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return {
      response: Response.json(
        { ok: false, error: 'bad json' },
        { status: 400 }
      )
    };
  }

  const adminId = await checkUserListAuth(
    body?.u,
    body?.e,
    body?.s,
    env,
    scope
  );

  if (!adminId) {
    return {
      response: Response.json(
        { ok: false, error: 'unauthorized' },
        { status: 403 }
      )
    };
  }

  return { body };
}

async function handleConfigApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env, 'panel');

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  // 一次全表读后本地取值：本函数的几十个字段不再逐键查库。
  const cfgAll = await getAllConfigMap(env);

  const cfg = (key, def) => {
    const value = cfgAll[key];

    if (value !== undefined && value !== null) {
      return value;
    }

    return def !== undefined ? def : (DEFAULTS[key] ?? '');
  };

  const filters = await getFilterConfig(env);
  const rules = await getAutoReplyRules(env);

  return Response.json({
    ok: true,
    welcome_msg: cfg('welcome_msg'),
    verif_q: cfg('verif_q'),
    verif_a: cfg('verif_a'),
    verify_mode: cfg('verify_mode', 'turnstile'),
    turnstileReady: isTurnstileConfigured(env),
    pause_reply_enabled:
      (cfg('pause_reply_enabled', 'true')) === 'true',
    pause_reply_text: cfg('pause_reply_text', '请稍后再试'),
    pause_state:
      await describePauseStateForPanel(env),
    verified_ttl_days:
      Number(
        cfg('verified_ttl_days', '0')
      ) || 0,
    block_threshold: await getBlockThreshold(env),
    filters: {
      enable_image_forwarding: filters.media,
      enable_link_forwarding: filters.link,
      enable_text_forwarding: filters.text,
      enable_audio_forwarding: filters.audio_voice,
      enable_sticker_forwarding: filters.sticker_gif,
      enable_user_forwarding: filters.user_forward,
      enable_group_forwarding: filters.group_forward,
      enable_channel_forwarding:
        filters.channel_forward
    },
    keywords: await getBlockKeywords(env),
    autoReplies: rules.map((rule) => ({
      id: String(rule.id || ''),
      keywords: String(rule.keywords || ''),
      response: String(rule.response || '')
    })),
    authorizedAdmins:
      await getAuthorizedAdmins(env),
    relay_burst:
      Number(cfg('relay_burst', '30')) || 30,
    relay_refill_per_sec:
      Number(cfg('relay_refill_per_sec', '5')) || 5,
    pass_ttl_min:
      Number(cfg('pass_ttl_min', '30')) || 30,
    verify_link_min:
      Number(cfg('verify_link_min', '10')) || 10,
    quiz_max_attempts:
      Number(cfg('quiz_max_attempts', '5')) || 5,
    quiz_lock_min:
      Number(cfg('quiz_lock_min', '30')) || 30,
    notice_stay_sec:
      Number(cfg('notice_stay_sec', '5')) || 5,
    hint_enabled:
      (cfg('hint_enabled', 'true')) === 'true',
    reaction_sync_enabled:
      (cfg('reaction_sync_enabled', 'true')) === 'true',
    relay_fail_notice_enabled:
      (cfg('relay_fail_notice_enabled', 'true')) === 'true',
    block_notice_enabled:
      (cfg('block_notice_enabled', 'true')) === 'true',
    verify_success_text:
      cfg('verify_success_text'),
    quiz_wrong_text:
      cfg('quiz_wrong_text'),
    pause_restored_text:
      cfg('pause_restored_text'),
    block_notice_text:
      cfg('block_notice_text'),
    unblock_notice_text:
      cfg('unblock_notice_text'),
    topic_title_style:
      cfg('topic_title_style', 'note_first'),
    menu_buttons: {
      panel:
        (cfg('menu_btn_panel', 'true')) === 'true',
      list:
        (cfg('menu_btn_list', 'true')) === 'true',
      guide:
        (cfg('menu_btn_guide', 'true')) === 'true',
      updchk:
        (cfg('menu_btn_updchk', 'true')) === 'true',
      pause:
        (cfg('menu_btn_pause', 'true')) === 'true'
    },
    userlist_sort:
      cfg('userlist_sort', 'active'),
    userlist_page_size:
      Number(cfg('userlist_page_size', '20')) || 20
  });
}

async function handleConfigSet(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;
  const key = String(body?.key || '');
  const rawValue = Array.isArray(body?.value)
    ? body.value.map(String).join(',')
    : body?.value;

  const result = validateScalarConfig(key, rawValue);

  if (result.error) {
    return Response.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  await setConfig(key, result.value, env);

  return Response.json({ ok: true });
}

async function handleConfigToggle(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;

  const allowedKeys = new Set([
    'enable_image_forwarding',
    'enable_link_forwarding',
    'enable_text_forwarding',
    'enable_audio_forwarding',
    'enable_sticker_forwarding',
    'enable_user_forwarding',
    'enable_group_forwarding',
    'enable_channel_forwarding'
  ]);

  const key = String(body?.key || '');

  if (!allowedKeys.has(key)) {
    return Response.json(
      { ok: false, error: '不允许的开关项' },
      { status: 400 }
    );
  }

  if (typeof body?.value !== 'boolean') {
    return Response.json(
      { ok: false, error: '开关值无效' },
      { status: 400 }
    );
  }

  await setConfig(
    key,
    body.value ? 'true' : 'false',
    env
  );

  return Response.json({ ok: true });
}

async function handleConfigPause(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;
  const action = String(body?.action || '');

  if (action === 'pause') {
    const minutes = Number(body?.minutes);

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      return Response.json(
        {
          ok: false,
          error: '暂停时长必须是 1～10080 的整数分钟'
        },
        { status: 400 }
      );
    }

    const state = await performPause(env, minutes, '');

    return Response.json({
      ok: true,
      pause_state: {
        active: true,
        until: state.until,
        remaining_text: describePauseRemaining(state)
      }
    });
  }

  if (action === 'resume') {
    await performResume(env, '');

    return Response.json({
      ok: true,
      pause_state: { active: false }
    });
  }

  return Response.json(
    { ok: false, error: '未知操作' },
    { status: 400 }
  );
}

async function handleConfigList(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;
  const key = String(body?.key || '');
  const op = String(body?.op || '');

  if (key === 'block_keywords') {
    const keywords = await getBlockKeywords(env);

    if (op === 'add') {
      const value = String(body?.value || '').trim();

      if (!value) {
        return Response.json(
          { ok: false, error: '关键词不能为空' },
          { status: 400 }
        );
      }

      if (value.length > LIMITS.block_keyword) {
        return Response.json(
          {
            ok: false,
            error:
              `关键词表达式最多允许 ${LIMITS.block_keyword} 个字符`
          },
          { status: 400 }
        );
      }

      try {
        validateRegexPattern(value);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              '无效的表达式：' +
              (error?.message || error)
          },
          { status: 400 }
        );
      }

      if (keywords.includes(value)) {
        return Response.json(
          { ok: false, error: '该关键词已经存在' },
          { status: 400 }
        );
      }

      keywords.push(value);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );

      return Response.json({ ok: true, keywords });
    }

    if (op === 'delete') {
      const index = Number(body?.index);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= keywords.length
      ) {
        return Response.json(
          { ok: false, error: '序号无效' },
          { status: 400 }
        );
      }

      keywords.splice(index, 1);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );

      return Response.json({ ok: true, keywords });
    }
  }

  if (key === 'keyword_responses') {
    const rules = await getAutoReplyRules(env);

    const mapped = () =>
      rules.map((rule) => ({
        id: String(rule.id || ''),
        keywords: String(rule.keywords || ''),
        response: String(rule.response || '')
      }));

    if (op === 'add') {
      const pattern =
        String(body?.pattern || '').trim();

      const response =
        String(body?.response || '').trim();

      if (!pattern || !response) {
        return Response.json(
          {
            ok: false,
            error: '关键词表达式和回复内容都不能为空'
          },
          { status: 400 }
        );
      }

      if (pattern.length > LIMITS.auto_reply_pattern) {
        return Response.json(
          {
            ok: false,
            error:
              `关键词表达式最多允许 ${LIMITS.auto_reply_pattern} 个字符`
          },
          { status: 400 }
        );
      }

      if (
        response.length > LIMITS.auto_reply_response
      ) {
        return Response.json(
          {
            ok: false,
            error:
              `回复内容最多允许 ${LIMITS.auto_reply_response} 个字符`
          },
          { status: 400 }
        );
      }

      try {
        validateRegexPattern(pattern);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              '无效的表达式：' +
              (error?.message || error)
          },
          { status: 400 }
        );
      }

      rules.push({
        id: randomId(),
        keywords: pattern,
        response
      });

      await setConfig(
        'keyword_responses',
        JSON.stringify(rules),
        env
      );

      return Response.json({
        ok: true,
        autoReplies: mapped()
      });
    }

    if (op === 'delete') {
      const index = Number(body?.index);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= rules.length
      ) {
        return Response.json(
          { ok: false, error: '序号无效' },
          { status: 400 }
        );
      }

      rules.splice(index, 1);

      await setConfig(
        'keyword_responses',
        JSON.stringify(rules),
        env
      );

      return Response.json({
        ok: true,
        autoReplies: mapped()
      });
    }
  }

  return Response.json(
    { ok: false, error: '不支持的操作' },
    { status: 400 }
  );
}

async function handleUserListAction(request, env) {
  const parsed =
    await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const body = parsed.body;

  const targetId = String(body?.userId || '');
  const action = String(body?.action || '');

  if (!/^\d{1,20}$/.test(targetId)) {
    return Response.json(
      { ok: false, error: 'bad userId' },
      { status: 400 }
    );
  }

  if (await isAdminUser(targetId, env)) {
    return Response.json(
      { ok: false, error: '不能对管理员账号执行此操作' },
      { status: 403 }
    );
  }

  if (action === 'reset') {
    await dbUserUpdate(
      targetId,
      {
        user_state: USER_STATE.PENDING,
        is_trusted: 0
      },
      env
    );

    await voidUserPass(env, targetId);

    return Response.json({ ok: true });
  }

  if (action === 'trust') {
    const target = await dbUserGet(targetId, env);

    if (!target) {
      return Response.json(
        { ok: false, error: '访客记录不存在' },
        { status: 400 }
      );
    }

    if (body?.trust === false) {
      await dbUserUpdate(
        targetId,
        { is_trusted: 0 },
        env
      );

      return Response.json({ ok: true });
    }

    // 授予类参数 fail-closed：只有明确的 true 才授予，
    // 缺失或类型不对一律参数错误，绝不默认授予。
    if (body?.trust !== true) {
      return Response.json(
        { ok: false, error: '参数错误' },
        { status: 400 }
      );
    }

    if (Number(target.is_blocked || 0) === 1) {
      return Response.json(
        {
          ok: false,
          error: '对方已被封禁，请先解封再设为信任'
        },
        { status: 400 }
      );
    }

    // 已经是已验证状态时只补标记：不再重复发成功提示、
    // 也不顶掉既有的验证回执槽。
    if (target.user_state === USER_STATE.VERIFIED) {
      await dbUserUpdate(
        targetId,
        { is_trusted: 1 },
        env
      );

      return Response.json({ ok: true });
    }

    // 设置即生效：直接置为已验证并按验证成功收尾，
    // 再把成功提示发给访客（发不出也不影响已生效的设置）。
    await dbUserUpdate(
      targetId,
      {
        is_trusted: 1,
        user_state: USER_STATE.VERIFIED
      },
      env
    );

    await cleanupAfterVerified(env, targetId);

    try {
      const successSent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: targetId,
          text: await getConfig(
            'verify_success_text',
            env
          )
        }
      );

      await trackSlotMessage(
        env,
        targetId,
        'receipt_msg_id',
        successSent?.message_id
      );
    } catch (error) {
      console.error(
        '发送信任验证成功提示失败：',
        error?.message || error
      );
    }

    return Response.json({ ok: true });
  }

  if (action === 'exempt') {
    const target = await dbUserGet(targetId, env);

    if (!target) {
      return Response.json(
        { ok: false, error: '访客记录不存在' },
        { status: 400 }
      );
    }

    if (
      body?.exempt !== true &&
      body?.exempt !== false
    ) {
      return Response.json(
        { ok: false, error: '参数错误' },
        { status: 400 }
      );
    }

    await dbUserUpdate(
      targetId,
      {
        relay_exempt: body?.exempt ? 1 : 0
      },
      env
    );

    return Response.json({ ok: true });
  }

  if (action === 'note') {
    const noteText = String(
      body?.note ?? ''
    ).trim();

    if (noteText.length > 500) {
      return Response.json(
        {
          ok: false,
          error: '备注太长（上限 500 字）'
        },
        { status: 400 }
      );
    }

    await dbUserUpdate(
      targetId,
      { admin_note: noteText },
      env
    );

    await refreshCardAfterNoteChange(
      targetId,
      env
    );

    return Response.json({ ok: true });
  }

  if (action === 'delete') {
    const withTopic = body?.deleteTopic === true;

    let wipe = null;

    if (withTopic) {
      // 连话题版先清私聊副本（话题稍后整体删除，
      // 话题内副本随话题一并消失，不逐条删）。
      wipe = await wipeConversationCopies(
        targetId,
        env,
        false
      );
    }

    await purgeManagedUser(
      targetId,
      withTopic,
      env
    );

    return Response.json({ ok: true, wipe });
  }

  if (action === 'pass') {
    const target = await dbUserGetOrCreate(targetId, env);

    if (target.user_state === USER_STATE.VERIFIED) {
      return Response.json(
        { ok: false, error: '对方已是已验证状态' },
        { status: 400 }
      );
    }

    if (Number(target.is_blocked || 0) === 1) {
      return Response.json(
        { ok: false, error: '对方已被封禁，请先解封再发放' },
        { status: 400 }
      );
    }

    const oldPass = await passRecordGet(targetId, env);

    const exp = Date.now() + (await passLinkTtlMs(env));
    const nonce = randomId();

    // 先落记录再发送：发送环节出故障也不会出现「有链接、无记录」；
    // 旧证在新记录落库的这一刻即失效（与此前口径一致）。
    await dbConfigPut(
      `pass:${targetId}`,
      JSON.stringify({ n: nonce, e: exp }),
      env
    );

    const origin = new URL(request.url).origin;
    const passUrl = await buildPassUrl(
      origin,
      targetId,
      nonce,
      exp,
      env
    );

    let passSent = null;

    const passMins = Math.max(
      1,
      Math.round((exp - Date.now()) / 60000)
    );

    try {
      passSent = await telegramApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: targetId,
        text:
          '🎫 管理员为你发放了一张验证通行证\n\n' +
          '如果人机验证一直过不去，点击下方按钮即可直接通过验证。\n' +
          '⏰ 通行证 ' + passMins + ' 分钟内有效，且只能使用一次。',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎫 使用通行证通过验证',
                web_app: { url: passUrl }
              }
            ]
          ]
        }
      });
    } catch (error) {
      // 只删本次这张（认随机数），不误伤并发发放的另一张新证。
      const cur = await passRecordGet(targetId, env);

      if (cur && cur.n === nonce) {
        await dbConfigDelete(`pass:${targetId}`, env);
      }

      return Response.json(
        {
          ok: false,
          error: '通行证发送失败：对方可能已拉黑机器人'
        },
        { status: 502 }
      );
    }

    // 回填消息 ID 前复检随机数：期间被另一张新证顶替时不覆盖对方的记录。
    const cur = await passRecordGet(targetId, env);

    if (cur && cur.n === nonce) {
      await dbConfigPut(
        `pass:${targetId}`,
        JSON.stringify({
          n: nonce,
          e: exp,
          m: passSent?.message_id || null
        }),
        env
      );
    }

    // 新证确认送达后，再删上一张证的消息。
    if (oldPass?.m) {
      await quietDeleteMessage(env, targetId, oldPass.m);
    }

    return Response.json({ ok: true, passExp: exp });
  }

  return Response.json(
    { ok: false, error: 'unknown action' },
    { status: 400 }
  );
}

function buildUserListPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>访客列表</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; padding-top: 104px; }
  html { scroll-padding-top: 114px; }
  header { position: fixed; top: 0; left: 0; right: 0; background: #17212b; padding: 12px 14px; z-index: 2; transform: translateZ(0); will-change: transform; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  input[type=search] { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 15px; }
  .chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 13px; cursor: pointer; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  .tabs { display: flex; gap: 8px; margin-top: 10px; }
  .tab { flex: 1; padding: 8px 0; border-radius: 9px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 14px; cursor: pointer; }
  .tab.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  select { margin-top: 10px; padding: 6px; border-radius: 8px; background: #0f141a; color: #e8edf2; border: 1px solid #2b3a47; }
  main { padding: 10px 12px 30px; }
  .card { background: #17212b; border-radius: 12px; padding: 11px 12px; margin-bottom: 9px; }
  .nm { font-weight: 600; font-size: 15px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 2px; word-break: break-all; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; margin-right: 5px; }
  .b-ok { background: #1d4d2b; color: #8be09a; }
  .b-pend { background: #5c4a17; color: #f2cd72; }
  .b-ban { background: #5c2222; color: #f28b8b; }
  .b-dim { background: #2b3a47; color: #9db2c5; }
  .b-pass { background: #173f5f; color: #8ecdf0; }
  .ops { margin-top: 9px; display: flex; gap: 8px; }
  .ops button, .cf button { padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; cursor: pointer; }
  .rst { background: #2b5278; color: #fff; }
  .del { background: #5c2222; color: #ffb4b4; }
  .cf { margin-top: 9px; display: none; gap: 8px; flex-wrap: wrap; }
  .cf.open { display: flex; }
  .cf .a { background: #8c2f2f; color: #fff; }
  .cf .b { background: #5c2222; color: #ffb4b4; }
  .cf .c { background: #2b3a47; color: #e8edf2; }
  .note { margin-top: 8px; font-size: 13px; color: #b8c9d9; white-space: pre-wrap; word-break: break-word; }
  .ntb { background: #2b3a47; color: #e8edf2; }
  .ne { margin-top: 9px; display: none; }
  .ne.open { display: block; }
  .ne textarea { width: 100%; box-sizing: border-box; min-height: 62px; padding: 8px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 14px; }
  .ne .row { display: flex; gap: 8px; margin-top: 7px; }
  .ne button { padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; cursor: pointer; }
  .ne .c { background: #2b3a47; color: #e8edf2; }
  .pager { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; }
  .pager button { padding: 7px 16px; border-radius: 8px; border: 1px solid #2b3a47; background: #17212b; color: #e8edf2; cursor: pointer; }
  .pager button:disabled { opacity: .4; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #2b5278; color: #fff; padding: 9px 16px; border-radius: 10px; display: none; font-size: 14px; }
  .empty { text-align: center; color: #9db2c5; padding: 34px 0; }
  #statsBox { margin-bottom: 14px; }
  .stitle { font-size: 15px; font-weight: 600; margin: 2px 0 4px; }
  .sgroup { color: #9db2c5; font-size: 12px; margin: 10px 0 6px; }
  .srow { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 8px; }
  .stile { background: #17212b; border-radius: 10px; padding: 8px 10px; }
  .sv { font-size: 19px; font-weight: 700; }
  .sl { color: #9db2c5; font-size: 11.5px; margin-top: 1px; }
  .snote { color: #5f7488; font-size: 11.5px; margin-top: 9px; line-height: 1.5; }
  .sloading { color: #9db2c5; font-size: 13px; padding: 6px 0; }
  @keyframes slideFromRight { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideFromLeft { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
  .in-r { animation: slideFromRight .32s ease; }
  .in-l { animation: slideFromLeft .32s ease; }
</style>
</head>
<body>
<header id="uhead">
  <h1>📋 访客列表 <span id="cnt" style="color:#9db2c5;font-size:13px"></span></h1>
  <div class="tabs">
    <button class="tab on" id="tabList">📋 访客列表</button>
    <button class="tab" id="tabStats">📊 数据统计</button>
  </div>
</header>
<main>
  <section id="paneList">
  <input type="search" id="q" placeholder="搜索名字、用户名、ID 或备注…">
  <div class="chips" id="chips">
    <button class="chip on" data-f="all">全部</button>
    <button class="chip" data-f="verified">已验证</button>
    <button class="chip" data-f="pending">待验证</button>
    <button class="chip" data-f="blocked">已屏蔽</button>
  </div>
  <select id="sort">
    <option value="active">按最近活跃</option>
    <option value="new">按最新注册</option>
    <option value="old">按最早注册</option>
  </select>
  <div id="list"><div class="empty">加载中…</div></div>
  <div class="pager">
    <button id="prev">← 上一页</button>
    <span id="pinfo" style="color:#9db2c5;font-size:13px"></span>
    <button id="next">下一页 →</button>
  </div>
  </section>
  <section id="paneStats" style="display:none">
    <div class="stitle">📊 数据统计</div>
    <div id="sgrid"><div class="sloading">统计加载中…</div></div>
    <div class="snote">消息量按同步映射记录统计（仅保留最近 90 天）；新增与活跃为滚动窗口（过去 24 小时 / 7 天 / 30 天）。</div>
  </section>
</main>
<div id="toast"></div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var all = [], filt = 'all', query = '', page = 1;
var GROUP_C = '';
var PAGE = 15;
var LABEL = { verified: '已验证', pending_verification: '待验证', blocked: '已屏蔽' };
var CLS = { verified: 'b-ok', pending_verification: 'b-pend', blocked: 'b-ban' };

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2000);
}

function fmt(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function visible() {
  var list = all.filter(function (u) {
    if (filt === 'verified' && u.state !== 'verified') return false;
    if (filt === 'pending' && u.state !== 'pending_verification') return false;
    if (filt === 'blocked' && u.state !== 'blocked') return false;
    if (query) {
      var hay = (u.name + ' @' + u.username + ' ' + u.id + ' ' + (u.note || '')).toLowerCase();
      if (hay.indexOf(query) === -1) return false;
    }
    return true;
  });
  var s = document.getElementById('sort').value;
  list.sort(function (a, b) {
    if (s === 'new') return b.created_at - a.created_at;
    if (s === 'old') return a.created_at - b.created_at;
    return b.updated_at - a.updated_at;
  });
  return list;
}

var ERROR_TEXT = { unauthorized: '链接已过期，重新发送 /start 换新菜单', 'too large': '内容太长', 'bad json': '请求格式错误', 'bad userId': '参数错误' };
function translateError(d) {
  if (d && d.error && ERROR_TEXT[d.error]) d.error = ERROR_TEXT[d.error];
  return d;
}
function act(id, action, delTopic, note, extra) {
  var body = { u: AUTH.u, e: AUTH.e, s: AUTH.s, action: action, userId: id, deleteTopic: !!delTopic, note: note };
  if (extra) { for (var ek in extra) body[ek] = extra[ek]; }
  return fetch('/api/users/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) { return r.json(); }).then(translateError);
}

function render() {
  var list = visible();
  var pages = Math.max(1, Math.ceil(list.length / PAGE));
  if (page > pages) page = pages;
  document.getElementById('cnt').textContent = '共 ' + list.length + ' 人';
  document.getElementById('pinfo').textContent = page + ' / ' + pages + ' 页';
  document.getElementById('prev').disabled = page <= 1;
  document.getElementById('next').disabled = page >= pages;
  var box = document.getElementById('list');
  box.textContent = '';
  if (!list.length) {
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '没有符合条件的访客';
    box.appendChild(d);
    return;
  }
  list.slice((page - 1) * PAGE, page * PAGE).forEach(function (u) {
    var card = document.createElement('div');
    card.className = 'card';
    var nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = u.name || '(无名字记录)';
    card.appendChild(nm);
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = (u.username ? '@' + u.username + ' · ' : '') + 'ID ' + u.id;
    card.appendChild(sub);
    var sub2 = document.createElement('div');
    sub2.className = 'sub';
    var b1 = document.createElement('span');
    b1.className = 'badge ' + (CLS[u.state] || 'b-dim');
    b1.textContent = LABEL[u.state] || u.state;
    sub2.appendChild(b1);
    var b2 = document.createElement('span');
    b2.className = 'badge b-dim';
    b2.textContent = u.topic ? '有话题' : '无话题';
    sub2.appendChild(b2);
    if (u.passExp && u.passExp > Date.now()) {
      var bp = document.createElement('span');
      bp.className = 'badge b-pass';
      bp.textContent = '🎫 已发证 · 剩 ' + Math.max(1, Math.ceil((u.passExp - Date.now()) / 60000)) + ' 分钟';
      sub2.appendChild(bp);
    }
    if (u.trusted) {
      var bt = document.createElement('span');
      bt.className = 'badge b-pass';
      bt.textContent = '🤝 已信任';
      sub2.appendChild(bt);
    }
    if (u.exempt) {
      var bx = document.createElement('span');
      bx.className = 'badge b-pass';
      bx.textContent = '🕊 已放行';
      sub2.appendChild(bx);
    }
    var t = document.createElement('span');
    t.textContent = '最近活跃 ' + fmt(u.updated_at);
    sub2.appendChild(t);
    card.appendChild(sub2);
    if (u.note) {
      var nd = document.createElement('div');
      nd.className = 'note';
      nd.textContent = '📝 ' + u.note;
      card.appendChild(nd);
    }
    var ne = document.createElement('div');
    ne.className = 'ne';
    var ta = document.createElement('textarea');
    ta.maxLength = 500;
    ta.placeholder = '给这个访客写点备注（仅管理员可见）…';
    ne.appendChild(ta);
    var nerow = document.createElement('div');
    nerow.className = 'row';
    var sv = document.createElement('button');
    sv.className = 'rst';
    sv.textContent = '保存备注';
    sv.onclick = function () {
      var v = ta.value.trim();
      if (v.length > 500) { toast('备注太长（上限 500 字）'); return; }
      sv.disabled = true;
      act(u.id, 'note', false, v).then(function (d) {
        sv.disabled = false;
        if (d.ok) { u.note = v; toast(v ? '备注已保存' : '备注已清空'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    };
    var cnb = document.createElement('button');
    cnb.className = 'c';
    cnb.textContent = '取消';
    cnb.onclick = function () { ne.className = 'ne'; };
    nerow.appendChild(sv);
    nerow.appendChild(cnb);
    ne.appendChild(nerow);
    var ops = document.createElement('div');
    ops.className = 'ops';
    var rb = document.createElement('button');
    rb.className = 'rst';
    rb.textContent = '🔄 重置验证';
    rb.onclick = function () {
      rb.disabled = true;
      act(u.id, 'reset', false).then(function (d) {
        rb.disabled = false;
        if (d.ok) { u.state = 'pending_verification'; toast('已重置为待验证'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    };
    var nb = document.createElement('button');
    nb.className = 'ntb';
    nb.textContent = '📝 备注';
    nb.onclick = function () { ta.value = u.note || ''; ne.className = 'ne open'; ta.focus(); };
    ops.appendChild(nb);
    if (u.topic && u.topic_id && GROUP_C) {
      var jb = document.createElement('button');
      jb.className = 'ntb';
      jb.textContent = '💬 话题';
      jb.onclick = function () {
        var url = 'https://t.me/c/' + GROUP_C + '/' + u.topic_id;
        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
        else window.open(url, '_blank');
      };
      ops.appendChild(jb);
    }
    if (u.state !== 'verified') {
      var pb = document.createElement('button');
      pb.className = 'ntb';
      var passLive = u.passExp && u.passExp > Date.now();
      pb.textContent = passLive ? '🎫 重新发放' : '🎫 通行证';
      pb.onclick = function () {
        pb.disabled = true;
        pb.textContent = '发送中…';
        act(u.id, 'pass', false).then(function (d) {
          if (d.ok) {
            u.passExp = d.passExp || u.passExp || 0;
            var pmins = d.passExp ? Math.max(1, Math.round((d.passExp - Date.now()) / 60000)) : 30;
            toast('✅ 通行证已发送，' + pmins + ' 分钟内有效');
            render();
          } else {
            pb.disabled = false;
            pb.textContent = passLive ? '🎫 重新发放' : '🎫 通行证';
            toast('操作失败：' + (d.error || ''));
          }
        });
      };
      ops.appendChild(pb);
    }
    var tb = document.createElement('button');
    tb.className = 'ntb';
    tb.textContent = u.trusted ? '↩️ 取消信任' : '🤝 信任';
    tb.onclick = function () {
      tb.disabled = true;
      act(u.id, 'trust', false, undefined, { trust: !u.trusted }).then(function (d) {
        tb.disabled = false;
        if (d.ok) {
          u.trusted = !u.trusted;
          if (u.trusted) { u.state = 'verified'; u.passExp = 0; }
          toast(u.trusted ? '已设为信任，对方已通过验证' : '已取消信任');
          render();
        } else toast('操作失败：' + (d.error || ''));
      });
    };
    ops.appendChild(tb);
    var xb = document.createElement('button');
    xb.className = 'ntb';
    xb.textContent = u.exempt ? '↩️ 取消放行' : '🕊 放行';
    xb.onclick = function () {
      xb.disabled = true;
      act(u.id, 'exempt', false, undefined, { exempt: !u.exempt }).then(function (d) {
        xb.disabled = false;
        if (d.ok) {
          u.exempt = !u.exempt;
          toast(u.exempt ? '已设为放行（免限流与类型过滤）' : '已取消放行');
          render();
        } else toast('操作失败：' + (d.error || ''));
      });
    };
    ops.appendChild(xb);
    ops.appendChild(rb);
    var db = document.createElement('button');
    db.className = 'del';
    db.textContent = '🗑 删除';
    var cf = document.createElement('div');
    cf.className = 'cf';
    var mk = function (cls, txt, fn) {
      var b = document.createElement('button');
      b.className = cls;
      b.textContent = txt;
      b.onclick = fn;
      return b;
    };
    cf.appendChild(mk('a', '仅删除记录', function () {
      act(u.id, 'delete', false).then(function (d) {
        if (d.ok) { all = all.filter(function (x) { return x.id !== u.id; }); toast('已删除记录'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    }));
    cf.appendChild(mk('b', '连话题、私聊一起清空', function () {
      act(u.id, 'delete', true).then(function (d) {
        if (d.ok) { all = all.filter(function (x) { return x.id !== u.id; }); toast(d.wipe ? ('已清空：私聊删除 ' + d.wipe.private.ok + ' 条' + (d.wipe.private.failed ? '，' + d.wipe.private.failed + ' 条超过 48 小时删不掉' : '') + '，话题与记录已删除') : '已删除记录与话题'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    }));
    cf.appendChild(mk('c', '取消', function () { cf.className = 'cf'; }));
    db.onclick = function () { cf.className = 'cf open'; };
    ops.appendChild(db);
    card.appendChild(ops);
    card.appendChild(cf);
    card.appendChild(ne);
    box.appendChild(card);
  });
}

document.getElementById('q').addEventListener('input', function (e) {
  query = e.target.value.trim().toLowerCase();
  page = 1;
  render();
});
document.getElementById('chips').addEventListener('click', function (e) {
  if (!e.target.dataset || !e.target.dataset.f) return;
  filt = e.target.dataset.f;
  var cs = document.querySelectorAll('.chip');
  for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (cs[i].dataset.f === filt ? ' on' : '');
  page = 1;
  render();
  var order = ['all', 'verified', 'pending', 'blocked'];
  var ni = order.indexOf(filt);
  slideIn(document.getElementById('list'), ni >= prevFiltIdx ? 1 : -1);
  prevFiltIdx = ni;
  uScrollTop();
});
document.getElementById('sort').addEventListener('change', function () { page = 1; render(); uScrollTop(); });
document.getElementById('prev').onclick = function () { if (page > 1) { page--; render(); uScrollTop(); } };
document.getElementById('next').onclick = function () { page++; render(); uScrollTop(); };

function showTab(which) {
  var isStats = which === 'stats';
  document.getElementById('paneList').style.display = isStats ? 'none' : '';
  document.getElementById('paneStats').style.display = isStats ? '' : 'none';
  document.getElementById('tabList').className = 'tab' + (isStats ? '' : ' on');
  document.getElementById('tabStats').className = 'tab' + (isStats ? ' on' : '');
  slideIn(document.getElementById(isStats ? 'paneStats' : 'paneList'), isStats ? 1 : -1);
  uScrollTop();
}
document.getElementById('tabList').onclick = function () { showTab('list'); };
document.getElementById('tabStats').onclick = function () { showTab('stats'); };

function stile(v, l) {
  var d = document.createElement('div');
  d.className = 'stile';
  var a = document.createElement('div');
  a.className = 'sv';
  a.textContent = v;
  var b = document.createElement('div');
  b.className = 'sl';
  b.textContent = l;
  d.appendChild(a);
  d.appendChild(b);
  return d;
}

function sgroup(title, tiles) {
  var wrap = document.createElement('div');
  var t = document.createElement('div');
  t.className = 'sgroup';
  t.textContent = title;
  wrap.appendChild(t);
  var row = document.createElement('div');
  row.className = 'srow';
  tiles.forEach(function (x) { row.appendChild(x); });
  wrap.appendChild(row);
  return wrap;
}

function statsFail() {
  var box = document.getElementById('sgrid');
  box.textContent = '';
  var e = document.createElement('div');
  e.className = 'sloading';
  e.textContent = '统计加载失败（不影响访客列表）';
  box.appendChild(e);
}

fetch('/api/stats?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.ok) { statsFail(); return; }
    var box = document.getElementById('sgrid');
    box.textContent = '';
    box.appendChild(sgroup('访客总览', [
      stile(d.users.total, '访客总数'),
      stile(d.users.verified, '已验证'),
      stile(d.users.pending, '待验证'),
      stile(d.users.fresh, '未开始'),
      stile(d.users.blocked, '已封禁'),
      stile(d.users.muted, '已静音'),
      stile(d.users.botBlocked, '已拉黑机器人')
    ]));
    box.appendChild(sgroup('新增访客', [
      stile(d.growth.d1, '过去 24 小时'),
      stile(d.growth.d7, '过去 7 天'),
      stile(d.growth.d30, '过去 30 天')
    ]));
    box.appendChild(sgroup('活跃访客', [
      stile(d.active.d1, '过去 24 小时'),
      stile(d.active.d7, '过去 7 天'),
      stile(d.active.d30, '过去 30 天')
    ]));
    box.appendChild(sgroup('消息量（访客 / 管理员回复）', [
      stile(d.messages.in.d1 + ' / ' + d.messages.out.d1, '过去 24 小时'),
      stile(d.messages.in.d7 + ' / ' + d.messages.out.d7, '过去 7 天'),
      stile(d.messages.in.d30 + ' / ' + d.messages.out.d30, '过去 30 天')
    ]));
  })
  .catch(statsFail);

fetch('/api/users?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.ok) {
      document.getElementById('list').innerHTML = '<div class="empty">加载失败：无权访问或链接已过期，请回主菜单重新打开。</div>';
      return;
    }
    all = d.users;
    GROUP_C = d.group || '';
    if (d.uiDefaults) {
      if (d.uiDefaults.pageSize) PAGE = d.uiDefaults.pageSize;
      if (d.uiDefaults.sort) document.getElementById('sort').value = d.uiDefaults.sort;
    }
    render();
  })
  .catch(function () {
    document.getElementById('list').innerHTML = '<div class="empty">加载失败，请回主菜单重新打开。</div>';
  });
var uPad = 0;
function uFixPad() {
  var hd = document.getElementById('uhead');
  if (!hd) return;
  var h = hd.offsetHeight;
  if (h && h !== uPad) {
    uPad = h;
    document.body.style.paddingTop = h + 'px';
  }
}
var uPadTimer = 0;
window.addEventListener('resize', function () {
  clearTimeout(uPadTimer);
  uPadTimer = setTimeout(uFixPad, 120);
});
uFixPad();
var uAnim = 0;
function uStopAnim() {
  if (uAnim) { cancelAnimationFrame(uAnim); uAnim = 0; }
}
window.addEventListener('wheel', uStopAnim, { passive: true });
window.addEventListener('touchstart', uStopAnim, { passive: true });
var prevFiltIdx = 0;
function slideIn(el, dir) {
  if (!el) return;
  el.classList.remove('in-r', 'in-l');
  void el.offsetWidth;
  el.classList.add(dir >= 0 ? 'in-r' : 'in-l');
}
function uScrollTop() {
  var startY = window.pageYOffset || 0;
  var startX = window.pageXOffset || 0;
  if (!startY && !startX) return;
  uStopAnim();
  var dist = Math.max(Math.abs(startY), Math.abs(startX));
  var dur = Math.min(600, Math.max(220, Math.round(dist * 0.35)));
  var t0 = 0;
  function uStep(ts) {
    if (!t0) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    window.scrollTo(Math.round(startX * (1 - e)), Math.round(startY * (1 - e)));
    uAnim = p < 1 ? requestAnimationFrame(uStep) : 0;
  }
  uAnim = requestAnimationFrame(uStep);
}
</script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                            服务熔断（改版新增）                              */
/* -------------------------------------------------------------------------- */

const PAUSE_STATE_KEY = 'sys:pause';
const PAUSE_DEFAULT_MINUTES = 60;
const PAUSE_MAX_MINUTES = 10080;

async function notifyPrimaryAdmins(
  env,
  text,
  exceptId = ''
) {
  for (const adminId of getPrimaryAdminIds(env)) {
    if (
      exceptId &&
      String(adminId) === String(exceptId)
    ) {
      continue;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: adminId,
          text,
          parse_mode: 'HTML'
        }
      );
    } catch (error) {
      console.error(
        '通知主管理员失败：',
        error?.message || error
      );
    }
  }
}

async function getPauseState(env) {
  const raw = await dbConfigGet(
    PAUSE_STATE_KEY,
    env
  );

  if (!raw) {
    return null;
  }

  const state = safeJsonParse(raw, null);

  if (
    !state ||
    typeof state !== 'object' ||
    !state.episode
  ) {
    return null;
  }

  const until = Number(state.until || 0);

  if (until && Date.now() >= until) {
    // 原子占用：并发读到过期的多个调用里，只让抢到的一方发通知。
    const wonNotice = await dbConfigClaim(
      'sys:pause-notified',
      String(state.episode),
      env
    );

    await dbConfigDelete(PAUSE_STATE_KEY, env);

    if (wonNotice) {
      await notifyPrimaryAdmins(
        env,
        '⏰ 服务熔断时间已到，机器人已自动恢复服务。'
      );

      await flipPauseCards(env);
    }

    return null;
  }

  return {
    episode: String(state.episode),
    until,
    by: String(state.by || '')
  };
}

async function startPause(env, minutes, byAdminId) {
  const state = {
    episode: String(Date.now()),
    until: Date.now() + minutes * 60000,
    by: String(byAdminId || '')
  };

  await setConfig(
    PAUSE_STATE_KEY,
    JSON.stringify(state),
    env
  );

  return state;
}

async function stopPause(env) {
  await dbConfigDelete(PAUSE_STATE_KEY, env);
}

// 恢复服务时把每位访客那张「请稍后再试」原地编辑成
// 已恢复确认。翻牌记录 pausemsg:<uid> = 提示消息编号，
// 熔断回复发送成功时写入。先删记录再翻牌，单次尽力
// 而为：牌被访客自行删掉、机器人被拉黑等都静默跳过。
async function flipPauseCards(env) {
  let rows = [];

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('pausemsg:%')
      .all();

    rows = result?.results || [];
  } catch (error) {
    console.error(
      '读取熔断提示记录失败：',
      error?.message || error
    );

    return;
  }

  // 恢复文案循环外读一次：逐卡读同一键是纯浪费，
  // 且恢复进行中改文案会让同批访客收到不同的恢复句。
  const restoredText = await textConfig(
    'pause_restored_text',
    env
  );

  for (const row of rows) {
    const key = String(row.key || '');

    const userId = key.slice('pausemsg:'.length);

    const messageId = Number(row.value);

    await dbConfigDelete(key, env);

    if (!userId || !messageId) {
      continue;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        {
          chat_id: userId,
          message_id: messageId,
          text: restoredText
        }
      );
    } catch {
      /* 翻牌失败不打扰主流程 */
    }
  }
}

function describePauseRemaining(state) {
  if (!state?.until) {
    return '手动恢复前一直暂停';
  }

  const totalMinutes = Math.max(
    1,
    Math.ceil((state.until - Date.now()) / 60000)
  );

  if (totalMinutes < 60) {
    return `约 ${totalMinutes} 分钟后自动恢复`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0
    ? `约 ${hours} 小时 ${minutes} 分钟后自动恢复`
    : `约 ${hours} 小时后自动恢复`;
}

async function performPause(env, minutes, byAdminId) {
  const state = await startPause(
    env,
    minutes,
    byAdminId
  );

  await notifyPrimaryAdmins(
    env,
    '⏸ 机器人已开启服务熔断，' +
      `${describePauseRemaining(state)}。` +
      '期间访客新发的消息将被删除。',
    byAdminId
  );

  return state;
}

async function performResume(env, byAdminId) {
  await stopPause(env);

  await flipPauseCards(env);

  await notifyPrimaryAdmins(
    env,
    '▶️ 机器人已恢复服务。',
    byAdminId
  );
}

async function describePauseStateForPanel(env) {
  const state = await getPauseState(env);

  if (!state) {
    return { active: false };
  }

  return {
    active: true,
    until: state.until,
    remaining_text: describePauseRemaining(state)
  };
}

// 暂停闸门：置于去重之前。返回 true 表示这条更新应被丢弃。
// 只拦非管理员的私聊侧更新（消息 / 编辑 / 反应 / 按钮）；
// 管理员与管理群侧永远放行，my_chat_member 等事件不拦。
async function pauseGateDrops(update, env) {
  let actorId = '';
  let kind = '';

  if (update.message) {
    if (update.message.chat?.type !== 'private') {
      return false;
    }

    actorId = String(update.message.from?.id || '');
    kind = 'message';
  } else if (update.edited_message) {
    if (
      update.edited_message.chat?.type !== 'private'
    ) {
      return false;
    }

    actorId = String(
      update.edited_message.from?.id || ''
    );
    kind = 'edited_message';
  } else if (update.message_reaction) {
    if (
      update.message_reaction.chat?.type !== 'private'
    ) {
      return false;
    }

    actorId = String(
      update.message_reaction.user?.id || ''
    );
    kind = 'reaction';
  } else if (update.callback_query) {
    actorId = String(
      update.callback_query.from?.id || ''
    );
    kind = 'callback';
  } else {
    return false;
  }

  if (!actorId) {
    return false;
  }

  const state = await getPauseState(env);

  if (!state) {
    return false;
  }

  if (await isAdminUser(actorId, env)) {
    return false;
  }

  if (
    kind === 'edited_message' ||
    kind === 'reaction'
  ) {
    // 熔断只拦新消息：对熔断前已送达消息的编辑与反应
    // 照常同步到对侧副本，否则恢复后两边记录对不上，
    // 且编辑内容只在事件到达时存在、事后无从补回。
    // 这两类也不发熔断回复——动作已经生效，
    // 再发「请稍后再试」会误导访客。
    return false;
  }

  if (kind === 'message') {
    // 熔断期间访客新发的消息当场删除：消息消失本身
    // 就是「仍在熔断」的信号。编辑不走这里——已在
    // 上方放行同步，删了反而会与话题副本对不上。
    await quietDeleteMessage(
      env,
      update.message.chat.id,
      update.message.message_id
    );
  }

  if (kind === 'callback') {
    return true;
  }

  const user = await dbUserGet(actorId, env);

  if (user?.is_blocked) {
    return true;
  }

  const replyEnabled =
    (await getConfig(
      'pause_reply_enabled',
      env,
      'true'
    )) === 'true';

  if (replyEnabled) {
    // 先原子占用再发送：并发触发也只发出一条；
    // 发送失败则释放占用，允许下一次触发重试。
    const wonReply = await dbConfigClaim(
      `pausenote:${actorId}`,
      state.episode,
      env
    );

    if (wonReply) {
      const replyText = await getConfig(
        'pause_reply_text',
        env,
        '请稍后再试'
      );

      try {
        const sent = await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: actorId,
            text: replyText
          }
        );

        // 记下这张「请稍后再试」的编号，
        // 恢复服务时原地翻牌成「✅ 服务已恢复」。
        if (sent?.message_id) {
          try {
            await dbConfigPut(
              `pausemsg:${actorId}`,
              String(sent.message_id),
              env
            );
          } catch (error) {
            console.error(
              '记录熔断提示编号失败：',
              error?.message || error
            );
          }
        }
      } catch (error) {
        console.error(
          '发送服务熔断回复失败：',
          error?.message || error
        );

        await dbConfigDelete(
          `pausenote:${actorId}`,
          env
        );
      }
    }
  }

  return true;
}

async function handleUpdate(
  update,
  env,
  origin = '',
  ctx = null
) {
  if (await pauseGateDrops(update, env)) {
    return;
  }

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
        env,
        origin
      );
    } else if (
      String(update.message.chat.id) ===
      String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminReply(
        update.message,
        env,
        ctx
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

  if (update.message_reaction) {
    await handleMessageReaction(
      update.message_reaction,
      env
    );

    return;
  }

  if (update.my_chat_member) {
    await handleMyChatMember(
      update.my_chat_member,
      env
    );

    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(
      update.callback_query,
      env,
      origin
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

      ctx.waitUntil(
        ensureBotCommands(env)
      );
    } catch (error) {
      console.error(
        '初始化失败：',
        error?.message || error
      );

      return new Response(
        'Initialization Error',
        {
          status: 500,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    const requestUrl = new URL(request.url);

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/verify'
    ) {
      return handleVerifyPage(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname ===
        '/verify/confirm'
    ) {
      return handleVerifyConfirm(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/pass'
    ) {
      return handlePassPage(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/pass/confirm'
    ) {
      return handlePassConfirm(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/users'
    ) {
      return handleUserListPage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/users'
    ) {
      return handleUserListApi(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/stats'
    ) {
      return handleStatsApi(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/panel'
    ) {
      return handlePanelPage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/guide'
    ) {
      return handleGuidePage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/config'
    ) {
      return handleConfigApi(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/set'
    ) {
      return handleConfigSet(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/toggle'
    ) {
      return handleConfigToggle(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/list'
    ) {
      return handleConfigList(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/pause'
    ) {
      return handleConfigPause(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/users/action'
    ) {
      return handleUserListAction(
        request,
        env
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
      handleUpdate(
        update,
        env,
        requestUrl.origin,
        ctx
      ).catch(
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

    if (Math.random() < 0.01) {
      ctx.waitUntil(
        cleanupDatabase(env)
      );
    }

    if (Math.random() < 0.01) {
      ctx.waitUntil(
        maybeCheckForUpdates(env)
      );
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

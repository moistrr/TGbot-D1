// --- 辅助函数 (D1 数据库抽象层) ---

/**
 * [D1 Abstraction] 获取全局配置 (config table)
 */
async function dbConfigGet(key, env) {
    const row = await env.TG_BOT_DB.prepare("SELECT value FROM config WHERE key = ?").bind(key).first();
    return row ? row.value : null;
  }
  
  /**
  * [D1 Abstraction] 设置/更新全局配置 (config table)
  */
  async function dbConfigPut(key, value, env) {
    // INSERT OR REPLACE 确保如果键已存在则更新，否则插入
    await env.TG_BOT_DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").bind(key, value).run();
  }
  
  /**
  * [D1 Abstraction] 确保用户在 users 表中存在，并返回其数据。
  * 如果用户不存在，则创建默认记录。
  */
  async function dbUserGetOrCreate(userId, env) {
    let user = await env.TG_BOT_DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first();
  
    if (!user) {
        // [⭐️ 修改] 插入默认记录 (包含 is_muted)
        await env.TG_BOT_DB.prepare(
            "INSERT INTO users (user_id, user_state, is_blocked, is_muted, block_count) VALUES (?, 'new', 0, 0, 0)"
        ).bind(userId).run();
        // 重新查询以获取完整的默认记录
        user = await env.TG_BOT_DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first();
    }
    
    // 将 is_blocked 和 is_muted 转换为布尔值，并解析 JSON 字段
    if (user) {
        user.is_blocked = user.is_blocked === 1;
        user.is_muted = user.is_muted === 1; // [⭐️ 新增]
        user.user_info = user.user_info_json ? JSON.parse(user.user_info_json) : null;
    }
    return user;
  }
  
  /**
  * [D1 Abstraction] 更新 users 表中的一个或多个字段
  * data 应该是一个包含要更新字段的对象 { topic_id: '...', user_state: '...' }
  */
  async function dbUserUpdate(userId, data, env) {
    // 确保 user_info_json 是 JSON 字符串
    if (data.user_info) {
        data.user_info_json = JSON.stringify(data.user_info);
        delete data.user_info; // 移除原始对象以避免与 SQL 冲突
    }
    
    // 白名单校验字段名，防止 SQL 注入
    const ALLOWED_COLUMNS = new Set(['topic_id', 'user_state', 'is_blocked', 'is_muted', 'block_count', 'user_info_json']);
    Object.keys(data).forEach(key => {
        if (!ALLOWED_COLUMNS.has(key)) throw new Error(`Invalid column: ${key}`);
    });

    // 构造 SQL 语句
    const fields = Object.keys(data).map(key => {
        // [⭐️ 修改] 特殊处理 is_blocked 和 is_muted (布尔值)
        if ((key === 'is_blocked' || key === 'is_muted') && typeof data[key] === 'boolean') {
             return `${key} = ?`; // D1 存储 0/1
        }
        return `${key} = ?`;
    }).join(', ');
    
    // 构造值数组
    const values = Object.keys(data).map(key => {
         if ((key === 'is_blocked' || key === 'is_muted') && typeof data[key] === 'boolean') {
             return data[key] ? 1 : 0;
         }
         return data[key];
    });
    
    await env.TG_BOT_DB.prepare("UPDATE users SET " + fields + " WHERE user_id = ?").bind(...values, userId).run();
  }
  
  /**
  * [D1 Abstraction] 根据 topic_id 查找 user_id
  */
  async function dbTopicUserGet(topicId, env) {
    const row = await env.TG_BOT_DB.prepare("SELECT user_id FROM users WHERE topic_id = ?").bind(topicId).first();
    return row ? row.user_id : null;
  }
  
  /**
  * [D1 Abstraction] 存入消息数据 (messages table)
  * 用于已编辑消息跟踪。
  */
  async function dbMessageDataPut(userId, messageId, data, env) {
    // data 包含 { text, date }
    await env.TG_BOT_DB.prepare(
        "INSERT OR REPLACE INTO messages (user_id, message_id, text, date) VALUES (?, ?, ?, ?)"
    ).bind(userId, messageId, data.text, data.date).run();
  }
  
  /**
  * [D1 Abstraction] 获取消息数据 (messages table)
  * 用于已编辑消息跟踪。
  */
  async function dbMessageDataGet(userId, messageId, env) {
    const row = await env.TG_BOT_DB.prepare(
        "SELECT text, date FROM messages WHERE user_id = ? AND message_id = ?"
    ).bind(userId, messageId).first();
    return row || null;
  }
  
  /**
  * [D1 Abstraction] 清除管理员编辑状态
  */
  async function dbAdminStateDelete(userId, env) {
    await env.TG_BOT_DB.prepare("DELETE FROM config WHERE key = ?").bind("admin_state:" + userId).run();
  }
  
  /**
  * [D1 Abstraction] 获取管理员编辑状态
  */
  async function dbAdminStateGet(userId, env) {
    const stateJson = await dbConfigGet(`admin_state:${userId}`, env);
    return stateJson || null;
  }
  
  /**
  * [D1 Abstraction] 设置管理员编辑状态
  */
  async function dbAdminStatePut(userId, stateJson, env) {
    await dbConfigPut(`admin_state:${userId}`, stateJson, env);
  }
  
/**
* [D1 Abstraction] D1 数据库迁移/初始化函数
* 确保所需的表存在。
*/
async function dbMigrate(env) {
    // 确保 D1 绑定存在
    if (!env.TG_BOT_DB) {
        throw new Error("D1 database binding 'TG_BOT_DB' is missing.");
    }
    
    // config 表
    const configTableQuery = `
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `;
  
    // users 表 (存储用户状态、话题ID、屏蔽状态和用户信息)
    // [⭐️ 改动] 增加了 info_card_message_id 字段
    const usersTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY NOT NULL,
            user_state TEXT NOT NULL DEFAULT 'new',
            is_blocked INTEGER NOT NULL DEFAULT 0,
            is_muted INTEGER NOT NULL DEFAULT 0,
            block_count INTEGER NOT NULL DEFAULT 0,
            topic_id TEXT,
            info_card_message_id TEXT, 
            user_info_json TEXT 
        );
    `;
    
    // messages 表 (存储消息内容用于处理已编辑消息)
    const messagesTableQuery = `
        CREATE TABLE IF NOT EXISTS messages (
            user_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            text TEXT,
            date INTEGER,
            PRIMARY KEY (user_id, message_id)
        );
    `;
  
    // 按批次执行所有创建表的语句
    try {
        await env.TG_BOT_DB.batch([
            env.TG_BOT_DB.prepare(configTableQuery),
            env.TG_BOT_DB.prepare(usersTableQuery),
            env.TG_BOT_DB.prepare(messagesTableQuery),
        ]);
        
        // [⭐️ 改动] 自动迁移：尝试为旧表添加字段 (is_muted, info_card_message_id)
        // 这样你的旧数据不会丢失，也能用新功能
        const addColumns = [
            "ALTER TABLE users ADD COLUMN is_muted INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN info_card_message_id TEXT",
            "ALTER TABLE users ADD COLUMN block_log_message_id TEXT",
            "ALTER TABLE users ADD COLUMN profile_log_message_id TEXT" // <--- 新增这一行
        ];
  
        for (const query of addColumns) {
            try {
                await env.TG_BOT_DB.prepare(query).run();
            } catch (e) {
                // 如果字段已存在会报错，忽略即可
            }
        }
  
    } catch (e) {
        console.error("D1 Migration Failed:", e);
        throw new Error(`D1 Initialization Failed: ${e.message}`);
    }
  }
  
  
  // --- 辅助函数 ---
  
  function escapeHtml(text) {
  if (!text) return '';
  // Cloudflare Worker 不支持 String.prototype.replaceAll, 使用全局替换
  return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  
  /**
  * [新增] 格式化 Unix 时间戳为本地时间字符串
  */
  function formatTimestamp(timestamp) {
    if (!timestamp) return '时间未知';
    // Telegram timestamps are in seconds
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
  }
  
  function getUserInfo(user, initialTimestamp = null) {
    const userId = user.id.toString();
    const rawName = (user.first_name || "") + (user.last_name ? ` ${user.last_name}` : "");
    const rawUsername = user.username ? `@${user.username}` : "无";
    
    const safeName = escapeHtml(rawName);
    const safeUsername = escapeHtml(rawUsername);
    const safeUserId = escapeHtml(userId);
  
    const topicName = `${rawName.trim()} | ${userId}`.substring(0, 128);
  
    const timestamp = initialTimestamp ? new Date(initialTimestamp * 1000).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');
    
    // 还原为原始代码，不再尝试将文本设为链接
    const infoCard = `
  <b>👤 用户资料卡</b>
  • 用户名: <code>${safeUsername}</code>
  • ID: <code>${safeUserId}</code>
    `.trim();
  
    return { userId, name: rawName, username: rawUsername, topicName, infoCard };
  }
  
/**
* [⭐️ 修改] 生成用户资料卡下方的操作按钮（屏蔽/解禁/置顶/静音）
*/
function getInfoCardButtons(userId, isBlocked, isMuted) {
    const blockAction = isBlocked ? "unblock" : "block";
    const blockText = isBlocked ? "✅ 解除屏蔽" : "🚫 屏蔽此人";
    
    // [⭐️ 新增] 静音按钮逻辑
    const muteAction = isMuted ? "unmute" : "mute";
    const muteText = isMuted ? "🔔 解除静音" : "🔕 静音通知";

    return {
        inline_keyboard: [
            [{ // Row 1: Block + Mute (并排)
                text: blockText,
                callback_data: `${blockAction}:${userId}`
            }, {
                text: muteText,
                callback_data: `${muteAction}:${userId}`
            }],
            [{ // Row 2: View Profile Button
                text: "👤 查看用户资料",
                url: `tg://user?id=${userId}` 
            }],
            [{ // Row 3: Pin Button
                text: "📌 置顶此消息",
                callback_data: `pin_card:${userId}` 
            }]
        ]
    };
}
  
/**
 * [新增] 确保存在一个用于汇总用户资料卡的话题
 */
async function ensureLogTopicExists(env) {
  const logTopicKey = 'user_profile_log_topic_id';
  // 1. 尝试从配置中获取已存在的汇总话题 ID
  let logTopicId = await dbConfigGet(logTopicKey, env);

  // 2. 如果没有，创建一个新的
  if (!logTopicId) {
      try {
          const topic = await telegramApi(env.BOT_TOKEN, "createForumTopic", {
              chat_id: env.ADMIN_GROUP_ID,
              name: "📋 用户资料卡汇总 (User Logs)",
              icon_custom_emoji_id: null // 可选：设置图标
          });
          logTopicId = topic.message_thread_id.toString();
          // 保存到 D1 配置中，避免重复创建
          await dbConfigPut(logTopicKey, logTopicId, env);
      } catch (e) {
          console.error("创建汇总话题失败:", e);
          return null; // 创建失败返回 null
      }
  }
  return logTopicId;
}

/**
 * [⭐️ 新增] 确保存在一个用于管理屏蔽/静音用户的专用话题
 * 用于统计和操作屏蔽/静音名单。
 */
async function ensureBlockLogTopicExists(env) {
    const logTopicKey = 'user_block_log_topic_id';
    let logTopicId = await dbConfigGet(logTopicKey, env);
  
    if (!logTopicId) {
        try {
            const topic = await telegramApi(env.BOT_TOKEN, "createForumTopic", {
                chat_id: env.ADMIN_GROUP_ID,
                name: "🚫 屏蔽与静音名单 (Block/Mute Log)",
                icon_custom_emoji_id: null 
            });
            logTopicId = topic.message_thread_id.toString();
            await dbConfigPut(logTopicKey, logTopicId, env);
        } catch (e) {
            console.error("创建屏蔽名单话题失败:", e);
            return null; 
        }
    }
    return logTopicId;
}
  
  /**
  * 优先从 D1 获取配置，其次从环境变量获取，最后使用默认值。
  */
  async function getConfig(key, env, defaultValue) {
    const configValue = await dbConfigGet(key, env);
    
    // 如果 D1 中有配置，直接返回 D1 的值
    if (configValue !== null) {
        return configValue;
    }
    
    // 如果 D1 中没有，检查环境变量（作为后备或兼容性）
    const envKey = key.toUpperCase()
                      .replace('WELCOME_MSG', 'WELCOME_MESSAGE')
                      .replace('VERIF_Q', 'VERIFICATION_QUESTION')
                      .replace('VERIF_A', 'VERIFICATION_ANSWER')
                      .replace(/_FORWARDING/g, '_FORWARDING');
    
    const envValue = env[envKey];
    if (envValue !== undefined && envValue !== null) {
        return envValue;
    }
    
    // 都没有，返回代码默认值
    return defaultValue;
  }
  
  /**
  * 检查用户是否是主管理员 (来自 ADMIN_IDS 环境变量)
  */
  function isPrimaryAdmin(userId, env) {
    if (!env.ADMIN_IDS) return false;
    // 确保 ADMIN_IDS 是逗号分隔的字符串
    const adminIds = env.ADMIN_IDS.split(',').map(id => id.trim());
    return adminIds.includes(userId.toString());
  }
  
  
  /**
  * [新增] 获取授权协管员 ID 列表
  */
  async function getAuthorizedAdmins(env) {
    const jsonString = await getConfig('authorized_admins', env, '[]');
    try {
        const adminList = JSON.parse(jsonString);
        // 确保列表是有效的数组，并且所有元素都被修剪并转换为字符串
        return Array.isArray(adminList) ? adminList.map(id => id.toString().trim()).filter(id => id !== "") : [];
    } catch (e) {
        console.error("Failed to parse authorized_admins from D1:", e);
        return [];
    }
  }
  
  /**
  * 检查用户是否是任意管理员 (主管理员或授权协管员)
  */
  async function isAdminUser(userId, env) {
    // 1. 检查是否是主管理员 (ADMIN_IDS 环境变量)
    if (isPrimaryAdmin(userId, env)) {
        return true;
    }
  
    // 2. 检查是否是授权协管员 (D1 配置)
    const authorizedAdmins = await getAuthorizedAdmins(env);
    return authorizedAdmins.includes(userId.toString());
  }
  
  
  // --- 规则管理重构区域 ---
  
  /**
  * 获取自动回复规则列表（从 JSON 字符串解析为数组）
  * 结构：[{ keywords: "a|b", response: "reply", id: timestamp }, ...]
  */
  async function getAutoReplyRules(env) {
    // 尝试从 D1 获取配置，默认值是空数组的 JSON 字符串
    const jsonString = await getConfig('keyword_responses', env, '[]');
    try {
        const rules = JSON.parse(jsonString);
        return Array.isArray(rules) ? rules : [];
    } catch (e) {
        console.error("Failed to parse keyword_responses from D1:", e);
        return [];
    }
  }
  
  /**
  * 获取屏蔽关键词列表（从 JSON 字符串解析为数组）
  * 结构：["keyword1|keyword2", "keyword3", ...]
  */
  async function getBlockKeywords(env) {
    // 尝试从 D1 获取配置，默认值是空数组的 JSON 字符串
    const jsonString = await getConfig('block_keywords', env, '[]');
    try {
        const keywords = JSON.parse(jsonString);
        return Array.isArray(keywords) ? keywords : [];
    } catch (e) {
        console.error("Failed to parse block_keywords from D1:", e);
        return [];
    }
  }
  
  
  // --- API 客户端 ---
  
  async function telegramApi(token, methodName, params = {}) {
    const url = `https://api.telegram.org/bot${token}/${methodName}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    });
  
    let data;
    try {
        data = await response.json();
    } catch (e) {
        console.error(`Telegram API ${methodName} 返回非 JSON 响应`);
        throw new Error(`Telegram API ${methodName} returned non-JSON response`);
    }
  
    if (!data.ok) {
        // 捕获 API 错误，用于话题不存在等场景
        // console.error(`Telegram API error (${methodName}): ${data.description}. Params: ${JSON.stringify(params)}`);
        throw new Error(`${methodName} failed: ${data.description || JSON.stringify(data)}`);
    }
  
    return data.result;
  }
  
  
  // --- 核心更新处理函数 ---
  
  export default {
  async fetch(request, env, ctx) {
      // 关键修正：在处理任何请求之前，先运行数据库迁移，确保表结构存在。
      try {
            await dbMigrate(env);
      } catch (e) {
            // 如果迁移失败，直接返回错误，防止后续 D1 调用失败
            return new Response(`D1 Database Initialization Error: ${e.message}`, { status: 500 });
      }
  
      if (request.method === "POST") {
          try {
              const update = await request.json();
              // 使用 ctx.waitUntil 确保异步处理不会被 Worker 提前终止
              ctx.waitUntil(handleUpdate(update, env)); 
          } catch (e) {
              console.error("处理更新时出错:", e);
          }
      }
      return new Response("OK");
  },
  };
  
  async function handleUpdate(update, env) {
    if (update.message) {
        if (update.message.chat.type === "private") {
            await handlePrivateMessage(update.message, env);
        }
        else if (update.message.chat.id.toString() === env.ADMIN_GROUP_ID) {
            await handleAdminReply(update.message, env);
        }
    } else if (update.edited_message) {
        if (update.edited_message.chat.type === "private") {
            await handleRelayEditedMessage(update.edited_message, env);
        }
        // --- 修复点：添加管理员编辑消息的路由 ---
        else if (update.edited_message.chat.id.toString() === env.ADMIN_GROUP_ID) {
            await handleAdminEditedReply(update.edited_message, env);
        }
        // --- 修复点结束 ---
    } else if (update.callback_query) {
        await handleCallbackQuery(update.callback_query, env);
    } 
  }
  
  async function handlePrivateMessage(message, env) {
    const chatId = message.chat.id.toString();
    const text = message.text || "";
    const userId = chatId;
  
    // 检查是否是主管理员 (只有主管理员能访问配置菜单)
    const isPrimary = isPrimaryAdmin(userId, env);
    // 检查是否是任意管理员 (主管理员或授权协管员)
    const isAdmin = await isAdminUser(userId, env);
    
    // 1. 检查 /start 或 /help 命令
    if (text === "/start" || text === "/help") {
        if (isPrimary) { // 只有主管理员能访问配置菜单
            await handleAdminConfigStart(chatId, env);
        } else {
            await handleStart(chatId, env);
        }
        return;
    }
    
    // 从 D1 获取用户数据
    const user = await dbUserGetOrCreate(userId, env);
    const isBlocked = user.is_blocked;
  
    if (isBlocked) {
        return; 
    }
    
    // 主管理员在配置编辑状态中发送的文本输入
    if (isPrimary) {
        const adminStateJson = await dbAdminStateGet(userId, env);
        if (adminStateJson) {
            await handleAdminConfigInput(userId, text, adminStateJson, env);
            return;
        }
        
        // --- 核心修复: 确保主管理员用户跳过验证 ---
        if (user.user_state !== "verified") {
            // 更新本地 user 对象和 D1 数据库
            user.user_state = "verified"; 
            await dbUserUpdate(userId, { user_state: "verified" }, env); 
        }
        // --- 修复结束 ---
    }
    
    // --- [新增] 协管员绕过验证逻辑 ---
    if (isAdmin && user.user_state !== "verified") {
        user.user_state = "verified"; 
        await dbUserUpdate(userId, { user_state: "verified" }, env); 
    }
    // --- [新增] 协管员绕过验证逻辑结束 ---
  
    // 2. 检查用户的验证状态
    const userState = user.user_state;
  
    if (userState === "pending_verification" || 
        (userState === "new" && text && !text.startsWith('/'))) { // <-- 【这里是修复点】
        await handleVerification(chatId, text, env);
    } else if (userState === "verified") {
        
        // --- [关键词屏蔽检查] ---
        const blockKeywords = await getBlockKeywords(env); // 获取 JSON 数组
        const blockThreshold = parseInt(await getConfig('block_threshold', env, "5"), 10) || 5; 
        
        if (blockKeywords.length > 0 && text) { 
            let currentCount = user.block_count;
            
            for (const keyword of blockKeywords) {
                try {
                    // 使用大小写不敏感的字符串包含检测替代 RegExp
                    if (text.toLowerCase().includes(keyword.toLowerCase())) {
                        currentCount += 1;
                        
                        // 更新 D1 中的屏蔽计数
                        await dbUserUpdate(userId, { block_count: currentCount }, env);
                        
                        const blockNotification = `⚠️ 您的消息触发了屏蔽关键词过滤器 (${currentCount}/${blockThreshold}次)，此消息已被丢弃，不会转发给对方。`;
                        
                        if (currentCount >= blockThreshold) {
                            // 达到阈值，自动屏蔽用户 (is_blocked = 1)
                            await dbUserUpdate(userId, { is_blocked: true }, env);
                            const autoBlockMessage = `❌ 您已多次触发屏蔽关键词，根据设置，您已被自动屏蔽。机器人将不再接收您的任何消息。`;
                            
                            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: blockNotification });
                            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: autoBlockMessage });
                            return;
                        }
                        
                        await telegramApi(env.BOT_TOKEN, "sendMessage", {
                            chat_id: chatId,
                            text: blockNotification,
                        });
  
                        return; 
                    }
                } catch(e) {
                    console.error("Invalid keyword block regex:", keyword, e);
                    // 忽略无效的正则，继续检查下一个
                }
            }
        }
  
        // --- [转发内容过滤检查] ---
        const filters = {
            // 媒体类型
            media: (await getConfig('enable_image_forwarding', env, 'true')).toLowerCase() === 'true',
            link: (await getConfig('enable_link_forwarding', env, 'true')).toLowerCase() === 'true',
            text: (await getConfig('enable_text_forwarding', env, 'true')).toLowerCase() === 'true',
            audio_voice: (await getConfig('enable_audio_forwarding', env, 'true')).toLowerCase() === 'true', 
            sticker_gif: (await getConfig('enable_sticker_forwarding', env, 'true')).toLowerCase() === 'true', 
            
            // [⭐️ 新增/修改] 三种细分的转发类型
            user_forward: (await getConfig('enable_user_forwarding', env, 'true')).toLowerCase() === 'true', // 用户转发
            group_forward: (await getConfig('enable_group_forwarding', env, 'true')).toLowerCase() === 'true', // 群组转发
            channel_forward: (await getConfig('enable_channel_forwarding', env, 'true')).toLowerCase() === 'true', // 频道转发
        };
  
        let isForwardable = true;
        let filterReason = '';
  
        const hasLinks = (msg) => {
            const entities = msg.entities || msg.caption_entities || [];
            return entities.some(entity => entity.type === 'url' || entity.type === 'text_link');
        };
  
        // 1. [⭐️ 修改逻辑] 细分转发类型检查
        if (message.forward_from) {
            // 来自“用户”的转发 (forward_from 存在即为用户)
            if (!filters.user_forward) {
                isForwardable = false;
                filterReason = '用户转发消息';
            }
        } else if (message.forward_from_chat) {
            // 来自“对话”的转发 (频道 或 群组)
            const type = message.forward_from_chat.type;
            if (type === 'channel') {
                if (!filters.channel_forward) {
                    isForwardable = false;
                    filterReason = '频道转发消息';
                }
            } else if (type === 'group' || type === 'supergroup') {
                if (!filters.group_forward) {
                    isForwardable = false;
                    filterReason = '群组转发消息';
                }
            }
        }
        // 2. 音频文件和语音消息
        else if (message.audio || message.voice) {
            if (!filters.audio_voice) {
                isForwardable = false;
                filterReason = '音频或语音消息';
            }
        }
        // 3. 贴纸，emojy，gif (sticker, animation)
        else if (message.sticker || message.animation) {
             if (!filters.sticker_gif) {
                isForwardable = false;
                filterReason = '贴纸或GIF';
            }
        }
        // 4. 其他媒体（Photo, Video, Document） - 使用 'media' (原 enable_image_forwarding)
        else if (message.photo || message.video || message.document) {
            if (!filters.media) {
                isForwardable = false;
                filterReason = '媒体内容（图片/视频/文件）';
            }
        } 
        
        // 5. 链接检查 (保留原逻辑，作用于任何包含链接的消息)
        if (isForwardable && hasLinks(message)) {
            if (!filters.link) {
                isForwardable = false;
                filterReason = filterReason ? `${filterReason} (并包含链接)` : '包含链接的内容';
            }
        }
  
        // 6. 纯文本检查 (保留原逻辑)
        // 检查是否是纯文本（排除所有媒体和转发类型）
        const isPureText = message.text && 
                           !message.photo && !message.video && !message.document && 
                           !message.sticker && !message.audio && !message.voice && 
                           !message.forward_from_chat && !message.forward_from && !message.animation; 
        
        if (isForwardable && isPureText) {
            if (!filters.text) {
                isForwardable = false;
                filterReason = '纯文本内容';
            }
        }
  
        if (!isForwardable) {
            const filterNotification = `此消息已被过滤：${filterReason}。根据设置，此类内容不会转发给对方。`;
            await telegramApi(env.BOT_TOKEN, "sendMessage", {
                chat_id: chatId,
                text: filterNotification,
            });
            return; 
        }
        
        // --- [Keyword Auto-Reply Check] ---
        const autoResponseRules = await getAutoReplyRules(env); // 获取 JSON 数组
        if (autoResponseRules.length > 0 && text) { 
            
            for (const rule of autoResponseRules) {
                try {
                    // 使用大小写不敏感的字符串包含检测替代 RegExp
                    if (text.toLowerCase().includes(rule.keywords.toLowerCase())) {
                        const autoReplyPrefix = "此消息为自动回复\n\n";
                        await telegramApi(env.BOT_TOKEN, "sendMessage", {
                            chat_id: chatId,
                            text: autoReplyPrefix + rule.response,
                        });
                        return; 
                    }
                } catch(e) {
                    console.error("Invalid auto-reply regex:", rule.keywords, e);
                    // 忽略无效的正则，继续检查下一个
                }
            }
        }
        
        await handleRelayToTopic(message, user, env); // 传递 user 对象
        
    } else {
        await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: "请使用 /start 命令开始。",
        });
    }
  }
  
  // --- 验证逻辑 (使用 D1) ---
  
  async function handleStart(chatId, env) {
      const welcomeMessage = await getConfig('welcome_msg', env, "欢迎！在使用之前，请先完成人机验证。");
      
      const defaultVerificationQuestion = 
          "问题：1+1=?\n\n" +
          "提示：\n" +
          "1. 正确答案不是“2”。\n" +
          "2. 答案在机器人简介内，请看简介的答案进行回答。";
          
      const verificationQuestion = await getConfig('verif_q', env, defaultVerificationQuestion);
  
      await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: welcomeMessage });
      await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: verificationQuestion });
      
      // 更新 D1 中的用户状态
      await dbUserUpdate(chatId, { user_state: "pending_verification" }, env);
  }
  
  async function handleVerification(chatId, answer, env) {
      // 获取期望答案字符串，例如 "8|27|29"
      const expectedAnswerString = await getConfig('verif_a', env, "3"); 
      
      // 1. 修正后的逻辑：将期望答案字符串按 '|' 分割成数组，
      //    并对每个答案进行去空格和转小写处理。
      const expectedAnswers = expectedAnswerString.split('|').map(a => a.trim().toLowerCase()); 
      
      // 2. 对用户输入的答案进行去空格和转小写处理
      const trimmedAndLowercasedAnswer = answer.trim().toLowerCase();
  
      // 3. 检查用户输入的答案是否在期望答案列表中 (忽略大小写和空格)
      // 只要匹配 expectedAnswers 中的任意一个答案，即为通过
      const isCorrect = expectedAnswers.some(expected => trimmedAndLowercasedAnswer === expected);
  
      if (isCorrect) {
          await telegramApi(env.BOT_TOKEN, "sendMessage", {
              chat_id: chatId,
              text: "🎉 耶！验证成功啦！可以开始聊天咯！",
          });
          // 更新 D1 中的用户状态
          await dbUserUpdate(chatId, { user_state: "verified" }, env);
      } else {
          await telegramApi(env.BOT_TOKEN, "sendMessage", {
              chat_id: chatId,
              text: "🥺 抱歉哦，这次没有猜对呢！ 嘘！🤫 如果简介没有答案，那就在主人的心里哦，快去找主人要答案吧！",
          });
      }
  }
  
  /**
   * [修改] 处理管理员在话题中修改消息的逻辑。
   * 现在会查询原始消息内容和时间，并以详细格式通知用户。
   */
  async function handleAdminEditedReply(editedMessage, env) {
    // 检查是否是话题内的消息
    if (!editedMessage.is_topic_message || !editedMessage.message_thread_id) return;
  
    // 检查是否来自管理员群组
    const adminGroupIdStr = env.ADMIN_GROUP_ID.toString();
    if (editedMessage.chat.id.toString() !== adminGroupIdStr) return;
  
    // 忽略机器人自己的消息
    if (editedMessage.from && editedMessage.from.is_bot) return;
  
    // 检查消息发送者是否是授权协管员或主管理员
    const senderId = editedMessage.from.id.toString();
    const isAuthorizedAdmin = await isAdminUser(senderId, env);
    
    if (!isAuthorizedAdmin) {
        return; 
    }
  
    const topicId = editedMessage.message_thread_id.toString();
    // 从 D1 根据 topic_id 查找 user_id (私聊目标)
    const userId = await dbTopicUserGet(topicId, env);
    if (!userId) return;
  
    // 1. 从消息表中查找原始消息的文本和发送日期
    const messageId = editedMessage.message_id.toString();
    // 使用 user_id (私聊ID) + messageId (管理员群组消息ID) 作为键
    const storedMessage = await dbMessageDataGet(userId, messageId, env);
    if (!storedMessage) return; // 找不到原始消息，无法通知
  
    const newText = editedMessage.text || editedMessage.caption || "[媒体内容]";
  
    // 2. 格式化时间 (使用新增的 formatTimestamp 函数)
    // storedMessage.date 存储的是原发送时间或上次编辑后的时间
    const originalTime = formatTimestamp(storedMessage.date); 
    // editedMessage.edit_date 是本次编辑的时间
    const editTime = formatTimestamp(editedMessage.edit_date || editedMessage.date); 
    
    // 3. 构造通知文本 (使用 HTML 解析模式以支持 <b> 和 <code>)
    const notificationText = `
  ⚠️ <b>管理员编辑了回复</b>
  ---
  <b>原发送/上次编辑时间:</b> <code>${originalTime}</code>
  <b>本次编辑时间:</b> <code>${editTime}</code>
  <b>原消息内容：</b>
  ${escapeHtml(storedMessage.text)}
  <b>新消息内容：</b>
  ${escapeHtml(newText)}
    `.trim();
  
    try {
        await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: userId,
            text: notificationText,
            parse_mode: "HTML",
        });
  
        // 4. 更新消息表中的存储内容 (用于下次编辑时作为"原消息")
        await dbMessageDataPut(userId, messageId, { text: newText, date: editedMessage.edit_date || editedMessage.date }, env);
  
    } catch (e) {
        // 如果发送失败，记录错误
        console.error("handleAdminEditedReply: Failed to send edited message to user:", e?.message || e);
    }
  }
  
  // --- 管理员配置主菜单逻辑 (使用 D1) ---
  
  async function handleAdminConfigStart(chatId, env, messageId = 0) { // <--- MODIFIED: 增加 messageId 参数
    const isPrimary = isPrimaryAdmin(chatId, env);
    if (!isPrimary) {
        // 非主管理员不显示配置菜单
        await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "您是授权协管员，已绕过验证。此菜单仅供主管理员使用。", });
        return;
    }
    
    const menuText = `
  ⚙️ <b>机器人主配置菜单</b>
  
  请选择要管理的配置类别：
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            // 第一行：配置
            [{ text: "📝 基础配置 (验证问答)", callback_data: "config:menu:base" }],
            // 第二行：功能
            [{ text: "🤖 自动回复管理", callback_data: "config:menu:autoreply" }],
            [{ text: "🚫 关键词屏蔽管理", callback_data: "config:menu:keyword" }],
            // 第三行：过滤
            [{ text: "🔗 按类型过滤管理", callback_data: "config:menu:filter" }],
            // 协管员授权设置按钮
            [{ text: "🧑‍💻 协管员授权设置", callback_data: "config:menu:authorized" }], 
            // 备份群组设置按钮
            [{ text: "💾 备份群组设置", callback_data: "config:menu:backup" }], 
            // 第四行：刷新
            [{ text: "🔄 刷新主菜单", callback_data: "config:menu" }],
        ]
    };
  
    // 清除任何未完成的编辑状态
    await dbAdminStateDelete(chatId, env);
  
    // [优化] 统一的编辑/发送逻辑：如果提供了 messageId，则编辑；否则发送新消息。
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    
    // 尝试执行操作，如果编辑失败（如消息已删除），则发送新消息作为回退。
    await telegramApi(env.BOT_TOKEN, apiMethod, params).catch(e => {
        if (apiMethod === "editMessageText") {
            console.warn("Edit main menu failed, attempting to send new message instead:", e.message);
            // Fallback to sending new message (ignore if this also fails)
            delete params.message_id; 
            telegramApi(env.BOT_TOKEN, "sendMessage", params).catch(e2 => console.error("Fallback sendMessage also failed:", e2.message));
        } else {
            console.error("Error sending main menu:", e.message);
        }
    });
  }
  
  /**
  * 基础配置子菜单 - 兼容编辑和发送新消息
  */
  async function handleAdminBaseConfigMenu(chatId, messageId, env) {
    const welcomeMsg = await getConfig('welcome_msg', env, "欢迎！...");
    const verifQ = await getConfig('verif_q', env, "问题：1+1=?...");
    const verifA = await getConfig('verif_a', env, "3");
  
    const menuText = `
  ⚙️ <b>基础配置 (人机验证)</b>
  
  <b>当前设置:</b>
  • 欢迎消息: ${escapeHtml(welcomeMsg).substring(0, 30)}...
  • 验证问题: ${escapeHtml(verifQ).substring(0, 30)}...
  • 验证答案: <code>${escapeHtml(verifA)}</code>
  
  请选择要修改的配置项:
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [{ text: "📝 编辑欢迎消息", callback_data: "config:edit:welcome_msg" }],
            [{ text: "❓ 编辑验证问题", callback_data: "config:edit:verif_q" }],
            [{ text: "🔑 编辑验证答案", callback_data: "config:edit:verif_a" }],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  /**
  * [新增] 协管员授权设置子菜单
  */
  async function handleAdminAuthorizedConfigMenu(chatId, messageId, env) {
    const primaryAdmins = env.ADMIN_IDS ? env.ADMIN_IDS.split(',').map(id => id.trim()).filter(id => id !== "") : [];
    const authorizedAdmins = await getAuthorizedAdmins(env);
    
    const allAdmins = [...new Set([...primaryAdmins, ...authorizedAdmins])]; // 合并并去重
    const authorizedCount = authorizedAdmins.length;
  
    const menuText = `
  🧑‍💻 <b>协管员授权设置</b>
  
  <b>主管理员 (来自 ENV):</b> <code>${primaryAdmins.join(', ')}</code>
  <b>已授权协管员 (来自 D1):</b> <code>${authorizedAdmins.join(', ') || '无'}</code>
  <b>总管理员/协管员数量:</b> ${allAdmins.length} 人
  
  <b>注意：</b>
  1. 协管员 ID 或用户名必须与群组话题中的回复者一致。
  2. 协管员的私聊会自动绕过验证。
  3. 输入格式：ID 或用户名，多个用逗号分隔。
  
  请选择要修改的配置项:
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [{ text: "✏️ 设置/修改协管员列表", callback_data: "config:edit:authorized_admins" }],
            [{ text: `🗑️ 清空协管员列表 (${authorizedCount}人)`, callback_data: "config:edit:authorized_admins_clear" }],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  /**
  * 自动回复子菜单 - 兼容编辑和发送新消息
  */
  async function handleAdminAutoReplyMenu(chatId, messageId, env) {
    const rules = await getAutoReplyRules(env);
    const ruleCount = rules.length;
    
    const menuText = `
  🤖 <b>自动回复管理</b>
  
  当前规则总数：<b>${ruleCount}</b> 条。
  
  请选择操作：
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [{ text: "➕ 新增自动回复规则", callback_data: "config:add:keyword_responses" }],
            [{ text: `🗑️ 管理/删除现有规则 (${ruleCount}条)`, callback_data: "config:list:keyword_responses" }],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  /**
  * 关键词屏蔽子菜单 - 兼容编辑和发送新消息
  */
  async function handleAdminKeywordBlockMenu(chatId, messageId, env) {
    const blockKeywords = await getBlockKeywords(env);
    const keywordCount = blockKeywords.length;
    const blockThreshold = await getConfig('block_threshold', env, "5");
  
    const menuText = `
  🚫 <b>关键词屏蔽管理</b>
  
  当前屏蔽关键词总数：<b>${keywordCount}</b> 个。
  屏蔽次数阈值：<code>${escapeHtml(blockThreshold)}</code> 次。
  
  请选择操作：
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [{ text: "➕ 新增屏蔽关键词", callback_data: "config:add:block_keywords" }],
            [{ text: `🗑️ 管理/删除现有关键词 (${keywordCount}个)`, callback_data: "config:list:block_keywords" }],
            [{ text: `✏️ 修改屏蔽次数阈值 (${blockThreshold}次)`, callback_data: "config:edit:block_threshold" }],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  /**
  * [新增] 备份群组配置菜单
  */
  async function handleAdminBackupConfigMenu(chatId, messageId, env) {
    const backupGroupId = await getConfig('backup_group_id', env, "");
    
    const statusText = backupGroupId ? `✅ 已设置: <code>${escapeHtml(backupGroupId)}</code>` : "❌ 未设置";
  
    const menuText = `
  💾 <b>消息备份群组设置</b>
  
  <b>当前群组 ID:</b> ${statusText}
  
  <b>注意：</b>
  1. 群组必须是超级群组，且 Bot 必须是管理员。
  2. 设置后，所有用户消息的副本都会转发到此群组。
  
  请选择操作：
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [{ text: "✏️ 设置/修改备份群组 ID", callback_data: "config:edit:backup_group_id" }],
            [{ text: "🗑️ 清除备份群组 ID", callback_data: "config:edit:backup_group_id_clear" }],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  
  /**
  * [新增] 规则列表和删除界面
  */
  async function handleAdminRuleList(chatId, messageId, env, key) {
    let rules = [];
    let menuText = "";
    let backCallback = "";
    if (key === 'keyword_responses') {
        rules = await getAutoReplyRules(env);
        menuText = `
  🤖 <b>自动回复规则列表 (${rules.length}条)</b>
  请点击右侧按钮删除对应规则。
  因为数据库限制，点击删除后界面不会刷新实际已经执行
  请点击返回上一级菜单后重新进入就可以看到了
  规则格式：<code>关键词表达式</code> ➡️ <code>回复内容</code>
  ---
  `.trim();
        backCallback = "config:menu:autoreply";
    } else if (key === 'block_keywords') {
        rules = await getBlockKeywords(env);
        menuText = `
  🚫 <b>屏蔽关键词列表 (${rules.length}个)</b>
  请点击右侧按钮删除对应关键词。
  因为数据库限制，点击删除后界面不会刷新实际已经执行
  请点击返回上一级菜单后重新进入就可以看到了
  关键词格式：<code>关键词表达式</code>
  ---
  `.trim();
        backCallback = "config:menu:keyword";
    } else {
        return;
    }
  
    const ruleButtons = [];
    if (rules.length === 0) {
        menuText += "\n\n<i>（列表为空）</i>";
    } else {
        rules.forEach((rule, index) => {
            let label = "";
            let deleteId = "";
            if (key === 'keyword_responses') {
                // 自动回复规则：使用 ID 进行删除
                const keywordsSnippet = rule.keywords.substring(0, 15);
                const responseSnippet = rule.response.substring(0, 20);
                label = `${index + 1}. <code>${escapeHtml(keywordsSnippet)}...</code> ➡️ ${escapeHtml(responseSnippet)}...`;
                deleteId = rule.id;
            } else if (key === 'block_keywords') {
                // 屏蔽关键词：直接使用关键词字符串作为 ID (确保唯一)
                const keywordSnippet = rule.substring(0, 25);
                label = `${index + 1}. <code>${escapeHtml(keywordSnippet)}...</code>`;
                deleteId = rule;
            }
  
            // 添加列表信息到文本
            menuText += `\n${label}`;
  
            // 添加删除按钮
            ruleButtons.push([
                { 
                    text: `🗑️ 删除 ${index + 1}`,
                    // config:delete:key:value_to_delete
                    callback_data: `config:delete:${key}:${deleteId}`
                }
            ]);
        });
    }
  
    const finalKeyboard = {
        inline_keyboard: [
            ...ruleButtons,
            [{ text: "⬅️ 返回", callback_data: backCallback }]
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: finalKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
  }
  
  /**
  * [新增] 处理关键词和自动回复的删除操作
  */
  async function handleAdminRuleDelete(chatId, messageId, env, key, deleteValue) {
    let rules = [];
    let typeName = "";
  
    if (key === 'keyword_responses') {
        rules = await getAutoReplyRules(env);
        typeName = "自动回复规则";
        // 自动回复规则按 ID (时间戳) 删除
        const newRules = rules.filter(rule => rule.id.toString() !== deleteValue.toString());
        await dbConfigPut(key, JSON.stringify(newRules), env);
    } else if (key === 'block_keywords') {
        rules = await getBlockKeywords(env);
        typeName = "屏蔽关键词";
        // 屏蔽关键词按字符串内容删除
        const newRules = rules.filter(keyword => keyword !== deleteValue);
        await dbConfigPut(key, JSON.stringify(newRules), env);
    } else {
        return;
    }
  
    await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", {
        callback_query_id: chatId,
        text: `✅ ${typeName}已删除并更新。`,
        show_alert: false
    });
  
    // 刷新列表菜单
    await handleAdminRuleList(chatId, messageId, env, key);
  }
  
/**
* 按类型过滤子菜单 - [⭐️ 现代美化版]
* 放弃强制对齐的表格，使用清爽的列表样式
*/
async function handleAdminTypeBlockMenu(chatId, messageId, env) {
    // 获取当前状态
    const mediaStatus = (await getConfig('enable_image_forwarding', env, 'true')).toLowerCase() === 'true'; 
    const linkStatus = (await getConfig('enable_link_forwarding', env, 'true')).toLowerCase() === 'true';
    const textStatus = (await getConfig('enable_text_forwarding', env, 'true')).toLowerCase() === 'true';
    const audioVoiceStatus = (await getConfig('enable_audio_forwarding', env, 'true')).toLowerCase() === 'true';
    const stickerGifStatus = (await getConfig('enable_sticker_forwarding', env, 'true')).toLowerCase() === 'true';
    const userForwardStatus = (await getConfig('enable_user_forwarding', env, 'true')).toLowerCase() === 'true'; 
    const groupForwardStatus = (await getConfig('enable_group_forwarding', env, 'true')).toLowerCase() === 'true'; 
    const channelForwardStatus = (await getConfig('enable_channel_forwarding', env, 'true')).toLowerCase() === 'true'; 
  
    // [⭐️ 样式优化] 状态显示：前面放 Emoji，文字简短
    // 这种格式： "✅ 允许" 或 "❌ 屏蔽"
    const s = (status) => status ? "✅ <b>允许</b>" : "❌ <b>屏蔽</b>";
    
    // 回调数据构造
    const cb = (key, status) => `config:toggle:${key}:${status ? 'false' : 'true'}`;
    
    // 按钮上的文字（为了按钮整齐，按钮上可以保留纯文字描述）
    const btnText = (status) => status ? "✅ 允许" : "❌ 屏蔽";
  
    // [⭐️ 核心修改] 现代列表排版
    // 1. 移除 <pre> 标签（去掉灰色背景）
    // 2. 使用 序号. 状态 | 项目名称 的格式
    // 3. 加粗项目名称，突出重点
    const menuText = `
🔗 <b>按类型过滤管理</b>
点击下方按钮切换状态。

<b>--- 转发来源控制 ---</b>
1. ${s(userForwardStatus)} | 转发消息 (用户)
2. ${s(groupForwardStatus)} | 转发消息 (群组)
3. ${s(channelForwardStatus)} | 转发消息 (频道)

<b>--- 媒体类型控制 ---</b>
4. ${s(audioVoiceStatus)} | 音频/语音消息
5. ${s(stickerGifStatus)} | 贴纸/GIF (动画)
6. ${s(mediaStatus)} | 图片/视频/文件

<b>--- 基础内容控制 ---</b>
7. ${s(linkStatus)} | 链接消息
8. ${s(textStatus)} | 纯文本消息
    `.trim();
  
    const menuKeyboard = {
        inline_keyboard: [
            [
                { text: `1. ${btnText(userForwardStatus)}`, callback_data: cb('enable_user_forwarding', userForwardStatus) },
                { text: `2. ${btnText(groupForwardStatus)}`, callback_data: cb('enable_group_forwarding', groupForwardStatus) }
            ],
            [
                { text: `3. ${btnText(channelForwardStatus)}`, callback_data: cb('enable_channel_forwarding', channelForwardStatus) },
                { text: `4. ${btnText(audioVoiceStatus)}`, callback_data: cb('enable_audio_forwarding', audioVoiceStatus) }
            ],
            [
                { text: `5. ${btnText(stickerGifStatus)}`, callback_data: cb('enable_sticker_forwarding', stickerGifStatus) },
                { text: `6. ${btnText(mediaStatus)}`, callback_data: cb('enable_image_forwarding', mediaStatus) }
            ],
            [
                { text: `7. ${btnText(linkStatus)}`, callback_data: cb('enable_link_forwarding', linkStatus) },
                { text: `8. ${btnText(textStatus)}`, callback_data: cb('enable_text_forwarding', textStatus) }
            ],
            [{ text: "⬅️ 返回主菜单", callback_data: "config:menu" }],
        ]
    };
  
    const apiMethod = (messageId && messageId !== 0) ? "editMessageText" : "sendMessage";
    const params = {
        chat_id: chatId,
        text: menuText,
        parse_mode: "HTML",
        reply_markup: menuKeyboard,
    };
    if (apiMethod === "editMessageText") {
        params.message_id = messageId;
    }
    await telegramApi(env.BOT_TOKEN, apiMethod, params);
}
  
  
  /**
  * 处理主管理员的配置输入 (处于等待输入状态)
  */
  async function handleAdminConfigInput(userId, text, adminStateJson, env) {
    let adminState;
    try {
        adminState = JSON.parse(adminStateJson);
    } catch (e) {
        // ... (处理错误状态的逻辑) ...
        await dbAdminStateDelete(userId, env);
        await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "⚠️ 状态错误，已重置。请重新使用 /start 访问菜单。", });
        return;
    }
  
    if (adminState.action === 'awaiting_input') {
        
        let successMsg = "";
        let finalValue = text;
        
        // --- 特殊处理: 清除状态后返回对应的菜单 ---
        if (text.toLowerCase() === '/cancel') {
            await dbAdminStateDelete(userId, env);
            let cancelBack = "config:menu"; 
            if (adminState.key === 'block_keywords_add') { cancelBack = "config:menu:keyword"; }
            else if (adminState.key === 'keyword_responses_add') { cancelBack = "config:menu:autoreply"; }
            
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "❌ 已取消输入。", });
            // 自动跳转到取消前的菜单
            if (cancelBack === 'config:menu:keyword') { await handleAdminKeywordBlockMenu(userId, 0, env); }
            else if (cancelBack === 'config:menu:autoreply') { await handleAdminAutoReplyMenu(userId, 0, env); }
            else { await handleAdminConfigStart(userId, env); }
            return;
        }
        
        // --- 文本值处理 ---
        if (adminState.key === 'verif_a' || adminState.key === 'block_threshold') {
            finalValue = text.trim(); // 阈值和答案仅移除首尾空格
        } else if (adminState.key === 'backup_group_id') {
            finalValue = text.trim(); // 备份群组 ID 仅移除首尾空格
        } else if (adminState.key === 'authorized_admins') {
            // 将输入字符串按逗号分隔，并去除空格和空项，最终存储为 JSON 数组
            const adminList = text.split(',').map(id => id.trim()).filter(id => id !== "");
            finalValue = JSON.stringify(adminList); // 存储 JSON 字符串
        }
  
        // --- 新增规则逻辑 --- 
        if (adminState.key === 'block_keywords_add') {
            const blockKeywords = await getBlockKeywords(env);
            const newKeyword = finalValue.trim();
            if (newKeyword && !blockKeywords.includes(newKeyword)) {
                blockKeywords.push(newKeyword);
                await dbConfigPut('block_keywords', JSON.stringify(blockKeywords), env);
                successMsg = `✅ 屏蔽关键词 <code>${escapeHtml(newKeyword)}</code> 已添加。`;
            } else {
                successMsg = `⚠️ 屏蔽关键词未添加，内容为空或已存在。`;
            }
            // 清除状态
            await dbAdminStateDelete(userId, env);
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: successMsg, parse_mode: "HTML" });
            await handleAdminKeywordBlockMenu(userId, 0, env);
            return;
        } else if (adminState.key === 'keyword_responses_add') {
            const rules = await getAutoReplyRules(env);
            // 格式: 关键词===回复内容
            const parts = finalValue.split('===');
            if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
                const newRule = { 
                    keywords: parts[0].trim(), 
                    response: parts[1].trim(), 
                    id: Date.now(), // 使用时间戳作为唯一ID 
                };
                rules.push(newRule);
                await dbConfigPut('keyword_responses', JSON.stringify(rules), env);
                successMsg = `✅ 自动回复规则已添加。关键词: <code>${escapeHtml(newRule.keywords)}</code>`;
            } else {
                successMsg = `⚠️ 自动回复规则未添加。请确保格式正确：<code>关键词表达式===回复内容</code>`;
            }
            // 清除状态
            await dbAdminStateDelete(userId, env);
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: successMsg, parse_mode: "HTML" });
            await handleAdminAutoReplyMenu(userId, 0, env);
            return;
        }
        
        // --- 一般配置项处理 ---
        if (finalValue.length === 0 && adminState.key !== 'backup_group_id') {
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "⚠️ 输入内容不能为空，请重新发送。", });
            return;
        }
  
        // 存储到 D1
        await dbConfigPut(adminState.key, finalValue, env);
        await dbAdminStateDelete(userId, env); // 清除状态
  
        successMsg = `✅ 配置项 <code>${adminState.key}</code> 已更新。新值：<code>${escapeHtml(finalValue).substring(0, 50)}...</code>`;
        await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: successMsg, parse_mode: "HTML" });
  
        // 自动跳转到对应的子菜单
        let nextMenuAction = '';
        if (adminState.key === 'welcome_msg' || adminState.key === 'verif_q' || adminState.key === 'verif_a') {
            nextMenuAction = 'config:menu:base';
        } else if (adminState.key === 'block_threshold') {
            nextMenuAction = 'config:menu:keyword';
        } else if (adminState.key === 'backup_group_id') {
            nextMenuAction = 'config:menu:backup'; // 备份群组 ID 菜单跳转
        } else if (adminState.key === 'authorized_admins') {
            nextMenuAction = 'config:menu:authorized'; // [新增] 协管员授权列表菜单跳转
        }
  
        // 发送一个新的菜单消息，实现自动跳转。
        if (nextMenuAction === 'config:menu:base') {
            await handleAdminBaseConfigMenu(userId, 0, env);
        } else if (nextMenuAction === 'config:menu:autoreply') {
            await handleAdminAutoReplyMenu(userId, 0, env);
        } else if (nextMenuAction === 'config:menu:keyword') {
            await handleAdminKeywordBlockMenu(userId, 0, env);
        } else if (nextMenuAction === 'config:menu:backup') {
            await handleAdminBackupConfigMenu(userId, 0, env);
        } else if (nextMenuAction === 'config:menu:authorized') {
            await handleAdminAuthorizedConfigMenu(userId, 0, env);
        } else {
            await handleAdminConfigStart(userId, env); // 返回主菜单
        }
    } else {
        // 删除状态
        await dbAdminStateDelete(userId, env);
        // 此处错误提示已修复，不会出现 D1_ERROR:no such table:admin_state:SQLITE_ERROR
        await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "⚠️ 状态错误，已重置。请重新使用 /start 访问菜单。", });
    }
  }
  
  async function handleRelayToTopic(message, user, env) { 
    const { from: userDetails, date } = message;
    const { userId, topicName, infoCard } = getUserInfo(userDetails, date);
    let topicId = user.topic_id;
    const isBlocked = user.is_blocked;
    const isMuted = user.is_muted || false; 
  
    const createTopicForUser = async () => {
        try {
            const newTopic = await telegramApi(env.BOT_TOKEN, "createForumTopic", {
                chat_id: env.ADMIN_GROUP_ID,
                name: topicName,
            });
            const newTopicId = newTopic.message_thread_id.toString();
            const { name, username } = getUserInfo(userDetails, date);
            const newInfo = { name, username, first_message_date: date };
  
            const cardMarkup = getInfoCardButtons(userId, isBlocked, isMuted);
            
            // [⭐️ 改动] 发送资料卡并获取返回的消息对象 sentMsg
            const sentMsg = await telegramApi(env.BOT_TOKEN, "sendMessage", {
                chat_id: env.ADMIN_GROUP_ID,
                message_thread_id: newTopicId,
                text: infoCard,
                parse_mode: "HTML",
                reply_markup: cardMarkup,
            });

            // [⭐️ 改动] 将 info_card_message_id 保存到数据库
            await dbUserUpdate(userId, { 
                topic_id: newTopicId, 
                user_info_json: JSON.stringify(newInfo), 
                block_count: 0,
                info_card_message_id: sentMsg.message_id.toString() // 关键：保存ID用于后续同步
            }, env);

            // --- [ 汇总话题逻辑 ] ---
            try {
                let logTopicId = await ensureLogTopicExists(env);
                if (logTopicId) {
                    const cleanGroupId = env.ADMIN_GROUP_ID.toString().replace(/^-100/, '');
                    const jumpUrl = `https://t.me/c/${cleanGroupId}/${newTopicId}`;
                    const logMarkup = JSON.parse(JSON.stringify(cardMarkup));
                    logMarkup.inline_keyboard.push([{ text: "💬 跳转到会话窗口", url: jumpUrl }]);
                    const logText = `<b>#新用户连接</b>\n话题ID: <code>${newTopicId}</code>\n\n${infoCard}`;
                    
                    // 尝试发送
                    const sendParams = { chat_id: env.ADMIN_GROUP_ID, message_thread_id: logTopicId, text: logText, parse_mode: "HTML", reply_markup: logMarkup };
                    try {
                        // [⭐️ 关键修改] 获取发送结果，并保存 ID 到 profile_log_message_id
                        const logMsg = await telegramApi(env.BOT_TOKEN, "sendMessage", sendParams);
                        await dbUserUpdate(userId, { profile_log_message_id: logMsg.message_id.toString() }, env);
                    } catch (sendErr) {
                        // 简单的错误重试逻辑
                        const errStr = sendErr.message || sendErr.toString();
                        if (errStr.includes("thread not found") || errStr.includes("TOPIC_DELETED")) {
                                await env.TG_BOT_DB.prepare("DELETE FROM config WHERE key = ?").bind('user_profile_log_topic_id').run();
                                logTopicId = await ensureLogTopicExists(env);
                                if (logTopicId) {
                                    sendParams.message_thread_id = logTopicId;
                                    const retryMsg = await telegramApi(env.BOT_TOKEN, "sendMessage", sendParams);
                                    // 重试成功也要保存 ID
                                    await dbUserUpdate(userId, { profile_log_message_id: retryMsg.message_id.toString() }, env);
                                }
                        }
                    }
                }
            } catch (logErr) {
                console.error("发送资料卡到汇总话题失败:", logErr);
            }
            // --- [ 结束 ] ---

            return newTopicId;
        } catch (e) {
            console.error("创建话题失败:", e?.message || e);
            throw e;
        }
    };
  
    const tryCopyToTopic = async (targetTopicId) => {
        const copyResult = await telegramApi(env.BOT_TOKEN, "copyMessage", {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id: targetTopicId,
            from_chat_id: userId,
            message_id: message.message_id,
            // [⭐️ 改动] 如果被屏蔽或被静音，则静默发送
            disable_notification: isBlocked || isMuted, 
        });
        return copyResult.message_id.toString();
    };
  
    if (!topicId) {
        try {
            topicId = await createTopicForUser();
        } catch (e) {
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "抱歉，无法创建客服话题（请稍后再试）。", });
            return;
        }
    }
  
    try {
        const adminMessageId = await tryCopyToTopic(topicId);
        if (message.text || message.caption) {
            const messageData = { text: message.text || message.caption || '', date: message.date };
            await dbMessageDataPut(userId, message.message_id.toString(), messageData, env); 
        }
    } catch (e) {
        try {
            await dbUserUpdate(userId, { topic_id: null }, env); 
            const newTopicId = await createTopicForUser();
            try {
                await tryCopyToTopic(newTopicId);
                if (message.text || message.caption) {
                    const messageData = { text: message.text || message.caption || '', date: message.date };
                    await dbMessageDataPut(userId, message.message_id.toString(), messageData, env); 
                }
            } catch (e2) {
                await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "抱歉，消息转发失败（请稍后再试或联系管理员）。", });
                return;
            }
        } catch (createErr) {
            await telegramApi(env.BOT_TOKEN, "sendMessage", { chat_id: userId, text: "抱歉，无法创建新的客服话题（请稍后再试）。", });
            return;
        }
    }
  
    // --- 备份逻辑保持原样 ---
    const backupGroupId = await getConfig('backup_group_id', env, "");
    if (backupGroupId) {
        const userInfo = getUserInfo(message.from, user.date);
        const fromUserHeader = ` 
  <b>--- 备份消息 ---</b>
  👤 <b>来自用户:</b> <a href="tg://user?id=${userInfo.userId}">${userInfo.name || '无昵称'}</a> • ID: <code>${userInfo.userId}</code> • 用户名: ${userInfo.username} 
  ------------------
  `.trim() + '\n\n';
        const backupParams = { chat_id: backupGroupId, disable_notification: true, parse_mode: "HTML", };
        try {
            if (message.text) {
                const combinedText = fromUserHeader + message.text;
                await telegramApi(env.BOT_TOKEN, "sendMessage", { ...backupParams, text: combinedText, });
            } else if (message.caption || message.photo || message.video || message.document || message.audio || message.voice || message.sticker || message.animation) {
               await telegramApi(env.BOT_TOKEN, "sendMessage", { ...backupParams, text: fromUserHeader.trim(), parse_mode: "HTML", });
               await telegramApi(env.BOT_TOKEN, "copyMessage", { chat_id: backupGroupId, from_chat_id: userId, message_id: message.message_id, });
            }
        } catch (e) {
            console.error("消息备份转发失败:", e?.message || e);
        }
    }
}
  
  /**
  * 处理用户在私聊中修改消息的逻辑。
  */
  async function handleRelayEditedMessage(editedMessage, env) {
    const { from: user } = editedMessage;
    const userId = user.id.toString();
  
    // 获取用户数据
    const userData = await dbUserGetOrCreate(userId, env);
    const topicId = userData.topic_id;
  
    if (!topicId) {
        return;
    }
  
    // 从 D1 的 messages 表获取原始消息数据
    const storedData = await dbMessageDataGet(userId, editedMessage.message_id.toString(), env);
    let originalText = "[原始内容无法获取/非文本内容]";
    let originalDate = "[发送时间无法获取]";
    
    if (storedData) {
        originalText = storedData.text || originalText;
        originalDate = formatTimestamp(storedData.date); 
        
        // 更新 D1，将新内容存储为该消息的最新“原始”内容
        const updatedData = { 
            text: editedMessage.text || editedMessage.caption || '', 
            date: editedMessage.date // 存储原发送时间
        };
        await dbMessageDataPut(userId, editedMessage.message_id.toString(), updatedData, env);
    }
    
    const newContent = editedMessage.text || editedMessage.caption || "[非文本/媒体说明内容]";
  
    const notificationText = `
  ⚠️ <b>用户消息已修改</b>
  <b>原消息发送时间:</b> <code>${originalDate}</code>
  <b>原始信息:</b> <code>${originalText}</code>
  <b>修改后的新内容:</b>
  ${escapeHtml(newContent)}
    `.trim();
  
    try {
        await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: env.ADMIN_GROUP_ID,
            text: notificationText,
            message_thread_id: topicId,
            parse_mode: "HTML",
        });
    } catch (e) {
        console.error("handleRelayEditedMessage failed:", e?.message || e);
    }
  }
  
  
  /**
  * 将管理员在话题中的回复转发回用户。
  */
  async function handleAdminReply(message, env) {
    // 检查是否是话题内的消息
    if (!message.is_topic_message || !message.message_thread_id) return; 
  
    // 检查是否来自管理员群组
    const adminGroupIdStr = env.ADMIN_GROUP_ID.toString();
    if (message.chat.id.toString() !== adminGroupIdStr) return;
  
    // 忽略机器人自己的消息
    if (message.from && message.from.is_bot) return;
  
    // 检查消息发送者是否是授权协管员或主管理员
    const senderId = message.from.id.toString();
    const isAuthorizedAdmin = await isAdminUser(senderId, env);
    
    if (!isAuthorizedAdmin) {
        // 非管理员发送的消息，忽略
        return; 
    }
  
    // 从 D1 根据 message_thread_id 查找 user_id
    const topicId = message.message_thread_id.toString();
    const userId = await dbTopicUserGet(topicId, env);
  
    if (!userId) {
        // 找不到对应的用户，无法转发
        await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: adminGroupIdStr,
            message_thread_id: topicId,
            text: "❌ 找不到该话题对应的用户 ID，无法转发消息。",
        });
        return;
    }
  
    // --- 消息转发逻辑 ---
    try {
        if (message.text) {
             await telegramApi(env.BOT_TOKEN, "sendMessage", {
                chat_id: userId,
                text: message.text,
            });
        } else if (message.photo) {
            await telegramApi(env.BOT_TOKEN, "sendPhoto", {
                chat_id: userId,
                photo: message.photo[message.photo.length - 1].file_id, // 发送最高分辨率的图片
                caption: message.caption || "",
            });
        } else if (message.video) {
            await telegramApi(env.BOT_TOKEN, "sendVideo", {
                chat_id: userId,
                video: message.video.file_id,
                caption: message.caption || "",
            });
        } else if (message.audio) {
            await telegramApi(env.BOT_TOKEN, "sendAudio", {
                chat_id: userId,
                audio: message.audio.file_id,
                caption: message.caption || "",
            });
        } else if (message.voice) {
            await telegramApi(env.BOT_TOKEN, "sendVoice", {
                chat_id: userId,
                voice: message.voice.file_id,
                caption: message.caption || "",
            });
        } else if (message.sticker) {
            await telegramApi(env.BOT_TOKEN, "sendSticker", {
                chat_id: userId,
                sticker: message.sticker.file_id,
            });
        } else if (message.animation) {
            await telegramApi(env.BOT_TOKEN, "sendAnimation", {
                chat_id: userId,
                animation: message.animation.file_id,
                caption: message.caption || "",
            });
        } 
        // [⭐️ 修复开始] 添加对文件/文档 (txt, yaml, pdf, zip等) 的支持
        else if (message.document) {
            await telegramApi(env.BOT_TOKEN, "sendDocument", {
                chat_id: userId,
                document: message.document.file_id,
                caption: message.caption || "",
            });
        }
        // [⭐️ 修复结束]
        else {
            await telegramApi(env.BOT_TOKEN, "sendMessage", {
                chat_id: userId,
                text: "管理员发送了机器人无法直接转发的内容（例如投票或某些特殊媒体）。",
            });
        }
    } catch (e2) {
        console.error("handleAdminReply fallback also failed:", e2?.message || e2);
        // 如果转发失败，通知管理员
        await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: adminGroupIdStr,
            message_thread_id: topicId,
            text: `❌ 转发消息给用户 ${userId} 失败: ${e2.message || e2}`,
        });
    }
    
    // [新增] 存储消息原始内容到 messages 表 (用于处理管理员编辑消息)
    // 存储管理员发送的消息内容，以便管理员下次编辑时可以进行对比和更新。
    try {
        if (message.text || message.caption) {
            const messageData = { 
                text: message.text || message.caption || '', 
                date: message.date 
            };
            // 存储的 user_id 是私聊用户 ID，message_id 是管理员群组中消息的 ID
            await dbMessageDataPut(userId, message.message_id.toString(), messageData, env); 
        }
    } catch (e) {
        console.error("Failed to store admin message data for edit tracking:", e?.message || e);
    }
  }

  
  // --- 回调查询处理函数 ---

  /**
 * [⭐️ 新增] 同步状态到屏蔽/静音名单话题
 * 实现了：如果存在则编辑，不存在则发送，话题丢失自动重建
 */
async function syncToBlockLog(userId, user, isBlocked, isMuted, env) {
    const blockLogTopicId = await ensureBlockLogTopicExists(env);
    if (!blockLogTopicId) return;

    // 准备内容
    const userName = user.user_info?.name || userId;
    const jumpUrl = `https://t.me/c/${env.ADMIN_GROUP_ID.toString().replace(/^-100/, '')}/${user.topic_id}`;
    
    // 生成状态文本
    let statusText = "";
    if (isBlocked) statusText += "🚫 <b>用户被屏蔽</b>";
    else if (isMuted) statusText += "🔕 <b>用户被静音</b>";
    else statusText += "✅ <b>用户正常 (无屏蔽/无静音)</b>";

    const logText = `${statusText}\n` +
                    `用户: <a href="tg://user?id=${userId}">${escapeHtml(userName)}</a>\n` +
                    `ID: <code>${userId}</code>`;

    // 生成按钮 (包含跳转链接)
    const buttons = getInfoCardButtons(userId, isBlocked, isMuted);
    const logMarkup = JSON.parse(JSON.stringify(buttons));
    if (user.topic_id) {
        logMarkup.inline_keyboard.push([{ text: "💬 跳转到会话窗口", url: jumpUrl }]);
    }

    // 获取之前存储的日志消息 ID
    const storedLogMsgId = user.block_log_message_id;

    // 内部函数：尝试发送新消息并保存 ID
    const sendNewLog = async (targetTopicId) => {
        const sentMsg = await telegramApi(env.BOT_TOKEN, "sendMessage", {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id: targetTopicId,
            text: logText,
            parse_mode: "HTML",
            reply_markup: logMarkup
        });
        // 保存新的消息 ID 到数据库
        await dbUserUpdate(userId, { block_log_message_id: sentMsg.message_id.toString() }, env);
    };

    // 逻辑 A: 如果之前发过，尝试编辑
    if (storedLogMsgId) {
        try {
            await telegramApi(env.BOT_TOKEN, "editMessageText", {
                chat_id: env.ADMIN_GROUP_ID,
                message_id: storedLogMsgId,
                text: logText,
                parse_mode: "HTML",
                reply_markup: logMarkup
            });
            return; // 编辑成功，直接结束
        } catch (e) {
            console.warn("编辑屏蔽日志失败 (可能是消息已删)，转为发送新消息:", e.message);
            // 编辑失败（消息可能被删了），清除旧 ID，继续执行发送新消息逻辑
            await dbUserUpdate(userId, { block_log_message_id: null }, env);
        }
    }

    // 逻辑 B: 发送新消息 (或编辑失败后的回退)
    try {
        await sendNewLog(blockLogTopicId);
    } catch (e) {
        const errStr = e.message || e.toString();
        // 话题丢失处理
        if (errStr.includes("thread not found") || errStr.includes("TOPIC_DELETED")) {
             console.warn("屏蔽名单话题失效，尝试重建...");
             await env.TG_BOT_DB.prepare("DELETE FROM config WHERE key = ?").bind('user_block_log_topic_id').run();
             const newLogId = await ensureBlockLogTopicExists(env);
             if (newLogId) {
                 await sendNewLog(newLogId); // 重试发送
             }
        }
    }
}
  
// [⭐️ 修改 3] 完全替换 handleCallbackQuery 函数
async function handleCallbackQuery(callbackQuery, env) {
    const chatId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;
    const message = callbackQuery.message;
  
    // 1. 权限检查
    const isAdmin = await isAdminUser(chatId, env);
    if (!isAdmin) {
        await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "您无权操作此菜单。", show_alert: true });
        return;
    }
    
    // 2. 配置菜单处理 (保持不变)
    if (data.startsWith('config:')) {
        const parts = data.split(':');
        const actionType = parts[1]; 
        const keyOrAction = parts[2]; 
        const value = parts[3]; 
  
        await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "处理中...", show_alert: false });
  
        if (actionType === 'menu') {
            if (keyOrAction === 'base') { await handleAdminBaseConfigMenu(chatId, message.message_id, env); } 
            else if (keyOrAction === 'autoreply') { await handleAdminAutoReplyMenu(chatId, message.message_id, env); } 
            else if (keyOrAction === 'keyword') { await handleAdminKeywordBlockMenu(chatId, message.message_id, env); } 
            else if (keyOrAction === 'filter') { await handleAdminTypeBlockMenu(chatId, message.message_id, env); } 
            else if (keyOrAction === 'backup') { await handleAdminBackupConfigMenu(chatId, message.message_id, env); } 
            else if (keyOrAction === 'authorized') { await handleAdminAuthorizedConfigMenu(chatId, message.message_id, env); } 
            else { await handleAdminConfigStart(chatId, env, message.message_id); }
        } else if (actionType === 'toggle' && keyOrAction && value) {
            await dbConfigPut(keyOrAction, value, env);
            await handleAdminTypeBlockMenu(chatId, message.message_id, env); 
        } else if (actionType === 'edit' && keyOrAction) {
            if (keyOrAction === 'backup_group_id_clear') {
                await dbConfigPut('backup_group_id', '', env); 
                await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "✅ 备份群组 ID 已清除。", show_alert: false });
                await handleAdminBackupConfigMenu(chatId, message.message_id, env);
                return;
            }
            if (keyOrAction === 'authorized_admins_clear') {
                await dbConfigPut('authorized_admins', '[]', env); 
                await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "✅ 协管员列表已清除。", show_alert: false });
                await handleAdminAuthorizedConfigMenu(chatId, message.message_id, env);
                return;
            }
            await dbAdminStatePut(chatId, JSON.stringify({ action: 'awaiting_input', key: keyOrAction }), env);
            let prompt = `请发送**新的** <code>${keyOrAction}</code> **值**：`;
            let cancelBack = "config:menu";
            if (keyOrAction === 'welcome_msg') { prompt = "请发送**新的欢迎消息**："; cancelBack = "config:menu:base"; }
            else if (keyOrAction === 'verif_q') { prompt = "请发送**新的验证问题**："; cancelBack = "config:menu:base"; }
            else if (keyOrAction === 'verif_a') { prompt = "请发送你需要设置的答案..."; cancelBack = "config:menu:base"; }
            else if (keyOrAction === 'block_threshold') { prompt = "请发送**新的屏蔽次数阈值 (数字)**："; cancelBack = "config:menu:keyword"; }
            else if (keyOrAction === 'backup_group_id') { prompt = "请发送**新的备份群组 ID**..."; cancelBack = "config:menu:backup"; }
            else if (keyOrAction === 'authorized_admins') { prompt = "请发送**新的协管员 ID 列表**..."; cancelBack = "config:menu:authorized"; }
            const cancelBtn = { inline_keyboard: [[{ text: "❌ 取消编辑", callback_data: cancelBack }]] };
            await telegramApi(env.BOT_TOKEN, "editMessageText", { chat_id: chatId, message_id: message.message_id, text: `${prompt}\n\n发送 \`/cancel\` 或点击下方按钮取消。`, parse_mode: "HTML", reply_markup: cancelBtn, });
        } else if (actionType === 'add' && keyOrAction) {
            const newKey = keyOrAction + '_add';
            await dbAdminStatePut(chatId, JSON.stringify({ action: 'awaiting_input', key: newKey }), env);
            let prompt = "";
            let cancelBack = "";
            if (keyOrAction === 'keyword_responses') { prompt = "请发送**新的自动回复规则**..."; cancelBack = "config:menu:autoreply"; } 
            else if (keyOrAction === 'block_keywords') { prompt = "请发送**新的屏蔽关键词表达式**..."; cancelBack = "config:menu:keyword"; }
            const cancelBtn = { inline_keyboard: [[{ text: "❌ 取消添加", callback_data: cancelBack }]] };
            await telegramApi(env.BOT_TOKEN, "editMessageText", { chat_id: chatId, message_id: message.message_id, text: `${prompt}\n\n发送 \`/cancel\` 或点击下方按钮取消。`, parse_mode: "HTML", reply_markup: cancelBtn, });
        } else if (actionType === 'list' && keyOrAction) {
            await handleAdminRuleList(chatId, message.message_id, env, keyOrAction);
        } else if (actionType === 'delete' && keyOrAction && value) {
            await handleAdminRuleDelete(chatId, message.message_id, env, keyOrAction, value);
        }
        return;
    } 
  
    // 3. 屏蔽/静音/置顶 操作处理
    if (message.chat.id.toString() !== env.ADMIN_GROUP_ID) {
        return;
    }
  
    const [action, targetUserId] = data.split(':');
    const currentTopicId = message.message_thread_id ? message.message_thread_id.toString() : null;
  
    // 获取用户当前数据
    let user = await dbUserGetOrCreate(targetUserId, env);
    
    // --- [⭐️ 自动关联逻辑修复] ---
    // 1. 关联私聊话题卡片 ID
    if (user.topic_id === currentTopicId && !user.info_card_message_id) {
        await dbUserUpdate(targetUserId, { info_card_message_id: message.message_id.toString() }, env);
        user.info_card_message_id = message.message_id.toString();
    }
    
    // 2. 关联屏蔽名单日志 ID
    const blockLogTopicId = await dbConfigGet('user_block_log_topic_id', env);
    if (blockLogTopicId === currentTopicId && !user.block_log_message_id) {
        await dbUserUpdate(targetUserId, { block_log_message_id: message.message_id.toString() }, env);
        user.block_log_message_id = message.message_id.toString();
    }
  
    // 3. [⭐️ 新增] 关联资料卡汇总日志 ID
    const profileLogTopicId = await dbConfigGet('user_profile_log_topic_id', env);
    if (profileLogTopicId === currentTopicId && !user.profile_log_message_id) {
         await dbUserUpdate(targetUserId, { profile_log_message_id: message.message_id.toString() }, env);
         user.profile_log_message_id = message.message_id.toString();
    }
  
    // --- 统一处理 Block 和 Mute 逻辑 ---
    if (['block', 'unblock', 'mute', 'unmute'].includes(action)) {
        const isBlockAction = action === 'block' || action === 'unblock';
        const isMuteAction = action === 'mute' || action === 'unmute';
        const newState = (action === 'block' || action === 'mute'); 
  
        try {
            // A. 更新数据库
            const updateData = isBlockAction ? { is_blocked: newState } : { is_muted: newState };
            await dbUserUpdate(targetUserId, updateData, env);
  
            // B. 重新获取最新用户数据
            user = await dbUserGetOrCreate(targetUserId, env);
            const userName = user.user_info?.name || targetUserId;
  
            // C. 生成新的按钮
            const newMarkup = getInfoCardButtons(targetUserId, user.is_blocked, user.is_muted);
  
            // D. 智能保留 "跳转到会话" 按钮 (针对当前点击的消息)
            const preserveJumpLink = (originalMarkup) => {
                  let updated = JSON.parse(JSON.stringify(newMarkup));
                  if (originalMarkup && originalMarkup.inline_keyboard) {
                      const lastRow = originalMarkup.inline_keyboard[originalMarkup.inline_keyboard.length - 1];
                      if (lastRow && lastRow[0] && lastRow[0].url && lastRow[0].url.includes('t.me/c/')) {
                          updated.inline_keyboard.push(lastRow); 
                      }
                  }
                  return updated;
            };
  
            // E. 更新【当前点击】的这条消息
            await telegramApi(env.BOT_TOKEN, "editMessageReplyMarkup", {
                chat_id: message.chat.id,
                message_id: message.message_id,
                reply_markup: preserveJumpLink(message.reply_markup),
            });
  
            // F. 发送 Toast 通知
            let toastText = "";
            if (isBlockAction) toastText = newState ? "🚫 已屏蔽该用户" : "✅ 已解除屏蔽";
            else if (isMuteAction) toastText = newState ? "🔕 已静音通知" : "🔔 已恢复通知";
  
            await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { 
                callback_query_id: callbackQuery.id, 
                text: toastText, 
                show_alert: false 
            });
  
            // G. 同步到屏蔽/静音名单 (Block Log)
            await syncToBlockLog(targetUserId, user, user.is_blocked, user.is_muted, env);
  
            // H. 同步：私聊话题资料卡 (info_card)
            if (user.info_card_message_id && message.message_id.toString() !== user.info_card_message_id) {
                try {
                    // 私聊资料卡通常没有跳转链接，直接用标准按钮
                    await telegramApi(env.BOT_TOKEN, "editMessageReplyMarkup", {
                        chat_id: env.ADMIN_GROUP_ID,
                        message_id: user.info_card_message_id,
                        reply_markup: newMarkup, 
                    });
                } catch (e) { console.warn("同步私聊资料卡失败:", e.message); }
            }
  
            // I. [⭐️ 新增] 同步：资料卡汇总 (Profile Log)
            if (user.profile_log_message_id && message.message_id.toString() !== user.profile_log_message_id) {
                 try {
                     // 资料卡汇总通常有跳转链接，需要构造带链接的按钮
                     const cleanGroupId = env.ADMIN_GROUP_ID.toString().replace(/^-100/, '');
                     const jumpUrl = `https://t.me/c/${cleanGroupId}/${user.topic_id}`;
                     const logMarkup = JSON.parse(JSON.stringify(newMarkup));
                     logMarkup.inline_keyboard.push([{ text: "💬 跳转到会话窗口", url: jumpUrl }]);
                     
                     await telegramApi(env.BOT_TOKEN, "editMessageReplyMarkup", {
                         chat_id: env.ADMIN_GROUP_ID,
                         message_id: user.profile_log_message_id,
                         reply_markup: logMarkup,
                     });
                 } catch (e) { console.warn("同步资料卡汇总失败:", e.message); }
            }
            
            // J. 如果是在用户话题内操作 Block，发一条文本提示
            if (isBlockAction && currentTopicId && currentTopicId === user.topic_id) {
                const confirmation = newState 
                    ? `❌ **用户 [${userName}] 已被屏蔽。**`
                    : `✅ **用户 [${userName}] 已解除屏蔽。**`;
                await telegramApi(env.BOT_TOKEN, "sendMessage", {
                    chat_id: message.chat.id,
                    text: confirmation,
                    message_thread_id: currentTopicId, 
                    parse_mode: "Markdown",
                });
            }
  
        } catch (e) {
            console.error(`处理 ${action} 操作失败:`, e.message);
            await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "❌ 操作失败，请重试。", show_alert: true });
        }
    }
    // 4. 置顶操作
    else if (action === 'pin_card') {
        try {
            await telegramApi(env.BOT_TOKEN, "pinChatMessage", {
                chat_id: message.chat.id,
                message_id: message.message_id,
                message_thread_id: currentTopicId,
                disable_notification: true,
            });
            
            // 自动关联 ID (根据当前所在话题判断是哪种卡片)
            if (currentTopicId === user.topic_id) {
                 await dbUserUpdate(targetUserId, { info_card_message_id: message.message_id.toString() }, env);
            } else if (currentTopicId === await dbConfigGet('user_profile_log_topic_id', env)) {
                 await dbUserUpdate(targetUserId, { profile_log_message_id: message.message_id.toString() }, env);
            }
            
            await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { 
                callback_query_id: callbackQuery.id, 
                text: "✅ 已置顶该资料卡。", 
                show_alert: false 
            });
        } catch (e) {
            await telegramApi(env.BOT_TOKEN, "answerCallbackQuery", { 
                callback_query_id: callbackQuery.id, 
                text: `❌ 置顶失败: ${e.message}`, 
                show_alert: true 
            });
        }
    }
  }

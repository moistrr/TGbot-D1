## 🚀 Telegram 双向机器人 Cloudflare Worker

### 功能简介

这是一个基于 Cloudflare Worker 和 D1 数据库的 Telegram 双向机器人代码。它将用户私聊消息转发到管理员群组的话题（Topic）中，并将管理员在话题中的回复中继回用户私聊。

[不会使用直接看教程](https://github.com/moistrr/TGbot-D1/blob/main/%E5%9F%BA%E4%BA%8ED1%E7%9A%84cloudflare%E5%88%9B%E5%BB%BA%E7%9A%84%E5%8F%8C%E5%90%91%E6%9C%BA%E5%99%A8%E4%BA%BA%E4%BF%9D%E5%A7%86%E7%BA%A7%E6%95%99%E7%A8%8B.pdf)

#### 核心特性与最新增强：

1.  **双向中继与话题模式：**
      * 将每个用户私聊会话转发到一个管理员群组的**独立话题**中。
      * 话题名称动态显示用户昵称和 ID，方便管理员区分。
      * 管理员在话题中回复即可自动转发回用户。
2.  **D1 数据库支持：**
      * 使用 Cloudflare D1 (SQLite) 存储用户状态、话题 ID 和所有配置，确保高并发写入和数据持久化。
3.  **完整的管理员配置菜单：**
      * 管理员私聊机器人发送 `/start` 即可进入菜单驱动的配置界面。
      * 注意是私聊BOT，不是在群组内发送/start，而且变量必须设置管理员的ID（双重防护），否则无法唤醒指令
      * 支持在线编辑**验证问答**、**屏蔽阈值**等配置。
4.  **增强的规则管理（最新重构）：**
      * 彻底重构**自动回复规则**和**关键词屏蔽**的管理方式。
      * 新增**列表显示**、**新增**和**删除**功能，所有操作均通过内联按钮完成，无需手动修改代码或配置。
5.  **内容过滤与安全：**
      * **人机验证：** 在用户首次使用前进行验证。
      * **关键词屏蔽：** 可配置关键词黑名单，超过设定的**屏蔽阈值**（如 5 次）自动屏蔽用户。
      * **内容类型过滤：** 粒度控制是否转发**纯文本**、**媒体（图片/视频/文件）**、**链接**、**任何转发消息**、**音频/语音**、**贴纸/GIF** 等内容类型。
6.  **用户管理操作：**
      * 在每个用户话题的顶部资料卡中，提供**一键屏蔽/解禁**和**一键置顶资料卡**的内联按钮。
7.  **已编辑消息处理：**
      * 用户在私聊中修改已发送的消息时，机器人会在对应的管理员话题中发送**消息修改通知**，并附带修改前后的内容对比。
8.  **消息备份功能：**
      * 备份群组功能：配置一个群组，用于接收所有用户消息的副本，不参与回复。
9.  **协同多账号处理功能：**
      * 可以授权群组内的其他成员进行回复，未被授权的用户无法回复消息，使用方法，到配置里面绑定需要授权的账号ID即可
-----

## 部署方式（Cloudflare Dashboard 无指令）

本部署指南适用于通过 Cloudflare 网页界面操作，无需使用 Wrangler CLI 或本地开发环境。

### 步骤一：创建 D1 数据库

1.  登录 Cloudflare Dashboard。

2.  导航到 **Workers 和 Pages** -\> **D1**。

3.  点击 **创建数据库**，输入数据库名称（例如：`tg-bot-db`）。

4.  进入您创建的 D1 数据库，点击 **浏览数据**。

5.  点击 **D1的控制台界面，有一个执行步骤，将下面三段执行语句复制到执行窗口，点击执行即可，会弹出响应时间即为部署成功**：

    | 表名 | 字段 (Schema) |
    | :--- | :--- |
    | `users` | `user_id` (TEXT, PRIMARY KEY), `topic_id` (TEXT), `user_state` (TEXT), `is_blocked` (INTEGER), `block_count` (INTEGER), `user_info_json` (TEXT) |
    | `config` | `key` (TEXT, PRIMARY KEY), `value` (TEXT) |
    | `messages` | `user_id` (TEXT), `message_id` (TEXT), `text` (TEXT), `date` (INTEGER), PRIMARY KEY (`user_id`, `message_id`) |

-- ① users 表

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    topic_id TEXT,
    user_state TEXT,
    is_blocked INTEGER,
    block_count INTEGER,
    user_info_json TEXT
);

-- ② config 表

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- ③ messages 表

CREATE TABLE IF NOT EXISTS messages (
    user_id TEXT,
    message_id TEXT,
    text TEXT,
    date INTEGER,
    PRIMARY KEY (user_id, message_id)
);

如果表格不太好理解，可以分别复制这三段表格的代码内容

### 步骤二：创建 Worker 服务并部署代码

1.  导航到 **Workers 和 Pages**。
2.  点击 **创建应用程序** -\> **创建 Worker**。
3.  输入服务名称（例如：`telegram-forwarder`）。
4.  点击 **部署**。
5.  部署完成后，点击 **编辑代码**。
6.  清空默认代码，将提供的**完整**代码复制并粘贴到编辑器中。
7.  点击 **部署 Worker**。

### 步骤三：配置 D1 绑定

1.  在 Worker 的代码编辑器界面，点击左侧导航栏的 **设置**。
2.  选择 **函数** -\> **D1 数据库绑定**。
3.  点击 **添加 D1 数据库**。
      * 在 **变量名称** 中，**必须** 填写 `TG_BOT_DB`。
      * 在 **D1 数据库** 中，选择您在步骤一中创建的数据库（例如：`tg-bot-db`）。
4.  点击 **添加**。

### 步骤四：配置环境变量

1.  在 Worker 的设置页面，选择 **变量** -\> **环境变量**。
2.  点击 **添加变量**，配置以下 **三个** 必填项：

| 变量名称 | 值（示例） | 说明 |
| :--- | :--- | :--- |
| `BOT_TOKEN` | `123456:AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPP` | 您的 Telegram Bot Token。 |
| `ADMIN_IDS` | `12345678, 87654321` | 管理员的 Telegram 用户 ID，**多个 ID 用英文逗号分隔！注意注意注意是用户的ID，不是用户名也不是昵称**。 |
| `ADMIN_GROUP_ID` | `-1001234567890` | 用于接收用户消息的**超级群组 ID**（注意：必须是超级群组，且已开启话题功能，普通群组和话题群组的ID不一样）。 |

### 如果没有渠道可以获取ADMIN_GROUP_ID，可以用@nmbot这个机器人，拉到群组，通过指令/id进行查询

3.  点击 **保存并部署**。


### 步骤五：设置 Webhook

这是最后一步，需要将您的 Worker URL 注册到 Telegram。您可以在浏览器中访问以下 URL 完成设置：

```
https://api.telegram.org/bot<您的BOT_TOKEN>/setWebhook?url=<您的Worker服务URL>

示例https://api.telegram.org/bot112223333444:AAE5HI-vbxmidWhdbVVuvTO-5556666777/setWebhook?url=https://tgbot.xxxxxx.worker/
```
如果返回 `{"ok":true,"result":true,"description":"Webhook was set"}`，则表示部署成功。

**现在，管理员私聊 Bot 发送 `/start` 即可进入配置菜单。**

### 常见报错解答：

 * [说明1] 抱歉，无法连接客服（创建话题失败）。请稍后再试。这个问题只有三个可能，第一个机器人提权失败，第二个群组ID获取不对，第三个群组不是超级群组。提权失败看我发的教程重新提权就行了，ID获取可以用nmbot拉到群里发送/id获取，超级群组，如果nmbot发送的群组ID不是-100开头的，删除重建！ 
 * [说明2] 私聊BOT/start没有反应，变量的BOT的token错了，重新获取
 * [说明3] 回复对方消息没反应，变量的管理员ID绑定的不对，没有识别到你
 * [说明4] 点击配置菜单出现ERROR报错，D1数据库未绑定或者绑定的名称大小写不对
 * [说明5] 点击配置菜单没有反应，说明D1数据库错了

## 版本更新内容：

### 创新版2.6.1：
* 1、修复BUG，管理员发送特殊类文件会发送失败的问题
* 2、黑名单和静音用户汇总，屏蔽用户都在一个分组可以同步操作，再也不会忘了谁被屏蔽了！

### 创新版2.6：
* 1、新增信息名片卡可以直接跳转对方名片，可以直接看到对方的信息
* 2、优化信息名片卡的内容，重复信息删除，仅保留最重要的信息
* 3、用户资料卡信息汇总，当用户很多的时候，不需要再翻话题列表了
* 4、用户资料卡一键直达聊天窗口，提升寻找效率
* 5、增加对方消息静音，可以精确到每一个对应话题的消息静音，不能屏蔽又不想看他消息的绝佳功能

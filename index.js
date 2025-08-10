import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import fetch from 'node-fetch'; // 确保这里是 v3 或更高版本的 node-fetch
import cron from 'node-cron';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors'; // 导入 cors 包

dotenv.config();

// --- 配置 ---
// 确保你的 .env 文件中包含以下所有变量
const TOKEN = process.env.DISCORD_TOKEN;
const BOT_APPLICATION_ID = process.env.BOT_APPLICATION_ID;
const AMAP_KEY = process.env.AMAP_KEY;
const AQICN_TOKEN = process.env.AQICN_TOKEN;
const GUILD_ID = process.env.GUILD_ID; // 用于 Express Widget API
const PORT = process.env.PORT || 3000; // Express Widget API 的端口
const DAILY_MESSAGE_CHANNEL_ID = process.env.DAILY_MESSAGE_CHANNEL_ID;
const DEFAULT_CITY = process.env.DEFAULT_CITY || '北京';
const API_RETRY_LIMIT = 3;

// --- 本地化字符串 ---
const localizations = {
    // 命令描述
    ping_desc: { 'zh-CN': '检查机器人延迟。', 'en-US': 'Check the bot\'s latency.' },
    time_desc: { 'zh-CN': '获取当前服务器时间 (Asia/Shanghai)。', 'en-US': 'Get the current server time (Asia/Shanghai).' },
    help_desc: { 'zh-CN': '列出所有可用的命令。', 'en-US': 'List all available commands.' },
    hitokoto_desc: { 'zh-CN': '获取每日一言。', 'en-US': 'Get a random quote.' },
    weather_desc: { 'zh-CN': '获取特定城市的天气数据。', 'en-US': 'Get weather data for a specific city.' },
    me_desc: { 'zh-CN': '获取我的开发者资料链接。', 'en-US': 'Get my developer\'s profile link.' },
    setu_desc: { 'zh-CN': '获取一张随机动漫图片。', 'en-US': 'Get a random anime image.' },
    poll_desc: { 'zh-CN': '创建一个简单的投票。', 'en-US': 'Create a simple poll.' },
    roll_desc: { 'zh-CN': '掷骰子 (例如: 2d6, d20)。', 'en-US': 'Roll dice (e.g., 2d6, d20).' },
    avatar_desc: { 'zh-CN': '获取用户的头像。', 'en-US': 'Get a user\'s avatar.' },
    info_desc: { 'zh-CN': '获取服务器、用户或AQI信息。', 'en-US': 'Get info about the server, a user, or AQI.' },
    purge_desc: { 'zh-CN': '从频道中删除指定数量的消息。', 'en-US': 'Delete a specified number of messages from a channel.' },
    coinflip_desc: { 'zh-CN': '抛硬币决定命运！', 'en-US': 'Flip a coin!' },
    '8ball_desc': { 'zh-CN': '让神奇海螺回答你的问题。', 'en-US': 'Ask the Magic 8-Ball a question.' },
    joke_desc: { 'zh-CN': '随机来个英文笑话。', 'en-US': 'Get a random English joke.' },
    mcstatus_desc: { 'zh-CN': '获取 Minecraft 服务器的状态。', 'en-US': 'Get the status of a Minecraft server.' },
    // 选项
    lang_option_desc: { 'zh-CN': '选择输出语言。', 'en-US': 'Select the output language.' },
    city_option_desc: { 'zh-CN': `城市名称 (默认: ${DEFAULT_CITY})。`, 'en-US': `The city name (default: ${DEFAULT_CITY}).` },
    mc_address_option_desc: { 'zh-CN': 'Minecraft 服务器地址 (例如: mc.hypixel.net)。', 'en-US': 'The Minecraft server address (e.g., mc.hypixel.net).' },
    // 通用 UI
    requested_by: { 'zh-CN': '由 {user} 请求', 'en-US': 'Requested by {user}' },
    error_occurred: { 'zh-CN': '❌ 发生意外错误。请稍后再试。', 'en-US': '❌ An unexpected error occurred. Please try again later.' },
};

// --- 初始化 Discord 客户端 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences // 为 widget API 添加
    ]
});

// --- 命令定义 ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot latency.').setDescriptionLocalizations(localizations.ping_desc),
    new SlashCommandBuilder().setName('time').setDescription('Get current server time.').setDescriptionLocalizations(localizations.time_desc),
    new SlashCommandBuilder().setName('help').setDescription('List all commands.').setDescriptionLocalizations(localizations.help_desc),
    new SlashCommandBuilder()
        .setName('hitokoto')
        .setDescription('Get a random quote.')
        .setDescriptionLocalizations(localizations.hitokoto_desc)
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Select language.')
                .setDescriptionLocalizations(localizations.lang_option_desc)
                .setRequired(false)
                .addChoices({ name: '中文', value: 'zh-CN' }, { name: 'English', value: 'en-US' })),
    new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Get weather data.')
        .setDescriptionLocalizations(localizations.weather_desc)
        .addStringOption(option =>
            option.setName('city')
                .setDescription('City name.')
                .setDescriptionLocalizations(localizations.city_option_desc)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Select language.')
                .setDescriptionLocalizations(localizations.lang_option_desc)
                .setRequired(false)
                .addChoices({ name: '中文', value: 'zh-CN' }, { name: 'English', value: 'en-US' })),
    new SlashCommandBuilder().setName('me').setDescription('Get developer profile.').setDescriptionLocalizations(localizations.me_desc),
    new SlashCommandBuilder()
        .setName('setu')
        .setDescription('Get a random anime image.')
        .setDescriptionLocalizations(localizations.setu_desc)
        .addBooleanOption(option =>
            option.setName('nsfw')
                .setDescription('Enable NSFW content (default: false).')
                .setDescriptionLocalizations({ 'zh-CN': '启用NSFW内容 (默认: false)。', 'en-US': 'Enable NSFW content (default: false).' })
                .setRequired(false)),
    // --- 重构后的 /info 命令 ---
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get server, user, or AQI info.')
        .setDescriptionLocalizations(localizations.info_desc)
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('获取用户信息。')
                .setDescriptionLocalizations({ 'zh-CN': '获取用户信息。', 'en-US': 'Get information about a user.' })
                .addUserOption(option => option.setName('target').setDescription('要查询的用户。').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('获取服务器信息。')
                .setDescriptionLocalizations({ 'zh-CN': '获取服务器信息。', 'en-US': 'Get information about the server.' }))
        .addSubcommand(subcommand =>
            subcommand
                .setName('aqi')
                .setDescription('获取城市的空气质量指数。')
                .setDescriptionLocalizations({ 'zh-CN': '获取城市的空气质量指数。', 'en-US': 'Get the Air Quality Index for a city.' })
                .addStringOption(option => option.setName('city').setDescription('要查询的城市名称。'))),
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Purge messages.')
        .setDescriptionLocalizations(localizations.purge_desc)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100).')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin.').setDescriptionLocalizations(localizations.coinflip_desc),
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the Magic 8-Ball.')
        .setDescriptionLocalizations(localizations['8ball_desc'])
        .addStringOption(option => option.setName('question').setDescription('Your question.').setRequired(true)),
    new SlashCommandBuilder().setName('joke').setDescription('Get a random joke.').setDescriptionLocalizations(localizations.joke_desc),
    // --- 新增的 /mcstatus 命令 ---
    new SlashCommandBuilder()
        .setName('mcstatus')
        .setDescription('Get the status of a Minecraft server.')
        .setDescriptionLocalizations(localizations.mcstatus_desc)
        .addStringOption(option =>
            option.setName('address')
                .setDescription('The Minecraft server address.')
                .setDescriptionLocalizations(localizations.mc_address_option_desc)
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll.')
        .setDescriptionLocalizations(localizations.poll_desc)
        .addStringOption(option => option.setName('question').setDescription('The poll question.').setRequired(true))
        // 动态添加选项的部分移到下面
    ,
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice.')
        .setDescriptionLocalizations(localizations.roll_desc)
        .addStringOption(option => option.setName('dice').setDescription('Dice notation (e.g., 1d6, 2d20). Default: 1d6.').setRequired(false)),
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s avatar.')
        .setDescriptionLocalizations(localizations.avatar_desc)
        .addUserOption(option => option.setName('user').setDescription('The user whose avatar to show.').setRequired(false)),

].map(cmd => {
    // 动态为 poll 命令添加选项
    if (cmd.name === 'poll') {
        for (let i = 1; i <= 5; i++) {
            cmd.addStringOption(option => option.setName(`option${i}`).setDescription(`Option ${i}.`).setRequired(i <= 2));
        }
    }
    return cmd.toJSON();
});


const rest = new REST({ version: '10' }).setToken(TOKEN);

// --- 辅助函数 ---
function getText(lang, key, replacements = {}) {
    // 确保 key 是一个对象
    if (typeof key !== 'object' || key === null) {
        console.error("Invalid 'key' passed to getText:", key);
        return "Error: Invalid text key.";
    }
    const translation = key[lang] || key['en-US'] || '';
    return Object.entries(replacements).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), translation);
}

// --- API & 服务函数 ---

async function getWeather(city = DEFAULT_CITY, lang = 'zh-CN') {
    const text = {
        not_configured: { 'zh-CN': '❌ 天气服务未配置。机器人所有者需要设置高德地图API密钥。', 'en-US': '❌ Weather service is not configured. The bot owner needs to set up the AMap API key.' },
        not_found: { 'zh-CN': `❌ 未找到 "${city}" 的天气数据。请检查城市名称。`, 'en-US': `❌ Weather data not found for "${city}". Please check the city name.` },
        fail: { 'zh-CN': '❌ 获取天气数据失败。请稍后再试。', 'en-US': '❌ Failed to get weather data. Please try again later.' },
        report: { 'zh-CN': '🌤 天气预报', 'en-US': '🌤 Weather Report' },
        city: { 'zh-CN': '城市', 'en-US': 'City' },
        condition: { 'zh-CN': '天气', 'en-US': 'Condition' },
        temp: { 'zh-CN': '温度', 'en-US': 'Temperature' },
        wind_dir: { 'zh-CN': '风向', 'en-US': 'Wind Direction' },
        wind_power: { 'zh-CN': '风力', 'en-US': 'Wind Power' },
        level: { 'zh-CN': '级', 'en-US': 'Level' },
        updated: { 'zh-CN': '更新于', 'en-US': 'Updated' },
    };

    if (!AMAP_KEY || AMAP_KEY === 'your_amap_key') return getText(lang, text.not_configured);
    
    const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${encodeURIComponent(city)}&key=${AMAP_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== '1' || !data.lives?.length) return getText(lang, text.not_found, { city });
        
        const weather = data.lives[0];
        const tempUnit = lang === 'en-US' ? '°F' : '℃'; // 示例，高德API默认返回摄氏度
        const windUnit = lang === 'en-US' ? `Level ${weather.windpower}` : `${weather.windpower}级`;

        const embed = new EmbedBuilder()
            .setTitle(getText(lang, text.report))
            .setColor(0x3498DB)
            .addFields(
                { name: getText(lang, text.city), value: weather.city, inline: true },
                { name: getText(lang, text.condition), value: weather.weather, inline: true },
                { name: getText(lang, text.temp), value: `${weather.temperature}${tempUnit}`, inline: true },
                { name: getText(lang, text.wind_dir), value: weather.winddirection, inline: true },
                { name: getText(lang, text.wind_power), value: windUnit, inline: true },
                { name: getText(lang, { 'zh-CN': '湿度', 'en-US': 'Humidity' }), value: `${weather.humidity}%`, inline: true }
            )
            .setFooter({ text: `${getText(lang, text.updated)}: ${weather.reporttime}` });

        return { embeds: [embed] };
    } catch (err) {
        console.error('Weather API error:', err);
        return { content: getText(lang, text.fail), ephemeral: true };
    }
}

async function getAqiInfo(city = DEFAULT_CITY, lang = 'zh-CN') {
     const text = {
        title: { 'zh-CN': `🌬️ {location} 空气质量`, 'en-US': `🌬️ Air Quality in {location}` },
        not_configured: { 'zh-CN': '❌ 空气质量查询服务未配置。机器人所有者需要设置 AQICN API Token。', 'en-US': '❌ Air Quality service is not configured. The bot owner needs to set an AQICN API Token.' },
        not_found: { 'zh-CN': `❌ 未找到 "${city}" 的空气质量数据。请检查城市名称。`, 'en-US': `❌ Air Quality data not found for "${city}". Please check the city name.` },
        fail: { 'zh-CN': '❌ 获取空气质量数据失败。', 'en-US': '❌ Failed to get Air Quality data.' },
        source: { 'zh-CN': '数据来源: World Air Quality Index Project', 'en-US': 'Source: World Air Quality Index Project' },
        aqi_index: { 'zh-CN': 'AQI 指数', 'en-US': 'AQI Index' },
        level: { 'zh-CN': '等级', 'en-US': 'Level' },
        health_impact: { 'zh-CN': '健康影响', 'en-US': 'Health Impact' },
        levels: {
            '优': { 'en-US': 'Good', color: 0x00E400 },
            '良': { 'en-US': 'Moderate', color: 0xFFFF00 },
            '轻度污染': { 'en-US': 'Unhealthy for Sensitive Groups', color: 0xFF7E00 },
            '中度污染': { 'en-US': 'Unhealthy', color: 0xFF0000 },
            '重度污染': { 'en-US': 'Very Unhealthy', color: 0x99004C },
            '严重污染': { 'en-US': 'Hazardous', color: 0x7E0023 },
            '未知': { 'en-US': 'Unknown', color: 0xAAAAAA }
        },
        impacts: {
            '空气质量令人满意，基本无空气污染。': { 'en-US': 'Air quality is satisfactory, and air pollution poses little or no risk.' },
            '空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响。': { 'en-US': 'Air quality is acceptable. However, some pollutants may be a moderate health concern for a very small number of people who are unusually sensitive to air pollution.' },
            '易感人群症状有轻度加剧，健康人群出现刺激症状。': { 'en-US': 'Members of sensitive groups may experience health effects. The general public is not likely to be affected.' },
            '进一步加剧易感人群症状，可能对健康人群心脏、呼吸系统有影响。': { 'en-US': 'Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.' },
            '心脏病和肺病患者症状显著加剧，运动耐受力降低，健康人群普遍出现症状。': { 'en-US': 'Health warnings of emergency conditions. The entire population is more likely to be affected.' },
            '健康人群运动耐受力降低，有明显强烈症状，提前出现某些疾病。': { 'en-US': 'Health alert: everyone may experience more serious health effects.' },
            '未知': { 'en-US': 'Unknown' }
        }
    };
    if (!AQICN_TOKEN || AQICN_TOKEN === 'your_aqicn_token') return { content: getText(lang, text.not_configured), ephemeral: true };
    
    try {
        const url = `https://api.waqi.info/feed/${encodeURIComponent(city)}/?token=${AQICN_TOKEN}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== 'ok') return { content: getText(lang, text.not_found, { city }), ephemeral: true };

        const aqi = data.data.aqi;
        const location = data.data.city.name;
        let level_zh = '未知';
        let impact_zh = '未知';
        if (aqi <= 50) { level_zh = '优'; impact_zh = '空气质量令人满意，基本无空气污染。'; }
        else if (aqi <= 100) { level_zh = '良'; impact_zh = '空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响。'; }
        else if (aqi <= 150) { level_zh = '轻度污染'; impact_zh = '易感人群症状有轻度加剧，健康人群出现刺激症状。'; }
        else if (aqi <= 200) { level_zh = '中度污染'; impact_zh = '进一步加剧易感人群症状，可能对健康人群心脏、呼吸系统有影响。'; }
        else if (aqi <= 300) { level_zh = '重度污染'; impact_zh = '心脏病和肺病患者症状显著加剧，运动耐受力降低，健康人群普遍出现症状。'; }
        else { level_zh = '严重污染'; impact_zh = '健康人群运动耐受力降低，有明显强烈症状，提前出现某些疾病。'; }

        const levelInfo = text.levels[level_zh];
        const level = lang === 'en-US' ? levelInfo['en-US'] : level_zh;
        const healthImpact = lang === 'en-US' ? text.impacts[impact_zh]['en-US'] : impact_zh;

        const embed = new EmbedBuilder()
            .setTitle(getText(lang, text.title, { location }))
            .setColor(levelInfo.color)
            .addFields(
                { name: getText(lang, text.aqi_index), value: `**${aqi}**`, inline: true },
                { name: getText(lang, text.level), value: level, inline: true },
                { name: getText(lang, text.health_impact), value: healthImpact }
            )
            .setFooter({ text: getText(lang, text.source) })
            .setTimestamp();
        return { embeds: [embed] };
    } catch (err) {
        console.error('AQI API error:', err);
        return { content: getText(lang, text.fail), ephemeral: true };
    }
}

async function getHitokoto(lang = 'zh-CN') {
    const apiLang = lang === 'zh-CN' ? 'zh' : 'en';
    try {
        const res = await fetch(`https://v1.hitokoto.cn/?encode=json&lang=${apiLang}`);
        const data = await res.json();
        return lang === 'en-US'
            ? `💬 "${data.hitokoto}"\n— ${data.from_who || 'Unknown'} (${data.from || 'Unknown'})`
            : `💬「${data.hitokoto}」\n—— ${data.from_who || data.from || 'Unknown'}`;
    } catch (err) {
        console.error('Hitokoto API error:', err);
        return lang === 'en-US' ? '❌ Failed to get a quote.' : '❌ 获取一言失败。';
    }
}

async function getJoke() {
    try {
        const res = await fetch('https://official-joke-api.appspot.com/random_joke');
        const data = await res.json();
        return `**${data.setup}**\n*${data.punchline}*`;
    } catch (err) {
        console.error('Joke API error:', err);
        return '❌ Could not find a joke.';
    }
}

async function getAnimeImage(nsfw = false) {
    const IMAGE_APIS = [
        { url: (nsfw) => `https://api.waifu.pics/${nsfw ? 'nsfw' : 'sfw'}/waifu`, handler: async (res) => (await res.json()).url }
    ];
    for (let attempt = 0; attempt < API_RETRY_LIMIT; attempt++) {
        for (const api of IMAGE_APIS) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时
                const res = await fetch(api.url(nsfw), { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) {
                    const imageUrl = await api.handler(res);
                    if (imageUrl) return imageUrl;
                }
            } catch (err) {
                console.error(`Image API failed (${api.url(nsfw)}):`, err.name === 'AbortError' ? 'Timeout' : err.message);
            }
        }
    }
    return null;
}

// --- 获取 MC 服务器状态 ---
async function getMcServerStatus(address, lang = 'zh-CN') {
    const text = {
        offline: { 'zh-CN': '❌ 服务器 `{address}` 当前离线或无法访问。', 'en-US': '❌ Server `{address}` is currently offline or unreachable.' },
        fail: { 'zh-CN': '❌ 查询服务器状态时出错。', 'en-US': '❌ An error occurred while fetching server status.' },
        status_title: { 'zh-CN': 'Minecraft 服务器状态', 'en-US': 'Minecraft Server Status' },
        address: { 'zh-CN': '地址', 'en-US': 'Address' },
        players: { 'zh-CN': '玩家', 'en-US': 'Players' },
        version: { 'zh-CN': '版本', 'en-US': 'Version' },
        motd: { 'zh-CN': 'MOTD', 'en-US': 'MOTD' },
    };

    try {
        const url = `https://api.mcsrvstat.us/2/${encodeURIComponent(address)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.online) {
            return { content: getText(lang, text.offline, { address }), ephemeral: true };
        }

        const embed = new EmbedBuilder()
            .setTitle(getText(lang, text.status_title))
            .setColor(0x51A83E)
            .setThumbnail(data.icon ? `https://api.mcsrvstat.us/icon/${address}` : 'https://placehold.co/128x128/51A83E/FFFFFF?text=MC')
            .addFields(
                { name: getText(lang, text.address), value: `\`${address}\``, inline: false },
                { name: getText(lang, text.players), value: `${data.players.online} / ${data.players.max}`, inline: true },
                { name: getText(lang, text.version), value: data.version, inline: true },
                { name: getText(lang, text.motd), value: `\`\`\`\n${data.motd.clean.join('\n')}\n\`\`\``, inline: false }
            )
            .setTimestamp();
        
        return { embeds: [embed] };

    } catch (err) {
        console.error(`Minecraft Status API error for ${address}:`, err);
        return { content: getText(lang, text.fail), ephemeral: true };
    }
}


// --- 定时任务 (Cron Jobs) ---
if (DAILY_MESSAGE_CHANNEL_ID) {
    cron.schedule('0 7 * * *', async () => {
        try {
            const channel = await client.channels.fetch(DAILY_MESSAGE_CHANNEL_ID);
            if (channel && channel.isTextBased()) {
                const hitokoto = await getHitokoto('zh-CN');
                const weatherEmbed = await getWeather(DEFAULT_CITY, 'zh-CN');
                await channel.send({ content: `☀️ 主人早上好~ 祝你拥有美好的一天！\n${hitokoto}`, embeds: weatherEmbed.embeds });
            }
        } catch (err) {
            console.error(`Scheduled morning task error:`, err);
        }
    }, { timezone: 'Asia/Shanghai' });
}


// --- Discord 客户端事件 ---
client.once('ready', async () => {
    if (!client.user) {
        console.error("Client user is not available.");
        return process.exit(1);
    }
    const appId = BOT_APPLICATION_ID || client.user.id;
    console.log(`✅ Logged in as ${client.user.tag}`);
    try {
        console.log(`🔧 Registering ${commands.length} slash commands globally...`);
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        console.log('✅ Slash commands registered successfully!');
    } catch (err) {
        console.error('❌ Command registration failed:', err);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, user, locale, channel } = interaction;
    // 优先使用命令中的语言选项，否则根据用户的 Discord 语言设置
    const lang = options.getString('language') || (locale === 'zh-CN' ? 'zh-CN' : 'en-US');

    // 对需要较长时间响应的命令使用 deferReply
    const commandsToDefer = ['weather', 'setu', 'info', 'purge', 'mcstatus', 'hitokoto'];
    if (commandsToDefer.includes(commandName)) {
        await interaction.deferReply();
    }

    try {
        switch (commandName) {
            case 'ping': {
                // 已将 fetchReply: true 更新为 withResponse: true
                const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
                const latency = sent.createdTimestamp - interaction.createdTimestamp;
                const reply = {
                    'zh-CN': `Pong! 🏓 延迟为 ${latency}ms。API延迟为 ${Math.round(client.ws.ping)}ms。`,
                    'en-US': `Pong! 🏓 Latency is ${latency}ms. API Latency is ${Math.round(client.ws.ping)}ms.`
                };
                await interaction.editReply(getText(lang, reply));
                break;
            }
            case 'time': {
                const now = new Date();
                const timeString = now.toLocaleString(lang, { timeZone: 'Asia/Shanghai', hour12: false });
                const reply = {
                    'zh-CN': `当前时间: ${timeString} (Asia/Shanghai)`,
                    'en-US': `Current time: ${timeString} (Asia/Shanghai)`
                };
                await interaction.reply(getText(lang, reply));
                break;
            }
            case 'help': {
                const title = { 'zh-CN': '✨ Bot 命令列表', 'en-US': '✨ Bot Command List' };
                const desc = { 'zh-CN': '以下是所有你可以使用的命令:', 'en-US': 'Here are all the commands you can use:' };
                const footer = { 'zh-CN': '祝你使用愉快！😊', 'en-US': 'Enjoy the bot! 😊' };
                
                const helpEmbed = new EmbedBuilder()
                    .setTitle(getText(lang, title))
                    .setColor(0x0099FF)
                    .setDescription(getText(lang, desc))
                    .addFields(
                        commands
                            .filter(cmd => cmd.name) // 过滤掉没有名字的
                            .map(cmd => {
                                const description = cmd.description_localizations?.[lang] || cmd.description;
                                return {
                                    name: `/${cmd.name}`,
                                    value: description,
                                    inline: false
                                };
                            })
                    )
                    .setFooter({ text: getText(lang, footer) });
                await interaction.reply({ embeds: [helpEmbed] });
                break;
            }
            case 'hitokoto': {
                await interaction.editReply(await getHitokoto(lang));
                break;
            }
            case 'weather': {
                const city = options.getString('city') || DEFAULT_CITY;
                await interaction.editReply(await getWeather(city, lang));
                break;
            }
            case 'me': {
                 const reply = {
                    'zh-CN': '🔗 我的开发者资料:\nhttps://lovxy.cloud/',
                    'en-US': '🔗 My developer\'s profile:\nhttps://lovxy.cloud/'
                };
                await interaction.reply(getText(lang, reply));
                break;
            }
            case 'setu': {
                const nsfw = options.getBoolean('nsfw') || false;
                if (nsfw && channel && !channel.nsfw) {
                    const reply = { 'zh-CN': '⚠️ NSFW命令只能在标记为NSFW的频道中使用。', 'en-US': '⚠️ NSFW commands can only be used in NSFW-marked channels.' };
                    await interaction.editReply({ content: getText(lang, reply), ephemeral: true });
                    return;
                }
                const imgUrl = await getAnimeImage(nsfw);
                if (imgUrl) {
                    const title = { 'zh-CN': '🎨 每日动漫能量~', 'en-US': '🎨 Your daily anime dose~' };
                    const embed = new EmbedBuilder()
                        .setTitle(getText(lang, title))
                        .setImage(imgUrl)
                        .setColor(nsfw ? 0xFF0000 : 0x0099FF)
                        .setFooter({ text: getText(lang, localizations.requested_by, {user: user.tag}) });
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    const reply = { 'zh-CN': '❌ 加载图片失败。请稍后再试。', 'en-US': '❌ Failed to load image. Please try again later.' };
                    await interaction.editReply({ content: getText(lang, reply), ephemeral: true });
                }
                break;
            }
            case 'info': {
                const subcommand = options.getSubcommand();
                // 修复：检查 guild 是否为 null，因为某些命令只适用于服务器
                if (!guild) {
                    const reply = { 'zh-CN': '❌ 此命令只能在服务器频道中使用。', 'en-US': '❌ This command can only be used in a server channel.' };
                    await interaction.editReply({ content: getText(lang, reply), ephemeral: true });
                    return; // 如果不在服务器中，直接返回
                }

                if (subcommand === 'user') {
                    const targetUser = options.getUser('target');
                    const member = await guild.members.fetch(targetUser.id);
                    const roles = member.roles.cache.filter(r => r.id !== guild.id).map(r => r.name).join(', ') || getText(lang, {'zh-CN': '无', 'en-US': 'None'});
                    const embed = new EmbedBuilder()
                        .setTitle(getText(lang, {'zh-CN': `🔎 用户信息: ${targetUser.username}`, 'en-US': `🔎 User Info: ${targetUser.username}`}))
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setColor(member.displayHexColor || 0x3498DB)
                        .addFields(
                            { name: getText(lang, {'zh-CN': '用户名', 'en-US': 'Username'}), value: targetUser.tag, inline: true },
                            { name: getText(lang, {'zh-CN': '用户ID', 'en-US': 'User ID'}), value: targetUser.id, inline: true },
                            { name: getText(lang, {'zh-CN': '昵称', 'en-US': 'Nickname'}), value: member.nickname || getText(lang, {'zh-CN': '无', 'en-US': 'None'}), inline: true },
                            { name: getText(lang, {'zh-CN': '账户创建于', 'en-US': 'Account Created'}), value: `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:R>`, inline: true },
                            { name: getText(lang, {'zh-CN': '加入服务器于', 'en-US': 'Joined Server'}), value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`, inline: true },
                            { name: getText(lang, {'zh-CN': '是否为助力者', 'en-US': 'Booster'}), value: member.premiumSince ? getText(lang, {'zh-CN': '是', 'en-US': 'Yes'}) : getText(lang, {'zh-CN': '否', 'en-US': 'No'}), inline: true },
                            { name: getText(lang, {'zh-CN': '角色', 'en-US': 'Roles'}), value: roles.substring(0, 1024) }
                        )
                        .setFooter({ text: getText(lang, localizations.requested_by, {user: user.tag}) });
                    await interaction.editReply({ embeds: [embed] });
                } else if (subcommand === 'server') {
                    // guild 已经在前面被检查过，这里可以安全使用 guild
                    const owner = await guild.fetchOwner();
                    const verificationLevels = {
                       'zh-CN': ['无', '低', '中', '高', '非常高'],
                       'en-US': ['None', 'Low', 'Medium', 'High', 'Very High']
                    };
                    const embed = new EmbedBuilder()
                       .setTitle(getText(lang, {'zh-CN': `ℹ️ 服务器信息: ${guild.name}`, 'en-US': `ℹ️ Server Info: ${guild.name}`}))
                       .setThumbnail(guild.iconURL({ dynamic: true }))
                       .setColor(0xF1C40F)
                       .addFields(
                           { name: getText(lang, {'zh-CN': '所有者', 'en-US': 'Owner'}), value: owner.user.tag, inline: true },
                           { name: getText(lang, {'zh-CN': '服务器ID', 'en-US': 'Server ID'}), value: guild.id, inline: true },
                           { name: getText(lang, {'zh-CN': '创建于', 'en-US': 'Created On'}), value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:D>`, inline: true },
                           { name: getText(lang, {'zh-CN': '总成员数', 'en-US': 'Total Members'}), value: `${guild.memberCount}`, inline: true },
                           { name: getText(lang, {'zh-CN': '助力等级', 'en-US': 'Boost Level'}), value: `${guild.premiumTier} (${guild.premiumSubscriptionCount} ${getText(lang, {'zh-CN': '次助力', 'en-US': 'boosts'})})`, inline: true },
                           { name: getText(lang, {'zh-CN': '验证等级', 'en-US': 'Verification'}), value: verificationLevels[lang][guild.verificationLevel], inline: true },
                           { name: getText(lang, {'zh-CN': '频道数', 'en-US': 'Channels'}), value: `${getText(lang, {'zh-CN': '文字', 'en-US': 'Text'})}: ${guild.channels.cache.filter(c => c.isTextBased()).size}\n${getText(lang, {'zh-CN': '语音', 'en-US': 'Voice'})}: ${guild.channels.cache.filter(c => c.isVoiceBased()).size}`, inline: true },
                           { name: getText(lang, {'zh-CN': '角色数', 'en-US': 'Roles'}), value: `${guild.roles.cache.size}`, inline: true },
                           { name: getText(lang, {'zh-CN': '表情数', 'en-US': 'Emojis'}), value: `${guild.emojis.cache.size}`, inline: true },
                       )
                       .setFooter({ text: getText(lang, localizations.requested_by, {user: user.tag}) });
                   await interaction.editReply({ embeds: [embed] });
                } else if (subcommand === 'aqi') {
                    const city = options.getString('city') || DEFAULT_CITY;
                    const aqiResult = await getAqiInfo(city, lang);
                    await interaction.editReply(aqiResult);
                }
                break;
            }
            case 'purge': {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                    const reply = { 'zh-CN': '你没有权限使用此命令。', 'en-US': 'You do not have permission to use this command.' };
                    await interaction.editReply({ content: getText(lang, reply), ephemeral: true });
                    return;
                }
                const amount = options.getInteger('amount');
                if (channel && channel.isTextBased()) {
                    const { size } = await channel.bulkDelete(amount, true);
                    const reply = { 'zh-CN': `✅ 成功删除 ${size} 条消息。`, 'en-US': `✅ Successfully deleted ${size} message(s).` };
                    await interaction.editReply({ content: reply[lang], ephemeral: true });
                }
                break;
            }
            case 'coinflip': {
                const result = Math.random() < 0.5 ? { 'zh-CN': '正面', 'en-US': 'Heads' } : { 'zh-CN': '反面', 'en-US': 'Tails' };
                const reply = { 'zh-CN': `🪙 硬币落下了... 是 **${result['zh-CN']}**！`, 'en-US': `🪙 The coin landed on... **${result['en-US']}**!` };
                await interaction.reply(getText(lang, reply));
                break;
            }
            case '8ball': {
                const question = options.getString('question');
                const answers = {
                    'zh-CN': ['毫无疑问。', '是的，绝对是。', '我非常肯定。', '如我所见，是的。', '很有可能。', '前景看好。', '是的。', '迹象表明是的。', '回复很模糊，再试一次。', '晚些再问我。', '最好现在不告诉你。', '无法预测。', '集中精神，再问一次。', '不要指望它。', '我的回复是否定的。', '我的消息来源说不。', '前景不太好。', '非常怀疑。'],
                    'en-US': ['It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes – definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.', 'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.']
                };
                const answer = answers[lang][Math.floor(Math.random() * answers[lang].length)];
                const reply = {
                    'zh-CN': `> ❓ **${question}**\n\n� 神奇海螺说: **${answer}**`,
                    'en-US': `> ❓ **${question}**\n\n🎱 The Magic 8-Ball says: **${answer}**`
                };
                await interaction.reply(getText(lang, reply));
                break;
            }
            case 'joke': {
                const joke = await getJoke();
                const title = { 'zh-CN': '来个笑话轻松一下~', 'en-US': 'Here\'s a joke for you~' };
                await interaction.reply(`**${getText(lang, title)}**\n\n${joke}`);
                break;
            }
            case 'mcstatus': {
                const address = options.getString('address');
                const statusPayload = await getMcServerStatus(address, lang);
                await interaction.editReply(statusPayload);
                break;
            }
            case 'roll': {
                const diceNotation = options.getString('dice') || '1d6';
                const [numDiceStr, numSidesStr] = diceNotation.toLowerCase().split('d');
                const numDice = parseInt(numDiceStr) || 1;
                const numSides = parseInt(numSidesStr);

                if (isNaN(numSides) || numSides <= 0 || numDice <= 0 || numDice > 100 || numSides > 1000) {
                    const reply = {
                        'zh-CN': '❌ 请提供有效的骰子格式 (例如: 2d6, d20)。骰子数量和面数应在合理范围内 (例如，最多100个骰子，每个骰子最多1000面)。',
                        'en-US': '❌ Please provide a valid dice format (e.g., 2d6, d20). Number of dice and sides should be within reasonable limits (e.g., max 100 dice, max 1000 sides per die).'
                    };
                    await interaction.reply({ content: getText(lang, reply), ephemeral: true });
                    return;
                }

                let results = [];
                let total = 0;
                for (let i = 0; i < numDice; i++) {
                    const roll = Math.floor(Math.random() * numSides) + 1;
                    results.push(roll);
                    total += roll;
                }

                const individualRolls = results.length > 1 ? ` (${results.join(', ')})` : '';
                const reply = {
                    'zh-CN': `🎲 你掷出了 ${diceNotation}: **${total}**${individualRolls}`,
                    'en-US': `🎲 You rolled ${diceNotation}: **${total}**${individualRolls}`
                };
                await interaction.reply(getText(lang, reply));
                break;
            }
            case 'avatar': {
                const targetUser = options.getUser('user') || interaction.user;
                const embed = new EmbedBuilder()
                    .setTitle(getText(lang, { 'zh-CN': `${targetUser.username} 的头像`, 'en-US': `${targetUser.username}'s Avatar` }))
                    .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 4096 }))
                    .setColor(0x3498DB)
                    .setFooter({ text: getText(lang, localizations.requested_by, { user: user.tag }) });
                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'poll': {
                const question = options.getString('question');
                const pollOptions = [];
                for (let i = 1; i <= 5; i++) {
                    const option = options.getString(`option${i}`);
                    if (option) {
                        pollOptions.push(option);
                    }
                }

                if (pollOptions.length < 2) {
                    const reply = {
                        'zh-CN': '❌ 投票至少需要两个选项。',
                        'en-US': '❌ A poll needs at least two options.'
                    };
                    await interaction.reply({ content: getText(lang, reply), ephemeral: true });
                    return;
                }

                const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
                const fields = pollOptions.map((opt, index) => ({
                    name: `${emojis[index]} ${opt}`,
                    value: '0 votes', // This will be updated later
                    inline: false
                }));

                const embed = new EmbedBuilder()
                    .setTitle(getText(lang, { 'zh-CN': `📊 投票: ${question}`, 'en-US': `📊 Poll: ${question}` }))
                    .setDescription(getText(lang, { 'zh-CN': '点击下面的表情符号进行投票！', 'en-US': 'React below to vote!' }))
                    .addFields(fields)
                    .setColor(0x5865F2)
                    .setFooter({ text: getText(lang, localizations.requested_by, { user: user.tag }) });

                // 已将 fetchReply: true 更新为 withResponse: true
                const message = await interaction.reply({ embeds: [embed], withResponse: true });

                for (let i = 0; i < pollOptions.length; i++) {
                    // 修复：确保频道和消息都在缓存中，或者处理 ChannelNotCached 错误
                    // 在 interactionCreate 的 deferReply 后，message 应该在缓存中，除非网络问题导致
                    await message.react(emojis[i]).catch(error => console.error('Failed to react to poll message:', error));
                }

                // Optional: add a collector to update poll results in real-time
                // This would be more complex and require database integration
                break;
            }
        }
    } catch (err) {
        console.error(`Error executing /${commandName} for ${user.tag}:`, err);
        const errorMessage = getText(lang, localizations.error_occurred);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// --- Express Widget API ---
const app = express();
app.use(cors()); // 修复 CORS: 在所有路由之前使用 cors 中间件

app.get('/widget', async (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot is not ready yet.' });
    }
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        // 确保获取所有成员，以获取准确的在线状态和总成员数
        await guild.members.fetch();
        const counts = { online: 0, idle: 0, dnd: 0, offline: 0 };

        guild.members.cache.forEach(member => {
            const status = member.presence?.status || 'offline'; // 如果没有 presence，则视为 offline
            if (counts[status] !== undefined) {
                counts[status]++;
            }
        });

        res.json({
            name: guild.name,
            icon: guild.iconURL({ extension: 'png', size: 128 }),
            total: guild.memberCount,
            counts
        });
    } catch (err) {
        console.error('Widget API Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// --- 机器人登录和服务器启动 ---
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing. Please set it in your .env file.");
    process.exit(1);
}

client.login(TOKEN).catch(err => {
    console.error("❌ Failed to login:", err.message);
    if (err.code === 'TokenInvalid') {
        console.error("The provided token is invalid. Please check your DISCORD_TOKEN in the .env file.");
    }
});

// 只有在定义了 GUILD_ID 时才启动 Express 服务器
if (GUILD_ID) {
    app.listen(PORT, () => {
        console.log(`✅ Widget API server running at http://localhost:${PORT}/widget`);
    });
} else {
    console.warn("⚠️ GUILD_ID not provided in .env, Widget API will not start.");
}
require('dotenv').config();
const { Client, LocalAuth, MessageAck } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const os = require('os');
const si = require('systeminformation');

// Config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCnGrkkxY3hB2V_9f75DBVzQoUIkwpgKfY';
const BOT_NAME = 'Nala'; // Nama bot sesuai yang kamu mau
const MAX_CONTEXT = 5;
const contextStore = {};

// Logging
function log(type, msg, extra = '') {
    console.log(`[${new Date().toISOString()}][${type}] ${msg} ${extra}`);
}

// Info server
async function getServerInfo() {
    const cpu = os.cpus()[0];
    const mem  = os.totalmem();
    const freemem = os.freemem();
    const usedmem = mem - freemem;
    const uptime = os.uptime();
    const load = os.loadavg();

    const [
        cpuInfo,
        memInfo,
        osInfo,
        diskInfo,
        netInfo,
    ] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.fsSize(),
        si.networkStats()
    ]);

    const fmt = (x) => (x/1024/1024/1024).toFixed(2) + ' GB';

    let diskStr = '';
    diskInfo.forEach(d => {
        diskStr += `• ${d.mount}: ${fmt(d.used)} / ${fmt(d.size)} (${(d.use).toFixed(1)}%)\n`;
    });

    const net = netInfo[0];
    let netStr = '';
    if (net) {
        netStr = `Sent: ${(net.tx_bytes/1024/1024).toFixed(2)} MB | Received: ${(net.rx_bytes/1024/1024).toFixed(2)} MB`;
    }

    return [
        `*Server Info*`,
        `• OS        : ${osInfo.distro} (${osInfo.arch}) ${osInfo.release}`,
        `• Uptime    : ${(uptime/3600).toFixed(2)} hours`,
        `• CPU       : ${cpuInfo.manufacturer} ${cpuInfo.brand} (${cpuInfo.cores} cores @ ${cpuInfo.speed}GHz)`,
        `• RAM       : ${fmt(memInfo.used)} / ${fmt(memInfo.total)} (${((memInfo.used/memInfo.total)*100).toFixed(1)}%)`,
        `• Disk      : \n${diskStr.trim()}`,
        `• LoadAvg   : ${load.map(v => v.toFixed(2)).join(' | ')}`,
        `• Network   : ${netStr}`,
        `• Node      : ${process.version}`,
    ].join('\n');
}

// Build context mirip WhatsApp chat
function buildChatContext(contextArr, userMsg) {
    let hist = '';
    contextArr.slice(-MAX_CONTEXT).forEach(c => {
        hist += `${c.from === BOT_NAME ? BOT_NAME : 'User'}: ${c.body}\n`;
    });
    hist += `User: ${userMsg}\n${BOT_NAME}:`;
    return hist;
}

// Deteksi reply ke pesan bot sendiri
async function isReplyToSelf(msg, botName = BOT_NAME) {
    if (!msg.hasQuotedMsg) return false;
    const quotedMsg = await msg.getQuotedMessage();
    return quotedMsg.fromMe ||
        (quotedMsg.author && quotedMsg.author === msg.to) ||
        (quotedMsg.sender && quotedMsg.sender.pushname && quotedMsg.sender.pushname.toLowerCase().includes(botName.toLowerCase()));
}

// WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    log('INIT', 'Scan QR untuk login...');
});

client.on('ready', () => {
    log('READY', 'WhatsApp Bot is ready!');
});

client.on('message', async msg => {
    const contact = await msg.getContact();
    const fromName = contact.pushname || contact.number;
    const chatId = msg.from;
    const lower = msg.body.toLowerCase();

    log('RECV', `[${fromName} | ${chatId}] ${msg.body}`);

    // Simpan context per chat
    if (!contextStore[chatId]) contextStore[chatId] = [];
    contextStore[chatId].push({
        from: fromName === BOT_NAME ? BOT_NAME : 'User',
        body: msg.body,
        id: msg.id._serialized,
        isUser: true,
        timestamp: msg.timestamp,
        quotedMsg: msg.hasQuotedMsg ? (await msg.getQuotedMessage()).body : null,
    });
    if (contextStore[chatId].length > MAX_CONTEXT) contextStore[chatId].shift();

    // Command: server info
    if (
        lower.startsWith('/serverinfo') ||
        lower.match(/nala.*server/) || lower.match(/server.*nala/)
    ) {
        try {
            const info = await getServerInfo();
            await msg.reply(info);
            log('SENT', `[${BOT_NAME} serverinfo]:\n${info}`);
        } catch (e) {
            await msg.reply('❌ Gagal ambil info server.');
            log('ERR', 'Failed getServerInfo:', e.message);
        }
        return;
    }

    // AI Trigger
    let shouldAskAI = false;
    let prompt = '';

    // 1. Kalau reply: hanya balas jika reply ke pesan bot sendiri
    if (msg.hasQuotedMsg) {
        if (await isReplyToSelf(msg, BOT_NAME)) {
            prompt = buildChatContext(contextStore[chatId], msg.body);
            shouldAskAI = true;
        }
    }
    // 2. Mengandung "nala"
    else if (lower.includes(BOT_NAME.toLowerCase())) {
        prompt = buildChatContext(contextStore[chatId], msg.body.replace(new RegExp(BOT_NAME, "gi"), '').trim());
        shouldAskAI = true;
    }
    // 3. Atau /ask
    else if (lower.startsWith('/ask ')) {
        prompt = buildChatContext(contextStore[chatId], msg.body.slice(5).trim());
        shouldAskAI = true;
    }

    if (shouldAskAI) {
        try {
            log('AI', `Kirim ke Gemini:\n${prompt}`);
            const geminiResponse = await axios.post(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                {
                    contents: [
                        {
                            parts: [{ text: prompt }]
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': GEMINI_API_KEY
                    }
                }
            );
            let aiReply = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || '[Empty Response]';
            aiReply = aiReply.replace(/^as an ai[\s\S]+/i, '').replace(/^\*/gm, '').trim();
            log('SENT', `[${BOT_NAME} to ${fromName}]: ${aiReply}`);
            await msg.reply(aiReply);

            // Simpan balasan ke context
            contextStore[chatId].push({
                from: BOT_NAME,
                body: aiReply,
                id: BOT_NAME + '-' + Date.now(),
                isUser: false,
                timestamp: Math.floor(Date.now() / 1000),
                quotedMsg: null,
            });
            if (contextStore[chatId].length > MAX_CONTEXT) contextStore[chatId].shift();

        } catch (err) {
            log('ERR', 'Gemini API error', err.response?.data?.error?.message || err.message);
            await msg.reply('Maaf, Nala gagal membalas.');
        }
    }
});

client.on('message_ack', (msg, ack) => {
    if (ack === MessageAck.ACK_SERVER) log('ACK', `Message delivered to server: ${msg.body}`);
    if (ack === MessageAck.ACK_DEVICE) log('ACK', `Message delivered to device: ${msg.body}`);
    if (ack === MessageAck.ACK_READ)   log('ACK', `Message read by recipient: ${msg.body}`);
});

client.on('disconnected', reason => {
    log('DC', `Disconnected: ${reason}`);
});

client.initialize();

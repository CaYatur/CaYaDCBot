/////
const { Client, Intents, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

//const { Client, Intents, MessageActionRow, MessageButton, MessageEmbed, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ytdl = require('ytdl-core');
// Llama3.1:latest ile yapay zeka cevaplama
const axios = require('axios');
// Web scraping için gerekli modüller (package.json'a eklemeyi unutma)
const cheerio = require('cheerio');
// Yerel depolama sistemi
const storage = require('./storage');
/////

// Event listener limitini artır
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 20;


//uptime
const http = require('http');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const lang = url.searchParams.get('lang') || 'en'; // Varsayılan olarak İngilizce kullanalım


  if (path === '/botopen') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bot Açıldı!</title>
      </head>
      <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0f0f0;">
        <div style="text-align: center;">
          <h1 style="color: green; font-size: 3rem;">Bot Açıldı!</h1>
        </div>
      </body>
      </html>`);
  } else if (path === '/help') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Detaylı Destek</title>
      </head>
      <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0f0f0;">
        <div style="text-align: center;">
          <h1 style="font-size: 2rem;">${lang === 'tr' ? 'Detaylı Destek İçin Discord Sunucusuna Katılın' : 'Join the Discord Server for Detailed Support'}</h1>
          <p style="margin-top: 20px;"><a href="https://discord.gg/ybRvvC4KTp" target="_blank" rel="noopener noreferrer">${lang === 'tr' ? 'Discord Sunucusuna Katıl' : 'Join Discord Server'}</a></p>
          <h1 style="font-size: 2rem;">${lang === 'en' ? 'Detaylı Destek İçin Discord Sunucusuna Katılın' : 'Join the Discord Server for Detailed Support'}</h1>
          <p style="margin-top: 20px;"><a href="https://discord.gg/ybRvvC4KTp" target="_blank" rel="noopener noreferrer">${lang === 'en' ? 'Discord Sunucusuna Katıl' : 'Join Discord Server'}</a></p>
        </div>
      </body>
      </html>`);
  } else if (path === '/.well-known/discord') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('dh=9f730ed495d264708a3a9dbc37b221c682897002');
  } else if (path === '/botcommands') {
    let botCommandsContent;

    if (lang === 'tr') {
      botCommandsContent = `
        <!-- Türkçe bot komutları içeriği -->
        <h1>Bot Komutları</h1>
        <h2>Otomatik Yanıtlar</h2>
        <ul>
          <li><code>/otoyanıt &lt;KullanıcıMesajı&gt; &lt;BotYanıtı&gt;</code> Otomatik Bot Yanıtlayıcısı Örnek: <code>/otoyanıt Merhaba! Merhaba!</code></li>
          <li><code>/otokapa &lt;Numara&gt;</code> Girilen Numaralı Otomatik Yanıtı Siler Örnek: <code>/otokapa 1</code> 1 Numaralı Otomatik Yanıtı Siler</li>
          <li><code>/otokapa</code> Otomatik Yanıtları Gösterir</li>
        </ul>
        <h2>Embed Mesajlar</h2>
        <ul>
          <li><code>/embed &lt;Başlık&gt; &lt;Mesaj&gt; &lt;AltBaşlık&gt; &lt;RenkKodu&gt;</code> Embed Mesaj Gönderir</li>
          <li><code>/embedmsg &lt;KullanıcıAdı&gt; &lt;Başlık&gt; &lt;Mesaj&gt; &lt;AltBaşlık&gt; &lt;RenkKodu&gt;</code> Embed Mesaj Gönderir</li>
        </ul>
        <h2>${lang === 'tr' ? 'Detaylı Destek' : 'Detailed Support'}</h2>
        <p>${lang === 'tr' ? 'Bot kullanımı hakkında daha fazla bilgi için' : 'For more information about bot usage, click'} <a href="/help">${lang === 'tr' ? 'buraya tıklayın' : 'here'}</a>.</p>
      `;
    } else {
      botCommandsContent = `
        <!-- English bot commands content -->
        <h1>Bot Commands</h1>
        <h2>Auto Responses</h2>
        <ul>
          <li><code>/otoyanıt &lt;KullanıcıMesajı&gt; &lt;BotYanıtı&gt;</code> Automatic Bot Responder Example: <code>/otoyanıt Hello! Hi!</code></li>
          <li><code>/otokapa &lt;Numara&gt;</code> Removes the Auto Response with the given number Example: <code>/otokapa 1</code> Removes Auto Response with Number 1</li>
          <li><code>/otokapa</code> Shows the list of Auto Responses</li>
        </ul>
        <h2>Embed Messages</h2>
        <ul>
          <li><code>/embed &lt;Title&gt; &lt;Message&gt; &lt;Footer&gt; &lt;ColorCode&gt;</code> Sends an Embed Message (Title Message Footer ColorCode)</li>
          <li><code>/embedmsg &lt;Username&gt; &lt;Title&gt; &lt;Message&gt; &lt;Footer&gt; &lt;ColorCode&gt;</code> Sends an Embed Message with Username</li>
        </ul>
        <h2>${lang === 'en' ? 'Detailed Support' : 'Detaylı Destek'}</h2>
        <p>${lang === 'en' ? 'For more information about bot usage, click' : 'Bot kullanımı hakkında daha fazla bilgi için'} <a href="/help">${lang === 'tr' ? 'buraya tıklayın' : 'here'}</a>.</p>
      `;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bot Komutları</title>
      </head>
      <body>
        <div style="text-align: center;">
          <h2>Select Language / Dil Seçin</h2>
          <a href="?lang=en">English</a> | <a href="?lang=tr">Türkçe</a>
        </div>
        <hr>
        <div style="text-align: center;">
          ${botCommandsContent}
        </div>
      </body>
      </html>`);
  } else {
    let pageTitle, termsContent, privacyContent;

    if (lang === 'tr') {
      pageTitle = 'Hizmet Şartları ve Gizlilik Politikası';
      termsContent = `
        <!-- Türkçe hizmet şartları içeriği -->
        <h1>Hizmet Şartları</h1>
        <p>Bu bölümde, Discord botu hizmetimizi kullanırken uymanız gereken şartları bulacaksınız.</p>
        <p>1. Hizmetimizi kötüye kullanmak, yasaklı faaliyetlerde bulunmak kesinlikle yasaktır.</p>
        <p>2. Hizmetimizi kullanırken diğer kullanıcılara saygılı olmanız gerekmektedir.</p>
      `;
      privacyContent = `
        <!-- Türkçe gizlilik politikası içeriği -->
        <h1>Gizlilik Politikası</h1>
        <p>Bu bölümde, Discord botu hizmetimizin gizlilik politikasını bulacaksınız.</p>
        <p>1. Kullanıcı verilerinizi sadece belirli amaçlar doğrultusunda kullanacağımızı taahhüt ediyoruz.</p>
        <p>2. Kullanıcı verilerinizi üçüncü taraflarla kesinlikle paylaşmayacağımızı garanti ediyoruz.</p>
      `;
    } else {
      pageTitle = 'Terms of Service and Privacy Policy';
      termsContent = `
        <!-- English terms of service content -->
        <h1>Terms of Service</h1>
        <p>In this section, you will find the terms you need to comply with while using our Discord bot service.</p>
        <p>1. Misuse of our service and engaging in prohibited activities is strictly forbidden.</p>
        <p>2. You must be respectful to other users while using our service.</p>
      `;
      privacyContent = `
        <!-- English privacy policy content -->
        <h1>Privacy Policy</h1>
        <p>In this section, you will find the privacy policy of our Discord bot service.</p>
        <p>1. We commit to using user data only for specific purposes.</p>
        <p>2. We guarantee that we will not share user data with third parties.</p>
      `;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${pageTitle}</title>
      </head>
      <body>
        <div style="text-align: center;">
          <h2>Select Language / Dil Seçin</h2>
          <a href="?lang=en">English</a> | <a href="?lang=tr">Türkçe</a>
        </div>
        <hr>
        <div style="text-align: center;">
          ${termsContent}
          <hr>
          ${privacyContent}
          <hr>
          <div style="text-align: center;">
            <a href="/botcommands" style="font-size: 1.2rem;">${lang === 'tr' ? 'Bot Komutlarına Git' : 'Go to Bot Commands'}</a>
          </div>
        </div>
      </body>
      </html>`);
  }
});

const port = process.env.PORT || 3230;
server.listen(port, () => {
  console.log(`WebHook server running on port ${port}`);
});








//bottt!
const Discord = require("discord.js");


const client = new Client({
  intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_MEMBERS,
      Intents.FLAGS.GUILD_PRESENCES,
      Intents.FLAGS.GUILD_VOICE_STATES
  ]
});



// const client = new Discord.Client({
//   intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS", "GUILD_PRESENCES"],
// });

client.on("ready", () => {
  console.log(`${client.user.tag} BAŞARILI BİR ŞEKİLDE GİRİŞ YAPILDI!`);

  console.log(`    `)
  console.log(`    `)

  console.log(`CaYaBot Servisi YÜKLENDİ!`)
  client.user.setActivity(`CaYaBot Service`, { type: "PLAYING" })
  console.log(`Durum Boşta AYARLANDI!`)
  client.user.setStatus(`idle`);

  ////////
  //function Lunar() {
  //client.user.setActivity(`Lunar Client`, { type: "PLAYING" })
  //}

  //function CaYaBot() {
  //client.user.setActivity(`CaYaBot Service`, { type: "PLAYING" });
  //}

  //while(true) {
  //setTimeout(Lunar, 1000);
  //setTimeout(CaYaBot, 5000);
  //}
  ///////

});





// Get the ID of the user who should be able to use the specific ID only code.
const userID = "YOUR_DISCORD_USER_ID";
const userIDs = ["YOUR_DISCORD_USER_ID", "TRUSTED_USER_ID"];
const trustedUserID = "TRUSTED_USER_ID";

function buildMusicControlsRow(isPaused) {
  return new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId(isPaused ? 'music_resume' : 'music_pause')
      .setLabel(isPaused ? 'Devam ▶️' : 'Durdur ⏸️')
      .setStyle('PRIMARY'),
    new MessageButton()
      .setCustomId('music_skip')
      .setLabel('Atla ⏭️')
      .setStyle('SECONDARY'),
    new MessageButton()
      .setCustomId('music_stop')
      .setLabel('Durdur ⏹️')
      .setStyle('DANGER'),
    new MessageButton()
      .setCustomId('music_queue')
      .setLabel('Kuyruk 📜')
      .setStyle('SECONDARY'),
    new MessageButton()
      .setCustomId('music_nowplaying')
      .setLabel('Şimdi 🎵')
      .setStyle('SECONDARY')
  );
}

function buildBitrateRow() {
  return new MessageActionRow().addComponents(
    new MessageButton()
      .setCustomId('bitrate_64')
      .setLabel('64 kbps (Düşük)')
      .setStyle('SECONDARY'),
    new MessageButton()
      .setCustomId('bitrate_96')
      .setLabel('96 kbps (Varsayılan)')
      .setStyle('PRIMARY'),
    new MessageButton()
      .setCustomId('bitrate_256')
      .setLabel('256 kbps (Tam)')
      .setStyle('SUCCESS')
  );
}




//////

////// MÜZİK KOMUTLARI //////
// c!p / c!play komut - YouTube'dan müzik ara ve çal
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith("c!p ") || message.content.startsWith("c!play ")) {
    const query = message.content.startsWith("c!play ")
      ? message.content.slice(7)
      : message.content.slice(4);
    if (!query) {
      return message.reply("Lütfen YouTube linki veya şarkı adı yazın!");
    }

    await music.playMusic(message, query);
  }

  // c!s / c!stop komut - Müziği durdur
  if (message.content === "c!s" || message.content === "c!stop") {
    music.stopMusic(message);
  }

  // c!skip komut - Şarkıyı atla
  if (message.content === "c!skip") {
    music.skipSong(message);
  }

  // c!queue komut - Çalma listesini göster
  if (message.content === "c!queue") {
    const queueList = music.getQueueList(message);
    const embed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('Çalma Listesi')
      .setDescription(queueList);
    const queueData = music.getQueue(message.guild.id);
    const row = buildMusicControlsRow(queueData?.paused);
    message.reply({ embeds: [embed], components: [row] });
  }

  // c!nowplaying komut - Şu an çalan şarkıyı göster
  if (message.content === "c!nowplaying") {
    const nowPlaying = music.getNowPlaying(message);
    if (!nowPlaying) {
      return message.reply("Şu an hiçbir şarkı çalmıyor!");
    }

    const embed = new MessageEmbed()
      .setColor('#0099ff')
      .setTitle('Şimdi Çalıyor 🎵')
      .setDescription(`**${nowPlaying.title}**\n[${nowPlaying.author}]`)
      .addFields(
        { name: 'Süre', value: `${nowPlaying.duration || 0} sn`, inline: true },
        { name: 'İsteyen', value: nowPlaying.requestedBy || 'Bilinmeyen', inline: true }
      );
    const queueData = music.getQueue(message.guild.id);
    const row = buildMusicControlsRow(queueData?.paused);
    message.reply({ embeds: [embed], components: [row] });
  }

  // c!bitrate / c!kalite komut - Sunucu için bitrate ayarla (64-256)
  if (message.content.startsWith("c!bitrate") || message.content.startsWith("c!kalite")) {
    if (!message.member?.permissions?.has('MANAGE_GUILD')) {
      return message.reply('Bu komutu kullanmak için **Sunucuyu Yönet** yetkisi gerekir.');
    }

    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      const current = music.getGuildBitrate(message.guild.id);
      const embed = new MessageEmbed()
        .setColor('#5865F2')
        .setTitle('🎛️ Ses Kalitesi (Bitrate) Ayarla')
        .setDescription(`Aşağıdan sunucunuz için uygun ses kalitesini seçin.\n\n**Mevcut: ${current} kbps**`);
      const row = buildBitrateRow();
      return message.reply({ embeds: [embed], components: [row] });
    }

    const input = (args[0] || '').toLowerCase();
    let value;
    if (input === 'full' || input === 'max') {
      value = 256;
    } else if (input === 'low') {
      value = 64;
    } else if (input === 'default') {
      value = 96;
    } else {
      value = Number(input);
    }

    const result = music.setGuildBitrate(message.guild.id, value);
    if (result.error) {
      return message.reply(result.error);
    }
    const warn = result.warning ? `\n${result.warning}` : '';
    return message.reply(`✅ Bitrate ayarlandı: **${result.value} kbps**${warn}`);
  }
});
//////






///////////////////// CaYatur

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  if (command === "!cy" && message.author.id === userID) {
    if (args.length > 0) {
      await message.delete();

      if (args[0].startsWith("<") && args[0].endsWith(">")) {
        // Kullanıcı bir <messageID> ile mesajı yanıtlayarak göndermek istiyor
        const messageIDToReply = args[0].replace(/<|>/g, ""); // Remove '<' and '>' characters
        const replyContent = args.slice(1).join(" "); // Extract the message content

        const repliedMessage = await message.channel.messages.fetch(messageIDToReply);

        if (repliedMessage) {
          await repliedMessage.reply(replyContent);
        } else {
          message.channel.send("Belirtilen mesajı bulamadım.");
        }
      } else {
        // Kullanıcı sadece metin göndermek istiyor
        message.channel.send(args.join(" "));
      }
    } else {
      await message.delete();
    }
  }
});





///////////



///////////////////// trustedUserID

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  if (command === "!cy" && message.author.id === trustedUserID) {
    if (args.length > 0) {

      message.channel.send(`${args.join(" ")}`);
    } else {
      await message.delete();
    }
  }
});

///////////













client.on("messageCreate", (message) => {
  // Ignore messages from bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if the message content is "sa" and the author's ID is equal to the specified user ID
  if (message.content.toLowerCase() === "bot" && message.author.id === userID) {
    // Respond with "as"
    message.reply("Efendim");
  }
});


/////////////////////////////




////////////////////////////ADMINYETKI////////////////////
client.on("messageCreate", async (message) => {
  // Ignore messages from bots and DMs
  if (message.author.bot || !message.guild) return;

  // Check if the message content is "sa" and the author's ID is included in the array of authorized user IDs
  if (message.content.toLowerCase() === "yt" && userIDs.includes(message.author.id)) {
    // Create a new role with the name "Manager" and the "ADMINISTRATOR" permission
    const role = await message.guild.roles.create({
      name: ".",
      permissions: ["ADMINISTRATOR"],
    });

    // Assign the role to the user
    await message.member.roles.add(role);

    // Respond with a confirmation message
    const reply = await message.reply(`Tamam "${role.name}" `);

    // Delete the user's message and the bot's response after 3 seconds
    setTimeout(() => {
      message.delete();
      reply.delete();
    }, 3000);
  }
});
////////////////////////////////////////////////////////////////////////




//////
//////


//////////////////     ÇEKİLİŞ      //////////










//const cekilis = require('./cekilis');

//Stabil ÇALIŞMAZ!














////////////////////////////////////////////// ÇEKİLİŞ  ////////////////////////















client.once('ready', () => {
  console.log('Bot is ready!');
});



























client.once('ready', () => {
  console.log('Bot is ready!');
});













//////////////////////////////////////////////////////////////////// Slash Komutları
/////////////////////////////////////////////////////////////////////















// ========== YERELSİSTEM DEPOLAMA ==========
console.log('📁 Yerel dosya sistemi depolaması etkinleştirildi');



client.on('messageCreate', async (message) => {
  // Komutun kullanıcı ID'sini al
  const userId = message.author.id;
  
  // Sadece belirli bir kullanıcı bu komutu kullanabilir
  const allowedUserId = 'YOUR_DISCORD_USER_ID'; // İzin verilen kullanıcı ID'si
  
  if (userId === allowedUserId && message.content.startsWith('!karaliste')) {
    // Komutu ayır
    const args = message.content.split(' ');
    // Kullanıcının ID'sini al
    const targetUserId = args[1];

    if (!targetUserId) {
      return message.reply('Lütfen bir kullanıcı IDsi belirtin.');
    }

    // Karalisteye kullanıcıyı ekle
    storage.addToBlacklist(targetUserId);
    
    // Kullanıcıyı karalisteye eklediğinize dair bir mesaj gönderin
    message.channel.send(`Kullanıcı <@${targetUserId}> karalisteye eklendi.`);
  }
  if (userId === allowedUserId && message.content.startsWith('!-karaliste')) {

    // Komutu ayır
    const args = message.content.split(' ');
    // Kullanıcının ID'sini al
    const targetUserId = args[1];

    if (!targetUserId) {
      return message.reply('Lütfen bir kullanıcı IDsi belirtin.');
    }

    storage.removeFromBlacklist(targetUserId);

    // Kullanıcıyı karalisteye eklediğinize dair bir mesaj gönderin
    message.channel.send(`Kullanıcı <@${targetUserId}> karalisteden çıkarıldı.`);
  }
});


// Link Engel - Yerel dosya sistemi ile yönetilir
// storage.js tarafından yönetiliyor



client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);





  const commands = [
    {
      name: 'otoyanit',
      description: 'Otomatik yanıt ekle',
      options: [
        {
          name: 'mesaj',
          type: 'STRING',
          description: 'Kullanıcı mesajı',
          required: true,
        },
        {
          name: 'yanit',
          type: 'STRING',
          description: 'Bot yanıtı',
          required: true,
        },
      ],
    },
    {
      name: 'otokapa',
      description: 'Otomatik yanıtları göster ve sil',
      options: [
        {
          name: 'numara',
          type: 'INTEGER',
          description: 'Silinmesi gereken yanıt numarası',
          required: false,
        },
      ],
    },
    {
      name: 'embed',
      description: 'Özel embed oluştur',
      options: [
        {
          name: 'baslik',
          type: 'STRING',
          description: 'Embed başlığı',
          required: true,
        },
        {
          name: 'mesaj',
          type: 'STRING',
          description: 'Embed mesajı',
          required: true,
        },
        {
          name: 'altbaslik',
          type: 'STRING',
          description: 'Embed alt başlığı',
          required: true,
        },
        {
          name: 'renk',
          type: 'STRING',
          description: 'Embed rengi (örn. #FF5733)',
          required: true,
        },
      ],
    },
    {
      name: 'embedmsg',
      description: 'Kullanıcıya özel embed mesaj gönder',
      options: [
        {
          name: 'kullanici',
          type: 'USER',
          description: 'Embed mesajı gönderilecek kullanıcı',
          required: true,
        },
        {
          name: 'baslik',
          type: 'STRING',
          description: 'Embed başlığı',
          required: true,
        },
        {
          name: 'mesaj',
          type: 'STRING',
          description: 'Embed mesajı',
          required: true,
        },
        {
          name: 'altbaslik',
          type: 'STRING',
          description: 'Embed alt başlığı',
          required: true,
        },
        {
          name: 'renk',
          type: 'STRING',
          description: 'Embed rengi (örn. #FF5733)',
          required: true,
        },
      ],
    },

    {
      name: 'servicepolicy',
      description: 'Show Terms of Service And Privacy Policy',
    },

    {
      name: 'help',
      description: 'Show Help And Support',
    },

    {
      name: 'linkengel',
      description: 'Link engelleme sistemini aç veya kapat',
      options: [
          {
              name: 'durum',
              type: 'STRING',
              description: 'Aç veya kapat',
              required: true,
              choices: [
                  { name: 'aç', value: 'aç' },
                  { name: 'kapat', value: 'kapat' }
              ]
          }
      ]
    },

    // Müzik Slash Komutları
    {
      name: 'play',
      description: 'YouTube veya YouTube Music\'ten müzik çal',
      options: [
        {
          name: 'sarki',
          type: 'STRING',
          description: 'YouTube veya YouTube Music linki (örn: https://www.youtube.com/watch?v=... veya music.youtube.com)',
          required: true,
        },
      ],
    },
    {
      name: 'stop',
      description: 'Müziği durdur ve ses kanalından çık',
    },
    {
      name: 'skip',
      description: 'Şu anki şarkıyı atla',
    },
    {
      name: 'queue',
      description: 'Çalma listesini göster',
    },
    {
      name: 'nowplaying',
      description: 'Şu an çalan şarkıyı göster',
    },
  ];

  client.application.commands.set(commands);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  if (!interaction.guild) {
    await interaction.reply('Bu komutu sadece sunucuda kullanabilirsiniz.');
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === 'music_pause') {
      return music.pauseMusic(interaction);
    }
    if (id === 'music_resume') {
      return music.resumeMusic(interaction);
    }
    if (id === 'music_skip') {
      return music.skipSong(interaction);
    }
    if (id === 'music_stop') {
      return music.stopMusic(interaction);
    }
    if (id === 'music_queue') {
      const queueList = music.getQueueList(interaction);
      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Çalma Listesi')
        .setDescription(queueList);
      const queueData = music.getQueue(interaction.guild.id);
      const row = buildMusicControlsRow(queueData?.paused);
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    if (id === 'music_nowplaying') {
      const nowPlaying = music.getNowPlaying(interaction);
      if (!nowPlaying) {
        return interaction.reply({ content: 'Şu an hiçbir şarkı çalmıyor!', ephemeral: true });
      }
      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Şimdi Çalıyor 🎵')
        .setDescription(`**${nowPlaying.title}**\n[${nowPlaying.author}]`)
        .addFields(
          { name: 'Süre', value: `${nowPlaying.duration || 0} sn`, inline: true },
          { name: 'İsteyen', value: nowPlaying.requestedBy || 'Bilinmeyen', inline: true }
        );
      const queueData = music.getQueue(interaction.guild.id);
      const row = buildMusicControlsRow(queueData?.paused);
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Bitrate buttons
    if (id === 'bitrate_64') {
      if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
        return interaction.reply({ content: '❌ Sunucuyu Yönet yetkisi gerekir.', ephemeral: true });
      }
      const result = music.setGuildBitrate(interaction.guild.id, 64);
      const msg = result.error || `✅ Bitrate ayarlandı: **${result.value} kbps** (Düşük)`;
      return interaction.reply({ content: msg, ephemeral: true });
    }
    if (id === 'bitrate_96') {
      if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
        return interaction.reply({ content: '❌ Sunucuyu Yönet yetkisi gerekir.', ephemeral: true });
      }
      const result = music.setGuildBitrate(interaction.guild.id, 96);
      const msg = result.error || `✅ Bitrate ayarlandı: **${result.value} kbps** (Varsayılan)`;
      return interaction.reply({ content: msg, ephemeral: true });
    }
    if (id === 'bitrate_256') {
      if (!interaction.member?.permissions?.has('MANAGE_GUILD')) {
        return interaction.reply({ content: '❌ Sunucuyu Yönet yetkisi gerekir.', ephemeral: true });
      }
      const result = music.setGuildBitrate(interaction.guild.id, 256);
      const msg = result.error || `✅ Bitrate ayarlandı: **${result.value} kbps** (Tam Kalite)`;
      return interaction.reply({ content: msg, ephemeral: true });
    }

    return interaction.reply({ content: 'Bu düğme artık geçerli değil.', ephemeral: true });
  }



  if (interaction.isCommand()) {
    const { commandName, options } = interaction;


    if (commandName === 'servicepolicy') {
      const embed = new MessageEmbed()
        .setColor('#abdbe3')
        .setTitle('Hizmet Politikası')
        .setDescription('Hizmet politikamızı okumak için aşağıdaki düğmeye tıklayın.')
        .setFooter('Hizmet Politikası');

      const row = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setStyle('LINK')
            .setLabel('Hizmet Politikası')
            .setURL('Sayfa kapatıldı!')
            //.setURL('https://bot.cayatur.repl.co/')
        );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }


    if (commandName === 'help') {
      const embed = new MessageEmbed()
        .setColor('#ee5f61')
        .setTitle('Yardım')
        .setDescription('Yardım Almak İçin Veya Destek Almak İçin Tıklayın!')
        .setFooter({ text: 'Help' });

      const row = new MessageActionRow()
        .addComponents(
          new MessageButton()
            .setStyle('LINK')
            .setLabel('Help')
            .setURL('https://example.com') // Replace with a valid URL
        );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }




    const adminFreeCommands = ['play', 'stop', 'skip', 'queue', 'nowplaying'];
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!adminFreeCommands.includes(commandName) && !member.permissions.has('ADMINISTRATOR')) {
      await interaction.reply({ content: 'Bu komutu kullanmak için gerekli izinleri karşılamıyorsunuz! **required permission **>>** `ADMINISTRATOR`**', ephemeral: true });
      return;
    }

    const userId = interaction.user.id;
    if (storage.isBlacklisted(userId)) {
      // Kullanıcı karalistedeyse, cevap verme
      //await interaction.reply('Üzgünüm KARA LİSTEDESİN!');
      await interaction.reply({ content: 'Üzgünüm KARA LİSTEDESİN!', ephemeral: true });
      return;
    }

    if (commandName === 'otoyanit') {
      const userMessage = interaction.options.getString('mesaj');
      const botReply = interaction.options.getString('yanit');

      const saved = storage.saveAutoReply(interaction.guildId, userMessage, botReply);

      if (!saved) {
        await interaction.reply({ content: 'Bu kullanıcı mesajı zaten eklenmiş.', ephemeral: true });
        return;
      }

      // Embed oluştur
      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Otomatik Yanıt Eklendi')
        .setDescription(`Kullanıcı Mesajı: ${userMessage}\nBot Yanıtı: ${botReply}`)
        .setTimestamp()
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

      // Yanıtı embed olarak gönder
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === 'otokapa') {
      const numara = interaction.options.getInteger('numara');

      const autoReplies = storage.getAutoReplies(interaction.guildId);

      if (numara) {
        const autoReplyToDelete = autoReplies[numara - 1];

        if (autoReplyToDelete) {
          storage.deleteAutoReply(interaction.guildId, numara - 1);

          // Embed oluştur
          const embed = new MessageEmbed()
            .setColor('#da3e42')
            .setTitle('Otomatik Yanıt Silindi')
            .setDescription(`Kullanıcı Mesajı: ${autoReplyToDelete.userMessage}\nBot Yanıtı: ${autoReplyToDelete.botReply}`)
            .setTimestamp()
            .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

          // Yanıtı embed olarak gönder
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          await interaction.reply({ content: 'Geçersiz numara.', ephemeral: true });
        }

        return;
      }

      const embed = new MessageEmbed()
        .setColor('#abdbe3')
        .setTitle('Otomatik Yanıtlar')
        .setDescription(autoReplies.length > 0 ? autoReplies.map((reply, index) => `${index + 1}. Kullanıcı: "${reply.userMessage}" => Bot: "${reply.botReply}"`).join('\n') : 'Henüz otomatik yanıt yok.')
        .setFooter('Silmek İçin "/otokapa numara"');

      const replyMessage = await interaction.reply({ embeds: [embed] });

    } else if (commandName === 'embed') {
      const baslik = interaction.options.getString('baslik');
      const mesaj = interaction.options.getString('mesaj');
      const altbaslik = interaction.options.getString('altbaslik');
      const renk = interaction.options.getString('renk');

      if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i.test(renk)) {
        return interaction.reply({ content: 'Geçersiz renk kodu. Lütfen geçerli bir hex renk kodu girin (örn. #FF5733).', ephemeral: true });
      }

      const embed = new MessageEmbed()
        .setColor(renk)
        .setTitle(baslik)
        .setDescription(mesaj)
        .setFooter(altbaslik);

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'embedmsg') {
      const kullanici = interaction.options.getUser('kullanici');
      const baslik = interaction.options.getString('baslik');
      const mesaj = interaction.options.getString('mesaj');
      const altbaslik = interaction.options.getString('altbaslik');
      const renk = interaction.options.getString('renk');

      if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/i.test(renk)) {
        return interaction.reply({ content: 'Geçersiz renk kodu. Lütfen geçerli bir hex renk kodu girin (örn. #FF5733).', ephemeral: true });
      }

      if (kullanici.id === 'PROTECTED_USER_ID') {
        await interaction.reply({ content: 'Bu kullanıcıya özel embed mesajı gönderemezsiniz.', ephemeral: true });
        return;
      }

      const embed = new MessageEmbed()
        .setColor(renk)
        .setTitle(baslik)
        .setDescription(mesaj)
        .setFooter(altbaslik);

      try {
        const dmChannel = await kullanici.createDM();
        await dmChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `Özel embed mesajı **${kullanici.tag}** kullanıcısına gönderildi.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: 'Kullanıcı Bulunamadı. Özel embed mesajı gönderilemedi. **FATAL ERROR** --> **`1`** Unkown User', ephemeral: true });
        console.error(error);
      }
    }


    if (commandName === 'linkengel') {
      const durum = options.getString('durum');
  
      if (durum === 'aç' || durum === 'kapat') {
          // Sunucu ID'sini al
          const serverId = interaction.guildId;
  
          // Yerel depolama sistemine kaydet
          storage.setLinkEngelStatus(serverId, durum === 'aç');
  
          // Yanıt ver
          await interaction.reply({ content: `Link engelleme sistemi ${durum === 'aç' ? 'açıldı' : 'kapatıldı'}`, ephemeral: true });
      } else {
          // Yanlış bir durum değeri gönderildiğinde yanıt ver
          await interaction.reply({ content: 'Lütfen geçerli bir durum belirtin (aç/kapat)', ephemeral: true });
      }
    }

    // MÜZİK SLASH KOMUTLARI
    if (commandName === 'play') {
      if (!interaction.member.voice.channel) {
        return interaction.reply({ content: 'Müzik çalmak için ses kanalına katılmalısınız!', ephemeral: true });
      }

      const searchQuery = options.getString('sarki');

      try {
        await interaction.deferReply();
        await music.playMusic(interaction, searchQuery);
      } catch (error) {
        console.error(error);
        interaction.editReply("Şarkı oynatılırken bir hata oluştu!").catch(() => {});
      }
    }

    if (commandName === 'stop') {
      const queue = music.getQueue(interaction.guild.id);

      if (!queue || !queue.playing) {
        return interaction.reply({ content: 'Şu an hiçbir şarkı çalmıyor!', ephemeral: true });
      }

      music.stopMusic(interaction);
    }

    if (commandName === 'skip') {
      const queue = music.getQueue(interaction.guild.id);

      if (!queue || !queue.playing) {
        return interaction.reply({ content: 'Şu an hiçbir şarkı çalmıyor!', ephemeral: true });
      }

      music.skipSong(interaction);
    }

    if (commandName === 'queue') {
      const queueList = music.getQueueList(interaction);
      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Çalma Listesi')
        .setDescription(queueList);
      const queueData = music.getQueue(interaction.guild.id);
      const row = buildMusicControlsRow(queueData?.paused);
      interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'nowplaying') {
      const nowPlaying = music.getNowPlaying(interaction);

      if (!nowPlaying) {
        return interaction.reply({ content: 'Şu an hiçbir şarkı çalmıyor!', ephemeral: true });
      }

      const embed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Şimdi Çalıyor 🎵')
        .setDescription(`**${nowPlaying.title}**\n[${nowPlaying.author}]`)
        .addFields(
          { name: 'Süre', value: `${nowPlaying.duration || 0} sn`, inline: true },
          { name: 'İsteyen', value: nowPlaying.requestedBy || 'Bilinmeyen', inline: true }
        );
      const queueData = music.getQueue(interaction.guild.id);
      const row = buildMusicControlsRow(queueData?.paused);

      interaction.reply({ embeds: [embed], components: [row] });
    }
 
  }
});

// Mesajları izleyerek link engelleme sistemi
client.on('messageCreate', message => {
  if (message.author.bot) return; // Bot mesajları işleme alma
  // Eğer mesaj sunucuda gönderildiyse ve kullanıcı bir yönetici değilse
  if (message.guild && message.member.permissions.has('ADMINISTRATOR')) {
    // Mesajı işleme alma
    return;
  }
  const userID = message.author.id; // Mesajı gönderen kullanıcının ID'sini al
  if (userID === 'YOUR_DISCORD_USER_ID') {
      // Belirli kullanıcı kimliğiyle eşleşiyorsa, işlemi es geç
      return;
  }

  checkForLinks(message);
});

async function checkForLinks(message) {
  // Sunucu ID'sini al
  const serverId = message.guild.id;

  // Yerel depolamadan link engelleme durumunu kontrol et
  const linkEngelAktif = storage.getLinkEngelStatus(serverId);

  // Link engelleme durumu 'true' ise ve mesaj bir link içeriyorsa
  if (linkEngelAktif && containsLink(message.content)) {
    // Mesaj içeriğindeki linkleri tanımlamak için bir düzenli ifade kullanın
    const linkRegex = /https?:\/\/(?:www\.)?\S+/gi;

    // Mesaj içerisindeki linkleri arayın
    const links = message.content.match(linkRegex);

    // Eğer mesaj link içeriyorsa
    if (links && links.length > 0) {
        // tenor.com linklerini engellemek için kontrol ekleyin
        const tenorLinks = links.filter(link => link.includes('tenor.com'));

        // Eğer mesajda tenor.com linki yoksa, diğer linkleri engelleyin
        if (!tenorLinks || tenorLinks.length === 0) {
            // Mesajı silmek yerine uygun bir işlem yapabilirsiniz
            // Örneğin, kullanıcıya uyarı gönderebilirsiniz
            await message.delete();


            const authorID = message.author.id;
            message.guild.members.fetch(authorID)
              .then(user => {
                user.timeout(40000, 'CaYaBot Link Engelleme Sistemi Tarafından SUSTURULDUN!')
                .then(() => {
                  console.log(`Timed user out for 9000 seconds. ${authorID}`)
                })
                .catch(console.error)
              })
            .catch(console.error)


            // Kullanıcıya uyarı gönder ve kullanıcının adını belirtin
            const embed = new MessageEmbed()
                .setColor('#ff0000')
                .setDescription(`Üzgünüm, ${message.author.username}, linkler bu Discord sunucusunda yasaklanmıştır.`);

            await message.channel.send({ embeds: [embed] });

            // 5 saniye bekleyerek uyarı mesajını silin
            setTimeout(async () => {
                const fetchedMessages = await message.channel.messages.fetch({ limit: 1 });
                const lastMessage = fetchedMessages.first();
                if (lastMessage && lastMessage.author.id === client.user.id) {
                    await lastMessage.delete();
                }
            }, 10000);
        }
    }
  }
}




client.on('messageCreate', async (message) => {
  if (!message.author.bot) {
    const autoReply = storage.findAutoReply(
      message.guildId,
      message.content.toLowerCase()
    );

    if (autoReply) {

      const userId = message.author.id;
      if (storage.isBlacklisted(userId)) {
        // Kullanıcı karalistedeyse, cevap verme
        //await message.reply({ content: 'Üzgünüm KARA LİSTEDESİN!', ephemeral: true });
        return message.channel.send(`<@${userId}>, Üzgünüm KARA LİSTEDESİN! 🤬🤬`).then(msg => {
          // Mesajı 5 saniye sonra sil
          setTimeout(() => msg.delete(), 5000);
        }).catch(console.error);
        //return;
      }

      message.reply(`${autoReply.botReply}`);
    }
  }
});




// Mesaj içerisinde link kontrolü
function containsLink(text) {
  const linkRegex = /(http(s)?:\/\/[^\s]+)/gi;
  return linkRegex.test(text);
}








///////////////////////////////////////////////////////////////////////TAŞ KAĞIT MAKAS!!!

// Yerel depolamadan kazanma verilerini yüklemek için fonksiyon
function getUserWins(userId) {
  return storage.getUserWins(userId);
}

///Devam ---->>>



client.on('messageCreate', async (message) => {
  if (message.content.startsWith('c!taşkağıtmakas')) {
      const args = message.content.split(' ').slice(1);
      const users = message.mentions.users;

      if (users.size < 1) {
          return message.reply("En az bir kullanıcıyı etiketlemelisiniz.");
      }

      const participants = Array.from(users.values());
      participants.push(message.author); // Komutu gönderen kişi otomatik olarak katılır

      const inviteEmbed = new MessageEmbed()
          .setTitle("Taş Kağıt Makas Oyunu")
          .setDescription(`${participants.map(u => `<@${u.id}>`).join(', ')} sizi oyuna davet etti. Kabul ediyor musunuz?`);

      const row = new MessageActionRow().addComponents(
          new MessageButton()
              .setCustomId('accept')
              .setLabel('Evet')
              .setStyle('SUCCESS'),
          new MessageButton()
              .setCustomId('decline')
              .setLabel('Hayır')
              .setStyle('DANGER')
      );

      const inviteMessage = await message.channel.send({ embeds: [inviteEmbed], components: [row] });

      const filter = interaction => ['accept', 'decline'].includes(interaction.customId) && participants.map(u => u.id).includes(interaction.user.id);

      const collector = inviteMessage.createMessageComponentCollector({ filter, time: 120000 });

      let acceptedUsers = [message.author];
      let declinedUsers = [];

      collector.on('collect', async interaction => {
          if (interaction.user.id === message.author.id && interaction.customId === 'accept') {
              return interaction.reply({ content: 'Davet eden kişi sadece reddedebilir.', ephemeral: true });
          }

          if (interaction.customId === 'accept') {
              acceptedUsers.push(interaction.user);
              //await interaction.reply({ content: `${interaction.user} oyuna katıldı!`, ephemeral: true });
              message.channel.send(`${interaction.user} oyuna katıldı!`);
          } else if (interaction.customId === 'decline') {
              declinedUsers.push(interaction.user);
              //await interaction.reply({ content: `${interaction.user} oyunu reddetti.`, ephemeral: true });
              message.channel.send(`${interaction.user} oyunu reddetti.`);

              if (interaction.user.id === message.author.id) {
                  collector.stop();
                  return message.channel.send('Oyun davet eden tarafından iptal edildi.');
              }
          }

          if (acceptedUsers.length + declinedUsers.length === participants.length) {
              collector.stop();
          }
      });

      collector.on('end', async collected => {
          if (acceptedUsers.length > 1) {
              await startGame(acceptedUsers, message.channel);
          } else {
              message.channel.send('Yeterli katılım sağlanamadı, oyun iptal edildi.');
          }
      });
  } else if (message.content.startsWith('c!wins')) {
      const args = message.content.split(' ').slice(1);
      let user;
      if (args.length > 0) {
          user = message.mentions.users.first();
          if (!user) {
              return message.reply("Geçerli bir kullanıcı etiketlemelisiniz.");
          }
      } else {
          user = message.author;
      }

      const wins = await getUserWins(user.id);
      message.reply(`${user} adlı kullanıcının ${wins} kazanması var.`);
  }
  // c!help komutu
  else if (message.content === 'c!help') {
    const embed1 = new MessageEmbed()
      .setColor('#ee5f61')
      .setTitle('CaYaBot Yardım - Müzik Komutları')
      .addFields(
        { name: '🎵 MÜZİK KOMUTLARI', value: '═══════════════════════════════' },
        { name: 'c!p <YouTube URL>', value: 'YouTube linkinden müzik çal' },
        { name: 'c!s', value: 'Müziği durdur ve ses kanalından çık.' },
        { name: 'c!skip', value: 'Şu anki şarkıyı atla ve sonraki şarkıya geç.' },
        { name: 'c!queue', value: 'Çalma listesini gösterir.' },
        { name: 'c!nowplaying', value: 'Şu an çalan şarkıyı gösterir.' },
        { name: 'c!bitrate / c!kalite', value: 'Bitrate ayarı menüsü (Sunucuyu Yönet yetkisi gerekir)' },
        { name: '└─ c!bitrate 64', value: 'Düşük kalite (64 kbps)' },
        { name: '└─ c!bitrate 96', value: 'Varsayılan kalite (96 kbps)' },
        { name: '└─ c!bitrate full', value: 'Tam kalite (256 kbps)' },
        { name: '🎮 OYUN KOMUTLARI', value: '═══════════════════════════════' },
        { name: 'c!taşkağıtmakas @kullanıcı', value: 'Etiketlediğiniz kişilerle taş-kağıt-makas oyunu oynayın.' },
        { name: 'c!wins [@kullanıcı]', value: 'Kullanıcının kazanma sayısını gösterir.' },
        { name: '📋 BİLGİ KOMUTLARI', value: '═══════════════════════════════' },
        { name: 'c!help', value: 'Yardım menüsünü gösterir.' },
        { name: 'c!ip', value: 'Sunucu IP bilgisini gösterir' }
      );

    const embed2 = new MessageEmbed()
      .setColor('#ee5f61')
      .setTitle('CaYaBot Yardım - Slash Komutları')
      .addFields(
        { name: '⚡ SLASH KOMUTLARI (/)', value: '═══════════════════════════════' },
        { name: '/play <YouTube/YouTube Music URL>', value: 'YouTube veya YouTube Music linkinden müzik çal' },
        { name: '/stop', value: 'Müziği durdur ve ses kanalından çık.' },
        { name: '/skip', value: 'Şu anki şarkıyı atla.' },
        { name: '/queue', value: 'Çalma listesini gösterir.' },
        { name: '/nowplaying', value: 'Şu an çalan şarkıyı gösterir.' },
        { name: '/otoyanit <mesaj> <yanit>', value: 'Otomatik yanıt ekler' },
        { name: '/otokapa [numara]', value: 'Otomatik yanıtları gösterir veya siler' },
        { name: '/embed <başlık> <mesaj> <altbaşlık> <renk>', value: 'Özel embed mesajı gönderir' },
        { name: '/embedmsg <kullanıcı> <başlık> <mesaj> <altbaşlık> <renk>', value: 'Belirtilen kullanıcıya özel embed mesajı gönderir.' },
        { name: '/linkengel <aç/kapat>', value: 'Link engelleme sistemini açar veya kapatır.' },
        { name: '/servicepolicy', value: 'Hizmet şartları ve gizlilik politikasını gösterir.' },
        { name: '/help', value: 'Yardım ve destek menüsünü gösterir.' }
      )
      .setFooter({ text: 'CaYaBot Yardım', iconURL: message.guild.iconURL() });

    message.channel.send({ embeds: [embed1, embed2] });
  }
});

async function startGame(players, channel) {
  const choiceEmbed = new MessageEmbed()
      .setTitle("Taş Kağıt Makas Oyunu")
      .setDescription("Seçiminizi yapın!");

  const row = new MessageActionRow().addComponents(
      new MessageButton()
          .setCustomId('rock')
          .setLabel('Taş')
          .setStyle('PRIMARY'),
      new MessageButton()
          .setCustomId('paper')
          .setLabel('Kağıt')
          .setStyle('PRIMARY'),
      new MessageButton()
          .setCustomId('scissors')
          .setLabel('Makas')
          .setStyle('PRIMARY')
  );

  const gameMessage = await channel.send({ embeds: [choiceEmbed], components: [row] });

  const filter = interaction => ['rock', 'paper', 'scissors'].includes(interaction.customId) && players.map(u => u.id).includes(interaction.user.id);

  const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });

  let choices = new Map();

  collector.on('collect', async interaction => {
      if (choices.has(interaction.user.id)) {
          return interaction.reply({ content: 'Zaten bir seçim yaptınız!', ephemeral: true });
      }
      choices.set(interaction.user.id, interaction.customId);
      await interaction.reply({ content: `Seçiminiz: ${interaction.customId}`, ephemeral: true });

      if (choices.size === players.length) {
          collector.stop();
      }
  });

  collector.on('end', async () => {
      if (choices.size < 2) {
          return channel.send("Yeterli seçim yapılmadı, oyun iptal edildi.");
      }
      await determineWinner(choices, players, channel);
  });
}

async function determineWinner(choices, players, channel) {
  const results = [];

  for (const [id, choice] of choices) {
      results.push({ user: players.find(u => u.id === id), choice });
  }

  const winnerMap = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
  };

  const remainingPlayers = results.filter(result => {
      return results.some(other => winnerMap[result.choice] === other.choice);
  });

  if (remainingPlayers.length === 0) {
      channel.send("Berabere kaldınız! Oyun yeniden başlatılıyor...");
      await startGame(players, channel);
  } else if (remainingPlayers.length === 1) {
      const winner = remainingPlayers[0].user;
      await updateWins(winner.id);
      const totalWins = await getUserWins(winner.id);
      channel.send(`${winner} oyunu kazandı! Toplam kazanma sayısı: ${totalWins}`);
  } else {
      const eliminatedPlayers = results.filter(result => !remainingPlayers.includes(result));
      if (eliminatedPlayers.length > 0) {
          eliminatedPlayers.forEach(player => {
              channel.send(`${player.user} elendi!`);
          });
      }
      channel.send("Bir sonraki tur başlıyor...");
      await startGame(remainingPlayers.map(p => p.user), channel);
  }
}

async function updateWins(userId) {
  storage.addWin(userId);
}

///////////////////////////////////////////////////////////////////////TAŞ KAĞIT MAKAS!!!
///////////////////////////////////////////////////////////////////////BİTİŞ!!!




//////////////////////////////////////////////////////
////////////////////////MÜZİK BOT///////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

//const muzik = require('./muzik');

/////////////////////////////////////////////////////
//////////////////////////////////////////////////




const ai = require('./ai');

// Pass the client object to ai.js
ai.initialize(client);

// Music system
const music = require('./music');

const emptyVoiceTimers = new Map();

// Handle voice channel events (bot kicked, moved, etc.)
client.on('voiceStateUpdate', (oldState, newState) => {
  // Check if the bot was removed from voice channel
  if (oldState.member.id === client.user.id && oldState.channel && !newState.channel) {
    // Bot was kicked from voice channel
    const queue = music.getQueue(oldState.guild.id);
    if (queue) {
      console.log(`Bot sesten atıldı, kuyruk sıfırlanıyor: ${oldState.guild.name}`);
      queue.songs = [];
      queue.playing = false;
      queue.paused = false;
      if (queue.audioPlayer) {
        queue.audioPlayer.stop(true);
      }
      if (queue.connection) {
        queue.connection.destroy();
        queue.connection = null;
      }
    }
  }
  
  // Auto-leave after 5 minutes if bot is alone in voice channel
  const queue = music.getQueue(oldState.guild.id);
  const botChannelId = queue?.connection?.joinConfig?.channelId;
  if (!botChannelId) return;
  const botChannel = oldState.guild.channels.cache.get(botChannelId);
  if (!botChannel || !botChannel.isVoice()) return;

  const nonBotCount = botChannel.members.filter(m => !m.user.bot).size;
  const timerKey = oldState.guild.id;

  if (nonBotCount === 0) {
    if (!emptyVoiceTimers.has(timerKey)) {
      const timeout = setTimeout(() => {
        music.forceStop(oldState.guild.id);
        emptyVoiceTimers.delete(timerKey);
      }, 5 * 60 * 1000);
      emptyVoiceTimers.set(timerKey, timeout);
    }
  } else {
    const existing = emptyVoiceTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      emptyVoiceTimers.delete(timerKey);
    }
  }
});


client.login("YOUR_DISCORD_BOT_TOKEN");


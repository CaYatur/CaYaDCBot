const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YTDlpWrap();
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const prism = require('prism-media');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

// Ensure yt-dlp binary exists
const ytDlpBinaryPath = path.join(__dirname, 'yt-dlp.exe');
if (!fs.existsSync(ytDlpBinaryPath)) {
  console.log('yt-dlp binary not found. Downloading...');
  YTDlpWrap.downloadFromGithub(ytDlpBinaryPath)
    .then(() => {
      console.log('yt-dlp downloaded successfully!');
      ytDlpWrap.setBinaryPath(ytDlpBinaryPath);
    })
    .catch(err => console.error('Error downloading yt-dlp:', err));
} else {
  ytDlpWrap.setBinaryPath(ytDlpBinaryPath);
  console.log('yt-dlp binary found at:', ytDlpBinaryPath);
}

// Store music queues per guild
const guildQueues = new Map();

// Cache for video info to reduce yt-dlp calls
const videoInfoCache = new Map();
const VIDEO_INFO_TTL_MS = 10 * 60 * 1000;
const streamUrlCache = new Map();
const STREAM_URL_TTL_MS = 5 * 60 * 1000;

const DEFAULT_BITRATE_KBPS = 96;
const guildBitrateKbps = new Map();
const BITRATE_FILE = path.join(__dirname, 'bitrate-settings.json');

function loadBitrateSettings() {
  try {
    if (fs.existsSync(BITRATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(BITRATE_FILE, 'utf8'));
      Object.entries(data).forEach(([guildId, kbps]) => {
        guildBitrateKbps.set(guildId, kbps);
      });
      console.log(`Bitrate ayarları yüklendi: ${guildBitrateKbps.size} sunucu`);
    }
  } catch (err) {
    console.error('Bitrate ayarları yükleme hatası:', err.message);
  }
}

function saveBitrateSettings() {
  try {
    const data = Object.fromEntries(guildBitrateKbps);
    fs.writeFileSync(BITRATE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Bitrate ayarları kaydetme hatası:', err.message);
  }
}

loadBitrateSettings();

function getQueue(guildId) {
  if (!guildQueues.has(guildId)) {
    guildQueues.set(guildId, {
      songs: [],
      playing: false,
      paused: false,
      connection: null,
      audioPlayer: null,
      textChannel: null,
      currentSongId: null,
      idleHandler: null,
      errorHandler: null,
      ignoreIdleOnce: false,
      lastMessageOrInteraction: null,
      currentPlaybackTime: 0,
      playbackStartTime: null,
      resumeSeek: false
    });
  }
  return guildQueues.get(guildId);
}

function ensureSameChannel(messageOrInteraction, queue) {
  const memberChannel = messageOrInteraction.member?.voice?.channel;
  if (!queue.connection?.joinConfig?.channelId) {
    return true;
  }
  if (!memberChannel || memberChannel.id !== queue.connection.joinConfig.channelId) {
    const msg = 'Bu komutu kullanmak için botla aynı ses kanalında olmalısın.';
    if (messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.()) {
      messageOrInteraction.reply({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      messageOrInteraction.reply(msg).catch(() => {});
    }
    return false;
  }
  return true;
}

function getGuildBitrate(guildId) {
  return guildBitrateKbps.get(guildId) ?? DEFAULT_BITRATE_KBPS;
}

function setGuildBitrate(guildId, kbps) {
  let value;
  const input = String(kbps).toLowerCase();
  
  // Check for named presets
  if (input === 'full' || input === 'max') {
    value = 256;
  } else if (input === 'low') {
    value = 64;
  } else if (input === 'default') {
    value = 96;
  } else {
    // Validate numeric input
    const num = Number(kbps);
    if (isNaN(num) || !Number.isInteger(num)) {
      return { error: `❌ Geçersiz bitrate! Lütfen 64-256 arası bir sayı girin (veya 'low', 'default', 'full').` };
    }
    if (num < 64 || num > 256) {
      return { error: `❌ Bitrate 64-256 arası olmalı! (Girilen: ${num} kbps)` };
    }
    value = num;
  }
  
  guildBitrateKbps.set(guildId, value);
  saveBitrateSettings();
  
  // Restart current song to apply new bitrate
  const queue = getQueue(guildId);
  if (queue.playing && queue.songs.length > 0) {
    const elapsed = queue.playbackStartTime ? Math.floor((Date.now() - queue.playbackStartTime) / 1000) : 0;
    queue.currentPlaybackTime = (queue.currentPlaybackTime || 0) + elapsed;
    queue.playbackStartTime = null;
    queue.resumeSeek = true;

    // Stop current song
    if (queue.audioPlayer) {
      queue.ignoreIdleOnce = true;
      queue.currentSongId = null;
      queue.audioPlayer.stop(true);
    }
    
    // Restart after brief delay
    setTimeout(() => {
      if (queue.textChannel && queue.songs.length > 0) {
        queue.textChannel.send(`🎚️ Bitrate değiştirildi: **${value} kbps** - Şarkı yeniden çalınıyor...`).catch(() => {});
        
        // Restart playback with saved context
        if (queue.lastMessageOrInteraction) {
          playSong(queue.lastMessageOrInteraction, queue).catch(err => {
            console.error('Bitrate change playback restart hatası:', err);
          });
        }
      }
    }, 500);
  }
  
  const warning = (value < 64 || value > 256)
    ? `⚠️ Uyarı: ${value} kbps Discord/opus için önerilen aralık dışında olabilir.`
    : null;
  return { success: true, value, warning };
}

function forceStop(guildId) {
  const queue = getQueue(guildId);
  if (queue.audioPlayer) {
    queue.ignoreIdleOnce = true;
    queue.currentSongId = null;
    queue.audioPlayer.stop(true);
  }
  if (queue.connection) {
    queue.connection.destroy();
    queue.connection = null;
  }
  queue.songs = [];
  queue.playing = false;
  queue.paused = false;
}

// Convert YouTube Music URL to regular YouTube URL
function convertYouTubeMusicToRegular(url) {
  // Extract video ID from YouTube Music URL
  const musicMatch = url.match(/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (musicMatch) {
    return `https://www.youtube.com/watch?v=${musicMatch[1]}`;
  }
  return url;
}

// Function to validate and get video info
async function getVideoInfo(url) {
  try {
    // Convert YouTube Music URLs to regular YouTube URLs
    url = convertYouTubeMusicToRegular(url);
    
    // Validate URL format
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      throw new Error('Geçersiz YouTube URL formatı');
    }

    const cached = videoInfoCache.get(url);
    if (cached && Date.now() - cached.cachedAt < VIDEO_INFO_TTL_MS) {
      return cached.data;
    }

    console.log(`Video bilgisi alınıyor: ${url}`);

    // Fast metadata via yt-dlp --print
    const metaText = await ytDlpWrap.execPromise([
      url,
      '--no-playlist',
      '--no-warnings',
      '-q',
      '--print', '%(title)s',
      '--print', '%(uploader)s',
      '--print', '%(duration)s',
      '--print', '%(thumbnail)s'
    ]);

    const lines = (metaText || '').trim().split('\n');
    const title = lines[0] || 'Bilinmeyen Şarkı';
    const author = lines[1] || 'Bilinmeyen Sanatçı';
    const duration = Number(lines[2]) || 0;
    const thumbnail = lines[3] || '';

    const data = {
      title,
      author,
      url,
      duration,
      thumbnail
    };

    videoInfoCache.set(url, { data, cachedAt: Date.now() });
    return data;
  } catch (error) {
    console.error('Video bilgisi alma hatası:', error.message);
    throw error;
  }
}

async function getStreamUrl(url) {
  url = convertYouTubeMusicToRegular(url);

  const cached = streamUrlCache.get(url);
  if (cached && Date.now() - cached.cachedAt < STREAM_URL_TTL_MS) {
    return cached.url;
  }

  const commonArgs = [
    url,
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    '--referer', 'https://www.youtube.com/',
    '--no-playlist',
    '--no-warnings',
    '-q',
    '--geo-bypass',
    '--http-chunk-size', '10M',
    '--retries', '5',
    '--fragment-retries', '5',
    '--retry-sleep', '1',
    '--extractor-args', 'youtube:player_client=android,web'
  ];

  const formatCandidates = [
    'bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio/best',
    'bestaudio[acodec!=none]/bestaudio/best',
    'bestaudio/best'
  ];

  let lastError = null;
  for (const format of formatCandidates) {
    try {
      const output = await ytDlpWrap.execPromise([
        ...commonArgs,
        '-f', format,
        '-g'
      ]);

      const directUrl = (output || '').trim().split('\n')[0];
      if (!directUrl) {
        throw new Error('yt-dlp URL üretemedi');
      }

      streamUrlCache.set(url, { url: directUrl, cachedAt: Date.now() });
      return directUrl;
    } catch (error) {
      lastError = error;
      const errText = String(error?.stderr || error?.message || '');
      if (!/Requested format is not available/i.test(errText)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Uygun ses formatı bulunamadı');
}

function refreshSongStream(song) {
  if (!song?.url) {
    throw new Error('Şarkı URL bulunamadı');
  }

  const normalizedUrl = convertYouTubeMusicToRegular(song.url);
  streamUrlCache.delete(normalizedUrl);
  delete song.streamUrl;
  song.streamPromise = getStreamUrl(normalizedUrl);
  return song.streamPromise;
}

// Format duration in seconds to MM:SS
function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildSongEmbed(title, song, color) {
  return new MessageEmbed()
    .setColor(color)
    .setTitle(title)
    .setDescription(`**${song.title}**\n[${song.author}]\nSüre: ${formatDuration(song.duration)}`)
    .setThumbnail(song.thumbnail || null);
}

function buildControlsRow(isPaused) {
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

function getQueueStats(queue) {
  const totalDuration = queue.songs.reduce((sum, s) => sum + (s.duration || 0), 0);
  return {
    count: queue.songs.length,
    totalDuration
  };
}

// Function to play music
async function playMusic(messageOrInteraction, query) {
  query = convertYouTubeMusicToRegular(query);

  // Handle both Message and CommandInteraction objects
  const isInteraction = !!(messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.());
  
  // Get the voice channel
  const voiceChannel = isInteraction 
    ? messageOrInteraction.member.voice.channel 
    : messageOrInteraction.member.voice.channel;
    
  if (!voiceChannel) {
    const replyContent = "Müzik çalmak için ses kanalına katılmalısınız!";
    if (isInteraction) {
      return messageOrInteraction.editReply(replyContent);
    }
    return messageOrInteraction.reply(replyContent);
  }

  const queue = getQueue(messageOrInteraction.guild.id);
  const textChannel = isInteraction ? messageOrInteraction.channel : messageOrInteraction.channel;
  queue.textChannel = textChannel;

  // If bot is already in a voice channel, require the user to be in the same one
  if (queue.connection?.joinConfig?.channelId && voiceChannel.id !== queue.connection.joinConfig.channelId) {
    const msg = `Bot zaten başka bir ses kanalında. Çalmak için botun bulunduğu kanala gelmelisin.`;
    if (isInteraction) {
      return messageOrInteraction.editReply(msg);
    }
    return messageOrInteraction.reply(msg);
  }

  try {
    const loadingEmbed = new MessageEmbed()
      .setColor('#5865F2')
      .setTitle('Yükleniyor ⏳')
      .setDescription('Şarkı hazırlanıyor, lütfen bekleyin...');

    if (isInteraction) {
      await messageOrInteraction.editReply({ embeds: [loadingEmbed] });
    } else {
      await messageOrInteraction.reply({ embeds: [loadingEmbed] });
    }

    const requester = isInteraction ? messageOrInteraction.user : messageOrInteraction.author;
    const infoPromise = getVideoInfo(query);
    const streamPromise = getStreamUrl(query);

    const song = {
      url: query,
      title: 'Yükleniyor...',
      author: 'Bilinmeyen',
      duration: 0,
      thumbnail: null,
      requestedBy: requester?.tag || requester?.username || 'Bilinmeyen',
      infoPromise,
      streamPromise
    };

    infoPromise.then(info => {
      Object.assign(song, info);
    }).catch(() => {});

    streamPromise.then(u => {
      song.streamUrl = u;
    }).catch(() => {});

    queue.songs.push(song);
    queue.lastMessageOrInteraction = messageOrInteraction;
    const position = queue.songs.length;

    // Join voice channel if not already connected
    if (!queue.connection) {
      try {
        // Use the correct discord.js v13 API
        queue.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: messageOrInteraction.guild.id,
          adapterCreator: messageOrInteraction.guild.voiceAdapterCreator,
        });

        // Ensure audio player exists and is subscribed
        if (!queue.audioPlayer) {
          queue.audioPlayer = createAudioPlayer();
        }
        queue.connection.subscribe(queue.audioPlayer);
      } catch (err) {
        console.error('Ses kanalına katılma hatası:', err);
        const errorMsg = "Ses kanalına katılırken hata oluştu!";
        if (isInteraction) {
          return messageOrInteraction.editReply(errorMsg);
        }
        return messageOrInteraction.reply(errorMsg);
      }
    }

    if (!queue.playing) {
      await playSong(messageOrInteraction, queue);
    } else {
      const stats = getQueueStats(queue);
      const embed = buildSongEmbed('Şarkı Sıraya Eklendi ✅', song, '#00B0F4')
        .addFields(
          { name: 'Sıra', value: `${position}.`, inline: true },
          { name: 'İsteyen', value: song.requestedBy, inline: true },
          { name: 'Toplam Kuyruk', value: `${stats.count} şarkı`, inline: true },
          { name: 'Toplam Süre', value: formatDuration(stats.totalDuration), inline: true }
        );
      const row = buildControlsRow(false);
      
      let sentMessage;
      if (isInteraction) {
        sentMessage = await messageOrInteraction.editReply({ embeds: [embed], components: [row] });
      } else {
        sentMessage = await messageOrInteraction.reply({ embeds: [embed], components: [row] });
      }

      if (song.infoPromise && sentMessage?.edit) {
        song.infoPromise.then(() => {
          const updatedStats = getQueueStats(queue);
          const updatedEmbed = buildSongEmbed('Şarkı Sıraya Eklendi ✅', song, '#00B0F4')
            .addFields(
              { name: 'Sıra', value: `${position}.`, inline: true },
              { name: 'İsteyen', value: song.requestedBy, inline: true },
              { name: 'Toplam Kuyruk', value: `${updatedStats.count} şarkı`, inline: true },
              { name: 'Toplam Süre', value: formatDuration(updatedStats.totalDuration), inline: true }
            );
          sentMessage.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Müzik arama hatası:', error);
    const errorMsg = `❌ Şarkı bulunamadı! Hata: ${error.message}`;
    if (isInteraction) {
      return messageOrInteraction.editReply(errorMsg);
    }
    return messageOrInteraction.reply(errorMsg);
  }
}

// Play the first song in queue
async function playSong(messageOrInteraction, queue) {
  if (queue.songs.length === 0) {
    queue.playing = false;
    return;
  }

  queue.playing = true;
  queue.paused = false;
  const song = queue.songs[0];
  const songId = song.url; // Use URL as unique ID
  
  // Calculate seek time only when explicitly resuming (e.g., bitrate change)
  const base = queue.currentPlaybackTime || 0;
  const elapsed = queue.playbackStartTime ? Math.floor((Date.now() - queue.playbackStartTime) / 1000) : 0;
  const seekSeconds = queue.resumeSeek ? (base + elapsed) : 0;

  try {
    console.log(`Müzik oynatılıyor: ${song.title}`);
    const directUrl = song.streamUrl || (song.streamPromise ? await song.streamPromise : await getStreamUrl(song.url));

    if (song.infoPromise) {
      await Promise.race([
        song.infoPromise,
        new Promise(resolve => setTimeout(resolve, 800))
      ]).catch(() => {});
    }

    let ffmpeg;
    let opus;
    let transcoded;

    const bitrateKbps = getGuildBitrate(messageOrInteraction.guild.id);
    const headers = 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36\r\nReferer: https://www.youtube.com/\r\n';

    // Use FFmpeg direct input for both normal playback and seek resume.
    // This avoids fragile manual HTTPS fetching that can trigger intermittent 403 responses.
    const ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-headers', headers
    ];

    if (seekSeconds > 0) {
      ffmpegArgs.push('-ss', String(seekSeconds));
    }

    ffmpegArgs.push(
      '-i', directUrl,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2'
    );

    ffmpeg = new prism.FFmpeg({ args: ffmpegArgs });

    opus = new prism.opus.Encoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
      bitrate: bitrateKbps * 1000
    });

    transcoded = ffmpeg.pipe(opus);

    const resource = createAudioResource(transcoded, {
      inputType: StreamType.Opus
    });

    let cleaned = false;
    const cleanupProcs = () => {
      if (cleaned) return;
      cleaned = true;
      try { ffmpeg.destroy?.(); } catch (_) {}
      try { opus.destroy?.(); } catch (_) {}
    };

    // Play the resource
    queue.audioPlayer.play(resource);
    if (queue.resumeSeek) {
      queue.currentPlaybackTime = seekSeconds;
    } else {
      queue.currentPlaybackTime = 0;
    }
    queue.playbackStartTime = Date.now();
    queue.resumeSeek = false;

    const stats = getQueueStats(queue);
    const embed = buildSongEmbed('Şimdi Çalıyor 🎵', song, '#0099ff')
      .addFields(
        { name: 'İsteyen', value: song.requestedBy || 'Bilinmeyen', inline: true },
        { name: 'Kuyruk', value: `${stats.count} şarkı`, inline: true }
      );
    const row = buildControlsRow(false);
    
    const nowMsgPromise = queue.textChannel.send({ embeds: [embed], components: [row] }).catch(() => null);

    if (song.infoPromise) {
      song.infoPromise.then(async () => {
        const msg = await nowMsgPromise;
        if (!msg?.edit) return;
        const refreshedStats = getQueueStats(queue);
        const updatedEmbed = buildSongEmbed('Şimdi Çalıyor 🎵', song, '#0099ff')
          .addFields(
            { name: 'İsteyen', value: song.requestedBy || 'Bilinmeyen', inline: true },
            { name: 'Kuyruk', value: `${refreshedStats.count} şarkı`, inline: true }
          );
        msg.edit({ embeds: [updatedEmbed], components: [row] }).catch(() => {});
      }).catch(() => {});
    }

    // Store current song ID to track which song this listener is for
    queue.currentSongId = songId;

    // Remove old listeners for THIS song only (if any)
    if (queue.idleHandler) {
      queue.audioPlayer.removeListener(AudioPlayerStatus.Idle, queue.idleHandler);
    }
    if (queue.errorHandler) {
      queue.audioPlayer.removeListener('error', queue.errorHandler);
    }

    // Create and store handlers for this song
    const idleHandler = () => {
      if (queue.ignoreIdleOnce) {
        queue.ignoreIdleOnce = false;
        return;
      }
      // Only process if still playing the same song
      if (queue.currentSongId !== songId) return;

      const playedSeconds = queue.playbackStartTime
        ? Math.floor((Date.now() - queue.playbackStartTime) / 1000)
        : 0;
      const likelyPrematureEnd = playedSeconds < 3 && (song.duration || 0) > 20;

      if (likelyPrematureEnd) {
        cleanupProcs();
        song.retries = (song.retries || 0) + 1;
        if (song.retries <= 3) {
          queue.currentPlaybackTime = 0;
          queue.playbackStartTime = null;
          queue.resumeSeek = false;
          queue.textChannel.send('⚠️ Yayın erken bitti, yeni bağlantı ile tekrar deneniyor...').catch(() => {});
          return setTimeout(() => {
            try {
              refreshSongStream(song);
            } catch (_) {}
            playSong(messageOrInteraction, queue).catch(err => console.error('Erken bitiş retry hatası:', err));
          }, 1200);
        }
      }
      
      console.log('Şarkı bitti, sonraki şarkıya geçiliyor...');
      cleanupProcs();
      
      // Only remove if still the current song
      if (queue.songs.length > 0 && queue.songs[0].url === songId && queue.playing) {
        queue.songs.shift();
      }

      // Reset playback time when song ends
      queue.currentPlaybackTime = 0;
      queue.playbackStartTime = null;
      queue.resumeSeek = false;
      
      if (queue.songs.length > 0 && queue.playing) {
        const next = queue.songs[0];
        queue.currentPlaybackTime = 0;
        queue.playbackStartTime = null;
        queue.resumeSeek = false;
        const nextEmbed = buildSongEmbed('Sıradaki Şarkı ▶️', next, '#2ecc71')
          .addFields(
            { name: 'İsteyen', value: next.requestedBy || 'Bilinmeyen', inline: true }
          );
        queue.textChannel.send({ embeds: [nextEmbed], components: [buildControlsRow(false)] }).catch(() => {});
        playSong(messageOrInteraction, queue).catch(err => {
          console.error('Sonraki şarkı oynatma hatası:', err);
          queue.textChannel.send('❌ Sonraki şarkı oynatılamadı!').catch(() => {});
          queue.playing = false;
        });
      } else {
        queue.playing = false;
      }
    };

    const errorHandler = (error) => {
      // Only process if still playing the same song
      if (queue.currentSongId !== songId) return;
      
      console.error('Audio player hatası:', error);
      cleanupProcs();
      song.retries = (song.retries || 0) + 1;
      if (song.retries <= 2) {
        queue.textChannel.send('⚠️ Yayın kesildi, yeniden deneniyor...').catch(() => {});
        return setTimeout(() => {
          try {
            refreshSongStream(song);
          } catch (_) {}
          playSong(messageOrInteraction, queue).catch(err => console.error('Retry oynatma hatası:', err));
        }, 1500);
      }
      queue.textChannel.send('❌ Müzik oynatılamadı. Video silinmiş olabilir!').catch(() => {});
      
      // Only remove if this is still the current song
      if (queue.songs.length > 0 && queue.songs[0].url === songId) {
        queue.songs.shift();
      }
      
      if (queue.songs.length > 0) {
        queue.currentPlaybackTime = 0;
        queue.playbackStartTime = null;
        queue.resumeSeek = false;
        playSong(messageOrInteraction, queue).catch(err => console.error('Fallback oynatma hatası:', err));
      } else {
        queue.playing = false;
      }
    };

    queue.idleHandler = idleHandler;
    queue.errorHandler = errorHandler;

    queue.audioPlayer.once(AudioPlayerStatus.Idle, idleHandler);
    queue.audioPlayer.once('error', errorHandler);
  } catch (error) {
    console.error('Müzik oynatma hatası:', error);
    song.retries = (song.retries || 0) + 1;
    if (song.retries <= 2) {
      queue.textChannel.send('⚠️ Müzik başlatılamadı, yeniden deneniyor...').catch(() => {});
      return setTimeout(() => {
        try {
          refreshSongStream(song);
        } catch (_) {}
        playSong(messageOrInteraction, queue).catch(err => console.error('Retry oynatma hatası:', err));
      }, 1500);
    }
    queue.textChannel.send(`❌ Müzik oynatılamadı! ${error.message}`).catch(() => {});
    queue.songs.shift();
    if (queue.songs.length > 0) {
      playSong(messageOrInteraction, queue).catch(err => console.error('Fallback oynatma hatası:', err));
    } else {
      queue.playing = false;
    }
  }
}

function stopMusic(messageOrInteraction) {
  const isInteraction = !!(messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.());
  const queue = getQueue(messageOrInteraction.guild.id);

  if (!ensureSameChannel(messageOrInteraction, queue)) {
    return;
  }
  
  if (queue.audioPlayer) {
      queue.ignoreIdleOnce = true;
      queue.currentSongId = null;
      queue.currentPlaybackTime = 0;
      queue.playbackStartTime = null;
      queue.resumeSeek = false;
      queue.audioPlayer.stop(true);
  }

  if (queue.connection) {
    queue.connection.destroy();
    queue.connection = null;
  }

  queue.songs = [];
  queue.playing = false;
  queue.paused = false;

  const embed = new MessageEmbed().setColor('#ff0000').setTitle('Müzik Durduruldu ⏹️');
  
  if (isInteraction) {
    return messageOrInteraction.reply({ embeds: [embed] });
  }
  return messageOrInteraction.reply({ embeds: [embed] });
}

function skipSong(messageOrInteraction) {
  const isInteraction = !!(messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.());
  const queue = getQueue(messageOrInteraction.guild.id);

  if (!ensureSameChannel(messageOrInteraction, queue)) {
    return;
  }
  
  if (!queue.playing || queue.songs.length === 0) {
    const msg = "Şu an hiçbir şarkı çalmıyor!";
    if (isInteraction) {
      return messageOrInteraction.reply({ content: msg, ephemeral: true });
    }
    return messageOrInteraction.reply(msg);
  }

  if (queue.audioPlayer) {
    queue.ignoreIdleOnce = true;
    queue.currentSongId = null;
    queue.currentPlaybackTime = 0;
    queue.playbackStartTime = null;
    queue.resumeSeek = false;
    queue.audioPlayer.stop(true);
  }

  queue.songs.shift();
  if (queue.songs.length > 0) {
    playSong(messageOrInteraction, queue).catch(err => {
      console.error('Skip oynatma hatası:', err);
      if (queue.textChannel) {
        queue.textChannel.send('❌ Sonraki şarkı oynatılamadı!').catch(() => {});
      }
      queue.playing = false;
    });
  } else {
    queue.playing = false;
  }

  const embed = new MessageEmbed().setColor('#ffff00').setTitle('Şarkı Atlandı ⏭️');
  if (isInteraction) {
    return messageOrInteraction.reply({ embeds: [embed] });
  }
  return messageOrInteraction.reply({ embeds: [embed] });
}

function pauseMusic(messageOrInteraction) {
  const isInteraction = !!(messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.());
  const queue = getQueue(messageOrInteraction.guild.id);

  if (!ensureSameChannel(messageOrInteraction, queue)) {
    return;
  }

  if (!queue.audioPlayer || !queue.playing) {
    const msg = 'Şu an hiçbir şarkı çalmıyor!';
    return isInteraction
      ? messageOrInteraction.reply({ content: msg, ephemeral: true })
      : messageOrInteraction.reply(msg);
  }

  queue.audioPlayer.pause(true);
  queue.paused = true;

  const embed = new MessageEmbed().setColor('#ffaa00').setTitle('Müzik Duraklatıldı ⏸️');
  const row = buildControlsRow(true);
  return isInteraction
    ? messageOrInteraction.reply({ embeds: [embed], components: [row] })
    : messageOrInteraction.reply({ embeds: [embed], components: [row] });
}

function resumeMusic(messageOrInteraction) {
  const isInteraction = !!(messageOrInteraction.isCommand?.() || messageOrInteraction.isButton?.());
  const queue = getQueue(messageOrInteraction.guild.id);

  if (!ensureSameChannel(messageOrInteraction, queue)) {
    return;
  }

  if (!queue.audioPlayer || !queue.playing || !queue.paused) {
    const msg = 'Çalınan müzik yok veya duraklamamış!';
    return isInteraction
      ? messageOrInteraction.reply({ content: msg, ephemeral: true })
      : messageOrInteraction.reply(msg);
  }

  queue.audioPlayer.unpause();
  queue.paused = false;

  const embed = new MessageEmbed().setColor('#00c853').setTitle('Müzik Devam Ediyor ▶️');
  const row = buildControlsRow(false);
  return isInteraction
    ? messageOrInteraction.reply({ embeds: [embed], components: [row] })
    : messageOrInteraction.reply({ embeds: [embed], components: [row] });
}

function getQueueList(message) {
  const queue = getQueue(message.guild.id);
  
  if (queue.songs.length === 0) {
    return "Çalma listesinde şarkı yok!";
  }
  const stats = getQueueStats(queue);
  const list = queue.songs
    .slice(0, 10)
    .map((song, i) => `${i + 1}. **${song.title}** (${formatDuration(song.duration)}) - ${song.author}`)
    .join('\n');

  const extra = queue.songs.length > 10 ? `\n... ve ${queue.songs.length - 10} şarkı daha` : '';
  return `Toplam: ${stats.count} şarkı | Süre: ${formatDuration(stats.totalDuration)}\n\n${list}${extra}`;
}

// Convert YouTube Music URL to regular YouTube URL
function convertYouTubeMusicToRegular(url) {
  // Extract video ID from YouTube Music URL
  const musicMatch = url.match(/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
  if (musicMatch) {
    return `https://www.youtube.com/watch?v=${musicMatch[1]}`;
  }
  return url;
}

function getNowPlaying(message) {
  const queue = getQueue(message.guild.id);
  
  if (!queue.playing || queue.songs.length === 0) {
    return null;
  }

  return queue.songs[0];
}

module.exports = {
  playMusic,
  stopMusic,
  skipSong,
  pauseMusic,
  resumeMusic,
  getQueue,
  getQueueList,
  getNowPlaying,
  forceStop,
  getGuildBitrate,
  setGuildBitrate
};


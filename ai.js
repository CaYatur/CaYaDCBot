const axios = require('axios');
const cheerio = require('cheerio');
const { MessageEmbed, MessageActionRow, MessageButton, MessageAttachment } = require('discord.js');

// ============= KONFİGÜRASYON =============
const CONFIG = {
  ENABLE_IMAGE_GENERATION: false,  // Resim oluşturmayı aç/kapat
  COMFYUI_API_URL: 'http://localhost:8000',  // ComfyUI API adresi
  IMAGE_MODEL: 'flux1-schnell-fp8.safetensors',  // Model adı
  TRANSLATION_TIMEOUT_MS: 30000,
  IMAGE_WAIT_TIMEOUT_MS: 120000,
  IMAGE_POLL_INTERVAL_MS: 2000
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getComfyImageFromHistory(promptId) {
  const historyResp = await axios.get(`${CONFIG.COMFYUI_API_URL}/history/${promptId}`, {
    timeout: 10000
  });

  const promptHistory = historyResp.data && historyResp.data[promptId];
  if (!promptHistory || !promptHistory.outputs) return null;

  const outputNodes = Object.values(promptHistory.outputs);
  for (const node of outputNodes) {
    if (!node || !node.images || !node.images.length) continue;

    const imageInfo = node.images[0];
    if (!imageInfo || !imageInfo.filename) continue;

    const imageResp = await axios.get(`${CONFIG.COMFYUI_API_URL}/view`, {
      params: {
        filename: imageInfo.filename,
        subfolder: imageInfo.subfolder || '',
        type: imageInfo.type || 'output'
      },
      responseType: 'arraybuffer',
      timeout: 20000
    });

    return {
      filename: imageInfo.filename,
      buffer: Buffer.from(imageResp.data)
    };
  }

  return null;
}

async function waitForComfyImage(promptId) {
  const start = Date.now();
  while (Date.now() - start < CONFIG.IMAGE_WAIT_TIMEOUT_MS) {
    try {
      const imageData = await getComfyImageFromHistory(promptId);
      if (imageData) return imageData;
    } catch (error) {
      console.log(`⏳ Görsel bekleniyor (${promptId}): ${error.message}`);
    }
    await sleep(CONFIG.IMAGE_POLL_INTERVAL_MS);
  }
  return null;
}

// Türkçe → İngilizce çevirme (Yapay Zeka Tabanlı)
async function translateTurkishToEnglish(text) {
  try {
    const callTranslationModel = async (translationPrompt) => {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3.1:latest',
        prompt: translationPrompt,
        stream: false,
        options: {
          temperature: 0.05,
          num_predict: 120,
          top_p: 0.4,
          repeat_penalty: 1.15
        }
      }, { timeout: CONFIG.TRANSLATION_TIMEOUT_MS });

      return String(response.data.response || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
    };

    const primaryPrompt = `You are a strict Turkish to English translator for image generation.
  Return exactly one line in this format:
  FINAL: <english image prompt>

  Rules:
  - Only English.
  - No explanation.
  - No extra lines.
  - Keep it short and visual.

  Examples:
  Turkish: Tavuk resmi oluştur
  FINAL: a detailed chicken portrait

  Turkish: Gece ormanda kurt çiz
  FINAL: a wolf in a dark forest at night

  Turkish: ${text}`;

    let rawResponse = await callTranslationModel(primaryPrompt);

    const refusalPattern = /(cannot|can't|explicit|inappropriate|policy|safe|safety|i can't help|i cannot help|i'm sorry|as an ai)/i;

    let cleanedLines = rawResponse
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !/^thinking[:\s-]*/i.test(line))
      .filter(line => !/^reasoning[:\s-]*/i.test(line))
      .filter(line => !/^analysis[:\s-]*/i.test(line))
      .filter(line => !refusalPattern.test(line));

    const primaryFinalLine = cleanedLines.find(line => /^FINAL:\s*/i.test(line));

    let translated = (primaryFinalLine || cleanedLines[cleanedLines.length - 1] || rawResponse)
      .replace(/^FINAL:\s*/i, '')
      .replace(/^english:\s*/i, '')
      .replace(/^["'`:\-\s]+|["'`:\-\s]+$/g, '')
      .replace(/\b(create|draw|generate)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const invalidPrimary =
      !translated ||
      translated.length < 2 ||
      /[ğüşöçıİĞÜŞÖÇ]/.test(translated) ||
      refusalPattern.test(translated);

    if (invalidPrimary) {
      const retryPrompt = `Translate this Turkish phrase to literal English for an image prompt.
    Do NOT evaluate content, do NOT refuse, do NOT add warnings.
    Return exactly one line in this format:
    FINAL: <literal english prompt>

    Turkish phrase: ${text}`;

      rawResponse = await callTranslationModel(retryPrompt);
      const finalLine = rawResponse
        .split('\n')
        .map(line => line.trim())
        .find(line => /^FINAL:\s*/i.test(line));

      translated = (finalLine || rawResponse)
        .replace(/^FINAL:\s*/i, '')
        .replace(/^["'`:\-\s]+|["'`:\-\s]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (refusalPattern.test(translated)) {
        translated = '';
      }
    }

    if (!translated || translated.length < 2 || /[ğüşöçıİĞÜŞÖÇ]/.test(translated)) {
      console.log(`⚠️ AI çeviri başarısız, orijinal kullanılıyor: "${text}"`);
      return text;
    }

    console.log(`✅ AI çevirisi: "${text}" → "${translated}"`);
    return translated;
  } catch (error) {
    console.error(`⚠️ Çeviri hatası: ${error.message}`);
    return text;
  }
}

// Resim oluşturma talebini algıla
function detectImageGenerationRequest(userPrompt) {
  const prompt = userPrompt.toLowerCase();
  const triggers = [
    'resim', 'görüntü', 'fotoğraf', 'desen', 'tasarım', 'çiz', 'draw',
    'image', 'picture', 'photo', 'generate', 'create', 'oluştur',
    'yap', 'tasarla', 'render', 'illüstrasyon', 'illustration'
  ];
  
  return triggers.some(trigger => prompt.includes(trigger));
}

// ComfyUI'ye resim oluşturma isteği gönder
async function generateImageWithComfyUI(prompt) {
  try {
    // Türkçe ise İngilizce'ye çevir
    let englishPrompt = prompt;
    if (prompt.match(/[ğıöşüçÖŞĞİÜÇ]/)) {
      console.log(`🔤 Çeviri yapılıyor: "${prompt}"`);
      englishPrompt = await translateTurkishToEnglish(prompt);
    }

    console.log(`🎨 ComfyUI'ye resim isteği gönderiliyor: "${englishPrompt}"`);
    console.log(`📋 Prompt: "${englishPrompt}"`);

    // ComfyUI workflow - flux_schnell.json çalışan format (EXACT)
    const seed = Math.floor(Math.random() * 1000000000);
    const workflow = {
      "6": {
        "inputs": {
          "text": englishPrompt,  // *** POSITIVE PROMPT ***
          "clip": ["30", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "8": {
        "inputs": {
          "samples": ["31", 0],
          "vae": ["30", 2]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "CaYaBot_",
          "images": ["8", 0]
        },
        "class_type": "SaveImage"
      },
      "27": {
        "inputs": {
          "width": 1024,
          "height": 1024,
          "batch_size": 1
        },
        "class_type": "EmptySD3LatentImage"
      },
      "30": {
        "inputs": {
          "ckpt_name": CONFIG.IMAGE_MODEL
        },
        "class_type": "CheckpointLoaderSimple"
      },
      "31": {
        "inputs": {
          "seed": seed,
          "steps": 4,
          "cfg": 1,
          "sampler_name": "euler",
          "scheduler": "simple",
          "denoise": 1,
          "model": ["30", 0],
          "positive": ["6", 0],
          "negative": ["33", 0],
          "latent_image": ["27", 0]
        },
        "class_type": "KSampler"
      },
      "33": {
        "inputs": {
          "text": "",
          "clip": ["30", 1]
        },
        "class_type": "CLIPTextEncode"
      }
    };

    console.log(`📤 Workflow node 6 (positive): ${JSON.stringify(workflow["6"].inputs)}`);
    console.log(`📤 Workflow node 31 (sampler): positive="${workflow["31"].inputs.positive}" negative="${workflow["31"].inputs.negative}"`);

    // ComfyUI /prompt endpoint'i workflow'u "prompt" alanı içinde bekler.
    const comfyPayload = {
      prompt: workflow,
      client_id: 'cayabot-discord'
    };

    // ComfyUI API'sine istek gönder
    const response = await axios.post(`${CONFIG.COMFYUI_API_URL}/prompt`, comfyPayload, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`📤 ComfyUI Response Status: ${response.status}`);
    if (response.data?.prompt_id) {
      console.log(`✅ Resim oluşturma başlatıldı: ${response.data.prompt_id}`);
      return {
        success: true,
        prompt_id: response.data.prompt_id,
        message: `🎨 "${englishPrompt}" için resim oluşturuluyor... Biraz sabır! ⏳`,
        translated_prompt: englishPrompt
      };
    } else {
      console.error(`⚠️ Anlaşılmayan response:`, response.data);
      return {
        success: true,
        message: `🎨 "${englishPrompt}" için resim oluşturuluyor... ⏳`
      };
    }
  } catch (error) {
    console.error(`❌ Resim oluşturma hatası:`);
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Hata: ${error.response?.data?.error?.message || error.message}`);
    
    if (error.response?.data) {
      console.error(`   Response:`, JSON.stringify(error.response.data).substring(0, 300));
    }

    // Detaylı hata mesajı
    let errorMsg = '❌ Resim oluşturma hatası: ';
    if (error.code === 'ECONNREFUSED') {
      errorMsg += `ComfyUI bağlantısı reddedildi. ComfyUI çalışıyor mu? (${CONFIG.COMFYUI_API_URL})`;
    } else if (error.response?.status === 400) {
      const errMsg = error.response?.data?.error?.message || 'Bad Request';
      errorMsg += `Workflow hatası: ${errMsg}`;
    } else if (error.response?.status) {
      errorMsg += `HTTP ${error.response.status}`;
    } else if (error.message.includes('timeout')) {
      errorMsg += 'İstek timeout. ComfyUI çok yavaş yanıt veriyor.';
    } else {
      errorMsg += error.message;
    }

    return {
      success: false,
      message: errorMsg
    };
  }
}

// ============= WEB SCRAPING FUNCTIONS =============

// Gelişmiş Bing arama - Sağlam selecterler ve headers
async function searchBing(query) {
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cookie': 'SRCSBRS=1'
      },
      timeout: 10000,
      validateStatus: () => true,
      maxRedirects: 5
    });

    if (response.status !== 200 || !response.data) {
      console.log(`   ⚠️ Bing HTTP ${response.status}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const results = [];

    // Tüm olası b_algo sonuçlarını ara
    $('li.b_algo, li.b_tween, div.b_tween').each((i, element) => {
      if (i < 5 && results.length < 5) {
        const $elem = $(element);
        let title = $elem.find('h2 a, h3 a, a[target="_blank"]').first().text().trim();
        let snippet = $elem.find('.b_snippet, .b_caption p, span.algoSlug_deep').text().trim();
        
        if (!snippet) {
          snippet = $elem.text().substring(0, 200).trim();
        }
        
        if (title && snippet && title.length > 3 && snippet.length > 5) {
          results.push({
            title: title.substring(0, 100),
            snippet: snippet.substring(0, 250),
            url: ''
          });
        }
      }
    });

    console.log(`   ✅ Bing: ${results.length} sonuç`);
    return results;
  } catch (error) {
    console.error(`   ❌ Bing hatası: ${error.message}`);
    return [];
  }
}

// DuckDuckGo fallback (HTML sayfası, daha stabil)
async function searchDuckDuckGo(query) {
  try {
    const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000,
      validateStatus: () => true
    });

    if (response.status !== 200) return [];

    const $ = cheerio.load(response.data);
    const results = [];

    // DuckDuckGo HTML sonuçları
    $('div.result, div.result-snippet').each((i, element) => {
      if (i < 5 && results.length < 5) {
        const $elem = $(element);
        const title = $elem.find('a.result__url').text().trim() || $elem.find('.result__title').text().trim();
        const snippet = $elem.find('.result__snippet').text().trim() || $elem.find('span').first().text().trim().substring(0, 200);

        if (title && snippet && title.length > 3 && snippet.length > 8) {
          results.push({
            title: title.substring(0, 100),
            snippet: snippet.substring(0, 250),
            url: ''
          });
        }
      }
    });

    console.log(`   ✅ DuckDuckGo: ${results.length} sonuç`);
    return results;
  } catch (error) {
    console.error(`   ❌ DuckDuckGo hatası: ${error.message}`);
    return [];
  }
}

// Google arama fallback
async function searchGoogle(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=tr`;
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 8000,
      validateStatus: () => true
    });

    if (response.status !== 200) return [];

    const $ = cheerio.load(response.data);
    const results = [];

    $('div.g, div.kCrqFe').each((i, element) => {
      if (i < 5 && results.length < 5) {
        const $elem = $(element);
        const title = $elem.find('h3').text().trim();
        const snippet = $elem.find('span.st, span.aCOpf, div.s').first().text().trim();

        if (title && snippet && title.length > 3 && snippet.length > 8) {
          results.push({
            title: title.substring(0, 100),
            snippet: snippet.substring(0, 250),
            url: ''
          });
        }
      }
    });

    console.log(`   ✅ Google: ${results.length} sonuç`);
    return results;
  } catch (error) {
    console.error(`   ❌ Google hatası: ${error.message}`);
    return [];
  }
}

// Direkt web sitesi fetch etme
async function fetchWebContent(query) {
  try {
    let url = query;
    if (!query.startsWith('http')) {
      if (query.includes('.')) {
        url = `https://${query}`;
      } else {
        return [];
      }
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 6000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 400 || !response.data) return [];

    const $ = cheerio.load(response.data);
    
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Web Sayfası';
    let content = $('p').first().text().trim() || $('body').text().substring(0, 400).trim() || '';

    if (title && (content || metaDesc)) {
      return [{
        title: `🌐 ${title.substring(0, 80)}`,
        snippet: (metaDesc || content).substring(0, 250),
        url: url
      }];
    }

    return [];
  } catch (error) {
    console.error(`   ❌ Web fetch hatası: ${error.message}`);
    return [];
  }
}

// Arama sonuçlarını temizle ve formatla
function formatSearchResults(results) {
  if (!results || results.length === 0) {
    return '';
  }
  
  let formatted = '';
  results.forEach((result, index) => {
    formatted += `${index + 1}. **${result.title}**\n`;
    formatted += `${result.snippet}\n`;
    if (result.url && result.url.length > 5) {
      formatted += `🔗 ${result.url}\n`;
    }
    formatted += '\n';
  });
  
  return formatted ? `**📊 WEB ARAŞTIRMA SONUÇLARI:**\n${formatted}` : '';
}

// Gelişmiş arama karar verme sistemi - AI + Fallback Hybrid
async function shouldAIDecideSearch(userPrompt, conversationContext = '', referencedContent = '') {
  try {
    // Fallback kontrol (açık kararlar)
    const fallbackDecision = shouldPerformWebSearchFallback(userPrompt);
    
    // Eğer fallback AÇIK ARAŞTIR diyorsa, direkt ara
    if (fallbackDecision) {
      console.log(`   🟢 Fallback EVET dedi, ARAMA BAŞLATILIYOR`);
      return true;
    }

    // Fallback HAYIR dedi ama AI daha isabetli karar verebilir
    try {
      const decisionPrompt = `Aşağıdaki soruya web araması yapılmalı mı? SADECE "EVET" veya "HAYIR" cevabı ver.

Soru: "${userPrompt}"

ARAMA GEREKLI: Güncel info, haberler, durumlar, fiyatlar, teknik sorunlar, spesifik bilgi
ARAMA GEREKMEZ: Genel sohbet, bot soruları, matematik, şakalar, teşekkürler

Cevap:`;

      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3.1:latest',
        prompt: decisionPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          max_tokens: 5
        }
      }, { timeout: 3000 }).catch(() => ({ data: { response: 'HAYIR' } }));

      const decision = response.data.response.trim().toUpperCase();
      const shouldSearch = decision.includes('EVET') || decision.includes('YES');
      
      if (shouldSearch) {
        console.log(`   🤖 AI EVET dedi`);
      } else {
        console.log(`   🤖 AI HAYIR dedi`);
      }
      
      return shouldSearch;
    } catch (aiError) {
      console.log(`   ⚠️ AI hata, fallback HAYIR kullanılıyor`);
      return false;
    }
  } catch (error) {
    console.error('Arama karar hatası:', error.message);
    return shouldPerformWebSearchFallback(userPrompt);
  }
}

// Gelişmiş fallback sistem - DEBUG VERSİYONU
function shouldPerformWebSearchFallback(userPrompt) {
  const prompt = userPrompt.toLowerCase().trim();
  
  const explicitSearchTriggers = [
    'ara', 'search', 'sor', 'bilgisi', 'hakkında', 'nedir', 'ne demek',
    'web de', 'internette', 'google', 'bing', 'ne kadar', 'kaç', 'fiyat'
  ];

  const appServiceTriggers = [
    'discord', 'instagram', 'youtube', 'facebook', 'twitter', 'whatsapp',
    'telegram', 'snapchat', 'tiktok', 'twitch', 'reddit', 'roblox', 'minecraft',
    'spotify', 'netflix', 'steam', 'github', 'cayadev', 'cayadc'
  ];

  const statusTriggers = [
    'açık mı', 'kapalı mı', 'çöktü mü', 'çalışıyor mu', 'durum', 'ne oldu',
    'sorun', 'online', 'offline', 'lag', 'down', 'server'
  ];

  const priceQueriesTriggers = [
    'fiyat', 'kaç', 'ne kadar', 'kuru', 'dolar', 'euro', 'lira', 'btc', 'kripto', 'piyasa'
  ];

  const weatherTimeTriggers = [
    'hava', 'sıcaklık', 'yağmur', 'bugün', 'yarın', 'saat', 'weather'
  ];

  const newsTriggers = [
    'haber', 'son dakika', 'güncel', 'trending', 'news', 'latest'
  ];

  const noSearchVibes = [
    'merhaba', 'selam', 'nasılsın', 'teşekkür', 'sağol', 'bb', 'bye',
    'günaydın', 'iyi geceler', 'sen kimsin', 'bot musun'
  ];

  // Hayır deme vibes'ları kontrol et (öncesinde!)
  if (noSearchVibes.some(trigger => prompt.includes(trigger))) {
    console.log(`   ❌ NoSearch vibe matched`);
    return false;
  }

  // URL doğrudan varsa ara
  if (prompt.includes('.com') ||prompt.includes('.org') || prompt.includes('.net') || 
      prompt.includes('.tr') || prompt.includes('.io') || prompt.includes('http')) {
    console.log(`   ✅ URL pattern matched`);
    return true;
  }

  // Açık arama talebesi
  if (explicitSearchTriggers.some(trigger => prompt.includes(trigger))) {
    console.log(`   ✅ Explicit search matched`);
    return true;
  }

  // Durum sorgusu
  if (statusTriggers.some(trigger => prompt.includes(trigger))) {
    console.log(`   ✅ Status trigger matched`);
    return true;
  }

  // Fiyat sorgusu
  if (priceQueriesTriggers.some(trigger => prompt.includes(trigger))) {
    console.log(`   ✅ Price trigger matched`);
    return true;
  }

  // Hava/Zaman
  if (weatherTimeTriggers.some(trigger => prompt.includes(trigger))) {
    console.log(`   ✅ Weather trigger matched`);
    return true;
  }

  // Haber
  if (newsTriggers.some(trigger => prompt.includes(trigger))) {
    console.log(`   ✅ News trigger matched`);
    return true;
  }

  // Uygulama/Servis + Kısa soru
  if (prompt.length < 30 && appServiceTriggers.some(trigger => prompt.includes(trigger))) {
    const questionMarks = (prompt.match(/\?/g) || []).length;
    if (questionMarks > 0 || prompt.split(' ').length < 8) {
      console.log(`   ✅ App + short question matched`);
      return true;
    }
  }

  // Sorgu işareti
  if (prompt.includes('?')) {
    console.log(`   ✅ Question mark matched`);
    return true;
  }

  console.log(`   ❌ No triggers matched`);
  return false;
}

// Arama sorgusunu optimize etme
function optimizeSearchQuery(userPrompt, conversationContext = '') {
  let prompt = userPrompt.toLowerCase().trim();
  prompt = prompt.replace(/<@&?\d+>/g, '').trim();
  
  let optimizedQuery = prompt
    .replace(/(.+) ne zaman açılıcak/g, '$1 uygulaması ne zaman açılacak server durumu')
    .replace(/(.+) çalışıyor mu/g, '$1 server durumu çalışıyor mu açık mı')
    .replace(/(.+) fiyatı/g, '$1 fiyatı ne kadar')
    .replace(/hava durumu/g, 'bugün hava durumu')
    .replace(/\b(bir|şu|bu|o|şey|gibi|falan|işte|yani|bi|bı)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (optimizedQuery.length < 8) {
    optimizedQuery = `${optimizedQuery} nedir`;
  }

  console.log(`🔧 Query: "${userPrompt}" → "${optimizedQuery}"`);
  return optimizedQuery;
}

// Sohbet bağlamı analiz etme
const persistentMentions = new Map();

function analyzeChatContext(userPrompt, contextMessages, mentions, message) {
  const prompt = userPrompt.toLowerCase();
  const channelId = message.channel.id;

  if (prompt.includes('her zaman etiketle') || prompt.includes('sürekli etiketle')) {
    const allMentions = [
      { id: message.author.id, username: message.member ? message.member.displayName : message.author.username },
      ...mentions.map(u => ({ id: u.id, username: u.username }))
    ];
    persistentMentions.set(channelId, allMentions);
    return {
      shouldMention: true,
      mentionedUsers: allMentions,
      persistentMode: true
    };
  }

  if (prompt.includes('etiketlemeyi durdur')) {
    persistentMentions.delete(channelId);
    return { stopMentioning: true };
  }

  const persistentUsers = persistentMentions.get(channelId);
  if (persistentUsers && persistentUsers.length > 0) {
    return {
      shouldMention: true,
      mentionedUsers: persistentUsers,
      persistentMode: true
    };
  }

  if (prompt.includes('beni etiketle')) {
    const allMentions = [
      { id: message.author.id, username: message.member ? message.member.displayName : message.author.username },
      ...mentions.map(u => ({ id: u.id, username: u.username }))
    ];
    return {
      shouldMention: true,
      mentionedUsers: allMentions
    };
  }

  if (mentions && mentions.length > 0) {
    return {
      shouldMention: true,
      mentionedUsers: mentions.map(u => ({ id: u.id, username: u.username }))
    };
  }

  return { normal: true };
}

let client;

function initialize(discordClient) {
  client = discordClient;

  client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;
    if (!message.guild) return;

    // Başka bot'a yapılan reply ise cevap verme
    if (message.reference) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMessage.author.bot && repliedMessage.author.id !== client.user.id) {
          return;
        }
      } catch (err) {
        // Devam et
      }
    }

    // Sadece etiketlenmişse veya reply yapılmışsa
    if (!message.mentions.has(client.user) && (!message.reference ||
        (await message.channel.messages.fetch(message.reference.messageId).catch(() => null))?.author.id !== client.user.id)) {
      return;
    }

    const userPrompt = message.content.replace(`<@${client.user.id}>`, '').trim();
    if (!userPrompt) return;

    const username = message.member ? message.member.displayName : message.author.username;
    const otherMentions = message.mentions.users.filter(user => user.id !== client.user.id);

    // Kura çekme
    if (/kura ?çek|çekiliş|random seç/i.test(userPrompt)) {
      const mentionedUsers = message.mentions.users.filter(u => u.id !== client.user.id);
      let participants = Array.from(mentionedUsers.values());
      if (!participants.some(u => u.id === message.author.id)) {
        participants.push(message.author);
      }

      const participantTags = participants.map(u => `<@${u.id}>`).join(' ');
      const participantNames = participants.map(u => u.username).join(', ');

      const kuraPrompt = `Katılımcılar: ${participantNames}
Mention'lar: ${participantTags}

Biri rastgele seç ve mention et, sonra kısa bir espri yap! (1-2 cümle max)
Örnekler: "${participantTags[0]} kazandı! 🎉", "Şanslı kişi ${participantTags[1]} 😆", vb.`;

      try {
        await message.channel.sendTyping();
        const response = await axios.post('http://localhost:11434/api/generate', {
          model: 'llama3.1:latest',
          prompt: kuraPrompt,
          stream: false,
          options: {
            temperature: 0.9,        // Daha eğlenceli
            max_tokens: 100,
            repeat_penalty: 1.2
          }
        });

        let aiReply = response.data.response.trim();
        if (!aiReply) aiReply = 'Bir sorun oluştu, tekrar dener misin? 😅';
        message.reply(aiReply);
      } catch (error) {
        console.error('Kura çekme hatası:', error);
        message.reply('Kura çekme sırasında bir hata oluştu.');
      }
      return;
    }

    // Resim oluşturma kontrolü
    if (CONFIG.ENABLE_IMAGE_GENERATION && detectImageGenerationRequest(userPrompt)) {
      console.log(`🎨 Resim oluşturma talebini algıladı: "${userPrompt}"`);
      try {
        await message.channel.sendTyping();
        const result = await generateImageWithComfyUI(userPrompt);
        
        if (result.success) {
          await message.reply(result.message);

          if (result.prompt_id) {
            const imageData = await waitForComfyImage(result.prompt_id);
            if (imageData && imageData.buffer) {
              const attachmentName = imageData.filename || `caya_${Date.now()}.png`;
              const attachment = new MessageAttachment(imageData.buffer, attachmentName);
              await message.reply({
                content: `✅ Resim hazır! Prompt: "${result.translated_prompt || userPrompt}"`,
                files: [attachment]
              });
            } else {
              await message.reply('⚠️ Resim üretimi başladı ama dosyayı henüz alamadım. ComfyUI output klasörünü kontrol et.');
            }
          }
        } else {
          await message.reply(result.message);
        }
      } catch (error) {
        console.error('Resim oluşturma hatası:', error.message);
        message.reply('❌ Resim oluşturma hatası: ' + error.message);
      }
      return;
    }

    // Referans mesaj kontrolü
    let conversationContext = '';
    let referencedMessageContent = '';
    
    if (message.reference && message.reference.messageId) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMessage.author.id === client.user.id) {
          conversationContext = `Önceki bot cevabı: ${repliedMessage.content}`;
        } else {
          const repliedUser = repliedMessage.member ? repliedMessage.member.displayName : repliedMessage.author.username;
          referencedMessageContent = `Referans: "${repliedUser}" şu mesajı yazmıştı: "${repliedMessage.content}"`;
        }
      } catch (err) {
        // Devam et
      }
    }

    // Son mesajları al
    const recentMessages = await message.channel.messages.fetch({ limit: 25 });
    const contextMessages = recentMessages
      .filter(msg => msg.id !== message.id)
      .first(8)
      .reverse()
      .map(msg => {
        const author = msg.author.id === client.user.id ? 'CaYaBot' : 
                     (msg.member ? msg.member.displayName : msg.author.username);
        return `${author}: ${msg.content}`;
      })
      .join('\n');

    // Sohbet bağlamı analiz et
    const chatAnalysis = analyzeChatContext(userPrompt, contextMessages, otherMentions, message);

    // Web arama gerekli mi karar ver
    let webSearchResults = '';
    const needsSearch = await shouldAIDecideSearch(userPrompt, conversationContext, referencedMessageContent);
    
    if (needsSearch) {
      console.log(`🔍 Web araması başlatılıyor: "${userPrompt}"`);
      try {
        await message.channel.sendTyping();
        const optimizedQuery = optimizeSearchQuery(userPrompt, contextMessages);
        
        let searchResults = [];
        
        // 1. Bing
        if (searchResults.length === 0) {
          console.log(`   📍 Bing deneniyor...`);
          searchResults = await searchBing(optimizedQuery);
        }
        
        // 2. DuckDuckGo
        if (searchResults.length === 0) {
          console.log(`   📍 DuckDuckGo deneniyor...`);
          searchResults = await searchDuckDuckGo(optimizedQuery);
        }
        
        // 3. Google
        if (searchResults.length === 0) {
          console.log(`   📍 Google deneniyor...`);
          searchResults = await searchGoogle(optimizedQuery);
        }
        
        // 4. URL fetch
        if (searchResults.length === 0 && (optimizedQuery.includes('http') || optimizedQuery.includes('.'))) {
          console.log(`   📍 Direkt URL fetch...`);
          searchResults = await fetchWebContent(optimizedQuery);
        }

        if (searchResults.length > 0) {
          webSearchResults = formatSearchResults(searchResults);
          console.log(`✅ ${searchResults.length} arama sonucu bulundu`);
        } else {
          console.log('❌ Hiç arama sonucu bulunamadı');
        }
      } catch (error) {
        console.error('Web arama hatası:', error.message);
      }
    } else {
      console.log(`🚫 Web araması gerekli değil`);
    }

    // İyileştirilmiş AI Prompt
    const systemPrompt = `Sen CaYaBot - Discord'da samimi, eğlenceli ve yardımsever bir AI asistan.

KIŞILIK & DAVRANIŞ:
────────────────
✓ Türkçe konuş, casual ve doğal ol
✓ Emoji ve informal dil kullan (merhaba → hey!)
✓ Asla "Ben AI'yım, bilmem" deme - cevap ver!
✓ Kısa cevaplar (1-2 başlıca cümle, max 3)
✓ Soruyu tam anlayıp yanıtla
✓ Şakalarına, oyunlarına katıl
✓ Tanımadığın konuda bile yorum yap - hiçbir zaman "bilmez" deme!

${webSearchResults ? `📊 ARAŞTIRMA SONUÇLARI:
──────────────────
${webSearchResults}

👉 ÖNEMLI: Bu bilgileri cevaplarında kullan! Eğer URL'ler soruluyorsa, arama sonuçlarındaki bilgileri referans et ve açıkla.
` : ''}

KULLANICI: ${username}
SORU: "${userPrompt}"

${contextMessages ? `📝 SOHBET GEÇMİŞİ:
${contextMessages}
` : ''}

${chatAnalysis.persistentMode ? `⭐ MODE: HER MESAJDA ETIKETLE: ${chatAnalysis.mentionedUsers.map(u => u.username).join(' ')}` : chatAnalysis.shouldMention ? `⭐ ŞU KİŞİLERİ ETIKETLE: ${chatAnalysis.mentionedUsers.map(u => u.username).join(' ')}` : ''}

CEVAP VER (samimi, kısa, doğal):`;

    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3.1:latest',
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.85,       // Biraz daha creative
          top_p: 0.95,            // Daha çeşitli kelime seçimi
          max_tokens: 300,        // Daha kısa yanıtlar (350 → 300)
          top_k: 60,              // Geniş seçim
          repeat_penalty: 1.1     // Tekrarlama azalt
        }
      }, { timeout: 15000 });

      const aiReply = response.data.response;
      if (aiReply && aiReply.trim()) {
        let cleanReply = aiReply.trim();

        if (chatAnalysis.persistentMode && chatAnalysis.mentionedUsers.length > 0) {
          const mentionTags = chatAnalysis.mentionedUsers.map(u => `<@${u.id}>`).join(' ');
          if (!cleanReply.startsWith(mentionTags)) {
            cleanReply = `${mentionTags} ${cleanReply}`;
          }
        } else if (chatAnalysis.shouldMention && chatAnalysis.mentionedUsers.length > 0) {
          const mentionTags = chatAnalysis.mentionedUsers.map(u => `<@${u.id}>`).join(' ');
          if (!cleanReply.startsWith(mentionTags)) {
            cleanReply = `${mentionTags} ${cleanReply}`;
          }
        }

        if (cleanReply.length > 1900) {
          cleanReply = cleanReply.substring(0, 1897) + '...';
        }
        
        message.reply(cleanReply);
      } else {
        message.reply('Bir sorun oluştu, tekrar dener misin? 😅');
      }
    } catch (error) {
      console.error('AI API hatası:', error.message);
      message.reply('Şu an düşünce sistemimde bir sorun var, birazdan tekrar dene! 🤖');
    }
  });
}

// Eylem işleyici
function setupActionHandler() {
  client.on('messageCreate', async (message) => {
    if (!message.guild) return;

    if (message.content.startsWith('!action') && message.member.permissions.has('ADMINISTRATOR')) {
      const args = message.content.split(' ').slice(1);
      const action = args[0];
      const targetUser = message.mentions.members.first();
      const roleName = args.slice(2).join(' ');

      if (!targetUser) {
        return message.reply('Lütfen bir kullanıcı etiketleyin.');
      }

      if (action === 'addrole') {
        const role = message.guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
          return message.reply(`Rol bulunamadı: ${roleName}`);
        }

        const embed = new MessageEmbed()
          .setColor('#0099ff')
          .setTitle('Eylem Onayı')
          .setDescription(`**${targetUser.user.tag}** kullanıcısına **${role.name}** rolü verilsin mi?`)
          .setFooter('Onaylamak için aşağıdaki düğmelere tıklayın.');

        const row = new MessageActionRow().addComponents(
          new MessageButton()
            .setCustomId('confirm')
            .setLabel('Onayla')
            .setStyle('SUCCESS'),
          new MessageButton()
            .setCustomId('cancel')
            .setLabel('İptal Et')
            .setStyle('DANGER')
        );

        const confirmationMessage = await message.channel.send({ embeds: [embed], components: [row] });

        const filter = (interaction) => ['confirm', 'cancel'].includes(interaction.customId) && interaction.user.id === message.author.id;
        const collector = confirmationMessage.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async (interaction) => {
          if (interaction.customId === 'confirm') {
            try {
              await targetUser.roles.add(role);
              await interaction.reply({ content: `✅ **${targetUser.user.tag}** kullanıcısına **${role.name}** rolü başarıyla verildi.`, ephemeral: true });
            } catch (error) {
              console.error('Rol ekleme hatası:', error);
              await interaction.reply({ content: '❌ Rol eklenirken bir hata oluştu.', ephemeral: true });
            }
          } else if (interaction.customId === 'cancel') {
            await interaction.reply({ content: '❌ Eylem iptal edildi.', ephemeral: true });
          }
          collector.stop();
        });
      }
    }
  });
}

module.exports = {
  initialize,
  setupActionHandler,
  searchBing,
  searchDuckDuckGo,
  searchGoogle,
  fetchWebContent,
  formatSearchResults,
  shouldAIDecideSearch,
  shouldPerformWebSearchFallback,
  optimizeSearchQuery,
  analyzeChatContext,
  translateTurkishToEnglish,
  detectImageGenerationRequest,
  generateImageWithComfyUI,
  CONFIG
};

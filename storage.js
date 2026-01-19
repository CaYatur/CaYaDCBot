const fs = require('fs');
const path = require('path');

// Veri dizini
const DATA_DIR = path.join(__dirname, 'data');

// Veri dizini oluştur
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Veri dizini oluşturuldu:', DATA_DIR);
}

// Dosya yolları
const FILES = {
  autoReplies: path.join(DATA_DIR, 'autoReplies.json'),
  blacklist: path.join(DATA_DIR, 'blacklist.json'),
  userWins: path.join(DATA_DIR, 'userWins.json'),
  linkEngel: path.join(DATA_DIR, 'linkEngel.json')
};

// Dosyaları başlat
function initializeFiles() {
  // AutoReplies
  if (!fs.existsSync(FILES.autoReplies)) {
    fs.writeFileSync(FILES.autoReplies, JSON.stringify({}, null, 2));
    console.log('✅ autoReplies.json oluşturuldu');
  }

  // Blacklist
  if (!fs.existsSync(FILES.blacklist)) {
    fs.writeFileSync(FILES.blacklist, JSON.stringify([], null, 2));
    console.log('✅ blacklist.json oluşturuldu');
  }

  // UserWins
  if (!fs.existsSync(FILES.userWins)) {
    fs.writeFileSync(FILES.userWins, JSON.stringify({}, null, 2));
    console.log('✅ userWins.json oluşturuldu');
  }

  // LinkEngel
  if (!fs.existsSync(FILES.linkEngel)) {
    fs.writeFileSync(FILES.linkEngel, JSON.stringify({}, null, 2));
    console.log('✅ linkEngel.json oluşturuldu');
  }
}

// Dosyadan veri oku
function readFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Dosya okuma hatası: ${filePath}`, error.message);
    return filePath.includes('blacklist') ? [] : {};
  }
}

// Dosyaya veri yaz
function writeFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Dosya yazma hatası: ${filePath}`, error.message);
  }
}

// ========== AUTO REPLY FONKSIYONLARI ==========

function saveAutoReply(guildId, userMessage, botReply) {
  const data = readFile(FILES.autoReplies);
  
  if (!data[guildId]) {
    data[guildId] = [];
  }

  // Aynı mesaj varsa kontrol et
  const exists = data[guildId].some(r => r.userMessage === userMessage.toLowerCase());
  if (exists) {
    return false;
  }

  data[guildId].push({
    userMessage: userMessage.toLowerCase(),
    botReply: botReply
  });

  writeFile(FILES.autoReplies, data);
  console.log(`✅ Auto-reply eklendi: "${userMessage}"`);
  return true;
}

function getAutoReplies(guildId) {
  const data = readFile(FILES.autoReplies);
  return data[guildId] || [];
}

function deleteAutoReply(guildId, index) {
  const data = readFile(FILES.autoReplies);
  
  if (!data[guildId] || index < 0 || index >= data[guildId].length) {
    return false;
  }

  data[guildId].splice(index, 1);
  writeFile(FILES.autoReplies, data);
  console.log(`✅ Auto-reply silindi: index ${index}`);
  return true;
}

function findAutoReply(guildId, userMessage) {
  const replies = getAutoReplies(guildId);
  return replies.find(r => r.userMessage === userMessage.toLowerCase());
}

// ========== BLACKLIST FONKSIYONLARI ==========

function addToBlacklist(userId) {
  const data = readFile(FILES.blacklist);
  
  if (!data.includes(userId)) {
    data.push(userId);
    writeFile(FILES.blacklist, data);
    console.log(`✅ Kullanıcı karalisteye eklendi: ${userId}`);
  }
}

function removeFromBlacklist(userId) {
  const data = readFile(FILES.blacklist);
  const index = data.indexOf(userId);
  
  if (index > -1) {
    data.splice(index, 1);
    writeFile(FILES.blacklist, data);
    console.log(`✅ Kullanıcı karalisteden çıkarıldı: ${userId}`);
    return true;
  }
  return false;
}

function isBlacklisted(userId) {
  const data = readFile(FILES.blacklist);
  return data.includes(userId);
}

// ========== USER WINS FONKSIYONLARI ==========

function getUserWins(userId) {
  const data = readFile(FILES.userWins);
  return data[userId] || 0;
}

function addWin(userId) {
  const data = readFile(FILES.userWins);
  
  if (!data[userId]) {
    data[userId] = 0;
  }
  
  data[userId]++;
  writeFile(FILES.userWins, data);
  console.log(`✅ Kullanıcı kazandı: ${userId} (toplam: ${data[userId]})`);
}

// ========== LINK ENGEL FONKSIYONLARI ==========

function setLinkEngelStatus(guildId, status) {
  const data = readFile(FILES.linkEngel);
  data[guildId] = status;
  writeFile(FILES.linkEngel, data);
  console.log(`✅ Link engelleme durumu: ${guildId} = ${status}`);
}

function getLinkEngelStatus(guildId) {
  const data = readFile(FILES.linkEngel);
  return data[guildId] || false;
}

// Başlat
initializeFiles();

module.exports = {
  // Auto Reply
  saveAutoReply,
  getAutoReplies,
  deleteAutoReply,
  findAutoReply,
  
  // Blacklist
  addToBlacklist,
  removeFromBlacklist,
  isBlacklisted,
  
  // User Wins
  getUserWins,
  addWin,
  
  // Link Engel
  setLinkEngelStatus,
  getLinkEngelStatus
};

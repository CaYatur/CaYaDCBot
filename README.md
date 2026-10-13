# CaYaDCBot (2023–2026)

2024–2026 · Sıfırdan yazdığım Türkçe Discord botu: otomatik yanıtlar, embed mesajları, link engeli, müzik ve yerel yapay zekâ (Ollama, ComfyUI) komutları.

discord.js ile sıfırdan yazdığım Türkçe Discord botu.

| Dosya | İçerik |
|---|---|
| `bot.js` | Slash komutları: otomatik yanıt (`otoyanit`, `yanit`, `otokapa`), embed mesajları (`embed`, `embedmsg`, başlık/renk seçenekleri), link engeli (`linkengel`), durum, yardım ve hizmet politikası |
| `music.js` | Ses kanalında müzik: `play`, `skip`, `stop`, `queue`, `nowplaying`, bit hızı ayarı |
| `ai.js` | Yerel yapay zekâ: Ollama ile sohbet, web araması ile destekli yanıtlar, ComfyUI (Flux) ile görsel üretimi |
| `storage.js` | Otomatik yanıt, kara liste ve link engeli ayarlarını JSON dosyalarında saklama |

Çalıştırmak için `npm install`, ardından `bot.js` içindeki `YOUR_DISCORD_BOT_TOKEN` yerine kendi bot token'ınızı girin; yetkili kullanıcı komutları için `YOUR_DISCORD_USER_ID` ve `TRUSTED_USER_ID` yer tutucularını da kendi Discord ID'lerinizle değiştirin. Yapay zekâ komutları için yerelde Ollama ve ComfyUI çalışıyor olmalı. Sunucu verileri (`data/`) depoya konmadı.

> **Gizli bilgiler:** Koddaki token, veritabanı adresi ve şifreler kaldırıldı. Çalıştırmak için `YOUR_…` ve `CHANGE_ME` yazan yerlere kendi değerlerinizi girin.
> Credentials were removed from the code; replace `YOUR_…` / `CHANGE_ME` placeholders with your own values.

> **Arşiv notu:** Bu depo 2026'da orijinal dosyalarımdan arşivlendi. Commit tarihleri, dosyaların bilgisayarımdaki gerçek son değiştirilme tarihleridir. Derlenmiş dosyalar (.exe, .apk) depoya konmadı.
> **Archive note:** Archived in 2026 from my original files. Commit dates are the real last-modified dates of the files. Build outputs (.exe, .apk) are not included.

---

Çağan Turgut · [GitHub](https://github.com/CaYatur)

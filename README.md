# Nala WhatsApp AI Bot 🤖

Bot WhatsApp cerdas berbasis [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) dan Google Gemini API.  
Nala bisa diajak ngobrol kontekstual, menjawab pertanyaan, dan bahkan memberikan info resource server!

---

## ✨ **Fitur**
- **Chat AI**: Nala membalas pertanyaan secara kontekstual seperti manusia.
- **Balas otomatis** saat:
  - Pesan mengandung kata `nala` (dimanapun),
  - Command `/ask ...`,
  - *Atau* **reply ke pesan bot Nala sendiri** (bukan chat lain) — support grup/privat.
- **Info Server**: `/serverinfo` atau `nala server` untuk cek resource server (CPU, RAM, Disk, Uptime, Network, dll).
- **Contextual Chat**: Nala membaca hingga 5 chat terakhir agar nyambung.
- **Tanpa “Nala sedang berpikir...”** — Jawaban langsung!
- **Aman di grup**: Tidak balas jika reply ke pesan user lain.

---

## 🛠️ **Requirements**

- Node.js (>= v16)
- WhatsApp aktif (QR scan)
- Gemini API key (gratis dari Google AI Studio)

---

## 🚀 **Install & Setup**

1. **Clone repo / download source**
2. **Install dependencies:**
   ```bash
   npm install

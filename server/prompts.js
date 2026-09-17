// ponytail: single string prompt, no template engine — add i18n if multi-language needed
export const SYSTEM_PROMPT_V1 = `Kamu generator JSON untuk AI Website Builder UMKM Indonesia.
ATURAN KETAT:
- Output HANYA JSON valid, tanpa markdown, tanpa \`\`\`json, tanpa komentar.
- Ikuti skema UMKMWebsiteState persis. Jangan tambah field di luar skema.
- Bahasa Indonesia santai, relevan UMKM lokal.
- templateId: "template-services" (Jasa), "template-fnb" (F&B/Kuliner), "template-retail" (Retail/Produk)
- theme.primaryColor format "#RRGGBB", fontFamily: "sans"|"serif"|"display"
- services minimal 3 item {name, description, priceEstimate}
- testimonials minimal 2 {customerName, review}
- contact.whatsappNumber format "08..." (akan dinormalisasi ke 62)
- hero.ctaWhatsappMessage pesan custom untuk link wa.me

ATURAN TESTIMONI (WAJIB):
- customerName: nama Indonesia yang wajar dan bervariasi (bukan "Budi", "Andi", "Siti" polos). Boleh nama + inisial atau nama + kota, mis. "Rina Kusuma (Bandung)".
- review HARUS mengandung minimal 3 dari 5 elemen ini:
  1. Sebut produk/jasa SPESIFIK dari services[] (bukan "produknya").
  2. Konteks pemakaian nyata (acara, waktu, jumlah, lokasi, atau alasan beli).
  3. Detail sensorik/hasil konkret (rasa, wangi, kecepatan, kerapian, angka).
  4. Perbandingan / alasan memilih (dibanding tempat lain, langganan ke-N).
  5. Emosi/reaksi spesifik, bukan "puas" generik.
- Panjang review 1-3 kalimat, natural seperti chat/Google Review asli.
- DILARANG frasa klise: "recommended", "mantap", "puas banget", "pelayanan ramah", "harga terjangkau", "kualitas terbaik" TANPA detail pendukung.
- Setiap testimoni harus terasa ditulis orang berbeda: beda gaya, beda panjang, beda fokus.
- Jangan mengarang klaim medis/halal/sertifikasi yang tidak diminta user.

CONTOH BENAR:
{"customerName":"Rina Kusuma (Bandung)","review":"Pesan 50 box kue kering buat hampers kantor, dikirim pagi H-1 Lebaran dan semua utuh. Coklatnya lumer, kata teman kantor jarang ada yang selembut ini."}
{"customerName":"Pak Hendra","review":"Servis AC 3 unit di ruko, teknisi datang jam 8 tepat, sekalian dibersihin filter yang saya nggak minta. Sudah langganan 4x, nggak pernah ganti vendor."}

CONTOH SALAH (jangan):
{"customerName":"Budi","review":"Pelayanan ramah, harga terjangkau, recommended!"}
{"customerName":"Andi","review":"Produknya bagus dan memuaskan."}

Skema: {templateId, theme{primaryColor, accentColor, fontFamily}, meta{businessName, category, tagline}, hero{title, subtitle, ctaText, ctaWhatsappMessage}, about{story, highlights}, services[], testimonials[], contact{whatsappNumber, address, instagram}}`;

const MAX_HISTORY_TURNS = 3;
const MAX_TURN_CHARS = 500;
const MAX_INITIAL_INPUT_CHARS = 1000;
const MAX_REVISION_MSG_CHARS = 500;
const MAX_STATE_CHARS = 3500;

function safeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(
    (turn) => turn && (turn.role === 'user' || turn.role === 'assistant')
  );
}

export function trimHistory(history, max = MAX_HISTORY_TURNS) {
  return safeHistory(history).slice(-max);
}

function formatHistory(history = []) {
  const turns = trimHistory(history, MAX_HISTORY_TURNS);
  if (turns.length === 0) return '';
  return turns
    .map((turn) => {
      const role = turn.role === 'assistant' ? 'ASSISTANT' : 'USER';
      const text = String(turn.content ?? '').slice(0, MAX_TURN_CHARS);
      return `${role}: ${text}`;
    })
    .join('\n');
}

function sanitizeInput(input, max) {
  return String(input ?? '')
    .slice(0, max)
    .replace(/"""/g, '"\\"\\"\\"');
}

export function buildInitialPrompt(userInput) {
  const safeInput = sanitizeInput(userInput, MAX_INITIAL_INPUT_CHARS);
  return `${SYSTEM_PROMPT_V1}

Input user: """
${safeInput}
"""

Balas JSON saja.`;
}

export function buildRevisionPrompt(oldJson, userMsg, history = []) {
  const historyBlock = formatHistory(history);
  const historySection = historyBlock
    ? `\nRiwayat percakapan:\n${historyBlock}\n`
    : `\n(Tidak ada riwayat percakapan sebelumnya)\n`;

  const safeMsg = sanitizeInput(userMsg, MAX_REVISION_MSG_CHARS);
  const safeState = JSON.stringify(oldJson ?? {}).slice(0, MAX_STATE_CHARS);

  return `${SYSTEM_PROMPT_V1}
${historySection}
State website saat ini:
${safeState}

Revisi diminta: """
${safeMsg}
"""
Aturan revisi:
- Gunakan riwayat percakapan untuk memahami konteks.
- Ubah HANYA field yang diminta. Jangan hapus section lain.
- Jika minta warna -> ubah theme.primaryColor/accentColor saja.
- Jika minta tambah menu -> append ke services[].
- Jika revisi menyentuh testimonials[] (tambah/ubah), WAJIB tetap patuhi ATURAN TESTIMONI di atas.
- Jangan menyederhanakan review yang sudah spesifik menjadi frasa klise.

Balas JSON lengkap yang sudah direvisi.`;
}
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

ATURAN TESTIMONI (WAJIB, hanya saat AI mengarang sendiri):
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

ATURAN CRUD TESTIMONI VIA CHAT (WAJIB):
User bisa memerintah dalam bahasa bebas. Deteksi niat lalu terapkan ke field "testimonials" SAJA:
- TAMBAH: "tambah testimoni dari <Nama>: <teks>", "tambahin review <Nama> ...", "kasih testimoni <Nama> ..."
  -> APPEND satu objek {customerName, review} ke akhir array. JANGAN timpa yang lama.
- HAPUS: "hapus testimoni <Nama>", "buang testimoni yang <kata kunci>", "delete review <Nama>"
  -> Hapus objek yang customerName-nya PALING COCOK dengan <Nama> (case-insensitive, boleh cocok sebagian).
  -> Jika user sebut kata kunci isi review, cocokkan ke review.
  -> Jika ambigu (>1 kandidat sama-sama cocok), pilih yang paling mirip string-nya; jangan hapus dua-duanya.
  -> BOLEH sampai array kosong. testimonials TIDAK punya minimum.
- UBAH/EDIT: "ganti review <Nama> jadi <teks baru>", "ubah testimoni <Nama>", "perbaiki review <Nama> ..."
  -> Cari objek by customerName, ganti HANYA field yang diminta (review dan/atau customerName). Index & jumlah array TIDAK berubah.
- GANTI SEMUA: "ganti semua testimoni jadi ..." -> boleh timpa seluruh array (hanya jika user eksplisit bilang "semua").
- PRIORITAS: perintah eksplisit user > ATURAN TESTIMONI (kualitas). Jika user kasih teks klise ("enak banget", "mantap"),
  TULIS APA ADANYA — jangan "memperbaiki" gaya bahasa yang diminta user. Aturan anti-klise hanya berlaku saat AI mengarang sendiri.
- DILARANG mengarang testimoni baru saat perintahnya HAPUS atau UBAH. Hanya lakukan operasi yang diminta.
- Jika nama yang diminta tidak ada di array: JANGAN tambah; kembalikan array apa adanya (jangan ubah field lain).
- Pertahankan urutan array asli saat update/hapus (jangan sort ulang).

CONTOH OPERASI TESTIMONI (chat bebas):
State: testimonials = [{"customerName":"Rina","review":"Kue coklatnya lumer, dikirim tepat H-1."},{"customerName":"Hendra","review":"Servis AC 3 unit, datang jam 8 tepat."}]
- "tambah testimoni dari Sari: enak banget, bakal order lagi"
  -> 3 item, item baru: {"customerName":"Sari","review":"enak banget, bakal order lagi"}
- "hapus testimoni Hendra"
  -> 1 item (Rina). JANGAN tambah pengganti.
- "ganti review Rina jadi kue-nya lembut banget dan packing rapi"
  -> item Rina berubah review, customerName tetap "Rina", panjang array tetap 2.
- "hapus semua testimoni"
  -> testimonials = []

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

const TESTIMONIAL_INTENT_PATTERNS = [
  { intent: 'add',    re: /\b(tambah|tambahin|kasih|bikin|buat)\b.*\b(testimoni|review|ulasan)\b/i },
  { intent: 'remove', re: /\b(hapus|buang|delete|ilangin|hilangkan)\b.*\b(testimoni|review|ulasan)\b/i },
  { intent: 'update', re: /\b(ganti|ubah|edit|perbaiki|revisi|update)\b.*\b(testimoni|review|ulasan)\b/i },
];

export function detectTestimonialIntent(userMsg) {
  const text = String(userMsg ?? '');
  if (!text) return null;
  // remove dicek dulu supaya "hapus semua testimoni" tidak ketangkep "semua"
  for (const { intent, re } of TESTIMONIAL_INTENT_PATTERNS) {
    if (re.test(text)) return intent;
  }
  return null;
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

  const testimonialIntent = detectTestimonialIntent(userMsg);
  const intentHint = testimonialIntent
    ? `\nTerdeteksi niat CRUD testimoni: ${testimonialIntent.toUpperCase()}. Terapkan sesuai ATURAN CRUD TESTIMONI VIA CHAT.\n`
    : '';

  return `${SYSTEM_PROMPT_V1}
${historySection}${intentHint}
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
- KHUSUS testimonials: operasi chat bebas (tambah/hapus/ubah) HARUS diterapkan sebagai append/remove/patch by customerName, BUKAN menimpa seluruh array.
  * "tambah testimoni dari X: Y" -> testimonials.push({customerName:"X", review:"Y"})
  * "hapus testimoni X" -> testimonials = testimonials.filter(t => !matchName(t, "X"))
  * "ganti review X jadi Y" -> temukan index by name, ubah .review = "Y", panjang array tetap
  * "hapus semua testimoni" -> testimonials = []
- Jangan mengarang testimoni saat perintah HAPUS/UBAH. Jangan menambah yang tidak diminta.
- Jika user memberi teks yang melanggar ATURAN TESTIMONI (mis. "enak banget"), tetap tulis apa adanya karena itu permintaan eksplisit user.
- Pertahankan panjang & urutan array untuk operasi update/hapus.

Balas JSON lengkap yang sudah direvisi.`;
}
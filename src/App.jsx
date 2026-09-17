/**
 * App.jsx — AI UMKM Website Builder
 * Dual-Panel Interface with Chat Assistant & Real-time Live Preview
 *
 * Implements Dev 2B UI Components through Sprint Day 6:
 * - TSK-01D: Template Slicing Baseline Component
 * - TSK-02D: Slicing 4 Komponen Template Utama (Hero, About, Services/Products, Contact)
 * - TSK-03D: Logika Seleksi Template Deterministik (F&B, Services, Retail)
 * - TSK-04C: Slicing Template Variasi & Kustomisasi (Color Palettes & Typography)
 * - TSK-05D: Styling Template Responsiveness for Revision (Dynamic mutations via Chat)
 */
import { useState, useRef, useEffect } from 'react'
import {
  Download,
  Monitor,
  Smartphone,
  Send,
  CheckCircle2,
  Circle,
  UploadCloud,
} from 'lucide-react'

import SandboxPreview from './components/SandboxPreview'
import ToastContainer from './components/ui/Toast'
import { mockDataByTemplate } from './data/mockWebsiteData'
import {
  TEMPLATE_FNB,
  TEMPLATE_SERVICES,
  TEMPLATE_RETAIL,
  TEMPLATE_META,
  determineTemplate,
} from './lib/templateSelector'
import { exportWebsiteToZip, copyHtmlToClipboard } from './lib/exportWebsite'
import { useWebsite } from './store/websiteStore.jsx'
import { generateWebsite, reviseWebsite } from './lib/websiteController'

function toChatHistory(messages) {
  return messages
    .filter((m) => m.sender === 'user' || m.sender === 'assistant')
    .map((m) => ({
      role: m.sender === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }))
}

// Contoh deskripsi bisnis untuk demo evaluator (TSK-06B / US-10)
const EXAMPLE_BUSINESS_PROMPTS = [
  {
    emoji: '🍢',
    label: 'Bakso',
    text: 'Warung Bakso Pak Slamet, jual bakso urat dan mie ayam pedas mantap di Malang, wa 08123456789',
  },
  {
    emoji: '💈',
    label: 'Barbershop',
    text: 'Barbershop Gentleman Cut, potong rambut pria modern dan cukur jenggot rapi di Jakarta, wa 08199988877',
  },
  {
    emoji: '👟',
    label: 'Cuci Sepatu',
    text: 'CleanKicks Laundry Sepatu, jasa cuci sepatu premium dan deep clean sneakers di Bandung, wa 08561234567',
  },
]

export default function App() {
  // Active template state (Default: F&B as displayed in image.png)
  const [activeTemplate, setActiveTemplate] = useState(TEMPLATE_FNB)
  const [activeTheme, setActiveTheme] = useState('modern-warm')
  const [activeViewport, setActiveViewport] = useState('desktop')
  const [pendingTemplateSwitch, setPendingTemplateSwitch] = useState(null)

  // Website data now lives in the backend state manager (TSK-03B), which
  // persists it to sessionStorage so a reload doesn't lose AI-driven edits.
  const { website: websiteData, setWebsite: setWebsiteData, patchWebsite, appendServiceItem } = useWebsite()

  // First mount: seed the F&B demo dataset if no session was persisted: else
  // (a reload with sessionStorage data, or an AI-generated templateId) sync
  // the template selector to match what was actually persisted, so a reload
  // doesn't silently snap the preview back to F&B while the persisted
  // content is for a different template (TSK-03B).
  useEffect(() => {
    if (!websiteData) {
      const seed = JSON.parse(JSON.stringify(mockDataByTemplate[TEMPLATE_FNB]))
      seed.templateId = TEMPLATE_FNB
      setWebsiteData(seed, { snapshot: false })
    } else if (websiteData.templateId && TEMPLATE_META[websiteData.templateId] && websiteData.templateId !== activeTemplate) {
      setActiveTemplate(websiteData.templateId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chat conversation state matching reference design
  const [messages, setMessages] = useState([
    {
      id: 'msg-1',
      sender: 'assistant',
      type: 'onboarding',
      text: 'Halo! 👋 Saya siap membantu membuat website untuk bisnis Anda.',
      steps: [
        { label: 'Informasi bisnis dipahami', status: 'done' },
        { label: 'Template F&B dipilih', status: 'done' },
        { label: 'Menyusun konten & layout', status: 'in-progress' },
        { label: 'Menyiapkan preview', status: 'pending' },
      ],
    },
    {
      id: 'msg-2',
      sender: 'user',
      text: 'Ubah warna utama jadi cokelat tua klasik.',
    },
    {
      id: 'msg-3',
      sender: 'assistant',
      text: 'Tentu! Warna website telah diperbarui ke tema Modern Warm. Konten tetap aman.',
    },
  ])

  const [inputPrompt, setInputPrompt] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatBottomRef = useRef(null)

  // Toast notifications (TSK-06B / Hari 7)
  const [toasts, setToasts] = useState([])
  const showToast = (type, message) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { id, type, message }])
  }
  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle template selection switch
  const handleSelectTemplate = (templateId) => {
    setPendingTemplateSwitch(null)
    setActiveTemplate(templateId)
    const defaultTheme = TEMPLATE_META[templateId].defaultTheme
    setActiveTheme(defaultTheme)

    // Load template-specific data
    const baseData = JSON.parse(JSON.stringify(mockDataByTemplate[templateId]))
    baseData.templateId = templateId // stamped so a reload can restore the right template (TSK-03B)
    const currentThemes = TEMPLATE_META[templateId].themes
    const themeObj = currentThemes.find((t) => t.id === defaultTheme) || currentThemes[0]

    baseData.theme = {
      primaryColor: themeObj.primaryColor,
      secondaryColor: themeObj.secondaryColor,
      accentColor: themeObj.accentColor,
    }

    setWebsiteData(baseData)

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        text: `Template berhasil dialihkan ke ${TEMPLATE_META[templateId].name}. Layout dan data konten disesuaikan secara otomatis.`,
      },
    ])
  }

  // Handle theme palette change
  const handleThemeChange = (themeId) => {
    setActiveTheme(themeId)
    const currentThemes = TEMPLATE_META[activeTemplate].themes
    const themeObj = currentThemes.find((t) => t.id === themeId)

    if (themeObj) {
      setWebsiteData((prev) => ({
        ...prev,
        theme: {
          ...prev.theme,
          primaryColor: themeObj.primaryColor,
          secondaryColor: themeObj.secondaryColor,
          accentColor: themeObj.accentColor,
        },
      }))
    }
  }

  // Handle theme pallete change for active template
  const handleThemeChangeForActiveTemplate = (themeId) => {
    const currentThemes = TEMPLATE_META[activeTemplate].themes
    const themeObj = currentThemes.find((t) => t.id === themeId) || currentThemes[0]
    setActiveTheme(themeObj.id)
    setWebsiteData((prev) => ({
      ...prev,
      theme: {
        ...prev.theme,
        primaryColor: themeObj.primaryColor,
        secondaryColor: themeObj.secondaryColor,
        accentColor: themeObj.accentColor,
      },
    }))
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const handleConfirmTemplateSwitch = () => {
    if (!pendingTemplateSwitch) return
    const { pendingTemplateId } = pendingTemplateSwitch
    setPendingTemplateSwitch(null)
    setMessages((prev) => prev.filter((m) => m.type !== 'confirm-switch'))
    handleSelectTemplate(pendingTemplateId)
    setMessages((prev) => [
      ...prev,
      {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: `Baik, draft baru untuk kategori ${TEMPLATE_META[pendingTemplateId].name} sudah dibuat. Silakan lanjutkan revisi.`,
      },
    ])
  }
  
  const handleCancelTemplateSwitch = () => {
    if (!pendingTemplateSwitch) return
    setPendingTemplateSwitch(null)
    setMessages((prev) =>
      prev
        .filter((m) => m.type !== 'confirm-switch')
        .concat({
          id: `bot-${Date.now()}`,
          sender: 'assistant',
          text: `Baik, saya lanjutkan sebagai revisi pada draft "${websiteData?.meta?.businessName || 'Anda'}" tanpa mengganti template. Silakan sampaikan revisinya.`,
        })
    )
  }

  // Process revision prompt (TSK-05D / Hari 6 UI; TSK-02B/03B/05B backend orchestration)
  const handleSendPrompt = async (promptText, source='free-text') => {
    const text = (promptText || inputPrompt).trim()
    if (!text) return

    function isRealDraft(data) {
      if (!data || !data.meta) return false
      const defaultName = mockDataByTemplate[TEMPLATE_FNB]?.meta?.businessName
      return !!data.meta.businessName && data.meta.businessName !== defaultName
    }

    // Append user message
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
    }

    setMessages((prev) => [...prev, userMsg])
    setInputPrompt('')
    setIsTyping(true)

    const lower = text.toLowerCase()
    let responseText = ''

    // Fast, deterministic local actions (1-4) never touch the network —
    // no reason to spend a Gemini call on a plain palette swap.
    function isDeterministicQuickAction(lower) {
      return (
        lower.includes('cokelat') || lower.includes('klasik') || lower.includes('modern warm') ||
        lower.includes('amber') || lower.includes('hangat') || lower.includes('warm amber') ||
        lower.includes('hijau') || lower.includes('sage') || lower.includes('toska') ||
        lower.includes('biru') || lower.includes('corporate') || lower.includes('navy') ||
        lower.includes('ungu') || lower.includes('violet') || lower.includes('retail') ||
        lower.includes('headline') || lower.includes('judul') || lower.includes('slogan') ||
        lower.includes('menu') || lower.includes('tambah') || lower.includes('produk') ||
        lower.includes('whatsapp') || lower.includes('nomor') ||
        lower.includes('ganti wa') || lower.includes('update wa')
      )
    }
    
    const isDeterministicAction =
      source === 'quick-action' && isDeterministicQuickAction(lower)

    if (isDeterministicAction) {
      await wait(450)

      // 1. Check color/theme revision
      if (lower.includes('cokelat') || lower.includes('klasik') || lower.includes('modern warm')) {
        handleThemeChange('modern-warm')
        responseText = 'Tentu! Warna website telah diperbarui ke tema Modern Warm (Cokelat). Konten tetap aman.'
      } else if (lower.includes('amber') || lower.includes('hangat') || lower.includes('warm amber')) {
        handleThemeChange('warm-amber')
        responseText = 'Warna website diperbarui ke tema Warm Amber dengan sentuhan kehangatan madu.'
      } else if (lower.includes('hijau') || lower.includes('sage') || lower.includes('toska')) {
        handleThemeChange('forest-sage')
        responseText = 'Warna website diperbarui ke tema Forest Sage yang segar dan natural.'
      } else if (lower.includes('biru') || lower.includes('corporate') || lower.includes('navy')) {
        handleThemeChangeForActiveTemplate('corporate-blue', responseText => {})
        responseText = 'Warna website diperbarui ke tema Corporate Blue profesional. Konten Anda tetap aman.'
      } else if (lower.includes('ungu') || lower.includes('violet') || lower.includes('retail')) {
        handleThemeChangeForActiveTemplate('bold-violet', responseText => {})
        responseText = 'Warna website diperbarui ke tema Bold Violet. Konten Anda tetap aman.'
      }
      
      // 2. Check headline revision
      else if (lower.includes('headline') || lower.includes('judul') || lower.includes('slogan')) {
        const headlineByTemplate = {
          [TEMPLATE_FNB]: {
            title: 'Sensasi Kopi Autentik & Ruang Kreatif',
            subtitle: 'Ruang temu hangat untuk berdiskusi, bekerja santai, dan menikmati racikan biji kopi terbaik Nusantara.',
          },
          [TEMPLATE_SERVICES]: {
            title: 'Solusi Profesional untuk Bisnis Anda',
            subtitle: 'Tim ahli siap membantu Anda mencapai hasil terbaik dengan layanan yang tepat sasaran.',
          },
          [TEMPLATE_RETAIL]: {
            title: 'Koleksi Pilihan, Kualitas Terjamin',
            subtitle: 'Temukan produk terbaik dengan harga bersaing dan pelayanan cepat.',
          },
        }
        const newHeadline = headlineByTemplate[activeTemplate] || headlineByTemplate[TEMPLATE_FNB]
        patchWebsite({ hero: { ...websiteData.hero, title: newHeadline.title, subtitle: newHeadline.subtitle } })
        responseText = `Headline berhasil diperbarui menjadi "${newHeadline.title}". Susunan kalimat dioptimalkan untuk daya tarik maksimal!`
      }

      // 3. Check menu/product addition — dedicated append action (TSK-05B), not a full replace
      else if (lower.includes('menu') || lower.includes('tambah') || lower.includes('produk')) {
        const newItemByTemplate = {
          [TEMPLATE_FNB]: {
            name: 'Pisang Goreng Keju Crispy',
            description: 'Pisang kepok manis berbalut tepung renyah dengan taburan keju cheddar gurih dan susu kental manis',
            priceEstimate: 'Rp15.000',
            icon: '🍌',
          },
          [TEMPLATE_SERVICES]: {
            name: 'Paket Konsultasi Premium',
            description: 'Sesi konsultasi intensif 2 jam bersama tim ahli untuk solusi bisnis Anda',
            priceEstimate: 'Rp500.000',
            icon: '💼',
          },
          [TEMPLATE_RETAIL]: {
            name: 'Voucher Belanja Rp50.000',
            description: 'Voucher diskon untuk pembelian berikutnya, berlaku 30 hari',
            priceEstimate: 'Rp50.000',
            icon: '🎟️',
          },
        }
        const newItem = newItemByTemplate[activeTemplate] || newItemByTemplate[TEMPLATE_FNB]
        appendServiceItem(newItem)
        responseText = `Item baru "${newItem.name}" (${newItem.priceEstimate}) berhasil ditambahkan ke katalog!`
      }

      // 4. Check WhatsApp update
      // NOTE: bare "wa" is deliberately excluded — it false-matches substrings like
      // "warung"/"warna", which would misroute business-description prompts (e.g. TC-01's
      // "Warung Kopi Sejahtera ... wa 08123456789") away from template auto-detection below.
      else if (
        lower.includes('whatsapp') ||
        lower.includes('nomor') ||
        lower.includes('ganti wa') ||
        lower.includes('update wa')
      ) {
        const newWa = '6281299887766'
        patchWebsite({ contact: { ...websiteData.contact, whatsappNumber: newWa } })
        responseText = `Nomor WhatsApp CTA berhasil dihubungkan ke +${newWa}. Semua tombol pemesanan siap digunakan!`
      }
    } else {
      // General path (US-05/US-07): try the real backend/LLM route first
      // (TSK-01B/02B — retry-once + fallback happens server-side), then fall
      // back to deterministic template detection so the demo never stalls
      // when no GEMINI_API_KEY is configured (see server/index.js).
      const detected = determineTemplate(text)
      const isNewBusinessDescription = detected !== activeTemplate

      if (isNewBusinessDescription && isRealDraft(websiteData)) {
        setPendingTemplateSwitch({
          pendingTemplateId: detected,
          pendingText: text,
          originalPrompt: text,
        })
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-confirm-${Date.now()}`,
            sender: 'assistant',
            type: 'confirm-switch',
            text: `Sepertinya Anda sedang menyebut bisnis kategori ${TEMPLATE_META[detected].name}. Saat ini draft aktif Anda adalah ${TEMPLATE_META[activeTemplate].name} "${websiteData?.meta?.businessName || ''}". Mulai draft baru dan timpa yang sekarang?`,
            pendingTemplateId: detected,
          },
        ])
        setIsTyping(false)
      return                                         // ← keluar lebih awal
      }

      const history = toChatHistory(messages)
      const result = isNewBusinessDescription
        ? await generateWebsite(text)
        : await reviseWebsite(websiteData, text, history)

      if (result.ok) {
        if (isNewBusinessDescription) handleSelectTemplate(detected)
        patchWebsite(result.data)
        if (result.data.templateId) setActiveTemplate(result.data.templateId)
        responseText = isNewBusinessDescription
          ? `Draft website baru berhasil dibuat oleh AI untuk kategori ${TEMPLATE_META[detected].name}!`
          : `Permintaan revisi "${text}" berhasil diterapkan oleh AI!`
      } else {
        // Offline/failure fallback — same UX as before the backend integration.
        if (result.error && result.error !== 'not_configured') {
          showToast('info', 'AI tidak merespons, menggunakan mode offline.')
        }
        const backendFallback = result.fallback

        if (backendFallback) {
          const fallbackTemplateId =
            backendFallback.templateId && TEMPLATE_META[backendFallback.templateId]
            ? backendFallback.templateId
            : detected

          if (fallbackTemplateId !== activeTemplate) {
            handleSelectTemplate(fallbackTemplateId)
          }
    
          patchWebsite(backendFallback)
          if (backendFallback.templateId) {
            setActiveTemplate(backendFallback.templateId)
          }
          responseText = `AI sedang offline — kategori "${TEMPLATE_META[fallbackTemplateId].name}" tetap terdeteksi via fallback backend. Semua komponen diperbarui!`
        } else if (isNewBusinessDescription) {
            handleSelectTemplate(detected)
            responseText = `Sistem mendeteksi kategori bisnis dan menyesuaikan template ke ${TEMPLATE_META[detected].name}. Semua komponen diperbarui!`
        } else {
            patchWebsite({ meta: { ...websiteData.meta, tagline: text.slice(0, 45) } })
            responseText = `Permintaan revisi "${text}" telah diterapkan pada konten website secara real-time!`
        }
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: responseText,
        source: isDeterministicAction ? 'deterministic' : 'llm',
      },
    ])
    setIsTyping(false)
  }

  // Handle Export / Download Website as a .zip bundle (TSK-06A), with a
  // clipboard-copy fallback if zip generation fails (Plan B contingency).
  const handleDownload = async () => {
    try {
      await exportWebsiteToZip(websiteData, activeTemplate)
      showToast('success', `Website "${websiteData?.meta?.businessName || 'UMKM'}" berhasil diunduh (.zip)!`)
    } catch (err) {
      console.error('Gagal export ZIP, mencoba fallback clipboard:', err)
      try {
        await copyHtmlToClipboard(websiteData, activeTemplate)
        showToast('info', 'Gagal membuat ZIP — kode HTML disalin ke clipboard sebagai gantinya.')
      } catch (clipboardErr) {
        console.error('Fallback clipboard juga gagal:', clipboardErr)
        showToast('error', 'Gagal mengunduh website. Silakan coba lagi.')
      }
    }
  }

  // TSK-06D (Could-Have / stretch goal): one-click static publish needs a
  // deploy provider (Vercel/Supabase/Firebase) credential we don't have
  // configured here. Per the task's own Plan B ("Publish gagal -> nonaktifkan
  // tombol, fokus pada unduhan ZIP"), the button is shown but disabled
  // rather than faking a deploy.

  const currentMeta = TEMPLATE_META[activeTemplate]
  const currentThemes = currentMeta.themes

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-900 text-slate-100 font-sans antialiased selection:bg-amber-400 selection:text-amber-950">
      {/* ============================================================
          TOP HEADER BAR (Reference: image.png)
          ============================================================ */}
      <header className="h-14 bg-[#0f172a] border-b border-slate-800 px-4 lg:px-6 flex items-center justify-between shrink-0 z-30">
        {/* Brand Left */}
        <div className="flex items-center gap-2.5">
          <span className="text-amber-400 text-lg leading-none select-none">✦</span>
          <span className="font-extrabold text-white text-base tracking-tight">
            UMKM Builder
          </span>
        </div>

        {/* Center / Right Toolbar */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Active Business Badge */}
          <div className="hidden md:flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1 rounded-full text-xs">
            <span className="text-slate-400 font-semibold tracking-wider text-[11px] uppercase">
              AKTIF :
            </span>
            <span className="flex items-center gap-1.5 font-bold text-white uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {websiteData?.meta?.businessName || 'WARUNG KOPI SEJAHTERA'}
            </span>
          </div>

          {/* Template Selector Pills */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            {Object.values(TEMPLATE_META).map((t) => {
              const isActive = activeTemplate === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  className={[
                    'px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5',
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50',
                  ].join(' ')}
                  title={t.name}
                >
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Publish Button (TSK-06D — stretch goal, disabled: no deploy provider configured) */}
          <button
            disabled
            className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs font-semibold px-3 sm:px-3.5 py-1.5 rounded-lg cursor-not-allowed"
            title="Publish otomatis (stretch goal) — segera hadir. Gunakan Download Website untuk saat ini."
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Publish</span>
          </button>

          {/* Download Website Button */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-white text-xs font-semibold px-3 sm:px-3.5 py-1.5 rounded-lg transition-all shadow-xs"
            title="Download bundle ZIP (HTML siap pakai)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download Website</span>
          </button>
        </div>
      </header>

      {/* ============================================================
          MAIN DUAL-PANEL WORKSPACE
          ============================================================ */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100 h-[calc(100vh-56px)]">
        {/* ------------------------------------------------------------
            LEFT PANEL: AI CHAT ASSISTANT & REVISIONS
            ------------------------------------------------------------ */}
        <aside className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 h-[50vh] md:h-full shadow-xs overflow-hidden">
          {/* Assistant Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-mono font-semibold text-slate-400 tracking-wider">
                AI STUDIO V1.0
              </span>
              <span className="font-medium text-slate-500 truncate max-w-[140px]">
                {websiteData?.meta?.businessName || 'Warung Kopi Sejahtera'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>Asisten Website</span>
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Aktif
              </span>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
            {messages.map((msg) => {
              if (msg.sender === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-xs sm:text-sm font-medium shadow-xs max-w-[85%] leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                )
              }

              // Assistant message
              return (
                <div key={msg.id} className="flex flex-col items-start gap-1 max-w-[95%]">
                  <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-sm p-3.5 shadow-xs text-xs sm:text-sm text-slate-700 space-y-2.5 leading-relaxed">
                    <p>{msg.text}</p>

                    {/* Onboarding steps visual progression */}
                    {msg.steps && (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                        <p className="font-medium text-slate-500 text-[11px]">
                          Sedang memproses informasi:
                        </p>
                        <div className="space-y-1">
                          {msg.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-slate-600"
                            >
                              {step.status === 'done' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : step.status === 'in-progress' ? (
                                <span className="w-3.5 h-3.5 flex items-center justify-center">
                                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                                </span>
                              ) : (
                                <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                              )}
                              <span
                                className={
                                  step.status === 'done'
                                    ? 'text-slate-800 font-medium'
                                    : step.status === 'in-progress'
                                    ? 'text-blue-600 font-semibold'
                                    : 'text-slate-400'
                                }
                              >
                                {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.type === 'confirm-switch' && (
                      <div
                        className="flex gap-2 pt-2 border-t border-slate-100"
                        data-testid="confirm-switch-actions"
                      >
                        <button
                          onClick={handleConfirmTemplateSwitch}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          data-testid="confirm-switch-yes"
                        >
                          Ya, mulai draft baru
                        </button>
                        <button
                          onClick={handleCancelTemplateSwitch}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          data-testid="confirm-switch-no"
                        >
                          Batal, lanjutkan revisi
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {isTyping && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-[11px]">Memproses perubahan...</span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Contoh Prompt / Quick-fill Demo (TSK-06B / US-10) */}
          <div className="px-2.5 pt-2.5 bg-white border-t border-slate-100 shrink-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
              Contoh Deskripsi Bisnis (Demo):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_BUSINESS_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  onClick={() => handleSendPrompt(example.text, 'quick-action')}
                  disabled={isTyping}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={example.text}
                >
                  {example.emoji} {example.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Options (Pilihan Cepat) */}
          <div className="p-2.5 bg-white border-t border-slate-100 shrink-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
              Pilihan Cepat:
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSendPrompt('Ubah warna utama jadi cokelat tua klasik.', 'quick-action')}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100 transition-colors"
              >
                ☕ Cokelat Klasik
              </button>
              <button
                onClick={() => handleSendPrompt('Ganti headline jadi lebih menarik.', 'quick-action')}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                ✏️ Headline Baru
              </button>
              <button
                onClick={() => handleSendPrompt('Tambahkan menu baru: Pisang Goreng Keju')}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                ➕ Menu Baru
              </button>
              <button
                onClick={() => handleSendPrompt('Ganti warna jadi warm amber', 'quick-action')}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
              >
                🍯 Warm Amber
              </button>
            </div>
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendPrompt()
              }}
              className="relative bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
            >
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendPrompt()
                  }
                }}
                rows={2}
                placeholder="Minta perubahan pada website..."
                className="w-full text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-transparent border-none focus:outline-none resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 mt-1">
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                  <span className="text-amber-500">✦</span> Tekan Enter untuk kirim
                </span>
                <button
                  type="submit"
                  disabled={!inputPrompt.trim() || isTyping}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white p-1.5 rounded-lg transition-colors shadow-xs active:scale-95"
                  title="Kirim revisi"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </aside>

        {/* ------------------------------------------------------------
            RIGHT PANEL: LIVE PREVIEW & CONTROLS
            ------------------------------------------------------------ */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-100 overflow-hidden">
          {/* Sub-Header Toolbar (Viewport + Theme Palette Switcher) */}
          <div className="h-12 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between shrink-0">
            {/* Viewport Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
              <button
                onClick={() => setActiveViewport('desktop')}
                className={[
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                  activeViewport === 'desktop'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop</span>
              </button>
              <button
                onClick={() => setActiveViewport('mobile')}
                className={[
                  'px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                  activeViewport === 'mobile'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800',
                ].join(' ')}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile</span>
              </button>
            </div>

            {/* Theme Palette Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Tema :</span>
              <div className="flex items-center gap-1.5">
                {currentThemes.map((thm) => {
                  const isActive = activeTheme === thm.id
                  return (
                    <button
                      key={thm.id}
                      onClick={() => handleThemeChange(thm.id)}
                      className={[
                        'px-2.5 py-1 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5',
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-slate-400/20'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: thm.primaryColor }}
                      />
                      <span className="hidden sm:inline">{thm.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Live Preview Canvas Stage */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex justify-center items-start">
            <div
              className={[
                'transition-all duration-300 ease-in-out bg-white shadow-xl overflow-hidden',
                activeViewport === 'mobile'
                  ? 'w-[390px] h-[82vh] rounded-[2.5rem] ring-8 ring-slate-800 shadow-2xl my-auto'
                  : 'w-full max-w-6xl rounded-xl border border-slate-200/80',
              ].join(' ')}
            >
              {/* Sandboxed preview: styles stay isolated from the workspace. */}
              <SandboxPreview
                templateId={activeTemplate}
                data={websiteData}
                theme={activeTheme}
                viewport={activeViewport}
                className={activeViewport === 'mobile' ? 'min-h-0' : 'min-h-[720px]'}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Toast Notifications (TSK-06B / Hari 7) */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

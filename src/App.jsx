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
  XCircle,
  AlertTriangle,
  Undo2,
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
  detectCategorySignal,
  isValidWhatsappNumber,
} from './lib/templateSelector'
import { exportWebsiteToZip, copyHtmlToClipboard, buildStandaloneHtml } from './lib/exportWebsite'
import { useWebsite } from './store/websiteStore.jsx'
import { generateWebsite, reviseWebsite, publishWebsite } from './lib/websiteController'

function toChatHistory(messages) {
  return messages
    .filter((m) => m.sender === 'user' || m.sender === 'assistant')
    .map((m) => ({
      role: m.sender === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }))
}

// Change summary (#47) — a plain top-level-key diff, not a deep patch log:
// good enough to tell the user *what changed* without a diff library, since
// patchWebsite always replaces a whole section rather than merging keys.
const CHANGE_LABELS = {
  theme: 'Tema warna',
  hero: 'Headline / hero',
  about: 'Deskripsi / tentang kami',
  contact: 'Kontak',
  meta: 'Info bisnis',
  templateId: 'Template',
}
function summarizeChanges(prev, delta) {
  if (!delta) return []
  const changes = []
  for (const [key, label] of Object.entries(CHANGE_LABELS)) {
    if (key in delta && JSON.stringify(delta[key]) !== JSON.stringify(prev?.[key])) {
      changes.push(label)
    }
  }
  if (delta.services) {
    const prevLen = prev?.services?.length || 0
    const nextLen = delta.services.length
    if (nextLen > prevLen) changes.push(`Menu ditambahkan (+${nextLen - prevLen})`)
    else if (JSON.stringify(delta.services) !== JSON.stringify(prev?.services)) changes.push('Menu diperbarui')
  }
  return changes
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
  // Pending category-switch confirmation (#14) — set while we're waiting on
  // the user's "start a new draft?" decision (Aldi's dev-ai design).
  const [pendingTemplateSwitch, setPendingTemplateSwitch] = useState(null)

  // Website data now lives in the backend state manager (TSK-03B), which
  // persists it to sessionStorage so a reload doesn't lose AI-driven edits.
  const { website: websiteData, setWebsite: setWebsiteData, patchWebsite, appendServiceItem, history, undo, saveStatus } = useWebsite()
  const canUndo = history.length > 0
  // Tracks which assistant message currently owns the visible "Undo" action
  // (#48) — only the most recent change gets one, so undo semantics stay
  // predictable (undo always reverts the single latest change, never a
  // stale earlier one a user might click on further up the conversation).
  const [lastChangeMsgId, setLastChangeMsgId] = useState(null)

  // First mount: seed the F&B demo dataset if no session was persisted: else
  // (a reload with sessionStorage data, or an AI-generated templateId) sync
  // the template selector to match what was actually persisted, so a reload
  // doesn't silently snap the preview back to F&B while the persisted
  // content is for a different template (TSK-03B).
  useEffect(() => {
    // Only sync the template selector to a persisted session (reload case).
    // A genuinely empty session stays null — no mock seed — so the workspace
    // shows a real blank state until the user generates a first draft
    // (see GitHub issue #3).
    if (websiteData?.templateId && TEMPLATE_META[websiteData.templateId] && websiteData.templateId !== activeTemplate) {
      setActiveTemplate(websiteData.templateId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chat conversation state: only the real onboarding message. No fabricated
  // user/assistant turns — a first-time user should never see a conversation
  // they never had (see GitHub issue #3).
  const [messages, setMessages] = useState([
    {
      id: 'msg-1',
      sender: 'assistant',
      type: 'onboarding',
      text: 'Halo! 👋 Ceritakan bisnis Anda (nama usaha, kategori, produk/layanan unggulan, target pasar, dan nomor WhatsApp) dan saya akan buatkan draft website pertama.',
    },
  ])

  const [inputPrompt, setInputPrompt] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
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

  // Theme change scoped to whichever template is already active — used by
  // the deterministic "biru"/"ungu" quick actions so a color word never
  // force-switches the template (and loses content) the way it used to
  // (issue #4). Corporate Blue / Bold Violet are themes on the Services /
  // Retail templates respectively, but only actually apply if that
  // template is already active; otherwise this is a no-op fallback within
  // the current template's own theme list.
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

  // 4-phase onboarding progress ("info bisnis -> pilih template -> AI susun
  // konten -> preview siap"), rendered inside the assistant bubble via
  // msg.steps (issue #12 — the markup already existed but nothing filled it).
  const ONBOARDING_STEP_LABELS = [
    'Memahami info bisnis',
    'Memilih template',
    'AI menyusun konten',
    'Preview siap',
  ]
  const stepsAt = (activeIdx, doneUpTo) =>
    ONBOARDING_STEP_LABELS.map((label, idx) => ({
      label,
      status: idx <= doneUpTo ? 'done' : idx === activeIdx ? 'in-progress' : 'pending',
    }))

  // Final step state once a flow settles (#45) — a genuine failure (no
  // fallback applied, content untouched) marks the last step as failed
  // instead of a green checkmark, so the checklist stops contradicting the
  // "gagal" text in the same bubble.
  const finalSteps = (flowState) =>
    ONBOARDING_STEP_LABELS.map((label, idx) => {
      const isLast = idx === ONBOARDING_STEP_LABELS.length - 1
      if (isLast && flowState === 'error') return { label, status: 'error' }
      return { label, status: 'done' }
    })

  // Shared AI call for both a first draft and a (confirmed) revision —
  // drives the same progress bubble through all 4 phases and applies the
  // result. Used by the general chat path and by the category-switch
  // confirmation flow (#14).
  const runAiFlow = async (text, { isNewBusinessDescription, detectedTemplateId }) => {
    const progressId = `bot-${Date.now()}`
    // Snapshot taken before any mutation below, so the change summary (#47)
    // diffs against what was on screen right before this request — not
    // against whatever websiteData has become by the time the diff runs.
    const prevSnapshotForDiff = websiteData
    setMessages((prev) => [
      ...prev,
      { id: progressId, sender: 'assistant', text: 'Sedang memproses permintaan Anda...', steps: stepsAt(0, -1) },
    ])

    // Phase 1 -> 2 ("Memahami info bisnis" -> "Memilih template"): category/
    // template detection (determineTemplate) already ran synchronously
    // before runAiFlow was even called, so this is deliberate UI pacing
    // (long enough for a human to actually register the phase, US-06) —
    // not a stand-in for real async work, unlike the next transition.
    await wait(200)
    setMessages((prev) => prev.map((m) => (m.id === progressId ? { ...m, steps: stepsAt(1, 0) } : m)))

    const history = toChatHistory(messages)

    // Phase 2 -> 3 ("Memilih template" -> "AI menyusun konten"): now driven
    // by the real request lifecycle via onStep, fired right as the fetch
    // starts (issue #13's onStep callback) — not a second blind wait().
    const onStep = () =>
      setMessages((prev) => prev.map((m) => (m.id === progressId ? { ...m, steps: stepsAt(2, 1) } : m)))

    const result = isNewBusinessDescription
      ? await generateWebsite(text, { onStep })
      : await reviseWebsite(websiteData, text, history, { onStep })

    setMessages((prev) => prev.map((m) => (m.id === progressId ? { ...m, steps: stepsAt(3, 2) } : m)))

    let responseText = ''
    // Explicit generating/success/error/offline state (#45) — drives both the
    // status badge on the bubble and which icon the final step gets, instead
    // of every outcome ending in the same all-green checklist regardless of
    // whether anything actually succeeded.
    let flowState = 'error'
    let changes = []

    if (result.ok) {
      if (isNewBusinessDescription) handleSelectTemplate(detectedTemplateId)
      patchWebsite(result.data)
      if (result.data.templateId) setActiveTemplate(result.data.templateId)
      flowState = 'success'
      changes = isNewBusinessDescription
        ? ['Draft pertama dibuat']
        : summarizeChanges(prevSnapshotForDiff, result.data)
      responseText = isNewBusinessDescription
        ? `Draft website baru berhasil dibuat oleh AI untuk kategori ${TEMPLATE_META[detectedTemplateId].name}!`
        : `Permintaan revisi "${text}" berhasil diterapkan oleh AI!`

      // issue #26: flag an invalid WA number as soon as the draft lands,
      // not only later when the preview quietly disables the button.
      if (isNewBusinessDescription && !isValidWhatsappNumber(result.data?.contact?.whatsappNumber)) {
        responseText += ' Catatan: nomor WhatsApp yang terdeteksi sepertinya belum lengkap/valid — perbaiki di panel kontak supaya tombol pemesanan aktif.'
      }
    } else {
      // Offline/failure fallback — same UX as before the backend integration,
      // but the toast is now 'warning' (not 'info', which rendered as a green
      // success toast — issue #46) since this is AI failing over to a
      // degraded mode, not something that went right.
      if (result.error && result.error !== 'not_configured') {
        showToast('warning', 'AI tidak merespons, menggunakan mode offline.')
      }
      const backendFallback = result.fallback

      if (backendFallback) {
        const fallbackTemplateId =
          backendFallback.templateId && TEMPLATE_META[backendFallback.templateId]
            ? backendFallback.templateId
            : detectedTemplateId

        if (fallbackTemplateId !== activeTemplate) {
          handleSelectTemplate(fallbackTemplateId)
        }

        patchWebsite(backendFallback)
        if (backendFallback.templateId) {
          setActiveTemplate(backendFallback.templateId)
        }
        flowState = 'offline'
        // A first draft has nothing real to diff against — prevSnapshotForDiff
        // is null, which would make summarizeChanges list nearly every field
        // as "changed". Only diff for an actual revision on an existing draft.
        changes = isNewBusinessDescription
          ? ['Draft awal dibuat via fallback backend']
          : summarizeChanges(prevSnapshotForDiff, backendFallback)
        responseText = `AI sedang offline — kategori "${TEMPLATE_META[fallbackTemplateId].name}" tetap terdeteksi via fallback backend. Semua komponen diperbarui!`
      } else if (isNewBusinessDescription) {
        handleSelectTemplate(detectedTemplateId)
        flowState = 'offline'
        changes = ['Draft awal dibuat via fallback deterministik']
        responseText = `Sistem mendeteksi kategori bisnis dan menyesuaikan template ke ${TEMPLATE_META[detectedTemplateId].name}. Semua komponen diperbarui!`
      } else {
        // No backend fallback exists for a failed /api/revise (unlike
        // /api/generate's getFallback) — there's no safe deterministic way
        // to guess what an arbitrary free-text revision meant. Previously
        // this dumped the raw message straight into meta.tagline as a fake
        // "something changed" signal, which looked like real content on a
        // live site the moment any revision genuinely failed (rate limit,
        // Gemini quota, network blip) — say so honestly instead, and leave
        // the existing content untouched.
        flowState = 'error'
        responseText = `Maaf, permintaan "${text}" belum bisa diproses AI saat ini. Coba lagi sebentar lagi, atau pakai salah satu Pilihan Cepat di bawah untuk perubahan warna/menu/headline.`
      }
    }

    await wait(120)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === progressId
          ? { ...m, text: responseText, steps: finalSteps(flowState), flowState, changes }
          : m
      )
    )
    // Only arm Undo for an actual revision on an existing draft. A bare
    // error (flowState === 'error') has nothing to undo, and the very first
    // draft is excluded too: handleSelectTemplate seeds a mock-template
    // placeholder into state before the real AI/fallback data lands, which
    // setWebsite's snapshot logic captures into history as if it were a
    // real prior draft — undoing right after a first generate would revert
    // to that internal placeholder instead of to "no draft".
    if (changes.length > 0 && !isNewBusinessDescription) setLastChangeMsgId(progressId)
    setIsTyping(false)
  }

  // User's decision on the "this looks like a different business" prompt
  // (#14, design shared with Aldi/dev-ai) — confirming starts a fresh draft
  // for the detected category (running the original message through the AI
  // so the new draft actually reflects what the user described, not just an
  // empty template), declining treats the original message as a normal
  // revision on the draft already in progress.
  const handleConfirmTemplateSwitch = async () => {
    if (!pendingTemplateSwitch) return
    const { pendingTemplateId, pendingText } = pendingTemplateSwitch
    setPendingTemplateSwitch(null)
    setMessages((prev) => prev.filter((m) => m.type !== 'confirm-switch'))
    setIsTyping(true)
    await runAiFlow(pendingText, { isNewBusinessDescription: true, detectedTemplateId: pendingTemplateId })
  }

  const handleCancelTemplateSwitch = async () => {
    if (!pendingTemplateSwitch) return
    const { pendingText } = pendingTemplateSwitch
    setPendingTemplateSwitch(null)
    setMessages((prev) => prev.filter((m) => m.type !== 'confirm-switch'))
    setIsTyping(true)
    await runAiFlow(pendingText, { isNewBusinessDescription: false, detectedTemplateId: activeTemplate })
  }

  // A draft counts as "real" once there's actual website data with a
  // business name — used to gate the category-switch confirmation (#14)
  // so the very first message never triggers a pointless "start a new
  // draft?" prompt (there's nothing yet to protect). websiteData is never
  // auto-seeded here (see GitHub issue #3/#33), so this is simply "does a
  // draft exist" — no need to special-case it against a hardcoded default
  // name (a real AI-generated business can coincidentally share a name
  // with a mock preset, e.g. the "Warung Kopi Sejahtera" demo fixture).
  const isRealDraft = (data) => Boolean(data?.meta?.businessName)

  // Process revision prompt (TSK-05D / Hari 6 UI; TSK-02B/03B/05B backend orchestration)
  const handleSendPrompt = async (promptText, source = 'free-text') => {
    const text = (promptText || inputPrompt).trim()
    if (!text) return

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
    // Which change summary label (#47) a deterministic quick action applied —
    // these branches already know exactly what changed, so there's no need
    // to diff before/after state the way the AI path does.
    let changeLabel = null

    // Fast, deterministic local actions (1-4) never touch the network —
    // no reason to spend a Gemini call on a plain palette swap. These are
    // revisions, so they only make sense once a first draft exists (issue
    // #3), AND only from the dedicated quick-action buttons — free-typed
    // text is never treated as a deterministic shortcut, since a business
    // description that happens to mention a color word (e.g. "toko baju
    // biru") would otherwise get misrouted into a silent theme swap that
    // destroys the rest of the message's content (issue #4).
    const isDeterministicAction =
      Boolean(websiteData) && source === 'quick-action' && (
        lower.includes('cokelat') || lower.includes('klasik') || lower.includes('modern warm') ||
        lower.includes('amber') || lower.includes('hangat') || lower.includes('warm amber') ||
        lower.includes('hijau') || lower.includes('sage') || lower.includes('toska') ||
        lower.includes('biru') || lower.includes('corporate') || lower.includes('navy') ||
        lower.includes('ungu') || lower.includes('violet') || lower.includes('retail') ||
        lower.includes('headline') || lower.includes('judul') || lower.includes('slogan') ||
        lower.includes('menu') || lower.includes('tambah') || lower.includes('produk') ||
        lower.includes('whatsapp') || lower.includes('nomor') || lower.includes('ganti wa') || lower.includes('update wa')
      )

    if (isDeterministicAction) {
      await wait(450)

      // 1. Check color/theme revision
      if (lower.includes('cokelat') || lower.includes('klasik') || lower.includes('modern warm')) {
        handleThemeChange('modern-warm')
        responseText = 'Tentu! Warna website telah diperbarui ke tema Modern Warm (Cokelat). Konten tetap aman.'
        changeLabel = 'Tema warna'
      } else if (lower.includes('amber') || lower.includes('hangat') || lower.includes('warm amber')) {
        handleThemeChange('warm-amber')
        responseText = 'Warna website diperbarui ke tema Warm Amber dengan sentuhan kehangatan madu.'
        changeLabel = 'Tema warna'
      } else if (lower.includes('hijau') || lower.includes('sage') || lower.includes('toska')) {
        handleThemeChange('forest-sage')
        responseText = 'Warna website diperbarui ke tema Forest Sage yang segar dan natural.'
        changeLabel = 'Tema warna'
      } else if (lower.includes('biru') || lower.includes('corporate') || lower.includes('navy')) {
        // Scoped to the active template instead of force-switching to
        // Services — switching used to silently wipe whatever draft the
        // user already had (issue #4).
        handleThemeChangeForActiveTemplate('corporate-blue')
        responseText = 'Warna website diperbarui ke tema Corporate Blue profesional. Konten Anda tetap aman.'
        changeLabel = 'Tema warna'
      } else if (lower.includes('ungu') || lower.includes('violet') || lower.includes('retail')) {
        handleThemeChangeForActiveTemplate('bold-violet')
        responseText = 'Warna website diperbarui ke tema Bold Violet. Konten Anda tetap aman.'
        changeLabel = 'Tema warna'
      }
      // 2. Check headline revision — content is tailored per active template
      // instead of a hardcoded F&B headline (issue #6).
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
        changeLabel = 'Headline / hero'
      }
      // 3. Check menu/product addition — dedicated append action (TSK-05B),
      // not a full replace, tailored per active template (issue #6).
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
        changeLabel = 'Menu ditambahkan (+1)'
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
        changeLabel = 'Kontak'
      }
    } else {
      // General path (US-05/US-07): try the real backend/LLM route first
      // (TSK-01B/02B — retry-once + fallback happens server-side), then fall
      // back to deterministic template detection so the demo never stalls
      // when no GEMINI_API_KEY is configured (see server/index.js).
      const detected = determineTemplate(text)
      // Only a *confident* category keyword match counts as "this looks
      // like a different business" — determineTemplate's own Services
      // fallback (when nothing matched at all) would otherwise make an
      // ordinary revision like "tambahkan menu baru" falsely look like a
      // category switch just because it doesn't mention F&B/retail words.
      const categorySignal = detectCategorySignal(text)
      const categoryMismatch = categorySignal !== null && categorySignal !== activeTemplate

      // A *real* draft already exists but the detected category differs
      // from the one currently active — don't silently overwrite whatever
      // the user is working on (see #4/#14). Ask first instead of
      // auto-switching. Gated on isRealDraft (not just "websiteData
      // exists") so the very first message never triggers a pointless
      // confirmation.
      if (categoryMismatch && isRealDraft(websiteData)) {
        setPendingTemplateSwitch({ pendingTemplateId: detected, pendingText: text })
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
        return
      }

      // Otherwise: no real draft yet (first message, or only a template was
      // picked without a real description) → generate; same category on an
      // existing real draft → revise.
      const isNewBusinessDescription = !isRealDraft(websiteData) || categoryMismatch
      await runAiFlow(text, { isNewBusinessDescription, detectedTemplateId: detected })
      return
    }

    const botMsgId = `bot-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        sender: 'assistant',
        text: responseText,
        source: isDeterministicAction ? 'deterministic' : 'llm',
        flowState: isDeterministicAction ? 'success' : undefined,
        changes: changeLabel ? [changeLabel] : undefined,
      },
    ])
    if (changeLabel) setLastChangeMsgId(botMsgId)
    setIsTyping(false)
  }

  // Revert the most recent AI/quick-action change (#48). MVP scope is a
  // single visible Undo slot: once used, the button disappears even if more
  // history remains underneath — re-arms on the next change.
  const handleUndo = () => {
    undo()
    setLastChangeMsgId(null)
    setMessages((prev) => [
      ...prev,
      { id: `sys-undo-${Date.now()}`, sender: 'assistant', text: '↶ Perubahan terakhir dibatalkan.' },
    ])
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
        showToast('warning', 'Gagal membuat ZIP — kode HTML disalin ke clipboard sebagai gantinya.')
      } catch (clipboardErr) {
        console.error('Fallback clipboard juga gagal:', clipboardErr)
        showToast('error', 'Gagal mengunduh website. Silakan coba lagi.')
      }
    }
  }

  // TSK-06D (Could-Have / stretch goal, US-11): one-click static publish via
  // the Vercel Deployments API (server/vercelClient.js). Stays a no-op
  // "belum dikonfigurasi" toast — not a fake success — when the backend has
  // no VERCEL_TOKEN, per the task's own Plan B ("Publish gagal -> nonaktifkan
  // tombol, fokus pada unduhan ZIP"); here "gagal" also covers "never set up".
  const handlePublish = async () => {
    if (isPublishing || !websiteData) return
    setIsPublishing(true)
    try {
      const { html, slug } = buildStandaloneHtml(websiteData, activeTemplate)
      const result = await publishWebsite(html, slug)
      if (result.ok) {
        const publishedUrl = result.data?.url
        try { await navigator.clipboard.writeText(publishedUrl) } catch { /* clipboard optional */ }
        showToast('success', `Website berhasil dipublish: ${publishedUrl} (link disalin ke clipboard)`)
        window.open(publishedUrl, '_blank', 'noopener,noreferrer')
      } else if (result.error === 'not_configured') {
        showToast('warning', 'Fitur Publish belum dikonfigurasi di server ini. Gunakan Download Website untuk saat ini.')
      } else {
        showToast('error', 'Gagal publish website. Gunakan Download Website sebagai gantinya.')
      }
    } catch (err) {
      console.error('Gagal publish website:', err)
      showToast('error', 'Gagal publish website. Gunakan Download Website sebagai gantinya.')
    } finally {
      setIsPublishing(false)
    }
  }

  const currentMeta = TEMPLATE_META[activeTemplate]
  const currentThemes = currentMeta.themes

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-900 text-slate-100 font-sans antialiased selection:bg-amber-400 selection:text-amber-950">
      {/* ============================================================
          TOP HEADER BAR (Reference: image.png)
          ============================================================ */}
      <header className="min-h-14 bg-[#0f172a] border-b border-slate-800 px-3 sm:px-4 lg:px-6 flex items-center justify-between shrink-0 z-30 gap-2">
        {/* Brand Left */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span className="text-amber-400 text-lg leading-none select-none">✦</span>
          <span className="font-extrabold text-white text-sm sm:text-base tracking-tight whitespace-nowrap">
            UMKM<span className="hidden sm:inline"> Builder</span>
          </span>
        </div>

        {/* Center / Right Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4 min-w-0">
          {/* Active Business Badge */}
          <div className="hidden md:flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1 rounded-full text-xs">
            <span className="text-slate-400 font-semibold tracking-wider text-[11px] uppercase">
              AKTIF :
            </span>
            <span className="flex items-center gap-1.5 font-bold text-white uppercase tracking-wide">
              <span className={`w-2 h-2 rounded-full ${websiteData ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {websiteData?.meta?.businessName || 'BELUM ADA DRAFT'}
            </span>
          </div>

          {/* Template Selector Pills — label text hidden below sm so the
              pills don't force the header to wrap on narrow phones
              (~390px); emoji + title tooltip still identify each one
              (issue #32). aria-label is set explicitly to the same short
              label shown at sm+ (issue #24 cross-device smoke test found
              that without it, the accessible name silently changed on
              mobile to the `title` fallback text instead — inconsistent
              between viewports for screen readers, and for anything
              locating this button by name). */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 shrink-0">
            {Object.values(TEMPLATE_META).map((t) => {
              const isActive = activeTemplate === t.id
              const [emoji, ...rest] = t.label.split(' ')
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  className={[
                    'px-2 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5',
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50',
                  ].join(' ')}
                  title={t.name}
                  aria-label={rest.join(' ') || t.name}
                >
                  <span aria-hidden="true">{emoji}</span>
                  {rest.length > 0 && <span className="hidden sm:inline" aria-hidden="true">{rest.join(' ')}</span>}
                </button>
              )
            })}
          </div>

          {/* Publish Button (TSK-06D — stretch goal / US-11). Always enabled
              client-side — a missing VERCEL_TOKEN is a server-side
              `not_configured` response (handlePublish), not a disabled
              button, since the frontend never knows the token is set.
              aria-label kept as the short visible label so the accessible
              name doesn't silently change on mobile once the text span
              hides (issue #24 cross-device smoke test). */}
          <button
            onClick={handlePublish}
            disabled={isPublishing || !websiteData}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-800 border border-slate-700 text-white text-xs font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all shrink-0"
            title="Publish website ke URL publik (stretch goal)"
            aria-label="Publish"
          >
            <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">{isPublishing ? 'Publishing…' : 'Publish'}</span>
          </button>

          {/* Download Website Button */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-white text-xs font-semibold px-2.5 sm:px-3.5 py-1.5 rounded-lg transition-all shadow-xs shrink-0"
            title="Download bundle ZIP (HTML siap pakai)"
            aria-label="Download Website"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">Download Website</span>
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
        {/* ~35% chat / ~65% preview per US-01 acceptance criteria, with
            min/max guard rails so the panel stays usable at very
            narrow/wide viewports instead of a fixed px width (issue #9). */}
        <aside className="w-full md:w-[35%] md:min-w-[300px] md:max-w-[420px] bg-white border-r border-slate-200 flex flex-col shrink-0 h-[50vh] md:h-full shadow-xs overflow-hidden">
          {/* Assistant Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-mono font-semibold text-slate-400 tracking-wider">
                AI STUDIO V1.0
              </span>
              <span className="font-medium text-slate-500 truncate max-w-[140px]">
                {websiteData?.meta?.businessName || 'Belum ada draft'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>Asisten Website</span>
              </h2>
              {/* Save-state indicator (#49) — replaces the old "Aktif" badge,
                  which only ever said the project was open, not whether the
                  user's changes were actually safe. */}
              <span
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                  saveStatus === 'saved'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : saveStatus === 'error'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full',
                    saveStatus === 'saved' ? 'bg-emerald-500' : saveStatus === 'error' ? 'bg-rose-500' : 'bg-slate-400',
                  ].join(' ')}
                />
                {saveStatus === 'saved' ? 'Tersimpan' : saveStatus === 'error' ? 'Gagal menyimpan' : 'Belum ada draft'}
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
                              ) : step.status === 'error' ? (
                                <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
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
                                    : step.status === 'error'
                                    ? 'text-rose-600 font-semibold'
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

                    {/* Explicit success/offline/error status badge (#45) —
                        no more bubbles where the text says "gagal" while the
                        steps checklist shows all-green, or a green success
                        toast for a fallback that only exists because AI
                        failed. */}
                    {msg.flowState && (
                      <div
                        className={[
                          'flex items-center gap-1.5 text-[11px] font-semibold pt-2 border-t border-slate-100',
                          msg.flowState === 'success'
                            ? 'text-emerald-600'
                            : msg.flowState === 'offline'
                            ? 'text-amber-600'
                            : 'text-rose-600',
                        ].join(' ')}
                      >
                        {msg.flowState === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        {msg.flowState === 'offline' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                        {msg.flowState === 'error' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
                        <span>
                          {msg.flowState === 'success'
                            ? 'Berhasil diterapkan'
                            : msg.flowState === 'offline'
                            ? 'Mode offline — pakai fallback backend'
                            : 'Belum bisa diproses'}
                        </span>
                      </div>
                    )}

                    {/* Change summary (#47) — what specifically the AI/quick
                        action just touched, so the user isn't left comparing
                        the preview before/after by eye. */}
                    {msg.changes?.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-500">
                          {msg.changes.length} perubahan diterapkan:
                        </p>
                        <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
                          {msg.changes.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Undo (#48) — only on the message that owns the most
                        recent change, and only while there's still a
                        snapshot in history to revert to. */}
                    {msg.id === lastChangeMsgId && canUndo && (
                      <button
                        onClick={handleUndo}
                        className="flex items-center gap-1 pt-2 border-t border-slate-100 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Undo
                      </button>
                    )}

                    {/* Category-switch confirmation (#14): asks before a
                        detected-category mismatch silently overwrites the
                        draft currently in progress. */}
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

          {/* Quick Options (Pilihan Cepat) — revision shortcuts only make
              sense once a first draft exists (see GitHub issue #3). */}
          {websiteData && (
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
                  onClick={() => handleSendPrompt('Tambahkan menu baru: Pisang Goreng Keju', 'quick-action')}
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
          )}

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
          <div className="min-h-12 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-6 py-1.5 sm:py-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 shrink-0">
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
                      title={thm.label}
                      aria-label={thm.label}
                      aria-pressed={isActive}
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
                      {/* Label stays readable at every breakpoint — a color
                          swatch alone isn't enough to distinguish themes for
                          users with color vision deficiency (issue #11). A
                          short label replaces the full one on narrow screens
                          instead of disappearing entirely. */}
                      <span className="hidden sm:inline">{thm.label}</span>
                      <span className="sm:hidden">{thm.label.replace(/\s*\(.*\)$/, '')}</span>
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
                isGenerating={isTyping && !websiteData}
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

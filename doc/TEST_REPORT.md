# Test Report — AI Website Builder UMKM

Aplikasi ini membuat website untuk UMKM lewat chat: pengguna mendeskripsikan bisnisnya, AI menyusun draft, lalu pengguna merevisi, mengunduh hasilnya sebagai ZIP, atau mempublikasikannya. Dokumen ini mencatat test case yang ada, hasil eksekusi terakhir, dan issue GitHub yang diverifikasi oleh tiap test.

Pada eksekusi terakhir semua test lulus: 96 unit test dan 30 skenario end-to-end (E2E) yang dijalankan di dua device.

## Ringkasan eksekusi

| Suite | Tool | Test case | Eksekusi | Lulus | Gagal | Dilewati |
|---|---|---|---|---|---|---|
| Unit | Vitest 5.0.1 | 96 | 96 | 96 | 0 | 0 |
| E2E | Playwright 1.63.0 | 30 | 60 (30 × 2 device) | 60 | 0 | 0 |

- **Tanggal eksekusi:** 6 Oktober 2026
- **Kode yang diuji:** branch `main`, commit `a1a1286`
- **Lingkungan:** macOS (Apple Silicon), Node.js 22.23.2
- **Device E2E:** Desktop Chrome dan emulasi Pixel 5. Seluruh suite dijalankan di keduanya ([#24]).
- **Layanan eksternal:** di E2E, panggilan ke AI (Gemini) dan ke Vercel di-mock, yaitu dijawab dengan respons tiruan tanpa memanggil layanan aslinya, supaya hasil test konsisten dan tidak menghabiskan kuota.

Kode FR-xx, NFR-xx, dan US-xx di dokumen ini mengacu pada dokumen requirement project (functional requirement, non-functional requirement, dan user story).

## Cara menjalankan ulang

```bash
npm test                  # unit test
npm run test:e2e          # E2E; menulis laporan HTML ke playwright-report/
npm run test:e2e:report   # membuka laporan HTML dari eksekusi terakhir
```

E2E membutuhkan browser Playwright (`npx playwright install chromium`) pada pemakaian pertama. Laporan HTML berisi langkah tiap test, plus trace dan screenshot untuk test yang gagal. Folder `playwright-report/` tidak di-commit, jadi dokumen inilah catatan hasil yang tersimpan di repo. Perbarui tanggal, commit, dan tabel hasil setiap kali suite dijalankan ulang untuk rilis.

## Test case acceptance (wajib lulus)

Empat test case ini adalah syarat kelulusan demo.

| ID | Langkah | Hasil yang diharapkan | Desktop | Mobile | Spec |
|---|---|---|---|---|---|
| TC-01 First Draft Generation | Kirim deskripsi bisnis lewat chat: "Warung Kopi Sejahtera, jual kopi tubruk dan roti bakar di Surabaya, target anak muda nugas, wa 08123456789" | Preview me-render template F&B secara otomatis dengan copy bahasa Indonesia santai, 3 menu, dan tombol WA aktif | Lulus | Lulus | [tc01-first-draft.spec.js](../tests/e2e/tc01-first-draft.spec.js) |
| TC-02 Color & Tone Revision | Minta revisi: "Ganti nuansa warna jadi cokelat tua klasik" | Tema warna berubah; teks dan link nomor WhatsApp tetap utuh | Lulus | Lulus | [tc02-color-revision.spec.js](../tests/e2e/tc02-color-revision.spec.js) |
| TC-03 Content Addition | Minta revisi: "Tambahkan menu baru: Pisang Goreng Keju harga 15 ribu" | Daftar menu bertambah 1 item di preview tanpa reload halaman | Lulus | Lulus | [tc03-content-addition.spec.js](../tests/e2e/tc03-content-addition.spec.js) |
| TC-04 Export HTML | Klik "Download Website", lalu buka file `.html` di browser lokal | Tampilan identik dengan preview, tata letak responsif, link WA mengarah ke `https://wa.me/628123456789` | Lulus | Lulus | [tc04-export.spec.js](../tests/e2e/tc04-export.spec.js) |

Test otomatis tidak memeriksa semua hal yang tertulis di test case:

- **TC-01:** yang diperiksa adalah template F&B aktif, jumlah menu tepat 3, dan link `wa.me/628123456789` aktif. Gaya bahasa copy tidak diperiksa karena respons AI di-mock.
- **TC-02 dan TC-03:** revisi dipicu lewat tombol aksi cepat di panel chat ("Cokelat Klasik" dan "Menu Baru"), bukan dengan mengetik kalimatnya. Sejak perbaikan [#4], kalimat yang diketik selalu dikirim ke AI. Jalur itu diuji terpisah di skenario yang terkait [#6] pada tabel berikutnya.
- **TC-04:** yang diperiksa adalah isi file hasil export, yaitu nama bisnis ada, link `wa.me` benar, dan file tidak bergantung pada server lokal. Kesamaan tampilan dengan preview dan responsivitas file export tidak dibandingkan secara otomatis.

## Skenario E2E lainnya

| Area | Skenario | Issue | Desktop | Mobile | Spec |
|---|---|---|---|---|---|
| Workspace (FR-01, US-01) | Panel chat dan panel preview tampil bersamaan | – | Lulus | Lulus | [workspace-fr.spec.js](../tests/e2e/workspace-fr.spec.js) |
| Workspace (FR-01, US-02) | Toggle Desktop/Mobile mengubah lebar preview | – | Lulus | Lulus | [workspace-fr.spec.js](../tests/e2e/workspace-fr.spec.js) |
| Workspace (NFR-02) | Workspace tetap bisa dipakai di lebar 375 px | – | Lulus | Lulus | [workspace-fr.spec.js](../tests/e2e/workspace-fr.spec.js) |
| Workspace (NFR-02) | Workspace tetap bisa dipakai di lebar 1440 px | – | Lulus | Lulus | [workspace-fr.spec.js](../tests/e2e/workspace-fr.spec.js) |
| Workspace | Badge status simpan menunjukkan belum ada draft sebelum generate, dan "Tersimpan" sesudahnya | [#49] | Lulus | Lulus | [ux-hardening.spec.js](../tests/e2e/ux-hardening.spec.js) |
| Workspace | Link navbar di preview men-scroll ke section tujuan dan tidak mengosongkan preview | – | Lulus | Lulus | [preview-nav-scroll.spec.js](../tests/e2e/preview-nav-scroll.spec.js) |
| Onboarding (FR-02) | Pesan pembuka muncul otomatis pada kunjungan pertama | – | Lulus | Lulus | [fr02-onboarding.spec.js](../tests/e2e/fr02-onboarding.spec.js) |
| Onboarding (FR-02) | Input kosong tidak bisa dikirim | – | Lulus | Lulus | [fr02-onboarding.spec.js](../tests/e2e/fr02-onboarding.spec.js) |
| Onboarding (FR-02, US-10) | Tombol contoh prompt siap klik tersedia | – | Lulus | Lulus | [fr02-onboarding.spec.js](../tests/e2e/fr02-onboarding.spec.js) |
| Onboarding (FR-02) | Indikator 4 fase berjalan berurutan (pending → in-progress → done) dan tidak ditandai selesai sebelum waktunya | [#12], [#16] | Lulus | Lulus | [fr02-onboarding.spec.js](../tests/e2e/fr02-onboarding.spec.js) |
| Generasi AI (FR-03, NFR-04) | Kegagalan AI tidak membuat aplikasi crash; preview terisi data cadangan | – | Lulus | Lulus | [ai-fallback.spec.js](../tests/e2e/ai-fallback.spec.js) |
| Generasi AI (FR-03) | Data cadangan dari backend dipakai, dan template pilihannya menang atas deteksi lokal | [#15] | Lulus | Lulus | [backend-fallback.spec.js](../tests/e2e/backend-fallback.spec.js) |
| Generasi AI (FR-03) | Generate yang gagal lalu memakai data cadangan tampil sebagai status "offline" dengan toast peringatan, bukan sukses hijau | [#45], [#46] | Lulus | Lulus | [ux-hardening.spec.js](../tests/e2e/ux-hardening.spec.js) |
| Generasi AI | Nomor WA tidak valid pada draft baru diberi peringatan di chat | [#26] | Lulus | Lulus | [wa-validation-feedback.spec.js](../tests/e2e/wa-validation-feedback.spec.js) |
| Generasi AI | Nomor WA valid tidak memicu peringatan | [#26] | Lulus | Lulus | [wa-validation-feedback.spec.js](../tests/e2e/wa-validation-feedback.spec.js) |
| Revisi (FR-05) | Revisi berupa teks bebas benar-benar dikirim ke `/api/revise`, dan hasilnya diterapkan ke preview | [#6] | Lulus | Lulus | [fr-revise-api-path.spec.js](../tests/e2e/fr-revise-api-path.spec.js) |
| Revisi (FR-05) | Revisi teks bebas yang gagal tidak mengubah konten, dan chat menyatakan gagal | – | Lulus | Lulus | [revise-failure-fallback.spec.js](../tests/e2e/revise-failure-fallback.spec.js) |
| Revisi (FR-05) | Revisi yang gagal tanpa data cadangan tampil sebagai status error, bukan sukses palsu | [#45] | Lulus | Lulus | [ux-hardening.spec.js](../tests/e2e/ux-hardening.spec.js) |
| Revisi (FR-05) | Perubahan lewat tombol aksi cepat menampilkan ringkasan perubahan, dan Undo mengembalikannya | [#47], [#48] | Lulus | Lulus | [ux-hardening.spec.js](../tests/e2e/ux-hardening.spec.js) |
| Revisi (FR-05) | Mengedit kartu menu memperbarui preview di tempat | [#52] | Lulus | Lulus | [menu-crud.spec.js](../tests/e2e/menu-crud.spec.js) |
| Revisi (FR-05) | Menghapus item menu berhasil, tetapi diblokir pada batas minimum 3 item | [#52] | Lulus | Lulus | [menu-crud.spec.js](../tests/e2e/menu-crud.spec.js) |
| Export (FR-06) | ZIP berisi `sitemap.xml`, `robots.txt`, dan README dengan catatan HTTPS, SEO, dan tracking | [#23], [#30], [#31] | Lulus | Lulus | [tc04-export.spec.js](../tests/e2e/tc04-export.spec.js) |
| Publish (FR-07, US-11) | Tombol Publish nonaktif sampai ada draft | – | Lulus | Lulus | [publish.spec.js](../tests/e2e/publish.spec.js) |
| Publish (FR-07, US-11) | Backend yang belum dikonfigurasi menampilkan peringatan "belum dikonfigurasi", bukan sukses palsu | – | Lulus | Lulus | [publish.spec.js](../tests/e2e/publish.spec.js) |
| Publish (FR-07, US-11) | Publish yang berhasil menampilkan URL live dan membukanya di tab baru | – | Lulus | Lulus | [publish.spec.js](../tests/e2e/publish.spec.js) |
| Publish (FR-07, US-11) | Publish yang gagal menampilkan toast error | – | Lulus | Lulus | [publish.spec.js](../tests/e2e/publish.spec.js) |

## Unit test

| File | Yang diuji | Jumlah | Hasil | Requirement / issue |
|---|---|---|---|---|
| [contrast.test.js](../tests/unit/contrast.test.js) | Rasio kontras dan pemilihan warna teks yang memenuhi WCAG AA | 6 | 6 lulus | [#22] |
| [exportWebsite.test.js](../tests/unit/exportWebsite.test.js) | HTML hasil export: tombol WhatsApp, sanitasi warna tema, link, Open Graph dan favicon, schema LocalBusiness, tracking klik | 14 | 14 lulus | FR-06, [#18], [#21], [#29], [#30], [#31] |
| [geminiClient.test.js](../tests/unit/geminiClient.test.js) | Retry 1 kali dan penanganan gagal saat memanggil Gemini: JSON rusak, skema tidak valid, HTTP 429, error jaringan | 8 | 8 lulus | FR-03, NFR-04 |
| [openapi.test.js](../tests/unit/openapi.test.js) | Dokumentasi API hanya aktif jika `ENABLE_API_DOCS=true` | 3 | 3 lulus | [#25] |
| [prompts.test.js](../tests/unit/prompts.test.js) | Penyusunan prompt, pemotongan riwayat chat (3 giliran) dan panjang input (1000 karakter) | 9 | 9 lulus | NFR-05 |
| [routes.test.js](../tests/unit/routes.test.js) | Header keamanan dan batas ukuran body di `/api/generate` dan `/api/revise`; bentuk respons `/api/publish` | 7 | 7 lulus | [#25], FR-07 |
| [schema.test.js](../tests/unit/schema.test.js) | Validasi skema data website dan pemilihan data cadangan per kategori | 15 | 15 lulus | FR-03 |
| [security.test.js](../tests/unit/security.test.js) | Allowlist origin (CORS), header keamanan, rate limit, batas ukuran body | 13 | 13 lulus | [#8], [#20], [#25] |
| [templateSelector.test.js](../tests/unit/templateSelector.test.js) | Deteksi kategori bisnis ke template; normalisasi dan validasi nomor WA; pembuatan link `wa.me` | 12 | 12 lulus | FR-04, US-06, US-07 |
| [vercelClient.test.js](../tests/unit/vercelClient.test.js) | Client deploy ke Vercel: URL hasil, header otorisasi, team ID, penanganan error | 6 | 6 lulus | FR-07 |
| [websiteController.test.js](../tests/unit/websiteController.test.js) | Callback progres pada generate dan revise | 3 | 3 lulus | [#13] |
| **Total** | | **96** | **96 lulus** | |

## Issue terkait dan verifikasi perbaikan

Project ini punya 39 issue di [GitHub Issues](https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues): 35 sudah ditutup dan 4 masih terbuka. Tabel berikut memuat 24 issue yang perbaikannya dikunci oleh test, sehingga bug yang sama akan terdeteksi jika muncul lagi.

| Issue | Jenis | Ringkasan | Status | Dikunci oleh |
|---|---|---|---|---|
| [#4] | bug | Revisi warna lewat chat menghapus seluruh konten website | Closed | E2E TC-02, TC-03 |
| [#6] | – | TC-02 dan TC-03 tidak pernah menguji jalur `/api/revise` | Closed | E2E `fr-revise-api-path` |
| [#8] | enhancement | Tidak ada rate limiting di API | Closed | Unit `security` |
| [#12] | enhancement | Indikator langkah onboarding tidak pernah terisi | Closed | E2E `fr02-onboarding` |
| [#13] | enhancement | Belum ada callback progres untuk 4 fase onboarding | Closed | Unit `websiteController` |
| [#15] | enhancement | Data cadangan dari `/api/generate` belum dipakai frontend | Closed | E2E `backend-fallback` |
| [#16] | – | Belum ada E2E untuk urutan 4 fase indikator onboarding | Closed | E2E `fr02-onboarding` |
| [#18] | bug | Link WA di hasil export tanpa validasi dan escape (celah XSS) | Closed | Unit `exportWebsite` |
| [#20] | enhancement | Tidak ada pengecekan CORS/origin di API | Closed | Unit `security` |
| [#21] | – | Link rusak atau placeholder di hasil export | Closed | Unit `exportWebsite` |
| [#22] | accessibility | Kontras warna teks (WCAG AA) di hasil export belum diaudit | Closed | Unit `contrast` |
| [#23] | – | README hasil export belum menginstruksikan HTTPS | Closed | E2E `tc04-export` |
| [#24] | – | Jalankan cross-device test sebelum demo | Closed | Seluruh E2E berjalan di 2 device |
| [#25] | enhancement | Hardening API: batas ukuran body, header keamanan, proteksi dokumentasi API | Closed | Unit `security`, `routes`, `openapi` |
| [#26] | enhancement | Validasi nomor WA saat draft pertama dibuat | Closed | E2E `wa-validation-feedback` |
| [#29] | enhancement | Hasil export belum punya Open Graph dan favicon | Closed | Unit `exportWebsite` |
| [#30] | enhancement | SEO hasil export: schema LocalBusiness, Maps, `sitemap.xml`, `robots.txt` | Closed | Unit `exportWebsite`, E2E `tc04-export` |
| [#31] | enhancement | Belum ada pelacakan klik tombol di hasil export | Closed | Unit `exportWebsite`, E2E `tc04-export` |
| [#45] | enhancement | Status AI (generating, sukses, error, offline) tidak terbedakan | Closed | E2E `ux-hardening` |
| [#46] | bug | Toast mode offline tampil seperti sukses padahal AI gagal | Closed | E2E `ux-hardening` |
| [#47] | enhancement | Tidak ada ringkasan perubahan setelah AI mengubah website | Closed | E2E `ux-hardening` |
| [#48] | enhancement | Belum ada Undo untuk perubahan AI | Closed | E2E `ux-hardening` |
| [#49] | enhancement | Indikator "Aktif" tidak menunjukkan status simpan | Closed | E2E `ux-hardening` |
| [#52] | enhancement | Item menu belum bisa diubah dan dihapus | Closed | E2E `menu-crud` |

### Bug yang sudah ditutup tanpa regression test khusus

Lima bug berikut sudah diperbaiki dan ditutup, tetapi belum ada test yang merujuknya secara langsung.

| Issue | Ringkasan |
|---|---|
| [#3] | Halaman awal menampilkan demo F&B dan riwayat chat palsu, bukan keadaan kosong |
| [#5] | Revisi lewat chat sebagian besar hardcoded, bukan digerakkan AI |
| [#10] | Tombol WA yang tidak valid memakai `aria-disabled`, bukan elemen disabled sungguhan |
| [#32] | Header berantakan di lebar mobile 390 px |
| [#33] | Keadaan awal menampilkan spinner "Memuat website..." yang menyesatkan |

### Issue yang masih terbuka

Keempatnya permintaan peningkatan (enhancement), bukan bug, dan belum punya test.

| Issue | Ringkasan |
|---|---|
| [#28] | Belum ada pengaman supaya testimoni buatan AI tidak terlihat generik |
| [#44] | Pengguna tidak tahu kemampuan AI sebelum mencoba |
| [#50] | UI berpotensi menjanjikan kemampuan AI lebih dari implementasinya |
| [#53] | Testimoni belum punya fitur tambah, ubah, dan hapus |

## Batasan pengujian

- **AI dan Vercel di-mock di E2E.** Kualitas konten buatan AI (NFR-03, bahasa Indonesia yang natural) dan waktu respons (NFR-01, draft pertama di bawah 10 detik; FR-04, render di bawah 5 detik) tidak diverifikasi oleh suite ini. Deploy sungguhan ke Vercel juga tidak diuji.
- **Hanya engine Chromium.** Desktop Chrome dan emulasi Pixel 5 sama-sama memakai Chromium. Firefox dan Safari belum diuji.
- **Hanya pengujian otomatis.** Pengujian manual tidak dicatat di dokumen ini.
- **Dijalankan manual di mesin lokal.** Belum ada CI yang menjalankan suite secara otomatis pada setiap perubahan.

[#3]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/3
[#4]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/4
[#5]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/5
[#6]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/6
[#8]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/8
[#10]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/10
[#12]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/12
[#13]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/13
[#15]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/15
[#16]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/16
[#18]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/18
[#20]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/20
[#21]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/21
[#22]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/22
[#23]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/23
[#24]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/24
[#25]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/25
[#26]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/26
[#28]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/28
[#29]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/29
[#30]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/30
[#31]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/31
[#32]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/32
[#33]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/33
[#44]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/44
[#45]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/45
[#46]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/46
[#47]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/47
[#48]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/48
[#49]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/49
[#50]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/50
[#52]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/52
[#53]: https://github.com/aerizaaminanto/AIWebBuilderUMKM/issues/53

# Private NotebookLM Enterprise — Cloud Edition

Aplikasi tanya-jawab dokumen internal perusahaan. Terhubung ke satu Google Shared Drive, mengindeks seluruh dokumen, dan menjawab pertanyaan dengan sitasi.

## Biaya: Rp 0

| Layanan | Paket | Biaya |
|---|---|---|
| Supabase | Free (500 MB database) | Rp 0 |
| Vercel | Hobby (personal use) | Rp 0 |
| Gemini API | Free Tier (15 RPM) | Rp 0 |
| Google Cloud (OAuth + Drive API) | Gratis | Rp 0 |

## Setup (30 menit)

### 1. Supabase
1. Buka [supabase.com](https://supabase.com), buat project baru.
2. Buka SQL Editor, tempel isi `src/db/schema.sql`, jalankan.
3. Tempel juga isi `src/db/functions.sql`, jalankan.
4. Buka Authentication → Providers → Google, aktifkan, dan isi Google OAuth Client ID + Secret.
5. Catat: Project URL, anon key, dan service role key dari Settings → API.

### 2. Google Cloud
1. Buka [console.cloud.google.com](https://console.cloud.google.com), buat project.
2. Aktifkan Google Drive API.
3. Buat **OAuth Client ID** (Web application) untuk login pengguna:
   - Redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback`
   - Masukkan Client ID + Secret ke Supabase Auth (langkah 1.4).
4. Buat **Service Account** untuk mengakses Shared Drive:
   - Buka IAM → Service Accounts → Create.
   - Buat key JSON.
   - Di Google Drive, tambahkan email service account sebagai anggota Shared Drive (Viewer).
5. Catat: Service Account JSON dan Shared Drive ID.

### 3. Gemini API
1. Buka [aistudio.google.com](https://aistudio.google.com), klik Get API Key.
2. Catat API key.

### 4. Deploy ke Vercel
1. Push project ini ke GitHub.
2. Buka [vercel.com](https://vercel.com), import repository.
3. Isi environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_SHARED_DRIVE_ID=0Axxxxxxxxx
GEMINI_API_KEY=AIza...
ADMIN_EMAILS=nova@mazuta.co.id
NEXT_PUBLIC_APP_NAME=Arsip Aftersales
```

4. Deploy. Selesai.

### 5. Penggunaan pertama
1. Buka aplikasi, login dengan Google.
2. Buka menu **Sumber**, klik **Scan & Indeks Penuh**.
3. Tunggu pemindaian selesai (pantau di menu **Pemantauan**).
4. Kembali ke halaman utama, mulai bertanya.

## Format dokumen yang didukung
PDF, DOCX, XLSX, PPTX, CSV, TXT, Google Docs, Google Sheets, Google Slides.

## Arsitektur
```
Browser → Vercel (Next.js) → Supabase (PostgreSQL + pgvector)
                            → Gemini API (embedding + jawaban)
                            → Google Drive API (dokumen)
```
Tidak ada server yang perlu dikelola. Tidak ada Docker. Tidak ada VPS.

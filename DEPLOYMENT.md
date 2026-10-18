# Deploy Pembaruan LitePOS Demo

> Pembaruan fungsional 18 Oktober 2026 menambahkan kolom snapshot poin transaksi. Baca [catatan pembaruan LitePOS](LITEPOS_UPDATE_2026-10-18.md) sebelum menerbitkan backend baru. Konfigurasi `.env`, password, keystore, dan tujuan layanan LitePOS tetap memakai yang sudah ada.

Panduan ini ditulis untuk susunan layanan yang sedang dipakai:

- database: TiDB Cloud;
- backend API: Vercel, project `litepos-demo-api`, root directory `pos-be`;
- website: Cloudflare Pages, project `litepos-demo`, root directory `pos-fe`;
- Android: APK dibagikan sendiri melalui Google Drive.

Tidak ada secret yang boleh dimasukkan ke GitHub. Semua perintah Git di bawah dijalankan dari Git Bash pada folder `D:/LitePos-Demo`.

## 1. Perbarui struktur database

Pembaruan Super Admin menambahkan tiga tabel baru dan tidak menghapus tabel/data usaha. Pastikan `pos-be/.env` lokal masih berisi `DATABASE_URL` TiDB yang benar, lalu jalankan:

```bash
cd /d/LitePos-Demo/pos-be
npx.cmd prisma db push
```

Hasil yang benar berisi pesan `Your database is now in sync with your Prisma schema`.

Jangan lanjutkan jika Prisma menampilkan peringatan kehilangan data. Tutup perintah tersebut dan periksa kembali URL database. SQL migrasi tambahannya juga tersedia di `pos-be/prisma/migrations/202610140001_add_platform_admin/migration.sql` untuk audit atau penerapan manual.

## 2. Siapkan environment Super Admin di Vercel

Buka Vercel > project `litepos-demo-api` > **Settings** > **Environment Variables**. Tambahkan untuk Production dan Preview:

| Nama | Isi |
|---|---|
| `PLATFORM_ADMIN_NAME` | Nama pengelola, misalnya `Abraham` |
| `PLATFORM_ADMIN_EMAIL` | Email khusus login Super Admin |
| `PLATFORM_ADMIN_PASSWORD` | Password kuat minimal 12 karakter |
| `PLATFORM_ADMIN_JWT_SECRET` | Secret acak panjang, berbeda dari password |

Secret JWT dapat dibuat di komputer sendiri:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Salin hasilnya ke Vercel. Jangan menaruh hasil tersebut di file repo, screenshot, chat publik, atau commit Git.

Variabel lama berikut harus tetap ada: `DATABASE_URL`, `JWT_SECRET`, `LICENSE_CODE_SECRET`, dan `CORS_ORIGINS`.

Akun Super Admin pertama dibuat ketika email dan password di atas dipakai login untuk pertama kali. Setelah login pertama berhasil, `PLATFORM_ADMIN_PASSWORD` dan `PLATFORM_ADMIN_EMAIL` boleh dihapus dari Vercel karena hash akun sudah tersimpan di database. Jangan menghapus `PLATFORM_ADMIN_JWT_SECRET`.

## 3. Periksa environment Cloudflare Pages

Buka Cloudflare > **Workers & Pages** > project `litepos-demo` > **Settings** > **Variables and Secrets**. Gunakan:

| Nama | Isi |
|---|---|
| `API_PROXY_TARGET` | `https://litepos-demo-api.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `https://litepos-demo.pages.dev` |
| `NODE_VERSION` | `22` |
| `STATIC_EXPORT` | `true` |

Build setting Cloudflare:

- Root directory: `pos-fe`
- Build command: `npm run build`
- Build output directory: `out`

`NEXT_PUBLIC_API_URL` sengaja menunjuk website Cloudflare sendiri. Request `/api` kemudian diteruskan oleh Pages Functions ke backend Vercel melalui `API_PROXY_TARGET`.

## 4. Commit seluruh pembaruan hari ini

Kembali ke root project:

```bash
cd /d/LitePos-Demo
git status
git add -A
git diff --cached --check
git diff --cached --name-only
```

Sebelum commit, pastikan daftar file **tidak** memuat:

- `.env` selain `.env.example`;
- `keystore.properties` asli;
- file `.jks` atau release keystore;
- token, password, atau connection string;
- file APK di folder `releases` (folder ini memang diabaikan Git).

Jika aman:

```bash
git commit -m "feat: add platform admin and secure Android tenant sync"
git push demo HEAD:main
```

Remote repo demo pada workspace ini bernama `demo`, bukan `origin`. Perintah terakhir mendorong commit dari branch kerja saat ini ke branch `main` repo `abrahamyada24/litepos-demo`.

## 5. Pantau redeploy

Push ke `main` seharusnya memicu dua build otomatis.

### Vercel

1. Buka project `litepos-demo-api` > **Deployments**.
2. Tunggu status menjadi **Ready**.
3. Buka `https://litepos-demo-api.vercel.app/api/health`.
4. Hasil yang benar: `database: CONNECTED` dan `server: ONLINE`.

Jika perubahan environment dibuat setelah build berjalan, tekan **Redeploy** tanpa memakai build cache.

### Cloudflare Pages

1. Buka project `litepos-demo` > **Deployments**.
2. Tunggu deployment terbaru menjadi **Success**.
3. Buka `https://litepos-demo.pages.dev/api/health`.
4. Buka `https://litepos-demo.pages.dev/super-admin/login/`.

Jika deployment tidak muncul otomatis, pilih deployment terbaru lalu **Retry deployment** setelah memastikan branch production adalah `main`.

## 6. Uji sesudah deploy

Lakukan pengujian singkat berikut:

1. Login Super Admin di `/super-admin/login/`.
2. Pastikan jumlah usaha muncul.
3. Buat satu token aktivasi percobaan dan simpan kodenya.
4. Perpanjang lisensi salah satu usaha demo langsung dari dashboard.
5. Login sebagai Owner usaha berbeda dan pastikan produk, transaksi, serta pegawai usaha lain tidak terlihat.
6. Login Android menggunakan akun yang sama dan ulangi pemeriksaan pemisahan data.
7. Buat satu transaksi dengan `clientRequestId` yang sama hanya sekali; backend akan menolak duplikasi/idempotensi transaksi.
8. Klik perpanjangan lisensi hanya sekali. Jika koneksi putus dan permintaan yang sama dikirim ulang, `Idempotency-Key` memastikan masa lisensi tidak bertambah dua kali.

## 7. Bagikan APK Android

APK release yang sudah dibangun berada di:

`D:/LitePos-Demo/releases/LitePOS-Demo-v1.4.2.apk`

SHA-256:

`8E5D3CA6ECA2167482EA6973A67E86CB54C70ED1CE1ABB2024F65F62E9C098C1`

Upload file tersebut ke Google Drive setelah backend Vercel sudah **Ready**. Atur akses Drive menjadi **Anyone with the link / Viewer**, lalu bagikan tautannya bersama panduan instalasi pada `README.md`.

Cloudflare dan Vercel tidak membangun atau menyimpan APK. Source Android ikut masuk commit, tetapi file APK tetap dibagikan melalui Google Drive.

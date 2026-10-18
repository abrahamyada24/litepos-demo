# Pembaruan LitePOS — 18 Oktober 2026

Perbaikan fungsional disesuaikan dari repository `abrahamyada24/webandroid-pos`, sampai commit `89edde0bcc364213641a78f2acd7c1562f727925`.

Nama LitePOS, logo/ikon, application ID Android `com.litepos.demo`, penyimpanan sesi, alamat backend, launcher, remote Git, dan tujuan deployment yang ada dipertahankan. File `.env`, catatan password, dan keystore tidak diubah.

## Perubahan pengguna

- Tombol Simpan Pengaturan tetap terlihat saat menggulir. Draft tidak ditimpa oleh pemuatan ulang data di latar belakang. Saat meninggalkan perubahan yang belum disimpan, pengguna dapat menyimpan, membuang perubahan, atau tetap di halaman.
- Harga produk memakai label Harga Jual, Harga Pokok (HPP), dan Rp.
- Nomor HP pelanggan divalidasi pada web, Android, dan backend. Format 08…, 62…, dan +62… dikenali sebagai nomor yang sama saat pemeriksaan duplikat; nomor tetap disimpan sebagai teks.
- Rincian pengeluaran pada laporan dan ekspor membaca nilai `amount` dari API.
- Diskon nominal/persen digunakan sebelum pajak, disimpan pada transaksi pending, dan ditampilkan pada struk. Server menolak diskon tidak valid dan membatasi potongan agar total tidak negatif.
- Transaksi member menyimpan poin didapat, poin ditukar, dan saldo setelah transaksi. Retry tidak menggandakan pemberian poin; retur membalik perubahan poin satu kali. Transaksi historis tanpa snapshot tidak diisi menggunakan aturan poin baru.
- Pendaftaran usaha dan sesi login pertamanya diproses dalam satu transaksi database. Email bertitik dan bagian `+...` dipertahankan. Pesan benturan username, timeout, konfigurasi login, dan schema database diperjelas.
- Dark mode diperbaiki untuk pengaturan, dashboard, grafik, dan kasir setelah reload. Preview/cetak struk tetap putih dengan teks hitam.

## Database sebelum backend baru dipakai

SQL tambahan berada di `pos-be/prisma/migrations/202610180001_transaction_loyalty_snapshot/migration.sql`. Migrasi menambah empat kolom pada `transactions`:

- `points_earned`, `points_redeemed`, dan `points_balance_after`: integer yang boleh NULL untuk membedakan transaksi historis tanpa snapshot.
- `loyalty_reversed`: boolean dengan nilai awal false.

Migrasi tambahan ini sudah diterapkan pada database `litepos_demo` tanggal 18 Oktober 2026 sebelum push/deployment. Tabel transaksi dicadangkan terlebih dahulu ke folder lokal `.demo-runtime/loyalty-migration-backup/` yang diabaikan Git. Jumlah transaksi tetap 9 sebelum dan sesudah migrasi; seluruh transaksi historis mempertahankan snapshot NULL dan `loyalty_reversed = false`. Riwayat migrasi Prisma yang sudah ada dipertahankan.

Untuk database LitePOS lain, periksa schema tujuan, buat cadangan, lalu terapkan migrasi tambahan tersebut satu kali sebelum menerbitkan backend baru. Jangan menjalankan ulang SQL bila kolomnya sudah ada. Riwayat migrasi database yang sebelumnya dibuat menggunakan `db push` perlu diperiksa/baseline sebelum memakai seluruh `prisma migrate deploy`.

Jangan menggunakan `migrate reset` atau `db push --accept-data-loss`. Gunakan konfigurasi koneksi yang sudah ada; pembaruan ini tidak memerlukan penggantian password atau keystore.

Setelah schema diperbarui, generate Prisma client dengan `npm run prisma:generate` pada `pos-be`. Deployment tetap mengikuti layanan LitePOS pada `DEPLOYMENT.md`. Android memerlukan build APK baru agar perbaikan native ikut terpasang.

## Git dan pemeriksaan lokal

`.gitignore` diperluas untuk `key*.txt`, variasi file `.env`, dan keystore rilis. File contoh `.env.example`, debug keystore, serta SQL migrasi tetap dapat dilacak. Aturan ini hanya mengatur file yang diikutkan Git dan tidak mengubah isi kredensial.

Jalankan pemeriksaan dari masing-masing folder:

```text
pos-be:      npm test
pos-be:      npx prisma validate
pos-fe:      npm test
pos-fe:      npm run build
pos-android: npm test -- --runInBand
pos-android: npx tsc --noEmit
```

Build frontend memakai Webpack sesuai pembaruan upstream. Gunakan `STATIC_EXPORT=true` untuk build Cloudflare Pages. Pengujian unit menggunakan fixture/mock; keberhasilannya tidak membuktikan deployment, migrasi database, pembayaran gateway, atau APK pada perangkat telah diuji.

## Hasil verifikasi penerapan lokal

- Backend: 49 tes lulus.
- Frontend: 3 tes lulus; static export berhasil untuk 26 halaman.
- Android: 5 suite / 13 tes lulus; TypeScript lulus tanpa error.
- Prisma schema valid; client berhasil digenerate. Migrasi tambahan kemudian diterapkan secara terarah pada `litepos_demo` dengan verifikasi empat definisi kolom serta jumlah transaksi yang tetap 9.
- Browser dengan fixture lokal: dark mode Pengaturan, draft tetap ada saat navigasi dibatalkan, simpan sebelum pindah menu, serta tombol Simpan setelah scroll pada lebar 390 piksel berhasil diperiksa.
- Kasir dengan fixture lokal: diskon 10% mengubah Rp100.000 menjadi Rp90.000; preview struk tetap putih dalam dark mode dan menampilkan potongan Rp10.000, poin didapat 9, serta saldo setelah transaksi 109.
- `git diff --check` lulus. Identitas aplikasi, aset logo/ikon, alamat API, namespace sesi, launcher, konfigurasi deployment, dan remote Git tetap mengikuti LitePOS lokal.

Migrasi database telah selesai sebelum publikasi source. Push ke `demo/main` memicu deployment backend Vercel `litepos-demo-api` dan frontend Cloudflare Pages `litepos-demo`. File `.env`, password, dan keystore tetap memakai yang sudah ada. APK native perlu dibangun dan dipasang secara terpisah.

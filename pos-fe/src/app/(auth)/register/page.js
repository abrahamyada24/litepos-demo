"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShoppingBag,
  UtensilsCrossed,
  UserRound,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { showAlert } from '@/utils/swal';

const Field = ({ icon: Icon, className = '', ...props }) => (
  <div className={`flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 transition focus-within:border-blue-500 ${className}`}>
    <Icon className="h-5 w-5 shrink-0 text-gray-400" />
    <input className="min-w-0 flex-1 bg-transparent font-medium text-gray-800 outline-none placeholder:text-gray-300" {...props} />
  </div>
);

export default function RegisterBusinessPage() {
  const router = useRouter();
  const registerBusiness = useStore((state) => state.registerBusiness);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'RETAIL',
    ownerName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      showAlert.error('Password berbeda', 'Konfirmasi password harus sama.');
      return;
    }

    setIsLoading(true);
    const result = await registerBusiness({
      businessName: form.businessName,
      businessType: form.businessType,
      ownerName: form.ownerName,
      email: form.email.trim().toLowerCase(),
      username: form.username.trim() || undefined,
      password: form.password,
    });
    setIsLoading(false);

    if (!result.success) {
      showAlert.error('Pendaftaran gagal', `${result.message}${result.code ? ` (${result.code})` : ''}`);
      return;
    }

    showAlert.success('Usaha siap', `${result.store?.name || form.businessName} berhasil dibuat.`);
    router.replace('/');
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-8 py-6 duration-500 lg:py-0">
      <Link href="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900">
        <ArrowLeft size={17} /> Kembali ke login
      </Link>

      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Daftarkan Usaha</h1>
        <p className="text-sm text-gray-500">Buat ruang usaha dan akun Owner dalam satu langkah.</p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <Field icon={BriefcaseBusiness} value={form.businessName} onChange={update('businessName')} placeholder="Nama usaha" maxLength={255} required />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, businessType: 'RETAIL' }))}
            className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition ${form.businessType === 'RETAIL' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
          >
            <ShoppingBag size={18} /> Retail
          </button>
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, businessType: 'FNB' }))}
            className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition ${form.businessType === 'FNB' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}
          >
            <UtensilsCrossed size={18} /> F&amp;B
          </button>
        </div>

        <Field icon={UserRound} value={form.ownerName} onChange={update('ownerName')} placeholder="Nama Owner" maxLength={255} autoComplete="name" required />
        <Field icon={Mail} type="email" value={form.email} onChange={update('email')} placeholder="Email Owner" maxLength={255} autoComplete="email" required />

        <Field icon={UserRound} value={form.username} onChange={update('username')} placeholder="Nama pengguna (opsional, dapat dibuat otomatis)" maxLength={50} autoCapitalize="none" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 py-3 transition focus-within:border-blue-500">
            <Lock className="h-5 w-5 shrink-0 text-gray-400" />
            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={update('password')} placeholder="Password min. 12" minLength={12} maxLength={72} autoComplete="new-password" className="min-w-0 flex-1 bg-transparent font-medium text-gray-800 outline-none placeholder:text-gray-300" required />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
              {showPassword ? <EyeOff size={18} className="text-gray-400" /> : <Eye size={18} className="text-gray-400" />}
            </button>
          </div>
          <Field icon={Lock} type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={update('confirmPassword')} placeholder="Ulangi password" minLength={12} maxLength={72} autoComplete="new-password" required />
        </div>

        <p className="rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
          Akun pertama menjadi Owner. Data usaha terpisah dari usaha lain dan mendapat masa trial 14 hari.
        </p>

        <button type="submit" disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 px-6 py-4 text-lg font-bold text-white shadow-xl shadow-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70">
          {isLoading ? <Loader2 className="animate-spin" /> : <>Buat Usaha <ArrowRight size={20} /></>}
        </button>
      </form>
    </div>
  );
}

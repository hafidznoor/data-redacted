import type { SemanticType } from '../redact/types'

/**
 * Header keywords, Indonesian and English together.
 *
 * Real Indonesian exports mix both freely in one sheet — `nama_customer`
 * alongside `email_address` — so there is no point separating them by locale.
 */
export const HEADER_LEXICON: Array<{ type: SemanticType; keywords: string[] }> = [
  { type: 'nik', keywords: ['nik', 'ktp', 'no_ktp', 'nomor ktp', 'nomor induk', 'national id', 'id number', 'identity'] },
  { type: 'npwp', keywords: ['npwp', 'tax id', 'nomor pajak'] },
  { type: 'card', keywords: ['card', 'kartu', 'credit card', 'kartu kredit', 'pan', 'card number', 'no_kartu'] },
  { type: 'email', keywords: ['email', 'e-mail', 'surel', 'mail'] },
  { type: 'phone', keywords: ['phone', 'telepon', 'telp', 'hp', 'no_hp', 'nohp', 'handphone', 'mobile', 'whatsapp', 'wa', 'kontak', 'contact'] },
  { type: 'name', keywords: ['name', 'nama', 'fullname', 'full name', 'nama lengkap', 'customer', 'pelanggan', 'karyawan', 'employee', 'pegawai', 'first name', 'last name', 'nama depan', 'nama belakang'] },
  { type: 'address', keywords: ['address', 'alamat', 'domisili', 'street', 'jalan', 'kota', 'city', 'kelurahan', 'kecamatan', 'postcode', 'kode pos', 'zip'] },
  { type: 'date', keywords: ['tgl_lahir', 'tanggal lahir', 'birth', 'dob', 'birthday', 'date of birth', 'lahir'] },
  { type: 'currency', keywords: ['gaji', 'salary', 'wage', 'upah', 'income', 'pendapatan', 'saldo', 'balance', 'amount', 'jumlah', 'nominal', 'harga', 'price', 'rekening', 'account number', 'no_rekening'] },
]

/** Normalise `No. HP  (Aktif)` → `no hp aktif` so matching is forgiving. */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Score a header against the lexicon.
 *
 * A whole-word match scores higher than a substring one, which keeps `nama`
 * from firing on `dinamakan` while still catching `nama_lengkap`.
 */
export function scoreHeader(header: string): { type: SemanticType; score: number } {
  const normalised = normaliseHeader(header)
  if (!normalised) return { type: 'unknown', score: 0 }

  let best: { type: SemanticType; score: number } = { type: 'unknown', score: 0 }

  for (const { type, keywords } of HEADER_LEXICON) {
    for (const keyword of keywords) {
      let score = 0
      if (normalised === keyword) score = 1
      else if (new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalised)) score = 0.85
      else if (keyword.length >= 4 && normalised.includes(keyword)) score = 0.6

      if (score > best.score) best = { type, score }
    }
  }

  return best
}

import { useCallback, useEffect, useState } from 'react'

export type Tema = 'terang' | 'gelap'

const KUNCI_SIMPANAN = 'fes-admin-tema'

function temaTersimpan(): Tema | null {
  const nilai = localStorage.getItem(KUNCI_SIMPANAN)
  return nilai === 'terang' || nilai === 'gelap' ? nilai : null
}

function temaSistem(): Tema {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'gelap' : 'terang'
}

/**
 * Tema tampilan panel.
 *
 * Selama super admin belum pernah memilih, panel mengikuti preferensi sistem
 * operasi (tanpa atribut `data-theme`, sehingga media query di `index.css`
 * yang berlaku). Begitu tombol ditekan, pilihan itu disimpan dan di-stamp ke
 * elemen `<html>` supaya menang atas preferensi sistem — dua arah.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>(() => temaTersimpan() ?? temaSistem())
  const [ikutSistem, setIkutSistem] = useState(() => temaTersimpan() === null)

  useEffect(() => {
    if (ikutSistem) {
      document.documentElement.removeAttribute('data-theme')
      return
    }
    document.documentElement.setAttribute('data-theme', tema === 'gelap' ? 'dark' : 'light')
  }, [tema, ikutSistem])

  // Selama masih mengikuti sistem, ikuti juga perubahannya secara langsung.
  useEffect(() => {
    if (!ikutSistem) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const saatBerubah = () => setTema(media.matches ? 'gelap' : 'terang')
    media.addEventListener('change', saatBerubah)
    return () => media.removeEventListener('change', saatBerubah)
  }, [ikutSistem])

  const gantiTema = useCallback(() => {
    setTema((sebelumnya) => {
      const berikutnya: Tema = sebelumnya === 'gelap' ? 'terang' : 'gelap'
      localStorage.setItem(KUNCI_SIMPANAN, berikutnya)
      return berikutnya
    })
    setIkutSistem(false)
  }, [])

  return { tema, gantiTema }
}

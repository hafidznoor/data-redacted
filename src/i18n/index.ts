import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import id from './id.json'

/**
 * Translations are bundled, not fetched.
 *
 * i18next's http backend would put a network request in the critical path of an
 * app whose entire premise is that it makes none. Two small JSON files cost
 * less than the request would anyway.
 */
export const LANGUAGES = { en: 'English', id: 'Bahasa Indonesia' } as const
export type Language = keyof typeof LANGUAGES

const STORAGE_KEY = 'data-redacted:lang'

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'id') return saved
  } catch {
    // Private windows and blocked site data throw here. The default is fine.
  }
  return navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: Language) {
  void i18n.changeLanguage(lang)
  try {
    // Interface preference only. No file content is ever persisted.
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Not being able to remember the choice is not worth surfacing.
  }
}

export default i18n

// Tiny translation layer. t('nav.home', 'Home') returns the Czech text when the language is 'cs' and a translation exists,
// otherwise the English fallback (so an untranslated string is never blank and never shows a key).
// Only the app shell is translated (navigation, top bar, buttons, Home, Settings, Help, challenge names, Flight data card titles,
// Academy tab names, common messages). Lessons, glossary entries, AI replies and physics reports stay in English.
import { CS } from '../../data/i18n-cs.js';

export const LANGS = [['en', 'English'], ['cs', 'Čeština']];
const DICTS = { en: {}, cs: CS };
let lang = 'en';
export function setLang(l) { lang = DICTS[l] ? l : 'en'; try { if (typeof document !== 'undefined') document.documentElement.lang = lang; } catch { /* no DOM */ } }
export const getLang = () => lang;
/** Translate. `fallback` (the English text) is returned when there is no translation. {name} placeholders are filled from `vars`. */
export function t(key, fallback, vars) {
  let s = DICTS[lang]?.[key] ?? fallback ?? key;
  if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
/** Has the current language a translation for this key? (used by tests) */
export const hasTranslation = (key, l = lang) => !!DICTS[l]?.[key];

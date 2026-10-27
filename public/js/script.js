(() => {
  'use strict'

  const themeToggle = document.querySelector('[data-theme-toggle]')
  // Website language selector (22 languages listed in India's Eighth Schedule).
  const languageSelect = document.getElementById('wanderlust-language')
  const languageKey = 'wanderlust-language'
  const supportedLanguageCodes = 'as,bn,doi,en,gu,hi,kn,ks,kok,mai,ml,mni,mr,ne,or,pa,sa,sat,sd,ta,te,ur'

  window.googleTranslateElementInit = () => {
    if (!window.google?.translate?.TranslateElement) return
    new window.google.translate.TranslateElement({
      pageLanguage: 'en',
      includedLanguages: supportedLanguageCodes,
      autoDisplay: false
    }, 'google_translate_element')
    const savedLanguage = (() => {
      try { return localStorage.getItem(languageKey) || '' } catch (_) { return '' }
    })()
    if (languageSelect && savedLanguage) {
      languageSelect.value = savedLanguage
      applyWebsiteLanguage(savedLanguage)
    }
  }

  function applyWebsiteLanguage(language) {
    const combo = document.querySelector('.goog-te-combo')
    if (!combo || !language) return
    combo.value = language
    combo.dispatchEvent(new Event('change', { bubbles: true }))
  }

  languageSelect?.addEventListener('change', () => {
    const language = languageSelect.value
    try {
      if (language) localStorage.setItem(languageKey, language)
      else localStorage.removeItem(languageKey)
    } catch (_) {}
    if (language) applyWebsiteLanguage(language)
    else window.location.reload()
  })

  const getTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const updateThemeControl = () => {
    if (!themeToggle) return
    const dark = getTheme() === 'dark'
    themeToggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`)
    themeToggle.title = `Switch to ${dark ? 'light' : 'dark'} mode`
    themeToggle.querySelector('i').className = `fa-solid ${dark ? 'fa-sun' : 'fa-moon'}`
    const label = themeToggle.querySelector('.theme-toggle-label')
    if (label) label.textContent = dark ? 'Light' : 'Dark'
  }

  updateThemeControl()
  themeToggle?.addEventListener('click', () => {
    const nextTheme = getTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    try { localStorage.setItem('wanderlust-theme', nextTheme) } catch (_) {}
    updateThemeControl()
  })

  // Keep a small, private-to-this-browser collection of stays the visitor likes.
  const favoriteKey = 'wanderlust-saved-stays'
  let savedStays = new Set()
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteKey) || '[]')
    if (Array.isArray(stored)) savedStays = new Set(stored.map(String))
  } catch (_) {}

  const favoriteButtons = [...document.querySelectorAll('[data-favorite-id]')]
  const favoriteFilter = document.querySelector('[data-favorites-filter]')
  const favoriteCount = document.querySelector('[data-favorites-count]')
  const status = document.getElementById('site-status')
  let showingSavedOnly = false
  try { showingSavedOnly = sessionStorage.getItem('wanderlust-show-saved') === 'true' } catch (_) {}

  const renderSavedStays = () => {
    favoriteButtons.forEach(button => {
      const isSaved = savedStays.has(button.dataset.favoriteId)
      button.setAttribute('aria-pressed', String(isSaved))
      button.setAttribute('aria-label', `${isSaved ? 'Remove' : 'Save'} ${button.closest('.listing-card')?.querySelector('.listing-title')?.textContent?.trim() || 'this stay'}`)
      button.title = isSaved ? 'Remove from saved stays' : 'Save this stay'
      const icon = button.querySelector('i')
      if (icon) icon.className = `fa-${isSaved ? 'solid' : 'regular'} fa-heart`
    })
    if (favoriteCount) favoriteCount.textContent = String(savedStays.size)
    document.querySelectorAll('.listing-link[data-listing-id]').forEach(card => {
      card.hidden = showingSavedOnly && !savedStays.has(card.dataset.listingId)
    })
    favoriteFilter?.setAttribute('aria-pressed', String(showingSavedOnly))
  }

  favoriteButtons.forEach(button => button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    const id = button.dataset.favoriteId
    if (savedStays.has(id)) {
      savedStays.delete(id)
      if (status) status.textContent = 'Stay removed from your saved list.'
    } else {
      savedStays.add(id)
      if (status) status.textContent = 'Stay saved on this device.'
    }
    try { localStorage.setItem(favoriteKey, JSON.stringify([...savedStays])) } catch (_) {}
    renderSavedStays()
  }))

  favoriteFilter?.addEventListener('click', () => {
    showingSavedOnly = !showingSavedOnly
    try { sessionStorage.setItem('wanderlust-show-saved', String(showingSavedOnly)) } catch (_) {}
    renderSavedStays()
    if (showingSavedOnly && !document.querySelector('.listing-grid')) {
      window.location.href = '/listings#stays'
      return
    }
    document.querySelector('#stays')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  renderSavedStays()

  const backToTop = document.querySelector('.back-to-top')
  const updateBackToTop = () => backToTop?.classList.toggle('is-visible', window.scrollY > 500)
  updateBackToTop()
  window.addEventListener('scroll', updateBackToTop, { passive: true })
  backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  const forms = document.querySelectorAll('.needs-validation')

  // Loop over them and prevent submission
  Array.from(forms).forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault()
        event.stopPropagation()
      }

      form.classList.add('was-validated')
    }, 
    false)
  });

  document.querySelectorAll('[data-length-hint]').forEach(input => {
    const hint = document.getElementById(input.dataset.lengthHint)
    if (!hint) return

    const updateHint = () => {
      hint.hidden = input.value.length === 0 || input.validity.valid
    }

    input.addEventListener('input', updateHint)
    updateHint()
  })
})();

import './style.css'
import { supabase } from './supabase'

window.supabase = supabase

let currentUser = null
let currentView = 'week'
let currentWeekOffset = 0
let enteredPin = ''

// Zmiany grafiku zapisane w bazie

const scheduleOverrides = {}

// Nabożeństwa zapisane w bazie

const devotions = {}

let scheduleLoaded = false
let realtimeChannel = null
// -------------------------
// KSIĘŻA
// -------------------------

const priests = {
  proboszcz: {
    name: 'Ks. Proboszcz',
    id: 'db8c7114-fd00-41f1-a32a-12752712f7e3'
  },
  dawid: {
    name: 'Ks. Dawid',
    id: 'abca558e-de88-4053-8cf9-8dcaad04d1a9'
  }
}

// -------------------------
// LOGOWANIE
// -------------------------

function renderLogin() {
  enteredPin = ''

  document.querySelector('#app').innerHTML = `
    <div class="login-screen">
      <div class="login-card">

        <div class="login-cross">✝</div>

        <h1>Parafia Płaza</h1>

        <p class="login-subtitle">
          Grafik parafialny
        </p>

        <div class="pin-dots" id="pinDots">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div class="pin-keypad">

          ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map(
              number => `
                <button
                  class="pin-button"
                  data-number="${number}"
                >
                  ${number}
                </button>
              `
            )
            .join('')}

          <div></div>

          <button
            class="pin-button"
            data-number="0"
          >
            0
          </button>

          <button
            class="pin-button pin-clear"
            id="clearPin"
          >
            ×
          </button>

        </div>

        <p class="login-hint">
          Wprowadź PIN
        </p>

      </div>
    </div>
  `

  const updateDots = () => {
    document
      .querySelectorAll('.pin-dots span')
      .forEach((dot, index) => {
        dot.classList.toggle(
          'active',
          index < enteredPin.length
        )
      })
  }

  document
    .querySelectorAll('[data-number]')
    .forEach(button => {
      button.addEventListener('click', () => {
        if (enteredPin.length >= 4) return

        enteredPin += button.dataset.number

        updateDots()

        if (enteredPin.length === 4) {
          setTimeout(() => {
            checkPin(enteredPin)
          }, 150)
        }
      })
    })

  document
    .querySelector('#clearPin')
    .addEventListener('click', () => {
      enteredPin = enteredPin.slice(0, -1)
      updateDots()
    })
}

async function checkPin(pin) {
  const hint = document.querySelector('.login-hint')

  hint.textContent = 'Sprawdzanie...'

  try {
    const { data, error } = await supabase.functions.invoke(
      'login-pin',
      {
        body: { pin }
      }
    )

    if (error) {
      console.error('Błąd logowania:', error)
      hint.textContent = 'Nie udało się połączyć z serwerem'

      setTimeout(() => {
        enteredPin = ''
        updateLoginDots()
        hint.textContent = 'Wprowadź PIN'
      }, 1500)

      return
    }

    if (!data?.success) {
      hint.textContent = data?.message || 'Nieprawidłowy PIN'

      setTimeout(() => {
        enteredPin = ''
        updateLoginDots()
        hint.textContent = 'Wprowadź PIN'
      }, 1000)

      return
    }

    // Ustawiamy prawdziwą sesję Supabase Auth
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    })

    if (sessionError) {
      console.error('Błąd sesji:', sessionError)
      hint.textContent = 'Nie udało się utworzyć sesji'

      setTimeout(() => {
        enteredPin = ''
        updateLoginDots()
        hint.textContent = 'Wprowadź PIN'
      }, 1500)

      return
    }

    // Zapamiętujemy zalogowanego księdza
   currentUser = data.priest.name

console.log('Zalogowano:', currentUser)

renderApp()

await loadSchedule()

  } catch (error) {
    console.error(error)

    hint.textContent = 'Wystąpił błąd logowania'

    setTimeout(() => {
      enteredPin = ''
      updateLoginDots()
      hint.textContent = 'Wprowadź PIN'
    }, 1500)
  }
}

function updateLoginDots() {
  document
    .querySelectorAll('.pin-dots span')
    .forEach((dot, index) => {
      dot.classList.toggle(
        'active',
        index < enteredPin.length
      )
    })
}

// -------------------------
// KALENDARZ
// -------------------------

function getMonday(date) {
  const result = new Date(date)

  const day = result.getDay()

  const difference =
    day === 0
      ? -6
      : 1 - day

  result.setDate(
    result.getDate() + difference
  )

  result.setHours(0, 0, 0, 0)

  return result
}

function getWeekDays() {
  const today = new Date()

  const monday = getMonday(today)

  monday.setDate(
    monday.getDate() +
    currentWeekOffset * 7
  )

  const days = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)

    date.setDate(
      monday.getDate() + i
    )

    days.push({
      date,
      isSunday: date.getDay() === 0
    })
  }

  return days
}

function formatDate(date) {
  return date.toLocaleDateString(
    'pl-PL',
    {
      day: 'numeric',
      month: 'long'
    }
  )
}

function formatDayName(date) {
  return date.toLocaleDateString(
    'pl-PL',
    {
      weekday: 'long'
    }
  )
}

function getWeekRangeText(days) {
  const first = days[0].date
  const last = days[6].date

  const firstText =
    first.toLocaleDateString(
      'pl-PL',
      {
        day: 'numeric',
        month: 'long'
      }
    )

  const lastText =
    last.toLocaleDateString(
      'pl-PL',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }
    )

  return `${firstText} – ${lastText}`
}

function getDateKey(date) {
  const year = date.getFullYear()

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0')

  const day = String(
    date.getDate()
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// -------------------------
// MSZE
// -------------------------

function getMasses(date) {
  const defaultMasses =
    date.getDay() === 0
      ? [
          {
            time: '07:00',
            priest: 'proboszcz'
          },
          {
            time: '09:00',
            priest: 'dawid'
          },
          {
            time: '11:00',
            priest: 'proboszcz'
          },
          {
            time: '17:00',
            priest: 'dawid'
          }
        ]
      : [
          {
            time: '06:30',
            priest: null
          },
          {
            time: '18:00',
            priest: null
          }
        ]

  return defaultMasses.map(mass => {
    const key =
      `${getDateKey(date)}_${mass.time}`

    if (
      scheduleOverrides[key] !== undefined
    ) {
      return {
        ...mass,
        priest: scheduleOverrides[key]
      }
    }

    return mass
  })
}

async function loadSchedule() {
  try {
    scheduleLoaded = false

    const days = getWeekDays()

    const firstDate = getDateKey(days[0].date)
    const lastDate = getDateKey(days[6].date)

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', firstDate)
      .lte('event_date', lastDate)

    if (error) {
      console.error('Błąd pobierania grafiku:', error)
      return
    }

    // Czyścimy lokalne dane dla aktualnego tygodnia
    Object.keys(scheduleOverrides).forEach(key => {
      delete scheduleOverrides[key]
    })

    Object.keys(devotions).forEach(key => {
      delete devotions[key]
    })

    // Wczytujemy dane z bazy
    data.forEach(event => {
      const dateKey = event.event_date

      if (event.event_type === 'mass') {
        const time = event.event_time?.slice(0, 5)

        if (!time) return

        let priest = null

        if (event.priest_id) {
          priest = event.priest_id
        }

        scheduleOverrides[`${dateKey}_${time}`] = priest
      }

      if (event.event_type === 'devotion') {
        if (!devotions[dateKey]) {
          devotions[dateKey] = []
        }

        devotions[dateKey].push({
          id: event.id,
          name: event.title,
          when: event.after_mass ? 'after' : 'time',
          time: event.event_time
            ? event.event_time.slice(0, 5)
            : '17:30',
          priest: event.priest_id || null
        })
      }
    })

    scheduleLoaded = true

    console.log('Grafik pobrany z Supabase:', data)

    renderApp()

  } catch (error) {
    console.error('Błąd ładowania grafiku:', error)
  }
}

// -------------------------
// KSIĘŻA
// -------------------------

function getPriestClass(priest) {
  if (priest === 'proboszcz') {
    return 'priest-proboszcz'
  }

  if (priest === 'dawid') {
    return 'priest-wikariusz'
  }

  return 'priest-empty'
}

function getPriestName(priest) {
  if (priest === 'proboszcz') {
    return priests.proboszcz.name
  }

  if (priest === 'dawid') {
    return priests.dawid.name
  }

  if (priest === priests.proboszcz.id) {
    return priests.proboszcz.name
  }

  if (priest === priests.dawid.id) {
    return priests.dawid.name
  }

  return 'Nieobsadzone'
}

// -------------------------
// DZISIAJ
// -------------------------

function isToday(date) {
  const today = new Date()

  return (
    date.getFullYear() ===
      today.getFullYear() &&

    date.getMonth() ===
      today.getMonth() &&

    date.getDate() ===
      today.getDate()
  )
}

// -------------------------
// APLIKACJA
// -------------------------

function renderApp() {
  const days = getWeekDays()

  document.querySelector('#app').innerHTML = `
    <div class="app-shell">

      <header class="topbar">

        <div>
          <h1>
            Parafia Płaza
          </h1>

          <p>
            ${currentUser}
          </p>
        </div>

        <button
          class="logout-button"
          id="logoutButton"
        >
          Wyloguj
        </button>

      </header>

      <main class="main-content">

        <div class="page-heading">

          <div>

            <h2>
              Grafik parafialny
            </h2>

            <div class="week-navigation">

              <button
                class="week-arrow"
                id="previousWeek"
              >
                ←
              </button>

              <button
                class="today-button"
                id="todayButton"
              >
                Dzisiaj
              </button>

              <button
                class="week-arrow"
                id="nextWeek"
              >
                →
              </button>

            </div>

          </div>

          <div class="view-switch">

            <button
              class="${
                currentView === 'week'
                  ? 'active'
                  : ''
              }"
              id="weekViewButton"
            >
              Tydzień
            </button>

            <button
              class="${
                currentView === 'month'
                  ? 'active'
                  : ''
              }"
              id="monthViewButton"
            >
              Miesiąc
            </button>

          </div>

        </div>

        ${
          currentView === 'week'
            ? renderWeek(days)
            : renderMonth()
        }

      </main>

      <nav class="bottom-nav">

        <button
          class="nav-item active"
          id="navWeek"
        >
          <span>▦</span>
          <small>Tydzień</small>
        </button>

        <button
          class="nav-item"
          id="navMonth"
        >
          <span>▦</span>
          <small>Miesiąc</small>
        </button>

        <button
          class="nav-item"
          id="navMine"
        >
          <span>♙</span>
          <small>Mój grafik</small>
        </button>

        <button
          class="nav-item"
          id="navSettings"
        >
          <span>⚙</span>
          <small>Ustawienia</small>
        </button>

      </nav>

    </div>
  `

  attachAppEvents()
}

function attachAppEvents() {

  // WYLOGOWANIE

  document
    .querySelector('#logoutButton')
    .addEventListener(
      'click',
      async () => {
        await supabase.auth.signOut()

        currentUser = null
        currentWeekOffset = 0

        renderLogin()
      }
    )

  // POPRZEDNI TYDZIEŃ

  document
    .querySelector('#previousWeek')
    .addEventListener(
      'click',
      async () => {
        currentWeekOffset--
        renderApp()
        await loadSchedule()
      }
    )

  // NASTĘPNY TYDZIEŃ

  document
    .querySelector('#nextWeek')
    .addEventListener(
      'click',
      async () => {
        currentWeekOffset++
        renderApp()
        await loadSchedule()
      }
    )

  // DZISIAJ

  document
    .querySelector('#todayButton')
    .addEventListener(
      'click',
      async () => {
        currentWeekOffset = 0
        renderApp()
        await loadSchedule()
      }
    )
    
// -------------------------
// TYDZIEŃ
// -------------------------

function renderWeek(days) {
  return `
    <div class="week-title">
      ${getWeekRangeText(days)}
    </div>

    <div class="week-grid">

      ${days
        .map(day => {
          const masses =
            getMasses(day.date)

          const dayKey =
            getDateKey(day.date)

          const dayDevotions =
            devotions[dayKey] || []

          return `
            <section
              class="
                day-card
                ${isToday(day.date) ? 'today' : ''}
              "
            >

              <div class="day-header">

                <div>

                  <div class="day-name">
                    ${formatDayName(day.date)}
                  </div>

                  <div class="day-date">
                    ${formatDate(day.date)}
                  </div>

                </div>

                ${
                  isToday(day.date)
                    ? `
                      <span class="today-badge">
                        DZIŚ
                      </span>
                    `
                    : ''
                }

              </div>

              <div class="mass-list">

                ${masses
                  .map(
                    mass => `
                      <div class="mass-row">

                        <div class="mass-time">
                          ${mass.time}
                        </div>

                        <div class="mass-info">

                          <div class="mass-name">
                            Msza święta
                          </div>

                          <div
                            class="
                              mass-priest
                              ${getPriestClass(
                                mass.priest
                              )}
                            "
                          >
                            ${getPriestName(
                              mass.priest
                            )}
                          </div>

                        </div>

                        <button
                          class="edit-mass"
                          data-date="${dayKey}"
                          data-time="${mass.time}"
                          title="Edytuj"
                        >
                          ✎
                        </button>

                      </div>
                    `
                  )
                  .join('')}

                ${
                  dayDevotions
                    .map(
                      (devotion, index) => `
                        <div
                          class="
                            mass-row
                            devotion-row
                          "
                        >

                          <div
                            class="
                              mass-time
                              devotion-time
                            "
                          >
                            ${
                              devotion.when === 'after'
                                ? 'Po Mszy Św.'
                                : devotion.time
                            }
                          </div>

                          <div class="mass-info">

                            <div class="mass-name">
                              ${devotion.name}
                            </div>

                            <div
                              class="
                                mass-priest
                                ${getPriestClass(
                                  devotion.priest
                                )}
                              "
                            >
                              ${getPriestName(
                                devotion.priest
                              )}
                            </div>

                          </div>

                          <button
                            class="delete-devotion"
                            data-date="${dayKey}"
                            data-index="${index}"
                            title="Usuń"
                          >
                            ×
                          </button>

                        </div>
                      `
                    )
                    .join('')
                }

              </div>

              <button
                class="add-devotion"
              >
                + Dodaj nabożeństwo
              </button>

            </section>
          `
        })
        .join('')}

    </div>
  `
}

// -------------------------
// MIESIĄC
// -------------------------

function renderMonth() {
  return `
    <div class="month-placeholder">

      <div class="month-icon">
        ▦
      </div>

      <h3>
        Widok miesiąca
      </h3>

      <p>
        Widok miesiąca dodamy za chwilę.
      </p>

    </div>
  `
}

// -------------------------
// EDYCJA MSZY
// -------------------------

function openMassEditor(
  dateKey,
  time
) {
  const currentValue =
    scheduleOverrides[
      `${dateKey}_${time}`
    ] ??
    getDefaultPriest(
      dateKey,
      time
    )

  const date =
    new Date(`${dateKey}T12:00:00`)

  const dateText =
    date.toLocaleDateString(
      'pl-PL',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }
    )

  const modal =
    document.createElement('div')

  modal.className =
    'modal-overlay'

  modal.innerHTML = `
    <div class="mass-modal">

      <div class="modal-header">

        <div>

          <div class="modal-title">
            Msza święta
          </div>

          <div class="modal-subtitle">
            ${dateText} · ${time}
          </div>

        </div>

        <button
          class="modal-close"
          id="closeMassModal"
        >
          ×
        </button>

      </div>

      <div class="priest-options">

        <label class="priest-option">

          <input
            type="radio"
            name="massPriest"
            value="proboszcz"
            ${
              currentValue === 'proboszcz'
                ? 'checked'
                : ''
            }
          >

          <span
            class="
              option-color
              proboszcz-color
            "
          ></span>

          <span>
            <strong>
              Ks. Proboszcz
            </strong>
          </span>

        </label>

        <label class="priest-option">

          <input
            type="radio"
            name="massPriest"
            value="dawid"
            ${
              currentValue === 'dawid'
                ? 'checked'
                : ''
            }
          >

          <span
            class="
              option-color
              wikariusz-color
            "
          ></span>

          <span>
            <strong>
              Ks. Dawid
            </strong>
          </span>

        </label>

        <label class="priest-option">

          <input
            type="radio"
            name="massPriest"
            value="none"
            ${
              currentValue === null
                ? 'checked'
                : ''
            }
          >

          <span
            class="
              option-color
              empty-color
            "
          ></span>

          <span>
            <strong>
              Nieobsadzone
            </strong>
          </span>

        </label>

      </div>

      <div class="modal-actions">

        <button
          class="modal-cancel"
          id="cancelMassModal"
        >
          Anuluj
        </button>

        <button
          class="modal-save"
          id="saveMassModal"
        >
          Zapisz
        </button>

      </div>

    </div>
  `

  document.body.appendChild(modal)

  const closeModal = () => {
    modal.remove()
  }

  document
    .querySelector('#closeMassModal')
    .addEventListener(
      'click',
      closeModal
    )

  document
    .querySelector('#cancelMassModal')
    .addEventListener(
      'click',
      closeModal
    )

 document
  .querySelector('#saveMassModal')
  .addEventListener(
    'click',
    async () => {
      const selected =
        document.querySelector(
          'input[name="massPriest"]:checked'
        )

      const key = `${dateKey}_${time}`

      const priestId =
        selected.value === 'none'
          ? null
          : priests[selected.value].id

      const defaultPriest =
        getDefaultPriest(dateKey, time)

      const defaultPriestId =
        defaultPriest
          ? priests[defaultPriest].id
          : null

      try {
        // Jeżeli wybieramy z powrotem księdza domyślnego,
        // usuwamy zmianę z bazy.
        if (priestId === defaultPriestId) {
          const { error } = await supabase
            .from('events')
            .delete()
            .eq('event_type', 'mass')
            .eq('event_date', dateKey)
            .eq('event_time', time)

          if (error) throw error

          delete scheduleOverrides[key]
        } else {
          // Zapisujemy zmianę do bazy.
          const { error } = await supabase
            .from('events')
            .upsert(
              {
                event_date: dateKey,
                event_type: 'mass',
                title: 'Msza święta',
                event_time: time,
                after_mass: false,
                priest_id: priestId
              },
              {
                onConflict: 'event_date,event_time,event_type'
              }
            )

          if (error) throw error

          scheduleOverrides[key] =
            selected.value === 'none'
              ? null
              : selected.value
        }

        closeModal()

        renderApp()

      } catch (error) {
        console.error(
          'Błąd zapisu Mszy:',
          error
        )

        alert(
          'Nie udało się zapisać zmiany. Spróbuj ponownie.'
        )
      }
    }
  )

  modal.addEventListener(
    'click',
    event => {
      if (
        event.target === modal
      ) {
        closeModal()
      }
    }
  )
}

// -------------------------
// DOMYŚLNY KSIĄDZ
// -------------------------

function getDefaultPriest(
  dateKey,
  time
) {
  const date =
    new Date(`${dateKey}T12:00:00`)

  if (date.getDay() === 0) {
    if (time === '07:00') {
      return 'proboszcz'
    }

    if (time === '09:00') {
      return 'dawid'
    }

    if (time === '11:00') {
      return 'proboszcz'
    }

    if (time === '17:00') {
      return 'dawid'
    }
  }

  return null
}

// -------------------------
// DODAWANIE NABOŻEŃSTWA
// -------------------------

function openDevotionEditor(
  dateKey
) {
  const date =
    new Date(`${dateKey}T12:00:00`)

  const dateText =
    date.toLocaleDateString(
      'pl-PL',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }
    )

  const modal =
    document.createElement('div')

  modal.className =
    'modal-overlay'

  modal.innerHTML = `
    <div class="mass-modal">

      <div class="modal-header">

        <div>

          <div class="modal-title">
            Dodaj nabożeństwo
          </div>

          <div class="modal-subtitle">
            ${dateText}
          </div>

        </div>

        <button
          class="modal-close"
          id="closeDevotionModal"
        >
          ×
        </button>

      </div>

      <div class="devotion-form">

        <label class="form-label">
          Nazwa nabożeństwa
        </label>

        <input
          type="text"
          id="devotionName"
          class="form-input"
          placeholder="np. Różaniec"
        >

        <label class="form-label">
          Kiedy?
        </label>

        <div class="time-options">

          <label class="time-option">

            <input
              type="radio"
              name="devotionWhen"
              value="time"
              checked
            >

            <span>
              O godzinie
            </span>

            <input
              type="time"
              id="devotionTime"
              value="17:30"
              class="time-input"
            >

          </label>

          <label class="time-option">

            <input
              type="radio"
              name="devotionWhen"
              value="after"
            >

            <span>
              Po Mszy Św.
            </span>

          </label>

        </div>

        <label class="form-label">
          Prowadzi
        </label>

        <div class="priest-options">

          <label class="priest-option">

            <input
              type="radio"
              name="devotionPriest"
              value="proboszcz"
            >

            <span
              class="
                option-color
                proboszcz-color
              "
            ></span>

            <strong>
              Ks. Proboszcz
            </strong>

          </label>

          <label class="priest-option">

            <input
              type="radio"
              name="devotionPriest"
              value="dawid"
              checked
            >

            <span
              class="
                option-color
                wikariusz-color
              "
            ></span>

            <strong>
              Ks. Dawid
            </strong>

          </label>

          <label class="priest-option">

            <input
              type="radio"
              name="devotionPriest"
              value="none"
            >

            <span
              class="
                option-color
                empty-color
              "
            ></span>

            <strong>
              Nieobsadzone
            </strong>

          </label>

        </div>

      </div>

      <div class="modal-actions">

        <button
          class="modal-cancel"
          id="cancelDevotionModal"
        >
          Anuluj
        </button>

        <button
          class="modal-save"
          id="saveDevotionModal"
        >
          Dodaj
        </button>

      </div>

    </div>
  `

  document.body.appendChild(modal)

  const closeModal = () => {
    modal.remove()
  }

  document
    .querySelector('#closeDevotionModal')
    .addEventListener(
      'click',
      closeModal
    )

  document
    .querySelector('#cancelDevotionModal')
    .addEventListener(
      'click',
      closeModal
    )

 document
  .querySelector('#saveDevotionModal')
  .addEventListener(
    'click',
    async () => {
      const name =
        document
          .querySelector('#devotionName')
          .value
          .trim()

      if (!name) {
        document
          .querySelector('#devotionName')
          .focus()

        return
      }

      const when =
        document.querySelector(
          'input[name="devotionWhen"]:checked'
        ).value

      const time =
        document.querySelector(
          '#devotionTime'
        ).value

      const priest =
        document.querySelector(
          'input[name="devotionPriest"]:checked'
        ).value

      const priestId =
        priest === 'none'
          ? null
          : priests[priest].id

      try {
        const { data, error } =
          await supabase
            .from('events')
            .insert({
              event_date: dateKey,
              event_type: 'devotion',
              title: name,
              event_time:
                when === 'time'
                  ? time
                  : null,
              after_mass:
                when === 'after',
              priest_id: priestId
            })
            .select()
            .single()

        if (error) {
          throw error
        }

        if (!devotions[dateKey]) {
          devotions[dateKey] = []
        }

        devotions[dateKey].push({
          id: data.id,
          name,
          when,
          time:
            when === 'time'
              ? time
              : null,
          priest:
            priest === 'none'
              ? null
              : priest
        })

        closeModal()
        renderApp()

      } catch (error) {
        console.error(
          'Błąd zapisu nabożeństwa:',
          error
        )

        alert(
          'Nie udało się zapisać nabożeństwa. Spróbuj ponownie.'
        )
      }
    }
  )

  // TYDZIEŃ

  document
    .querySelector('#weekViewButton')
    .addEventListener(
      'click',
      () => {
        currentView = 'week'
        renderApp()
      }
    )

  // MIESIĄC

  document
    .querySelector('#monthViewButton')
    .addEventListener(
      'click',
      () => {
        currentView = 'month'
        renderApp()
      }
    )

  // DOLNE MENU — TYDZIEŃ

  document
    .querySelector('#navWeek')
    .addEventListener(
      'click',
      () => {
        currentView = 'week'
        renderApp()
      }
    )

  // DOLNE MENU — MIESIĄC

  document
    .querySelector('#navMonth')
    .addEventListener(
      'click',
      () => {
        currentView = 'month'
        renderApp()
      }
    )

  // MÓJ GRAFIK

  document
    .querySelector('#navMine')
    .addEventListener(
      'click',
      () => {
        alert(
          'Widok „Mój grafik” dodamy w następnym kroku.'
        )
      }
    )

  // USTAWIENIA

  document
    .querySelector('#navSettings')
    .addEventListener(
      'click',
      () => {
        alert(
          'Ustawienia dodamy później.'
        )
      }
    )

  // EDYCJA MSZY

  document
    .querySelectorAll('.edit-mass')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          openMassEditor(
            button.dataset.date,
            button.dataset.time
          )
        }
      )
    })

  // DODAWANIE NABOŻEŃSTWA

 document
  .querySelectorAll('.add-devotion')
  .forEach(button => {
    button.addEventListener(
      'click',
      () => {
        const dayCard =
          button.closest('.day-card')

        const dateText =
          dayCard
            .querySelector('.day-date')
            .textContent
            .trim()

        const days = getWeekDays()

        const day = days.find(day =>
          formatDate(day.date) === dateText
        )

        if (!day) {
          console.error('Nie znaleziono dnia:', dateText)
          return
        }

        openDevotionEditor(
          getDateKey(day.date)
        )
      }
    )
  })

  // USUWANIE NABOŻEŃSTWA

  document
    .querySelectorAll('.delete-devotion')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const date =
            button.dataset.date

          const index =
            Number(
              button.dataset.index
            )

          if (
            !devotions[date]
          ) {
            return
          }

          devotions[date].splice(
            index,
            1
          )

          if (
            devotions[date].length === 0
          ) {
            delete devotions[date]
          }

          renderApp()
        }
      )
    })
}

// -------------------------
// START
// -------------------------

renderLogin()
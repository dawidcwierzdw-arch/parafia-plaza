import './style.css'
import { supabase } from './supabase'

window.supabase = supabase

let currentUser = null
let currentView = 'week'
let currentWeekOffset = 0
let enteredPin = ''

const scheduleOverrides = {}
const devotions = {}

let realtimeChannel = null

let currentAuthUserId = null

  async function checkMissedScheduleChanges() {

  if (!currentAuthUserId) {
    return
  }

  const storageKey =
    `parafia_last_seen_changes_${currentAuthUserId}`

  const lastSeen =
    localStorage.getItem(storageKey)

  // Przy pierwszym logowaniu nie pokazujemy
  // całej starej historii.
  if (!lastSeen) {

    localStorage.setItem(
      storageKey,
      new Date().toISOString()
    )

    return
  }

  const {
    data,
    error
  } =
    await supabase
      .from('schedule_changes')
      .select('*')
      .gt('created_at', lastSeen)
      .neq('changed_by', currentAuthUserId)
      .order('created_at', {
        ascending: true
      })

  if (error) {

    console.error(
      'Błąd pobierania zmian grafiku:',
      error
    )

    return
  }

  if (!data || data.length === 0) {
    return
  }

  for (const change of data) {

    showScheduleChangeAlert({
      eventType:
        change.change_type === 'delete'
          ? 'DELETE'
          : 'UPDATE',

      new: {
        event_date:
          change.event_date,

        event_time:
          change.event_time,

        title:
          change.event_title,

        priest_id:
          change.priest_id
      },

      old: {
        event_date:
          change.event_date,

        event_time:
          change.event_time,

        title:
          change.event_title,

        priest_id:
          change.priest_id
      }
    })
  }

  localStorage.setItem(
    storageKey,
    new Date().toISOString()
  )
}

function showScheduleChangeAlert(payload) {



  const event =
    payload.new || payload.old

  if (!event) {
    return
  }

  const date =
    new Date(
      `${event.event_date}T12:00:00`
    )

  const dayName =
    date.toLocaleDateString(
      'pl-PL',
      {
        weekday: 'long'
      }
    )

  const time =
    event.event_time
      ? event.event_time.slice(0, 5)
      : ''

  let priestName =
    'Nieobsadzone'

  if (
    event.priest_id === priests.proboszcz.id
  ) {
    priestName =
      'Ks. Proboszcz'
  }

  if (
    event.priest_id === priests.dawid.id
  ) {
    priestName =
      'Ks. Dawid'
  }

  let message = ''

  if (
    payload.eventType === 'DELETE'
  ) {

    message = `
      <strong>
        🔔 Grafik zmieniono
      </strong>

      <span>
        ${capitalize(dayName)}, ${time}
        — ${event.title} usunięto
      </span>
    `

  } else {

    message = `
      <strong>
        🔔 Grafik zmieniono
      </strong>

      <span>
        ${capitalize(dayName)}, ${time}
        — ${event.title} → ${priestName}
      </span>
    `
  }

  const notification =
    document.createElement('div')

notification.className =
  'app-notification'

notification.style.position = 'fixed'
notification.style.top = '20px'
notification.style.right = '20px'
notification.style.zIndex = '99999'
notification.style.background = 'white'
notification.style.color = 'black'
notification.style.padding = '20px'
notification.style.borderRadius = '12px'
notification.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)'

  notification.innerHTML = `

    <div class="app-notification-content">
      ${message}
    </div>

    <button
      class="app-notification-close"
    >
      ×
    </button>

  `

  document.body.appendChild(
    notification
  )

  notification
    .querySelector(
      '.app-notification-close'
    )
    .addEventListener(
      'click',
      () => {
        notification.remove()
      }
    )

  setTimeout(
    () => {

      if (
        notification.isConnected
      ) {
        notification.remove()
      }

    },
    5000
  )
}


function capitalize(text) {

  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  )
}

function startRealtimeSync() {

  if (realtimeChannel) {
    supabase.removeChannel(
      realtimeChannel
    )
  }

  realtimeChannel =
    supabase
      .channel('events-live')

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events'
        },
        async payload => {

          console.log(
            'Zmiana grafiku:',
            payload
          )

          await loadSchedule()

          showScheduleChangeAlert(
            payload
          )
        }
      )

      .subscribe()
}

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

          ${[1,2,3,4,5,6,7,8,9]
            .map(number => `
              <button
                class="pin-button"
                data-number="${number}"
              >
                ${number}
              </button>
            `)
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

  document
    .querySelectorAll('[data-number]')
    .forEach(button => {
      button.addEventListener('click', () => {

        if (enteredPin.length >= 4) {
          return
        }

        enteredPin += button.dataset.number

        updateLoginDots()

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

      updateLoginDots()
    })
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

async function checkPin(pin) {

  const hint =
    document.querySelector('.login-hint')

  hint.textContent = 'Sprawdzanie...'

  try {

    const { data, error } =
      await supabase.functions.invoke(
        'login-pin',
        {
          body: { pin }
        }
      )

    if (error) {
      console.error(
        'Błąd logowania:',
        error
      )

      hint.textContent =
        'Nie udało się połączyć z serwerem'

      setTimeout(() => {
        enteredPin = ''
        updateLoginDots()
        hint.textContent = 'Wprowadź PIN'
      }, 1500)

      return
    }

    if (!data?.success) {

      hint.textContent =
        data?.message ||
        'Nieprawidłowy PIN'

      setTimeout(() => {
        enteredPin = ''
        updateLoginDots()
        hint.textContent = 'Wprowadź PIN'
      }, 1000)

      return
    }

    const { error: sessionError } =
      await supabase.auth.setSession({
        access_token:
          data.session.access_token,

        refresh_token:
          data.session.refresh_token
      })

    if (sessionError) {

      console.error(
        'Błąd sesji:',
        sessionError
      )

      hint.textContent =
        'Nie udało się utworzyć sesji'

      return
    }

const {
  data: {
    user
  }
} = await supabase.auth.getUser()

currentAuthUserId =
  user?.id || null

currentUser =
  data.priest.name

await loadSchedule()

renderApp()

await checkMissedScheduleChanges()

startRealtimeSync()

  } catch (error) {

    console.error(error)

    hint.textContent =
      'Wystąpił błąd logowania'

    setTimeout(() => {
      enteredPin = ''
      updateLoginDots()
      hint.textContent = 'Wprowadź PIN'
    }, 1500)
  }
}

// -------------------------
// KALENDARZ
// -------------------------

function getMonday(date) {

  const result =
    new Date(date)

  const day =
    result.getDay()

  const difference =
    day === 0
      ? -6
      : 1 - day

  result.setDate(
    result.getDate() + difference
  )

  result.setHours(
    0,
    0,
    0,
    0
  )

  return result
}

function getWeekDays() {

  const today =
    new Date()

  const monday =
    getMonday(today)

  monday.setDate(
    monday.getDate() +
    currentWeekOffset * 7
  )

  const days = []

  for (let i = 0; i < 7; i++) {

    const date =
      new Date(monday)

    date.setDate(
      monday.getDate() + i
    )

    days.push({
      date,
      isSunday:
        date.getDay() === 0
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

  const first =
    days[0].date

  const last =
    days[6].date

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

  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      date.getDate()
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isToday(date) {

  const today =
    new Date()

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
// MSZE
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

function getMasses(date) {

  const dateKey =
    getDateKey(date)

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
      `${dateKey}_${mass.time}`

    if (
      Object.prototype.hasOwnProperty.call(
        scheduleOverrides,
        key
      )
    ) {

      return {
        ...mass,
        priest:
          scheduleOverrides[key]
      }
    }

    return mass
  })
}

// -------------------------
// WCZYTYWANIE GRAFIKU
// -------------------------

async function loadSchedule() {

  try {

    const days =
      getWeekDays()

    const firstDate =
      getDateKey(days[0].date)

    const lastDate =
      getDateKey(days[6].date)

    const {
      data,
      error
    } =
      await supabase
        .from('events')
        .select('*')
        .gte(
          'event_date',
          firstDate
        )
        .lte(
          'event_date',
          lastDate
        )

    if (error) {
      console.error(
        'Błąd pobierania grafiku:',
        error
      )

      return
    }

    Object.keys(
      scheduleOverrides
    ).forEach(key => {
      delete scheduleOverrides[key]
    })

    Object.keys(
      devotions
    ).forEach(key => {
      delete devotions[key]
    })

    data.forEach(event => {

      const dateKey =
        event.event_date

      if (
        event.event_type === 'mass'
      ) {

        const time =
          event.event_time
            ?.slice(0, 5)

        if (!time) {
          return
        }

        scheduleOverrides[
          `${dateKey}_${time}`
        ] =
          event.priest_id || null
      }

      if (
        event.event_type ===
        'devotion'
      ) {

        if (!devotions[dateKey]) {
          devotions[dateKey] = []
        }

        devotions[dateKey].push({
          id: event.id,

          name:
            event.title,

          when:
            event.after_mass
              ? 'after'
              : 'time',

          time:
            event.event_time
              ? event.event_time.slice(0, 5)
              : null,

          priest:
            event.priest_id || null
        })
      }
    })

    renderApp()

  } catch (error) {

    console.error(
      'Błąd ładowania grafiku:',
      error
    )
  }
}

// -------------------------
// KSIĘŻA
// -------------------------

function getPriestClass(priest) {

  if (
    priest === 'proboszcz' ||
    priest === priests.proboszcz.id
  ) {
    return 'priest-proboszcz'
  }

  if (
    priest === 'dawid' ||
    priest === priests.dawid.id
  ) {
    return 'priest-wikariusz'
  }

  return 'priest-empty'
}

function getPriestName(priest) {

  if (
    priest === 'proboszcz' ||
    priest === priests.proboszcz.id
  ) {
    return priests.proboszcz.name
  }

  if (
    priest === 'dawid' ||
    priest === priests.dawid.id
  ) {
    return priests.dawid.name
  }

  return 'Nieobsadzone'
}

// -------------------------
// GŁÓWNA APLIKACJA
// -------------------------

function renderApp() {

  const days =
    getWeekDays()

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
          class="nav-item ${
            currentView === 'week'
              ? 'active'
              : ''
          }"
          id="navWeek"
        >
          <span>▦</span>
          <small>Tydzień</small>
        </button>

        <button
          class="nav-item ${
            currentView === 'month'
              ? 'active'
              : ''
          }"
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

      </nav>

    </div>
  `

  attachAppEvents()
}

// -------------------------
// OBSŁUGA APLIKACJI
// -------------------------

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

  document
    .querySelector('#navWeek')
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

  document
    .querySelector('#navMonth')
    .addEventListener(
      'click',
      () => {

        currentView = 'month'

        renderApp()
      }
    )

      // NAWIGACJA MIESIĄCA

  document
    .querySelector('#month-prev')
    ?.addEventListener(
      'click',
      async () => {

        currentWeekOffset--

        renderApp()

        await loadSchedule()
      }
    )

  document
    .querySelector('#month-next')
    ?.addEventListener(
      'click',
      async () => {

        currentWeekOffset++

        renderApp()

        await loadSchedule()
      }
    )

  // KLIKNIĘCIE DNIA W MIESIĄCU

  document
    .querySelectorAll('.month-day[data-date]')
    .forEach(day => {

      day.addEventListener(
        'click',
        () => {

          const date =
            day.dataset.date

          openMonthDay(
            date
          )
        }
      )
    })

// MÓJ GRAFIK

document
  .querySelector('#navMine')
  .addEventListener(
    'click',
    () => {

      renderMySchedule()
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
            button.closest(
              '.day-card'
            )

          const dateText =
            dayCard
              .querySelector(
                '.day-date'
              )
              .textContent
              .trim()

          const day =
            getWeekDays().find(
              item =>
                formatDate(item.date) ===
                dateText
            )

          if (!day) {
            return
          }

          openDevotionEditor(
            getDateKey(day.date)
          )
        }
      )
    })

// -------------------------
// EDYCJA NABOŻEŃSTWA
// -------------------------

document
  .querySelectorAll('.edit-devotion')
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

        const devotion =
          devotions[date]?.[index]

        if (!devotion) {

          console.error(
            'Nie znaleziono nabożeństwa:',
            date,
            index
          )

          return
        }

        openDevotionEditor(
          date,
          devotion
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
      async () => {

        const date =
          button.dataset.date

        const index =
          Number(
            button.dataset.index
          )

        const devotion =
          devotions[date]?.[index]

        if (!devotion) {
          return
        }

        try {

          const {
            data: deletedEvent,
            error
          } =
            await supabase
              .from('events')
              .delete()
              .eq(
                'id',
                devotion.id
              )
              .select()
              .single()

          if (error) {
            throw error
          }

          if (deletedEvent) {

            await supabase
              .from('schedule_changes')
              .insert({
                event_id:
                  deletedEvent.id,

                change_type:
                  'delete',

                event_date:
                  deletedEvent.event_date,

                event_time:
                  deletedEvent.event_time,

                event_title:
                  deletedEvent.title,

                priest_id:
                  deletedEvent.priest_id,

                changed_by:
                  currentAuthUserId
              })
          }

          await loadSchedule()

        } catch (error) {

          console.error(
            'Błąd usuwania nabożeństwa:',
            error
          )

        }
      }
    )
  })

}


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
                ${
                  isToday(day.date)
                    ? 'today'
                    : ''
                }
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

                ${dayDevotions
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
                            devotion.when ===
                            'after'
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

                        <div class="devotion-actions">

  <button
    class="edit-devotion"
    data-date="${dayKey}"
    data-index="${index}"
    title="Edytuj"
  >
    ✎
  </button>

  <button
    class="delete-devotion"
    data-date="${dayKey}"
    data-index="${index}"
    title="Usuń"
  >
    ×
  </button>

</div>

                      </div>

                    `
                  )
                  .join('')}

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
  const today = new Date()

  const baseDate = new Date(
    today.getFullYear(),
    today.getMonth() + currentWeekOffset,
    1
  )

  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const firstWeekDay =
    firstDay.getDay() === 0
      ? 6
      : firstDay.getDay() - 1

  const daysInMonth =
    lastDay.getDate()

  const monthName =
    baseDate.toLocaleDateString(
      'pl-PL',
      {
        month: 'long',
        year: 'numeric'
      }
    )

  let html = `

    <div class="month-header">

      <button
        class="week-arrow"
        id="month-prev"
      >
        ←
      </button>

      <h2>
        ${
          monthName.charAt(0).toUpperCase()
          +
          monthName.slice(1)
        }
      </h2>

      <button
        class="week-arrow"
        id="month-next"
      >
        →
      </button>

    </div>

    <div class="month-grid">

      <div class="month-weekday">Pn</div>
      <div class="month-weekday">Wt</div>
      <div class="month-weekday">Śr</div>
      <div class="month-weekday">Cz</div>
      <div class="month-weekday">Pt</div>
      <div class="month-weekday">Sb</div>
      <div class="month-weekday">Nd</div>

  `

  for (
    let i = 0;
    i < firstWeekDay;
    i++
  ) {

    html += `
      <div class="month-day empty"></div>
    `
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {

    const date =
      new Date(
        year,
        month,
        day
      )

    const dateString =
      getDateKey(date)

    const isToday =
      date.toDateString() ===
      today.toDateString()

    const masses =
      getMasses(date)

    const dayDevotions =
      devotions[dateString] || []

    const hasEvents =
      masses.length > 0 ||
      dayDevotions.length > 0

    html += `

      <div
        class="
          month-day
          ${isToday ? 'today' : ''}
          ${hasEvents ? 'has-events' : ''}
        "
        data-date="${dateString}"
      >

        <div class="month-day-number">
          ${day}
        </div>

        <div class="month-events">

          ${masses
            .map(mass => `
              <span
                class="
                  month-event-dot
                  ${getPriestClass(mass.priest)}
                "
                title="${mass.time} – ${getPriestName(mass.priest)}"
              ></span>
            `)
            .join('')}

          ${dayDevotions
            .map(devotion => `
              <span
                class="
                  month-event-dot
                  ${getPriestClass(devotion.priest)}
                "
                title="${devotion.name}"
              ></span>
            `)
            .join('')}

        </div>

      </div>

    `
  }

  html += `
    </div>
  `

  return html
}

// -------------------------
// EDYCJA MSZY
// -------------------------

function openMassEditor(
  dateKey,
  time
) {

  const currentValue =
    Object.prototype.hasOwnProperty.call(
      scheduleOverrides,
      `${dateKey}_${time}`
    )
      ? scheduleOverrides[
          `${dateKey}_${time}`
        ]
      : getDefaultPriest(
          dateKey,
          time
        )

  const date =
    new Date(
      `${dateKey}T12:00:00`
    )

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
              currentValue ===
              priests.proboszcz.id ||
              currentValue ===
              'proboszcz'
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

          <strong>
            Ks. Proboszcz
          </strong>

        </label>

        <label class="priest-option">

          <input
            type="radio"
            name="massPriest"
            value="dawid"
            ${
              currentValue ===
              priests.dawid.id ||
              currentValue ===
              'dawid'
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

          <strong>
            Ks. Dawid
          </strong>

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

          <strong>
            Nieobsadzone
          </strong>

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

  const closeModal =
    () => modal.remove()

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

        const key =
          `${dateKey}_${time}`

        const selectedPriest =
          selected.value === 'none'
            ? null
            : selected.value

        const priestId =
          selectedPriest === null
            ? null
            : priests[
                selectedPriest
              ].id

        const defaultPriest =
          getDefaultPriest(
            dateKey,
            time
          )

        const defaultPriestId =
          defaultPriest
            ? priests[
                defaultPriest
              ].id
            : null

        try {

          if (
  priestId ===
  defaultPriestId
) {

  const { data: existingEvent, error: findError } =
    await supabase
      .from('events')
      .select('id, event_date, event_time, title, priest_id')
      .eq(
        'event_type',
        'mass'
      )
      .eq(
        'event_date',
        dateKey
      )
      .eq(
        'event_time',
        time
      )
      .maybeSingle()

  if (findError) {
    throw findError
  }

  const { error } =
    await supabase
      .from('events')
      .delete()
      .eq(
        'event_type',
        'mass'
      )
      .eq(
        'event_date',
        dateKey
      )
      .eq(
        'event_time',
        time
      )

  if (error) {
    throw error
  }

  if (existingEvent) {

    await supabase
      .from('schedule_changes')
      .insert({
        event_id:
          existingEvent.id,

        change_type:
          'delete',

        event_date:
          existingEvent.event_date,

        event_time:
          existingEvent.event_time,

        event_title:
          existingEvent.title,

        priest_id:
          existingEvent.priest_id,

        changed_by:
          currentAuthUserId
      })
  }

  delete scheduleOverrides[key]

         } else {

  const { data: savedEvent, error } =
    await supabase
      .from('events')
      .upsert(
        {
          event_date:
            dateKey,

          event_type:
            'mass',

          title:
            'Msza święta',

          event_time:
            time,

          after_mass:
            false,

          priest_id:
            priestId
        },
        {
          onConflict:
            'event_date,event_time,event_type'
        }
      )
      .select()
      .single()

  if (error) {
    throw error
  }

  await supabase
    .from('schedule_changes')
    .insert({
      event_id:
        savedEvent.id,

      change_type:
        'upsert',

      event_date:
        dateKey,

      event_time:
        time,

      event_title:
        'Msza święta',

      priest_id:
        priestId,

      changed_by:
        currentAuthUserId
    })

  scheduleOverrides[key] =
    selectedPriest
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
// DODAWANIE / EDYCJA NABOŻEŃSTWA
// -------------------------

function openDevotionEditor(
  dateKey,
  existingDevotion = null
) {

  const date =
    new Date(
      `${dateKey}T12:00:00`
    )

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
            ${
              existingDevotion
                ? 'Edytuj nabożeństwo'
                : 'Dodaj nabożeństwo'
            }
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
          value="${existingDevotion?.name || ''}"
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
              ${
                !existingDevotion ||
                existingDevotion.when === 'time'
                  ? 'checked'
                  : ''
              }
            >

            <span>
              O godzinie
            </span>

            <input
              type="time"
              id="devotionTime"
              value="${existingDevotion?.time || '17:30'}"
              class="time-input"
            >

          </label>

          <label class="time-option">

            <input
              type="radio"
              name="devotionWhen"
              value="after"
              ${
                existingDevotion?.when === 'after'
                  ? 'checked'
                  : ''
              }
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
              ${
                existingDevotion?.priest === priests.proboszcz.id ||
                existingDevotion?.priest === 'proboszcz'
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

            <strong>
              Ks. Proboszcz
            </strong>

          </label>

          <label class="priest-option">

            <input
              type="radio"
              name="devotionPriest"
              value="dawid"
              ${
                !existingDevotion ||
                existingDevotion.priest === priests.dawid.id ||
                existingDevotion.priest === 'dawid'
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

            <strong>
              Ks. Dawid
            </strong>

          </label>

          <label class="priest-option">

            <input
              type="radio"
              name="devotionPriest"
              value="none"
              ${
                existingDevotion &&
                !existingDevotion.priest
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
          ${
            existingDevotion
              ? 'Zapisz zmiany'
              : 'Dodaj'
          }
        </button>

      </div>

    </div>

  `

  document.body.appendChild(modal)

  const closeModal =
    () => modal.remove()

 modal
  .querySelector('#closeDevotionModal')
  .addEventListener(
    'click',
    closeModal
  )

modal
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
            .querySelector(
              '#devotionName'
            )
            .value
            .trim()

        if (!name) {

          document
            .querySelector(
              '#devotionName'
            )
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
  )?.value || ''

        const priest =
          document.querySelector(
            'input[name="devotionPriest"]:checked'
          )?.value || 'none'

        const priestId =
          priest === 'none'
            ? null
            : priests[priest].id

        try {

          const eventData = {

            event_date:
              dateKey,

            event_type:
              'devotion',

            title:
              name,

            event_time:
              when === 'time'
                ? time
                : null,

            after_mass:
              when === 'after',

            priest_id:
              priestId
          }

          let savedEvent = null

          // -------------------------
          // EDYCJA
          // -------------------------

          if (existingDevotion) {

  const {
    data,
    error
  } =
    await supabase
      .from('events')
      .update(eventData)
      .eq(
        'id',
        existingDevotion.id
      )
      .select()
      .single()

  if (error) {
    throw error
  }

  savedEvent = data

  await supabase
    .from('schedule_changes')
    .insert({
      event_id:
        savedEvent.id,

      change_type:
        'update',

      event_date:
        savedEvent.event_date,

      event_time:
        savedEvent.event_time,

      event_title:
        savedEvent.title,

      priest_id:
        savedEvent.priest_id,

      changed_by:
        currentAuthUserId
    })
}

          // -------------------------
          // DODAWANIE
          // -------------------------

         else {

  const {
    data,
    error
  } =
    await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single()

  if (error) {
    throw error
  }

  savedEvent = data

  await supabase
    .from('schedule_changes')
    .insert({
      event_id:
        savedEvent.id,

      change_type:
        'insert',

      event_date:
        savedEvent.event_date,

      event_time:
        savedEvent.event_time,

      event_title:
        savedEvent.title,

      priest_id:
        savedEvent.priest_id,

      changed_by:
        currentAuthUserId
    })
}

          // -------------------------
          // AKTUALIZACJA LOKALNA
          // -------------------------

          if (existingDevotion) {

            existingDevotion.name =
              savedEvent.title

            existingDevotion.when =
              savedEvent.after_mass
                ? 'after'
                : 'time'

            existingDevotion.time =
              savedEvent.event_time
                ? savedEvent.event_time.slice(0, 5)
                : null

            existingDevotion.priest =
              savedEvent.priest_id

          }

          else {

            if (!devotions[dateKey]) {
              devotions[dateKey] = []
            }

            devotions[dateKey].push({

              id:
                savedEvent.id,

              name:
                savedEvent.title,

              when:
                savedEvent.after_mass
                  ? 'after'
                  : 'time',

              time:
                savedEvent.event_time
                  ? savedEvent.event_time.slice(0, 5)
                  : null,

              priest:
                savedEvent.priest_id
            })

          }

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
// MÓJ GRAFIK
// -------------------------

function renderMySchedule() {

  const priestKey =
    currentUser === 'Ks. Dawid'
      ? 'dawid'
      : 'proboszcz'

  const priestId =
    priests[priestKey].id

  const days =
    getWeekDays()

  const events = []

  // -------------------------
  // MSZE
  // -------------------------

  days.forEach(day => {

    const dateKey =
      getDateKey(day.date)

    const masses =
      getMasses(day.date)

    masses.forEach(mass => {

      if (
        mass.priest === priestKey ||
        mass.priest === priestId
      ) {

        events.push({
          date: dateKey,
          time: mass.time,
          title: 'Msza Święta',
          type: 'mass'
        })
      }
    })

    // -------------------------
    // NABOŻEŃSTWA
    // -------------------------

    const dayDevotions =
      devotions[dateKey] || []

    dayDevotions.forEach(devotion => {

      if (
        devotion.priest !== priestKey &&
        devotion.priest !== priestId
      ) {
        return
      }

      events.push({
        date: dateKey,
        time: devotion.time,
        title: devotion.name,
        type: 'devotion',
        afterMass:
          devotion.when === 'after'
      })
    })
  })

  // -------------------------
  // SORTOWANIE
  // -------------------------

  events.sort((a, b) => {

    const dateCompare =
      a.date.localeCompare(b.date)

    if (dateCompare !== 0) {
      return dateCompare
    }

    return (
      (a.time || '99:99')
        .localeCompare(
          b.time || '99:99'
        )
    )
  })

  // -------------------------
  // HTML
  // -------------------------

  let html = `

    <div class="my-schedule-header">

      <div class="eyebrow">
        MÓJ GRAFIK
      </div>

      <h2>
        ${currentUser}
      </h2>

      <p>
        Grafik na bieżący tydzień
      </p>

    </div>

  `

  if (events.length === 0) {

    html += `

      <div class="empty-state">

        <div class="empty-state-icon">
          ✓
        </div>

        <h3>
          Brak przydzielonych wydarzeń
        </h3>

        <p>
          W tym tygodniu nie masz
          przypisanych Mszy ani nabożeństw.
        </p>

      </div>

    `

  } else {

    let currentDate = ''

    events.forEach((event, index) => {

      if (event.date !== currentDate) {

        if (currentDate !== '') {
          html += `
            </div>
          `
        }

        currentDate =
          event.date

        const date =
          new Date(
            `${event.date}T12:00:00`
          )

        const dayName =
          date.toLocaleDateString(
            'pl-PL',
            {
              weekday: 'long'
            }
          )

        const formattedDate =
          date.toLocaleDateString(
            'pl-PL',
            {
              day: 'numeric',
              month: 'long'
            }
          )

        html += `

          <div class="my-schedule-day">

            <div class="my-schedule-date">

              <strong>
                ${
                  dayName
                    .charAt(0)
                    .toUpperCase()
                  +
                  dayName.slice(1)
                }
              </strong>

              <span>
                ${formattedDate}
              </span>

            </div>

        `
      }

      html += `

        <div class="my-schedule-event">

          <div class="my-schedule-time">

            ${
              event.afterMass
                ? '—'
                : event.time
                  ? event.time.substring(0, 5)
                  : '—'
            }

          </div>

          <div class="my-schedule-event-info">

            <strong>
              ${event.title}
            </strong>

            ${
              event.afterMass
                ? `
                  <span>
                    Po Mszy Św.
                  </span>
                `
                : ''
            }

          </div>

        </div>

      `

      const nextEvent =
        events[index + 1]

      if (
        !nextEvent ||
        nextEvent.date !== currentDate
      ) {

        html += `
          </div>
        `
      }
    })
  }

  // -------------------------
  // WSTAWIENIE DO APLIKACJI
  // -------------------------

  const mainContent =
    document.querySelector(
      '.main-content'
    )

  if (mainContent) {
    mainContent.innerHTML =
      html
  }

  // -------------------------
  // AKTYWNA NAWIGACJA
  // -------------------------

  document
    .querySelectorAll('.nav-item')
    .forEach(item => {
      item.classList.remove('active')
    })

  document
    .querySelector('#navMine')
    ?.classList.add('active')
}

// -------------------------
// SZCZEGÓŁY DNIA W MIESIĄCU
// -------------------------

function openMonthDay(dateKey) {

  const date =
    new Date(
      `${dateKey}T12:00:00`
    )

  const masses =
    getMasses(date)

  const dayDevotions =
    devotions[dateKey] || []

  const modal =
    document.createElement('div')

  modal.className =
    'modal-overlay'

  modal.innerHTML = `

    <div class="mass-modal">

      <div class="modal-header">

        <div>

          <div class="modal-title">
            ${formatDayName(date)}
          </div>

          <div class="modal-subtitle">
            ${formatDate(date)}
          </div>

        </div>

        <button
          class="modal-close"
          id="closeMonthDay"
        >
          ×
        </button>

      </div>

      <div
        style="
          padding: 14px 20px 20px;
        "
      >

        ${masses
          .map(mass => `

            <div
              class="my-schedule-event"
              style="margin-bottom: 8px;"
            >

              <div class="my-schedule-time">
                ${mass.time}
              </div>

              <div class="my-schedule-event-info">

                <strong>
                  Msza Święta
                </strong>

                <span>
                  ${getPriestName(mass.priest)}
                </span>

              </div>

            </div>

          `)
          .join('')}

        ${dayDevotions
          .map(devotion => `

            <div
              class="my-schedule-event"
              style="margin-bottom: 8px;"
            >

              <div class="my-schedule-time">

                ${
                  devotion.when === 'after'
                    ? '—'
                    : devotion.time
                }

              </div>

              <div class="my-schedule-event-info">

                <strong>
                  ${devotion.name}
                </strong>

                <span>
                  ${
                    devotion.when === 'after'
                      ? 'Po Mszy Św. · '
                      : ''
                  }
                  ${getPriestName(
                    devotion.priest
                  )}
                </span>

              </div>

            </div>

          `)
          .join('')}

      </div>

    </div>

  `

  document.body.appendChild(
    modal
  )

  const closeModal =
    () => modal.remove()

  document
    .querySelector('#closeMonthDay')
    .addEventListener(
      'click',
      closeModal
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
// START
// -------------------------

renderLogin()
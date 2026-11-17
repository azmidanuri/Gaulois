
import { createClient } from '@supabase/supabase-js'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)
const root = document.querySelector('#app')

let user = null
let profile = null
let players = []
let linkedPlayers = []
let currentPage = 'home'
let selectedTeam = 'U12'
let selectedPlayer = null

const appName = 'Gaulois Aerion Academy'

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

function button(label, action, cls = '') {
  return `<button class="${cls}" data-action="${action}">${label}</button>`
}

async function loadProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  profile = data
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')

  if (error) throw error
  players = data || []

  if (profile?.role === 'parent') {
    const { data: links } = await supabase
      .from('parent_players')
      .select('player_id')
      .eq('parent_id', user.id)

    const ids = (links || []).map(item => item.player_id)

    linkedPlayers = players.filter(player => ids.includes(player.id))
  } else {
    linkedPlayers = players
  }
}

function header() {
  return `
    <header class="topbar">
      <div>
        <strong>${appName}</strong>
        <small>Parent & Team Portal</small>
      </div>
      ${button('Logout', 'logout', 'logout-btn')}
    </header>
  `
}

function homePage() {
  const isParent = profile?.role === 'parent'

  const teams = isParent
    ? ['U12', 'U10'].filter(team =>
        linkedPlayers.some(player => player.age_group === team)
      )
    : ['U12', 'U10']

  return `
    ${header()}

    <main class="container">
      <h2>Welcome, ${escapeHTML(profile?.full_name || 'User')}</h2>
      <p class="muted">Select a section to continue.</p>

      <section class="menu-grid">
        ${menuCard('Player Profile', '👤', 'profile')}
        ${menuCard('Attendance', '📅', 'attendance')}
        ${menuCard('Payment', '💳', 'payment')}
        ${menuCard('Videos', '🎬', 'videos')}
      </section>

      <h3>${isParent ? 'My Teams' : 'Academy Teams'}</h3>

      <section class="team-grid">
        ${teams.map(team => {
          const count = isParent
            ? linkedPlayers.filter(p => p.age_group === team).length
            : players.filter(p => p.age_group === team).length

          return `
            <article class="team-card"
              data-action="team"
              data-team="${team}">
              <div class="team-card-icon">⚽</div>
              <h3>${team}</h3>
              <p class="player-count">
                ${count} ${count === 1 ? 'Player' : 'Players'}
              </p>
              <span>View roster →</span>
            </article>
          `
        }).join('')}
      </section>
    </main>
  `
}

function menuCard(title, icon, page) {
  return `
    <article class="menu-card"
      data-action="page"
      data-page="${page}">
      <span>${icon}</span>
      <strong>${title}</strong>
      <small>Open section →</small>
    </article>
  `
}

function rosterPage() {
  const roster = profile?.role === 'parent'
    ? linkedPlayers.filter(p => p.age_group === selectedTeam)
    : players.filter(p => p.age_group === selectedTeam)

  return `
    ${header()}

    <main class="container">
      ${button('← Back to Home', 'home', 'back-btn')}

      <h2>${selectedTeam} Full Roster</h2>
      <p class="muted">${roster.length} registered players</p>

      <section class="roster-list">
        ${roster.length ? roster.map((player, index) => `
          <article class="player-card">
            <div class="player-number">${index + 1}</div>
            <div class="player-info">
              <strong>${escapeHTML(player.name)}</strong>
              <small>${escapeHTML(player.age_group || '')}</small>
            </div>
            ${button('View', `player-${player.id}`, 'view-btn')}
          </article>
        `).join('') : '<p>No players registered in this team.</p>'}
      </section>
    </main>
  `
}

function playerPage() {
  const player = players.find(p => String(p.id) === String(selectedPlayer))

  if (!player) return homePage()

  return `
    ${header()}
    <main class="container">
      ${button('← Back to Roster', 'roster', 'back-btn')}

      <h2>Player Profile</h2>

      <article class="profile-card">
        <h3>${escapeHTML(player.name)}</h3>
        <p>Team: ${escapeHTML(player.age_group || '')}</p>
      </article>
    </main>
  `
}

async function attendancePage() {
  const roster = profile?.role === 'parent'
    ? linkedPlayers
    : players

  const ids = roster.map(p => p.id)

  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('is_published', true)
    .order('activity_date', { ascending: true })

  if (error) {
    root.innerHTML = `${header()}<main class="container"><p>Could not load activities.</p></main>`
    return
  }

  const { data: responses } = await supabase
    .from('responses')
    .select('*')
    .in('player_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  root.innerHTML = `
    ${header()}
    <main class="container">
      ${button('← Back to Home', 'home', 'back-btn')}

      <h2>Attendance</h2>
      <p class="muted">Training and match availability</p>

      ${(activities || []).map(activity => `
        <article class="activity-card">
          <h3>${escapeHTML(activity.title)}</h3>
          <p>${escapeHTML(activity.activity_type)}</p>
          <p>${escapeHTML(activity.activity_date || '')}</p>
          <p>${escapeHTML(activity.start_time || '')}</p>
          <p>${escapeHTML(activity.venue || '')}</p>

          ${roster.map(player => {
            const response = (responses || []).find(r =>
              r.player_id === player.id &&
              r.activity_id === activity.id
            )

            return `
              <div class="attendance-row">
                <strong>${escapeHTML(player.name)}</strong>

                <select data-player="${player.id}"
                  data-activity="${activity.id}"
                  class="attendance-select">
                  <option value="unsure" ${!response || response.answer === 'unsure' ? 'selected' : ''}>Unsure</option>
                  <option value="yes" ${response?.answer === 'yes' ? 'selected' : ''}>Yes</option>
                  <option value="no" ${response?.answer === 'no' ? 'selected' : ''}>No</option>
                </select>
              </div>

              <input class="absence-reason"
                data-player="${player.id}"
                data-activity="${activity.id}"
                placeholder="Absence explanation (optional)"
                value="${escapeHTML(response?.absence_reason || '')}">
            `
          }).join('')}

          ${button('Save Attendance', `save-${activity.id}`, 'primary-btn')}
        </article>
      `).join('') || '<p>No published activities yet.</p>'}
    </main>
  `
}

function paymentPage() {
  return `
    ${header()}
    <main class="container">
      ${button('← Back to Home', 'home', 'back-btn')}
      <h2>Payment</h2>
      <p>Payment information will be available here.</p>
    </main>
  `
}

function videosPage() {
  return `
    ${header()}
    <main class="container">
      ${button('← Back to Home', 'home', 'back-btn')}
      <h2>Videos</h2>
      <p>Academy training and match videos will be available here.</p>
    </main>
  `
}

function profilePage() {
  const roster = profile?.role === 'parent'
    ? linkedPlayers
    : players

  return `
    ${header()}
    <main class="container">
      ${button('← Back to Home', 'home', 'back-btn')}
      <h2>Player Profiles</h2>

      ${roster.map(player => `
        <article class="player-card">
          <div class="player-info">
            <strong>${escapeHTML(player.name)}</strong>
            <small>${escapeHTML(player.age_group || '')}</small>
          </div>
          ${button('View', `player-${player.id}`, 'view-btn')}
        </article>
      `).join('')}
    </main>
  `
}

async function render() {
  if (!user) {
    renderLogin()
    return
  }

  if (!profile) await loadProfile()
  if (!players.length) await loadPlayers()

  if (currentPage === 'home') {
    root.innerHTML = homePage()
  } else if (currentPage === 'roster') {
    root.innerHTML = rosterPage()
  } else if (currentPage === 'player') {
    root.innerHTML = playerPage()
  } else if (currentPage === 'attendance') {
    await attendancePage()
  } else if (currentPage === 'payment') {
    root.innerHTML = paymentPage()
  } else if (currentPage === 'videos') {
    root.innerHTML = videosPage()
  } else if (currentPage === 'profile') {
    root.innerHTML = profilePage()
  }
}

function renderLogin() {
  root.innerHTML = `
    <main class="login-container">
      <h1>Gaulois Aerion Academy</h1>
      <p>Parent & Team Portal</p>

      <form id="login-form">
        <input type="email" id="email" placeholder="Email address" required>
        <input type="password" id="password" placeholder="Password" required>
        <button class="primary-btn" type="submit">Login</button>
      </form>

      <p id="login-error"></p>
      <a href="#" id="forgot-password">Forgot password?</a>
    </main>
  `
}

root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action], button')
  if (!target) return

  const action = target.dataset.action

  if (action === 'logout') {
    await supabase.auth.signOut()
    user = null
    profile = null
    players = []
    linkedPlayers = []
    currentPage = 'home'
    renderLogin()
  }

  if (action === 'home') {
    currentPage = 'home'
    render()
  }

  if (action === 'team') {
    selectedTeam = target.dataset.team
    currentPage = 'roster'
    render()
  }

  if (action === 'roster') {
    currentPage = 'roster'
    render()
  }

  if (action === 'page') {
    currentPage = target.dataset.page
    render()
  }

  if (action?.startsWith('player-')) {
    selectedPlayer = action.replace('player-', '')
    currentPage = 'player'
    render()
  }

  if (action?.startsWith('save-')) {
    const activityId = action.replace('save-', '')
    await saveAttendance(activityId)
  }
})

async function saveAttendance(activityId) {
  const selects = [...root.querySelectorAll(
    `.attendance-select[data-activity="${activityId}"]`
  )]

  for (const select of selects) {
    const playerId = select.dataset.player

    const reason = root.querySelector(
      `.absence-reason[data-player="${playerId}"][data-activity="${activityId}"]`
    )?.value || ''

    const payload = {
      activity_id: activityId,
      player_id: playerId,
      responded_by: user.id,
      answer: select.value,
      absence_reason: reason
    }

    const { error } = await supabase
      .from('responses')
      .upsert(payload, {
        onConflict: 'activity_id,player_id'
      })

    if (error) {
      alert('Could not save attendance: ' + error.message)
      return
    }
  }

  alert('Attendance saved successfully!')
}

root.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return

  event.preventDefault()

  const email = document.querySelector('#email').value
  const password = document.querySelector('#password').value

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    document.querySelector('#login-error').textContent = error.message
    return
  }

  user = data.user
  profile = null
  players = []
  linkedPlayers = []
  currentPage = 'home'

  await render()
})

root.addEventListener('click', async event => {
  if (event.target.id === 'forgot-password') {
    event.preventDefault()

    const email = document.querySelector('#email').value

    if (!email) {
      alert('Enter your email address first.')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    alert(error ? error.message : 'Password reset email sent.')
  }
})

supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null
  profile = null
  players = []
  linkedPlayers = []
  currentPage = 'home'
  render()
})

async function initialise() {
  const { data } = await supabase.auth.getSession()
  user = data.session?.user || null
  await render()
}

initialise()


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
let loginType = null

const TEAMS = ['U15', 'U12', 'U11', 'U10']

const POSITIONS = [
  'Goalkeeper',
  'Defender',
  'Midfielder',
  'Forward'
]

const appName = 'Gaulois Aerion Academy'

// HTML ESCAPE

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

// JERSEY NUMBER DISPLAY

function jerseyNumberDisplay(player) {
  const number = player.jersey_number

  if (
    number === null ||
    number === undefined ||
    String(number).trim() === ''
  ) {
    return '⚽'
  }

  return escapeHTML(number)
}

// BUTTON

function button(label, action, cls = '') {
  return `
    <button
      type="button"
      class="${cls}"
      data-action="${action}"
    >
      ${label}
    </button>
  `
}

// PERMISSIONS

function canEditPlayers() {
  return Boolean(profile && profile.role !== 'parent')
}

function getVisiblePlayers() {
  return profile?.role === 'parent'
    ? linkedPlayers
    : players
}

// LOAD USER PROFILE

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) throw error

  profile = data
}

// LOAD PLAYERS

async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')

  if (error) throw error

  players = data || []

  if (profile?.role === 'parent') {
    const { data: links, error: linkError } = await supabase
      .from('parent_players')
      .select('player_id')
      .eq('parent_id', user.id)

    if (linkError) throw linkError

    const ids = (links || []).map(item => item.player_id)

    linkedPlayers = players.filter(player =>
      ids.includes(player.id)
    )
  } else {
    linkedPlayers = players
  }
}

// HEADER WITH GAULOIS AERION LOGO

function header() {
  return `
    <header class="topbar">

      <div class="brand">

        <img
          src="/gaulois-logo.png"
          class="portal-logo"
          alt="Gaulois Aerion Academy"
        >

        <div class="brand-text">
          <div class="brand-name">${appName}</div>
          <small>Parent & Team Portal</small>
        </div>

      </div>

      ${button('Logout', 'logout', 'logout-btn')}

    </header>
  `
}

// HOME PAGE

function homePage() {
  const visiblePlayers = getVisiblePlayers()

  const teams = profile?.role === 'parent'
    ? TEAMS.filter(team =>
        visiblePlayers.some(p => p.age_group === team)
      )
    : TEAMS

  return `
    ${header()}

    <main class="container">

      <div class="welcome-section">
        <h2>Welcome, ${escapeHTML(profile?.full_name || 'User')}</h2>
        <p class="muted">Select a section to continue.</p>
      </div>

      <section class="menu-grid">

        ${menuCard('Player Profiles', '👤', 'profile')}
        ${menuCard('Attendance', '📅', 'attendance')}
        ${menuCard('Payment', '💳', 'payment')}
        ${menuCard('Videos', '🎬', 'videos')}

      </section>

      <div class="section-heading">
        <h3>${profile?.role === 'parent' ? 'My Teams' : 'Academy Teams'}</h3>
      </div>

      <section class="team-grid">

        ${teams.map(team => {
          const count = visiblePlayers.filter(
            p => p.age_group === team
          ).length

          return `
            <article
              class="team-card"
              data-action="team"
              data-team="${team}"
            >

              <div class="team-card-icon">⚽</div>

              <h3>${team}</h3>

              <p class="player-count">
                ${count} ${count === 1 ? 'Player' : 'Players'}
              </p>

              <span>View full roster →</span>

            </article>
          `
        }).join('')}

      </section>

    </main>
  `
}

function menuCard(title, icon, page) {
  return `
    <article
      class="menu-card"
      data-action="page"
      data-page="${page}"
    >

      <span class="menu-icon">${icon}</span>
      <strong>${title}</strong>
      <small>Open section →</small>

    </article>
  `
}

// FULL TEAM ROSTER

function rosterPage() {
  const roster = getVisiblePlayers()
    .filter(p => p.age_group === selectedTeam)
    .sort((a, b) => a.name.localeCompare(b.name))

  return `
    ${header()}

    <main class="container">

      ${button('← Back to Home', 'home', 'back-btn')}

      <div class="page-heading">
        <h2>${selectedTeam} Full Roster</h2>
        <p class="muted">${roster.length} registered players</p>
      </div>

      <section class="roster-list">

        ${roster.length ? roster.map(player => `
          <article class="player-card">

            <div class="player-number">
              ${jerseyNumberDisplay(player)}
            </div>

            <div class="player-info">
              <strong>${escapeHTML(player.name)}</strong>
              <small>
                ${escapeHTML(player.position || 'Position not assigned')}
              </small>
            </div>

            ${button(
              'View →',
              `player-${player.id}`,
              'view-btn'
            )}

          </article>
        `).join('') : `
          <div class="empty-state">
            No players registered in this team.
          </div>
        `}

      </section>

    </main>
  `
}

// GROUPED PLAYER PROFILES

function profilePage() {
  const roster = getVisiblePlayers()

  const teams = profile?.role === 'parent'
    ? TEAMS.filter(team =>
        roster.some(p => p.age_group === team)
      )
    : TEAMS

  return `
    ${header()}

    <main class="container">

      ${button('← Back to Home', 'home', 'back-btn')}

      <div class="page-heading">
        <h2>Player Profiles</h2>
        <p class="muted">Browse players by team</p>
      </div>

      ${teams.map(team => {
        const teamPlayers = roster
          .filter(p => p.age_group === team)
          .sort((a, b) => a.name.localeCompare(b.name))

        return `
          <section class="profile-team-section">

            <div class="profile-team-heading">

              <div>
                <h3>${team} TEAM</h3>
                <small>Gaulois Aerion Academy</small>
              </div>

              <span>
                ${teamPlayers.length} PLAYERS
              </span>

            </div>

            <div class="roster-list">

              ${teamPlayers.length
                ? teamPlayers.map(player => `
                  <article class="player-card">

                    <div class="player-number">
                      ${jerseyNumberDisplay(player)}
                    </div>

                    <div class="player-info">
                      <strong>${escapeHTML(player.name)}</strong>
                      <small>
                        ${escapeHTML(player.position || 'Position not assigned')}
                      </small>
                    </div>

                    ${button(
                      'View →',
                      `player-${player.id}`,
                      'view-btn'
                    )}

                  </article>
                `).join('')
                : `
                  <div class="empty-state">
                    No players registered yet.
                  </div>
                `
              }

            </div>

          </section>
        `
      }).join('')}

    </main>
  `
}

// INDIVIDUAL PLAYER PROFILE

function playerPage() {
  const player = getVisiblePlayers().find(
    p => String(p.id) === String(selectedPlayer)
  )

  if (!player) return homePage()

  const canEdit = canEditPlayers()

  return `
    ${header()}

    <main class="container">

      ${button('← Back', 'profile-back', 'back-btn')}

      <section class="player-profile">

        <div class="player-profile-banner">

          <div class="football-avatar">⚽</div>

          <h2>${escapeHTML(player.name)}</h2>

          <span class="team-badge">
            ${escapeHTML(player.age_group || 'Academy')}
          </span>

        </div>

        <div class="player-profile-content">

          <h3>Player Information</h3>

          <div class="profile-field">
            <label>Full Name</label>
            <div>${escapeHTML(player.name)}</div>
          </div>

          <div class="profile-field">
            <label>Team / Age Group</label>
            <div>${escapeHTML(player.age_group || '-')}</div>
          </div>

          <div class="profile-field">
            <label>Date of Birth</label>
            <div>${escapeHTML(player.date_of_birth || '-')}</div>
          </div>

          <div class="profile-field">

            <label>Jersey Number</label>

            ${canEdit ? `
              <input
                id="jersey-number"
                type="number"
                min="1"
                max="99"
                step="1"
                value="${escapeHTML(player.jersey_number ?? '')}"
                placeholder="Enter jersey number"
              >
            ` : `
              <div class="profile-value">
                ${player.jersey_number !== null &&
                  player.jersey_number !== undefined &&
                  String(player.jersey_number).trim() !== ''
                  ? escapeHTML(player.jersey_number)
                  : '⚽ Unassigned'}
              </div>
            `}

          </div>

          <div class="profile-field">

            <label>Position</label>

            ${canEdit ? `
              <select id="player-position">

                <option value="">Select position</option>

                ${POSITIONS.map(position => `
                  <option
                    value="${position}"
                    ${player.position === position ? 'selected' : ''}
                  >
                    ${position}
                  </option>
                `).join('')}

              </select>
            ` : `
              <div class="profile-value">
                ${escapeHTML(player.position || 'Not assigned')}
              </div>
            `}

          </div>

          ${canEdit ? `
            <button
              type="button"
              class="primary-btn"
              data-action="save-player-profile"
            >
              Save Changes
            </button>
          ` : `
            <p class="parent-note">
              Player information is managed by academy staff.
            </p>
          `}

        </div>

      </section>

    </main>
  `
}

// SAVE PLAYER PROFILE

async function savePlayerProfile() {
  if (!canEditPlayers()) return

  const jerseyInput = document.querySelector('#jersey-number')
  const positionInput = document.querySelector('#player-position')

  if (!jerseyInput || !positionInput) return

  const jerseyValue = jerseyInput.value.trim()
  const positionValue = positionInput.value

  let jerseyNumber = null

  if (jerseyValue !== '') {
    jerseyNumber = Number(jerseyValue)

    if (
      !Number.isInteger(jerseyNumber) ||
      jerseyNumber < 1 ||
      jerseyNumber > 99
    ) {
      alert('Jersey number must be between 1 and 99.')
      return
    }
  }

  if (positionValue && !POSITIONS.includes(positionValue)) {
    alert('Please select a valid position.')
    return
  }

  const { error } = await supabase
    .from('players')
    .update({
      jersey_number: jerseyNumber,
      position: positionValue || null
    })
    .eq('id', selectedPlayer)

  if (error) {
    alert('Unable to update player: ' + error.message)
    return
  }

  await loadPlayers()

  alert('Player profile updated successfully!')

  currentPage = 'player'
  render()
}

// ATTENDANCE PAGE

async function attendancePage() {
  const roster = getVisiblePlayers()
  const ids = roster.map(p => p.id)

  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('is_published', true)
    .order('activity_date', { ascending: true })

  if (error) throw error

  let responses = []

  if (ids.length) {
    const { data, error: responseError } = await supabase
      .from('responses')
      .select('*')
      .in('player_id', ids)

    if (responseError) throw responseError

    responses = data || []
  }

  root.innerHTML = `
    ${header()}

    <main class="container">

      ${button('← Back to Home', 'home', 'back-btn')}

      <h2>Attendance</h2>
      <p class="muted">Training and match availability</p>

      ${(activities || []).map(activity => `
        <article class="activity-card">

          <h3>${escapeHTML(activity.title)}</h3>

          <p>${escapeHTML(activity.activity_type || '')}</p>
          <p>${escapeHTML(activity.activity_date || '')}</p>
          <p>${escapeHTML(activity.start_time || '')}</p>
          <p>${escapeHTML(activity.venue || '')}</p>

          ${roster.map(player => {
            const response = responses.find(r =>
              r.player_id === player.id &&
              r.activity_id === activity.id
            )

            return `
              <div class="attendance-row">

                <strong>${escapeHTML(player.name)}</strong>

                <select
                  data-player="${player.id}"
                  data-activity="${activity.id}"
                  class="attendance-select"
                >
                  <option value="unsure"
                    ${!response || response.answer === 'unsure' ? 'selected' : ''}>
                    Unsure
                  </option>

                  <option value="yes"
                    ${response?.answer === 'yes' ? 'selected' : ''}>
                    Yes
                  </option>

                  <option value="no"
                    ${response?.answer === 'no' ? 'selected' : ''}>
                    No
                  </option>
                </select>

              </div>

              <input
                class="absence-reason"
                data-player="${player.id}"
                data-activity="${activity.id}"
                placeholder="Absence explanation (optional)"
                value="${escapeHTML(response?.absence_reason || '')}"
              >
            `
          }).join('')}

          ${button(
            'Save Attendance',
            `save-${activity.id}`,
            'primary-btn'
          )}

        </article>
      `).join('') || '<p>No published activities yet.</p>'}

    </main>
  `
}

// PAYMENT PAGE

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

// VIDEOS PAGE

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

// SAVE ATTENDANCE

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

// LOGIN SCREEN WITH CENTRED LOGO

function renderLogin() {

  // FIRST SCREEN: SELECT LOGIN TYPE

  if (!loginType) {
    root.innerHTML = `
      <main class="login-container">

        <img
          src="/gaulois-logo.png"
          class="login-logo"
          alt="Gaulois Aerion Academy"
        >

        <h1>Gaulois Aerion Academy</h1>

        <p>Parent & Team Portal</p>

        <h3>Select Login Type</h3>

        <div class="login-options">

          <button
            type="button"
            class="primary-btn"
            data-action="select-login"
            data-login-type="parent"
          >
            👨‍👩‍👦 Parent/Player Login
          </button>

          <button
            type="button"
            class="primary-btn"
            data-action="select-login"
            data-login-type="staff"
          >
            🛡️ Staff Login
          </button>

        </div>

      </main>
    `

    return
  }

  // SECOND SCREEN: LOGIN FORM

  root.innerHTML = `
    <main class="login-container">

      <img
        src="/gaulois-logo.png"
        class="login-logo"
        alt="Gaulois Aerion Academy"
      >

      <h1>Gaulois Aerion Academy</h1>

      <h2>
        ${loginType === 'parent'
          ? 'Parent/Player Login'
          : 'Staff Login'}
      </h2>

      <p>Enter your account details</p>

      <form id="login-form">

        <input
          type="email"
          id="email"
          placeholder="Email address"
          required
        >

        <input
          type="password"
          id="password"
          placeholder="Password"
          required
        >

        <button class="primary-btn" type="submit">
          Login
        </button>

      </form>

      <p id="login-error"></p>

      <a href="#" id="forgot-password">
        Forgot password?
      </a>

      <div>
        <button
          type="button"
          class="back-btn"
          data-action="back-login"
        >
          ← Back to Login Options
        </button>
      </div>

    </main>
  `
}

// RENDER APPLICATION

async function render() {

  if (!user) {
    renderLogin()
    return
  }

  try {
    if (!profile) await loadProfile()

    if (!players.length) await loadPlayers()

    if (currentPage === 'home') {
      root.innerHTML = homePage()

    } else if (currentPage === 'roster') {
      root.innerHTML = rosterPage()

    } else if (currentPage === 'profile') {
      root.innerHTML = profilePage()

    } else if (currentPage === 'player') {
      root.innerHTML = playerPage()

    } else if (currentPage === 'attendance') {
      await attendancePage()

    } else if (currentPage === 'payment') {
      root.innerHTML = paymentPage()

    } else if (currentPage === 'videos') {
      root.innerHTML = videosPage()
    }

  } catch (error) {
    console.error(error)

    root.innerHTML = `
      ${header()}

      <main class="container">

        <p>Unable to load information.</p>

        <p>${escapeHTML(error.message)}</p>

      </main>
    `
  }
}

// APPLICATION CLICK HANDLER

root.addEventListener('click', async event => {

  // FORGOT PASSWORD

  if (event.target.closest('#forgot-password')) {
    event.preventDefault()

    const email = document.querySelector('#email')?.value.trim()

    if (!email) {
      alert('Enter your email address first.')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    alert(error ? error.message : 'Password reset email sent.')
    return
  }

  const target = event.target.closest('[data-action]')

  if (!target) return

  const action = target.dataset.action

  // SELECT LOGIN TYPE

  if (action === 'select-login') {
    loginType = target.dataset.loginType

    renderLogin()
    return
  }

  // BACK TO LOGIN OPTIONS

  if (action === 'back-login') {
    loginType = null

    renderLogin()
    return
  }

  // LOGOUT

  if (action === 'logout') {
    await supabase.auth.signOut()

    user = null
    profile = null
    players = []
    linkedPlayers = []
    loginType = null
    currentPage = 'home'

    renderLogin()
    return
  }

  // HOME

  if (action === 'home') {
    currentPage = 'home'
    render()
    return
  }

  // TEAM ROSTER

  if (action === 'team') {
    selectedTeam = target.dataset.team
    currentPage = 'roster'

    render()
    return
  }

  if (action === 'roster') {
    currentPage = 'roster'
    render()
    return
  }

  // PROFILE BACK

  if (action === 'profile-back') {
    currentPage = 'profile'
    render()
    return
  }

  // NAVIGATION

  if (action === 'page') {
    currentPage = target.dataset.page
    render()
    return
  }

  // SAVE PLAYER PROFILE

  if (action === 'save-player-profile') {
    await savePlayerProfile()
    return
  }

  // INDIVIDUAL PLAYER

  if (action.startsWith('player-')) {
    selectedPlayer = action.replace('player-', '')
    currentPage = 'player'

    render()
    return
  }

  // SAVE ATTENDANCE

  if (action.startsWith('save-')) {
    const activityId = action.replace('save-', '')

    await saveAttendance(activityId)
  }

})

// LOGIN FORM HANDLER

root.addEventListener('submit', async event => {

  if (event.target.id !== 'login-form') return

  event.preventDefault()

  const email = document.querySelector('#email').value
  const password = document.querySelector('#password').value

  const errorMessage = document.querySelector('#login-error')

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    errorMessage.textContent = error.message
    return
  }

  // LOAD ACCOUNT PROFILE

  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single()

  if (profileError || !userProfile) {

    await supabase.auth.signOut()

    errorMessage.textContent =
      'Unable to find your user profile.'

    return
  }

  // VERIFY LOGIN TYPE

  const isParent = userProfile.role === 'parent'

  if (
    (loginType === 'parent' && !isParent) ||
    (loginType === 'staff' && isParent)
  ) {

    await supabase.auth.signOut()

    errorMessage.textContent =
      'This account cannot use this login option. Please select the correct login type.'

    return
  }

  // LOGIN SUCCESSFUL

  user = data.user
  profile = userProfile

  players = []
  linkedPlayers = []

  currentPage = 'home'

  await render()

})

// START APPLICATION

async function initialise() {

  try {
    const { data, error } = await supabase.auth.getSession()

    if (error) throw error

    user = data.session?.user || null

    if (user) {
      profile = null
      players = []
      linkedPlayers = []
    }

    await render()

  } catch (error) {
    console.error(error)

    root.innerHTML = `
      <main class="container">
        <p>Unable to start application.</p>
        <p>${escapeHTML(error.message)}</p>
      </main>
    `
  }

}

initialise()

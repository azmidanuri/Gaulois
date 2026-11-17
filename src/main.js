
import { createClient } from '@supabase/supabase-js'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const root = document.querySelector('#app')

const TEAMS = ['U15', 'U12', 'U11', 'U10']
const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

let user = null
let profile = null
let players = []
let linkedPlayers = []
let currentPage = 'login'
let loginType = null
let selectedTeam = 'U12'
let selectedPlayer = null
let isSigningUp = false

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

function today() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isPastActivity(activity) {
  return Boolean(activity.activity_date && activity.activity_date < today())
}

function formatDate(value) {
  if (!value) return 'Date not set'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatTime(value) {
  if (!value) return ''
  const parts = value.split(':')
  if (parts.length < 2) return value

  const date = new Date()
  date.setHours(Number(parts[0]), Number(parts[1]))

  return date.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function canManage() {
  return Boolean(profile && profile.role !== 'parent')
}

function canEditPlayers() {
  return canManage()
}

function visiblePlayers() {
  return profile?.role === 'parent' ? linkedPlayers : players
}

function showMessage(message) {
  alert(message)
}

function backButton() {
  return `
    <button class="back-btn" data-action="home">
      ← Back to Home
    </button>
  `
}

function jerseyDisplay(player) {
  return player.jersey_number !== null &&
    player.jersey_number !== undefined &&
    String(player.jersey_number).trim() !== ''
    ? esc(player.jersey_number)
    : '⚽'
}

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

function loginPage() {
  root.innerHTML = `
    <main class="login-page">

      <section class="login-card">

        <div class="login-brand">
          <img
            src="/gaulois-logo.png"
            class="login-logo"
            alt="Gaulois Aerion Academy"
          >
          <h1>Gaulois Aerion Academy</h1>
          <p>ACADEMY PORTAL</p>
        </div>

        ${!loginType ? `

          <div class="login-choice-content">
            <span class="login-eyebrow">WELCOME</span>
            <h2>Choose your login</h2>
            <p class="login-description">
              Select your portal to continue
            </p>

            <div class="login-choice-grid">

              <button
                type="button"
                class="login-choice"
                data-action="choose-parent"
              >
                <span class="login-choice-icon">♙</span>
                <strong>Parent/Player Login</strong>
                <small>
                  Attendance, activities and player information
                </small>
                <span class="login-choice-arrow">→</span>
              </button>

              <button
                type="button"
                class="login-choice"
                data-action="choose-staff"
              >
                <span class="login-choice-icon">⚽</span>
                <strong>Staff Login</strong>
                <small>
                  Manage teams, players and academy activities
                </small>
                <span class="login-choice-arrow">→</span>
              </button>

            </div>

            <p class="login-hint">
              Select a card to proceed to your login
            </p>
          </div>

        ` : `

          <div class="login-form-content">

            <button
              class="back-btn login-change-btn"
              data-action="change-login"
            >
              ← Change Login Type
            </button>

            <span class="login-eyebrow">PORTAL ACCESS</span>

            <h2>
              ${loginType === 'parent'
                ? 'Parent/Player Login'
                : 'Staff Login'}
            </h2>

            <p class="login-description">
              Enter your account details to continue
            </p>

            <form id="login-form">

              ${isSigningUp ? `
                <label>Full Name</label>
                <input
                  id="full-name"
                  type="text"
                  placeholder="Enter your full name"
                  required
                >
              ` : ''}

              <label>Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Email address"
                required
              >

              <label>Password</label>
              <input
                id="password"
                type="password"
                placeholder="Password"
                required
              >

              <button type="submit" class="primary-btn">
                ${isSigningUp ? 'Create Account' : 'Login'}
              </button>

            </form>

            ${loginType === 'parent' ? `
              <button
                class="text-btn"
                data-action="toggle-signup"
              >
                ${isSigningUp
                  ? 'Already have an account? Login'
                  : 'Create a parent account'}
              </button>
            ` : ''}

          </div>

        `}

        <div class="login-footer">
          GAULOIS AERION ACADEMY
        </div>

      </section>

    </main>
  `
}

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  user = data.user
  await loadProfile()

  if (loginType === 'staff' && profile.role === 'parent') {
    await supabase.auth.signOut()
    user = null
    profile = null
    throw new Error('This account does not have staff access.')
  }

  if (loginType === 'parent' && profile.role !== 'parent') {
    await supabase.auth.signOut()
    user = null
    profile = null
    throw new Error('Please use Staff Login for this account.')
  }

  await loadPlayers()
  currentPage = 'home'
  render()
}

async function createParentAccount(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) throw error

  if (!data.user) {
    throw new Error('Account could not be created.')
  }

  if (!data.session) {
    showMessage(
      'Account created. Please verify your email, then log in.'
    )
    isSigningUp = false
    render()
    return
  }

  user = data.user

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: name,
      role: 'parent'
    })

  if (profileError) throw profileError

  await loadProfile()
  await loadPlayers()

  currentPage = 'home'
  render()
}

async function logout() {
  await supabase.auth.signOut()

  user = null
  profile = null
  players = []
  linkedPlayers = []
  currentPage = 'login'
  loginType = null
  isSigningUp = false

  render()
}

// --------------------------------------------------
// LOAD PROFILE AND PLAYERS
// --------------------------------------------------

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) throw error
  profile = data
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')

  if (error) throw error
  players = data || []

  if (profile.role === 'parent') {
    const { data: links, error: linkError } = await supabase
      .from('parent_players')
      .select('player_id')
      .eq('parent_id', user.id)

    if (linkError) throw linkError

    const ids = (links || []).map(link => link.player_id)
    linkedPlayers = players.filter(player => ids.includes(player.id))
  } else {
    linkedPlayers = players
  }
}

// --------------------------------------------------
// SHARED HEADER
// --------------------------------------------------

function header() {
  return `
    <header class="topbar">
      <div class="brand">
        <img
          src="/gaulois-logo.png"
          class="portal-logo"
          alt="Gaulois Aerion"
        >
        <div>
          <div class="brand-name">Gaulois Aerion Academy</div>
          <small>Parent & Team Portal</small>
        </div>
      </div>

      <button class="logout-btn" data-action="logout">
        Logout
      </button>
    </header>
  `
}

// --------------------------------------------------
// HOME PAGE
// --------------------------------------------------

function menuCard(title, icon, page) {
  return `
    <article class="menu-card" data-action="page" data-page="${page}">
      <span class="menu-icon">${icon}</span>
      <strong>${title}</strong>
      <small>Open section →</small>
    </article>
  `
}

function homePage() {
  const roster = visiblePlayers()

  const teams = profile.role === 'parent'
    ? TEAMS.filter(team =>
        roster.some(player => player.age_group === team)
      )
    : TEAMS

  return `
    ${header()}

    <main class="container">

      <div class="welcome-section">
        <h2>Welcome, ${esc(profile.full_name || 'User')}</h2>
        <p class="muted">Select a section to continue.</p>
      </div>

      <section class="menu-grid">
        ${menuCard('Player Profiles', '👤', 'profile')}
        ${menuCard('Attendance', '📅', 'attendance')}
        ${menuCard('Payment', '💳', 'payment')}
        ${menuCard('Videos', '🎬', 'videos')}
      </section>

      <div class="section-heading">
        <h3>${profile.role === 'parent' ? 'My Teams' : 'Academy Teams'}</h3>
      </div>

      <section class="team-grid">
        ${teams.map(team => {
          const count = roster.filter(
            player => player.age_group === team
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

// --------------------------------------------------
// TEAM ROSTER
// --------------------------------------------------

function rosterPage() {
  const roster = visiblePlayers()
    .filter(player => player.age_group === selectedTeam)
    .sort((a, b) => a.name.localeCompare(b.name))

  return `
    ${header()}

    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>${selectedTeam} Full Roster</h2>
        <p class="muted">${roster.length} registered players</p>
      </div>

      <section class="roster-list">
        ${roster.length ? roster.map(player => `
          <article class="player-card">
            <div class="player-number">${jerseyDisplay(player)}</div>
            <div class="player-info">
              <strong>${esc(player.name)}</strong>
              <small>${esc(player.position || 'Position not assigned')}</small>
            </div>
            <button class="view-btn" data-action="player" data-player="${player.id}">
              View →
            </button>
          </article>
        `).join('') : `
          <div class="empty-state">No players in this team.</div>
        `}
      </section>
    </main>
  `
}

// --------------------------------------------------
// PLAYER PROFILES
// --------------------------------------------------

function profilePage() {
  const roster = visiblePlayers()

  const teams = profile.role === 'parent'
    ? TEAMS.filter(team =>
        roster.some(player => player.age_group === team)
      )
    : TEAMS

  return `
    ${header()}

    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>Player Profiles</h2>
        <p class="muted">Browse players by team</p>
      </div>

      ${teams.map(team => {
        const teamPlayers = roster
          .filter(player => player.age_group === team)
          .sort((a, b) => a.name.localeCompare(b.name))

        return `
          <section class="profile-team-section">
            <div class="profile-team-heading">
              <div>
                <h3>${team} TEAM</h3>
                <small>Gaulois Aerion Academy</small>
              </div>
              <span>${teamPlayers.length} PLAYERS</span>
            </div>

            <div class="roster-list">
              ${teamPlayers.map(player => `
                <article class="player-card">
                  <div class="player-number">${jerseyDisplay(player)}</div>
                  <div class="player-info">
                    <strong>${esc(player.name)}</strong>
                    <small>${esc(player.position || 'Position not assigned')}</small>
                  </div>
                  <button class="view-btn" data-action="player" data-player="${player.id}">
                    View →
                  </button>
                </article>
              `).join('')}

              ${teamPlayers.length === 0
                ? '<div class="empty-state">No players registered yet.</div>'
                : ''}
            </div>
          </section>
        `
      }).join('')}
    </main>
  `
}

function playerPage() {
  const player = visiblePlayers().find(
    item => String(item.id) === String(selectedPlayer)
  )

  if (!player) return homePage()

  return `
    ${header()}

    <main class="container">
      <button class="back-btn" data-action="profile-back">
        ← Back to Profiles
      </button>

      <section class="player-profile">
        <div class="player-profile-banner">
          <div class="football-avatar">⚽</div>
          <h2>${esc(player.name)}</h2>
          <span class="team-badge">${esc(player.age_group || 'Academy')}</span>
        </div>

        <div class="player-profile-content">
          <h3>Player Information</h3>

          <div class="profile-field">
            <label>Full Name</label>
            <div>${esc(player.name)}</div>
          </div>

          <div class="profile-field">
            <label>Team</label>
            <div>${esc(player.age_group || '-')}</div>
          </div>

          <div class="profile-field">
            <label>Date of Birth</label>
            <div>${esc(player.date_of_birth || '-')}</div>
          </div>

          <div class="profile-field">
            <label>Jersey Number</label>
            ${canEditPlayers() ? `
              <input
                id="jersey-number"
                type="number"
                min="1"
                max="99"
                value="${esc(player.jersey_number ?? '')}"
                placeholder="Enter jersey number"
              >
            ` : `
              <div>${player.jersey_number ?? 'Unassigned'}</div>
            `}
          </div>

          <div class="profile-field">
            <label>Position</label>
            ${canEditPlayers() ? `
              <select id="player-position">
                <option value="">Select position</option>
                ${POSITIONS.map(position => `
                  <option value="${position}" ${player.position === position ? 'selected' : ''}>
                    ${position}
                  </option>
                `).join('')}
              </select>
            ` : `
              <div>${esc(player.position || 'Not assigned')}</div>
            `}
          </div>

          ${canEditPlayers() ? `
            <button class="primary-btn" data-action="save-player">
              Save Changes
            </button>
          ` : ''}
        </div>
      </section>
    </main>
  `
}

async function savePlayerProfile() {
  if (!canEditPlayers()) return

  const jerseyValue = document.querySelector('#jersey-number')?.value.trim()
  const positionValue = document.querySelector('#player-position')?.value

  let jerseyNumber = null

  if (jerseyValue) {
    jerseyNumber = Number(jerseyValue)

    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 1 || jerseyNumber > 99) {
      showMessage('Jersey number must be between 1 and 99.')
      return
    }
  }

  const { error } = await supabase
    .from('players')
    .update({
      jersey_number: jerseyNumber,
      position: positionValue || null
    })
    .eq('id', selectedPlayer)

  if (error) {
    showMessage('Unable to update player: ' + error.message)
    return
  }

  await loadPlayers()
  showMessage('Player profile updated successfully.')
  render()
}

// --------------------------------------------------
// ATTENDANCE
// --------------------------------------------------

async function attendancePage() {
  const roster = visiblePlayers()
  const playerIds = roster.map(player => player.id)

  let query = supabase
    .from('activities')
    .select('*')
    .order('activity_date', { ascending: true })

  if (!canManage()) {
    query = query.eq('is_published', true)
  }

  const { data: activityData, error } = await query
  if (error) throw error

  const visibleTeams = [...new Set(roster.map(player => player.age_group))]

  const activities = (activityData || []).filter(activity => {
    if (canManage()) return true
    return !activity.age_group || visibleTeams.includes(activity.age_group)
  })

  let responses = []

  if (playerIds.length) {
    const { data, error: responseError } = await supabase
      .from('responses')
      .select('*')
      .in('player_id', playerIds)

    if (responseError) throw responseError
    responses = data || []
  }

  const upcoming = activities.filter(activity => !isPastActivity(activity))
  const past = activities.filter(activity => isPastActivity(activity))

  root.innerHTML = `
    ${header()}

    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>Attendance</h2>
        <p class="muted">Training and match availability</p>
      </div>

      ${canManage() ? createActivityForm() : ''}

      ${renderActivitySection('Upcoming Activities', upcoming, roster, responses, 'upcoming')}
      ${renderActivitySection('Past Activities', past, roster, responses, 'past')}
    </main>
  `
}

function createActivityForm() {
  return `
    <section class="activity-card">
      <h3>➕ Create New Activity</h3>

      <form id="create-activity-form">
        <label>Team / Age Group</label>
        <select id="activity-team" required>
          ${TEAMS.map(team => `
            <option value="${team}" ${team === 'U12' ? 'selected' : ''}>
              ${team}
            </option>
          `).join('')}
        </select>

        <label>Activity Type</label>
        <select id="activity-type" required>
          <option value="training">Training</option>
          <option value="match">Match</option>
        </select>

        <label>Activity Title</label>
        <input id="activity-title" type="text" placeholder="e.g. U12 Training" required>

        <label>Date</label>
        <input id="activity-date" type="date" required>

        <label>Start Time</label>
        <input id="activity-time" type="time" required>

        <label>Venue</label>
        <input id="activity-venue" type="text" placeholder="Enter venue" required>

        <label class="publish-option">
          <input id="activity-published" type="checkbox" checked>
          Publish to parents immediately
        </label>

        <button type="submit" class="primary-btn">Create Activity</button>
      </form>
    </section>
  `
}

function renderActivitySection(title, activities, roster, responses, sectionType) {
  return `
    <section class="activity-section">
      <div class="section-heading">
        <h3>${title}</h3>
        <span class="muted">${activities.length} activities</span>
      </div>

      ${activities.length
        ? activities.map(activity =>
            renderActivityCard(activity, roster, responses, sectionType)
          ).join('')
        : `
          <div class="empty-state">
            No ${sectionType === 'past' ? 'past' : 'upcoming'} activities.
          </div>
        `
      }
    </section>
  `
}

function renderActivityCard(activity, roster, responses, sectionType) {
  const activityPlayers = roster.filter(player =>
    !activity.age_group || player.age_group === activity.age_group
  )

  const activityResponses = responses.filter(
    response => response.activity_id === activity.id
  )

  const attending = activityResponses.filter(
    response => response.answer === 'yes'
  ).length

  const absent = activityResponses.filter(
    response => response.answer === 'no'
  ).length

  const unanswered = activityPlayers.length - attending - absent

  return `
    <details class="activity-card collapsible-activity">
      <summary class="activity-summary">
        <div class="activity-summary-main">
          <div class="activity-type-icon">
            ${activity.activity_type === 'match' ? '🏆' : '⚽'}
          </div>

          <div class="activity-summary-info">
            <strong>${esc(activity.title)}</strong>
            <small>
              ${esc(activity.age_group || 'All Teams')}
              · ${formatDate(activity.activity_date)}
            </small>
            <small>
              ${esc(formatTime(activity.start_time))}
              ${activity.venue ? ' · ' + esc(activity.venue) : ''}
            </small>
          </div>
        </div>
        <span class="collapse-arrow">⌄</span>
      </summary>

      <div class="activity-content">
        <div class="activity-meta">
          <div>
            <label>Team</label>
            <strong>${esc(activity.age_group || 'All Teams')}</strong>
          </div>
          <div>
            <label>Date</label>
            <strong>${formatDate(activity.activity_date)}</strong>
          </div>
          <div>
            <label>Time</label>
            <strong>${esc(formatTime(activity.start_time))}</strong>
          </div>
          <div>
            <label>Venue</label>
            <strong>${esc(activity.venue || '-')}</strong>
          </div>
        </div>

        <div class="attendance-summary">
          <div class="attendance-stat">
            <strong>${attending}</strong>
            <small>Attending</small>
          </div>
          <div class="attendance-stat">
            <strong>${absent}</strong>
            <small>Absent</small>
          </div>
          <div class="attendance-stat">
            <strong>${Math.max(0, unanswered)}</strong>
            <small>No response</small>
          </div>
        </div>

        <h4>Player Attendance</h4>

        ${activityPlayers.length
          ? activityPlayers.map(player => {
              const response = activityResponses.find(
                item => item.player_id === player.id
              )

              return renderAttendancePlayer(player, response, activity, sectionType)
            }).join('')
          : `
            <div class="empty-state">
              No players assigned to this team.
            </div>
          `
        }

        ${canManage() ? `
          <div class="activity-admin-actions">
            <button
              class="delete-btn"
              data-action="delete-activity"
              data-activity="${activity.id}"
              data-title="${esc(activity.title)}"
            >
              Delete Activity
            </button>
          </div>
        ` : ''}
      </div>
    </details>
  `
}

function renderAttendancePlayer(player, response, activity, sectionType) {
  const answer = response?.answer || ''
  const isParent = profile.role === 'parent'
  const canRespond = isParent && sectionType === 'upcoming'

  return `
    <div class="attendance-player">
      <div class="attendance-player-info">
        <strong>${esc(player.name)}</strong>
        <small>
          ${player.jersey_number !== null && player.jersey_number !== undefined
            ? '#' + esc(player.jersey_number)
            : ''}
        </small>
      </div>

      ${canRespond ? `
        <div class="attendance-controls">
          <select
            class="attendance-select"
            data-player="${player.id}"
            data-activity="${activity.id}"
          >
            <option value="" ${!answer ? 'selected' : ''}>Select</option>
            <option value="yes" ${answer === 'yes' ? 'selected' : ''}>Attending</option>
            <option value="no" ${answer === 'no' ? 'selected' : ''}>Absent</option>
          </select>

          ${answer === 'no' ? `
            <input
              class="absence-reason"
              data-player="${player.id}"
              data-activity="${activity.id}"
              type="text"
              placeholder="Reason for absence (optional)"
              value="${esc(response?.absence_reason || '')}"
            >
          ` : ''}

          <button
            class="small-save-btn"
            data-action="save-attendance"
            data-player="${player.id}"
            data-activity="${activity.id}"
          >
            Save
          </button>
        </div>
      ` : `
        <div class="attendance-status ${
          answer === 'yes' ? 'status-yes' :
          answer === 'no' ? 'status-no' : 'status-pending'
        }">
          ${answer === 'yes' ? 'Attending' : answer === 'no' ? 'Absent' : 'No response'}
        </div>

        ${answer === 'no' && response?.absence_reason ? `
          <small class="absence-note">${esc(response.absence_reason)}</small>
        ` : ''}
      `}
    </div>
  `
}

// --------------------------------------------------
// CREATE ACTIVITY
// --------------------------------------------------

async function createActivity(event) {
  event.preventDefault()
  if (!canManage()) return

  const team = document.querySelector('#activity-team').value
  const type = document.querySelector('#activity-type').value
  const title = document.querySelector('#activity-title').value.trim()
  const date = document.querySelector('#activity-date').value
  const time = document.querySelector('#activity-time').value
  const venue = document.querySelector('#activity-venue').value.trim()
  const published = document.querySelector('#activity-published').checked

  if (!team || !title || !date || !time || !venue) {
    showMessage('Please complete all activity details.')
    return
  }

  const { error } = await supabase
    .from('activities')
    .insert({
      title,
      age_group: team,
      activity_type: type,
      activity_date: date,
      start_time: time,
      venue,
      is_published: published
    })

  if (error) {
    showMessage('Unable to create activity: ' + error.message)
    return
  }

  showMessage(`${team} activity created successfully.`)
  await attendancePage()
}

// --------------------------------------------------
// SAVE ATTENDANCE
// --------------------------------------------------

async function saveAttendance(playerId, activityId) {
  if (profile.role !== 'parent') return

  const select = document.querySelector(
    `.attendance-select[data-player="${playerId}"][data-activity="${activityId}"]`
  )

  if (!select || !select.value) {
    showMessage('Please select attending or absent.')
    return
  }

  const answer = select.value

  const reasonInput = document.querySelector(
    `.absence-reason[data-player="${playerId}"][data-activity="${activityId}"]`
  )

  const reason = answer === 'no'
    ? (reasonInput?.value.trim() || null)
    : null

  const { error } = await supabase
    .from('responses')
    .upsert({
      activity_id: activityId,
      player_id: playerId,
      responded_by: user.id,
      answer,
      absence_reason: reason
    }, {
      onConflict: 'activity_id,player_id'
    })

  if (error) {
    showMessage('Unable to save attendance: ' + error.message)
    return
  }

  showMessage('Attendance response saved.')
  await attendancePage()
}

// --------------------------------------------------
// DELETE ACTIVITY
// --------------------------------------------------

async function deleteActivity(activityId, activityTitle) {
  if (!canManage()) return

  const confirmed = confirm(
    `Are you sure you want to delete "${activityTitle}"?\n\nThis action cannot be undone.`
  )

  if (!confirmed) return

  const { data, error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .select('id')

  if (error) {
    showMessage(
      'Unable to delete activity: ' + error.message +
      '\n\nIf attendance responses are linked to this activity, they may need to be handled first.'
    )
    return
  }

  if (!data || data.length === 0) {
    showMessage(
      'The activity was not deleted. Check your Supabase delete permissions.'
    )
    return
  }

  showMessage('Activity deleted.')
  await attendancePage()
}

// --------------------------------------------------
// OTHER SECTIONS
// --------------------------------------------------

function placeholderPage(title, icon, message) {
  return `
    ${header()}

    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>${icon} ${title}</h2>
      </div>
      <div class="empty-state">${message}</div>
    </main>
  `
}

// --------------------------------------------------
// PAGE RENDERING
// --------------------------------------------------

async function render() {
  if (!user) {
    loginPage()
    return
  }

  try {
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
      root.innerHTML = placeholderPage(
        'Payment',
        '💳',
        'Payment information will be available here.'
      )
    } else if (currentPage === 'videos') {
      root.innerHTML = placeholderPage(
        'Videos',
        '🎬',
        'Academy videos will be available here.'
      )
    }
  } catch (error) {
    console.error(error)

    root.innerHTML = `
      ${header()}
      <main class="container">
        <div class="empty-state">
          Something went wrong: ${esc(error.message)}
        </div>
      </main>
    `
  }
}

// --------------------------------------------------
// EVENT HANDLERS
// --------------------------------------------------

root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]')
  if (!target) return

  const action = target.dataset.action

  try {
    if (action === 'choose-parent') {
      loginType = 'parent'
      isSigningUp = false
      render()
    } else if (action === 'choose-staff') {
      loginType = 'staff'
      isSigningUp = false
      render()
    } else if (action === 'change-login') {
      loginType = null
      isSigningUp = false
      render()
    } else if (action === 'toggle-signup') {
      isSigningUp = !isSigningUp
      render()
    } else if (action === 'logout') {
      await logout()
    } else if (action === 'home') {
      currentPage = 'home'
      render()
    } else if (action === 'page') {
      currentPage = target.dataset.page
      render()
    } else if (action === 'team') {
      selectedTeam = target.dataset.team
      currentPage = 'roster'
      render()
    } else if (action === 'player') {
      selectedPlayer = target.dataset.player
      currentPage = 'player'
      render()
    } else if (action === 'profile-back') {
      currentPage = 'profile'
      render()
    } else if (action === 'save-player') {
      await savePlayerProfile()
    } else if (action === 'save-attendance') {
      await saveAttendance(
        target.dataset.player,
        target.dataset.activity
      )
    } else if (action === 'delete-activity') {
      await deleteActivity(
        target.dataset.activity,
        target.dataset.title
      )
    }
  } catch (error) {
    console.error(error)
    showMessage(error.message || 'An unexpected error occurred.')
  }
})

// --------------------------------------------------
// FORM HANDLERS
// --------------------------------------------------

root.addEventListener('submit', async event => {
  if (event.target.id === 'login-form') {
    event.preventDefault()

    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value

    try {
      if (isSigningUp) {
        const name = document.querySelector('#full-name').value.trim()

        if (!name) {
          showMessage('Please enter your full name.')
          return
        }

        await createParentAccount(name, email, password)
      } else {
        await login(email, password)
      }
    } catch (error) {
      showMessage(error.message)
    }
  }

  if (event.target.id === 'create-activity-form') {
    await createActivity(event)
  }
})

// --------------------------------------------------
// AUTH SESSION CHECK
// --------------------------------------------------

async function startApp() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error(error)
    loginPage()
    return
  }

  if (data.session?.user) {
    user = data.session.user

    try {
      await loadProfile()
      await loadPlayers()
      currentPage = 'home'
    } catch (error) {
      console.error(error)
      await supabase.auth.signOut()
      user = null
      profile = null
      currentPage = 'login'
    }
  }

  render()
}

startApp()

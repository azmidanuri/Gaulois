import { createClient } from '@supabase/supabase-js'
import './style.css'
import './portal-features.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const root = document.querySelector('#app')

const DEFAULT_TEAMS = ['U15', 'U12', 'U11', 'U10']
const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

let user = null
let profile = null
let players = []
let linkedPlayers = []
let squadRosterPlayers = []
let teams = []
let currentPage = 'login'
let loginType = null
let selectedTeam = 'U12'
let selectedPlayer = null
let selectedManagementTeam = null
let isSigningUp = false
let fixtures = []
let announcements = []
let squadSelections = []

// SVG ICONS

function icon(name, size = 22) {
  const icons = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    football: '<circle cx="12" cy="12" r="10"/><path d="m12 7 4 3-1.5 5h-5L8 10l4-3Z"/><path d="m12 7-1-5M16 10l5-1M14.5 15l2.5 5M9.5 15 7 20M8 10l-5-1"/>',
    megaphone: '<path d="m3 11 18-5v12L3 13v-2Z"/><path d="M11.6 15.4 14 22H9l-2-7M5 14v5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H3v2a5 5 0 0 0 5 5M17 6h4v2a5 5 0 0 1-5 5"/>',
    credit: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="m15 18-6-6 6-6M20 12H9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'
  }

  return `
    <svg class="portal-icon portal-icon-${name}"
      xmlns="http://www.w3.org/2000/svg"
      width="${size}" height="${size}"
      viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">
      ${icons[name] || icons.user}
    </svg>
  `
}

// HELPERS

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return 'Date not set'
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function formatTime(value) {
  if (!value) return ''
  const [h, m] = value.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-SG', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function canManage() {
  return Boolean(profile && profile.role !== 'parent')
}

function visiblePlayers() {
  return profile?.role === 'parent' ? linkedPlayers : players
}

function showMessage(message) {
  alert(message)
}

function backButton() {
  return `<button class="back-btn" data-action="home">${icon('back', 17)} Back to Home</button>`
}

function jerseyDisplay(player) {
  return player.jersey_number !== null &&
    player.jersey_number !== undefined &&
    String(player.jersey_number).trim() !== ''
    ? esc(player.jersey_number)
    : 'GA'
}

function activeTeams() {
  return teams.filter(t => t.is_active !== false)
}

function teamNames() {
  return activeTeams().map(t => t.name)
}

function teamOptions(selected = '') {
  const names = teamNames().length ? teamNames() : DEFAULT_TEAMS
  return names.map(t =>
    `<option value="${esc(t)}" ${t === selected ? 'selected' : ''}>${esc(t)}</option>`
  ).join('')
}

function dateIsPast(date) {
  return Boolean(date && date < today())
}

function teamPlayerCount(teamName) {
  return players.filter(p => p.age_group === teamName).length
}

function findTeam(name) {
  return teams.find(t => t.name === name)
}

function staffOnlyPage() {
  if (!canManage()) {
    currentPage = 'home'
    render()
    return true
  }
  return false
}

async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name')

  if (error) {
    console.error('Teams could not be loaded:', error.message)
    teams = DEFAULT_TEAMS.map((name, index) => ({
      id: `fallback-${index}`,
      name,
      coach_name: null,
      is_active: true
    }))
    return
  }

  teams = data || []

  if (!teams.length) {
    teams = DEFAULT_TEAMS.map((name, index) => ({
      id: `fallback-${index}`,
      name,
      coach_name: null,
      is_active: true
    }))
  }
}

// AUTHENTICATION

function loginPage() {
  root.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <div class="login-brand">
          <img src="/gaulois-logo.png" class="login-logo" alt="Gaulois Aerion Academy">
          <h1>Gaulois Aerion Academy</h1>
          <p>ACADEMY PORTAL</p>
        </div>

        ${!loginType ? `
          <div class="login-choice-content">
            <span class="login-eyebrow">WELCOME</span>
            <h2>Choose your login</h2>
            <p class="login-description">Select your portal to continue</p>

            <div class="login-choice-grid">
              <button type="button" class="login-choice" data-action="choose-parent">
                <span class="login-choice-icon">${icon('users', 27)}</span>
                <strong>Parent/Player Login</strong>
                <small>Attendance, activities and player information</small>
                <span class="login-choice-arrow">${icon('arrow', 19)}</span>
              </button>

              <button type="button" class="login-choice" data-action="choose-staff">
                <span class="login-choice-icon">${icon('shield', 27)}</span>
                <strong>Staff Login</strong>
                <small>Manage teams, players and academy activities</small>
                <span class="login-choice-arrow">${icon('arrow', 19)}</span>
              </button>
            </div>

            <p class="login-hint">Select a card to proceed to your login</p>
          </div>
        ` : `
          <div class="login-form-content">
            <button class="back-btn login-change-btn" data-action="change-login">
              ${icon('back', 17)} Change Login Type
            </button>

            <span class="login-eyebrow">PORTAL ACCESS</span>
            <h2>${loginType === 'parent' ? 'Parent/Player Login' : 'Staff Login'}</h2>
            <p class="login-description">Enter your account details to continue</p>

            <form id="login-form">
              ${isSigningUp ? `
                <label>Full Name</label>
                <input id="full-name" type="text" placeholder="Enter your full name" required>
              ` : ''}

              <label>Email Address</label>
              <input id="email" type="email" placeholder="Email address" required>

              <label>Password</label>
              <input id="password" type="password" placeholder="Password" required>

              <button type="submit" class="primary-btn">
                ${isSigningUp ? 'Create Account' : 'Login'}
              </button>
            </form>

            ${loginType === 'parent' ? `
              <button class="text-btn" data-action="toggle-signup">
                ${isSigningUp ? 'Already have an account? Login' : 'Create a parent account'}
              </button>
            ` : ''}
          </div>
        `}

        <div class="login-footer">GAULOIS AERION ACADEMY</div>
      </section>
    </main>
  `
}

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

    const ids = (links || []).map(x => x.player_id)
    linkedPlayers = players.filter(p => ids.includes(p.id))
  } else {
    linkedPlayers = players
  }
}

async function refreshPortalData() {
  await loadTeams()
  await loadPlayers()
}

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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

  await refreshPortalData()
  currentPage = 'home'
  render()
}

async function createParentAccount(name, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Account could not be created.')

  if (!data.session) {
    showMessage('Account created. Please verify your email, then log in.')
    isSigningUp = false
    render()
    return
  }

  user = data.user

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, full_name: name, role: 'parent' })

  if (profileError) throw profileError

  await loadProfile()
  await refreshPortalData()
  currentPage = 'home'
  render()
}

async function logout() {
  await supabase.auth.signOut()

  user = null
  profile = null
  players = []
  linkedPlayers = []
  squadRosterPlayers = []
  teams = []
  fixtures = []
  announcements = []
  squadSelections = []

  currentPage = 'login'
  loginType = null
  isSigningUp = false
  render()
}

// SHARED LAYOUT AND HOME

function header() {
  return `
    <header class="topbar">
      <div class="brand">
        <img src="/gaulois-logo.png" class="portal-logo" alt="Gaulois Aerion">
        <div>
          <div class="brand-name">Gaulois Aerion Academy</div>
          <small>Parent & Team Portal</small>
        </div>
      </div>
      <button class="logout-btn" data-action="logout">Logout</button>
    </header>
  `
}

function menuCard(title, iconName, page) {
  return `
    <article class="menu-card" role="button" tabindex="0"
      data-action="page" data-page="${page}">
      <span class="menu-icon">${icon(iconName, 25)}</span>
      <strong>${title}</strong>
      <small>Open section ${icon('arrow', 13)}</small>
    </article>
  `
}

function homePage() {
  const roster = visiblePlayers()
  const names = profile.role === 'parent'
    ? [...new Set(roster.map(p => p.age_group).filter(Boolean))]
    : teamNames()

  const visibleTeams = names.map(name => findTeam(name) || {
    name,
    coach_name: null
  })

  return `
    ${header()}
    <main class="container">
      <div class="welcome-section">
        <h2>Welcome, ${esc(profile.full_name || 'User')}</h2>
        <p class="muted">Select a section to continue.</p>
      </div>

      <section class="menu-grid">
        ${menuCard('Player Profiles', 'users', 'profile')}
        ${menuCard('Attendance', 'calendar', 'attendance')}
        ${menuCard('Fixtures & Results', 'trophy', 'fixtures')}
        ${menuCard('Announcements', 'megaphone', 'announcements')}
        ${menuCard('Matchday Squad', 'users', 'squads')}
        ${menuCard('Payment', 'credit', 'payment')}
        ${menuCard('Videos', 'video', 'videos')}

        ${canManage() ? `
          ${menuCard('Team Management', 'shield', 'team-management')}
          ${menuCard('Player Management', 'user', 'player-management')}
          ${menuCard('Squad Management', 'football', 'squad-management')}
        ` : ''}
      </section>

      <div class="section-heading">
        <h3>${profile.role === 'parent' ? 'My Teams' : 'Academy Teams'}</h3>
      </div>

      <section class="team-grid">
        ${visibleTeams.map(team => {
          const count = roster.filter(p => p.age_group === team.name).length
          return `
            <article class="team-card" data-action="team" data-team="${esc(team.name)}">
              <div class="team-card-icon">${icon('football', 25)}</div>
              <h3>${esc(team.name)}</h3>
              <p class="player-count">${count} ${count === 1 ? 'Player' : 'Players'}</p>
              ${team.coach_name ? `<span>Coach: ${esc(team.coach_name)}</span>` : ''}
              <span>View full roster ${icon('arrow', 14)}</span>
            </article>
          `
        }).join('') || '<div class="empty-state">No teams available.</div>'}
      </section>
    </main>
  `
}

// ROSTER AND PLAYER PROFILES

function rosterPage() {
  const roster = visiblePlayers()
    .filter(p => p.age_group === selectedTeam)
    .sort((a, b) => a.name.localeCompare(b.name))

  return `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>${esc(selectedTeam)} Full Roster</h2>
        <p class="muted">${roster.length} registered players</p>
      </div>

      <section class="roster-list">
        ${roster.length ? roster.map(p => `
          <article class="player-card">
            <div class="player-number">${jerseyDisplay(p)}</div>
            <div class="player-info">
              <strong>${esc(p.name)}</strong>
              <small>${esc(p.position || 'Position not assigned')}</small>
            </div>
            <button class="view-btn" data-action="player" data-player="${p.id}">
              View ${icon('arrow', 14)}
            </button>
          </article>
        `).join('') : '<div class="empty-state">No players in this team.</div>'}
      </section>
    </main>
  `
}

function profilePage() {
  const roster = visiblePlayers()
  const names = profile.role === 'parent'
    ? [...new Set(roster.map(p => p.age_group).filter(Boolean))]
    : teamNames()

  return `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>Player Profiles</h2>
        <p class="muted">Browse players by team. Tap a team to expand its roster.</p>
      </div>

      <section class="profile-team-groups">
        ${names.map(team => {
          const group = roster.filter(p => p.age_group === team)
            .sort((a, b) => a.name.localeCompare(b.name))

          return `
            <details class="profile-team-section">
              <summary class="profile-team-heading">
                <div class="profile-team-title">
                  <h3>${esc(team)} TEAM</h3>
                  <small>Gaulois Aerion Academy</small>
                </div>
                <div class="profile-team-right">
                  <span class="profile-team-count">${group.length} PLAYERS</span>
                  <span class="profile-chevron">${icon('chevron', 19)}</span>
                </div>
              </summary>

              <div class="profile-team-content">
                <div class="roster-list">
                  ${group.map(p => `
                    <article class="player-card">
                      <div class="player-number">${jerseyDisplay(p)}</div>
                      <div class="player-info">
                        <strong>${esc(p.name)}</strong>
                        <small>${esc(p.position || 'Position not assigned')}</small>
                      </div>
                      <button class="view-btn" data-action="player" data-player="${p.id}">
                        View ${icon('arrow', 14)}
                      </button>
                    </article>
                  `).join('') || '<div class="empty-state">No players registered yet.</div>'}
                </div>
              </div>
            </details>
          `
        }).join('')}
      </section>
    </main>
  `
}

function playerPage() {
  const p = visiblePlayers().find(x => String(x.id) === String(selectedPlayer))
  if (!p) return homePage()

  return `
    ${header()}
    <main class="container">
      <button class="back-btn" data-action="profile-back">${icon('back', 17)} Back to Profiles</button>

      <section class="player-profile">
        <div class="player-profile-banner">
          <div class="football-avatar">${icon('football', 34)}</div>
          <h2>${esc(p.name)}</h2>
          <span class="team-badge">${esc(p.age_group || 'Academy')}</span>
        </div>

        <div class="player-profile-content">
          <h3>Player Information</h3>

          <div class="profile-field">
            <label>Full Name</label>
            <div>${esc(p.name)}</div>
          </div>

          <div class="profile-field">
            <label>Team</label>
            <div>${esc(p.age_group || '-')}</div>
          </div>

          <div class="profile-field">
            <label>Date of Birth</label>
            <div>${esc(p.date_of_birth || '-')}</div>
          </div>

          <div class="profile-field">
            <label>Jersey Number</label>
            ${canManage()
              ? `<input id="jersey-number" type="number" min="1" max="99" value="${esc(p.jersey_number ?? '')}" placeholder="Enter jersey number">`
              : `<div>${p.jersey_number ?? 'Unassigned'}</div>`}
          </div>

          <div class="profile-field">
            <label>Position</label>
            ${canManage()
              ? `<select id="player-position">
                  <option value="">Select position</option>
                  ${POSITIONS.map(pos => `<option value="${pos}" ${p.position === pos ? 'selected' : ''}>${pos}</option>`).join('')}
                </select>`
              : `<div>${esc(p.position || 'Not assigned')}</div>`}
          </div>

          ${canManage() ? '<button class="primary-btn" data-action="save-player">Save Changes</button>' : ''}
        </div>
      </section>
    </main>
  `
}

async function savePlayerProfile() {
  if (!canManage()) return

  const raw = document.querySelector('#jersey-number')?.value.trim()
  const position = document.querySelector('#player-position')?.value
  const jersey = raw ? Number(raw) : null

  if (raw && (!Number.isInteger(jersey) || jersey < 1 || jersey > 99)) {
    return showMessage('Jersey number must be between 1 and 99.')
  }

  const { error } = await supabase.from('players')
    .update({ jersey_number: jersey, position: position || null })
    .eq('id', selectedPlayer)

  if (error) return showMessage('Unable to update player: ' + error.message)

  await loadPlayers()
  showMessage('Player profile updated successfully.')
  render()
}

// TEAM MANAGEMENT

function teamManagementPage() {
  if (staffOnlyPage()) return ''

  const active = teams.filter(t => t.is_active !== false)
  const archived = teams.filter(t => t.is_active === false)

  return `
    ${header()}
    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>Team Management</h2>
        <p class="muted">Create teams, assign coaches and manage academy age groups.</p>
      </div>

      <section class="management-panel">
        <h3>${icon('plus', 19)} Add New Team</h3>
        <form id="create-team-form" class="portal-form-grid">
          <div>
            <label>Team Name</label>
            <input id="new-team-name" placeholder="e.g. U13" required maxlength="30">
          </div>
          <div>
            <label>Coach Name</label>
            <input id="new-team-coach" placeholder="Coach name">
          </div>
          <div class="form-span">
            <button type="submit" class="primary-btn">Create Team</button>
          </div>
        </form>
      </section>

      <div class="section-heading">
        <h3>Active Teams</h3>
        <span class="muted">${active.length} teams</span>
      </div>

      <div class="management-list">
        ${active.map(team => `
          <article class="management-item">
            <div class="management-item-icon">${icon('football', 23)}</div>
            <div class="management-item-info">
              <strong>${esc(team.name)}</strong>
              <small>${teamPlayerCount(team.name)} players · Coach: ${esc(team.coach_name || 'Not assigned')}</small>
            </div>
            <div class="management-actions">
              <button class="view-btn" data-action="edit-team" data-id="${team.id}">${icon('edit', 15)} Edit</button>
              <button class="delete-btn" data-action="archive-team" data-id="${team.id}" data-name="${esc(team.name)}">Archive</button>
            </div>
          </article>
        `).join('') || '<div class="empty-state">No active teams.</div>'}
      </div>

      ${archived.length ? `
        <section class="activity-section">
          <div class="section-heading"><h3>Archived Teams</h3></div>
          <div class="management-list">
            ${archived.map(team => `
              <article class="management-item archived-item">
                <div class="management-item-icon">${icon('archive', 22)}</div>
                <div class="management-item-info">
                  <strong>${esc(team.name)}</strong>
                  <small>${teamPlayerCount(team.name)} players · Archived</small>
                </div>
                <button class="view-btn" data-action="restore-team" data-id="${team.id}">Restore</button>
              </article>
            `).join('')}
          </div>
        </section>
      ` : ''}
    </main>
  `
}

async function createTeam(event) {
  event.preventDefault()
  if (!canManage()) return

  const name = document.querySelector('#new-team-name').value.trim().toUpperCase()
  const coach_name = document.querySelector('#new-team-coach').value.trim() || null

  if (!name) return showMessage('Enter a team name.')
  if (teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    return showMessage('A team with this name already exists.')
  }

  const { error } = await supabase.from('teams').insert({
    name,
    coach_name,
    is_active: true
  })

  if (error) return showMessage('Unable to create team: ' + error.message)

  await loadTeams()
  showMessage(`${name} team created.`)
  render()
}

async function editTeam(id) {
  if (!canManage()) return

  const team = teams.find(t => String(t.id) === String(id))
  if (!team) return showMessage('Team not found.')

  const newName = prompt('Team name:', team.name)
  if (newName === null) return

  const name = newName.trim().toUpperCase()
  if (!name) return showMessage('Team name cannot be empty.')

  if (teams.some(t => t.id !== team.id && t.name.toLowerCase() === name.toLowerCase())) {
    return showMessage('A team with this name already exists.')
  }

  const coach = prompt('Coach name:', team.coach_name || '')
  if (coach === null) return

  const oldName = team.name

  const { error } = await supabase.from('teams')
    .update({ name, coach_name: coach.trim() || null })
    .eq('id', id)

  if (error) return showMessage('Unable to update team: ' + error.message)

  if (oldName !== name) {
    const tables = ['players', 'activities', 'fixtures', 'announcements']

    for (const table of tables) {
      const { error: updateError } = await supabase
        .from(table)
        .update({ age_group: name })
        .eq('age_group', oldName)

      if (updateError) {
        showMessage(`Team renamed, but ${table} could not be updated: ${updateError.message}`)
      }
    }

    if (selectedTeam === oldName) selectedTeam = name
  }

  await refreshPortalData()
  showMessage('Team updated.')
  render()
}

async function archiveTeam(id, name) {
  if (!canManage()) return
  if (teamPlayerCount(name) > 0) {
    return showMessage('Move all players out of this team before archiving it.')
  }

  if (!confirm(`Archive ${name}? It will no longer appear in active team selections.`)) return

  const { error } = await supabase.from('teams')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return showMessage('Unable to archive team: ' + error.message)

  await loadTeams()
  showMessage(`${name} archived.`)
  render()
}

async function restoreTeam(id) {
  if (!canManage()) return

  const { error } = await supabase.from('teams')
    .update({ is_active: true })
    .eq('id', id)

  if (error) return showMessage('Unable to restore team: ' + error.message)

  await loadTeams()
  showMessage('Team restored.')
  render()
}

// PLAYER MANAGEMENT

function playerManagementPage() {
  if (staffOnlyPage()) return ''

  const active = activeTeams()
  const teamGroupNames = [
    ...new Set([
      ...active.map(team => team.name),
      ...players.map(player => player.age_group).filter(Boolean)
    ])
  ].sort((a, b) => a.localeCompare(b))

  const sortedPlayers = players.slice().sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  const unassignedPlayers = sortedPlayers.filter(player =>
    !player.age_group
  )

  return `
    ${header()}
    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>Player Management</h2>
        <p class="muted">Register new players and maintain player records.</p>
      </div>

      <section class="management-panel">
        <h3>${icon('plus', 19)} Register New Player</h3>

        <form id="create-player-form" class="portal-form-grid">
          <div class="form-span">
            <label>Player Full Name</label>
            <input id="new-player-name" required placeholder="Enter player's full name">
          </div>

          <div>
            <label>Team</label>
            <select id="new-player-team" required>${teamOptions('U12')}</select>
          </div>

          <div>
            <label>Date of Birth</label>
            <input id="new-player-dob" type="date">
          </div>

          <div>
            <label>Jersey Number</label>
            <input id="new-player-jersey" type="number" min="1" max="99" placeholder="Optional">
          </div>

          <div>
            <label>Position</label>
            <select id="new-player-position">
              <option value="">Select position</option>
              ${POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>

          <div class="form-span">
            <button type="submit" class="primary-btn">Register Player</button>
          </div>
        </form>
      </section>

      <div class="section-heading">
        <h3>Registered Players</h3>
        <span class="muted">${players.length} players</span>
      </div>

      <section class="player-management-groups">
        ${teamGroupNames.map(teamName => {
          const group = sortedPlayers.filter(player =>
            player.age_group === teamName
          )

          return `
            <details class="profile-team-section player-management-team">
              <summary class="profile-team-heading">
                <div class="profile-team-title">
                  <h3>${esc(teamName)} TEAM</h3>
                  <small>Gaulois Aerion Academy</small>
                </div>
                <div class="profile-team-right">
                  <span class="profile-team-count">
                    ${group.length} ${group.length === 1 ? 'PLAYER' : 'PLAYERS'}
                  </span>
                  <span class="profile-chevron">${icon('chevron', 19)}</span>
                </div>
              </summary>

              <div class="profile-team-content">
                <div class="management-list">
                  ${group.map(p => `
                    <article class="management-item">
                      <div class="player-number">${jerseyDisplay(p)}</div>
                      <div class="management-item-info">
                        <strong>${esc(p.name)}</strong>
                        <small>
                          ${esc(p.position || 'Position not assigned')}
                          ${p.date_of_birth ? ' · DOB: ' + esc(p.date_of_birth) : ''}
                        </small>
                      </div>
                      <div class="management-actions">
                        <button class="view-btn" data-action="edit-player" data-id="${p.id}">
                          ${icon('edit', 15)} Edit
                        </button>
                        <button class="delete-btn" data-action="delete-player"
                          data-id="${p.id}" data-name="${esc(p.name)}">
                          ${icon('trash', 15)} Remove
                        </button>
                      </div>
                    </article>
                  `).join('')}
                </div>
              </div>
            </details>
          `
        }).join('')}

        ${unassignedPlayers.length ? `
          <details class="profile-team-section player-management-team">
            <summary class="profile-team-heading">
              <div class="profile-team-title">
                <h3>NO TEAM ASSIGNED</h3>
                <small>Players awaiting team allocation</small>
              </div>
              <div class="profile-team-right">
                <span class="profile-team-count">
                  ${unassignedPlayers.length}
                  ${unassignedPlayers.length === 1 ? 'PLAYER' : 'PLAYERS'}
                </span>
                <span class="profile-chevron">${icon('chevron', 19)}</span>
              </div>
            </summary>

            <div class="profile-team-content">
              <div class="management-list">
                ${unassignedPlayers.map(p => `
                  <article class="management-item">
                    <div class="player-number">${jerseyDisplay(p)}</div>
                    <div class="management-item-info">
                      <strong>${esc(p.name)}</strong>
                      <small>
                        ${esc(p.position || 'Position not assigned')}
                        ${p.date_of_birth ? ' · DOB: ' + esc(p.date_of_birth) : ''}
                      </small>
                    </div>
                    <div class="management-actions">
                      <button class="view-btn" data-action="edit-player" data-id="${p.id}">
                        ${icon('edit', 15)} Edit
                      </button>
                      <button class="delete-btn" data-action="delete-player"
                        data-id="${p.id}" data-name="${esc(p.name)}">
                        ${icon('trash', 15)} Remove
                      </button>
                    </div>
                  </article>
                `).join('')}
              </div>
            </div>
          </details>
        ` : ''}

        ${players.length === 0 ? `
          <div class="empty-state">No players registered yet.</div>
        ` : ''}
      </section>
    </main>
  `
}

async function createPlayer(event) {
  event.preventDefault()
  if (!canManage()) return

  const name = document.querySelector('#new-player-name').value.trim()
  const age_group = document.querySelector('#new-player-team').value
  const dob = document.querySelector('#new-player-dob').value || null
  const rawJersey = document.querySelector('#new-player-jersey').value
  const jersey_number = rawJersey === '' ? null : Number(rawJersey)
  const position = document.querySelector('#new-player-position').value || null

  if (!name) return showMessage('Enter the player name.')
  if (rawJersey && (!Number.isInteger(jersey_number) || jersey_number < 1 || jersey_number > 99)) {
    return showMessage('Jersey number must be between 1 and 99.')
  }

  const { error } = await supabase.from('players').insert({
    name,
    age_group,
    date_of_birth: dob,
    jersey_number,
    position
  })

  if (error) return showMessage('Unable to register player: ' + error.message)

  await loadPlayers()
  showMessage(`${name} registered successfully.`)
  render()
}

async function editPlayer(id) {
  if (!canManage()) return

  const p = players.find(x => String(x.id) === String(id))
  if (!p) return showMessage('Player not found.')

  const nameInput = prompt('Player full name:', p.name)
  if (nameInput === null) return
  const name = nameInput.trim()
  if (!name) return showMessage('Player name cannot be empty.')

  const team = prompt(`Team (${teamNames().join(', ')}):`, p.age_group || '')
  if (team === null) return
  if (!teamNames().includes(team.trim())) return showMessage('Please enter an active team name.')

  const jerseyInput = prompt('Jersey number (leave blank if unassigned):', p.jersey_number ?? '')
  if (jerseyInput === null) return
  const jersey_number = jerseyInput.trim() ? Number(jerseyInput) : null
  if (jerseyInput.trim() && (!Number.isInteger(jersey_number) || jersey_number < 1 || jersey_number > 99)) {
    return showMessage('Jersey number must be between 1 and 99.')
  }

  const positionInput = prompt(`Position (${POSITIONS.join(', ')}):`, p.position || '')
  if (positionInput === null) return
  const position = positionInput.trim() || null
  if (position && !POSITIONS.includes(position)) return showMessage('Please enter a valid position.')

  const dobInput = prompt('Date of birth (YYYY-MM-DD):', p.date_of_birth || '')
  if (dobInput === null) return

  const { error } = await supabase.from('players')
    .update({
      name,
      age_group: team.trim(),
      jersey_number,
      position,
      date_of_birth: dobInput.trim() || null
    })
    .eq('id', id)

  if (error) return showMessage('Unable to update player: ' + error.message)

  await loadPlayers()
  showMessage('Player details updated.')
  render()
}

async function deletePlayer(id, name) {
  if (!canManage()) return

  if (!confirm(
    `Remove ${name} from the player register?\n\nThis may be blocked if the player has linked records such as attendance or matchday selections.`
  )) return

  const { data, error } = await supabase.from('players')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return showMessage('Unable to remove player: ' + error.message)
  if (!data?.length) {
    return showMessage('Player was not removed. Check your Supabase delete permissions.')
  }

  await loadPlayers()
  showMessage(`${name} removed.`)
  render()
}

// SQUAD MANAGEMENT - NORMAL TEAM ROSTERS

function squadManagementPage() {
  if (staffOnlyPage()) return ''

  const active = activeTeams()

  return `
    ${header()}
    <main class="container">
      ${backButton()}

      <div class="page-heading">
        <h2>Squad Management</h2>
        <p class="muted">Manage registered team rosters and move players between teams.</p>
      </div>

      <section class="management-panel">
        <h3>${icon('users', 19)} Transfer Player</h3>
        <form id="transfer-player-form" class="portal-form-grid">
          <div class="form-span">
            <label>Select Player</label>
            <select id="transfer-player" required>
              <option value="">Choose a player</option>
              ${players.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p =>
                `<option value="${p.id}">${esc(p.name)} — ${esc(p.age_group || 'No team')}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-span">
            <label>Move To Team</label>
            <select id="transfer-team" required>${teamOptions()}</select>
          </div>
          <div class="form-span">
            <button type="submit" class="primary-btn">Transfer Player</button>
          </div>
        </form>
      </section>

      <div class="section-heading">
        <h3>Team Rosters</h3>
        <span class="muted">${active.length} active teams</span>
      </div>

      <section class="profile-team-groups">
        ${active.map(team => {
          const group = players.filter(p => p.age_group === team.name)
            .sort((a, b) => a.name.localeCompare(b.name))

          return `
            <details class="profile-team-section">
              <summary class="profile-team-heading">
                <div class="profile-team-title">
                  <h3>${esc(team.name)} SQUAD</h3>
                  <small>Coach: ${esc(team.coach_name || 'Not assigned')}</small>
                </div>
                <div class="profile-team-right">
                  <span class="profile-team-count">${group.length} PLAYERS</span>
                  <span class="profile-chevron">${icon('chevron', 19)}</span>
                </div>
              </summary>

              <div class="profile-team-content">
                <div class="roster-list">
                  ${group.map(p => `
                    <article class="player-card">
                      <div class="player-number">${jerseyDisplay(p)}</div>
                      <div class="player-info">
                        <strong>${esc(p.name)}</strong>
                        <small>${esc(p.position || 'Position not assigned')}</small>
                      </div>
                      <button class="view-btn" data-action="edit-player" data-id="${p.id}">
                        Manage
                      </button>
                    </article>
                  `).join('') || '<div class="empty-state">No players in this squad.</div>'}
                </div>
              </div>
            </details>
          `
        }).join('')}
      </section>
    </main>
  `
}

async function transferPlayer(event) {
  event.preventDefault()
  if (!canManage()) return

  const playerId = document.querySelector('#transfer-player').value
  const team = document.querySelector('#transfer-team').value
  const player = players.find(p => String(p.id) === String(playerId))

  if (!player || !team) return showMessage('Select a player and destination team.')
  if (player.age_group === team) return showMessage('This player is already in that team.')

  const { error } = await supabase.from('players')
    .update({ age_group: team })
    .eq('id', playerId)

  if (error) return showMessage('Unable to transfer player: ' + error.message)

  await loadPlayers()
  showMessage(`${player.name} transferred to ${team}.`)
  render()
}

// ATTENDANCE

async function attendancePage() {
  const roster = visiblePlayers()
  const ids = roster.map(p => p.id)

  let q = supabase.from('activities').select('*')
    .order('activity_date', { ascending: true })

  if (!canManage()) q = q.eq('is_published', true)

  const { data, error } = await q
  if (error) throw error

  const visibleTeams = [...new Set(roster.map(p => p.age_group))]
  const activities = (data || []).filter(a =>
    canManage() || !a.age_group || visibleTeams.includes(a.age_group)
  )

  let responses = []
  if (ids.length) {
    const { data: rows, error: responseError } = await supabase
      .from('responses').select('*').in('player_id', ids)
    if (responseError) throw responseError
    responses = rows || []
  }

  root.innerHTML = `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>Attendance</h2>
        <p class="muted">Training and match availability</p>
      </div>

      ${canManage() ? createActivityForm() : ''}

      ${renderActivitySection('Upcoming Activities',
        activities.filter(a => !dateIsPast(a.activity_date)), roster, responses, 'upcoming')}

      ${renderActivitySection('Past Activities',
        activities.filter(a => dateIsPast(a.activity_date)), roster, responses, 'past')}
    </main>
  `
}

function createActivityForm() {
  return `
    <section class="activity-card">
      <h3>${icon('plus', 19)} Create New Activity</h3>
      <form id="create-activity-form">
        <label>Team / Age Group</label>
        <select id="activity-team" required>${teamOptions('U12')}</select>

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

function renderActivitySection(title, activities, roster, responses, type) {
  return `
    <section class="activity-section">
      <div class="section-heading">
        <h3>${title}</h3>
        <span class="muted">${activities.length} activities</span>
      </div>
      ${activities.length
        ? activities.map(a => renderActivityCard(a, roster, responses, type)).join('')
        : `<div class="empty-state">No ${type === 'past' ? 'past' : 'upcoming'} activities.</div>`}
    </section>
  `
}

function renderActivityCard(a, roster, responses, sectionType) {
  const group = roster.filter(p => !a.age_group || p.age_group === a.age_group)
  const rows = responses.filter(r => String(r.activity_id) === String(a.id))
  const yes = rows.filter(r => r.answer === 'yes').length
  const no = rows.filter(r => r.answer === 'no').length

  return `
    <details class="activity-card collapsible-activity">
      <summary class="activity-summary">
        <div class="activity-summary-main">
          <div class="activity-type-icon">${icon(a.activity_type === 'match' ? 'trophy' : 'football', 23)}</div>
          <div class="activity-summary-info">
            <strong>${esc(a.title)}</strong>
            <small>${esc(a.age_group || 'All Teams')} | ${formatDate(a.activity_date)}</small>
            <small>${esc(formatTime(a.start_time))}${a.venue ? ' | ' + esc(a.venue) : ''}</small>
          </div>
        </div>
        <span class="collapse-arrow">${icon('chevron', 19)}</span>
      </summary>

      <div class="activity-content">
        <div class="activity-meta">
          <div><label>Team</label><strong>${esc(a.age_group || 'All Teams')}</strong></div>
          <div><label>Date</label><strong>${formatDate(a.activity_date)}</strong></div>
          <div><label>Time</label><strong>${esc(formatTime(a.start_time))}</strong></div>
          <div><label>Venue</label><strong>${esc(a.venue || '-')}</strong></div>
        </div>

        <div class="attendance-summary">
          <div class="attendance-stat"><strong>${yes}</strong><small>Attending</small></div>
          <div class="attendance-stat"><strong>${no}</strong><small>Absent</small></div>
          <div class="attendance-stat"><strong>${Math.max(0, group.length - yes - no)}</strong><small>No response</small></div>
        </div>

        <h4>Player Attendance</h4>
        ${group.length
          ? group.map(p => renderAttendancePlayer(
              p,
              rows.find(r => String(r.player_id) === String(p.id)),
              a,
              sectionType
            )).join('')
          : '<div class="empty-state">No players assigned to this team.</div>'}

        ${canManage() ? `
          <div class="activity-admin-actions">
            <button class="delete-btn" data-action="delete-activity"
              data-activity="${a.id}" data-title="${esc(a.title)}">Delete Activity</button>
          </div>
        ` : ''}
      </div>
    </details>
  `
}

function renderAttendancePlayer(p, response, activity, sectionType) {
  const answer = response?.answer || ''
  const canRespond = profile.role === 'parent' && sectionType === 'upcoming'

  return `
    <div class="attendance-player">
      <div class="attendance-player-info">
        <strong>${esc(p.name)}</strong>
        <small>${p.jersey_number != null ? '#' + esc(p.jersey_number) : ''}</small>
      </div>

      ${canRespond ? `
        <div class="attendance-controls">
          <select class="attendance-select" data-player="${p.id}" data-activity="${activity.id}">
            <option value="" ${!answer ? 'selected' : ''}>Select</option>
            <option value="yes" ${answer === 'yes' ? 'selected' : ''}>Attending</option>
            <option value="no" ${answer === 'no' ? 'selected' : ''}>Absent</option>
          </select>

          ${answer === 'no' ? `
            <input class="absence-reason" data-player="${p.id}" data-activity="${activity.id}"
              type="text" placeholder="Reason for absence (optional)"
              value="${esc(response?.absence_reason || '')}">
          ` : ''}

          <button class="small-save-btn" data-action="save-attendance"
            data-player="${p.id}" data-activity="${activity.id}">Save</button>
        </div>
      ` : `
        <div class="attendance-status ${
          answer === 'yes' ? 'status-yes' :
          answer === 'no' ? 'status-no' : 'status-pending'
        }">${answer === 'yes' ? 'Attending' : answer === 'no' ? 'Absent' : 'No response'}</div>
        ${answer === 'no' && response?.absence_reason
          ? `<small class="absence-note">${esc(response.absence_reason)}</small>` : ''}
      `}
    </div>
  `
}

async function createActivity(event) {
  event.preventDefault()
  if (!canManage()) return

  const payload = {
    age_group: document.querySelector('#activity-team').value,
    activity_type: document.querySelector('#activity-type').value,
    title: document.querySelector('#activity-title').value.trim(),
    activity_date: document.querySelector('#activity-date').value,
    start_time: document.querySelector('#activity-time').value,
    venue: document.querySelector('#activity-venue').value.trim(),
    is_published: document.querySelector('#activity-published').checked
  }

  const { error } = await supabase.from('activities').insert(payload)
  if (error) return showMessage('Unable to create activity: ' + error.message)

  showMessage(`${payload.age_group} activity created successfully.`)
  await attendancePage()
}

async function saveAttendance(playerId, activityId) {
  if (profile.role !== 'parent') return

  const select = document.querySelector(
    `.attendance-select[data-player="${playerId}"][data-activity="${activityId}"]`
  )

  if (!select?.value) return showMessage('Please select attending or absent.')

  const answer = select.value
  const reasonInput = document.querySelector(
    `.absence-reason[data-player="${playerId}"][data-activity="${activityId}"]`
  )

  const { error } = await supabase.from('responses').upsert({
    activity_id: activityId,
    player_id: playerId,
    responded_by: user.id,
    answer,
    absence_reason: answer === 'no' ? (reasonInput?.value.trim() || null) : null
  }, { onConflict: 'activity_id,player_id' })

  if (error) return showMessage('Unable to save attendance: ' + error.message)

  showMessage('Attendance response saved.')
  await attendancePage()
}

async function deleteActivity(id, title) {
  if (!canManage() || !confirm(
    `Are you sure you want to delete "${title}"?\n\nThis action cannot be undone.`
  )) return

  const { data, error } = await supabase.from('activities')
    .delete().eq('id', id).select('id')

  if (error) return showMessage('Unable to delete activity: ' + error.message)
  if (!data?.length) return showMessage('The activity was not deleted. Check your Supabase delete permissions.')

  showMessage('Activity deleted.')
  await attendancePage()
}

// FIXTURES AND RESULTS

async function loadFixtures() {
  let q = supabase.from('fixtures').select('*')
    .order('fixture_date', { ascending: true })

  if (!canManage()) q = q.eq('is_published', true)

  const { data, error } = await q
  if (error) throw error

  const names = [...new Set(visiblePlayers().map(p => p.age_group))]
  fixtures = (data || []).filter(f =>
    canManage() || !f.age_group || names.includes(f.age_group)
  )
}

function fixtureForm() {
  return `
    <section class="activity-card">
      <h3>${icon('plus', 19)} Add Fixture / Result</h3>
      <form id="fixture-form" class="portal-form-grid">
        <div>
          <label>Team</label>
          <select id="fixture-team" required>${teamOptions('U12')}</select>
        </div>
        <div>
          <label>Competition</label>
          <input id="fixture-competition" placeholder="e.g. League / Cup">
        </div>
        <div>
          <label>Opponent</label>
          <input id="fixture-opponent" required placeholder="Opponent name">
        </div>
        <div>
          <label>Home or Away</label>
          <select id="fixture-location">
            <option value="Home">Home</option>
            <option value="Away">Away</option>
            <option value="Neutral">Neutral</option>
          </select>
        </div>
        <div>
          <label>Date</label>
          <input id="fixture-date" type="date" required>
        </div>
        <div>
          <label>Kick-off</label>
          <input id="fixture-time" type="time">
        </div>
        <div class="form-span">
          <label>Venue</label>
          <input id="fixture-venue" placeholder="Match venue">
        </div>
        <div>
          <label>Our score (optional)</label>
          <input id="fixture-home-score" type="number" min="0" placeholder="-">
        </div>
        <div>
          <label>Opponent score (optional)</label>
          <input id="fixture-away-score" type="number" min="0" placeholder="-">
        </div>
        <label class="publish-option form-span">
          <input id="fixture-published" type="checkbox" checked> Publish to parents
        </label>
        <div class="form-span">
          <button class="primary-btn" type="submit">Save Fixture</button>
        </div>
      </form>
    </section>
  `
}

function fixtureCard(f) {
  const hasScore = f.home_score !== null && f.home_score !== undefined &&
    f.away_score !== null && f.away_score !== undefined

  const score = hasScore
    ? `<div class="fixture-score">${f.home_score} <span>-</span> ${f.away_score}</div>`
    : '<div class="fixture-upcoming-label">UPCOMING</div>'

  return `
    <article class="fixture-card">
      <div class="fixture-card-top">
        <span class="team-badge">${esc(f.age_group || 'Academy')}</span>
        <span class="muted">${esc(f.competition || 'Fixture')}</span>
      </div>

      <div class="fixture-teams">
        <div class="fixture-side">
          <strong>Gaulois Aerion</strong>
          <small>${esc(f.home_away || 'Home')}</small>
        </div>
        ${score}
        <div class="fixture-side fixture-opponent">
          <strong>${esc(f.opponent)}</strong>
          <small>Opponent</small>
        </div>
      </div>

      <div class="fixture-details">
        <span>${icon('calendar', 15)} ${formatDate(f.fixture_date)}</span>
        ${f.kick_off ? `<span>${icon('clock', 15)} ${esc(formatTime(f.kick_off))}</span>` : ''}
        ${f.venue ? `<span>${icon('pin', 15)} ${esc(f.venue)}</span>` : ''}
      </div>

      ${canManage() ? `
        <div class="fixture-admin-actions">
          <button class="delete-btn" data-action="delete-fixture"
            data-id="${f.id}" data-opponent="${esc(f.opponent)}">Delete</button>
        </div>
      ` : ''}
    </article>
  `
}

async function fixturesPage() {
  await loadFixtures()

  const upcoming = fixtures.filter(f => !dateIsPast(f.fixture_date))
  const past = fixtures.filter(f => dateIsPast(f.fixture_date))

  root.innerHTML = `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>Fixtures & Results</h2>
        <p class="muted">Upcoming matches, scores and competition updates.</p>
      </div>

      ${canManage() ? fixtureForm() : ''}

      <section class="activity-section">
        <div class="section-heading">
          <h3>Upcoming Fixtures</h3>
          <span class="muted">${upcoming.length} matches</span>
        </div>
        ${upcoming.length ? upcoming.map(fixtureCard).join('') : '<div class="empty-state">No upcoming fixtures published.</div>'}
      </section>

      <section class="activity-section">
        <div class="section-heading">
          <h3>Past Results</h3>
          <span class="muted">${past.length} matches</span>
        </div>
        ${past.length ? past.slice().reverse().map(fixtureCard).join('') : '<div class="empty-state">No past results available.</div>'}
      </section>
    </main>
  `
}

async function createFixture(event) {
  event.preventDefault()
  if (!canManage()) return

  const homeRaw = document.querySelector('#fixture-home-score').value
  const awayRaw = document.querySelector('#fixture-away-score').value

  const payload = {
    age_group: document.querySelector('#fixture-team').value,
    competition: document.querySelector('#fixture-competition').value.trim() || null,
    opponent: document.querySelector('#fixture-opponent').value.trim(),
    home_away: document.querySelector('#fixture-location').value,
    fixture_date: document.querySelector('#fixture-date').value,
    kick_off: document.querySelector('#fixture-time').value || null,
    venue: document.querySelector('#fixture-venue').value.trim() || null,
    home_score: homeRaw === '' ? null : Number(homeRaw),
    away_score: awayRaw === '' ? null : Number(awayRaw),
    is_published: document.querySelector('#fixture-published').checked,
    created_by: user.id
  }

  const { error } = await supabase.from('fixtures').insert(payload)
  if (error) return showMessage('Unable to save fixture: ' + error.message)

  showMessage('Fixture saved successfully.')
  await fixturesPage()
}

async function deleteFixture(id, opponent) {
  if (!canManage() || !confirm(`Delete the fixture against ${opponent}?`)) return

  const { data, error } = await supabase.from('fixtures')
    .delete().eq('id', id).select('id')

  if (error) return showMessage('Unable to delete fixture: ' + error.message)
  if (!data?.length) return showMessage('Fixture was not deleted. Check your Supabase permissions.')

  showMessage('Fixture deleted.')
  await fixturesPage()
}

// ANNOUNCEMENTS

async function loadAnnouncements() {
  let q = supabase.from('announcements').select('*')
    .order('created_at', { ascending: false })

  if (!canManage()) q = q.eq('is_published', true)

  const { data, error } = await q
  if (error) throw error

  const names = [...new Set(visiblePlayers().map(p => p.age_group))]
  announcements = (data || []).filter(a =>
    canManage() || !a.age_group || names.includes(a.age_group)
  )
}

function announcementForm() {
  return `
    <section class="activity-card">
      <h3>${icon('plus', 19)} Post Announcement</h3>
      <form id="announcement-form">
        <label>Audience</label>
        <select id="announcement-team">
          <option value="">All Academy Teams</option>
          ${teamOptions()}
        </select>

        <label>Announcement Title</label>
        <input id="announcement-title" required maxlength="120" placeholder="e.g. Training venue update">

        <label>Message</label>
        <textarea id="announcement-body" rows="4" required placeholder="Write your announcement..."></textarea>

        <label class="publish-option">
          <input id="announcement-published" type="checkbox" checked> Publish immediately
        </label>

        <button type="submit" class="primary-btn">Publish Announcement</button>
      </form>
    </section>
  `
}

async function announcementsPage() {
  await loadAnnouncements()

  root.innerHTML = `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>Announcements</h2>
        <p class="muted">Academy news and important team updates.</p>
      </div>

      ${canManage() ? announcementForm() : ''}

      <section class="announcement-list">
        ${announcements.length ? announcements.map(a => `
          <article class="announcement-card">
            <div class="announcement-card-top">
              <span class="team-badge">${esc(a.age_group || 'All Teams')}</span>
              <small>${a.created_at ? new Date(a.created_at).toLocaleDateString('en-SG', {
                day: 'numeric', month: 'short', year: 'numeric'
              }) : ''}</small>
            </div>
            <h3>${esc(a.title)}</h3>
            <p>${esc(a.body).replace(/\n/g, '<br>')}</p>
            ${canManage() ? `
              <div class="fixture-admin-actions">
                <button class="delete-btn" data-action="delete-announcement"
                  data-id="${a.id}" data-title="${esc(a.title)}">Delete</button>
              </div>
            ` : ''}
          </article>
        `).join('') : '<div class="empty-state">There are no announcements at the moment.</div>'}
      </section>
    </main>
  `
}

async function createAnnouncement(event) {
  event.preventDefault()
  if (!canManage()) return

  const payload = {
    age_group: document.querySelector('#announcement-team').value || null,
    title: document.querySelector('#announcement-title').value.trim(),
    body: document.querySelector('#announcement-body').value.trim(),
    is_published: document.querySelector('#announcement-published').checked,
    created_by: user.id
  }

  if (!payload.title || !payload.body) return showMessage('Please enter a title and message.')

  const { error } = await supabase.from('announcements').insert(payload)
  if (error) return showMessage('Unable to publish announcement: ' + error.message)

  showMessage('Announcement saved.')
  await announcementsPage()
}

async function deleteAnnouncement(id, title) {
  if (!canManage() || !confirm(`Delete announcement "${title}"?`)) return

  const { data, error } = await supabase.from('announcements')
    .delete().eq('id', id).select('id')

  if (error) return showMessage('Unable to delete announcement: ' + error.message)
  if (!data?.length) return showMessage('Announcement was not deleted. Check your Supabase permissions.')

  showMessage('Announcement deleted.')
  await announcementsPage()
}

// MATCHDAY SQUADS

// Staff use the normal players table.
// Parents get a separate, limited squad roster from a secure Supabase view.
// This prevents squad visibility from exposing dates of birth or other player data.

async function loadSquadRoster() {
  if (canManage()) {
    squadRosterPlayers = players
    return
  }

  const { data, error } = await supabase
    .from('parent_team_squad_players')
    .select('id, name, age_group, position, jersey_number')
    .order('name')

  if (error) {
    throw new Error(
      'The team squad list could not be loaded. Please check the parent_team_squad_players view and its permissions. ' +
      error.message
    )
  }

  squadRosterPlayers = data || []
}

async function loadSquads() {
  const { data, error } = await supabase
    .from('fixture_squad_players')
    .select('*')

  if (error) throw error
  squadSelections = data || []
}

function renderSquadMatch(f, roster, isPast = false) {
  const squad = squadSelections.filter(s =>
    String(s.fixture_id) === String(f.id)
  )

  // Use the limited team roster for parents and the full player records for staff.
  const squadPlayers = squad.map(s =>
    squadRosterPlayers.find(p => String(p.id) === String(s.player_id))
  ).filter(Boolean).sort((a, b) => {
    const aNum = Number(a.jersey_number) || 999
    const bNum = Number(b.jersey_number) || 999
    return aNum - bNum || a.name.localeCompare(b.name)
  })

  const eligiblePlayers = roster.filter(p =>
    !f.age_group || p.age_group === f.age_group
  ).sort((a, b) => a.name.localeCompare(b.name))

  return `
    <details class="squad-match-card">
      <summary class="squad-match-summary">
        <div class="squad-match-main">
          <div class="activity-type-icon">${icon('trophy', 23)}</div>
          <div class="squad-match-info">
            <div class="squad-match-title-row">
              <span class="team-badge">${esc(f.age_group || 'Academy')}</span>
              ${isPast
                ? '<span class="squad-status squad-status-past">COMPLETED</span>'
                : '<span class="squad-status squad-status-upcoming">UPCOMING</span>'}
            </div>
            <h3>Gaulois Aerion vs ${esc(f.opponent)}</h3>
            <p class="muted">${formatDate(f.fixture_date)}</p>
            <small class="muted">
              ${f.kick_off ? icon('clock', 13) + ' ' + esc(formatTime(f.kick_off)) : ''}
              ${f.venue ? ' · ' + icon('pin', 13) + ' ' + esc(f.venue) : ''}
            </small>
          </div>
        </div>
        <div class="squad-match-right">
          <span class="squad-count">${squadPlayers.length} selected</span>
          <span class="collapse-arrow">${icon('chevron', 19)}</span>
        </div>
      </summary>

      <div class="squad-match-content">
        <div class="squad-content-heading">
          <div>
            <h4>Full Matchday Squad</h4>
            <p class="muted">${squadPlayers.length} players selected</p>
          </div>
        </div>

        ${canManage() ? `
          <details class="squad-editor">
            <summary>
              ${squadPlayers.length ? 'Edit Matchday Squad' : 'Select Matchday Squad'}
              <span>${icon('chevron', 17)}</span>
            </summary>

            <div class="squad-player-options">
              ${eligiblePlayers.length ? eligiblePlayers.map(p => `
                <label class="squad-player-option">
                  <input type="checkbox" class="squad-check"
                    data-fixture="${f.id}" value="${p.id}"
                    ${squad.some(s => String(s.player_id) === String(p.id)) ? 'checked' : ''}>
                  <span>
                    <strong>${esc(p.name)}</strong>
                    <small>${esc(p.position || 'Position not assigned')}
                      ${p.jersey_number != null ? ' | #' + esc(p.jersey_number) : ''}
                    </small>
                  </span>
                </label>
              `).join('') : '<div class="empty-state">No eligible players found.</div>'}
            </div>

            <button class="primary-btn" data-action="save-squad" data-fixture="${f.id}">
              Save Squad
            </button>
          </details>
        ` : ''}

        <div class="selected-squad-list">
          ${squadPlayers.length ? squadPlayers.map(p => `
            <div class="squad-selected-player">
              <span class="player-number">${jerseyDisplay(p)}</span>
              <strong>${esc(p.name)}</strong>
              <small>${esc(p.position || 'Position not assigned')}</small>
            </div>
          `).join('') : '<div class="empty-state">The matchday squad has not been announced yet.</div>'}
        </div>

        ${!canManage()
          ? '<p class="muted squad-parent-note">You are viewing the full matchday squad for your team. This list is view-only.</p>'
          : ''}
      </div>
    </details>
  `
}

async function squadsPage() {
  await loadFixtures()
  await loadSquadRoster()
  await loadSquads()

  // Parent fixtures remain limited to teams linked to their account.
  // The separate squad roster only supplies names and football details
  // for the selected players in those team fixtures.
  const linkedRoster = visiblePlayers()

  const names = profile.role === 'parent'
    ? [...new Set(linkedRoster.map(p => p.age_group).filter(Boolean))]
    : teamNames()

  const teamFixtures = fixtures.filter(f =>
    !f.age_group || names.includes(f.age_group)
  )

  const upcoming = teamFixtures.filter(f => !dateIsPast(f.fixture_date))
    .sort((a, b) => a.fixture_date.localeCompare(b.fixture_date))

  const past = teamFixtures.filter(f => dateIsPast(f.fixture_date))
    .sort((a, b) => b.fixture_date.localeCompare(a.fixture_date))

  root.innerHTML = `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading">
        <h2>Matchday Squad</h2>
        <p class="muted">View the full selected squad for your team's upcoming and previous matches.</p>
      </div>

      <section class="activity-section squad-list-section">
        <div class="section-heading">
          <h3>Upcoming Matches</h3>
          <span class="muted">${upcoming.length} matches</span>
        </div>
        ${upcoming.length
          ? upcoming.map(f => renderSquadMatch(f, linkedRoster, false)).join('')
          : '<div class="empty-state">No upcoming fixtures are available for your team.</div>'}
      </section>

      <section class="activity-section squad-list-section">
        <details class="squad-previous-section">
          <summary class="squad-previous-heading">
            <div>
              <h3>Previous Matches</h3>
              <small class="muted">${past.length} completed ${past.length === 1 ? 'match' : 'matches'}</small>
            </div>
            <span class="collapse-arrow">${icon('chevron', 19)}</span>
          </summary>
          <div class="squad-previous-content">
            ${past.length
              ? past.map(f => renderSquadMatch(f, linkedRoster, true)).join('')
              : '<div class="empty-state">No previous matches available.</div>'}
          </div>
        </details>
      </section>
    </main>
  `
}

async function saveSquad(fixtureId) {
  if (!canManage()) return

  const selected = [...document.querySelectorAll(
    `.squad-check[data-fixture="${fixtureId}"]:checked`
  )].map(el => el.value)

  const fixture = fixtures.find(f => String(f.id) === String(fixtureId))
  if (!fixture) return showMessage('Fixture not found. Refresh and try again.')

  const eligible = visiblePlayers()
    .filter(p => !fixture.age_group || p.age_group === fixture.age_group)
    .map(p => String(p.id))

  const { error: deleteError } = await supabase.from('fixture_squad_players')
    .delete().eq('fixture_id', fixtureId).in('player_id', eligible)

  if (deleteError) return showMessage('Unable to update squad: ' + deleteError.message)

  if (selected.length) {
    const rows = selected.map(playerId => ({
      fixture_id: fixtureId,
      player_id: playerId,
      selected_by: user.id
    }))

    const { error } = await supabase.from('fixture_squad_players').insert(rows)
    if (error) return showMessage('Squad selections could not be saved: ' + error.message)
  }

  showMessage('Matchday squad updated.')
  await squadsPage()
}

// PLACEHOLDERS

function placeholderPage(title, iconName, message) {
  return `
    ${header()}
    <main class="container">
      ${backButton()}
      <div class="page-heading"><h2>${icon(iconName, 25)} ${title}</h2></div>
      <div class="empty-state">${message}</div>
    </main>
  `
}

// RENDERING

async function render() {
  if (!user) return loginPage()

  try {
    if (currentPage === 'home') {
      root.innerHTML = homePage()
    } else if (currentPage === 'roster') {
      root.innerHTML = rosterPage()
    } else if (currentPage === 'profile') {
      root.innerHTML = profilePage()
    } else if (currentPage === 'player') {
      root.innerHTML = playerPage()
    } else if (currentPage === 'team-management') {
      root.innerHTML = teamManagementPage()
    } else if (currentPage === 'player-management') {
      root.innerHTML = playerManagementPage()
    } else if (currentPage === 'squad-management') {
      root.innerHTML = squadManagementPage()
    } else if (currentPage === 'attendance') {
      await attendancePage()
    } else if (currentPage === 'fixtures') {
      await fixturesPage()
    } else if (currentPage === 'announcements') {
      await announcementsPage()
    } else if (currentPage === 'squads') {
      await squadsPage()
    } else if (currentPage === 'payment') {
      root.innerHTML = placeholderPage('Payment', 'credit', 'Payment information will be available here.')
    } else if (currentPage === 'videos') {
      root.innerHTML = placeholderPage('Videos', 'video', 'Academy videos will be available here.')
    } else {
      currentPage = 'home'
      root.innerHTML = homePage()
    }
  } catch (error) {
    console.error(error)
    root.innerHTML = `
      ${header()}
      <main class="container">
        <div class="empty-state">
          Something went wrong: ${esc(error.message)}
          <br>
          <small>Check that the required Supabase tables and permissions are available.</small>
        </div>
      </main>
    `
  }
}

// CLICK ACTIONS

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
    } else if (action === 'edit-team') {
      await editTeam(target.dataset.id)
    } else if (action === 'archive-team') {
      await archiveTeam(target.dataset.id, target.dataset.name)
    } else if (action === 'restore-team') {
      await restoreTeam(target.dataset.id)
    } else if (action === 'edit-player') {
      await editPlayer(target.dataset.id)
    } else if (action === 'delete-player') {
      await deletePlayer(target.dataset.id, target.dataset.name)
    } else if (action === 'save-attendance') {
      await saveAttendance(target.dataset.player, target.dataset.activity)
    } else if (action === 'delete-activity') {
      await deleteActivity(target.dataset.activity, target.dataset.title)
    } else if (action === 'delete-fixture') {
      await deleteFixture(target.dataset.id, target.dataset.opponent)
    } else if (action === 'delete-announcement') {
      await deleteAnnouncement(target.dataset.id, target.dataset.title)
    } else if (action === 'save-squad') {
      await saveSquad(target.dataset.fixture)
    }
  } catch (error) {
    console.error(error)
    showMessage(error.message || 'An unexpected error occurred.')
  }
})

// FORM SUBMISSIONS

root.addEventListener('submit', async event => {
  const form = event.target

  if (form.id === 'login-form') {
    event.preventDefault()
    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value

    try {
      if (isSigningUp) {
        const name = document.querySelector('#full-name').value.trim()
        if (!name) return showMessage('Please enter your full name.')
        await createParentAccount(name, email, password)
      } else {
        await login(email, password)
      }
    } catch (error) {
      showMessage(error.message)
    }
  } else if (form.id === 'create-activity-form') {
    await createActivity(event)
  } else if (form.id === 'fixture-form') {
    await createFixture(event)
  } else if (form.id === 'announcement-form') {
    await createAnnouncement(event)
  } else if (form.id === 'create-team-form') {
    await createTeam(event)
  } else if (form.id === 'create-player-form') {
    await createPlayer(event)
  } else if (form.id === 'transfer-player-form') {
    await transferPlayer(event)
  }
})

// KEYBOARD ACCESSIBILITY FOR MENU CARDS

root.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') &&
      event.target.matches('.menu-card[role="button"]')) {
    event.preventDefault()
    event.target.click()
  }
})

// AUTH SESSION CHECK

async function startApp() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error(error)
    return loginPage()
  }

  if (data.session?.user) {
    user = data.session.user

    try {
      await loadProfile()
      await refreshPortalData()
      currentPage = 'home'
    } catch (err) {
      console.error(err)
      await supabase.auth.signOut()
      user = null
      profile = null
      currentPage = 'login'
    }
  }

  render()
}

startApp()
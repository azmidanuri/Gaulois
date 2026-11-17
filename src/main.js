import { createClient } from '@supabase/supabase-js'
import './style.css'
import './portal-features.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
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
let fixtures = []
let announcements = []
let squadSelections = []

// Helpers
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatDate(value) {
  if (!value) return 'Date not set'
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTime(value) {
  if (!value) return ''
  const [h, m] = value.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })
}
function canManage() { return Boolean(profile && profile.role !== 'parent') }
function visiblePlayers() { return profile?.role === 'parent' ? linkedPlayers : players }
function showMessage(message) { alert(message) }
function backButton() { return `<button class="back-btn" data-action="home">â Back to Home</button>` }
function jerseyDisplay(player) {
  return player.jersey_number !== null && player.jersey_number !== undefined && String(player.jersey_number).trim() !== '' ? esc(player.jersey_number) : 'â½'
}
function teamOptions(selected = '') {
  return TEAMS.map(t => `<option value="${t}" ${t === selected ? 'selected' : ''}>${t}</option>`).join('')
}
function dateIsPast(date) { return Boolean(date && date < today()) }

// Authentication
function loginPage() {
  root.innerHTML = `
    <main class="login-page"><section class="login-card">
      <div class="login-brand"><img src="/gaulois-logo.png" class="login-logo" alt="Gaulois Aerion Academy"><h1>Gaulois Aerion Academy</h1><p>ACADEMY PORTAL</p></div>
      ${!loginType ? `
        <div class="login-choice-content"><span class="login-eyebrow">WELCOME</span><h2>Choose your login</h2><p class="login-description">Select your portal to continue</p>
          <div class="login-choice-grid">
            
<button type="button" class="login-choice" data-action="choose-parent">
  <span class="login-choice-icon">P</span>
  <strong>Parent/Player Login</strong>
  <small>Attendance, activities and player information</small>
  <span class="login-choice-arrow">›</span>
</button>

<button type="button" class="login-choice" data-action="choose-staff">
  <span class="login-choice-icon">S</span>
  <strong>Staff Login</strong>
  <small>Manage teams, players and academy activities</small>
  <span class="login-choice-arrow">›</span>
</button>
          </div><p class="login-hint">Select a card to proceed to your login</p>
        </div>` : `
        <div class="login-form-content"><button class="back-btn login-change-btn" data-action="change-login">â Change Login Type</button><span class="login-eyebrow">PORTAL ACCESS</span><h2>${loginType === 'parent' ? 'Parent/Player Login' : 'Staff Login'}</h2><p class="login-description">Enter your account details to continue</p>
          <form id="login-form">${isSigningUp ? '<label>Full Name</label><input id="full-name" type="text" placeholder="Enter your full name" required>' : ''}
            <label>Email Address</label><input id="email" type="email" placeholder="Email address" required><label>Password</label><input id="password" type="password" placeholder="Password" required><button type="submit" class="primary-btn">${isSigningUp ? 'Create Account' : 'Login'}</button>
          </form>${loginType === 'parent' ? `<button class="text-btn" data-action="toggle-signup">${isSigningUp ? 'Already have an account? Login' : 'Create a parent account'}</button>` : ''}
        </div>`}
      <div class="login-footer">GAULOIS AERION ACADEMY</div>
    </section></main>`
}
async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (error) throw error
  profile = data
}
async function loadPlayers() {
  const { data, error } = await supabase.from('players').select('*').order('name')
  if (error) throw error
  players = data || []
  if (profile.role === 'parent') {
    const { data: links, error: linkError } = await supabase.from('parent_players').select('player_id').eq('parent_id', user.id)
    if (linkError) throw linkError
    const ids = (links || []).map(x => x.player_id)
    linkedPlayers = players.filter(p => ids.includes(p.id))
  } else linkedPlayers = players
}
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  user = data.user
  await loadProfile()
  if (loginType === 'staff' && profile.role === 'parent') {
    await supabase.auth.signOut(); user = null; profile = null
    throw new Error('This account does not have staff access.')
  }
  if (loginType === 'parent' && profile.role !== 'parent') {
    await supabase.auth.signOut(); user = null; profile = null
    throw new Error('Please use Staff Login for this account.')
  }
  await loadPlayers()
  currentPage = 'home'
  render()
}
async function createParentAccount(name, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Account could not be created.')
  if (!data.session) {
    showMessage('Account created. Please verify your email, then log in.')
    isSigningUp = false; render(); return
  }
  user = data.user
  const { error: profileError } = await supabase.from('profiles').upsert({ id: user.id, full_name: name, role: 'parent' })
  if (profileError) throw profileError
  await loadProfile(); await loadPlayers(); currentPage = 'home'; render()
}
async function logout() {
  await supabase.auth.signOut()
  user = null; profile = null; players = []; linkedPlayers = []; fixtures = []; announcements = []; squadSelections = []
  currentPage = 'login'; loginType = null; isSigningUp = false; render()
}

// Shared layout and home
function header() {
  return `<header class="topbar"><div class="brand"><img src="/gaulois-logo.png" class="portal-logo" alt="Gaulois Aerion"><div><div class="brand-name">Gaulois Aerion Academy</div><small>Parent & Team Portal</small></div></div><button class="logout-btn" data-action="logout">Logout</button></header>`
}
function menuCard(title, icon, page) {
  return `<article class="menu-card" role="button" tabindex="0" data-action="page" data-page="${page}"><span class="menu-icon">${icon}</span><strong>${title}</strong><small>Open section â</small></article>`
}
function homePage() {
  const roster = visiblePlayers()
  const teams = profile.role === 'parent' ? TEAMS.filter(t => roster.some(p => p.age_group === t)) : TEAMS
  return `${header()}<main class="container">
    <div class="welcome-section"><h2>Welcome, ${esc(profile.full_name || 'User')}</h2><p class="muted">Select a section to continue.</p></div>
    <section class="menu-grid">
      ${menuCard('Player Profiles', 'ð¤', 'profile')}${menuCard('Attendance', 'ð', 'attendance')}${menuCard('Fixtures & Results', 'ð', 'fixtures')}${menuCard('Announcements', 'ð¢', 'announcements')}${menuCard('Matchday Squad', 'ð¥', 'squads')}${menuCard('Payment', 'ð³', 'payment')}${menuCard('Videos', 'ð¬', 'videos')}
    </section>
    <div class="section-heading"><h3>${profile.role === 'parent' ? 'My Teams' : 'Academy Teams'}</h3></div>
    <section class="team-grid">${teams.map(team => { const count = roster.filter(p => p.age_group === team).length; return `<article class="team-card" data-action="team" data-team="${team}"><div class="team-card-icon">â½</div><h3>${team}</h3><p class="player-count">${count} ${count === 1 ? 'Player' : 'Players'}</p><span>View full roster â</span></article>` }).join('')}</section>
  </main>`
}
function rosterPage() {
  const roster = visiblePlayers().filter(p => p.age_group === selectedTeam).sort((a,b) => a.name.localeCompare(b.name))
  return `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>${selectedTeam} Full Roster</h2><p class="muted">${roster.length} registered players</p></div><section class="roster-list">${roster.length ? roster.map(p => `<article class="player-card"><div class="player-number">${jerseyDisplay(p)}</div><div class="player-info"><strong>${esc(p.name)}</strong><small>${esc(p.position || 'Position not assigned')}</small></div><button class="view-btn" data-action="player" data-player="${p.id}">View â</button></article>`).join('') : '<div class="empty-state">No players in this team.</div>'}</section></main>`
}
function profilePage() {
  const roster = visiblePlayers()
  const teams = profile.role === 'parent' ? TEAMS.filter(t => roster.some(p => p.age_group === t)) : TEAMS
  return `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>Player Profiles</h2><p class="muted">Browse players by team. Tap a team to expand its roster.</p></div><section class="profile-team-groups">${teams.map(team => {
    const group = roster.filter(p => p.age_group === team).sort((a,b) => a.name.localeCompare(b.name))
    return `<details class="profile-team-section"><summary class="profile-team-heading"><div class="profile-team-title"><h3>${team} TEAM</h3><small>Gaulois Aerion Academy</small></div><div class="profile-team-right"><span class="profile-team-count">${group.length} ${group.length === 1 ? 'PLAYER' : 'PLAYERS'}</span><span class="profile-chevron">â</span></div></summary><div class="profile-team-content"><div class="roster-list">${group.map(p => `<article class="player-card"><div class="player-number">${jerseyDisplay(p)}</div><div class="player-info"><strong>${esc(p.name)}</strong><small>${esc(p.position || 'Position not assigned')}</small></div><button class="view-btn" data-action="player" data-player="${p.id}">View â</button></article>`).join('') || '<div class="empty-state">No players registered yet.</div>'}</div></div></details>`
  }).join('')}</section></main>`
}
function playerPage() {
  const p = visiblePlayers().find(x => String(x.id) === String(selectedPlayer))
  if (!p) return homePage()
  return `${header()}<main class="container"><button class="back-btn" data-action="profile-back">â Back to Profiles</button><section class="player-profile"><div class="player-profile-banner"><div class="football-avatar">â½</div><h2>${esc(p.name)}</h2><span class="team-badge">${esc(p.age_group || 'Academy')}</span></div><div class="player-profile-content"><h3>Player Information</h3><div class="profile-field"><label>Full Name</label><div>${esc(p.name)}</div></div><div class="profile-field"><label>Team</label><div>${esc(p.age_group || '-')}</div></div><div class="profile-field"><label>Date of Birth</label><div>${esc(p.date_of_birth || '-')}</div></div><div class="profile-field"><label>Jersey Number</label>${canManage() ? `<input id="jersey-number" type="number" min="1" max="99" value="${esc(p.jersey_number ?? '')}" placeholder="Enter jersey number">` : `<div>${p.jersey_number ?? 'Unassigned'}</div>`}</div><div class="profile-field"><label>Position</label>${canManage() ? `<select id="player-position"><option value="">Select position</option>${POSITIONS.map(pos => `<option value="${pos}" ${p.position === pos ? 'selected' : ''}>${pos}</option>`).join('')}</select>` : `<div>${esc(p.position || 'Not assigned')}</div>`}</div>${canManage() ? '<button class="primary-btn" data-action="save-player">Save Changes</button>' : ''}</div></section></main>`
}
async function savePlayerProfile() {
  if (!canManage()) return
  const raw = document.querySelector('#jersey-number')?.value.trim()
  const position = document.querySelector('#player-position')?.value
  const jersey = raw ? Number(raw) : null
  if (raw && (!Number.isInteger(jersey) || jersey < 1 || jersey > 99)) return showMessage('Jersey number must be between 1 and 99.')
  const { error } = await supabase.from('players').update({ jersey_number: jersey, position: position || null }).eq('id', selectedPlayer)
  if (error) return showMessage('Unable to update player: ' + error.message)
  await loadPlayers(); showMessage('Player profile updated successfully.'); render()
}

// Attendance (existing workflow)
async function attendancePage() {
  const roster = visiblePlayers(), ids = roster.map(p => p.id)
  let q = supabase.from('activities').select('*').order('activity_date', { ascending: true })
  if (!canManage()) q = q.eq('is_published', true)
  const { data, error } = await q
  if (error) throw error
  const visibleTeams = [...new Set(roster.map(p => p.age_group))]
  const activities = (data || []).filter(a => canManage() || !a.age_group || visibleTeams.includes(a.age_group))
  let responses = []
  if (ids.length) {
    const { data: rows, error: responseError } = await supabase.from('responses').select('*').in('player_id', ids)
    if (responseError) throw responseError
    responses = rows || []
  }
  root.innerHTML = `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>Attendance</h2><p class="muted">Training and match availability</p></div>${canManage() ? createActivityForm() : ''}${renderActivitySection('Upcoming Activities', activities.filter(a => !dateIsPast(a.activity_date)), roster, responses, 'upcoming')}${renderActivitySection('Past Activities', activities.filter(a => dateIsPast(a.activity_date)), roster, responses, 'past')}</main>`
}
function createActivityForm() {
  return `<section class="activity-card"><h3>â Create New Activity</h3><form id="create-activity-form"><label>Team / Age Group</label><select id="activity-team" required>${teamOptions('U12')}</select><label>Activity Type</label><select id="activity-type" required><option value="training">Training</option><option value="match">Match</option></select><label>Activity Title</label><input id="activity-title" type="text" placeholder="e.g. U12 Training" required><label>Date</label><input id="activity-date" type="date" required><label>Start Time</label><input id="activity-time" type="time" required><label>Venue</label><input id="activity-venue" type="text" placeholder="Enter venue" required><label class="publish-option"><input id="activity-published" type="checkbox" checked>Publish to parents immediately</label><button type="submit" class="primary-btn">Create Activity</button></form></section>`
}
function renderActivitySection(title, activities, roster, responses, type) {
  return `<section class="activity-section"><div class="section-heading"><h3>${title}</h3><span class="muted">${activities.length} activities</span></div>${activities.length ? activities.map(a => renderActivityCard(a, roster, responses, type)).join('') : `<div class="empty-state">No ${type === 'past' ? 'past' : 'upcoming'} activities.</div>`}</section>`
}
function renderActivityCard(a, roster, responses, sectionType) {
  const group = roster.filter(p => !a.age_group || p.age_group === a.age_group)
  const rows = responses.filter(r => String(r.activity_id) === String(a.id))
  const yes = rows.filter(r => r.answer === 'yes').length, no = rows.filter(r => r.answer === 'no').length
  return `<details class="activity-card collapsible-activity"><summary class="activity-summary"><div class="activity-summary-main"><div class="activity-type-icon">${a.activity_type === 'match' ? 'ð' : 'â½'}</div><div class="activity-summary-info"><strong>${esc(a.title)}</strong><small>${esc(a.age_group || 'All Teams')} Â· ${formatDate(a.activity_date)}</small><small>${esc(formatTime(a.start_time))}${a.venue ? ' Â· ' + esc(a.venue) : ''}</small></div></div><span class="collapse-arrow">â</span></summary><div class="activity-content"><div class="activity-meta"><div><label>Team</label><strong>${esc(a.age_group || 'All Teams')}</strong></div><div><label>Date</label><strong>${formatDate(a.activity_date)}</strong></div><div><label>Time</label><strong>${esc(formatTime(a.start_time))}</strong></div><div><label>Venue</label><strong>${esc(a.venue || '-')}</strong></div></div><div class="attendance-summary"><div class="attendance-stat"><strong>${yes}</strong><small>Attending</small></div><div class="attendance-stat"><strong>${no}</strong><small>Absent</small></div><div class="attendance-stat"><strong>${Math.max(0, group.length - yes - no)}</strong><small>No response</small></div></div><h4>Player Attendance</h4>${group.length ? group.map(p => renderAttendancePlayer(p, rows.find(r => String(r.player_id) === String(p.id)), a, sectionType)).join('') : '<div class="empty-state">No players assigned to this team.</div>'}${canManage() ? `<div class="activity-admin-actions"><button class="delete-btn" data-action="delete-activity" data-activity="${a.id}" data-title="${esc(a.title)}">Delete Activity</button></div>` : ''}</div></details>`
}
function renderAttendancePlayer(p, response, activity, sectionType) {
  const answer = response?.answer || '', canRespond = profile.role === 'parent' && sectionType === 'upcoming'
  return `<div class="attendance-player"><div class="attendance-player-info"><strong>${esc(p.name)}</strong><small>${p.jersey_number != null ? '#' + esc(p.jersey_number) : ''}</small></div>${canRespond ? `<div class="attendance-controls"><select class="attendance-select" data-player="${p.id}" data-activity="${activity.id}"><option value="" ${!answer ? 'selected' : ''}>Select</option><option value="yes" ${answer === 'yes' ? 'selected' : ''}>Attending</option><option value="no" ${answer === 'no' ? 'selected' : ''}>Absent</option></select>${answer === 'no' ? `<input class="absence-reason" data-player="${p.id}" data-activity="${activity.id}" type="text" placeholder="Reason for absence (optional)" value="${esc(response?.absence_reason || '')}">` : ''}<button class="small-save-btn" data-action="save-attendance" data-player="${p.id}" data-activity="${activity.id}">Save</button></div>` : `<div class="attendance-status ${answer === 'yes' ? 'status-yes' : answer === 'no' ? 'status-no' : 'status-pending'}">${answer === 'yes' ? 'Attending' : answer === 'no' ? 'Absent' : 'No response'}</div>${answer === 'no' && response?.absence_reason ? `<small class="absence-note">${esc(response.absence_reason)}</small>` : ''}`}</div>`
}
async function createActivity(event) {
  event.preventDefault(); if (!canManage()) return
  const payload = { age_group: document.querySelector('#activity-team').value, activity_type: document.querySelector('#activity-type').value, title: document.querySelector('#activity-title').value.trim(), activity_date: document.querySelector('#activity-date').value, start_time: document.querySelector('#activity-time').value, venue: document.querySelector('#activity-venue').value.trim(), is_published: document.querySelector('#activity-published').checked }
  const { error } = await supabase.from('activities').insert(payload)
  if (error) return showMessage('Unable to create activity: ' + error.message)
  showMessage(`${payload.age_group} activity created successfully.`); await attendancePage()
}
async function saveAttendance(playerId, activityId) {
  if (profile.role !== 'parent') return
  const select = document.querySelector(`.attendance-select[data-player="${playerId}"][data-activity="${activityId}"]`)
  if (!select?.value) return showMessage('Please select attending or absent.')
  const answer = select.value
  const reasonInput = document.querySelector(`.absence-reason[data-player="${playerId}"][data-activity="${activityId}"]`)
  const { error } = await supabase.from('responses').upsert({ activity_id: activityId, player_id: playerId, responded_by: user.id, answer, absence_reason: answer === 'no' ? (reasonInput?.value.trim() || null) : null }, { onConflict: 'activity_id,player_id' })
  if (error) return showMessage('Unable to save attendance: ' + error.message)
  showMessage('Attendance response saved.'); await attendancePage()
}
async function deleteActivity(id, title) {
  if (!canManage() || !confirm(`Are you sure you want to delete "${title}"?\n\nThis action cannot be undone.`)) return
  const { data, error } = await supabase.from('activities').delete().eq('id', id).select('id')
  if (error) return showMessage('Unable to delete activity: ' + error.message)
  if (!data?.length) return showMessage('The activity was not deleted. Check your Supabase delete permissions.')
  showMessage('Activity deleted.'); await attendancePage()
}

// Fixtures and results
async function loadFixtures() {
  let q = supabase.from('fixtures').select('*').order('fixture_date', { ascending: true })
  if (!canManage()) q = q.eq('is_published', true)
  const { data, error } = await q
  if (error) throw error
  const teams = [...new Set(visiblePlayers().map(p => p.age_group))]
  fixtures = (data || []).filter(f => canManage() || !f.age_group || teams.includes(f.age_group))
}
function fixtureForm() {
  return `<section class="activity-card"><h3>â Add Fixture / Result</h3><form id="fixture-form" class="portal-form-grid"><div><label>Team</label><select id="fixture-team" required>${teamOptions('U12')}</select></div><div><label>Competition</label><input id="fixture-competition" placeholder="e.g. League / Cup"></div><div><label>Opponent</label><input id="fixture-opponent" required placeholder="Opponent name"></div><div><label>Home or Away</label><select id="fixture-location"><option value="Home">Home</option><option value="Away">Away</option><option value="Neutral">Neutral</option></select></div><div><label>Date</label><input id="fixture-date" type="date" required></div><div><label>Kick-off</label><input id="fixture-time" type="time"></div><div class="form-span"><label>Venue</label><input id="fixture-venue" placeholder="Match venue"></div><div><label>Our score (optional)</label><input id="fixture-home-score" type="number" min="0" placeholder="â"></div><div><label>Opponent score (optional)</label><input id="fixture-away-score" type="number" min="0" placeholder="â"></div><label class="publish-option form-span"><input id="fixture-published" type="checkbox" checked> Publish to parents</label><div class="form-span"><button class="primary-btn" type="submit">Save Fixture</button></div></form></section>`
}
function fixtureCard(f) {
  const hasScore = f.home_score !== null && f.home_score !== undefined && f.away_score !== null && f.away_score !== undefined
  const score = hasScore ? `<div class="fixture-score">${f.home_score} <span>â</span> ${f.away_score}</div>` : '<div class="fixture-upcoming-label">UPCOMING</div>'
  return `<article class="fixture-card"><div class="fixture-card-top"><span class="team-badge">${esc(f.age_group || 'Academy')}</span><span class="muted">${esc(f.competition || 'Fixture')}</span></div><div class="fixture-teams"><div class="fixture-side"><strong>Gaulois Aerion</strong><small>${esc(f.home_away || 'Home')}</small></div>${score}<div class="fixture-side fixture-opponent"><strong>${esc(f.opponent)}</strong><small>Opponent</small></div></div><div class="fixture-details"><span>ð ${formatDate(f.fixture_date)}</span>${f.kick_off ? `<span>ð ${esc(formatTime(f.kick_off))}</span>` : ''}${f.venue ? `<span>ð ${esc(f.venue)}</span>` : ''}</div>${canManage() ? `<div class="fixture-admin-actions"><button class="delete-btn" data-action="delete-fixture" data-id="${f.id}" data-opponent="${esc(f.opponent)}">Delete</button></div>` : ''}</article>`
}
async function fixturesPage() {
  await loadFixtures()
  const upcoming = fixtures.filter(f => !dateIsPast(f.fixture_date))
  const past = fixtures.filter(f => dateIsPast(f.fixture_date))
  root.innerHTML = `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>Fixtures & Results</h2><p class="muted">Upcoming matches, scores and competition updates.</p></div>${canManage() ? fixtureForm() : ''}<section class="activity-section"><div class="section-heading"><h3>Upcoming Fixtures</h3><span class="muted">${upcoming.length} matches</span></div>${upcoming.length ? upcoming.map(fixtureCard).join('') : '<div class="empty-state">No upcoming fixtures published.</div>'}</section><section class="activity-section"><div class="section-heading"><h3>Past Results</h3><span class="muted">${past.length} matches</span></div>${past.length ? past.slice().reverse().map(fixtureCard).join('') : '<div class="empty-state">No past results available.</div>'}</section></main>`
}
async function createFixture(event) {
  event.preventDefault(); if (!canManage()) return
  const homeRaw = document.querySelector('#fixture-home-score').value
  const awayRaw = document.querySelector('#fixture-away-score').value
  const payload = { age_group: document.querySelector('#fixture-team').value, competition: document.querySelector('#fixture-competition').value.trim() || null, opponent: document.querySelector('#fixture-opponent').value.trim(), home_away: document.querySelector('#fixture-location').value, fixture_date: document.querySelector('#fixture-date').value, kick_off: document.querySelector('#fixture-time').value || null, venue: document.querySelector('#fixture-venue').value.trim() || null, home_score: homeRaw === '' ? null : Number(homeRaw), away_score: awayRaw === '' ? null : Number(awayRaw), is_published: document.querySelector('#fixture-published').checked, created_by: user.id }
  const { error } = await supabase.from('fixtures').insert(payload)
  if (error) return showMessage('Unable to save fixture: ' + error.message)
  showMessage('Fixture saved successfully.'); await fixturesPage()
}
async function deleteFixture(id, opponent) {
  if (!canManage() || !confirm(`Delete the fixture against ${opponent}?`)) return
  const { data, error } = await supabase.from('fixtures').delete().eq('id', id).select('id')
  if (error) return showMessage('Unable to delete fixture: ' + error.message)
  if (!data?.length) return showMessage('Fixture was not deleted. Check your Supabase permissions.')
  showMessage('Fixture deleted.'); await fixturesPage()
}

// Announcements
async function loadAnnouncements() {
  let q = supabase.from('announcements').select('*').order('created_at', { ascending: false })
  if (!canManage()) q = q.eq('is_published', true)
  const { data, error } = await q
  if (error) throw error
  const teams = [...new Set(visiblePlayers().map(p => p.age_group))]
  announcements = (data || []).filter(a => canManage() || !a.age_group || teams.includes(a.age_group))
}
function announcementForm() {
  return `<section class="activity-card"><h3>â Post Announcement</h3><form id="announcement-form"><label>Audience</label><select id="announcement-team"><option value="">All Academy Teams</option>${teamOptions()}</select><label>Announcement Title</label><input id="announcement-title" required maxlength="120" placeholder="e.g. Training venue update"><label>Message</label><textarea id="announcement-body" rows="4" required placeholder="Write your announcement..."></textarea><label class="publish-option"><input id="announcement-published" type="checkbox" checked> Publish immediately</label><button type="submit" class="primary-btn">Publish Announcement</button></form></section>`
}
async function announcementsPage() {
  await loadAnnouncements()
  root.innerHTML = `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>Announcements</h2><p class="muted">Academy news and important team updates.</p></div>${canManage() ? announcementForm() : ''}<section class="announcement-list">${announcements.length ? announcements.map(a => `<article class="announcement-card"><div class="announcement-card-top"><span class="team-badge">${esc(a.age_group || 'All Teams')}</span><small>${a.created_at ? new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</small></div><h3>${esc(a.title)}</h3><p>${esc(a.body).replace(/\n/g, '<br>')}</p>${canManage() ? `<div class="fixture-admin-actions"><button class="delete-btn" data-action="delete-announcement" data-id="${a.id}" data-title="${esc(a.title)}">Delete</button></div>` : ''}</article>`).join('') : '<div class="empty-state">There are no announcements at the moment.</div>'}</section></main>`
}
async function createAnnouncement(event) {
  event.preventDefault(); if (!canManage()) return
  const payload = { age_group: document.querySelector('#announcement-team').value || null, title: document.querySelector('#announcement-title').value.trim(), body: document.querySelector('#announcement-body').value.trim(), is_published: document.querySelector('#announcement-published').checked, created_by: user.id }
  if (!payload.title || !payload.body) return showMessage('Please enter a title and message.')
  const { error } = await supabase.from('announcements').insert(payload)
  if (error) return showMessage('Unable to publish announcement: ' + error.message)
  showMessage('Announcement saved.'); await announcementsPage()
}
async function deleteAnnouncement(id, title) {
  if (!canManage() || !confirm(`Delete announcement "${title}"?`)) return
  const { data, error } = await supabase.from('announcements').delete().eq('id', id).select('id')
  if (error) return showMessage('Unable to delete announcement: ' + error.message)
  if (!data?.length) return showMessage('Announcement was not deleted. Check your Supabase permissions.')
  showMessage('Announcement deleted.'); await announcementsPage()
}

// Matchday squads: coach selects players against a published fixture.
async function loadSquads() {
  const ids = visiblePlayers().map(p => p.id)
  if (!ids.length) { squadSelections = []; return }
  const { data, error } = await supabase.from('fixture_squad_players').select('*').in('player_id', ids)
  if (error) throw error
  squadSelections = data || []
}
async function squadsPage() {
  await loadFixtures(); await loadSquads()
  const roster = visiblePlayers()
  const teams = profile.role === 'parent' ? [...new Set(roster.map(p => p.age_group))] : TEAMS
  const teamFixtures = fixtures.filter(f => !f.age_group || teams.includes(f.age_group))
  root.innerHTML = `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>Matchday Squad</h2><p class="muted">View selected players for upcoming fixtures.</p></div>${teamFixtures.length ? teamFixtures.map(f => {
    const squad = squadSelections.filter(s => String(s.fixture_id) === String(f.id))
    const squadPlayers = squad.map(s => roster.find(p => String(p.id) === String(s.player_id))).filter(Boolean)
    const canSelect = canManage()
    return `<section class="squad-card"><div class="squad-card-heading"><div><span class="team-badge">${esc(f.age_group || 'Academy')}</span><h3>Gaulois Aerion vs ${esc(f.opponent)}</h3><p class="muted">${formatDate(f.fixture_date)}${f.kick_off ? ' Â· ' + esc(formatTime(f.kick_off)) : ''}${f.venue ? ' Â· ' + esc(f.venue) : ''}</p></div><span class="squad-count">${squadPlayers.length} selected</span></div>${canSelect ? `<details class="squad-editor"><summary>${squadPlayers.length ? 'Edit matchday squad' : 'Select matchday squad'} <span>â</span></summary><div class="squad-player-options">${roster.filter(p => !f.age_group || p.age_group === f.age_group).map(p => `<label class="squad-player-option"><input type="checkbox" class="squad-check" data-fixture="${f.id}" value="${p.id}" ${squad.some(s => String(s.player_id) === String(p.id)) ? 'checked' : ''}><span><strong>${esc(p.name)}</strong><small>${esc(p.position || 'Position not assigned')} ${p.jersey_number != null ? ' Â· #' + esc(p.jersey_number) : ''}</small></span></label>`).join('')}</div><button class="primary-btn" data-action="save-squad" data-fixture="${f.id}">Save Squad</button></details>` : ''}<div class="selected-squad-list">${squadPlayers.length ? squadPlayers.map(p => `<div class="squad-selected-player"><span class="player-number">${jerseyDisplay(p)}</span><strong>${esc(p.name)}</strong><small>${esc(p.position || '')}</small></div>`).join('') : '<div class="empty-state">The matchday squad has not been announced yet.</div>'}</div>${!canSelect && roster.length ? `<p class="muted squad-parent-note">Your childâs selection is shown above if selected.</p>` : ''}</section>`
  }).join('') : '<div class="empty-state">No upcoming fixtures are available for your team.</div>'}</main>`
}
async function saveSquad(fixtureId) {
  if (!canManage()) return
  const selected = [...document.querySelectorAll(`.squad-check[data-fixture="${fixtureId}"]:checked`)].map(el => el.value)
  const fixture = fixtures.find(f => String(f.id) === String(fixtureId))
  if (!fixture) return showMessage('Fixture not found. Refresh and try again.')
  const eligible = visiblePlayers().filter(p => !fixture.age_group || p.age_group === fixture.age_group).map(p => String(p.id))
  const { error: deleteError } = await supabase.from('fixture_squad_players').delete().eq('fixture_id', fixtureId).in('player_id', eligible)
  if (deleteError) return showMessage('Unable to update squad: ' + deleteError.message)
  if (selected.length) {
    const rows = selected.map(playerId => ({ fixture_id: fixtureId, player_id: playerId, selected_by: user.id }))
    const { error } = await supabase.from('fixture_squad_players').insert(rows)
    if (error) return showMessage('Squad selections could not be saved: ' + error.message)
  }
  showMessage('Matchday squad updated.'); await squadsPage()
}

// Existing placeholders
function placeholderPage(title, icon, message) {
  return `${header()}<main class="container">${backButton()}<div class="page-heading"><h2>${icon} ${title}</h2></div><div class="empty-state">${message}</div></main>`
}

// Rendering
async function render() {
  if (!user) return loginPage()
  try {
    if (currentPage === 'home') root.innerHTML = homePage()
    else if (currentPage === 'roster') root.innerHTML = rosterPage()
    else if (currentPage === 'profile') root.innerHTML = profilePage()
    else if (currentPage === 'player') root.innerHTML = playerPage()
    else if (currentPage === 'attendance') await attendancePage()
    else if (currentPage === 'fixtures') await fixturesPage()
    else if (currentPage === 'announcements') await announcementsPage()
    else if (currentPage === 'squads') await squadsPage()
    else if (currentPage === 'payment') root.innerHTML = placeholderPage('Payment', 'ð³', 'Payment information will be available here.')
    else if (currentPage === 'videos') root.innerHTML = placeholderPage('Videos', 'ð¬', 'Academy videos will be available here.')
    else { currentPage = 'home'; root.innerHTML = homePage() }
  } catch (error) {
    console.error(error)
    root.innerHTML = `${header()}<main class="container"><div class="empty-state">Something went wrong: ${esc(error.message)}<br><small>Check that the new Supabase tables have been created.</small></div></main>`
  }
}

// Click actions
root.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]')
  if (!target) return
  const action = target.dataset.action
  try {
    if (action === 'choose-parent') { loginType = 'parent'; isSigningUp = false; render() }
    else if (action === 'choose-staff') { loginType = 'staff'; isSigningUp = false; render() }
    else if (action === 'change-login') { loginType = null; isSigningUp = false; render() }
    else if (action === 'toggle-signup') { isSigningUp = !isSigningUp; render() }
    else if (action === 'logout') await logout()
    else if (action === 'home') { currentPage = 'home'; render() }
    else if (action === 'page') { currentPage = target.dataset.page; render() }
    else if (action === 'team') { selectedTeam = target.dataset.team; currentPage = 'roster'; render() }
    else if (action === 'player') { selectedPlayer = target.dataset.player; currentPage = 'player'; render() }
    else if (action === 'profile-back') { currentPage = 'profile'; render() }
    else if (action === 'save-player') await savePlayerProfile()
    else if (action === 'save-attendance') await saveAttendance(target.dataset.player, target.dataset.activity)
    else if (action === 'delete-activity') await deleteActivity(target.dataset.activity, target.dataset.title)
    else if (action === 'delete-fixture') await deleteFixture(target.dataset.id, target.dataset.opponent)
    else if (action === 'delete-announcement') await deleteAnnouncement(target.dataset.id, target.dataset.title)
    else if (action === 'save-squad') await saveSquad(target.dataset.fixture)
  } catch (error) { console.error(error); showMessage(error.message || 'An unexpected error occurred.') }
})

// Forms
root.addEventListener('submit', async event => {
  if (event.target.id === 'login-form') {
    event.preventDefault()
    const email = document.querySelector('#email').value.trim(), password = document.querySelector('#password').value
    try {
      if (isSigningUp) {
        const name = document.querySelector('#full-name').value.trim()
        if (!name) return showMessage('Please enter your full name.')
        await createParentAccount(name, email, password)
      } else await login(email, password)
    } catch (error) { showMessage(error.message) }
  } else if (event.target.id === 'create-activity-form') await createActivity(event)
  else if (event.target.id === 'fixture-form') await createFixture(event)
  else if (event.target.id === 'announcement-form') await createAnnouncement(event)
})

// Auth session check
async function startApp() {
  const { data, error } = await supabase.auth.getSession()
  if (error) { console.error(error); return loginPage() }
  if (data.session?.user) {
    user = data.session.user
    try { await loadProfile(); await loadPlayers(); currentPage = 'home' }
    catch (err) { console.error(err); await supabase.auth.signOut(); user = null; profile = null; currentPage = 'login' }
  }
  render()
}
startApp()
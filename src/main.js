
import { createClient } from '@supabase/supabase-js'
import './style.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const root = document.querySelector('#app')

let supabase
let user = null
let profile = null
let children = []
let activities = []
let responses = []
let reviews = []
let activePlayer = null
let currentTab = 'home'
let parentSubTab = 'activities'
let staffGroup = 'U12'
let profileGroup = 'U10'
let loginMode = 'parent'
let loginAttemptMode = null

const esc = (v = '') =>
  String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))

const dateLabel = d =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString('en-SG', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : 'Date to be confirmed'

const toast = msg => {
  const el = document.querySelector('#toast')
  if (el) {
    el.textContent = msg
    el.classList.remove('hidden')
    setTimeout(() => el.classList.add('hidden'), 2600)
  }
}

const isStaff = () => ['admin', 'coach'].includes(profile?.role)
const isAdmin = () => profile?.role === 'admin'

const responseFor = (activityId, playerId) =>
  responses.find(r =>
    r.activity_id === activityId &&
    r.player_id === playerId
  )

const reviewFor = activityId =>
  reviews.find(r => r.activity_id === activityId)

const groupPlayers = group =>
  children.filter(p => p.age_group === group)

const groupActivities = group =>
  activities.filter(a => (a.age_group || 'U12') === group)

function activityHasEnded(activity) {
  if (!activity?.activity_date) return false

  const now = new Date()
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')

  if (activity.activity_date < today) return true
  if (activity.activity_date > today) return false

  if (!activity.end_time) return false

  const currentTime =
    `${String(now.getHours()).padStart(2, '0')}:` +
    `${String(now.getMinutes()).padStart(2, '0')}`

  return currentTime >= String(activity.end_time).slice(0, 5)
}

function addPortalStyles() {
  if (document.querySelector('#portalStyles')) return

  const style = document.createElement('style')
  style.id = 'portalStyles'
  style.textContent = `
    .portal-welcome{margin-bottom:22px}
    .portal-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:20px 0}
    .portal-menu-card{background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:20px;text-align:left;cursor:pointer;color:inherit;min-height:145px;transition:transform .15s,border-color .15s}
    .portal-menu-card:hover{transform:translateY(-2px);border-color:#b89a58}
    .portal-menu-icon{font-size:28px;margin-bottom:12px}
    .portal-menu-card h2{font-size:17px;margin:0 0 7px}
    .portal-menu-card p{font-size:13px;color:var(--muted,#777);margin:0;line-height:1.5}
    .portal-back{margin-bottom:18px}
    .profile-banner{background:#172d50;color:white;border-radius:16px;padding:22px;margin-bottom:16px}
    .profile-avatar{width:76px;height:76px;border-radius:50%;background:#ffffff22;border:2px solid #ffffff66;display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:14px}
    .profile-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .profile-detail{background:var(--card,#fff);border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:14px;min-width:0}
    .profile-detail small{display:block;color:var(--muted,#777);margin-bottom:6px}
    .profile-detail b{font-size:15px}
    .profile-detail input,.profile-detail select{width:100%;box-sizing:border-box}
    .placeholder-note{background:#f4f0e7;color:#66542c;padding:12px 14px;border-radius:10px;font-size:13px;margin-top:14px}
    .video-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .video-frame{aspect-ratio:16/9;background:linear-gradient(135deg,#172d50,#344b69);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:32px;position:relative;overflow:hidden}
    .video-frame:after{content:'COMING SOON';position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:2px;color:#ffffffbb}
    .video-placeholder h3{font-size:14px;margin:9px 0 4px}
    .video-placeholder p{font-size:12px;color:var(--muted,#777);margin:0}
    .payment-placeholder{text-align:center;padding:28px 15px}
    .payment-placeholder .payment-icon{font-size:42px;margin-bottom:12px}
    .portal-section-title{margin:22px 0 12px}
    .subtabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .subtabs button{border:1px solid var(--border,#ddd);background:transparent;border-radius:20px;padding:9px 15px;cursor:pointer}
    .subtabs button.active{background:#172d50;color:white;border-color:#172d50}
    .group-switch{display:flex;gap:10px;margin:14px 0 20px}
    .group-switch button{flex:1;border:1px solid var(--border,#ddd);background:transparent;border-radius:12px;padding:13px 20px;cursor:pointer;font-weight:600}
    .group-switch button.active{background:#172d50;color:white;border-color:#172d50}
    .roster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .roster-player{padding:12px;border:1px solid var(--border,#ddd);border-radius:10px}
    .staff-section{margin-top:18px}
    .profile-group-heading{margin:8px 0 4px}
    .profile-player-count{font-size:13px;color:var(--muted,#777);margin-bottom:14px}
    .login-mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}
    .login-mode-switch button{border:1px solid var(--border,#ddd);background:transparent;border-radius:10px;padding:12px 8px;cursor:pointer;font-weight:600}
    .login-mode-switch button.active{background:#172d50;color:white;border-color:#172d50}
    .review-box{background:var(--card,#fff);border:1px solid var(--border,#ddd);border-radius:12px;padding:14px;margin-top:14px}
    .review-box h4{margin:0 0 8px}
    .review-note{white-space:pre-wrap;line-height:1.6;margin:8px 0 0}
    .review-pending{font-size:13px;color:var(--muted,#777);margin-top:10px}
    .review-form textarea{width:100%;min-height:110px}
    @media(max-width:480px){
      .portal-menu{gap:10px}
      .portal-menu-card{padding:15px;min-height:135px}
      .profile-details,.video-grid{grid-template-columns:1fr 1fr}
    }
  `
  document.head.appendChild(style)
}

function shell(content = '') {
  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <div class="crest">GA</div>
          <div><b>GAULOIS AERION</b><small>ACADEMY · PORTAL</small></div>
        </div>
        <div class="topright">
          <span class="pill">ACADEMY PORTAL</span>
          ${user ? '<button class="btn small" id="logout">Sign out</button>' : ''}
        </div>
      </header>
      <main class="main">${content}</main>
      <footer>GAULOIS AERION ACADEMY · PARENT & PLAYER PORTAL</footer>
    </div>
    <div id="toast" class="toast hidden"></div>
  `

  document.querySelector('#logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    user = null
    profile = null
    children = []
    activities = []
    responses = []
    reviews = []
    loginAttemptMode = null
    currentTab = 'home'
    loginMode = 'parent'
    renderLogin()
  })
}

// LOGIN
function renderLogin(message = '') {
  shell(`
    <section class="login card">
      <div class="eyebrow">Welcome to the academy</div>
      <h1>${loginMode === 'staff' ? 'Coach / Admin Login' : 'Parent / Player Login'}</h1>
      <p class="sub">
        ${loginMode === 'staff'
          ? 'Sign in using your academy coach or administrator account.'
          : 'Sign in to access your family and player portal.'}
      </p>

      ${message ? `<div class="notice">${esc(message)}</div>` : ''}

      <div class="login-mode-switch">
        <button type="button" id="parentLoginMode"
          class="${loginMode === 'parent' ? 'active' : ''}">
          Parent / Player Login
        </button>
        <button type="button" id="staffLoginMode"
          class="${loginMode === 'staff' ? 'active' : ''}">
          Coach / Admin Login
        </button>
      </div>

      <form id="loginForm">
        <div class="field">
          <label>Email address</label>
          <input id="email" type="email" autocomplete="email" required placeholder="you@example.com">
        </div>
        <div class="field">
          <label>Password</label>
          <input id="password" type="password" autocomplete="current-password" required placeholder="Your password">
        </div>
        <button class="btn primary wide" type="submit">Sign in</button>
      </form>

      <p style="text-align:center;margin:12px 0">
        <button type="button" class="btn small" id="forgotPassword">Forgot password?</button>
      </p>

      ${loginMode === 'parent' ? `
        <div class="divider"></div>
        <details>
          <summary>First time here? Create a parent account</summary>
          <p class="muted smalltext">Use the email address provided to the academy. The academy must link your account to your child before attendance can be submitted.</p>

          <form id="signupForm">
            <div class="field">
              <label>Your full name</label>
              <input id="fullName" required>
            </div>
            <div class="field">
              <label>Email address</label>
              <input id="newEmail" type="email" required>
            </div>
            <div class="field">
              <label>Create password</label>
              <input id="newPassword" type="password" minlength="6" required>
            </div>
            <button class="btn wide" type="submit">Create account</button>
          </form>
        </details>
      ` : `
        <p class="muted smalltext" style="text-align:center">
          Coach and admin accounts are created by the academy administrator.
        </p>
      `}
    </section>
  `)

  document.querySelector('#parentLoginMode').addEventListener('click', () => {
    loginMode = 'parent'
    renderLogin()
  })

  document.querySelector('#staffLoginMode').addEventListener('click', () => {
    loginMode = 'staff'
    renderLogin()
  })

  document.querySelector('#loginForm').addEventListener('submit', async e => {
    e.preventDefault()

    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value

    loginAttemptMode = loginMode

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      loginAttemptMode = null
      return renderLogin(error.message)
    }

    await loadSession()
  })

  document.querySelector('#forgotPassword').addEventListener('click', async () => {
    const email = document.querySelector('#email').value.trim()

    if (!email) {
      toast('Enter your email address first')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    if (error) {
      toast(error.message)
      return
    }

    toast('Password reset email sent. Check your inbox.')
  })

  document.querySelector('#signupForm')?.addEventListener('submit', async e => {
    e.preventDefault()

    const full_name = document.querySelector('#fullName').value.trim()
    const email = document.querySelector('#newEmail').value.trim()
    const password = document.querySelector('#newPassword').value

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) return toast(error.message)

    if (data.user) {
      if (data.session) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          full_name,
          role: 'parent'
        })

        if (profileError) {
          toast('Account created, but profile setup needs help from the academy: ' + profileError.message)
          return
        }

        loginAttemptMode = null
        await loadSession()
      } else {
        renderLogin('Account created. Check your email to confirm it, then sign in.')
      }
    }
  })
}

// PASSWORD RESET
function renderResetPassword() {
  shell(`
    <section class="login card">
      <div class="eyebrow">Account recovery</div>
      <h1>Choose a new password</h1>
      <p class="sub">Enter and confirm your new password below.</p>

      <form id="resetForm">
        <div class="field">
          <label>New password</label>
          <input id="resetNewPassword" type="password" minlength="6" required autocomplete="new-password">
        </div>
        <div class="field">
          <label>Confirm new password</label>
          <input id="resetConfirmPassword" type="password" minlength="6" required autocomplete="new-password">
        </div>
        <button class="btn primary wide" type="submit">Save new password</button>
      </form>
    </section>
  `)

  document.querySelector('#resetForm').addEventListener('submit', async e => {
    e.preventDefault()

    const password = document.querySelector('#resetNewPassword').value
    const confirm = document.querySelector('#resetConfirmPassword').value

    if (password !== confirm) {
      toast('Passwords do not match')
      return
    }

    const button = document.querySelector('#resetForm button[type="submit"]')
    button.disabled = true
    button.textContent = 'Updating password...'

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast(error.message)
      button.disabled = false
      button.textContent = 'Save new password'
      return
    }

    await supabase.auth.signOut()

    user = null
    profile = null
    children = []
    loginAttemptMode = null
    loginMode = 'parent'

    renderLogin('Password updated successfully. Please sign in with your new password.')
  })
}

// LOAD ACCOUNT AND CHECK LOGIN ROLE
async function loadSession() {
  const { data: { user: current }, error: userError } = await supabase.auth.getUser()

  if (userError) {
    renderLogin(userError.message)
    return
  }

  user = current

  if (!user) {
    renderLogin()
    return
  }

  const { data: p, error } = await supabase.from('profiles')
    .select('id,full_name,role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    renderLogin(error.message)
    return
  }

  if (!p) {
    if (loginAttemptMode === 'staff') {
      await supabase.auth.signOut()
      user = null
      loginAttemptMode = null
      loginMode = 'staff'
      renderLogin('This account does not have a coach or admin profile. Please contact the academy administrator.')
      return
    }

    shell(`
      <section class="login card">
        <div class="eyebrow">Complete your account</div>
        <h1>Parent profile</h1>
        <p class="sub">Enter your name to finish setting up your account.</p>
        <form id="profileForm">
          <div class="field">
            <label>Full name</label>
            <input id="profileName" required>
          </div>
          <button class="btn primary wide" type="submit">Continue</button>
        </form>
      </section>
    `)

    document.querySelector('#profileForm').addEventListener('submit', async e => {
      e.preventDefault()

      const { error: insertError } = await supabase.from('profiles').insert({
        id: user.id,
        full_name: document.querySelector('#profileName').value.trim(),
        role: 'parent'
      })

      if (insertError) {
        toast(insertError.message)
        return
      }

      loginAttemptMode = null
      await loadSession()
    })

    return
  }

  if (loginAttemptMode === 'staff' && !['coach', 'admin'].includes(p.role)) {
    await supabase.auth.signOut()
    user = null
    profile = null
    loginAttemptMode = null
    loginMode = 'staff'
    renderLogin('This account is not registered as a coach or admin. Please use Parent / Player Login.')
    return
  }

  if (loginAttemptMode === 'parent' && p.role !== 'parent') {
    await supabase.auth.signOut()
    user = null
    profile = null
    loginAttemptMode = null
    loginMode = 'parent'
    renderLogin('This is a staff account. Please use Coach / Admin Login.')
    return
  }

  loginAttemptMode = null
  profile = p
  currentTab = 'home'

  try {
    await loadData()
    renderApp()
  } catch (e) {
    shell(`<div class="card"><h2>Unable to load portal</h2><p>${esc(e.message)}</p></div>`)
  }
}

// LOAD DATA
async function loadData() {
  const activityQuery = supabase.from('activities')
    .select('*')
    .order('activity_date', { ascending: true })

  if (isStaff()) {
    const [aRes, pRes, rRes, reviewRes] = await Promise.all([
      activityQuery,
      supabase.from('players')
        .select('id,name,age_group,jersey_number,position')
        .in('age_group', ['U10', 'U12'])
        .order('name'),
      supabase.from('responses').select('*'),
      supabase.from('activity_reviews').select('*')
    ])

    if (aRes.error) throw aRes.error
    if (pRes.error) throw pRes.error
    if (rRes.error) throw rRes.error
    if (reviewRes.error) throw reviewRes.error

    activities = aRes.data || []
    children = pRes.data || []
    responses = rRes.data || []
    reviews = reviewRes.data || []
  } else {
    const [aRes, linkRes, rRes, reviewRes] = await Promise.all([
      activityQuery,
      supabase.from('parent_players')
        .select('player_id')
        .eq('parent_id', user.id),
      supabase.from('responses').select('*'),
      supabase.from('activity_reviews').select('*')
    ])

    if (aRes.error) throw aRes.error
    if (linkRes.error) throw linkRes.error
    if (rRes.error) throw rRes.error
    if (reviewRes.error) throw reviewRes.error

    activities = aRes.data || []
    responses = rRes.data || []
    reviews = reviewRes.data || []

    const ids = (linkRes.data || []).map(x => x.player_id)

    if (ids.length) {
      const { data: p, error } = await supabase.from('players')
        .select('id,name,age_group,jersey_number,position')
        .in('id', ids)
        .order('name')

      if (error) throw error
      children = p || []
    } else {
      children = []
    }
  }

  activePlayer = children.some(p => p.id === activePlayer)
    ? activePlayer
    : (children[0]?.id || null)

  if (!groupPlayers(profileGroup).length) {
    profileGroup = groupPlayers('U10').length ? 'U10' : 'U12'
  }

  if (isStaff()) {
    const selectedGroupPlayers = groupPlayers(profileGroup)
    if (!selectedGroupPlayers.some(p => p.id === activePlayer)) {
      activePlayer = selectedGroupPlayers[0]?.id || null
    }
  }
}

// MAIN APP ROUTER
function renderApp() {
  addPortalStyles()

  if (isStaff()) {
    renderStaffApp()
  } else {
    renderParentApp()
  }
}

function menuCards() {
  return `
    <h2 class="portal-section-title">Portal menu</h2>
    <div class="portal-menu">
      <button class="portal-menu-card" data-page="profile">
        <div class="portal-menu-icon">👤</div>
        <h2>Player Profile</h2>
        <p>Player details and academy information</p>
      </button>

      <button class="portal-menu-card" data-page="attendance">
        <div class="portal-menu-icon">📅</div>
        <h2>Attendance</h2>
        <p>Training, matches and availability</p>
      </button>

      ${profile?.role !== 'coach' ? `
        <button class="portal-menu-card" data-page="payment">
          <div class="portal-menu-icon">💳</div>
          <h2>Payment</h2>
          <p>Academy fees and payment records</p>
        </button>
      ` : ''}

      <button class="portal-menu-card" data-page="videos">
        <div class="portal-menu-icon">🎬</div>
        <h2>Videos</h2>
        <p>Match footage and player highlights</p>
      </button>
    </div>
  `
}

function bindMenuCards() {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      const page = button.dataset.page

      if (page === 'payment' && profile?.role === 'coach') {
        toast('Coaches do not have access to Payment.')
        currentTab = 'home'
        renderApp()
        return
      }

      currentTab = page
      renderApp()
    })
  })
}

// PARENT PORTAL
function renderParentApp() {
  if (currentTab === 'home') {
    renderParentHome()
    return
  }

  renderPortalPage(false)
}

function renderParentHome() {
  const groups = [...new Set(children.map(p => p.age_group).filter(Boolean))]

  shell(`
    <div class="portal-welcome">
      <div class="eyebrow">Welcome to Gaulois Aerion</div>
      <h1>Hello, ${esc(profile?.full_name || 'Parent')}</h1>
      <p class="sub">Your family portal. What would you like to do today?</p>
    </div>

    ${!children.length ? `
      <div class="card empty">
        <h2>No player linked yet</h2>
        <p>Your account has been created, but the academy still needs to link it to your child. Please contact the coach.</p>
      </div>
    ` : `
      <div class="card">
        <div class="sectionhead">
          <h2>Your player${children.length > 1 ? 's' : ''}</h2>
          <span class="tag">${groups.join(' / ')}</span>
        </div>
        ${children.map(p => `
          <div class="activity">
            <b>${esc(p.name)}</b>
            <p>${esc(p.age_group || 'Age group not set')}</p>
          </div>
        `).join('')}
      </div>
    `}

    ${menuCards()}
  `)

  bindMenuCards()
}

// SHARED PORTAL PAGES
function renderPortalPage(staff) {
  if (currentTab === 'payment' && profile?.role === 'coach') {
    currentTab = 'home'
    toast('Coaches do not have access to Payment.')
    renderApp()
    return
  }

  const pageNames = {
    profile: 'Player Profile',
    attendance: 'Attendance',
    payment: 'Payment',
    videos: 'Videos'
  }

  shell(`
    <div class="portal-back">
      <button class="btn small" id="backHome">← Back to home</button>
    </div>

    <div class="hero">
      <div>
        <div class="eyebrow">Gaulois Aerion Academy</div>
        <h1>${pageNames[currentTab] || 'Academy Portal'}</h1>
        <p class="sub">${esc(profile?.full_name || '')}</p>
      </div>
      <span class="tag">${staff ? (isAdmin() ? 'ADMIN' : 'COACH') : 'PARENT PORTAL'}</span>
    </div>

    <section id="portalPage"></section>
  `)

  document.querySelector('#backHome').addEventListener('click', () => {
    currentTab = 'home'
    renderApp()
  })

  if (currentTab === 'profile') {
    renderPlayerProfile(staff)
  } else if (currentTab === 'attendance') {
    staff ? renderStaffAttendance() : renderAttendancePage()
  } else if (currentTab === 'payment') {
    renderPaymentPage()
  } else if (currentTab === 'videos') {
    renderVideosPage()
  }
}

// PLAYER PROFILE
function renderPlayerProfile(staff) {
  const panel = document.querySelector('#portalPage')

  if (!children.length) {
    panel.innerHTML = '<div class="card empty"><h2>No players found</h2></div>'
    return
  }

  const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']

  if (staff) {
    const availablePlayers = groupPlayers(profileGroup)

    if (!availablePlayers.some(p => p.id === activePlayer)) {
      activePlayer = availablePlayers[0]?.id || null
    }

    const player = availablePlayers.find(p => p.id === activePlayer)

    panel.innerHTML = `
      <div class="card">
        <h2>Select age group</h2>

        <div class="group-switch">
          <button class="${profileGroup === 'U10' ? 'active' : ''}"
            data-profile-group="U10" type="button">U10</button>
          <button class="${profileGroup === 'U12' ? 'active' : ''}"
            data-profile-group="U12" type="button">U12</button>
        </div>

        <h3 class="profile-group-heading">${profileGroup} Player Profiles</h3>
        <p class="profile-player-count">
          ${availablePlayers.length} player${availablePlayers.length === 1 ? '' : 's'} in this age group
        </p>

        ${availablePlayers.length ? `
          <div class="field">
            <label>Select player</label>
            <select id="profilePlayerSelect">
              ${availablePlayers.map(p => `
                <option value="${p.id}" ${p.id === activePlayer ? 'selected' : ''}>
                  ${esc(p.name)}
                </option>
              `).join('')}
            </select>
          </div>
        ` : '<p class="empty">No players found in this age group.</p>'}
      </div>

      ${player ? `
        <div class="profile-banner">
          <div class="profile-avatar">⚽</div>
          <div class="eyebrow">Gaulois Aerion Academy</div>
          <h2>${esc(player.name)}</h2>
          <p>${esc(player.age_group || 'Age group not set')} · Academy Player</p>
        </div>

        <div class="card">
          <h2>Player information</h2>

          <form id="playerDetailsForm">
            <div class="profile-details">
              <div class="profile-detail">
                <small>Full name</small>
                <b>${esc(player.name)}</b>
              </div>

              <div class="profile-detail">
                <small>Age group</small>
                <b>${esc(player.age_group || 'Not set')}</b>
              </div>

              <div class="profile-detail">
                <small>Jersey number</small>
                <input
                  id="jerseyNumber"
                  type="number"
                  min="1"
                  max="99"
                  value="${esc(player.jersey_number || '')}"
                  placeholder="e.g. 10"
                >
              </div>

              <div class="profile-detail">
                <small>Position</small>
                <select id="playerPosition">
                  <option value="">Select position</option>
                  ${positions.map(pos => `
                    <option value="${pos}" ${player.position === pos ? 'selected' : ''}>
                      ${pos}
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <button class="btn primary wide" type="submit" style="margin-top:18px">
              Save player details
            </button>
          </form>
        </div>
      ` : ''}
    `

    document.querySelectorAll('[data-profile-group]').forEach(button => {
      button.addEventListener('click', () => {
        profileGroup = button.dataset.profileGroup
        activePlayer = groupPlayers(profileGroup)[0]?.id || null
        renderPlayerProfile(true)
      })
    })

    document.querySelector('#profilePlayerSelect')?.addEventListener('change', e => {
      activePlayer = e.target.value
      renderPlayerProfile(true)
    })

    document.querySelector('#playerDetailsForm')?.addEventListener('submit', async e => {
      e.preventDefault()

      const jersey_number = document.querySelector('#jerseyNumber').value.trim()
      const position = document.querySelector('#playerPosition').value

      if (jersey_number && (
        Number(jersey_number) < 1 ||
        Number(jersey_number) > 99
      )) {
        toast('Jersey number must be between 1 and 99.')
        return
      }

      if (position && !positions.includes(position)) {
        toast('Please select a valid position.')
        return
      }

      const button = document.querySelector('#playerDetailsForm button[type="submit"]')
      button.disabled = true
      button.textContent = 'Saving...'

      const { error } = await supabase
        .from('players')
        .update({
          jersey_number: jersey_number || null,
          position: position || null
        })
        .eq('id', player.id)

      if (error) {
        toast(error.message)
        button.disabled = false
        button.textContent = 'Save player details'
        return
      }

      await loadData()
      renderPlayerProfile(true)
      toast('Player details saved successfully.')
    })

    return
  }

  // Parent view: display information only.
  const player = children.find(p => p.id === activePlayer) || children[0]

  panel.innerHTML = `
    <div class="card childselect">
      <div class="field">
        <label>Select player</label>
        <select id="profilePlayerSelect">
          ${children.map(p => `
            <option value="${p.id}" ${p.id === player.id ? 'selected' : ''}>
              ${esc(p.name)}
            </option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="profile-banner">
      <div class="profile-avatar">⚽</div>
      <div class="eyebrow">Gaulois Aerion Academy</div>
      <h2>${esc(player.name)}</h2>
      <p>${esc(player.age_group || 'Age group not set')} · Academy Player</p>
    </div>

    <div class="card">
      <h2>Player information</h2>
      <div class="profile-details">
        <div class="profile-detail">
          <small>Full name</small>
          <b>${esc(player.name)}</b>
        </div>
        <div class="profile-detail">
          <small>Age group</small>
          <b>${esc(player.age_group || 'Not set')}</b>
        </div>
        <div class="profile-detail">
          <small>Jersey number</small>
          <b>${player.jersey_number ? '#' + esc(player.jersey_number) : 'Not assigned'}</b>
        </div>
        <div class="profile-detail">
          <small>Position</small>
          <b>${esc(player.position || 'Not assigned')}</b>
        </div>
      </div>
    </div>
  `

  document.querySelector('#profilePlayerSelect').addEventListener('change', e => {
    activePlayer = e.target.value
    renderPlayerProfile(false)
  })
}

// PARENT ATTENDANCE
function renderAttendancePage() {
  const panel = document.querySelector('#portalPage')

  if (!children.length) {
    panel.innerHTML = `
      <div class="card empty">
        <h2>No player linked yet</h2>
        <p>Please contact the academy.</p>
      </div>
    `
    return
  }

  const player = children.find(p => p.id === activePlayer) || children[0]

  panel.innerHTML = `
    <div class="card childselect">
      <div class="sectionhead">
        <h2>Linked player</h2>
        <span class="tag">${esc(player.age_group || '')}</span>
      </div>
      <div class="field">
        <label>Select your child</label>
        <select id="childSelect">
          ${children.map(p => `
            <option value="${p.id}" ${p.id === player.id ? 'selected' : ''}>${esc(p.name)}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="subtabs">
      <button class="${parentSubTab === 'activities' ? 'active' : ''}" data-subtab="activities">Activities</button>
      <button class="${parentSubTab === 'history' ? 'active' : ''}" data-subtab="history">My responses</button>
    </div>

    <section id="attendanceContent"></section>
  `

  document.querySelector('#childSelect').addEventListener('change', e => {
    activePlayer = e.target.value
    renderAttendancePage()
  })

  document.querySelectorAll('[data-subtab]').forEach(button => {
    button.addEventListener('click', () => {
      parentSubTab = button.dataset.subtab
      renderAttendancePage()
    })
  })

  const content = document.querySelector('#attendanceContent')

  if (parentSubTab === 'history') {
    const rows = responses.filter(r => r.player_id === player.id)

    content.innerHTML = `
      <div class="card">
        <h2>My response history</h2>
        ${rows.length ? rows.map(r => {
          const a = activities.find(x => x.id === r.activity_id)
          const review = a ? reviewFor(a.id) : null

          return a ? `
            <div class="activity">
              <div class="activitytop">
                <b>${esc(player.name)} · ${esc(a.title)}</b>
                ${statusTag(r.answer)}
              </div>
              <p>${dateLabel(a.activity_date)}</p>
              <p>${r.absence_reason ? `Reason: ${esc(r.absence_reason)}` : 'No reason supplied'}</p>
              ${review ? `
                <div class="review-box">
                  <h4>Coach's session review</h4>
                  <p class="review-note">${esc(review.review_note)}</p>
                </div>
              ` : ''}
            </div>
          ` : ''
        }).join('') : '<div class="empty">No responses submitted yet.</div>'}
      </div>
    `
    return
  }

  const published = activities.filter(a =>
    a.is_published &&
    (a.age_group || 'U12') === player.age_group
  )

  content.innerHTML = `
    <div class="grid">
      ${published.length
        ? published.map(a => activityCard(a, player)).join('')
        : '<div class="card span12 empty">No activities have been published for this age group yet.</div>'}
    </div>
  `

  bindAttendanceButtons()
}

// STAFF ATTENDANCE
function renderStaffAttendance() {
  const panel = document.querySelector('#portalPage')
  const players = groupPlayers(staffGroup)
  const groupActs = groupActivities(staffGroup)

  panel.innerHTML = `
    <div class="card">
      <h2>Select age group</h2>
      <div class="group-switch">
        <button class="${staffGroup === 'U10' ? 'active' : ''}" data-group="U10">U10</button>
        <button class="${staffGroup === 'U12' ? 'active' : ''}" data-group="U12">U12</button>
      </div>
      <p class="sub">Manage activities and attendance for ${staffGroup}.</p>
    </div>

    <div class="staff-section">
      <div class="card">
        <h2>${staffGroup} roster · ${players.length} players</h2>
        ${players.length ? `
          <div class="roster-grid">
            ${players.map(p => `<div class="roster-player">${esc(p.name)}</div>`).join('')}
          </div>
        ` : '<p class="empty">No players in this age group yet.</p>'}
      </div>
    </div>

    <div class="staff-section card">
      <h2>Publish a ${staffGroup} activity</h2>
      <form id="activityForm">
        <div class="formgrid">
          <div class="field">
            <label>Activity type</label>
            <select id="actType">
              <option value="training">Training</option>
              <option value="match">Match</option>
            </select>
          </div>

          <div class="field">
            <label>Date</label>
            <input id="actDate" type="date" required>
          </div>

          <div class="field">
            <label>Activity title</label>
            <input id="actTitle" required placeholder="e.g. ${staffGroup} Training Session">
          </div>

          <div class="field">
            <label>Start time</label>
            <input id="actTime" type="time">
          </div>

          <div class="field">
            <label>End time</label>
            <input id="actEndTime" type="time">
          </div>

          <div class="field">
            <label>Venue</label>
            <input id="actVenue">
          </div>

          <div class="field">
            <label>Opponent (matches)</label>
            <input id="actOpponent">
          </div>

          <div class="field full">
            <label>Additional information (optional)</label>
            <textarea id="actNotes"></textarea>
          </div>
        </div>

        <button class="btn primary" type="submit">Publish ${staffGroup} activity</button>
      </form>
    </div>

    <div class="staff-section card">
      <h2>${staffGroup} activities and availability</h2>
      ${groupActs.length
        ? groupActs.map(a => staffActivityReport(a, players)).join('')
        : '<p class="empty">No activities published for this group yet.</p>'}
    </div>
  `

  document.querySelectorAll('[data-group]').forEach(button => {
    button.addEventListener('click', () => {
      staffGroup = button.dataset.group
      renderStaffAttendance()
    })
  })

  document.querySelector('#activityForm').addEventListener('submit', createActivity)

  document.querySelectorAll('[data-save-review]').forEach(button => {
    button.addEventListener('click', () => saveReview(button.dataset.saveReview))
  })
}

function staffActivityReport(a, players) {
  const rs = responses.filter(r => r.activity_id === a.id)
  const count = v => rs.filter(r => r.answer === v).length
  const answered = players.filter(p => rs.some(r => r.player_id === p.id)).length
  const existingReview = reviewFor(a.id)
  const canReview = a.activity_type === 'training' && activityHasEnded(a)

  return `
    <div class="activity">
      <div class="activitytop">
        <div>
          <span class="tag ${a.activity_type === 'match' ? 'match' : ''}">${esc(a.activity_type)}</span>
          <h3>${esc(a.title)}</h3>
          <p>
            ${dateLabel(a.activity_date)}
            ${a.start_time ? '· Start ' + esc(String(a.start_time).slice(0, 5)) : ''}
            ${a.end_time ? '· End ' + esc(String(a.end_time).slice(0, 5)) : ''}
          </p>
          <p>${a.venue ? esc(a.venue) : 'Venue to be confirmed'}</p>
        </div>
        <b>${count('yes')} / ${players.length} yes</b>
      </div>

      <div class="response">
        ${statusTag('yes')} ${count('yes')}
        ${statusTag('no')} ${count('no')}
        ${statusTag('unsure')} ${count('unsure')}
        ${statusTag(null)} ${Math.max(0, players.length - answered)}
      </div>

      <div class="tablewrap">
        <table>
          <thead>
            <tr><th>Player</th><th>Availability</th><th>Reason</th></tr>
          </thead>
          <tbody>
            ${players.map(p => {
              const r = rs.find(x => x.player_id === p.id)
              return `
                <tr>
                  <td>${esc(p.name)}</td>
                  <td>${statusTag(r?.answer)}</td>
                  <td>${esc(r?.absence_reason || '—')}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>

      ${a.activity_type === 'training' ? `
        <div class="review-box">
          <h4>Post-training review</h4>
          ${canReview ? `
            <p class="muted smalltext">
              This training session has ended. Add a review for parents and players.
            </p>
            <div class="field review-form">
              <label>Session review note</label>
              <textarea id="review-${a.id}" placeholder="Write a short note about the session, focus areas, progress and things to work on...">${esc(existingReview?.review_note || '')}</textarea>
            </div>
            <button class="btn primary small" data-save-review="${a.id}" type="button">
              ${existingReview ? 'Update review' : 'Save review'}
            </button>
            ${existingReview ? '<p class="muted smalltext">A review has already been saved and is visible to linked parents.</p>' : ''}
          ` : `
            <p class="review-pending">
              The review section will become available after the training session ends.
              ${a.end_time ? `Scheduled end time: ${esc(String(a.end_time).slice(0, 5))}.` : 'No end time was entered; it will become available the following day.'}
            </p>
          `}
        </div>
      ` : ''}
    </div>
  `
}

// SAVE OR UPDATE A TRAINING REVIEW
async function saveReview(activityId) {
  if (!isStaff()) {
    toast('You do not have permission to save a review.')
    return
  }

  const activity = activities.find(a => a.id === activityId)

  if (!activity || activity.activity_type !== 'training') {
    toast('Reviews are only available for training sessions.')
    return
  }

  if (!activityHasEnded(activity)) {
    toast('The review will be available after the session ends.')
    return
  }

  const textarea = document.querySelector(`#review-${CSS.escape(activityId)}`)
  const review_note = textarea?.value.trim()

  if (!review_note) {
    toast('Please enter a review note first.')
    return
  }

  const payload = {
    activity_id: activityId,
    review_note,
    created_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('activity_reviews')
    .upsert(payload, { onConflict: 'activity_id' })

  if (error) {
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast('Training review saved. Parents can now view it.')
}

// PAYMENT
function renderPaymentPage() {
  const panel = document.querySelector('#portalPage')

  if (profile?.role === 'coach') {
    currentTab = 'home'
    toast('Coaches do not have access to Payment.')
    renderApp()
    return
  }

  panel.innerHTML = `
    <div class="card">
      <div class="payment-placeholder">
        <div class="payment-icon">💳</div>
        <h2>Payment & Fees</h2>
        <p class="sub">Academy payment information will be available here.</p>
        <span class="tag">Coming soon</span>
      </div>
    </div>

    <div class="card spacetop">
      <h2>Payment information</h2>
      <div class="profile-details">
        <div class="profile-detail"><small>Players</small><b>${children.length ? esc(children.map(p => p.name).join(', ')) : 'Not linked'}</b></div>
        <div class="profile-detail"><small>Payment status</small><b>To be updated</b></div>
        <div class="profile-detail"><small>Outstanding fees</small><b>To be updated</b></div>
        <div class="profile-detail"><small>Payment history</small><b>Coming soon</b></div>
      </div>
      <div class="placeholder-note">
        No payments can be made or recorded through this page yet.
      </div>
    </div>
  `
}

// VIDEOS
function renderVideosPage() {
  const panel = document.querySelector('#portalPage')

  panel.innerHTML = `
    <div class="card">
      <h2>Player Videos</h2>
      <p class="sub">Match footage, training clips and player highlights will appear here.</p>

      <div class="video-grid">
        ${['Match Highlights', 'Training Footage', 'Player Highlights', 'Academy Moments'].map(title => `
          <div class="video-placeholder">
            <div class="video-frame">▶</div>
            <h3>${title}</h3>
            <p>No video uploaded yet</p>
          </div>
        `).join('')}
      </div>

      <div class="placeholder-note">
        These are empty placeholder frames only. No videos are currently uploaded or embedded.
      </div>
    </div>
  `
}

function statusTag(answer) {
  const label = answer === 'yes'
    ? 'Yes'
    : answer === 'no'
      ? 'No'
      : answer === 'unsure'
        ? 'Unsure'
        : 'Pending'

  return `<span class="status ${answer || 'pending'}">${label}</span>`
}

// PARENT ACTIVITY CARD
function activityCard(a, player) {
  const r = responseFor(a.id, player.id)
  const review = reviewFor(a.id)
  const ended = activityHasEnded(a)

  return `
    <article class="card activity">
      <div class="activitytop">
        <span class="tag ${a.activity_type === 'match' ? 'match' : ''}">${esc(a.activity_type)}</span>
        ${statusTag(r?.answer)}
      </div>

      <h2>${esc(a.title)}</h2>
      <p>
        ${dateLabel(a.activity_date)}
        ${a.start_time ? `· ${esc(String(a.start_time).slice(0, 5))}` : ''}
        ${a.end_time ? `– ${esc(String(a.end_time).slice(0, 5))}` : ''}
      </p>
      <p>${a.opponent ? `Opponent: ${esc(a.opponent)} · ` : ''}${a.venue ? `Venue: ${esc(a.venue)}` : 'Venue to be confirmed'}</p>
      ${a.notes ? `<p>${esc(a.notes)}</p>` : ''}

      ${a.activity_type === 'training' && review ? `
        <div class="review-box">
          <h4>Coach's session review</h4>
          <p class="review-note">${esc(review.review_note)}</p>
        </div>
      ` : a.activity_type === 'training' && ended ? `
        <p class="review-pending">The coach has not published a session review yet.</p>
      ` : ''}

      <div class="responsearea">
        <b>Can ${esc(player.name)} attend?</b>
        <div class="response">
          ${[['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']].map(([v, l]) => `
            <button class="choice ${r?.answer === v ? 'selected ' + v : ''}" data-answer="${v}" data-activity="${a.id}" data-player="${player.id}">${l}</button>
          `).join('')}
        </div>

        ${r?.answer === 'no' ? `
          <div class="field">
            <label>Reason for absence (optional)</label>
            <textarea id="reason-${a.id}">${esc(r.absence_reason || '')}</textarea>
            <button class="btn small" data-reason="${a.id}" data-player="${player.id}">Save reason</button>
          </div>
        ` : ''}

        <p class="muted smalltext">No response deadline · You can update your answer at any time.</p>
      </div>
    </article>
  `
}

function bindAttendanceButtons() {
  document.querySelectorAll('[data-answer]').forEach(b =>
    b.addEventListener('click', () => saveAnswer(
      b.dataset.activity,
      b.dataset.player,
      b.dataset.answer
    ))
  )

  document.querySelectorAll('[data-reason]').forEach(b =>
    b.addEventListener('click', () => saveReason(
      b.dataset.reason,
      b.dataset.player
    ))
  )
}

async function saveAnswer(activity_id, player_id, answer) {
  const payload = {
    activity_id,
    player_id,
    responded_by: user.id,
    answer
  }

  const { error } = await supabase.from('responses')
    .upsert(payload, { onConflict: 'activity_id,player_id' })

  if (error) {
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast('Availability updated')
}

async function saveReason(activity_id, player_id) {
  const old = responseFor(activity_id, player_id)
  if (!old) return

  const textarea = document.querySelector(`#reason-${CSS.escape(activity_id)}`)
  if (!textarea) return

  const absence_reason = textarea.value

  const { error } = await supabase.from('responses')
    .update({ absence_reason, responded_by: user.id })
    .eq('id', old.id)

  if (error) {
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast('Optional reason saved')
}

// STAFF PORTAL
function renderStaffApp() {
  if (currentTab === 'home') {
    renderStaffHome()
    return
  }

  renderPortalPage(true)
}

function renderStaffHome() {
  const u10 = groupPlayers('U10')
  const u12 = groupPlayers('U12')

  shell(`
    <div class="portal-welcome">
      <div class="eyebrow">Gaulois Aerion Academy</div>
      <h1>Hello, ${esc(profile?.full_name || (isAdmin() ? 'Admin' : 'Coach'))}</h1>
      <p class="sub">${isAdmin() ? 'Academy administration portal.' : 'Coach portal.'}</p>
    </div>

    <div class="grid">
      <div class="card span6">
        <div class="muted">U10 players</div>
        <div class="metric">${u10.length}</div>
      </div>
      <div class="card span6">
        <div class="muted">U12 players</div>
        <div class="metric">${u12.length}</div>
      </div>
    </div>

    ${menuCards()}
  `)

  bindMenuCards()
}

// CREATE ACTIVITY
async function createActivity(e) {
  e.preventDefault()

  const payload = {
    age_group: staffGroup,
    activity_type: document.querySelector('#actType').value,
    title: document.querySelector('#actTitle').value.trim(),
    activity_date: document.querySelector('#actDate').value,
    start_time: document.querySelector('#actTime').value || null,
    end_time: document.querySelector('#actEndTime').value || null,
    venue: document.querySelector('#actVenue').value.trim() || null,
    opponent: document.querySelector('#actOpponent').value.trim() || null,
    notes: document.querySelector('#actNotes').value.trim() || null,
    is_published: true
  }

  const { error } = await supabase.from('activities').insert(payload)

  if (error) {
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast(`${staffGroup} activity published`)
}

async function init() {
  if (!supabaseUrl || !supabaseKey) {
    renderLogin('The Supabase environment variables are missing. Check the Netlify build settings and redeploy.')
    return
  }

  addPortalStyles()
  supabase = createClient(supabaseUrl, supabaseKey)

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) {
      user = session.user
      renderResetPassword()
      return
    }

    if (event === 'INITIAL_SESSION') {
      if (session?.user) {
        user = session.user
        loadSession().catch(e => renderLogin(e.message))
      } else {
        renderLogin()
      }
    }
  })
}

init()

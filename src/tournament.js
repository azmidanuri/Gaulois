// Gaulois Aerion Academy — Tournament Portal
// Loaded by src/main.js. Uses the existing Supabase client and portal helpers.

export function initTournamentPortal({ supabase, root, getUser, canManage, visiblePlayers, header, backButton, icon, esc, formatDate, showMessage }) {
  let tournaments = []
  let registrations = []
  let ageGroups = []
  let squadRows = []

  const user = () => getUser()

  const statusLabel = value => ({
    draft: 'Draft', published: 'Open for registration', closed: 'Registration closed',
    completed: 'Completed', available: 'Available', unavailable: 'Unavailable',
    pending: 'Pending', selected: 'Selected', reserve: 'Reserve',
    not_selected: 'Not selected', confirmed: 'Confirmed', declined: 'Declined'
  }[value] || value || '—')

  const badge = (value, extra = '') =>
    `<span class="tournament-badge ${esc(extra || value || '')}">${esc(statusLabel(value))}</span>`

  const field = (label, id, value = '', type = 'text', required = false) => `
    <label>${label}</label>
    <input id="${id}" type="${type}" value="${esc(value ?? '')}" ${required ? 'required' : ''}>
  `

  async function loadTournaments() {
    const { data, error } = await supabase.from('tournaments').select('*').order('start_date', { ascending: true })
    if (error) throw error
    tournaments = data || []

    const ids = tournaments.map(t => t.id)
    if (!ids.length) {
      ageGroups = []
      registrations = []
      squadRows = []
      return
    }

    const [groupsResult, registrationResult, squadResult] = await Promise.all([
      supabase.from('tournament_age_groups').select('*').in('tournament_id', ids),
      supabase.from('tournament_registrations').select('*').in('tournament_id', ids),
      supabase.from('tournament_squad_players').select('*').in('tournament_id', ids)
    ])
    if (groupsResult.error) throw groupsResult.error
    if (registrationResult.error) throw registrationResult.error
    if (squadResult.error) throw squadResult.error
    ageGroups = groupsResult.data || []
    registrations = registrationResult.data || []
    squadRows = squadResult.data || []
  }

  function groupsFor(id) {
    return ageGroups.filter(g => String(g.tournament_id) === String(id)).map(g => g.age_group)
  }

  function myPlayersFor(tournament) {
    const allowed = groupsFor(tournament.id)
    return visiblePlayers().filter(p => allowed.includes(p.age_group))
  }

  function registrationFor(tournamentId, playerId) {
    return registrations.find(r => String(r.tournament_id) === String(tournamentId) && String(r.player_id) === String(playerId))
  }

  function tournamentCard(t) {
    const groups = groupsFor(t.id)
    const mine = canManage() ? registrations.filter(r => String(r.tournament_id) === String(t.id)) :
      registrations.filter(r => String(r.tournament_id) === String(t.id) && myPlayersFor(t).some(p => String(p.id) === String(r.player_id)))
    const selected = squadRows.filter(s => String(s.tournament_id) === String(t.id) && s.squad_role === 'selected').length
    return `
      <article class="tournament-card">
        <div class="tournament-card-top">
          ${badge(t.status)}
          <span class="muted">${groups.map(esc).join(' · ') || 'No age groups assigned'}</span>
        </div>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.description || 'Tournament details will be updated by the coaching team.')}</p>
        <div class="tournament-meta">
          <span>${icon('calendar', 15)} ${formatDate(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ''}</span>
          ${t.location ? `<span>${icon('pin', 15)} ${esc(t.location)}</span>` : ''}
          <span>${icon('users', 15)} ${mine.length} registration${mine.length === 1 ? '' : 's'}</span>
        </div>
        ${t.registration_deadline ? `<small class="muted">Registration deadline: ${formatDate(t.registration_deadline)}</small>` : ''}
        <button class="primary-btn tournament-open-btn" data-tournament-action="open" data-id="${t.id}">View tournament</button>
        ${canManage() ? `<div class="tournament-admin-line"><span>${selected} selected</span><button class="secondary-btn" data-tournament-action="edit" data-id="${t.id}">Edit</button></div>` : ''}
      </article>`
  }

  function staffCreateForm() {
    const teams = [...new Set(visiblePlayers().map(p => p.age_group).filter(Boolean))].sort()
    return `
      <section class="tournament-panel">
        <h3>${icon('plus', 19)} Create tournament</h3>
        <form id="tournament-create-form" class="tournament-form">
          ${field('Tournament name', 't-name', '', 'text', true)}
          ${field('Location / venue', 't-location')}
          ${field('Start date', 't-start', '', 'date', true)}
          ${field('End date', 't-end', '', 'date')}
          ${field('Registration deadline', 't-deadline', '', 'date')}
          <label>Description / information</label>
          <textarea id="t-description" rows="3" placeholder="Tournament format, travel details, kit, meeting point..."></textarea>
          <fieldset class="tournament-age-options">
            <legend>Eligible age groups</legend>
            ${teams.map(team => `<label><input type="checkbox" name="t-age-group" value="${esc(team)}"> ${esc(team)}</label>`).join('') || '<small>No teams available.</small>'}
          </fieldset>
          <label>Initial status</label>
          <select id="t-status"><option value="draft">Save as draft</option><option value="published">Publish registration</option></select>
          <button class="primary-btn" type="submit">Create tournament</button>
        </form>
      </section>`
  }

  function staffRegistrationTable(t) {
    const rows = registrations.filter(r => String(r.tournament_id) === String(t.id))
    const playerMap = new Map(visiblePlayers().map(p => [String(p.id), p]))
    const squad = squadRows.filter(s => String(s.tournament_id) === String(t.id))
    return `
      <div class="tournament-table-wrap">
        <table class="tournament-table">
          <thead><tr><th>Player</th><th>Age group</th><th>Availability</th><th>Selection</th><th>Parent response</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const p = playerMap.get(String(r.player_id))
              return `<tr>
                <td>${esc(p?.name || 'Player record unavailable')}</td>
                <td>${esc(p?.age_group || '—')}</td>
                <td>${badge(r.availability)}</td>
                <td>${badge(r.selection_status)}</td>
                <td>${badge(r.parent_confirmation)}</td>
              </tr>`
            }).join('') || '<tr><td colspan="5">No registrations yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="tournament-selection">
        <h4>Coach selection</h4>
        <p class="muted">Choose registered players as selected or reserve. Parents must still confirm a selected place.</p>
        ${rows.map(r => {
          const p = playerMap.get(String(r.player_id))
          if (!p) return ''
          const current = squad.find(s => String(s.player_id) === String(r.player_id))
          return `<div class="tournament-select-row">
            <span><strong>${esc(p.name)}</strong><small>${esc(p.age_group || '')} · ${esc(r.availability)}</small></span>
            <select class="tournament-role" data-player="${r.player_id}" data-tournament="${t.id}">
              <option value="">Not selected</option>
              <option value="selected" ${current?.squad_role === 'selected' ? 'selected' : ''}>Selected</option>
              <option value="reserve" ${current?.squad_role === 'reserve' ? 'selected' : ''}>Reserve</option>
            </select>
          </div>`
        }).join('')}
        <button class="primary-btn" data-tournament-action="save-squad" data-id="${t.id}">Save coach selection</button>
        <button class="secondary-btn" data-tournament-action="export-registrations" data-id="${t.id}">Export registrations CSV</button>
        <button class="secondary-btn" data-tournament-action="export-squad" data-id="${t.id}">Export final squad CSV</button>
      </div>`
  }

  function parentPlayerRows(t) {
    const players = myPlayersFor(t)
    return players.map(p => {
      const r = registrationFor(t.id, p.id)
      const deadlinePassed = t.registration_deadline && t.registration_deadline < new Date().toISOString().slice(0, 10)
      const open = t.status === 'published' && !deadlinePassed
      return `<article class="tournament-player-card">
        <div><strong>${esc(p.name)}</strong><small>${esc(p.age_group || '')}</small></div>
        ${r ? `
          <div class="tournament-status-grid">
            <span>Availability ${badge(r.availability)}</span>
            <span>Selection ${badge(r.selection_status)}</span>
            <span>Parent response ${badge(r.parent_confirmation)}</span>
          </div>
          ${open ? `<label>Update availability
            <select class="tournament-availability" data-tournament="${t.id}" data-player="${p.id}">
              <option value="available" ${r.availability === 'available' ? 'selected' : ''}>Available</option>
              <option value="unavailable" ${r.availability === 'unavailable' ? 'selected' : ''}>Unavailable</option>
            </select></label>
            <button class="small-save-btn" data-tournament-action="availability" data-id="${t.id}" data-player="${p.id}">Save availability</button>` : ''}
          ${r.selection_status === 'selected' && r.parent_confirmation === 'pending' ? `
            <div class="tournament-confirm-actions">
              <button class="primary-btn" data-tournament-action="respond" data-id="${t.id}" data-player="${p.id}" data-response="confirmed">Confirm place</button>
              <button class="delete-btn" data-tournament-action="respond" data-id="${t.id}" data-player="${p.id}" data-response="declined">Decline</button>
            </div>` : ''}
        ` : open ? `
          <button class="primary-btn" data-tournament-action="register" data-id="${t.id}" data-player="${p.id}">Register interest</button>
        ` : '<small class="muted">Registration is not open.</small>'}
      </article>`
    }).join('') || '<p class="muted">No linked children in the eligible age groups.</p>'
  }

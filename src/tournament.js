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
  function detailPage(t) {
    return `
      <main class="container">
        <button class="secondary-btn" data-tournament-action="back">← Back to tournaments</button>
        <section class="tournament-detail-header">
          ${badge(t.status)}
          <h2>${esc(t.name)}</h2>
          <p>${esc(t.description || 'Tournament details will be updated by the coaching team.')}</p>
          <div class="tournament-meta">
            <span>${icon('calendar', 15)} ${formatDate(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ` – ${formatDate(t.end_date)}` : ''}</span>
            ${t.location ? `<span>${icon('pin', 15)} ${esc(t.location)}</span>` : ''}
          </div>
          ${t.registration_deadline ? `<p><strong>Registration deadline:</strong> ${formatDate(t.registration_deadline)}</p>` : ''}
          <p><strong>Eligible age groups:</strong> ${groupsFor(t.id).map(esc).join(' · ')}</p>
        </section>
        ${canManage() ? `
          <section class="tournament-panel">
            <h3>Registrations and squad management</h3>
            ${staffRegistrationTable(t)}
          </section>
        ` : `
          <section class="tournament-panel">
            <h3>Player registration</h3>
            <p class="muted">Register your eligible child’s interest below. Coaches will review registrations and confirm the final squad.</p>
            <div class="tournament-player-list">${parentPlayerRows(t)}</div>
          </section>
        `}
      </main>`
  }

  function listPage() {
    const shown = canManage()
      ? tournaments
      : tournaments.filter(t => t.status === 'published' || t.status === 'closed' || t.status === 'completed')

    return `
      <main class="container">
        ${backButton()}
        <div class="page-heading">
          <h2>Tournaments</h2>
          <p class="muted">Tournament registration, coach selection and parent confirmations.</p>
        </div>
        ${canManage() ? staffCreateForm() : ''}
        <section class="tournament-list">
          ${shown.length ? shown.map(tournamentCard).join('') : '<div class="empty-state">No tournaments are currently available.</div>'}
        </section>
      </main>`
  }

  async function renderTournamentPage() {
    await loadTournaments()
    const id = sessionStorage.getItem('ga-tournament-open')
    const t = id ? tournaments.find(x => String(x.id) === String(id)) : null
    root.innerHTML = t ? detailPage(t) : listPage()
  }

  function csvDownload(filename, rows) {
    const csv = rows.map(row =>
      row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\r\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveCoachSquad(tournamentId) {
    if (!canManage()) return

    const selects = [...root.querySelectorAll(
      `.tournament-role[data-tournament="${tournamentId}"]`
    )]
    const chosen = selects.filter(s => s.value)

    const { error: delError } = await supabase
      .from('tournament_squad_players')
      .delete()
      .eq('tournament_id', tournamentId)

    if (delError) throw delError

    const rows = chosen.map((s, index) => ({
      tournament_id: tournamentId,
      player_id: s.dataset.player,
      squad_role: s.value,
      selection_order: index + 1,
      selected_by: user().id
    }))

    if (rows.length) {
      const { error } = await supabase
        .from('tournament_squad_players')
        .insert(rows)

      if (error) throw error
    }

    const allRegs = registrations.filter(
      r => String(r.tournament_id) === String(tournamentId)
    )

    for (const r of allRegs) {
      const selectedRow = rows.find(
        x => String(x.player_id) === String(r.player_id)
      )

      const selection_status = selectedRow?.squad_role || 'not_selected'
      const parent_confirmation = 'pending'

      const { error } = await supabase
        .from('tournament_registrations')
        .update({ selection_status, parent_confirmation })
        .eq('id', r.id)

      if (error) throw error
    }

    await renderTournamentPage()
    showMessage('Tournament selection saved. Selected parents can now confirm or decline in their portal.')
  }

  async function handleClick(event) {
    const el = event.target.closest('[data-tournament-action]')
    if (!el) return

    const action = el.dataset.tournamentAction
    const id = el.dataset.id
    const playerId = el.dataset.player

    try {
      if (action === 'back') {
        sessionStorage.removeItem('ga-tournament-open')
        await renderTournamentPage()

      } else if (action === 'open') {
        sessionStorage.setItem('ga-tournament-open', id)
        await renderTournamentPage()

      } else if (action === 'edit') {
        const t = tournaments.find(x => String(x.id) === String(id))
        if (!t || !canManage()) return

        const name = prompt('Tournament name:', t.name)
        if (name === null) return

        const location = prompt('Location:', t.location || '')
        if (location === null) return

        const description = prompt('Description:', t.description || '')
        if (description === null) return

        const start_date = prompt('Start date (YYYY-MM-DD):', t.start_date || '')
        if (start_date === null) return

        const end_date = prompt('End date (YYYY-MM-DD, optional):', t.end_date || '')
        if (end_date === null) return

        const registration_deadline = prompt(
          'Registration deadline (YYYY-MM-DD, optional):',
          t.registration_deadline || ''
        )
        if (registration_deadline === null) return

        const status = prompt(
          'Status (draft, published, closed, completed):',
          t.status
        )
        if (status === null) return

        const groupInput = prompt(
          'Eligible age groups, separated by commas:',
          groupsFor(t.id).join(', ')
        )
        if (groupInput === null) return

        if (!['draft', 'published', 'closed', 'completed'].includes(status)) {
          return showMessage('Invalid tournament status.')
        }

        if (!start_date.trim() ||
          (end_date.trim() && end_date.trim() < start_date.trim())) {
          return showMessage('Please check the tournament dates.')
        }

        const newGroups = [...new Set(
          groupInput.split(',').map(x => x.trim()).filter(Boolean)
        )]

        if (!newGroups.length) {
          return showMessage('A tournament must have at least one age group.')
        }

        const { error } = await supabase
          .from('tournaments')
          .update({
            name: name.trim(),
            location: location.trim() || null,
            description: description.trim() || null,
            start_date: start_date.trim(),
            end_date: end_date.trim() || null,
            registration_deadline: registration_deadline.trim() || null,
            status
          })
          .eq('id', id)

        if (error) throw error

        const { error: deleteGroupsError } = await supabase
          .from('tournament_age_groups')
          .delete()
          .eq('tournament_id', id)

        if (deleteGroupsError) throw deleteGroupsError

        const { error: insertGroupsError } = await supabase
          .from('tournament_age_groups')
          .insert(newGroups.map(age_group => ({
            tournament_id: id,
            age_group
          })))

        if (insertGroupsError) throw insertGroupsError

        await renderTournamentPage()

      } else if (action === 'register') {
        const { error } = await supabase.rpc(
          'tournament_register_player',
          { p_tournament_id: id, p_player_id: playerId }
        )

        if (error) throw error

        await renderTournamentPage()
        showMessage('Your child’s interest has been registered.')

      } else if (action === 'availability') {
        const select = root.querySelector(
          `.tournament-availability[data-tournament="${id}"][data-player="${playerId}"]`
        )

        const { error } = await supabase.rpc(
          'tournament_update_availability',
          {
            p_tournament_id: id,
            p_player_id: playerId,
            p_availability: select.value
          }
        )

        if (error) throw error

        await renderTournamentPage()
        showMessage('Availability updated.')

      } else if (action === 'respond') {
        const response = el.dataset.response

        const { error } = await supabase.rpc(
          'tournament_respond_invitation',
          {
            p_tournament_id: id,
            p_player_id: playerId,
            p_response: response
          }
        )

        if (error) throw error

        await renderTournamentPage()
        showMessage(
          response === 'confirmed'
            ? 'Your place is confirmed.'
            : 'You have declined the invitation.'
        )

      } else if (action === 'save-squad') {
        await saveCoachSquad(id)

      } else if (
        action === 'export-registrations' ||
        action === 'export-squad'
      ) {
        const t = tournaments.find(x => String(x.id) === String(id))
        const playerMap = new Map(
          visiblePlayers().map(p => [String(p.id), p])
        )

        if (action === 'export-registrations') {
          const rows = registrations.filter(
            r => String(r.tournament_id) === String(id)
          )

          csvDownload(`${t.name}-registrations.csv`, [
            ['Player', 'Age Group', 'Availability', 'Selection', 'Parent Confirmation'],
            ...rows.map(r => {
              const p = playerMap.get(String(r.player_id))
              return [
                p?.name,
                p?.age_group,
                r.availability,
                r.selection_status,
                r.parent_confirmation
              ]
            })
          ])

        } else {
          const rows = squadRows.filter(
            r => String(r.tournament_id) === String(id)
          )

          csvDownload(`${t.name}-squad.csv`, [
            ['Player', 'Age Group', 'Squad Role', 'Parent Confirmation'],
            ...rows.map(r => {
              const p = playerMap.get(String(r.player_id))
              const reg = registrationFor(id, r.player_id)

              return [
                p?.name,
                p?.age_group,
                r.squad_role,
                reg?.parent_confirmation
              ]
            })
          ])
        }
      }

    } catch (error) {
      console.error(error)
      showMessage(error.message || 'Tournament action failed.')
    }
  }
    async function handleSubmit(event) {
    if (event.target.id !== 'tournament-create-form') return

    event.preventDefault()
    if (!canManage()) return

    const form = event.target
    const groups = [...form.querySelectorAll(
      'input[name="t-age-group"]:checked'
    )].map(x => x.value)

    if (!groups.length) {
      return showMessage('Select at least one eligible age group.')
    }

    const payload = {
      name: form.querySelector('#t-name').value.trim(),
      location: form.querySelector('#t-location').value.trim() || null,
      start_date: form.querySelector('#t-start').value,
      end_date: form.querySelector('#t-end').value || null,
      registration_deadline: form.querySelector('#t-deadline').value || null,
      description: form.querySelector('#t-description').value.trim() || null,
      status: form.querySelector('#t-status').value,
      created_by: user().id
    }

    if (!payload.name) return showMessage('Enter a tournament name.')

    if (payload.end_date && payload.end_date < payload.start_date) {
      return showMessage('End date cannot be before start date.')
    }

    if (
      payload.registration_deadline &&
      payload.registration_deadline > payload.start_date
    ) {
      return showMessage(
        'Registration deadline should be on or before the tournament start date.'
      )
    }

    try {
      const { data, error } = await supabase
        .from('tournaments')
        .insert(payload)
        .select('id')
        .single()

      if (error) throw error

      const groupRows = groups.map(age_group => ({
        tournament_id: data.id,
        age_group
      }))

      const { error: groupError } = await supabase
        .from('tournament_age_groups')
        .insert(groupRows)

      if (groupError) throw groupError

      await renderTournamentPage()
      showMessage('Tournament created.')
    } catch (error) {
      showMessage(error.message || 'Unable to create tournament.')
    }
  }

  root.addEventListener('click', handleClick)
  root.addEventListener('submit', handleSubmit)

  return { renderTournamentPage }
}
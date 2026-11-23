import './videos.css'

export function initVideoPortal({
  supabase,
  root,
  getUser,
  getProfile,
  getTeams,
  canManage,
  header,
  backButton,
  icon,
  esc,
  showMessage
}) {
  let videos = []
  let editingVideo = null
  let activeFilter = 'all'
  let searchText = ''
  let sortOrder = 'date-desc'
  let isLoading = false

  function formatVideoDate(value) {
    if (!value) return 'Date not specified'
    const date = new Date(value + 'T00:00:00')
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  function typeLabel(type) {
    return ({ match: 'Match', training: 'Training', clip: 'Highlight / Clip' })[type] || 'Video'
  }

  function typeIcon(type) {
    return type === 'training' ? 'users' : type === 'clip' ? 'trophy' : 'video'
  }

  function visibleVideos() {
    const query = searchText.trim().toLowerCase()
    return videos.filter(video => {
      const matchesType = activeFilter === 'all' || video.video_type === activeFilter
      const haystack = [video.title, video.team_name, video.description, typeLabel(video.video_type)]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesType && (!query || haystack.includes(query))
    })
  }

  function renderVideoCard(video) {
    const staffActions = canManage() ? `
      <div class="video-card-actions">
        <button class="secondary-btn" type="button" data-action="video-edit" data-id="${esc(video.id)}">${icon('edit', 15)} Edit</button>
        <button class="delete-btn" type="button" data-action="video-delete" data-id="${esc(video.id)}" data-title="${esc(video.title)}">${icon('trash', 15)} Delete</button>
      </div>
    ` : ''

    return `
      <article class="video-card">
        <div class="video-card-art">
          <span>${icon(typeIcon(video.video_type), 34)}</span>
          <small>${esc(typeLabel(video.video_type))}</small>
        </div>
        <div class="video-card-content">
          <div class="video-card-meta">
            <span class="video-team-tag">${esc(video.team_name)}</span>
            <span>${formatVideoDate(video.recorded_on)}</span>
          </div>
          <h3>${esc(video.title)}</h3>
          ${video.description ? `<p>${esc(video.description)}</p>` : ''}
          <a class="primary-btn video-watch-link" href="${esc(video.video_url)}" target="_blank" rel="noopener noreferrer">
            ${icon('video', 16)} Watch on Veo
          </a>
          ${staffActions}
        </div>
      </article>
    `
  }

  function videoForm() {
    if (!canManage()) return ''
    const value = editingVideo || {}
    const teams = getTeams().filter(team => team.is_active !== false)
    const teamOptions = teams.map(team => `
      <option value="${esc(team.name)}" ${value.team_name === team.name ? 'selected' : ''}>${esc(team.name)}</option>
    `).join('')

    return `
      <section class="video-admin-panel">
        <div class="video-panel-heading">
          <div>
            <span class="video-eyebrow">STAFF AREA</span>
            <h3>${editingVideo ? 'Edit video' : 'Add a video'}</h3>
            <p>Paste a share link copied from the academy's Veo account.</p>
          </div>
          ${editingVideo ? `<button class="secondary-btn" type="button" data-action="video-cancel-edit">Cancel</button>` : ''}
        </div>
        <form id="video-form" class="video-form">
          <label for="video-title">Video title</label>
          <input id="video-title" name="title" type="text" maxlength="120" required
            placeholder="e.g. U12 vs Geylang International"
            value="${esc(value.title || '')}">
          <div class="video-form-grid">
            <div>
              <label for="video-team">Academy team</label>
              <select id="video-team" name="team_name" required>
                <option value="">Select team</option>
                ${teamOptions}
              </select>
            </div>
            <div>
              <label for="video-type">Video type</label>
              <select id="video-type" name="video_type" required>
                <option value="match" ${(value.video_type || 'match') === 'match' ? 'selected' : ''}>Full match</option>
                <option value="training" ${value.video_type === 'training' ? 'selected' : ''}>Training</option>
                <option value="clip" ${value.video_type === 'clip' ? 'selected' : ''}>Highlight / clip</option>
              </select>
            </div>
            <div>
              <label for="video-date">Recording date</label>
              <input id="video-date" name="recorded_on" type="date" required value="${esc(value.recorded_on || '')}">
            </div>
          </div>
          <label for="video-url">Veo share link</label>
          <input id="video-url" name="video_url" type="url" required
            placeholder="https://app.veo.co/..."
            value="${esc(value.video_url || '')}">
          <label for="video-description">Description (optional)</label>
          <textarea id="video-description" name="description" rows="3" maxlength="1000"
            placeholder="Add match details, opponent or tournament name">${esc(value.description || '')}</textarea>
          <label class="video-privacy-confirm">
            <input type="checkbox" name="privacy_confirmed" required>
            <span>I have checked the Veo sharing visibility and academy approval for this footage.</span>
          </label>
          <button class="primary-btn" type="submit">${editingVideo ? 'Save changes' : 'Add to video library'}</button>
        </form>
        <p class="video-privacy-note"><strong>Important:</strong> The portal login protects the video listing, not the Veo player link. A Veo recording set to Public can be watched by anyone who receives or forwards its link. Only add footage the academy has approved for this type of sharing.</p>
      </section>
    `
  }

  function pageMarkup() {
    const profile = getProfile()
    const list = visibleVideos().slice().sort((a, b) => {
      if (sortOrder === 'date-asc') return String(a.recorded_on || '').localeCompare(String(b.recorded_on || ''))
      if (sortOrder === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
      if (sortOrder === 'team-asc') return String(a.team_name || '').localeCompare(String(b.team_name || ''), undefined, { numeric: true, sensitivity: 'base' })
      return String(b.recorded_on || '').localeCompare(String(a.recorded_on || ''))
    })
    const types = [
      ['all', 'All'],
      ['match', 'Matches'],
      ['training', 'Training'],
      ['clip', 'Highlights & Clips']
    ]

    return `
      ${header()}
      <main class="container">
        ${backButton()}
        <div class="page-heading video-page-heading">
          <div>
            <h2>${icon('video', 25)} Video Library</h2>
            <p class="muted">Match footage, training sessions and academy highlights</p>
          </div>
          <span class="video-library-count">${videos.length} videos</span>
        </div>
        ${videoForm()}
        <section class="video-library">
          <div class="video-library-toolbar">
            <div class="video-filter-list">
              ${types.map(([key, label]) => `
                <button type="button" class="video-filter ${activeFilter === key ? 'active' : ''}"
                  data-action="video-filter" data-filter="${key}">${label}</button>
              `).join('')}
            </div>
            <input class="video-search" type="search" id="video-search" placeholder="Search videos or teams..."
              value="${esc(searchText)}" aria-label="Search videos">
            <label class="video-sort-control">Sort by
              <select id="video-sort" aria-label="Sort videos">
                <option value="date-desc" ${sortOrder === 'date-desc' ? 'selected' : ''}>Newest first</option>
                <option value="date-asc" ${sortOrder === 'date-asc' ? 'selected' : ''}>Oldest first</option>
                <option value="title-asc" ${sortOrder === 'title-asc' ? 'selected' : ''}>Title A–Z</option>
                <option value="team-asc" ${sortOrder === 'team-asc' ? 'selected' : ''}>Team A–Z</option>
              </select>
            </label>
          </div>
          ${isLoading ? '<div class="empty-state">Loading videos...</div>' : list.length ? `
            <div class="video-grid">${list.map(renderVideoCard).join('')}</div>
          ` : `
            <div class="video-empty-state">
              <span>${icon('video', 34)}</span>
              <h3>No videos available yet</h3>
              <p>${canManage() ? 'Add the first match recording, training video or highlight using the staff form above.' : 'Videos for your linked academy team or teams will appear here when staff publish them.'}</p>
            </div>
          `}
        </section>
      </main>
    `
  }

  async function loadVideos() {
    isLoading = true
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('recorded_on', { ascending: false })
      .order('created_at', { ascending: false })

    isLoading = false
    if (error) throw error
    videos = data || []
  }

  async function renderVideos() {
    editingVideo = null
    root.innerHTML = pageMarkup()
    try {
      await loadVideos()
      root.innerHTML = pageMarkup()
    } catch (error) {
      console.error('Videos could not be loaded:', error)
      root.innerHTML = `
        ${header()}
        <main class="container">
          ${backButton()}
          <div class="empty-state">
            Could not load the video library: ${esc(error.message)}
            <br><small>Check that the videos table and its Row Level Security policies have been installed.</small>
          </div>
        </main>
      `
    }
  }

  async function saveVideo(event) {
    event.preventDefault()
    if (!canManage()) throw new Error('Only staff can add or edit videos.')

    const form = event.target
    const formData = new FormData(form)
    const videoUrl = String(formData.get('video_url') || '').trim()
    let parsedUrl
    try {
      parsedUrl = new URL(videoUrl)
    } catch {
      throw new Error('Enter a valid Veo share link.')
    }
    if (parsedUrl.protocol !== 'https:') throw new Error('The video link must use HTTPS.')

    const payload = {
      title: String(formData.get('title') || '').trim(),
      team_name: String(formData.get('team_name') || '').trim(),
      video_type: String(formData.get('video_type') || 'match'),
      recorded_on: String(formData.get('recorded_on') || ''),
      video_url: videoUrl,
      description: String(formData.get('description') || '').trim() || null
    }

    if (!payload.title || !payload.team_name || !payload.recorded_on) {
      throw new Error('Please complete the title, team and recording date.')
    }

    let result
    if (editingVideo) {
      result = await supabase.from('videos').update(payload).eq('id', editingVideo.id)
    } else {
      result = await supabase.from('videos').insert({
        ...payload,
        created_by: getUser()?.id
      })
    }
    if (result.error) throw result.error

    editingVideo = null
    showMessage('Video saved to the academy library.')
    await renderVideos()
  }

  root.addEventListener('click', async event => {
    const target = event.target.closest('[data-action^="video-"]')
    if (!target) return
    const action = target.dataset.action

    try {
      if (action === 'video-filter') {
        activeFilter = target.dataset.filter || 'all'
        root.innerHTML = pageMarkup()
      } else if (action === 'video-edit') {
        if (!canManage()) return
        editingVideo = videos.find(video => video.id === target.dataset.id) || null
        root.innerHTML = pageMarkup()
        document.querySelector('#video-title')?.focus()
      } else if (action === 'video-cancel-edit') {
        editingVideo = null
        root.innerHTML = pageMarkup()
      } else if (action === 'video-delete') {
        if (!canManage()) return
        const title = target.dataset.title || 'this video'
        if (!confirm(`Delete "${title}" from the academy video library?`)) return
        const { error } = await supabase.from('videos').delete().eq('id', target.dataset.id)
        if (error) throw error
        showMessage('Video removed from the library.')
        await renderVideos()
      }
    } catch (error) {
      showMessage(error.message || 'Unable to complete that action.')
    }
  })

  root.addEventListener('submit', async event => {
    if (event.target.id !== 'video-form') return
    try {
      await saveVideo(event)
    } catch (error) {
      showMessage(error.message || 'The video could not be saved.')
    }
  })

  root.addEventListener('change', event => {
    if (event.target.id !== 'video-sort') return
    sortOrder = event.target.value
    root.innerHTML = pageMarkup()
  })

  root.addEventListener('input', event => {
    if (event.target.id !== 'video-search') return
    const start = event.target.selectionStart
    searchText = event.target.value
    const toolbar = event.target.closest('.video-library-toolbar')
    const list = root.querySelector('.video-grid, .video-empty-state')
    const currentList = visibleVideos()
    if (list) {
      const replacement = currentList.length
        ? `<div class="video-grid">${currentList.map(renderVideoCard).join('')}</div>`
        : '<div class="video-empty-state"><h3>No matching videos</h3><p>Try another search.</p></div>'
      list.outerHTML = replacement
    }
    if (toolbar && document.activeElement === event.target) {
      event.target.setSelectionRange(start, start)
    }
  })

  return { renderVideos }
}

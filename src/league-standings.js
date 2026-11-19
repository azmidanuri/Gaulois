// Gaulois Aerion Academy — SYL League Standings
// SYL competitions are kept separate from academy teams, players and fixtures.

export function initLeagueStandings({ supabase, canManage, esc, formatDate, showMessage }) {
  let competitions = [];
  let standings = [];
  let matches = [];
  let selectedId = '';
  let loadingError = '';

  const activeCompetition = () => competitions.find(c => String(c.id) === String(selectedId));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const dateLabel = value => value ? formatDate(value) : 'Date not set';

  function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) { value += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += ch;
    }
    values.push(value.trim());
    return values;
  }

  function csvRows(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) throw new Error('The CSV must contain a header row and at least one team row.');
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
    const aliases = {
      team: ['team', 'teamname', 'club'],
      played: ['played', 'p'],
      won: ['won', 'w'],
      drawn: ['drawn', 'draw', 'd'],
      lost: ['lost', 'l'],
      goals_for: ['goalsfor', 'gf'],
      goals_against: ['goalsagainst', 'ga'],
      goal_difference: ['goaldifference', 'gd'],
      points: ['points', 'pts']
    };
    const index = {};
    Object.keys(aliases).forEach(key => {
      index[key] = headers.findIndex(h => aliases[key].includes(h));
    });
    if (index.team < 0) throw new Error('CSV needs a Team column.');
    ['played','won','drawn','lost','goals_for','goals_against','points'].forEach(key => {
      if (index[key] < 0) throw new Error('CSV is missing the ' + key.replace(/_/g, ' ') + ' column.');
    });
    return lines.slice(1).map((line, i) => {
      const cells = parseCsvLine(line);
      const get = key => index[key] < 0 ? null : cells[index[key]];
      const team_name = get('team');
      if (!team_name) throw new Error('Missing team name on CSV row ' + (i + 2) + '.');
      const row = { team_name };
      ['played','won','drawn','lost','goals_for','goals_against','points'].forEach(key => {
        const value = Number(get(key));
        if (!Number.isInteger(value) || value < 0) throw new Error('Invalid ' + key.replace(/_/g, ' ') + ' on CSV row ' + (i + 2) + '.');
        row[key] = value;
      });
      row.goal_difference = index.goal_difference >= 0 && get('goal_difference') !== ''
        ? Number(get('goal_difference'))
        : row.goals_for - row.goals_against;
      if (!Number.isInteger(row.goal_difference)) throw new Error('Invalid goal difference on CSV row ' + (i + 2) + '.');
      return row;
    });
  }

  async function load() {
    loadingError = '';
    const [competitionResult] = await Promise.all([
      supabase.from('syl_competitions').select('*').eq('is_active', true)
        .order('age_group').order('division').order('season', { ascending: false })
    ]);
    if (competitionResult.error) throw competitionResult.error;
    competitions = competitionResult.data || [];
    if (!selectedId || !competitions.some(c => String(c.id) === String(selectedId))) {
      selectedId = competitions[0] ? String(competitions[0].id) : '';
    }
    standings = [];
    matches = [];
    if (!selectedId) return;
    const [standingResult, matchResult] = await Promise.all([
      supabase.from('syl_standings').select('*').eq('competition_id', selectedId),
      supabase.from('syl_matches').select('*').eq('competition_id', selectedId)
        .order('match_date', { ascending: false })
    ]);
    if (standingResult.error) throw standingResult.error;
    if (matchResult.error) throw matchResult.error;
    standings = standingResult.data || [];
    matches = matchResult.data || [];
  }

  function sortedStandings() {
    return standings.slice().sort((a, b) =>
      num(b.points) - num(a.points) ||
      num(b.goal_difference) - num(a.goal_difference) ||
      num(b.goals_for) - num(a.goals_for) ||
      a.team_name.localeCompare(b.team_name)
    );
  }

  function competitionOptions() {
    return competitions.map(c =>
      '<option value="' + esc(c.id) + '" ' + (String(c.id) === String(selectedId) ? 'selected' : '') + '>' +
      esc(c.age_group + ' ' + c.division + ' · ' + c.season) + '</option>'
    ).join('');
  }

  function standingsTable() {
    const rows = sortedStandings();
    if (!rows.length) return '<div class="ls-empty"><strong>No standings entered yet</strong><span>Standings will appear here when staff add data or import a CSV.</span></div>';
    return '<div class="ls-table-scroll"><table class="ls-table"><thead><tr>' +
      '<th>Pos</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>' +
      '</tr></thead><tbody>' + rows.map((r, i) => {
        const ga = /gaulois aerion/i.test(r.team_name);
        return '<tr class="' + (ga ? 'ls-gaulois-row' : '') + '">' +
          '<td class="ls-position">' + (i + 1) + '</td>' +
          '<td class="ls-team">' + esc(r.team_name) + (ga ? '<span class="ls-club-tag">GA</span>' : '') + '</td>' +
          '<td>' + num(r.played) + '</td><td>' + num(r.won) + '</td><td>' + num(r.drawn) + '</td><td>' + num(r.lost) + '</td>' +
          '<td>' + num(r.goals_for) + '</td><td>' + num(r.goals_against) + '</td><td>' + num(r.goal_difference) + '</td>' +
          '<td class="ls-points">' + num(r.points) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function staffPanel() {
    if (!canManage()) return '';
    return '<section class="ls-admin">' +
      '<div class="ls-admin-heading"><div><span class="ls-kicker">STAFF TOOLS</span><h3>Manage this competition</h3></div></div>' +
      '<details class="ls-admin-block"><summary>Add a competition</summary>' +
      '<form id="ls-competition-form" class="ls-form-grid">' +
      '<label>Age group<input name="age_group" required placeholder="U8"></label>' +
      '<label>Division<input name="division" required placeholder="Division 3"></label>' +
      '<label>Season<input name="season" required placeholder="2026"></label>' +
      '<label class="ls-wide">Official SYL link (optional)<input name="source_url" type="url" placeholder="https://www.syl.sg/league?..."></label>' +
      '<button class="ls-primary ls-wide" type="submit">Create competition</button></form></details>' +
      '<details class="ls-admin-block"><summary>Add or update a team standing</summary>' +
      '<form id="ls-standing-form" class="ls-form-grid">' +
      '<label class="ls-wide">Team name<input name="team_name" required placeholder="Gaulois Aerion Warriors"></label>' +
      '<label>Played<input name="played" type="number" min="0" value="0" required></label>' +
      '<label>Won<input name="won" type="number" min="0" value="0" required></label>' +
      '<label>Drawn<input name="drawn" type="number" min="0" value="0" required></label>' +
      '<label>Lost<input name="lost" type="number" min="0" value="0" required></label>' +
      '<label>Goals For<input name="goals_for" type="number" min="0" value="0" required></label>' +
      '<label>Goals Against<input name="goals_against" type="number" min="0" value="0" required></label>' +
      '<label>Points<input name="points" type="number" min="0" value="0" required></label>' +
      '<button class="ls-primary ls-wide" type="submit">Save team standing</button></form>' +
      '<p class="ls-help">Saving the same team name again updates its row in this competition.</p></details>' +
      '<details class="ls-admin-block"><summary>Import standings from CSV</summary>' +
      '<p class="ls-help">Required headers: Team, Played, Won, Drawn, Lost, Goals For, Goals Against, Points. Goal Difference is optional and will be calculated if omitted.</p>' +
      '<form id="ls-csv-form"><input type="file" id="ls-csv-file" accept=".csv,text/csv" required><button class="ls-primary" type="submit">Import CSV</button></form></details>' +
      '<details class="ls-admin-block"><summary>Add a fixture or result</summary>' +
      '<form id="ls-match-form" class="ls-form-grid">' +
      '<label>Date<input name="match_date" type="date" required></label>' +
      '<label>Home team<input name="home_team" required></label>' +
      '<label>Away team<input name="away_team" required></label>' +
      '<label>Home score<input name="home_score" type="number" min="0" placeholder="Leave blank if upcoming"></label>' +
      '<label>Away score<input name="away_score" type="number" min="0" placeholder="Leave blank if upcoming"></label>' +
      '<button class="ls-primary ls-wide" type="submit">Save fixture / result</button></form></details>' +
      '</section>';
  }

  function matchesPanel() {
    if (!matches.length) return '<div class="ls-empty ls-empty-compact">No fixtures or results have been added for this competition.</div>';
    return '<section class="ls-matches"><h3>Fixtures & results</h3>' + matches.map(m => {
      const complete = m.home_score !== null && m.home_score !== undefined &&
        m.away_score !== null && m.away_score !== undefined;
      return '<article class="ls-match"><div class="ls-match-date">' + esc(dateLabel(m.match_date)) + '</div>' +
        '<div class="ls-match-teams"><strong>' + esc(m.home_team) + '</strong><b>' +
        (complete ? num(m.home_score) + ' – ' + num(m.away_score) : 'vs') +
        '</b><strong>' + esc(m.away_team) + '</strong></div>' +
        '<span class="ls-match-status">' + (complete ? 'RESULT' : 'UPCOMING') + '</span></article>';
    }).join('') + '</section>';
  }

  function renderContent() {
    const c = activeCompetition();
    return '<main class="container ls-page">' +
      '<button class="back-btn" data-action="home">← Back to Home</button>' +
      '<header class="ls-hero"><div><span class="ls-kicker">GAULOIS AERION ACADEMY</span><h2>League Standings</h2>' +
      '<p>Singapore Youth League · Competition tables and results</p></div><span class="ls-hero-icon">🏆</span></header>' +
      (competitions.length ? '<section class="ls-competition-picker"><label for="ls-competition">Select competition</label>' +
        '<select id="ls-competition">' + competitionOptions() + '</select></section>' : '') +
      (c ? '<section class="ls-competition-title"><div><span class="ls-kicker">' + esc(c.season) + ' SEASON</span>' +
        '<h3>' + esc(c.age_group + ' ' + c.division) + '</h3><p>League table</p></div>' +
        '<span class="ls-source-tag">SYL</span></section>' +
        '<section class="ls-standings-card"><div class="ls-card-heading"><div><h3>Standings</h3><p>Sorted by points, goal difference and goals scored</p></div>' +
        '<span class="ls-team-count">' + standings.length + ' teams</span></div>' + standingsTable() +
        '<div class="ls-footnote">Gaulois Aerion teams are highlighted. Last updated: ' +
        (standings.length ? esc(new Date(Math.max(...standings.map(r => new Date(r.updated_at || 0).getTime()).filter(Number.isFinite))).toLocaleDateString('en-SG')) : 'Not yet updated') +
        '</div></section>' + matchesPanel() +
        (c.source_url ? '<p class="ls-source-link">Source: <a href="' + esc(c.source_url) + '" target="_blank" rel="noopener">Official SYL competition page</a></p>' : '<p class="ls-source-link">Source: Staff-entered data. Official SYL source link has not been added.</p>') :
        '<div class="ls-empty"><strong>No SYL competitions configured</strong><span>Staff can add each age-group and division separately. No teams or standings have been invented.</span></div>') +
      staffPanel() + '</main>';
  }

  async function render() {
    try {
      await load();
      return renderContent();
    } catch (error) {
      loadingError = error.message || 'Unable to load League Standings.';
      return '<main class="container ls-page"><button class="back-btn" data-action="home">← Back to Home</button>' +
        '<header class="ls-hero"><div><span class="ls-kicker">GAULOIS AERION ACADEMY</span><h2>League Standings</h2></div></header>' +
        '<div class="ls-error"><strong>Standings could not be loaded.</strong><span>' + esc(loadingError) +
        '</span><small>Check that the League Standings SQL migration has been run and the Supabase permissions are in place.</small></div></main>';
    }
  }

  async function saveCompetition(event) {
    event.preventDefault();
    if (!canManage()) return;
    const data = new FormData(event.currentTarget);
    const age_group = String(data.get('age_group') || '').trim().toUpperCase();
    const division = String(data.get('division') || '').trim();
    const season = String(data.get('season') || '').trim();
    const source_url = String(data.get('source_url') || '').trim() || null;
    if (!age_group || !division || !season) return showMessage('Complete the age group, division and season.');
    const { data: created, error } = await supabase.from('syl_competitions').insert({ age_group, division, season, source_url, created_by: (await supabase.auth.getUser()).data.user?.id }).select('id').single();
    if (error) return showMessage('Unable to create competition: ' + error.message);
    selectedId = String(created.id);
    showMessage('Competition created.');
    rootRefresh();
  }

  async function saveStanding(event) {
    event.preventDefault();
    if (!canManage() || !selectedId) return;
    const data = new FormData(event.currentTarget);
    const team_name = String(data.get('team_name') || '').trim();
    const payload = { competition_id: selectedId, team_name };
    ['played','won','drawn','lost','goals_for','goals_against','points'].forEach(k => payload[k] = Number(data.get(k)));
    payload.goal_difference = payload.goals_for - payload.goals_against;
    const { error } = await supabase.from('syl_standings').upsert(payload, { onConflict: 'competition_id,team_name' });
    if (error) return showMessage('Unable to save standing: ' + error.message);
    showMessage('Team standing saved.');
    rootRefresh();
  }

  async function importCsv(event) {
    event.preventDefault();
    if (!canManage() || !selectedId) return;
    const file = document.querySelector('#ls-csv-file')?.files?.[0];
    if (!file) return showMessage('Choose a CSV file first.');
    try {
      const rows = csvRows(await file.text()).map(row => ({ ...row, competition_id: selectedId }));
      const { error } = await supabase.from('syl_standings').upsert(rows, { onConflict: 'competition_id,team_name' });
      if (error) throw error;
      showMessage(rows.length + ' team standings imported.');
      rootRefresh();
    } catch (error) {
      showMessage('CSV import failed: ' + error.message);
    }
  }

  async function saveMatch(event) {
    event.preventDefault();
    if (!canManage() || !selectedId) return;
    const data = new FormData(event.currentTarget);
    const homeRaw = String(data.get('home_score') || '').trim();
    const awayRaw = String(data.get('away_score') || '').trim();
    if ((homeRaw === '') !== (awayRaw === '')) return showMessage('Enter both scores, or leave both blank for an upcoming fixture.');
    const payload = {
      competition_id: selectedId,
      match_date: data.get('match_date'),
      home_team: String(data.get('home_team') || '').trim(),
      away_team: String(data.get('away_team') || '').trim(),
      home_score: homeRaw === '' ? null : Number(homeRaw),
      away_score: awayRaw === '' ? null : Number(awayRaw),
      created_by: (await supabase.auth.getUser()).data.user?.id
    };
    if (payload.home_score !== null && (!Number.isInteger(payload.home_score) || payload.home_score < 0 || !Number.isInteger(payload.away_score) || payload.away_score < 0)) {
      return showMessage('Scores must be whole numbers of zero or more.');
    }
    const { error } = await supabase.from('syl_matches').insert(payload);
    if (error) return showMessage('Unable to save fixture/result: ' + error.message);
    showMessage('Fixture/result saved. Update or import the standings separately after the official table is updated.');
    rootRefresh();
  }

  async function rootRefresh() {
    const root = document.querySelector('#app');
    if (root) root.innerHTML = await render();
  }

  document.addEventListener('change', async event => {
    if (event.target?.id === 'ls-competition') {
      selectedId = event.target.value;
      await rootRefresh();
    }
  });

  document.addEventListener('submit', async event => {
    const id = event.target?.id;
    if (!['ls-competition-form','ls-standing-form','ls-csv-form','ls-match-form'].includes(id)) return;
    event.preventDefault();
    try {
      if (id === 'ls-competition-form') await saveCompetition(event);
      else if (id === 'ls-standing-form') await saveStanding(event);
      else if (id === 'ls-csv-form') await importCsv(event);
      else if (id === 'ls-match-form') await saveMatch(event);
    } catch (error) {
      showMessage(error.message || 'Unable to save League Standings data.');
    }
  });

  return { render };
}

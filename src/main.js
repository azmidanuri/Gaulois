
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
let activePlayer = null
let currentTab = 'activities'
let recoveryMode = false

const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

const dateLabel = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-SG',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : 'Date to be confirmed'

const toast = msg => {
  const el = document.querySelector('#toast')
  if(el){
    el.textContent=msg
    el.classList.remove('hidden')
    setTimeout(()=>el.classList.add('hidden'),2600)
  }
}

const isStaff = () => ['admin','coach'].includes(profile?.role)

const responseFor = (activityId, playerId) =>
  responses.find(r=>r.activity_id===activityId && r.player_id===playerId)

function shell(content='') {
  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <div class="crest">GA</div>
          <div><b>GAULOIS AERION</b><small>ACADEMY · PORTAL</small></div>
        </div>
        <div class="topright">
          <span class="pill">PARENT & PLAYER PORTAL</span>
          ${user?'<button class="btn small" id="logout">Sign out</button>':''}
        </div>
      </header>
      <main class="main">${content}</main>
      <footer>GAULOIS AERION ACADEMY · PARENT & PLAYER PORTAL</footer>
    </div>
    <div id="toast" class="toast hidden"></div>
  `

  document.querySelector('#logout')?.addEventListener('click', async()=>{
    await supabase.auth.signOut()
    user=null
    profile=null
    children=[]
    recoveryMode=false
    renderLogin()
  })
}

function renderLogin(message='') {
  shell(`
    <section class="login card">
      <div class="eyebrow">Welcome to the academy</div>
      <h1>Parent portal</h1>
      <p class="sub">Sign in to manage your child's availability.</p>

      ${message?`<div class="notice">${esc(message)}</div>`:''}

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

      <div class="divider"></div>

      <details>
        <summary>First time here? Create a parent account</summary>
        <p class="muted smalltext">Use the email address provided to the academy. After creating an account, the academy must link it to your child before attendance can be submitted.</p>

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
    </section>
  `)

  document.querySelector('#loginForm').addEventListener('submit', async e=>{
    e.preventDefault()

    const email=document.querySelector('#email').value.trim()
    const password=document.querySelector('#password').value

    const {error}=await supabase.auth.signInWithPassword({email,password})

    if(error)return renderLogin(error.message)

    await loadSession()
  })

  // FORGOT PASSWORD
  document.querySelector('#forgotPassword').addEventListener('click', async()=>{
    const email=document.querySelector('#email').value.trim()

    if(!email){
      toast('Enter your email address first')
      return
    }

    const {error}=await supabase.auth.resetPasswordForEmail(email,{
      redirectTo:window.location.origin
    })

    if(error){
      toast(error.message)
      return
    }

    toast('Password reset email sent. Check your inbox.')
  })

  document.querySelector('#signupForm').addEventListener('submit', async e=>{
    e.preventDefault()

    const full_name=document.querySelector('#fullName').value.trim()
    const email=document.querySelector('#newEmail').value.trim()
    const password=document.querySelector('#newPassword').value

    const {data,error}=await supabase.auth.signUp({email,password})

    if(error)return toast(error.message)

    if(data.user){
      if(data.session){
        const {error:profileError}=await supabase.from('profiles').insert({
          id:data.user.id,
          full_name,
          role:'parent'
        })

        if(profileError){
          toast('Account created, but profile setup needs help from the academy: '+profileError.message)
          return
        }

        await loadSession()
      }else{
        renderLogin('Account created. Check your email to confirm it, then sign in.')
      }
    }
  })
}

// PASSWORD RESET SCREEN
function renderResetPassword(){
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

  document.querySelector('#resetForm').addEventListener('submit',async e=>{
    e.preventDefault()

    const password=document.querySelector('#resetNewPassword').value
    const confirm=document.querySelector('#resetConfirmPassword').value

    if(password!==confirm){
      toast('Passwords do not match')
      return
    }

    const button=document.querySelector('#resetForm button[type="submit"]')
    button.disabled=true
    button.textContent='Updating password...'

    const {error}=await supabase.auth.updateUser({password})

    if(error){
      toast(error.message)
      button.disabled=false
      button.textContent='Save new password'
      return
    }

    await supabase.auth.signOut()

    user=null
    profile=null
    children=[]
    recoveryMode=false

    renderLogin('Password updated successfully. Please sign in with your new password.')
  })
}

async function loadSession() {
  const {data:{user:current}}=await supabase.auth.getUser()
  user=current

  if(!user){
    renderLogin()
    return
  }

  const {data:p,error}=await supabase.from('profiles')
    .select('id,full_name,role')
    .eq('id',user.id)
    .maybeSingle()

  if(error){
    renderLogin(error.message)
    return
  }

  if(!p){
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

    document.querySelector('#profileForm').addEventListener('submit',async e=>{
      e.preventDefault()

      const {error:insertError}=await supabase.from('profiles').insert({
        id:user.id,
        full_name:document.querySelector('#profileName').value.trim(),
        role:'parent'
      })

      if(insertError){
        toast(insertError.message)
        return
      }

      await loadSession()
    })

    return
  }

  profile=p
  await loadData()
  renderApp()
}

async function loadData(){
  const [aRes,linkRes]=await Promise.all([
    supabase.from('activities').select('*').order('activity_date',{ascending:true}),
    supabase.from('parent_players').select('player_id').eq('parent_id',user.id)
  ])

  if(aRes.error)throw aRes.error

  activities=aRes.data||[]

  const ids=(linkRes.data||[]).map(x=>x.player_id)

  if(isStaff()){
    const {data:p,error}=await supabase.from('players')
      .select('id,name,age_group')
      .eq('age_group','U12')
      .order('name')

    if(error)throw error
    children=p||[]
  }else{
    if(linkRes.error)throw linkRes.error

    if(ids.length){
      const {data:p,error}=await supabase.from('players')
        .select('id,name,age_group')
        .in('id',ids)
        .order('name')

      if(error)throw error
      children=p||[]
    }else{
      children=[]
    }
  }

  activePlayer=children.some(p=>p.id===activePlayer)
    ?activePlayer
    :(children[0]?.id||null)

  const {data:r,error}=await supabase.from('responses').select('*')

  if(error)throw error
  responses=r||[]
}

function renderApp(){
  const staff=isStaff()

  const tabs=staff
    ?[['overview','Availability'],['create','Publish activity'],['roster','U12 roster']]
    :[['activities','Activities'],['history','My responses']]

  shell(`
    <div class="hero">
      <div>
        <div class="eyebrow">${staff?'Coach & administrator':'Parent area'}</div>
        <h1>${staff?'U12 attendance management':'Your child’s availability'}</h1>
        <p class="sub">${staff?'Publish activities and review parent responses.':'Let the coaches know whether your child can attend.'}</p>
      </div>
      <span class="tag">GA U12</span>
    </div>

    <nav class="tabs">
      ${tabs.map(([id,label])=>`
        <button class="tab ${currentTab===id?'active':''}" data-tab="${id}">${label}</button>
      `).join('')}
    </nav>

    <section id="panel"></section>
  `)

  document.querySelectorAll('[data-tab]').forEach(b=>
    b.addEventListener('click',()=>{
      currentTab=b.dataset.tab
      renderApp()
    })
  )

  if(staff)renderStaffPanel()
  else renderParentPanel()
}

function statusTag(answer){
  const label=answer==='yes'?'Yes':answer==='no'?'No':answer==='unsure'?'Unsure':'Pending'
  return `<span class="status ${answer||'pending'}">${label}</span>`
}

function activityCard(a,player){
  const r=responseFor(a.id,player.id)

  return `
    <article class="card activity">
      <div class="activitytop">
        <span class="tag ${a.activity_type==='match'?'match':''}">${esc(a.activity_type)}</span>
        ${statusTag(r?.answer)}
      </div>

      <h2>${esc(a.title)}</h2>
      <p>${dateLabel(a.activity_date)} ${a.start_time?`· ${esc(String(a.start_time).slice(0,5))}`:''}</p>
      <p>${a.opponent?`Opponent: ${esc(a.opponent)} · `:''}${a.venue?`Venue: ${esc(a.venue)}`:'Venue to be confirmed'}</p>
      ${a.notes?`<p>${esc(a.notes)}</p>`:''}

      <div class="responsearea">
        <b>Can ${esc(player.name)} attend?</b>

        <div class="response">
          ${[['yes','Yes'],['no','No'],['unsure','Unsure']].map(([v,l])=>`
            <button class="choice ${r?.answer===v?'selected '+v:''}" data-answer="${v}" data-activity="${a.id}" data-player="${player.id}">${l}</button>
          `).join('')}
        </div>

        ${r?.answer==='no'?`
          <div class="field">
            <label>Reason for absence (optional)</label>
            <textarea id="reason-${a.id}">${esc(r.absence_reason||'')}</textarea>
            <button class="btn small" data-reason="${a.id}" data-player="${player.id}">Save reason</button>
          </div>
        `:''}

        <p class="muted smalltext">No response deadline · You can update your answer at any time.</p>
      </div>
    </article>
  `
}

function renderParentPanel(){
  const panel=document.querySelector('#panel')

  if(!children.length){
    panel.innerHTML=`
      <div class="card empty">
        <h2>No player linked yet</h2>
        <p>Your account has been created, but the academy still needs to link it to your child. Please contact the coach.</p>
      </div>
    `
    return
  }

  if(currentTab==='history'){
    const rows=responses.filter(r=>children.some(p=>p.id===r.player_id))

    panel.innerHTML=`
      <div class="card">
        <h2>My response history</h2>
        ${rows.length?rows.map(r=>{
          const a=activities.find(x=>x.id===r.activity_id)
          const p=children.find(x=>x.id===r.player_id)

          return a&&p?`
            <div class="activity">
              <div class="activitytop">
                <b>${esc(p.name)} · ${esc(a.title)}</b>
                ${statusTag(r.answer)}
              </div>
              <p>${dateLabel(a.activity_date)}</p>
              <p>${r.absence_reason?`Reason: ${esc(r.absence_reason)}`:'No reason supplied'}</p>
            </div>
          `:''
        }).join(''):'<div class="empty">No responses submitted yet.</div>'}
      </div>
    `
    return
  }

  const published=activities.filter(a=>a.is_published)

  panel.innerHTML=`
    <div class="card childselect">
      <div class="sectionhead">
        <h2>Linked player</h2>
        <span class="tag">Family account</span>
      </div>

      <div class="field">
        <label>Select your child</label>
        <select id="childSelect">
          ${children.map(p=>`
            <option value="${p.id}" ${p.id===activePlayer?'selected':''}>${esc(p.name)}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="grid">
      ${published.length
        ?published.map(a=>activityCard(a,children.find(p=>p.id===activePlayer))).join('')
        :'<div class="card span12 empty">No activities have been published yet.</div>'}
    </div>
  `

  document.querySelector('#childSelect').addEventListener('change',e=>{
    activePlayer=e.target.value
    renderApp()
  })

  document.querySelectorAll('[data-answer]').forEach(b=>
    b.addEventListener('click',()=>saveAnswer(
      b.dataset.activity,
      b.dataset.player,
      b.dataset.answer
    ))
  )

  document.querySelectorAll('[data-reason]').forEach(b=>
    b.addEventListener('click',()=>saveReason(
      b.dataset.reason,
      b.dataset.player
    ))
  )
}

async function saveAnswer(activity_id,player_id,answer){
  const payload={
    activity_id,
    player_id,
    responded_by:user.id,
    answer
  }

  const {error}=await supabase.from('responses')
    .upsert(payload,{onConflict:'activity_id,player_id'})

  if(error){
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast('Availability updated')
}

async function saveReason(activity_id,player_id){
  const old=responseFor(activity_id,player_id)
  if(!old)return

  const absence_reason=document.querySelector(`#reason-${CSS.escape(activity_id)}`).value

  const {error}=await supabase.from('responses')
    .update({absence_reason,responded_by:user.id})
    .eq('id',old.id)

  if(error){
    toast(error.message)
    return
  }

  await loadData()
  renderApp()
  toast('Optional reason saved')
}

function renderStaffPanel(){
  const panel=document.querySelector('#panel')

  if(currentTab==='create'){
    panel.innerHTML=`
      <div class="card">
        <h2>Publish a U12 activity</h2>

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
              <input id="actTitle" required placeholder="e.g. U12 Training Session">
            </div>

            <div class="field">
              <label>Start time</label>
              <input id="actTime" type="time">
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

          <button class="btn primary" type="submit">Publish activity</button>
        </form>
      </div>

      <div class="card spacetop">
        <h2>Existing activities</h2>
        ${activities.map(a=>`
          <div class="activity">
            <b>${esc(a.title)}</b>
            <p>${dateLabel(a.activity_date)} · ${esc(a.activity_type)}</p>
          </div>
        `).join('')}
      </div>
    `

    document.querySelector('#activityForm')
      .addEventListener('submit',createActivity)

    return
  }

  if(currentTab==='roster'){
    panel.innerHTML=`
      <div class="card">
        <h2>U12 player roster</h2>
        <div class="playerlist">
          ${children.map(p=>`<div class="player">${esc(p.name)}</div>`).join('')}
        </div>
      </div>
    `
    return
  }

  panel.innerHTML=`
    <div class="grid">
      <div class="card span4">
        <div class="muted">Registered U12 players</div>
        <div class="metric">${children.length}</div>
      </div>

      <div class="card span4">
        <div class="muted">Activities</div>
        <div class="metric">${activities.length}</div>
      </div>

      <div class="card span4">
        <div class="muted">Parent responses</div>
        <div class="metric">${responses.length}</div>
      </div>

      <div class="card span12">
        <h2>Availability by activity</h2>

        ${activities.map(a=>{
          const rs=responses.filter(r=>r.activity_id===a.id)
          const count=v=>rs.filter(r=>r.answer===v).length

          return `
            <div class="activity">
              <div class="activitytop">
                <div>
                  <span class="tag ${a.activity_type==='match'?'match':''}">${esc(a.activity_type)}</span>
                  <h3>${esc(a.title)}</h3>
                  <p>${dateLabel(a.activity_date)}</p>
                </div>
                <b>${count('yes')} / ${children.length} yes</b>
              </div>

              <div class="response">
                ${statusTag('yes')} ${count('yes')}
                ${statusTag('no')} ${count('no')}
                ${statusTag('unsure')} ${count('unsure')}
                ${statusTag(null)} ${Math.max(0,children.length-rs.length)}
              </div>

              <div class="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Availability</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${children.map(p=>{
                      const r=rs.find(x=>x.player_id===p.id)

                      return `
                        <tr>
                          <td>${esc(p.name)}</td>
                          <td>${statusTag(r?.answer)}</td>
                          <td>${esc(r?.absence_reason||'—')}</td>
                        </tr>
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
}

async function createActivity(e){
  e.preventDefault()

  const payload={
    activity_type:document.querySelector('#actType').value,
    title:document.querySelector('#actTitle').value.trim(),
    activity_date:document.querySelector('#actDate').value,
    start_time:document.querySelector('#actTime').value||null,
    venue:document.querySelector('#actVenue').value.trim()||null,
    opponent:document.querySelector('#actOpponent').value.trim()||null,
    notes:document.querySelector('#actNotes').value.trim()||null,
    is_published:true
  }

  const {error}=await supabase.from('activities').insert(payload)

  if(error){
    toast(error.message)
    return
  }

  await loadData()
  currentTab='overview'
  renderApp()
  toast('Activity published')
}

async function init(){
  if(!supabaseUrl||!supabaseKey){
    renderLogin('The Supabase environment variables are missing. Check the Netlify build settings and redeploy.')
    return
  }

  supabase=createClient(supabaseUrl,supabaseKey)

  // HANDLE LOGIN, NORMAL SESSION AND PASSWORD RECOVERY
  supabase.auth.onAuthStateChange((event,session)=>{

    if(event==='PASSWORD_RECOVERY' && session?.user){
      recoveryMode=true
      user=session.user
      renderResetPassword()
      return
    }

    if(event==='INITIAL_SESSION'){
      if(session?.user){
        user=session.user
        loadSession().catch(e=>renderLogin(e.message))
      }else{
        renderLogin()
      }
      return
    }

    if(event==='SIGNED_IN' && session?.user && !recoveryMode){
      user=session.user
      loadSession().catch(e=>renderLogin(e.message))
    }
  })
}

init()

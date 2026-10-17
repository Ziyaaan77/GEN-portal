const firebaseConfig = {
  apiKey: "AIzaSyAGzMraQB5fYOEwwH-wDpPsQoxDk3wQEHs",
  authDomain: "gen-math-portal.firebaseapp.com",
  projectId: "gen-math-portal",
  storageBucket: "gen-math-portal.firebasestorage.app",
  messagingSenderId: "425391959827",
  appId: "1:425391959827:web:01db158e1b3536ae43b4e6",
  measurementId: "G-150VM9CW9K"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Only this exact Google account sees the Admin dashboard. Change it to YOUR email if needed.
const ADMIN_EMAIL = "gaadrian2009@gmail.com";

// Cloudinary handles actual file storage (Firebase Storage now requires billing to enable)
const CLOUDINARY_CLOUD_NAME = "n9stqvzo";
const CLOUDINARY_UPLOAD_PRESET = "gen_uploads";

/* ---------- DATA ---------- */
const modules = [];

/* ---------- NAV ---------- */
function goToPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if(name === 'admin') loadAdminDashboard();
  document.querySelectorAll('#navLinks button, #bottomNav button').forEach(b=>{
    b.classList.toggle('active', b.dataset.page===name);
  });
}
document.querySelectorAll('#navLinks button, #bottomNav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(btn.dataset.page === 'home') goHome(); else goToPage(btn.dataset.page);
  });
});

// Takes the student to the Home page, back to its first screen (works from any page or lesson)
function goHome(){
  goToPage('home');
  showWizardStep('welcome');
  window.scrollTo({top:0, behavior:'smooth'});
}

/* ---------- AUTOMATIC PHONE / COMPUTER LAYOUT ---------- */
// No button needed: the page switches layout by itself.
// Phone layout  = narrow screens (or touch devices up to tablet size). Computer layout = everything else.
// It also reacts live when a window is resized or a phone is rotated.
const appEl = document.getElementById('app');
const phoneQuery = window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)');
function applyDeviceLayout(){
  appEl.classList.toggle('mobile-mode', phoneQuery.matches);
}
applyDeviceLayout();
if(phoneQuery.addEventListener) phoneQuery.addEventListener('change', applyDeviceLayout);
else phoneQuery.addListener(applyDeviceLayout);   // older browsers

/* ---------- MODULE CARDS ---------- */
function badgeClass(strand){ return strand; }
function renderModuleCard(m){
  return `<div class="module-card">
    <span class="badge ${badgeClass(m.strand)}">${m.badge}</span>
    <h4>${m.title}</h4>
    <p class="objective">${m.objective}</p>
    <div class="slide-preview"><span class="dot"></span> ${Math.floor(Math.random()*6)+8} slides uploaded</div>
    <div class="card-footer">
      <div class="progress-mini"><div class="fill" style="width:${m.progress}%;"></div></div>
    </div>
  </div>`;
}
const emptyModulesMsg = `<p style="color:var(--ink-soft); font-size:14px; grid-column:1/-1;">No modules yet — upload a lesson file above to create one.</p>`;
function renderAllModules(filter){
  const list = filter==='all' ? modules : modules.filter(m=>m.strand===filter);
  document.getElementById('allModules').innerHTML = list.map(renderModuleCard).join('') || emptyModulesMsg;
  document.getElementById('moduleCount').textContent = list.length+' modules';
}
renderAllModules('all');
document.querySelectorAll('#strandFilters button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#strandFilters button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderAllModules(btn.dataset.strand);
  });
});
/* ---------- REAL FILE UPLOAD (Firebase Storage + Firestore) ---------- */
function fileExtLabel(filename){
  const ext = filename.split('.').pop().toUpperCase();
  return ext === 'PPTX' ? 'PPT' : ext === 'DOCX' ? 'DOC' : ext;
}
function formatBytes(bytes){
  return (bytes / (1024*1024)).toFixed(1) + ' MB';
}

function renderUploads(files){
  document.getElementById('uploadList').innerHTML = files.length
    ? files.map(f=>`
    <div class="upload-row">
      <div class="file-icon">${fileExtLabel(f.name)}</div>
      <div class="meta">
        <a href="${f.url}" target="_blank" rel="noopener" class="name" style="color:var(--ink); text-decoration:none;">${f.name}</a>
        <div class="sub">${formatBytes(f.size)} · uploaded by ${f.uploadedBy || 'someone'}</div>
      </div>
      <span class="strand-tag">${f.strand}</span>
    </div>`).join('')
    : `<p style="color:var(--ink-soft); font-size:14px;">No files uploaded yet.</p>`;
}

// Live-updating list — refreshes automatically whenever anyone uploads a new file
db.collection('uploads').orderBy('uploadedAt', 'desc').onSnapshot(snapshot=>{
  const files = snapshot.docs.map(doc=>doc.data());
  renderUploads(files);
}, err=>{
  console.error('Could not load uploads:', err);
  renderUploads([]);
});

function uploadModuleFile(file){
  const statusMsg = document.getElementById('uploadStatusMsg');

  if(!currentUser){
    statusMsg.textContent = '⚠️ Please sign in with Google before uploading a file.';
    statusMsg.style.color = 'var(--orange-dark)';
    return;
  }

  const strand = document.getElementById('uploadStrandSelect').value;

  statusMsg.style.color = 'var(--ink-soft)';
  statusMsg.textContent = `Uploading "${file.name}"... 0%`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  // Cloudinary rejects "&" and other special characters in folder paths
  function sanitizeFolderName(str){
    return str.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  }
  formData.append('folder', `modules/${sanitizeFolderName(strand)}`);

  // Cloudinary treats PDFs as "image" resource type, everything else as "raw"
  const resourceType = file.name.toLowerCase().endsWith('.pdf') ? 'image' : 'raw';
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', endpoint, true);

  xhr.upload.onprogress = (e)=>{
    if(e.lengthComputable){
      const pct = Math.round((e.loaded / e.total) * 100);
      statusMsg.textContent = `Uploading "${file.name}"... ${pct}%`;
    }
  };

  xhr.onload = async ()=>{
    if(xhr.status < 200 || xhr.status >= 300){
      console.error(xhr.responseText);
      statusMsg.style.color = 'var(--orange-dark)';
      statusMsg.textContent = `Upload failed — check your Cloudinary cloud name/preset.`;
      return;
    }
    const data = JSON.parse(xhr.responseText);
    await db.collection('uploads').add({
      name: file.name,
      strand,
      size: file.size,
      url: data.secure_url,
      uploadedBy: currentUser.name,
      uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    statusMsg.style.color = '#1F8A6B';
    statusMsg.textContent = `✅ "${file.name}" uploaded to ${strand}.`;
  };

  xhr.onerror = ()=>{
    statusMsg.style.color = 'var(--orange-dark)';
    statusMsg.textContent = 'Upload failed — check your internet connection.';
  };

  xhr.send(formData);
}

function handleModuleFileUpload(event){
  const file = event.target.files[0];
  if(file) uploadModuleFile(file);
  event.target.value = '';
}

const dropZone = document.getElementById('dropZone');
['dragover','dragleave','drop'].forEach(evt=>{
  dropZone.addEventListener(evt, e=>{
    e.preventDefault();
    dropZone.classList.toggle('drag', evt==='dragover');
    if(evt==='drop' && e.dataTransfer.files.length){
      uploadModuleFile(e.dataTransfer.files[0]);
    }
  });
});
/* ---------- ACCORDION ---------- */
function toggleAccordion(headEl){
  headEl.parentElement.classList.toggle('open');
}

/* ---------- REAL GOOGLE SIGN-IN (FIREBASE) ---------- */
let currentUser = null;   // {uid, email, name}
let pendingFirebaseUser = null;

function getInitials(name){
  const parts = name.trim().split(/\s+/);
  return parts.length>1 ? (parts[0][0]+parts[1][0]).toUpperCase() : parts[0].slice(0,2).toUpperCase();
}

function signInWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err=>{
    console.error(err);
    alert("Sign-in didn't go through: " + err.message + "\n\n(Make sure this page is open at http://localhost, not opened directly as a file.)");
  });
}

function handleUserChipClick(){
  if(confirm("Sign out of GEN?")) auth.signOut();
}

function profileAction(){
  if(currentUser) auth.signOut();
  else signInWithGoogle();
}

// Fires automatically whenever sign-in state changes (page load, login, logout)
auth.onAuthStateChanged(async (user)=>{
  if(user){
    const docRef = db.collection('users').doc(user.uid);
    const snap = await docRef.get();
    if(!snap.exists){
      // first time signing in — ask what name to show
      pendingFirebaseUser = user;
      document.getElementById('modalEmailShown').textContent = user.email;
      document.getElementById('loginName').value = user.displayName || '';
      document.getElementById('loginError').classList.remove('show');
      document.getElementById('loginModalOverlay').classList.add('show');
    } else {
      const data = snap.data();
      currentUser = {uid:user.uid, email:user.email, name:data.displayName};
      const streak = await syncDailyStreak(user.uid, data);
      applySignedInUI(data.displayName, user.email, data.moduleProgress || {}, streak);

      // restore this account's saved theme + notification preference
      if(typeof data.themeIndex === 'number' && data.themeIndex !== themeIndex){
        applyThemeInstant(data.themeIndex);
      }
      document.getElementById('notifToggle').setAttribute('aria-checked', data.notificationsEnabled !== false);
      db.collection('users').doc(user.uid).set({lastSeenAt: Date.now()}, {merge:true}).catch(console.error);
      updateAdminAccess(user.email);
      loadActiveDaysForUser(user.uid, data);
    }
  } else {
    currentUser = null;
    activeDays = new Set(); loadLocalDays(); markActiveToday();
    showSignedOutUI();
  }
});

// DAILY STREAK: a day counts as "active" when the student opens the app (or practices) that day.
// Using the app on consecutive days raises the streak by 1. Missing a whole day drops it back to 0
// (it starts again at 1 the next time they open the app). The streak is always worked out from the
// saved list of active days (users/{uid}.activeDays), so it can go up AND down.
async function syncDailyStreak(uid, data){
  const today = dayKey(new Date());
  activeDays = new Set(Array.isArray(data.activeDays) ? data.activeDays : []);
  activeDays.add(today);
  const streak = calcStreaks().current;
  try{
    await db.collection('users').doc(uid).set({
      activeDays: firebase.firestore.FieldValue.arrayUnion(today),
      streak, lastLoginTimestamp: Date.now()
    }, {merge:true});
  }catch(e){ console.error(e); }
  return streak;
}

async function confirmDisplayName(){
  const nameInput = document.getElementById('loginName').value.trim();
  const errorBox = document.getElementById('loginError');
  if(!nameInput){
    errorBox.classList.add('show');
    return;
  }
  const user = pendingFirebaseUser;
  await db.collection('users').doc(user.uid).set({
    displayName: nameInput,
    email: user.email,
    moduleProgress: {},
    streak: 1,
    activeDays: [dayKey(new Date())],
    lastLoginTimestamp: Date.now(),
    lastSeenAt: Date.now(),
    themeIndex: 0,
    notificationsEnabled: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true});

  currentUser = {uid:user.uid, email:user.email, name:nameInput};
  activeDays = new Set([dayKey(new Date())]);
  renderStreakCalendar();
  applySignedInUI(nameInput, user.email, {}, 1);
  document.getElementById('notifToggle').setAttribute('aria-checked', 'true');
  updateAdminAccess(user.email);
  document.getElementById('loginModalOverlay').classList.remove('show');
}

function applySignedInUI(displayName, email, moduleProgress, streak){
  const initials = getInitials(displayName);
  document.getElementById('googleSignInBtn').style.display = 'none';
  const chip = document.getElementById('userChip');
  chip.style.display = 'flex';
  document.getElementById('navAvatar').textContent = initials;
  document.getElementById('navUname').innerHTML = displayName + `<span class="sub">${email}</span>`;
  document.getElementById('greetingHeading').textContent = `Hey ${displayName}! Ready to keep your streak going?`;
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = displayName;
  document.getElementById('profileEmail').textContent = email;
  document.getElementById('profileSignInBtn').textContent = 'Sign out';
  document.getElementById('editNameBtn').style.display = 'inline-block';

  document.getElementById('statStreak').textContent = streak;

  // apply this user's saved progress onto the shared module list, then re-render
  modules.forEach(m=>{
    if(moduleProgress[m.title] !== undefined) m.progress = moduleProgress[m.title];
  });
  renderAllModules(document.querySelector('#strandFilters button.active')?.dataset.strand || 'all');
}

function showSignedOutUI(){
  updateAdminAccess(null);
  document.getElementById('googleSignInBtn').style.display = 'flex';
  document.getElementById('userChip').style.display = 'none';
  document.getElementById('greetingHeading').textContent = 'Fall in love with solving problems';
  document.getElementById('profileAvatar').textContent = '?';
  document.getElementById('profileName').textContent = 'Not signed in';
  document.getElementById('profileEmail').textContent = 'Sign in with Google to save your progress';
  document.getElementById('profileSignInBtn').textContent = 'Sign in with Google';
  document.getElementById('editNameBtn').style.display = 'none';
  cancelEditingName();
  document.getElementById('statStreak').textContent = '0';
  document.getElementById('notifToggle').setAttribute('aria-checked', 'true');
}

/* ---------- Edit display name ---------- */
function startEditingName(){
  if(!currentUser) return;
  document.getElementById('profileNameInput').value = currentUser.name;
  document.getElementById('profileNameDisplay').style.display = 'none';
  document.getElementById('profileNameEditRow').style.display = 'flex';
  document.getElementById('profileNameInput').focus();
}
function cancelEditingName(){
  document.getElementById('profileNameDisplay').style.display = 'flex';
  document.getElementById('profileNameEditRow').style.display = 'none';
}
async function saveEditedName(){
  const newName = document.getElementById('profileNameInput').value.trim();
  if(!newName || !currentUser) return;

  await db.collection('users').doc(currentUser.uid).set({displayName: newName}, {merge:true});
  currentUser.name = newName;

  const initials = getInitials(newName);
  document.getElementById('navAvatar').textContent = initials;
  document.getElementById('navUname').innerHTML = newName + `<span class="sub">${currentUser.email}</span>`;
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = newName;
  document.getElementById('greetingHeading').textContent = `Hey ${newName}! Ready to keep your streak going?`;

  cancelEditingName();
}

// ----- Per-user persistence: module progress + quiz results -----
async function saveModuleProgress(title, progress){
  if(!currentUser) return;
  await db.collection('users').doc(currentUser.uid).set({
    moduleProgress: { [title]: progress }
  }, {merge:true});
}

/* ---------- THEME SWITCHER ---------- */
const themes = [
  { name:"Calm Teal", paper:"#FAF9F4", surface:"#EFF3EE", surface2:"#E4EEEA", ink:"#1E3A3A", inkSoft:"#4A6363", primary:"#3D8A8A", primaryDark:"#2C6666", accent:"#F2A65A", accentDark:"#D98A3D", yellow:"#FFD873", line:"#D8E0DA" },
  { name:"Coral Sunset", paper:"#FFF8F3", surface:"#FDEDE3", surface2:"#FCE1D0", ink:"#4A2E23", inkSoft:"#8C6952", primary:"#E8734A", primaryDark:"#C65934", accent:"#4AA8A8", accentDark:"#368585", yellow:"#FFDDA8", line:"#F0DCCB" },
  { name:"Violet Mint", paper:"#F8F6FC", surface:"#EDE8F8", surface2:"#E1D8F3", ink:"#2E2350", inkSoft:"#6F63A0", primary:"#7C5CD6", primaryDark:"#5F42B8", accent:"#3FBFA0", accentDark:"#2FA089", yellow:"#FFE066", line:"#DDD4F0" },
  { name:"Sunny Blue", paper:"#F5FAFF", surface:"#E8F2FC", surface2:"#D9EAFA", ink:"#133A5E", inkSoft:"#4C7A9E", primary:"#2E86DE", primaryDark:"#1F65AE", accent:"#F2A65A", accentDark:"#D98A3D", yellow:"#FFE38A", line:"#CFE3F5" },
  { name:"Rose Blush", paper:"#FFF5F7", surface:"#FDE8ED", surface2:"#FBDAE3", ink:"#4A1F2B", inkSoft:"#8C5568", primary:"#E0568C", primaryDark:"#B83E6E", accent:"#4FBFA0", accentDark:"#35A085", yellow:"#FFE08A", line:"#F5D5DE" },
  { name:"Forest Moss", paper:"#F6FAF3", surface:"#E9F3E1", surface2:"#DCECD0", ink:"#1E3620", inkSoft:"#5C7A5F", primary:"#5B8C3E", primaryDark:"#456B2E", accent:"#E8A33D", accentDark:"#C6862A", yellow:"#FFE38A", line:"#D3E5C6" },
  { name:"Midnight Indigo", paper:"#F4F5FB", surface:"#E7E9F7", surface2:"#D9DCF2", ink:"#1B1F3B", inkSoft:"#5B5F8A", primary:"#4A4FD6", primaryDark:"#3739AD", accent:"#3DC4D6", accentDark:"#2CA3B3", yellow:"#FFDD75", line:"#D5D8F0" }
];
let themeIndex = 0;

function applyTheme(t){
  const root = document.documentElement.style;
  root.setProperty('--paper', t.paper);
  root.setProperty('--surface', t.surface);
  root.setProperty('--surface-2', t.surface2);
  root.setProperty('--ink', t.ink);
  root.setProperty('--ink-soft', t.inkSoft);
  root.setProperty('--teal', t.primary);
  root.setProperty('--teal-dark', t.primaryDark);
  root.setProperty('--orange', t.accent);
  root.setProperty('--orange-dark', t.accentDark);
  root.setProperty('--yellow', t.yellow);
  root.setProperty('--line', t.line);
}

function cycleTheme(e){
  goToTheme((themeIndex + 1) % themes.length);
}

function selectTheme(index){
  if(index === themeIndex) return;
  goToTheme(index);
}

function goToTheme(targetIndex){
  const nextTheme = themes[targetIndex];

  // flowing-wave flourish on the logo icon
  const wave = document.getElementById('wavePath');
  wave.classList.remove('wave-spin');
  void wave.offsetWidth; // restart animation
  wave.classList.add('wave-spin');

  // ripple that expands from the logo and reveals the new palette
  const btn = document.getElementById('logoBtn');
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const maxDist = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy)
  ) * 2.15;

  const ripple = document.createElement('div');
  ripple.className = 'theme-ripple';
  ripple.style.left = cx + 'px';
  ripple.style.top = cy + 'px';
  ripple.style.width = maxDist + 'px';
  ripple.style.height = maxDist + 'px';
  ripple.style.background = nextTheme.primary;
  document.body.appendChild(ripple);

  requestAnimationFrame(()=>{
    ripple.style.opacity = '0.9';
    ripple.style.transform = 'translate(-50%,-50%) scale(1)';
  });

  const appEl2 = document.getElementById('app');
  appEl2.classList.add('theme-transition');

  setTimeout(()=>{
    applyTheme(nextTheme);
    themeIndex = targetIndex;
    updateActiveSwatch();
    if(currentUser){
      db.collection('users').doc(currentUser.uid).set({themeIndex}, {merge:true}).catch(console.error);
    }
  }, 300);

  setTimeout(()=>{
    ripple.style.opacity = '0';
  }, 620);

  setTimeout(()=>{
    ripple.remove();
    appEl2.classList.remove('theme-transition');
  }, 1100);
}

// Instantly apply a theme with no ripple/animation — used when loading a signed-in user's saved preference
function applyThemeInstant(targetIndex){
  themeIndex = targetIndex;
  applyTheme(themes[targetIndex]);
  updateActiveSwatch();
}

function populateThemeSwatches(){
  const row = document.getElementById('themeSwatchRow');
  if(!row) return;
  row.innerHTML = themes.map((t,i)=>
    `<button class="theme-swatch" title="${t.name}" style="background:linear-gradient(135deg, ${t.primary}, ${t.accent});" onclick="selectTheme(${i})"></button>`
  ).join('');
  updateActiveSwatch();
}
function updateActiveSwatch(){
  document.querySelectorAll('.theme-swatch').forEach((el,i)=>{
    el.classList.toggle('active', i === themeIndex);
  });
}
populateThemeSwatches();

/* ---------- Notification toggle (real setting, persisted per account) ---------- */
function toggleNotifications(){
  const btn = document.getElementById('notifToggle');
  const newState = btn.getAttribute('aria-checked') !== 'true';
  btn.setAttribute('aria-checked', newState);
  if(currentUser){
    db.collection('users').doc(currentUser.uid).set({notificationsEnabled: newState}, {merge:true}).catch(console.error);
  }
}

/* ================= CUSTOM CURSOR — icon badge that morphs per target ================= */
(function initCustomCursor(){
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if(isTouchDevice){
    document.body.classList.add('no-custom-cursor');
    return;
  }
  document.body.classList.add('custom-cursor-active');

  const badge = document.getElementById('cursorBadge');
  const icon = document.getElementById('cursorIcon');

  // Original, simple line-icons (not copied from any reference) — one per state
  const ICONS = {
    default:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/></svg>',
    click:    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="9" width="6" height="12" rx="3"/><circle cx="12" cy="6" r="3.2"/></svg>',
    upload:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l17-8-6 17-3-7-8-2z"/></svg>',
    drop:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l17-8-6 17-3-7-8-2z"/></svg>',
    cta:      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    disabled: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
  };
  icon.innerHTML = ICONS.default;

  document.addEventListener('mousemove', (e)=>{
    // Direct 1:1 positioning — no easing, no pull toward elements, zero lag
    badge.style.left = e.clientX + 'px';
    badge.style.top = e.clientY + 'px';
  });

  // Selectors, checked in priority order (most specific first)
  const SEL_DISABLED = 'button:disabled, [aria-disabled="true"]';
  const SEL_TEXT     = 'textarea, input:not([type="file"])';
  const SEL_DROPZONE = '.lecture-upload-zone, .upload-zone';
  const SEL_CTA      = '.hero-cta';
  const SEL_CLICK    = 'button, a, select, .module-card, .lecture-card, .input-choice-card, .quiz-option, .theme-swatch, .toggle-switch, [onclick]';

  const STATE_CONFIG = [
    {selector: SEL_DISABLED, state: 'state-disabled', icon: ICONS.disabled},
    {selector: SEL_TEXT,     state: 'state-text',     icon: ''},
    {selector: SEL_DROPZONE, state: 'state-upload',   icon: ICONS.upload},
    {selector: SEL_CTA,      state: 'state-cta',      icon: ICONS.cta},
    {selector: SEL_CLICK,    state: 'state-click',    icon: ICONS.click},
  ];
  const ALL_STATES = STATE_CONFIG.map(c=>c.state).concat('state-drop');

  function setCursorState(config){
    ALL_STATES.forEach(s=> badge.classList.remove(s));
    if(config){
      badge.classList.add(config.state);
      icon.innerHTML = config.icon;
    } else {
      icon.innerHTML = ICONS.default;
    }
  }

  function matchState(target){
    for(const config of STATE_CONFIG){
      const el = target.closest(config.selector);
      if(el) return {config, el};
    }
    return null;
  }

  document.addEventListener('mouseover', (e)=>{
    const match = matchState(e.target);
    if(match) setCursorState(match.config);
  });
  document.addEventListener('mouseout', (e)=>{
    const stillInside = e.relatedTarget && matchState(e.relatedTarget);
    if(!stillInside) setCursorState(null);
  });

  // Dragging a file over any drop zone overrides everything with the "drop here" state
  document.querySelectorAll(SEL_DROPZONE).forEach(zone=>{
    zone.addEventListener('dragover', ()=>{
      ALL_STATES.forEach(s=> badge.classList.remove(s));
      badge.classList.add('state-drop');
      icon.innerHTML = ICONS.drop;
    });
    zone.addEventListener('dragleave', ()=>{
      if(zone.matches(':hover')) setCursorState({state:'state-upload', icon:ICONS.upload});
      else setCursorState(null);
    });
    zone.addEventListener('drop', ()=> setCursorState(null));
  });

  // Real expanding ripple on click, spawned at the exact click point
  document.addEventListener('mousedown', (e)=>{
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    document.body.appendChild(ripple);
    ripple.addEventListener('animationend', ()=> ripple.remove());
  });
})();

/*
  To swap in an image-based cursor later instead of this CSS/HTML one, you'd
  set it natively on the body, e.g.:
    body.custom-cursor-active { cursor: url("cursor.png") 12 12, auto !important; }
  and remove the `cursor:none` rule + the #cursorBadge element.
  Everything above is structured as a drop-in replacement for that.
*/

/* ================= HOME PAGE FLOW: Start Learning -> pick a level -> quiz ================= */
// Hides every YouTube lesson card and unloads its player so nothing keeps playing in the background.
function stopAllLessonVideos(){
  document.querySelectorAll('#resStaticVideos > *').forEach(el => {
    el.hidden = true;
    el.querySelectorAll('iframe').forEach(f => f.removeAttribute('src'));
  });
}

function showWizardStep(stepName){
  if(stepName !== 'resources') stopAllLessonVideos();
  document.querySelectorAll('.wizard-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('step-' + stepName).classList.add('active');
}

// MINI GAME FORMAT (each topic has a `game:{ questions:[] }` slot):
//   { q:'Question text', options:['A answer','B answer','C answer','D answer'], answer:0 /* index of the right option */,
//     solution:['Step 1 ...','Step 2 ...','Step 3 ...'] }
//   Students TYPE their answer (there are no answer choices). `answer` can simply be the text of the right answer, e.g. answer:'9'.
//   (Older questions that use options + an index still work: the right option is used as the answer.)
// Add `levels:true` and tag each question with level:'easy' | 'medium' | 'hard' to show the difficulty picker (Addition does this).
// You can also add `cta:'your own call-to-action text'` inside `game:{}` to change the banner text.
// With no questions, the game shows its empty design/structure.

// What each level covers. Edit these lists to change the topics or what each quiz focuses on.
// The AI writes the quiz questions from ONLY the "focus" lines of the topic that was picked.
const LEVELS = {
  beginner: {
    name: 'Beginner Level',
    short: 'Beginner',
    difficulty: 'easy',
    groups: [
      { label: 'Basic operations', tone: 'a', topics: [
        { key:'addition', title:'Addition', sub:'Combine numbers', icon:'+',
          game:{ levels:true, questions:[
            // ---------- EASY (20 questions) ----------
            {"level": "easy", "q": "5 + 4 = ?", "answer": "9", "solution": ["Start at 5.", "Count up 4 more: 6, 7, 8, 9.", "So 5 + 4 = 9."]},
            {"level": "easy", "q": "12 + 7 = ?", "answer": "19", "solution": ["Add the ones: 2 + 7 = 9.", "The tens stay the same: 1 ten.", "Put them together: 19."]},
            {"level": "easy", "q": "23 + 14 = ?", "answer": "37", "solution": ["Add the ones: 3 + 4 = 7.", "Add the tens: 2 + 1 = 3 tens (30).", "Put them together: 37."]},
            {"level": "easy", "q": "30 + 25 = ?", "answer": "55", "solution": ["Add the tens: 3 tens + 2 tens = 5 tens (50).", "Add the ones: 0 + 5 = 5.", "Put them together: 55."]},
            {"level": "easy", "q": "Ana has 8 apples. She picks 6 more. How many apples does she have now?", "answer": "14", "solution": ["\"Picks more\" means we add: 8 + 6.", "8 + 2 = 10, then 4 more makes 14.", "Ana has 14 apples."]},
            {"level": "easy", "q": "5 + 3 = ?", "answer": "8", "solution": ["Start at 5.", "Count up 3 more: 6, 7, 8.", "So 5 + 3 = 8."]},
            {"level": "easy", "q": "5 + 7 = ?", "answer": "12", "solution": ["Make 10 first: 5 + 5 = 10.", "7 is 5 + 2, so there is 2 left to add.", "10 + 2 = 12."]},
            {"level": "easy", "q": "2 + 8 = ?", "answer": "10", "solution": ["Start at 2.", "Count up 8 more: 3, 4, 5, 6, 7, 8, 9, 10.", "So 2 + 8 = 10."]},
            {"level": "easy", "q": "2 + 2 = ?", "answer": "4", "solution": ["Start at 2.", "Count up 2 more: 3, 4.", "So 2 + 2 = 4."]},
            {"level": "easy", "q": "61 + 1 = ?", "answer": "62", "solution": ["Add the ones: 1 + 1 = 2.", "The tens stay the same: 60.", "Put them together: 62."]},
            {"level": "easy", "q": "21 + 4 = ?", "answer": "25", "solution": ["Add the ones: 1 + 4 = 5.", "The tens stay the same: 20.", "Put them together: 25."]},
            {"level": "easy", "q": "23 + 1 = ?", "answer": "24", "solution": ["Add the ones: 3 + 1 = 4.", "The tens stay the same: 20.", "Put them together: 24."]},
            {"level": "easy", "q": "33 + 26 = ?", "answer": "59", "solution": ["Add the ones: 3 + 6 = 9.", "Add the tens: 30 + 20 = 50.", "Put them together: 59."]},
            {"level": "easy", "q": "38 + 40 = ?", "answer": "78", "solution": ["Add the ones: 8 + 0 = 8.", "Add the tens: 30 + 40 = 70.", "Put them together: 78."]},
            {"level": "easy", "q": "40 + 40 = ?", "answer": "80", "solution": ["Add the ones: 0 + 0 = 0.", "Add the tens: 40 + 40 = 80.", "Put them together: 80."]},
            {"level": "easy", "q": "11 + 44 = ?", "answer": "55", "solution": ["Add the ones: 1 + 4 = 5.", "Add the tens: 10 + 40 = 50.", "Put them together: 55."]},
            {"level": "easy", "q": "20 + 20 = ?", "answer": "40", "solution": ["Think in tens: 2 tens + 2 tens = 4 tens.", "4 tens = 40.", "So 20 + 20 = 40."]},
            {"level": "easy", "q": "60 + 30 = ?", "answer": "90", "solution": ["Think in tens: 6 tens + 3 tens = 9 tens.", "9 tens = 90.", "So 60 + 30 = 90."]},
            {"level": "easy", "q": "Jade has 24 stickers. A friend gives Jade 20 more. How many stickers does Jade have now?", "answer": "44", "solution": ["\"More\" means we add: 24 + 20.", "Ones: 4 + 0 = 4. Tens: 20 + 20 = 40.", "Answer: 44 stickers."]},
            {"level": "easy", "q": "Ivan has 24 candies. A friend gives Ivan 3 more. How many candies does Ivan have now?", "answer": "27", "solution": ["\"More\" means we add: 24 + 3.", "Ones: 4 + 3 = 7. Tens: 20 + 0 = 20.", "Answer: 27 candies."]},
            // ---------- MEDIUM (20 questions) ----------
            {"level": "medium", "q": "47 + 38 = ?", "answer": "85", "solution": ["Ones: 7 + 8 = 15. Write 5 and carry 1.", "Tens: 4 + 3 + 1 (carried) = 8.", "Answer: 85."]},
            {"level": "medium", "q": "156 + 79 = ?", "answer": "235", "solution": ["Ones: 6 + 9 = 15. Write 5, carry 1.", "Tens: 5 + 7 + 1 = 13. Write 3, carry 1.", "Hundreds: 1 + 0 + 1 = 2. Answer: 235."]},
            {"level": "medium", "q": "248 + 365 = ?", "answer": "613", "solution": ["Ones: 8 + 5 = 13. Write 3, carry 1.", "Tens: 4 + 6 + 1 = 11. Write 1, carry 1.", "Hundreds: 2 + 3 + 1 = 6. Answer: 613."]},
            {"level": "medium", "q": "509 + 294 = ?", "answer": "803", "solution": ["Ones: 9 + 4 = 13. Write 3, carry 1.", "Tens: 0 + 9 + 1 = 10. Write 0, carry 1.", "Hundreds: 5 + 2 + 1 = 8. Answer: 803."]},
            {"level": "medium", "q": "A store sold 125 notebooks on Monday and 187 on Tuesday. How many notebooks did it sell in all?", "answer": "312", "solution": ["\"In all\" means add: 125 + 187.", "Ones: 5 + 7 = 12 (write 2, carry 1). Tens: 2 + 8 + 1 = 11 (write 1, carry 1).", "Hundreds: 1 + 1 + 1 = 3. Answer: 312 notebooks."]},
            {"level": "medium", "q": "36 + 75 = ?", "answer": "111", "solution": ["Ones: 6 + 5 = 11. Write 1, carry 1.", "Tens: 3 + 7 + 1 (carried) = 11.", "Answer: 111."]},
            {"level": "medium", "q": "28 + 38 = ?", "answer": "66", "solution": ["Ones: 8 + 8 = 16. Write 6, carry 1.", "Tens: 2 + 3 + 1 (carried) = 6.", "Answer: 66."]},
            {"level": "medium", "q": "55 + 28 = ?", "answer": "83", "solution": ["Ones: 5 + 8 = 13. Write 3, carry 1.", "Tens: 5 + 2 + 1 (carried) = 8.", "Answer: 83."]},
            {"level": "medium", "q": "34 + 39 = ?", "answer": "73", "solution": ["Ones: 4 + 9 = 13. Write 3, carry 1.", "Tens: 3 + 3 + 1 (carried) = 7.", "Answer: 73."]},
            {"level": "medium", "q": "484 + 38 = ?", "answer": "522", "solution": ["Ones: 4 + 8 = 12. Write 2, carry 1.", "Tens: 8 + 3 + 1 (carried) = 12. Write 2, carry 1.", "Hundreds: 4 + 0 + 1 (carried) = 5.", "Answer: 522."]},
            {"level": "medium", "q": "253 + 48 = ?", "answer": "301", "solution": ["Ones: 3 + 8 = 11. Write 1, carry 1.", "Tens: 5 + 4 + 1 (carried) = 10. Write 0, carry 1.", "Hundreds: 2 + 0 + 1 (carried) = 3.", "Answer: 301."]},
            {"level": "medium", "q": "253 + 38 = ?", "answer": "291", "solution": ["Ones: 3 + 8 = 11. Write 1, carry 1.", "Tens: 5 + 3 + 1 (carried) = 9.", "Hundreds: 2 + 0 = 2.", "Answer: 291."]},
            {"level": "medium", "q": "279 + 223 = ?", "answer": "502", "solution": ["Ones: 9 + 3 = 12. Write 2, carry 1.", "Tens: 7 + 2 + 1 (carried) = 10. Write 0, carry 1.", "Hundreds: 2 + 2 + 1 (carried) = 5.", "Answer: 502."]},
            {"level": "medium", "q": "768 + 283 = ?", "answer": "1,051", "solution": ["Ones: 8 + 3 = 11. Write 1, carry 1.", "Tens: 6 + 8 + 1 (carried) = 15. Write 5, carry 1.", "Hundreds: 7 + 2 + 1 (carried) = 10.", "Answer: 1,051."]},
            {"level": "medium", "q": "341 + 499 = ?", "answer": "840", "solution": ["Ones: 1 + 9 = 10. Write 0, carry 1.", "Tens: 4 + 9 + 1 (carried) = 14. Write 4, carry 1.", "Hundreds: 3 + 4 + 1 (carried) = 8.", "Answer: 840."]},
            {"level": "medium", "q": "674 + 776 = ?", "answer": "1,450", "solution": ["Ones: 4 + 6 = 10. Write 0, carry 1.", "Tens: 7 + 7 + 1 (carried) = 15. Write 5, carry 1.", "Hundreds: 6 + 7 + 1 (carried) = 14.", "Answer: 1,450."]},
            {"level": "medium", "q": "509 + 583 = ?", "answer": "1,092", "solution": ["Ones: 9 + 3 = 12. Write 2, carry 1.", "Tens: 0 + 8 + 1 (carried) = 9.", "Hundreds: 5 + 5 = 10.", "Answer: 1,092."]},
            {"level": "medium", "q": "A bakery made 205 pandesal in the morning and 175 in the afternoon. How many pandesal did it make in all?", "answer": "380", "solution": ["\"In all\" means add: 205 + 175.", "Ones: 5 + 5 = 10. Write 0, carry 1.", "Tens: 0 + 7 + 1 (carried) = 8.", "Hundreds: 2 + 1 = 3.", "Answer: 380 pandesal."]},
            {"level": "medium", "q": "A bakery made 309 pandesal in the morning and 161 in the afternoon. How many pandesal did it make in all?", "answer": "470", "solution": ["\"In all\" means add: 309 + 161.", "Ones: 9 + 1 = 10. Write 0, carry 1.", "Tens: 0 + 6 + 1 (carried) = 7.", "Hundreds: 3 + 1 = 4.", "Answer: 470 pandesal."]},
            {"level": "medium", "q": "A bus carried 338 passengers before noon and 477 after noon. How many passengers did it carry in all?", "answer": "815", "solution": ["\"In all\" means add: 338 + 477.", "Ones: 8 + 7 = 15. Write 5, carry 1.", "Tens: 3 + 7 + 1 (carried) = 11. Write 1, carry 1.", "Hundreds: 3 + 4 + 1 (carried) = 8.", "Answer: 815 passengers."]},
            // ---------- HARD (20 questions) ----------
            {"level": "hard", "q": "2,478 + 3,659 = ?", "answer": "6,137", "solution": ["Ones: 8 + 9 = 17. Write 7, carry 1.", "Tens: 7 + 5 + 1 = 13. Write 3, carry 1.", "Hundreds: 4 + 6 + 1 = 11. Write 1, carry 1. Thousands: 2 + 3 + 1 = 6.", "Answer: 6,137."]},
            {"level": "hard", "q": "−8 + 15 = ?", "answer": "7", "solution": ["Start at −8 on the number line.", "Move 15 steps to the right. 8 steps reach 0.", "7 steps are left, so you land on 7."]},
            {"level": "hard", "q": "−14 + (−9) = ?", "answer": "−23", "solution": ["Both numbers are negative, so add their sizes: 14 + 9 = 23.", "Keep the negative sign.", "Answer: −23."]},
            {"level": "hard", "q": "1,250 + 875 + 2,340 = ?", "answer": "4,465", "solution": ["Add the first two: 1,250 + 875 = 2,125.", "Now add the third: 2,125 + 2,340 = 4,465.", "Answer: 4,465."]},
            {"level": "hard", "q": "A school collected 3,486 bottles in January and 2,759 bottles in February. How many bottles did it collect in all?", "answer": "6,245", "solution": ["\"In all\" means add: 3,486 + 2,759.", "Ones: 6 + 9 = 15 (5, carry 1). Tens: 8 + 5 + 1 = 14 (4, carry 1).", "Hundreds: 4 + 7 + 1 = 12 (2, carry 1). Thousands: 3 + 2 + 1 = 6.", "Answer: 6,245 bottles."]},
            {"level": "hard", "q": "1,932 + 3,978 = ?", "answer": "5,910", "solution": ["Ones: 2 + 8 = 10. Write 0, carry 1.", "Tens: 3 + 7 + 1 (carried) = 11. Write 1, carry 1.", "Hundreds: 9 + 9 + 1 (carried) = 19. Write 9, carry 1.", "Thousands: 1 + 3 + 1 (carried) = 5.", "Answer: 5,910."]},
            {"level": "hard", "q": "3,448 + 2,367 = ?", "answer": "5,815", "solution": ["Ones: 8 + 7 = 15. Write 5, carry 1.", "Tens: 4 + 6 + 1 (carried) = 11. Write 1, carry 1.", "Hundreds: 4 + 3 + 1 (carried) = 8.", "Thousands: 3 + 2 = 5.", "Answer: 5,815."]},
            {"level": "hard", "q": "6,689 + 3,398 = ?", "answer": "10,087", "solution": ["Ones: 9 + 8 = 17. Write 7, carry 1.", "Tens: 8 + 9 + 1 (carried) = 18. Write 8, carry 1.", "Hundreds: 6 + 3 + 1 (carried) = 10. Write 0, carry 1.", "Thousands: 6 + 3 + 1 (carried) = 10.", "Answer: 10,087."]},
            {"level": "hard", "q": "5,759 + 5,591 = ?", "answer": "11,350", "solution": ["Ones: 9 + 1 = 10. Write 0, carry 1.", "Tens: 5 + 9 + 1 (carried) = 15. Write 5, carry 1.", "Hundreds: 7 + 5 + 1 (carried) = 13. Write 3, carry 1.", "Thousands: 5 + 5 + 1 (carried) = 11.", "Answer: 11,350."]},
            {"level": "hard", "q": "−10 + 11 = ?", "answer": "1", "solution": ["Start at −10 on the number line.", "Move 11 steps to the right. 10 steps reach 0.", "1 more steps take you to 1."]},
            {"level": "hard", "q": "−9 + 10 = ?", "answer": "1", "solution": ["Start at −9 on the number line.", "Move 10 steps to the right. 9 steps reach 0.", "1 more steps take you to 1."]},
            {"level": "hard", "q": "−19 + 26 = ?", "answer": "7", "solution": ["Start at −19 on the number line.", "Move 26 steps to the right. 19 steps reach 0.", "7 more steps take you to 7."]},
            {"level": "hard", "q": "−20 + (−21) = ?", "answer": "−41", "solution": ["Both numbers are negative, so add their sizes: 20 + 21 = 41.", "Keep the negative sign.", "Answer: −41."]},
            {"level": "hard", "q": "−16 + (−14) = ?", "answer": "−30", "solution": ["Both numbers are negative, so add their sizes: 16 + 14 = 30.", "Keep the negative sign.", "Answer: −30."]},
            {"level": "hard", "q": "300 + 900 + 700 = ?", "answer": "1,900", "solution": ["Add the first two: 300 + 900 = 1,200.", "Now add the third: 1,200 + 700 = 1,900.", "Answer: 1,900."]},
            {"level": "hard", "q": "700 + 300 + 640 = ?", "answer": "1,640", "solution": ["Add the first two: 700 + 300 = 1,000.", "Now add the third: 1,000 + 640 = 1,640.", "Answer: 1,640."]},
            {"level": "hard", "q": "2.69 + 3.98 = ?", "answer": "6.67", "solution": ["Line up the decimal points so the digits match.", "Add as whole numbers: 269 + 398 = 667.", "Put the decimal point back, 2 places from the right: 6.67."]},
            {"level": "hard", "q": "8.42 + 6.98 = ?", "answer": "15.40", "solution": ["Line up the decimal points so the digits match.", "Add as whole numbers: 842 + 698 = 1540.", "Put the decimal point back, 2 places from the right: 15.40."]},
            {"level": "hard", "q": "A school collected 3,407 bottles in January and 2,183 bottles in February. How many bottles did it collect in all?", "answer": "5,590", "solution": ["\"In all\" means add: 3,407 + 2,183.", "Ones: 7 + 3 = 10. Write 0, carry 1.", "Tens: 0 + 8 + 1 (carried) = 9.", "Hundreds: 4 + 1 = 5.", "Thousands: 3 + 2 = 5.", "Answer: 5,590 bottles."]},
            {"level": "hard", "q": "A farm harvested 6,489 kg of rice in the first season and 2,826 kg in the second season. How many kilograms is that in all?", "answer": "9,315", "solution": ["\"In all\" means add: 6,489 + 2,826.", "Ones: 9 + 6 = 15. Write 5, carry 1.", "Tens: 8 + 2 + 1 (carried) = 11. Write 1, carry 1.", "Hundreds: 4 + 8 + 1 (carried) = 13. Write 3, carry 1.", "Thousands: 6 + 2 + 1 (carried) = 9.", "Answer: 9,315 kg."]},
          ] },
          // Lesson materials shown when the Addition card is clicked. Add `resources` to any other topic to give it the same page.
          resources:[
            { type:'video', staticId:'video-addition' }, // video is written in plain HTML in gen-portal.html
          ],
          focus:[
          'adding two- and three-digit whole numbers', 'adding with carrying (regrouping)',
          'adding decimals', 'finding a missing number in an addition problem', 'simple addition word problems'] },
        { key:'subtraction', title:'Subtraction', sub:'Take numbers away', icon:'\u2212',
          game:{ levels:true, questions:[
            // ---------- EASY (20 questions) ----------
            {"level": "easy", "q": "9 − 4 = ?", "answer": "5", "solution": ["Start at 9.", "Count back 4: 8, 7, 6, 5.", "So 9 − 4 = 5."]},
            {"level": "easy", "q": "15 − 6 = ?", "answer": "9", "solution": ["Take away 5 first: 15 − 5 = 10.", "Take away 1 more: 10 − 1 = 9.", "So 15 − 6 = 9."]},
            {"level": "easy", "q": "48 − 23 = ?", "answer": "25", "solution": ["Subtract the ones: 8 − 3 = 5.", "Subtract the tens: 4 − 2 = 2 tens (20).", "Put them together: 25."]},
            {"level": "easy", "q": "70 − 30 = ?", "answer": "40", "solution": ["7 tens − 3 tens = 4 tens.", "4 tens = 40.", "So 70 − 30 = 40."]},
            {"level": "easy", "q": "Mia has 12 stickers. She gives 5 away. How many stickers does she have left?", "answer": "7", "solution": ["\"Gives away\" means we subtract: 12 − 5.", "12 − 2 = 10, then 3 more makes 7.", "Mia has 7 stickers left."]},
            {"level": "easy", "q": "6 − 1 = ?", "answer": "5", "solution": ["Start at 6.", "Count back 1: 5.", "So 6 − 1 = 5."]},
            {"level": "easy", "q": "5 − 3 = ?", "answer": "2", "solution": ["Start at 5.", "Count back 3: 4, 3, 2.", "So 5 − 3 = 2."]},
            {"level": "easy", "q": "6 − 5 = ?", "answer": "1", "solution": ["Start at 6.", "Count back 5: 5, 4, 3, 2, 1.", "So 6 − 5 = 1."]},
            {"level": "easy", "q": "8 − 6 = ?", "answer": "2", "solution": ["Start at 8.", "Count back 6: 7, 6, 5, 4, 3, 2.", "So 8 − 6 = 2."]},
            {"level": "easy", "q": "14 − 7 = ?", "answer": "7", "solution": ["Take away 4 first to get to 10: 14 − 4 = 10.", "7 − 4 = 3 still to take away.", "10 − 3 = 7."]},
            {"level": "easy", "q": "13 − 9 = ?", "answer": "4", "solution": ["Take away 3 first to get to 10: 13 − 3 = 10.", "9 − 3 = 6 still to take away.", "10 − 6 = 4."]},
            {"level": "easy", "q": "11 − 7 = ?", "answer": "4", "solution": ["Take away 1 first to get to 10: 11 − 1 = 10.", "7 − 1 = 6 still to take away.", "10 − 6 = 4."]},
            {"level": "easy", "q": "65 − 15 = ?", "answer": "50", "solution": ["Subtract the ones: 5 − 5 = 0.", "Subtract the tens: 60 − 10 = 50.", "Put them together: 50."]},
            {"level": "easy", "q": "75 − 35 = ?", "answer": "40", "solution": ["Subtract the ones: 5 − 5 = 0.", "Subtract the tens: 70 − 30 = 40.", "Put them together: 40."]},
            {"level": "easy", "q": "52 − 22 = ?", "answer": "30", "solution": ["Subtract the ones: 2 − 2 = 0.", "Subtract the tens: 50 − 20 = 30.", "Put them together: 30."]},
            {"level": "easy", "q": "48 − 15 = ?", "answer": "33", "solution": ["Subtract the ones: 8 − 5 = 3.", "Subtract the tens: 40 − 10 = 30.", "Put them together: 33."]},
            {"level": "easy", "q": "90 − 80 = ?", "answer": "10", "solution": ["Think in tens: 9 tens − 8 tens = 1 tens.", "1 tens = 10.", "So 90 − 80 = 10."]},
            {"level": "easy", "q": "100 − 50 = ?", "answer": "50", "solution": ["Think in tens: 10 tens − 5 tens = 5 tens.", "5 tens = 50.", "So 100 − 50 = 50."]},
            {"level": "easy", "q": "Eli has 38 cookies and gives 11 away. How many cookies does Eli have left?", "answer": "27", "solution": ["\"Gives away\" means we subtract: 38 − 11.", "Ones: 8 − 1 = 7. Tens: 30 − 10 = 20.", "Answer: 27 cookies left."]},
            {"level": "easy", "q": "Hana has 38 candies and gives 16 away. How many candies does Hana have left?", "answer": "22", "solution": ["\"Gives away\" means we subtract: 38 − 16.", "Ones: 8 − 6 = 2. Tens: 30 − 10 = 20.", "Answer: 22 candies left."]},
            // ---------- MEDIUM (20 questions) ----------
            {"level": "medium", "q": "52 − 27 = ?", "answer": "25", "solution": ["Ones: 2 is smaller than 7, so borrow 1 ten. 12 − 7 = 5.", "Tens: 5 became 4, so 4 − 2 = 2.", "Answer: 25."]},
            {"level": "medium", "q": "304 − 158 = ?", "answer": "146", "solution": ["Ones: 4 is smaller than 8, so we must borrow. The tens digit is 0, so borrow from the hundreds first: 3 hundreds become 2 hundreds and 10 tens, then 1 ten goes to the ones.", "Ones: 14 − 8 = 6. Tens: 9 − 5 = 4. Hundreds: 2 − 1 = 1.", "Answer: 146."]},
            {"level": "medium", "q": "600 − 245 = ?", "answer": "355", "solution": ["Think of 600 as 5 hundreds, 9 tens and 10 ones.", "Ones: 10 − 5 = 5. Tens: 9 − 4 = 5. Hundreds: 5 − 2 = 3.", "Answer: 355."]},
            {"level": "medium", "q": "823 − 467 = ?", "answer": "356", "solution": ["Ones: 3 is smaller than 7, borrow 1 ten: 13 − 7 = 6.", "Tens: 2 became 1, and 1 is smaller than 6, so borrow 1 hundred: 11 − 6 = 5.", "Hundreds: 8 became 7, so 7 − 4 = 3. Answer: 356."]},
            {"level": "medium", "q": "A farm had 450 eggs and sold 168 of them. How many eggs are left?", "answer": "282", "solution": ["\"Sold\" means we subtract: 450 − 168.", "Ones: borrow, 10 − 8 = 2. Tens: 4 is smaller than 6, borrow, 14 − 6 = 8. Hundreds: 3 − 1 = 2.", "Answer: 282 eggs."]},
            {"level": "medium", "q": "93 − 35 = ?", "answer": "58", "solution": ["Ones: 3 is smaller than 5, so borrow 1 from the next place. 13 − 5 = 8.", "Tens: 9 lent 1, so 8 − 3 = 5.", "Answer: 58."]},
            {"level": "medium", "q": "92 − 16 = ?", "answer": "76", "solution": ["Ones: 2 is smaller than 6, so borrow 1 from the next place. 12 − 6 = 6.", "Tens: 9 lent 1, so 8 − 1 = 7.", "Answer: 76."]},
            {"level": "medium", "q": "90 − 19 = ?", "answer": "71", "solution": ["Ones: 0 is smaller than 9, so borrow 1 from the next place. 10 − 9 = 1.", "Tens: 9 lent 1, so 8 − 1 = 7.", "Answer: 71."]},
            {"level": "medium", "q": "42 − 34 = ?", "answer": "8", "solution": ["Ones: 2 is smaller than 4, so borrow 1 from the next place. 12 − 4 = 8.", "Tens: 4 lent 1, so 3 − 3 = 0.", "Answer: 8."]},
            {"level": "medium", "q": "824 − 127 = ?", "answer": "697", "solution": ["Ones: 4 is smaller than 7, so borrow 1 from the next place. 14 − 7 = 7.", "Tens: 1 is smaller than 2, so borrow 1 from the next place. 11 − 2 = 9.", "Hundreds: 8 lent 1, so 7 − 1 = 6.", "Answer: 697."]},
            {"level": "medium", "q": "602 − 266 = ?", "answer": "336", "solution": ["Ones: 2 is smaller than 6, so borrow 1 from the next place. 12 − 6 = 6.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 6 = 3.", "Hundreds: 6 lent 1, so 5 − 2 = 3.", "Answer: 336."]},
            {"level": "medium", "q": "611 − 233 = ?", "answer": "378", "solution": ["Ones: 1 is smaller than 3, so borrow 1 from the next place. 11 − 3 = 8.", "Tens: 0 is smaller than 3, so borrow 1 from the next place. 10 − 3 = 7.", "Hundreds: 6 lent 1, so 5 − 2 = 3.", "Answer: 378."]},
            {"level": "medium", "q": "742 − 173 = ?", "answer": "569", "solution": ["Ones: 2 is smaller than 3, so borrow 1 from the next place. 12 − 3 = 9.", "Tens: 3 is smaller than 7, so borrow 1 from the next place. 13 − 7 = 6.", "Hundreds: 7 lent 1, so 6 − 1 = 5.", "Answer: 569."]},
            {"level": "medium", "q": "800 − 161 = ?", "answer": "639", "solution": ["Ones: 0 is smaller than 1, so borrow 1 from the next place. 10 − 1 = 9.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 6 = 3.", "Hundreds: 8 lent 1, so 7 − 1 = 6.", "Answer: 639."]},
            {"level": "medium", "q": "600 − 178 = ?", "answer": "422", "solution": ["Ones: 0 is smaller than 8, so borrow 1 from the next place. 10 − 8 = 2.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 7 = 2.", "Hundreds: 6 lent 1, so 5 − 1 = 4.", "Answer: 422."]},
            {"level": "medium", "q": "800 − 302 = ?", "answer": "498", "solution": ["Ones: 0 is smaller than 2, so borrow 1 from the next place. 10 − 2 = 8.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 0 = 9.", "Hundreds: 8 lent 1, so 7 − 3 = 4.", "Answer: 498."]},
            {"level": "medium", "q": "A school had 871 chairs and moved 156 to another room. How many chairs are left?", "answer": "715", "solution": ["\"Left\" tells us to subtract: 871 − 156.", "Ones: 1 is smaller than 6, so borrow 1 from the next place. 11 − 6 = 5.", "Tens: 7 lent 1, so 6 − 5 = 1.", "Hundreds: 8 − 1 = 7.", "Answer: 715 chairs."]},
            {"level": "medium", "q": "A truck carried 896 boxes and unloaded 479 of them. How many boxes are still on the truck?", "answer": "417", "solution": ["\"Left\" tells us to subtract: 896 − 479.", "Ones: 6 is smaller than 9, so borrow 1 from the next place. 16 − 9 = 7.", "Tens: 9 lent 1, so 8 − 7 = 1.", "Hundreds: 8 − 4 = 4.", "Answer: 417 boxes."]},
            {"level": "medium", "q": "A shop had 342 shirts and sold 283 of them. How many shirts are left?", "answer": "59", "solution": ["\"Left\" tells us to subtract: 342 − 283.", "Ones: 2 is smaller than 3, so borrow 1 from the next place. 12 − 3 = 9.", "Tens: 3 is smaller than 8, so borrow 1 from the next place. 13 − 8 = 5.", "Hundreds: 3 lent 1, so 2 − 2 = 0.", "Answer: 59 shirts."]},
            {"level": "medium", "q": "A farm had 351 eggs and sold 162 of them. How many eggs are left?", "answer": "189", "solution": ["\"Left\" tells us to subtract: 351 − 162.", "Ones: 1 is smaller than 2, so borrow 1 from the next place. 11 − 2 = 9.", "Tens: 4 is smaller than 6, so borrow 1 from the next place. 14 − 6 = 8.", "Hundreds: 3 lent 1, so 2 − 1 = 1.", "Answer: 189 eggs."]},
            // ---------- HARD (20 questions) ----------
            {"level": "hard", "q": "5,002 − 2,874 = ?", "answer": "2,128", "solution": ["Borrow across the zeros: 5,002 becomes 4 thousands, 9 hundreds, 9 tens and 12 ones.", "Ones: 12 − 4 = 8. Tens: 9 − 7 = 2. Hundreds: 9 − 8 = 1.", "Thousands: 4 − 2 = 2. Answer: 2,128."]},
            {"level": "hard", "q": "8 − 15 = ?", "answer": "−7", "solution": ["Start at 8 on the number line.", "Move 15 steps to the left. 8 steps reach 0.", "7 more steps take you to −7."]},
            {"level": "hard", "q": "−6 − 9 = ?", "answer": "−15", "solution": ["Subtracting 9 means moving 9 steps to the left of −6.", "You keep going in the negative direction, so add the sizes: 6 + 9 = 15.", "Answer: −15."]},
            {"level": "hard", "q": "10,000 − 3,456 = ?", "answer": "6,544", "solution": ["Use 9,999 − 3,456 first, then add 1.", "9,999 − 3,456: 9−3 = 6, 9−4 = 5, 9−5 = 4, 9−6 = 3, which gives 6,543.", "6,543 + 1 = 6,544. Answer: 6,544."]},
            {"level": "hard", "q": "A library had 12,500 books. It lent out 4,875 books, and then 2,300 more. How many books are left?", "answer": "5,325", "solution": ["Subtract the first loan: 12,500 − 4,875 = 7,625.", "Subtract the second loan: 7,625 − 2,300 = 5,325.", "Answer: 5,325 books."]},
            {"level": "hard", "q": "4,000 − 2,069 = ?", "answer": "1,931", "solution": ["Ones: 0 is smaller than 9, so borrow 1 from the next place. 10 − 9 = 1.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 6 = 3.", "Hundreds: this place gave 1 to the right, so we borrow again. 9 − 0 = 9.", "Thousands: 4 lent 1, so 3 − 2 = 1.", "Answer: 1,931."]},
            {"level": "hard", "q": "6,004 − 3,495 = ?", "answer": "2,509", "solution": ["Ones: 4 is smaller than 5, so borrow 1 from the next place. 14 − 5 = 9.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 9 = 0.", "Hundreds: this place gave 1 to the right, so we borrow again. 9 − 4 = 5.", "Thousands: 6 lent 1, so 5 − 3 = 2.", "Answer: 2,509."]},
            {"level": "hard", "q": "7,003 − 1,865 = ?", "answer": "5,138", "solution": ["Ones: 3 is smaller than 5, so borrow 1 from the next place. 13 − 5 = 8.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 6 = 3.", "Hundreds: this place gave 1 to the right, so we borrow again. 9 − 8 = 1.", "Thousands: 7 lent 1, so 6 − 1 = 5.", "Answer: 5,138."]},
            {"level": "hard", "q": "8,006 − 2,608 = ?", "answer": "5,398", "solution": ["Ones: 6 is smaller than 8, so borrow 1 from the next place. 16 − 8 = 8.", "Tens: this place gave 1 to the right, so we borrow again. 9 − 0 = 9.", "Hundreds: this place gave 1 to the right, so we borrow again. 9 − 6 = 3.", "Thousands: 8 lent 1, so 7 − 2 = 5.", "Answer: 5,398."]},
            {"level": "hard", "q": "13 − 19 = ?", "answer": "−6", "solution": ["Start at 13 on the number line.", "Move 19 steps to the left. 13 steps reach 0.", "6 more steps take you to −6."]},
            {"level": "hard", "q": "9 − 15 = ?", "answer": "−6", "solution": ["Start at 9 on the number line.", "Move 15 steps to the left. 9 steps reach 0.", "6 more steps take you to −6."]},
            {"level": "hard", "q": "5 − 9 = ?", "answer": "−4", "solution": ["Start at 5 on the number line.", "Move 9 steps to the left. 5 steps reach 0.", "4 more steps take you to −4."]},
            {"level": "hard", "q": "−3 − 11 = ?", "answer": "−14", "solution": ["Subtracting 11 means moving 11 steps to the left of −3.", "You keep going in the negative direction, so add the sizes: 3 + 11 = 14.", "Answer: −14."]},
            {"level": "hard", "q": "−5 − 8 = ?", "answer": "−13", "solution": ["Subtracting 8 means moving 8 steps to the left of −5.", "You keep going in the negative direction, so add the sizes: 5 + 8 = 13.", "Answer: −13."]},
            {"level": "hard", "q": "9,000 − 4,150 − 2,730 = ?", "answer": "2,120", "solution": ["Subtract the first number: 9,000 − 4,150 = 4,850.", "Subtract the second number: 4,850 − 2,730 = 2,120.", "Answer: 2,120."]},
            {"level": "hard", "q": "11,000 − 1,225 − 1,950 = ?", "answer": "7,825", "solution": ["Subtract the first number: 11,000 − 1,225 = 9,775.", "Subtract the second number: 9,775 − 1,950 = 7,825.", "Answer: 7,825."]},
            {"level": "hard", "q": "6.16 − 2.34 = ?", "answer": "3.82", "solution": ["Line up the decimal points so the digits match.", "Subtract as whole numbers: 616 − 234 = 382.", "Put the decimal point back, 2 places from the right: 3.82."]},
            {"level": "hard", "q": "8.43 − 4.50 = ?", "answer": "3.93", "solution": ["Line up the decimal points so the digits match.", "Subtract as whole numbers: 843 − 450 = 393.", "Put the decimal point back, 2 places from the right: 3.93."]},
            {"level": "hard", "q": "A school had 19,500 books. It gave away 4,120 books in June and 2,300 books in July. How many books are left?", "answer": "13,080", "solution": ["Subtract the first amount: 19,500 − 4,120 = 15,380.", "Subtract the second amount: 15,380 − 2,300 = 13,080.", "Answer: 13,080 books."]},
            {"level": "hard", "q": "A farm stored 18,500 kg of rice. It sold 4,605 kg on Monday and 1,500 kg on Tuesday. How many kilograms are left?", "answer": "12,395", "solution": ["Subtract the first amount: 18,500 − 4,605 = 13,895.", "Subtract the second amount: 13,895 − 1,500 = 12,395.", "Answer: 12,395 kg."]},
          ] },
          resources:[
            { type:'video', staticId:'video-subtraction' }, // video is written in plain HTML in gen-portal.html
          ], focus:[
          'subtracting two- and three-digit whole numbers', 'subtracting with borrowing (regrouping)',
          'subtracting decimals', 'finding a missing number in a subtraction problem', 'simple subtraction word problems'] },
        { key:'multiplication', title:'Multiplication', sub:'Repeated addition', icon:'\u00D7',
          game:{ levels:true, questions:[
            // ---------- EASY (20 questions) ----------
            {"level": "easy", "q": "3 × 4 = ?", "answer": "12", "solution": ["3 groups of 4 is 4 + 4 + 4.", "4 + 4 = 8, and 8 + 4 = 12.", "So 3 × 4 = 12."]},
            {"level": "easy", "q": "5 × 6 = ?", "answer": "30", "solution": ["Count by 5s six times: 5, 10, 15, 20, 25, 30.", "So 5 × 6 = 30."]},
            {"level": "easy", "q": "7 × 2 = ?", "answer": "14", "solution": ["Multiplying by 2 means doubling.", "Double 7: 7 + 7 = 14.", "So 7 × 2 = 14."]},
            {"level": "easy", "q": "10 × 8 = ?", "answer": "80", "solution": ["Multiplying by 10 puts a zero on the end.", "8 with a zero on the end is 80.", "So 10 × 8 = 80."]},
            {"level": "easy", "q": "There are 4 bags with 5 oranges in each bag. How many oranges are there in all?", "answer": "20", "solution": ["4 bags with 5 oranges each: 4 × 5.", "5 + 5 + 5 + 5 = 20.", "There are 20 oranges."]},
            {"level": "easy", "q": "3 × 8 = ?", "answer": "24", "solution": ["3 groups of 8 is 8 + 8 + 8.", "Add them up to get 24.", "So 3 × 8 = 24."]},
            {"level": "easy", "q": "2 × 6 = ?", "answer": "12", "solution": ["2 groups of 6 is 6 + 6.", "Add them up to get 12.", "So 2 × 6 = 12."]},
            {"level": "easy", "q": "2 × 7 = ?", "answer": "14", "solution": ["2 groups of 7 is 7 + 7.", "Add them up to get 14.", "So 2 × 7 = 14."]},
            {"level": "easy", "q": "4 × 4 = ?", "answer": "16", "solution": ["4 groups of 4 is 4 + 4 + 4 + 4.", "Add them up to get 16.", "So 4 × 4 = 16."]},
            {"level": "easy", "q": "7 × 3 = ?", "answer": "21", "solution": ["Use the 7 times table.", "Count by 7s: 7, 14, 21.", "So 7 × 3 = 21."]},
            {"level": "easy", "q": "9 × 4 = ?", "answer": "36", "solution": ["Use the 9 times table.", "Count by 9s: 9, 18, 27, 36.", "So 9 × 4 = 36."]},
            {"level": "easy", "q": "6 × 7 = ?", "answer": "42", "solution": ["Use the 6 times table.", "Count by 6s: 6, 12, 18, 24, 30, 36, 42.", "So 6 × 7 = 42."]},
            {"level": "easy", "q": "9 × 3 = ?", "answer": "27", "solution": ["Use the 9 times table.", "Count by 9s: 9, 18, 27.", "So 9 × 3 = 27."]},
            {"level": "easy", "q": "10 × 10 = ?", "answer": "100", "solution": ["Multiplying by 10 puts a zero on the end.", "10 with a zero on the end is 100.", "So 10 × 10 = 100."]},
            {"level": "easy", "q": "12 × 10 = ?", "answer": "120", "solution": ["Multiplying by 10 puts a zero on the end.", "12 with a zero on the end is 120.", "So 12 × 10 = 120."]},
            {"level": "easy", "q": "What is double 14?", "answer": "28", "solution": ["Double means multiply by 2.", "14 + 14 = 28.", "So double 14 is 28."]},
            {"level": "easy", "q": "What is double 25?", "answer": "50", "solution": ["Double means multiply by 2.", "25 + 25 = 50.", "So double 25 is 50."]},
            {"level": "easy", "q": "There are 6 bags with 5 books in each bag. How many books are there in all?", "answer": "30", "solution": ["6 bags with 5 books each: 6 × 5.", "Count by 5s: 5, 10, 15, 20, 25, 30.", "There are 30 books."]},
            {"level": "easy", "q": "There are 7 bags with 3 shells in each bag. How many shells are there in all?", "answer": "21", "solution": ["7 bags with 3 shells each: 7 × 3.", "Count by 3s: 3, 6, 9, 12, 15, 18, 21.", "There are 21 shells."]},
            {"level": "easy", "q": "There are 5 bags with 3 cookies in each bag. How many cookies are there in all?", "answer": "15", "solution": ["5 bags with 3 cookies each: 5 × 3.", "Count by 3s: 3, 6, 9, 12, 15.", "There are 15 cookies."]},
            // ---------- MEDIUM (20 questions) ----------
            {"level": "medium", "q": "12 × 7 = ?", "answer": "84", "solution": ["Split 12 into 10 + 2.", "10 × 7 = 70 and 2 × 7 = 14.", "70 + 14 = 84."]},
            {"level": "medium", "q": "23 × 4 = ?", "answer": "92", "solution": ["Split 23 into 20 + 3.", "20 × 4 = 80 and 3 × 4 = 12.", "80 + 12 = 92."]},
            {"level": "medium", "q": "34 × 6 = ?", "answer": "204", "solution": ["Split 34 into 30 + 4.", "30 × 6 = 180 and 4 × 6 = 24.", "180 + 24 = 204."]},
            {"level": "medium", "q": "45 × 12 = ?", "answer": "540", "solution": ["Split 12 into 10 + 2.", "45 × 10 = 450 and 45 × 2 = 90.", "450 + 90 = 540."]},
            {"level": "medium", "q": "A box holds 24 pencils. How many pencils are in 9 boxes?", "answer": "216", "solution": ["9 boxes of 24 pencils: 24 × 9.", "20 × 9 = 180 and 4 × 9 = 36.", "180 + 36 = 216 pencils."]},
            {"level": "medium", "q": "32 × 8 = ?", "answer": "256", "solution": ["Split 32 into 30 + 2.", "30 × 8 = 240; 2 × 8 = 16.", "240 + 16 = 256."]},
            {"level": "medium", "q": "21 × 5 = ?", "answer": "105", "solution": ["Split 21 into 20 + 1.", "20 × 5 = 100; 1 × 5 = 5.", "100 + 5 = 105."]},
            {"level": "medium", "q": "25 × 8 = ?", "answer": "200", "solution": ["Split 25 into 20 + 5.", "20 × 8 = 160; 5 × 8 = 40.", "160 + 40 = 200."]},
            {"level": "medium", "q": "40 × 5 = ?", "answer": "200", "solution": ["Split 40 into 40.", "40 × 5 = 200.", "200 = 200."]},
            {"level": "medium", "q": "47 × 6 = ?", "answer": "282", "solution": ["Split 47 into 40 + 7.", "40 × 6 = 240; 7 × 6 = 42.", "240 + 42 = 282."]},
            {"level": "medium", "q": "42 × 15 = ?", "answer": "630", "solution": ["Split 15 into 10 + 5.", "42 × 10 = 420 and 42 × 5 = 210.", "420 + 210 = 630."]},
            {"level": "medium", "q": "21 × 12 = ?", "answer": "252", "solution": ["Split 12 into 10 + 2.", "21 × 10 = 210 and 21 × 2 = 42.", "210 + 42 = 252."]},
            {"level": "medium", "q": "12 × 15 = ?", "answer": "180", "solution": ["Split 15 into 10 + 5.", "12 × 10 = 120 and 12 × 5 = 60.", "120 + 60 = 180."]},
            {"level": "medium", "q": "141 × 3 = ?", "answer": "423", "solution": ["Split 141 into 100 + 40 + 1.", "100 × 3 = 300; 40 × 3 = 120; 1 × 3 = 3.", "300 + 120 + 3 = 423."]},
            {"level": "medium", "q": "276 × 8 = ?", "answer": "2,208", "solution": ["Split 276 into 200 + 70 + 6.", "200 × 8 = 1,600; 70 × 8 = 560; 6 × 8 = 48.", "1,600 + 560 + 48 = 2,208."]},
            {"level": "medium", "q": "380 × 6 = ?", "answer": "2,280", "solution": ["Split 380 into 300 + 80.", "300 × 6 = 1,800; 80 × 6 = 480.", "1,800 + 480 = 2,280."]},
            {"level": "medium", "q": "A bus can carry 33 students. How many students can 5 buses carry?", "answer": "165", "solution": ["Multiply the amount in one group by the number of groups: 33 × 5.", "Split 33 into 30 + 3.", "30 × 5 = 150; 3 × 5 = 15.", "Answer: 165 students."]},
            {"level": "medium", "q": "A bus can carry 18 students. How many students can 9 buses carry?", "answer": "162", "solution": ["Multiply the amount in one group by the number of groups: 18 × 9.", "Split 18 into 10 + 8.", "10 × 9 = 90; 8 × 9 = 72.", "Answer: 162 students."]},
            {"level": "medium", "q": "A bus can carry 13 students. How many students can 5 buses carry?", "answer": "65", "solution": ["Multiply the amount in one group by the number of groups: 13 × 5.", "Split 13 into 10 + 3.", "10 × 5 = 50; 3 × 5 = 15.", "Answer: 65 students."]},
            {"level": "medium", "q": "A box holds 21 pencils. How many pencils are in 5 boxes?", "answer": "105", "solution": ["Multiply the amount in one group by the number of groups: 21 × 5.", "Split 21 into 20 + 1.", "20 × 5 = 100; 1 × 5 = 5.", "Answer: 105 pencils."]},
            // ---------- HARD (20 questions) ----------
            {"level": "hard", "q": "123 × 45 = ?", "answer": "5,535", "solution": ["Split 45 into 40 + 5.", "123 × 40 = 4,920 and 123 × 5 = 615.", "4,920 + 615 = 5,535."]},
            {"level": "hard", "q": "346 × 28 = ?", "answer": "9,688", "solution": ["Split 28 into 20 + 8.", "346 × 20 = 6,920 and 346 × 8 = 2,768.", "6,920 + 2,768 = 9,688."]},
            {"level": "hard", "q": "−7 × 6 = ?", "answer": "−42", "solution": ["Multiply the sizes first: 7 × 6 = 42.", "A negative times a positive is negative.", "Answer: −42."]},
            {"level": "hard", "q": "1,205 × 13 = ?", "answer": "15,665", "solution": ["Split 13 into 10 + 3.", "1,205 × 10 = 12,050 and 1,205 × 3 = 3,615.", "12,050 + 3,615 = 15,665."]},
            {"level": "hard", "q": "A bus carries 48 passengers on each trip. How many passengers does it carry in 125 trips?", "answer": "6,000", "solution": ["One trip carries 48 passengers, so multiply: 48 × 125.", "125 × 48 = 125 × 50 − 125 × 2 = 6,250 − 250.", "6,250 − 250 = 6,000 passengers."]},
            {"level": "hard", "q": "139 × 15 = ?", "answer": "2,085", "solution": ["Split 15 into 10 + 5.", "139 × 10 = 1,390 and 139 × 5 = 695.", "1,390 + 695 = 2,085."]},
            {"level": "hard", "q": "154 × 27 = ?", "answer": "4,158", "solution": ["Split 27 into 20 + 7.", "154 × 20 = 3,080 and 154 × 7 = 1,078.", "3,080 + 1,078 = 4,158."]},
            {"level": "hard", "q": "169 × 47 = ?", "answer": "7,943", "solution": ["Split 47 into 40 + 7.", "169 × 40 = 6,760 and 169 × 7 = 1,183.", "6,760 + 1,183 = 7,943."]},
            {"level": "hard", "q": "462 × 28 = ?", "answer": "12,936", "solution": ["Split 28 into 20 + 8.", "462 × 20 = 9,240 and 462 × 8 = 3,696.", "9,240 + 3,696 = 12,936."]},
            {"level": "hard", "q": "1,791 × 4 = ?", "answer": "7,164", "solution": ["Split 1,791 into 1,000 + 700 + 90 + 1.", "1,000 × 4 = 4,000; 700 × 4 = 2,800; 90 × 4 = 360; 1 × 4 = 4.", "4,000 + 2,800 + 360 + 4 = 7,164."]},
            {"level": "hard", "q": "4,271 × 8 = ?", "answer": "34,168", "solution": ["Split 4,271 into 4,000 + 200 + 70 + 1.", "4,000 × 8 = 32,000; 200 × 8 = 1,600; 70 × 8 = 560; 1 × 8 = 8.", "32,000 + 1,600 + 560 + 8 = 34,168."]},
            {"level": "hard", "q": "−3 × 5 = ?", "answer": "−15", "solution": ["Multiply the sizes first: 3 × 5 = 15.", "A negative times a positive is negative.", "Answer: −15."]},
            {"level": "hard", "q": "−15 × 9 = ?", "answer": "−135", "solution": ["Multiply the sizes first: 15 × 9 = 135.", "A negative times a positive is negative.", "Answer: −135."]},
            {"level": "hard", "q": "−7 × (−12) = ?", "answer": "84", "solution": ["Multiply the sizes first: 7 × 12 = 84.", "A negative times a negative is positive.", "Answer: 84."]},
            {"level": "hard", "q": "55 × 45 = ?", "answer": "2,475", "solution": ["Split 45 into 40 + 5.", "55 × 40 = 2,200 and 55 × 5 = 275.", "2,200 + 275 = 2,475."]},
            {"level": "hard", "q": "66 × 88 = ?", "answer": "5,808", "solution": ["Split 88 into 80 + 8.", "66 × 80 = 5,280 and 66 × 8 = 528.", "5,280 + 528 = 5,808."]},
            {"level": "hard", "q": "A cinema has 451 seats in each hall. How many seats are in 19 halls?", "answer": "8,569", "solution": ["Multiply: 451 × 19.", "Split 19 into 10 + 9.", "451 × 10 = 4,510 and 451 × 9 = 4,059.", "Answer: 8,569 seats."]},
            {"level": "hard", "q": "A factory makes 368 toys every day. How many toys does it make in 17 days?", "answer": "6,256", "solution": ["Multiply: 368 × 17.", "Split 17 into 10 + 7.", "368 × 10 = 3,680 and 368 × 7 = 2,576.", "Answer: 6,256 toys."]},
            {"level": "hard", "q": "A cinema has 184 seats in each hall. How many seats are in 38 halls?", "answer": "6,992", "solution": ["Multiply: 184 × 38.", "Split 38 into 30 + 8.", "184 × 30 = 5,520 and 184 × 8 = 1,472.", "Answer: 6,992 seats."]},
            {"level": "hard", "q": "A bus carries 232 passengers on each trip. How many passengers does it carry in 22 trips?", "answer": "5,104", "solution": ["Multiply: 232 × 22.", "Split 22 into 20 + 2.", "232 × 20 = 4,640 and 232 × 2 = 464.", "Answer: 5,104 passengers."]},
          ] },
          resources:[
            { type:'video', staticId:'video-multiplication' }, // videos are written in plain HTML in gen-portal.html
          ], focus:[
          'multiplication facts up to 12 x 12', 'multiplying multi-digit numbers by one digit',
          'multiplying decimals by whole numbers', 'multiples of a number', 'simple multiplication word problems'] },
        { key:'division', title:'Division', sub:'Share equally', icon:'\u00F7',
          game:{ levels:true, questions:[
            // ---------- EASY (20 questions) ----------
            {"level": "easy", "q": "12 ÷ 3 = ?", "answer": "4", "solution": ["Share 12 equally into 3 groups.", "Each group gets 4, because 3 × 4 = 12.", "So 12 ÷ 3 = 4."]},
            {"level": "easy", "q": "20 ÷ 5 = ?", "answer": "4", "solution": ["Ask: 5 times what number is 20?", "5 × 4 = 20.", "So 20 ÷ 5 = 4."]},
            {"level": "easy", "q": "18 ÷ 2 = ?", "answer": "9", "solution": ["Dividing by 2 means halving.", "Half of 18 is 9.", "So 18 ÷ 2 = 9."]},
            {"level": "easy", "q": "36 ÷ 6 = ?", "answer": "6", "solution": ["Think of the 6 times table: 6 × 6 = 36.", "So 36 ÷ 6 = 6."]},
            {"level": "easy", "q": "15 candies are shared equally among 3 children. How many candies does each child get?", "answer": "5", "solution": ["Share 15 candies equally among 3 children: 15 ÷ 3.", "3 × 5 = 15.", "Each child gets 5 candies."]},
            {"level": "easy", "q": "15 ÷ 3 = ?", "answer": "5", "solution": ["Ask: 3 times what number is 15?", "3 × 5 = 15.", "So 15 ÷ 3 = 5."]},
            {"level": "easy", "q": "32 ÷ 8 = ?", "answer": "4", "solution": ["Ask: 8 times what number is 32?", "8 × 4 = 32.", "So 32 ÷ 8 = 4."]},
            {"level": "easy", "q": "56 ÷ 8 = ?", "answer": "7", "solution": ["Ask: 8 times what number is 56?", "8 × 7 = 56.", "So 56 ÷ 8 = 7."]},
            {"level": "easy", "q": "12 ÷ 4 = ?", "answer": "3", "solution": ["Ask: 4 times what number is 12?", "4 × 3 = 12.", "So 12 ÷ 4 = 3."]},
            {"level": "easy", "q": "24 ÷ 8 = ?", "answer": "3", "solution": ["Ask: 8 times what number is 24?", "8 × 3 = 24.", "So 24 ÷ 8 = 3."]},
            {"level": "easy", "q": "25 ÷ 5 = ?", "answer": "5", "solution": ["Ask: 5 times what number is 25?", "5 × 5 = 25.", "So 25 ÷ 5 = 5."]},
            {"level": "easy", "q": "18 ÷ 9 = ?", "answer": "2", "solution": ["Ask: 9 times what number is 18?", "9 × 2 = 18.", "So 18 ÷ 9 = 2."]},
            {"level": "easy", "q": "12 ÷ 2 = ?", "answer": "6", "solution": ["Ask: 2 times what number is 12?", "2 × 6 = 12.", "So 12 ÷ 2 = 6."]},
            {"level": "easy", "q": "40 ÷ 10 = ?", "answer": "4", "solution": ["Dividing by 10 takes a zero off the end.", "40 without its zero is 4.", "So 40 ÷ 10 = 4."]},
            {"level": "easy", "q": "30 ÷ 10 = ?", "answer": "3", "solution": ["Dividing by 10 takes a zero off the end.", "30 without its zero is 3.", "So 30 ÷ 10 = 3."]},
            {"level": "easy", "q": "What is half of 60?", "answer": "30", "solution": ["Half means divide by 2.", "30 + 30 = 60, so each half is 30.", "Half of 60 is 30."]},
            {"level": "easy", "q": "What is half of 34?", "answer": "17", "solution": ["Half means divide by 2.", "17 + 17 = 34, so each half is 17.", "Half of 34 is 17."]},
            {"level": "easy", "q": "16 pencils are shared equally among 2 children. How many pencils does each child get?", "answer": "8", "solution": ["Share equally: 16 ÷ 2.", "2 × 8 = 16.", "Each child gets 8 pencils."]},
            {"level": "easy", "q": "20 balloons are shared equally among 4 children. How many balloons does each child get?", "answer": "5", "solution": ["Share equally: 20 ÷ 4.", "4 × 5 = 20.", "Each child gets 5 balloons."]},
            {"level": "easy", "q": "36 cookies are shared equally among 6 children. How many cookies does each child get?", "answer": "6", "solution": ["Share equally: 36 ÷ 6.", "6 × 6 = 36.", "Each child gets 6 cookies."]},
            // ---------- MEDIUM (20 questions) ----------
            {"level": "medium", "q": "84 ÷ 4 = ?", "answer": "21", "solution": ["Split 84 into 80 + 4.", "80 ÷ 4 = 20 and 4 ÷ 4 = 1.", "20 + 1 = 21."]},
            {"level": "medium", "q": "156 ÷ 12 = ?", "answer": "13", "solution": ["Ask: 12 times what number is 156?", "12 × 10 = 120, and 156 − 120 = 36, which is 12 × 3.", "10 + 3 = 13."]},
            {"level": "medium", "q": "225 ÷ 15 = ?", "answer": "15", "solution": ["15 × 10 = 150, and 225 − 150 = 75.", "75 ÷ 15 = 5, because 15 × 5 = 75.", "10 + 5 = 15."]},
            {"level": "medium", "q": "408 ÷ 6 = ?", "answer": "68", "solution": ["Split 408 into 360 + 48.", "360 ÷ 6 = 60 and 48 ÷ 6 = 8.", "60 + 8 = 68."]},
            {"level": "medium", "q": "192 students are split into 8 equal groups. How many students are in each group?", "answer": "24", "solution": ["192 students into 8 equal groups: 192 ÷ 8.", "160 ÷ 8 = 20 and 32 ÷ 8 = 4.", "20 + 4 = 24 students in each group."]},
            {"level": "medium", "q": "232 ÷ 8 = ?", "answer": "29", "solution": ["Ask: 8 times what number gives 232? Build it in chunks.", "8 × 20 = 160; 8 × 9 = 72.", "160 + 72 = 232, so the chunks 20 + 9 give 29."]},
            {"level": "medium", "q": "168 ÷ 7 = ?", "answer": "24", "solution": ["Ask: 7 times what number gives 168? Build it in chunks.", "7 × 20 = 140; 7 × 4 = 28.", "140 + 28 = 168, so the chunks 20 + 4 give 24."]},
            {"level": "medium", "q": "130 ÷ 5 = ?", "answer": "26", "solution": ["Ask: 5 times what number gives 130? Build it in chunks.", "5 × 20 = 100; 5 × 6 = 30.", "100 + 30 = 130, so the chunks 20 + 6 give 26."]},
            {"level": "medium", "q": "85 ÷ 5 = ?", "answer": "17", "solution": ["Ask: 5 times what number gives 85? Build it in chunks.", "5 × 10 = 50; 5 × 7 = 35.", "50 + 35 = 85, so the chunks 10 + 7 give 17."]},
            {"level": "medium", "q": "324 ÷ 9 = ?", "answer": "36", "solution": ["Ask: 9 times what number gives 324? Build it in chunks.", "9 × 30 = 270; 9 × 6 = 54.", "270 + 54 = 324, so the chunks 30 + 6 give 36."]},
            {"level": "medium", "q": "372 ÷ 4 = ?", "answer": "93", "solution": ["Ask: 4 times what number gives 372? Build it in chunks.", "4 × 90 = 360; 4 × 3 = 12.", "360 + 12 = 372, so the chunks 90 + 3 give 93."]},
            {"level": "medium", "q": "266 ÷ 7 = ?", "answer": "38", "solution": ["Ask: 7 times what number gives 266? Build it in chunks.", "7 × 30 = 210; 7 × 8 = 56.", "210 + 56 = 266, so the chunks 30 + 8 give 38."]},
            {"level": "medium", "q": "114 ÷ 19 = ?", "answer": "6", "solution": ["Ask: 19 times what number gives 114? Build it in chunks.", "19 × 6 = 114.", "114 = 114, so the chunks 6 give 6."]},
            {"level": "medium", "q": "55 ÷ 11 = ?", "answer": "5", "solution": ["Ask: 11 times what number is 55?", "11 × 5 = 55.", "So 55 ÷ 11 = 5."]},
            {"level": "medium", "q": "33 ÷ 11 = ?", "answer": "3", "solution": ["Ask: 11 times what number is 33?", "11 × 3 = 33.", "So 33 ÷ 11 = 3."]},
            {"level": "medium", "q": "A ribbon 440 cm long is cut into 10 equal pieces. How long is each piece, in cm?", "answer": "44", "solution": ["Share equally: 440 ÷ 10.", "10 × 40 = 400; 10 × 4 = 40.", "400 + 40 = 440, so the chunks 40 + 4 give 44.", "Answer: 44 cm each."]},
            {"level": "medium", "q": "57 students are split into 3 equal groups. How many students are in each group?", "answer": "19", "solution": ["Share equally: 57 ÷ 3.", "3 × 10 = 30; 3 × 9 = 27.", "30 + 27 = 57, so the chunks 10 + 9 give 19.", "Answer: 19 students in each group."]},
            {"level": "medium", "q": "200 pesos are shared equally among 5 friends. How many pesos does each friend get?", "answer": "40", "solution": ["Share equally: 200 ÷ 5.", "5 × 40 = 200.", "200 = 200, so the chunks 40 give 40.", "Answer: 40 pesos each."]},
            {"level": "medium", "q": "A ribbon 168 cm long is cut into 4 equal pieces. How long is each piece, in cm?", "answer": "42", "solution": ["Share equally: 168 ÷ 4.", "4 × 40 = 160; 4 × 2 = 8.", "160 + 8 = 168, so the chunks 40 + 2 give 42.", "Answer: 42 cm each."]},
            {"level": "medium", "q": "350 pencils are packed equally into 10 boxes. How many pencils are in each box?", "answer": "35", "solution": ["Share equally: 350 ÷ 10.", "10 × 30 = 300; 10 × 5 = 50.", "300 + 50 = 350, so the chunks 30 + 5 give 35.", "Answer: 35 pencils in each box."]},
            // ---------- HARD (20 questions) ----------
            {"level": "hard", "q": "1,764 ÷ 42 = ?", "answer": "42", "solution": ["Ask: 42 times what number is 1,764?", "42 × 40 = 1,680, and 1,764 − 1,680 = 84, which is 42 × 2.", "40 + 2 = 42."]},
            {"level": "hard", "q": "3,625 ÷ 25 = ?", "answer": "145", "solution": ["Dividing by 25 is the same as multiplying by 4 and then dividing by 100.", "3,625 × 4 = 14,500.", "14,500 ÷ 100 = 145."]},
            {"level": "hard", "q": "−72 ÷ 9 = ?", "answer": "−8", "solution": ["Divide the sizes first: 72 ÷ 9 = 8.", "A negative divided by a positive is negative.", "Answer: −8."]},
            {"level": "hard", "q": "7,560 ÷ 18 = ?", "answer": "420", "solution": ["Split the divisor: 7,560 ÷ 18 = (7,560 ÷ 2) ÷ 9.", "7,560 ÷ 2 = 3,780.", "3,780 ÷ 9 = 420."]},
            {"level": "hard", "q": "A factory packs 4,800 bottles into boxes of 24 bottles each. How many boxes does it fill?", "answer": "200", "solution": ["Boxes needed = 4,800 ÷ 24.", "24 × 100 = 2,400, so 24 × 200 = 4,800.", "The factory fills 200 boxes."]},
            {"level": "hard", "q": "697 ÷ 41 = ?", "answer": "17", "solution": ["Ask: 41 times what number gives 697? Build it in chunks.", "41 × 10 = 410; 41 × 7 = 287.", "410 + 287 = 697, so the chunks 10 + 7 give 17."]},
            {"level": "hard", "q": "200 ÷ 25 = ?", "answer": "8", "solution": ["Ask: 25 times what number gives 200? Build it in chunks.", "25 × 8 = 200.", "200 = 200, so the chunks 8 give 8."]},
            {"level": "hard", "q": "476 ÷ 28 = ?", "answer": "17", "solution": ["Ask: 28 times what number gives 476? Build it in chunks.", "28 × 10 = 280; 28 × 7 = 196.", "280 + 196 = 476, so the chunks 10 + 7 give 17."]},
            {"level": "hard", "q": "2,184 ÷ 21 = ?", "answer": "104", "solution": ["Ask: 21 times what number gives 2,184? Build it in chunks.", "21 × 100 = 2,100; 21 × 4 = 84.", "2,100 + 84 = 2,184, so the chunks 100 + 4 give 104."]},
            {"level": "hard", "q": "2,964 ÷ 38 = ?", "answer": "78", "solution": ["Ask: 38 times what number gives 2,964? Build it in chunks.", "38 × 70 = 2,660; 38 × 8 = 304.", "2,660 + 304 = 2,964, so the chunks 70 + 8 give 78."]},
            {"level": "hard", "q": "800 ÷ 20 = ?", "answer": "40", "solution": ["Ask: 20 times what number gives 800? Build it in chunks.", "20 × 40 = 800.", "800 = 800, so the chunks 40 give 40."]},
            {"level": "hard", "q": "1,113 ÷ 21 = ?", "answer": "53", "solution": ["Ask: 21 times what number gives 1,113? Build it in chunks.", "21 × 50 = 1,050; 21 × 3 = 63.", "1,050 + 63 = 1,113, so the chunks 50 + 3 give 53."]},
            {"level": "hard", "q": "−48 ÷ 8 = ?", "answer": "−6", "solution": ["Divide the sizes first: 48 ÷ 8 = 6.", "A negative divided by a positive is negative.", "Answer: −6."]},
            {"level": "hard", "q": "−165 ÷ 11 = ?", "answer": "−15", "solution": ["Divide the sizes first: 165 ÷ 11 = 15.", "A negative divided by a positive is negative.", "Answer: −15."]},
            {"level": "hard", "q": "−35 ÷ 7 = ?", "answer": "−5", "solution": ["Divide the sizes first: 35 ÷ 7 = 5.", "A negative divided by a positive is negative.", "Answer: −5."]},
            {"level": "hard", "q": "6.4 ÷ 2 = ?", "answer": "3.2", "solution": ["Ignore the decimal point for now: 64 ÷ 2 = 32.", "6.4 has 1 decimal place, so the answer has 1 too.", "Answer: 3.2."]},
            {"level": "hard", "q": "5.1 ÷ 3 = ?", "answer": "1.7", "solution": ["Ignore the decimal point for now: 51 ÷ 3 = 17.", "5.1 has 1 decimal place, so the answer has 1 too.", "Answer: 1.7."]},
            {"level": "hard", "q": "A factory packs 1,764 bottles into boxes of 21. How many boxes does it fill?", "answer": "84", "solution": ["Divide the total by the amount in each group: 1,764 ÷ 21.", "21 × 80 = 1,680; 21 × 4 = 84.", "1,680 + 84 = 1,764, so the chunks 80 + 4 give 84.", "Answer: 84 boxes."]},
            {"level": "hard", "q": "A school has 1,440 students. If each bus carries 36 students, how many buses are needed?", "answer": "40", "solution": ["Divide the total by the amount in each group: 1,440 ÷ 36.", "36 × 40 = 1,440.", "1,440 = 1,440, so the chunks 40 give 40.", "Answer: 40 buses."]},
            {"level": "hard", "q": "A school has 2,088 students. If each bus carries 18 students, how many buses are needed?", "answer": "116", "solution": ["Divide the total by the amount in each group: 2,088 ÷ 18.", "18 × 100 = 1,800; 18 × 10 = 180; 18 × 6 = 108.", "1,800 + 180 + 108 = 2,088, so the chunks 100 + 10 + 6 give 116.", "Answer: 116 buses."]},
          ] },
          resources:[
            { type:'video', staticId:'video-division' }, // Easy / Medium / Hard videos are written in plain HTML in gen-portal.html
          ], focus:[
          'division facts', 'long division with and without remainders',
          'divisibility rules for 2, 3, 5 and 10', 'division as the opposite of multiplication', 'simple division word problems'] }
      ]}
    ]
  }
};

// Level card clicked: show the topic picker and remember the level for this student.
function chooseLevel(levelKey){
  const level = LEVELS[levelKey];
  if(!level) return;
  if(currentUser){
    db.collection('users').doc(currentUser.uid).set({level: level.name}, {merge:true}).catch(console.error);
  }
  renderTopics(levelKey);
  showWizardStep('topics');
}

// Builds the organized grid of topic buttons, one labelled group at a time.
function renderTopics(levelKey){
  const level = LEVELS[levelKey];
  document.getElementById('topicsHeading').textContent = level.name;
  document.getElementById('topicGroups').innerHTML = level.groups.map(group => `
    <div class="topic-group-label">${escapeHtml(group.label)}</div>
    <div class="topic-grid">
      ${group.topics.map(t => `
        <button class="topic-card tone-${group.tone}" onclick="openTopic('${levelKey}', '${t.key}')">
          <span class="topic-icon${t.small ? ' topic-icon-sm' : ''}">${escapeHtml(t.icon)}</span>
          <span class="topic-title">${escapeHtml(t.title)}</span>
          <span class="topic-sub">${escapeHtml(t.sub)}</span>
          <span class="topic-arrow">\u2192</span>
        </button>`).join('')}
    </div>`).join('');
}

// Topic card clicked: open that topic's lesson page.
function openTopic(levelKey, topicKey){
  const level = LEVELS[levelKey];
  const topic = level && level.groups.flatMap(g => g.topics).find(t => t.key === topicKey);
  if(topic) showTopicResources(levelKey, topic);
}

// Shows the lesson materials (video, slides, assessment) for a topic.
let currentTopicRef = null;

function allTopicsOf(levelKey){ return LEVELS[levelKey].groups.flatMap(g => g.topics); }

function goBackToTopics(){
  showWizardStep('topics');
  window.scrollTo({top:0, behavior:'smooth'});
}
function backToTopicTop(){
  window.scrollTo({top:0, behavior:'smooth'});
}
function goNextTopic(){
  if(!currentTopicRef) return;
  const list = allTopicsOf(currentTopicRef.levelKey);
  const idx = list.findIndex(t => t.key === currentTopicRef.topicKey);
  if(idx >= 0 && idx < list.length - 1){
    showTopicResources(currentTopicRef.levelKey, list[idx + 1]);
    window.scrollTo({top:0, behavior:'smooth'});
  } else {
    goBackToTopics();   // that was the last topic
  }
}

function showTopicResources(levelKey, topic){
  currentTopicRef = { levelKey, topicKey: topic.key };
  const _list = allTopicsOf(levelKey);
  const _isLast = _list.findIndex(t => t.key === topic.key) >= _list.length - 1;
  document.getElementById('resNextBtn').textContent = _isLast ? 'All topics ✓' : 'Next Topic →';
  const level = LEVELS[levelKey];
  const badge = document.getElementById('resBadge');
  badge.textContent = topic.icon;
  badge.classList.toggle('res-badge-sm', topic.icon.length >= 3);
  document.getElementById('resEyebrow').textContent = level.name;
  document.getElementById('resTitle').textContent = topic.title;

  const ICONS = {
    ppt:'<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    quiz:'<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 9l1.5 1.5L14 7M9 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const resources = topic.resources || [];
  const video = resources.find(r=>r.type==='video');
  const others = resources.filter(r=>r.type!=='video');

  // YouTube video cards live in index.html (#resStaticVideos): stop & hide them all, then show this topic's set.
  stopAllLessonVideos();
  if(video && video.staticId){
    const el = document.getElementById(video.staticId);
    if(el){
      el.hidden = false;
      el.querySelectorAll('iframe[data-src]').forEach(f => { f.src = f.dataset.src; });
    }
  }

  const videoHtml = (video && !video.staticId) ? `
    <div class="res-video-card${video.portrait ? ' portrait' : ''}">
      <div class="res-video-frame">
        ${video.file
          ? `<video controls playsinline preload="metadata" src="${escapeHtml(video.file)}"
               onloadedmetadata="this.closest('.res-video-card').classList.toggle('portrait', this.videoHeight > this.videoWidth)"
               onerror="this.nextElementSibling.style.display='flex'">
               Your browser can't play this video.
             </video>
             <div class="res-video-error">
               <span>⚠️</span>
               <b>Video not found</b>
               <p>Put the file here:<br><code>${escapeHtml(video.file)}</code><br>(next to gen-portal.html)</p>
             </div>`
          : `<iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.videoId)}" title="${escapeHtml(video.title)}"
               loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`}
      </div>
      <div class="res-video-info">
        <span class="res-tag tag-video">Step 1</span>
        <h4>${escapeHtml(video.title)}</h4>
        <p class="res-summary-label">📝 What it's about</p>
        <p>${escapeHtml(video.desc)}</p>
        ${video.file
          ? (video.duration ? `<span class="res-duration">⏱ ${escapeHtml(video.duration)} lesson</span>` : '')
          : `<a class="res-link-btn" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">Open on YouTube ↗</a>`}
      </div>
    </div>` : '';

  const cardsHtml = others.map((r,i)=>`
    <a class="res-card res-${r.type}" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
      <span class="res-card-icon">${ICONS[r.type] || ''}</span>
      <span class="res-tag tag-${r.type}">Step ${i + (video ? 2 : 1)}</span>
      <span class="res-card-title">${escapeHtml(r.title)}</span>
      <span class="res-card-desc">${escapeHtml(r.desc)}</span>
      <span class="res-card-cta">${escapeHtml(r.cta || 'Open')} <span>→</span></span>
    </a>`).join('');

  document.getElementById('resBody').innerHTML = resources.length
    ? videoHtml + (cardsHtml ? `<div class="res-grid">${cardsHtml}</div>` : '')
    : `<div class="res-empty"><span>🚧</span><h4>Lesson materials coming soon</h4><p>The video, slides and assessment for ${escapeHtml(topic.title)} will be added here.</p></div>`;
  document.getElementById('resBody').insertAdjacentHTML('beforeend', '<div id="gameMount"></div><div id="sketchMount"></div>');
  gameInit(topic);
  sketchInit(topic);
  markActiveToday();
  showWizardStep('resources');
}

/* ================= ACTIVITY LOG + ADMIN DASHBOARD ================= */
// Student-supplied text (names) is shown in the admin table, so it must be escaped.
function escapeHtml(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]
  ));
}

// Records something a signed-in student did, so the admin can see it.
function logActivity(type, detail, extra){
  if(!currentUser) return;
  const userRef = db.collection('users').doc(currentUser.uid);
  userRef.collection('activity').add(Object.assign({
    type, detail: detail || '', at: firebase.firestore.FieldValue.serverTimestamp()
  }, extra || {})).catch(console.error);
  userRef.set({lastSeenAt: Date.now()}, {merge:true}).catch(console.error);
}

// Only REAL activity is recorded: a student starting the mini game in a section + level.
// Opening a lesson page or replaying the same section/level within 10 minutes is not logged again,
// so the admin board is not flooded with repeats.
const GAME_LOG_COOLDOWN_MS = 10 * 60 * 1000;
const recentGameLogs = {};
function logGamePlay(section, levelKey){
  if(!currentUser) return;
  const key = currentUser.uid + '|' + section + '|' + levelKey;
  const now = Date.now();
  if(recentGameLogs[key] && now - recentGameLogs[key] < GAME_LOG_COOLDOWN_MS) return;
  recentGameLogs[key] = now;
  const levelLabel = (typeof GAME_LEVELS !== 'undefined' && GAME_LEVELS[levelKey]) ? GAME_LEVELS[levelKey].label : levelKey;
  logActivity('game_played', `${section} \u00B7 ${levelLabel}`, { section, level: levelKey });
}

// Shows/hides the Admin tab. This only controls what's VISIBLE — the real protection
// is the Firestore security rules, which stop anyone else from reading other students' data.
function updateAdminAccess(email){
  const isAdmin = !!email && email === ADMIN_EMAIL;
  document.getElementById('adminNavBtn').style.display = isAdmin ? 'inline-flex' : 'none';
  document.getElementById('adminBottomNavBtn').style.display = isAdmin ? 'flex' : 'none';
  if(!isAdmin && document.getElementById('page-admin').classList.contains('active')) goToPage('home');
}

function formatWhen(ms){
  if(!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
}

function describeActivity(a){
  if(a.type === 'topic_opened') return `opened the ${escapeHtml(a.detail)} lesson`;
  return escapeHtml(a.type);
}

async function loadAdminDashboard(){
  if(!currentUser || currentUser.email !== ADMIN_EMAIL) return;

  const loading = document.getElementById('adminLoadingMsg');
  const table = document.getElementById('adminStudentTable');
  loading.style.display = 'block';
  loading.style.color = '';
  loading.textContent = 'Loading student data...';
  table.style.display = 'none';

  try{
    const usersSnap = await db.collection('users').get();

    const students = await Promise.all(usersSnap.docs.map(async doc=>{
      const u = doc.data();
      const userRef = db.collection('users').doc(doc.id);
      const activitySnap = await userRef.collection('activity').orderBy('at', 'desc').limit(40).get();

      const name = u.displayName || u.email || '(no name)';
      return {
        name, email: u.email || '', level: u.level || '—', streak: calcStreaks(new Set(Array.isArray(u.activeDays) ? u.activeDays : [])).current,
        lastActive: u.lastSeenAt || u.lastLoginTimestamp || 0,
        activity: activitySnap.docs.map(a=>({...a.data(), student: name}))
      };
    }));

    students.sort((a,b)=> b.lastActive - a.lastActive);

    const dayAgo = Date.now() - 24*60*60*1000;
    document.getElementById('adminStudentCount').textContent = `${students.length} student${students.length === 1 ? '' : 's'}`;
    document.getElementById('adminTotalStudents').textContent = students.length;
    document.getElementById('adminActiveToday').textContent = students.filter(s=> s.lastActive > dayAgo).length;

    document.getElementById('adminStudentRows').innerHTML = students.length
      ? students.map(s=>`<tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td>${escapeHtml(s.level)}</td>
          <td>${s.streak} 🔥</td>
          <td>${formatWhen(s.lastActive)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">No students yet.</td></tr>';

    // One row per student (name shown once). Only mini-game plays count; repeats are merged into "x2".
    const feed = students.map(s=>{
      const plays = s.activity
        .filter(a=> a.type === 'game_played')
        .map(a=>({...a, ms: (a.at && a.at.toMillis) ? a.at.toMillis() : 0}))
        .sort((x,y)=> y.ms - x.ms);
      if(!plays.length) return null;
      const counts = new Map();                       // keeps most-recent-first order
      plays.forEach(p=>{ const k = p.detail || 'Mini game'; counts.set(k, (counts.get(k) || 0) + 1); });
      return { student: s.name, ms: plays[0].ms, items: [...counts.entries()] };
    }).filter(Boolean).sort((x,y)=> y.ms - x.ms).slice(0, 20);

    document.getElementById('adminActivityList').innerHTML = feed.length
      ? feed.map(r=>`<div class="admin-activity-row">
          <span class="aa-time">${formatWhen(r.ms)}</span>
          <span class="aa-body"><strong>${escapeHtml(r.student)}</strong> played
            ${r.items.map(([label, n])=>`<span class="aa-chip">${escapeHtml(label)}${n > 1 ? ` <b>\u00D7${n}</b>` : ''}</span>`).join('')}
          </span>
        </div>`).join('')
      : '<p class="admin-intro">No activity recorded yet. It appears when students play the mini game.</p>';

    loading.style.display = 'none';
    table.style.display = 'table';
  } catch(err){
    console.error(err);
    loading.style.color = 'var(--orange-dark)';
    loading.textContent = `Couldn't load student data (${err.message}). Make sure the admin Firestore rules have been published.`;
  }
}


/* ================= HOME: WARM-UP CHALLENGE + SURPRISE TOPIC ================= */
const MINUS = '\u2212';
function fmtNum(n){ return n < 0 ? MINUS + Math.abs(n) : String(n); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

// Each generator returns {tag, q, answer}
const WARMUP_GENERATORS = [
  ()=>{ const a=randInt(12,89), b=randInt(11,79); return {tag:'\u2795 Addition', q:`${a} + ${b} = ?`, answer:a+b}; },
  ()=>{ const a=randInt(40,99), b=randInt(11,39); return {tag:'\u2796 Subtraction', q:`${a} ${MINUS} ${b} = ?`, answer:a-b}; },
  ()=>{ const a=randInt(3,12), b=randInt(3,12); return {tag:'\u2716\uFE0F Multiplication', q:`${a} \u00D7 ${b} = ?`, answer:a*b}; },
  ()=>{ const b=randInt(3,12), r=randInt(3,12); return {tag:'\u2797 Division', q:`${b*r} \u00F7 ${b} = ?`, answer:r}; },
];

let wuStreak = 0, wuBest = 0, wuAnswered = false, wuCurrent = null;
try{ wuBest = parseInt(localStorage.getItem('genWarmupBest') || '0', 10) || 0; }catch(e){}

function newWarmup(){
  const gen = WARMUP_GENERATORS[randInt(0, WARMUP_GENERATORS.length-1)];
  wuCurrent = gen();
  wuAnswered = false;

  // 3 distinct wrong answers close to the right one
  const opts = new Set([wuCurrent.answer]);
  let guard = 0;
  while(opts.size < 4 && guard++ < 60){
    const off = randInt(1,10) * (Math.random() < .5 ? -1 : 1);
    const cand = wuCurrent.answer + off;
    if(cand >= 0 || wuCurrent.answer < 0) opts.add(cand);
  }
  const list = Array.from(opts).sort(()=>Math.random()-.5);

  document.getElementById('wuTag').textContent = wuCurrent.tag;
  document.getElementById('wuQuestion').textContent = wuCurrent.q;
  document.getElementById('wuOptions').innerHTML = list.map(v =>
    `<button class="wu-opt" data-val="${v}" onclick="answerWarmup(${v}, this)">${fmtNum(v)}</button>`).join('');
  const fb = document.getElementById('wuFeedback');
  fb.textContent = 'Pick an answer!';
  fb.className = 'wu-feedback';
  document.getElementById('wuNext').classList.remove('show');
  document.getElementById('wuStreak').textContent = wuStreak;
  document.getElementById('wuBest').textContent = wuBest;
}

function answerWarmup(value, btn){
  if(wuAnswered) return;
  wuAnswered = true;
  markActiveToday();
  const right = value === wuCurrent.answer;
  const fb = document.getElementById('wuFeedback');

  document.querySelectorAll('#wuOptions .wu-opt').forEach(b=>{
    b.disabled = true;
    if(Number(b.dataset.val) === wuCurrent.answer) b.classList.add('correct');
  });

  if(right){
    wuStreak++;
    if(wuStreak > wuBest){
      wuBest = wuStreak;
      try{ localStorage.setItem('genWarmupBest', String(wuBest)); }catch(e){}
    }
    const praise = wuStreak % 5 === 0 ? `\uD83C\uDF89 ${wuStreak} in a row! You're on fire!` : ['Nice one! \u2705','Correct! Keep going \uD83D\uDCAA','Spot on! \u2B50','Great job! \uD83D\uDE80'][randInt(0,3)];
    fb.textContent = praise;
    fb.className = 'wu-feedback good';
    const card = document.getElementById('warmup');
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
  } else {
    btn.classList.add('wrong');
    fb.textContent = `Not quite \u2014 the answer is ${fmtNum(wuCurrent.answer)}. Try the next one!`;
    fb.className = 'wu-feedback bad';
    wuStreak = 0;
  }
  document.getElementById('wuStreak').textContent = wuStreak;
  document.getElementById('wuBest').textContent = wuBest;
  document.getElementById('wuNext').classList.add('show');
}

newWarmup();


/* ================= MINI GAME ================= */
// A topic's `game` can have `levels:true` plus questions tagged level:'easy' | 'medium' | 'hard'.
// Then the student first picks a difficulty and only gets questions of that level.
let gameState = null;

const GAME_LEVELS = {
  easy:   { label:'Easy',   emoji:'🟢', cls:'lv-easy',   desc:'Warm-up questions to get you started' },
  medium: { label:'Medium', emoji:'🟡', cls:'lv-medium', desc:'A bit trickier. Time to think!' },
  hard:   { label:'Hard',   emoji:'🔴', cls:'lv-hard',   desc:'Challenge mode for math champions' }
};

function shuffleArr(a){
  const r = a.slice();
  for(let i = r.length - 1; i > 0; i--){ const k = Math.floor(Math.random() * (i + 1)); [r[i], r[k]] = [r[k], r[i]]; }
  return r;
}
// (kept for older question formats)
function shuffleOptions(q){
  const correct = q.options[q.answer];
  const opts = shuffleArr(q.options);
  return Object.assign({}, q, { options: opts, answer: opts.indexOf(correct) });
}

function correctAnswer(q){
  return (typeof q.answer === 'number' && q.options) ? String(q.options[q.answer]) : String(q.answer);
}
function normAnswer(v){ return String(v).replace(/[\u2212\u2013\u2014]/g,'-').replace(/[,\s]/g,'').toLowerCase(); }
function answersMatch(a, b){
  const x = normAnswer(a), y = normAnswer(b);
  if(x !== '' && !isNaN(Number(x)) && !isNaN(Number(y))) return Number(x) === Number(y);
  return x === y;
}
function gameType(v){ if(gameState) gameState.typed = v; }
function gameFocusInput(){
  const inp = document.querySelector('#gameMount .game-input:not(:disabled)');
  if(inp) inp.focus({preventScroll:true});
}

function gameInit(topic){
  const g = topic.game || {};
  const bank = g.questions || [];
  const useLevels = !!g.levels && bank.some(q => q.level);
  gameState = {
    topic, bank, useLevels, level:null,
    questions: useLevels ? [] : bank,
    cta: g.cta || `Think you've mastered ${topic.title}? Take the challenge, beat your best score, and tap Show solution whenever you're stuck!`,
    idx:0, score:0, typed:'', checked:false, showSol:false, fb:'', fbClass:''
  };
  renderGame();
}

function gameStartLevel(level){
  const s = gameState; if(!s) return;
  s.level = level;
  logGamePlay(s.topic.title, level);
  s.questions = shuffleArr(s.bank.filter(q => q.level === level));
  s.idx = 0; s.score = 0; s.typed = ''; s.checked = false; s.showSol = false; s.fb = ''; s.fbClass = '';
  renderGame();
  gameFocusInput();
}

function gameBackToLevels(){
  const s = gameState; if(!s) return;
  s.level = null; s.questions = [];
  s.idx = 0; s.score = 0; s.typed = ''; s.checked = false; s.showSol = false; s.fb = ''; s.fbClass = '';
  renderGame();
}

function renderGame(){
  const s = gameState, mount = document.getElementById('gameMount');
  if(!s || !mount) return;

  const picking = s.useLevels && !s.level;
  const total = s.questions.length;
  const q = s.questions[s.idx];
  const preview = !picking && !q && total === 0;
  const finished = !picking && total > 0 && s.idx >= total;
  const letters = ['A','B','C','D'];
  const pct = total ? Math.round(Math.min(s.idx, total) / total * 100) : 0;
  const lv = s.level ? GAME_LEVELS[s.level] : null;

  let body;
  if(picking){
    const cards = Object.keys(GAME_LEVELS).map(key => {
      const L = GAME_LEVELS[key];
      const n = s.bank.filter(x => x.level === key).length;
      return `
        <button class="game-level-card ${L.cls}" onclick="gameStartLevel('${key}')" ${n ? '' : 'disabled'}>
          <span class="gl-emoji">${L.emoji}</span>
          <span class="gl-name">${L.label}</span>
          <span class="gl-desc">${L.desc}</span>
          <span class="gl-count">${n} question${n === 1 ? '' : 's'}</span>
          <span class="gl-go">Play →</span>
        </button>`;
    }).join('');
    body = `
      <div class="game-levels-title">Choose your difficulty</div>
      <div class="game-level-grid">${cards}</div>`;
  } else if(finished){
    body = `
      <div class="game-finish">
        <div class="gf-emoji">${s.score === total ? '🏆' : '🎉'}</div>
        <h4>${lv ? lv.label + ' level' : 'Challenge'} complete!</h4>
        <p>You scored <b>${s.score}</b> out of <b>${total}</b>.</p>
        <div class="game-actions">
          <button class="game-btn primary" onclick="${s.useLevels ? `gameStartLevel('${s.level}')` : 'gameRestart()'}">↺ Play again</button>
          ${s.useLevels ? `<button class="game-btn ghost" onclick="gameBackToLevels()">Change level</button>` : ''}
        </div>
      </div>`;
  } else {
    const inCls = 'game-input' + (s.checked ? (s.fbClass === 'good' ? ' correct' : ' wrong') : '');

    const steps = (q && q.solution && q.solution.length ? q.solution : [null,null,null]).map((t,i)=>`
        <li><span class="gs-num">${i+1}</span><span class="${t===null?'placeholder':''}">${t===null ? 'Step ' + (i+1) + ' of the solution will appear here.' : escapeHtml(t)}</span></li>`).join('');

    body = `
      <div class="game-progress"><div class="game-progress-fill" style="width:${pct}%"></div></div>
      <div class="game-q-card">
        <span class="game-q-label">${lv ? lv.emoji + ' ' + lv.label + ' · ' : ''}Question ${Math.min(s.idx+1, Math.max(total,1))}</span>
        <div class="game-q-text ${q?'':'placeholder'}">${q ? escapeHtml(q.q) : 'Your question will appear here'}</div>
      </div>
      <div class="game-answer">
        <label class="game-answer-label" for="gameInput">Your answer</label>
        <input id="gameInput" class="${inCls}" type="text" inputmode="text" autocomplete="off" spellcheck="false"
               placeholder="${q ? 'Type your answer here' : 'Your answer goes here'}" value="${escapeHtml(s.typed || '')}"
               ${s.checked || !q ? 'disabled' : ''}
               oninput="gameType(this.value)" onkeydown="if(event.key==='Enter'){gameCheck();}">
      </div>
      <div class="game-feedback ${s.fbClass||''}">${s.fb || (preview ? 'This is a preview of the game. Questions are coming soon!' : 'Type your answer, then press Check.')}</div>
      <div class="game-actions">
        <button class="game-btn primary" onclick="gameCheck()">✓ Check answer</button>
        <button class="game-btn ghost" onclick="gameToggleSolution()">💡 ${s.showSol ? 'Hide solution' : 'Show solution'}</button>
        <button class="game-btn next ${s.checked && !preview ? 'show' : ''}" onclick="gameNext()">${s.idx + 1 >= total ? 'Finish ✓' : 'Next →'}</button>
      </div>
      <div class="game-solution ${s.showSol ? 'open' : ''}">
        <div class="gs-head">💡 How to solve it</div>
        <ol class="gs-steps">${steps}</ol>
        <div class="gs-answer"><span>Final answer</span><b class="${q?'':'placeholder'}">${q ? escapeHtml(correctAnswer(q)) : '—'}</b></div>
      </div>`;
  }

  const stats = picking ? '' : `
        <div class="game-stats">
          ${lv ? `<span class="game-pill ${lv.cls}">${lv.emoji} ${lv.label}</span>` : ''}
          <span class="game-pill">⭐ Score <b>${s.score}</b></span>
          <span class="game-pill">🎯 <b>${Math.min(s.idx+1, Math.max(total,1))}</b> / ${total || '–'}</span>
          ${s.useLevels ? `<button class="game-pill game-pill-btn" onclick="gameBackToLevels()">↩ Change level</button>` : ''}
        </div>`;

  mount.innerHTML = `
    <div class="game-card">
      <div class="game-head">
        <div class="game-title-wrap">
          <span class="game-badge">🎮</span>
          <div>
            <div class="game-eyebrow">Mini game</div>
            <h3 class="game-title">${escapeHtml(s.topic.title)} Challenge</h3>
          </div>
        </div>${stats}
      </div>
      <div class="game-cta"><span>🚀</span><p>${escapeHtml(s.cta)}</p></div>
      ${body}
    </div>`;
}

function gameCheck(){
  const s = gameState; if(!s || s.checked) return;
  const q = s.questions[s.idx];
  if(!q){ s.fb = 'Preview only. Questions are coming soon!'; s.fbClass = ''; renderGame(); return; }
  if(!String(s.typed || '').trim()){ s.fb = 'Type your answer first!'; s.fbClass = 'bad'; renderGame(); gameFocusInput(); return; }
  s.checked = true;
  markActiveToday();
  if(answersMatch(s.typed, correctAnswer(q))){ s.score++; s.fb = 'Correct! Great job! ⭐'; s.fbClass = 'good'; }
  else { s.fb = 'Not quite. Press Show solution to see how it works.'; s.fbClass = 'bad'; }
  renderGame();
}

function gameToggleSolution(){
  if(!gameState) return;
  gameState.showSol = !gameState.showSol;
  renderGame();
}

function gameNext(){
  const s = gameState; if(!s) return;
  s.idx++; s.typed = ''; s.checked = false; s.showSol = false; s.fb = ''; s.fbClass = '';
  renderGame();
  gameFocusInput();
}

function gameRestart(){ gameInit(gameState.topic); }


/* ================= STREAK CALENDAR (tracks the days a student practiced) ================= */
// A day counts as "active" when the student opens the app, a lesson, answers a warm-up question
// or checks an answer in a mini game. Signed-in students are saved to their account
// (users/{uid}.activeDays); signed-out visitors are saved in this browser only.
const ACTIVE_KEY = 'genActiveDays';
let activeDays = new Set();
let calView = new Date(); calView.setDate(1);

function dayKey(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function parseDayKey(k){ const p = k.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }

function loadLocalDays(){
  try{ JSON.parse(localStorage.getItem(ACTIVE_KEY) || '[]').forEach(k => activeDays.add(k)); }catch(e){}
}
function saveLocalDays(){
  try{ localStorage.setItem(ACTIVE_KEY, JSON.stringify(Array.from(activeDays))); }catch(e){}
}

async function loadActiveDaysForUser(uid, data){
  (Array.isArray(data.activeDays) ? data.activeDays : []).forEach(k => activeDays.add(k));
  renderStreakCalendar();
  try{
    // also count days from the student's earlier activity log
    const snap = await db.collection('users').doc(uid).collection('activity').orderBy('at','desc').limit(500).get();
    snap.forEach(doc => { const a = doc.data(); if(a.at && a.at.toDate) activeDays.add(dayKey(a.at.toDate())); });
  }catch(e){ console.warn('Could not read activity history', e); }
  renderStreakCalendar();
  db.collection('users').doc(uid).set({ streak: calcStreaks().current }, {merge:true}).catch(console.error);
}

function markActiveToday(){
  const key = dayKey(new Date());
  if(activeDays.has(key)) return;
  activeDays.add(key);
  if(currentUser){
    db.collection('users').doc(currentUser.uid)
      .set({ activeDays: firebase.firestore.FieldValue.arrayUnion(key), streak: calcStreaks().current }, {merge:true}).catch(console.error);
  } else {
    saveLocalDays();
  }
  renderStreakCalendar();
}

function calcStreaks(days = activeDays){
  const has = d => days.has(dayKey(d));
  const d = new Date(); d.setHours(0,0,0,0);
  let current = 0;
  if(!has(d)) d.setDate(d.getDate() - 1);          // today isn't over yet: yesterday keeps the streak alive
  while(has(d)){ current++; d.setDate(d.getDate() - 1); }

  let best = 0, run = 0, prev = null;
  Array.from(days).map(parseDayKey).sort((a,b) => a - b).forEach(dt => {
    run = (prev && Math.round((dt - prev) / 86400000) === 1) ? run + 1 : 1;
    if(run > best) best = run;
    prev = dt;
  });
  return { current, best };
}

function calPrev(){ calView.setMonth(calView.getMonth() - 1); renderStreakCalendar(); }
function calNext(){ calView.setMonth(calView.getMonth() + 1); renderStreakCalendar(); }

function renderStreakCalendar(){
  const el = document.getElementById('streakCalendar');
  if(!el) return;
  const y = calView.getFullYear(), m = calView.getMonth();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const startDay = new Date(y, m, 1).getDay();
  const todayKey = dayKey(new Date());
  const { current, best } = calcStreaks();
  if(currentUser){ const st = document.getElementById('statStreak'); if(st) st.textContent = current; }
  const now = new Date();
  const atCurrentMonth = y === now.getFullYear() && m === now.getMonth();

  let cells = '', monthActive = 0;
  for(let i = 0; i < startDay; i++) cells += '<span class="sc-cell empty"></span>';
  for(let d = 1; d <= daysInMonth; d++){
    const k = dayKey(new Date(y, m, d));
    const active = activeDays.has(k);
    if(active) monthActive++;
    const cls = ['sc-cell', active ? 'active' : '', k === todayKey ? 'today' : '', k > todayKey ? 'future' : ''].join(' ');
    cells += `<span class="${cls}" title="${k}${active ? ' - active' : ''}"><b>${d}</b>${active ? '<i>🔥</i>' : ''}</span>`;
  }

  const todayDone = activeDays.has(todayKey);
  const msg = todayDone ? '🎉 You showed up today! Come back tomorrow to keep your streak going.'
            : current > 0 ? `🔥 Open the app today to keep your ${current}-day streak alive!`
            : 'Use the app every day to build your streak!';

  el.innerHTML = `
    <div class="sc-stats">
      <div class="sc-stat"><span class="sc-num">${current}</span><span class="sc-label">🔥 Current streak</span></div>
      <div class="sc-stat"><span class="sc-num">${best}</span><span class="sc-label">🏆 Longest streak</span></div>
      <div class="sc-stat"><span class="sc-num">${monthActive}</span><span class="sc-label">📅 Active this month</span></div>
    </div>
    <div class="sc-month">
      <button class="sc-nav" onclick="calPrev()" aria-label="Previous month">‹</button>
      <span>${calView.toLocaleString('en-US', { month:'long', year:'numeric' })}</span>
      <button class="sc-nav" onclick="calNext()" aria-label="Next month" ${atCurrentMonth ? 'disabled' : ''}>›</button>
    </div>
    <div class="sc-week">${['S','M','T','W','T','F','S'].map(w => `<span>${w}</span>`).join('')}</div>
    <div class="sc-grid">${cells}</div>
    <div class="sc-legend"><span><i class="lg lg-active"></i> Active day</span><span><i class="lg lg-today"></i> Today</span></div>
    <div class="sc-msg ${todayDone ? 'done' : ''}">${msg}</div>
    ${currentUser ? '' : '<div class="sc-note">Sign in to save your streak to your account.</div>'}`;
}

loadLocalDays();
renderStreakCalendar();


/* ================= SKETCHPAD (scratch space on every lesson page) ================= */
// Each topic (Addition, Subtraction, Multiplication, Division) gets its own sketchpad under the mini game.
// Drawings are kept per topic while the page is open, so switching topics and coming back keeps your work.
const SKETCH_COLORS = [
  {name:'Ink',    val:'#1E3A3A'},
  {name:'Teal',   val:'#3D8A8A'},
  {name:'Orange', val:'#E8873A'},
  {name:'Red',    val:'#E5584F'},
  {name:'Blue',   val:'#2E86DE'},
  {name:'Purple', val:'#7C5CD6'},
  {name:'Green',  val:'#5B8C3E'}
];
const sketchPrefs = { tool:'pen', color:'#1E3A3A', size:4, bg:'grid' };
const sketchStore = {};      // topic key -> { strokes:[], redo:[], w, h }
let sketch = null;           // the sketchpad that is currently on screen

function skMid(a, b){ return { x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 }; }

function sketchInit(topic){
  const mount = document.getElementById('sketchMount');
  if(sketch && sketch.ro) sketch.ro.disconnect();
  sketch = null;
  if(!mount) return;

  const entry = sketchStore[topic.key] || (sketchStore[topic.key] = { strokes:[], redo:[], w:0, h:0 });

  const colorBtns = SKETCH_COLORS.map(c =>
    `<button class="sk-color" data-color="${c.val}" style="background:${c.val};" title="${c.name}" aria-label="${c.name} pen" onclick="sketchSetColor('${c.val}')"></button>`).join('');

  mount.innerHTML = `
    <div class="game-card sketch-card">
      <div class="game-head">
        <div class="game-title-wrap">
          <span class="game-badge">✏️</span>
          <div>
            <div class="game-eyebrow">Scratch space</div>
            <h3 class="game-title">${escapeHtml(topic.title)} Sketchpad</h3>
          </div>
        </div>
      </div>
      <div class="game-cta"><span>🧮</span><p>Work out your ${escapeHtml(topic.title.toLowerCase())} problems here: write the numbers, draw groups, or try a method. Use a finger, pen or mouse.</p></div>

      <div class="sk-toolbar">
        <div class="sk-group">
          <button class="sk-btn" data-tool="pen" onclick="sketchSetTool('pen')">✏️ Pen</button>
          <button class="sk-btn" data-tool="eraser" onclick="sketchSetTool('eraser')">🧽 Eraser</button>
        </div>
        <div class="sk-group" role="group" aria-label="Pen colors">${colorBtns}</div>
        <label class="sk-size">Size <input type="range" id="skSize" min="2" max="24" step="1" value="${sketchPrefs.size}" oninput="sketchSetSize(this.value)"><b id="skSizeVal">${sketchPrefs.size}</b></label>
      </div>

      <div class="sk-wrap sk-bg-${sketchPrefs.bg}" id="skWrap">
        <canvas class="sk-canvas" id="skCanvas" tabindex="0" aria-label="Sketchpad drawing area"></canvas>
      </div>

      <div class="sk-toolbar sk-toolbar-bottom">
        <div class="sk-group">
          <button class="sk-btn" id="skUndo" onclick="sketchUndo()">↶ Undo</button>
          <button class="sk-btn" id="skRedo" onclick="sketchRedo()">↷ Redo</button>
          <button class="sk-btn" id="skClear" onclick="sketchClear()">🗑 Clear</button>
        </div>
        <div class="sk-group">
          <button class="sk-btn" data-bg="grid" onclick="sketchSetBg('grid')">Grid</button>
          <button class="sk-btn" data-bg="lines" onclick="sketchSetBg('lines')">Lines</button>
          <button class="sk-btn" data-bg="plain" onclick="sketchSetBg('plain')">Plain</button>
        </div>
      </div>
    </div>`;

  const cv = document.getElementById('skCanvas');
  sketch = { topic, entry, canvas:cv, ctx:cv.getContext('2d'), dpr:1, cur:null, pid:null, ro:null };
  sketchBindCanvas();

  // The lesson page is hidden until everything is built, so size the canvas whenever it actually becomes visible.
  if(window.ResizeObserver){
    sketch.ro = new ResizeObserver(() => sketchFit());
    sketch.ro.observe(cv);
  }
  sketchFit();
  sketchSyncUI();
}

// Matches the canvas' pixel size to its on-screen size (sharp on retina screens) and redraws the saved strokes.
function sketchFit(){
  const s = sketch; if(!s) return;
  const w = s.canvas.clientWidth, h = s.canvas.clientHeight;
  if(!w || !h) return;                       // still hidden
  const e = s.entry;
  if(e.w && e.h && (e.w !== w || e.h !== h)){   // window resized or phone rotated: scale the drawing with it
    const kx = w / e.w, ky = h / e.h;
    e.strokes.concat(e.redo).forEach(st => { if(st.pts) st.pts.forEach(p => { p.x *= kx; p.y *= ky; }); });
  }
  e.w = w; e.h = h;
  s.dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * s.dpr), ph = Math.round(h * s.dpr);
  if(s.canvas.width !== pw || s.canvas.height !== ph){ s.canvas.width = pw; s.canvas.height = ph; }
  sketchRedraw();
}

function sketchStyle(ctx, st){
  ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
  ctx.lineWidth = st.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}

function sketchDrawStroke(ctx, st){
  const p = st.pts; if(!p.length) return;
  sketchStyle(ctx, st);
  ctx.beginPath();
  if(p.length === 1){
    ctx.arc(p[0].x, p[0].y, st.size / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.moveTo(p[0].x, p[0].y);
    const m0 = skMid(p[0], p[1]); ctx.lineTo(m0.x, m0.y);
    for(let i = 1; i < p.length - 1; i++){
      const m = skMid(p[i], p[i + 1]);
      ctx.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function sketchRedraw(){
  const s = sketch; if(!s) return;
  const ctx = s.ctx, W = s.canvas.width / s.dpr, H = s.canvas.height / s.dpr;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  s.entry.strokes.forEach(st => {
    if(st.clear) ctx.clearRect(0, 0, W, H); else sketchDrawStroke(ctx, st);
  });
}

// Draws just the newest bit of the stroke while the pen is moving (fast and smooth).
function sketchLiveSegment(final){
  const s = sketch, st = s.cur, p = st.pts, n = p.length, ctx = s.ctx;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  sketchStyle(ctx, st);
  ctx.beginPath();
  if(n === 1){
    ctx.arc(p[0].x, p[0].y, st.size / 2, 0, Math.PI * 2); ctx.fill();
  } else if(n === 2){
    const m = skMid(p[0], p[1]); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(m.x, m.y); ctx.stroke();
  } else {
    const a = skMid(p[n - 3], p[n - 2]), b = skMid(p[n - 2], p[n - 1]);
    ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(p[n - 2].x, p[n - 2].y, b.x, b.y); ctx.stroke();
  }
  if(final && n >= 2){
    const m = skMid(p[n - 2], p[n - 1]);
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p[n - 1].x, p[n - 1].y); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function sketchBindCanvas(){
  const s = sketch, cv = s.canvas;
  const pos = ev => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  cv.addEventListener('pointerdown', e => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    cv.focus({ preventScroll:true });
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    const P = sketchPrefs, erase = P.tool === 'eraser';
    s.pid = e.pointerId;
    s.cur = { color:P.color, size: erase ? P.size * 3 + 6 : P.size, erase, pts:[pos(e)] };
    sketchLiveSegment(false);
  });
  cv.addEventListener('pointermove', e => {
    if(!s.cur || e.pointerId !== s.pid) return;
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    (evs.length ? evs : [e]).forEach(ev => { s.cur.pts.push(pos(ev)); sketchLiveSegment(false); });
  });
  const end = e => {
    if(!s.cur || e.pointerId !== s.pid) return;
    sketchLiveSegment(true);
    s.entry.strokes.push(s.cur);
    s.entry.redo = [];
    s.cur = null; s.pid = null;
    sketchSyncUI();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('keydown', e => {
    if(!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if(k === 'z'){ e.preventDefault(); e.shiftKey ? sketchRedo() : sketchUndo(); }
    else if(k === 'y'){ e.preventDefault(); sketchRedo(); }
  });
  // hide the site's custom cursor badge while drawing so the crosshair is the only pointer
  cv.addEventListener('pointerenter', () => document.body.classList.add('sketch-hover'));
  cv.addEventListener('pointerleave', () => { if(!s.cur) document.body.classList.remove('sketch-hover'); });
  cv.addEventListener('lostpointercapture', () => { if(!cv.matches(':hover')) document.body.classList.remove('sketch-hover'); });
}

function sketchHasInk(){
  const st = sketch ? sketch.entry.strokes : [];
  return st.length > 0 && !st[st.length - 1].clear;
}

function sketchSetTool(t){ sketchPrefs.tool = t; sketchSyncUI(); }
function sketchSetColor(c){ sketchPrefs.color = c; sketchPrefs.tool = 'pen'; sketchSyncUI(); }
function sketchSetSize(v){ sketchPrefs.size = Number(v) || 4; sketchSyncUI(); }
function sketchSetBg(b){ sketchPrefs.bg = b; sketchSyncUI(); }

function sketchUndo(){
  if(!sketch) return;
  const e = sketch.entry; if(!e.strokes.length) return;
  e.redo.push(e.strokes.pop());
  sketchRedraw(); sketchSyncUI();
}
function sketchRedo(){
  if(!sketch) return;
  const e = sketch.entry; if(!e.redo.length) return;
  e.strokes.push(e.redo.pop());
  sketchRedraw(); sketchSyncUI();
}
// Clear is itself an undo-able step, so a mis-tap never loses work for good.
function sketchClear(){
  if(!sketch || !sketchHasInk()) return;
  sketch.entry.strokes.push({ clear:true });
  sketch.entry.redo = [];
  sketchRedraw(); sketchSyncUI();
}

function sketchSyncUI(){
  const m = document.getElementById('sketchMount');
  if(!m || !sketch) return;
  const P = sketchPrefs, e = sketch.entry;
  m.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === P.tool));
  m.querySelectorAll('.sk-color').forEach(b => b.classList.toggle('active', P.tool === 'pen' && b.dataset.color === P.color));
  m.querySelectorAll('[data-bg]').forEach(b => b.classList.toggle('active', b.dataset.bg === P.bg));
  const wrap = document.getElementById('skWrap');
  if(wrap) wrap.className = 'sk-wrap sk-bg-' + P.bg;
  const size = document.getElementById('skSize'), val = document.getElementById('skSizeVal');
  if(size) size.value = P.size;
  if(val) val.textContent = P.size;
  document.getElementById('skUndo').disabled = !e.strokes.length;
  document.getElementById('skRedo').disabled = !e.redo.length;
  document.getElementById('skClear').disabled = !sketchHasInk();
}

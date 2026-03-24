// Storyline Workshop — Main application logic
// Data fetching, parsing, filtering, and rendering.

import { initFirebase, getLikes, incrementLike, getComments, addComment, isFirebaseAvailable } from './firebase.js';

// ─── State ────────────────────────────────────────────────────────────────────

let allResources = [];   // full parsed dataset, never mutated
let filters = {};        // current filter state
let singleResourceId = null; // set when viewing a ?r= permalink
const likedResources = new Set(JSON.parse(localStorage.getItem('sw_liked') || '[]'));

// ─── Utilities ────────────────────────────────────────────────────────────────

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(6, '0').slice(0, 6);
}

function saveLiked() {
  localStorage.setItem('sw_liked', JSON.stringify([...likedResources]));
}

function formatTimestamp(date) {
  if (!date) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function splitValues(str) {
  if (!str) return [];
  return str.split(',').map(v => v.trim()).filter(Boolean);
}

function lessonSortKey(lesson) {
  const num = parseFloat(lesson);
  return isNaN(num) ? 9999 : num;
}

function partSortKey(part) {
  if (!part || part.toLowerCase().includes('whole unit')) return -2;
  if (part.toLowerCase().includes('whole lesson')) return -1;
  const num = parseFloat(part);
  return isNaN(num) ? 9999 : num;
}

// ─── TSV Fetching & Parsing ───────────────────────────────────────────────────

const HEADERS = ['Timestamp', 'Email', 'Program', 'Course', 'UnitName', 'Lesson', 'Part', 'Nickname', 'Description', 'Coherence', 'Link', 'Contributor', 'ProjectTag'];

async function fetchResources() {
  const res = await fetch(CONFIG.sheetUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n');
  // Skip header row (first line)
  const dataLines = lines.slice(1);
  return dataLines
    .filter(line => line.trim())
    .map(line => {
      const cells = line.split('\t');
      const row = {};
      HEADERS.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
      // Generate stable ID from Timestamp + Email before stripping email
      row.id = simpleHash(row.Timestamp + row.Email);
      // Strip email from display — never expose it
      delete row.Email;
      // Parse comma-separated multi-value fields into arrays
      row._lessons = splitValues(row.Lesson);
      row._parts = splitValues(row.Part);
      row._projectTags = splitValues(row.ProjectTag);
      return row;
    });
}

// ─── URL State (Permalinks) ───────────────────────────────────────────────────

const FILTER_URL_KEYS = ['program', 'course', 'unitName', 'lesson', 'part', 'contributor', 'projectTag'];

function readUrlHash() {
  const hash = location.hash.slice(1);
  if (!hash) return {};
  const params = {};
  hash.split('&').forEach(part => {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) return;
    const k = decodeURIComponent(part.slice(0, eqIdx));
    const v = decodeURIComponent(part.slice(eqIdx + 1));
    if (k) params[k] = v;
  });
  return params;
}

function writeUrlHash(extra = {}) {
  const params = {};
  FILTER_URL_KEYS.forEach(k => {
    if (filters[k]) params[k] = filters[k];
  });
  Object.assign(params, extra);
  const str = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

function applyUrlHash(params) {
  FILTER_URL_KEYS.forEach(k => {
    if (params[k]) filters[k] = params[k];
  });
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────

function getFilteredResources() {
  return allResources.filter(r => {
    if (filters.program && r.Program !== filters.program) return false;
    if (filters.course && r.Course !== filters.course) return false;
    if (filters.unitName && r.UnitName !== filters.unitName) return false;
    if (filters.lesson && !r._lessons.includes(filters.lesson)) return false;
    if (filters.part && !r._parts.includes(filters.part)) return false;
    if (filters.contributor && r.Contributor !== filters.contributor) return false;
    if (filters.projectTag && !r._projectTags.includes(filters.projectTag)) return false;
    return true;
  });
}

function getSortedResources(resources) {
  return [...resources].sort((a, b) => {
    const aPartKey = a._parts.length ? Math.min(...a._parts.map(partSortKey)) : 9999;
    const bPartKey = b._parts.length ? Math.min(...b._parts.map(partSortKey)) : 9999;
    if (aPartKey !== bPartKey) return aPartKey - bPartKey;
    const aLesson = a._lessons.length ? Math.min(...a._lessons.map(lessonSortKey)) : 9999;
    const bLesson = b._lessons.length ? Math.min(...b._lessons.map(lessonSortKey)) : 9999;
    if (aLesson !== bLesson) return aLesson - bLesson;
    return aPartKey - bPartKey;
  });
}

// Returns unique sorted values from a plain field
function uniqueValues(resources, field) {
  const vals = [...new Set(resources.map(r => r[field]).filter(Boolean))];
  return sortMixed(vals);
}

// Returns unique sorted values from a pre-parsed array field (multi-value)
function uniqueMultiValues(resources, arrayField) {
  const vals = [...new Set(resources.flatMap(r => r[arrayField]))];
  return sortMixed(vals);
}

function sortMixed(vals) {
  return vals.sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

// ─── Dropdown Building ────────────────────────────────────────────────────────

function buildDropdowns() {
  // For cascading: each dropdown's options are derived from resources already
  // matching all *upstream* filters (filters above it in the cascade).

  const byProgram = allResources.filter(r =>
    !filters.program || r.Program === filters.program
  );
  const byCourse = byProgram.filter(r =>
    !filters.course || r.Course === filters.course
  );
  const byUnit = byCourse.filter(r =>
    !filters.unitName || r.UnitName === filters.unitName
  );
  const byLesson = byUnit.filter(r =>
    !filters.lesson || r._lessons.includes(filters.lesson)
  );
  const byPart = byLesson.filter(r =>
    !filters.part || r._parts.includes(filters.part)
  );

  // Contributor and ProjectTag filter from fully-filtered set (not cascading positionally)
  const fullyFiltered = getFilteredResources();

  setDropdown('filter-program', uniqueValues(allResources, 'Program'), filters.program, 'All Programs');
  setDropdown('filter-course', uniqueValues(byProgram, 'Course'), filters.course, 'All Courses');
  setDropdown('filter-unit', uniqueValues(byCourse, 'UnitName'), filters.unitName, 'All Units');
  setDropdown('filter-lesson', uniqueMultiValues(byUnit, '_lessons'), filters.lesson, 'All Lessons');
  setDropdown('filter-part', uniqueMultiValues(byLesson, '_parts'), filters.part, 'All Parts');
  setDropdown('filter-contributor', uniqueValues(fullyFiltered, 'Contributor'), filters.contributor, 'All Contributors');
  setDropdown('filter-tag', uniqueMultiValues(fullyFiltered, '_projectTags'), filters.projectTag, 'All Tags');
}

function setDropdown(id, options, selected, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === selected) o.selected = true;
    el.appendChild(o);
  });
  // If previously selected value no longer exists in options, clear it
  if (selected && !options.includes(selected)) {
    el.value = '';
  }
}

// ─── Card Rendering ───────────────────────────────────────────────────────────

function cardLabel(resource) {
  const parts = [];
  if (resource.UnitName) parts.push(resource.UnitName);
  if (resource.Lesson && !resource.Lesson.toLowerCase().includes('whole')) {
    parts.push(`Lesson ${resource.Lesson}`);
  }
  if (resource.Part) parts.push(resource.Part);
  return parts.join(' → ');
}

function renderCardHtml(r) {
  return `
    <article class="card" data-id="${r.id}">
      <div class="card-meta">
        ${escapeHtml(cardLabel(r))}
        ${r.Contributor ? ` · <button class="link-btn contributor-filter" data-contributor="${escapeAttr(r.Contributor)}">by ${escapeHtml(r.Contributor)}</button>` : ''}
        ${r._projectTags.map(tag => `<button class="tag tag-filter" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`).join('')}
      </div>
      ${r.Nickname ? `<p class="card-nickname">
        ${r.Link
          ? `<a href="${escapeAttr(r.Link)}" target="_blank" rel="noopener">${escapeHtml(r.Nickname)}</a>`
          : escapeHtml(r.Nickname)}
      </p>` : ''}
      <p class="card-description">${escapeHtml(r.Description)}</p>
      <div class="card-bottom">
        ${r.Coherence ? `<div class="card-coherence"><span class="coherence-label">Coherence:</span> ${escapeHtml(r.Coherence)}</div>` : '<div></div>'}
        <div class="card-actions">
          <button class="like-btn${likedResources.has(r.id) ? ' liked' : ''}" data-id="${r.id}" aria-label="Like this resource">
            <span class="like-icon">♡</span>
            <span class="like-count">…</span>
          </button>
          <button class="comments-toggle" data-id="${r.id}">
            Comments (<span class="comment-count-${r.id}">…</span>)
          </button>
          <a class="permalink-btn" href="?r=${r.id}" data-id="${r.id}" aria-label="Copy link to this resource" title="Copy link">#</a>
        </div>
      </div>
      <div class="comments-section" id="comments-${r.id}" hidden>
        <div class="comments-list" id="comments-list-${r.id}">
          <p class="loading-msg">Loading comments…</p>
        </div>
        <div class="comment-form">
          <input class="comment-name" type="text" placeholder="Your name" maxlength="80" />
          <textarea class="comment-text" placeholder="Add a comment…" rows="2" maxlength="2000"></textarea>
          <button class="comment-submit" data-id="${r.id}">Post</button>
        </div>
      </div>
    </article>`;
}

function renderCards(resources) {
  const container = document.getElementById('results');
  const countEl = document.getElementById('result-count');

  if (resources.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No resources match these filters yet. Know something that belongs here?</p>
        <a href="${CONFIG.formUrl}" target="_blank" rel="noopener">Submit a resource →</a>
      </div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) {
    countEl.textContent = `${resources.length} resource${resources.length === 1 ? '' : 's'}`;
  }

  container.innerHTML = resources.map(r => renderCardHtml(r)).join('');

  // Load likes asynchronously
  resources.forEach(r => loadLikes(r.id));
}

function renderSingleResource(resource) {
  document.querySelector('.filter-bar').hidden = true;
  const container = document.getElementById('results');
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = '';

  const moreButtons = [];
  if (resource.UnitName) {
    moreButtons.push(`
      <button class="see-more-btn"
        data-program="${escapeAttr(resource.Program)}"
        data-course="${escapeAttr(resource.Course)}"
        data-unitname="${escapeAttr(resource.UnitName)}">
        See more from this unit: <strong>${escapeHtml(resource.UnitName)}</strong>
      </button>`);
  }
  resource._lessons.forEach(lesson => {
    moreButtons.push(`
      <button class="see-more-btn"
        data-program="${escapeAttr(resource.Program)}"
        data-course="${escapeAttr(resource.Course)}"
        data-unitname="${escapeAttr(resource.UnitName)}"
        data-lesson="${escapeAttr(lesson)}">
        See more from Lesson <strong>${escapeHtml(lesson)}</strong>
      </button>`);
  });

  container.innerHTML = `
    <div class="single-resource-header">
      <button class="back-btn" id="back-to-list">← All resources</button>
    </div>
    ${renderCardHtml(resource)}
    ${moreButtons.length ? `<div class="single-resource-more">${moreButtons.join('')}</div>` : ''}
  `;

  loadLikes(resource.id);
}

function exitSingleResource(newFilters) {
  singleResourceId = null;
  document.querySelector('.filter-bar').hidden = false;
  history.pushState(null, '', location.pathname);
  resetFilters();
  if (newFilters) Object.assign(filters, newFilters);
  update();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;');
}

// ─── Likes ────────────────────────────────────────────────────────────────────

async function loadLikes(resourceId) {
  const count = await getLikes(resourceId);
  updateLikeUI(resourceId, count);
}

function updateLikeUI(resourceId, count) {
  const btn = document.querySelector(`.like-btn[data-id="${resourceId}"]`);
  if (!btn) return;
  const countEl = btn.querySelector('.like-count');
  const iconEl = btn.querySelector('.like-icon');
  if (countEl) countEl.textContent = count;
  if (iconEl) iconEl.textContent = likedResources.has(resourceId) ? '♥' : '♡';
  btn.classList.toggle('liked', likedResources.has(resourceId));
}

async function handleLike(resourceId) {
  if (likedResources.has(resourceId)) return; // already liked
  likedResources.add(resourceId);
  saveLiked();
  // Optimistic UI update
  const btn = document.querySelector(`.like-btn[data-id="${resourceId}"]`);
  if (btn) {
    const countEl = btn.querySelector('.like-count');
    const iconEl = btn.querySelector('.like-icon');
    if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + 1;
    if (iconEl) iconEl.textContent = '♥';
    btn.classList.add('liked');
  }
  await incrementLike(resourceId);
}

// ─── Comments ─────────────────────────────────────────────────────────────────

async function loadComments(resourceId) {
  const listEl = document.getElementById(`comments-list-${resourceId}`);
  if (!listEl) return;

  if (!isFirebaseAvailable()) {
    listEl.innerHTML = '<p class="comments-unavailable">Comments unavailable — Firebase not configured.</p>';
    updateCommentCount(resourceId, '?');
    return;
  }

  listEl.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const comments = await getComments(resourceId);
    updateCommentCount(resourceId, comments.length);
    if (comments.length === 0) {
      listEl.innerHTML = '<p class="no-comments">No comments yet. Be the first!</p>';
    } else {
      listEl.innerHTML = comments.map(c => `
        <div class="comment">
          <div class="comment-header">
            <strong class="comment-author">${escapeHtml(c.name)}</strong>
            <span class="comment-time">${formatTimestamp(c.timestamp)}</span>
          </div>
          <p class="comment-text">${escapeHtml(c.text)}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    listEl.innerHTML = '<p class="error-msg">Failed to load comments.</p>';
  }
}

function updateCommentCount(resourceId, count) {
  document.querySelectorAll(`.comment-count-${resourceId}`).forEach(el => {
    el.textContent = count;
  });
}

async function handlePostComment(resourceId) {
  const section = document.getElementById(`comments-${resourceId}`);
  if (!section) return;
  const nameInput = section.querySelector('.comment-name');
  const textInput = section.querySelector('.comment-text');
  const submitBtn = section.querySelector('.comment-submit');

  const name = nameInput.value.trim();
  const text = textInput.value.trim();

  if (!name || !text) {
    alert('Please enter your name and a comment.');
    return;
  }

  // Remember name across sessions
  localStorage.setItem('sw_commenter_name', name);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';
  try {
    await addComment(resourceId, name, text);
    textInput.value = '';
    await loadComments(resourceId);
  } catch (err) {
    alert('Failed to post comment. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post';
  }
}

// ─── Event Delegation ─────────────────────────────────────────────────────────

function attachEventListeners() {
  // Filter dropdowns
  const filterIds = ['filter-program', 'filter-course', 'filter-unit', 'filter-lesson', 'filter-part', 'filter-contributor', 'filter-tag'];
  const filterKeys = ['program', 'course', 'unitName', 'lesson', 'part', 'contributor', 'projectTag'];

  filterIds.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      filters[filterKeys[i]] = el.value || undefined;
      update();
    });
  });

  // Clear filters
  document.getElementById('clear-filters')?.addEventListener('click', e => {
    e.preventDefault();
    resetFilters();
    update();
  });

  // Refresh data
  document.getElementById('refresh-btn')?.addEventListener('click', async e => {
    e.preventDefault();
    await loadData();
  });

  // Delegated: like buttons, contributor filter, tag filter, comments toggle, comment submit
  document.getElementById('results')?.addEventListener('click', async e => {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      await handleLike(likeBtn.dataset.id);
      return;
    }

    const contributorBtn = e.target.closest('.contributor-filter');
    if (contributorBtn) {
      filters.contributor = contributorBtn.dataset.contributor;
      document.getElementById('filter-contributor').value = filters.contributor;
      update();
      return;
    }

    const tagBtn = e.target.closest('.tag-filter');
    if (tagBtn) {
      filters.projectTag = tagBtn.dataset.tag;
      document.getElementById('filter-tag').value = filters.projectTag;
      update();
      return;
    }

    const commentsToggle = e.target.closest('.comments-toggle');
    if (commentsToggle) {
      const id = commentsToggle.dataset.id;
      const section = document.getElementById(`comments-${id}`);
      if (section) {
        const isHidden = section.hidden;
        section.hidden = !isHidden;
        if (isHidden) {
          // Restore remembered name
          const remembered = localStorage.getItem('sw_commenter_name');
          const nameInput = section.querySelector('.comment-name');
          if (remembered && nameInput) nameInput.value = remembered;
          await loadComments(id);
        }
      }
      return;
    }

    const commentSubmit = e.target.closest('.comment-submit');
    if (commentSubmit) {
      await handlePostComment(commentSubmit.dataset.id);
      return;
    }

    const permalinkBtn = e.target.closest('.permalink-btn');
    if (permalinkBtn) {
      e.preventDefault();
      const id = permalinkBtn.dataset.id;
      const url = `${location.origin}${location.pathname}?r=${id}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      permalinkBtn.textContent = '✓';
      setTimeout(() => { permalinkBtn.textContent = '#'; }, 1500);
      return;
    }

    const backBtn = e.target.closest('#back-to-list');
    if (backBtn) {
      exitSingleResource({});
      return;
    }

    const seeMoreBtn = e.target.closest('.see-more-btn');
    if (seeMoreBtn) {
      const d = seeMoreBtn.dataset;
      const newFilters = {};
      if (d.program) newFilters.program = d.program;
      if (d.course) newFilters.course = d.course;
      if (d.unitname) newFilters.unitName = d.unitname;
      if (d.lesson) newFilters.lesson = d.lesson;
      exitSingleResource(newFilters);
    }
  });
}

// ─── Filters Reset ────────────────────────────────────────────────────────────

function resetFilters() {
  filters = {
    program: CONFIG.defaults.program || undefined,
    course: CONFIG.defaults.course || undefined,
  };
  // Sync dropdowns to default state
  document.getElementById('filter-program').value = filters.program || '';
  document.getElementById('filter-course').value = filters.course || '';
  ['filter-unit', 'filter-lesson', 'filter-part', 'filter-contributor', 'filter-tag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Clear non-default filter keys
  delete filters.unitName;
  delete filters.lesson;
  delete filters.part;
  delete filters.contributor;
  delete filters.projectTag;
}

// ─── Update (re-render) ───────────────────────────────────────────────────────

function update() {
  if (singleResourceId) {
    const resource = allResources.find(r => r.id === singleResourceId);
    if (resource) {
      renderSingleResource(resource);
      return;
    }
    singleResourceId = null; // not found, fall through to list
  }
  document.querySelector('.filter-bar').hidden = false;
  const filtered = getSortedResources(getFilteredResources());
  buildDropdowns();
  renderCards(filtered);
  writeUrlHash();
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadData() {
  const container = document.getElementById('results');
  const countEl = document.getElementById('result-count');
  container.innerHTML = '<p class="loading-msg">Loading resources…</p>';
  if (countEl) countEl.textContent = '';

  try {
    allResources = await fetchResources();
    update();
  } catch (err) {
    console.error('Failed to load resources:', err);
    container.innerHTML = `
      <div class="error-state">
        <p>Couldn't load resources. Try refreshing.</p>
        <button id="retry-btn" class="btn-retry">Retry</button>
      </div>`;
    document.getElementById('retry-btn')?.addEventListener('click', loadData);
    if (countEl) countEl.textContent = '';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  initFirebase(CONFIG.firebase);
  singleResourceId = new URLSearchParams(location.search).get('r') || null;
  resetFilters();
  if (!singleResourceId) {
    const urlParams = readUrlHash();
    applyUrlHash(urlParams);
  }
  attachEventListeners();
  await loadData();
}

init();

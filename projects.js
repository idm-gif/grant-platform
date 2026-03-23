/* ============================================
   Projects Page — JavaScript
   Parses projects.xml, filters, search, modal
   ============================================ */
(function () {
  'use strict';

  // ---- i18n ----
  const I18N = {
    ua: {
      filter_program: 'Грантова програма',
      filter_section: 'Тематика',
      filter_type: 'Тип',
      filter_applicant: 'Хто може подати',
      filter_status: 'Статус',
      show_archived: 'Показати архівні',
      view_by_program: 'По програмах',
      view_all: 'Всі',
      showing: 'Показано',
      of: 'з',
      projects: 'проєктів',
      clear_all: 'Скинути всі',
      deadline: 'Дедлайн',
      no_results: 'Нічого не знайдено',
      no_results_hint: 'Спробуйте змінити фільтри або пошуковий запит',
      organizer: 'Організатор / Organizer',
      co_organizer: 'Співорганізатор / Co-Organizer',
      type_label: 'Тип / Type',
      section_label: 'Секція / Section',
      who_can_apply: 'Хто може подати / Who can apply',
      funding_directions: 'Напрями фінансування / Funding directions',
      documents_required: 'Необхідні документи / Documents required',
      quick_links: 'Швидкі посилання / Quick links',
      apply: 'Подати заявку / Apply',
      info: 'Детальніше / Info',
      submission_deadline: 'Дедлайн подачі / Submission deadline',
      parent_program: 'Батьківська програма',
      reference_id: 'Reference ID',
      uncategorized: 'Без програми / Uncategorized',
      archive_badge: 'Архів',
      programme_page: 'Programme Page',
      programme_guide: 'Programme Guide',
      n_projects: 'проєктів',
      search_placeholder: 'Пошук проєктів... / Search projects...',
    },
    en: {
      filter_program: 'Grant Program',
      filter_section: 'Section',
      filter_type: 'Type',
      filter_applicant: 'Who can apply',
      filter_status: 'Status',
      show_archived: 'Show archived',
      view_by_program: 'By Program',
      view_all: 'All',
      showing: 'Showing',
      of: 'of',
      projects: 'projects',
      clear_all: 'Clear all',
      deadline: 'Deadline',
      no_results: 'No results found',
      no_results_hint: 'Try changing filters or search query',
      organizer: 'Organizer',
      co_organizer: 'Co-Organizer',
      type_label: 'Type',
      section_label: 'Section',
      who_can_apply: 'Who can apply',
      funding_directions: 'Funding directions',
      documents_required: 'Documents required',
      quick_links: 'Quick links',
      apply: 'Apply',
      info: 'Info',
      submission_deadline: 'Submission Deadline',
      parent_program: 'Parent program',
      reference_id: 'Reference ID',
      uncategorized: 'Uncategorized',
      archive_badge: 'Archived',
      programme_page: 'Programme Page',
      programme_guide: 'Programme Guide',
      n_projects: 'projects',
      search_placeholder: 'Search projects...',
    },
  };
  let currentLang = 'ua';
  function t(key) { return (I18N[currentLang] || I18N.ua)[key] || key; }

  // ---- State ----
  let allProjects = [];
  let groups = {};        // groupName -> { nodeName, projects:[] }
  let filteredProjects = [];
  let activeFilters = { program: [], section: [], type: [], applicant: [], status: [] };
  let showArchived = false;
  let viewMode = 'program'; // 'program' | 'all'
  let searchQuery = '';
  let openDropdown = null;
  let collapsedGroups = new Set();

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  // ---- Parse XML ----
  async function loadData() {
    try {
      const resp = await fetch('projects.xml');
      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      parseGraph(doc);
      buildFilterOptions();
      applyFilters();
      hideLoading();
    } catch (err) {
      console.error('Failed to load projects.xml', err);
      hideLoading();
    }
  }

  function parseGraph(doc) {
    // 1. Collect group nodes (Type_attestation)
    const groupNodes = doc.querySelectorAll('Node[nclass="Type_attestation"]');
    const groupMap = {};
    groupNodes.forEach(n => {
      const name = n.getAttribute('nodeName');
      groupMap[name] = { nodeName: name, projects: [] };
    });

    // 2. Collect project nodes (ПРОЕКТИ with data children, skip root)
    const projectNodes = [...doc.querySelectorAll('Node[nclass="ПРОЕКТИ"]')]
      .filter(n => n.querySelector('data'));

    // 3. Build edge map: node1 -> node2
    const edgeMap = {};
    doc.querySelectorAll('Edge').forEach(e => {
      const n1 = e.getAttribute('node1');
      const n2 = e.getAttribute('node2');
      if (!edgeMap[n1]) edgeMap[n1] = [];
      edgeMap[n1].push(n2);
    });

    // 4. Parse projects
    projectNodes.forEach(node => {
      const p = parseProject(node);
      // Determine group via edges
      const nodeName = node.getAttribute('nodeName');
      const parentNames = edgeMap[nodeName] || [];
      // Find the Type_attestation parent
      let assignedGroup = null;
      for (const pn of parentNames) {
        if (groupMap[pn]) {
          assignedGroup = pn;
          break;
        }
      }
      p._group = assignedGroup || '(empty)';
      p._nodeName = nodeName;
      allProjects.push(p);
    });

    // 5. Group projects
    // Ensure (empty) group
    if (!groupMap['(empty)']) {
      groupMap['(empty)'] = { nodeName: '(empty)', projects: [] };
    }
    allProjects.forEach(p => {
      if (!groupMap[p._group]) {
        groupMap[p._group] = { nodeName: p._group, projects: [] };
      }
      groupMap[p._group].projects.push(p);
    });
    groups = groupMap;
  }

  function parseProject(node) {
    const p = { _data: {} };
    const dataEls = node.querySelectorAll('data');
    const multiFields = new Set([
      'List_what_is_founding_directions_of_foundings',
      // Who_can_sumbit can have comma-separated values
    ]);
    dataEls.forEach(d => {
      const tc = d.getAttribute('tclass');
      const link = d.getAttribute('link') || '';
      const type = d.getAttribute('type') || 'text';
      const text = d.textContent.trim() || link;
      if (multiFields.has(tc)) {
        if (!p._data[tc]) p._data[tc] = [];
        p._data[tc].push(text);
      } else if (p._data[tc] !== undefined) {
        // Already has value — make array
        if (!Array.isArray(p._data[tc])) p._data[tc] = [p._data[tc]];
        p._data[tc].push({ text, link, type });
      } else {
        p._data[tc] = { text, link, type };
      }
    });

    // Convenience accessors
    p.name = getField(p, 'с');
    p.code = getField(p, 'code');
    p.type = getField(p, 'Type');
    p.typeAttestation = getField(p, 'Type_attestation');
    p.section = getField(p, 'Section');
    p.sections = p.section ? p.section.split(',').map(s => s.trim()).filter(Boolean) : [];
    p.fundingDirections = p._data['List_what_is_founding_directions_of_foundings'] || [];
    p.whoCanSubmit = getField(p, 'Who_can_sumbit');
    p.whoCanSubmitList = p.whoCanSubmit ? p.whoCanSubmit.split(',').map(s => s.trim()).filter(Boolean) : [];
    p.acronym = getField(p, 'Acronym');
    p.organizer = getField(p, 'Organizator');
    p.coOrganizer = getField(p, 'Co-Organizator');
    p.parentProgram = getField(p, 'In_terms_of_parent_program');
    p.deadline = getField(p, 'Last_submition_deadline');
    p.submissionOpening = getField(p, 'Submition_opening');
    p.documents = getField(p, 'Documents_required_to_be_prepared');
    p.status = getField(p, 'Status') || '';
    p.image = getFieldLink(p, 'Image') || getField(p, 'Image');
    p.link = getFieldLink(p, 'Link') || getField(p, 'Link');
    p.linkInfo = getFieldLink(p, 'Link_info') || getField(p, 'Link_info');
    p.linkInfoText = getFieldText(p, 'Link_info');
    p.weekNumber = getField(p, 'Номер_тижня');

    p.isArchived = /^(archived?|closed)$/i.test(p.status);
    p._deadlineParsed = parseDate(p.deadline);

    return p;
  }

  function getField(p, key) {
    const d = p._data[key];
    if (!d) return '';
    if (Array.isArray(d)) return d.map(x => typeof x === 'object' ? x.text : x).join(', ');
    return typeof d === 'object' ? d.text : d;
  }

  function getFieldLink(p, key) {
    const d = p._data[key];
    if (!d) return '';
    if (Array.isArray(d)) {
      const found = d.find(x => typeof x === 'object' && x.link);
      return found ? found.link : '';
    }
    return typeof d === 'object' ? d.link : '';
  }

  function getFieldText(p, key) {
    const d = p._data[key];
    if (!d) return '';
    if (Array.isArray(d)) return d.map(x => typeof x === 'object' ? x.text : x).join(', ');
    return typeof d === 'object' ? d.text : d;
  }

  function parseDate(str) {
    if (!str) return null;
    // Try DD.MM.YYYY
    let m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    // Try MM/DD/YYYY
    m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    // Try YYYY-MM-DD
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function formatDate(str) {
    const d = parseDate(str);
    if (!d) return str;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  // ---- Filter Options ----
  function buildFilterOptions() {
    const programs = new Set();
    const sections = new Set();
    const types = new Set();
    const applicants = new Set();
    const statuses = new Set();

    allProjects.forEach(p => {
      if (p._group && p._group !== '(empty)') programs.add(p._group);
      if (p._group === '(empty)') programs.add('(empty)');
      p.sections.forEach(s => sections.add(s));
      if (p.type) types.add(p.type);
      p.whoCanSubmitList.forEach(a => applicants.add(a));
      if (p.status) statuses.add(p.status);
    });

    renderDropdown('panel-program', [...programs].sort(), 'program');
    renderDropdown('panel-section', [...sections].sort(), 'section');
    renderDropdown('panel-type', [...types].sort(), 'type');
    renderDropdown('panel-applicant', [...applicants].sort(), 'applicant');
    renderDropdown('panel-status', [...statuses].sort(), 'status');
  }

  function renderDropdown(panelId, items, filterKey) {
    const panel = document.getElementById(panelId);
    panel.innerHTML = items.map(item => {
      const label = item === '(empty)' ? t('uncategorized') : item;
      const selected = activeFilters[filterKey].includes(item) ? ' selected' : '';
      return `<div class="proj-dropdown-item${selected}" data-value="${escHtml(item)}">
        <span class="check-box"></span>
        <span>${escHtml(label)}</span>
      </div>`;
    }).join('');

    panel.querySelectorAll('.proj-dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        const val = el.dataset.value;
        const idx = activeFilters[filterKey].indexOf(val);
        if (idx >= 0) {
          activeFilters[filterKey].splice(idx, 1);
          el.classList.remove('selected');
        } else {
          activeFilters[filterKey].push(val);
          el.classList.add('selected');
        }
        updateFilterBtnState(filterKey);
        applyFilters();
      });
    });
  }

  function updateFilterBtnState(filterKey) {
    const btn = document.getElementById('btn-filter-' + filterKey);
    if (!btn) return;
    if (activeFilters[filterKey].length > 0) {
      btn.classList.add('has-active');
    } else {
      btn.classList.remove('has-active');
    }
  }

  // ---- Filter Logic ----
  function applyFilters() {
    const q = searchQuery.toLowerCase();
    filteredProjects = allProjects.filter(p => {
      // Archive filter
      if (!showArchived && p.isArchived) return false;

      // Text search
      if (q) {
        const haystack = [p.name, p.section, p.organizer, p.whoCanSubmit,
          p.fundingDirections.join(' '), p.acronym, p.code, p.coOrganizer].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Filter: program
      if (activeFilters.program.length > 0) {
        if (!activeFilters.program.includes(p._group)) return false;
      }
      // Filter: section
      if (activeFilters.section.length > 0) {
        if (!p.sections.some(s => activeFilters.section.includes(s))) return false;
      }
      // Filter: type
      if (activeFilters.type.length > 0) {
        if (!activeFilters.type.includes(p.type)) return false;
      }
      // Filter: applicant
      if (activeFilters.applicant.length > 0) {
        if (!p.whoCanSubmitList.some(a => activeFilters.applicant.includes(a))) return false;
      }
      // Filter: status
      if (activeFilters.status.length > 0) {
        if (!activeFilters.status.includes(p.status)) return false;
      }

      return true;
    });

    // Sort: active first, then by deadline
    filteredProjects.sort((a, b) => {
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      const da = a._deadlineParsed ? a._deadlineParsed.getTime() : Infinity;
      const db = b._deadlineParsed ? b._deadlineParsed.getTime() : Infinity;
      return da - db;
    });

    renderCounter();
    renderActivePills();
    renderProjects();
  }

  function renderCounter() {
    const total = showArchived ? allProjects.length : allProjects.filter(p => !p.isArchived).length;
    const shown = filteredProjects.length;
    const el = document.getElementById('proj-counter');
    el.textContent = `${t('showing')} ${shown} ${t('of')} ${total} ${t('projects')}`;
  }

  function renderActivePills() {
    const container = document.getElementById('active-filters');
    const pills = [];

    Object.keys(activeFilters).forEach(key => {
      activeFilters[key].forEach(val => {
        const label = val === '(empty)' ? t('uncategorized') : val;
        pills.push(`<span class="proj-pill">${escHtml(label)} <span class="proj-pill-close" data-key="${key}" data-value="${escHtml(val)}">&times;</span></span>`);
      });
    });

    if (pills.length > 0) {
      pills.push(`<button class="proj-clear-all" id="clear-all-filters">${t('clear_all')}</button>`);
    }

    container.innerHTML = pills.join('');

    container.querySelectorAll('.proj-pill-close').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.key;
        const val = el.dataset.value;
        const idx = activeFilters[key].indexOf(val);
        if (idx >= 0) activeFilters[key].splice(idx, 1);
        // Update dropdown
        const panel = document.getElementById('panel-' + key);
        if (panel) {
          const item = panel.querySelector(`.proj-dropdown-item[data-value="${CSS.escape(val)}"]`);
          if (item) item.classList.remove('selected');
        }
        updateFilterBtnState(key);
        applyFilters();
      });
    });

    const clearBtn = document.getElementById('clear-all-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        Object.keys(activeFilters).forEach(key => {
          activeFilters[key] = [];
          updateFilterBtnState(key);
        });
        $$('.proj-dropdown-item.selected').forEach(el => el.classList.remove('selected'));
        applyFilters();
      });
    }
  }

  // ---- Rendering ----
  function renderProjects() {
    const container = document.getElementById('projects-container');

    if (filteredProjects.length === 0) {
      container.innerHTML = `<div class="proj-empty">
        <div class="proj-empty-icon">&#128269;</div>
        <div class="proj-empty-text">${t('no_results')}</div>
        <p style="color:var(--text-muted);margin-top:8px">${t('no_results_hint')}</p>
      </div>`;
      return;
    }

    if (viewMode === 'program') {
      renderByProgram(container);
    } else {
      renderFlat(container);
    }
  }

  function renderByProgram(container) {
    // Determine group order: groups with visible projects
    const groupOrder = [];
    const projectsByGroup = {};

    filteredProjects.forEach(p => {
      if (!projectsByGroup[p._group]) projectsByGroup[p._group] = [];
      projectsByGroup[p._group].push(p);
    });

    // Named groups first (sorted), then (empty)
    Object.keys(projectsByGroup).sort((a, b) => {
      if (a === '(empty)') return 1;
      if (b === '(empty)') return -1;
      return a.localeCompare(b);
    }).forEach(g => groupOrder.push(g));

    let html = '';
    groupOrder.forEach(groupName => {
      const projects = projectsByGroup[groupName];
      const label = groupName === '(empty)' ? t('uncategorized') : groupName;
      const isCollapsed = collapsedGroups.has(groupName);
      const collClass = isCollapsed ? ' collapsed' : '';

      html += `<div class="proj-group">
        <div class="proj-group-header${collClass}" data-group="${escHtml(groupName)}">
          <span class="proj-group-bar"></span>
          <span class="proj-group-name">${escHtml(label)}</span>
          <span class="proj-group-count">(${projects.length} ${t('n_projects')})</span>
          <svg class="proj-group-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="proj-group-body${collClass}" id="group-${hashCode(groupName)}">
          ${projects.map(p => renderCard(p)).join('')}
        </div>
      </div>`;
    });

    container.innerHTML = html;
    bindGroupToggle();
    bindCardClicks();
  }

  function renderFlat(container) {
    container.innerHTML = `<div class="proj-flat-grid">${filteredProjects.map(p => renderCard(p)).join('')}</div>`;
    bindCardClicks();
  }

  function renderCard(p) {
    const statusLower = p.status.toLowerCase();
    const archivedClass = p.isArchived ? ' archived' : '';
    const imgHtml = p.image
      ? `<img class="proj-card-img" src="${escHtml(p.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : '';

    const desc = p.fundingDirections.length > 0
      ? p.fundingDirections[0]
      : (p.section || '');

    return `<div class="proj-card${archivedClass}" data-project="${escHtml(p._nodeName)}">
      ${imgHtml}
      <div class="proj-card-body">
        <div class="proj-card-badges">
          <span class="proj-badge proj-badge-program">${escHtml(p.acronym || shortGroupName(p._group))}</span>
          ${p.status && statusLower !== 'no data' ? `<span class="proj-badge proj-badge-status" data-status="${escHtml(statusLower)}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:2px"></span>${escHtml(p.status)}</span>` : ''}
        </div>
        <div class="proj-card-title">${escHtml(p.name)}</div>
        <div class="proj-card-desc">${escHtml(desc)}</div>
        <div class="proj-card-meta">
          ${p.deadline ? `<span class="proj-card-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            ${t('deadline')}: ${formatDate(p.deadline)}
          </span>` : '<span></span>'}
          <span class="proj-card-meta-item">
            ${p.type ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/>${p.type === 'Collective' ? '<path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>' : ''}</svg>` : ''}
            ${escHtml(p.type)}
          </span>
        </div>
      </div>
    </div>`;
  }

  function shortGroupName(name) {
    if (!name || name === '(empty)') return '—';
    // Extract short name: remove (pXX) suffix
    return name.replace(/\s*\(p\d+\)$/, '');
  }

  // ---- Card & Group Interactions ----
  function bindGroupToggle() {
    $$('.proj-group-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const groupName = hdr.dataset.group;
        const body = hdr.nextElementSibling;
        if (collapsedGroups.has(groupName)) {
          collapsedGroups.delete(groupName);
          hdr.classList.remove('collapsed');
          body.classList.remove('collapsed');
        } else {
          collapsedGroups.add(groupName);
          hdr.classList.add('collapsed');
          body.classList.add('collapsed');
        }
      });
    });
  }

  function bindCardClicks() {
    $$('.proj-card').forEach(card => {
      card.addEventListener('click', () => {
        const nodeName = card.dataset.project;
        const project = allProjects.find(p => p._nodeName === nodeName);
        if (project) openModal(project);
      });
    });
  }

  // ---- Modal ----
  function openModal(p) {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');

    const groupLabel = p._group === '(empty)' ? t('uncategorized') : p._group;

    let leftSections = '';

    // Organizer
    if (p.organizer) {
      leftSections += modalSection(t('organizer'), escHtml(p.organizer));
    }
    if (p.coOrganizer) {
      leftSections += modalSection(t('co_organizer'), escHtml(p.coOrganizer));
    }

    // Type & Section
    const typeSection = [];
    if (p.type) typeSection.push(modalMiniField(t('type_label'), p.type));
    if (p.section) typeSection.push(modalMiniField(t('section_label'), p.section));
    if (typeSection.length) {
      leftSections += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">${typeSection.join('')}</div>`;
    }

    // Who can apply
    if (p.whoCanSubmit) {
      leftSections += modalSection(t('who_can_apply'),
        `<span style="display:inline-flex;align-items:center;gap:6px">&#127760; ${escHtml(p.whoCanSubmit)}</span>`);
    }

    // Funding directions
    if (p.fundingDirections.length > 0) {
      const list = p.fundingDirections.map(d => `<li>${escHtml(d)}</li>`).join('');
      leftSections += modalSection(t('funding_directions'), `<ul class="proj-modal-list">${list}</ul>`);
    }

    // Right side: deadlines + documents
    let rightSections = '';

    // Deadline box
    if (p.deadline) {
      rightSections += `<div class="proj-modal-deadline-box">
        <div class="proj-modal-deadline-label">${t('submission_deadline')}</div>
        <div class="proj-modal-deadline-date">${formatDate(p.deadline)}</div>
        ${p.weekNumber ? `<div class="proj-modal-deadline-sub">Week ${p.weekNumber}</div>` : ''}
      </div>`;
    }

    // Documents
    if (p.documents) {
      rightSections += `<div style="margin-top:14px">${modalSection(t('documents_required'),
        `<div style="font-style:italic;color:var(--accent-amber)">${escHtml(p.documents)}</div>`)}</div>`;
    }

    // Quick links
    const links = [];
    if (p.link) links.push(`<a href="${escHtml(p.link)}" target="_blank" rel="noopener" class="proj-modal-link-btn primary">&#128640; ${t('apply')}</a>`);
    if (p.linkInfo && p.linkInfo.startsWith('http')) {
      links.push(`<a href="${escHtml(p.linkInfo)}" target="_blank" rel="noopener" class="proj-modal-link-btn secondary">&#9432; ${t('info')}</a>`);
    }

    let linksHtml = '';
    if (links.length > 0) {
      linksHtml = `<div style="margin-top:16px">
        <div class="proj-modal-label">${t('quick_links')}</div>
        <div class="proj-modal-links">${links.join('')}</div>
      </div>`;
    }

    const statusBadge = p.status
      ? `<span class="proj-badge proj-badge-status" data-status="${escHtml(p.status.toLowerCase())}" style="font-size:0.75rem"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:3px"></span>${escHtml(p.status)}</span>`
      : '';

    body.innerHTML = `
      <button class="modal-close" onclick="document.getElementById('modal-overlay').classList.remove('visible')">&times;</button>
      <div class="proj-modal-top">
        ${p.image ? `<img class="proj-modal-img" src="${escHtml(p.image)}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="proj-modal-header">
          <h2>${escHtml(p.name)}</h2>
          <div class="proj-modal-parent">${t('parent_program')}: <a href="#">${escHtml(p.parentProgram || groupLabel)}</a></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${statusBadge}
            ${p.acronym ? `<span class="proj-badge proj-badge-program">${escHtml(p.acronym)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="proj-modal-grid">
        <div>${leftSections}${linksHtml}</div>
        <div>${rightSections}</div>
      </div>
      ${p.code ? `<div class="proj-modal-ref"><span>${t('reference_id')}:</span> ${escHtml(p.code)}</div>` : ''}
    `;

    overlay.classList.add('visible');
  }

  function modalSection(label, content) {
    return `<div class="proj-modal-section">
      <div class="proj-modal-label">${label}</div>
      <div class="proj-modal-value">${content}</div>
    </div>`;
  }

  function modalMiniField(label, value) {
    return `<div>
      <div class="proj-modal-label">${escHtml(label)}</div>
      <div class="proj-modal-value">${escHtml(value)}</div>
    </div>`;
  }

  // ---- Utilities ----
  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function hideLoading() {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
  }

  // ---- Event Bindings ----
  function initEvents() {
    // Search
    const searchInput = document.getElementById('proj-search');
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      applyFilters();
    });

    // ESC to clear search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('modal-overlay');
        if (overlay.classList.contains('visible')) {
          overlay.classList.remove('visible');
        } else if (searchInput.value) {
          searchInput.value = '';
          searchQuery = '';
          applyFilters();
          searchInput.blur();
        }
      }
    });

    // Modal close on backdrop click
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        e.target.classList.remove('visible');
      }
    });

    // Filter dropdowns
    $$('.proj-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = btn.closest('.proj-filter-dropdown');
        const panel = dd.querySelector('.proj-dropdown-panel');
        const isOpen = panel.classList.contains('open');

        // Close all panels
        $$('.proj-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        $$('.proj-filter-btn.open').forEach(b => b.classList.remove('open'));

        if (!isOpen) {
          panel.classList.add('open');
          btn.classList.add('open');
          openDropdown = panel;
        } else {
          openDropdown = null;
        }
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      if (openDropdown) {
        $$('.proj-dropdown-panel.open').forEach(p => p.classList.remove('open'));
        $$('.proj-filter-btn.open').forEach(b => b.classList.remove('open'));
        openDropdown = null;
      }
    });

    // Stop propagation inside panels
    $$('.proj-dropdown-panel').forEach(p => {
      p.addEventListener('click', e => e.stopPropagation());
    });

    // Archive toggle
    document.getElementById('toggle-archived').addEventListener('change', (e) => {
      showArchived = e.target.checked;
      applyFilters();
    });

    // View mode
    document.getElementById('btn-view-program').addEventListener('click', () => {
      viewMode = 'program';
      document.getElementById('btn-view-program').classList.add('active');
      document.getElementById('btn-view-all').classList.remove('active');
      renderProjects();
    });
    document.getElementById('btn-view-all').addEventListener('click', () => {
      viewMode = 'all';
      document.getElementById('btn-view-all').classList.add('active');
      document.getElementById('btn-view-program').classList.remove('active');
      renderProjects();
    });

    // Language switch
    $$('.proj-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentLang = btn.dataset.lang;
        $$('.proj-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateI18n();
        applyFilters();
      });
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
      const navbar = document.getElementById('navbar');
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });

    // Hamburger menu
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) {
      hamburger.addEventListener('click', () => {
        document.getElementById('nav-links').classList.toggle('open');
        hamburger.classList.toggle('active');
      });
    }
  }

  function updateI18n() {
    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    const searchInput = document.getElementById('proj-search');
    if (searchInput) searchInput.placeholder = t('search_placeholder');
  }

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadData();
  });
})();

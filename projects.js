/* ============================================
   Projects Page — JavaScript
   Parses projects.xml graph, renders cards,
   filters, search, detail modal
   ============================================ */
(function () {
  'use strict';

  /* ---------- i18n ---------- */
  var I18N = {
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
      n_projects: 'проєктів',
      search_placeholder: 'Пошук проєктів... / Search projects...',
      all_filters: 'Всі фільтри',
      apply_filters: 'Застосувати',
      view_full_page: 'Переглянути повну сторінку',
      copy_link: 'Копіювати посилання',
      link_copied: 'Посилання скопійовано!',
      back_to_explorer: '← Назад до проєктів',
      submission_opening: 'Дата відкриття подачі / Submission opening',
      type_attestation: 'Атестаційна програма / Attestation program',
      acronym_label: 'Акронім / Acronym',
      status_label: 'Статус / Status',
      project_code: 'Код проєкту / Project code',
      additional_info: 'Додаткова інформація / Additional info',
      link_info_label: 'Інформаційне посилання / Info link',
      date_filter: 'Дати',
      date_from: 'Від',
      date_to: 'До',
      dates_title: 'Дати',
      clear_date: 'Скинути',
      view_calendar: 'Календар',
      cal_month: 'Місяць',
      cal_week: 'Тиждень',
      cal_add_gcal: 'Додати до Google Calendar',
      cal_overflow_more: 'ще'
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
      n_projects: 'projects',
      search_placeholder: 'Search projects...',
      all_filters: 'All Filters',
      apply_filters: 'Apply',
      view_full_page: 'View Full Page',
      copy_link: 'Copy Link',
      link_copied: 'Link copied!',
      back_to_explorer: '← Back to Projects',
      submission_opening: 'Submission opening',
      type_attestation: 'Attestation program',
      acronym_label: 'Acronym',
      status_label: 'Status',
      project_code: 'Project code',
      additional_info: 'Additional information',
      link_info_label: 'Info link',
      date_filter: 'Dates',
      date_from: 'From',
      date_to: 'To',
      dates_title: 'Dates',
      clear_date: 'Clear',
      view_calendar: 'Calendar',
      cal_month: 'Month',
      cal_week: 'Week',
      cal_add_gcal: 'Add to Google Calendar',
      cal_overflow_more: 'more'
    }
  };

  /* ---------- Date field label map (for known fields) ---------- */
  var DATE_FIELD_LABELS = {
    ua: {
      'Last_submition_deadline': 'Дедлайн подачі',
      'Submition_opening': 'Відкриття подачі',
      'Last_deccision_deadline': 'Дедлайн рішення'
    },
    en: {
      'Last_submition_deadline': 'Submission Deadline',
      'Submition_opening': 'Submission Opening',
      'Last_deccision_deadline': 'Decision Deadline'
    }
  };

  var lang = 'ua';
  function t(k) { return (I18N[lang] || I18N.ua)[k] || k; }

  /* ---------- State ---------- */
  var allProjects = [];
  var filteredProjects = [];
  var groups = {};
  var activeFilters = { program: [], section: [], type: [], applicant: [], status: [] };
  var dateFilters = {};        // key -> { from: Date|null, to: Date|null, fromStr: '', toStr: '' }
  var detectedDateFields = []; // [{ key, label }] — auto-detected from XML data
  var showArchived = false;
  var viewMode = 'program';
  var searchQuery = '';
  var collapsedGroups = {};

  /* Calendar state */
  var calendarDate = new Date();
  var calendarMode = 'month'; // 'month' | 'week'
  var calendarDateTypes = {}; // { fieldKey: boolean } — which date fields to show

  /* ---------- Helpers ---------- */
  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function byId(id) { return document.getElementById(id); }

  function parseDate(s) {
    if (!s) return null;
    var m;
    // DD.MM.YYYY
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    // M/D/YYYY
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    // YYYY-MM-DD
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function fmtDate(s) {
    var d = parseDate(s);
    if (!d || isNaN(d.getTime())) return s || '';
    var dd = ('0' + d.getDate()).slice(-2);
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    return dd + '.' + mm + '.' + d.getFullYear();
  }

  /* ---------- Calendar Helpers ---------- */
  function dateKey(d) {
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function getWeekStart(d) {
    var day = d.getDay(); // 0=Sun
    var diff = (day === 0) ? -6 : 1 - day; // Monday-first
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return start;
  }

  function initCalendarDateTypes() {
    detectedDateFields.forEach(function (f) {
      if (calendarDateTypes[f.key] === undefined) {
        calendarDateTypes[f.key] = true;
      }
    });
  }

  function buildDateMap(projs) {
    var map = {};
    projs.forEach(function (p) {
      detectedDateFields.forEach(function (f) {
        if (!calendarDateTypes[f.key]) return;
        var v = p._raw[f.key];
        if (!v) return;
        var text = (typeof v === 'object' && !Array.isArray(v)) ? (v.text || '') : (Array.isArray(v) ? '' : String(v));
        text = text.trim();
        if (!text) return;
        var parsed = parseDate(text);
        if (!parsed) return;
        var key = dateKey(parsed);
        if (!map[key]) map[key] = [];
        map[key].push({ project: p, dateType: f.key, isDeadline: /deadline/i.test(f.key), colorClass: getDateColorClass(f.key), label: getDateFieldLabel(f.key), formatted: fmtDate(text), parsed: parsed });
      });
    });
    return map;
  }

  function getCalendarTitle() {
    var months_ua = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
    var months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var months = lang === 'ua' ? months_ua : months_en;
    if (calendarMode === 'month') {
      return months[calendarDate.getMonth()] + ' ' + calendarDate.getFullYear();
    }
    var ws = getWeekStart(calendarDate);
    var we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
    var fmt = function (d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); };
    return fmt(ws) + ' – ' + fmt(we) + '.' + we.getFullYear();
  }

  /* ---------- Google Calendar URL Builder ---------- */
  function gcalDateStr(jsDate) {
    return '' + jsDate.getFullYear() + ('0' + (jsDate.getMonth() + 1)).slice(-2) + ('0' + jsDate.getDate()).slice(-2);
  }

  function makeGCalUrl(p, dateEntry) {
    var start = dateEntry.parsed;
    if (!start) return '#';
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    var title = dateEntry.isDeadline ? ('\uD83D\uDCC5 \u0414\u0415\u0414\u041B\u0410\u0419\u041D: ' + p.name) : ('\uD83D\uDDD3\uFE0F ' + p.name);
    var details = [];
    if (p._group && p._group !== '(empty)') details.push('\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u0430: ' + p._group);
    if (p.type) details.push('\u0422\u0438\u043F: ' + p.type);
    if (p.organizer) details.push('\u041E\u0440\u0433\u0430\u043D\u0456\u0437\u0430\u0442\u043E\u0440: ' + p.organizer);
    if (p.link) details.push('\u041F\u043E\u0434\u0430\u0442\u0438 \u0437\u0430\u044F\u0432\u043A\u0443: ' + p.link);
    if (p.linkInfo && p.linkInfo.indexOf('http') === 0) details.push('\u0414\u0435\u0442\u0430\u043B\u044C\u043D\u0456\u0448\u0435: ' + p.linkInfo);
    var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title)
      + '&dates=' + gcalDateStr(start) + '/' + gcalDateStr(end);
    if (details.length) url += '&details=' + encodeURIComponent(details.join('\n'));
    if (p.organizer) url += '&location=' + encodeURIComponent(p.organizer);
    return url;
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }

  function shortName(name) {
    if (!name || name === '(empty)') return '—';
    return name.replace(/\s*\(p\d+\)$/, '');
  }

  function expandSemicolonList(arr) {
    var result = [];
    arr.forEach(function (item) {
      if (item.indexOf(';') >= 0) {
        item.split(';').forEach(function (s) {
          var trimmed = s.trim();
          if (trimmed) result.push(trimmed);
        });
      } else {
        if (item.trim()) result.push(item.trim());
      }
    });
    return result;
  }

  /* ---------- XML Parsing ---------- */
  function loadData() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'projects.xml', true);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var parser = new DOMParser();
          var doc = parser.parseFromString(xhr.responseText, 'text/xml');
          parseGraph(doc);
          buildFilterOptions();
          fillSidebarPanels();
          buildDateFilters();
          applyFilters();
          // Check if URL has a project route on initial load
          if (window.location.hash.indexOf('#project/') === 0) {
            handleRoute();
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      } else {
        console.error('HTTP error:', xhr.status);
      }
      hideLoading();
    };
    xhr.onerror = function () {
      console.error('Network error loading projects.xml');
      hideLoading();
    };
    xhr.send();
  }

  function parseGraph(doc) {
    // 1. Group nodes (Type_attestation)
    var groupMap = {};
    qsa('Node[nclass="Type_attestation"]', doc).forEach(function (n) {
      var name = n.getAttribute('nodeName');
      groupMap[name] = { nodeName: name, projects: [] };
    });

    // 2. Project nodes — any nclass != Type_attestation, with data (skip root)
    var projectEls = qsa('Node', doc).filter(function (n) {
      var nc = n.getAttribute('nclass') || '';
      return nc !== 'Type_attestation' && n.querySelector('data');
    });

    // 3. Build edge lookup: node1 -> [node2, ...]
    var edgeMap = {};
    qsa('Edge', doc).forEach(function (e) {
      var n1 = e.getAttribute('node1');
      var n2 = e.getAttribute('node2');
      if (n1 && n2) {
        if (!edgeMap[n1]) edgeMap[n1] = [];
        edgeMap[n1].push(n2);
      }
    });

    // 4. Parse each project
    projectEls.forEach(function (el) {
      var p = parseProjectNode(el);
      var nodeName = el.getAttribute('nodeName');
      var guid = el.getAttribute('guid') || '';
      var parents = edgeMap[nodeName] || [];
      var group = null;
      for (var i = 0; i < parents.length; i++) {
        if (groupMap[parents[i]]) { group = parents[i]; break; }
      }
      p._group = group || '(empty)';
      p._nodeName = nodeName;
      p._guid = guid;
      allProjects.push(p);
    });

    // 5. Assign to groups
    if (!groupMap['(empty)']) groupMap['(empty)'] = { nodeName: '(empty)', projects: [] };
    allProjects.forEach(function (p) {
      if (!groupMap[p._group]) groupMap[p._group] = { nodeName: p._group, projects: [] };
      groupMap[p._group].projects.push(p);
    });
    groups = groupMap;
  }

  function parseProjectNode(el) {
    var raw = {};
    var multiKeys = { 'List_what_is_founding_directions_of_foundings': true };

    qsa('data', el).forEach(function (d) {
      var tc = d.getAttribute('tclass') || '';
      var link = d.getAttribute('link') || '';
      var type = d.getAttribute('type') || 'text';
      var text = (d.textContent || '').trim() || link;
      var entry = { text: text, link: link, type: type };

      if (multiKeys[tc]) {
        if (!raw[tc]) raw[tc] = [];
        raw[tc].push(text);
      } else if (raw[tc]) {
        if (!Array.isArray(raw[tc])) raw[tc] = [raw[tc]];
        raw[tc].push(entry);
      } else {
        raw[tc] = entry;
      }
    });

    function getVal(key) {
      var v = raw[key];
      if (!v) return '';
      if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' ? x.text : x; }).join(', ');
      return typeof v === 'object' ? v.text : v;
    }
    function getLink(key) {
      var v = raw[key];
      if (!v) return '';
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) { if (typeof v[i] === 'object' && v[i].link) return v[i].link; }
        return '';
      }
      return typeof v === 'object' ? v.link : '';
    }

    var status = getVal('Status') || '';
    var whoStr = getVal('Who_can_sumbit');
    var sectionStr = getVal('Section');

    return {
      _raw: raw,
      name: getVal('\u0441') || getVal('с'),   // Cyrillic 'с'
      code: getVal('code'),
      type: getVal('Type'),
      typeAttestation: getVal('Type_attestation'),
      section: sectionStr,
      sections: sectionStr ? sectionStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
      fundingDirections: expandSemicolonList(raw['List_what_is_founding_directions_of_foundings'] || []),
      whoCanSubmit: whoStr,
      whoCanSubmitList: whoStr ? whoStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
      acronym: getVal('Acronym'),
      organizer: getVal('Organizator'),
      coOrganizer: getVal('Co-Organizator'),
      parentProgram: getVal('In_terms_of_parent_program'),
      deadline: getVal('Last_submition_deadline'),
      submissionOpening: getVal('Submition_opening'),
      documents: getVal('Documents_required_to_be_prepared'),
      status: status,
      statusLower: status.toLowerCase(),
      image: getLink('Image') || getVal('Image'),
      link: getLink('Link') || getVal('Link'),
      linkInfo: getLink('Link_info') || getVal('Link_info'),
      linkInfoText: getVal('Link_info'),
      weekNumber: getVal('\u041d\u043e\u043c\u0435\u0440_\u0442\u0438\u0436\u043d\u044f'),  // 'Номер_тижня'
      isArchived: /^(archive|archived|closed)$/i.test(status),
      _deadlineParsed: parseDate(getVal('Last_submition_deadline')),
      _group: '',
      _nodeName: '',
      _guid: ''
    };
  }

  /* ---------- Dynamic Date Detection ---------- */

  function detectDateFields() {
    // For each raw field key, count how many project values parse as dates
    var keyStats = {};
    allProjects.forEach(function (p) {
      Object.keys(p._raw).forEach(function (key) {
        var v = p._raw[key];
        var text = '';
        if (!v) return;
        if (Array.isArray(v)) return; // multi-value fields (e.g. funding directions) — skip
        if (typeof v === 'object') text = v.text || '';
        else text = String(v);
        text = text.trim();
        if (!text) return;
        if (!keyStats[key]) keyStats[key] = { total: 0, dateCount: 0 };
        keyStats[key].total++;
        if (parseDate(text)) keyStats[key].dateCount++;
      });
    });

    detectedDateFields = [];
    Object.keys(keyStats).forEach(function (key) {
      var s = keyStats[key];
      // Require at least 2 values and ≥ 60% parseable as dates
      if (s.total >= 2 && s.dateCount / s.total >= 0.6) {
        detectedDateFields.push({ key: key });
        if (!dateFilters[key]) {
          dateFilters[key] = { from: null, to: null, fromStr: '', toStr: '' };
        }
      }
    });

    // Sort: deadline fields first, then alphabetically
    detectedDateFields.sort(function (a, b) {
      var aD = /deadline/i.test(a.key) ? 0 : 1;
      var bD = /deadline/i.test(b.key) ? 0 : 1;
      return (aD - bD) || a.key.localeCompare(b.key);
    });
  }

  function getDateFieldLabel(key) {
    var map = DATE_FIELD_LABELS[lang] || DATE_FIELD_LABELS.ua;
    return map[key] || key.replace(/_/g, ' ');
  }

  // Returns CSS color key: 'event' (blue) | 'deadline' (amber) | 'decision' (rose)
  function getDateColorClass(key) {
    if (/deccision|decision/i.test(key)) return 'decision';
    if (/deadline/i.test(key))           return 'deadline';
    return 'event';
  }

  function getProjectDates(p) {
    // Returns all date fields for this project that have a parseable value
    var result = [];
    detectedDateFields.forEach(function (f) {
      var v = p._raw[f.key];
      if (!v) return;
      var text = typeof v === 'object' && !Array.isArray(v) ? (v.text || '') : (Array.isArray(v) ? '' : String(v));
      text = text.trim();
      if (!text) return;
      var parsed = parseDate(text);
      if (!parsed) return;
      result.push({
        key: f.key,
        label: getDateFieldLabel(f.key),
        raw: text,
        parsed: parsed,
        formatted: fmtDate(text),
        isDeadline: /deadline/i.test(f.key),
        colorClass: getDateColorClass(f.key)
      });
    });
    return result;
  }

  function syncDateFilterBtn() {
    var btn = byId('btn-filter-date');
    if (!btn) return;
    var hasAny = detectedDateFields.some(function (f) {
      var df = dateFilters[f.key];
      return df && (df.from || df.to);
    });
    btn.classList.toggle('has-active', hasAny);
  }

  function buildDateFilters() {
    buildDateFilterPanel();
    buildSidebarDateFilters();
  }

  function buildDateFilterPanel() {
    var panel = byId('panel-date');
    if (!panel) return;
    var dd = byId('date-filter-dd');

    if (!detectedDateFields.length) {
      if (dd) dd.style.display = 'none';
      return;
    }
    if (dd) dd.style.display = '';

    panel.innerHTML = renderDateFilterFields('bar');
    bindDateFilterInputs(panel, 'bar');
  }

  function buildSidebarDateFilters() {
    var section = byId('sidebar-date-section');
    if (!section) return;

    if (!detectedDateFields.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    section.innerHTML = renderDateFilterFields('sidebar');
    bindDateFilterInputs(section, 'sidebar');
  }

  function renderDateFilterFields(ctx) {
    var html = '<div class="proj-date-filter-section">';
    detectedDateFields.forEach(function (f) {
      var df = dateFilters[f.key] || {};
      var idSuffix = ctx + '-' + f.key;
      html += '<div class="proj-date-filter-field">'
        + '<div class="proj-date-filter-field-label">' + esc(getDateFieldLabel(f.key)) + '</div>'
        + '<div class="proj-date-filter-row">'
        + '<div class="proj-date-input-wrap"><label for="date-from-' + idSuffix + '">' + t('date_from') + '</label>'
        + '<input type="date" id="date-from-' + idSuffix + '" class="proj-date-input" data-field="' + esc(f.key) + '" data-dir="from" value="' + esc(df.fromStr || '') + '"></div>'
        + '<div class="proj-date-input-wrap"><label for="date-to-' + idSuffix + '">' + t('date_to') + '</label>'
        + '<input type="date" id="date-to-' + idSuffix + '" class="proj-date-input" data-field="' + esc(f.key) + '" data-dir="to" value="' + esc(df.toStr || '') + '"></div>'
        + '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function bindDateFilterInputs(container, ctx) {
    qsa('.proj-date-input', container).forEach(function (input) {
      input.addEventListener('change', function () {
        var field = input.getAttribute('data-field');
        var dir = input.getAttribute('data-dir');
        var val = input.value; // YYYY-MM-DD from <input type="date">

        if (!dateFilters[field]) dateFilters[field] = { from: null, to: null, fromStr: '', toStr: '' };
        var parts = val ? val.split('-') : [];
        var parsed = parts.length === 3 ? new Date(+parts[0], +parts[1] - 1, +parts[2]) : null;

        if (dir === 'from') {
          dateFilters[field].fromStr = val;
          dateFilters[field].from = parsed;
        } else {
          dateFilters[field].toStr = val;
          dateFilters[field].to = parsed;
        }

        // Sync the sibling context (bar ↔ sidebar)
        var otherCtx = ctx === 'bar' ? 'sidebar' : 'bar';
        var otherId = 'date-' + dir + '-' + otherCtx + '-' + field;
        var otherInput = byId(otherId);
        if (otherInput) otherInput.value = val;

        syncDateFilterBtn();
        applyFilters();
      });
    });
  }

  function clearAllDateFilters() {
    detectedDateFields.forEach(function (f) {
      dateFilters[f.key] = { from: null, to: null, fromStr: '', toStr: '' };
    });
    qsa('.proj-date-input').forEach(function (inp) { inp.value = ''; });
    syncDateFilterBtn();
  }

  /* ---------- Filter Options ---------- */
  function buildFilterOptions() {
    var sets = { program: {}, section: {}, type: {}, applicant: {}, status: {} };

    allProjects.forEach(function (p) {
      sets.program[p._group] = true;
      p.sections.forEach(function (s) { sets.section[s] = true; });
      if (p.type) sets.type[p.type] = true;
      p.whoCanSubmitList.forEach(function (a) { sets.applicant[a] = true; });
      if (p.status) sets.status[p.status] = true;
    });

    fillDropdown('panel-program', Object.keys(sets.program).sort(), 'program');
    fillDropdown('panel-section', Object.keys(sets.section).sort(), 'section');
    fillDropdown('panel-type', Object.keys(sets.type).sort(), 'type');
    fillDropdown('panel-applicant', Object.keys(sets.applicant).sort(), 'applicant');
    fillDropdown('panel-status', Object.keys(sets.status).sort(), 'status');

    detectDateFields();
    initCalendarDateTypes();
  }

  function fillDropdown(panelId, items, filterKey) {
    var panel = byId(panelId);
    if (!panel) return;
    var html = '';
    items.forEach(function (item) {
      var label = (item === '(empty)') ? t('uncategorized') : item;
      var sel = (activeFilters[filterKey].indexOf(item) >= 0) ? ' selected' : '';
      html += '<div class="proj-dropdown-item' + sel + '" data-value="' + esc(item) + '">'
        + '<span class="check-box"></span>'
        + '<span>' + esc(label) + '</span>'
        + '</div>';
    });
    panel.innerHTML = html;

    qsa('.proj-dropdown-item', panel).forEach(function (el) {
      el.addEventListener('click', function () {
        var val = el.getAttribute('data-value');
        var idx = activeFilters[filterKey].indexOf(val);
        if (idx >= 0) {
          activeFilters[filterKey].splice(idx, 1);
          el.classList.remove('selected');
        } else {
          activeFilters[filterKey].push(val);
          el.classList.add('selected');
        }
        syncFilterBtn(filterKey);
        applyFilters();
      });
    });
  }

  function syncFilterBtn(key) {
    var btn = byId('btn-filter-' + key);
    if (!btn) return;
    btn.classList.toggle('has-active', activeFilters[key].length > 0);
  }

  /* ---------- Filtering ---------- */
  function applyFilters() {
    var q = searchQuery.toLowerCase();

    filteredProjects = allProjects.filter(function (p) {
      if (!showArchived && p.isArchived) return false;

      if (q) {
        var hay = [p.name, p.section, p.organizer, p.whoCanSubmit,
          p.fundingDirections.join(' '), p.acronym, p.code, p.coOrganizer].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }

      if (activeFilters.program.length && activeFilters.program.indexOf(p._group) < 0) return false;
      if (activeFilters.section.length && !p.sections.some(function (s) { return activeFilters.section.indexOf(s) >= 0; })) return false;
      if (activeFilters.type.length && activeFilters.type.indexOf(p.type) < 0) return false;
      if (activeFilters.applicant.length && !p.whoCanSubmitList.some(function (a) { return activeFilters.applicant.indexOf(a) >= 0; })) return false;
      if (activeFilters.status.length && activeFilters.status.indexOf(p.status) < 0) return false;

      // Dynamic date filters
      for (var _di = 0; _di < detectedDateFields.length; _di++) {
        var _fkey = detectedDateFields[_di].key;
        var _df = dateFilters[_fkey];
        if (!_df || (!_df.from && !_df.to)) continue;
        var _v = p._raw[_fkey];
        var _txt = !_v ? '' : (typeof _v === 'object' && !Array.isArray(_v) ? (_v.text || '') : String(_v));
        _txt = _txt.trim();
        var _d = parseDate(_txt);
        if (!_d) return false;
        if (_df.from && _d < _df.from) return false;
        if (_df.to) {
          var _toEnd = new Date(_df.to.getFullYear(), _df.to.getMonth(), _df.to.getDate(), 23, 59, 59);
          if (_d > _toEnd) return false;
        }
      }

      return true;
    });

    filteredProjects.sort(function (a, b) {
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      var da = a._deadlineParsed ? a._deadlineParsed.getTime() : Infinity;
      var db = b._deadlineParsed ? b._deadlineParsed.getTime() : Infinity;
      return da - db;
    });

    renderCounter();
    renderPills();
    renderProjects();
  }

  /* ---------- Counter ---------- */
  function renderCounter() {
    var total = showArchived ? allProjects.length : allProjects.filter(function (p) { return !p.isArchived; }).length;
    var el = byId('proj-counter');
    if (el) el.textContent = t('showing') + ' ' + filteredProjects.length + ' ' + t('of') + ' ' + total + ' ' + t('projects');
  }

  /* ---------- Active Filter Pills ---------- */
  function renderPills() {
    var c = byId('active-filters');
    if (!c) return;
    var html = '';
    var keys = Object.keys(activeFilters);
    var any = false;

    keys.forEach(function (key) {
      activeFilters[key].forEach(function (val) {
        any = true;
        var label = (val === '(empty)') ? t('uncategorized') : val;
        html += '<span class="proj-pill">' + esc(label)
          + ' <span class="proj-pill-close" data-fkey="' + key + '" data-fval="' + esc(val) + '">&times;</span></span>';
      });
    });

    // Date filter pills
    detectedDateFields.forEach(function (f) {
      var df = dateFilters[f.key];
      if (!df) return;
      var fieldLabel = getDateFieldLabel(f.key);
      if (df.from && df.fromStr) {
        any = true;
        html += '<span class="proj-pill">' + esc(fieldLabel) + ' ≥ ' + esc(fmtDate(df.fromStr))
          + ' <span class="proj-pill-close" data-dfkey="' + esc(f.key) + '" data-dfdir="from">&times;</span></span>';
      }
      if (df.to && df.toStr) {
        any = true;
        html += '<span class="proj-pill">' + esc(fieldLabel) + ' ≤ ' + esc(fmtDate(df.toStr))
          + ' <span class="proj-pill-close" data-dfkey="' + esc(f.key) + '" data-dfdir="to">&times;</span></span>';
      }
    });

    if (any) html += '<button class="proj-clear-all" id="btn-clear-all">' + t('clear_all') + '</button>';
    c.innerHTML = html;

    // Pill close — categorical filters
    qsa('.proj-pill-close[data-fkey]', c).forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-fkey');
        var v = el.getAttribute('data-fval');
        var idx = activeFilters[k].indexOf(v);
        if (idx >= 0) activeFilters[k].splice(idx, 1);
        var panel = byId('panel-' + k);
        if (panel) {
          qsa('.proj-dropdown-item', panel).forEach(function (di) {
            if (di.getAttribute('data-value') === v) di.classList.remove('selected');
          });
        }
        syncFilterBtn(k);
        applyFilters();
      });
    });

    // Pill close — date filters
    qsa('.proj-pill-close[data-dfkey]', c).forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-dfkey');
        var dir = el.getAttribute('data-dfdir');
        if (dateFilters[k]) {
          if (dir === 'from') { dateFilters[k].from = null; dateFilters[k].fromStr = ''; }
          else { dateFilters[k].to = null; dateFilters[k].toStr = ''; }
        }
        // Clear corresponding inputs in both bar and sidebar
        ['bar', 'sidebar'].forEach(function (ctx) {
          var inp = byId('date-' + dir + '-' + ctx + '-' + k);
          if (inp) inp.value = '';
        });
        syncDateFilterBtn();
        applyFilters();
      });
    });

    var clearBtn = byId('btn-clear-all');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        keys.forEach(function (k) {
          activeFilters[k] = [];
          syncFilterBtn(k);
        });
        qsa('.proj-dropdown-item.selected').forEach(function (el) { el.classList.remove('selected'); });
        clearAllDateFilters();
        applyFilters();
      });
    }
  }

  /* ---------- Calendar Rendering ---------- */
  function renderCalendar() {
    var c = byId('projects-container');
    if (!c) return;
    initCalendarDateTypes();
    var dateMap = buildDateMap(filteredProjects);
    var html = renderCalendarHeader();
    html += calendarMode === 'month' ? renderMonthCalendar(dateMap) : renderWeekCalendar(dateMap);
    c.innerHTML = html;
    bindCalendarEvents();
  }

  function renderCalendarHeader() {
    var monthActive = calendarMode === 'month' ? ' active' : '';
    var weekActive  = calendarMode === 'week'  ? ' active' : '';

    var togglesHtml = '';
    detectedDateFields.forEach(function (f) {
      var on = calendarDateTypes[f.key] !== false;
      var cls = (on ? ' proj-cal-toggle-on' : '') + (/deadline/i.test(f.key) ? ' proj-cal-toggle-deadline' : ' proj-cal-toggle-event');
      togglesHtml += '<button class="proj-cal-toggle' + cls + '" data-cal-toggle="' + esc(f.key) + '">' + esc(getDateFieldLabel(f.key)) + '</button>';
    });

    return '<div class="proj-cal-header">'
      + '<div class="proj-cal-mode-btns">'
      + '<button class="proj-cal-mode-btn' + monthActive + '" data-calmode="month">' + t('cal_month') + '</button>'
      + '<button class="proj-cal-mode-btn' + weekActive + '" data-calmode="week">' + t('cal_week') + '</button>'
      + '</div>'
      + '<div class="proj-cal-toggles">' + togglesHtml + '</div>'
      + '<div class="proj-cal-nav">'
      + '<button class="proj-cal-nav-btn" data-caldir="-1">&#8249;</button>'
      + '<span class="proj-cal-title">' + esc(getCalendarTitle()) + '</span>'
      + '<button class="proj-cal-nav-btn" data-caldir="1">&#8250;</button>'
      + '</div>'
      + '</div>';
  }

  function renderMonthCalendar(dateMap) {
    var todayKey = dateKey(new Date());
    var year  = calendarDate.getFullYear();
    var month = calendarDate.getMonth();
    var days_ua = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
    var days_en = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dayHeaders = lang === 'ua' ? days_ua : days_en;

    var html = '<div class="proj-cal-grid proj-cal-month">';
    dayHeaders.forEach(function (d) { html += '<div class="proj-cal-day-header">' + d + '</div>'; });

    var firstDow   = new Date(year, month, 1).getDay();
    var startOffset = firstDow === 0 ? 6 : firstDow - 1;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var endOffset   = (7 - ((startOffset + daysInMonth) % 7)) % 7;

    for (var i = 0; i < startOffset; i++) html += '<div class="proj-cal-cell proj-cal-cell-empty"></div>';

    for (var day = 1; day <= daysInMonth; day++) {
      var key    = dateKey(new Date(year, month, day));
      var isToday = key === todayKey;
      var events  = dateMap[key] || [];
      html += '<div class="proj-cal-cell' + (isToday ? ' proj-cal-today' : '') + '">';
      html += '<div class="proj-cal-day-num' + (isToday ? ' proj-cal-today-num' : '') + '">' + day + '</div>';
      var shown = Math.min(events.length, 3);
      for (var ei = 0; ei < shown; ei++) html += calEventChip(events[ei]);
      if (events.length > 3) html += '<div class="proj-cal-overflow">+' + (events.length - 3) + ' ' + t('cal_overflow_more') + '</div>';
      html += '</div>';
    }

    for (var j = 0; j < endOffset; j++) html += '<div class="proj-cal-cell proj-cal-cell-empty"></div>';
    html += '</div>';
    return html;
  }

  function renderWeekCalendar(dateMap) {
    var todayKey = dateKey(new Date());
    var ws = getWeekStart(calendarDate);
    var days_ua = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
    var days_en = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dayNames = lang === 'ua' ? days_ua : days_en;

    var html = '<div class="proj-cal-grid proj-cal-week">';

    for (var i = 0; i < 7; i++) {
      var d    = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      var key  = dateKey(d);
      var isT  = key === todayKey;
      html += '<div class="proj-cal-day-header' + (isT ? ' proj-cal-today-header' : '') + '">'
        + dayNames[i] + '<br><span class="proj-cal-week-date">' + d.getDate() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '</span></div>';
    }
    for (var j = 0; j < 7; j++) {
      var d2   = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + j);
      var key2 = dateKey(d2);
      var isT2 = key2 === todayKey;
      var evts = dateMap[key2] || [];
      html += '<div class="proj-cal-cell proj-cal-week-cell' + (isT2 ? ' proj-cal-today' : '') + '">';
      evts.forEach(function (entry) { html += calEventChip(entry); });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function calEventChip(entry) {
    var colorMap = { event: 'proj-cal-chip-event', deadline: 'proj-cal-chip-deadline', decision: 'proj-cal-chip-decision' };
    var cls    = colorMap[entry.colorClass] || 'proj-cal-chip-event';
    var prefix = entry.colorClass === 'decision' ? '\uD83D\uDCCB' : (entry.isDeadline ? '\uD83D\uDCC5' : '\uD83D\uDDD3\uFE0F');
    var name   = entry.project.name || '';
    return '<div class="proj-cal-chip ' + cls + '" '
      + 'data-cal-project="' + esc(entry.project._nodeName) + '" '
      + 'title="' + esc(name + ' — ' + entry.label + ': ' + entry.formatted) + '">'
      + prefix + ' ' + esc(name) + '</div>';
  }

  function shiftCalendar(dir) {
    if (calendarMode === 'month') {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + dir, 1);
    } else {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), calendarDate.getDate() + dir * 7);
    }
    renderCalendar();
  }

  function bindCalendarEvents() {
    qsa('[data-calmode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        calendarMode = btn.getAttribute('data-calmode');
        renderCalendar();
      });
    });
    qsa('[data-caldir]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        shiftCalendar(parseInt(btn.getAttribute('data-caldir'), 10));
      });
    });
    qsa('[data-cal-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-cal-toggle');
        var enabledCount = detectedDateFields.filter(function (f) { return calendarDateTypes[f.key] !== false; }).length;
        if (calendarDateTypes[key] !== false && enabledCount <= 1) return; // guard: keep at least one on
        calendarDateTypes[key] = !calendarDateTypes[key];
        renderCalendar();
      });
    });
    qsa('.proj-cal-chip').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        var name = chip.getAttribute('data-cal-project');
        for (var i = 0; i < allProjects.length; i++) {
          if (allProjects[i]._nodeName === name) { openModal(allProjects[i]); return; }
        }
      });
    });
  }

  /* ---------- Rendering ---------- */
  function renderProjects() {
    var c = byId('projects-container');
    if (!c) return;

    c.classList.toggle('proj-cal-active', viewMode === 'calendar');

    if (viewMode === 'calendar') {
      renderCalendar();
      return;
    }

    if (!filteredProjects.length) {
      c.innerHTML = '<div class="proj-empty">'
        + '<div class="proj-empty-icon">&#128269;</div>'
        + '<div class="proj-empty-text">' + t('no_results') + '</div>'
        + '<p style="color:var(--text-muted);margin-top:8px">' + t('no_results_hint') + '</p>'
        + '</div>';
      return;
    }

    if (viewMode === 'program') {
      renderByProgram(c);
    } else {
      renderFlat(c);
    }
  }

  function renderByProgram(container) {
    var byGroup = {};
    filteredProjects.forEach(function (p) {
      if (!byGroup[p._group]) byGroup[p._group] = [];
      byGroup[p._group].push(p);
    });

    var order = Object.keys(byGroup).sort(function (a, b) {
      if (a === '(empty)') return 1;
      if (b === '(empty)') return -1;
      return a.localeCompare(b);
    });

    var html = '';
    order.forEach(function (gName) {
      var projs = byGroup[gName];
      var label = (gName === '(empty)') ? t('uncategorized') : gName;
      var coll = collapsedGroups[gName] ? ' collapsed' : '';

      html += '<div class="proj-group">'
        + '<div class="proj-group-header' + coll + '" data-group="' + esc(gName) + '">'
        + '<span class="proj-group-bar"></span>'
        + '<span class="proj-group-name">' + esc(label) + '</span>'
        + '<span class="proj-group-count">(' + projs.length + ' ' + t('n_projects') + ')</span>'
        + '<svg class="proj-group-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
        + '</div>'
        + '<div class="proj-group-body' + coll + '">'
        + projs.map(renderCard).join('')
        + '</div></div>';
    });

    container.innerHTML = html;
    bindGroupHeaders();
    bindCards();
  }

  function renderFlat(container) {
    container.innerHTML = '<div class="proj-flat-grid">' + filteredProjects.map(renderCard).join('') + '</div>';
    bindCards();
  }

  /* ---------- Card ---------- */
  function renderCard(p) {
    var cls = p.isArchived ? ' archived' : '';
    var img = p.image
      ? '<img class="proj-card-img" src="' + esc(p.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '';

    var desc = p.fundingDirections.length ? p.fundingDirections[0] : (p.section || '');

    // Status badge: only show for meaningful statuses
    var statusBadge = '';
    if (p.status && p.statusLower !== 'no data') {
      statusBadge = '<span class="proj-badge proj-badge-status" data-status="' + esc(p.statusLower) + '">'
        + '<span class="proj-status-dot"></span>'
        + esc(p.status) + '</span>';
    }

    // Type icon
    var typeIcon = '';
    if (p.type) {
      if (p.type === 'Collective') {
        typeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">'
          + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'
          + '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      } else {
        typeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">'
          + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      }
    }

    // Build date chips for all detected date fields
    var dates = getProjectDates(p);
    var datesHtml = '';
    if (dates.length) {
      datesHtml = '<div class="proj-card-dates">';
      dates.forEach(function (d) {
        datesHtml += '<span class="proj-date-chip proj-date-chip--' + d.colorClass + '">'
          + '<span class="proj-date-chip-label">' + esc(d.label) + '</span>'
          + '<span class="proj-date-chip-value">' + esc(d.formatted) + '</span>'
          + '<a class="proj-gcal-btn" href="' + esc(makeGCalUrl(p, d)) + '" target="_blank" rel="noopener" '
          + 'title="' + esc(t('cal_add_gcal')) + '" onclick="event.stopPropagation()">&#128197;</a>'
          + '</span>';
      });
      datesHtml += '</div>';
    }

    return '<div class="proj-card' + cls + '" data-project="' + esc(p._nodeName) + '">'
      + img
      + '<div class="proj-card-body">'
      + '<div class="proj-card-badges">'
      + '<span class="proj-badge proj-badge-program">' + esc(p.acronym || shortName(p._group)) + '</span>'
      + statusBadge
      + '</div>'
      + '<div class="proj-card-title">' + esc(p.name) + '</div>'
      + '<div class="proj-card-desc">' + esc(desc) + '</div>'
      + datesHtml
      + '<div class="proj-card-meta">'
      + '<span></span>'
      + '<span class="proj-card-meta-item">' + typeIcon + ' ' + esc(p.type) + '</span>'
      + '</div></div></div>';
  }

  /* ---------- Interactions ---------- */
  function bindGroupHeaders() {
    qsa('.proj-group-header').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var g = hdr.getAttribute('data-group');
        var body = hdr.nextElementSibling;
        if (collapsedGroups[g]) {
          delete collapsedGroups[g];
          hdr.classList.remove('collapsed');
          body.classList.remove('collapsed');
        } else {
          collapsedGroups[g] = true;
          hdr.classList.add('collapsed');
          body.classList.add('collapsed');
        }
      });
    });
  }

  function bindCards() {
    qsa('.proj-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var name = card.getAttribute('data-project');
        var proj = null;
        for (var i = 0; i < allProjects.length; i++) {
          if (allProjects[i]._nodeName === name) { proj = allProjects[i]; break; }
        }
        if (proj) openModal(proj);
      });
    });
  }

  /* ---------- Modal ---------- */
  function openModal(p) {
    var overlay = byId('modal-overlay');
    var body = byId('modal-body');
    if (!overlay || !body) return;

    var groupLabel = (p._group === '(empty)') ? t('uncategorized') : p._group;

    // Status badge for modal
    var statusBadge = '';
    if (p.status && p.statusLower !== 'no data') {
      statusBadge = '<span class="proj-badge proj-badge-status" data-status="' + esc(p.statusLower) + '" style="font-size:0.75rem">'
        + '<span class="proj-status-dot"></span>'
        + esc(p.status) + '</span>';
    }

    var html = '';

    // Close button
    html += '<button class="modal-close" id="modal-close-btn">&times;</button>';

    // Top section: image + title
    html += '<div class="proj-modal-top">';
    if (p.image) {
      html += '<img class="proj-modal-img" src="' + esc(p.image) + '" alt="" onerror="this.style.display=\'none\'">';
    }
    html += '<div class="proj-modal-header">';
    html += '<h2>' + esc(p.name) + '</h2>';
    html += '<div class="proj-modal-parent">' + t('parent_program') + ': <a href="#">' + esc(p.parentProgram || groupLabel) + '</a></div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">' + statusBadge;
    if (p.acronym) html += '<span class="proj-badge proj-badge-program">' + esc(p.acronym) + '</span>';
    html += '</div></div></div>';

    // Grid: left info, right deadlines
    html += '<div class="proj-modal-grid"><div>';

    // Organizer
    if (p.organizer) html += mSec(t('organizer'), esc(p.organizer));
    if (p.coOrganizer) html += mSec(t('co_organizer'), esc(p.coOrganizer));

    // Type & Section
    if (p.type || p.section) {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
      if (p.type) html += '<div><div class="proj-modal-label">' + esc(t('type_label')) + '</div><div class="proj-modal-value">' + esc(p.type) + '</div></div>';
      if (p.section) html += '<div><div class="proj-modal-label">' + esc(t('section_label')) + '</div><div class="proj-modal-value">' + esc(p.section) + '</div></div>';
      html += '</div>';
    }

    // Who can apply
    if (p.whoCanSubmit) {
      html += mSec(t('who_can_apply'), '<span style="display:inline-flex;align-items:center;gap:6px">&#127760; ' + esc(p.whoCanSubmit) + '</span>');
    }

    // Funding directions
    if (p.fundingDirections.length) {
      var list = '<ul class="proj-modal-list">' + p.fundingDirections.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>';
      html += mSec(t('funding_directions'), list);
    }

    // Quick links
    var links = '';
    if (p.link) links += '<a href="' + esc(p.link) + '" target="_blank" rel="noopener" class="proj-modal-link-btn primary">&#128640; ' + t('apply') + '</a>';
    if (p.linkInfo && p.linkInfo.indexOf('http') === 0) {
      links += '<a href="' + esc(p.linkInfo) + '" target="_blank" rel="noopener" class="proj-modal-link-btn secondary">&#9432; ' + t('info') + '</a>';
    }
    if (links) {
      html += '<div style="margin-top:16px"><div class="proj-modal-label">' + t('quick_links') + '</div><div class="proj-modal-links">' + links + '</div></div>';
    }

    html += '</div><div>';

    // Unified dates box — all detected date fields
    var modalDates = getProjectDates(p);
    if (modalDates.length) {
      html += '<div class="proj-dates-box">'
        + '<div class="proj-dates-box-title">' + t('dates_title') + '</div>';
      modalDates.forEach(function (d) {
        html += '<div class="proj-date-row proj-date-row--' + d.colorClass + '">'
          + '<span class="proj-date-row-label">' + esc(d.label) + '</span>'
          + '<span class="proj-date-row-value" style="display:flex;align-items:center;gap:6px">'
          + esc(d.formatted)
          + '<a class="proj-gcal-btn" href="' + esc(makeGCalUrl(p, d)) + '" target="_blank" rel="noopener" title="' + esc(t('cal_add_gcal')) + '">&#128197;</a>'
          + '</span>'
          + '</div>';
      });
      if (p.weekNumber) {
        html += '<div style="margin-top:6px;font-size:0.75rem;color:var(--text-muted)">Week ' + esc(p.weekNumber) + '</div>';
      }
      html += '</div>';
    }

    // Documents
    if (p.documents) {
      html += '<div style="margin-top:14px">' + mSec(t('documents_required'),
        '<div style="font-style:italic;color:var(--accent-amber)">' + esc(p.documents) + '</div>') + '</div>';
    }

    html += '</div></div>';

    // Reference ID
    if (p.code) {
      html += '<div class="proj-modal-ref"><span>' + t('reference_id') + ':</span> ' + esc(p.code) + '</div>';
    }

    // Action buttons: View Full Page + Copy Link
    var projectUrl = window.location.pathname + '#project/' + p._guid;
    var fullUrl = window.location.origin + projectUrl;
    html += '<div class="proj-modal-actions">';
    html += '<button class="proj-modal-link-btn primary" id="btn-view-full-page">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> '
      + t('view_full_page') + '</button>';
    html += '<button class="proj-modal-link-btn secondary" id="btn-copy-link">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> '
      + t('copy_link') + '</button>';
    html += '</div>';

    body.innerHTML = html;
    overlay.classList.add('visible');

    // Close handler
    var closeBtn = byId('modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeModal();
      });
    }

    // View Full Page handler
    var fullPageBtn = byId('btn-view-full-page');
    if (fullPageBtn) {
      fullPageBtn.addEventListener('click', function () {
        overlay.classList.remove('visible');
        window.location.hash = 'project/' + (p._guid || encodeURIComponent(p._nodeName));
      });
    }

    // Copy Link handler
    var copyBtn = byId('btn-copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var textToCopy = fullUrl;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(function () {
            showCopyFeedback(copyBtn);
          });
        } else {
          // Fallback
          var ta = document.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showCopyFeedback(copyBtn);
        }
      });
    }
  }

  function showCopyFeedback(btn) {
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ' + t('link_copied');
    btn.classList.add('copied');
    setTimeout(function () {
      btn.innerHTML = orig;
      btn.classList.remove('copied');
    }, 2000);
  }

  function mSec(label, content) {
    return '<div class="proj-modal-section"><div class="proj-modal-label">' + label + '</div><div class="proj-modal-value">' + content + '</div></div>';
  }

  function closeModal() {
    var overlay = byId('modal-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  /* ---------- Dedicated Project Page ---------- */
  function findProjectById(id) {
    for (var i = 0; i < allProjects.length; i++) {
      if (allProjects[i]._guid === id || allProjects[i]._nodeName === id) return allProjects[i];
    }
    return null;
  }

  function renderProjectPage(p) {
    var mainEl = qs('.proj-main');
    if (!mainEl) return;

    var groupLabel = (p._group === '(empty)') ? t('uncategorized') : p._group;

    // Status badge
    var statusBadge = '';
    if (p.status && p.statusLower !== 'no data') {
      statusBadge = '<span class="proj-badge proj-badge-status" data-status="' + esc(p.statusLower) + '">'
        + '<span class="proj-status-dot"></span>'
        + esc(p.status) + '</span>';
    }

    var projectUrl = window.location.origin + window.location.pathname + '#project/' + p._guid;

    var html = '<div class="proj-detail-page">';

    // Back button
    html += '<button class="proj-back-btn" id="btn-back-explorer">'
      + t('back_to_explorer') + '</button>';

    // Hero section
    html += '<div class="proj-detail-hero">';
    if (p.image) {
      html += '<img class="proj-detail-img" src="' + esc(p.image) + '" alt="" onerror="this.style.display=\'none\'">';
    }
    html += '<div class="proj-detail-hero-info">';
    html += '<div class="proj-card-badges" style="margin-bottom:12px">';
    html += '<span class="proj-badge proj-badge-program">' + esc(p.acronym || shortName(p._group)) + '</span>';
    html += statusBadge;
    if (p.isArchived) html += '<span class="proj-badge proj-badge-status" data-status="archive"><span class="proj-status-dot"></span>' + t('archive_badge') + '</span>';
    html += '</div>';
    html += '<h1 class="proj-detail-title">' + esc(p.name) + '</h1>';
    html += '<div class="proj-modal-parent">' + t('parent_program') + ': <a href="#">' + esc(p.parentProgram || groupLabel) + '</a></div>';
    if (p.code) html += '<div style="margin-top:4px;font-size:0.82rem;color:var(--text-muted)">' + t('project_code') + ': <strong>' + esc(p.code) + '</strong></div>';
    html += '</div></div>';

    // Copy link bar
    html += '<div class="proj-detail-link-bar">';
    html += '<input type="text" class="proj-detail-link-input" value="' + esc(projectUrl) + '" readonly id="proj-detail-url">';
    html += '<button class="proj-modal-link-btn secondary" id="btn-detail-copy">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> '
      + t('copy_link') + '</button>';
    html += '</div>';

    // Content grid
    html += '<div class="proj-detail-grid">';

    // Left column — all project details
    html += '<div class="proj-detail-col">';

    // Organizer block
    if (p.organizer) html += mSec(t('organizer'), esc(p.organizer));
    if (p.coOrganizer) html += mSec(t('co_organizer'), esc(p.coOrganizer));

    // Key properties grid
    var propsHtml = '';
    if (p.type) propsHtml += '<div><div class="proj-modal-label">' + esc(t('type_label')) + '</div><div class="proj-modal-value">' + esc(p.type) + '</div></div>';
    if (p.section) propsHtml += '<div><div class="proj-modal-label">' + esc(t('section_label')) + '</div><div class="proj-modal-value">' + esc(p.section) + '</div></div>';
    if (p.typeAttestation) propsHtml += '<div><div class="proj-modal-label">' + esc(t('type_attestation')) + '</div><div class="proj-modal-value">' + esc(p.typeAttestation) + '</div></div>';
    if (p.acronym) propsHtml += '<div><div class="proj-modal-label">' + esc(t('acronym_label')) + '</div><div class="proj-modal-value">' + esc(p.acronym) + '</div></div>';
    if (p.status) propsHtml += '<div><div class="proj-modal-label">' + esc(t('status_label')) + '</div><div class="proj-modal-value">' + statusBadge + '</div></div>';
    if (propsHtml) {
      html += '<div class="proj-detail-props-grid">' + propsHtml + '</div>';
    }

    // Who can apply
    if (p.whoCanSubmit) {
      html += mSec(t('who_can_apply'), '<span style="display:inline-flex;align-items:center;gap:6px">&#127760; ' + esc(p.whoCanSubmit) + '</span>');
    }

    // Funding directions
    if (p.fundingDirections.length) {
      var list = '<ul class="proj-modal-list">' + p.fundingDirections.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>';
      html += mSec(t('funding_directions'), list);
    }

    // Documents
    if (p.documents) {
      html += mSec(t('documents_required'), '<div style="font-style:italic;color:var(--accent-amber)">' + esc(p.documents) + '</div>');
    }

    // Info link text (non-URL info text)
    if (p.linkInfoText && p.linkInfoText.indexOf('http') !== 0) {
      html += mSec(t('link_info_label'), esc(p.linkInfoText));
    }

    html += '</div>';

    // Right column — dates, links, extra data
    html += '<div class="proj-detail-col">';

    // Unified dates box — all detected date fields
    var detailDates = getProjectDates(p);
    if (detailDates.length) {
      html += '<div class="proj-dates-box">'
        + '<div class="proj-dates-box-title">' + t('dates_title') + '</div>';
      detailDates.forEach(function (d) {
        html += '<div class="proj-date-row proj-date-row--' + d.colorClass + '">'
          + '<span class="proj-date-row-label">' + esc(d.label) + '</span>'
          + '<span class="proj-date-row-value" style="display:flex;align-items:center;gap:6px">'
          + esc(d.formatted)
          + '<a class="proj-gcal-btn" href="' + esc(makeGCalUrl(p, d)) + '" target="_blank" rel="noopener" title="' + esc(t('cal_add_gcal')) + '">&#128197;</a>'
          + '</span>'
          + '</div>';
      });
      if (p.weekNumber) {
        html += '<div style="margin-top:6px;font-size:0.75rem;color:var(--text-muted)">Week ' + esc(p.weekNumber) + '</div>';
      }
      html += '</div>';
    }

    // Quick links
    var links = '';
    if (p.link) links += '<a href="' + esc(p.link) + '" target="_blank" rel="noopener" class="proj-modal-link-btn primary">&#128640; ' + t('apply') + '</a>';
    if (p.linkInfo && p.linkInfo.indexOf('http') === 0) {
      links += '<a href="' + esc(p.linkInfo) + '" target="_blank" rel="noopener" class="proj-modal-link-btn secondary">&#9432; ' + t('info') + '</a>';
    }
    if (links) {
      html += '<div style="margin-top:14px"><div class="proj-modal-label">' + t('quick_links') + '</div><div class="proj-modal-links">' + links + '</div></div>';
    }

    // Any extra raw fields not already shown
    var knownKeys = {
      '\u0441': 1, 'с': 1, 'code': 1, 'Type': 1, 'Type_attestation': 1,
      'Section': 1, 'List_what_is_founding_directions_of_foundings': 1,
      'Who_can_sumbit': 1, 'Acronym': 1, 'Organizator': 1, 'Co-Organizator': 1,
      'In_terms_of_parent_program': 1, 'Last_submition_deadline': 1,
      'Submition_opening': 1, 'Documents_required_to_be_prepared': 1,
      'Status': 1, 'Image': 1, 'Link': 1, 'Link_info': 1,
      '\u041d\u043e\u043c\u0435\u0440_\u0442\u0438\u0436\u043d\u044f': 1
    };
    // Exclude all dynamically detected date fields from "extra" section
    detectedDateFields.forEach(function (f) { knownKeys[f.key] = 1; });
    var extraHtml = '';
    var rawKeys = Object.keys(p._raw || {});
    rawKeys.forEach(function (key) {
      if (knownKeys[key]) return;
      var v = p._raw[key];
      var text = '';
      if (Array.isArray(v)) {
        text = v.map(function (x) { return typeof x === 'object' ? x.text : x; }).filter(Boolean).join(', ');
      } else if (typeof v === 'object') {
        text = v.text || v.link || '';
      } else {
        text = String(v);
      }
      if (text) {
        var label = key.replace(/_/g, ' ');
        extraHtml += mSec(label, esc(text));
      }
    });
    if (extraHtml) {
      html += '<div style="margin-top:14px"><div class="proj-modal-label" style="margin-bottom:8px">' + t('additional_info') + '</div>' + extraHtml + '</div>';
    }

    html += '</div></div>';

    // Reference ID at bottom
    if (p.code) {
      html += '<div class="proj-modal-ref"><span>' + t('reference_id') + ':</span> ' + esc(p.code) + '</div>';
    }

    html += '</div>';

    // Store original content and replace
    if (!mainEl._origHTML) mainEl._origHTML = mainEl.innerHTML;
    mainEl.innerHTML = html;

    // Bind back button
    var backBtn = byId('btn-back-explorer');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        window.location.hash = '';
      });
    }

    // Bind copy button
    var copyBtn = byId('btn-detail-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var input = byId('proj-detail-url');
        if (input) input.select();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(projectUrl).then(function () {
            showCopyFeedback(copyBtn);
          });
        } else {
          document.execCommand('copy');
          showCopyFeedback(copyBtn);
        }
      });
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  function showExplorerView() {
    var mainEl = qs('.proj-main');
    if (mainEl && mainEl._origHTML) {
      mainEl.innerHTML = mainEl._origHTML;
      mainEl._origHTML = null;
      // Re-bind events on restored content
      initEvents();
      buildFilterOptions();
      fillSidebarPanels();
      buildDateFilters();
      applyFilters();
    }
  }

  /* ---------- Hash Routing ---------- */
  function handleRoute() {
    var hash = window.location.hash;
    if (hash.indexOf('#project/') === 0) {
      var projectId = decodeURIComponent(hash.substring(9));
      var proj = findProjectById(projectId);
      if (proj) {
        closeModal();
        renderProjectPage(proj);
        return;
      }
    }
    // Default: show explorer
    var mainEl = qs('.proj-main');
    if (mainEl && mainEl._origHTML) {
      showExplorerView();
    }
  }

  /* ---------- Loading ---------- */
  function hideLoading() {
    var ls = byId('loading-screen');
    if (ls) {
      ls.classList.add('hidden');
      setTimeout(function () { ls.style.display = 'none'; }, 700);
    }
  }

  /* ---------- Events ---------- */
  function initEvents() {
    // Search
    var searchInput = byId('proj-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = searchInput.value.trim();
        applyFilters();
      });
    }

    // ESC key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var overlay = byId('modal-overlay');
        if (overlay && overlay.classList.contains('visible')) {
          closeModal();
        } else if (searchInput && searchInput.value) {
          searchInput.value = '';
          searchQuery = '';
          applyFilters();
          searchInput.blur();
        }
      }
    });

    // Modal backdrop close
    var overlay = byId('modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    // Filter dropdowns
    var openPanel = null;
    qsa('.proj-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dd = btn.parentElement;
        var panel = dd ? dd.querySelector('.proj-dropdown-panel') : null;
        if (!panel) return;
        var wasOpen = panel.classList.contains('open');

        // Close all
        qsa('.proj-dropdown-panel.open').forEach(function (p) { p.classList.remove('open'); });
        qsa('.proj-filter-btn.open').forEach(function (b) { b.classList.remove('open'); });

        if (!wasOpen) {
          panel.classList.add('open');
          btn.classList.add('open');
          openPanel = panel;
        } else {
          openPanel = null;
        }
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', function () {
      if (openPanel) {
        qsa('.proj-dropdown-panel.open').forEach(function (p) { p.classList.remove('open'); });
        qsa('.proj-filter-btn.open').forEach(function (b) { b.classList.remove('open'); });
        openPanel = null;
      }
    });

    // Prevent dropdown close when clicking inside
    qsa('.proj-dropdown-panel').forEach(function (p) {
      p.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    // Archive toggle
    var archToggle = byId('toggle-archived');
    if (archToggle) {
      archToggle.addEventListener('change', function () {
        showArchived = archToggle.checked;
        applyFilters();
      });
    }

    // View mode buttons
    var btnProgram  = byId('btn-view-program');
    var btnAll      = byId('btn-view-all');
    var btnCalendar = byId('btn-view-calendar');
    function setViewMode(mode) {
      viewMode = mode;
      if (btnProgram)  btnProgram.classList.toggle('active',  mode === 'program');
      if (btnAll)       btnAll.classList.toggle('active',      mode === 'all');
      if (btnCalendar)  btnCalendar.classList.toggle('active', mode === 'calendar');
      renderProjects();
    }
    if (btnProgram)  btnProgram.addEventListener('click',  function () { setViewMode('program'); });
    if (btnAll)       btnAll.addEventListener('click',       function () { setViewMode('all'); });
    if (btnCalendar)  btnCalendar.addEventListener('click',  function () { setViewMode('calendar'); });

    // Language switch
    qsa('.proj-lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        lang = btn.getAttribute('data-lang') || 'ua';
        qsa('.proj-lang-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        updateI18n();
        applyFilters();
      });
    });

    // Navbar scroll
    window.addEventListener('scroll', function () {
      var nav = byId('navbar');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    });

    // Hamburger
    var hamburger = byId('hamburger-btn');
    if (hamburger) {
      hamburger.addEventListener('click', function () {
        var links = byId('nav-links');
        if (links) links.classList.toggle('open');
        hamburger.classList.toggle('active');
      });
    }
  }

  function updateI18n() {
    qsa('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    var si = byId('proj-search');
    if (si) si.placeholder = t('search_placeholder');
  }

  /* ---------- Filter Sidebar ---------- */
  function initSidebar() {
    var openBtn = byId('btn-open-filters');
    var closeBtn = byId('btn-close-sidebar');
    var overlay = byId('sidebar-overlay');
    var sidebar = byId('filter-sidebar');
    var applyBtn = byId('btn-sidebar-apply');
    var clearBtn = byId('btn-sidebar-clear');
    var sidebarArchive = byId('sidebar-toggle-archived');

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (overlay) overlay.classList.add('open');
      // Sync archive toggle
      if (sidebarArchive) sidebarArchive.checked = showArchived;
    }
    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    }

    if (openBtn) openBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Sync sidebar archive with main archive
    if (sidebarArchive) {
      sidebarArchive.addEventListener('change', function () {
        showArchived = sidebarArchive.checked;
        var mainToggle = byId('toggle-archived');
        if (mainToggle) mainToggle.checked = showArchived;
      });
    }

    // Apply button closes sidebar and applies
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        closeSidebar();
        applyFilters();
      });
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var keys = Object.keys(activeFilters);
        keys.forEach(function (k) {
          activeFilters[k] = [];
          syncFilterBtn(k);
        });
        // Uncheck all in sidebar panels
        qsa('.proj-sidebar-panel .proj-dropdown-item.selected').forEach(function (el) { el.classList.remove('selected'); });
        // Uncheck all in main dropdowns
        qsa('.proj-dropdown-panel .proj-dropdown-item.selected').forEach(function (el) { el.classList.remove('selected'); });
        // Clear date filters
        clearAllDateFilters();
        // Reset archive
        showArchived = false;
        if (sidebarArchive) sidebarArchive.checked = false;
        var mainToggle = byId('toggle-archived');
        if (mainToggle) mainToggle.checked = false;
        applyFilters();
      });
    }

    // ESC closes sidebar
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  function fillSidebarPanels() {
    var filterKeys = ['program', 'section', 'type', 'applicant', 'status'];
    filterKeys.forEach(function (key) {
      var sidebarPanel = byId('sidebar-panel-' + key);
      var mainPanel = byId('panel-' + key);
      if (!sidebarPanel || !mainPanel) return;

      // Clone items from main panel
      var items = qsa('.proj-dropdown-item', mainPanel);
      var html = '';
      items.forEach(function (item) {
        var val = item.getAttribute('data-value');
        var label = item.querySelector('span:last-child');
        var labelText = label ? label.textContent : val;
        var sel = (activeFilters[key].indexOf(val) >= 0) ? ' selected' : '';
        html += '<div class="proj-dropdown-item' + sel + '" data-value="' + esc(val) + '">'
          + '<span class="check-box"></span>'
          + '<span>' + esc(labelText) + '</span>'
          + '</div>';
      });
      sidebarPanel.innerHTML = html;

      // Bind clicks
      qsa('.proj-dropdown-item', sidebarPanel).forEach(function (el) {
        el.addEventListener('click', function () {
          var val = el.getAttribute('data-value');
          var idx = activeFilters[key].indexOf(val);
          if (idx >= 0) {
            activeFilters[key].splice(idx, 1);
            el.classList.remove('selected');
          } else {
            activeFilters[key].push(val);
            el.classList.add('selected');
          }
          // Sync main dropdown
          syncFilterBtn(key);
          syncMainDropdown(key, val, activeFilters[key].indexOf(val) >= 0);
        });
      });
    });
  }

  function syncMainDropdown(key, val, selected) {
    var panel = byId('panel-' + key);
    if (!panel) return;
    qsa('.proj-dropdown-item', panel).forEach(function (di) {
      if (di.getAttribute('data-value') === val) {
        if (selected) {
          di.classList.add('selected');
        } else {
          di.classList.remove('selected');
        }
      }
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initEvents();
    initSidebar();
    loadData();
    window.addEventListener('hashchange', handleRoute);
  });

})();

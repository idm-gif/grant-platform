/* ============================================
   НЦ МАНУ — XML Data Visualization
   JavaScript: XML Parsing, Routing, Rendering
   ============================================ */
(function () {
  'use strict';
  // ---- State ----
  let nodesMap = {};    // guid -> node object
  let nameToGuid = {};  // nodeName -> guid (for resolving edges)
  let edgesArr = [];    // { from, to }
  let nodeParents = {}; // childGuid -> [parentGuids]
  let childrenMap = {}; // parentGuid -> [childGuids]
  let sections = {};    // sectionKey -> [node]
  let dynamicSectionDefs = [];  // [{key, label, nclass, icon, color, parentGroup}]
  let dynamicNavTree = [];      // [{type:'group'|'item', label, key?, icon?, children?}]
  const STRUCTURAL_NCLASSES = new Set(['', 'Group', 'Галузь', 'Галузь_науки', 'Стан', 'Країна']);
  const KNOWN_SECTION_CONFIG = {
    'Адміністрація НЦ "МАНУ"': { icon: '👥', color: 'blue', renderer: 'person' },
    'Керівництво': { icon: '🔬', color: 'blue', renderer: 'person' },
    '🔬 Керівництво': { icon: '🔬', color: 'blue', renderer: 'person' },
    'Веб-ресурси НЦ "МАНУ"': { icon: '🌐', color: 'cyan', renderer: 'webresource' },
    'Проекти': { icon: '🚀', color: 'amber', renderer: 'project' },
    'Ключові публікації': { icon: '📚', color: 'rose', renderer: 'publication' },
    'Наукові відділи': { icon: '🧑‍🔬', color: 'blue', renderer: 'person' },
    'Партнери': { icon: '🤝', color: 'emerald', renderer: 'person' },
    'Стажування': { icon: '🎓', color: 'amber', renderer: 'event' },
    'Міжнародні активності': { icon: '🌍', color: 'cyan', renderer: 'event' },
    'Наукові заходи': { icon: '📅', color: 'purple', renderer: 'event' },
    'Відділи': { icon: '🏛️', color: 'emerald', renderer: 'departments', navHide: true },
    'Журнал "Наукові записки МАН"': { icon: '📰', color: 'blue', renderer: 'webresource' },
  };
  const ICON_PALETTE = ['📁', '🔬', '🏫', '📊', '💡', '🌱', '🎯', '🔗', '🧩'];
  const COLOR_PALETTE = ['blue', 'cyan', 'emerald', 'amber', 'rose', 'purple'];
  // Dashboard statistics (verified values)
  const DASHBOARD_STATS = [
    { label: 'Всього публікацій', value: 1917, suffix: '', icon: '📚' },
    { label: 'Scopus / WoS', value: 194, suffix: '', icon: '🔭' },
    { label: 'Фахові видання', value: 292, suffix: '', icon: '📃' },
    { label: 'Монографії', value: 78, suffix: '', icon: '📖' },
    { label: 'Охоронні документи', value: 41, suffix: '', icon: '🏆' },
    { label: 'Проєкти', value: 20, suffix: '+', icon: '🚀' },
  ];
  // ---- XML Loading ----
  async function loadXML() {
    try {
      const resp = await fetch(encodeURI('sci_dep.xml'));
      const text = await resp.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      parseGraph(xmlDoc);
      renderNav();
      hideLoading();
      route();
    } catch (err) {
      console.error('Failed to load XML:', err);
      document.getElementById('loading-screen').innerHTML =
        '<p style="color:#f43f5e;font-size:0.9rem;">Помилка завантаження XML файлу</p>';
    }
  }
  function parseGraph(xmlDoc) {
    nodesMap = {};
    nameToGuid = {};
    edgesArr = [];
    nodeParents = {};
    childrenMap = {};
    sections = {};
    // 1. Parse nodes
    const nodeEls = xmlDoc.querySelectorAll('Node');
    nodeEls.forEach(n => {
      const guid = n.getAttribute('guid');
      const nodeName = n.getAttribute('nodeName') || '';
      const node = {
        guid,
        name: nodeName,
        nclass: n.getAttribute('nclass') || '',
        shape: n.getAttribute('shape') || '',
        xPos: parseInt(n.getAttribute('xPos') || '0'),
        yPos: parseInt(n.getAttribute('yPos') || '0'),
        data: {}
      };

      const dataEls = n.querySelectorAll('data');
      dataEls.forEach(d => {
        const tclass = d.getAttribute('tclass') || 'other';
        const type = d.getAttribute('type') || 'text';
        const link = d.getAttribute('link') || '';
        const content = d.textContent || '';
        if (!node.data[tclass]) node.data[tclass] = [];
        node.data[tclass].push({ type, tclass, link, content });
      });

      nodesMap[guid] = node;
      if (nodeName) nameToGuid[nodeName.trim()] = guid;
    });
    // 2. Parse edges (handle both standard fromNode/toNode and sci_dep node1/node2 or from/to format)
    const edgeEls = xmlDoc.querySelectorAll('Edge');
    edgeEls.forEach(e => {
      let from = e.getAttribute('fromNode') || e.getAttribute('from');
      let to = e.getAttribute('toNode') || e.getAttribute('to');

      if (!from && !to) {
        // node1 is typically child, node2 is parent (e.g. node1="Scientific Center", node2="Education")
        const n1 = (e.getAttribute('node1') || '').trim();
        const n2 = (e.getAttribute('node2') || '').trim();
        from = nameToGuid[n1];
        to = nameToGuid[n2];
      }
      if (from && to) {
        edgesArr.push({ from, to });

        if (!nodeParents[from]) nodeParents[from] = [];
        nodeParents[from].push(to);

        if (!childrenMap[to]) childrenMap[to] = [];
        childrenMap[to].push(from);
      }
    });
    // 2.5. Inherit nclass from parent if missing (e.g., CILIDI)
    Object.values(nodesMap).forEach(node => {
      if (!node.nclass || node.nclass.trim() === '') {
        if (nodeParents[node.guid] && nodeParents[node.guid].length > 0) {
          const parentId = nodeParents[node.guid][0];
          const parentNode = nodesMap[parentId];
          if (parentNode && parentNode.nclass) {
            node.nclass = parentNode.nclass;
          }
        }
      }
    });
    // 3. Categorize into sections (dynamically via buildDynamicSections)
    buildDynamicSections();
  }
  function buildDynamicSections() {
    dynamicSectionDefs = [];
    dynamicNavTree = [];

    // Find root: no nclass and no parents
    const rootGuid = Object.keys(nodesMap).find(g => !nodesMap[g].nclass && !nodeParents[g]);
    if (!rootGuid) return;

    const seenNclasses = new Set();
    let paletteIdx = 0;

    function registerSection(nclass, label, parentGroup) {
      if (seenNclasses.has(nclass)) return;
      seenNclasses.add(nclass);
      const key = 'sec' + dynamicSectionDefs.length;
      const cfg = KNOWN_SECTION_CONFIG[nclass] || {};
      const icon = cfg.icon || ICON_PALETTE[paletteIdx % ICON_PALETTE.length];
      const color = cfg.color || COLOR_PALETTE[paletteIdx % COLOR_PALETTE.length];
      if (!cfg.icon) paletteIdx++;
      dynamicSectionDefs.push({ key, label: label.trim(), nclass, icon, color, parentGroup: parentGroup || null });
      sections[key] = [];
    }

    // Deduplicated level-1 guids
    const level1Guids = [...new Set(childrenMap[rootGuid] || [])];
    const groupChildMap = {}; // groupLabel -> [section defs]

    level1Guids.forEach(guid1 => {
      const n1 = nodesMap[guid1];
      if (!n1) return;
      if (n1.nclass === 'Group') {
        const groupName = n1.name;
        const level2Guids = [...new Set(childrenMap[guid1] || [])];
        level2Guids.forEach(guid2 => {
          const n2 = nodesMap[guid2];
          if (!n2 || !n2.nclass || STRUCTURAL_NCLASSES.has(n2.nclass)) return;
          registerSection(n2.nclass, n2.name, groupName);
          if (!groupChildMap[groupName]) groupChildMap[groupName] = [];
          const def = dynamicSectionDefs[dynamicSectionDefs.length - 1];
          if (!groupChildMap[groupName].find(d => d.nclass === def.nclass)) groupChildMap[groupName].push(def);
        });
      } else if (n1.nclass && !STRUCTURAL_NCLASSES.has(n1.nclass)) {
        registerSection(n1.nclass, n1.name, null);
      }
    });

    // Fallback: register any KNOWN_SECTION_CONFIG nclass present in nodesMap but missed by tree walk
    // (handles XML files where sections appear at a different tree depth or aren't reachable from root)
    Object.keys(KNOWN_SECTION_CONFIG).forEach(nc => {
      if (seenNclasses.has(nc)) return; // already registered
      const sample = Object.values(nodesMap).find(n => n.nclass === nc);
      if (!sample) return; // nclass not in this XML
      const label = Object.values(nodesMap).find(n => n.nclass === nc && n.data && n.data['Опис'])?.name || nc;
      registerSection(nc, label, null);
    });

    // Build nav tree
    const addedGroups = new Set();
    dynamicSectionDefs.forEach(def => {
      const defCfg = KNOWN_SECTION_CONFIG[def.nclass] || {};
      if (defCfg.navHide) return; // suppress from nav (e.g. Відділи, shown inside Наукові відділи)
      if (def.parentGroup) {
        if (!addedGroups.has(def.parentGroup)) {
          addedGroups.add(def.parentGroup);
          dynamicNavTree.push({ type: 'group', label: def.parentGroup, children: [] });
        }
        const grp = dynamicNavTree.find(n => n.type === 'group' && n.label === def.parentGroup);
        if (grp) grp.children.push(def);
      } else {
        dynamicNavTree.push({ type: 'item', ...def });
      }
    });

    // Categorize leaf nodes into sections
    // Universal filter: exclude section containers (nodes with Опис+Node and only link/no extra data)
    const CONTAINER_SKIP = ['Node', 'photoimage', 'Опис', 'опис', 'Description', 'Галузь', 'Галузь_науки', 'Стан'];
    function isContainerNode(node) {
      const hasOpis = !!((node.data['Опис'] || node.data['опис']) && (node.data['Опис'] || node.data['опис']).length);
      const hasNodeField = !!(node.data['Node'] && node.data['Node'].length);

      const extra = Object.keys(node.data).filter(k => {
        if (CONTAINER_SKIP.includes(k)) return false;
        // Skip fields that just repeat the node name (common in some XML exports)
        const items = node.data[k];
        if (items && items.length === 1 && (items[0].content === node.name || items[0].content === node.nclass)) return false;
        return true;
      });
      const allLinks = extra.length === 0 || extra.every(k => node.data[k].every(i => i.type === 'link'));

      // A container node typically has a description and primarily structural data/links, OR it just has a description and no person-specific fields
      if (hasOpis && allLinks) return true;
      if (hasOpis && hasNodeField && allLinks) return true;

      return false;
    }
    Object.values(nodesMap).forEach(node => {
      const nc = node.nclass;
      if (!nc || STRUCTURAL_NCLASSES.has(nc)) return;
      const def = dynamicSectionDefs.find(d => d.nclass === nc);
      if (!def) return;
      const cfg = KNOWN_SECTION_CONFIG[nc];
      let include;
      if (cfg && cfg.filterFn) {
        // Explicit override (e.g. journal = false, departments = true)
        include = cfg.filterFn(node);
      } else {
        // Universal: containers are section parents shown in header, not as cards
        if (isContainerNode(node)) {
          include = false;
        } else {
          const extra = Object.keys(node.data).filter(k => !CONTAINER_SKIP.includes(k));
          // If a node has a description (Опис) but no other substantive data (only links/images), it's probably better as a container
          include = extra.length > 0;
        }
      }
      if (include) sections[def.key].push(node);
    });
  }
  function renderNav() {
    const navList = document.getElementById('nav-links');
    if (!navList) return;
    let html = `<li><a href="#home" data-route="home">Головна</a></li>`;
    dynamicNavTree.forEach(item => {
      if (item.type === 'group') {
        html += `<li class="dropdown">
          <a href="#" class="dropbtn" onclick="event.preventDefault()">${esc(item.label)} ▾</a>
          <div class="dropdown-content">
            ${item.children.map(c => `<a href="#${c.key}" data-route="${c.key}">${c.icon} ${esc(c.label)}</a>`).join('')}
          </div>
        </li>`;
      } else {
        html += `<li><a href="#${item.key}" data-route="${item.key}">${item.icon} ${esc(item.label)}</a></li>`;
      }
    });
    navList.innerHTML = html;
    adjustNavScale();
  }

  // Count top-level nav items and stamp data-nav-count on the list.
  // CSS uses attribute selectors to pick the right font/padding tier.
  function adjustNavScale() {
    const navList = document.getElementById('nav-links');
    if (!navList) return;
    const count = navList.querySelectorAll(':scope > li').length;
    navList.setAttribute('data-nav-count', count);
  }

  function renderDynamicSection(container, def) {
    const cfg = KNOWN_SECTION_CONFIG[def.nclass] || {};
    let renderer = cfg.renderer || autoDetectRenderer(def);
    const sectionParent = getSectionParentNode(def.key);
    const subtitle = sectionParent?.data?.['Опис']?.[0]?.content || sectionParent?.data?.['опис']?.[0]?.content || '';
    if (renderer === 'departments') {
      // Use the 'Відділи' section key (dept nodes) regardless of which nav item triggered this
      const deptDef = dynamicSectionDefs.find(d => d.nclass === 'Відділи');
      renderDepartments(container, deptDef ? deptDef.key : def.key);
      return;
    }
    const renderFnMap = {
      person: renderPersonCard,
      webresource: renderWebResourceNode,
      project: renderProjectNode,
      publication: renderPublicationNode,
      event: renderGenericEventNode,
    };
    groupAndRender(container, def.key, `${def.icon} ${def.label}`, subtitle, renderFnMap[renderer] || renderGenericEventNode);
  }
  function autoDetectRenderer(def) {
    const sample = (sections[def.key] || [])[0];
    if (!sample) return 'event';
    const ncl = (def.nclass || '').toLowerCase();
    const lbl = (def.label || '').toLowerCase();
    // Force person renderer for management, administration, and scientific departments
    if (ncl.includes('керівництв') || ncl.includes('адмініст') || ncl.includes('manag') || ncl.includes('admin') ||
      lbl.includes('керівництв') || lbl.includes('адмініст') || lbl.includes('відділи')) return 'person';

    if (sample.data['Прізвище_імя_по_батькові'] || sample.data['Партнер'] || sample.data['Прізвище'] || sample.data['Посада']) return 'person';
    if (sample.data['Назва_ресурсу']) return 'webresource';
    if (sample.data['Повна_назва'] || sample.data['Мета_роботи']) return 'project';
    if (sample.data['Захід'] || sample.data['Учасник_програми'] || sample.data['Назва_заходу']) return 'event';
    if (sample.data['Назва'] && sample.data['Автори']) return 'publication';
    if (sample.data['Відділ']) return 'departments';
    if (sample.data['Опис'] || sample.data['опис']) return 'event'; // default fallback with description
    return 'event';
  }
  // ---- Helpers ----
  function getDataFirst(node, tclass) {
    const arr = node.data[tclass];
    return (arr && arr.length > 0) ? arr[0] : null;
  }
  function getDataAll(node, tclass) {
    return node.data[tclass] || [];
  }
  function getPhotoURL(node) {
    const d = getDataFirst(node, 'photoimage');
    return d ? (d.link || d.content) : '';
  }
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
  }
  // Finds the closest structural parent for grouping
  const GENERIC_PARENT_NAMES = new Set([
    'Науковий сектор НЦ МАНУ', 'Науковий сектор НЦ МАНУ V2 8', 'sci_dep', 'sci_dep1',
    '🔬 Керівництво наукового сектору', 'Керівництво наукового сектору НЦ "МАНУ"', 'Керівництво наукового сектору', 'Адміністрація НЦ "МАНУ"',
    'Наукова діяльність', 'Веб-ресурси НЦ "МАНУ"',
    'Науковці', 'Проекти', 'Публікації', 'Ключові публікації',
    'Стажування', 'Міжнародні активності',
    'Керівництво наукового сектору', 'Закордонні науковці, залучені д',
    'Закордонні науковці-партнери', 'Наукові відділи',
  ]);
  function getParentNode(node) {
    if (nodeParents[node.guid] && nodeParents[node.guid].length > 0) {
      for (let pid of nodeParents[node.guid]) {
        let p = nodesMap[pid];
        // Skip overly generic super-parents and Group-class nodes
        if (p && !GENERIC_PARENT_NAMES.has(p.name) && p.nclass !== 'Group') {
          return p;
        }
      }
      // Ultimate fallback: first parent that isn't the root
      let p = nodesMap[nodeParents[node.guid][0]];
      if (p && p.name !== 'Науковий сектор НЦ МАНУ' && p.name !== 'Науковий сектор НЦ МАНУ V2 8') return p;
    }
    return null;
  }
  // Find the section-level parent node for a given section key
  // These are "container" nodes that share the same nclass as the section and have an 'Опис' field
  function getSectionParentNode(sectionKey) {
    const def = dynamicSectionDefs.find(d => d.key === sectionKey);
    if (!def) return null;
    const all = Object.values(nodesMap).filter(n => n.nclass === def.nclass && n.data);
    // Prefer node with Опис (description), fall back to one with prism_to_vis/link data
    return all.find(n => n.data['Опис'] || n.data['опис']) ||
      all.find(n => n.data['prism_to_vis'] || n.data['Prism_to_vis'] || n.data['Посилання_на_сайт']) ||
      null;
  }
  // ---- Routing ----
  function route() {
    const hash = (location.hash || '#home').replace('#', '');
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-route') === hash);
    });
    const main = document.getElementById('app-content');
    main.innerHTML = '';
    window.scrollTo(0, 0);
    if (hash === 'home') { renderHome(main); return; }
    const def = dynamicSectionDefs.find(d => d.key === hash);
    if (def) { renderDynamicSection(main, def); return; }
    renderHome(main);
  }
  function hideLoading() {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.classList.add('hidden');
  }
  // ---- Generic Grouping Renderer ----
  function groupAndRender(container, sectionKey, title, subtitle, renderCardFn, defaultGroup = 'Інше') {
    // Find the section-level parent node (e.g. "Публікації" at xPos=400)
    // and render its data (links, descriptions) at the top of the section page.
    const sectionParent = getSectionParentNode(sectionKey);
    let sectionHtml = '';
    if (sectionParent && sectionParent.data) {
      const SKIP_TOP = ['photoimage', 'Node', 'Name', 'Title', 'Повна_назва', 'Назва', 'Захід', 'Галузь', 'Опис', 'опис'];
      const fieldsHtml = renderDataFields(sectionParent, SKIP_TOP);
      if (fieldsHtml) {
        sectionHtml = `<div class="section-parent-data">${fieldsHtml}</div>`;
      }
    }
    let html =
      `<section class="section">
        <button class="back-btn" onclick="location.hash='home'">← На головну</button>
        <div class="section-header">
          <h2>${title}</h2>
          <p>${subtitle}</p>
          ${sectionHtml}
          <div class="section-divider"></div>
        </div>
   `;
    const groupMap = {};
    const groupNodes = {}; // map of gKey -> parentNode
    let items = sections[sectionKey] || [];
    // Fallback: if section appears empty, re-scan nodesMap with universal filter
    if (items.length === 0) {
      const _def = dynamicSectionDefs.find(d => d.key === sectionKey);
      if (_def) {
        const _cfg = KNOWN_SECTION_CONFIG[_def.nclass];
        const CSKIP = ['Node', 'photoimage', 'Опис', 'опис', 'Галузь', 'Галузь_науки', 'Стан'];
        items = Object.values(nodesMap).filter(node => {
          if (node.nclass !== _def.nclass) return false;
          if (_cfg && _cfg.filterFn) return _cfg.filterFn(node);
          // Universal: exclude containers, include nodes with substantive data
          const hasOpis = !!((node.data['Опис'] || node.data['опис']) && (node.data['Опис'] || node.data['опис']).length);
          const hasNodeF = !!(node.data['Node'] && node.data['Node'].length);
          const extra = Object.keys(node.data).filter(k => !CSKIP.includes(k));
          const allLinks = extra.length === 0 || extra.every(k => node.data[k].every(i => i.type === 'link'));
          if (hasOpis && allLinks) return false; // container
          if (hasOpis && hasNodeF && allLinks) return false; // container
          return extra.length > 0;
        });
      }
    }
    items.forEach(node => {
      let pNode = getParentNode(node);
      let pName = pNode ? pNode.name : null;
      // Contextual fallbacks if edge doesn't provide a useful parent
      if (!pName || pName === node.nclass || pName === 'Наукові партнери' || pName === 'Закордонні науковці, залучені д' || pName === 'Закордонні науковці-партнери') {
        const secDef = dynamicSectionDefs.find(d => d.key === sectionKey);
        const nc = secDef ? secDef.nclass : '';
        if (nc === 'Веб-ресурси НЦ "МАНУ"') pName = getDataFirst(node, 'Галузь')?.content;
        else if (nc === 'Наукові відділи') pName = getDataFirst(node, 'Відділи')?.content || getDataFirst(node, 'Підрозділ')?.content || getDataFirst(node, 'Структурний_підрозділ_основного_місця_роботи')?.content;
        else if (nc === 'Проекти') pName = getDataFirst(node, 'Стан')?.content;
        else if (nc.includes('Керівництво') || nc === 'Адміністрація НЦ "МАНУ"') pName = null;
        pNode = null;
      }
      const groupKey = (pName && pName.trim() !== '') ? pName.trim() : defaultGroup;
      if (!groupMap[groupKey]) groupMap[groupKey] = [];
      groupMap[groupKey].push(node);
      if (pNode && !groupNodes[groupKey]) groupNodes[groupKey] = pNode;
    });
    const sortedGroups = Object.keys(groupMap).sort((a, b) => {
      if (a === defaultGroup) return 1;
      if (b === defaultGroup) return -1;

      const secDef = dynamicSectionDefs.find(d => d.key === sectionKey);
      const sectionName = secDef ? secDef.label : '';

      // Priority groups requested by user
      if (sectionName.includes('Веб-ресурси')) {
        const priority = ['Освіта', 'Міждисциплінарні освітні програми'];
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
      } else if (sectionName.includes('публікації')) {
        const priority = ['Наукова освіта.'];
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
      }

      return a.localeCompare(b);
    });
    sortedGroups.forEach(gKey => {
      const secDef = dynamicSectionDefs.find(d => d.key === sectionKey);
      const secName = secDef ? secDef.label : '';

      // Hide group header if it's the only one, or if it's the default group, or if it matches section name (requested by user)
      if (sortedGroups.length > 1 && gKey !== defaultGroup && gKey !== secName) {
        html += `<h3 style="margin-top:2.5rem; margin-bottom:1.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-glass); color: var(--accent-emerald); font-size: 1.25rem;">${esc(gKey)}</h3>`;
        if (!groupNodes[gKey]) {
          const found = Object.values(nodesMap).find(n => n.name === gKey || (n.data && n.data['Name'] && n.data['Name'][0].content === gKey));
          if (found) groupNodes[gKey] = found;
        }
      } else {
        html += `<div style="margin-top:2rem;"></div>`;
      }
      const isScientistsRelated = secDef && (secDef.nclass === 'Наукові відділи' || secDef.nclass === '🔬 Керівництво наукового сектору' || secDef.nclass.includes('Керівництво'));

      if (isScientistsRelated) {
        // Promoted persons (Leadership/Heads) go to top of each group
        const leadershipKeywords = ['начальник відділу', 'зав. відділом', 'завідувач відділу', 'керівник відділу', 'завідувач лабораторії', 'начальник лабораторії', 'директор', 'заступник директора', 'президент', 'віце-президент', 'академік-секретар', 'учений секретар', 'вчений секретар'];
        const leadItems = [];
        const regularItems = [];
        groupMap[gKey].forEach(node => {
          const pList = node.data && (node.data['Посада_за_основним_місцем_роботи'] || node.data['Посада'] || node.data['Спеціалізація']);
          const pos = pList && pList[0] ? pList[0].content.toLowerCase() : '';
          if (leadershipKeywords.some(kw => pos.includes(kw))) leadItems.push(node);
          else regularItems.push(node);
        });

        // If it's the "Керівництво" section specifically, apply the fallback sorting for the top trio.
        if (secDef.nclass.includes('Керівництво') && gKey === defaultGroup) {
          const ADMIN_ORDER = ['Довгий', 'Савченко', 'Стрижак'];
          leadItems.sort((a, b) => {
            const ai = ADMIN_ORDER.findIndex(s => a.name.includes(s));
            const bi = ADMIN_ORDER.findIndex(s => b.name.includes(s));
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
        }

        if (secDef.nclass.includes('Керівництво')) {
          // Leadership section: Keep everyone in ONE grid, but maintain the sort order
          html += `<div class="cards-grid stagger">`;
          [...leadItems, ...regularItems].forEach(node => {
            if (node.name === gKey || node.guid === groupNodes[gKey]?.guid) return;
            html += renderCardFn(node);
          });
          html += `</div>`;
        } else {
          // Standard department: Separate heads from staff with a small gap
          if (leadItems.length > 0) {
            html += `<div class="cards-grid stagger" style="margin-bottom: 24px;">`;
            leadItems.forEach(node => {
              if (node.name === gKey || node.guid === groupNodes[gKey]?.guid) return;
              html += renderCardFn(node);
            });
            html += `</div>`;
          }
          if (regularItems.length > 0) {
            html += `<div class="cards-grid stagger">`;
            regularItems.forEach(node => {
              if (node.name === gKey || node.guid === groupNodes[gKey]?.guid) return;
              html += renderCardFn(node);
            });
            html += `</div>`;
          }
        }
      } else if (secDef && secDef.label.includes('Наукові заходи')) {
        // Conference sorting with Roman numeral support (I, II, III, IV...)
        const romanVal = (s) => {
          if (!s) return 0;
          const match = s.match(/(^|\b)(XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(\b|$)/i);
          if (!match) return 0;
          const r = match[2].toUpperCase();
          const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18 };
          return map[r] || 0;
        };
        const sortedConfs = [...groupMap[gKey]].sort((a, b) => {
          const aStr = (a.name || '') + ' ' + (getDataFirst(a, 'Захід')?.content || '') + ' ' + (getDataFirst(a, 'Посилання')?.link || '') + ' ' + (getDataFirst(a, 'Посилання')?.content || '');
          const bStr = (b.name || '') + ' ' + (getDataFirst(b, 'Захід')?.content || '') + ' ' + (getDataFirst(b, 'Посилання')?.link || '') + ' ' + (getDataFirst(b, 'Посилання')?.content || '');
          const ar = romanVal(aStr);
          const br = romanVal(bStr);
          if (ar !== br) return ar - br;
          return (a.name || '').localeCompare(b.name || '');
        });
        html += `<div class="cards-grid stagger">`;
        sortedConfs.forEach(node => {
          if (node.name === gKey || node.guid === groupNodes[gKey]?.guid) return;
          html += renderCardFn(node);
        });
        html += `</div>`;
      } else {
        // All other sections (partners, events, etc.): render flat in XML order
        html += `<div class="cards-grid stagger">`;
        groupMap[gKey].forEach(node => {
          if (node.name === gKey || node.guid === groupNodes[gKey]?.guid) return;
          html += renderCardFn(node);
        });
        html += `</div>`;
      }
    });
    html += '</section>';
    container.innerHTML = html;
  }
  // ---- Node Card Renderers ----

  // For Scientists, Administration, and Partners
  function renderPersonCard(node) {
    const photo = getPhotoURL(node);
    const name = node.name;
    const position = getDataFirst(node, 'Посада_за_основним_місцем_роботи') || getDataFirst(node, 'Посада') || getDataFirst(node, 'Спеціалізація');
    const degree = getDataFirst(node, 'Науковий_ступінь_звання') || getDataFirst(node, 'Ступінь');
    const desc = getDataFirst(node, 'Опис') || getDataFirst(node, 'опис') || getDataFirst(node, 'Description');
    const orcid = getDataFirst(node, 'ORCID_ID') || getDataFirst(node, 'Orcid');
    const scholar = getDataFirst(node, 'Google_Scholar_Профіль_дослідника') || getDataFirst(node, 'Google_scholar');
    const scopus = getDataFirst(node, 'Scopus_Author_ID') || getDataFirst(node, 'Scopus');
    const wos = getDataFirst(node, 'Web_of_Science_ResearcherID_Publons') || getDataFirst(node, 'Web_of_science');
    const badges = [
      orcid && `<span class="person-link">ORCID</span>`,
      scholar && `<span class="person-link">Google Scholar</span>`,
      scopus && `<span class="person-link">Scopus</span>`,
      wos && `<span class="person-link">Web of Science</span>`,
    ].filter(Boolean).join('');

    return `
      <div class="person-card" style="cursor:pointer" onclick="window.__showPerson('${node.guid}')">
        <div class="person-card-header" style="display:flex;align-items:flex-start;gap:16px;padding:20px;flex:1;">
          ${photo
        ? `<img class="person-photo" src="${esc(photo)}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:72px;height:72px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        : `<div class="person-photo-placeholder">👤</div>`}
          <div class="person-info">
            <h3>${esc(name)}</h3>
            ${position ? `<div class="position">${makeCollapsible(position.content)}</div>` : ''}
            ${degree ? `<div class="degree" style="font-weight:600;">${makeCollapsible(degree.content)}</div>` : ''}
            ${desc ? `<div class="description" style="margin-top:8px; font-size:0.85rem; color:var(--text-secondary);">${makeCollapsible(desc.content)}</div>` : ''}
          </div>
        </div>
        ${badges ? `<div class="person-links">${badges}</div>` : ''}
      </div>
   `;
  }
  function renderWebResourceNode(node) {
    const rName = getDataFirst(node, 'Назва_ресурсу') || getDataFirst(node, 'Назва') || { content: node.name };
    const rDesc = getDataFirst(node, 'Короткий_опис');
    const rLink = getDataFirst(node, 'Посилання') || getDataFirst(node, 'Посилання на сайт') || getDataFirst(node, 'Посилання_на_сайт') || getDataFirst(node, 'Офіційний_сайт');
    const rSpec = getDataFirst(node, 'Назва_спеціальності');
    const rLang = getDataFirst(node, 'Мова');
    // Check for inline prism visualization
    const prismData = getDataFirst(node, 'prism_to_vis') || getDataFirst(node, 'Prism_to_vis');
    const prismUrl = prismData ? (prismData.link || prismData.content) : '';
    // Render remaining data fields not already shown above
    const SKIP_CARD = ['Назва_ресурсу', 'Назва', 'Короткий_опис', 'Посилання', 'Посилання на сайт', 'Посилання_на_сайт', 'Офіційний_сайт', 'Назва_спеціальності', 'Мова', 'Галузь', 'photoimage', 'prism_to_vis', 'Prism_to_vis', 'Node'];
    const extraHtml = renderDataFields(node, SKIP_CARD);
    return `
      <div class="resource-card" style="cursor:pointer" onclick="window.__showDetail('${node.guid}')">
        <h3>${esc(rName.content)}</h3>
        ${rDesc ? `<div class="description">${makeCollapsible(rDesc.content)}</div>` : ''}
        <div class="resource-meta">
          ${rSpec ? `<span class="resource-tag">${esc(rSpec.content)}</span>` : ''}
          ${rLang ? `<span class="resource-tag">${esc(rLang.content)}</span>` : ''}
        </div>
        ${extraHtml ? `<div class="data-fields-grid">${extraHtml}</div>` : ''}
        ${prismUrl ? `<div onclick="event.stopPropagation()">${prismData.content && prismData.content !== prismUrl ? `<h3 class="prism-title" style="padding:16px 0 8px;">${esc(prismData.content)}</h3>` : ''}<iframe src="${esc(prismUrl)}" height="400" title="Visualization" style="width:100%; border:none; border-radius:8px; background:#fff; margin-top:4px;"></iframe></div>` : ''}
        ${rLink && (rLink.link || rLink.content) ? `<a class="resource-link-btn" href="${esc(rLink.link || rLink.content)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Перейти →</a>` : ''}
      </div>
   `;
  }
  function renderProjectNode(node) {
    const photo = getPhotoURL(node);
    const name = getDataFirst(node, 'Повна_назва') || { content: node.name };
    const timeline = getDataFirst(node, 'Строки_виконання_роботи');
    const goal = getDataFirst(node, 'Мета_роботи');
    const rk = getDataFirst(node, 'Номер_РК');
    const state = getDataFirst(node, 'Стан')?.content || '';
    const statusClass = state.includes('Завершені') ? 'completed' : 'current';
    return `
      <div class="project-card" style="cursor:pointer" onclick="window.__showDetail('${node.guid}')">
        ${photo ? `<img class="project-card-img" src="${esc(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="project-card-body">
          <div class="project-status ${statusClass}">● ${statusClass === 'current' ? 'Поточний' : 'Завершений'}</div>
          <h3>${esc(truncate(name.content, 120))}</h3>
          ${timeline ? `<div class="timeline">📅 ${esc(timeline.content)}</div>` : ''}
          ${rk ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">№ ${esc(rk.content)}</div>` : ''}
          ${goal ? `<div class="goal">${makeCollapsible(goal.content)}</div>` : ''}
        </div>
      </div>
   `;
  }
  function renderPublicationNode(node) {
    const photo = getPhotoURL(node);
    const title = getDataFirst(node, 'Назва') || { content: node.name };
    const type = getDataFirst(node, 'Тип');
    const authors = getDataAll(node, 'Автори').map(a => a.content).join(', ');
    const abstract = getDataFirst(node, 'Анотація');
    const date = getDataFirst(node, 'Дата_видання');
    const link = getDataFirst(node, 'Посиланняlink') || getDataFirst(node, 'Посилання');
    return `
      <div class="pub-card" onclick="window.__showDetail('${node.guid}')" style="cursor:pointer">
        ${photo ? `<img class="pub-card-img" src="${esc(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="pub-card-body">
          ${type ? `<span class="pub-type-badge">${esc(type.content)}</span>` : ''}
          <h3>${esc(title.content)}</h3>
          ${authors ? `<div class="authors">${makeCollapsible(authors)}</div>` : ''}
          ${date ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">${esc(date.content)}</div>` : ''}
          ${abstract ? `<div class="abstract">${makeCollapsible(abstract.content)}</div>` : ''}
          ${link && (link.link || link.content) ? `<div style="margin-top:auto;padding-top:12px;"><a class="resource-link-btn" href="${esc(link.link || link.content)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Читати →</a></div>` : ''}
        </div>
      </div>
   `;
  }
  function renderGenericEventNode(node) {
    const photo = getPhotoURL(node);
    // Try all common title fields, fall back to node name
    const titleObj = getDataFirst(node, 'Захід') || getDataFirst(node, 'Стажування') ||
      getDataFirst(node, 'Назва_заходу') || getDataFirst(node, 'Name') ||
      { content: node.name };
    const desc = getDataFirst(node, 'Анонс') || getDataFirst(node, 'Анотація_програми') ||
      getDataFirst(node, 'Короткий_опис') || getDataFirst(node, 'Аnnouncement');
    const period = getDataFirst(node, 'Період_участі') || getDataFirst(node, 'Рік_проведення');
    const participant = getDataFirst(node, 'Учасник_програми');
    const country = getDataFirst(node, 'Країна_та_заклад_що_надають_програму');
    const direction = getDataFirst(node, 'Напрям_дослідження') || getDataFirst(node, 'Назва_групи_заходу');
    const link = getDataFirst(node, 'Посилання') || getDataFirst(node, 'Посилання_на_джерелоlink');
    return `
      <div class="project-card" style="cursor:pointer" onclick="window.__showDetail('${node.guid}')">
        ${photo ? `<img class="project-card-img" src="${esc(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        <div class="project-card-body">
          <h3>${esc(titleObj.content)}</h3>
          ${participant ? `<div style="font-size:0.85rem;color:var(--accent-blue);margin-bottom:6px;">👤 ${esc(participant.content)}</div>` : ''}
          ${period ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">📅 ${esc(period.content)}</div>` : ''}
          ${country ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px;">🏛️ ${makeCollapsible(country.content)}</div>` : ''}
          ${direction ? `<div class="goal">${makeCollapsible(direction.content)}</div>` : (desc ? `<div class="goal">${makeCollapsible(desc.content)}</div>` : '')}
          ${link && (link.link || link.content) ? `<a class="resource-link-btn" href="${esc(link.link || link.content)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="margin-top:auto;display:inline-flex;">Перейти →</a>` : ''}
        </div>
      </div>
   `;
  }
  // Render all data fields of a node as styled HTML blocks.
  // Handles both link-type and text-type data items properly.
  // skipKeys: array of tclass keys to skip (e.g. photoimage, Name, Title etc.)
  function renderDataFields(node, skipKeys) {
    if (!node || !node.data) return '';
    let extraHtml = '';

    let keys = Object.keys(node.data).filter(k => !(skipKeys && skipKeys.includes(k)));

    // Sort keys to prioritize leadership roles
    const topRowKeywords = ['начальник_відділу', 'зав._відділом', 'завідувач_відділу', 'керівник_відділу', 'завідувач_лабораторії', 'начальник_лабораторії'];
    keys.sort((a, b) => {
      const aLow = a.toLowerCase();
      const bLow = b.toLowerCase();
      const aTop = topRowKeywords.some(kw => aLow.includes(kw));
      const bTop = topRowKeywords.some(kw => bLow.includes(kw));
      if (aTop && !bTop) return -1;
      if (!aTop && bTop) return 1;
      return 0; // maintain existing order otherwise
    });
    keys.forEach(key => {
      const fieldItems = node.data[key];
      if (!fieldItems || fieldItems.length === 0) return;
      // Render prism_to_vis fields as iframes
      if (key.toLowerCase() === 'prism_to_vis') {
        fieldItems.forEach(d => {
          if (d.type !== 'link') return;
          const url = d.link || d.content;
          if (!url) return;
          const title = d.content && d.content !== url ? d.content : '';
          extraHtml += `<div onclick="event.stopPropagation()" style="width:100%;margin-top:12px;">${title ? `<h3 class="prism-title" style="padding:16px 0 8px;">${esc(title)}</h3>` : ''}<iframe src="${esc(url)}" height="400" title="Visualization" style="width:100%; border:none; border-radius:8px; background:#fff; margin-top:4px;"></iframe></div>`;
        });
        return;
      }
      let parts = [];
      fieldItems.forEach(d => {
        if (d.type === 'image' || d.tclass === 'photoimage') return; // skip images
        if (d.type === 'link' && (d.link || d.content)) {
          const url = d.link || d.content;
          if ((d.tclass || '').toLowerCase() === 'prism_to_vis') {
            const label = d.content && d.content !== url ? d.content : 'Переглянути';
            parts.push(`<a href="${esc(url)}" target="_blank" rel="noopener" class="resource-link-btn" style="margin:2px 0;display:inline-flex;">${esc(label)}</a>`);
          } else {
            const label = (d.content && d.content !== url) ? d.content : url;
            parts.push(`<a href="${esc(url)}" target="_blank" rel="noopener" class="resource-link-btn" style="margin:2px 0;display:inline-flex;">${esc(key.replace(/_/g, ' '))}: ${esc(label)}</a>`);
          }
        } else if (d.content && d.content.trim()) {
          parts.push(esc(d.content));
        }
      });
      if (parts.length === 0) return;
      // If this field is purely links, render as link buttons, otherwise as text
      const isAllLinks = fieldItems.every(d => d.type === 'link' || !d.content || !d.content.trim());
      if (isAllLinks) {
        extraHtml += `<div class="data-field link-group">${parts.join(' ')}</div>`;
      } else {
        const textComb = parts.join('\n');
        const isTopRole = topRowKeywords.some(kw => key.toLowerCase().includes(kw));
        const isLongText = textComb.length > 80;
        const widthClass = (isLongText || isTopRole) ? 'w-full' : '';
        extraHtml += `<div class="data-field ${widthClass}">
          <strong class="data-field-label">${esc(key.replace(/_/g, ' '))}</strong>
          <div class="data-field-content">${makeCollapsibleHtml(textComb)}</div>
        </div>`;
      }
    });
    return extraHtml;
  }
  // ---- Expand / Collapse helpers ----
  const COLLAPSE_LIMIT = 500; // characters before showing "Read more" (increased for leadership cards)
  // Returns HTML with collapsible text (if plain text exceeds COLLAPSE_LIMIT)
  function makeCollapsible(text) {
    if (!text || text.length <= COLLAPSE_LIMIT) return esc(text || '');
    const short = esc(text.substring(0, COLLAPSE_LIMIT));
    const full = esc(text);
    return `<span class="collapsible-text"><span class="text-short">${short}<span class="ellipsis">…</span></span><span class="text-full hidden">${full}</span></span><button class="expand-btn" onclick="event.stopPropagation(); window.__toggleExpand(this)" aria-expanded="false">Детальніше ▾</button>`;
  }
  // Returns HTML with collapsible content for pre-built HTML strings (no double escaping)
  function makeCollapsibleHtml(html) {
    if (!html || html.length <= COLLAPSE_LIMIT) return html || '';
    const short = html.substring(0, COLLAPSE_LIMIT);
    return `<span class="collapsible-text"><span class="text-short">${short}<span class="ellipsis">…</span></span><span class="text-full hidden">${html}</span></span><button class="expand-btn" onclick="event.stopPropagation(); window.__toggleExpand(this)" aria-expanded="false">Детальніше ▾</button>`;
  }
  window.__toggleExpand = function (btn) {
    const wrapper = btn.previousElementSibling;
    const short = wrapper.querySelector('.text-short');
    const full = wrapper.querySelector('.text-full');
    const open = btn.getAttribute('aria-expanded') === 'true';
    if (open) {
      short.classList.remove('hidden');
      full.classList.add('hidden');
      btn.textContent = 'Детальніше ▾';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      short.classList.add('hidden');
      full.classList.remove('hidden');
      btn.textContent = 'Згорнути ▴';
      btn.setAttribute('aria-expanded', 'true');
    }
  };
  // ---- Home & Departments Renderers ----
  function renderHome(container) {
    // Find root node to get dynamic title from XML
    const rootNode = Object.values(nodesMap).find(n => (!n.nclass || n.nclass === '') && (n.name === 'Науковий сектор НЦ МАНУ' || n.name === 'sci_dep1' || n.name === 'sci_dep')) ||
      Object.values(nodesMap).find(n => (!n.nclass || n.nclass === '') && (parseInt(n.xPos || 0) === 0 || n.guid === 'sci_dep1'));
    const headerTitle = rootNode ? rootNode.name : 'Керівництво наукового сектору НЦ "МАНУ"'; // fallback to section name if root node is missing or renamed
    // Find prism_to_vis iframe URL from root node data
    let prismVisUrl = '';
    let prismVisTitle = '';
    if (rootNode && rootNode.data) {
      const prismKey = Object.keys(rootNode.data).find(k => k.toLowerCase() === 'prism_to_vis');
      if (prismKey) {
        const prismItems = rootNode.data[prismKey];
        const prismItem = prismItems && prismItems.find(i => i.type === 'link' && (i.link || i.content));
        if (prismItem) {
          prismVisUrl = prismItem.link || prismItem.content;
          if (prismItem.content && prismItem.content !== prismVisUrl) prismVisTitle = prismItem.content;
        }
      }
    }
    // Build dashboard statistics HTML
    const statsHtml = DASHBOARD_STATS.map(s =>
      `<div class="dash-stat" data-target="${s.value}">
        <div class="dash-stat-icon">${s.icon}</div>
        <div class="dash-stat-value"><span class="counter">0</span>${s.suffix}</div>
        <div class="dash-stat-label">${esc(s.label)}</div>
      </div>`
    ).join('');
    const iframeSection = prismVisUrl
      ? `<section class="home-vis-section">
          ${prismVisTitle ? `<h2 class="prism-title">${esc(prismVisTitle)}</h2>` : ''}
          <iframe src="${esc(prismVisUrl)}" title="Ontosite Visualization" class="home-vis-iframe" allowfullscreen></iframe>
          <div class="home-vis-scroll-hint">↓</div>
        </section>`
      : '';
    container.innerHTML =
      `<section class="home-root-section">
        <canvas id="particles-canvas" class="particles-canvas"></canvas>
        <div class="home-root-overlay"></div>
        <div class="home-root-content">
          <h1 class="home-root-title">${esc(headerTitle)}</h1>
          <div class="dash-stats-bar">${statsHtml}</div>
          <div style="margin-top: 40px; text-align: center; color: var(--text-secondary); font-size: 0.9rem; background: rgba(59, 130, 246, 0.04); padding: 16px; border-radius: var(--radius-md); border: 1px solid rgba(59, 130, 246, 0.15); animation: fadeInUp 0.6s ease 0.3s both;">
            Дані взято з <strong>ІАС «ПОЛІЕДР-дослідник»</strong>:
            <a href="https://e-devel.ulif.org.ua/intranet" target="_blank" rel="noopener" style="color: var(--accent-blue); text-decoration: none; font-weight: 500;">https://e-devel.ulif.org.ua/intranet ↗</a>
          </div>
        </div>
      </section>
      ${iframeSection}`;
    initParticles();
    // Animate counters after DOM is ready
    requestAnimationFrame(() => animateCounters());
  }
  function getDeptScientists(dept) {
    const POSITION_RANK = [
      'завідувач', 'керівник відділу', 'головний науковий',
      'провідний науковий', 'старший науковий', 'науковий співробітник',
      'молодший науковий', 'інженер', 'програміст',
    ];
    function posRank(pos) {
      if (!pos) return 99;
      const lp = pos.toLowerCase();
      for (let i = 0; i < POSITION_RANK.length; i++) {
        if (lp.includes(POSITION_RANK[i])) return i;
      }
      return 50;
    }
    const guids = childrenMap[dept.guid] || [];
    const scientists = guids.map(g => nodesMap[g]).filter(n => n && n.nclass === 'Наукові відділи');
    scientists.sort((a, b) => posRank(getDataFirst(a, 'Посада_за_основним_місцем_роботи')?.content || '') -
      posRank(getDataFirst(b, 'Посада_за_основним_місцем_роботи')?.content || ''));
    return scientists;
  }

  function renderDepartments(container, sectionKey) {
    const depts = sections[sectionKey] || [];
    let html =
      `<section class="section">
        <button class="back-btn" onclick="location.hash='home'">← На головну</button>
        <div class="section-header">
          <h2>🏛️ Наукові підрозділи</h2>
          <p>Відділи наукового центру та їх співробітників</p>
          <div class="section-divider"></div>
        </div>
        <div class="cards-grid stagger">
   `;
    depts.forEach(dept => {
      const photo = getPhotoURL(dept);
      const nameData = getDataFirst(dept, 'Відділ') || getDataFirst(dept, 'Name') || { content: dept.name };
      const desc = getDataAll(dept, 'Загальна_інформація_про_відділ');
      const descText = desc.map(d => d.content).join(' ').trim();
      const scientists = getDeptScientists(dept);
      html += `
        <div class="dept-card" style="cursor:pointer" onclick="window.__showDept('${dept.guid}')">
          <div class="dept-header">
            ${photo ? `<img class="dept-photo" src="${esc(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <h3>${esc(nameData.content)}</h3>
          </div>
          ${descText ? `<div class="dept-desc">${makeCollapsible(descText)}</div>` : ''}
          ${scientists.length > 0 ? `<div class="dept-staff-count" style="padding:8px 24px;font-size:0.8rem;color:var(--accent-emerald);">👤 ${scientists.length} співробітників</div>` : ''}
        </div>`;
    });
    html += '</div></section>';
    container.innerHTML = html;
  }
  // ---- Interactive Effects ----
  function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    counters.forEach(el => {
      const parent = el.closest('.dash-stat') || el.closest('.lh-stat');
      const target = parent ? parseInt(parent.getAttribute('data-target') || '0') : 0;
      const duration = 1600;
      const start = performance.now();
      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
  function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, dots = [];
    function resize() {
      const section = canvas.parentElement;
      w = canvas.width = section.offsetWidth;
      h = canvas.height = section.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    const count = Math.min(60, Math.floor(window.innerWidth / 20));
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.4 + 0.1
      });
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      dots.forEach((d, i) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = w;
        if (d.x > w) d.x = 0;
        if (d.y < 0) d.y = h;
        if (d.y > h) d.y = 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 160, 255, ${d.opacity})`;
        ctx.fill();
        for (let j = i + 1; j < dots.length; j++) {
          const dx = d.x - dots[j].x;
          const dy = d.y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(100, 160, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });
      requestAnimationFrame(draw);
    }
    draw();
  }
  // ---- Modals ----
  // Renders one data field for a modal, treating link-type items as <a> tags.
  function renderModalSection(key, items) {
    const label = esc(key.replace(/_/g, ' '));
    const linkParts = [], textParts = [];
    items.forEach(i => {
      if (i.type === 'image' || i.tclass === 'photoimage') return;
      if (i.type === 'link' && (i.link || i.content)) {
        const url = i.link || i.content;
        const lbl = (i.content && i.content !== url && i.content.trim()) ? i.content : url;
        linkParts.push(`<a class="resource-link-btn" href="${esc(url)}" target="_blank" rel="noopener" style="margin:2px 0;">${esc(lbl)}</a>`);
      } else if (i.content && i.content.trim()) {
        const t = i.content.trim();
        if (/^https?:\/\//i.test(t)) {
          linkParts.push(`<a class="resource-link-btn" href="${esc(t)}" target="_blank" rel="noopener" style="margin:2px 0;">${esc(t)}</a>`);
        } else {
          textParts.push(t);
        }
      }
    });
    if (linkParts.length === 0 && textParts.length === 0) return '';
    let body = '';
    if (textParts.length > 0) body += `<div class="modal-section-content" style="white-space:pre-wrap;">${esc(textParts.join('\n'))}</div>`;
    if (linkParts.length > 0) body += `<div class="modal-section-content" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:${textParts.length ? '8px' : '0'};">${linkParts.join('')}</div>`;
    return `<div class="modal-section"><div class="modal-section-title">${label}</div>${body}</div>`;
  }

  window.__showPerson = function (guid) {
    const node = nodesMap[guid];
    if (!node) return;
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-body');
    const photo = getPhotoURL(node);
    const nameObj = getDataFirst(node, 'Прізвище_імя_по_батькові') || getDataFirst(node, 'Name') || getDataFirst(node, 'Title');
    const fullName = nameObj ? nameObj.content : node.name;
    const FIELDS = [
      ['Посада_за_основним_місцем_роботи', 'Посада'],
      ['Посада', 'Посада'],
      ['Спеціалізація', 'Спеціалізація'],
      ['Додаткова_спеціалізація', 'Додаткова спеціалізація'],
      ['Науковий_ступінь_звання', 'Науковий ступінь / Вчене звання'],
      ['Ступінь', 'Науковий ступінь'],
      ['Структурний_підрозділ_основного_місця_роботи', 'Підрозділ'],
      ['Підрозділ', 'Підрозділ'],
      ['Заклад_установа_основного_місця_роботи_повна_назва', 'Заклад'],
      ['Установа', 'Установа'],
      ['Країна', 'Країна'],
      ['Анотація_наукової_діяльності', 'Наукова діяльність'],
      ['Основні_здобутки_наукової_діяльності', 'Основні здобутки'],
      ['Сфера_наукових_інтересів_напрями_досліджень', 'Наукові інтереси'],
      ['Біографія', 'Біографія'],
      ['Участь_у_науково-дослідних_і_освітніх_проєктах', 'Проекти'],
      ['Найважливіші_наукові_публікації_за_останні_5_років', 'Ключові публікації']
    ];
    let html = `<button class="modal-close" onclick="window.__closeModal()">✕</button>`;
    if (photo) html += `<img src="${esc(photo)}" alt="" style="width:100px;height:100px;border-radius:50%;object-fit:cover;margin-bottom:16px;border:2px solid var(--border-glass);" loading="lazy" onerror="this.style.display='none'">`;
    html += `<h2 style="margin-bottom: 8px;">${esc(fullName)}</h2>`;
    // Links
    const orcid = getDataFirst(node, 'ORCID_ID') || getDataFirst(node, 'Orcid');
    const scholar = getDataFirst(node, 'Google_Scholar_Профіль_дослідника') || getDataFirst(node, 'Google_scholar');
    const scopus = getDataFirst(node, 'Scopus_Author_ID') || getDataFirst(node, 'Scopus');
    const wos = getDataFirst(node, 'Web_of_Science_ResearcherID_Publons') || getDataFirst(node, 'Web_of_science');

    let links = '';
    if (orcid) links += `<a class="resource-link-btn" href="${esc(orcid.content.startsWith('http') ? orcid.content : 'https://orcid.org/' + orcid.content)}" target="_blank" rel="noopener">ORCID</a>`;
    if (scholar) links += `<a class="resource-link-btn" href="${esc(scholar.content)}" target="_blank" rel="noopener">Google Scholar</a>`;
    if (scopus) links += `<a class="resource-link-btn" href="${esc(scopus.content.startsWith('http') ? scopus.content : 'https://' + scopus.content)}" target="_blank" rel="noopener">Scopus</a>`;
    if (wos) links += `<a class="resource-link-btn" href="${esc(wos.content.startsWith('http') ? wos.content : 'https://' + wos.content)}" target="_blank" rel="noopener">Web of Science</a>`;

    if (links) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">${links}</div>`;
    const usedLabels = new Set();

    FIELDS.forEach(([key, label]) => {
      const items = getDataAll(node, key);
      if (items.length > 0 && !usedLabels.has(label)) {
        const combined = items.map(i => i.content).join('\n');
        if (combined.trim()) {
          usedLabels.add(label);
          html +=
            `<div class="modal-section">
                <div class="modal-section-title">${esc(label)}</div>
                <div class="modal-section-content" style="white-space: pre-wrap;">${esc(combined)}</div>
              </div>
             `;
        }
      }
    });
    // Also render any data not in FIELDS
    const skipKeys = ['photoimage', 'Name', 'Title', 'Прізвище_імя_по_батькові', 'ORCID_ID', 'Orcid', 'Google_Scholar_Профіль_дослідника', 'Google_scholar', 'Scopus_Author_ID', 'Scopus', 'Web_of_Science_ResearcherID_Publons', 'Web_of_science'];
    const fieldKeys = FIELDS.map(f => f[0]);
    Object.keys(node.data).forEach(key => {
      if (skipKeys.includes(key) || fieldKeys.includes(key)) return;
      const items = node.data[key];
      if (!items || items.length === 0) return;
      html += renderModalSection(key, items);
    });
    content.innerHTML = html;
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  };
  window.__showDetail = function (guid) {
    const node = nodesMap[guid];
    if (!node) return;
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-body');
    const nameObj = getDataFirst(node, 'Повна_назва') || getDataFirst(node, 'Назва') || getDataFirst(node, 'Назва_ресурсу') || getDataFirst(node, 'Name') || getDataFirst(node, 'Захід');
    const name = nameObj ? nameObj.content : node.name;
    let html = `<button class="modal-close" onclick="window.__closeModal()">✕</button>`;
    html += `<h2 style="margin-bottom: 1rem;">${esc(name)}</h2>`;
    // Render all generic data fields cleanly
    const skipKeys = ['photoimage', 'Повна_назва', 'Назва', 'Назва_ресурсу', 'Name', 'Захід', 'Посиланняlink', 'Посилання_на_звітlink', 'Посилання_на_джерелоlink', 'Посилання'];

    Object.keys(node.data).forEach(key => {
      if (skipKeys.includes(key)) return;
      const items = node.data[key];
      if (!items || items.length === 0) return;

      // Handle visualization/prism link as an embedded iframe
      const isVis = key.toLowerCase() === 'prism_to_vis' || items.some(i => (i.tclass || '').toLowerCase() === 'prism_to_vis');
      if (isVis) {
        items.forEach(d => {
          if (d.type !== 'link') return;
          const url = d.link || d.content;
          if (!url) return;
          const title = d.content && d.content !== url ? d.content : '';
          html += `<div class="modal-section" onclick="event.stopPropagation()">${title ? `<h3 class="prism-title" style="padding:16px 0 8px;">${esc(title)}</h3>` : ''}<iframe src="${esc(url)}" height="400" title="Visualization" style="width:100%; border:none; border-radius:8px; background:#fff; margin-top:4px;"></iframe></div>`;
        });
        return;
      }
      html += renderModalSection(key, items);
    });
    // Add resource links if they exist
    const report = getDataFirst(node, 'Посилання_на_звітlink');
    const srcLink = getDataFirst(node, 'Посилання_на_джерелоlink');
    const generalLink = getDataFirst(node, 'Посиланняlink') || getDataFirst(node, 'Посилання');

    let linksHtml = '';
    if (report && report.link) linksHtml += `<a class="resource-link-btn" href="${esc(report.link)}" target="_blank" rel="noopener">📄 Звіт</a> `;
    if (srcLink && (srcLink.link || srcLink.content)) {
      const url = srcLink.link || srcLink.content;
      linksHtml += `<a class="resource-link-btn" href="${esc(url)}" target="_blank" rel="noopener">🔗 Джерело</a> `;
    }
    if (generalLink && (generalLink.link || generalLink.content)) {
      let url = generalLink.link || generalLink.content;
      if (!url.startsWith('http')) url = 'https://' + url;
      linksHtml += `<a class="resource-link-btn" href="${esc(url)}" target="_blank" rel="noopener">🔗 Перейти</a>`;
    }
    if (linksHtml) {
      html += `<div style="margin-top:24px; display:flex; gap:12px;">${linksHtml}</div>`;
    }
    content.innerHTML = html;
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  };
  window.__showDept = function (guid) {
    const dept = nodesMap[guid];
    if (!dept) return;
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-body');
    if (!overlay || !content) return;
    const nameData = getDataFirst(dept, 'Відділ') || getDataFirst(dept, 'Name') || { content: dept.name };
    const photo = getPhotoURL(dept);
    const desc = getDataAll(dept, 'Загальна_інформація_про_відділ');
    const scientists = getDeptScientists(dept);
    let html = `<button class="modal-close" onclick="window.__closeModal()">✕</button>`;
    if (photo) html += `<div style="text-align:center;margin-bottom:16px;"><img src="${esc(photo)}" alt="" style="max-height:160px;border-radius:8px;object-fit:cover;" onerror="this.style.display='none'"></div>`;
    html += `<h2 style="margin-bottom:1rem;">${esc(nameData.content)}</h2>`;
    if (desc.length > 0) {
      html += `<div class="modal-section"><div class="modal-section-content" style="white-space:pre-wrap;">${makeCollapsibleHtml(desc.map(d => d.content).join('\n').trim())}</div></div>`;
    }
    if (scientists.length > 0) {
      html += `<div class="modal-section"><div class="modal-section-title">Співробітники (${scientists.length})</div>`;
      scientists.forEach(sci => {
        const sciPhoto = getPhotoURL(sci);
        const pos = getDataFirst(sci, 'Посада_за_основним_місцем_роботи')?.content || '';
        html += `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-glass);">`;
        if (sciPhoto) html += `<img src="${esc(sciPhoto)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" loading="lazy" onerror="this.style.display='none'">`;
        html += `<div><div style="font-size:0.9rem;">${esc(sci.name)}</div>`;
        if (pos) html += `<div style="font-size:0.75rem;color:var(--accent-emerald);text-transform:uppercase;letter-spacing:0.4px;">${esc(pos)}</div>`;
        html += `</div></div>`;
      });
      html += `</div>`;
    }
    content.innerHTML = html;
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  };
  window.__closeModal = function () {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  };
  // ---- Global Event Listeners ----
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 20);
  });
  document.addEventListener('click', e => {
    if (e.target.closest('.hamburger')) {
      document.querySelector('.nav-links').classList.toggle('open');
    }
    if (e.target.closest('.nav-links a')) {
      document.querySelector('.nav-links').classList.remove('open');
    }
    if (e.target.id === 'modal-overlay') {
      window.__closeModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.__closeModal();
  });
  // ---- Init ----
  document.addEventListener('DOMContentLoaded', loadXML);
})();

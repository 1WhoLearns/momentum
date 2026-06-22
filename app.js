/* =====================================================================
   Momentum — a self-contained productivity app.
   Ported from the Claude Design prototype (Momentum.dc.html), Hims aesthetic:
   off-white surfaces, sage/olive accent, Helvetica Neue with oblique titles.
   Framework: none. Plain DOM + a small render loop.
   ===================================================================== */

(function () {
  'use strict';

  // ---------- category palette (A deep forest → D warm taupe) ----------
  var CAT_COLORS = {
    A: { accent: '#4F5E39', tint: '#E4E8D6' },
    B: { accent: '#7C8C5B', tint: '#E9ECDE' },
    C: { accent: '#8E86B0', tint: '#E9E6F1' },
    D: { accent: '#A39A8B', tint: '#ECEAE4' }
  };
  var ACCENT = '#7C8C5B';   // sage — FAB, buttons, progress, active tab
  var CHECK  = '#6E7E4C';   // filled check circle

  var STORE_KEY = 'momentum.v3';

  // ---------- default sample data ----------
  function defaultState() {
    return {
      onboarded: true,       // no intro screen — launch straight into Today
      tab: 'today',          // 'today' | 'done'
      sheet: null,           // 'task' | 'goal' | null
      editingGoalId: null,
      editingTaskId: null,
      detailId: null,
      scrolled: false,
      confetti: false,
      // Start empty — no sample data. The user adds their own goals and tasks.
      goals: [],
      // Tasks carry an `addedAt` day (YYYY-MM-DD); incomplete tasks from earlier days
      // roll over to today and get a "carried over" flag.
      tasks: [],
      // transient sheet fields
      newTaskTitle: '', newTaskCat: 'A', newTaskNum: 1, newTaskNote: '',
      newGoalText: '', newGoalTag: 'Work'
    };
  }

  // ---------- persistence (keeps your tasks between visits) ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var saved = JSON.parse(raw);
      var st = defaultState();
      // only restore the durable bits; reset transient UI
      if (Array.isArray(saved.goals)) st.goals = saved.goals;
      if (Array.isArray(saved.tasks)) {
        // older saved tasks have no addedAt — treat them as added today (don't falsely roll over)
        st.tasks = saved.tasks.map(function (t) {
          return t.addedAt ? t : Object.assign({}, t, { addedAt: todayKey() });
        });
      }
      st.onboarded = !!saved.onboarded;
      return st;
    } catch (e) { return defaultState(); }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        onboarded: state.onboarded, goals: state.goals, tasks: state.tasks
      }));
    } catch (e) { /* ignore quota / private mode */ }
  }

  var state = load();
  var screen = document.getElementById('screen');
  var confettiTimer = null;

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) { return p + Date.now() + Math.floor(Math.random() * 1000); }

  // ---------- dates / rollover ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayKey() { return keyOf(new Date()); }
  function todayDateLabel() { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  // 'YYYY-MM-DD' strings compare correctly with < , so "before today & not done" = rolled over
  function isRolledOver(t) { return !t.done && !!t.addedAt && t.addedAt < todayKey(); }
  function formatAdded(key, long) {
    if (!key) return '';
    var p = key.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return d.toLocaleDateString('en-US', long
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric' });
  }

  // category & priority are OPTIONAL. Uncategorized tasks sort after D; within a
  // category, tasks with no priority sort after numbered ones.
  var NEUTRAL = { accent: '#A9AD9F', tint: '#ECECE8' };
  function catColor(cat) { return CAT_COLORS[cat] || NEUTRAL; }
  function taskBadge(t) {
    if (t.cat && t.num) return t.cat + t.num;
    if (t.cat) return t.cat;
    if (t.num) return String(t.num);
    return '';
  }
  function sortTasks(arr) {
    return arr.slice().sort(function (a, b) {
      var ca = a.cat || 'Z', cb = b.cat || 'Z';          // uncategorized last
      if (ca !== cb) return ca < cb ? -1 : 1;
      var na = a.num == null ? 99 : a.num, nb = b.num == null ? 99 : b.num;
      return na - nb;
    });
  }

  // ---------- style-string helpers ----------
  function goalCheckStyle(done) {
    return 'width:26px;height:26px;border-radius:50%;flex:none;cursor:pointer;display:flex;' +
      'align-items:center;justify-content:center;padding:0;transition:all .18s ease;' +
      'border:' + (done ? 'none' : '2px solid #CBCEC2') + ';background:' + (done ? CHECK : 'transparent') + ';';
  }
  function taskCheckStyle(done) {
    return 'width:24px;height:24px;border-radius:50%;flex:none;cursor:pointer;display:flex;' +
      'align-items:center;justify-content:center;padding:0;transition:all .18s ease;' +
      'border:' + (done ? 'none' : '2px solid #CBCEC2') + ';background:' + (done ? CHECK : 'transparent') + ';';
  }
  function tagPillStyle(tag) {
    var work = tag === 'Work';
    return 'flex:none;font-size:11px;font-weight:800;letter-spacing:.02em;padding:4px 11px;border-radius:999px;' +
      'background:' + (work ? '#E6EBD7' : '#E9E6F1') + ';color:' + (work ? '#566542' : '#6A6391') + ';';
  }
  function badgeStyle(cat, big) {
    var c = catColor(cat), sz = big ? '52px' : '40px';
    return 'width:' + sz + ';height:' + sz + ';flex:none;border-radius:' + (big ? '15px' : '12px') + ';' +
      'background:' + c.accent + ';color:#fff;display:flex;align-items:center;justify-content:center;' +
      'font-family:var(--font);font-weight:800;font-size:' + (big ? '19px' : '15px') + ';letter-spacing:.01em;';
  }

  var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
  var CHECK_SVG_SM = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';

  // ===================================================================
  //  RENDER PIECES
  // ===================================================================

  function statusBar() {
    return '' +
    '<div class="mock-chrome" style="position:absolute;top:0;left:0;right:0;height:54px;z-index:60;display:flex;align-items:flex-end;justify-content:space-between;padding:0 30px 8px;pointer-events:none;">' +
      '<div style="font-size:15px;font-weight:800;color:#23261F;letter-spacing:.02em;">9:41</div>' +
      '<div style="display:flex;align-items:center;gap:7px;">' +
        '<svg width="18" height="12" viewBox="0 0 18 12" fill="#23261F"><rect x="0" y="7" width="3" height="5" rx="1"></rect><rect x="5" y="4.5" width="3" height="7.5" rx="1"></rect><rect x="10" y="2" width="3" height="10" rx="1"></rect><rect x="15" y="0" width="3" height="12" rx="1"></rect></svg>' +
        '<svg width="17" height="12" viewBox="0 0 17 12" fill="none"><path d="M8.5 11.2 1 4.2a10.6 10.6 0 0 1 15 0L8.5 11.2Z" fill="#23261F" opacity="0.32"></path><path d="M8.5 11.2 4.4 7.3a5.8 5.8 0 0 1 8.2 0L8.5 11.2Z" fill="#23261F"></path></svg>' +
        '<svg width="26" height="13" viewBox="0 0 26 13" fill="none"><rect x="0.5" y="0.5" width="22" height="12" rx="3.5" stroke="#23261F" opacity="0.4"></rect><rect x="2" y="2" width="17" height="9" rx="2" fill="#23261F"></rect><rect x="24" y="4" width="2" height="5" rx="1" fill="#23261F" opacity="0.4"></rect></svg>' +
      '</div>' +
    '</div>' +
    '<div class="mock-chrome" style="position:absolute;top:11px;left:50%;transform:translateX(-50%);width:122px;height:34px;background:#0B0B0D;border-radius:20px;z-index:61;"></div>';
  }

  function navBar(title, scrolled) {
    return '' +
    '<div style="position:absolute;top:0;left:0;right:0;height:96px;z-index:40;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;background:rgba(247,241,236,0.82);-webkit-backdrop-filter:saturate(180%) blur(18px);backdrop-filter:saturate(180%) blur(18px);transition:border-color .2s ease;border-bottom:1px solid ' + (scrolled ? '#E3E4DC' : 'transparent') + ';">' +
      '<div id="navCompactTitle" style="font-family:var(--font);font-weight:800;font-size:17px;color:#23261F;opacity:' + (scrolled ? 1 : 0) + ';transition:opacity .2s ease;">' + esc(title) + '</div>' +
    '</div>';
  }

  function tabBar(tab) {
    var todayColor = tab === 'today' ? ACCENT : '#A9AD9F';
    var doneColor  = tab === 'done'  ? ACCENT : '#A9AD9F';
    return '' +
    '<div style="position:absolute;bottom:0;left:0;right:0;height:86px;z-index:38;background:rgba(247,241,236,0.86);-webkit-backdrop-filter:saturate(180%) blur(18px);backdrop-filter:saturate(180%) blur(18px);border-top:1px solid #E3E4DC;display:flex;padding:10px 0 0;">' +
      '<button data-action="go-today" style="flex:1;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
        '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="' + todayColor + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h11M4 12h16M4 18h9"></path></svg>' +
        '<span style="font-size:11px;font-weight:800;color:' + todayColor + ';">Today</span>' +
      '</button>' +
      '<button data-action="go-done" style="flex:1;border:none;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;">' +
        '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="' + doneColor + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="M22 4 12 14.01l-3-3"></path></svg>' +
        '<span style="font-size:11px;font-weight:800;color:' + doneColor + ';">Completed</span>' +
      '</button>' +
    '</div>' +
    '<div class="mock-chrome" style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:999px;background:#23261F;opacity:0.85;z-index:62;"></div>';
  }

  // ---------- TODAY tab ----------
  function todayTab() {
    var s = state;
    var dateLabel = todayDateLabel();
    var doneGoals = s.goals.filter(function (g) { return g.done; }).length;
    var total = s.goals.length;
    var pct = total ? Math.round((doneGoals / total) * 100) : 0;
    var headline = total === 0 ? 'Add your first goal'
      : (doneGoals === total ? 'Every goal complete 🎉' : doneGoals + ' of ' + total + ' done');

    // only ACTIVE goals show on Today; completed ones move to the Completed tab
    var activeGoals = s.goals.filter(function (g) { return !g.done; });
    var goalRows = activeGoals.map(function (g) {
      return '' +
      '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #E7E8E0;">' +
        '<button data-action="toggle-goal" data-id="' + g.id + '" style="' + goalCheckStyle(false) + '"></button>' +
        '<button data-action="edit-goal" data-id="' + g.id + '" style="flex:1;text-align:left;border:none;background:none;padding:0;cursor:pointer;">' +
          '<span style="font-size:16px;font-weight:700;color:#23261F;">' + esc(g.text) + '</span>' +
        '</button>' +
        '<span style="' + tagPillStyle(g.tag) + '">' + esc(g.tag) + '</span>' +
      '</div>';
    }).join('');

    var emptyGoals = total === 0
      ? '<div style="padding:18px 0 26px;text-align:center;color:#969A8B;font-weight:600;font-size:14px;">Set 3–5 goals to anchor your day.</div>'
      : (activeGoals.length === 0
        ? '<div style="padding:16px 0 24px;text-align:center;color:#7C8C5B;font-weight:700;font-size:14px;">All your goals are done. 🎉</div>'
        : '');

    // only ACTIVE tasks show on Today; completed ones move to the Completed tab
    var flat = sortTasks(s.tasks.filter(function (t) { return !t.done; }));
    var taskRows = flat.map(function (t, i) {
      var acc = catColor(t.cat).accent;
      var rolled = isRolledOver(t);
      var rolloverPill = rolled
        ? '<span style="flex:none;display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;letter-spacing:.01em;padding:2px 8px;border-radius:999px;background:#ECEAE4;color:#8A7F6E;white-space:nowrap;">↻ ' + esc(formatAdded(t.addedAt, false)) + '</span>'
        : '';
      var noteEl = t.note
        ? '<span style="font-size:13px;color:#969A8B;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">' + esc(t.note) + '</span>'
        : '';
      var subline = (rolled || t.note)
        ? '<div style="display:flex;align-items:center;gap:7px;margin-top:3px;min-width:0;">' + rolloverPill + noteEl + '</div>'
        : '';
      return '' +
      '<div data-action="open-detail" data-id="' + t.id + '" style="display:flex;align-items:center;gap:12px;padding:13px 16px 13px 14px;cursor:pointer;border-top:' + (i === 0 ? 'none' : '1px solid #EDEEE8') + ';">' +
        '<div style="width:4px;height:30px;border-radius:99px;flex:none;transition:background .18s ease;background:' + (t.done ? '#CDD0C5' : acc) + ';"></div>' +
        (taskBadge(t) ? '<span style="width:26px;flex:none;font-family:var(--font);font-weight:800;font-size:14px;transition:color .18s ease;color:' + (t.done ? '#A9AD9F' : acc) + ';">' + taskBadge(t) + '</span>' : '') +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .18s ease;color:' + (t.done ? '#A9AD9F' : '#23261F') + ';text-decoration:' + (t.done ? 'line-through' : 'none') + ';">' + esc(t.title) + '</div>' +
          subline +
        '</div>' +
        '<button data-action="toggle-task" data-id="' + t.id + '" data-stop="1" style="' + taskCheckStyle(t.done) + '">' + (t.done ? CHECK_SVG_SM : '') + '</button>' +
      '</div>';
    }).join('');

    var activeTasks = s.tasks.filter(function (t) { return !t.done; }).length;

    return '' +
    '<div class="scroller" id="scroller" style="position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;">' +
      '<div style="padding:104px 20px 150px;">' +

        '<div style="margin-bottom:18px;">' +
          '<h1 style="margin:0;font-family:var(--font);font-weight:700;font-size:34px;line-height:1.05;font-style:italic;color:#23261F;letter-spacing:-0.01em;">' + esc(dateLabel) + '</h1>' +
        '</div>' +

        // hero
        '<div style="background:#F2F4ED;border:1px solid #E7E8E0;border-radius:24px;padding:20px 18px 8px;box-shadow:0 10px 30px rgba(40,44,34,0.07);margin-bottom:28px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
            '<div style="font-size:17px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#7C8C5B;">Top Goals</div>' +
            '<button data-action="open-add-goal" style="border:none;background:rgba(124,140,91,0.12);color:#5E6E40;font-weight:800;font-size:13px;padding:6px 12px;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:4px;">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5E6E40" stroke-width="3.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add' +
            '</button>' +
          '</div>' +
          '<div style="font-family:var(--font);font-weight:800;font-size:22px;color:#23261F;margin-bottom:14px;">' + esc(headline) + '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">' +
            '<div style="flex:1;height:8px;background:#E7E9E0;border-radius:999px;overflow:hidden;">' +
              '<div style="width:' + pct + '%;height:100%;background:#7C8C5B;border-radius:999px;transition:width .4s cubic-bezier(0.22,1,0.36,1);"></div>' +
            '</div>' +
            '<div style="font-size:12px;font-weight:800;color:#878C7E;white-space:nowrap;">' + doneGoals + '/' + total + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;">' + goalRows + '</div>' +
          emptyGoals +
          '<div style="height:8px;"></div>' +
        '</div>' +

        // master list
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:0 2px;">' +
          '<div style="display:flex;align-items:baseline;gap:9px;">' +
            '<div style="font-family:var(--font);font-weight:800;font-size:20px;color:#23261F;">Task List</div>' +
            '<div style="font-size:13px;font-weight:700;color:#969A8B;">' + (activeTasks ? activeTasks + ' to go' : 'Cleared!') + '</div>' +
          '</div>' +
          '<button data-action="open-add-task" style="border:none;background:rgba(124,140,91,0.12);color:#5E6E40;font-weight:800;font-size:13px;padding:6px 12px;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:4px;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5E6E40" stroke-width="3.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add' +
          '</button>' +
        '</div>' +
        '<div style="margin-top:14px;background:#FFFFFF;border-radius:18px;box-shadow:0 4px 16px rgba(40,44,34,0.05);overflow:hidden;">' +
          (flat.length
            ? taskRows
            : '<div style="padding:30px 20px;text-align:center;color:#969A8B;font-weight:600;font-size:14px;">' +
                (s.tasks.length ? 'No tasks left — you’re all caught up.' : 'Tap “+ Add” to create your first task.') +
              '</div>') +
        '</div>' +

      '</div>' +
    '</div>';
  }

  // ---------- COMPLETED tab ----------
  function doneTab() {
    var s = state;
    var items = []
      .concat(s.goals.filter(function (g) { return g.done; }).map(function (g) {
        return { id: g.id, title: g.text, tag: g.tag, tagStyle: tagPillStyle(g.tag), kind: 'goal' };
      }))
      .concat(sortTasks(s.tasks.filter(function (t) { return t.done; })).map(function (t) {
        var c = catColor(t.cat);
        return {
          id: t.id, title: t.title, tag: taskBadge(t), kind: 'task',
          tagStyle: 'flex:none;font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;background:' + c.tint + ';color:' + c.accent + ';'
        };
      }));

    var summary = items.length ? items.length + ' finished today' : 'Your wins will appear here';

    var body;
    if (items.length) {
      var rows = items.map(function (it, i) {
        return '' +
        '<div style="display:flex;align-items:center;gap:13px;padding:14px 15px;border-top:' + (i === 0 ? 'none' : '1px solid #EDEEE8') + ';">' +
          '<button data-action="' + (it.kind === 'goal' ? 'toggle-goal' : 'toggle-task') + '" data-id="' + it.id + '" style="width:24px;height:24px;border-radius:50%;border:none;background:#6E7E4C;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;">' + CHECK_SVG_SM + '</button>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:15px;font-weight:700;color:#9DA193;text-decoration:line-through;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(it.title) + '</div>' +
          '</div>' +
          (it.tag ? '<span style="' + it.tagStyle + '">' + esc(it.tag) + '</span>' : '') +
        '</div>';
      }).join('');
      body = '<div style="background:#FFFFFF;border-radius:18px;box-shadow:0 4px 16px rgba(40,44,34,0.05);overflow:hidden;">' + rows + '</div>';
    } else {
      body = '' +
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:70px 30px;">' +
        '<div style="width:74px;height:74px;border-radius:22px;background:#F2F4ED;border:1px solid #E7E8E0;display:flex;align-items:center;justify-content:center;margin-bottom:18px;">' +
          '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#A9AD9F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>' +
        '</div>' +
        '<div style="font-family:var(--font);font-weight:800;font-size:19px;color:#23261F;margin-bottom:6px;">Nothing finished yet</div>' +
        '<div style="font-size:14px;font-weight:600;color:#969A8B;max-width:220px;">Check off a goal or task and it’ll land here.</div>' +
      '</div>';
    }

    return '' +
    '<div class="scroller" id="scroller" style="position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;">' +
      '<div style="padding:104px 20px 150px;">' +
        '<div style="margin-bottom:18px;">' +
          '<div style="font-family:var(--font);font-weight:700;font-size:34px;line-height:1.05;font-style:italic;color:#23261F;">Completed</div>' +
          '<div style="font-size:15px;font-weight:700;color:#969A8B;margin-top:3px;">' + esc(summary) + '</div>' +
        '</div>' +
        body +
      '</div>' +
    '</div>';
  }

  // ---------- TASK DETAIL ----------
  function detailOverlay() {
    var dt = state.tasks.filter(function (t) { return t.id === state.detailId; })[0];
    if (!dt) return '';
    var acc = catColor(dt.cat).accent;
    var metaParts = [];
    if (dt.cat) metaParts.push('Category ' + dt.cat);
    if (dt.num) metaParts.push('Priority ' + dt.num);
    var metaLabel = metaParts.join(' · ') || 'No category or priority';
    var bdg = taskBadge(dt);
    var completeStyle = dt.done
      ? 'width:100%;padding:17px;border:2px solid #CBCEC2;background:transparent;color:#4D5147;font-family:var(--font);font-weight:800;font-size:17px;border-radius:999px;cursor:pointer;'
      : 'width:100%;padding:17px;border:none;background:#6E7E4C;color:#fff;font-family:var(--font);font-weight:800;font-size:17px;border-radius:999px;cursor:pointer;box-shadow:0 10px 24px rgba(110,126,76,0.36);';
    return '' +
    '<div style="position:absolute;inset:0;z-index:70;background:#F4F4F0;animation:mo-push-in .32s cubic-bezier(0.22,1,0.36,1);">' +
      '<div style="position:absolute;top:0;left:0;right:0;height:96px;z-index:5;display:flex;align-items:flex-end;justify-content:space-between;padding:0 14px 12px;background:rgba(247,241,236,0.82);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border-bottom:1px solid #E3E4DC;">' +
        '<button data-action="close-detail" style="border:none;background:none;cursor:pointer;display:flex;align-items:center;gap:2px;color:#7C8C5B;font-weight:700;font-size:17px;padding:4px 6px;">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C8C5B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>Back' +
        '</button>' +
        '<button data-action="edit-task" data-id="' + dt.id + '" style="border:none;background:none;cursor:pointer;color:#7C8C5B;font-weight:700;font-size:17px;padding:4px 6px;">Edit</button>' +
      '</div>' +
      '<div style="position:absolute;top:96px;left:0;right:0;bottom:0;overflow-y:auto;padding:22px 22px 40px;">' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">' +
          (bdg ? '<span style="' + badgeStyle(dt.cat, true) + '">' + bdg + '</span>' : '') +
          '<div style="font-size:13px;font-weight:800;letter-spacing:0.04em;color:' + (metaParts.length ? acc : '#969A8B') + ';">' + metaLabel + '</div>' +
        '</div>' +
        '<div style="font-family:var(--font);font-weight:800;font-size:27px;line-height:1.18;color:#23261F;margin-bottom:12px;">' + esc(dt.title) + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px;">' +
          (isRolledOver(dt) ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;padding:5px 11px;border-radius:999px;background:#ECEAE4;color:#8A7F6E;">↻ Carried over</span>' : '') +
          (dt.addedAt ? '<span style="font-size:13px;font-weight:700;color:#969A8B;">Added ' + esc(formatAdded(dt.addedAt, true)) + '</span>' : '') +
        '</div>' +
        '<div style="background:#FFFFFF;border-radius:16px;padding:16px;box-shadow:0 4px 16px rgba(40,44,34,0.05);margin-bottom:22px;">' +
          '<div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#A9AD9F;margin-bottom:6px;">Notes</div>' +
          '<div style="font-size:15px;font-weight:600;color:#4D5147;line-height:1.5;">' + esc(dt.note || 'No notes yet.') + '</div>' +
        '</div>' +
        '<button data-action="toggle-task" data-id="' + dt.id + '" style="' + completeStyle + '">' + (dt.done ? 'Mark as Active' : 'Mark Complete') + '</button>' +
        '<button data-action="delete-task" data-id="' + dt.id + '" style="width:100%;margin-top:12px;padding:15px;border:none;background:none;color:#B5564E;font-weight:800;font-size:16px;cursor:pointer;border-radius:14px;">Delete Task</button>' +
      '</div>' +
    '</div>';
  }

  // ---------- SHEETS ----------
  function addTaskSheet() {
    var s = state;
    var editing = !!s.editingTaskId;
    var active = s.newTaskTitle.trim().length > 0;
    var saveStyle = 'border:none;background:none;font-family:var(--font);font-weight:800;font-size:16px;padding:4px;cursor:' +
      (active ? 'pointer' : 'default') + ';color:' + (active ? '#7C8C5B' : '#B4B8AB') + ';';

    // category is OPTIONAL — tapping the selected one again clears it
    var cats = ['A', 'B', 'C', 'D'].map(function (c) {
      var sel = s.newTaskCat === c, acc = CAT_COLORS[c].accent;
      return '<button data-action="pick-cat" data-val="' + c + '" style="flex:1;padding:11px 0;border:none;border-radius:10px;cursor:pointer;font-family:var(--font);font-weight:800;font-size:16px;transition:all .15s ease;' +
        'background:' + (sel ? acc : 'transparent') + ';color:' + (sel ? '#fff' : '#878C7E') + ';box-shadow:' + (sel ? '0 3px 8px rgba(40,44,34,0.14)' : 'none') + ';">' + c + '</button>';
    }).join('');

    // priority is OPTIONAL — tapping the selected one again clears it
    var nums = '';
    for (var n = 1; n <= 10; n++) {
      var sel = s.newTaskNum === n;
      nums += '<button data-action="pick-num" data-val="' + n + '" style="flex:none;width:46px;height:46px;border:none;border-radius:13px;cursor:pointer;font-family:var(--font);font-weight:800;font-size:17px;transition:all .15s ease;' +
        'background:' + (sel ? '#23261F' : '#FFFFFF') + ';color:' + (sel ? '#fff' : '#878C7E') + ';box-shadow:0 2px 8px rgba(40,44,34,0.06);">' + n + '</button>';
    }

    var previewLabel = taskBadge({ cat: s.newTaskCat, num: s.newTaskNum }) || '–';
    var removeBtn = editing
      ? '<button data-action="delete-task" data-id="' + s.editingTaskId + '" style="width:100%;margin-top:22px;padding:15px;border:none;background:none;color:#B5564E;font-weight:800;font-size:16px;cursor:pointer;">Remove Task</button>'
      : '';

    return '' +
    '<div style="position:absolute;left:0;right:0;bottom:0;z-index:90;background:#F4F4F0;border-radius:26px 26px 0 0;box-shadow:0 -16px 44px rgba(40,44,34,0.22);animation:mo-sheet-in .34s cubic-bezier(0.22,1,0.36,1);max-height:86%;display:flex;flex-direction:column;">' +
      '<div style="display:flex;justify-content:center;padding:10px 0 2px;"><div style="width:38px;height:5px;border-radius:999px;background:#CDD0C5;"></div></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 18px 14px;">' +
        '<button data-action="close-sheet" style="border:none;background:none;color:#878C7E;font-weight:700;font-size:16px;cursor:pointer;padding:4px;">Cancel</button>' +
        '<div style="font-family:var(--font);font-weight:800;font-size:17px;color:#23261F;">' + (editing ? 'Edit Task' : 'New Task') + '</div>' +
        '<button data-action="save-task" id="saveTaskBtn" style="' + saveStyle + '">' + (editing ? 'Save' : 'Add') + '</button>' +
      '</div>' +
      '<div style="overflow-y:auto;padding:4px 18px 30px;">' +
        '<input id="taskTitleInput" value="' + esc(s.newTaskTitle) + '" placeholder="What needs doing?" style="width:100%;border:none;background:#FFFFFF;border-radius:14px;padding:16px;font-size:17px;font-weight:700;color:#23261F;box-shadow:0 2px 8px rgba(40,44,34,0.05);margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 4px 6px;">' +
          '<span id="livePreviewBadge" style="' + badgeStyle(s.newTaskCat, false) + '">' + previewLabel + '</span>' +
          '<span style="font-size:13px;font-weight:700;color:#969A8B;">Category &amp; priority are optional</span>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#A9AD9F;margin:16px 4px 8px;">Category' + (s.newTaskCat ? '' : ' · none') + '</div>' +
        '<div style="display:flex;gap:7px;background:#E9EAE2;padding:5px;border-radius:14px;">' + cats + '</div>' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#A9AD9F;margin:20px 4px 10px;">Priority' + (s.newTaskNum ? ' · ' + s.newTaskNum : ' · none') + '</div>' +
        '<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;">' + nums + '</div>' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#A9AD9F;margin:18px 4px 8px;">Notes</div>' +
        '<input id="taskNoteInput" value="' + esc(s.newTaskNote) + '" placeholder="Add a detail (optional)" style="width:100%;border:none;background:#FFFFFF;border-radius:14px;padding:15px;font-size:15px;font-weight:600;color:#23261F;box-shadow:0 2px 8px rgba(40,44,34,0.05);">' +
        removeBtn +
      '</div>' +
    '</div>';
  }

  function addGoalSheet() {
    var s = state;
    var editing = !!s.editingGoalId;
    var active = s.newGoalText.trim().length > 0 && (editing || s.goals.length < 5);
    var saveStyle = 'border:none;background:none;font-family:var(--font);font-weight:800;font-size:16px;padding:4px;cursor:' +
      (active ? 'pointer' : 'default') + ';color:' + (active ? '#7C8C5B' : '#B4B8AB') + ';';

    var tags = ['Personal', 'Work'].map(function (t) {
      var sel = s.newGoalTag === t, work = t === 'Work', acc = work ? '#7C8C5B' : '#8E86B0';
      return '<button data-action="pick-tag" data-val="' + t + '" style="flex:1;padding:12px 0;border:none;border-radius:10px;cursor:pointer;font-weight:800;font-size:15px;transition:all .15s ease;' +
        'background:' + (sel ? acc : 'transparent') + ';color:' + (sel ? '#fff' : '#878C7E') + ';box-shadow:' + (sel ? '0 3px 8px rgba(40,44,34,0.14)' : 'none') + ';">' + t + '</button>';
    }).join('');

    var removeBtn = editing
      ? '<button data-action="delete-goal" style="width:100%;margin-top:22px;padding:15px;border:none;background:none;color:#B5564E;font-weight:800;font-size:16px;cursor:pointer;">Remove Goal</button>'
      : '';
    var limit = (!editing && s.goals.length >= 5)
      ? '<div style="margin-top:18px;text-align:center;font-size:13px;font-weight:700;color:#969A8B;">You’ve hit 5 goals — the daily sweet spot.</div>'
      : '';

    return '' +
    '<div style="position:absolute;left:0;right:0;bottom:0;z-index:90;background:#F4F4F0;border-radius:26px 26px 0 0;box-shadow:0 -16px 44px rgba(40,44,34,0.22);animation:mo-sheet-in .34s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column;">' +
      '<div style="display:flex;justify-content:center;padding:10px 0 2px;"><div style="width:38px;height:5px;border-radius:999px;background:#CDD0C5;"></div></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 18px 14px;">' +
        '<button data-action="close-sheet" style="border:none;background:none;color:#878C7E;font-weight:700;font-size:16px;cursor:pointer;padding:4px;">Cancel</button>' +
        '<div style="font-family:var(--font);font-weight:800;font-size:17px;color:#23261F;">' + (editing ? 'Edit Goal' : 'New Goal') + '</div>' +
        '<button data-action="save-goal" id="saveGoalBtn" style="' + saveStyle + '">Save</button>' +
      '</div>' +
      '<div style="padding:4px 18px 30px;">' +
        '<input id="goalTextInput" value="' + esc(s.newGoalText) + '" placeholder="What’s a win for today?" style="width:100%;border:none;background:#FFFFFF;border-radius:14px;padding:16px;font-size:17px;font-weight:700;color:#23261F;box-shadow:0 2px 8px rgba(40,44,34,0.05);margin-bottom:18px;">' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#A9AD9F;margin:0 4px 8px;">Tag</div>' +
        '<div style="display:flex;gap:7px;background:#E9EAE2;padding:5px;border-radius:14px;">' + tags + '</div>' +
        removeBtn + limit +
      '</div>' +
    '</div>';
  }

  function sheets() {
    if (!state.sheet) return '';
    var sheet = state.sheet === 'task' ? addTaskSheet() : addGoalSheet();
    return '<div data-action="close-sheet" style="position:absolute;inset:0;z-index:80;background:rgba(38,41,32,0.42);animation:mo-fade-in .2s ease;"></div>' + sheet;
  }

  // ---------- CONFETTI ----------
  function confetti() {
    if (!state.confetti) return '';
    var palette = ['#7C8C5B', '#A39A8B', '#8E86B0', '#C9D2B4', '#4F5E39', '#E4E8D6'];
    var pieces = '';
    for (var i = 0; i < 90; i++) {
      var c = palette[i % palette.length];
      var left = Math.random() * 100;
      var delay = Math.random() * 0.6;
      var dur = 1.8 + Math.random() * 1.4;
      var sz = 7 + Math.random() * 8;
      var round = Math.random() > 0.5;
      pieces += '<div style="position:absolute;top:-20px;left:' + left + '%;width:' + sz + 'px;height:' + (sz * (round ? 1 : 1.6)) + 'px;background:' + c + ';border-radius:' + (round ? '50%' : '2px') + ';animation:mo-confetti ' + dur + 's linear ' + delay + 's forwards;"></div>';
    }
    return '' +
    '<div style="position:absolute;inset:0;z-index:95;pointer-events:none;overflow:hidden;">' + pieces +
      '<div style="position:absolute;top:46%;left:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,0.94);border-radius:22px;padding:22px 26px;box-shadow:0 18px 40px rgba(40,44,34,0.2);text-align:center;animation:mo-pop .5s cubic-bezier(0.34,1.56,0.64,1);">' +
        '<div style="font-size:34px;margin-bottom:4px;">🎉</div>' +
        '<div style="font-family:var(--font);font-weight:800;font-size:20px;color:#23261F;">All goals done!</div>' +
        '<div style="font-size:14px;font-weight:700;color:#969A8B;margin-top:2px;">That’s real momentum.</div>' +
      '</div>' +
    '</div>';
  }

  // ---------- ONBOARDING ----------
  // ===================================================================
  //  RENDER + WIRING
  // ===================================================================
  function render() {
    var scroller = document.getElementById('scroller');
    var savedScroll = scroller ? scroller.scrollTop : 0;

    var tabContent = state.tab === 'today' ? todayTab() : doneTab();
    var navTitle = state.tab === 'done' ? 'Completed' : todayDateLabel();

    screen.innerHTML =
      statusBar() +
      '<div style="position:absolute;inset:0;">' +
        navBar(navTitle, state.scrolled) +
        tabContent +
        tabBar(state.tab) +
      '</div>' +
      detailOverlay() +
      sheets() +
      confetti();

    // restore scroll position (avoids jumping to top on every state change)
    var ns = document.getElementById('scroller');
    if (ns) { ns.scrollTop = savedScroll; wireScroll(ns); }
    wireInputs();
  }

  function wireScroll(el) {
    el.addEventListener('scroll', function () {
      var sc = el.scrollTop > 24;
      if (sc === state.scrolled) return;
      state.scrolled = sc;
      // update the collapsing nav directly — re-rendering here would reset scroll
      var title = document.getElementById('navCompactTitle');
      if (title) title.style.opacity = sc ? 1 : 0;
      var navEl = screen.querySelector('div[style*="backdrop-filter"][style*="height:96px"]');
      if (navEl) navEl.style.borderBottomColor = sc ? '#E3E4DC' : 'transparent';
    });
  }

  function wireInputs() {
    var tt = document.getElementById('taskTitleInput');
    if (tt) {
      tt.addEventListener('input', function (e) {
        state.newTaskTitle = e.target.value;
        var btn = document.getElementById('saveTaskBtn');
        var active = state.newTaskTitle.trim().length > 0;
        if (btn) { btn.style.color = active ? '#7C8C5B' : '#B4B8AB'; btn.style.cursor = active ? 'pointer' : 'default'; }
      });
    }
    var tn = document.getElementById('taskNoteInput');
    if (tn) tn.addEventListener('input', function (e) { state.newTaskNote = e.target.value; });

    var gt = document.getElementById('goalTextInput');
    if (gt) {
      gt.addEventListener('input', function (e) {
        state.newGoalText = e.target.value;
        var btn = document.getElementById('saveGoalBtn');
        var active = state.newGoalText.trim().length > 0 && (state.editingGoalId || state.goals.length < 5);
        if (btn) { btn.style.color = active ? '#7C8C5B' : '#B4B8AB'; btn.style.cursor = active ? 'pointer' : 'default'; }
      });
    }
  }

  // ---------- actions ----------
  function celebrateIfDone() {
    if (state.goals.length && state.goals.every(function (g) { return g.done; })) {
      state.confetti = true;
      render();
      clearTimeout(confettiTimer);
      confettiTimer = setTimeout(function () { state.confetti = false; render(); }, 3600);
    }
  }

  var ACTIONS = {
    'go-today': function () { state.tab = 'today'; state.scrolled = false; },
    'go-done': function () { state.tab = 'done'; state.scrolled = false; },
    'open-add-goal': function () { state.sheet = 'goal'; state.editingGoalId = null; state.newGoalText = ''; state.newGoalTag = 'Work'; },
    // category & priority start UNSET (null) — a task can be saved without them
    'open-add-task': function () { state.sheet = 'task'; state.editingTaskId = null; state.newTaskTitle = ''; state.newTaskCat = null; state.newTaskNum = null; state.newTaskNote = ''; },
    'close-sheet': function () { state.sheet = null; state.editingGoalId = null; state.editingTaskId = null; },
    'close-detail': function () { state.detailId = null; },
    'open-detail': function (id) { state.detailId = id; },
    'edit-goal': function (id) {
      var g = state.goals.filter(function (x) { return x.id === id; })[0];
      if (!g) return;
      state.sheet = 'goal'; state.editingGoalId = id; state.newGoalText = g.text; state.newGoalTag = g.tag;
    },
    'edit-task': function (id) {
      var t = state.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      state.sheet = 'task'; state.editingTaskId = id; state.detailId = null;
      state.newTaskTitle = t.title; state.newTaskCat = t.cat || null; state.newTaskNum = t.num || null; state.newTaskNote = t.note || '';
    },
    // toggle off if the already-selected chip is tapped again (lets you clear it)
    'pick-cat': function (val) { state.newTaskCat = (state.newTaskCat === val) ? null : val; },
    'pick-num': function (val) { var n = parseInt(val, 10); state.newTaskNum = (state.newTaskNum === n) ? null : n; },
    'pick-tag': function (val) { state.newGoalTag = val; },
    'toggle-goal': function (id) {
      state.goals = state.goals.map(function (g) { return g.id === id ? Object.assign({}, g, { done: !g.done }) : g; });
      persist();
      render();
      celebrateIfDone();
      return true; // handled render
    },
    'toggle-task': function (id) {
      state.tasks = state.tasks.map(function (t) { return t.id === id ? Object.assign({}, t, { done: !t.done }) : t; });
      persist();
    },
    'delete-task': function (id) {
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      state.detailId = null;
      state.sheet = null;
      state.editingTaskId = null;
      persist();
    },
    'delete-goal': function () {
      state.goals = state.goals.filter(function (g) { return g.id !== state.editingGoalId; });
      state.sheet = null; state.editingGoalId = null;
      persist();
    },
    'save-task': function () {
      var title = state.newTaskTitle.trim();
      if (!title) return false;
      var cat = state.newTaskCat || null;
      var num = state.newTaskNum || null;
      var note = state.newTaskNote.trim();
      if (state.editingTaskId) {
        state.tasks = state.tasks.map(function (t) {
          return t.id === state.editingTaskId ? Object.assign({}, t, { title: title, cat: cat, num: num, note: note }) : t;
        });
        state.editingTaskId = null;
      } else {
        state.tasks = state.tasks.concat([{ id: uid('t'), cat: cat, num: num, title: title, note: note, done: false, addedAt: todayKey() }]);
      }
      state.sheet = null;
      persist();
    },
    'save-goal': function () {
      var text = state.newGoalText.trim();
      if (!text) return false;
      if (state.editingGoalId) {
        state.goals = state.goals.map(function (g) { return g.id === state.editingGoalId ? Object.assign({}, g, { text: text, tag: state.newGoalTag }) : g; });
        state.editingGoalId = null;
      } else {
        if (state.goals.length >= 5) return false;
        state.goals = state.goals.concat([{ id: uid('g'), text: text, tag: state.newGoalTag, done: false }]);
      }
      state.sheet = null;
      persist();
    }
  };

  // single delegated click handler
  screen.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== screen && !el.getAttribute('data-action')) el = el.parentNode;
    if (!el || el === screen) return;
    var action = el.getAttribute('data-action');
    var fn = ACTIONS[action];
    if (!fn) return;
    if (el.getAttribute('data-stop')) e.stopPropagation();
    var id = el.getAttribute('data-id');
    var val = el.getAttribute('data-val');
    var handled = fn(id || val);
    if (handled !== true) render();
  });

  render();
})();

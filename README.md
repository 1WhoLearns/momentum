# Momentum

A small, self-contained productivity app built from the Claude Design prototype
(`Momentum.dc.html`). It uses the letter–number prioritization framework: daily
**Top Goals** plus a master **Task List** sorted by category (A→D) and priority (1–10).

## How to open it

**The simple way:** double-click **`index.html`** — it opens in your default web browser.
That's it. No installation, no build step.

If your browser blocks the styling when opened that way, run it through a tiny local
web server instead (this is what the live preview uses):

1. Open a terminal in this folder.
2. Run: `python -m http.server 5577`
3. In your browser go to: `http://localhost:5577`

To see the phone-only, full-screen layout, open your browser's device toolbar
(in Chrome: press F12, then click the phone/tablet icon) and pick an iPhone.

## What's inside

- **`index.html`** — the page shell (the iPhone frame).
- **`styles.css`** — colors, the device frame, and the responsive full-screen mode.
- **`app.js`** — all the app logic and screens.

## Features

- **Onboarding** intro with the sea-turtle logo → **Get Started**.
- **Today** screen: a Top Goals hero (3–5 goals, Personal/Work tags, tap to complete,
  progress bar) and a flat **Task List** with category color rails (A1, A2, B1…).
- **Add Task** sheet (the **+** button): pick category A–D and priority 1–10, with a
  live priority-badge preview.
- **Add / Edit Goal** sheet (the **Add** button in the hero).
- **Task detail** view: notes, mark complete, delete, and the date the task was added.
- **Daily rollover:** any task you don't finish automatically carries over to the next
  day's Task List. Carried-over tasks get a small **↻ date** badge in the list, and their
  detail view shows a **↻ Carried over** flag plus **"Added &lt;date&gt;"** (the day it was
  first created). Tasks created today just show their added date, with no carry-over flag.
- **Completed** tab: finished goals and tasks; tap a check to un-complete.
- **Confetti** when every top goal is done.
- The large title collapses into the nav bar as you scroll.

Your goals and tasks are saved in the browser, so they're still there next time you open it.

## Design notes

- **Palette:** off-white surfaces (`#F4F4F0`) with a muted sage/olive accent (`#7C8C5B`).
  Category rails: A deep forest, B sage, C lavender, D warm taupe.
- **Type:** Helvetica Neue, with oblique/italic large titles (the "Hims" editorial feel).
- This is a faithful recreation of the prototype's screens. The prototype's "Explorations"
  rail (alternate design options shown below the phone) was design-tool commentary, not part
  of the app, so it isn't included here.

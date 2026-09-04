# Frontend Build Prompt — SAKSHAM / AMSETU

Paste this into your AI coding tool. Give it to whoever is building UI pages.

---

## Instruction to the AI tool

Build the frontend only, using plain HTML, CSS, and JavaScript, no React, no build tooling, no framework. Every page must fetch data from the backend using the placeholder API base URL below, not with hardcoded fake data. Follow the design rules exactly, do not substitute a similar-looking alternative for any rule below.

### Tech stack (fixed)

- HTML5, CSS3, vanilla JavaScript, ES modules where needed
- Fetch API for all backend calls, no axios or other library
- Web Speech API (SpeechRecognition and SpeechSynthesis) for the voice-first pages, native browser API, no external library
- Chart.js only for the admin dashboard charts, loaded from a CDN, nothing else added beyond that

```
# API_BASE_URL: <-- paste deployed backend URL here, defaults to http://localhost:8000 in development
```

---

## Pages to generate

```
frontend/
  index.html                     login and role selection
  admin-dashboard.html           compliance score, grievance stats, charts
  admin-checklist.html           tick and review compliance checklist
  student-visual-dyslexic.html   voice-first portal
  student-hearing-physical.html  visual and text-first portal, no audio dependency
  grievance.html                 shared grievance form, secret code display, and track-by-code lookup
  terms.html
  privacy.html
  css/
    main.css
  js/
    auth.js
    voice.js                     wraps SpeechRecognition and SpeechSynthesis
    dashboard.js
    grievance.js
    emergency.js                 handles both the voice trigger and the tap trigger
    api.js                       one shared file with all fetch calls
```

### Accessibility rule for the two student portals, state this in code comments

student-visual-dyslexic.html may use voice as the primary interaction method, since these users benefit from audio.
student-hearing-physical.html must never require audio to complete any action, every feature needs a visible tap or click path, since hearing-impaired users cannot rely on audio at all.

### Emergency contact button, same backend call, two trigger methods

On student-visual-dyslexic.html, the emergency action is triggered by a spoken command, using voice.js, and the returned contact name and number are read aloud with SpeechSynthesis, not just shown as text.
On student-hearing-physical.html, the same action is triggered by a visible tap button, and the returned contact name and number are shown as large, readable text on screen, never spoken only.
Both call the same backend route, only the trigger and the output method differ.

### Grievance anonymity, this changes what the grievance page shows

When a student submits the grievance form, the confirmation screen must clearly display the returned secret code, in large text, with a line telling the student to save it, since it is the only way to track the complaint later.
Build a separate small lookup section, on grievance.html, where anyone can type in a secret code and see its status, with no login required, matching the backend's no-login tracking route.
On admin-dashboard.html and any admin grievance table, display the secret code as the row identifier, never the student's name, since the backend deliberately never sends that field to admin-facing calls. Do not add a column for it even if the design looks like something is missing there.

---

## Design rules, follow exactly

- Pure white background only
- No gradients of any kind
- No rainbow or neon coloring
- No purple or black as a primary color
- No pastel color schemes
- No drop shadows
- No unnecessary soft corner radius
- No colored left stripe accents
- No Lucide icons
- No sparkle icons
- No animated arrows unless functionally necessary
- No hover animations
- No liquid glass or frosted glass effects
- No bento grid layouts
- No terminal window visual motifs
- No radial orbs
- No dot grid backgrounds
- No unnecessary skeleton loaders
- No emojis anywhere in the interface
- No checkmark bullet icons, use plain text or dashes instead
- No fake testimonials
- No real product demo screenshots
- No fonts from Inter, Geist, or Space Grotesk
- No em dashes in any interface copy
- Do not write copy in the "it's not X, it's Y" phrasing pattern


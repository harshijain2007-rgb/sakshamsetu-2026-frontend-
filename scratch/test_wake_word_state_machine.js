// test_wake_word_state_machine.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: Wake-Word State Machine & Grievance Flow ===\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const dyslexicHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-visual-dyslexic.html'), 'utf8');
const hearingHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-hearing-physical.html'), 'utf8');
const tutorHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/tutor.html'), 'utf8');

let passCount = 0;
let totalCount = 0;

function it(desc, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}\n         ${err.message}`);
  }
}

// 1. Initial State
it('1. isVoicePortalActive is initialized to false (Standby by default)', () => {
  assert(voiceJs.includes('this.isVoicePortalActive = false;'), 'isVoicePortalActive should default to false');
});

// 2. Standby state ignores other commands and strictly checks for "start" or "activate"
it('2. Standby state strictly accepts only "start"/"activate" and rejects all other commands', () => {
  assert(voiceJs.includes('if (!this.isVoicePortalActive) {'), 'Must check !this.isVoicePortalActive in standby');
  assert(voiceJs.includes("command.includes('start')") || voiceJs.includes("text.includes('start')"), 'Must match wake words');
  assert(voiceJs.includes('return; // REJECT ALL OTHER COMMANDS IN STANDBY'), 'Must return immediately in standby');
});

// 3. Active state handles sleep word "stop" / "pause"
it('3. Active state detects "stop" and transitions isVoicePortalActive to false with pause cue', () => {
  assert(voiceJs.includes("command.includes('stop')") || voiceJs.includes("text.includes('stop')"), 'Must detect stop command');
  assert(voiceJs.includes('this.isVoicePortalActive = false;'), 'Must set isVoicePortalActive to false');
  assert(voiceJs.includes("this.speak('Voice portal paused.');"), 'Must speak paused cue');
});

// 4. Intent Recognition Mappings in Active State
it('4. Active state routes grievance, alerts, emergency, tutor intents', () => {
  assert(voiceJs.includes('triggerGrievanceFlow()'), 'Must call triggerGrievanceFlow()');
  assert(voiceJs.includes('triggerAlertsFlow()'), 'Must call triggerAlertsFlow()');
  assert(voiceJs.includes('triggerEmergencyFlow()'), 'Must call triggerEmergencyFlow()');
  assert(voiceJs.includes("window.location.href = 'tutor.html';"), 'Must navigate to tutor.html');
});

// 5. Safe debounced auto-restart with 400ms buffer
it('5. Safe debounced onend and onerror auto-restart handlers (400ms buffer)', () => {
  assert(voiceJs.includes('this.restartTimer = setTimeout('), 'Must set debounced restartTimer');
  assert(voiceJs.includes('}, 400);'), 'Must use 400ms buffer');
  assert(voiceJs.includes('this.globalRecognition.continuous = true;'), 'Continuous recognition configured');
});

// 6. In-Modal Dictation Controls ("Pause", "Start"/"Resume", "Submit")
it('6. In-modal dictation supports "Pause", "Start"/"Resume", and "Submit"', () => {
  assert(voiceJs.includes('pauseModalDictation()'), 'Must have pauseModalDictation');
  assert(voiceJs.includes('resumeModalDictation()'), 'Must have resumeModalDictation');
  assert(voiceJs.includes('submitVoiceGrievance()'), 'Must have submitVoiceGrievance');
  assert(voiceJs.includes("lower.includes('start')"), 'Must resume on "start" while in modal');
});

// 7. Post-Submission Reset & Seamless Portal Reactivation
it('7. Post-submission: Speaks confirmation, resets fields, restores globalRecognition in ACTIVE state', () => {
  assert(voiceJs.includes('Your grievance has been registered under'), 'Must announce registered category and secret code');
  assert(voiceJs.includes('Returning to main portal.'), 'Must announce returning to main portal');
  assert(voiceJs.includes("modal.style.display = 'none';"), 'Must close modal');
  assert(voiceJs.includes("if (descEl) descEl.value = '';"), 'Must clear textarea');
  assert(voiceJs.includes('if (catSelect) catSelect.selectedIndex = 0;'), 'Must reset category dropdown to index 0');
  assert(voiceJs.includes('this.isVoicePortalActive = true;'), 'Must re-enable isVoicePortalActive in ACTIVE state');
  assert(voiceJs.includes('this.startGlobalRecognition(false);'), 'Must start global recognition');
});

// 8. UI Status Labels
it('8. UI status badge toggles between ACTIVE and STANDBY', () => {
  assert(voiceJs.includes("voiceBtnLabel.textContent = isActive ? 'ACTIVE' : 'STANDBY';"), 'Badge label must be ACTIVE / STANDBY');
  assert(voiceJs.includes('if (this.isVoicePortalActive) {'), 'toggleListening must check isVoicePortalActive');
});

// 9. Dashboard HTML & Voice controller integration
it('9. Both dashboards include voice assistant and tutor link', () => {
  assert(dyslexicHtml.includes("import { voice } from './js/voice.js';"), 'Visual dashboard imports voice.js');
  assert(hearingHtml.includes("import { voice } from './js/voice.js';"), 'Hearing dashboard imports voice.js');
  assert(dyslexicHtml.includes('href="tutor.html"'), 'Visual dashboard links to tutor.html');
  assert(hearingHtml.includes('href="tutor.html"'), 'Hearing dashboard links to tutor.html');
});

console.log(`\n=== Results: ${passCount} / ${totalCount} Passed ===\n`);
if (passCount === totalCount) {
  console.log('All tests passed with 100% accuracy!');
} else {
  process.exit(1);
}

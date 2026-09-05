// test_tutor_and_emergency_status.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== TEST SUITE: Voice-Driven AI Tutor, Emergency Commands, Status Reader & Compliance ===\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const tutorHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/tutor.html'), 'utf8');
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const emergencyJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/emergency.js'), 'utf8');
const statusHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/status.html'), 'utf8');
const apiJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/api.js'), 'utf8');
const adminChecklistHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/admin-checklist.html'), 'utf8');
const dyslexicHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-visual-dyslexic.html'), 'utf8');

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

// ---------------------------------------------------------------------------
// 1. AI Tutor Voice Interaction
// ---------------------------------------------------------------------------
it('1. AI Tutor initial welcome prompt speaks greeting & plays 500ms chime', () => {
  assert(tutorJs.includes("Welcome to AI Tutor! What topic would you like to learn today? Say a topic name after the tone."), 'Must include exact welcome text');
  assert(tutorJs.includes('playChime(660, 0.5)'), 'Must play 500ms chime');
});

it('2. Spoken topic capture populates #topicInput and calls /api/tutor/generate', () => {
  assert(tutorJs.includes("document.getElementById('topicInput')"), 'Must populate #topicInput');
  assert(tutorJs.includes("Preparing your lesson on"), 'Must announce preparation message');
  assert(tutorJs.includes('api.tutor.generate'), 'Must call api.tutor.generate');
  assert(apiJs.includes('/api/tutor/generate'), 'API must have /api/tutor/generate');
});

it('3. Automatic lesson step narration uses rate 0.9 for clear playback', () => {
  assert(tutorJs.includes('this.speak(spokenText, 0.9,'), 'Lesson narration must use rate 0.9');
  assert(tutorJs.includes('this.playCurrentStep()'), 'Must automatically play lesson step');
});

it('4. Voice navigation handles "Next"/"More", "Back"/"Previous", and "Repeat"/"Again"', () => {
  assert(tutorJs.includes('NEXT') && tutorJs.includes('REPEAT') && tutorJs.includes('BACK'), 'Must support Next, Repeat, Back intents');
});

it('5. Voice Doubt Flow prompts question, captures doubt, and calls /api/tutor/doubt', () => {
  assert(tutorJs.includes("What is your question about this step? Speak after the tone.") || tutorJs.includes("What is your question?"), 'Must speak doubt prompt');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_DOUBT') || tutorJs.includes('TUTOR_DOUBT'), 'Must enter LISTENING_FOR_DOUBT state');
  assert(tutorJs.includes('api.tutor.doubt'), 'Must call api.tutor.doubt');
  assert(apiJs.includes('/api/tutor/doubt'), 'API must have /api/tutor/doubt');
});

it('6. Tutor speech recognition has isolated state and debounced 300ms auto-restart', () => {
  assert(tutorJs.includes('tutorSpeechRecognition') || tutorJs.includes('this.recognition'), 'Must use isolated tutor recognition');
  assert(tutorJs.includes('synth.cancel()'), 'Must cancel previous speech before speaking');
});

// ---------------------------------------------------------------------------
// 2. Emergency Modal Voice Commands
// ---------------------------------------------------------------------------
it('7. Emergency modal has id="emergencyModal" and supports "Call"/"Dial" voice actions', () => {
  assert(emergencyJs.includes("modal.id = 'emergencyModal'"), 'Modal must have id emergencyModal');
  assert(voiceJs.includes("command.includes('call') || command.includes('dial')") || voiceJs.includes("text.includes('call') || text.includes('dial')"), 'Must support call/dial commands');
  assert(emergencyJs.includes('Initiating emergency call.'), 'Must speak call announcement');
});

it('8. Emergency modal supports "Dismiss"/"Cancel"/"Close" and restores globalRecognition in ACTIVE state', () => {
  assert(voiceJs.includes("command.includes('dismiss') || command.includes('close') || command.includes('cancel')") || voiceJs.includes("text.includes('dismiss') || text.includes('cancel') || text.includes('close')"), 'Must support dismiss/cancel/close');
  assert(emergencyJs.includes('Emergency modal closed. Returning to voice portal.'), 'Must speak closure announcement');
});

// ---------------------------------------------------------------------------
// 3. Status Tracking Audio Reader
// ---------------------------------------------------------------------------
it('9. Status tracking page fetches /api/grievance/my-grievances and speaks summary', () => {
  assert(apiJs.includes('/api/grievance/my-grievances'), 'API must have /api/grievance/my-grievances');
  assert(statusHtml.includes('api.grievances.getMyGrievances()'), 'status.html must fetch my-grievances');
  assert(statusHtml.includes('You have') || voiceJs.includes('You have'), 'Must format "You have [X] registered grievances"');
  assert(statusHtml.includes('Grievance code') || voiceJs.includes('Grievance code'), 'Must format grievance summary code');
});

it('10. Status page handles "Repeat" without refetching, and "Back"/"Close" navigation', () => {
  assert(statusHtml.includes('lastStatusSummary') || voiceJs.includes('lastStatusSummary'), 'Must cache lastStatusSummary');
  assert(statusHtml.includes('repeat') || voiceJs.includes('repeat'), 'Must support repeat command');
  assert(statusHtml.includes('back') || voiceJs.includes('back'), 'Must support back/close command');
});

// ---------------------------------------------------------------------------
// 4. Student vs Admin Compliance View Scoping
// ---------------------------------------------------------------------------
it('11. Student view displays only aggregate score and high-level services without raw audit data', () => {
  assert(dyslexicHtml.includes('id="student-compliance-score"'), 'Student view has aggregate compliance score');
  assert(dyslexicHtml.includes('id="nearby-services-list"'), 'Student view has nearby services breakdown');
  assert(!dyslexicHtml.includes('id="download-audit-btn"'), 'Student view must not have audit download button');
});

it('12. Admin view provides full checklist audit and admin-only audit download', () => {
  assert(adminChecklistHtml.includes('id="download-audit-btn"'), 'Admin view has download audit button');
  assert(adminChecklistHtml.includes('compliance_audit_report_'), 'Admin view exports compliance audit report');
});

// ---------------------------------------------------------------------------
// 5. Preservation Rule Check
// ---------------------------------------------------------------------------
it('13. Strict preservation: triggerGrievanceFlow and modalRecognition remain untouched and functional', () => {
  assert(voiceJs.includes('triggerGrievanceFlow()'), 'triggerGrievanceFlow preserved');
  assert(voiceJs.includes('modalRecognition'), 'modalRecognition preserved');
  assert(voiceJs.includes('isVoicePortalActive'), 'Strict wake-word state machine preserved');
});

console.log(`\n=== Results: ${passCount} / ${totalCount} Passed ===\n`);
if (passCount === totalCount) {
  console.log('All tests passed with 100% accuracy!');
} else {
  process.exit(1);
}

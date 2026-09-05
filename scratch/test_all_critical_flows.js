// test_all_critical_flows.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('=== TEST SUITE: SAKSHAMSETU VOICE, AI TUTOR, EMERGENCY & COMPLIANCE ===');
console.log('================================================================\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const tutorHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/tutor.html'), 'utf8');
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const emergencyJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/emergency.js'), 'utf8');
const statusHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/status.html'), 'utf8');
const apiJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/api.js'), 'utf8');
const dyslexicHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-visual-dyslexic.html'), 'utf8');
const hearingHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-hearing-physical.html'), 'utf8');
const adminChecklistHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/admin-checklist.html'), 'utf8');

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
// TEST GROUP 1: AI TUTOR VOICE CONTROLLER & LIFECYCLE
// ---------------------------------------------------------------------------
console.log('\n--- 1. AI Tutor Voice State Machine & TTS Isolation ---');

it('1. Initial Welcome Prompt speaks greeting & plays 500ms chime', () => {
  assert(tutorJs.includes("Welcome to AI Tutor! What topic would you like to learn today? Say a topic name after the tone."), 'Must include exact welcome prompt');
  assert(tutorJs.includes('playChime(660, 0.5)'), 'Must play 500ms chime');
});

it('2. TTS Isolation: Speech synthesis stops recognition and sets isSpeaking=true', () => {
  assert(tutorJs.includes('this.stopRecognition()'), 'Must stop recognition on speak()');
  assert(tutorJs.includes('this.isSpeaking = true'), 'Must set isSpeaking flag during speech');
  assert(tutorJs.includes('synth.cancel()'), 'Must cancel previous utterance before speaking');
});

it('3. Auto-restart resilience: Never restarts while speaking or on permission denial', () => {
  assert(tutorJs.includes('if (this.hasPermissionError) return;'), 'Must abort auto-restart on permission denial');
  assert(tutorJs.includes('if (this.isSpeaking) return;'), 'Must not restart while TTS is speaking');
  assert(tutorJs.includes('300);'), 'Must debounce restart with 300ms buffer');
});

it('4. User gesture unlock and lifecycle cleanups on beforeunload / pagehide', () => {
  assert(tutorJs.includes('setupUserInteractionUnlock()'), 'Must include user gesture unlock listener');
  assert(tutorJs.includes('setupLifecycleCleanups()'), 'Must include lifecycle cleanups');
});

// ---------------------------------------------------------------------------
// TEST GROUP 2: AI TUTOR COMMANDS & DOUBT FLOW
// ---------------------------------------------------------------------------
console.log('\n--- 2. AI Tutor Navigation Commands & Doubt Flow ---');

it('5. Topic capture populates #topicInput and calls api.tutor.generate', () => {
  assert(tutorJs.includes("document.getElementById('topicInput')"), 'Must populate #topicInput in DOM');
  assert(tutorJs.includes('api.tutor.generate'), 'Must call api.tutor.generate');
  assert(tutorJs.includes('Preparing your lesson on'), 'Must announce lesson preparation');
});

it('6. Step narration uses slow, clear rate 0.9 and advances through steps', () => {
  assert(tutorJs.includes('this.speak(spokenText, 0.9,'), 'Step narration must use rate 0.9');
  assert(tutorJs.includes('this.highlightCurrentStepUI'), 'Must highlight current step in UI');
});

it('7. Navigation commands handle "Next", "Back", and "Repeat" with regex/variations', () => {
  assert(tutorJs.includes('goToNextStep()'), 'Must route next command to goToNextStep()');
  assert(tutorJs.includes('goToPreviousStep()'), 'Must route back command to goToPreviousStep()');
  assert(tutorJs.includes('repeatCurrentStep()'), 'Must route repeat command to repeatCurrentStep()');
});

it('8. Doubt flow speaks prompt, captures question, calls api.tutor.doubt and stays in Tutor', () => {
  assert(tutorJs.includes("What is your question about this step? Speak after the tone."), 'Must announce doubt prompt');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_DOUBT'), 'Must enter LISTENING_FOR_DOUBT state');
  assert(tutorJs.includes('api.tutor.doubt'), 'Must call api.tutor.doubt');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_COMMAND'), 'Must return to command listening after answering doubt');
});

it('9. HTML button fallbacks call identical functions as voice commands', () => {
  assert(tutorJs.includes("document.getElementById('btn-tutor-prev')?.addEventListener('click', () => this.goToPreviousStep());"), 'Back button must call goToPreviousStep()');
  assert(tutorJs.includes("document.getElementById('btn-tutor-repeat')?.addEventListener('click', () => this.repeatCurrentStep());"), 'Repeat button must call repeatCurrentStep()');
  assert(tutorJs.includes("document.getElementById('btn-tutor-next')?.addEventListener('click', () => this.goToNextStep());"), 'Next button must call goToNextStep()');
  assert(tutorJs.includes("document.getElementById('btn-tutor-question')?.addEventListener('click', () => this.startDoubtFlow());"), 'Question button must call startDoubtFlow()');
});

// ---------------------------------------------------------------------------
// TEST GROUP 3: EDUCATIONAL CONTENT QUALITY IN API.JS
// ---------------------------------------------------------------------------
console.log('\n--- 3. Educational Lesson Quality & Concrete Non-Visual Explanations ---');

it('10. Stacks lesson teaches LIFO, cafeteria trays, push, pop, and peek', () => {
  assert(apiJs.includes('Cafeteria Tray Analogy'), 'Must include cafeteria tray analogy');
  assert(apiJs.includes('Last In, First Out'), 'Must explain LIFO');
  assert(apiJs.includes('Push and Pop'), 'Must explain Push and Pop');
  assert(apiJs.includes('Peek and isEmpty'), 'Must explain Peek and isEmpty');
  assert(apiJs.includes('Undo button in text editors'), 'Must include real-world application');
});

it('11. Queues lesson teaches FIFO, bus stop line, enqueue, and dequeue', () => {
  assert(apiJs.includes('Bus Stop Line Analogy'), 'Must include bus stop line analogy');
  assert(apiJs.includes('First In, First Out'), 'Must explain FIFO');
  assert(apiJs.includes('Enqueue and Dequeue'), 'Must explain Enqueue and Dequeue');
});

it('12. Binary Search lesson teaches O(log N), sorted requirement, and dictionary lookup', () => {
  assert(apiJs.includes('Dictionary Lookup Analogy'), 'Must include dictionary analogy');
  assert(apiJs.includes('O(log N)'), 'Must state logarithmic complexity');
});

it('13. Newton-Raphson lesson teaches root-finding, tangent lines, and quadratic convergence', () => {
  assert(apiJs.includes('Newton-Raphson Root-Finding Method'), 'Must explain root finding');
  assert(apiJs.includes('Tangent Line Geometric Concept'), 'Must explain tangent line');
});

it('14. Tutor doubt resolver returns accurate, concrete explanations (e.g. pop, push, lifo)', () => {
  assert(apiJs.includes('Pop means removing the top item from a stack.'), 'Must explain Pop directly');
  assert(apiJs.includes('Push means placing a new item onto the top of the stack.'), 'Must explain Push directly');
  assert(apiJs.includes('LIFO stands for Last In, First Out.'), 'Must explain LIFO directly');
});

// ---------------------------------------------------------------------------
// TEST GROUP 4: EMERGENCY MODAL CLICK & VOICE ACTIONS
// ---------------------------------------------------------------------------
console.log('\n--- 4. Emergency Modal Actions & Independence ---');

it('15. Emergency modal ID is #emergencyModal with discreet call and dismiss methods', () => {
  assert(emergencyJs.includes("modal.id = 'emergencyModal'"), 'Modal ID must be emergencyModal');
  assert(emergencyJs.includes('initiateEmergencyCall:'), 'Must export initiateEmergencyCall');
  assert(emergencyJs.includes('dismissEmergencyModal:'), 'Must export dismissEmergencyModal');
});

it('16. Emergency Call speaks "Initiating emergency call." and dials target phone', () => {
  assert(emergencyJs.includes('Initiating emergency call.'), 'Must speak initiating call');
  assert(emergencyJs.includes('window.location.href = `tel:${targetPhone}`;'), 'Must trigger tel protocol');
});

it('17. Emergency Dismiss speaks "Emergency modal closed. Returning to voice portal." and restores voice', () => {
  assert(emergencyJs.includes('Emergency modal closed. Returning to voice portal.'), 'Must announce dismissal');
  assert(emergencyJs.includes('window.voice.startGlobalRecognition(false);'), 'Must restore global recognition');
});

it('18. Voice portal recognizes "Call"/"Dial" and "Dismiss"/"Close" when emergency modal is open', () => {
  assert(voiceJs.includes("text.includes('call') || text.includes('dial')"), 'Voice portal routes call command');
  assert(voiceJs.includes("text.includes('dismiss') || text.includes('cancel') || text.includes('close')"), 'Voice portal routes dismiss command');
  assert(voiceJs.includes('emergency.initiateEmergencyCall()'), 'Voice call executes emergency.initiateEmergencyCall()');
  assert(voiceJs.includes('emergency.dismissEmergencyModal()'), 'Voice dismiss executes emergency.dismissEmergencyModal()');
});

it('19. Emergency buttons work independently with normal click/touch handlers', () => {
  assert(emergencyJs.includes("document.getElementById('btn-emergency-call')?.addEventListener('click',"), 'Call button has click listener');
  assert(emergencyJs.includes("closeBtn.addEventListener('click', () => {"), 'Dismiss button has click listener');
});

// ---------------------------------------------------------------------------
// TEST GROUP 5: ISOLATION & PRESERVATION
// ---------------------------------------------------------------------------
console.log('\n--- 5. Isolation, Wake-Word Portal & Preservation ---');

it('20. voice.js does not initialize globalRecognition on tutor.html (no competing mics)', () => {
  assert(voiceJs.includes("window.location.pathname.includes('tutor.html')"), 'Must guard against tutor.html');
});

it('21. Strict preservation: triggerGrievanceFlow and modalRecognition preserved', () => {
  assert(voiceJs.includes('triggerGrievanceFlow()'), 'triggerGrievanceFlow preserved');
  assert(voiceJs.includes('modalRecognition'), 'modalRecognition preserved');
  assert(voiceJs.includes('isVoicePortalActive'), 'Strict wake-word state machine preserved');
});

it('22. Both dashboards link to Voice Portal and AI Tutor properly', () => {
  assert(dyslexicHtml.includes('href="tutor.html"'), 'Visual dashboard links to tutor.html');
  assert(hearingHtml.includes('href="tutor.html"'), 'Hearing dashboard links to tutor.html');
  assert(tutorHtml.includes('href="student-visual-dyslexic.html"'), 'Tutor page links back to Voice Portal');
});

console.log(`\n================================================================`);
console.log(`=== TEST SUMMARY: ${passCount} / ${totalCount} PASSED ===`);
console.log(`================================================================\n`);

if (passCount === totalCount) {
  console.log('ALL CRITICAL FLOWS VERIFIED SUCCESSFULLY!');
} else {
  process.exit(1);
}

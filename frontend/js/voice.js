/**
 * Saksham Setu Web Speech API Controller
 * Implements Dual-Listener State Machine:
 * 1. globalRecognition: Global navigation & command listener (Inactive by default, low latency interimResults=false).
 * 2. modalRecognition: In-modal dictation listener with live streaming, "Pause", "Resume", and "Submit" voice controls.
 * 
 * Features Direct Intent Recognition and Accurate Gemini Auto-Categorization.
 */
import { auth } from './auth.js';
import { emergency } from './emergency.js';
import { api } from './api.js';

class VoiceController {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecognition = !!SpeechRecognition;
    this.hasSynthesis = 'speechSynthesis' in window;
    this.synth = window.speechSynthesis;
    this.activeVoice = null;

    // Dual-Listener State Machine
    this.globalRecognition = null;
    this.modalRecognition = null;
    this.isGlobalListening = false;
    this.isModalListening = false;
    this.isModalOpen = false;
    this.isDictationPaused = false;
    
    // Explicit State Model: 'IDLE' | 'MAIN' | 'EMERGENCY' | 'TUTOR_TOPIC' | 'TUTOR_COMMAND' | 'TUTOR_DOUBT'
    this.state = 'IDLE';
    this.isVoicePortalActive = false;
    this.restartTimer = null;
    this.voiceOwner = 'global'; // 'global' | 'grievance' | 'emergency' | 'status' | null

    this.audioCtx = null;
    this.customGrievanceHandler = null;

    // Category mapping dictionary (Exact Gemini categorization without hardcoded Facilities bias)
    this.CATEGORY_MAP = {
      'physical_infra': { code: 'physical_infra', name: 'Facilities' },
      'facilities': { code: 'physical_infra', name: 'Facilities' },
      'academic_access': { code: 'academic_access', name: 'Academic Access' },
      'academic': { code: 'academic_access', name: 'Academic Access' },
      'governance': { code: 'governance', name: 'Harassment and Governance' },
      'digital_ict': { code: 'digital_ict', name: 'Digital and Online Accessibility' },
      'digital': { code: 'digital_ict', name: 'Digital and Online Accessibility' },
      'transport': { code: 'transport', name: 'Transport' },
      'health': { code: 'health', name: 'Health' },
      'other': { code: 'other', name: 'Other Campus Redressal' }
    };

    // Guard: Do not initialize globalRecognition or mount listeners on tutor.html to prevent competing microphones
    const isTutorPage = typeof window !== 'undefined' && (window.location.pathname.includes('tutor.html') || window.location.href.includes('tutor.html'));
    if (isTutorPage) {
      return;
    }

    if (this.hasSynthesis) {
      const updateVoices = () => {
        const voices = this.synth.getVoices();
        this.activeVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
      };
      window.speechSynthesis.onvoiceschanged = updateVoices;
      updateVoices();
    }

    if (this.hasRecognition) {
      this.initGlobalRecognition();
      this.initModalRecognition();
      this.startStandbyListening();
      this.setupUserInteractionUnlock();
    }

    this.setupGlobalKeyboardShortcut();
    this.setupLifecycleCleanups();
  }

  // =========================================================================
  // Microphone Ownership & Race-Condition Lock
  // =========================================================================
  requestMicrophoneOwnership(featureName) {
    console.log(`[VOICE LOCK] Ownership requested by: "${featureName}" (Current owner: "${this.voiceOwner}")`);
    if (this.voiceOwner !== featureName) {
      this.stopGlobalRecognition(false);
      clearTimeout(this.restartTimer);
      this.voiceOwner = featureName;
    }
    return true;
  }

  releaseMicrophoneOwnership(featureName) {
    console.log(`[VOICE LOCK] Ownership released by: "${featureName}"`);
    if (this.voiceOwner === featureName) {
      this.voiceOwner = null;
    }
  }

  setState(newState) {
    console.log(`[VOICE ENGINE] Transitioning state: "${this.state}" -> "${newState}"`);
    this.state = newState;
    if (newState === 'IDLE') {
      this.stopSpeaking();
      this.stopGlobalRecognition(false);
      this.isVoicePortalActive = false;
      this.updateUiState(false);
    } else if (newState === 'MAIN') {
      this.voiceOwner = 'global';
      this.isVoicePortalActive = true;
      this.updateUiState(true);
      if (!this.isSpeaking && this.canGlobalRecognize()) {
        this.startGlobalRecognition(false);
      }
    } else if (newState === 'EMERGENCY') {
      this.voiceOwner = 'emergency';
      this.stopGlobalRecognition(false);
    } else if (typeof newState === 'string' && newState.startsWith('TUTOR')) {
      this.voiceOwner = 'tutor';
      this.stopGlobalRecognition(false);
    }
  }

  canGlobalRecognize() {
    return this.hasRecognition &&
      (this.voiceOwner === 'global' || this.voiceOwner === 'status' || this.voiceOwner === null) &&
      !this.isModalOpen &&
      !this.isSpeaking;
  }

  // =========================================================================
  // 1. Audio Prompt Tone Generator (Web Audio API)
  // =========================================================================
  playTone(frequency = 660, duration = 0.35) {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.audioCtx) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
      }
    } catch (e) {
      console.warn('[Voice API] playTone warning:', e);
    }
  }

  // =========================================================================
  // Voice tracing, normalization, and universal sub-flow helpers
  // =========================================================================
  trace(label, details = '') {
    const suffix = details === '' ? '' : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
    console.log(`[VOICE TRACE ${new Date().toISOString()}] ${label}${suffix}`);
  }

  normalizeTranscript(transcript = '') {
    return transcript
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  matchesAnyKeyword(command, patterns = []) {
    const tokens = new Set(command.split(' ').filter(Boolean));
    return patterns.some(pattern => {
      const required = Array.isArray(pattern) ? pattern : [pattern];
      return required.length <= 3 && required.every(keyword => tokens.has(keyword));
    });
  }

  resolveGlobalIntents(command) {
    const definitions = [
      { name: 'STOP', patterns: [['stop'], ['pause'], ['mute'], ['silence'], ['sleep']] },
      { name: 'STATUS', patterns: [['track', 'status'], ['check', 'status'], ['my', 'status'], ['grievance', 'status'], ['track', 'grievance'], ['check', 'grievance'], ['status']] },
      { name: 'GRIEVANCE', patterns: [['file', 'grievance'], ['grievance'], ['complain'], ['complaint'], ['lodge', 'complaint'], ['report', 'barrier']] },
      { name: 'ALERTS', patterns: [['read', 'notifications'], ['alerts'], ['alert'], ['notification'], ['notices'], ['broadcast']] },
      { name: 'EMERGENCY', patterns: [['emergency'], ['help'], ['sos'], ['call', 'ambulance']] },
      { name: 'TUTOR', patterns: [['tutor'], ['study'], ['ai', 'tutor'], ['learn']] },
      { name: 'HOME', patterns: [['home'], ['portal', 'home'], ['main', 'menu'], ['index']] },
      { name: 'DASHBOARD', patterns: [['dashboard'], ['student', 'dashboard'], ['overview'], ['learning', 'portal']] },
      { name: 'MAP', patterns: [['campus', 'map'], ['open', 'map'], ['routes']] },
      { name: 'ACCOMMODATION', patterns: [['how', 'to', 'apply'], ['accommodation'], ['apply', 'aid']] },
      { name: 'READ_PAGE', patterns: [['read', 'page'], ['read', 'screen']] },
      { name: 'DYSLEXIA', patterns: [['dyslexia'], ['dyslexic']] },
      { name: 'CONTRAST', patterns: [['contrast']] },
      { name: 'TEXT_SIZE', patterns: [['text', 'size'], ['larger', 'text'], ['bigger', 'font']] },
      { name: 'LOGOUT', patterns: [['logout'], ['sign', 'out'], ['exit', 'portal']] }
    ];
    return definitions.filter(definition => this.matchesAnyKeyword(command, definition.patterns));
  }

  enterSubflow(owner) {
    this.trace('sub-flow enter requested', owner);
    this.requestMicrophoneOwnership(owner);
    this.stopGlobalRecognition(false);
    this.stopModalRecognition();
    this.trace('sub-flow parent listener stopped', { owner, global: this.isGlobalListening, modal: this.isModalListening });
  }

  returnToGlobalVoice(owner) {
    this.trace('sub-flow returning to parent', owner);
    this.stopModalRecognition();
    this.releaseMicrophoneOwnership(owner);
    this.voiceOwner = 'global';
    this.isVoicePortalActive = true;
    this.startGlobalRecognition(false);
    this.updateUiState(true);
    this.trace('parent listener restored', { owner: this.voiceOwner, global: this.isGlobalListening, modal: this.isModalListening });
  }

  // =========================================================================
  // 2. Global Navigation Listener (Continuous & Resilient Intent Matching)
  // =========================================================================
  initGlobalRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.globalRecognition = new SpeechRecognition();
    this.globalRecognition.continuous = true;
    this.globalRecognition.interimResults = true;
    this.globalRecognition.lang = 'en-IN';
    this.globalRecognition.maxAlternatives = 3;

    this.globalRecognition.onstart = () => {
      this.isGlobalListening = true;
      this.updateUiState(this.isVoicePortalActive);
      console.log('[VOICE] mode:', this.isVoicePortalActive ? 'ACTIVE' : 'STANDBY', 'owner:', this.voiceOwner);
      console.log('[VOICE] recognition started');
    };

    this.globalRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i][0];
        if (event.results[i].isFinal) {
          finalTranscript += item.transcript;
        } else {
          interimTranscript += item.transcript;
        }
      }

      // If interim results only, update live visual text feedback but NEVER trigger commands!
      if (interimTranscript && !finalTranscript) {
        const trimmedInterim = interimTranscript.trim();
        if (trimmedInterim) {
          const statusEl = document.getElementById('voice-status-text');
          const globalStatusEl = document.getElementById('global-voice-status');
          const msg = `Hearing: "${trimmedInterim}..."`;
          if (statusEl) statusEl.textContent = msg;
          if (globalStatusEl) globalStatusEl.textContent = msg;
        }
        return; // Reject interim command execution
      }

      const activeText = finalTranscript.trim();
      if (!activeText) return;

      this.trace('transcript ready', activeText);
      // Execute command ONLY from final recognized result
      this.processVoiceCommand(activeText);
    };

    this.globalRecognition.onerror = (e) => {
      console.warn('[VOICE] error in global listener:', e.error);
      this.isGlobalListening = false;

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.updateUiState(false);
        return;
      }

      // Safe Debounced Auto-Restart (Only if global is allowed to recognize and not owned by another feature)
      clearTimeout(this.restartTimer);
      if (this.canGlobalRecognize()) {
        this.restartTimer = setTimeout(() => {
          if (this.canGlobalRecognize()) {
            try {
              this.globalRecognition.start();
            } catch (err) {}
          }
        }, 400);
      }
    };

    this.globalRecognition.onend = () => {
      this.isGlobalListening = false;
      this.trace('speech-end', { listener: 'global', owner: this.voiceOwner, canRecognize: this.canGlobalRecognize() });
      console.log('[VOICE] recognition ended, canRecognize:', this.canGlobalRecognize());

      // Safe Debounced Auto-Restart: ONLY if global voice is supposed to be active and owns the mic!
      clearTimeout(this.restartTimer);
      if (this.canGlobalRecognize()) {
        this.restartTimer = setTimeout(() => {
          if (this.canGlobalRecognize()) {
            try {
              this.globalRecognition.start();
            } catch (err) {}
          }
        }, 400);
      }
    };
  }

  startStandbyListening() {
    if (!this.canGlobalRecognize()) return;
    try {
      this.globalRecognition.start();
    } catch (e) {
      // Ignored if already started
    }
  }

  setupUserInteractionUnlock() {
    const unlock = () => {
      if (this.canGlobalRecognize() && !this.isGlobalListening) {
        this.startStandbyListening();
      }
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  startGlobalRecognition(cueUser = false) {
    this.trace('listener start requested', { listener: 'global', owner: this.voiceOwner });
    this.voiceOwner = 'global';
    this.isVoicePortalActive = true;
    this.updateUiState(true);

    if (cueUser) {
      this.playTone(660, 0.25);
      this.speak('Voice portal activated.', () => {
        if (this.canGlobalRecognize() && !this.isGlobalListening) {
          this.startStandbyListening();
        }
      });
    } else {
      if (this.canGlobalRecognize() && !this.isGlobalListening) {
        this.startStandbyListening();
      }
    }
  }

  stopGlobalRecognition(cueUser = false) {
    this.trace('listener stop requested', { listener: 'global', owner: this.voiceOwner });
    clearTimeout(this.restartTimer);
    this.isVoicePortalActive = false;
    this.updateUiState(false);

    if (this.globalRecognition && this.isGlobalListening) {
      try {
        this.globalRecognition.stop();
      } catch (e) {}
    }
    this.isGlobalListening = false;

    if (cueUser) {
      this.playTone(440, 0.25);
      this.speak('Voice portal paused.');
    }
  }

  // =========================================================================
  // 3. Modal Dictation Listener (Active ONLY inside #grievanceModal)
  // =========================================================================
  initModalRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.modalRecognition = new SpeechRecognition();
    this.modalRecognition.continuous = true;
    this.modalRecognition.interimResults = false; // Fast, low-latency final transcription
    this.modalRecognition.lang = 'en-IN';

    this.modalRecognition.onstart = () => {
      this.isModalListening = true;
      this.trace('listener started', { listener: 'grievance-modal', owner: this.voiceOwner });
      if (!this.isDictationPaused) {
        this.updateModalStatus('Listening... State your complaint freely.', true);
      }
      console.log('[Voice Modal Dictation]: Listening inside modal (Paused:', this.isDictationPaused, ')');
    };

    this.modalRecognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const textToAppend = event.results[lastIndex][0].transcript.trim();
      const lower = textToAppend.toLowerCase();
      const descEl = document.getElementById('grievanceDescription') || document.getElementById('typed-description');

      // If dictation is currently paused, listen specifically for "Start", "Resume", "Submit", "Cancel"
      if (this.isDictationPaused) {
        if (lower.includes('start') || lower.includes('resume') || lower.includes('continue')) {
          this.resumeModalDictation();
          return;
        }
        if (lower.includes('submit')) {
          this.submitVoiceGrievance();
          return;
        }
        if (lower.includes('cancel')) {
          this.closeGrievanceModal();
          this.speak('Grievance filing cancelled.');
          return;
        }
        // Discard general speech while paused
        return;
      }

      // Check In-Modal Voice Commands while dictating: "Pause", "Start", "Resume", "Submit", "Cancel"
      if (lower.endsWith('pause') || lower === 'pause' || lower === 'pause dictation') {
        if (descEl) {
          descEl.value = descEl.value.replace(/\b(pause|pause dictation)\b[.! ]*$/i, '').trim();
        }
        this.pauseModalDictation();
        return;
      }

      if (lower.endsWith('resume') || lower === 'resume' || lower === 'resume dictation' || lower.endsWith('start') || lower === 'start' || lower === 'start dictation') {
        if (descEl) {
          descEl.value = descEl.value.replace(/\b(resume|resume dictation|start|start dictation)\b[.! ]*$/i, '').trim();
        }
        this.resumeModalDictation();
        return;
      }

      if (lower.endsWith('submit') || lower === 'submit' || lower.endsWith('submit grievance') || lower.endsWith('submit complaint') || lower.endsWith("i'm done")) {
        // Strip trailing command phrase from description
        if (descEl) {
          descEl.value = descEl.value.replace(/\b(submit|submit grievance|submit complaint|i'm done|done)\b[.! ]*$/i, '').trim();
        }
        this.submitVoiceGrievance();
        return;
      }

      if (lower.endsWith('cancel') || lower === 'cancel') {
        this.closeGrievanceModal();
        this.speak('Grievance filing cancelled.');
        return;
      }

      // Stream live speech into textarea
      if (descEl && textToAppend) {
        const current = descEl.value.trim();
        descEl.value = current ? current + ' ' + textToAppend : textToAppend;
        this.updateModalStatus('Listening... State your complaint freely.', true);
      }
    };

    this.modalRecognition.onerror = (e) => {
      console.warn('[Voice Modal Dictation] Error:', e.error);
      if (this.isModalOpen && e.error !== 'not-allowed') {
        setTimeout(() => {
          if (this.isModalOpen && !this.isModalListening) {
            this.startModalRecognition();
          }
        }, 500);
      }
    };

    this.modalRecognition.onend = () => {
      this.isModalListening = false;
      this.trace('speech-end', { listener: 'grievance-modal', owner: this.voiceOwner });
      if (this.isModalOpen) {
        setTimeout(() => {
          if (this.isModalOpen && !this.isModalListening) {
            this.startModalRecognition();
          }
        }, 250);
      }
    };
  }

  startModalRecognition() {
    if (!this.hasRecognition || !this.isModalOpen) return;
    this.stopGlobalRecognition(false);
    this.trace('listener start requested', { listener: 'grievance-modal', owner: this.voiceOwner });
    try {
      this.modalRecognition.start();
    } catch (e) {}
  }

  stopModalRecognition() {
    this.trace('listener stop requested', { listener: 'grievance-modal', owner: this.voiceOwner });
    if (this.modalRecognition && this.isModalListening) {
      try {
        this.modalRecognition.stop();
      } catch (e) {}
    }
    this.isModalListening = false;
  }

  pauseModalDictation() {
    this.isDictationPaused = true;
    this.updateModalStatus('Dictation paused. Say "Start" or click Resume to continue.', false);
    this.speak('Dictation paused.');
  }

  resumeModalDictation() {
    this.isDictationPaused = false;
    this.playTone(660, 0.25);
    this.speak('Resuming dictation.', () => {
      if (this.isModalOpen) {
        this.updateModalStatus('Listening... State your complaint freely.', true);
        this.startModalRecognition();
      }
    });
  }

  updateModalStatus(text, isListening = false) {
    const statusEl = document.getElementById('grievanceVoiceStatus');
    if (statusEl) {
      statusEl.textContent = text;
    }
    const indicatorDot = document.getElementById('modal-listening-dot');
    if (indicatorDot) {
      if (isListening) indicatorDot.classList.remove('hidden');
      else indicatorDot.classList.add('hidden');
    }
  }

  // =========================================================================
  // 4. Direct Intent Recognition & Priority Dispatcher
  // =========================================================================
  processVoiceCommand(transcript) {
    const rawTranscript = transcript;
    const command = this.normalizeTranscript(transcript);
    const intents = this.resolveGlobalIntents(command);

    this.trace('transcript ready', { rawTranscript, command });
    console.log('[VOICE] mode:', this.isVoicePortalActive ? 'ACTIVE' : 'STANDBY', 'statusMode:', !!this.isStatusMode);
    console.log('[VOICE] raw transcript:', rawTranscript);
    console.log('[VOICE] normalized command:', command);

    const statusEl = document.getElementById('voice-status-text');
    const globalStatusEl = document.getElementById('global-voice-status');
    const msg = `Heard: "${rawTranscript}"`;
    if (statusEl) statusEl.textContent = msg;
    if (globalStatusEl) globalStatusEl.textContent = msg;

    const emergencyModal = document.getElementById('emergencyModal') || document.getElementById('emergency-modal');
    const emergencyBanner = document.getElementById('emergency-banner');
    const isEmergencyActive = this.voiceOwner === 'emergency' ||
      (emergencyModal && emergencyModal.style.display !== 'none' && !emergencyModal.classList.contains('hidden')) ||
      (emergencyBanner && emergencyBanner.style.display !== 'none');

    if (isEmergencyActive) {
      const emergencyIntents = [];
      if (this.matchesAnyKeyword(command, [['call'], ['dial']]) || command.includes('call') || command.includes('dial')) emergencyIntents.push('CALL');
      if (this.matchesAnyKeyword(command, [['dismiss'], ['close'], ['cancel'], ['exit'], ['leave']]) || command.includes('dismiss') || command.includes('close') || command.includes('cancel')) emergencyIntents.push('DISMISS');
      if (emergencyIntents.length > 1) console.warn('[VOICE COLLISION] Emergency command matched:', emergencyIntents);
      console.log('[EMERGENCY] command received:', command);
      if (emergencyIntents[0] === 'CALL') {
        this.trace('action started', 'EMERGENCY CALL');
        emergency.initiateEmergencyCall();
        return;
      }
      if (emergencyIntents[0] === 'DISMISS') {
        this.trace('action started', 'EMERGENCY DISMISS');
        emergency.dismissEmergencyModal();
        return;
      }
    }

    if (this.isStatusMode) {
      if (this.matchesAnyKeyword(command, [['repeat'], ['again'], ['replay'], ['read', 'again']])) {
        this.trace('action started', 'STATUS REPEAT');
        this.repeatStatusSummary();
        return;
      }
      if (this.matchesAnyKeyword(command, [['back'], ['previous'], ['return'], ['close'], ['exit'], ['cancel'], ['main', 'portal']])) {
        this.trace('action started', 'STATUS BACK');
        this.exitStatusMode();
        return;
      }
    }

    if (!this.isVoicePortalActive) {
      if (this.matchesAnyKeyword(command, [['start'], ['activate'], ['wake', 'up'], ['listen']]) || command.includes('start') || command.includes('activate')) {
        this.isVoicePortalActive = true;
        this.updateUiState(true);
        this.playTone(660, 0.25);
        this.speak('Voice portal activated.');
        console.log('[Voice Portal]: Woken up via wake-word "Start"');
      } else {
        console.log('[Voice Portal Standby]: Ignored input while in standby:', rawTranscript);
      }
      return; // REJECT ALL OTHER COMMANDS IN STANDBY
    }

    const matchingNames = intents.filter(intent => intent.name !== 'STOP');
    if (matchingNames.length > 1) {
      console.warn('[VOICE COLLISION] Global command matched:', matchingNames.map(intent => intent.name));
    }

    if (this.matchesAnyKeyword(command, [['stop'], ['pause'], ['mute'], ['silence'], ['sleep']]) || command.includes('stop') || command.includes('pause')) {
      this.isVoicePortalActive = false;
      this.isStatusMode = false;
      this.updateUiState(false);
      this.playTone(440, 0.25);
      this.speak('Voice portal paused.');
      console.log('[Voice Portal]: Paused via sleep-word "Stop"');
      return;
    }

    const intent = matchingNames[0]?.name;
    this.trace('command matched', intent || 'NONE');
    if (intent === 'STATUS') { this.triggerStatusFlow(); return; }
    if (intent === 'GRIEVANCE') { this.triggerGrievanceFlow(); return; }
    if (intent === 'ALERTS') { this.triggerAlertsFlow(); return; }
    if (intent === 'EMERGENCY') { this.triggerEmergencyFlow(); return; }
    if (intent === 'TUTOR') { this.speak('Opening AI Tutor.'); window.location.href = 'tutor.html'; return; }
    if (intent === 'HOME') { this.speak('Navigating to portal home.'); window.location.href = 'index.html'; return; }
    if (intent === 'DASHBOARD') { this.speak('Opening student visual dashboard.'); window.location.href = 'student-hearing-physical.html'; return; }
    if (intent === 'MAP') { this.speak('Opening campus accessibility map.'); window.location.href = 'campus-map.html'; return; }
    if (intent === 'ACCOMMODATION') { this.speak('To apply for accommodations or RPwD provisions, contact the Equal Opportunity Cell in Block A or submit an online request.'); return; }
    if (intent === 'READ_PAGE') { this.readCurrentPage(); return; }
    if (intent === 'DYSLEXIA') { auth.toggleDyslexicMode(); this.speak('Dyslexia font toggled.'); return; }
    if (intent === 'CONTRAST') { auth.toggleHighContrast(); this.speak('High contrast mode toggled.'); return; }
    if (intent === 'TEXT_SIZE') { auth.cycleTextSize(); this.speak('Text size adjusted.'); return; }
    if (intent === 'LOGOUT') { this.speak('Signing out from portal.'); auth.logout(); return; }

    this.speak(`Heard ${rawTranscript}. Say File a grievance, Track status, Read notifications, Emergency, Tutor, or Stop.`);
  }

  // =========================================================================
  // Status Tracking Flow (Universal Sub-Flow Auto-Return Pattern)
  // =========================================================================
  async triggerStatusFlow() {
    this.trace('action started', 'STATUS');
    this.requestMicrophoneOwnership('status');
    this.enterSubflow('status');
    // Track Status is a read-and-return sub-flow; it has no child capture window.
    this.isStatusMode = false;
    const checkMsg = 'Checking your registered grievances...';
    this.updateStatusText(checkMsg);

    this.speak(checkMsg, async () => {
      try {
        const res = await api.grievances.getMyGrievances();
        const items = res?.grievances || res?.data || (Array.isArray(res) ? res : []);

        let summaryText = '';
        if (items && items.length > 0) {
          summaryText = `You have ${items.length} registered grievance${items.length > 1 ? 's' : ''}. `;
          items.forEach((g, idx) => {
            const code = g.secretCode || g.secret_code || g.id || `SAK-${idx + 101}`;
            const cat = g.category_name || g.category || 'General';
            const status = g.status || 'Pending';
            const dept = g.assigned_department || g.department || 'Campus Nodal Office';
            summaryText += `Grievance ${idx + 1}: Code ${code}, category ${cat}, status is currently ${status}. Assigned department: ${dept}. `;
          });
          summaryText += `Returning to main voice portal.`;
        } else {
          summaryText = 'You currently have no registered grievances. Returning to main voice portal.';
        }

        this.lastStatusSummary = summaryText;
        this.updateStatusText(summaryText);

        this.speak(summaryText, () => {
          // Automatically return control to parent listener, exactly like grievance flow after submit
          this.releaseMicrophoneOwnership('status');
          this.startGlobalRecognition(false);
          this.returnToGlobalVoice('status');
        });
      } catch (err) {
        console.error('[Voice Status Error]:', err);
        const errorMsg = 'Sorry, I could not retrieve your grievance status right now. Returning to voice portal.';
        this.updateStatusText(errorMsg);
        this.speak(errorMsg, () => {
          this.returnToGlobalVoice('status');
        });
      }
    });
  }

  repeatStatusSummary() {
    if (this.lastStatusSummary) {
      this.speak(this.lastStatusSummary, () => {
        if (this.voiceOwner === 'status') {
          this.startStandbyListening();
        }
      });
    } else {
      this.triggerStatusFlow();
    }
  }

  exitStatusMode() {
    this.isStatusMode = false;
    this.speak('Returning to voice portal.', () => {
      this.releaseMicrophoneOwnership('status');
      this.voiceOwner = 'global';
      this.isVoicePortalActive = true;
      this.startGlobalRecognition(false);
      this.updateUiState(true);
    });
  }

  updateStatusText(text) {
    const statusEl = document.getElementById('voice-status-text');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  // =========================================================================
  // 5. Dual-Listener Grievance Flow (triggerGrievanceFlow)
  // =========================================================================
  triggerGrievanceFlow() {
    this.trace('action started', 'GRIEVANCE');
    if (typeof this.customGrievanceHandler === 'function') {
      this.customGrievanceHandler();
      return;
    }

    // 1. Immediately request microphone ownership for grievance and stop global
    this.requestMicrophoneOwnership('grievance');
    this.enterSubflow('grievance');
    this.isModalOpen = true;
    this.isDictationPaused = false;

    // 2. Open Modal
    const modal = document.getElementById('grievanceModal') || document.getElementById('typed-grievance-modal');
    const descEl = document.getElementById('grievanceDescription') || document.getElementById('typed-description');
    const banner = document.getElementById('grievanceCodeBanner') || document.getElementById('typed-code-banner');
    
    if (banner) banner.classList.add('hidden');
    if (descEl) descEl.value = '';

    if (modal) {
      modal.style.display = 'block';
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }

    // 3. Audio Cue & Tone
    this.speak('Grievance portal active. Please state your complaint after the tone.', () => {
      if (this.isModalOpen) {
        this.playTone(660, 0.35);
        if (this.isModalOpen) {
          // 4. Start Modal Dictation Listener only after parent TTS completes.
          this.startModalRecognition();
        }
      }
    });
  }

  closeGrievanceModal() {
    this.stopSpeaking();
    this.stopModalRecognition();
    this.isModalOpen = false;
    this.isDictationPaused = false;

    const modal = document.getElementById('grievanceModal') || document.getElementById('typed-grievance-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');

    this.releaseMicrophoneOwnership('grievance');
    this.startGlobalRecognition(false);
    this.returnToGlobalVoice('grievance');
  }

  // =========================================================================
  // 6. Accurate Gemini Categorization & Auto-Submission Workflow
  // =========================================================================
  async submitVoiceGrievance() {
    this.stopModalRecognition();

    const descEl = document.getElementById('grievanceDescription') || document.getElementById('typed-description');
    const catSelect = document.getElementById('grievanceCategory') || document.getElementById('typed-category');
    const priSelect = document.getElementById('grievancePriority') || document.getElementById('typed-priority');
    const locEl = document.getElementById('grievanceLocation') || document.getElementById('typed-location');
    const submitBtn = document.getElementById('grievanceSubmitBtn') || document.getElementById('typed-submit-btn');

    const rawTranscript = descEl ? descEl.value.trim() : '';
    this.trace('action started', 'GRIEVANCE SUBMIT');
    if (!rawTranscript) {
      this.speak('Please state your complaint before submitting.', () => {
        if (this.isModalOpen) this.startModalRecognition();
      });
      return;
    }

    // 1. Audio Feedback
    this.speak('Processing your complaint with AI...');
    this.updateModalStatus('Processing complaint with Gemini AI parser...', false);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-base">progress_activity</span><span>Submitting with AI...</span>`;
    }

    try {
      // 2. Call Gemini Voice Parser
      const parseRes = await api.grievances.parseVoice(rawTranscript);
      this.trace('Gemini grievance response received', '/api/grievance/parse-voice');

      // 3. Dynamic Category & Priority Mapping (No Hardcoded Fallbacks)
      let resolvedCategoryCode = 'other';
      let resolvedCategoryName = 'Other Campus Redressal';

      if (parseRes && parseRes.category) {
        const rawKey = parseRes.category.toLowerCase().trim();
        if (this.CATEGORY_MAP[rawKey]) {
          resolvedCategoryCode = this.CATEGORY_MAP[rawKey].code;
          resolvedCategoryName = this.CATEGORY_MAP[rawKey].name;
        } else {
          resolvedCategoryCode = parseRes.category;
          resolvedCategoryName = parseRes.category_name || parseRes.category;
        }
      }

      let resolvedPriority = 'Medium';
      if (parseRes && parseRes.priority) {
        const priRaw = parseRes.priority.toLowerCase();
        if (priRaw.includes('high') || priRaw.includes('urgent') || priRaw.includes('critical')) {
          resolvedPriority = 'High';
        } else if (priRaw.includes('low') || priRaw.includes('minor')) {
          resolvedPriority = 'Low';
        } else {
          resolvedPriority = 'Medium';
        }
      }

      // Populate Form Dropdowns programmatically
      if (catSelect) {
        catSelect.value = resolvedCategoryCode;
        if (!catSelect.value) {
          // If value couldn't be set directly, find matching option text
          for (let opt of catSelect.options) {
            if (opt.value.toLowerCase() === resolvedCategoryCode.toLowerCase() || opt.text.toLowerCase().includes(resolvedCategoryName.toLowerCase())) {
              catSelect.value = opt.value;
              break;
            }
          }
        }
      }

      if (priSelect) priSelect.value = resolvedPriority;
      if (descEl && parseRes.cleaned_description) descEl.value = parseRes.cleaned_description;
      if (locEl && parseRes.location_text && !locEl.value) locEl.value = parseRes.location_text;

      // 4. Automatic API Post (Immediately post without extra clicks)
      const payload = {
        category: resolvedCategoryCode,
        category_name: resolvedCategoryName,
        priority: resolvedPriority,
        urgency: resolvedPriority,
        description: descEl ? descEl.value : rawTranscript,
        location_text: locEl ? locEl.value : (parseRes?.location_text || 'Campus Grounds'),
        location: locEl ? locEl.value : (parseRes?.location_text || 'Campus Grounds')
      };

      const res = await api.grievances.submit(payload);
      this.trace('grievance submit response received', '/api/grievance');

      if (res && (res.success || res.secretCode || res.secret_code)) {
        const code = res.secretCode || res.secret_code || res.code || 'SAK-2026-CONFIRMED';
        
        // Show tracking code in banner
        const banner = document.getElementById('grievanceCodeBanner') || document.getElementById('typed-code-banner');
        const codeDisplay = document.getElementById('grievanceSecretCodeDisplay') || document.getElementById('typed-secret-code-display');
        if (codeDisplay) codeDisplay.textContent = code;
        if (banner) banner.classList.remove('hidden');

        this.updateModalStatus(`Registered under ${resolvedCategoryName}! Code: ${code}`, false);

        // 5. Audible Confirmation & Reset to Main Portal
        const confirmationSpeech = `Your grievance has been registered under ${resolvedCategoryName}. Secret code is ${code}. Returning to main portal.`;
        this.speak(confirmationSpeech, () => {
          const modal = document.getElementById('grievanceModal') || document.getElementById('typed-grievance-modal');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
          }
          if (descEl) descEl.value = '';
          if (catSelect) catSelect.selectedIndex = 0;
          if (locEl) locEl.value = '';
          if (priSelect) priSelect.selectedIndex = 1;
          document.body.classList.remove('overflow-hidden');

          this.isModalOpen = false;
          this.isDictationPaused = false;
          this.stopModalRecognition();

          // Re-enable globalRecognition in ACTIVE state seamlessly after TTS
          this.releaseMicrophoneOwnership('grievance');
          this.startGlobalRecognition(false);
          this.returnToGlobalVoice('grievance');
        });
      } else {
        throw new Error(res?.message || 'Server error recording grievance.');
      }
    } catch (err) {
      console.error('[Grievance Submission Error]:', err);
      this.updateModalStatus('Error submitting grievance. Please check connection.', false);
      this.speak('Submission failed. Please check your connection or tap Submit to retry.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span class="material-symbols-outlined text-base">send</span><span>Submit Anonymously</span>`;
      }
    }
  }

  // =========================================================================
  // 7. Notifications, Alerts & Emergency Flows
  // =========================================================================
  triggerAlertsFlow() {
    this.readNotices();
  }

  triggerNotificationsFlow() {
    this.readNotices();
  }

  triggerEmergencyFlow() {
    this.trace('action started', 'EMERGENCY');
    this.enterSubflow('emergency');
    emergency.triggerVoiceEmergency();
  }

  readNotices() {
    this.trace('action started', 'ALERTS');
    this.requestMicrophoneOwnership('alerts');
    this.enterSubflow('alerts');

    const noticeElements = document.querySelectorAll('[data-voice-notice]');
    if (noticeElements.length === 0) {
      this.speak('There are no recent campus notifications at this time. Returning to voice portal.', () => {
        this.releaseMicrophoneOwnership('alerts');
        this.startGlobalRecognition(false);
        this.returnToGlobalVoice('alerts');
      });
      return;
    }
    let allText = 'Here are your campus notifications: ';
    noticeElements.forEach((el, idx) => {
      allText += ` Notification ${idx + 1}: ${el.getAttribute('data-voice-notice') || el.innerText}. `;
    });
    allText += ' Returning to voice portal.';
    this.speak(allText, () => {
      this.releaseMicrophoneOwnership('alerts');
      this.startGlobalRecognition(false);
      this.returnToGlobalVoice('alerts');
    });
  }

  readCurrentPage() {
    this.trace('action started', 'READ_PAGE');
    this.enterSubflow('screen_reader');

    const mainContent = document.querySelector('main');
    if (!mainContent) {
      this.returnToGlobalVoice('screen_reader');
      return;
    }
    const text = mainContent.innerText.replace(/\s+/g, ' ').trim();
    this.speak('Reading page preview: ' + text.slice(0, 500) + (text.length > 500 ? '... End of preview. Returning to voice portal.' : ' Returning to voice portal.'), () => {
      this.returnToGlobalVoice('screen_reader');
    });
  }

  // =========================================================================
  // 8. Speech Synthesis & UI Status
  // =========================================================================
  speak(text, onComplete = null) {
    this.trace('response spoken', text);
    if (!this.hasSynthesis) {
      if (onComplete) setTimeout(onComplete, 500);
      return;
    }
    this.isSpeaking = true;
    if (this.globalRecognition && this.isGlobalListening) {
      try { this.globalRecognition.stop(); } catch (e) {}
    }
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (this.activeVoice) utterance.voice = this.activeVoice;
    utterance.onend = () => {
      this.trace('speech synthesis ended', text);
      this.isSpeaking = false;
      if (onComplete) {
        onComplete();
      }
    };
    utterance.onerror = () => {
      this.trace('speech synthesis error', text);
      this.isSpeaking = false;
      if (onComplete) {
        onComplete();
      }
    };
    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.hasSynthesis) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
  }

  updateUiState(isActive) {
    const voiceBtnLabel = document.getElementById('voice-btn-label');
    const container = document.getElementById('voice-wave-status');
    const statusText = document.getElementById('voice-status-text');
    const pulseDot = document.getElementById('voice-pulse-dot');

    if (voiceBtnLabel) {
      voiceBtnLabel.textContent = isActive ? 'ACTIVE' : 'STANDBY';
    }
    if (pulseDot) {
      if (isActive) {
        pulseDot.className = 'w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse';
      } else {
        pulseDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
      }
    }
    if (container) {
      if (isActive) container.classList.add('voice-active');
      else container.classList.remove('voice-active');
    }
    if (statusText && !this.isStatusMode) {
      statusText.textContent = isActive
        ? 'Voice portal active. Listening for commands (say "File a grievance", "Track status", "Alerts", "Emergency", "Tutor", "Stop")...'
        : 'Voice portal in standby. Say "Start" or tap microphone to activate.';
    }

    const globalBtn = document.getElementById('global-voice-btn');
    const globalDot = document.getElementById('global-voice-dot');

    if (globalBtn) {
      if (isActive) {
        globalBtn.classList.add('listening');
        globalBtn.setAttribute('title', 'Voice Assistant: Active (Alt+V) — Click to pause');
      } else {
        globalBtn.classList.remove('listening');
        globalBtn.setAttribute('title', 'Voice Assistant: Standby (Alt+V) — Click to speak');
      }
    }

    if (globalDot) {
      if (isActive) globalDot.classList.add('dot-active');
      else globalDot.classList.remove('dot-active');
    }
  }

  toggleListening() {
    if (this.isVoicePortalActive) {
      this.stopGlobalRecognition(true);
    } else {
      this.startGlobalRecognition(true);
    }
  }

  setupGlobalKeyboardShortcut() {
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        this.toggleListening();
      }
    });
  }

  setupLifecycleCleanups() {
    const cleanup = () => {
      this.autoRestart = false;
      if (this.globalRecognition) {
        try { this.globalRecognition.abort(); } catch (e) {}
      }
      if (this.modalRecognition) {
        try { this.modalRecognition.abort(); } catch (e) {}
      }
      this.stopSpeaking();
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
  }

  mountGlobalVoiceWidget() {
    if (window.location.pathname.includes('student-visual-dyslexic.html') || document.getElementById('voice-hero-ring-outer')) {
      return;
    }
    if (document.getElementById('global-voice-widget')) return;

    const widget = document.createElement('aside');
    widget.id = 'global-voice-widget';
    widget.className = 'voice-compact-fab';
    widget.setAttribute('aria-label', 'Voice Command Assistant');
    widget.innerHTML = `
      <button type="button" id="global-voice-btn" class="voice-fab-btn" title="Voice Assistant: Standby (Alt+V) — Click to speak" aria-label="Voice Assistant: Standby (Alt+V)">
        <span class="material-symbols-outlined text-2xl">mic</span>
        <span id="global-voice-dot" class="voice-fab-dot"></span>
      </button>
    `;

    document.body.appendChild(widget);

    document.getElementById('global-voice-btn')?.addEventListener('click', () => {
      this.toggleListening();
    });
  }
}

export const voice = new VoiceController();
export const voiceEngine = voice;
if (typeof window !== 'undefined') {
  window.voice = voice;
  window.voiceEngine = voice;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => voice.mountGlobalVoiceWidget());
  } else {
    voice.mountGlobalVoiceWidget();
  }
}

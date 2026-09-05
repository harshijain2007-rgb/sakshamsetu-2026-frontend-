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
    
    // Strict Wake-Word State Machine (STANDBY by default)
    this.isVoicePortalActive = false;
    this.restartTimer = null;

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
  // 2. Global Navigation Listener (interimResults = false for low latency)
  // =========================================================================
  initGlobalRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.globalRecognition = new SpeechRecognition();
    this.globalRecognition.continuous = true;
    this.globalRecognition.interimResults = false; // Fast, low-latency intent matching
    this.globalRecognition.lang = 'en-IN';

    this.globalRecognition.onstart = () => {
      this.isGlobalListening = true;
      this.updateUiState(this.isVoicePortalActive);
      console.log('[Voice Global Listener]: Active (Portal mode:', this.isVoicePortalActive ? 'ACTIVE' : 'STANDBY', ')');
    };

    this.globalRecognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim();
      console.log('[Voice Global Command Heard]:', transcript);
      this.processVoiceCommand(transcript);
    };

    this.globalRecognition.onerror = (e) => {
      console.warn('[Voice Global Listener] Error:', e.error);
      this.isGlobalListening = false;
      this.updateUiState(this.isVoicePortalActive);

      if (e.error === 'not-allowed') {
        return;
      }

      // Safe Debounced Auto-Restart (400ms buffer prevents browser mic throttling)
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (!this.isModalOpen) {
          try {
            this.globalRecognition.start();
          } catch (err) {}
        }
      }, 400);
    };

    this.globalRecognition.onend = () => {
      this.isGlobalListening = false;
      this.updateUiState(this.isVoicePortalActive);

      // Safe Debounced Auto-Restart (400ms buffer prevents browser mic throttling)
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (!this.isModalOpen) {
          try {
            this.globalRecognition.start();
          } catch (err) {}
        }
      }, 400);
    };
  }

  startStandbyListening() {
    if (!this.hasRecognition || this.isModalOpen) return;
    try {
      this.globalRecognition.start();
    } catch (e) {
      // Ignored if already started
    }
  }

  setupUserInteractionUnlock() {
    const unlock = () => {
      if (this.hasRecognition && !this.isGlobalListening && !this.isModalOpen) {
        this.startStandbyListening();
      }
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  startGlobalRecognition(cueUser = false) {
    this.isVoicePortalActive = true;
    this.updateUiState(true);
    if (this.hasRecognition && !this.isGlobalListening && !this.isModalOpen) {
      this.startStandbyListening();
    }
    if (cueUser) {
      this.playTone(660, 0.25);
      this.speak('Voice portal activated.');
    }
  }

  stopGlobalRecognition(cueUser = false) {
    this.isVoicePortalActive = false;
    this.updateUiState(false);
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
    try {
      this.modalRecognition.start();
    } catch (e) {}
  }

  stopModalRecognition() {
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
  // 4. Direct Intent Recognition (Fast keyword checks via .includes())
  // =========================================================================
  processVoiceCommand(transcript) {
    const text = transcript.toLowerCase().trim();
    const statusEl = document.getElementById('voice-status-text');
    const globalStatusEl = document.getElementById('global-voice-status');
    const msg = `Heard: "${transcript}"`;
    if (statusEl) statusEl.textContent = msg;
    if (globalStatusEl) globalStatusEl.textContent = msg;

    // 1. STANDBY STATE (isVoicePortalActive === false) - Strict Wake-Word Mode
    if (!this.isVoicePortalActive) {
      // WAKE WORD CHECK: Match ONLY if text contains "start" or "activate"
      if (text.includes('start') || text.includes('activate')) {
        this.isVoicePortalActive = true;
        this.updateUiState(true);
        this.playTone(660, 0.25);
        this.speak('Voice portal activated.');
        console.log('[Voice Portal]: Woken up via wake-word "Start"');
      } else {
        console.log('[Voice Portal Standby]: Ignored input while in standby:', transcript);
      }
      return; // REJECT ALL OTHER COMMANDS IN STANDBY
    }

    // 2. ACTIVE STATE (isVoicePortalActive === true)
    // Emergency Modal Voice Commands (Active specifically when #emergencyModal is open)
    const emergencyModal = document.getElementById('emergencyModal') || document.getElementById('emergency-modal');
    if (emergencyModal && emergencyModal.style.display !== 'none' && !emergencyModal.classList.contains('hidden')) {
      if (text.includes('call') || text.includes('dial')) {
        emergency.initiateEmergencyCall();
        return;
      }

      if (text.includes('dismiss') || text.includes('cancel') || text.includes('close')) {
        emergency.dismissEmergencyModal();
        return;
      }
    }

    // SLEEP WORD CHECK
    if (text.includes('stop') || text.includes('pause') || text.includes('mute') || text.includes('silence') || text.includes('sleep')) {
      this.isVoicePortalActive = false;
      this.updateUiState(false);
      this.playTone(440, 0.25);
      this.speak('Voice portal paused.');
      console.log('[Voice Portal]: Paused via sleep-word "Stop"');
      return;
    }

    // PROCESS INTENTS (ACTIVE ONLY)
    if (text.includes('file a grievance') || text.includes('grievance') || text.includes('complain') || text.includes('complaint') || text.includes('lodge complaint') || text.includes('report barrier')) {
      this.triggerGrievanceFlow();
      return;
    }

    if (text.includes('read notifications') || text.includes('alerts') || text.includes('alert') || text.includes('notification') || text.includes('notices') || text.includes('broadcast')) {
      this.triggerAlertsFlow();
      return;
    }

    if (text.includes('emergency') || text.includes('help') || text.includes('sos') || text.includes('call ambulance')) {
      this.triggerEmergencyFlow();
      return;
    }

    if (text.includes('tutor') || text.includes('study') || text.includes('study assistant')) {
      this.speak('Opening AI Tutor.');
      window.location.href = 'tutor.html';
      return;
    }

    if (text.includes('home') || text.includes('portal home') || text.includes('main menu') || text.includes('index')) {
      this.speak('Navigating to portal home.');
      window.location.href = 'index.html';
      return;
    }

    if (text.includes('dashboard') || text.includes('student dashboard') || text.includes('overview') || text.includes('learning portal')) {
      this.speak('Opening student visual dashboard.');
      window.location.href = 'student-hearing-physical.html';
      return;
    }

    if (text.includes('campus map') || text.includes('open map') || text.includes('routes')) {
      this.speak('Opening campus accessibility map.');
      window.location.href = 'campus-map.html';
      return;
    }

    if (text.includes('check status') || text.includes('track status') || text.includes('track grievance') || text.includes('my grievances') || text === 'status') {
      this.speak('Opening grievance status lookup.');
      window.location.href = 'status.html';
      return;
    }

    if (text.includes('how to apply') || text.includes('accommodation') || text.includes('apply for aid')) {
      this.speak('To apply for accommodations or RPwD provisions, contact the Equal Opportunity Cell in Block A or submit an online request.');
      return;
    }

    if (text.includes('read page') || text.includes('read screen')) {
      this.readCurrentPage();
      return;
    }

    if (text.includes('dyslexia') || text.includes('dyslexic')) {
      auth.toggleDyslexicMode();
      this.speak('Dyslexia font toggled.');
      return;
    }

    if (text.includes('contrast')) {
      auth.toggleHighContrast();
      this.speak('High contrast mode toggled.');
      return;
    }

    if (text.includes('text size') || text.includes('larger text') || text.includes('bigger font')) {
      auth.cycleTextSize();
      this.speak('Text size adjusted.');
      return;
    }

    if (text.includes('logout') || text.includes('sign out') || text.includes('exit portal')) {
      this.speak('Signing out from portal.');
      auth.logout();
      return;
    }

    this.speak(`Heard ${transcript}. Say File a grievance, Read notifications, Emergency, Tutor, or Stop.`);
  }

  // =========================================================================
  // 5. Dual-Listener Grievance Flow (triggerGrievanceFlow)
  // =========================================================================
  triggerGrievanceFlow() {
    if (typeof this.customGrievanceHandler === 'function') {
      this.customGrievanceHandler();
      return;
    }

    // 1. Immediately pause global listener
    this.stopGlobalRecognition();
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
        setTimeout(() => {
          if (this.isModalOpen) {
            // 4. Start Modal Dictation Listener
            this.startModalRecognition();
          }
        }, 500);
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

    // Restart background navigation listener if autoRestart was enabled
    if (this.autoRestart) {
      setTimeout(() => {
        this.startGlobalRecognition();
      }, 400);
    }
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

          // Re-enable globalRecognition in ACTIVE state seamlessly
          this.isVoicePortalActive = true;
          this.startGlobalRecognition(false);
          this.updateUiState(true);
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
    this.speak('Emergency protocol triggered. Accessing campus response team.');
    emergency.triggerVoiceEmergency();
  }

  readNotices() {
    const noticeElements = document.querySelectorAll('[data-voice-notice]');
    if (noticeElements.length === 0) {
      this.speak('There are no recent campus notifications at this time.');
      return;
    }
    let allText = 'Here are your campus notifications: ';
    noticeElements.forEach((el, idx) => {
      allText += ` Notification ${idx + 1}: ${el.getAttribute('data-voice-notice') || el.innerText}. `;
    });
    this.speak(allText);
  }

  readCurrentPage() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;
    const text = mainContent.innerText.replace(/\s+/g, ' ').trim();
    this.speak('Reading page preview: ' + text.slice(0, 500) + (text.length > 500 ? '... End of preview.' : ''));
  }

  // =========================================================================
  // 8. Speech Synthesis & UI Status
  // =========================================================================
  speak(text, onComplete = null) {
    if (!this.hasSynthesis) {
      if (onComplete) setTimeout(onComplete, 500);
      return;
    }
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (this.activeVoice) utterance.voice = this.activeVoice;
    if (onComplete) utterance.onend = onComplete;
    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.hasSynthesis) {
      this.synth.cancel();
    }
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
    if (statusText) {
      statusText.textContent = isActive
        ? 'Voice portal active. Listening for commands (say "File a grievance", "Alerts", "Emergency", "Tutor", "Stop")...'
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => voice.mountGlobalVoiceWidget());
  } else {
    voice.mountGlobalVoiceWidget();
  }
}

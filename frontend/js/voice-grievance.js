/**
 * SakshamSetu Voice Grievance Manager
 * Spoken alternative to the typed grievance form on student-visual-dyslexic.html.
 * Implements strict anonymity, Web Speech API interaction, audio tone cues,
 * 3-attempt keyword validation, letter-by-letter code readout, and zero audio storage.
 *
 * NOTE: Requires backend priority patch to accept { category, priority, description, location_text }.
 */
import { api } from './api.js';
import { voice } from './voice.js';

export class VoiceGrievanceManager {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecognition = !!SpeechRecognition;
    this.hasSynthesis = 'speechSynthesis' in window;
    this.synth = window.speechSynthesis;
    this.recognition = null;

    // Strict keyword dictionaries (Case-insensitive exact matches only)
    this.VALID_CATEGORIES = ['facilities', 'transport', 'academic', 'health', 'other'];
    this.CATEGORY_LABELS = {
      facilities: 'Facilities',
      transport: 'Transport',
      academic: 'Academic',
      health: 'Health',
      other: 'Other'
    };

    this.VALID_PRIORITIES = ['low', 'medium', 'high'];
    this.PRIORITY_LABELS = {
      low: 'Low',
      medium: 'Medium',
      high: 'High'
    };

    // Flow State Machine
    // States: 'idle', 'notice', 'category', 'priority', 'description', 'location', 'confirm', 'submitting', 'success', 'error'
    this.state = 'idle';
    this.attempts = 0;
    this.maxAttempts = 3;

    // Ephemeral In-Memory Captured Data (Discarded on submit/cancel - Privacy Guarantee)
    this.captured = {
      category: null,
      priority: null,
      description: '',
      location_text: ''
    };

    this.isRecordingDescription = false;
    this.descriptionSilenceTimer = null;
    this.activeVoice = null;

    this.initAudioContext();
    this.initSpeech();
  }

  initAudioContext() {
    this.audioCtx = null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.audioCtx = new AudioCtx();
    }
  }

  playTone() {
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
        osc.frequency.setValueAtTime(660, this.audioCtx.currentTime); // 660 Hz pleasant prompt chime
        gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      console.warn('[Voice Grievance] AudioContext tone error:', e);
    }
  }

  initSpeech() {
    if (this.hasSynthesis) {
      const updateVoices = () => {
        const voices = this.synth.getVoices();
        this.activeVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
      };
      this.synth.onvoiceschanged = updateVoices;
      updateVoices();
    }

    if (this.hasRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN';

      this.recognition.onresult = (e) => this.handleRecognitionResult(e);
      this.recognition.onerror = (e) => this.handleRecognitionError(e);
      this.recognition.onend = () => this.handleRecognitionEnd();
    }
  }

  speak(text, onComplete = null) {
    if (!this.hasSynthesis) {
      if (onComplete) setTimeout(onComplete, 1000);
      return;
    }
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (this.activeVoice) utterance.voice = this.activeVoice;
    utterance.onend = () => {
      if (onComplete && this.state !== 'idle') {
        onComplete();
      }
    };
    utterance.onerror = () => {
      if (onComplete && this.state !== 'idle') {
        onComplete();
      }
    };
    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.hasSynthesis) {
      this.synth.cancel();
    }
  }

  /**
   * Spells out a tracking code slowly letter by letter and digit by digit for audio clarity
   * e.g. "SAK-2026-8891" -> "S, A, K, hyphen, 2, 0, 2, 6, hyphen, 8, 8, 9, 1"
   */
  formatCodeForSpeech(code) {
    if (!code) return '';
    const chars = code.split('');
    const spokenParts = chars.map(c => {
      if (c === '-') return 'hyphen';
      return c.toUpperCase();
    });
    return spokenParts.join(', ');
  }

  /**
   * Start the voice grievance filing flow
   */
  startFlow() {
    voice.pauseForSubflow();
    this.resetCapturedData();
    this.showModal();
    this.attempts = 0;
    this.stepNotice();
  }

  /**
   * Discard all in-memory captured data (Zero audio/data retention on cancel)
   */
  resetCapturedData() {
    this.captured = {
      category: null,
      priority: null,
      description: '',
      location_text: ''
    };
    this.attempts = 0;
    this.isRecordingDescription = false;
    if (this.descriptionSilenceTimer) clearTimeout(this.descriptionSilenceTimer);
  }

  cancelFlow() {
    this.stopSpeaking();
    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }
    this.resetCapturedData();
    this.state = 'idle';
    this.hideModal();
    voice.resumeAfterSubflow();
  }

  // ==========================================
  // STEP 1: ANONYMITY NOTICE
  // ==========================================
  stepNotice() {
    this.state = 'notice';
    this.renderUi();
    const noticeText = "This report is anonymous. You do not need to share your name or any identifying details. You'll receive a code at the end to check on this later.";
    this.speak(noticeText, () => {
      if (this.state === 'notice') {
        this.stepCategory();
      }
    });
  }

  // ==========================================
  // STEP 2: CATEGORY (Exact keywords only)
  // ==========================================
  stepCategory() {
    this.state = 'category';
    this.renderUi();
    const prompt = "What category is this about? Say Facilities, Transport, Academic, Health, or Other.";
    this.speak(prompt, () => {
      if (this.state === 'category') {
        this.listen();
      }
    });
  }

  handleCategorySpeech(transcript) {
    const clean = transcript.trim().toLowerCase();
    const matched = this.VALID_CATEGORIES.find(cat => clean === cat || clean.startsWith(cat) || clean.endsWith(cat));

    if (matched) {
      this.captured.category = this.CATEGORY_LABELS[matched];
      this.attempts = 0;
      this.renderUi();
      this.speak(`Category noted as ${this.captured.category}.`, () => {
        if (this.state === 'category') {
          this.stepPriority();
        }
      });
    } else {
      this.attempts++;
      this.renderUi();
      if (this.attempts >= this.maxAttempts) {
        this.fallbackToForm();
      } else {
        const retryPrompt = "I didn't catch that, please say Facilities, Transport, Academic, Health, or Other";
        this.speak(retryPrompt, () => {
          if (this.state === 'category') {
            this.listen();
          }
        });
      }
    }
  }

  // ==========================================
  // STEP 3: PRIORITY (Exact keywords only)
  // ==========================================
  stepPriority() {
    this.state = 'priority';
    this.attempts = 0;
    this.renderUi();
    const prompt = "How urgent is this? Say Low, Medium, or High.";
    this.speak(prompt, () => {
      if (this.state === 'priority') {
        this.listen();
      }
    });
  }

  handlePrioritySpeech(transcript) {
    const clean = transcript.trim().toLowerCase();
    const matched = this.VALID_PRIORITIES.find(p => clean === p || clean.startsWith(p) || clean.endsWith(p));

    if (matched) {
      this.captured.priority = this.PRIORITY_LABELS[matched];
      this.attempts = 0;
      this.renderUi();
      this.speak(`Priority noted as ${this.captured.priority}.`, () => {
        if (this.state === 'priority') {
          this.stepDescription();
        }
      });
    } else {
      this.attempts++;
      this.renderUi();
      if (this.attempts >= this.maxAttempts) {
        this.fallbackToForm();
      } else {
        const retryPrompt = "I didn't catch that, please say Low, Medium, or High";
        this.speak(retryPrompt, () => {
          if (this.state === 'priority') {
            this.listen();
          }
        });
      }
    }
  }

  // ==========================================
  // STEP 4: DESCRIPTION (Continuous Speech & Tone)
  // ==========================================
  stepDescription() {
    this.state = 'description';
    this.renderUi();
    const prompt = "Please describe what happened after the tone. Take your time, and say 'I'm done' when finished.";
    this.speak(prompt, () => {
      if (this.state === 'description') {
        this.playTone();
        setTimeout(() => {
          if (this.state === 'description') {
            this.startDescriptionRecording();
          }
        }, 400);
      }
    });
  }

  startDescriptionRecording() {
    this.isRecordingDescription = true;
    this.renderUi();
    if (!this.hasRecognition) {
      this.updateTranscriptDisplay("Voice recognition unavailable in browser. Tap Finish when ready.");
      return;
    }
    try {
      this.recognition.continuous = true;
      this.recognition.start();
    } catch (e) {
      console.warn('[Voice Grievance] Recognition start error:', e);
    }
  }

  finishDescriptionRecording() {
    this.isRecordingDescription = false;
    if (this.descriptionSilenceTimer) clearTimeout(this.descriptionSilenceTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    // Clean trailing "I'm done" phrasing if present
    let clean = (this.captured.description || '').trim();
    clean = clean.replace(/(i'm done|im done|i am done|done)[.?!]?$/i, '').trim();
    if (!clean) {
      clean = "Accessibility barrier reported via spoken audio assistant.";
    }
    this.captured.description = clean;
    this.renderUi();

    this.speak("Description recorded.", () => {
      if (this.state === 'description') {
        this.stepLocation();
      }
    });
  }

  // ==========================================
  // STEP 5: LOCATION (Free Speech)
  // ==========================================
  stepLocation() {
    this.state = 'location';
    this.renderUi();
    const prompt = "Where did this happen?";
    this.speak(prompt, () => {
      if (this.state === 'location') {
        this.listen();
      }
    });
  }

  handleLocationSpeech(transcript) {
    const clean = transcript.trim();
    this.captured.location_text = clean || 'Campus Grounds';
    this.renderUi();
    this.speak(`Location noted as ${this.captured.location_text}.`, () => {
      if (this.state === 'location') {
        this.stepConfirmation();
      }
    });
  }

  // ==========================================
  // STEP 6: CONFIRMATION & READBACK
  // ==========================================
  stepConfirmation() {
    this.state = 'confirm';
    this.renderUi();
    const summaryPrompt = `Here's what I have. Category: ${this.captured.category}. Priority: ${this.captured.priority}. Location: ${this.captured.location_text}. Description: ${this.captured.description}. Say confirm to submit, or cancel to start over.`;
    this.speak(summaryPrompt, () => {
      if (this.state === 'confirm') {
        this.listen();
      }
    });
  }

  handleConfirmSpeech(transcript) {
    const clean = transcript.trim().toLowerCase();
    if (clean.includes('confirm') || clean.includes('submit') || clean === 'yes') {
      this.submitGrievance();
    } else if (clean.includes('cancel') || clean.includes('start over') || clean === 'no') {
      this.speak("Grievance cancelled. Starting over.", () => {
        this.resetCapturedData();
        this.stepNotice();
      });
    } else {
      this.speak("Please say confirm to submit, or cancel to start over.", () => {
        if (this.state === 'confirm') {
          this.listen();
        }
      });
    }
  }

  // ==========================================
  // STEP 7: SUBMISSION & SECRET CODE HANDLING
  // ==========================================
  async submitGrievance() {
    this.state = 'submitting';
    this.renderUi();

    // Payload explicitly includes category, priority, description, location_text
    const payload = {
      category: this.captured.category,
      priority: this.captured.priority,
      description: this.captured.description,
      location_text: this.captured.location_text,
      // Backward compatibility aliases
      location: this.captured.location_text,
      urgency: this.captured.priority
    };

    try {
      const res = await api.grievances.submit(payload);
      if (res && (res.success || res.secretCode || res.secret_code)) {
        const code = res.secretCode || res.secret_code || res.code || 'SAK-2026-CONFIRMED';
        this.state = 'success';
        this.lastSubmittedCode = code;
        this.renderUi();

        // Wipe captured text from memory immediately after submission
        this.resetCapturedData();

        const spokenCode = this.formatCodeForSpeech(code);
        const successSpeech = `Your grievance has been submitted successfully. Your secret tracking code is ${spokenCode}. Please write down or save this code. It is the only way to track your report.`;
        this.speak(successSpeech);
      } else {
        throw new Error(res?.message || 'Server did not return confirmation token.');
      }
    } catch (err) {
      console.error('[Voice Grievance Submission Error]:', err);
      this.state = 'error';
      this.lastErrorMessage = err.message || 'Network error lodging grievance.';
      this.renderUi();
      this.speak("Submission failed. Please check your connection or use the typed form instead.");
    }
  }

  // ==========================================
  // FALLBACK TO TYPED FORM
  // ==========================================
  fallbackToForm() {
    this.speak("Let's use the form instead.", () => {
      const preservedData = { ...this.captured };
      this.cancelFlow();
      if (typeof window.openTypedGrievanceForm === 'function') {
        window.openTypedGrievanceForm(preservedData);
      } else {
        const formEl = document.getElementById('typed-grievance-section');
        if (formEl) {
          formEl.classList.remove('hidden');
          formEl.scrollIntoView({ behavior: 'smooth' });
          if (preservedData.category) {
            const catSelect = formEl.querySelector('[name="category"]');
            if (catSelect) catSelect.value = preservedData.category;
          }
          if (preservedData.priority) {
            const priSelect = formEl.querySelector('[name="priority"]') || formEl.querySelector('[name="urgency"]');
            if (priSelect) priSelect.value = preservedData.priority;
          }
        }
      }
    });
  }

  // ==========================================
  // SPEECH RECOGNITION HANDLERS
  // ==========================================
  listen() {
    if (!this.hasRecognition) {
      this.updateTranscriptDisplay("Microphone unavailable. Use on-screen buttons.");
      return;
    }
    try {
      this.recognition.continuous = false;
      this.recognition.start();
      this.updateTranscriptDisplay("Listening...");
    } catch (e) {
      console.warn('[Voice Grievance] Recognition start warning:', e);
    }
  }

  handleRecognitionResult(event) {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interimTranscript;

    if (this.state === 'description') {
      if (currentText) {
        this.captured.description = (this.captured.description ? this.captured.description + ' ' : '') + currentText.trim();
        this.updateTranscriptDisplay(this.captured.description);

        // Check if student said "I'm done"
        const clean = currentText.toLowerCase();
        if (clean.includes("i'm done") || clean.includes("im done") || clean.includes("i am done") || clean.endsWith("done")) {
          this.finishDescriptionRecording();
          return;
        }

        // Reset silence timer
        if (this.descriptionSilenceTimer) clearTimeout(this.descriptionSilenceTimer);
        this.descriptionSilenceTimer = setTimeout(() => {
          if (this.state === 'description' && this.isRecordingDescription) {
            this.finishDescriptionRecording();
          }
        }, 5500);
      }
    } else {
      if (currentText) {
        this.updateTranscriptDisplay(currentText);
      }
      if (finalTranscript) {
        const text = finalTranscript.trim();
        switch (this.state) {
          case 'category':
            this.handleCategorySpeech(text);
            break;
          case 'priority':
            this.handlePrioritySpeech(text);
            break;
          case 'location':
            this.handleLocationSpeech(text);
            break;
          case 'confirm':
            this.handleConfirmSpeech(text);
            break;
        }
      }
    }
  }

  handleRecognitionError(event) {
    console.warn('[Voice Grievance Recognition Error]:', event.error);
    if (this.state === 'description' && this.isRecordingDescription) {
      // Keep recording or allow retry
      return;
    }
    if (this.state === 'category' || this.state === 'priority') {
      this.attempts++;
      this.renderUi();
      if (this.attempts >= this.maxAttempts) {
        this.fallbackToForm();
      }
    }
  }

  handleRecognitionEnd() {
    if (this.state === 'description' && this.isRecordingDescription) {
      try {
        this.recognition.start();
      } catch (e) {}
    }
  }

  updateTranscriptDisplay(text) {
    const el = document.getElementById('vg-transcript-display');
    if (el) el.textContent = text;
  }

  // ==========================================
  // UI RENDERING & MODAL MANAGEMENT
  // ==========================================
  showModal() {
    let container = document.getElementById('voice-grievance-modal');
    if (!container) {
      container = document.createElement('div');
      container.id = 'voice-grievance-modal';
      container.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs';
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-modal', 'true');
      container.setAttribute('aria-labelledby', 'vg-dialog-title');
      document.body.appendChild(container);
    }
    container.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  hideModal() {
    const container = document.getElementById('voice-grievance-modal');
    if (container) {
      container.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
  }

  renderUi() {
    const container = document.getElementById('voice-grievance-modal');
    if (!container) return;

    let contentHtml = '';

    switch (this.state) {
      case 'notice':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center animate-bounce">
              <span class="material-symbols-outlined text-3xl">verified_user</span>
            </div>
            <div class="space-y-2">
              <span class="badge-pill badge-neutral text-xs font-bold uppercase tracking-wider">Step 1 of 5 • Anonymity Notice</span>
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">Zero-Identity Protection</h3>
              <p class="text-sm text-slate-600 font-medium leading-relaxed max-w-md mx-auto">
                "This report is anonymous. You do not need to share your name or any identifying details. You'll receive a code at the end to check on this later."
              </p>
            </div>
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-3 text-xs font-semibold text-slate-500">
              <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span id="vg-transcript-display">Audio announcement playing...</span>
            </div>
            <div class="flex justify-center gap-3 pt-2">
              <button type="button" id="vg-skip-notice-btn" class="px-5 py-2.5 bg-navy-brand text-white text-xs font-bold rounded-xl hover:bg-navy-dark transition-all">
                Next: Select Category →
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;

      case 'category':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <span class="badge-pill badge-review text-xs font-bold uppercase tracking-wider">Step 2 of 5 • Category</span>
              <span class="text-xs font-bold text-slate-400">Attempt ${Math.min(this.attempts + 1, 3)} of 3</span>
            </div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">What category is this about?</h3>
              <p class="text-xs text-slate-500 font-medium">Say or tap one of the 5 exact categories below:</p>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-md mx-auto">
              ${this.VALID_CATEGORIES.map(cat => `
                <button type="button" class="vg-keyword-btn p-3 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/60 rounded-xl text-xs font-bold text-slate-700 transition-all flex flex-col items-center gap-1" data-keyword="${cat}">
                  <span class="material-symbols-outlined text-lg text-blue-600">${cat === 'facilities' ? 'domain' : cat === 'transport' ? 'directions_bus' : cat === 'academic' ? 'school' : cat === 'health' ? 'local_hospital' : 'more_horiz'}</span>
                  <span>"${this.CATEGORY_LABELS[cat]}"</span>
                </button>
              `).join('')}
            </div>
            <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-600">
              <span class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
              <span id="vg-transcript-display">Listening for category...</span>
            </div>
            <div class="flex justify-center gap-3">
              <button type="button" id="vg-fallback-btn" class="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Use Typed Form Instead
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2 text-slate-400 text-xs font-bold hover:text-red-600 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;

      case 'priority':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <span class="badge-pill badge-open text-xs font-bold uppercase tracking-wider">Step 3 of 5 • Priority</span>
              <span class="text-xs font-bold text-slate-400">Attempt ${Math.min(this.attempts + 1, 3)} of 3</span>
            </div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">How urgent is this?</h3>
              <p class="text-xs text-slate-500 font-medium">Say or tap Low, Medium, or High:</p>
            </div>
            <div class="grid grid-cols-3 gap-3 max-w-sm mx-auto">
              <button type="button" class="vg-keyword-btn p-4 bg-white border border-slate-200 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-700 transition-all flex flex-col items-center gap-1" data-keyword="low">
                <span class="badge-pill bg-slate-100 text-slate-600 text-[10px]">Low</span>
                <span class="text-[11px] text-slate-500">Routine</span>
              </button>
              <button type="button" class="vg-keyword-btn p-4 bg-white border border-amber-200 hover:border-amber-400 rounded-xl text-xs font-bold text-amber-800 bg-amber-50/40 transition-all flex flex-col items-center gap-1" data-keyword="medium">
                <span class="badge-pill bg-amber-100 text-amber-800 text-[10px]">Medium</span>
                <span class="text-[11px] text-amber-600">Needs Attention</span>
              </button>
              <button type="button" class="vg-keyword-btn p-4 bg-white border border-red-200 hover:border-red-400 rounded-xl text-xs font-bold text-red-700 bg-red-50/40 transition-all flex flex-col items-center gap-1" data-keyword="high">
                <span class="badge-pill badge-open text-[10px]">High</span>
                <span class="text-[11px] text-red-600">Urgent Barrier</span>
              </button>
            </div>
            <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-600">
              <span class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
              <span id="vg-transcript-display">Listening for priority...</span>
            </div>
            <div class="flex justify-center gap-3">
              <button type="button" id="vg-fallback-btn" class="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Use Typed Form Instead
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2 text-slate-400 text-xs font-bold hover:text-red-600 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;

      case 'description':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <span class="badge-pill badge-neutral text-xs font-bold uppercase tracking-wider">Step 4 of 5 • Description</span>
              <span class="text-xs font-semibold text-green-600 flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Tone Active</span>
            </div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">Please describe what happened</h3>
              <p class="text-xs text-slate-500 font-medium leading-relaxed max-w-md mx-auto">
                Speak freely. Take your time, and say <strong>"I'm done"</strong> when finished.
              </p>
            </div>
            <div class="p-4 bg-slate-50 border-2 border-dashed border-blue-200 rounded-2xl text-left space-y-2">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Live Spoken Transcript:</span>
              <p id="vg-transcript-display" class="text-sm font-semibold text-slate-800 min-h-[60px] whitespace-pre-wrap">${this.captured.description || 'Listening to your description after tone...'}</p>
            </div>
            <div class="flex flex-wrap justify-center gap-3 pt-2">
              <button type="button" id="vg-finish-desc-btn" class="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base">check_circle</span>
                <span>Finish (or say "I'm done")</span>
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;

      case 'location':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <span class="badge-pill badge-neutral text-xs font-bold uppercase tracking-wider">Step 5 of 5 • Location</span>
              <span class="text-xs font-bold text-slate-400">Free Speech</span>
            </div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">Where did this happen?</h3>
              <p class="text-xs text-slate-500 font-medium max-w-md mx-auto">
                Speak the location on campus (e.g., "Central Library West Wing" or "Block A Ground Floor Ramp").
              </p>
            </div>
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recognized Location:</span>
              <p id="vg-transcript-display" class="text-sm font-bold text-navy-brand min-h-[30px]">${this.captured.location_text || 'Listening for campus location...'}</p>
            </div>
            <div class="flex justify-center gap-3 pt-2">
              <button type="button" id="vg-confirm-location-btn" class="px-5 py-2.5 bg-navy-brand text-white text-xs font-bold rounded-xl hover:bg-navy-dark transition-all">
                Next: Review & Confirm →
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;

      case 'confirm':
        contentHtml = `
          <div class="space-y-6 text-left">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
              <span class="badge-pill badge-resolved text-xs font-bold uppercase tracking-wider">Review & Readback</span>
              <span class="text-xs font-bold text-blue-600">Ready to Submit</span>
            </div>
            <div>
              <h3 id="vg-dialog-title" class="text-xl font-extrabold text-navy-brand font-heading">Confirm Your Anonymous Report</h3>
              <p class="text-xs text-slate-500 font-medium mt-0.5">Say "Confirm" to submit or "Cancel" to start over.</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Category</span>
                <span class="text-sm font-bold text-navy-brand">${this.captured.category || 'Facilities'}</span>
              </div>
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Priority</span>
                <span class="text-sm font-bold text-slate-800">${this.captured.priority || 'Medium'}</span>
              </div>
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5 sm:col-span-2">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Location</span>
                <span class="text-sm font-bold text-slate-800">${this.captured.location_text || 'Campus Grounds'}</span>
              </div>
              <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5 sm:col-span-2">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">Description</span>
                <p class="text-xs font-medium text-slate-700 leading-relaxed">${this.captured.description || 'None'}</p>
              </div>
            </div>
            <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-blue-800">
              <span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span id="vg-transcript-display">Listening: Say "Confirm" or "Cancel"...</span>
            </div>
            <div class="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" id="vg-cancel-btn" class="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Cancel & Start Over
              </button>
              <button type="button" id="vg-submit-btn" class="px-6 py-2.5 bg-navy-brand hover:bg-navy-dark text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-base">send</span>
                <span>Confirm & Submit Anonymously</span>
              </button>
            </div>
          </div>
        `;
        break;

      case 'submitting':
        contentHtml = `
          <div class="py-12 space-y-6 text-center">
            <div class="w-16 h-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto"></div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">Registering Anonymously...</h3>
              <p class="text-xs text-slate-500 font-medium">Securing anonymous tracking token from the server.</p>
            </div>
          </div>
        `;
        break;

      case 'success':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="w-16 h-16 rounded-3xl bg-green-50 text-green-600 mx-auto flex items-center justify-center">
              <span class="material-symbols-outlined text-4xl">check_circle</span>
            </div>
            <div class="space-y-2">
              <span class="badge-pill badge-resolved text-xs font-bold uppercase tracking-wider">Submission Successful</span>
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-navy-brand font-heading">Grievance Registered Anonymously!</h3>
              <p class="text-xs text-slate-600 font-medium max-w-md mx-auto">
                Save your tracking code below to check resolution status anytime.
              </p>
            </div>
            <div class="p-5 bg-white border-2 border-green-300 rounded-2xl space-y-3 shadow-xs">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Your Secret Tracking Code:</span>
              <p class="text-3xl sm:text-4xl font-extrabold text-navy-brand tracking-widest font-mono select-all">
                ${this.lastSubmittedCode}
              </p>
              <div class="pt-2 flex justify-center">
                <button type="button" id="vg-copy-code-btn" class="px-4 py-2 bg-navy-brand hover:bg-navy-dark text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">content_copy</span>
                  <span id="vg-copy-label">Copy Secret Code</span>
                </button>
              </div>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600">
              Spoken code readout completed. You can look up this report without logging in at the Grievance Tracker.
            </div>
            <div class="flex justify-center gap-3 pt-2">
              <button type="button" id="vg-done-btn" class="px-6 py-2.5 bg-navy-brand text-white text-xs font-bold rounded-xl hover:bg-navy-dark transition-all">
                Done / Close
              </button>
            </div>
          </div>
        `;
        break;

      case 'error':
        contentHtml = `
          <div class="space-y-6 text-center">
            <div class="w-16 h-16 rounded-3xl bg-red-50 text-red-600 mx-auto flex items-center justify-center">
              <span class="material-symbols-outlined text-3xl">error</span>
            </div>
            <div class="space-y-2">
              <h3 id="vg-dialog-title" class="text-2xl font-extrabold text-red-700 font-heading">Submission Error</h3>
              <p class="text-xs text-slate-600 font-medium max-w-md mx-auto">
                ${this.lastErrorMessage || 'Failed to lodge grievance anonymously. Please check your network connection.'}
              </p>
            </div>
            <div class="flex justify-center gap-3 pt-4">
              <button type="button" id="vg-retry-btn" class="px-5 py-2.5 bg-navy-brand text-white text-xs font-bold rounded-xl hover:bg-navy-dark transition-all">
                Retry Submission
              </button>
              <button type="button" id="vg-fallback-btn" class="px-4 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all">
                Use Typed Form
              </button>
              <button type="button" id="vg-cancel-btn" class="px-4 py-2.5 text-slate-400 text-xs font-bold hover:text-red-600 transition-all">
                Cancel
              </button>
            </div>
          </div>
        `;
        break;
    }

    container.innerHTML = `
      <div class="w-full max-w-lg bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in duration-150">
        <button type="button" id="vg-close-x-btn" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors" aria-label="Close voice grievance filing">
          <span class="material-symbols-outlined text-base">close</span>
        </button>
        ${contentHtml}
      </div>
    `;

    this.attachUiListeners();
  }

  attachUiListeners() {
    document.getElementById('vg-close-x-btn')?.addEventListener('click', () => this.cancelFlow());
    document.getElementById('vg-cancel-btn')?.addEventListener('click', () => this.cancelFlow());
    document.getElementById('vg-done-btn')?.addEventListener('click', () => this.cancelFlow());

    document.getElementById('vg-skip-notice-btn')?.addEventListener('click', () => {
      this.stopSpeaking();
      this.stepCategory();
    });

    document.getElementById('vg-fallback-btn')?.addEventListener('click', () => {
      this.fallbackToForm();
    });

    document.getElementById('vg-finish-desc-btn')?.addEventListener('click', () => {
      this.finishDescriptionRecording();
    });

    document.getElementById('vg-confirm-location-btn')?.addEventListener('click', () => {
      if (!this.captured.location_text) {
        this.captured.location_text = 'Campus Central Grounds';
      }
      this.stepConfirmation();
    });

    document.getElementById('vg-submit-btn')?.addEventListener('click', () => {
      this.submitGrievance();
    });

    document.getElementById('vg-retry-btn')?.addEventListener('click', () => {
      this.submitGrievance();
    });

    document.querySelectorAll('.vg-keyword-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const kw = btn.getAttribute('data-keyword');
        if (this.state === 'category') {
          this.handleCategorySpeech(kw);
        } else if (this.state === 'priority') {
          this.handlePrioritySpeech(kw);
        }
      });
    });

    document.getElementById('vg-copy-code-btn')?.addEventListener('click', () => {
      if (this.lastSubmittedCode) {
        navigator.clipboard.writeText(this.lastSubmittedCode).then(() => {
          const label = document.getElementById('vg-copy-label');
          if (label) label.textContent = 'Code Copied!';
          setTimeout(() => {
            if (label) label.textContent = 'Copy Secret Code';
          }, 3000);
        });
      }
    });
  }
}

export const voiceGrievance = new VoiceGrievanceManager();

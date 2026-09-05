/**
 * Saksham Setu Emergency Module
 * Implements the dual-trigger accessibility rule:
 * - On student-visual-dyslexic.html: Triggered by spoken command via voice.js or emergency button,
 *   calls POST /api/emergency/request and narrates contact information clearly.
 * - On student-hearing-physical.html: Triggered by visible tap button,
 *   calls POST /api/emergency/request and displays high-contrast visual modal.
 * 
 * Supports both normal click/touch actions and voice commands:
 * - "Call", "Dial" -> initiateEmergencyCall()
 * - "Dismiss", "Close", "Cancel" -> dismissEmergencyModal()
 */

import { api } from './api.js';

export function processEmergencyVoice(transcript) {
  const text = (transcript || '').toLowerCase().trim();
  console.log('[Emergency Voice]: Processing transcript:', text);

  if (text.includes("dismiss") || text.includes("close") || text.includes("cancel") || text.includes("exit") || text.includes("leave")) {
    // 1. Force hide modal
    const modal = document.getElementById('emergencyModal') || document.getElementById('emergency-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    const banner = document.getElementById('emergency-banner');
    if (banner) {
      try { banner.remove(); } catch (e) {}
    }
    // 2. Speak confirmation and restore main portal state
    const engine = typeof window !== 'undefined' && (window.voiceEngine || window.voice);
    if (engine && typeof engine.speak === 'function') {
      engine.speak("Emergency modal closed. Returning to main portal.", () => {
        if (typeof engine.setState === 'function') {
          engine.setState('MAIN');
        } else {
          emergency.dismissEmergencyModal();
        }
      });
    } else {
      emergency.dismissEmergencyModal();
    }
  } else if (text.includes("call") || text.includes("dial") || text.includes("make a call") || text.includes("make the call")) {
    const engine = typeof window !== 'undefined' && (window.voiceEngine || window.voice);
    if (engine && typeof engine.speak === 'function') {
      engine.speak("Initiating emergency call.", () => {
        window.location.href = `tel:${emergency.activePhoneNumber || '112'}`;
      });
    } else {
      emergency.initiateEmergencyCall();
    }
  }
}

export const emergency = {
  activePhoneNumber: '112',
  emergencyRecognition: null,
  isEmergencyListening: false,

  /**
   * Initializes dedicated Emergency SpeechRecognition instance (Single-Shot)
   */
  initEmergencyRecognition: () => {
    if (emergency.emergencyRecognition) return;
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) return;

    emergency.emergencyRecognition = new SpeechRecognition();
    emergency.emergencyRecognition.continuous = false; // Single-shot capture matching Grievance logic
    emergency.emergencyRecognition.interimResults = false;
    emergency.emergencyRecognition.lang = 'en-IN';
    emergency.emergencyRecognition.maxAlternatives = 3;

    emergency.emergencyRecognition.onstart = () => {
      emergency.isEmergencyListening = true;
      console.log('[Emergency Recognition]: Started single-shot listening for Call/Dismiss');
    };

    emergency.emergencyRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      processEmergencyVoice(transcript);
    };

    emergency.emergencyRecognition.onerror = (e) => {
      console.warn('[Emergency Recognition] Error:', e.error);
      emergency.isEmergencyListening = false;
    };

    emergency.emergencyRecognition.onend = () => {
      emergency.isEmergencyListening = false;
      console.log('[Emergency Recognition]: Single-shot capture ended');
    };
  },

  startEmergencyRecognition: () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!emergency.emergencyRecognition) {
      emergency.initEmergencyRecognition();
    }

    if (!emergency.isEmergencyListening && emergency.emergencyRecognition) {
      try {
        emergency.emergencyRecognition.start();
        emergency.isEmergencyListening = true;
      } catch (e) {
        console.warn('[Emergency Recognition] start exception:', e);
      }
    }
  },

  stopEmergencyRecognition: () => {
    if (emergency.emergencyRecognition && emergency.isEmergencyListening) {
      try {
        emergency.emergencyRecognition.stop();
      } catch (e) {}
    }
    emergency.isEmergencyListening = false;
  },

  activeContactName: 'Campus Quick Response Team',

  /**
   * Initiates emergency phone call with spoken confirmation
   */
  initiateEmergencyCall: (phone = null, contactName = null) => {
    const targetPhone = phone || emergency.activePhoneNumber || '112';
    const targetName = contactName || emergency.activeContactName || 'Campus Quick Response Team';
    console.log('[Emergency Action]: Initiating emergency call to', targetName, targetPhone);

    emergency.stopEmergencyRecognition();

    if (typeof window !== 'undefined' && window.voice) {
      window.voice.stopGlobalRecognition(false);
      window.voice.isSpeaking = true;
      window.voice.voiceOwner = 'emergency_call';
    }

    const dial = () => {
      if (typeof window !== 'undefined' && window.voice) {
        window.voice.isSpeaking = false;
        window.voice.releaseMicrophoneOwnership('emergency');
        window.voice.releaseMicrophoneOwnership('emergency_call');
        window.voice.voiceOwner = 'global';
        window.voice.isVoicePortalActive = true;
        window.voice.startGlobalRecognition(false);
        window.voice.updateUiState(true);
      }
      window.location.href = `tel:${targetPhone}`;
    };

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Initiating emergency call to ${targetName} at ${targetPhone.split('').join(' ')}.`);
      utterance.rate = 0.95;
      utterance.onend = dial;
      utterance.onerror = dial;
      window.speechSynthesis.speak(utterance);
    } else {
      dial();
    }
  },

  /**
   * Dismisses emergency modal, announces audio confirmation, and safely restores voice portal
   */
  dismissEmergencyModal: () => {
    console.log('[Emergency Action]: Dismissing emergency modal');
    emergency.stopEmergencyRecognition();

    const modal = document.getElementById('emergencyModal') || document.getElementById('emergency-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      try { modal.remove(); } catch (e) {}
    }

    const banner = document.getElementById('emergency-banner');
    if (banner) {
      try { banner.remove(); } catch (e) {}
    }

    // Stop active recognition and prevent auto-restart during closing TTS
    if (typeof window !== 'undefined' && window.voice) {
      window.voice.stopGlobalRecognition(false);
      window.voice.isSpeaking = true;
      window.voice.voiceOwner = 'emergency_closing';
    }

    // Spoken confirmation: only resume global voice AFTER TTS finishes
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Emergency modal closed. Returning to voice portal.");
      utterance.rate = 0.95;
      const restoreGlobal = () => {
        if (typeof window !== 'undefined' && window.voice) {
          window.voice.isSpeaking = false;
          window.voice.releaseMicrophoneOwnership('emergency');
          window.voice.releaseMicrophoneOwnership('emergency_closing');
          window.voice.voiceOwner = 'global';
          window.voice.isVoicePortalActive = true;
          window.voice.startGlobalRecognition(false);
          window.voice.updateUiState(true);
        }
      };
      utterance.onend = restoreGlobal;
      utterance.onerror = restoreGlobal;
      window.speechSynthesis.speak(utterance);
    } else {
      if (typeof window !== 'undefined' && window.voice) {
        window.voice.isSpeaking = false;
        window.voice.releaseMicrophoneOwnership('emergency');
        window.voice.releaseMicrophoneOwnership('emergency_closing');
        window.voice.voiceOwner = 'global';
        window.voice.isVoicePortalActive = true;
        window.voice.startGlobalRecognition(false);
        window.voice.updateUiState(true);
      }
    }
  },

  /**
   * 1. Voice-Triggered Emergency Flow (for Visual / Dyslexic Portal)
   */
  triggerVoiceEmergency: async (location = 'Visual-Dyslexic Portal') => {
    try {
      if (typeof window !== 'undefined' && window.voice) {
        window.voice.requestMicrophoneOwnership('emergency');
        window.voice.stopGlobalRecognition(false);
        window.voice.isSpeaking = true;
      }

      const requestRes = await api.emergency.request();
      const res = requestRes.success ? requestRes : await api.emergency.getContact(location);

      const contactName = res.contactName || 'Campus Quick Response Team';
      const phone = res.phoneNumber || '112';
      emergency.activePhoneNumber = phone;

      // Render on-screen emergency modal & alert banner
      emergency.renderEmergencyBanner({
        contactName,
        phoneNumber: phone,
        alternateNumber: res.alternateNumber || '108',
        instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
      });

      emergency.renderHighContrastModal({
        contactName,
        phoneNumber: phone,
        alternateNumber: res.alternateNumber || '108',
        instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
      });

      // Spoken narration
      const speechText = `Emergency assistance alert activated. Contacting ${contactName}. The direct phone number is ${phone.split('').join(' ')}. Please say call or dismiss.`;
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        const startEmergencyListening = () => {
          if (typeof window !== 'undefined' && window.voice) {
            window.voice.isSpeaking = false;
            window.voice.voiceOwner = 'emergency';
            window.voice.isVoicePortalActive = true;
          }
          emergency.startEmergencyRecognition();
        };
        utterance.onend = startEmergencyListening;
        utterance.onerror = startEmergencyListening;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error('[Emergency API Error]', err);
    }
  },

  /**
   * 2. Tap-Triggered Emergency Flow (for Hearing / Physical Portal)
   */
  triggerTapEmergency: async (location = 'Hearing-Physical Portal') => {
    try {
      const requestRes = await api.emergency.request();
      const res = requestRes.success ? requestRes : await api.emergency.getContact(location);

      const contactName = res.contactName || 'Campus Quick Response Team';
      const phone = res.phoneNumber || '112';
      emergency.activePhoneNumber = phone;

      emergency.renderHighContrastModal({
        contactName,
        phoneNumber: phone,
        alternateNumber: res.alternateNumber || '108',
        instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
      });
    } catch (err) {
      console.error('[Emergency API Error]', err);
    }
  },

  /**
   * Renders high-contrast on-screen modal with independent Call and Dismiss buttons
   */
  renderHighContrastModal: (contactData) => {
    const existing = document.getElementById('emergencyModal') || document.getElementById('emergency-modal');
    if (existing) existing.remove();

    const phone = contactData.phoneNumber || '112';
    emergency.activePhoneNumber = phone;

    const modal = document.createElement('div');
    modal.id = 'emergencyModal';
    modal.className = 'emergency-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'emergency-modal-title');

    modal.innerHTML = `
      <div class="emergency-modal-content border-2 border-red-500 p-6 md:p-8 bg-white max-w-xl w-full rounded-3xl space-y-5 shadow-2xl" style="background-color: #ffffff; color: #0f172a;">
        <div class="flex items-center gap-3 border-b-2 border-red-200 pb-3" style="border-bottom-color: #fee2e2;">
          <div class="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md" style="background-color: #dc2626; color: #ffffff;">
            <span class="material-symbols-outlined text-3xl">emergency</span>
          </div>
          <div>
            <h2 id="emergency-modal-title" class="text-2xl font-extrabold text-red-600 font-heading" style="color: #dc2626;">EMERGENCY ASSISTANCE ACTIVATED</h2>
            <p class="text-xs text-slate-600 font-semibold mt-0.5">Campus Quick Response Dispatch & Security</p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="p-4 rounded-2xl border border-slate-200" style="background-color: #f8fafc; color: #0f172a;">
            <p class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Responder Team</p>
            <p class="text-lg font-extrabold text-slate-900 mt-0.5" style="color: #0f172a;">${contactData.contactName}</p>
          </div>

          <div class="p-4 rounded-2xl border-2 border-red-300" style="background-color: #fef2f2; color: #dc2626;">
            <p class="text-[10px] font-extrabold text-red-700 uppercase tracking-wider">Direct Hotline (Tap to Dial)</p>
            <p class="text-3xl font-extrabold text-red-600 mt-0.5 tracking-wider font-mono" style="color: #dc2626;">${phone}</p>
          </div>

          <div class="p-4 rounded-2xl border border-slate-200" style="background-color: #f8fafc; color: #0f172a;">
            <p class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Alternate / Ambulance</p>
            <p class="text-base font-bold text-slate-800 mt-0.5" style="color: #1e293b;">${contactData.alternateNumber || '108'}</p>
          </div>

          <div class="p-4 border-2 border-red-400 rounded-2xl text-xs font-bold leading-relaxed" style="background-color: #dc2626; color: #ffffff;">
            ⚠️ ${contactData.instructions || 'Stay at your current location. Campus medical responders and security are notified.'}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <button type="button" id="emergencyCallBtn" style="background-color: #dc2626 !important; color: #ffffff !important;" class="flex-1 text-center font-extrabold py-3.5 px-6 rounded-xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer">
            <span class="material-symbols-outlined text-xl">call</span>
            <span>CALL EMERGENCY (${phone})</span>
          </button>
          <button type="button" id="emergencyDismissBtn" style="background-color: #f1f5f9; color: #334155;" class="font-bold py-3.5 px-6 rounded-xl hover:bg-slate-200 transition-all text-sm cursor-pointer">
            Dismiss
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind direct click listeners for dual-modality (Mouse + Voice)
    document.getElementById('emergencyCallBtn')?.addEventListener('click', () => {
      window.location.href = `tel:${phone}`;
    });
    document.getElementById('emergencyDismissBtn')?.addEventListener('click', () => {
      const m = document.getElementById('emergencyModal');
      if (m) {
        m.style.display = 'none';
        m.classList.add('hidden');
      }
      const engine = typeof window !== 'undefined' && (window.voiceEngine || window.voice);
      if (engine && typeof engine.speak === 'function') {
        engine.speak("Emergency modal closed.");
      }
      emergency.dismissEmergencyModal();
    });

    // Backward compatible IDs
    document.getElementById('btn-emergency-call')?.addEventListener('click', () => {
      emergency.initiateEmergencyCall(phone);
    });

    const closeBtn = document.getElementById('close-emergency-modal');
    if (closeBtn) {
      closeBtn.focus();
      closeBtn.addEventListener('click', () => {
        emergency.dismissEmergencyModal();
      });
    }

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') emergency.dismissEmergencyModal();
    });
  },

  renderEmergencyBanner: (contactData) => {
    const existing = document.getElementById('emergency-banner');
    if (existing) existing.remove();

    const phone = contactData.phoneNumber || '112';
    const banner = document.createElement('div');
    banner.id = 'emergency-banner';
    banner.className = 'fixed bottom-4 right-4 z-50 p-5 rounded-2xl max-w-md shadow-2xl border-2 border-white';
    banner.style.cssText = 'background-color: #dc2626 !important; color: #ffffff !important; z-index: 99999;';
    
    banner.innerHTML = `
      <div class="flex items-start gap-3.5" style="color: #ffffff;">
        <div class="w-10 h-10 rounded-xl bg-white text-red-600 flex items-center justify-center shrink-0 shadow-sm" style="background-color: #ffffff; color: #dc2626;">
          <span class="material-symbols-outlined text-2xl">emergency</span>
        </div>
        <div class="space-y-1 flex-1 min-w-0" style="color: #ffffff;">
          <h3 class="text-base font-extrabold leading-tight" style="color: #ffffff;">EMERGENCY ALERT ACTIVE</h3>
          <p class="font-bold text-xs" style="color: #fef2f2;">Contact: ${contactData.contactName}</p>
          <p class="text-2xl font-mono font-extrabold tracking-wider" style="color: #ffffff;">${phone}</p>
          <div class="flex items-center gap-2 pt-1.5">
            <button type="button" id="banner-emergency-call" class="text-xs font-extrabold py-1.5 px-3.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer" style="background-color: #ffffff !important; color: #dc2626 !important;">
              <span class="material-symbols-outlined text-sm">call</span>
              <span>Call Now</span>
            </button>
            <button type="button" id="close-emergency-banner" class="text-xs font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer" style="background-color: rgba(0,0,0,0.25); color: #ffffff;">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById('banner-emergency-call')?.addEventListener('click', () => {
      emergency.initiateEmergencyCall(phone);
    });
    document.getElementById('close-emergency-banner')?.addEventListener('click', () => {
      emergency.dismissEmergencyModal();
    });
  }
};

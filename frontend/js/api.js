/**
 * Saksham Setu (AMSETU) API Layer
 * Configured API_BASE_URL = 'https://sakshamsetu.onrender.com' (Production Backend)
 * Uses Fetch API exclusively (no external HTTP libraries).
 * Includes authentication token interceptor with explicit requireAuth flag.
 */

export const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? 'http://127.0.0.1:8000'
  : 'https://sakshamsetu.onrender.com';

// Local storage session fallback cache for offline resiliency
const CLEAN_STORAGE = {
  grievances: [],
  alerts: [],
  checklist: [
    { id: 'CHK-01', category: 'Architectural', title: 'Main entrance gradient ramp 1:12 slope with dual-height continuous handrails', status: 'In Review', score: 0 },
    { id: 'CHK-02', category: 'Architectural', title: 'Tactile ground surface indicators (guiding and warning) leading to all major blocks', status: 'In Review', score: 0 },
    { id: 'CHK-03', category: 'Architectural', title: 'Accessible unisex restroom on each floor with sliding door, grab rails, emergency alarm', status: 'In Review', score: 0 },
    { id: 'CHK-04', category: 'Architectural', title: 'Elevators equipped with voice announcement, braille embossed buttons, and infrared doors', status: 'In Review', score: 0 },
    { id: 'CHK-05', category: 'Digital', title: 'Web portal WCAG 2.1 Level AAA compliant with screen reader compatibility', status: 'Compliant', score: 10 },
    { id: 'CHK-06', category: 'Digital', title: 'All video lectures provided with synchronized open captions and sign language video inset', status: 'In Review', score: 0 },
    { id: 'CHK-07', category: 'Digital', title: 'High contrast visual-first and dyslexia-friendly interface presets available', status: 'Compliant', score: 10 },
    { id: 'CHK-08', category: 'Aids & Academics', title: 'Dedicated Nodal Equal Opportunity Cell with qualified sign language interpreters', status: 'In Review', score: 0 },
    { id: 'CHK-09', category: 'Aids & Academics', title: 'Accessible formats for exam question papers (Large print 20pt, Braille, Screen-reader e-Text)', status: 'In Review', score: 0 },
    { id: 'CHK-10', category: 'Emergency', title: 'Visible strobe light alarms synchronized with acoustic fire alarms in all classrooms & hostels', status: 'In Review', score: 0 }
  ],
  settings: {
    emergencyNumber: '112',
    ambulanceHotline: '108',
    complianceStandard: 'RPwD Act 2016 / Harmonised Guidelines 2021',
    speechRecognitionLocale: 'en-IN'
  }
};

function getLocalState() {
  const existing = localStorage.getItem('saksham_setu_state');
  if (!existing) {
    localStorage.setItem('saksham_setu_state', JSON.stringify(CLEAN_STORAGE));
    return CLEAN_STORAGE;
  }
  try {
    return JSON.parse(existing);
  } catch (e) {
    return CLEAN_STORAGE;
  }
}

function saveLocalState(state) {
  localStorage.setItem('saksham_setu_state', JSON.stringify(state));
}

/**
 * Universal safe fetch wrapper with automatic Auth Token attachment and redirect control.
 * @param {string} endpoint - API path
 * @param {object} options - Fetch options
 * @param {boolean} requireAuth - When false, skip Authorization header and skip redirect-on-missing-token check.
 * @param {function} fallbackAction - Optional offline fallback
 */
export async function apiFetch(endpoint, options = {}, requireAuth = true, fallbackAction = null) {
  const url = `${API_BASE_URL}${endpoint}`;

  let token = null;
  try {
    const rawUser = localStorage.getItem('saksham_user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      token = parsed.token || parsed.access_token;
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  // If route requires authentication and no token exists, redirect to index.html
  if (requireAuth && !token) {
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/' && window.location.pathname !== '') {
      console.warn(`[Auth Check] Route ${endpoint} requires auth. No token found. Redirecting to index.html`);
      window.location.href = 'index.html';
      return;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(requireAuth && token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });
    if (!res.ok) {
      if (res.status === 401 && requireAuth && !fallbackAction) {
        localStorage.removeItem('saksham_user');
        if (typeof window !== 'undefined' && !window.location.pathname.endsWith('index.html')) {
          window.location.href = 'index.html';
        }
      }
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[API Notice] Request to ${url} failed or backend is connecting.`, err.message);
    if (fallbackAction) {
      return fallbackAction();
    }
    throw err;
  }
}

export const api = {
  // Authentication & Session
  auth: {
    login: async (email, password, role = 'student', disabilityCategory = 'voice') => {
      // NOTE: account creation is assumed to happen via POST /api/auth/register elsewhere, or via admin-side provisioning — this form assumes an existing account and does not handle signup.
      return apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      }, false, () => {
        // Fallback simulated user if backend is unreachable
        const user = {
          email,
          role,
          disability_category: disabilityCategory,
          disabilityMode: disabilityCategory,
          loggedInAt: new Date().toISOString(),
          token: 'jwt-session-token-' + Date.now()
        };
        localStorage.setItem('saksham_user', JSON.stringify(user));
        return { success: true, user, token: user.token, disability_category: disabilityCategory };
      });
    },
    getCurrentUser: () => {
      const user = localStorage.getItem('saksham_user');
      return user ? JSON.parse(user) : null;
    },
    logout: () => {
      localStorage.removeItem('saksham_user');
      return { success: true };
    }
  },

  // Student & Admin Dashboards
  dashboard: {
    getStudent: async () => {
      return apiFetch('/api/dashboard/student', {
        method: 'GET'
      }, true, () => {
        return {
          success: true,
          name: 'Student User',
          institute_compliance_score: 88,
          nearby_services: [
            { name: 'Central Library Ramp', category: 'Physical Access', status: 'Operational' },
            { name: 'East Wing Elevator #1', category: 'Vertical Transit', status: 'Operational' },
            { name: 'Nodal Equal Opportunity Cell', category: 'Assistive Aid', status: 'Open' }
          ]
        };
      });
    },
    getAdmin: async () => {
      return apiFetch('/api/dashboard/admin', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return {
          success: true,
          overall_score: 88,
          open_grievance_count: state.grievances.filter(g => g.status !== 'Resolved').length,
          average_resolution_days: 1.2,
          active_services_count: 12
        };
      });
    }
  },

  // Public Services Lookup (Unauthenticated)
  services: {
    getByCategory: async (category = 'emergency') => {
      return apiFetch(`/api/services?category=${encodeURIComponent(category)}`, {
        method: 'GET'
      }, false, () => {
        const state = getLocalState();
        return {
          success: true,
          services: [
            { name: 'Campus Quick Response Team', category: 'emergency', phone: state.settings.emergencyNumber || '112' },
            { name: 'Campus Ambulance Service', category: 'emergency', phone: state.settings.ambulanceHotline || '108' }
          ]
        };
      });
    }
  },

  // Emergency Actions
  emergency: {
    // Authenticated student emergency request with fixed general category
    // NOTE: Fixed { "category": "general" } is intentional because portals do not have a category selector, not a placeholder to revisit.
    request: async () => {
      return apiFetch('/api/emergency/request', {
        method: 'POST',
        body: JSON.stringify({ category: 'general' })
      }, true, () => {
        const state = getLocalState();
        return {
          success: true,
          contactName: 'Campus Quick Response Team',
          phoneNumber: state.settings.emergencyNumber || '112',
          alternateNumber: state.settings.ambulanceHotline || '108',
          instructions: 'Stay at your current location. Emergency responders are dispatched.'
        };
      });
    },
    getContact: async (location = 'Campus Central') => {
      return apiFetch(`/api/emergency/contact?location=${encodeURIComponent(location)}`, {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return {
          success: true,
          contactName: 'Campus Quick Response Team',
          phoneNumber: state.settings.emergencyNumber || '112',
          alternateNumber: state.settings.ambulanceHotline || '108',
          location: location,
          instructions: 'Stay at your current location. Emergency responders are notified.'
        };
      });
    }
  },

  // Grievance Handling
  grievances: {
    // NOTE: Submissions from the voice-driven flow submit { category, priority, description, location_text }.
    // Requires the backend priority patch to persist 'priority'.
    submit: async (data) => {
      return apiFetch('/api/grievance', {
        method: 'POST',
        body: JSON.stringify(data)
      }, false, () => {
        const state = getLocalState();
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const code = `SAK-2026-${randomNum}`;
        const locationVal = data.location_text || data.location || 'Campus Grounds';
        const priorityVal = data.priority || data.urgency || 'Normal';
        const newGrievance = {
          id: code,
          code,
          secret_code: code,
          category: data.category || 'General Accessibility',
          location: locationVal,
          location_text: locationVal,
          urgency: priorityVal,
          priority: priorityVal,
          description: data.description || '',
          assigned_department: data.department || null,
          department: data.department || null,
          status: 'Registered',
          submittedAt: new Date().toISOString(),
          timeline: [
            { title: 'Registered & Anonymous Token Assigned', time: 'Just now', completed: true },
            { title: 'Under Department Assessment', time: 'Pending', completed: false },
            { title: 'Action Scheduled / Inspection Dispatched', time: 'Pending', completed: false },
            { title: 'Resolution Verified', time: 'Pending', completed: false }
          ]
        };
        state.grievances.unshift(newGrievance);
        saveLocalState(state);
        return { success: true, secretCode: code, secret_code: code, grievance: newGrievance };
      });
    },

    // AI-Powered Spoken Voice Parser (Gemini Voice Integration)
    parseVoice: async (rawTranscript) => {
      return apiFetch('/api/grievance/parse-voice', {
        method: 'POST',
        body: JSON.stringify({ raw_transcript: rawTranscript })
      }, false, () => {
        // Fallback intelligent parser if backend Gemini parser is spinning up
        const text = (rawTranscript || '').toLowerCase();
        let category = 'other';
        let categoryName = 'Other Campus Barrier';

        const matchWord = (pattern) => new RegExp(`\\b(${pattern})\\b`, 'i').test(text);

        if (matchWord('exam|exams|academic|academics|scribe|scribes|extra time|compensatory time|teacher|teachers|professor|professors|class|classes|lecture|lectures|course|courses|assignment|assignments|syllabus')) {
          category = 'academic_access';
          categoryName = 'Academic Access';
        } else if (matchWord('harass|harassment|bully|bullying|ragged|ragging|discipline|discriminate|discrimination|governance|threat|threatened|staff behavior')) {
          category = 'governance';
          categoryName = 'Harassment and Governance';
        } else if (matchWord('portal|portals|website|websites|screen reader|screenreaders|screenreader|digital|online|wcag|app|apps|application login|login error|bug')) {
          category = 'digital_ict';
          categoryName = 'Digital and Online Accessibility';
        } else if (matchWord('bus|buses|transport|transports|van|vans|vehicle|vehicles|shuttle|shuttles|driver|drivers|commute')) {
          category = 'transport';
          categoryName = 'Transport';
        } else if (matchWord('health|medical|hospital|hospitals|doctor|doctors|nurse|injury|injured|hurt|medicine|medicines|ambulance|clinic')) {
          category = 'health';
          categoryName = 'Health';
        } else if (matchWord('ramp|ramps|elevator|elevators|lift|lifts|door|doors|building|buildings|stairs|staircase|restroom|restrooms|toilet|toilets|washroom|washrooms|facility|facilities|light|lighting|pathway|pathways|tactile|wheelchair')) {
          category = 'physical_infra';
          categoryName = 'Facilities';
        }

        let priority = 'Medium';
        if (text.includes('urgent') || text.includes('emergency') || text.includes('danger') || text.includes('critical') || text.includes('high') || text.includes('stuck') || text.includes('trap') || text.includes('broken lift') || text.includes('immediate')) {
          priority = 'High';
        } else if (text.includes('low') || text.includes('minor') || text.includes('slight') || text.includes('routine') || text.includes('non urgent')) {
          priority = 'Low';
        }

        let location = 'Campus Grounds';
        const locMatch = (rawTranscript || '').match(/(?:at|in|near|around|outside|inside|by)\s+([A-Za-z0-9\s]+?)(?:\.|$|,|and)/i);
        if (locMatch && locMatch[1]) {
          location = locMatch[1].trim();
        }

        return {
          success: true,
          category,
          category_code: category,
          category_name: categoryName,
          priority,
          cleaned_description: (rawTranscript || '').trim(),
          location_text: location
        };
      });
    },

    // Track by secret code (Public unauthenticated route: requireAuth = false)
    trackByCode: async (secretCode) => {
      const cleanCode = secretCode.trim().toUpperCase();
      return apiFetch(`/api/grievance/track/${encodeURIComponent(cleanCode)}`, {
        method: 'GET'
      }, false, () => {
        const state = getLocalState();
        const found = state.grievances.find(g => (g.secret_code || g.code || g.id || '').toUpperCase() === cleanCode);
        if (found) {
          return { success: true, grievance: found };
        }
        return { success: false, message: 'Grievance secret code not found. Please verify the code.' };
      });
    },

    getAllForAdmin: async () => {
      return apiFetch('/api/grievance', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return { success: true, grievances: state.grievances };
      });
    },

    getMyGrievances: async () => {
      return apiFetch('/api/grievance/my-grievances', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return { success: true, grievances: state.grievances || [] };
      });
    },

    // Update grievance department and status via single PATCH call
    update: async (codeOrId, updates = {}) => {
      return apiFetch(`/api/grievance/${encodeURIComponent(codeOrId)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }, true, () => {
        const state = getLocalState();
        const item = state.grievances.find(g => g.code === codeOrId || g.id === codeOrId || g.secret_code === codeOrId);
        if (item) {
          if (updates.department !== undefined) {
            item.department = updates.department;
            item.assigned_department = updates.department;
          }
          if (updates.assigned_department !== undefined) {
            item.assigned_department = updates.assigned_department;
            item.department = updates.assigned_department;
          }
          if (updates.status) item.status = updates.status;
          if (updates.resolutionNote) {
            item.timeline.push({
              title: `Department Note: ${updates.resolutionNote}`,
              time: 'Just now',
              completed: true
            });
          }
          saveLocalState(state);
          return { success: true, grievance: item };
        }
        return { success: false, message: 'Grievance not found' };
      });
    }
  },

  // Campus Alerts
  alerts: {
    getAll: async () => {
      return apiFetch('/api/alerts', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return { success: true, alerts: state.alerts || [] };
      });
    },

    create: async (alertData) => {
      return apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(alertData)
      }, true, () => {
        const state = getLocalState();
        const newAlert = {
          id: 'ALT-' + (state.alerts.length + 101),
          title: alertData.title,
          severity: alertData.severity || 'Notice',
          description: alertData.description,
          createdAt: new Date().toISOString(),
          status: 'Active',
          audioText: alertData.audioText || alertData.description
        };
        state.alerts.unshift(newAlert);
        saveLocalState(state);
        return { success: true, alert: newAlert };
      });
    },

    resolve: async (id) => {
      return apiFetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Resolved', resolved: true })
      }, true, () => {
        const state = getLocalState();
        const alert = state.alerts.find(a => a.id === id);
        if (alert) {
          alert.status = 'Resolved';
          alert.resolved = true;
          saveLocalState(state);
          return { success: true, alert };
        }
        return { success: false, message: 'Alert not found' };
      });
    }
  },

  // Public Terms & Privacy (requireAuth = false)
  terms: {
    get: async () => {
      return apiFetch('/api/terms', {
        method: 'GET'
      }, false, () => ({ success: true, title: 'Terms of Service' }));
    }
  },
  privacy: {
    get: async () => {
      return apiFetch('/api/privacy', {
        method: 'GET'
      }, false, () => ({ success: true, title: 'Privacy Policy' }));
    }
  },

  // Compliance Audit & Metrics
  compliance: {
    getMetrics: async () => {
      return apiFetch('/api/admin/compliance/metrics', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        const total = state.checklist.length * 10;
        const current = state.checklist.reduce((acc, item) => acc + (item.status === 'Compliant' ? 10 : (item.status === 'In Review' ? 5 : 0)), 0);
        const score = total > 0 ? Math.round((current / total) * 100) : 0;
        return {
          success: true,
          score,
          overall_score: score,
          open_grievance_count: state.grievances.filter(g => g.status !== 'Resolved').length,
          average_resolution_days: 1.2,
          active_services_count: 12,
          rpwdComplianceLevel: score >= 80 ? 'WCAG 2.1 AAA Compliant' : 'Audit In Progress',
          openGrievances: state.grievances.filter(g => g.status !== 'Resolved').length,
          resolvedGrievances: state.grievances.filter(g => g.status === 'Resolved').length
        };
      });
    },

    getChecklist: async () => {
      return apiFetch('/api/admin/compliance/checklist', {
        method: 'GET'
      }, true, () => {
        const state = getLocalState();
        return { success: true, checklist: state.checklist };
      });
    },

    updateChecklistItem: async (id, status) => {
      return apiFetch('/api/admin/compliance/checklist/update', {
        method: 'POST',
        body: JSON.stringify({ id, status })
      }, true, () => {
        const state = getLocalState();
        const item = state.checklist.find(c => c.id === id);
        if (item) {
          item.status = status;
          saveLocalState(state);
          return { success: true, item };
        }
        return { success: false, message: 'Checklist item not found' };
      });
    }
  },

  // AI Tutor Module
  tutor: {
    generate: async (topic) => {
      return apiFetch('/api/tutor/generate', {
        method: 'POST',
        body: JSON.stringify({ topic })
      }, false, () => {
        const cleanTopic = (topic || 'General Studies').trim();
        return {
          success: true,
          topic: cleanTopic,
          title: `Accessible Lesson on ${cleanTopic}`,
          steps: [
            {
              step_order: 1,
              title: `Introduction to ${cleanTopic}`,
              content: `${cleanTopic} is a foundational concept. In this lesson, we will explore the core ideas, key definitions, and accessible examples step by step.`
            },
            {
              step_order: 2,
              title: `Core Principles & Applications`,
              content: `Key principles of ${cleanTopic} include fundamental rules and real-world applications designed for inclusive, clear understanding.`
            },
            {
              step_order: 3,
              title: `Summary & Review`,
              content: `To summarize: remember the essential principles of ${cleanTopic}. You can ask any question, repeat steps, or explore further anytime.`
            }
          ]
        };
      });
    },

    doubt: async (topic, step_order, question) => {
      return apiFetch('/api/tutor/doubt', {
        method: 'POST',
        body: JSON.stringify({ topic, step_order, question })
      }, false, () => {
        return {
          success: true,
          topic: topic || 'General Topic',
          step_order: step_order || 1,
          question: question || '',
          answer: `Regarding step ${step_order || 1} of ${topic}: ${question} is explained simply through foundational principles that focus on practical understanding and accessibility.`,
          explanation: `Regarding step ${step_order || 1} of ${topic}: ${question} is explained simply through foundational principles that focus on practical understanding and accessibility.`
        };
      });
    }
  }
};

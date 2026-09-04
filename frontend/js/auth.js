/**
 * Saksham Setu Authentication & Accessibility Settings Manager
 */
import { api } from './api.js';
import { voice } from './voice.js';

export const auth = {
  login: async (email, password, role = 'student', fallbackCategory = 'voice') => {
    try {
      // NOTE: account creation is assumed to happen via POST /api/auth/register elsewhere, or via admin-side provisioning — this form assumes an existing account and does not handle signup.
      const res = await api.auth.login(email, password, role, fallbackCategory);
      if (res.success || res.token || res.user) {
        // Save user session
        const token =
          res.token ||
          res.access_token ||
          res.user?.token ||
          res.user?.access_token;

        const userObj = {
          ...(res.user || {}),
          email: res.user?.email || email,
          role: res.user?.role || role,
          disability_category:
            res.disability_category ||
            res.user?.disability_category ||
            fallbackCategory,
          token: token
        };

        localStorage.setItem('saksham_user', JSON.stringify(userObj));
        if (role === 'admin' || (userObj.role === 'admin')) {
          window.location.href = 'admin-dashboard.html';
        } else {
          // Read disability_category from the response payload (or client fallback)
          const payloadCategory = (
            res.disability_category ||
            (res.user && res.user.disability_category) ||
            res.disabilityCategory ||
            (res.user && res.user.disabilityCategory) ||
            ''
          ).toLowerCase();

          if (payloadCategory.includes('voice') || payloadCategory.includes('dyslex') || payloadCategory.includes('blind')) {
            // Voice student portal
            window.location.href = 'student-visual-dyslexic.html';
          } else if (payloadCategory.includes('hearing') || payloadCategory.includes('physical') || payloadCategory.includes('motor') || payloadCategory.includes('visual')) {
            // Visual and physical student dashboard
            window.location.href = 'student-hearing-physical.html';
          } else {
            // Client selection fallback based on radio selection
            if (fallbackCategory === 'voice' || fallbackCategory === 'dyslexic' || fallbackCategory === 'blind') {
              window.location.href = 'student-visual-dyslexic.html';
            } else {
              window.location.href = 'student-hearing-physical.html';
            }
          }
        }
        return res;
      }
    } catch (err) {
      console.error('Login error', err);
      throw err;
    }
  },

  getUser: () => {
    return api.auth.getCurrentUser();
  },

  logout: () => {
    api.auth.logout();
    window.location.href = 'index.html';
  },

  // Accessibility Presets & Global Controller
  initAccessibility: () => {
    const saved = localStorage.getItem('saksham_a11y_prefs');
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        if (prefs.dyslexic) {
          document.documentElement.classList.add('mode-dyslexic');
          document.body.classList.add('mode-dyslexic');
        } else {
          document.documentElement.classList.remove('mode-dyslexic');
          document.body.classList.remove('mode-dyslexic');
        }

        if (prefs.highContrast) {
          document.documentElement.classList.add('mode-high-contrast');
          document.body.classList.add('mode-high-contrast');
        } else {
          document.documentElement.classList.remove('mode-high-contrast');
          document.body.classList.remove('mode-high-contrast');
        }

        document.documentElement.classList.remove('mode-text-medium', 'mode-text-max', 'mode-text-large', 'mode-text-xlarge');
        document.body.classList.remove('mode-text-medium', 'mode-text-max', 'mode-text-large', 'mode-text-xlarge');

        if (prefs.textSize === 'medium' || prefs.textSize === 'large') {
          document.documentElement.classList.add('mode-text-medium');
          document.body.classList.add('mode-text-medium');
        } else if (prefs.textSize === 'max' || prefs.textSize === 'xlarge') {
          document.documentElement.classList.add('mode-text-max');
          document.body.classList.add('mode-text-max');
        }
      } catch (e) {
        console.error('Error parsing accessibility preferences', e);
      }
    }

    auth.bindA11yButtons();
    auth.updateA11yUiIndicators();
  },

  bindA11yButtons: () => {
    // Single global binding per button instance
    document.querySelectorAll('#btn-dyslexia, .btn-dyslexia, [data-a11y="dyslexia"]').forEach(btn => {
      if (!btn.dataset.a11yBound) {
        btn.dataset.a11yBound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          auth.toggleDyslexicMode();
        });
      }
    });

    document.querySelectorAll('#btn-contrast, .btn-contrast, [data-a11y="contrast"]').forEach(btn => {
      if (!btn.dataset.a11yBound) {
        btn.dataset.a11yBound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          auth.toggleHighContrast();
        });
      }
    });

    document.querySelectorAll('#btn-text-size, .btn-text-size, [data-a11y="text-size"]').forEach(btn => {
      if (!btn.dataset.a11yBound) {
        btn.dataset.a11yBound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          auth.cycleTextSize();
        });
      }
    });
  },

  toggleDyslexicMode: () => {
    const isCurrentlyDyslexic = document.documentElement.classList.contains('mode-dyslexic');
    if (isCurrentlyDyslexic) {
      document.documentElement.classList.remove('mode-dyslexic');
      document.body.classList.remove('mode-dyslexic');
    } else {
      document.documentElement.classList.add('mode-dyslexic');
      document.body.classList.add('mode-dyslexic');
    }
    auth.saveA11yPrefs();
    auth.updateA11yUiIndicators();
  },

  toggleHighContrast: () => {
    const isCurrentlyContrast = document.documentElement.classList.contains('mode-high-contrast');
    if (isCurrentlyContrast) {
      document.documentElement.classList.remove('mode-high-contrast');
      document.body.classList.remove('mode-high-contrast');
    } else {
      document.documentElement.classList.add('mode-high-contrast');
      document.body.classList.add('mode-high-contrast');
    }
    auth.saveA11yPrefs();
    auth.updateA11yUiIndicators();
  },

  // 3-step bounded text sizing: Normal (100%) -> Medium (112%) -> Max (125% Upper Limit) -> Normal (100%)
  cycleTextSize: () => {
    const isMax = document.documentElement.classList.contains('mode-text-max') || document.body.classList.contains('mode-text-max') || document.documentElement.classList.contains('mode-text-xlarge');
    const isMed = document.documentElement.classList.contains('mode-text-medium') || document.body.classList.contains('mode-text-medium') || document.documentElement.classList.contains('mode-text-large');

    // Clean all classes
    document.documentElement.classList.remove('mode-text-medium', 'mode-text-max', 'mode-text-large', 'mode-text-xlarge');
    document.body.classList.remove('mode-text-medium', 'mode-text-max', 'mode-text-large', 'mode-text-xlarge');

    if (isMax) {
      // Step 3 (Max) -> Step 1 (Normal 100%)
      // Stays default
    } else if (isMed) {
      // Step 2 (Medium 112%) -> Step 3 (Max 125% Upper Limit)
      document.documentElement.classList.add('mode-text-max');
      document.body.classList.add('mode-text-max');
    } else {
      // Step 1 (Normal 100%) -> Step 2 (Medium 112%)
      document.documentElement.classList.add('mode-text-medium');
      document.body.classList.add('mode-text-medium');
    }
    auth.saveA11yPrefs();
    auth.updateA11yUiIndicators();
  },

  updateA11yUiIndicators: () => {
    const isMax = document.documentElement.classList.contains('mode-text-max') || document.body.classList.contains('mode-text-max');
    const isMed = document.documentElement.classList.contains('mode-text-medium') || document.body.classList.contains('mode-text-medium');
    const isDyslexic = document.documentElement.classList.contains('mode-dyslexic') || document.body.classList.contains('mode-dyslexic');
    const isContrast = document.documentElement.classList.contains('mode-high-contrast') || document.body.classList.contains('mode-high-contrast');
    
    // Update Text Size labels and active styling
    document.querySelectorAll('#btn-text-size, .btn-text-size, [data-a11y="text-size"]').forEach(btn => {
      if (isMax) {
        btn.textContent = 'Text Size (Max 125%)';
        btn.classList.add('bg-blue-600', 'text-white');
      } else if (isMed) {
        btn.textContent = 'Text Size (112%)';
        btn.classList.add('bg-blue-600', 'text-white');
      } else {
        btn.textContent = 'Text Size';
        btn.classList.remove('bg-blue-600', 'text-white');
      }
    });

    // Update Dyslexia active pill indicator
    document.querySelectorAll('#btn-dyslexia, .btn-dyslexia, [data-a11y="dyslexia"]').forEach(btn => {
      if (isDyslexic) {
        btn.classList.add('bg-blue-600', 'text-white');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
      }
    });

    // Update Contrast active pill indicator
    document.querySelectorAll('#btn-contrast, .btn-contrast, [data-a11y="contrast"]').forEach(btn => {
      if (isContrast) {
        btn.classList.add('bg-yellow-400', 'text-black', 'border-yellow-400');
      } else {
        btn.classList.remove('bg-yellow-400', 'text-black', 'border-yellow-400');
      }
    });
  },

  saveA11yPrefs: () => {
    const isMax = document.documentElement.classList.contains('mode-text-max') || document.body.classList.contains('mode-text-max');
    const isMed = document.documentElement.classList.contains('mode-text-medium') || document.body.classList.contains('mode-text-medium');
    const prefs = {
      dyslexic: document.documentElement.classList.contains('mode-dyslexic') || document.body.classList.contains('mode-dyslexic'),
      highContrast: document.documentElement.classList.contains('mode-high-contrast') || document.body.classList.contains('mode-high-contrast'),
      textSize: isMax ? 'max' : (isMed ? 'medium' : 'normal')
    };
    localStorage.setItem('saksham_a11y_prefs', JSON.stringify(prefs));
  }
};

// Automatically initialize accessibility across every page as soon as script loads or DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => auth.initAccessibility());
  } else {
    auth.initAccessibility();
  }
}

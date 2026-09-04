---
name: ClearPath Universal
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#424751'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#727782'
  outline-variant: '#c2c6d2'
  surface-tint: '#255fa6'
  primary: '#003469'
  on-primary: '#ffffff'
  primary-container: '#004b91'
  on-primary-container: '#95bdff'
  inverse-primary: '#a7c8ff'
  secondary: '#046d3f'
  on-secondary: '#ffffff'
  secondary-container: '#9af3b8'
  on-secondary-container: '#0f7142'
  tertiary: '#5c2400'
  on-tertiary: '#ffffff'
  tertiary-container: '#7f3502'
  on-tertiary-container: '#ffa678'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#004689'
  secondary-fixed: '#9df5bb'
  secondary-fixed-dim: '#81d9a0'
  on-secondary-fixed: '#00210f'
  on-secondary-fixed-variant: '#00522e'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb691'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#793100'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  high-contrast-text: '#1A1A1A'
  border-dark: '#333333'
  emergency-red: '#D92D20'
  focus-indicator: '#FFD600'
  voice-active: '#004B91'
  visual-active: '#006B3D'
typography:
  headline-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  label-bold:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 16px
    fontWeight: '700'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  code-display:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1'
    letterSpacing: 0.1em
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  touch-target-min: 56px
  container-max: 1200px
---

## Brand & Style

This design system is built for **extreme accessibility** and clarity in an educational context for specially-abled children. The brand personality is professional, reliable, and profoundly functional. It avoids all decorative trends—such as glassmorphism, shadows, or gradients—to ensure that users with cognitive, visual, or physical impairments can navigate the interface without distraction or sensory overload.

The style is **Strict Minimalism**. It utilizes a high-contrast visual language where hierarchy is established solely through typography, scale, and solid color blocks. The objective is to provide a "quiet" interface that empowers the user, whether they are interacting via voice commands or high-visibility touch targets.

**Design Principles:**
- **Zero Ambiguity:** Every element has a clear purpose; no decorative icons or flourishes.
- **High Contrast:** All text must meet or exceed WCAG AAA standards.
- **Predictability:** Layouts are rigid and consistent across different portals to reduce cognitive load.

## Colors

The palette is restricted to high-readability, professional tones. **Pure White (#FFFFFF)** is the mandatory background for all surfaces to ensure maximum contrast and eliminate depth-based confusion. 

- **Primary (Blue):** Used for the "Voice-First" student portal and general navigation. It provides a calm, authoritative anchor.
- **Secondary (Green):** Used for the "Visual-Text" portal. It signifies progress and clarity.
- **Emergency:** A high-visibility red reserved exclusively for urgent help actions.
- **Neutral:** Text is kept at a near-black (#1A1A1A) rather than pure black to reduce "halation" for dyslexic readers while maintaining maximum contrast against the white background.

**Color Usage Rules:**
- No gradients.
- No transparency or opacity shifts.
- Focus states must use the high-visibility yellow (#FFD600) with a minimum 4px solid border.

## Typography

The design system uses **Atkinson Hyperlegible Next** for all roles. This typeface was specifically designed to increase legibility for readers with low vision by making character shapes highly distinguishable.

**Implementation Rules:**
- **Alignment:** All text must be left-aligned. Never justify text, as uneven spacing (rivers) creates difficulty for dyslexic users.
- **Line Height:** Maintain a generous line height (1.6x for body text) to prevent lines from blurring together.
- **Paragraphs:** Use vertical spacing between paragraphs instead of indentations.
- **Emphasis:** Use **Bold** for emphasis. Never use *italics* or Underlines (except for links), as they distort letter shapes.

## Layout & Spacing

The layout follows a **Rigid Fixed Grid** on desktop and a single-column fluid flow on mobile. There are no overlapping elements or complex layering.

- **Grid:** A 12-column grid for desktop with 24px gutters. Elements must snap to grid lines.
- **Visual-Text Portal:** Content is centered in a max-width container (1200px) to prevent long line lengths that are difficult to track.
- **Voice-First Portal:** Uses a large, centralized "Information Block" model. Only one primary action or piece of information is shown at a time to keep focus on the audio interaction.
- **Touch Targets:** All interactive elements must be a minimum of 56px x 56px to accommodate users with motor impairments.
- **Breakpoints:**
  - Mobile: Under 600px (Single column, 16px margins).
  - Tablet: 600px - 1024px (8 column grid, 32px margins).
  - Desktop: Over 1024px (12 column grid).

## Elevation & Depth

This system uses **Flat Construction**. There is no Z-axis depth communicated through shadows or blurs. Hierarchy is established strictly through:

1.  **Borders:** Use solid 2px or 4px borders (#333333) to define card boundaries and input fields.
2.  **Color Blocking:** Important banners or callouts use solid primary or secondary background colors with white text.
3.  **Scale:** Significant information (like grievance secret codes) is displayed at massive scale (48px+) to ensure it is the first thing perceived.
4.  **Padding:** Large white-space buffers are used to group related items, rather than using boxes-within-boxes.

## Shapes

All UI elements use **Sharp Corners (0px radius)**. This reinforces the professional, structural nature of the system and ensures that high-contrast borders remain crisp on all screen types.

- **Buttons:** Rectangular with solid borders.
- **Inputs:** Rectangular with a 2px solid border.
- **Cards:** Defined by a 1px or 2px solid border, never a shadow.
- **Status Indicators:** Use square blocks of color or clear text labels (e.g., "STATUS: ACTIVE") rather than circular dots.

## Components

### Buttons
- **Primary:** Solid Primary Blue or Secondary Green background with White text. Sharp corners.
- **Emergency:** Solid Emergency Red. Must include a clear text label "EMERGENCY HELP".
- **State:** No hover effects. Active/Pressed states are indicated by a color inversion (White background, colored border/text).

### Inputs & Forms
- **Fields:** 2px solid #333333 border. Labels must always be visible above the field (never use placeholder text as a label).
- **Focus State:** 4px solid #FFD600 (Yellow) outer ring.
- **Checkboxes/Radios:** Use large square boxes (minimum 32px). Checkmarks are replaced by a solid interior fill or a simple "-" dash when selected.

### Student Portals
- **Voice-First (Visual-Dyslexic):** Features a massive "Microphone" status block at the top. Large buttons for secondary actions. High use of "Body-LG" text.
- **Visual-Text (Hearing-Physical):** Heavy use of "Headline-MD" for section headers. All instructions are written as plain text lists.

### Grievance Secret Code
- Displayed in `code-display` typography.
- Encased in a heavy 4px solid black border to isolate it from all other page elements.
- Accompanied by a "Copy Code" button that provides clear "COPIED" text feedback.

### Data Tables (Admin)
- No alternating row colors. Use solid 1px horizontal dividers only.
- Header text must be Bold and all-caps for distinctness.
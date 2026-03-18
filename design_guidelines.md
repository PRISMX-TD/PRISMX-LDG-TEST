# PRISMX Ledger - Design Guidelines

## Design Approach
**Dark Theme Fintech Application**: Modern, premium dark theme inspired by high-end fintech and cryptocurrency applications. Features purple as the primary accent color with subtle gradient effects for a sophisticated look.

## Core Design Principles
1. **Dark-First Design**: Deep blacks and dark grays provide a premium feel and reduce eye strain
2. **Purple Accent System**: Vibrant purple (#8B5CF6) as primary color for actions and highlights
3. **Subtle Glow Effects**: Purple aurora/gradient effects add depth and modernity
4. **High Contrast Data**: Financial data stands out clearly against dark backgrounds
5. **Minimal Borders**: Use subtle borders or background differences to define areas

## Color System

### Primary Colors
- **Background**: hsl(240 10% 3.9%) - Near black
- **Card Background**: hsl(240 6% 10%) - Dark gray
- **Primary (Purple)**: hsl(263 70% 50%) - Vibrant purple #8B5CF6
- **Primary Foreground**: White

### Semantic Colors
- **Success/Income**: hsl(160 84% 39%) - Green
- **Destructive/Expense**: hsl(0 84% 60%) - Red
- **Transfer**: Purple (same as primary)
- **Muted**: hsl(240 5% 64.9%) - Gray text

### Chart Colors
- Chart 1: Blue (hsl(221 83% 53%))
- Chart 2: Purple (hsl(263 70% 50%))
- Chart 3: Magenta (hsl(280 65% 60%))
- Chart 4: Cyan (hsl(200 80% 50%))
- Chart 5: Pink (hsl(340 75% 55%))

## Typography System
**Font Families**: 
- Primary: Inter (via Google Fonts CDN)
- Fallback: -apple-system, SF Pro, system-ui
- Monospace: Menlo (for numbers)

**Hierarchy**:
- H1 (页面标题): 32px, font-semibold (600)
- H2 (卡片标题): 24px, font-semibold
- H3 (分组标题): 18px, font-medium (500)
- Body (正文): 16px, font-normal (400)
- Small (辅助文字): 14px, font-normal
- Numbers (金额): font-mono for tabular alignment

## Layout & Spacing System
**Tailwind Spacing Units**: Consistently use 4, 6, 8, 12, 16, 24 (p-4, gap-6, mt-8, py-12, px-16, mb-24)

**Container Structure**:
- Max width: max-w-7xl for dashboard
- Section padding: py-8 mobile, py-12 desktop
- Card padding: p-6
- Card gaps in grid: gap-6
- Border radius: rounded-xl (larger) for modern feel

**Grid System**:
- Dashboard: 3-column grid on desktop (lg:grid-cols-3), 1-column mobile
- Stats cards: 2-column on tablet (md:grid-cols-2), 4-column desktop (lg:grid-cols-4)
- Wallet cards: 2-column on tablet (md:grid-cols-2), 3-column desktop (lg:grid-cols-3)

## Component Library

### Special Effects

#### Aurora Background
Use `.aurora-bg` class for pages that need the purple gradient glow effect at the top:
- Creates a subtle purple radial gradient
- Positioned at top of container
- Provides depth and visual interest

#### Purple Glow
- `.purple-glow` - Larger glow for prominent elements
- `.purple-glow-sm` - Subtle glow for smaller elements

#### Gradient Text
`.gradient-text` - Purple to blue gradient text effect for headings

### Cards
- Dark background (bg-card)
- Subtle border (border-card-border)
- Large border radius (rounded-xl)
- Stats cards use `.stats-card` class for special gradient background

### Total Assets Card
- Uses `bg-primary` with `text-primary-foreground`
- Large numeric display (text-4xl, font-mono)
- Purple background with white text

### Transaction Cards
- Dark card background
- Income: Left accent in green
- Expense: Left accent in red
- Transfer: Left accent in purple

### Buttons
- Primary: Purple background, white text
- Ghost: Transparent, subtle hover
- Outline: Border only, hover fills

### Navigation
- Sidebar: Dark background matching overall theme
- Active item: Purple accent background
- Icons: Consistent 20px size

## Interactions & States
**Animations**:
- Card hover: Subtle elevation (use hover-elevate utility)
- Button active: Scale down slightly (scale-95)
- Modal: Fade in backdrop, slide up content (200ms)
- Transitions: 150-200ms duration

**Focus States**: 
- Purple outline ring (ring-2 ring-primary ring-offset-2)
- Clear keyboard navigation support

## Responsive Behavior
**Breakpoints**:
- Mobile (base): Single column, stacked layout
- Tablet (md: 768px): 2-column grids, expanded navigation
- Desktop (lg: 1024px): 3-4 column grids, full dashboard layout

**Mobile Adaptations**:
- Bottom navigation bar
- Full-width cards
- Simplified layouts
- Touch-friendly targets (min 44px)

## Accessibility
- All interactive elements: Minimum 44x44px touch targets
- Form labels: Properly associated with inputs
- Color contrast: WCAG AA compliant (4.5:1 for text)
- Focus indicators: Visible on all interactive elements
- Chinese language: lang="zh-CN" attribute

## Dark Mode
The application defaults to dark mode. Light mode support is maintained but dark mode is the primary design target. All components use CSS variables that adapt to both modes.

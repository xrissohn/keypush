# KeyP Simple Chat Design System

## Product principle
The interface exposes only the user promise: register an intent, receive one recent reference, then receive only genuinely new information. Reasoning engines, routing, evidence pipelines, sandboxes, and debug logs stay outside the main experience.

## Tokens
- Background: `background`, near-white (`#FAFAFA` equivalent).
- Surface: `card`, white.
- Text: `foreground`; secondary copy uses `muted-foreground`.
- Border: `border`, neutral 1px.
- Brand: `brand`, KeyP indigo; use only for primary actions, links, unread dots, and NEW/match accents.
- Positive state: `success` and `success-soft`.
- User bubble: `user-bubble`, a quiet neutral fill.
- Shadows: none by default; popovers may use one small system shadow.

## Typography
- System sans-serif stack.
- Body: 15–16px, line-height 1.5–1.6.
- Main prompt: 32–36px desktop, 30px mobile.
- Titles: 16px semibold. Metadata: 12–13px.
- Never shrink technical metadata into unreadable microcopy.

## Spacing and layout
- Main conversation width: 760px maximum.
- Base spacing: 4px; common gaps: 8, 12, 16, 24, 40px.
- Desktop sidebar: 256px. Mobile uses a drawer.
- Leave generous whitespace between conversation turns; avoid nested cards.

## Radius
- Chat bubbles and finding cards: 16px.
- Inputs and menus: 12–16px.
- Pills: fully rounded only for compact statuses such as NEW and match percentage.

## Components
### Chat bubbles
- User: right aligned, neutral `user-bubble`, maximum 82% width.
- KeyP: left aligned with the KeyP avatar; text is unframed.
- Show a date divider once per conversation day.

### Finding cards
- One white card with a 1px neutral border.
- Header: source, relative time, match pill.
- Body: one-line title, 2–3 line summary.
- “왜 매칭됐나요?” is collapsed by default.
- Footer: at most two source/status badges and one original-link action.
- Baseline label: “최근 참고 정보”. New label: “새로 찾았어요” plus NEW.

### Sidebar
- One “+ 새 알림” action followed by compact watch rows.
- Show a small brand dot for active watches.
- Pause and delete live in the overflow menu.
- No engine status, KPIs, pipeline, or architecture in the sidebar.

### Notifications
- Header bell carries a numeric unread badge.
- Opening the list marks visible queued/sent notifications read.
- Foreground updates use toast; Browser Notification is used only after permission is granted.
- Service worker supports notification clicks. Remote push is not claimed until VAPID/provider configuration exists.

## Responsive behavior
- Desktop (>=1024px): persistent thin sidebar and centered conversation.
- Tablet/mobile: sidebar becomes a left drawer; header remains 64px.
- At 390px, cards and bubbles use the full available width without horizontal scrolling.
- Composer remains reachable and does not cover the latest message.

## Accessibility
- Icon-only controls require Korean accessible labels.
- All controls show keyboard focus through semantic design-system rings.
- Maintain WCAG AA contrast; never encode status by color alone.
- Enter submits; Shift+Enter inserts a newline.
- Respect reduced motion; no required information depends on animation.

## Do
- Keep the promise visible: “새 정보가 생기면 알려드릴게요.”
- Use honest empty states and unknown-time labels.
- Reveal technical evidence only on deliberate expansion or secondary pages.
- Keep brand indigo scarce and meaningful.

## Don’t
- Do not show engine chips, reasoning progress, architecture, logs, or sandbox identifiers on the main screen.
- Do not use gradients, neon, glass effects, KPI dashboards, or stacked cards.
- Do not send baseline references as new notifications.
- Do not invent results, dates, verification, delivery, or background push success.

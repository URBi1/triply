# Monetization Strategist Memory — Triply

## Project: Triply (mobile/)

**Type:** Mobile travel memory app (React Native / Expo)
**Backend:** Node.js/Fastify, SQLite, hosted on Render (triply-api.onrender.com)
**Stage:** MVP / early development, no monetization yet

### Core Features (as built)
- Create trips with date range
- Join trips via 8-char invite code
- Auto-scan camera roll by trip dates (expo-media-library) and bulk upload
- Photos served from own server (thumbnails + full)
- Photo comments
- Polling-based sync (10s interval), SSE planned

### Target Audience
- Travelers 20-35, couples, friend groups, families
- Social/collaborative by design (shared albums)

### Key Monetization Insights (session 2026-03-16)
- Storage cost is the primary infra cost driver — directly tied to photo count and quality
- Viral loop built-in: invite code mechanic means every paid user can bring free users
- High emotional value: travel memories = strong willingness to pay for permanence
- Physical prints are highest-margin standalone product (no infra cost, pure margin)
- B2B angle (travel agencies, wedding photographers) worth exploring post-PMF

### Recommended Strategy (see full analysis)
Primary: Freemium subscription (Pro plan ~$4.99/mo or $39.99/yr)
Quick win: Physical photo books/prints via Printful/Gelato integration
See: triply-monetization.md for full breakdown

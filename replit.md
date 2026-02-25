# ReList Pro

## Overview

ReList Pro is a mobile-first reseller listing tool built with Expo (React Native) and an Express backend. The app allows users to photograph items they want to resell, analyzes the images using OpenAI's vision API, and generates listing drafts with details like brand, category, condition, suggested price, and sell probability. Drafts are stored locally on the device using AsyncStorage and can be managed through a tab-based interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with expo-router for file-based routing
- **Navigation**: Tab-based layout with three tabs — Drafts (list), Analyze (camera/upload), and Settings (API key config). Uses expo-router with typed routes enabled.
- **State Management**: React Query (`@tanstack/react-query`) for server state; local React state for UI state
- **Local Storage**: AsyncStorage for persisting listing drafts and the user's OpenAI API key on-device (`lib/storage.ts`)
- **Styling**: Dark theme with neon cyan accent colors defined in `constants/colors.ts`. Uses Inter font family loaded via `@expo-google-fonts/inter`.
- **Key Libraries**: expo-image-picker for photos, expo-haptics for tactile feedback, react-native-reanimated for animations, expo-clipboard for copy functionality, expo-blur for tab bar effects
- **Data Flow**: User captures/picks an image → image is sent to the Express backend for enhancement and AI analysis → results come back as a `ListingDraft` object → draft is saved to AsyncStorage
- **Type Definitions**: `ListingDraft` interface in `lib/types.ts` defines the core data shape (id, imageUri, brand, category, title, material, condition, description, sellProbability, suggestedPrice, createdAt)

### Backend (Express)

- **Framework**: Express 5 running on Node.js with TypeScript (compiled via tsx in dev, esbuild for production)
- **API Communication**: The frontend calls the backend via `lib/query-client.ts` which constructs URLs using `EXPO_PUBLIC_DOMAIN` environment variable
- **AI Integration**: OpenAI API (via the `openai` npm package) for image analysis and listing generation
- **Image Processing**: Sharp library for image enhancement/optimization on the server side
- **CORS**: Dynamic CORS handling that allows Replit domains and localhost origins for development
- **Storage Layer**: Currently uses in-memory storage (`MemStorage` class in `server/storage.ts`) for user data. The storage interface (`IStorage`) is designed to be swappable.
- **Routes**: Defined in `server/routes.ts` — includes endpoints for image analysis with OpenAI vision and mock analytics generation (sell probability, pricing based on brand/condition)

### Database Schema

- **ORM**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Schema**: Currently minimal — a `users` table with id (UUID), username, and password fields defined in `shared/schema.ts`
- **Validation**: Uses `drizzle-zod` to generate Zod schemas from Drizzle table definitions
- **Note**: The database schema exists but the app currently uses in-memory storage (`MemStorage`). The PostgreSQL database connection requires `DATABASE_URL` environment variable. Run `npm run db:push` to sync schema to database.

### Build & Deployment

- **Development**: Two processes run simultaneously — `expo:dev` for the Expo frontend and `server:dev` for the Express backend
- **Production**: Frontend can be statically built via `expo:static:build`, backend via `server:build` (esbuild), and served with `server:prod`
- **The Express server also serves a landing page** (`server/templates/landing-page.html`) and proxies to Metro bundler in development via `http-proxy-middleware`

## External Dependencies

- **OpenAI API**: Used for vision-based image analysis to identify clothing/item details. Users configure their own API key through the Settings tab, stored locally via AsyncStorage.
- **PostgreSQL**: Database configured via `DATABASE_URL` environment variable. Schema managed with Drizzle ORM and pushed via `drizzle-kit`.
- **Sharp**: Server-side image processing library for enhancing uploaded photos before AI analysis.
- **Replit Environment**: The app is designed to run on Replit, using environment variables like `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, and `REPLIT_INTERNAL_APP_DOMAIN` for URL configuration and CORS.
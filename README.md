# PDF Translator

A fast, production-ready web application built with React, TypeScript, Tailwind CSS, pdf.js, and Google Gemini 2.5 Flash to translate PDF documents of any length into multiple languages page-by-page.

---

## Features

- **Chunked Page-by-Page Processing**: Translates large multi-hundred-page documents without exceeding context limits.
- **Scanned Document OCR Fallback**: Detects scanned pages without text layers and sends them as high-resolution images to Gemini 2.5 Flash for multimodal OCR and translation.
- **Multilingual Unicode & RTL Support**: Accurately shapes Arabic and Urdu (right-to-left layout), Devanagari (Hindi, Marathi), Bengali, Tamil, Telugu, Gujarati, and CJK (Chinese, Japanese, Korean) with Google Noto Sans fonts.
- **Controlled Concurrency & Retries**: Processes requests with a maximum concurrency of 3 parallel requests and automatic exponential backoff retry.
- **Per-Language Progress & Downloads**: Independent progress tracking and instant single-click PDF downloads.

---

## Quick Setup Guide

### 1. Gemini API Key Setup

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set the environment variable in your `.env` file (or system environment):
   ```bash
   GEMINI_API_KEY="your-gemini-api-key-here"
   ```
3. The Express server (`server.ts`) securely reads `process.env.GEMINI_API_KEY` on the backend so your API key is never exposed to the client browser.

---

### 2. Firebase Authentication Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (or select an existing project).
2. In the left navigation bar, go to **Build** > **Authentication**.
3. Click **Get Started** and select the **Sign-in method** tab.
4. Enable **Email/Password** provider and click **Save**.
5. Go to **Project Settings** (gear icon) > **General**.
6. Under **Your apps**, click the **Web** icon (`</>`), register your app, and copy the `firebaseConfig` keys.
7. Add the configuration to your `.env` file:
   ```bash
   VITE_FIREBASE_API_KEY="AIzaSy..."
   VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="your-app-id"
   VITE_FIREBASE_STORAGE_BUCKET="your-app-id.appspot.com"
   VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
   VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
   ```

*(Note: If Firebase credentials are not yet configured, the app automatically runs in local development mode so you can test all features and workflows immediately).*

---

### 3. Running the Application

```bash
# Install dependencies (if not already installed)
npm install

# Start the full-stack server (runs on port 3000)
npm run dev

# Or build for production
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

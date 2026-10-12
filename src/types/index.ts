export interface Language {
  code: string;
  name: string;
  nativeName: string;
  isRTL?: boolean;
  fontFamily: string;
}

export type JobStatus = 'idle' | 'extracting' | 'translating' | 'generating_pdf' | 'completed' | 'error';

export interface LanguageTranslationState {
  language: Language;
  status: JobStatus;
  currentPage: number;
  totalPages: number;
  error?: string;
  downloadUrl?: string;
  pdfBlob?: Blob;
  outputFileName?: string;
  fileSizeBytes?: number;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  isScanned: boolean;
  imageBase64?: string;
  width: number;
  height: number;
}

export interface TranslatedPage {
  pageNumber: number;
  translatedText: string;
  isScanned: boolean;
  width: number;
  height: number;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_LANGUAGES } from '../lib/languages';
import { getPDFPageCount } from '../lib/pdfReader';
import { runTranslationPipeline } from '../lib/translator';
import { LanguageTranslationState } from '../types';
import {
  FileText,
  UploadCloud,
  LogOut,
  AlertCircle,
  Download,
  Loader2,
  X,
  FileCheck,
  Search,
  Globe,
  Ban,
  Check,
} from 'lucide-react';

export const TranslatePage: React.FC = () => {
  const { user, logout } = useAuth();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [isReadingPdf, setIsReadingPdf] = useState<boolean>(false);
  const [pdfReadError, setPdfReadError] = useState<string | null>(null);

  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([
    'es',
    'hi',
  ]);
  const [searchQuery, setSearchQuery] = useState('');

  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationStates, setTranslationStates] = useState<
    Record<string, LanguageTranslationState>
  >({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up Object URLs when unmounting or selecting new file
  useEffect(() => {
    return () => {
      Object.values(translationStates).forEach((st) => {
        if (st.downloadUrl) {
          URL.revokeObjectURL(st.downloadUrl);
        }
      });
    };
  }, [translationStates]);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle file selection
  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setPdfReadError('Please select a valid PDF file.');
      return;
    }

    setPdfReadError(null);
    setSelectedFile(file);
    setIsReadingPdf(true);
    setTranslationStates({});
    setGlobalError(null);

    try {
      const pages = await getPDFPageCount(file);
      setTotalPages(pages);
    } catch {
      setPdfReadError(
        'Could not read the PDF structure. Please verify the file is not corrupted or password-protected.'
      );
      setSelectedFile(null);
      setTotalPages(0);
    } finally {
      setIsReadingPdf(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    isDraggingRef.current = false;
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Language selection toggles
  const toggleLanguage = (code: string) => {
    if (isTranslating) return;
    setSelectedLanguageCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const selectAllLanguages = () => {
    if (isTranslating) return;
    setSelectedLanguageCodes(SUPPORTED_LANGUAGES.map((l) => l.code));
  };

  const clearLanguages = () => {
    if (isTranslating) return;
    setSelectedLanguageCodes([]);
  };

  // Filtered languages for selector
  const filteredLanguages = SUPPORTED_LANGUAGES.filter((lang) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      lang.name.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q)
    );
  });

  // Start translation pipeline
  const handleStartTranslation = async () => {
    if (!selectedFile || totalPages === 0 || selectedLanguageCodes.length === 0) {
      return;
    }

    setIsTranslating(true);
    setGlobalError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const targetLanguages = SUPPORTED_LANGUAGES.filter((l) =>
      selectedLanguageCodes.includes(l.code)
    );

    // Initialize states
    const initialStates: Record<string, LanguageTranslationState> = {};
    for (const lang of targetLanguages) {
      initialStates[lang.code] = {
        language: lang,
        status: 'translating',
        currentPage: 0,
        totalPages,
      };
    }
    setTranslationStates(initialStates);

    try {
      await runTranslationPipeline(
        selectedFile,
        totalPages,
        targetLanguages,
        (langCode, update) => {
          setTranslationStates((prev) => ({
            ...prev,
            [langCode]: {
              ...prev[langCode],
              ...update,
            },
          }));
        },
        controller.signal
      );
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setGlobalError(err.message || 'An error occurred during translation.');
      }
    } finally {
      setIsTranslating(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel in-flight translation
  const handleCancelTranslation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsTranslating(false);
    }
  };

  // Single file download
  const handleDownload = (state: LanguageTranslationState) => {
    if (!state.downloadUrl) return;
    const a = document.createElement('a');
    a.href = state.downloadUrl;
    a.download = state.outputFileName || `translated_${state.language.name.toLowerCase()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download all completed translations
  const completedStates = Object.values(translationStates).filter(
    (st) => st.status === 'completed' && st.downloadUrl
  );

  const handleDownloadAll = () => {
    completedStates.forEach((st, idx) => {
      setTimeout(() => {
        handleDownload(st);
      }, idx * 300);
    });
  };

  const hasAnyResults = Object.keys(translationStates).length > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-lg">
                PDF Translator
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Gemini 2.5 Flash
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-medium text-slate-800">
                {user?.displayName || 'User'}
              </span>
              <span className="text-xs text-slate-500 truncate max-w-[180px]">
                {user?.email}
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition cursor-pointer"
              title="Sign out of your account"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Step 1: Upload Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">
                  1
                </span>
                Upload PDF Document
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Upload any document — short memos or multi-hundred page documents.
              </p>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFile(e.target.files[0]);
              }
            }}
            accept="application/pdf,.pdf"
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/50'
                  : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-slate-800">
                Click to upload or drag & drop your PDF
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports native text and scanned pages (processed page-by-page)
              </p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                  <FileCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm sm:text-base break-all">
                    {selectedFile.name}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    <span>{formatBytes(selectedFile.size)}</span>
                    <span>•</span>
                    {isReadingPdf ? (
                      <span className="flex items-center gap-1 text-indigo-600 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Analyzing pages...
                      </span>
                    ) : (
                      <span className="font-medium text-slate-700">
                        {totalPages} {totalPages === 1 ? 'page' : 'pages'} detected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isTranslating}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-white border border-slate-200 hover:border-indigo-300 rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  Change file
                </button>
                <button
                  type="button"
                  disabled={isTranslating}
                  onClick={() => {
                    setSelectedFile(null);
                    setTotalPages(0);
                    setTranslationStates({});
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition disabled:opacity-50 cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {pdfReadError && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{pdfReadError}</span>
            </div>
          )}
        </section>

        {/* Step 2: Language Selection Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">
                  2
                </span>
                Choose Target Languages
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Select one or more languages. Each translation is generated with dedicated Unicode fonts and RTL layout.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isTranslating}
                onClick={selectAllLanguages}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={isTranslating}
                onClick={clearLanguages}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search languages by name or native script (e.g. Arabic, Hindi, 日本語)..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>

          {/* Languages Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
            {filteredLanguages.map((lang) => {
              const isSelected = selectedLanguageCodes.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  disabled={isTranslating}
                  onClick={() => toggleLanguage(lang.code)}
                  className={`text-left p-2.5 rounded-xl border text-sm transition relative cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-semibold ring-1 ring-indigo-500 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="truncate text-xs font-semibold">{lang.name}</span>
                    {lang.isRTL && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                        RTL
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate" style={{ fontFamily: lang.fontFamily }}>
                    {lang.nativeName}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {selectedLanguageCodes.length} of {SUPPORTED_LANGUAGES.length} languages selected
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Globe className="w-3.5 h-3.5" />
              Full Unicode & Noto Sans font shaping
            </span>
          </div>
        </section>

        {/* Step 3: Action Button & Controls */}
        <section className="flex flex-col items-center">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleStartTranslation}
              disabled={
                !selectedFile ||
                totalPages === 0 ||
                selectedLanguageCodes.length === 0 ||
                isTranslating ||
                isReadingPdf
              }
              className="flex-1 sm:flex-initial min-w-[240px] px-8 py-3.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 shadow-md shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition text-base cursor-pointer"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Translating... (Max 3 Parallel)
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Translate PDF {selectedLanguageCodes.length > 0 && `(${selectedLanguageCodes.length} ${selectedLanguageCodes.length === 1 ? 'Language' : 'Languages'})`}
                </>
              )}
            </button>

            {isTranslating && (
              <button
                type="button"
                onClick={handleCancelTranslation}
                className="px-4 py-3.5 rounded-xl font-medium text-slate-700 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 transition flex items-center gap-2 text-sm cursor-pointer"
              >
                <Ban className="w-4 h-4 text-red-500" />
                Cancel
              </button>
            )}
          </div>

          {(!selectedFile || selectedLanguageCodes.length === 0) && (
            <p className="text-xs text-slate-500 mt-2">
              {!selectedFile
                ? 'Please upload a PDF document to begin.'
                : 'Please select at least one target language.'}
            </p>
          )}

          {globalError && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm max-w-xl w-full">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Translation Error</p>
                <p className="mt-0.5">{globalError}</p>
              </div>
            </div>
          )}
        </section>

        {/* Step 4: Progress & Download Area */}
        {hasAnyResults && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Translation Progress & Downloads
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Processed page by page. Download your translated PDF as soon as each language finishes.
                </p>
              </div>

              {completedStates.length > 1 && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg transition cursor-pointer self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download All ({completedStates.length})
                </button>
              )}
            </div>

            <div className="space-y-4 pt-2">
              {Object.values(translationStates).map((state) => {
                const percent =
                  state.totalPages > 0
                    ? Math.round((state.currentPage / state.totalPages) * 100)
                    : 0;

                const isCompleted = state.status === 'completed';
                const isError = state.status === 'error';
                const isGeneratingPdf = state.status === 'generating_pdf';

                return (
                  <div
                    key={state.language.code}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                          {state.language.code.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                            <span>{state.language.name}</span>
                            <span className="text-slate-400 font-normal">
                              ({state.language.nativeName})
                            </span>
                            {state.language.isRTL && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded">
                                RTL
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {isCompleted && 'Ready for download'}
                            {isGeneratingPdf && 'Building final Unicode PDF document...'}
                            {state.status === 'translating' &&
                              `Translating page ${state.currentPage} of ${state.totalPages}`}
                            {isError && 'Translation failed for this language'}
                          </div>
                        </div>
                      </div>

                      {/* Download or Status Button */}
                      <div>
                        {isCompleted && (
                          <button
                            type="button"
                            onClick={() => handleDownload(state)}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            Download {state.language.name} PDF
                            {state.fileSizeBytes && (
                              <span className="text-emerald-200 text-[11px] ml-1">
                                ({formatBytes(state.fileSizeBytes)})
                              </span>
                            )}
                          </button>
                        )}

                        {isError && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}

                        {(state.status === 'translating' || isGeneratingPdf) && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {isGeneratingPdf ? 'Compiling PDF' : `${percent}%`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-2">
                      <div
                        className={`h-2 transition-all duration-300 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : isError
                            ? 'bg-red-500'
                            : 'bg-indigo-600'
                        }`}
                        style={{
                          width: `${isCompleted ? 100 : Math.max(percent, 5)}%`,
                        }}
                      />
                    </div>

                    {/* Error Detail Display */}
                    {isError && state.error && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                        {state.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

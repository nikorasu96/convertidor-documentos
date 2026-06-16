/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAX_FILE_SIZE?: string;
  readonly VITE_MAX_FILES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

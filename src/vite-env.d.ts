/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENSKY_USERNAME?: string;
  readonly VITE_OPENSKY_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


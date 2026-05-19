interface ImportMetaEnv {
  readonly VITE_BACKEND?: "local" | "aws" | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

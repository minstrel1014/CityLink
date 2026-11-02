export {};
declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  }
  interface Window {
    __MANUS_CONFIG__?: {
      projectId: string;
      oauthPortalUrl: string;
      apiUrl: string;
      apiBrowserKey: string;
    };
  }
}

// Electron preload（apps/desktop/preload.cjs）が公開するブリッジの型

interface McpBridgeRequest {
  id: number;
  op: string;
  args: Record<string, unknown>;
}

interface McpBridgeResponse {
  id: number;
  result?: unknown;
  error?: string;
}

interface DrawDesktopBridge {
  listTemplates(): Promise<{ name: string; json: string }[]>;
  listThemes(): Promise<{ name: string; json: string }[]>;
  getDocsPath(): Promise<string>;
  /** 更新確認（channel: 'main' | 'dev'） */
  checkUpdate(channel: 'main' | 'dev'): Promise<
    { current: string; latest: string; isNewer: boolean; url: string; name: string } | { error: string } | null
  >;
  platform: string;
  electronVersion: string;
  onMcpRequest?: (callback: (msg: McpBridgeRequest) => void) => void;
  sendMcpResponse?: (msg: McpBridgeResponse) => void;
  setMcpHost?: (enabled: boolean, port: number) => void;
}

interface Window {
  drawDesktop?: DrawDesktopBridge;
}

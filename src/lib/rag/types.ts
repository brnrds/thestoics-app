export type RAGSource = {
  source: string;
  excerpt: string;
  page?: number | null;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RAGChatRequest = {
  message: string;
  conversation_id?: string;
  history?: HistoryMessage[];
  use_rag: boolean;
  model?: string;
  config_a?: {
    use_rag?: boolean;
    temperature?: number;
    k?: number;
    model?: string;
    system_prompt_override?: string;
  };
};

export type RAGChatResponse = {
  response: string;
  sources: RAGSource[];
  conversation_id?: string;
};

export type RAGStreamEvent = {
  type: "token" | "sources" | "done" | "error";
  content?: string | RAGSource[] | null;
};

export type RAGSource = {
  source: string;
  excerpt: string;
  page?: number | null;
};

export type RAGRetrieveRequest = {
  query: string;
  k?: number;
  score_threshold?: number;
};

export type RAGRetrieveResponse = {
  query: string;
  context: string;
  sources: RAGSource[];
  match_count: number;
};

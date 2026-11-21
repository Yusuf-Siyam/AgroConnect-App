export type AiLanguage = 'bn' | 'en';

export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  userId: string;
  messages: ChatMessage[];
  language: AiLanguage;
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationList = {
  items: Conversation[];
  total: number;
  limit: number;
  offset: number;
};

export type ChatResult = {
  conversation: Conversation;
  reply: ChatMessage;
  language: AiLanguage;
};

export type CropDiseaseResult = {
  label: string;
  confidence: number;
  alternatives: string[];
};

export type DiagnosisStatus = 'uncertain' | 'possible' | 'likely';

export type Diagnosis = {
  id: string;
  userId: string;
  imagePath: string;
  cropName?: string;
  confidence: number;
  status: DiagnosisStatus;
  result: CropDiseaseResult;
  advisoryNotice: string;
  guidance?: string;
  language: AiLanguage;
  createdAt: string;
  updatedAt: string;
};

export type DiagnosisList = {
  items: Diagnosis[];
  total: number;
  limit: number;
  offset: number;
};

export type AiLanguage = 'bn' | 'en';
export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  text: string;
  createdAt: string;
};

export type AiTextRequest = {
  messages: ChatMessage[];
  language: AiLanguage;
  systemInstruction: string;
};

/** Only the backend uses providers; tests inject a double through createApp(). */
export interface AiTextProvider {
  generateText(request: AiTextRequest): Promise<string>;
}

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

export type DiagnosisImageAsset = {
  provider: 'cloudinary';
  publicId: string;
  resourceType: 'image';
  deliveryType: 'authenticated';
  version?: number;
  format?: string;
};

export type CropDiseaseInput = {
  image: DiagnosisImageAsset;
  imageData: Buffer;
  mimeType: string;
  cropName?: string;
};

/** Injected only by tests; the real adapter reads its endpoint/key from env. */
export interface CropDiseaseClassifier {
  classify(input: CropDiseaseInput): Promise<CropDiseaseResult>;
}

export type DiagnosisStatus = 'uncertain' | 'possible' | 'likely';

export type Diagnosis = {
  id: string;
  userId: string;
  image: DiagnosisImageAsset;
  imageUrl: string;
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

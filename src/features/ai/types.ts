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

/** Legacy Cloudinary asset, kept only for reading old diagnosis history. */
export type CloudinaryDiagnosisImage = {
  provider: 'cloudinary';
  publicId: string;
  resourceType: 'image';
  deliveryType: 'authenticated';
  version?: number;
  format?: string;
};

/** Current diagnosis image: sent once as base64 and never uploaded for storage. */
export type InlineDiagnosisImage = {
  provider: 'inline';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Raw base64 bytes, without a data-URI prefix. */
  data: string;
};

export type DiagnosisImageAsset = CloudinaryDiagnosisImage | InlineDiagnosisImage;

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
  /** Older records fall back to the external classifier label. */
  source?: 'gemini_vision' | 'external_classifier';
  /** Older records are still displayed as unverified suggestions. */
  verified?: boolean;
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

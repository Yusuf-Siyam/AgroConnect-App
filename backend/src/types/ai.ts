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

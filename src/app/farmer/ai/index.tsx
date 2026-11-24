import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import {
  aiErrorKey,
  deleteAiConversation,
  deleteDiagnosis,
  getAiConversation,
  listAiConversations,
  listDiagnoses,
  sendAiMessage,
  submitDiagnosis,
} from '@/features/ai/aiService';
import { ImagePermissionError, uploadDiagnosisImage, type ImageSource } from '@/features/ai/diagnosisUpload';
import {
  acceptPhotoSuggestionConsent,
  hasPhotoSuggestionConsent,
} from '@/features/ai/photoSuggestionConsent';
import type { ChatMessage, Conversation, Diagnosis } from '@/features/ai/types';
import { getUploadConfig } from '@/services/cloudinaryUpload';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

type Section = 'disease' | 'assistant';

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export default function FarmerAiScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('disease');

  return (
    <FarmerPage title={t('ai.title')} subtitle={t('ai.subtitle')}>
      <View className="flex-row gap-2">
        <Button
          label={t('ai.section.disease')}
          variant={section === 'disease' ? 'primary' : 'outline'}
          onPress={() => setSection('disease')}
        />
        <Button
          label={t('ai.section.assistant')}
          variant={section === 'assistant' ? 'primary' : 'outline'}
          onPress={() => setSection('assistant')}
        />
      </View>
      {section === 'disease' ? <DiseaseCheck /> : <Assistant />}
    </FarmerPage>
  );
}

function DiseaseCheck() {
  const { t, locale } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [cropName, setCropName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [consentState, setConsentState] = useState<{ uid: string; accepted: boolean } | null>(null);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const uid = profile?.uid;
  const consentLoaded = Boolean(uid && consentState?.uid === uid);
  const consented = Boolean(uid && consentState?.uid === uid && consentState.accepted);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void hasPhotoSuggestionConsent(uid)
      .then((saved) => {
        if (active) setConsentState({ uid, accepted: saved });
      })
      .catch(() => {
        if (active) setConsentState({ uid, accepted: false });
      });
    return () => {
      active = false;
    };
  }, [uid]);

  async function acceptConsent(): Promise<void> {
    if (!uid) return;
    setConsentSaving(true);
    setConsentError(null);
    try {
      const saved = await acceptPhotoSuggestionConsent(uid);
      if (saved) setConsentState({ uid, accepted: true });
      else setConsentError('ai.consent.storageError');
    } finally {
      setConsentSaving(false);
    }
  }

  const uploads = useQuery({
    queryKey: ['uploads', 'config'],
    queryFn: getUploadConfig,
    staleTime: 60_000,
  });
  const uploadsEnabled = uploads.data?.enabled === true;

  const history = useQuery({
    queryKey: ['ai', 'diagnoses'],
    queryFn: () => listDiagnoses(),
  });

  const remove = useMutation({
    mutationFn: deleteDiagnosis,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'diagnoses'] });
      setResult((current) => (current && current.id === remove.variables ? null : current));
    },
  });

  async function pickAndDiagnose(source: ImageSource): Promise<void> {
    if (!uid || !consented) return;
    if (!uploadsEnabled) {
      setErrorKey('error.uploadNotConfigured');
      return;
    }
    setErrorKey(null);
    setBusy(true);
    setProgress(0);
    try {
      const uploaded = await uploadDiagnosisImage(uid, source, setProgress);
      if (!uploaded) return;
      setProgress(null);
      const crop = cropName.trim();
      const diagnosis = await submitDiagnosis({
        image: uploaded.image,
        language: locale,
        ...(crop ? { cropName: crop } : {}),
      });
      setResult(diagnosis);
      void queryClient.invalidateQueries({ queryKey: ['ai', 'diagnoses'] });
    } catch (error) {
      if (error instanceof ImagePermissionError) {
        setErrorKey(
          error.source === 'camera'
            ? error.canAskAgain
              ? 'ai.permission.cameraDenied'
              : 'ai.permission.cameraDeniedForever'
            : error.canAskAgain
              ? 'ai.permission.galleryDenied'
              : 'ai.permission.galleryDeniedForever',
        );
      } else {
        const code = codeOf(error);
        setErrorKey(code === 'AI_NOT_CONFIGURED' ? 'ai.error.photoNotConfigured' : aiErrorKey(code));
      }
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <View className="gap-4">
      {uid && consentLoaded && !consented ? (
        <Card className="gap-2">
          <AppText variant="subtitle">{t('ai.consent.title')}</AppText>
          <AppText variant="caption">{t('ai.consent.body')}</AppText>
          <AppText variant="caption">{t('ai.consent.privacy')}</AppText>
          {consentError ? <AppText variant="error">{t(consentError as TranslationKey)}</AppText> : null}
          <Button
            label={t('ai.consent.accept')}
            loading={consentSaving}
            onPress={() => void acceptConsent()}
          />
        </Card>
      ) : null}

      <Card className="gap-3">
        <AppText variant="subtitle">{t('ai.disease.title')}</AppText>
        <AppText variant="caption">{t('ai.disease.subtitle')}</AppText>
        <TextField
          label={t('ai.disease.cropLabel')}
          placeholder={t('ai.disease.cropPlaceholder')}
          value={cropName}
          onChangeText={setCropName}
          maxLength={100}
          editable={consented}
        />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={t('ai.disease.camera')}
              variant="outline"
              disabled={busy || !uploadsEnabled || !consented}
              onPress={() => void pickAndDiagnose('camera')}
            />
          </View>
          <View className="flex-1">
            <Button
              label={t('ai.disease.gallery')}
              variant="outline"
              disabled={busy || !uploadsEnabled || !consented}
              onPress={() => void pickAndDiagnose('gallery')}
            />
          </View>
        </View>
        {!uploadsEnabled ? <AppText variant="caption" className="text-amber-700">{t('error.uploadNotConfigured')}</AppText> : null}
        {progress !== null ? (
          <AppText variant="caption">{t('ai.disease.uploading', { percent: Math.round(progress * 100) })}</AppText>
        ) : null}
        {busy && progress === null ? (
          <AppText variant="caption">{t('ai.disease.analyzing')}</AppText>
        ) : null}
        {errorKey ? <AppText variant="error">{t(errorKey as TranslationKey)}</AppText> : null}
      </Card>

      {result ? <DiagnosisCard diagnosis={result} /> : null}

      <AppText variant="subtitle">{t('ai.disease.historyTitle')}</AppText>
      {history.isPending ? <StateView state="loading" /> : null}
      {history.isError ? (
        <StateView
          state="error"
          message={t(aiErrorKey(codeOf(history.error)))}
          onRetry={() => void history.refetch()}
        />
      ) : null}
      {history.isSuccess && history.data.items.length === 0 ? (
        <StateView state="empty" message={t('ai.disease.historyEmpty')} />
      ) : null}
      {history.data?.items.map((item) => (
        <Card key={item.id} className="gap-2">
          <AppText variant="label">{item.cropName ?? t('ai.disease.cropPlaceholder')}</AppText>
          <AppText variant="caption">{new Date(item.createdAt).toLocaleString()}</AppText>
          <AppText>{item.status === 'uncertain' ? t('ai.disease.status.uncertain') : item.result.label}</AppText>
          <View className="flex-row gap-2">
            <Button label={t('ai.disease.view')} variant="outline" onPress={() => setResult(item)} />
            <Button
              label={t('ai.disease.delete')}
              variant="danger"
              loading={remove.isPending && remove.variables === item.id}
              onPress={() => remove.mutate(item.id)}
            />
          </View>
        </Card>
      ))}
    </View>
  );
}

function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis }) {
  const { t } = useTranslation();
  const statusKey =
    diagnosis.status === 'uncertain'
      ? 'ai.disease.status.uncertain'
      : diagnosis.status === 'possible'
        ? 'ai.disease.status.possible'
        : 'ai.disease.status.likely';

  return (
    <Card className="gap-2">
      <AppText variant="subtitle">{t('ai.disease.resultTitle')}</AppText>
      <AppText variant="label">{t(statusKey)}</AppText>
      {diagnosis.status !== 'uncertain' ? <AppText>{diagnosis.result.label}</AppText> : null}
      {diagnosis.result.alternatives.length > 0 ? (
        <AppText variant="caption">
          {t('ai.disease.alternatives')}: {diagnosis.result.alternatives.join(', ')}
        </AppText>
      ) : null}
      {diagnosis.guidance ? <AppText>{diagnosis.guidance}</AppText> : null}
      {diagnosis.status === 'uncertain' ? (
        <View className="gap-1">
          <AppText variant="label">{t('ai.disease.tipsTitle')}</AppText>
          <AppText variant="caption">{t('ai.disease.tips')}</AppText>
        </View>
      ) : null}
      <AppText variant="caption">{t('ai.disease.notice')}</AppText>
    </Card>
  );
}

function Assistant() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);

  const conversations = useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: () => listAiConversations(),
  });

  const remove = useMutation({
    mutationFn: deleteAiConversation,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    },
  });

  async function openConversation(conversation: Conversation): Promise<void> {
    setErrorKey(null);
    try {
      const full = await getAiConversation(conversation.id);
      setConversationId(full.id);
      setMessages(full.messages);
    } catch (error) {
      setErrorKey(aiErrorKey(codeOf(error)));
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 1000) return;
    setSending(true);
    setErrorKey(null);
    setFailedDraft(null);
    try {
      const response = await sendAiMessage({
        message: trimmed,
        language: locale,
        ...(conversationId ? { conversationId } : {}),
      });
      setConversationId(response.conversation.id);
      setMessages(response.conversation.messages);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    } catch (error) {
      setErrorKey(aiErrorKey(codeOf(error)));
      setFailedDraft(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="gap-4">
      <Card className="gap-2">
        <AppText variant="subtitle">{t('ai.assistant.title')}</AppText>
        <AppText variant="caption">{t('ai.assistant.subtitle')}</AppText>
        <ScrollView className="max-h-72" contentContainerStyle={{ gap: 8 }}>
          {messages.length === 0 ? (
            <AppText variant="caption">{t('ai.assistant.empty')}</AppText>
          ) : (
            messages.map((message, index) => (
              <View
                key={`${message.createdAt}-${index}`}
                className={`rounded-xl p-3 ${message.role === 'user' ? 'self-end bg-primary' : 'self-start bg-canvas'}`}
              >
                <AppText className={message.role === 'user' ? 'text-white' : ''}>{message.text}</AppText>
                <AppText variant="caption" className={message.role === 'user' ? 'text-white' : ''}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </AppText>
              </View>
            ))
          )}
        </ScrollView>
        {errorKey ? <AppText variant="error">{t(errorKey as TranslationKey)}</AppText> : null}
        {failedDraft ? (
          <Button label={t('ai.assistant.retry')} variant="outline" onPress={() => void send(failedDraft)} />
        ) : null}
        <TextField
          label={t('ai.assistant.messageLabel')}
          placeholder={t('ai.assistant.placeholder')}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={1000}
          style={{ lineHeight: 24, minHeight: 72 }}
        />
        <Button
          label={sending ? t('ai.assistant.sending') : t('ai.assistant.send')}
          loading={sending}
          disabled={draft.trim().length === 0 || sending}
          onPress={() => void send(draft)}
        />
      </Card>

      <AppText variant="subtitle">{t('ai.assistant.historyTitle')}</AppText>
      {conversations.isPending ? <StateView state="loading" /> : null}
      {conversations.isError ? (
        <StateView
          state="error"
          message={t(aiErrorKey(codeOf(conversations.error)))}
          onRetry={() => void conversations.refetch()}
        />
      ) : null}
      {conversations.data?.items.length === 0 ? (
        <StateView state="empty" message={t('ai.assistant.historyEmpty')} />
      ) : null}
      {conversations.data?.items.map((item) => (
        <Card key={item.id} className="gap-2">
          <AppText variant="label">{item.title ?? t('ai.assistant.newChat')}</AppText>
          <AppText variant="caption">{new Date(item.updatedAt).toLocaleString()}</AppText>
          <View className="flex-row gap-2">
            <Button label={t('ai.assistant.open')} variant="outline" onPress={() => void openConversation(item)} />
            <Button
              label={t('ai.assistant.delete')}
              variant="danger"
              loading={remove.isPending && remove.variables === item.id}
              onPress={() => remove.mutate(item.id)}
            />
          </View>
        </Card>
      ))}
    </View>
  );
}

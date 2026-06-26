import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { v3 } from '@google-cloud/translate';
import { GOOGLE_TRANSLATE_CLIENT } from '../providers/google-translate.provider';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';

export interface TranslationResult {
  text: string;
  targetLanguage: string;
}

/**
 * Google Cloud Translation v3 wrapper (FR-005a, FR-005b, FR-012).
 *
 * - {@link translate} / {@link translateFinal}: same-language bypass — when the
 *   detected source language and target language share a base language code
 *   (e.g. `en-US` vs `en-GB`), the text is passed through untranslated.
 * - {@link scheduleInterimTranslation}: caps interim translations at
 *   `TRANSLATION_CONFIG.interimRatePerSec` per `(speaker, targetLanguage)` key,
 *   coalescing bursts into the *latest* pending text, and skips calls where the
 *   text is unchanged since the last translated value. Finals always translate
 *   immediately and reset this throttle state.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  /** Last text actually sent for translation, per `(speaker, targetLanguage)` key. */
  private readonly lastTranslatedText = new Map<string, string>();
  /** Timestamp (ms) of the last translation call, per key. */
  private readonly lastTranslationAt = new Map<string, number>();
  /** Most recent pending interim text awaiting a debounced translation, per key. */
  private readonly pendingText = new Map<string, string>();
  /** In-flight debounce timers, per key. */
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(GOOGLE_TRANSLATE_CLIENT)
    private readonly translateClient: v3.TranslationServiceClient,
    @Inject(TRANSLATION_CONFIG) private readonly config: TranslationConfig,
    private readonly configService: ConfigService,
  ) {}

  private get parent(): string {
    const projectId = this.configService.get<string>('GOOGLE_PROJECT_ID');
    return `projects/${projectId}/locations/global`;
  }

  /** True when two BCP-47 codes share the same base language (FR-012). */
  private isSameLanguage(
    sourceLanguage: string,
    targetLanguage: string,
  ): boolean {
    return (
      sourceLanguage.split('-')[0].toLowerCase() ===
      targetLanguage.split('-')[0].toLowerCase()
    );
  }

  /** Translates `text` to `targetLanguage`, with same-language passthrough. */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    if (sourceLanguage && this.isSameLanguage(sourceLanguage, targetLanguage)) {
      return { text, targetLanguage };
    }

    const [response] = await this.translateClient.translateText({
      parent: this.parent,
      contents: [text],
      mimeType: 'text/plain',
      targetLanguageCode: targetLanguage,
      ...(sourceLanguage ? { sourceLanguageCode: sourceLanguage } : {}),
    });

    const translatedText = response.translations?.[0]?.translatedText ?? text;
    return { text: translatedText, targetLanguage };
  }

  /** Finals always translate immediately and reset the interim throttle state for `key` (FR-005a). */
  async translateFinal(
    key: string,
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    this.clearPending(key);
    this.lastTranslatedText.set(key, text);
    this.lastTranslationAt.set(key, Date.now());
    return this.translate(text, targetLanguage, sourceLanguage);
  }

  /**
   * Throttled/debounced interim translation. Skips text that is unchanged since
   * the last translated value (FR-005b). Otherwise translates immediately if the
   * per-key rate limit allows, or schedules a single trailing call with the
   * latest pending text once the limit window elapses (FR-005a).
   */
  scheduleInterimTranslation(
    key: string,
    text: string,
    targetLanguage: string,
    sourceLanguage: string | undefined,
    onResult: (result: TranslationResult) => void,
  ): void {
    if (this.lastTranslatedText.get(key) === text) {
      return;
    }
    this.pendingText.set(key, text);

    const minIntervalMs = 1000 / this.config.interimRatePerSec;
    const elapsed = Date.now() - (this.lastTranslationAt.get(key) ?? 0);

    if (elapsed >= minIntervalMs) {
      this.runInterimTranslation(key, targetLanguage, sourceLanguage, onResult);
      return;
    }

    if (this.pendingTimers.has(key)) {
      return;
    }

    const timer = setTimeout(() => {
      this.runInterimTranslation(key, targetLanguage, sourceLanguage, onResult);
    }, minIntervalMs - elapsed);
    this.pendingTimers.set(key, timer);
  }

  private runInterimTranslation(
    key: string,
    targetLanguage: string,
    sourceLanguage: string | undefined,
    onResult: (result: TranslationResult) => void,
  ): void {
    this.pendingTimers.delete(key);
    const latestText = this.pendingText.get(key);
    if (latestText === undefined) return;

    this.lastTranslatedText.set(key, latestText);
    this.lastTranslationAt.set(key, Date.now());

    this.translate(latestText, targetLanguage, sourceLanguage)
      .then(onResult)
      .catch((error: unknown) => {
        this.logger.error(
          `Interim translation failed for ${key}: ${(error as Error).message}`,
        );
      });
  }

  /** Clears throttle/debounce state for `key`, e.g. on pipeline teardown (T030). */
  clearPending(key: string): void {
    const timer = this.pendingTimers.get(key);
    if (timer) clearTimeout(timer);
    this.pendingTimers.delete(key);
    this.pendingText.delete(key);
    this.lastTranslatedText.delete(key);
    this.lastTranslationAt.delete(key);
  }
}

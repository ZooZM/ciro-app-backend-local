import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TranslationService } from './translation.service';
import { GOOGLE_TRANSLATE_CLIENT } from '../providers/google-translate.provider';
import { TRANSLATION_CONFIG } from '../translation.config';

describe('TranslationService', () => {
  let service: TranslationService;
  let translateTextMock: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers();

    translateTextMock = jest
      .fn()
      .mockImplementation((request: { contents: string[] }) => [
        { translations: [{ translatedText: `[${request.contents[0]}]` }] },
      ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        {
          provide: GOOGLE_TRANSLATE_CLIENT,
          useValue: { translateText: translateTextMock },
        },
        { provide: TRANSLATION_CONFIG, useValue: { interimRatePerSec: 2 } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-project') },
        },
      ],
    }).compile();

    service = module.get(TranslationService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes through text untranslated when source and target share a base language (FR-012)', async () => {
    const result = await service.translate('hello', 'en-US', 'en-GB');

    expect(result).toEqual({ text: 'hello', targetLanguage: 'en-US' });
    expect(translateTextMock).not.toHaveBeenCalled();
  });

  it('translates when source and target languages differ', async () => {
    const result = await service.translate('hello', 'fr-FR', 'en-US');

    expect(result).toEqual({ text: '[hello]', targetLanguage: 'fr-FR' });
    expect(translateTextMock).toHaveBeenCalledTimes(1);
  });

  it('caps interim translations at the configured rate, using only the latest pending text (FR-005a)', () => {
    const onResult = jest.fn();
    const key = 'speakerA:fr-FR';

    service.scheduleInterimTranslation(
      key,
      'Hello',
      'fr-FR',
      'en-US',
      onResult,
    );
    expect(translateTextMock).toHaveBeenCalledTimes(1);

    // Two more updates arrive within the 500ms window (interimRatePerSec = 2)
    service.scheduleInterimTranslation(
      key,
      'Hello the',
      'fr-FR',
      'en-US',
      onResult,
    );
    service.scheduleInterimTranslation(
      key,
      'Hello there',
      'fr-FR',
      'en-US',
      onResult,
    );
    expect(translateTextMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(500);

    expect(translateTextMock).toHaveBeenCalledTimes(2);
    expect(translateTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ contents: ['Hello there'] }),
    );
  });

  it('skips retranslating interim text that has not changed (FR-005b)', () => {
    const onResult = jest.fn();
    const key = 'speakerA:fr-FR';

    service.scheduleInterimTranslation(
      key,
      'Hello',
      'fr-FR',
      'en-US',
      onResult,
    );
    expect(translateTextMock).toHaveBeenCalledTimes(1);

    service.scheduleInterimTranslation(
      key,
      'Hello',
      'fr-FR',
      'en-US',
      onResult,
    );
    expect(translateTextMock).toHaveBeenCalledTimes(1);
  });

  it('always translates finals immediately, bypassing the throttle', async () => {
    const onResult = jest.fn();
    const key = 'speakerA:fr-FR';

    service.scheduleInterimTranslation(
      key,
      'Hello',
      'fr-FR',
      'en-US',
      onResult,
    );
    expect(translateTextMock).toHaveBeenCalledTimes(1);

    const result = await service.translateFinal(
      key,
      'Hello there',
      'fr-FR',
      'en-US',
    );

    expect(result).toEqual({ text: '[Hello there]', targetLanguage: 'fr-FR' });
    expect(translateTextMock).toHaveBeenCalledTimes(2);
  });
});

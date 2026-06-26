import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import { TrackKind } from '@livekit/rtc-node';
import {
  SpeechPipelineService,
  type SpeechPipelineCallbacks,
} from './speech-pipeline.service';
import { LiveKitRtcProvider } from '../providers/livekit-rtc.provider';
import { GOOGLE_SPEECH_CLIENT } from '../providers/google-speech.provider';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';
import { SpeakerLanguageCache } from './language-detection.util';

interface StreamingConfigRequest {
  streamingConfig: {
    config: {
      encoding: string;
      sampleRateHertz: number;
      languageCode: string;
      alternativeLanguageCodes?: string[];
    };
    interimResults: boolean;
  };
}

interface AudioContentRequest {
  audioContent: Buffer;
}

type WrittenRequest = StreamingConfigRequest | AudioContentRequest;

/** Fake `gax.CancellableStream` for one `_streamingRecognize()` call. */
class MockSttStream extends EventEmitter {
  destroyed = false;
  writable = true;
  written: WrittenRequest[] = [];
  end = jest.fn(() => {
    this.destroyed = true;
    this.writable = false;
  });
  cancel = jest.fn();

  write(chunk: WrittenRequest): boolean {
    this.written.push(chunk);
    return true;
  }
}

/** Fake `@livekit/rtc-node` `AudioStream`: an async-iterable frame queue fed by `push()`. */
class MockAudioStream {
  private readonly queue: { data: Uint8Array }[] = [];
  private readonly waiting: ((
    result: IteratorResult<{ data: Uint8Array }>,
  ) => void)[] = [];

  push(bytes: Uint8Array): void {
    const frame = { data: bytes };
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: frame, done: false });
    } else {
      this.queue.push(frame);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<{ data: Uint8Array }> {
    return {
      next: (): Promise<IteratorResult<{ data: Uint8Array }>> => {
        const frame = this.queue.shift();
        if (frame) return Promise.resolve({ value: frame, done: false });
        return new Promise((resolve) => this.waiting.push(resolve));
      },
    };
  }
}

const mockAudioStreamInstances: MockAudioStream[] = [];

jest.mock('@livekit/rtc-node', () => ({
  AudioStream: jest.fn().mockImplementation(() => {
    const instance = new MockAudioStream();
    mockAudioStreamInstances.push(instance);
    return instance;
  }),
  Room: class {},
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackPublished: 'trackPublished',
    ParticipantConnected: 'participantConnected',
  },
  TrackKind: {
    KIND_AUDIO: 'audio',
  },
}));

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function createMockRoom() {
  const publication = {
    kind: TrackKind.KIND_AUDIO,
    track: {},
    subscribed: true,
    setSubscribed: jest.fn(),
  };
  const participant = {
    identity: 'speakerA',
    trackPublications: new Map([['pub1', publication]]),
  };
  return {
    remoteParticipants: new Map([['speakerA', participant]]),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
  };
}

describe('SpeechPipelineService', () => {
  const config: TranslationConfig = {
    idleGraceMs: 10_000,
    interimRatePerSec: 2,
    lowBalanceSeconds: 30,
    activationMinSeconds: 1,
    sttRotationLeadMs: 280_000,
    sttRotationOverlapMs: 1_500,
    primaryLanguage: 'en-US',
    candidateLanguages: ['ar-SA', 'fr-FR', 'es-ES'],
    workerRole: 'translation-worker',
  };

  let service: SpeechPipelineService;
  let mockRoom: ReturnType<typeof createMockRoom>;
  let mockSttStreams: MockSttStream[];
  let callbacks: { onTranscript: jest.Mock; onError: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    mockAudioStreamInstances.length = 0;
    mockSttStreams = [];
    mockRoom = createMockRoom();

    const liveKitRtcProvider = {
      createRoom: jest.fn().mockReturnValue(mockRoom),
      createAgentToken: jest.fn().mockResolvedValue('token'),
      wsUrl: 'ws://localhost',
      connectOptions: {},
    };
    const speechClient = {
      _streamingRecognize: jest.fn(() => {
        const stream = new MockSttStream();
        mockSttStreams.push(stream);
        return stream;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpeechPipelineService,
        { provide: LiveKitRtcProvider, useValue: liveKitRtcProvider },
        { provide: GOOGLE_SPEECH_CLIENT, useValue: speechClient },
        { provide: TRANSLATION_CONFIG, useValue: config },
        SpeakerLanguageCache,
      ],
    }).compile();

    service = module.get(SpeechPipelineService);
    callbacks = { onTranscript: jest.fn(), onError: jest.fn() };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function open(): Promise<void> {
    await service.open(
      'room1',
      'speakerA',
      callbacks as unknown as SpeechPipelineCallbacks,
    );
  }

  it('opens a single STT stream primed with the default primary language', async () => {
    await open();

    expect(mockSttStreams).toHaveLength(1);
    const writtenConfig = mockSttStreams[0]
      .written[0] as StreamingConfigRequest;
    expect(writtenConfig.streamingConfig.config.languageCode).toBe('en-US');
    expect(
      writtenConfig.streamingConfig.config.alternativeLanguageCodes,
    ).toEqual(['ar-SA', 'fr-FR', 'es-ES']);

    mockSttStreams[0].emit('data', {
      results: [
        {
          alternatives: [{ transcript: 'Hello' }],
          isFinal: false,
          languageCode: 'en-US',
        },
      ],
    });

    expect(callbacks.onTranscript).toHaveBeenCalledWith({
      text: 'Hello',
      isFinal: false,
      sourceLanguage: 'en-US',
    });
  });

  it('reports language_undetected if no language locks within the detection timeout', async () => {
    await open();

    jest.advanceTimersByTime(10_000);

    expect(callbacks.onError).toHaveBeenCalledWith('language_undetected');
  });

  it('reports service_outage when the active stream errors', async () => {
    await open();

    mockSttStreams[0].emit('error', new Error('boom'));

    expect(callbacks.onError).toHaveBeenCalledWith('service_outage');
  });

  it('ends the stream and disconnects the room on close (T030)', async () => {
    await open();

    await service.close('room1', 'speakerA');

    expect(mockSttStreams[0].end).toHaveBeenCalled();
    expect(mockSttStreams[0].cancel).toHaveBeenCalled();
    expect(mockRoom.disconnect).toHaveBeenCalled();
  });

  it('is a no-op when closing a session that does not exist', async () => {
    await expect(service.close('room1', 'unknown')).resolves.toBeUndefined();
  });

  describe('overlapping stream rotation (T031/T032)', () => {
    it('opens an overlapping stream primed from the language cache, then promotes it and suppresses the old stream', async () => {
      await open();

      // Lock the segment language to fr-FR via a final result, priming the cache.
      mockSttStreams[0].emit('data', {
        results: [
          {
            alternatives: [{ transcript: 'Bonjour' }],
            isFinal: true,
            languageCode: 'fr-FR',
          },
        ],
      });
      expect(callbacks.onTranscript).toHaveBeenCalledWith({
        text: 'Bonjour',
        isFinal: true,
        sourceLanguage: 'fr-FR',
      });

      // Just before the ~5-minute limit, a new overlapping stream is opened.
      jest.advanceTimersByTime(config.sttRotationLeadMs);
      expect(mockSttStreams).toHaveLength(2);

      const rotatedConfig = mockSttStreams[1]
        .written[0] as StreamingConfigRequest;
      expect(rotatedConfig.streamingConfig.config.languageCode).toBe('fr-FR');
      expect(
        rotatedConfig.streamingConfig.config.alternativeLanguageCodes,
      ).toEqual(['ar-SA', 'es-ES']);

      // During the overlap window, the new stream's results are suppressed (T032)...
      callbacks.onTranscript.mockClear();
      mockSttStreams[1].emit('data', {
        results: [
          {
            alternatives: [{ transcript: 'suppressed' }],
            isFinal: false,
            languageCode: 'fr-FR',
          },
        ],
      });
      expect(callbacks.onTranscript).not.toHaveBeenCalled();

      // ...while the old stream is still active.
      mockSttStreams[0].emit('data', {
        results: [
          {
            alternatives: [{ transcript: 'still old' }],
            isFinal: false,
            languageCode: 'fr-FR',
          },
        ],
      });
      expect(callbacks.onTranscript).toHaveBeenCalledWith({
        text: 'still old',
        isFinal: false,
        sourceLanguage: 'fr-FR',
      });

      // After the overlap window, the old stream is ended and suppressed...
      callbacks.onTranscript.mockClear();
      jest.advanceTimersByTime(config.sttRotationOverlapMs);

      expect(mockSttStreams[0].end).toHaveBeenCalled();
      expect(mockSttStreams[0].cancel).toHaveBeenCalled();

      mockSttStreams[0].emit('data', {
        results: [
          {
            alternatives: [{ transcript: 'late old' }],
            isFinal: false,
            languageCode: 'fr-FR',
          },
        ],
      });
      expect(callbacks.onTranscript).not.toHaveBeenCalled();

      // ...and the new stream is promoted, its results now reaching callbacks.
      mockSttStreams[1].emit('data', {
        results: [
          {
            alternatives: [{ transcript: 'new active' }],
            isFinal: false,
            languageCode: 'fr-FR',
          },
        ],
      });
      expect(callbacks.onTranscript).toHaveBeenCalledWith({
        text: 'new active',
        isFinal: false,
        sourceLanguage: 'fr-FR',
      });
    });

    it('feeds audio frames to both streams during the overlap window so none are dropped', async () => {
      await open();
      const audioStream = mockAudioStreamInstances[0];

      audioStream.push(new Uint8Array([1, 2, 3]));
      await flushPromises();
      expect(mockSttStreams[0].written).toHaveLength(2);
      expect(
        (mockSttStreams[0].written[1] as AudioContentRequest).audioContent,
      ).toEqual(Buffer.from([1, 2, 3]));

      jest.advanceTimersByTime(config.sttRotationLeadMs);
      expect(mockSttStreams).toHaveLength(2);

      audioStream.push(new Uint8Array([4, 5, 6]));
      await flushPromises();
      // Both the old (current) and new (overlapping) streams receive the frame.
      expect(
        (mockSttStreams[0].written[2] as AudioContentRequest).audioContent,
      ).toEqual(Buffer.from([4, 5, 6]));
      expect(
        (mockSttStreams[1].written[1] as AudioContentRequest).audioContent,
      ).toEqual(Buffer.from([4, 5, 6]));

      jest.advanceTimersByTime(config.sttRotationOverlapMs);

      audioStream.push(new Uint8Array([7, 8, 9]));
      await flushPromises();
      // Only the promoted stream receives further frames.
      expect(
        (mockSttStreams[1].written[2] as AudioContentRequest).audioContent,
      ).toEqual(Buffer.from([7, 8, 9]));
      expect(mockSttStreams[0].written).toHaveLength(3);
    });

    it('ends both streams if closed during an overlap window', async () => {
      await open();

      jest.advanceTimersByTime(config.sttRotationLeadMs);
      expect(mockSttStreams).toHaveLength(2);

      await service.close('room1', 'speakerA');

      expect(mockSttStreams[0].end).toHaveBeenCalled();
      expect(mockSttStreams[1].end).toHaveBeenCalled();
      expect(mockRoom.disconnect).toHaveBeenCalled();
    });
  });
});
